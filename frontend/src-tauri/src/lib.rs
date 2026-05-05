mod native_ssh;
mod settings;
mod sftp;
mod ssh;
mod store;
mod system;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let native_sessions = native_ssh::NativeSessions::new();
            app.manage(std::sync::Mutex::new(native_sessions));
            let db_path = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."))
                .join("connections.db");

            let store = store::ConnectionStore::new(db_path)
                .expect("Failed to open SQLite database");
            app.manage(std::sync::Mutex::new(store));

            let sessions = ssh::SshSessions::new();
            app.manage(std::sync::Mutex::new(sessions));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store::get_connections,
            store::save_connection,
            store::delete_connection,
            store::get_groups,
            store::upsert_group,
            store::rename_group,
            store::delete_group,
            ssh::ssh_connect,
            ssh::ssh_disconnect,
            ssh::ssh_send_input,
            ssh::ssh_resize,
            system::get_ssh_keys,
            system::ping_host,
            system::get_system_user,
            system::read_file,
            system::get_key_fingerprint,
            system::generate_ssh_key,
            system::delete_ssh_key,
            system::import_ssh_key,
            system::show_in_explorer,
            settings::get_settings,
            settings::save_settings,
            native_ssh::ssh_connect_native,
            native_ssh::ssh_send_native,
            native_ssh::ssh_resize_native,
            native_ssh::ssh_disconnect_native,
            native_ssh::local_terminal_connect,
            native_ssh::ssh_exec,
            native_ssh::scan_host_fingerprint,
            store::check_known_host,
            store::accept_host_key,
            store::save_os_type,
            sftp::sftp_list_local,
            sftp::sftp_local_home,
            sftp::sftp_list_remote,
            sftp::sftp_upload,
            sftp::sftp_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
