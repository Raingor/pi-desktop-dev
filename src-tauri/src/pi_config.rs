use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use chrono::{Datelike, Timelike};

// ─── Pi agent home directory ───────────────────────────────

fn pi_agent_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".pi").join("agent")
}

fn pi_path(filename: &str) -> PathBuf {
    pi_agent_dir().join(filename)
}

fn read_json<T: for<'a> Deserialize<'a>>(path: &Path) -> Result<T, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn write_json<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let content = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(path, &content)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

// ─── Settings ───────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PiSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaultProvider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaultModel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub defaultThinkingLevel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hideThinkingBlock: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub packages: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabledModels: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[tauri::command]
pub fn pi_read_settings() -> Result<PiSettings, String> {
    let path = pi_path("settings.json");
    if !path.exists() {
        return Ok(PiSettings::default());
    }
    read_json(&path)
}

#[tauri::command]
pub fn pi_write_settings(settings: PiSettings) -> Result<(), String> {
    let path = pi_path("settings.json");
    write_json(&path, &settings)
}

// ─── Auth ───────────────────────────────────────────────────

pub type PiAuth = HashMap<String, ProviderAuth>;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderAuth {
    #[serde(rename = "type")]
    pub auth_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<HashMap<String, String>>,
}

#[tauri::command]
pub fn pi_read_auth() -> Result<PiAuth, String> {
    let path = pi_path("auth.json");
    if !path.exists() {
        return Ok(HashMap::new());
    }
    read_json(&path)
}

#[tauri::command]
pub fn pi_write_auth(auth: PiAuth) -> Result<(), String> {
    let path = pi_path("auth.json");
    write_json(&path, &auth)
}

// ─── Models (custom providers) ──────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct PiModelsJson {
    pub providers: HashMap<String, CustomProviderConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CustomProviderConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub baseUrl: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apiKey: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<serde_json::Value>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[tauri::command]
pub fn pi_read_models() -> Result<PiModelsJson, String> {
    let path = pi_path("models.json");
    if !path.exists() {
        return Ok(PiModelsJson::default());
    }
    read_json(&path)
}

#[tauri::command]
pub fn pi_write_models(models: PiModelsJson) -> Result<(), String> {
    let path = pi_path("models.json");
    write_json(&path, &models)
}

// ─── Usage Record Types ─────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct UsageRecord {
    pub date: String,
    pub hour: Option<u32>,
    pub providerId: String,
    pub modelId: String,
    pub inputTokens: u64,
    pub outputTokens: u64,
    pub cacheReadTokens: u64,
    pub cacheWriteTokens: u64,
    pub requests: u64,
    pub cost: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct UsageRangeData {
    pub totalTokens: u64,
    pub totalInput: u64,
    pub totalOutput: u64,
    pub totalCacheRead: u64,
    pub totalCacheWrite: u64,
    pub totalCost: f64,
    pub totalRequests: u64,
    pub cacheHitRate: f64,
    pub dailyBreakdown: Vec<DailyBreakdown>,
    pub hourlyBreakdown: Vec<HourlyBreakdown>,
    pub requestLog: Vec<RequestLogEntry>,
    pub providerStats: Vec<ProviderStat>,
    pub modelStats: Vec<ModelStat>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DailyBreakdown {
    pub date: String,
    pub input: u64,
    pub output: u64,
    pub cacheRead: u64,
    pub cacheWrite: u64,
    pub cost: f64,
    pub requests: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct HourlyBreakdown {
    pub hour: String,
    pub input: u64,
    pub output: u64,
    pub cacheRead: u64,
    pub cacheWrite: u64,
    pub cost: f64,
    pub requests: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct RequestLogEntry {
    pub timestamp: String,
    pub providerId: String,
    pub modelId: String,
    pub input: u64,
    pub output: u64,
    pub cost: f64,
    pub requests: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProviderStat {
    pub providerId: String,
    pub totalTokens: u64,
    pub totalInput: u64,
    pub totalOutput: u64,
    pub totalCost: f64,
    pub totalRequests: u64,
    pub modelCount: usize,
}

#[derive(Debug, Serialize, Clone)]
pub struct ModelStat {
    pub modelId: String,
    pub providerId: String,
    pub totalTokens: u64,
    pub totalInput: u64,
    pub totalOutput: u64,
    pub totalCost: f64,
    pub totalRequests: u64,
}

// ─── Memory Types ───────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct MemoryFile {
    pub name: String,
    pub filename: String,
    pub content: String,
    pub updatedAt: String,
}

// ─── Session Types ──────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct DetailedSessionEntry {
    pub id: String,
    pub fileName: String,
    pub filePath: String,
    pub timestamp: String,
    pub lastActive: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub messageCount: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectGroup {
    pub projectPath: String,
    pub projectName: String,
    pub sessions: Vec<DetailedSessionEntry>,
    pub totalSessions: usize,
    pub lastActive: String,
}

// ─── Session File Parsing ──────────────────────────────────

fn get_session_dirs() -> Vec<PathBuf> {
    let sessions_dir = pi_agent_dir().join("sessions");
    if !sessions_dir.exists() {
        return vec![];
    }
    fs::read_dir(&sessions_dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.is_dir() && p.file_name().and_then(|n| n.to_str()).map_or(false, |n| n.starts_with("--")))
                .collect()
        })
        .unwrap_or_default()
}

fn decode_project_name(dir_name: &str) -> (String, String) {
    let decoded = dir_name
        .trim_start_matches("--")
        .trim_end_matches("--")
        .replace("--", "/");
    let home = std::env::var("HOME").unwrap_or_default();
    let display_name = if decoded.starts_with(&home) {
        format!("~{}", decoded.trim_start_matches(&home))
    } else {
        decoded.clone()
    };
    let segments: Vec<&str> = display_name.split('/').filter(|s| !s.is_empty()).collect();
    let project_name = segments.last().map(|s| s.to_string()).unwrap_or_else(|| dir_name.to_string());
    (decoded, project_name)
}

fn parse_usage_from_file(file_path: &Path) -> Vec<UsageRecord> {
    let mut records = Vec::new();
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(_) => return records,
    };

    let mut current_provider = "unknown".to_string();
    let mut current_model = "unknown".to_string();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let obj: serde_json::Value = match serde_json::from_str(trimmed) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let entry_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");

        if entry_type == "model_change" {
            if let Some(p) = obj.get("provider").and_then(|v| v.as_str()) {
                current_provider = p.to_string();
            }
            if let Some(m) = obj.get("modelId").and_then(|v| v.as_str()) {
                current_model = m.to_string();
            }
            continue;
        }

        if entry_type == "message" {
            let msg = match obj.get("message") {
                Some(m) => m,
                None => continue,
            };
            if msg.get("role").and_then(|r| r.as_str()) != Some("assistant") {
                continue;
            }
            let usage = match msg.get("usage") {
                Some(u) => u,
                None => continue,
            };
            if usage.get("input").and_then(|i| i.as_u64()).unwrap_or(0) == 0 {
                continue;
            }

            let timestamp = obj
                .get("timestamp")
                .or_else(|| msg.get("timestamp"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            let d = parse_timestamp(timestamp);
            let date = format!(
                "{:04}-{:02}-{:02}",
                d.year, d.month, d.day
            );
            let hour = d.hour;

            records.push(UsageRecord {
                date,
                hour: Some(hour),
                providerId: msg.get("provider").and_then(|v| v.as_str()).unwrap_or(&current_provider).to_string(),
                modelId: msg.get("model").and_then(|v| v.as_str()).unwrap_or(&current_model).to_string(),
                inputTokens: usage.get("input").and_then(|v| v.as_u64()).unwrap_or(0),
                outputTokens: usage.get("output").and_then(|v| v.as_u64()).unwrap_or(0),
                cacheReadTokens: usage.get("cacheRead").and_then(|v| v.as_u64()).unwrap_or(0),
                cacheWriteTokens: usage.get("cacheWrite").and_then(|v| v.as_u64()).unwrap_or(0),
                requests: 1,
                cost: usage.get("cost")
                    .and_then(|c| c.get("total"))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0),
            });
        }
    }

    records
}

struct ParsedTimestamp {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
}

fn parse_timestamp(ts: &str) -> ParsedTimestamp {
    // Try ISO format: "2024-01-15T10:30:00Z" or "2024-01-15T10:30:00.000Z"
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts) {
        return ParsedTimestamp {
            year: dt.year(),
            month: dt.month(),
            day: dt.day(),
            hour: dt.hour(),
        };
    }
    // Try other formats
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%.fZ") {
        return ParsedTimestamp {
            year: dt.year(),
            month: dt.month(),
            day: dt.day(),
            hour: dt.hour(),
        };
    }
    // Fallback: try to extract date parts
    let y = ts.get(0..4).and_then(|s| s.parse().ok()).unwrap_or(2024);
    let m = ts.get(5..7).and_then(|s| s.parse().ok()).unwrap_or(1);
    let d = ts.get(8..10).and_then(|s| s.parse().ok()).unwrap_or(1);
    let h = ts.get(11..13).and_then(|s| s.parse().ok()).unwrap_or(0);
    ParsedTimestamp { year: y, month: m, day: d, hour: h }
}

// ─── Tauri Commands: Usage ─────────────────────────────────

#[tauri::command]
pub fn pi_read_all_usage() -> Result<Vec<UsageRecord>, String> {
    let mut all_records = Vec::new();
    let dirs = get_session_dirs();

    for dir in &dirs {
        let files = match fs::read_dir(dir) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
                .collect::<Vec<_>>(),
            Err(_) => continue,
        };

        for file_path in &files {
            let records = parse_usage_from_file(file_path);
            all_records.extend(records);
        }
    }

    all_records.sort_by(|a, b| a.date.cmp(&b.date));
    Ok(all_records)
}

#[tauri::command]
pub fn pi_get_usage_by_range(from_date: String, to_date: String) -> Result<UsageRangeData, String> {
    let all_records = pi_read_all_usage()?;
    let filtered: Vec<&UsageRecord> = all_records
        .iter()
        .filter(|r| r.date >= from_date && r.date <= to_date)
        .collect();

    let mut total_input = 0u64;
    let mut total_output = 0u64;
    let mut total_cache_read = 0u64;
    let mut total_cache_write = 0u64;
    let mut total_cost = 0.0;
    let mut total_requests = 0u64;

    for r in &filtered {
        total_input += r.inputTokens;
        total_output += r.outputTokens;
        total_cache_read += r.cacheReadTokens;
        total_cache_write += r.cacheWriteTokens;
        total_cost += r.cost;
        total_requests += r.requests;
    }

    let total_tokens = total_input + total_output + total_cache_read + total_cache_write;
    let cache_hit_rate = if total_tokens > 0 {
        ((total_cache_read + total_cache_write) as f64 / total_tokens as f64) * 100.0
    } else {
        0.0
    };

    // Daily breakdown
    let mut daily_map: HashMap<String, DailyBreakdown> = HashMap::new();
    for r in &filtered {
        let entry = daily_map.entry(r.date.clone()).or_insert(DailyBreakdown {
            date: r.date.clone(),
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            cost: 0.0,
            requests: 0,
        });
        entry.input += r.inputTokens;
        entry.output += r.outputTokens;
        entry.cacheRead += r.cacheReadTokens;
        entry.cacheWrite += r.cacheWriteTokens;
        entry.cost += r.cost;
        entry.requests += r.requests;
    }
    let mut daily_breakdown: Vec<DailyBreakdown> = daily_map.into_values().collect();
    daily_breakdown.sort_by(|a, b| a.date.cmp(&b.date));

    // Hourly breakdown
    let mut hourly_map: HashMap<String, HourlyBreakdown> = HashMap::new();
    for r in &filtered {
        if let Some(hour) = r.hour {
            let h_key = format!("{} {:02}:00", r.date, hour);
            let entry = hourly_map.entry(h_key.clone()).or_insert(HourlyBreakdown {
                hour: h_key,
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                cost: 0.0,
                requests: 0,
            });
            entry.input += r.inputTokens;
            entry.output += r.outputTokens;
            entry.cacheRead += r.cacheReadTokens;
            entry.cacheWrite += r.cacheWriteTokens;
            entry.cost += r.cost;
            entry.requests += r.requests;
        }
    }
    let mut hourly_breakdown: Vec<HourlyBreakdown> = hourly_map.into_values().collect();
    hourly_breakdown.sort_by(|a, b| a.hour.cmp(&b.hour));

    // Request log
    let mut request_log_map: HashMap<String, RequestLogEntry> = HashMap::new();
    for r in &filtered {
        let key = format!("{}|{}|{}", r.date, r.providerId, r.modelId);
        let entry = request_log_map.entry(key).or_insert(RequestLogEntry {
            timestamp: r.date.clone(),
            providerId: r.providerId.clone(),
            modelId: r.modelId.clone(),
            input: 0,
            output: 0,
            cost: 0.0,
            requests: 0,
        });
        entry.input += r.inputTokens;
        entry.output += r.outputTokens;
        entry.cost += r.cost;
        entry.requests += r.requests;
    }
    let mut request_log: Vec<RequestLogEntry> = request_log_map.into_values().collect();
    request_log.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Provider stats
    let mut provider_map: HashMap<String, ProviderStatBuilder> = HashMap::new();
    for r in &filtered {
        let entry = provider_map.entry(r.providerId.clone()).or_insert(ProviderStatBuilder {
            providerId: r.providerId.clone(),
            totalTokens: 0,
            totalInput: 0,
            totalOutput: 0,
            totalCost: 0.0,
            totalRequests: 0,
            models: std::collections::HashSet::new(),
        });
        entry.totalTokens += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
        entry.totalInput += r.inputTokens;
        entry.totalOutput += r.outputTokens;
        entry.totalCost += r.cost;
        entry.totalRequests += r.requests;
        entry.models.insert(r.modelId.clone());
    }
    let mut provider_stats: Vec<ProviderStat> = provider_map.into_values().map(|b| ProviderStat {
        providerId: b.providerId,
        totalTokens: b.totalTokens,
        totalInput: b.totalInput,
        totalOutput: b.totalOutput,
        totalCost: b.totalCost,
        totalRequests: b.totalRequests,
        modelCount: b.models.len(),
    }).collect();
    provider_stats.sort_by(|a, b| b.totalCost.partial_cmp(&a.totalCost).unwrap_or(std::cmp::Ordering::Equal));

    // Model stats
    let mut model_map: HashMap<String, ModelStat> = HashMap::new();
    for r in &filtered {
        let key = format!("{}/{}", r.providerId, r.modelId);
        let entry = model_map.entry(key).or_insert(ModelStat {
            modelId: r.modelId.clone(),
            providerId: r.providerId.clone(),
            totalTokens: 0,
            totalInput: 0,
            totalOutput: 0,
            totalCost: 0.0,
            totalRequests: 0,
        });
        entry.totalTokens += r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
        entry.totalInput += r.inputTokens;
        entry.totalOutput += r.outputTokens;
        entry.totalCost += r.cost;
        entry.totalRequests += r.requests;
    }
    let mut model_stats: Vec<ModelStat> = model_map.into_values().collect();
    model_stats.sort_by(|a, b| b.totalCost.partial_cmp(&a.totalCost).unwrap_or(std::cmp::Ordering::Equal));

    Ok(UsageRangeData {
        totalTokens: total_tokens,
        totalInput: total_input,
        totalOutput: total_output,
        totalCacheRead: total_cache_read,
        totalCacheWrite: total_cache_write,
        totalCost: total_cost,
        totalRequests: total_requests,
        cacheHitRate: (cache_hit_rate * 10.0).round() / 10.0,
        dailyBreakdown: daily_breakdown,
        hourlyBreakdown: hourly_breakdown,
        requestLog: request_log.into_iter().take(100).collect(),
        providerStats: provider_stats,
        modelStats: model_stats,
    })
}

struct ProviderStatBuilder {
    providerId: String,
    totalTokens: u64,
    totalInput: u64,
    totalOutput: u64,
    totalCost: f64,
    totalRequests: u64,
    models: std::collections::HashSet<String>,
}

// ─── Tauri Command: Memory ──────────────────────────────────

#[tauri::command]
pub fn pi_read_memory_files() -> Result<Vec<MemoryFile>, String> {
    let memory_dir = pi_agent_dir().join("pi-hermes-memory");
    let files = vec![
        ("Project Memories", "MEMORY.md"),
        ("User Profile", "USER.md"),
        ("Failure Records", "failures.md"),
    ];

    let mut result = Vec::new();
    for (name, filename) in files {
        let file_path = memory_dir.join(filename);
        let content = if file_path.exists() {
            fs::read_to_string(&file_path).unwrap_or_else(|_| String::new())
        } else {
            String::new()
        };
        let updated_at = if file_path.exists() {
            fs::metadata(&file_path)
                .and_then(|m| m.modified())
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                })
                .unwrap_or_default()
        } else {
            String::new()
        };
        result.push(MemoryFile {
            name: name.to_string(),
            filename: filename.to_string(),
            content,
            updatedAt: updated_at,
        });
    }
    Ok(result)
}

// ─── Tauri Command: Session Listing ─────────────────────────

#[tauri::command]
pub fn pi_list_sessions_detailed() -> Result<Vec<ProjectGroup>, String> {
    let dirs = get_session_dirs();
    let mut groups: HashMap<String, ProjectGroup> = HashMap::new();

    for dir in &dirs {
        let dir_name = dir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let (project_path, project_name) = decode_project_name(&dir_name);

        let group = groups.entry(project_path.clone()).or_insert(ProjectGroup {
            projectPath: project_path.clone(),
            projectName: project_name.clone(),
            sessions: Vec::new(),
            totalSessions: 0,
            lastActive: String::new(),
        });

        let mut files: Vec<_> = match fs::read_dir(dir) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
                .collect(),
            Err(_) => continue,
        };
        files.sort();
        files.reverse();

        for file_path in &files {
            if let Some(session) = parse_session_file_info(file_path) {
                group.sessions.push(session);
            }
        }

        group.totalSessions = group.sessions.len();
        if let Some(first) = group.sessions.first() {
            group.lastActive = first.lastActive.clone();
        }
    }

    let mut result: Vec<ProjectGroup> = groups.into_values()
        .filter(|g| g.totalSessions > 0)
        .collect();
    result.sort_by(|a, b| b.lastActive.cmp(&a.lastActive));
    Ok(result)
}

fn parse_session_file_info(file_path: &Path) -> Option<DetailedSessionEntry> {
    let content = fs::read_to_string(file_path).ok()?;
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();

    let mut id = String::new();
    let mut timestamp = String::new();
    let mut name: Option<String> = None;
    let mut provider: Option<String> = None;
    let mut model: Option<String> = None;
    let mut message_count = 0u64;
    let mut first_ts: i64 = 0;
    let mut last_ts: i64 = 0;

    for line in &lines {
        let obj: serde_json::Value = serde_json::from_str(line).ok()?;
        let entry_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");

        match entry_type {
            "session" => {
                id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                timestamp = obj.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if let Ok(ts) = parse_epoch_ms(&timestamp) {
                    first_ts = ts;
                    last_ts = ts;
                }
            }
            "session_info" => {
                name = obj.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
            "model_change" => {
                provider = obj.get("provider").and_then(|v| v.as_str()).map(|s| s.to_string());
                model = obj.get("modelId").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
            "message" => {
                message_count += 1;
                if let Some(ts) = obj.get("timestamp").and_then(|v| v.as_str()) {
                    if let Ok(ms) = parse_epoch_ms(ts) {
                        if ms > last_ts { last_ts = ms; }
                        if first_ts == 0 { first_ts = ms; }
                    }
                }
            }
            _ => {}
        }
    }

    let duration = if last_ts > first_ts { Some((last_ts - first_ts) as u64) } else { None };
    let file_name = file_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    let last_active = if last_ts > 0 {
        let secs = last_ts / 1000;
        let nanos = ((last_ts % 1000) * 1_000_000) as u32;
        if let Some(dt) = chrono::DateTime::from_timestamp(secs, nanos) {
            dt.to_rfc3339()
        } else {
            timestamp.clone()
        }
    } else {
        timestamp.clone()
    };

    Some(DetailedSessionEntry {
        id,
        fileName: file_name.clone(),
        filePath: file_path.to_string_lossy().to_string(),
        timestamp,
        lastActive: last_active,
        name,
        provider,
        model,
        messageCount: message_count,
        duration,
    })
}

fn parse_epoch_ms(ts: &str) -> Result<i64, ()> {
    // Try ISO format
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts) {
        return Ok(dt.timestamp_millis());
    }
    // Try naive datetime
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S%.fZ") {
        return Ok(dt.and_utc().timestamp_millis());
    }
    // Try epoch millis
    if let Ok(ms) = ts.parse::<i64>() {
        return Ok(ms);
    }
    Err(())
}

// ─── Trash / Recycle Bin ────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct TrashEntry {
    pub originalPath: String,
    pub trashPath: String,
    pub fileName: String,
    pub trashedAt: String,
    pub sessionId: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sessionName: Option<String>,
    pub lastActive: String,
    pub messageCount: u64,
}

fn trash_dir() -> PathBuf {
    let dir = pi_agent_dir().join(".trash");
    fs::create_dir_all(&dir).ok();
    dir
}

/// Move a session file to the trash directory, keeping the original path info as a marker file.
fn move_to_trash(file_path: &Path) -> Result<(), String> {
    // Validate: must be a .jsonl file in sessions directory
    let sessions_dir = pi_agent_dir().join("sessions");
    if !file_path.starts_with(&sessions_dir) {
        return Err("Invalid path: must be within sessions directory".to_string());
    }
    if file_path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
        return Err("Invalid file type: must be .jsonl".to_string());
    }
    if !file_path.exists() {
        return Err("File not found".to_string());
    }

    // Read the original content to extract session info for the marker
    let content = fs::read_to_string(file_path).unwrap_or_default();
    let first_line = content.lines().next().and_then(|l| serde_json::from_str::<serde_json::Value>(l).ok());

    // Compute relative path from sessions dir
    let rel_path = file_path.strip_prefix(&sessions_dir).map_err(|_| "Failed to compute relative path".to_string())?;
    let trash_path = trash_dir().join(rel_path);
    if let Some(parent) = trash_path.parent() {
        fs::create_dir_all(parent).ok();
    }

    // Move the file
    fs::rename(file_path, &trash_path).map_err(|e| format!("Failed to move to trash: {}", e))
}

/// Parse a trashed session file and return its info
fn parse_trash_entry(trash_path: &Path) -> Option<TrashEntry> {
    let content = fs::read_to_string(trash_path).ok()?;
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();

    let mut id = String::new();
    let mut name: Option<String> = None;
    let mut last_active = String::new();
    let mut message_count = 0u64;
    let mut last_ts: i64 = 0;

    for line in &lines {
        let obj: serde_json::Value = serde_json::from_str(line).ok()?;
        let entry_type = obj.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match entry_type {
            "session" => {
                id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                last_active = obj.get("timestamp").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if let Ok(ts) = parse_epoch_ms(&last_active) { last_ts = ts; }
            }
            "session_info" => {
                name = obj.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
            "message" => {
                message_count += 1;
                if let Some(ts) = obj.get("timestamp").and_then(|v| v.as_str()) {
                    if let Ok(ms) = parse_epoch_ms(ts) { if ms > last_ts { last_ts = ms; } }
                }
            }
            _ => {}
        }
    }

    let file_name = trash_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    let last_active_iso = if last_ts > 0 {
        let secs = last_ts / 1000;
        let nanos = ((last_ts % 1000) * 1_000_000) as u32;
        chrono::DateTime::from_timestamp(secs, nanos).map(|dt| dt.to_rfc3339()).unwrap_or_default()
    } else {
        String::new()
    };

    // Get trashedAt from file metadata
    let trashed_at = fs::metadata(trash_path).ok()
        .and_then(|m| m.modified().ok())
        .map(|t| { let dt: chrono::DateTime<chrono::Utc> = t.into(); dt.to_rfc3339() })
        .unwrap_or_default();

    // Get original path from the relative path structure
    let sessions_dir = pi_agent_dir().join("sessions");
    let original_path = sessions_dir.join(trash_path.strip_prefix(&trash_dir()).ok()?);

    Some(TrashEntry {
        originalPath: original_path.to_string_lossy().to_string(),
        trashPath: trash_path.to_string_lossy().to_string(),
        fileName: file_name,
        trashedAt: trashed_at,
        sessionId: id,
        sessionName: name,
        lastActive: last_active_iso,
        messageCount: message_count,
    })
}

/// Move a session to trash (replaces old permanent delete)
#[tauri::command]
pub fn pi_delete_session(path: String) -> Result<bool, String> {
    move_to_trash(Path::new(&path)).map(|_| true)
}

/// List trash contents
#[tauri::command]
pub fn pi_list_trash() -> Result<Vec<TrashEntry>, String> {
    let trash = trash_dir();
    let mut entries = Vec::new();

    // Recursively scan trash directory
    fn scan_trash_dir(dir: &Path, entries: &mut Vec<TrashEntry>) {
        if let Ok(reader) = fs::read_dir(dir) {
            for entry in reader.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    scan_trash_dir(&path, entries);
                } else if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                    if let Some(info) = parse_trash_entry(&path) {
                        entries.push(info);
                    }
                }
            }
        }
    }

    scan_trash_dir(&trash, &mut entries);
    entries.sort_by(|a, b| b.trashedAt.cmp(&a.trashedAt));
    Ok(entries)
}

/// Restore a session from trash to its original location
#[tauri::command]
pub fn pi_restore_from_trash(trash_path: String) -> Result<bool, String> {
    let trash = trash_dir();
    let path = Path::new(&trash_path);

    // Security: must be within trash directory
    if !path.starts_with(&trash) {
        return Err("Invalid path: must be within trash directory".to_string());
    }
    if !path.exists() {
        return Err("Trash file not found".to_string());
    }

    // Compute original path: sessions_dir + relative path within trash
    let sessions_dir = pi_agent_dir().join("sessions");
    let rel = path.strip_prefix(&trash).map_err(|_| "Invalid trash path".to_string())?;
    let original = sessions_dir.join(rel);

    if let Some(parent) = original.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::rename(path, &original).map_err(|e| format!("Failed to restore: {}", e))?;
    Ok(true)
}

/// Permanently delete a session from trash
#[tauri::command]
pub fn pi_permanently_delete(trash_path: String) -> Result<bool, String> {
    let trash = trash_dir();
    let path = Path::new(&trash_path);

    if !path.starts_with(&trash) {
        return Err("Invalid path: must be within trash directory".to_string());
    }
    if !path.exists() {
        return Err("Trash file not found".to_string());
    }

    fs::remove_file(path).map_err(|e| format!("Failed to delete: {}", e))?;
    Ok(true)
}

/// Auto-cleanup: move sessions older than 7 days to trash, purge trash older than 15 days
#[tauri::command]
pub fn pi_auto_cleanup() -> Result<serde_json::Value, String> {
    let now = chrono::Utc::now();
    let mut trashed_count = 0u64;
    let mut purged_count = 0u64;

    // Phase 1: Move sessions older than 7 days to trash
    let dirs = get_session_dirs();
    for dir in &dirs {
        let files: Vec<_> = match fs::read_dir(dir) {
            Ok(entries) => entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
                .collect(),
            Err(_) => continue,
        };

        for file_path in &files {
            // Check if session is older than 7 days
            let content = match fs::read_to_string(file_path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let first_line = content.lines().next()
                .and_then(|l| serde_json::from_str::<serde_json::Value>(l).ok());
            let ts = first_line
                .and_then(|v| v.get("timestamp").and_then(|t| t.as_str()).map(|s| s.to_string()))
                .unwrap_or_default();
            let parsed = parse_epoch_ms(&ts).unwrap_or(0);
            if parsed == 0 { continue; }

            let session_time = chrono::DateTime::from_timestamp_millis(parsed)
                .unwrap_or(now);
            let days_old = (now - session_time).num_days();

            if days_old >= 7 {
                if move_to_trash(file_path).is_ok() {
                    trashed_count += 1;
                }
            }
        }
    }

    // Phase 2: Purge trash items older than 15 days
    let trash = trash_dir();
    fn purge_old_trash(dir: &Path, now: &chrono::DateTime<chrono::Utc>, count: &mut u64) {
        if let Ok(reader) = fs::read_dir(dir) {
            for entry in reader.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    purge_old_trash(&path, now, count);
                } else if let Ok(meta) = fs::metadata(&path) {
                    if let Ok(modified) = meta.modified() {
                        let dt: chrono::DateTime<chrono::Utc> = modified.into();
                        let days_old = (*now - dt).num_days();
                        if days_old >= 15 {
                            let _ = fs::remove_file(&path);
                            *count += 1;
                        }
                    }
                }
            }
        }
    }
    purge_old_trash(&trash, &now, &mut purged_count);

    Ok(serde_json::json!({
        "trashed": trashed_count,
        "purged": purged_count,
    }))
}

// ─── Modify pi_list_sessions_detailed to auto-cleanup ─────

// Note: The existing pi_list_sessions_detailed function is left unchanged.
// Auto-cleanup happens when the frontend calls pi_auto_cleanup() on page load.
// The frontend will call pi_auto_cleanup() before listing sessions.