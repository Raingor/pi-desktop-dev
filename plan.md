# Pi-Agent Desktop Application – Project Plan

## 1. Project Overview
Develop a native desktop client for **Pi-Agent** (https://pi.dev/) that brings the Pi coding-agent experience to Windows, macOS, and Linux desktops with a native‑look‑and‑feel chat UI, deep OS integration, and a polished alternative to Pi's terminal TUI.

**Position correction (see `integration-spec.md` §0):** Pi is **not** a cloud-hosted conversational AI service — it is a **local agent harness** (analogous to Claude Code / Aider) with no public HTTP/WebSocket API and no OAuth2 server for third-party clients. The desktop app is therefore a **GUI shell around a locally spawned `pi --mode rpc` child process**, communicating over stdin/stdout JSONL. All chat history, LLM credentials, and Pi settings remain owned by Pi itself; the app does not duplicate or override them.

The client still provides a native chat interface, OS integration (system tray, notifications, file drag‑&‑drop), and the universal macOS binary story. It delegates LLM provider selection (cloud and local, including `llama.cpp`) to Pi's own provider layer, surfaced through our Settings UI. **Explicitly supports both Intel (x86_64) and Apple Silicon (arm64) Mac architectures via universal Tauri binaries.**

---

## 2. Goals & Non-Goals
### Goals
- Deliver a polished, native‑feeling chat UI on Windows, macOS (Intel & Apple Silicon), and Linux, as a GUI alternative to Pi's terminal TUI.
- **Drive a locally spawned `pi --mode rpc` child process** over stdin/stdout JSONL; never re‑implement Pi's agent logic, provider layer, or session persistence.
- Integrate with OS features: system tray, notifications, file drag‑&‑drop, clipboard sync, and shortcuts.
- Surface Pi's provider/model/thinking configuration through a native Settings UI (cloud providers, subscription OAuth providers, and local `llama.cpp` alike).
- Enable automatic updates of the **desktop app itself** via platform‑specific package managers (MSIX, DMG, AppImage/Snap/Flatpak). Pi binary updates are out of scope (see §8 of `integration-spec.md`).
- **Build and test universal macOS binaries that run natively on both Intel and Apple Silicon Macs.**
- Provide telemetry/opt‑in analytics for product improvement while respecting privacy.
- Deliver a single‑code‑base maintainable codebase using a cross‑platform framework.

### Non-Goals
- Replace the web‑based Pi‑Agent web app or Pi's terminal TUI; the desktop app is a companion GUI shell.
- **Build, bundle, or maintain a fork of `pi` itself.** The app talks to a user‑installed `pi` binary (v1) or a bundled sidecar (v1.1+, TBD).
- **Manage LLM credentials, OAuth flows, or local model binaries.** These are Pi's responsibility (Pi owns `~/.pi/agent/auth.json`, `~/.pi/agent/settings.json`, and the `llama.cpp` provider config).
- Implement "offline mode" as a separate feature — Pi already supports a local `llama.cpp` provider selectable like any other model; there is no online/offline split to build.
- Provide enterprise‑grade admin console; focus on end‑user experience.

---

## 3. Feature Set
*(Revised per `integration-spec.md` §9 — removed cloud/OAuth/offline-keychain items, redirected to Pi's own layers.)*

| Category | Feature | Description |
|----------|---------|-------------|
| **Core Chat** | Real‑time chat via the local `pi --mode rpc` child process | Streamed responses (`message_update` / `text_delta`), markdown rendering, code blocks, syntax highlighting. No cloud API. |
| **Provider Selection** | Model / thinking‑level / steering‑mode controls surfaced from Pi | Settings UI calls `get_available_models`, `set_model`, `set_thinking_level`, `cycle_model`, `cycle_thinking_level`. Includes the local `llama.cpp` provider — no separate "offline mode" feature. |
| **Provider Auth** | Read‑only display of configured providers + guided setup | App shows which providers are authenticated via Pi's `auth.json`. API‑key providers can be set through the UI (writes to `auth.json`); subscription OAuth providers (Claude Pro/Max, OpenAI Codex, Copilot, xAI, Radius) require a one‑time `pi /login <provider>` in a terminal — the app links to instructions. **The app does not store any credentials.** |
| **File Handling** | Drag‑&‑drop files into chat → upload / preview (images, PDFs, code) | Inline preview for images, code highlighting for text files. Images are passed via the `prompt`/`steer`/`follow_up` `images` field (base64). |
| **System Integration** | System tray / menu bar icon, toast notifications, global hotkey (e.g., `Ctrl+Shift+Space`) to show/hide window. |
| **Settings UI** | Theme (light/dark/system), font size, proxy passthrough (sets `httpProxy` in Pi's `settings.json`), trusted‑cwd list, telemetry opt‑in, data clearance (clears app SQLite only; Pi sessions untouched). |
| **Export/Import** | Export chat as markdown / HTML / JSON; import chat history | HTML export uses Pi's `export_html` RPC command. Markdown/JSON export translates `get_entries` output via the same renderer used for clipboard. Import = place a user‑supplied `.jsonl` into `~/.pi/agent/sessions/<cwd‑slug>/` so Pi picks it up on `switch_session`. |
| **Session Tree** | List, switch, fork, clone sessions | Sidebar lists sessions discovered by scanning `~/.pi/agent/sessions/.../<cwd‑slug>/`. Switch via `switch_session`, fork via `fork` (`entryId`), clone via `clone`. |
| **Accessibility** | Keyboard navigation, screen‑reader labels, high‑contrast mode. |
| **Updates (app only)** | Auto‑update of the desktop app via platform‑specific mechanisms (Squirrel.Windows, Sparkle for macOS, AppImageUpdate/Snap/Flatpak for Linux). Pi binary updates are out of scope for v1. |
| **Telemetry (opt‑in)** | Anonymous usage stats to improve product; GDPR‑compliant. |

---

## 4. Architecture Overview
*(Revised per `integration-spec.md` §1, §4 — single `PiBridge` service replaces the multi‑service cloud model.)*

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
|  |  - spawns & supervises `pi --mode rpc`             |
|  |  - writes JSONL commands to child stdin            |
|  |  - reads JSONL responses/events from child stdout  |
|  |  - forwards events to frontend via Tauri events    |
|  |  - request/response correlation via `id`           |
|  |  - crash recovery: restart + switch_session         |
|  +-----------------------------------------------------+
|            |  spawn                ^  events/responses
|            v                       |
|  +-----------------------------------------------------+
|  | `pi --mode rpc` child process (Node.js)             |
|  |  - owns session JSONL files on disk                 |
|  |  - owns auth.json / models.json / settings.json     |
|  |  - talks to upstream LLM providers (HTTP/WS)       |
|  +-----------------------------------------------------+
+----------------------------------------------------------+
                ^                     ^
                |                     |
          Tauri IPC            OS Integration
```

### Core Layers
1. **Presentation Layer** – UI built with React + Tauri WebView.
2. **Application Logic** – Tauri main process (Rust) handling window lifecycle, IPC, app settings, updates.
3. **Service Layer** –
   - **PiBridge** – the only Pi‑integration service. Owns: child‑process spawn/supervision, JSONL framing, request/response correlation via `id`, event demux/forwarding, crash recovery, session‑file discovery for the sidebar. *This replaces the original plan's API Client, Local Model Service, and Credential Manager, all of which are Pi's own responsibilities.*
   - **Notification Service** – uses OS notification APIs.
   - **Update Service** – updates the **desktop app** only; Pi binary updates out of scope for v1.
4. **Data Layer** –
   - Local SQLite (via `rusqlite`) for **app settings, window geometry, runtime cache, and a ring‑buffered command log only.**
   - **Chat history is NOT stored here** — Pi owns `~/.pi/agent/sessions/*.jsonl`; the app reads through Pi via `get_messages` / `get_entries`, or scans the session dir directly for sidebar listing.
   - **No credential storage** — Pi owns `~/.pi/agent/auth.json`. The app contains no keychain/keyring code.
5. **Integration Layer** – OS‑specific code (system tray, file drag‑&‑drop, global shortcuts) abstracted behind an interface.

---

## 5. Technology Stack
**Added explicit Mac architecture support details:**

| Layer | Options (chosen) | Rationale & Mac Compatibility Notes |
|-------|------------------|-------------------------------------|
| **UI Framework** | **Tauri 2.0** (Rust backend + WebView) | Tauri natively supports building universal macOS binaries. Rust toolchain compiles for both `x86_64-apple-darwin` and `aarch64-apple-darwin`; Tauri's bundler combines them into a single `.app` containing both slices. |
| **Language** | Rust (backend) + TypeScript / React (frontend) | Rust cross‑compilation is straightforward; we keep `rustup` targets for both Mac architectures. Frontend remains architecture‑agnostic. |
| **UI Library** | **Ant Design** (or **Material‑UI**) + custom theme | No architecture dependencies. |
| **State Management** | **Zustand** (lightweight) or **Redux Toolkit** | No architecture dependencies. |
| **Markdown / Code Rendering** | **Remark‑HTML + Highlight.js** or **React‑Markdown** with syntax highlighting. | No architecture dependencies. |
| **Pi Integration** | Spawn `pi --mode rpc` as a long‑lived child process; JSONL framing in Rust (`tokio` + `tokio‑io` / `serde_json`). | **Critical:** Pi is a Node.js process; we spawn it via std and talk JSONL over stdin/stdout. No HTTP, no WebSocket. See `integration-spec.md` §2 for the full RPC contract. llama.cpp / cloud providers are Pi's concern — we do not bundle or build llama.cpp. |
| **API Communication** | N/A — no direct provider HTTP from our app. All LLM calls are made by Pi; we only speak JSONL to the local child process. | No architecture dependencies. |
| **Database** | **rusqlite** (Rust) for app settings, window state, runtime cache, command log. | **No chat history table** — Pi owns `~/.pi/agent/sessions/*.jsonl`. SQLite is architecture‑agnostic; Rust builds native libraries for both Mac targets. |
| **Authentication** | **None in our app.** Pi owns `~/.pi/agent/auth.json`; subscription OAuth logins happen via `pi /login <provider>` in a terminal. The app writes API‑key providers directly to `auth.json` (plain JSON). | No keychain/keyring code in our codebase. |
| **Auto‑Update** | `tauri‑updater` integrated with platform‑specific signing (Apple, Microsoft, Linux AppImage/Snap/Flatpak). | Updates the **desktop app** only. For macOS: `tauri‑updater` generates Sparkle‑compatible updates; we will sign and notarize **universal binaries** (containing both slices) for distribution. Pi binary updates are out of scope for v1 (see `integration-spec.md` §8). |
| **Packaging** | Tauri builders produce: <br>• **Windows** – MSIX (or MSI) <br>• **macOS** – **Universal DMG** (containing both x86_64 and arm64 slices) / App Store pkg <br>• **Linux** – AppImage + Snap/Flatpak bundles. | **Explicit macOS output:** `tauri build` with targets `aarch64-apple-darwin` and `x86_64-apple-darwin` yields a universal binary. The resulting `.app` is bundled into a DMG that runs natively on both Mac types. |
| **CI/CD** | GitHub Actions → builds for all three platforms, publishes to GitHub Releases (or respective stores). | **Mac CI Matrix:** Jobs run on both `macos-latest` (Apple Silicon runners) and `macos-12` (Intel runners, via `xcode:latest` or self‑hosted Intel runners) to build and test both architectures. Universal binary verified via `lipo -info`. |
| **Testing** | - Unit: `rust-test` + `jest` <br> - End‑to‑end: `Playwright` (Tauri‑compatible) <br> - CI lint: `clippy`, `eslint`, `prettier`. | Tests executed on both Intel and Apple Silicon Mac runners in CI to ensure binary compatibility. |
| **Telemetry (opt‑in)** | Telemetry crate (e.g., `telemetry`) sending anonymized events to a lightweight endpoint; GDPR compliant. | No architecture dependencies. |

**Why Tauri for Mac Universal Binaries?**
- Rust's cross‑compilation story is mature; adding `aarch64-apple-darwin` and `x86_64-apple-darwin` targets is trivial via `rustup`.
- Tauri's bundler (`@tauri-apps/bundler`) automatically creates a universal binary when building for both targets.
- Avoids shipping two separate Intel/Apple Silicon downloads; users get one DMG that runs natively everywhere.
- Superior security sandbox vs. Electron, crucial when handling API keys.

---

## 6. Development Plan & Milestones
**Revised per `integration-spec.md` §9 — removed llama.cpp build (M6), replaced OAuth flow (M2), added Pi‑binary onboarding (M0.5).**

| Milestone | Timeline (weeks) | Goals / Deliverables |
|-----------|------------------|----------------------|
| **0. Project Setup** | 1 | - Repo init, CI/CD pipeline, basic Tauri + React scaffold.<br>• **Add Mac targets:** `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.<br>• Configure CI matrix for Mac builds (Intel + Apple Silicon).<br>• ESLint/Prettier/Clippy setup.<br>• Initial README & CONTRIBUTING. |
| **0.5. Pi Discovery & Onboarding** | 1 | - `PiBridge` module: spawn `pi --mode rpc`, JSONL framing, request/response correlation via `id`, event demux.<br>• Pi binary discovery (bundled → `PI_BINARY` env → PATH).<br>• "Install Pi" onboarding screen if no binary found.<br>• Crash recovery: auto‑restart + `switch_session` to last session.<br>• Smoke test: send `get_state`, render `session` header in UI.<br>• **Verify boot on both Mac architectures.** |
| **1. Core Chat UI** | 2‑3 | - Chat window with message list, input box, markdown rendering.<br>• `pi:prompt` / `pi:event` wiring; render `message_update` `text_delta` as streaming tokens.<br>• `pi:abort` Stop button; `pi:new_session` "New Chat".<br>• **Verify UI renders correctly on both Mac architectures** (via CI screenshots). |
| **2. Provider & Model Configuration** | 4 | - Provider Setup panel: call `pi:get_available_models`; render dropdown.<br>• `pi:set_model` / `pi:cycle_model` / `pi:set_thinking_level` / `pi:cycle_thinking_level`.<br>• API‑key provider entry writes to `~/.pi/agent/auth.json` directly (plain JSON).<br>• Subscription OAuth providers (Claude Pro/Max, OpenAI Codex, Copilot, xAI, Radius) link to "run `pi /login <provider>` in a terminal" instructions.<br>• llama.cpp provider discovered via `get_available_models` — **no separate offline‑mode build** (this replaces original Milestone 6).<br>• **Test `auth.json` writes on both Intel and Apple Silicon Macs.** |
| **3. Real‑Time Streaming & Queue** | 5 | - Full event wiring: `agent_start`/`turn_start`/`message_*`/`turn_end`/`agent_end`, `tool_execution_*`, `queue_update`, `compaction_*`, `auto_retry_*`.<br>• `pi:steer` / `pi:follow_up` with mid‑stream UI ("Steer" / "Follow‑up" buttons).<br>• `pi:set_steering_mode` / `pi:set_follow_up_mode` in advanced Settings.<br>• Retry banner with countdown + `pi:abort_retry`. |
| **4. File Attachments & Preview** | 6 | - Drag‑&‑drop file input.<br>• Image preview, code syntax highlighting, PDF thumbnail.<br>• Images encoded base64 and passed via `prompt`/`steer`/`follow_up` `images` field (`{type:"image", data, mimeType}`).<br>• **Test file drag‑&‑drop and preview on both Mac architectures**. |
| **5. System Tray / Menu Bar & Hotkey** | 7 | - System tray icon with context menu (New Chat, Settings, Quit).<br>• Global shortcut to show/hide window (configurable).<br>• **Verify tray/menu bar integration works on both Mac architectures** (note UI scaling differences). |
| **6. Session Tree, Fork & Stats** | 8 | - Sidebar lists sessions by scanning `~/.pi/agent/sessions/--<cwd‑slug>--/*.jsonl` (first line = SessionHeader).<br>• `pi:switch_session` / `pi:fork` (`entryId`) / `pi:clone` / `pi:get_fork_messages`.<br>• `pi:get_session_stats` in sidebar footer (tokens / cost / context window %); refresh on every `turn_end`. |
| **7. Notifications** | 9 | - Desktop toast for new messages when app is minimized/focused elsewhere.<br>• Badge count on tray icon.<br>• **Test notification delivery and appearance on both Mac architectures** (account for macOS version differences). |
| **8. Export / Import & Backup** | 10 | - Export: HTML via `pi:export_html`; Markdown/JSON via translating `pi:get_entries` output through our renderer.<br>• Import: place a user‑supplied `.jsonl` into `~/.pi/agent/sessions/<cwd‑slug>/` so Pi picks it up on `switch_session`.<br>• App settings backup (app SQLite only — Pi sessions untouched). |
| **9. Polishing & Accessibility** | 11 | - Keyboard navigation, ARIA labels, focus traps.<br>• High‑contrast theme support.<br>• Performant virtualized list for long chats.<br>• **Verify accessibility features on both Mac architectures** (including VoiceOver testing). |
| **10. Testing & CI/CD** | 12 | - Unit & E2E test coverage ≥80%.<br>• **Automated builds for Windows/macOS (universal)/Linux**.<br>• Signing scripts configured for macOS universal binary notarization.<br>• CI validates `lipo -info` confirms universal binary. |
| **11. Beta Release** | 13 | - Distribute to internal testers via GitHub Releases (universal Mac DMG + Windows/Linux builds).<br>• Collect feedback, fix critical bugs.<br>• **Specifically test beta on Intel Macs (e.g., 2019 MacBook Pro) and Apple Silicon Macs (e.g., M2 MacBook Air)**. |
| **12. Public Release (v1.0)** | 14 | - Publish to appropriate stores (Microsoft Store via MSIX, Apple notarized **universal** DMG, Linux Snap/Flatpak).<br>• Announcement blog/post. |
| **13. Post‑Launch Monitoring** | Ongoing | - Monitor telemetry (opt‑in), crash reports, user feedback.<br>• Iterate on features based on usage data.<br>• **Track crash reports separately by Mac architecture to detect regressions**.<br>• Revisit Pi‑bundling decision (§8 of `integration-spec.md`) for v1.1. |

*Total estimated time: ~14 weeks (≈3.5 months) with a small team (2‑3 engineers). One week net reduction vs. previous plan: original Milestone 6 (llama.cpp build) folded into Milestone 2, new Milestone 0.5 (Pi onboarding) added.*

---

## 7. Risk Assessment & Mitigation
**Revised per `integration-spec.md` §9 — removed credential‑security risk, added Pi‑process‑crash risk.**

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Performance overhead of WebView** | Medium | Use Tauri's built‑in WebView (WebKit/WebView2) which is lightweight; enable GPU acceleration; virtualize long lists. |
| **`pi` binary not installed / wrong version** | High | Robust binary discovery (bundled → `PI_BINARY` env → PATH); onboarding screen with install instructions; `pi --version` check on boot with banner if below required version. |
| **Pi child process crash** | High | `PiBridge` auto‑restarts (3× within 60s → fatal dialog); captures last `sessionFile` from `get_state` and re‑runs `switch_session` after restart; surfaces `pi:process_died` event to UI. |
| **OS‑specific packaging complexities** | Medium | Leverage Tauri's built‑in bundler; maintain separate CI jobs; rely on community docs for signing/notarization. **For Mac:** Ensure CI builds both architectures and verifies universal binary via `lipo`. |
| **Pi RPC protocol drift between `pi` versions** | Medium | Pin a supported `pi` version range in the app's compatibility check; integration tests assert against the documented RPC command/event catalog (`integration-spec.md` §2). |
| **JSONL framing bugs (U+2028/U+2029 split)** | Low | Implement strict LF‑only splitting in `PiBridge`; do NOT use Node `readline` semantics; unit tests with adversarial payloads. |
| **User confusion around provider setup** | Medium | Clear "subscription OAuth → run in terminal" vs "API key → enter here" split in Provider Setup panel; link to https://pi.dev/docs/latest/providers. |
| **App Store review rejection (macOS/Windows Store)** | Low | Follow each platform's guidelines early; use official Tauri signing scripts; include privacy policy. **Mac‑specific:** Ensure universal binary is properly notarized by Apple (notarization works for universal binaries). |
| **Subscription OAuth providers cannot be logged in from inside the app** | Medium | This is a known Pi limitation (OAuth happens in TUI). Document clearly in‑UI; provide a one‑click "Open Terminal here" helper that pre‑fills `pi /login <provider>`. |
| **CI runner availability for Intel Macs** | Low (2026) | Use self‑hosted Intel Mac runners in GitHub Actions if needed; or rely on cross‑compilation testing. Most CI providers still offer Intel Mac runners via `macos-12` label. |

---

## 8. Success Metrics (post‑launch)

| Metric | Target (3‑month) |
|--------|------------------|
| **Active Daily Users (ADU)** | 5 k |
| **Retention (Day‑7)** | 40 % |
| **Crash‑free sessions** (desktop app, not Pi child) | >99.5 % |
| **Pi child process auto‑restart success rate** | >98 % |
| **Average chat response latency** (perceived time‑to‑first‑token, dominated by Pi + provider) | <2 s (online provider) |
| **Opt‑in telemetry adoption** | ≥30 % |
| **User satisfaction (NPS)** | ≥35 |

---

## 9. Appendices
### A. Glossary
- **Universal Binary (macOS):** A single executable file containing code for multiple CPU architectures (e.g., both Intel x86_64 and Apple Silicon arm64). Allows the app to run natively on both Mac types without translation.
- **Tauri** – Framework for building lightweight desktop apps with Rust backend and frontend.
- **IPC** – Inter‑process communication between Tauri's Rust core and frontend (Tauri commands & events).
- **PiBridge** – The Rust module in the Tauri main process that spawns and supervises the `pi --mode rpc` child process and translates between JSONL‑over‑stdio and Tauri IPC. See `integration-spec.md` §1, §2.
- **RPC mode** – Pi's non‑interactive integration mode: strict JSONL over stdin/stdout, with commands (carrying optional `id`), responses (`type:"response"` echoing `id`), and asynchronous events (no `id`). See https://pi.dev/docs/latest/rpc.
- **Session JSONL** – Pi's on‑disk session format at `~/.pi/agent/sessions/--<cwd‑slug>--/<timestamp>_<uuid>.jsonl`; the first line is a `session` header, subsequent lines are tree‑structured entries linked by `id`/`parentId`. The desktop app never writes these files directly (except for Import — see §3).

### B. Open‑Source Licenses
Dependencies shipped with the desktop app (subject to lockfile verification at release time):

| Dependency | License | Purpose |
|---|---|---|
| Tauri 2.x | Apache‑2.0 / MIT | App framework, IPC, bundler |
| Rust toolchain & std | MIT/Apache‑2.0 | Backend language |
| React | MIT | Frontend UI library |
| Ant Design | MIT | UI component kit |
| Zustand | MIT | State management |
| react‑markdown / remark | MIT | Markdown rendering |
| highlight.js | BSD‑3‑Clause | Code syntax highlighting |
| rusqlite | MIT | SQLite bindings |
| tokio | MIT | Async runtime for `PiBridge` child‑process I/O |
| serde / serde_json | MIT/Apache‑2.0 | JSONL serialization |

**Not shipped but required at runtime:**
| Dependency | License | Notes |
|---|---|---|
| `pi` (pi.dev Coding Agent) | Refer to https://pi.dev | User‑installed; not bundled in v1.0 (see `integration-spec.md` §8). llama.cpp, when the user opts in, is provided by Pi. |

### C. References & Resources
- This project's `integration-spec.md` — the authoritative Pi RPC contract, process model, and IPC surface (supersedes this plan where they conflict).
- Pi docs home: https://pi.dev/docs/latest
- Pi RPC mode: https://pi.dev/docs/latest/rpc
- Pi SDK: https://pi.dev/docs/latest/sdk
- Pi JSON event stream: https://pi.dev/docs/latest/json
- Pi session format: https://pi.dev/docs/latest/session-format
- Pi settings: https://pi.dev/docs/latest/settings
- Pi providers: https://pi.dev/docs/latest/providers
- Pi security/trust: https://pi.dev/docs/latest/security
- Tauri Docs: https://tauri.app/v1/guides/
- Building Universal Mac Apps with Tauri: https://tauri.app/v1/guides/bundling/macos#universal-binaries
- Rust Cross‑Compilation: https://doc.rust-lang.org/rustc/platform-support.html
- Apple Notarization Guide: https://developer.apple.com/documentation/xcode/notarizing_macos_software_before_distribution
- GitHub Actions macOS Runners: https://docs.github.com/en/actions/using-github-hosted-runners/about-larger-runners#about-macos-runners

---

*End of Plan*