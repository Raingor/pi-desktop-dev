use serde_json;

/// Encode a JSON command as a single JSONL line (LF-terminated).
pub fn encode_command(cmd: &super::protocol::RpcCommand) -> Vec<u8> {
    let mut line = serde_json::to_string(cmd).unwrap_or_default();
    line.push('\n');
    line.into_bytes()
}

/// Encode an arbitrary JSON value as a single JSONL line (LF-terminated).
pub fn encode_command_data(data: &serde_json::Value) -> Vec<u8> {
    let mut line = serde_json::to_string(data).unwrap_or_default();
    line.push('\n');
    line.into_bytes()
}

/// Try to parse a line as a response or event.
/// Returns None if the line is empty or unparseable.
pub fn parse_line(line: &str) -> Option<serde_json::Value> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    serde_json::from_str(trimmed).ok()
}

/// Detect if a parsed JSON value is a response (has `type:"response"`).
pub fn is_response(value: &serde_json::Value) -> bool {
    value.get("type").and_then(|t| t.as_str()) == Some("response")
}

/// Detect if a parsed JSON value is an event (no `id`, type != "response").
pub fn is_event(value: &serde_json::Value) -> bool {
    value.get("id").is_none()
        && value
            .get("type")
            .and_then(|t| t.as_str())
            .map(|t| t != "response")
            .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pibridge::protocol::RpcCommand;

    #[test]
    fn test_encode_command() {
        let cmd = RpcCommand {
            id: Some("test-1".to_string()),
            cmd_type: "get_state".to_string(),
            params: None,
        };
        let bytes = encode_command(&cmd);
        let decoded = String::from_utf8(bytes).unwrap();
        assert!(decoded.contains("\"id\":\"test-1\""));
        assert!(decoded.ends_with('\n'));
    }

    #[test]
    fn test_parse_line() {
        let line = r#"{"type":"response","id":"test-1","success":true}"#;
        let parsed = parse_line(line).unwrap();
        assert!(is_response(&parsed));
        assert!(!is_event(&parsed));
    }

    #[test]
    fn test_parse_event() {
        let line = r#"{"type":"session","id":"sess-1","cwd":"/home"}"#;
        let parsed = parse_line(line).unwrap();
        assert!(!is_response(&parsed));
        assert!(is_event(&parsed));
    }
}