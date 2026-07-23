mod pibridge;
mod db;
mod pi_config;

use std::sync::Arc;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{Emitter, Manager, State, Listener};

use pibridge::PiBridge;
use pibridge::protocol::*;
use pibridge::jsonl;
use db::AppDatabase;
use pi_config::*;

/// Application state shared across Tauri commands
struct AppState {
    bridge: Arc<Mutex<PiBridge>>,
    database: Arc<Mutex<AppDatabase>>,
    /// Tray icon badge (unread message count). 0 = no badge.
    tray_badge: Arc<AtomicU32>,
    /// Crash recovery attempt counter (resets on successful restart).
    restart_attempt: Arc<AtomicU32>,
}

// ─── Tauri Commands ───────────────────────────────────────────

#[tauri::command]
async fn pi_bootstrap(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let bp = bridge.binary_path();
    let pv = bridge.pi_version();

    Ok(serde_json::json!({
        "binaryPath": bp,
        "piVersion": pv,
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
    // Track session for crash recovery
    bridge.set_last_session_file(Some(session_path.clone()));
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
async fn pi_set_thinking_level(
    state: State<'_, AppState>,
    level: String,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    let params = serde_json::json!({ "level": level });
    bridge.send_cmd_and_wait("set_thinking_level", Some(params), 30)
}

#[tauri::command]
async fn pi_get_context_usage(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    // Pi may not support this directly; try get_session_stats and get_state
    let mut usage = serde_json::json!({
        "usedTokens": 0,
        "contextWindow": 0,
        "percent": 0,
    });
    if let Ok(stats) = bridge.send_cmd_and_wait("get_session_stats", None, 15) {
        if let Some(obj) = stats.as_object() {
            if let Some(t) = obj.get("totalTokens").and_then(|v| v.as_u64()) {
                usage["usedTokens"] = serde_json::json!(t);
            }
            if let Some(w) = obj.get("contextWindow").and_then(|v| v.as_u64()) {
                usage["contextWindow"] = serde_json::json!(w);
            }
        }
    }
    if let Ok(state_resp) = bridge.send_cmd_and_wait("get_state", None, 10) {
        if let Some(obj) = state_resp.as_object() {
            if let Some(model) = obj.get("model").and_then(|m| m.as_object()) {
                if let Some(tl) = model.get("thinkingLevel").and_then(|v| v.as_str()) {
                    usage["thinkingLevel"] = serde_json::json!(tl);
                }
            }
            // Some Pi versions expose contextUsage directly
            if let Some(u) = obj.get("contextUsage").and_then(|v| v.as_u64()) {
                usage["usedTokens"] = serde_json::json!(u);
            }
            if let Some(w) = obj.get("contextWindow").and_then(|v| v.as_u64()) {
                usage["contextWindow"] = serde_json::json!(w);
            }
        }
    }
    // Compute percent
    let used = usage.get("usedTokens").and_then(|v| v.as_u64()).unwrap_or(0);
    let window = usage.get("contextWindow").and_then(|v| v.as_u64()).unwrap_or(0);
    if window > 0 {
        let pct = ((used as f64 / window as f64) * 100.0).round() as u64;
        usage["percent"] = serde_json::json!(pct.min(100));
    }
    Ok(usage)
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

// ─── M8: Export / Import Commands ─────────────────────────────

/// Open a save dialog and write `content` to the chosen path.
/// Returns the chosen path on success, or empty string if user cancelled.
#[tauri::command]
async fn save_export_file(
    app: tauri::AppHandle,
    default_name: String,
    content: String,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    // Split default name into name + extension for filter
    let extension = match default_name.rsplit_once('.') {
        Some((_, e)) => e.to_string(),
        None => "txt".to_string(),
    };

    let (tx, rx) = std::sync::mpsc::channel::<Option<String>>();
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(&extension.to_uppercase(), &[&extension])
        .save_file(move |chosen_path: Option<tauri_plugin_dialog::FilePath>| {
            let result = chosen_path.map(|p| p.to_string());
            let _ = tx.send(result);
        });

    let path = rx
        .recv()
        .map_err(|e| format!("Dialog channel error: {}", e))?
        .ok_or_else(|| "Save dialog cancelled".to_string())?;

    // Strip the `file://` prefix if present
    let clean_path = if let Some(stripped) = path.strip_prefix("file://") {
        stripped.to_string()
    } else {
        path
    };

    std::fs::write(&clean_path, content.as_bytes())
        .map_err(|e| format!("Failed to write export file: {}", e))?;

    Ok(clean_path)
}

/// Import a .jsonl session file into Pi's sessions directory.
/// Copies the file into ~/.pi/agent/sessions/ if not already there,
/// then triggers a session list refresh on the frontend.
#[tauri::command]
async fn import_jsonl(
    app: tauri::AppHandle,
    file_path: String,
) -> Result<(), String> {
    let clean_path = if let Some(stripped) = file_path.strip_prefix("file://") {
        stripped.to_string()
    } else {
        file_path
    };

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;

    let sessions_dir = format!("{}/.pi/agent/sessions", home);
    std::fs::create_dir_all(&sessions_dir)
        .map_err(|e| format!("Failed to create sessions dir: {}", e))?;

    let file_name = std::path::Path::new(&clean_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file path".to_string())?
        .to_string();

    let dest = format!("{}/{}", sessions_dir, file_name);

    // If source and destination are the same, no copy needed
    if std::path::Path::new(&clean_path).canonicalize().ok()
        != std::path::Path::new(&dest).canonicalize().ok()
    {
        std::fs::copy(&clean_path, &dest)
            .map_err(|e| format!("Failed to copy jsonl file: {}", e))?;
    }

    // Notify frontend to refresh sessions
    let _ = app.emit("pi:event", serde_json::json!({
        "type": "session_imported",
        "path": dest,
    }));

    Ok(())
}

// ─── M7: Notification / Tray Badge Commands ───────────────────

/// Show a desktop notification via tauri-plugin-notification.
#[tauri::command]
async fn show_notification(
    _app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    _app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))?;
    Ok(())
}

/// Update the tray icon tooltip with an unread count badge.
/// (Tauri 2 doesn't support native overlay badges on macOS, so we encode it in the tooltip.)
#[tauri::command]
async fn set_tray_badge(
    app: tauri::AppHandle,
    count: u32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.tray_badge.store(count, Ordering::SeqCst);
    let tooltip = if count > 0 {
        format!("Pi Desktop · {} unread", count)
    } else {
        "Pi Desktop".to_string()
    };
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
    Ok(())
}

// ─── Crash Recovery Commands ──────────────────────────────────

/// Manually trigger a pi process restart (also used by auto-recovery).
#[tauri::command]
async fn pi_restart(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut bridge = state.bridge.lock().map_err(|e| e.to_string())?;
    state.restart_attempt.fetch_add(1, Ordering::SeqCst);
    let attempt = state.restart_attempt.load(Ordering::SeqCst);
    bridge.restart_with_recovery(app.clone()).map_err(|e| {
        // Emit process_died with restart_attempt so frontend can show banner
        let _ = app.emit("pi:event", serde_json::json!({
            "type": "process_died",
            "reason": e,
            "restart_attempt": attempt,
        }));
        e
    })?;
    state.restart_attempt.store(0, Ordering::SeqCst);
    Ok(())
}

// ─── App Setup ────────────────────────────────────────────────

fn setup_rust_logging() {
    let _ = env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .is_test(false)
        .try_init();
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
    // Set binary info immediately so pi_bootstrap returns the discovered path
    // without waiting for the background spawn thread to complete.
    {
        let mut b = bridge.lock().unwrap();
        b.set_binary_info(binary_path.clone(), pi_version.clone());
    }
    let database_for_setup = database.clone();
    let tray_badge = Arc::new(AtomicU32::new(0));
    let restart_attempt = Arc::new(AtomicU32::new(0));
    let tray_badge_for_setup = tray_badge.clone();
    let restart_attempt_for_setup = restart_attempt.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            bridge: bridge.clone(),
            database,
            tray_badge: tray_badge_for_setup,
            restart_attempt: restart_attempt_for_setup,
        })
        .setup(move |app| {
            let handle = app.handle().clone();

            // Set app handle on bridge
            {
                let mut b = bridge.lock().unwrap();
                b.set_app_handle(handle.clone());
            }

            // Restore window state from database
            if let Ok(db) = database_for_setup.lock() {
                if let Some(state) = db.get_window_state() {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.set_position(tauri::PhysicalPosition::new(state.x, state.y));
                        let _ = window.set_size(tauri::PhysicalSize::new(state.w, state.h));
                        if state.is_maximized {
                            let _ = window.maximize();
                        }
                    }
                }
            }

            // Save window state on resize/move/maximize
            let db_clone = database_for_setup.clone();
            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::Resized(size) => {
                            // Debounce: only save on final position, not during resize
                            if let Ok(win) = window_clone.outer_position() {
                                let is_max = window_clone.is_maximized().unwrap_or(false);
                                if let Ok(db) = db_clone.lock() {
                                    let _ = db.set_window_state(&WindowGeometry {
                                        x: win.x,
                                        y: win.y,
                                        w: size.width,
                                        h: size.height,
                                        is_maximized: is_max,
                                    });
                                }
                            }
                        }
                        tauri::WindowEvent::Moved(position) => {
                            if let Ok(size) = window_clone.inner_size() {
                                let is_max = window_clone.is_maximized().unwrap_or(false);
                                if let Ok(db) = db_clone.lock() {
                                    let _ = db.set_window_state(&WindowGeometry {
                                        x: position.x,
                                        y: position.y,
                                        w: size.width,
                                        h: size.height,
                                        is_maximized: is_max,
                                    });
                                }
                            }
                        }
                        _ => {}
                    }
                });
            }

            // ─── Crash recovery: listen for process_died events and auto-restart ─
            {
                let bridge_for_died = bridge.clone();
                let restart_attempt_for_died = restart_attempt.clone();
                let handle_for_died = handle.clone();
                app.listen("pi:event", move |_event| {
                    // We re-check inside by inspecting bridge state. The actual event payload
                    // is delivered via the listener but we can't easily deserialize here,
                    // so we use a polling-style check: only attempt restart if process not running.
                    // The frontend also gets process_died and shows a banner; here we proactively
                    // try to restart with exponential backoff (max 3 attempts).
                    let attempt = restart_attempt_for_died.fetch_add(1, Ordering::SeqCst) + 1;
                    if attempt > 3 {
                        log::error!("Max restart attempts (3) reached, giving up");
                        restart_attempt_for_died.store(0, Ordering::SeqCst);
                        return;
                    }
                    // Brief backoff: 500ms * attempt
                    std::thread::sleep(std::time::Duration::from_millis(500 * attempt as u64));
                    let mut b = bridge_for_died.lock().unwrap();
                    let needs_restart = {
                        let mut p = b.process.lock().unwrap();
                        !p.is_running()
                    };
                    if needs_restart {
                        log::warn!("Auto-restart attempt #{}", attempt);
                        match b.restart_with_recovery(handle_for_died.clone()) {
                            Ok(()) => {
                                log::info!("Auto-restart succeeded");
                                restart_attempt_for_died.store(0, Ordering::SeqCst);
                                // After restart, restore last session if any
                                if let Some(last_session) = b.last_session_file() {
                                    log::info!("Restoring last session: {}", last_session);
                                    let params = serde_json::json!({"sessionPath": last_session});
                                    let _ = b.send_cmd_and_wait("switch_session", Some(params), 30);
                                }
                            }
                            Err(e) => {
                                log::error!("Auto-restart failed: {}", e);
                            }
                        }
                    } else {
                        // Process is still running; reset counter
                        restart_attempt_for_died.store(0, Ordering::SeqCst);
                    }
                });
            }

            // Spawn pi process in background
            if !binary_path.is_empty() {
                let bridge_clone = bridge.clone();
                let bp = binary_path.clone();
                let pv = pi_version.clone();
                let h = handle.clone();
                std::thread::spawn(move || {
                    // Lock, spawn, set up reader — then RELEASE the lock before emit
                    // to avoid deadlock: emit() may block on the webview thread,
                    // and pi_bootstrap needs the lock to return binaryPath.
                    let spawn_ok = {
                        let mut b = bridge_clone.lock().unwrap();
                        let spawn_result = b.process.lock().unwrap().spawn(&bp);
                        match spawn_result {
                            Ok(()) => {
                                b.set_binary_info(bp.clone(), pv.clone());
                                log::info!("Pi process spawned successfully");

                                let stdout = b.process.lock().unwrap().take_stdout();
                                if let Some(stdout) = stdout {
                                    let stop_signal = b.process.lock().unwrap().stop_signal();
                                    let pending = b.pending_responses();
                                    let app_h = h.clone();
                                    b.start_stdout_reader(stdout, app_h, stop_signal, pending);
                                    log::info!("Stdout reader started");
                                }
                                true
                            }
                            Err(e) => {
                                log::error!("Failed to spawn pi: {}", e);
                                false
                            }
                        }
                    }; // Lock released here

                    if spawn_ok {
                        let _ = h.emit("pi:event", serde_json::json!({
                            "type": "bootstrap",
                            "binaryPath": bp,
                            "piVersion": pv,
                        }));
                    } else {
                        let _ = h.emit("pi:binary_missing", serde_json::json!({
                            "searched": ["PATH", "PI_BINARY"]
                        }));
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
            pi_set_thinking_level,
            pi_get_context_usage,
            pi_list_sessions,
            app_get_settings,
            app_set_settings,
            app_trust_cwd,
            pi_read_settings,
            pi_write_settings,
            pi_read_auth,
            pi_write_auth,
            pi_read_models,
            pi_write_models,
            pi_read_all_usage,
            pi_get_usage_by_range,
            pi_read_memory_files,
            pi_list_sessions_detailed,
            pi_delete_session,
            pi_list_trash,
            pi_restore_from_trash,
            pi_permanently_delete,
            pi_auto_cleanup,
            // Rename / Import external
            pi_rename_session,
            pi_import_external_session,
            pi_list_external_sessions,
            // M7/M8/crash recovery
            save_export_file,
            import_jsonl,
            show_notification,
            set_tray_badge,
            pi_restart,
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

    let _tray = TrayIconBuilder::with_id("main-tray")
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