pub mod protocol;
pub mod jsonl;
pub mod process;
pub mod discovery;
pub mod session;

use std::io::{BufRead, BufReader};
use std::sync::Arc;
use std::sync::Mutex;
use std::collections::HashMap;
use std::sync::mpsc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use protocol::PiState;

/// The main PiBridge - manages the pi child process lifecycle and JSONL communication.
pub struct PiBridge {
    /// The managed child process handler
    pub process: Arc<Mutex<process::PiProcess>>,
    /// Application handle for emitting events to frontend
    app_handle: Option<AppHandle>,
    /// Last known state (for crash recovery)
    last_state: Arc<Mutex<Option<PiState>>>,
    /// Binary path being used
    binary_path: String,
    /// Pi version
    pi_version: String,
    /// Pending responses keyed by command id, for request/response correlation
    pending_responses: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
}

impl PiBridge {
    pub fn new() -> Self {
        Self {
            process: Arc::new(Mutex::new(process::PiProcess::new())),
            app_handle: None,
            last_state: Arc::new(Mutex::new(None)),
            binary_path: String::new(),
            pi_version: String::new(),
            pending_responses: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    pub fn app_handle(&self) -> Option<AppHandle> {
        self.app_handle.clone()
    }

    pub fn set_binary_info(&mut self, path: String, version: String) {
        self.binary_path = path;
        self.pi_version = version;
    }

    pub fn binary_path(&self) -> &str {
        &self.binary_path
    }

    pub fn pi_version(&self) -> &str {
        &self.pi_version
    }

    pub fn pending_responses(&self) -> Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>> {
        self.pending_responses.clone()
    }

    /// Register a oneshot channel for a command id, so the reader thread can send the response back.
    pub fn register_response_channel(&self, id: &str) -> mpsc::Receiver<serde_json::Value> {
        let (tx, rx) = mpsc::channel();
        if let Ok(mut map) = self.pending_responses.lock() {
            map.insert(id.to_string(), tx);
        }
        rx
    }

    /// Send an RPC command and synchronously wait for a correlated response.
    /// Locks process only during send, then waits on a channel without holding any locks.
    pub fn send_cmd_and_wait(
        &self,
        cmd_type: &str,
        params: Option<serde_json::Value>,
        timeout_secs: u64,
    ) -> Result<serde_json::Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let rx = self.register_response_channel(&id);

        let cmd = protocol::RpcCommand {
            id: Some(id.clone()),
            cmd_type: cmd_type.to_string(),
            params,
        };

        {
            let mut process = self.process.lock().map_err(|e| e.to_string())?;
            let json = jsonl::encode_command(&cmd);
            process.send_command(&json)?;
        } // process lock released

        match rx.recv_timeout(Duration::from_secs(timeout_secs)) {
            Ok(response) => {
                if response
                    .get("success")
                    .and_then(|s| s.as_bool())
                    .unwrap_or(false)
                {
                    Ok(response
                        .get("data")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null))
                } else {
                    let err = response
                        .get("error")
                        .and_then(|e| e.as_str())
                        .unwrap_or("Unknown error")
                        .to_string();
                    Err(err)
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let _ = self
                    .pending_responses
                    .lock()
                    .map(|mut m| m.remove(&id));
                Err(format!(
                    "Command '{}' timed out after {}s",
                    cmd_type, timeout_secs
                ))
            }
            Err(_) => Err(format!("Command '{}' failed: channel closed", cmd_type)),
        }
    }

    /// Start a background thread that reads lines from the pi child process stdout
    /// and forwards them to the frontend as Tauri events.
    /// Returns a JoinHandle so the caller can monitor the thread.
    pub fn start_stdout_reader(
        &self,
        stdout: std::process::ChildStdout,
        handle: AppHandle,
        stop_signal: Arc<std::sync::atomic::AtomicBool>,
        pending: Arc<Mutex<HashMap<String, mpsc::Sender<serde_json::Value>>>>,
    ) -> std::thread::JoinHandle<()> {
        std::thread::Builder::new()
            .name("pi-stdout-reader".to_string())
            .spawn(move || {
                let reader = BufReader::new(stdout);
                log::info!("Stdout reader thread started");

                for line in reader.lines() {
                    // Check if we should stop
                    if stop_signal.load(std::sync::atomic::Ordering::SeqCst) {
                        log::info!("Stdout reader thread stopping by signal");
                        break;
                    }

                    match line {
                        Ok(l) => {
                            let trimmed = l.trim().to_string();
                            if trimmed.is_empty() {
                                continue;
                            }

                            if let Some(val) = jsonl::parse_line(&trimmed) {
                                // Check if this is a response (has id) and we have a pending channel
                                if jsonl::is_response(&val) {
                                    if let Some(id) = val.get("id").and_then(|i| i.as_str()) {
                                        if let Ok(mut map) = pending.lock() {
                                            if let Some(sender) = map.remove(id) {
                                                // Send the response to the waiting command handler
                                                let _ = sender.send(val.clone());
                                                continue; // Don't emit as event
                                            }
                                        }
                                    }
                                }

                                // Forward everything else as a pi:event to the frontend
                                let _ = handle.emit("pi:event", val);
                            }
                        }
                        Err(e) => {
                            log::error!("Error reading pi stdout: {}", e);
                            break;
                        }
                    }
                }

                log::info!("Stdout reader thread exited");
                // Process died — notify frontend
                let _ = handle.emit("pi:event", serde_json::json!({
                    "type": "process_died",
                    "reason": "stdout pipe closed"
                }));
            })
            .expect("Failed to spawn stdout reader thread")
    }
}