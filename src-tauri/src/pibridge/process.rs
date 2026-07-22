use std::io::Write;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Arc;
use std::sync::{Mutex, atomic::{AtomicBool, Ordering}};

/// Wraps a pi child process, providing stdin write access.
/// stdout is managed externally (taken via take_stdout and given to a reader thread).
pub struct PiProcess {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<std::process::ChildStdout>,
    stop_reader: Arc<AtomicBool>,
    last_session_file: Arc<Mutex<Option<String>>>,
}

impl PiProcess {
    pub fn new() -> Self {
        Self {
            child: None,
            stdin: None,
            stdout: None,
            stop_reader: Arc::new(AtomicBool::new(false)),
            last_session_file: Arc::new(Mutex::new(None)),
        }
    }

    /// Build a PATH that includes common Node.js install locations.
    /// pi is a `#!/usr/bin/env node` script, so `node` must be findable in PATH.
    fn pi_path() -> String {
        let current = std::env::var("PATH").unwrap_or_default();
        let home = std::env::var("HOME").unwrap_or_default();
        // Common node binary locations — prepend so they take priority
        let extras = vec![
            format!("{}/Library/FlyEnv/env/node/bin", home),
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".to_string(),
            format!("{}/.bun/bin", home),
            format!("{}/.local/bin", home),
        ];
        let mut path = extras.join(":");
        if !current.is_empty() {
            path.push(':');
            path.push_str(&current);
        }
        path
    }

    /// Spawn `pi --mode rpc` with the given binary path.
    /// Does NOT read stdout — that is done externally via take_stdout + reader thread.
    /// Automatically extends PATH so Node.js scripts find the `node` interpreter.
    pub fn spawn(&mut self, binary_path: &str) -> Result<(), String> {
        let mut child = Command::new(binary_path)
            .arg("--mode")
            .arg("rpc")
            .env("PATH", Self::pi_path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn pi: {}", e))?;

        let stdin = child.stdin.take().ok_or("Failed to capture stdin")?;
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

        self.stdin = Some(stdin);
        self.stdout = Some(stdout);
        self.child = Some(child);
        self.stop_reader.store(false, Ordering::SeqCst);

        Ok(())
    }

    /// Take ownership of the stdout handle for external reading.
    pub fn take_stdout(&mut self) -> Option<std::process::ChildStdout> {
        self.stdout.take()
    }

    /// Get the stop signal for the reader thread.
    pub fn stop_signal(&self) -> Arc<AtomicBool> {
        self.stop_reader.clone()
    }

    /// Signal the reader thread to stop.
    pub fn signal_stop(&self) {
        self.stop_reader.store(true, Ordering::SeqCst);
    }

    /// Send a JSONL command to the child process stdin.
    pub fn send_command(&mut self, json: &[u8]) -> Result<(), String> {
        if let Some(ref mut stdin) = self.stdin {
            stdin
                .write_all(json)
                .map_err(|e| format!("Failed to write to pi stdin: {}", e))?;
            stdin
                .flush()
                .map_err(|e| format!("Failed to flush pi stdin: {}", e))?;
            Ok(())
        } else {
            Err("No stdin available - pi process not running".to_string())
        }
    }

    /// Check if the child process is still running.
    pub fn is_running(&mut self) -> bool {
        if let Some(ref mut child) = self.child {
            match child.try_wait() {
                Ok(Some(_)) => false, // Exited
                Ok(None) => true,     // Still running
                Err(_) => false,      // Error checking
            }
        } else {
            false
        }
    }

    /// Kill the child process.
    pub fn kill(&mut self) {
        if let Some(ref mut child) = self.child {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.child = None;
        self.stdin = None;
    }

    /// Restart pi process with the same binary path. Returns Ok(()) on success.
    /// Caller should re-take stdout and re-start reader thread afterwards.
    pub fn restart(&mut self, binary_path: &str) -> Result<(), String> {
        self.kill();
        // Brief pause to let OS reclaim resources
        std::thread::sleep(std::time::Duration::from_millis(200));
        self.spawn(binary_path)
    }

    /// Get the last known session file path (for crash recovery).
    pub fn last_session_file(&self) -> Option<String> {
        self.last_session_file.lock().ok()?.clone()
    }

    /// Set the last known session file path (called when switch_session succeeds).
    pub fn set_last_session_file(&self, path: Option<String>) {
        if let Ok(mut g) = self.last_session_file.lock() {
            *g = path;
        }
    }

    /// Get the binary path used for the spawn (we don't store it, so caller must remember).
    /// Returns the path from the most recent spawn by reading the child's program path.
    pub fn binary_path_used(&self) -> Option<String> {
        self.child.as_ref().map(|_| String::new()) // Caller must track externally
    }
}

impl Drop for PiProcess {
    fn drop(&mut self) {
        self.kill();
    }
}