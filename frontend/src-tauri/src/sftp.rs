use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub permissions: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SftpConnectInfo {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
}

// ── Local filesystem ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn sftp_list_local(path: String) -> Result<Vec<FileEntry>, String> {
    let expanded = expand_home(&path);
    let dir = std::fs::read_dir(&expanded)
        .map_err(|e| format!("Cannot read '{}': {}", expanded, e))?;

    let mut entries: Vec<FileEntry> = dir.flatten().map(|e| {
        let name = e.file_name().to_string_lossy().to_string();
        let meta = e.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = meta.as_ref().and_then(|m| if m.is_file() { Some(m.len()) } else { None });
        let modified = meta.and_then(|m| m.modified().ok()).map(|t| {
            let dt: chrono::DateTime<chrono::Local> = t.into();
            dt.format("%b %d %Y").to_string()
        });
        FileEntry { name, is_dir, size, modified, permissions: None }
    }).collect();

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));

    // Prepend ".."
    let mut result = vec![FileEntry { name: "..".into(), is_dir: true, size: None, modified: None, permissions: None }];
    result.extend(entries);
    Ok(result)
}

#[tauri::command]
pub fn sftp_local_home() -> String {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
}

fn expand_home(path: &str) -> String {
    if path.starts_with('~') {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".to_string());
        path.replacen('~', &home, 1)
    } else {
        path.to_string()
    }
}

// ── SSH helpers ───────────────────────────────────────────────────────────────

fn find_ssh() -> Option<String> {
    #[cfg(windows)]
    {
        for p in &[r"C:\Windows\System32\OpenSSH\ssh.exe", r"C:\Program Files\Git\usr\bin\ssh.exe"] {
            if Path::new(p).exists() { return Some(p.to_string()); }
        }
        if let Ok(o) = std::process::Command::new("where").arg("ssh").output() {
            let s = String::from_utf8_lossy(&o.stdout);
            let f = s.lines().next().unwrap_or("").trim().to_string();
            if !f.is_empty() { return Some(f); }
        }
    }
    #[cfg(not(windows))]
    for p in &["/usr/bin/ssh", "/usr/local/bin/ssh"] {
        if Path::new(p).exists() { return Some(p.to_string()); }
    }
    None
}

fn find_scp() -> Option<String> {
    #[cfg(windows)]
    {
        for p in &[r"C:\Windows\System32\OpenSSH\scp.exe", r"C:\Program Files\Git\usr\bin\scp.exe"] {
            if Path::new(p).exists() { return Some(p.to_string()); }
        }
        if let Ok(o) = std::process::Command::new("where").arg("scp").output() {
            let s = String::from_utf8_lossy(&o.stdout);
            let f = s.lines().next().unwrap_or("").trim().to_string();
            if !f.is_empty() { return Some(f); }
        }
    }
    #[cfg(not(windows))]
    for p in &["/usr/bin/scp", "/usr/local/bin/scp"] {
        if Path::new(p).exists() { return Some(p.to_string()); }
    }
    None
}

fn unique_tmp_name(prefix: &str) -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().subsec_nanos();
    std::env::temp_dir().join(format!("{}_{}.bat", prefix, ts))
}

/// Run SSH command with password via SSH_ASKPASS (no PTY, works on Windows)
async fn ssh_exec_with_password(info: &SftpConnectInfo, command: &str) -> Result<String, String> {
    let ssh_bin = find_ssh().ok_or("SSH not found")?;
    let password = info.password.clone().unwrap_or_default();

    // Write a uniquely-named temp script to avoid race conditions on concurrent calls
    let tmp = unique_tmp_name("tesseract_askpass");
    let pw_escaped = password.replace('%', "%%");
    let bat_content = format!("@echo off\necho {}", pw_escaped);
    std::fs::write(&tmp, &bat_content).map_err(|e| format!("Cannot write askpass: {}", e))?;

    let mut cmd = tokio::process::Command::new(&ssh_bin);
    cmd.arg("-o").arg("StrictHostKeyChecking=no")
       .arg("-o").arg("UserKnownHostsFile=/dev/null")
       .arg("-o").arg("LogLevel=ERROR")
       .arg("-o").arg("ConnectTimeout=10")
       .arg("-o").arg("PreferredAuthentications=password,keyboard-interactive")
       .arg("-o").arg("PubkeyAuthentication=no")
       .arg("-o").arg("NumberOfPasswordPrompts=1")
       .arg("-p").arg(info.port.to_string())
       .arg("-T")
       // SSH_ASKPASS: program to call for password (our batch file)
       .env("SSH_ASKPASS", tmp.display().to_string())
       .env("SSH_ASKPASS_REQUIRE", "force")
       .env("DISPLAY", "1")  // required by older OpenSSH versions
       .stdin(std::process::Stdio::null())
       .arg(format!("{}@{}", info.username, info.host))
       .arg(command);

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        cmd.output(),
    ).await
        .map_err(|_| "SSH command timed out".to_string())?
        .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&tmp);

    if result.stdout.is_empty() && !result.stderr.is_empty() {
        let err = String::from_utf8_lossy(&result.stderr).to_string();
        return Err(format!("SSH error: {}", err.trim()));
    }

    Ok(String::from_utf8_lossy(&result.stdout).to_string())
}

#[allow(dead_code)]
fn ssh_run_pty(info: &SftpConnectInfo, command: &str, timeout_secs: u64) -> Result<String, String> {
    let ssh_bin = find_ssh().ok_or("SSH binary not found")?;
    let password = info.password.clone();

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize { rows: 200, cols: 500, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&ssh_bin);
    cmd.arg("-o"); cmd.arg("StrictHostKeyChecking=no");
    cmd.arg("-o"); cmd.arg("UserKnownHostsFile=/dev/null");
    cmd.arg("-o"); cmd.arg("LogLevel=ERROR");
    cmd.arg("-o"); cmd.arg(format!("ConnectTimeout={}", timeout_secs.min(10)));
    cmd.arg("-p"); cmd.arg(info.port.to_string());

    match info.auth_type.as_str() {
        "key" => {
            if let Some(ref k) = info.private_key_path {
                if !k.is_empty() { cmd.arg("-i"); cmd.arg(k); }
            }
            cmd.arg("-o"); cmd.arg("PreferredAuthentications=publickey");
            cmd.arg("-o"); cmd.arg("BatchMode=yes");
        }
        "password" => {
            cmd.arg("-o"); cmd.arg("PreferredAuthentications=password,keyboard-interactive");
            cmd.arg("-o"); cmd.arg("PubkeyAuthentication=no");
        }
        _ => {
            cmd.arg("-o"); cmd.arg("PreferredAuthentications=publickey,password,keyboard-interactive");
        }
    }
    cmd.arg(format!("{}@{}", info.username, info.host));
    cmd.arg(command);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 8192];
        let mut acc = String::new();
        let mut pw_sent = false;
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => { let _ = tx.send(acc); break; }
                Ok(n) => {
                    let s = String::from_utf8_lossy(&buf[..n]).to_string();
                    if !pw_sent && s.to_lowercase().contains("password:") {
                        if let Some(ref pw) = password {
                            pw_sent = true;
                            let _ = writer.write_all(format!("{}\n", pw).as_bytes());
                            let _ = writer.flush();
                        }
                        continue;
                    }
                    acc.push_str(&s);
                    if acc.contains("__TESSERACT_END__") {
                        let _ = tx.send(acc);
                        break;
                    }
                }
            }
        }
    });

    rx.recv_timeout(std::time::Duration::from_secs(timeout_secs))
        .map_err(|_| "SSH command timed out".to_string())
}

// ── Remote listing ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sftp_list_remote(info: SftpConnectInfo, path: String) -> Result<Vec<FileEntry>, String> {
    let cmd = format!(r#"ls -la "{}""#, path);

    // Try non-PTY approach first (key/agent auth, fast, no resource conflict with terminal)
    let raw = if info.auth_type != "password" {
        let ssh_bin = find_ssh().ok_or("SSH not found")?;
        let mut args_cmd = tokio::process::Command::new(&ssh_bin);
        args_cmd
            .arg("-o").arg("StrictHostKeyChecking=no")
            .arg("-o").arg("UserKnownHostsFile=/dev/null")
            .arg("-o").arg("LogLevel=ERROR")
            .arg("-o").arg("ConnectTimeout=10")
            .arg("-o").arg("BatchMode=yes")
            .arg("-p").arg(info.port.to_string())
            .arg("-T");
        if info.auth_type == "key" {
            if let Some(ref k) = info.private_key_path {
                if !k.is_empty() { args_cmd.arg("-i").arg(k); }
            }
            args_cmd.arg("-o").arg("PreferredAuthentications=publickey");
        }
        args_cmd.arg(format!("{}@{}", info.username, info.host)).arg(&cmd);

        let out = tokio::time::timeout(std::time::Duration::from_secs(12), args_cmd.output())
            .await
            .map_err(|_| "Remote listing timed out")?
            .map_err(|e| e.to_string())?;

        String::from_utf8_lossy(&out.stdout).to_string()
    } else {
        // Password auth: use SSH_ASKPASS mechanism (no PTY, no ConPTY EOF issues)
        ssh_exec_with_password(&info, &cmd).await?
    };

    parse_ls_output(&raw)
}

fn parse_ls_output(raw: &str) -> Result<Vec<FileEntry>, String> {
    let mut entries = vec![FileEntry { name: "..".into(), is_dir: true, size: None, modified: None, permissions: None }];

    for line in raw.lines() {
        // Skip "total N", empty lines, ANSI codes, error lines
        let clean: String = line.chars().filter(|c| c.is_ascii() || c.is_alphanumeric()).collect();
        let line = clean.trim();
        if line.is_empty() || line.starts_with("total") || line.starts_with("ls:") { continue; }

        // ls -la format: permissions links owner group size month day time/year name
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 9 { continue; }

        let perms = parts[0];
        let is_dir = perms.starts_with('d');
        let is_link = perms.starts_with('l');
        if perms.len() < 10 { continue; }

        let size: Option<u64> = parts[4].parse().ok();
        let month = parts[5];
        let day = parts[6];
        let time_or_year = parts[7];
        let modified = format!("{} {} {}", month, day, time_or_year);

        // Name is everything from index 8 onwards (handles spaces in names)
        let name_raw = parts[8..].join(" ");
        // For symlinks, remove " -> target"
        let name = if is_link {
            name_raw.split(" -> ").next().unwrap_or(&name_raw).to_string()
        } else {
            name_raw
        };

        if name == "." || name == ".." || name.is_empty() { continue; }

        entries.push(FileEntry { name, is_dir: is_dir || is_link, size, modified: Some(modified), permissions: Some(perms.to_string()) });
    }

    entries.sort_by(|a, b| {
        if a.name == ".." { return std::cmp::Ordering::Less; }
        if b.name == ".." { return std::cmp::Ordering::Greater; }
        b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name))
    });

    Ok(entries)
}

// ── File transfer via SCP ─────────────────────────────────────────────────────

fn scp_transfer(info: &SftpConnectInfo, args: Vec<String>) -> Result<(), String> {
    let scp_bin = find_scp().ok_or("scp binary not found")?;
    let auth_type = info.auth_type.clone();

    if auth_type != "password" {
        let out = std::process::Command::new(&scp_bin)
            .args(&args)
            .output()
            .map_err(|e| e.to_string())?;
        return if out.status.success() { Ok(()) }
            else { Err(String::from_utf8_lossy(&out.stderr).to_string()) };
    }

    // Password auth: use SSH_ASKPASS (avoids ConPTY EOF issues on Windows)
    let password = info.password.clone().unwrap_or_default();
    let tmp = unique_tmp_name("tesseract_askpass_scp");
    let pw_escaped = password.replace('%', "%%");
    std::fs::write(&tmp, format!("@echo off\necho {}", pw_escaped))
        .map_err(|e| format!("Cannot write askpass: {}", e))?;

    let out = std::process::Command::new(&scp_bin)
        .args(&args)
        .env("SSH_ASKPASS", tmp.display().to_string())
        .env("SSH_ASKPASS_REQUIRE", "force")
        .env("DISPLAY", "1")
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&tmp);

    if out.status.success() { Ok(()) }
    else { Err(String::from_utf8_lossy(&out.stderr).to_string()) }
}

#[tauri::command]
pub async fn sftp_upload(info: SftpConnectInfo, local_path: String, remote_path: String) -> Result<(), String> {
    let remote = format!("{}@{}:{}", info.username, info.host, remote_path);
    let mut args = vec![
        "-o".into(), "StrictHostKeyChecking=no".into(),
        "-o".into(), "UserKnownHostsFile=/dev/null".into(),
        "-o".into(), "LogLevel=ERROR".into(),
        "-P".into(), info.port.to_string(),
    ];
    if info.auth_type == "key" {
        if let Some(ref k) = info.private_key_path {
            if !k.is_empty() { args.push("-i".into()); args.push(k.clone()); }
        }
        args.push("-o".into()); args.push("BatchMode=yes".into());
    }
    args.push(local_path);
    args.push(remote);
    tokio::task::spawn_blocking(move || {
        std::thread::spawn(move || scp_transfer(&info, args))
            .join()
            .unwrap_or_else(|_| Err("SCP panicked".to_string()))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_download(info: SftpConnectInfo, remote_path: String, local_path: String) -> Result<(), String> {
    let remote = format!("{}@{}:{}", info.username, info.host, remote_path);
    let mut args = vec![
        "-o".into(), "StrictHostKeyChecking=no".into(),
        "-o".into(), "UserKnownHostsFile=/dev/null".into(),
        "-o".into(), "LogLevel=ERROR".into(),
        "-P".into(), info.port.to_string(),
    ];
    if info.auth_type == "key" {
        if let Some(ref k) = info.private_key_path {
            if !k.is_empty() { args.push("-i".into()); args.push(k.clone()); }
        }
        args.push("-o".into()); args.push("BatchMode=yes".into());
    }
    args.push(remote);
    args.push(local_path);
    tokio::task::spawn_blocking(move || {
        std::thread::spawn(move || scp_transfer(&info, args))
            .join()
            .unwrap_or_else(|_| Err("SCP panicked".to_string()))
    }).await.map_err(|e| e.to_string())?
}
