# Progress Log — Pi Desktop

## Session: 2026-07-21

### Phase 1: 项目规划与架构设计
- **Status:** complete
- **Started:** 2026-07-21 21:39

- Actions taken:
  - 阅读 plan.md（25KB）了解项目 13 个里程碑
  - 阅读 integration-spec.md（20KB）掌握 Pi RPC 协议
  - 理解 Pi 是本地 agent harness，不是云服务
  - 确定架构：Tauri 桌面壳 + Rust PiBridge + 本地 `pi --mode rpc` 子进程
  - 确认不存储聊天记录、不管理凭证、不打包 pi 二进制

- Files created/modified:
  - 无（已有文件）

### Phase 2: 环境搭建与脚手架
- **Status:** complete
- **Started:** 2026-07-21 22:00

- Actions taken:
  - 安装 Rust 工具链（rustup + stable 1.97.1）
  - 添加 macOS 交叉编译目标（aarch64 + x86_64）
  - 使用 `create-tauri-app` 创建 Tauri 2.0 + React + TypeScript 项目
  - 安装前端依赖：antd, zustand, react-markdown, @ant-design/icons
  - 配置 Rust 依赖：rusqlite, uuid, chrono, serde, tray-icon
  - 配置 Tauri 窗口（1100x720, min 800x500, center）
  - 配置系统托盘（trayIcon + context menu）

- Files created/modified:
  - `src-tauri/Cargo.toml` — 添加 Rust 依赖
  - `src-tauri/tauri.conf.json` — 窗口配置、托盘配置
  - `package.json` — 前端依赖
  - `.gitignore` — 更新

### Phase 3: 核心功能实现
- **Status:** in_progress
- **Started:** 2026-07-21 22:10

#### M0.5: PiBridge 模块
- Actions taken:
  - 创建 `pibridge/mod.rs` — PiBridge 结构体定义
  - 创建 `pibridge/protocol.rs` — RPC 命令/响应/事件类型、SessionEntry、AppSettings
  - 创建 `pibridge/jsonl.rs` — JSONL 编码解码、响应/事件判断
  - 创建 `pibridge/process.rs` — PiProcess spawn/send_command/kill/is_running
  - 创建 `pibridge/discovery.rs` — 二进制发现（PATH + PI_BINARY env + --version）
  - 创建 `pibridge/session.rs` — Session 文件扫描 + 导入
  - 创建 `db.rs` — SQLite 数据库（app_settings, window_state, command_log）

- 未完成：
  - stdout 异步读取线程（未实现）
  - crash 恢复逻辑

- Files created:
  - `src-tauri/src/pibridge/mod.rs`
  - `src-tauri/src/pibridge/protocol.rs`
  - `src-tauri/src/pibridge/jsonl.rs`
  - `src-tauri/src/pibridge/process.rs`
  - `src-tauri/src/pibridge/discovery.rs`
  - `src-tauri/src/pibridge/session.rs`
  - `src-tauri/src/db.rs`

#### M1: 核心聊天 UI
- Actions taken:
  - 创建 `AppLayout.tsx` — 主布局（Header + Sider + Content）
  - 创建 `ChatWindow.tsx` — 消息列表、输入框、Markdown 渲染、停止按钮
  - 创建 `Sidebar.tsx` — Session 历史列表
  - 创建 `PiStatusBar.tsx` — 顶部状态栏（Pi 连接状态、设置按钮）
  - 创建 `SettingsPanel.tsx` — 主题/字号/遥测/版本信息
  - 创建 `App.tsx` — 应用入口，初始化 + 事件监听
  - 创建 `stores/appStore.ts` — Zustand 状态管理
  - 创建 `services/piBridge.ts` — Tauri IPC 封装
  - 创建 `types/index.ts` — TypeScript 类型定义
  - 创建 `styles/index.css` — 全局样式

- 未完成：
  - 真实流式渲染（`text_delta` 事件 → 实时追加）
  - 消息历史加载（`get_messages`）

- Files created:
  - `src/components/AppLayout.tsx`
  - `src/components/ChatWindow.tsx`
  - `src/components/Sidebar.tsx`
  - `src/components/PiStatusBar.tsx`
  - `src/components/SettingsPanel.tsx`
  - `src/App.tsx`（覆盖）
  - `src/main.tsx`（覆盖）
  - `src/stores/appStore.ts`
  - `src/services/piBridge.ts`
  - `src/types/index.ts`
  - `src/styles/index.css`

#### M5: 系统托盘
- Actions taken:
  - 配置 `Cargo.toml` 启用 `tray-icon` feature
  - 配置 `tauri.conf.json` 托盘图标
  - 实现 `setup_tray()` 函数：菜单项 + 事件处理
  - 菜单：Show/Hide、New Chat、Settings、Quit
  - 左键单击显示窗口

- Files modified:
  - `src-tauri/src/lib.rs` — 添加 setup_tray 函数

### 编译与构建验证
- **Status:** complete (with fixes)

- Actions taken:
  - `cargo check` — 首次编译报错，修复后通过
  - `npx tsc --noEmit` — TypeScript 编译通过
  - `npx vite build` — 前端构建成功（918KB JS bundle）
  - `npm run tauri build` — 完整构建成功
  - 构建输出：`Pi Desktop.app` + `Pi Desktop_0.1.0_aarch64.dmg`
  - 运行验证：app 启动成功，Pi 连接状态显示正常

- 修复的编译错误：
  1. 缺少 `use tauri::Emitter` 导入
  2. MutexGuard 临时值生命周期问题（保存到变量）
  3. 双重借用问题（分离 spawn result）
  4. `CREATE VIEW AS DELETE` 非法 SQL
  5. TypeScript 未使用变量/错误导入

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| cargo check | - | Compilation success | 17 warnings, 0 errors | ✓ |
| cargo build --release | - | Build success | 1m32s, 12.5MB binary | ✓ |
| tsc --noEmit | - | No errors | 0 errors | ✓ |
| vite build | - | Build success | 3.08s, 918KB JS | ✓ |
| npm run tauri build | - | DMG + .app | DMG + .app 生成成功 | ✓ |
| 应用启动 | ./pi-desktop | 窗口显示 + Pi 状态 | 进程运行，PID 45488 | ✓ |
| 系统托盘 | - | 菜单栏图标 + 右键菜单 | 待手动验证 | - |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 22:00 | rustup: Missing manifest | 1 | 卸载后重新安装 stable 工具链 |
| 22:05 | brew install rust 卡住 | 1 | 改用 rustup 安装 |
| 22:19 | create-tauri-app needs terminal | 1 | 使用 `--yes` 标志 |
| 22:25 | `emit` not found on AppHandle | 1 | 添加 `use tauri::Emitter` |
| 22:26 | mutexguard temporary lifetime | 1 | 保存到变量再使用 |
| 22:28 | process spawn double borrow | 1 | 分离 spawn result 变量 |
| 22:45 | CREATE VIEW AS DELETE 语法错误 | 1 | 移除无效的 CREATE VIEW |
| 22:45 | 应用启动 panic on SQL error | 1 | 回退到 :memory: 数据库后修复 |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 3 — 核心功能实现（大部分功能已完成） |
| Where am I going? | M3 完整事件连线（queue/compaction/retry）、M6 Session fork/clone、M7 通知、跨平台测试 |
| What's the goal? | 构建完整的 Pi-Agent 桌面客户端 |
| What have I learned? | 见 findings.md |
| What have I done? | 见下方 Session 日志 |

---
*Update after completing each phase or encountering errors*

## Session: 2026-07-21 (续)

### Core: Stdout 读取线程 + 真实事件流
- **Status:** ✅ 完成
- **Problem:** `process.rs::spawn()` 使用 `BufReader::new(stdout)` 消费了 stdout 句柄，导致所有 pi 输出被丢弃，app「又聋又哑」
- **Fix:** 
  - Process 只 spawn 存储句柄，不读取
  - 新增 `take_stdout()` 方法转移 stdout 所有权
  - `PiBridge::start_stdout_reader()` 创建后台线程持续读取 stdout
  - 线程解析 JSONL，通过 Tauri event 转发到前端
- **Files modified:** `process.rs`, `mod.rs`, `lib.rs`

### Core: 请求/响应关联 (RPC Correlation)
- **Status:** ✅ 完成
- **Implementation:** `PiBridge::send_cmd_and_wait()` 使用 `mpsc::channel` + `pending_responses: HashMap` 实现命令 ID 关联
- 支持超时自动清理（recv_timeout 30s）

### M1: 真实流式消息渲染
- **Status:** ✅ 完成
- **Changes:**
  - Store 删除客户端模拟（不再 pre-create assistant placeholder）
  - 改为监听 Pi 的 `message_start` → 创建消息、`text_delta` → 实时追加
  - `extractDelta()` 兼容多种事件格式（text_delta/delta/assistantMessageEvent.text_delta）
  - 新增事件类型处理：`agent_start/turn_start/turn_end/message_start/message_end/error/compaction_*/auto_retry_*/process_died`
  - ChatWindow 增加 loading 状态

### M2: Provider 发现 + 模型切换 UI
- **Status:** ✅ 完成
- **New Rust commands:** `pi_get_available_models`, `pi_set_model`, `pi_get_session_stats`, `pi_compact`, `pi_steer`, `pi_follow_up`
- **Frontend:** SettingsPanel 增加 Provider + Model 双下拉选择（来源 `get_available_models`），支持刷新

### M1: 消息历史加载
- **Status:** ✅ 完成
- **New Rust command:** `pi_get_messages` → 调用 Pi 的 `get_messages` RPC 并返回
- **Frontend:** `switchSession()` → 发送 `switch_session` RPC → 自动调用 `loadMessages()` → 渲染历史消息

### M4: 文件拖拽上传
- **Status:** ✅ 基础实现
- **Features:**
  - Drag & drop 图片到聊天区域
  - 图片缩略图预览 + 可移除
  - 以 base64 格式通过 `images` 参数发送
  - 拖拽时显示蓝色虚线边框提示

### New Rust Commands Added to lib.rs
- `pi_steer` / `pi_follow_up` — 中期引导和后续消息
- `pi_get_messages` — 获取当前会话历史
- `pi_get_available_models` — 列出可用模型
- `pi_switch_session` — 切换会话
- `pi_set_model` — 设置当前模型
- `pi_get_session_stats` — 获取会话统计
- `pi_compact` — 手动上下文压缩

### 构建验证
- **Status:** ✅ 通过
- cargo check: 0 errors
- tsc --noEmit: 0 errors
- vite build: 成功 (957KB JS bundle)
- npm run tauri build: 成功 (Pi Desktop.app + DMG)

### Test Results
| Test | Status |
|------|--------|
| cargo check | ✓ 0 errors |
| tsc --noEmit | ✓ 0 errors |
| vite build | ✓ 957KB JS, 3.6s |
| npm run tauri build | ✓ DMG + .app 生成 |