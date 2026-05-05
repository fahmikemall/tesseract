use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub terminal_font: String,
    pub terminal_font_size: u8,
    pub terminal_scrollback: u32,
    pub terminal_cursor: String,
    pub terminal_bell: bool,
    pub ssh_default_port: u16,
    pub ssh_timeout: u32,
    pub ssh_keepalive: u32,
    pub ssh_strict_host_key: bool,
    pub ssh_known_hosts: String,
    pub ui_density: String,
    pub sidebar_width: u32,
    pub show_status_bar: bool,
    pub launch_on_startup: bool,
    pub auto_update: bool,
    pub telemetry: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            terminal_font: "JetBrains Mono".into(),
            terminal_font_size: 13,
            terminal_scrollback: 10000,
            terminal_cursor: "bar".into(),
            terminal_bell: false,
            ssh_default_port: 22,
            ssh_timeout: 20,
            ssh_keepalive: 60,
            ssh_strict_host_key: true,
            ssh_known_hosts: "~/.ssh/known_hosts".into(),
            ui_density: "default".into(),
            sidebar_width: 264,
            show_status_bar: true,
            launch_on_startup: false,
            auto_update: true,
            telemetry: false,
        }
    }
}

fn settings_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("settings.json")
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> AppSettings {
    let path = settings_path(&app);
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(s) = serde_json::from_str::<AppSettings>(&content) {
            return s;
        }
    }
    AppSettings::default()
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, app: AppHandle) -> Result<(), String> {
    let path = settings_path(&app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
