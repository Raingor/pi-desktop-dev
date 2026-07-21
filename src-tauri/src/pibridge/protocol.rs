use serde::{Deserialize, Serialize};

/// Response from pi --mode rpc
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RpcResponse {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub resp_type: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub success: Option<bool>,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
    #[serde(default)]
    pub error: Option<String>,
}

/// An event from pi --mode rpc (no id field)
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct RpcEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(flatten)]
    pub data: serde_json::Value,
}

/// RPC command to send to pi
#[derive(Debug, Serialize, Clone)]
pub struct RpcCommand {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub cmd_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// PiState returned by get_state
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PiState {
    #[serde(default)]
    pub session: Option<SessionInfo>,
    #[serde(default)]
    pub model: Option<ModelInfo>,
    #[serde(default)]
    pub sessionFile: Option<String>,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(flatten)]
    pub extra: serde_json::Value,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct SessionInfo {
    pub id: String,
    #[serde(default)]
    pub cwd: Option<String>,
    #[serde(default)]
    pub parentSession: Option<String>,
    #[serde(default)]
    pub timestamp: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ModelInfo {
    pub provider: Option<String>,
    pub modelId: Option<String>,
    #[serde(default)]
    pub thinkingLevel: Option<String>,
}

/// Session info for sidebar listing
#[derive(Debug, Serialize, Clone)]
pub struct SessionEntry {
    pub path: String,
    pub id: String,
    pub timestamp: String,
    pub cwd: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parentSession: Option<String>,
}

/// App settings stored in SQLite
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub theme: String,
    pub font_size: u32,
    pub window_geometry: Option<WindowGeometry>,
    pub trusted_cwds: Vec<String>,
    pub last_session_path: Option<String>,
    pub telemetry_opt_in: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 14,
            window_geometry: None,
            trusted_cwds: vec![],
            last_session_path: None,
            telemetry_opt_in: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowGeometry {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
    pub is_maximized: bool,
}