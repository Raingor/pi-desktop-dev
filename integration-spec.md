# Pi-Agent Desktop — Integration Specification

> **Status:** Draft v1 — frozen before Milestone 1 implementation.
> **Companion to:** `plan.md` (which this spec supersedes where they conflict).
> **Source authority:** https://pi.dev/docs/latest (RPC, SDK, JSON, session-format, settings, providers, security).

---

## 0. Fundamental Position Correction

`plan.md` originally assumed Pi-Agent is a **cloud-hosted conversational AI** with a public REST + WebSocket API and an OAuth2 login server for third-party clients. **That assumption is wrong.**

Pi (`pi.dev`) is a **local agent harness** — a coding-agent framework analogous to Claude Code / Aider. It has no public HTTP/WebSocket cloud API. Integration surfaces are entirely local:

| Surface | Use case | Our choice |
|---|---|---|
| **SDK** (Node.js embedding) | Embed Pi inside a Node app | ✗ — we are a Tauri (Rust) app, would require a sidecar Node runtime |
| **RPC mode** (stdin/stdout JSONL) | External process integration | ✅ **Primary** — spawn `pi --mode rpc` as a child process |
| **JSON event stream** (`pi --mode json "prompt"`) | One-shot batch runs | ✗ — single-prompt only, no interactive prompt follow-up |
| **TUI components** | Build custom terminal UIs | ✗ — we are a native GUI, not terminal |

**Conclusion:** The desktop app is a **GUI shell around a locally spawned `pi --mode rpc` child process.** All "cloud" features in the original plan are in fact Pi's own provider layer (OpenAI / Anthropic / llama.cpp / etc.), and credential management belongs to Pi, not to us.

This changes several plan.md sections; the deltas are listed in §9 below.

---

## 1. Process Model

### 1.1 Topology

```
+----------------------------------------------------------+
|  Tauri App (main process, Rust)                          |
|                                                          |
|  +-----------------------+      Tauri IPC (commands)      |
|  | Frontend (React)     | <-------------------------+    |
|  +-----------------------+                            |    |
|                                                         |
|  +-----------------------------------------------------+
|  | PiBridge (Rust module in main process)              |
|  |                                                     |
|  |  - spawns & supervises `pi --mode rpc`             |
|  |  - writes JSONL commands to child stdin            |
|  |  - reads JSONL responses/events from child stdout  |
|  |  - forwards events to frontend via Tauri events    |
|  |  - request/response correlation via `id`           |
|  +-----------------------------------------------------+
|            |  spawn                ^  events/responses
|            v                       |
|  +-----------------------------------------------------+
|  | `pi --mode rpc` child process (Node.js)             |
|  |  - owns session JSONL files on disk                |
|  |  - owns auth.json / models.json                     |
|  |  - talks to upstream LLM providers (HTTP/WS)       |
|  +-----------------------------------------------------+
+----------------------------------------------------------+
```

### 1.2 Pi process lifecycle

- **Spawn on app launch**, not lazily — the first user interaction must be instant.
- **One long-lived child process** for the lifetime of the app session. Multiple windows share the same process (Pi handles its own session switching internally via `switch_session` / `new_session` RPC commands).
- **Restart policy:**
  - On unexpected child exit → restart automatically, attempt `switch_session` to the last active session file (captured from `get_state` before crash).
  - If restart fails 3× within 60s → surface a fatal error dialog, disable chat input, keep UI alive so user can copy unsaved input.
- **Shutdown:** On app quit, send `dispose`-equivalent (TBD — see §2.4 open question), then SIGTERM, wait 2s, SIGKILL.

### 1.3 Trust & cwd

Pi's project trust system (`~/.pi/agent/trust.json`) gates loading of `.pi/` resources per directory. For RPC mode there is **no interactive trust prompt**; the docs state non-interactive modes default to `ask`→ignore or `always`→trust per `defaultProjectTrust` setting.

**Decision:** Always launch Pi with `--approve` (=`-a`) flag set by default, and surface a one-time "Trust this project?" OS-level dialog on first cwd selection, persisting our own trust table in app settings. Rationale: Pi's own trust prompt is TUI-only and silent in RPC mode; we must own the UX.

### 1.4 Pi binary discovery

Search order at startup:
1. Bundled binary shipped inside the Tauri app resources (`$RESOURCE_DIR/bin/pi`). **Bundling strategy TBD** — see §8.
2. `PI_BINARY` env var.
3. PATH lookup (`which pi` / `where pi`).

The chosen path is exposed to frontend via `pi:binaryInfo` query. If none found and no bundle, app shows "Install Pi" onboarding screen (link to https://pi.dev/docs/latest/quickstart).

---

## 2. RPC Contract

All communication is **JSONL over the child's stdin/stdout**, LF-delimited. stderr is captured for logging only (not parsed).

### 2.1 Wire rules (from Pi docs)

- Records split on `\n` only; strip optional trailing `\r`.
- Do NOT use Node `readline` semantics (it splits on U+2028/U+2029 too).
- Every **command** may carry an `id` (string). The matching **response** echoes the same `id`. **Events** never carry `id`.
- Response shape: `{"id","type":"response","command","success":bool,"data"?,"error"?}`.
- `success:false` means rejected-before-acceptance. Post-acceptance failures surface as events (e.g. `auto_retry_end` with `success:false`).

### 2.2 Command catalog (subset we use)

Full command list lives in Pi docs; the desktop app needs only the following. Naming is **fixed** — do not rename in our IPC layer.

| Command | Purpose | When we call it |
|---|---|---|
| `get_state` | Get current session/model/streaming state | On Pi boot, on every session switch, on every `agent_end` |
| `get_messages` | Full message list | On session switch (to render history) |
| `get_entries` (`since`) | Incremental entry fetch | On reconnect after crash (delta sync) |
| `prompt` | Send a user message | User hits Enter |
| `steer` | Mid-turn steering | User types while streaming, picks "steer" |
| `follow_up` | Queue after turn ends | User types while streaming, picks "follow-up" |
| `abort` | Cancel current turn | User clicks Stop |
| `new_session` | Start fresh | "New Chat" button |
| `switch_session` (`sessionPath`) | Load existing | User picks from history |
| `fork` (`entryId`) | Branch from a past user msg | Right-click → "Fork from here" |
| `clone` | Duplicate current branch | Menu action |
| `get_fork_messages` | List forkable user messages | Before showing fork UI |
| `set_model` (`provider`,`modelId`) | Switch model | Settings → Model dropdown |
| `cycle_model` | Next model in `enabledModels` | `Ctrl+P` shortcut |
| `get_available_models` | Populate dropdown | On Settings open, after auth change |
| `set_thinking_level` | Set reasoning depth | Settings dropdown |
| `cycle_thinking_level` | Toggle | `Ctrl+Shift+T` |
| `get_available_thinking_levels` | Populate dropdown | On model change |
| `set_steering_mode` / `set_follow_up_mode` | Queue modes | Settings (advanced) |
| `compact` | Manual compaction | Menu → "Compact context" |
| `set_auto_compaction` | Toggle | Settings |
| `set_auto_retry` | Toggle | Settings |
| `abort_retry` | Cancel retry mid-backoff | Retry banner "Cancel" button |
| `bash` (`command`) | Run shell, inject into context | Optional "Run command" input |
| `abort_bash` | Cancel running bash | Stop button in bash panel |
| `get_session_stats` | Token/cost/context-window usage | Sidebar footer, refreshed on `turn_end` |
| `export_html` (`outputPath`?) | Save transcript | Menu → Export → HTML |

### 2.3 Event catalog

Events stream asynchronously from Pi's stdout, interleaved with responses. Our `PiBridge` must demux: lines with `type:"response"` go to the pending-command waiter; everything else is an event forwarded to the frontend via `pi:event` Tauri event.

| Event | Frontend use |
|---|---|
| `session` (header) | Confirm boot; capture `id`/`cwd` |
| `agent_start` | Show "thinking" indicator |
| `turn_start` | Begin a turn bubble |
| `message_start` (`message`) | Open assistant message bubble |
| `message_update` (`assistantMessageEvent`) | Stream deltas; `text_delta` → append, others → tool/though indicators |
| `message_end` (`message`) | Finalize bubble (commit markdown) |
| `turn_end` (`message`,`toolResults`) | Render tool-result blocks |
| `agent_end` (`messages`) | Stop "thinking"; refresh `get_session_stats` |
| `tool_execution_start` / `update` / `end` | Tool-call card with streaming partial output |
| `queue_update` (`steering`,`followUp`) | Show pending-queue chip count |
| `compaction_start` / `end` | Compaction banner; on `end` refresh stats |
| `auto_retry_start` / `end` | Retry banner with countdown |

**Unions:** Per Pi's TypeScript types, `AgentSessionEvent = AgentEvent ∪ queue_update ∪ compaction_* ∪ auto_retry_*`. Our Rust deserializer must use an untagged enum keyed on `type`.

### 2.4 Open questions for upstream

- Is there a `dispose`/`shutdown` command, or is SIGTERM the only clean exit? → Need to re-scan RPC docs / source. **Fallback:** SIGTERM after a no-op flush.
- Does `get_entries` since cursor return success:false or empty+`leafId` when `since` not found? → docs were truncated. Assume empty list + `leafId:null`.

---

## 3. Data Model

### 3.1 What we do NOT store

- **Chat messages**: Pi already persists them in `~/.pi/agent/sessions/...` as JSONL. We **read through Pi** via `get_messages` / `get_entries`. Duplicating them in our own SQLite would create sync bugs.
- **LLM credentials**: Pi owns `~/.pi/agent/auth.json`. We never touch it directly.
- **Pi settings**: Pi owns `~/.pi/agent/settings.json` and `.pi/settings.json`. We do not write them; we read via SDK-exposed commands or by parsing the file for display-only Settings UI.

### 3.2 What we DO store (app-local SQLite)

Database: `app_data/pi-desktop.db` (path resolved via Tauri's `app_data_dir`).

| Table | Purpose |
|---|---|
| `app_settings` (key, value JSON) | Theme, font_size, window_geometry, trusted_cwds[], last_session_path, telemetry_opt_in |
| `window_state` (id, x, y, w, h, is_maximized) | Restore window per-session |
| `pi_runtime_cache` (key, value) | Last-known `get_state` snapshot per Pi process (for crash recovery) |
| `command_log` (id, ts, command, params, success, error) | Debug log of RPC commands; ring buffer (rotate >5000 rows) |

**No chat-history table.** Export/Import feature (plan §3) operates on Pi's session files directly — see §5.

### 3.3 Session file discovery

For the history sidebar we list sessions via the SDK's `SessionManager.list(cwd)` / `listAll()`. Two options:

- **Option A (recommended):** Bundle the Pi SDK Node module and run a tiny Node sidecar (`pi-list-sessions`) over RPC. Heavyweight.
- **Option B:** Read `~/.pi/agent/sessions/--<cwd-slug>--/*.jsonl` directly in Rust, parsing only the first line (SessionHeader) for display (id, timestamp, cwd, parentSession). Cheap, decoupled. Adopted.

Pattern: `~/.pi/agent/sessions/--<cwd with "/" replaced by "-">--/<timestamp>_<uuid>.jsonl`.

---

## 4. IPC Contract (Tauri commands & events)

### 4.1 Commands (frontend → Rust)

All return `Result<T, String>`; errors are user-displayable strings.

| Command | Args | Returns |
|---|---|---|
| `pi:bootstrap` | — | `{binaryPath, piVersion, sessionId, cwd}` |
| `pi:prompt` | `{message, images?[]}` | `void` (events stream via `pi:event`) |
| `pi:steer` | `{message, images?[]}` | `void` |
| `pi:follow_up` | `{message, images?[]}` | `void` |
| `pi:abort` | — | `void` |
| `pi:new_session` | — | `{cancelled:bool}` |
| `pi:switch_session` | `{sessionPath}` | `{cancelled:bool}` |
| `pi:list_sessions` | `{cwd}` | `[{path, id, timestamp, cwd, parentSession?}]` |
| `pi:get_state` | — | `PiState` (passthrough of Pi's `data`) |
| `pi:get_messages` | — | `AgentMessage[]` |
| `pi:set_model` | `{provider, modelId}` | `Model` |
| `pi:cycle_model` | — | `{model, thinkingLevel, isScoped}` |
| `pi:get_available_models` | — | `Model[]` |
| `pi:set_thinking_level` | `{level}` | `void` |
| `pi:compact` | `{customInstructions?}` | `CompactionResult` |
| `pi:export_html` | `{outputPath?}` | `{path}` |
| `pi:get_session_stats` | — | `SessionStats` |
| `pi:get_fork_messages` | — | `[{entryId, text}]` |
| `pi:fork` | `{entryId}` | `{text, cancelled}` |
| `pi:clone` | — | `{cancelled}` |
| `app:get_settings` | — | `AppSettings` |
| `app:set_settings` | `{patch}` | `void` |
| `app:trust_cwd` | `{cwd, trusted:bool}` | `void` |

### 4.2 Events (Rust → frontend)

| Event | Payload |
|---|---|
| `pi:event` | raw `AgentSessionEvent` (passthrough) |
| `pi:process_died` | `{reason, restart_attempt}` |
| `pi:binary_missing` | `{searched:[]}` |

Frontend subscribes to `pi:event` once and dispatches by `event.type` to its Zustand store.

---

## 5. Export / Import

Pi already supports `export_html` RPC command — adopt it directly for HTML export.

For **Markdown / JSON export**, since Pi's session JSONL is a superset of our needs, we implement an in-app translator:

- **MD:** Walk `get_entries` results, render user/assistant/tool messages via our existing renderer (remark) — same code path used for clipboard "copy as markdown".
- **JSON:** Stream `get_entries` output to a file as-is (Pi's native format). This doubles as **backup**.

**Import** (plan §3 "import chat history") is redefined: it places a user-supplied `.jsonl` file into `~/.pi/agent/sessions/<cwd-slug>/` so Pi picks it up on `switch_session`. We do not parse the imported file ourselves.

---

## 6. Authentication & Provider Boundary

### 6.1 What we own

- Nothing about LLM credentials. **No keychain integration in our app.** (Removes plan §5 `keyring`/`keytar` row and plan §3 Authentication row from our scope.)
- Our app's only secret: telemetry opt-in token (§7).

### 6.2 What we surface

A **Provider Setup panel** that:
1. Calls `pi:get_available_models` → list of providers currently authenticated (per `auth.json`).
2. For unauthenticated providers, shows a button that:
   - For **subscription OAuth providers** (OpenAI Codex, Claude Pro/Max, Copilot, xAI subscription, Radius) → instructs user to run `pi` in a terminal once and run `/login <provider>`. We **cannot** do this OAuth flow ourselves (it requires Pi's interactive TUI redirect). Document this limitation clearly in-UI.
   - For **API-key providers** → show an input field. On submit, we **write to `auth.json`** via the SDK's `ModelRuntime.setRuntimeApiKey` — but since we are using RPC mode (no SDK in-process), we instead shell out to `pi --login <provider> --api-key <key>` if such a flag exists; otherwise we directly write the JSON file. **Open question:** does `pi --login` accept non-interactive key input? If no, we parse and patch `auth.json` ourselves (acceptable, since it's plain JSON).
3. Refreshes `get_available_models` after any change.

### 6.3 llama.cpp local provider

Per Pi docs, llama.cpp is a first-class provider: `pi /login llama.cpp` configures a router server. **There is no "offline fallback" feature to build** — once configured, the user simply picks the llama.cpp model from the dropdown the same way they'd pick Claude. This **removes plan §3 "Offline Mode" feature** and **plan Milestone 6** as originally scoped; what remains is "support the llama.cpp provider in the provider UI," which is a sub-item of §6.2.

---

## 7. Telemetry

- **Endpoint:** PostHog cloud (or self-hosted) — **open decision in plan §5**.
- **Opt-in:** Stored in `app_settings.telemetry_opt_in`, default false, prompted on first run.
- **Events:** app_launch, app_quit, prompt_sent (no message content), turn_completed (latency, token count from `get_session_stats`), crash (`pi:process_died`), provider_changed.
- **GDPR:** privacy policy linked in Settings; "Reset telemetry ID" button; "Export my data" generates anon ID + event log.

---

## 8. Bundling Pi

**Decision deferred to Milestone 0.5** (new milestone — see plan revision). Options:

| Option | Pros | Cons |
|---|---|---|
| **A. Don't bundle; require pre-installed `pi`** | Smallest installer, no version drift, respects user's existing setup | Worse first-run UX; requires install wizard |
| **B. Bundle `pi` binary in Tauri resources** | True one-click install | Pi is Node.js — we'd need to bundle Node runtime + npm package (~80MB); mac universal binary complexity; update coordination |
| **C. Bundle a stripped Pi sidecar (no TUI)** | Smaller than B, still one-click | Requires upstream cooperation or fork; maintenance burden |

**Recommendation:** A for v1.0 (with polished onboarding), revisit B for v1.1 if UX data shows drop-off. This **removes plan §5 "Packaging" universal-binary concerns for Pi itself** (we still produce universal Tauri binaries; we just don't ship Pi inside them).

---

## 9. plan.md Deltas (conflicts to resolve when revising)

The following plan.md sections must change to match this spec:

| plan.md section | Original | Corrected |
|---|---|---|
| §1 Overview | "client for Pi-Agent cloud" | "GUI shell around the local `pi --mode rpc` harness" |
| §3 Core Chat | "Real-time chat with Pi-Agent (cloud API)" | "Real-time chat via the locally spawned `pi --mode rpc` child process" |
| §3 Offline Mode | "Falls back to local model when offline; syncs pending when online" | **Removed.** Replaced by "Provider selection includes llama.cpp local provider" (sub-item of Settings) |
| §3 Authentication | "OAuth2 login to Pi-Agent cloud; OS keychain storage" | **Removed from app scope.** Provider setup routes through Pi's own `auth.json`; OAuth subscription login happens in a terminal `pi /login` session |
| §3 Settings | "API key management" | Removed; we display Pi's configured providers, not manage keys |
| §3 Export/Import | "Import chat history" | Refined: import = place `.jsonl` into Pi's session dir |
| §4 Architecture | API Client / Local Model Service / Credential Manager as separate services | Single `PiBridge` service; provider/auth concerns delegated to Pi |
| §5 Tech Stack row "Local LLM Backend" | "Critical for Mac: build llama.cpp for both arches" | **Removed** — llama.cpp is Pi's concern, not ours |
| §5 Tech Stack row "Authentication" | `oauth2-client` + `keyring`/`keytar` | **Removed** — no auth in our app |
| §5 Tech Stack row "Database" | "Better-sqlite3 for chat history & settings" | SQLite only for app_settings / window_state / command_log; **no chat history** (Pi owns it) |
| §6 Milestone 2 | "OAuth2 login flow" | Becomes "Provider discovery + API-key entry via `auth.json`; document terminal-based OAuth for subscription providers" |
| §6 Milestone 6 | "Integrate llama.cpp; build for both arches" | **Removed.** Folded into Milestone 2 |
| §6 Milestone 0 | — | **Add Milestone 0.5: Pi binary discovery & onboarding; Pi-bundling decision (§8)** |
| §7 Risks | "Keeping API keys secure (High)" | Removed; replaced by "Pi process crash recovery" (Medium) |
| §9 Appendix B | "(Unchanged)" stub | Either fill or delete |

---

## 10. Open Questions (need upstream confirmation)

1. **`pi --mode rpc` graceful shutdown:** is there a `dispose`/`shutdown` RPC command, or only SIGTERM? (§2.4)
2. **`get_entries` with unknown `since`:** exact response shape? (§2.4)
3. **Non-interactive provider login:** can `pi --login <provider> --api-key <key>` accept a key non-interactively, or must `auth.json` be patched directly? (§6.2)
4. **Pi binary distribution license:** may we redistribute the `pi` npm package inside our installer? (§8 Option B)
5. **Telemetry consent in RPC mode:** does `enableAnalytics` setting in `settings.json` cause Pi to emit its own analytics when run via RPC? If so, our app-level telemetry prompt also covers Pi's.
6. **`pi --version` machine-readable flag:** for onboarding version check.
