use rusqlite::{Connection, params};
use std::sync::Mutex;

use crate::pibridge::protocol::AppSettings;

/// SQLite database for app-local settings, window state, and command log.
pub struct AppDatabase {
    conn: Mutex<Connection>,
}

impl AppDatabase {
    pub fn new(db_path: &str) -> Result<Self, String> {
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.initialize()?;
        Ok(db)
    }

    fn initialize(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS window_state (
                id TEXT PRIMARY KEY,
                x INTEGER NOT NULL DEFAULT 0,
                y INTEGER NOT NULL DEFAULT 0,
                w INTEGER NOT NULL DEFAULT 1100,
                h INTEGER NOT NULL DEFAULT 720,
                is_maximized INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS command_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL DEFAULT (datetime('now')),
                command TEXT NOT NULL,
                params TEXT,
                success INTEGER,
                error TEXT
            );
            ",
        )
        .map_err(|e| format!("Failed to initialize database: {}", e))?;

        // Insert default settings if not exist
        conn.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('theme', 'system')",
            [],
        ).ok();
        conn.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('font_size', '14')",
            [],
        ).ok();
        conn.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('telemetry_opt_in', 'false')",
            [],
        ).ok();

        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Option<String> {
        let conn = self.conn.lock().ok()?;
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .ok()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| format!("Failed to set setting: {}", e))?;
        Ok(())
    }

    pub fn get_all_settings(&self) -> AppSettings {
        let mut settings = AppSettings::default();

        if let Some(theme) = self.get_setting("theme") {
            settings.theme = theme;
        }
        if let Some(font_size) = self.get_setting("font_size") {
            if let Ok(size) = font_size.parse::<u32>() {
                settings.font_size = size;
            }
        }
        if let Some(telemetry) = self.get_setting("telemetry_opt_in") {
            settings.telemetry_opt_in = telemetry == "true";
        }
        if let Some(trusted_cwds) = self.get_setting("trusted_cwds") {
            if let Ok(cwds) = serde_json::from_str::<Vec<String>>(&trusted_cwds) {
                settings.trusted_cwds = cwds;
            }
        }
        if let Some(last_session) = self.get_setting("last_session_path") {
            settings.last_session_path = Some(last_session);
        }

        settings
    }

    pub fn log_command(&self, command: &str, params: Option<&str>, success: bool, error: Option<&str>) {
        if let Ok(conn) = self.conn.lock() {
            let _ = conn.execute(
                "INSERT INTO command_log (command, params, success, error) VALUES (?1, ?2, ?3, ?4)",
                params![command, params, success as i32, error],
            );
        }
    }

    pub fn get_window_state(&self) -> Option<super::pibridge::protocol::WindowGeometry> {
        let conn = self.conn.lock().ok()?;
        conn.query_row(
            "SELECT x, y, w, h, is_maximized FROM window_state WHERE id = 'main'",
            [],
            |row| {
                Ok(super::pibridge::protocol::WindowGeometry {
                    x: row.get::<_, i32>(0)?,
                    y: row.get::<_, i32>(1)?,
                    w: row.get::<_, u32>(2)?,
                    h: row.get::<_, u32>(3)?,
                    is_maximized: row.get::<_, i32>(4)? != 0,
                })
            },
        )
        .ok()
    }

    pub fn set_window_state(&self, state: &super::pibridge::protocol::WindowGeometry) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO window_state (id, x, y, w, h, is_maximized) VALUES ('main', ?1, ?2, ?3, ?4, ?5)",
            params![state.x, state.y, state.w, state.h, state.is_maximized as i32],
        )
        .map_err(|e| format!("Failed to save window state: {}", e))?;
        Ok(())
    }
}