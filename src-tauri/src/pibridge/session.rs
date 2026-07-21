use std::fs;
use std::path::{Path, PathBuf};

use super::protocol::SessionEntry;

/// Pi agent home directory
fn pi_agent_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".pi").join("agent").join("sessions")
}

/// List all sessions by scanning `~/.pi/agent/sessions/--<cwd-slug>--/*.jsonl`
/// Parses only the first line (SessionHeader) for display info.
pub fn list_sessions(cwd: Option<&str>) -> Vec<SessionEntry> {
    let sessions_dir = pi_agent_dir();
    let mut entries = Vec::new();

    if !sessions_dir.exists() {
        return entries;
    }

    // If cwd is specified, look in that specific directory
    let search_dir = if let Some(cwd) = cwd {
        let slug = cwd_slug(cwd);
        sessions_dir.join(format!("--{}--", slug))
    } else {
        sessions_dir.clone()
    };

    let dirs = if cwd.is_some() {
        vec![search_dir]
    } else {
        // List all session directories
        match fs::read_dir(&sessions_dir) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect(),
            Err(_) => return vec![],
        }
    };

    for dir in dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }
        if let Ok(files) = fs::read_dir(&dir) {
            for file in files.flatten() {
                let path = file.path();
                if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    if let Some(entry) = parse_session_header(&path) {
                        entries.push(entry);
                    }
                }
            }
        }
    }

    // Sort by timestamp descending
    entries.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    entries
}

/// Parse the first line of a session JSONL file to extract header info.
fn parse_session_header(path: &Path) -> Option<SessionEntry> {
    let content = fs::read_to_string(path).ok()?;
    let first_line = content.lines().next()?;

    let val: serde_json::Value = serde_json::from_str(first_line).ok()?;

    let id = val.get("id").and_then(|v| v.as_str())?.to_string();
    let timestamp = val
        .get("timestamp")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let cwd = val
        .get("cwd")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let parent_session = val
        .get("parentSession")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Some(SessionEntry {
        path: path.to_string_lossy().to_string(),
        id,
        timestamp,
        cwd,
        parentSession: parent_session,
    })
}

/// Create a cwd slug from a directory path (replacing "/" with "-")
fn cwd_slug(cwd: &str) -> String {
    cwd.replace('/', "-")
        .replace('.', "-")
        .trim_matches('-')
        .to_string()
}

/// Import a session file by placing it into the correct session directory
pub fn import_session(source_path: &str, cwd: &str) -> Result<String, String> {
    let source = Path::new(source_path);
    if !source.exists() {
        return Err("Source file not found".to_string());
    }

    let slug = cwd_slug(cwd);
    let target_dir = pi_agent_dir().join(format!("--{}--", slug));

    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Failed to create session directory: {}", e))?;

    let filename = source
        .file_name()
        .ok_or("Invalid source filename")?
        .to_string_lossy();
    let target_path = target_dir.join(&*filename);

    fs::copy(source, &target_path)
        .map_err(|e| format!("Failed to copy session file: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cwd_slug() {
        assert_eq!(cwd_slug("/home/user/project"), "home-user-project");
        assert_eq!(cwd_slug("/"), "");
    }
}