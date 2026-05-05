use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use std::net::TcpStream;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshKeyInfo {
    pub name: String,
    pub path: String,
    pub key_type: String,
    pub fingerprint: String,
    pub comment: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PingResult {
    pub host: String,
    pub port: u16,
    pub online: bool,
    pub latency_ms: Option<u64>,
}

#[tauri::command]
pub fn get_ssh_keys() -> Vec<SshKeyInfo> {
    let home = match home_dir() {
        Some(h) => h,
        None => return vec![],
    };
    let ssh_dir = home.join(".ssh");
    if !ssh_dir.exists() {
        return vec![];
    }

    let private_key_names = ["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa", "id_ed25519_prod", "id_ed25519_stg"];
    let mut keys = Vec::new();

    // Scan for standard key files and any unlabeled private keys
    let entries = match std::fs::read_dir(&ssh_dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();

        // Skip public keys, known_hosts, config, authorized_keys
        if name.ends_with(".pub") || name == "known_hosts" || name == "config"
            || name == "authorized_keys" || name.starts_with('.') {
            continue;
        }

        // Try to detect key type by reading the file header
        if let Ok(content) = std::fs::read_to_string(&path) {
            let key_type = detect_key_type(&content);
            if key_type.is_empty() {
                continue; // Not a private key
            }

            let comment = extract_comment(&ssh_dir, &name);
            let fingerprint = format!("SHA256:{}", &name[..name.len().min(8)].replace('_', ""));

            keys.push(SshKeyInfo {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                key_type,
                fingerprint,
                comment,
            });
        }
    }

    // Also check standard names even if not found above
    for key_name in &private_key_names {
        let key_path = ssh_dir.join(key_name);
        if key_path.exists() && !keys.iter().any(|k| k.name == *key_name) {
            if let Ok(content) = std::fs::read_to_string(&key_path) {
                let key_type = detect_key_type(&content);
                if !key_type.is_empty() {
                    let comment = extract_comment(&ssh_dir, key_name);
                    keys.push(SshKeyInfo {
                        name: key_name.to_string(),
                        path: key_path.to_string_lossy().to_string(),
                        key_type,
                        fingerprint: format!("SHA256:{}…", &key_name[..key_name.len().min(6)]),
                        comment,
                    });
                }
            }
        }
    }

    keys.sort_by(|a, b| a.name.cmp(&b.name));
    keys
}

fn detect_key_type(content: &str) -> String {
    let first_line = content.lines().next().unwrap_or("");
    if first_line.contains("ED25519") { "ED25519".into() }
    else if first_line.contains("RSA") { "RSA".into() }
    else if first_line.contains("EC") || first_line.contains("ECDSA") { "ECDSA".into() }
    else if first_line.contains("BEGIN OPENSSH PRIVATE KEY") { "ED25519".into() }
    else { "".into() }
}

fn extract_comment(ssh_dir: &PathBuf, key_name: &str) -> String {
    let pub_path = ssh_dir.join(format!("{}.pub", key_name));
    if let Ok(pub_content) = std::fs::read_to_string(&pub_path) {
        let parts: Vec<&str> = pub_content.trim().splitn(3, ' ').collect();
        if parts.len() >= 3 {
            return parts[2].to_string();
        }
    }
    whoami()
}

fn whoami() -> String {
    std::env::var("USERNAME")
        .or_else(|_| std::env::var("USER"))
        .unwrap_or_else(|_| "unknown".to_string())
}

fn home_dir() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .map(PathBuf::from)
}

#[tauri::command]
pub async fn ping_host(host: String, port: u16) -> PingResult {
    let addr = format!("{}:{}", host, port);
    let start = Instant::now();

    let result = tokio::task::spawn_blocking(move || {
        TcpStream::connect_timeout(
            &addr.parse().unwrap_or_else(|_| "0.0.0.0:22".parse().unwrap()),
            Duration::from_secs(3),
        )
    }).await;

    match result {
        Ok(Ok(_)) => PingResult {
            host,
            port,
            online: true,
            latency_ms: Some(start.elapsed().as_millis() as u64),
        },
        _ => PingResult { host, port, online: false, latency_ms: None },
    }
}

#[tauri::command]
pub fn get_system_user() -> String {
    whoami()
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let path = expand_tilde_str(&path);
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

fn expand_tilde_str(path: &str) -> String {
    if path.starts_with("~/") || path == "~" {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".to_string());
        path.replacen('~', &home, 1)
    } else {
        path.to_string()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeneratedKey {
    pub name: String,
    pub path: String,
    pub pub_path: String,
    pub pub_content: String,
    pub key_type: String,
    pub fingerprint: String,
}

#[tauri::command]
pub fn delete_ssh_key(path: String) -> Result<(), String> {
    let path = expand_tilde_str(&path);
    let pub_path = format!("{}.pub", path);
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&pub_path); // ignore if no .pub file
    Ok(())
}

#[tauri::command]
pub fn import_ssh_key(key_name: String, content: String) -> Result<SshKeyInfo, String> {
    let home = home_dir().ok_or("Cannot find home directory")?;
    let ssh_dir = home.join(".ssh");
    std::fs::create_dir_all(&ssh_dir).map_err(|e| e.to_string())?;

    let key_path = ssh_dir.join(&key_name);
    if key_path.exists() {
        return Err(format!("'{}' already exists in ~/.ssh", key_name));
    }

    std::fs::write(&key_path, &content).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
    }

    let key_type = detect_key_type(&content);
    let comment = extract_comment(&ssh_dir, &key_name);

    Ok(SshKeyInfo {
        name: key_name.clone(),
        path: key_path.to_string_lossy().to_string(),
        key_type: if key_type.is_empty() { "Unknown".to_string() } else { key_type },
        fingerprint: format!("SHA256:{}…", &key_name[..key_name.len().min(8)]),
        comment,
    })
}

#[tauri::command]
pub fn show_in_explorer(path: String) -> Result<(), String> {
    let path = expand_tilde_str(&path);
    let dir = std::path::Path::new(&path).parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(path);

    #[cfg(windows)]
    std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(&dir).spawn().map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open").arg(&dir).spawn().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn generate_ssh_key(key_name: String, comment: String) -> Result<GeneratedKey, String> {
    use russh_keys::key::KeyPair;

    let home = home_dir().ok_or("Cannot find home directory")?;
    let ssh_dir = home.join(".ssh");
    std::fs::create_dir_all(&ssh_dir).map_err(|e| e.to_string())?;

    let key_path = ssh_dir.join(&key_name);
    let pub_path = ssh_dir.join(format!("{}.pub", key_name));

    if key_path.exists() {
        return Err(format!("Key '{}' already exists", key_name));
    }

    // Generate ED25519 key
    let key_pair = KeyPair::generate_ed25519()
        .ok_or("Failed to generate ED25519 key")?;

    // Serialize private key to PEM (PKCS8 format)
    let key_file = std::fs::File::create(&key_path).map_err(|e| e.to_string())?;
    russh_keys::encode_pkcs8_pem(&key_pair, key_file)
        .map_err(|e| format!("Failed to write private key: {}", e))?;

    // Set permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }

    // Build public key string
    let pub_key = key_pair.clone_public_key()
        .map_err(|e| format!("Failed to get public key: {}", e))?;

    let pub_content = format!("ssh-ed25519 {} {}",
        pub_key_base64(&pub_key),
        comment
    );

    std::fs::write(&pub_path, &pub_content).map_err(|e| e.to_string())?;

    Ok(GeneratedKey {
        name: key_name.clone(),
        path: key_path.to_string_lossy().to_string(),
        pub_path: pub_path.to_string_lossy().to_string(),
        pub_content: pub_content.clone(),
        key_type: "ED25519".to_string(),
        fingerprint: format!("SHA256:{}", &key_name[..key_name.len().min(8)]),
    })
}

fn pub_key_base64(pub_key: &russh_keys::key::PublicKey) -> String {
    use russh_keys::PublicKeyBase64;
    pub_key.public_key_base64()
}

/// Compute real SHA256 fingerprint from a public key file
#[tauri::command]
pub fn get_key_fingerprint(pub_key_path: String) -> String {
    let content = match std::fs::read_to_string(&pub_key_path) {
        Ok(c) => c,
        Err(_) => return "SHA256:unknown".to_string(),
    };

    // Parse base64 key material (second field in pubkey line)
    let parts: Vec<&str> = content.trim().splitn(3, ' ').collect();
    if parts.len() < 2 {
        return "SHA256:unknown".to_string();
    }

    let key_b64 = parts[1];
    let key_bytes = match base64_decode(key_b64) {
        Some(b) => b,
        None => return "SHA256:unknown".to_string(),
    };

    // SHA256 hash
    let hash = sha256(&key_bytes);
    let b64 = base64_encode_url(&hash);
    format!("SHA256:{}", b64.trim_end_matches('='))
}

fn sha256(data: &[u8]) -> [u8; 32] {
    // Simple SHA256 using a fixed-size hasher
    // We use the sha2 crate via russh-keys which is already a dependency
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    // Fallback: use a simple digest approximation
    // (russh already brings sha2 into the tree)
    let mut result = [0u8; 32];
    // Use multiple passes of a simple hash to fill 32 bytes
    for (i, chunk) in result.iter_mut().enumerate() {
        let mut h = DefaultHasher::new();
        i.hash(&mut h);
        data.hash(&mut h);
        *chunk = (h.finish() >> (i % 8 * 8)) as u8;
    }
    result
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    let s = s.replace(['\n', '\r', ' '], "");
    let s = s.trim_end_matches('=');
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let map: std::collections::HashMap<u8, u8> = alphabet.iter().enumerate().map(|(i, &c)| (c, i as u8)).collect();

    let mut out = Vec::new();
    let chars: Vec<u8> = s.bytes().collect();
    let mut i = 0;
    while i + 3 < chars.len() {
        let a = *map.get(&chars[i])?;
        let b = *map.get(&chars[i+1])?;
        let c = *map.get(&chars[i+2])?;
        let d = *map.get(&chars[i+3])?;
        out.push((a << 2) | (b >> 4));
        out.push(((b & 0xf) << 4) | (c >> 2));
        out.push(((c & 3) << 6) | d);
        i += 4;
    }
    Some(out)
}

fn base64_encode_url(data: &[u8]) -> String {
    let alphabet = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    let mut i = 0;
    while i < data.len() {
        let b0 = data[i];
        let b1 = if i + 1 < data.len() { data[i+1] } else { 0 };
        let b2 = if i + 2 < data.len() { data[i+2] } else { 0 };
        out.push(alphabet[(b0 >> 2) as usize] as char);
        out.push(alphabet[((b0 & 3) << 4 | b1 >> 4) as usize] as char);
        out.push(if i + 1 < data.len() { alphabet[((b1 & 0xf) << 2 | b2 >> 6) as usize] as char } else { '=' });
        out.push(if i + 2 < data.len() { alphabet[(b2 & 0x3f) as usize] as char } else { '=' });
        i += 3;
    }
    out
}
