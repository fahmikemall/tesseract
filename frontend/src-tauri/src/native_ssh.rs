/// Native SSH using the system's ssh binary + PTY
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NativeConnectRequest {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

struct NativeSession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

pub struct NativeSessions {
    sessions: HashMap<String, Arc<Mutex<NativeSession>>>,
}

impl NativeSessions {
    pub fn new() -> Self { Self { sessions: HashMap::new() } }
}

fn find_ssh() -> Option<String> {
    #[cfg(windows)]
    {
        let candidates = [
            r"C:\Windows\System32\OpenSSH\ssh.exe",
            r"C:\Program Files\Git\usr\bin\ssh.exe",
            r"C:\Program Files\OpenSSH\ssh.exe",
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }
        if let Ok(out) = std::process::Command::new("where").arg("ssh").output() {
            if let Ok(s) = String::from_utf8(out.stdout) {
                let first = s.lines().next().unwrap_or("").trim().to_string();
                if !first.is_empty() { return Some(first); }
            }
        }
    }
    #[cfg(not(windows))]
    {
        for path in &["/usr/bin/ssh", "/usr/local/bin/ssh", "/opt/homebrew/bin/ssh"] {
            if std::path::Path::new(path).exists() {
                return Some(path.to_string());
            }
        }
    }
    None
}

fn expand_home(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".to_string());
        path.replacen('~', &home, 1)
    } else {
        path.to_string()
    }
}

#[tauri::command]
pub fn ssh_connect_native(
    request: NativeConnectRequest,
    app: AppHandle,
    sessions: tauri::State<Mutex<NativeSessions>>,
) -> Result<(), String> {
    let ssh_bin = find_ssh().ok_or_else(|| {
        "SSH binary not found.\nInstall OpenSSH Client:\nSettings → Apps → Optional Features → OpenSSH Client".to_string()
    })?;

    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: request.rows.max(24),
        cols: request.cols.max(80),
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("PTY creation failed: {}", e))?;

    // Build SSH command
    let mut cmd = CommandBuilder::new(&ssh_bin);
    cmd.arg("-o"); cmd.arg("StrictHostKeyChecking=no");
    cmd.arg("-o"); cmd.arg("UserKnownHostsFile=/dev/null");
    cmd.arg("-o"); cmd.arg("LogLevel=ERROR");
    cmd.arg("-p"); cmd.arg(request.port.to_string());

    match request.auth_type.as_str() {
        "key" => {
            if let Some(ref key_path) = request.private_key_path {
                if !key_path.is_empty() {
                    cmd.arg("-i"); cmd.arg(expand_home(key_path));
                }
            }
            cmd.arg("-o"); cmd.arg("PreferredAuthentications=publickey");
        }
        "password" => {
            cmd.arg("-o"); cmd.arg("PreferredAuthentications=password,keyboard-interactive");
            cmd.arg("-o"); cmd.arg("PubkeyAuthentication=no");
        }
        _ => {
            // agent / auto: try all
            cmd.arg("-o"); cmd.arg("PreferredAuthentications=publickey,password,keyboard-interactive");
        }
    }

    cmd.arg(format!("{}@{}", request.username, request.host));

    // Get master reader BEFORE spawning (to avoid ordering issues)
    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    // Spawn SSH in the slave PTY
    let _child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn ssh: {}\n\nSSH binary: {}", e, ssh_bin))?;

    // Get master writer — wrap in Arc<Mutex> so it can be shared with the reader thread
    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;
    let writer_arc: Arc<Mutex<Box<dyn Write + Send>>> = Arc::new(Mutex::new(writer));
    let writer_for_thread = writer_arc.clone();

    let session_id = request.session_id.clone();
    let session_id_close = session_id.clone();
    let app_clone = app.clone();
    let password = request.password.clone();
    let auth_type = request.auth_type.clone();

    // Store session
    {
        let mut sessions = sessions.lock().map_err(|e| e.to_string())?;
        sessions.sessions.insert(session_id.clone(), Arc::new(Mutex::new(NativeSession {
            writer: writer_arc,
            master: pair.master,
        })));
    }

    // Read output in background thread — inject password at Rust level (no JS race condition)
    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        let mut password_sent = false;

        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app_clone.emit(&format!("ssh-closed-{}", session_id_close), ());
                    break;
                }
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();

                    // Auto-inject password: detect prompt in current chunk, suppress it, inject silently
                    if !password_sent && auth_type == "password" {
                        if let Some(ref pw) = password {
                            if chunk.to_lowercase().contains("password:") {
                                password_sent = true;
                                if let Ok(mut w) = writer_for_thread.lock() {
                                    let _ = w.write_all(format!("{}\n", pw).as_bytes());
                                    let _ = w.flush();
                                }
                                // Suppress the password prompt chunk entirely — silent auth
                                continue;
                            }
                        }
                    }

                    let _ = app_clone.emit(&format!("ssh-output-{}", session_id_close), chunk);
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn ssh_send_native(
    session_id: String,
    input: String,
    sessions: tauri::State<Mutex<NativeSessions>>,
) -> Result<(), String> {
    let sessions = sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.sessions.get(&session_id)
        .ok_or("Session not found")?
        .lock().map_err(|e| e.to_string())?;
    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer.write_all(input.as_bytes())
        .map(|_| ())
        .map_err(|e| format!("Write failed: {}", e))
}

#[tauri::command]
pub fn ssh_resize_native(
    session_id: String,
    cols: u16,
    rows: u16,
    sessions: tauri::State<Mutex<NativeSessions>>,
) -> Result<(), String> {
    let sessions = sessions.lock().map_err(|e| e.to_string())?;
    if let Some(session) = sessions.sessions.get(&session_id) {
        let session = session.lock().map_err(|e| e.to_string())?;
        let _ = session.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
    }
    Ok(())
}

#[tauri::command]
pub fn ssh_disconnect_native(
    session_id: String,
    sessions: tauri::State<Mutex<NativeSessions>>,
) -> Result<(), String> {
    let mut sessions = sessions.lock().map_err(|e| e.to_string())?;
    sessions.sessions.remove(&session_id);
    Ok(())
}

/// Scan a host's SSH key fingerprint. Returns fingerprint string or descriptive error.
#[tauri::command]
pub async fn scan_host_fingerprint(host: String, port: u16) -> Result<String, String> {
    // Try ssh-keyscan to get the raw host key
    let scan_result = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        tokio::process::Command::new("ssh-keyscan")
            .arg("-p").arg(port.to_string())
            .arg("-T").arg("5")
            .arg(&host)
            .output(),
    ).await;

    let raw = match scan_result {
        Ok(Ok(out)) => String::from_utf8_lossy(&out.stdout).to_string(),
        Ok(Err(e)) => return Err(format!("ssh-keyscan failed: {}", e)),
        Err(_) => return Err("Host scan timed out after 8s".to_string()),
    };

    // Pick ed25519 key preferably, then ecdsa, then rsa
    let key_line = raw.lines()
        .find(|l| l.contains("ssh-ed25519"))
        .or_else(|| raw.lines().find(|l| l.contains("ecdsa")))
        .or_else(|| raw.lines().find(|l| !l.starts_with('#') && l.contains(' ') && !l.is_empty()))
        .ok_or_else(|| "No host key returned — server may be unreachable or SSH not running.".to_string())?;

    let parts: Vec<&str> = key_line.trim().splitn(3, ' ').collect();
    if parts.len() < 3 {
        return Err(format!("Unexpected key format: {}", key_line));
    }
    let key_type = parts[1];
    let b64_key = parts[2].trim();

    // Try to compute proper SHA256 fingerprint via ssh-keygen -l
    let tmp = std::env::temp_dir().join(format!("tesseract_hk_{}.pub", {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().subsec_nanos()
    }));
    let file_content = format!("{} {} {}\n", host, key_type, b64_key);
    if std::fs::write(&tmp, &file_content).is_ok() {
        if let Ok(kg) = tokio::process::Command::new("ssh-keygen")
            .arg("-l").arg("-E").arg("sha256").arg("-f").arg(&tmp)
            .output().await
        {
            let _ = std::fs::remove_file(&tmp);
            let fp_out = String::from_utf8_lossy(&kg.stdout);
            // Format: "256 SHA256:xxxx comment (ED25519)"
            if let Some(sha) = fp_out.split_whitespace().find(|s| s.starts_with("SHA256:")) {
                let algo = key_type.replace("ssh-", "").to_uppercase();
                return Ok(format!("{} ({})", sha, algo));
            }
        } else {
            let _ = std::fs::remove_file(&tmp);
        }
    }

    // Fallback: show partial base64 key as identifier
    let short = &b64_key[..b64_key.len().min(32)];
    let algo = key_type.replace("ssh-", "").to_uppercase();
    Ok(format!("{}... ({})", short, algo))
}

/// Run a one-shot command on a remote server (no PTY, async, non-blocking).
/// Only for key/agent auth — password auth cannot be automated without sshpass.
/// Returns Err("skip") for password auth so the frontend shows N/A gracefully.
#[tauri::command]
pub async fn ssh_exec(
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    private_key_path: Option<String>,
    command: String,
) -> Result<String, String> {
    if auth_type == "password" {
        return Err("skip".to_string());
    }

    let ssh_bin = find_ssh().ok_or("SSH not found")?;

    let mut cmd = tokio::process::Command::new(&ssh_bin);
    cmd.arg("-o").arg("StrictHostKeyChecking=no")
       .arg("-o").arg("UserKnownHostsFile=/dev/null")
       .arg("-o").arg("LogLevel=ERROR")
       .arg("-o").arg("ConnectTimeout=5")
       .arg("-o").arg("BatchMode=yes")
       .arg("-p").arg(port.to_string())
       .arg("-T");

    if auth_type == "key" {
        if let Some(ref key) = private_key_path {
            if !key.is_empty() {
                cmd.arg("-i").arg(expand_home(key));
            }
        }
        cmd.arg("-o").arg("PreferredAuthentications=publickey");
    } else {
        // agent / auto
        cmd.arg("-o").arg("PreferredAuthentications=publickey");
    }

    cmd.arg(format!("{}@{}", username, host))
       .arg(&command);

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(6),
        cmd.output(),
    ).await
        .map_err(|_| "timeout".to_string())?
        .map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&result.stdout).to_string())
}

#[tauri::command]
pub fn local_terminal_connect(
    session_id: String,
    cols: u16,
    rows: u16,
    app: AppHandle,
    sessions: tauri::State<Mutex<NativeSessions>>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: rows.max(24),
        cols: cols.max(80),
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| format!("PTY creation failed: {}", e))?;

    #[cfg(windows)]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
    #[cfg(not(windows))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let cmd = CommandBuilder::new(&shell);

    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    let _child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let session_id_close = session_id.clone();
    let app_clone = app.clone();

    {
        let mut sessions = sessions.lock().map_err(|e| e.to_string())?;
        sessions.sessions.insert(session_id.clone(), Arc::new(Mutex::new(NativeSession {
            writer: Arc::new(Mutex::new(writer)),
            master: pair.master,
        })));
    }

    std::thread::spawn(move || {
        let mut buf = vec![0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app_clone.emit(&format!("ssh-closed-{}", session_id_close), ());
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("ssh-output-{}", session_id_close), output);
                }
            }
        }
    });

    Ok(())
}
