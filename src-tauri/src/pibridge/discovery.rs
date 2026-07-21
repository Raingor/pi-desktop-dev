use std::path::PathBuf;

/// Discover the pi binary following the search order:
/// 1. PI_BINARY env var
/// 2. PATH lookup
/// 3. Common Node.js global install locations
/// 4. Home directory fallbacks
pub fn discover_pi_binary() -> Result<(String, String), String> {
    // 1. Check PI_BINARY env var
    if let Ok(path) = std::env::var("PI_BINARY") {
        let path_buf = PathBuf::from(&path);
        if path_buf.is_file() {
            let version = get_pi_version(&path)?;
            return Ok((path, version));
        }
    }

    // 2. PATH lookup
    if let Ok(path) = which_pi() {
        let version = get_pi_version(&path)?;
        return Ok((path, version));
    }

    // 3. Scan known Node.js global install paths
    let home = std::env::var("HOME").unwrap_or_default();
    let known_paths = vec![
        // FlyEnv (macOS development environment)
        format!("{}/Library/FlyEnv/env/node/bin/pi", home),
        // Homebrew
        "/opt/homebrew/bin/pi".to_string(),
        "/usr/local/bin/pi".to_string(),
        // npm global (various conventions)
        format!("{}/.npm-global/bin/pi", home),
        format!("{}/.npm-packages/bin/pi", home),
        format!("{}/.config/yarn/global/node_modules/.bin/pi", home),
        // pnpm
        format!("{}/.local/share/pnpm/pi", home),
        // nvm
        format!("{}/.nvm/versions/node/*/bin/pi", home),
        // bun
        format!("{}/.bun/bin/pi", home),
        // pipx / pip
        format!("{}/.local/bin/pi", home),
        format!("{}/.pyenv/shims/pi", home),
    ];

    for path in &known_paths {
        // Skip glob patterns (handled separately)
        if path.contains('*') {
            continue;
        }
        let path_buf = PathBuf::from(path);
        if path_buf.is_file() && is_executable(&path_buf) {
            if let Ok(version) = get_pi_version(path) {
                return Ok((path.clone(), version));
            }
        }
    }

    // 4. Try to find pi via the node binary's sibling bin directory
    if let Ok(node_path) = which_node() {
        if let Some(node_bin_dir) = PathBuf::from(&node_path).parent() {
            let pi_in_node_bin = node_bin_dir.join("pi");
            if pi_in_node_bin.is_file() && is_executable(&pi_in_node_bin) {
                let p = pi_in_node_bin.to_string_lossy().to_string();
                if let Ok(version) = get_pi_version(&p) {
                    return Ok((p, version));
                }
            }
            // Also check ../lib/node_modules/.bin/pi (npm location)
            let npm_bin = node_bin_dir.join("..").join("lib").join("node_modules").join(".bin").join("pi");
            if npm_bin.is_file() && is_executable(&npm_bin) {
                let p = npm_bin.to_string_lossy().to_string();
                if let Ok(version) = get_pi_version(&p) {
                    return Ok((p, version));
                }
            }
        }
    }

    Err("Pi binary not found. Please install pi first:\n  npm install -g pi-agent".to_string())
}

/// Find pi in PATH
fn which_pi() -> Result<String, String> {
    let path_env = std::env::var("PATH").unwrap_or_default();

    for dir in path_env.split(':') {
        let candidates = [
            PathBuf::from(dir).join("pi"),
            PathBuf::from(dir).join("pi.exe"),
        ];
        for candidate in candidates {
            if candidate.is_file() && is_executable(&candidate) {
                return Ok(candidate.to_string_lossy().to_string());
            }
        }
    }

    Err("pi not found in PATH".to_string())
}

/// Find the `node` binary in PATH (used as fallback to locate pi)
fn which_node() -> Result<String, String> {
    let path_env = std::env::var("PATH").unwrap_or_default();
    // Also check common node locations
    let home = std::env::var("HOME").unwrap_or_default();
    let extra_paths = vec![
        format!("{}/Library/FlyEnv/env/node/bin", home),
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
    ];

    // Extend PATH with common node paths
    let extended_path = extra_paths.iter()
        .fold(path_env, |acc, p| format!("{}:{}", acc, p));

    for dir in extended_path.split(':') {
        let candidate = PathBuf::from(dir).join("node");
        if candidate.is_file() && is_executable(&candidate) {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err("node not found".to_string())
}

/// Check if a file is executable (Unix only; always true on Windows)
fn is_executable(path: &PathBuf) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = path.metadata() {
            return metadata.permissions().mode() & 0o111 != 0;
        }
        false
    }
    #[cfg(not(unix))]
    {
        true
    }
}

/// Build PATH with common Node.js locations (pi is a Node.js script)
fn pi_node_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
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

/// Get pi version by running `pi --version`
fn get_pi_version(path: &str) -> Result<String, String> {
    let output = std::process::Command::new(path)
        .arg("--version")
        .env("PATH", pi_node_path())
        .output()
        .map_err(|e| format!("Failed to run pi --version: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if version.is_empty() {
            Ok("unknown".to_string())
        } else {
            Ok(version)
        }
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("pi --version failed: {}", stderr.trim()))
    }
}

/// Check if pi binary supports --mode rpc
pub fn check_rpc_support(path: &str) -> Result<bool, String> {
    let output = std::process::Command::new(path)
        .arg("--help")
        .output()
        .map_err(|e| format!("Failed to run pi --help: {}", e))?;

    let help_text = String::from_utf8_lossy(&output.stdout);
    Ok(help_text.contains("--mode") || help_text.contains("rpc"))
}
