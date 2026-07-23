# Findings & Decisions — Pi Desktop

## Requirements
- 原生桌面客户端，替代 Pi 的终端 TUI
- 通过 `pi --mode rpc` 子进程通信（stdin/stdout JSONL）
- 支持 macOS/Windows/Linux 三平台
- 系统托盘、通知、文件拖拽、快捷键
- 不存储聊天记录（Pi 自己维护）
- 不管理 LLM 凭证（Pi 自己维护 `auth.json`）
- macOS 通用二进制（Intel + Apple Silicon）

## Research Findings

### Pi RPC 协议
- Pi 是一个本地 agent harness（类似 Claude Code / Aider）
- 没有公共 HTTP/WebSocket API
- 集成方式：`pi --mode rpc` — JSONL over stdin/stdout
- LF 分隔，不要用 Node readline（会分割 U+2028/U+2029）
- 命令带 `id`，响应回显 `id`，事件不带 `id`
- 响应格式：`{"id","type":"response","command","success":bool,"data"?,"error"?}`
- 事件流包括：session, agent_start/end, turn_start/end, message_start/update/end, tool_execution_*, queue_update, compaction_*, auto_retry_*

### Tauri 2.0 API 变化
- `AppHandle::emit()` 需要 `use tauri::Emitter` trait 导入
- 系统托盘使用 `builtin:tray-icon` feature（Cargo.toml 中启用）
- TrayIconBuilder 支持 `on_menu_event` 和 `on_tray_icon_event`
- setup 回调是同步的，不能直接用 tokio::sync::Mutex

### macOS 构建
- Rust 支持 aarch64-apple-darwin 和 x86_64-apple-darwin 交叉编译
- Tauri bundler 自动创建 universal binary
- 构建输出：`target/release/bundle/macos/*.app` + `bundle/dmg/*.dmg`

### Pi 二进制安装
- 当前系统已安装 pi：`/Users/raingor_ye/Library/FlyEnv/env/node/bin/pi`
- 验证 `pi --version` 和 `pi --help` 可用
- 支持 `--mode rpc` 参数

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Rust 后端 = PiBridge 单模块 | 只做一件事：管控 pi 子进程 + JSONL 协议翻译 |
| 使用 `std::sync::Mutex` | setup 回调同步，不能 await；async 命令中短暂持有没问题 |
| 前端 = React + Ant Design | Ant Design v6 组件丰富，主题系统完善 |
| 状态管理 = Zustand | 轻量（<1KB），无 boilerplate，TypeScript 友好 |
| 数据库 = rusqlite (bundled) | 仅存 app 设置/窗口状态/命令日志，不存聊天记录 |
| 聊天记录 = Pi 自己管理 | 避免双写同步 bug，通过 RPC 读取 |
| 凭证 = Pi 自己管理 | app 不碰 `auth.json`，不写 keychain 代码 |
| 系统托盘 = Tauri 内置 tray-icon | 原生 macOS 菜单栏集成 |
| 先不打包 pi 二进制 | 简化 v1.0 构建，依赖用户预安装 |
| 项目管理 = planning-with-files | 持久化任务状态，避免上下文丢失 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| rustup 工具链 manifest 损坏，无法读取 rustc 版本 | 卸载后重新安装 stable 工具链 |
| brew install rust 卡在 bottle 下载阶段 | 改用 rustup 安装，更直接可靠 |
| create-tauri-app 需要交互式终端 | 添加 `--yes` 标志 |
| Tauri 2.0 `emit()` 需要 Emitter trait | 导入 `use tauri::Emitter` |
| MutexGuard 临时值生命周期不够长 | 将 lock 结果保存到具名变量 |
| 先 lock process 再 mutable borrow bridge | 分离 spawn 的 result 变量 |
| CREATE VIEW AS DELETE 是非法 SQL | 移除 CREATE VIEW，仅保留表创建 |

## Resources
- Pi RPC 文档：https://pi.dev/docs/latest/rpc
- Pi JSON 事件流：https://pi.dev/docs/latest/json
- Pi 会话格式：https://pi.dev/docs/latest/session-format
- Tauri 2.0 文档：https://tauri.app/v2/
- Tauri 系统托盘：https://tauri.app/v2/guides/features/system-tray/
- Tauri macOS 通用二进制：https://tauri.app/v1/guides/bundling/macos#universal-binaries
- Ant Design 6：https://ant.design/
- Zustand：https://github.com/pmndrs/zustand
- react-markdown：https://github.com/remarkjs/react-markdown
- 项目结构：`/Users/raingor_ye/wwwroot/M-my-project/pi-desktop-dev/`
- DBG 构建输出：`src-tauri/target/release/bundle/dmg/Pi Desktop_0.1.0_aarch64.dmg`

## Session 2 Learnings (2026-07-21 续)

### RPC 请求/响应关联
- Pi 的 RPC 协议中，命令带 `id`，响应回显 `id`，事件不带 `id`
- 使用 `mpsc::channel` + `HashMap<String, Sender>` 实现同步等待响应
- 关键：发送命令后释放 process 锁，在 channel 上 `recv_timeout` 等待，避免死锁
- 清理：超时或错误时必须从 pending_responses 中移除条目，防止内存泄漏

### stdout 读取线程
- `std::process::ChildStdout` 是 `Send`，可以跨线程传递
- BufReader 获取 stdout 所有权 — 一旦创建就不能再拿回原始 stdout
- 解决方案：Process 只 spawn 存储句柄，通过 `take_stdout()` 转移所有权给 reader 线程
- Tauri `AppHandle` 也是 `Send+Sync`，可在线程中安全调用 `emit()`

### Pi RPC 事件格式（实际观察）
- `message_start` 包含 `message.id` → 用于创建前端消息记录
- `text_delta` 可能在事件顶层或嵌套在 `assistantMessageEvent` 中
- 前端需用统一的 `extractDelta()` 兼容多种格式
- `message_end` 不带 content（content 已通过增量累加）

### Tauri 2 Tips
- `State<'_, AppState>` 的 bridge 字段是 `Arc<Mutex<PiBridge>>`，lock() 返回 MutexGuard
- 异步命令中不能持有 non-Send MutexGuard 跨越 await 点
- 解决方案：所有同步操作在函数内完成，不需要 await
- `invoke_handler` 中注册的命令名必须与 `#[tauri::command]` 函数名一致（kebab-case 转 snake_case 自动）

### 前端 Drag & Drop
- HTML5 File API 的 `FileReader.readAsDataURL` 产生 base64
- `data:image/png;base64,iVBOR...` 格式需要剥离前缀后传给 Rust
- Ant Design Image 组件支持 `preview` 配置预览行为

## 更新后待办优先级
1. ~~**P0** — crash 恢复（auto-restart + switch_session）~~ ✅ 已完成
2. ~~**P1** — M3 完整事件连线 UI（queue chip、retry banner 含 abort_retry 取消、compaction banner）~~ ✅ 已完成
3. **P2** — llama.cpp provider 支持文档
4. **P2** — 快捷键 `Ctrl+Shift+Space`（show/hide）
5. ~~**P2** — 桌面通知（M7）~~ ✅ 已完成
6. **P3** — 代码/PDF 文件预览
7. ~~**P3** — Session fork/clone UI~~ ✅ 已完成（fork）
8. ~~**P3** — 导出/导入（M8）~~ ✅ 已完成

## Session 3 Learnings (2026-07-23)

### @mention 文件搜索递归化
- `list_directory_files` 原为非递归，只扫顶层目录
- 重构：有搜索条件时递归搜索 4 层，结果按相对路径显示（`src/components/README.md`）
- 无搜索条件时保持浅层扫描（性能考量）
- 最多返回 100 条结果，隐藏文件始终跳过

### M8 导出/导入前端对接
- `/export` 斜杠命令拦截 + 格式选择 Modal
- 支持快捷参数：`/export html`、`/export md`、`/export json`
- 底部信息栏新增导出/导入按钮
- 导入通过 `<input type="file">` 选择 .jsonl 文件后调用 `importJsonl`