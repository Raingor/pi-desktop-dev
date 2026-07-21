mod pibridge;
mod db;

use std::sync::Arc;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

use pibridge::PiBridge;
use pibridge::protocol::*;
use pibridge::jsonl;
use db::AppDatabase;

/// Application state shared across Tauri commands
struct AppState {
    bridge: Arc<Mutex<PiBridge>>,
    database: Arc<Mutex<AppDatabase>>,
}

// ─── Tauri Commands ───────────────────────────────────────────

#[tauri::command]
async fn pi_bootstrap(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "binaryPath": bridge.binary_path(),
        "piVersion": bridge.pi_version(),
        "sessionId": null,
        "cwd": null,
    }))
}

#[tauri::command]
async fn pi_prompt(
    state: State<'_, AppState>,
    message: String,
    images: Option<Vec<String>>,
) -> Result<(), String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let mut cmd = serde_json::json!({
        "type": "prompt",
        "id": uuid::Uuid::new_v4().to_string(),
        "message": message,
    });
    if let Some(imgs) = images {
        if !imgs.is_empty() {
            cmd["images"] = serde_json::json!(imgs);
        }
    }
    let json = jsonl::encode_command_data(&cmd);
    let mut process = bridge.process.lock().map_err(|e| e.to_string())?;
    process.send_command(&json)
}

#[tauri::command]
async fn pi_steer(
    state: State<'_, AppState>,
    message: String,
    images: Option<Vec<String>>,
) -> Result<(), String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let mut cmd = serde_json::json!({
        "type": "steer",
        "id": uuid::Uuid::new_v4().to_string(),
        "message": message,
    });
    if let Some(imgs) = images {
        if !imgs.is_empty() {
            cmd["images"] = serde_json::json!(imgs);
        }
    }
    let json = jsonl::encode_command_data(&cmd);
    let mut process = bridge.process.lock().map_err(|e| e.to_string())?;
    process.send_command(&json)
}

#[tauri::command]
async fn pi_follow_up(
    state: State<'_, AppState>,
    message: String,
    images: Option<Vec<String>>,
) -> Result<(), String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let mut cmd = serde_json::json!({
        "type": "follow_up",
        "id": uuid::Uuid::new_v4().to_string(),
        "message": message,
    });
    if let Some(imgs) = images {
        if !imgs.is_empty() {
            cmd["images"] = serde_json::json!(imgs);
        }
    }
    let json = jsonl::encode_command_data(&cmd);
    let mut process = bridge.process.lock().map_err(|e| e.to_string())?;
    process.send_command(&json)
}

#[tauri::command]
async fn pi_abort(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let cmd = pibridge::protocol::RpcCommand {
        id: Some(uuid::Uuid::new_v4().to_string()),
        cmd_type: "abort".to_string(),
        params: None,
    };
    let json = jsonl::encode_command(&cmd);
    let mut process = bridge.process.lock().map_err(|e| e.to_string())?;
    process.send_command(&json)
}

#[tauri::command]
async fn pi_new_session(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let data = bridge.send_cmd_and_wait("new_session", None, 30)?;
    Ok(data)
}

#[tauri::command]
async fn pi_get_state(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    bridge.send_cmd_and_wait("get_state", None, 30)
}

#[tauri::command]
async fn pi_get_messages(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    // Try RPC first
    match bridge.send_cmd_and_wait("get_messages", None, 15) {
        Ok(data) => Ok(data),
        Err(e) => {
            log::warn!("get_messages RPC failed: {}; trying local file read", e);
            // Fallback: return empty array so frontend doesn't hang
            Ok(serde_json::Value::Array(vec![]))
        }
    }
}

/// Fallback: read session messages directly from a JSONL file
#[tauri::command]
async fn pi_read_session_file(
    path: String,
) -> Result<Vec<serde_json::Value>, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let mut entries = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
            // Skip the session header line
            if val.get("type").and_then(|t| t.as_str()) == Some("session") {
                continue;
            }
            entries.push(val);
        }
    }

    Ok(entries)
}

#[tauri::command]
async fn pi_get_available_models(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    bridge.send_cmd_and_wait("get_available_models", None, 30)
}

#[tauri::command]
async fn pi_switch_session(
    state: State<'_, AppState>,
    session_path: String,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let params = serde_json::json!({"sessionPath": session_path});
    bridge.send_cmd_and_wait("switch_session", Some(params), 30)
}

#[tauri::command]
async fn pi_set_model(
    state: State<'_, AppState>,
    provider: String,
    model_id: String,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let params = serde_json::json!({"provider": provider, "modelId": model_id});
    bridge.send_cmd_and_wait("set_model", Some(params), 30)
}

#[tauri::command]
async fn pi_get_session_stats(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    bridge.send_cmd_and_wait("get_session_stats", None, 30)
}

#[tauri::command]
async fn pi_compact(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    bridge.send_cmd_and_wait("compact", None, 60)
}

#[tauri::command]
async fn pi_list_sessions(
    _state: State<'_, AppState>,
    cwd: Option<String>,
) -> Result<Vec<SessionEntry>, String> {
    Ok(pibridge::session::list_sessions(cwd.as_deref()))
}

#[tauri::command]
async fn app_get_settings(
    state: State<'_, AppState>,
) -> Result<AppSettings, String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    Ok(db.get_all_settings())
}

#[tauri::command]
async fn app_set_settings(
    state: State<'_, AppState>,
    patch: serde_json::Value,
) -> Result<(), String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;

    if let Some(theme) = patch.get("theme").and_then(|v| v.as_str()) {
        db.set_setting("theme", theme)?;
    }
    if let Some(font_size) = patch.get("font_size").and_then(|v| v.as_u64()) {
        db.set_setting("font_size", &font_size.to_string())?;
    }
    if let Some(telemetry) = patch.get("telemetry_opt_in").and_then(|v| v.as_bool()) {
        db.set_setting("telemetry_opt_in", if telemetry { "true" } else { "false" })?;
    }

    Ok(())
}

#[tauri::command]
async fn app_trust_cwd(
    state: State<'_, AppState>,
    cwd: String,
    trusted: bool,
) -> Result<(), String> {
    let mut settings = {
        let db = state.database.lock().map_err(|e| e.to_string())?;
        db.get_all_settings()
    };

    if trusted {
        if !settings.trusted_cwds.contains(&cwd) {
            settings.trusted_cwds.push(cwd);
        }
    } else {
        settings.trusted_cwds.retain(|c| *c != cwd);
    }

    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.set_setting(
        "trusted_cwds",
        &serde_json::to_string(&settings.trusted_cwds).unwrap_or_default(),
    )?;

    Ok(())
}

// ─── App Setup ────────────────────────────────────────────────

fn setup_rust_logging() {
    #[cfg(debug_assertions)]
    {
        // Use log crate's built-in logger or a simple stderr logger
        #[cfg(feature = "env_logger")]
        let _ = env_logger::builder()
            .filter_level(log::LevelFilter::Info)
            .is_test(false)
            .try_init();
    }
}

/// Get the app data directory for current platform
fn app_data_dir() -> String {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        format!("{}/Library/Application Support/pi-desktop", home)
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Roaming".to_string());
        format!("{}/pi-desktop", appdata)
    }
    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        format!("{}/.local/share/pi-desktop", home)
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "/tmp/pi-desktop".to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_rust_logging();

    let data_dir = app_data_dir();
    std::fs::create_dir_all(&data_dir).ok();
    let db_path = std::path::Path::new(&data_dir).join("pi-desktop.db");

    // Initialize database (with fallback to in-memory)
    let database = match AppDatabase::new(db_path.to_string_lossy().as_ref()) {
        Ok(db) => Arc::new(Mutex::new(db)),
        Err(e) => {
            log::error!("Failed to initialize database: {}", e);
            Arc::new(Mutex::new(
                AppDatabase::new(":memory:").expect("Failed to create in-memory database")
            ))
        }
    };

    // Discover pi binary
    let (binary_path, pi_version) = match pibridge::discovery::discover_pi_binary() {
        Ok((path, version)) => {
            log::info!("Pi binary found: {} (version: {})", path, version);
            (path, version)
        }
        Err(e) => {
            log::warn!("Pi binary not found: {}", e);
            (String::new(), String::new())
        }
    };

    let bridge = Arc::new(Mutex::new(PiBridge::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            bridge: bridge.clone(),
            database,
        })
        .setup(move |app| {
            let handle = app.handle().clone();

            // Set app handle on bridge
            {
                let mut b = bridge.lock().unwrap();
                b.set_app_handle(handle.clone());
            }

            // Spawn pi process in background
            if !binary_path.is_empty() {
                let bridge_clone = bridge.clone();
                let bp = binary_path.clone();
                let pv = pi_version.clone();
                let h = handle.clone();
                std::thread::spawn(move || {
                    let mut b = bridge_clone.lock().unwrap();
                    let spawn_result = {
                        b.process.lock().unwrap().spawn(&bp)
                    };
                    match spawn_result {
                        Ok(()) => {
                            b.set_binary_info(bp.clone(), pv.clone());
                            log::info!("Pi process spawned successfully");

                            // Take stdout and start reader thread
                            let stdout = b.process.lock().unwrap().take_stdout();
                            if let Some(stdout) = stdout {
                                let stop_signal = b.process.lock().unwrap().stop_signal();
                                let pending = b.pending_responses();
                                let app_h = h.clone();
                                b.start_stdout_reader(stdout, app_h, stop_signal, pending);
                                log::info!("Stdout reader started");
                            }

                            let _ = h.emit("pi:event", serde_json::json!({
                                "type": "bootstrap",
                                "binaryPath": bp,
                                "piVersion": pv,
                            }));
                        }
                        Err(e) => {
                            log::error!("Failed to spawn pi: {}", e);
                            let _ = h.emit("pi:binary_missing", serde_json::json!({
                                "searched": ["PATH", "PI_BINARY"]
                            }));
                        }
                    }
                });
            } else {
                let _ = handle.emit("pi:binary_missing", serde_json::json!({
                    "searched": ["PATH", "PI_BINARY"]
                }));
            }

            setup_tray(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pi_bootstrap,
            pi_prompt,
            pi_steer,
            pi_follow_up,
            pi_abort,
            pi_new_session,
            pi_get_state,
            pi_get_messages,
            pi_read_session_file,
            pi_get_available_models,
            pi_switch_session,
            pi_set_model,
            pi_get_session_stats,
            pi_compact,
            pi_list_sessions,
            app_get_settings,
            app_set_settings,
            app_trust_cwd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running pi-desktop application");
}

/// Setup system tray icon and menu
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
    use tauri::menu::{MenuBuilder, MenuItemBuilder};

    let show_hide = MenuItemBuilder::with_id("show_hide", "Show/Hide").build(app)?;
    let new_chat = MenuItemBuilder::with_id("new_chat", "New Chat").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_hide)
        .item(&new_chat)
        .item(&settings)
        .item(&separator)
        .item(&quit)
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Pi Desktop")
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
                "show_hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "new_chat" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("pi:event", serde_json::json!({"type": "new_chat"}));
                    }
                }
                "settings" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit("pi:event", serde_json::json!({"type": "open_settings"}));
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up, ..
            } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}