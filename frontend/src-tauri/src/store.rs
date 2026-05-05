use rusqlite::{Connection, Result as SqlResult, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: AuthType,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub group: Option<String>,
    pub os_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AuthType {
    Password,
    Key,
    Agent,
}

impl std::fmt::Display for AuthType {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            AuthType::Password => write!(f, "password"),
            AuthType::Key => write!(f, "key"),
            AuthType::Agent => write!(f, "agent"),
        }
    }
}

impl std::str::FromStr for AuthType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "password" => Ok(AuthType::Password),
            "key" => Ok(AuthType::Key),
            "agent" => Ok(AuthType::Agent),
            other => Err(format!("Unknown auth type: {}", other)),
        }
    }
}

pub struct ConnectionStore {
    conn: Connection,
}

impl ConnectionStore {
    pub fn new(db_path: PathBuf) -> SqlResult<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let conn = Connection::open(&db_path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                username TEXT NOT NULL,
                auth_type TEXT NOT NULL DEFAULT 'key',
                password TEXT,
                private_key_path TEXT,
                grp TEXT
            );
            CREATE TABLE IF NOT EXISTS groups (
                name TEXT PRIMARY KEY,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS known_hosts (
                host TEXT NOT NULL,
                port INTEGER NOT NULL DEFAULT 22,
                fingerprint TEXT NOT NULL,
                accepted_at TEXT NOT NULL,
                PRIMARY KEY (host, port)
            );
            UPDATE connections SET grp='Default' WHERE grp IS NULL OR grp='';",
        )?;
        // Add os_type column if it doesn't exist (safe migration for older DBs)
        let _ = conn.execute("ALTER TABLE connections ADD COLUMN os_type TEXT", []);
        Ok(Self { conn })
    }

    pub fn get_all(&self) -> SqlResult<Vec<SshConnection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, host, port, username, auth_type, password, private_key_path, grp, os_type
             FROM connections ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            let auth_str: String = row.get(5)?;
            Ok(SshConnection {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get::<_, i64>(3)? as u16,
                username: row.get(4)?,
                auth_type: auth_str.parse().unwrap_or(AuthType::Key),
                password: row.get(6)?,
                private_key_path: row.get(7)?,
                group: row.get(8)?,
                os_type: row.get(9)?,
            })
        })?;
        rows.collect()
    }

    pub fn save(&self, conn: &SshConnection) -> SqlResult<()> {
        // Normalize: empty/None group → 'Default'
        let group = conn.group.as_deref()
            .filter(|g| !g.is_empty())
            .unwrap_or("Default");

        // Auto-create group if it doesn't exist
        self.conn.execute(
            "INSERT OR IGNORE INTO groups (name, sort_order) VALUES (?1, 0)",
            params![group],
        )?;
        self.conn.execute(
            "INSERT INTO connections (id, name, host, port, username, auth_type, password, private_key_path, grp, os_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
               name=excluded.name, host=excluded.host, port=excluded.port,
               username=excluded.username, auth_type=excluded.auth_type,
               password=excluded.password, private_key_path=excluded.private_key_path,
               grp=excluded.grp, os_type=excluded.os_type",
            params![
                conn.id, conn.name, conn.host, conn.port as i64,
                conn.username, conn.auth_type.to_string(),
                conn.password, conn.private_key_path, group, conn.os_type
            ],
        )?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> SqlResult<bool> {
        let n = self.conn.execute("DELETE FROM connections WHERE id=?1", params![id])?;
        Ok(n > 0)
    }

    // ── Group management ──────────────────────────────────────────────────────

    pub fn get_groups(&self) -> SqlResult<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT name FROM groups ORDER BY sort_order, name"
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect()
    }

    pub fn upsert_group(&self, name: &str) -> SqlResult<()> {
        self.conn.execute(
            "INSERT OR IGNORE INTO groups (name, sort_order) VALUES (?1, 0)",
            params![name],
        )?;
        Ok(())
    }

    pub fn rename_group(&self, old: &str, new: &str) -> SqlResult<()> {
        // Move all connections from old group to new group
        self.conn.execute(
            "UPDATE connections SET grp=?2 WHERE grp=?1",
            params![old, new],
        )?;
        // Ensure new group exists in groups table
        self.conn.execute(
            "INSERT OR IGNORE INTO groups (name, sort_order) VALUES (?1, 0)",
            params![new],
        )?;
        // Remove old group
        self.conn.execute("DELETE FROM groups WHERE name=?1", params![old])?;
        Ok(())
    }

    pub fn delete_group(&self, name: &str) -> SqlResult<()> {
        // Move orphaned connections to "Default"
        self.conn.execute(
            "UPDATE connections SET grp='Default' WHERE grp=?1",
            params![name],
        )?;
        self.conn.execute("DELETE FROM groups WHERE name=?1", params![name])?;
        Ok(())
    }
}

// Tauri commands

#[tauri::command]
pub fn get_connections(
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<Vec<SshConnection>, String> {
    store.lock().map_err(|e| e.to_string())?
        .get_all()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_os_type(
    id: String,
    os_type: String,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<(), String> {
    store.lock().map_err(|e| e.to_string())?
        .conn.execute(
            "UPDATE connections SET os_type=?1 WHERE id=?2",
            rusqlite::params![os_type, id],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_connection(
    conn: SshConnection,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<(), String> {
    store.lock().map_err(|e| e.to_string())?
        .save(&conn)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_connection(
    id: String,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<bool, String> {
    store.lock().map_err(|e| e.to_string())?
        .delete(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_groups(
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<Vec<String>, String> {
    store.lock().map_err(|e| e.to_string())?
        .get_groups()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_group(
    name: String,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<(), String> {
    store.lock().map_err(|e| e.to_string())?
        .upsert_group(&name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_group(
    old_name: String,
    new_name: String,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<(), String> {
    store.lock().map_err(|e| e.to_string())?
        .rename_group(&old_name, &new_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_group(
    name: String,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<(), String> {
    store.lock().map_err(|e| e.to_string())?
        .delete_group(&name)
        .map_err(|e| e.to_string())
}

/// Returns the stored fingerprint if host is known, or None if unknown.
#[tauri::command]
pub fn check_known_host(
    host: String,
    port: u16,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<Option<String>, String> {
    let store = store.lock().map_err(|e| e.to_string())?;
    let mut stmt = store.conn.prepare(
        "SELECT fingerprint FROM known_hosts WHERE host=?1 AND port=?2"
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_row(params![host, port as i64], |row| row.get::<_, String>(0)).ok();
    Ok(result)
}

/// Save a host key fingerprint as accepted.
#[tauri::command]
pub fn accept_host_key(
    host: String,
    port: u16,
    fingerprint: String,
    store: State<std::sync::Mutex<ConnectionStore>>,
) -> Result<(), String> {
    store.lock().map_err(|e| e.to_string())?
        .conn.execute(
            "INSERT OR REPLACE INTO known_hosts (host, port, fingerprint, accepted_at) VALUES (?1, ?2, ?3, datetime('now'))",
            params![host, port as i64, fingerprint],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
}
