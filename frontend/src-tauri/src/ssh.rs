use russh::client::{self, Handle};
use russh_keys::key::PublicKey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex as AsyncMutex;

/// Expand leading `~` to the actual home directory
fn expand_tilde(path: &str) -> PathBuf {
    if path.starts_with("~/") || path == "~" {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".to_string());
        PathBuf::from(path.replacen('~', &home, 1))
    } else {
        PathBuf::from(path)
    }
}

/// Try all private keys found in ~/.ssh — same as how `ssh` CLI works
async fn try_agent_auth(handle: &mut Handle<ClientHandler>, username: &str) -> Result<bool, String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Cannot find home directory".to_string())?;

    let ssh_dir = PathBuf::from(&home).join(".ssh");
    let mut tried = 0;
    let mut load_errors: Vec<String> = Vec::new();
    let mut auth_errors: Vec<String> = Vec::new();

    // Priority order: ed25519 first, then rsa, then others
    let priority = ["id_ed25519", "id_rsa", "id_ecdsa", "id_ed25519_prod", "id_ed25519_stg"];

    // Try priority keys first
    for key_name in &priority {
        let path = ssh_dir.join(key_name);
        if !path.exists() { continue; }

        match russh_keys::load_secret_key(&path, None) {
            Ok(key_pair) => {
                tried += 1;
                match handle.authenticate_publickey(username, Arc::new(key_pair)).await {
                    Ok(true) => return Ok(true),
                    Ok(false) => auth_errors.push(format!("{}: rejected", key_name)),
                    Err(e) => auth_errors.push(format!("{}: {}", key_name, e)),
                }
            }
            Err(e) => {
                // Key might need passphrase or be in unsupported format
                load_errors.push(format!("{}: {}", key_name, e));
            }
        }
    }

    // Try remaining keys
    if let Ok(entries) = std::fs::read_dir(&ssh_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();

            if name.ends_with(".pub") || name == "known_hosts" || name == "config"
                || name == "authorized_keys" || name.starts_with('.')
                || priority.contains(&name.as_str()) {
                continue;
            }

            if let Ok(key_pair) = russh_keys::load_secret_key(&path, None) {
                tried += 1;
                match handle.authenticate_publickey(username, Arc::new(key_pair)).await {
                    Ok(true) => return Ok(true),
                    Ok(false) => auth_errors.push(format!("{}: rejected", name)),
                    Err(e) => auth_errors.push(format!("{}: {}", name, e)),
                }
            }
        }
    }

    if tried == 0 && !load_errors.is_empty() {
        return Err(format!(
            "Could not load SSH keys from ~/.ssh:\n{}\n\nKey may be passphrase-protected. Use 'Choose key' and enter the passphrase.",
            load_errors.join("\n")
        ));
    }

    if tried == 0 {
        return Err("No SSH keys found in ~/.ssh. Generate or import a key first.".to_string());
    }

    Err(format!(
        "Authentication rejected by server. Tried {} key(s).\n{}",
        tried,
        auth_errors.join("\n")
    ))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConnectRequest {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

struct ClientHandler;

#[async_trait::async_trait]
impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

pub struct SessionEntry {
    // kept alive to maintain the TCP connection; drop = disconnect
    _handle: Handle<ClientHandler>,
    channel: russh::Channel<client::Msg>,
}

pub struct SshSessions {
    sessions: HashMap<String, Arc<AsyncMutex<SessionEntry>>>,
}

impl SshSessions {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}

#[tauri::command]
pub async fn ssh_connect(
    request: ConnectRequest,
    app: AppHandle,
    sessions: State<'_, std::sync::Mutex<SshSessions>>,
) -> Result<(), String> {
    let session_id = request.session_id.clone();
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();

    let config = Arc::new(client::Config {
        ..Default::default()
    });

    let sh = ClientHandler;
    let addr = format!("{}:{}", request.host, request.port);

    let mut handle = client::connect(config, addr, sh)
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let authed = match request.auth_type.as_str() {
        "password" => {
            let password = request.password.ok_or("Password required")?;
            handle
                .authenticate_password(&request.username, &password)
                .await
                .map_err(|e| format!("Auth failed: {}", e))?
        }
        "key" => {
            match request.private_key_path {
                Some(raw_path) if !raw_path.is_empty() => {
                    let key_path = expand_tilde(&raw_path);
                    // Try with passphrase if provided, else try without
                    let passphrase = request.passphrase.as_deref().filter(|p| !p.is_empty());
                    let key_pair = russh_keys::load_secret_key(&key_path, passphrase)
                        .map_err(|e| {
                            if e.to_string().contains("passphrase") || e.to_string().contains("decrypt") {
                                format!("Key '{}' is passphrase-protected. Enter the passphrase.", key_path.file_name().unwrap_or_default().to_string_lossy())
                            } else {
                                format!("Failed to load key '{}': {}", key_path.display(), e)
                            }
                        })?;
                    handle
                        .authenticate_publickey(&request.username, Arc::new(key_pair))
                        .await
                        .map_err(|e| format!("Auth failed: {}", e))?
                }
                _ => {
                    try_agent_auth(&mut handle, &request.username).await?
                }
            }
        }
        "agent" => {
            // Try SSH agent auth via OpenSSH agent (Windows named pipe or Unix socket)
            let result = try_agent_auth(&mut handle, &request.username).await;
            match result {
                Ok(authed) => authed,
                Err(e) => return Err(format!("SSH agent auth failed: {}", e)),
            }
        }
        _ => return Err("Unknown auth type".to_string()),
    };

    if !authed {
        return Err("Authentication rejected by server".to_string());
    }

    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| format!("Channel open failed: {}", e))?;

    channel
        .request_pty(false, "xterm-256color", 220, 50, 0, 0, &[])
        .await
        .map_err(|e| format!("PTY request failed: {}", e))?;

    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("Shell request failed: {}", e))?;

    let entry = Arc::new(AsyncMutex::new(SessionEntry { _handle: handle, channel }));
    let entry_clone = entry.clone();

    {
        let mut sessions = sessions.lock().map_err(|e| e.to_string())?;
        sessions.sessions.insert(session_id.clone(), entry);
    }

    tokio::spawn(async move {
        loop {
            let msg = {
                let mut session = entry_clone.lock().await;
                session.channel.wait().await
            };

            match msg {
                Some(russh::ChannelMsg::Data { ref data }) => {
                    let output = String::from_utf8_lossy(data).to_string();
                    let _ = app_clone.emit(
                        &format!("ssh-output-{}", session_id_clone),
                        output,
                    );
                }
                Some(russh::ChannelMsg::Eof) | None => {
                    let _ = app_clone.emit(
                        &format!("ssh-closed-{}", session_id_clone),
                        (),
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn ssh_send_input(
    session_id: String,
    input: String,
    sessions: State<'_, std::sync::Mutex<SshSessions>>,
) -> Result<(), String> {
    let entry = {
        let sessions = sessions.lock().map_err(|e| e.to_string())?;
        sessions
            .sessions
            .get(&session_id)
            .cloned()
            .ok_or("Session not found")?
    };

    let session = entry.lock().await;
    session
        .channel
        .data(input.as_bytes())
        .await
        .map_err(|e| format!("Send failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_id: String,
    sessions: State<'_, std::sync::Mutex<SshSessions>>,
) -> Result<(), String> {
    let mut sessions = sessions.lock().map_err(|e| e.to_string())?;
    sessions.sessions.remove(&session_id);
    Ok(())
}

#[tauri::command]
pub async fn ssh_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    sessions: State<'_, std::sync::Mutex<SshSessions>>,
) -> Result<(), String> {
    let entry = {
        let sessions = sessions.lock().map_err(|e| e.to_string())?;
        sessions.sessions.get(&session_id).cloned()
    };
    if let Some(entry) = entry {
        let session = entry.lock().await;
        session
            .channel
            .window_change(cols, rows, 0, 0)
            .await
            .map_err(|e| format!("Resize failed: {}", e))?;
    }
    Ok(())
}
