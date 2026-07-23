# Task Plan: Pi-Agent Desktop Application

## Goal
构建一个完整的 Pi-Agent 原生桌面客户端（Tauri + React + Rust），通过 `pi --mode rpc` 子进程实现聊天 GUI，覆盖 macOS/Windows/Linux 三平台。

## Current Phase
Phase 3 — 核心功能实现（M0-M6 核心功能已完成，推进 M3 完整事件连线与 M7+）

## Phases

### Phase 1: 项目规划与架构设计 ✅
- [x] 阅读 plan.md 了解项目全景
- [x] 阅读 integration-spec.md 理解 Pi RPC 通信协议
- [x] 确定技术栈：Tauri 2.0 + Rust + React + Ant Design + Zustand
- [x] 确定架构：PiBridge（Rust 子进程管理）+ 前端 React UI
- **Status:** complete

### Phase 2: 环境搭建与脚手架 ✅
- [x] 安装 Rust 工具链（rustc 1.97.1, aarch64-apple-darwin + x86_64-apple-darwin）
- [x] 创建 Tauri 2.0 + React + TypeScript 项目
- [x] 安装前端依赖（antd, zustand, react-markdown, @ant-design/icons）
- [x] 配置 Rust 后端依赖（rusqlite, uuid, chrono, serde）
- [x] 配置 Tauri 系统托盘（tray-icon feature）
- **Status:** complete

### Phase 3: 核心功能实现 🔄
- [x] **M0.5: PiBridge 模块**
  - [x] PiBridge 结构体定义（进程管理 + 事件转发）
  - [x] PiProcess：spawn `pi --mode rpc`、send_command、kill
  - [x] JSONL 编解码：encode_command、parse_line、is_response/is_event
  - [x] Pi 二进制发现：PATH 查找 + PI_BINARY env + `--version` 校验
  - [x] Session 文件扫描：`~/.pi/agent/sessions/--<cwd-slug>--/*.jsonl`
  - [x] RPC 协议类型定义：RpcCommand、RpcResponse、RpcEvent、PiState
  - [x] **stdout 异步读取** — 后台线程实时读取 stdout 并转发事件到前端
  - [ ] crash 恢复（auto-restart + switch_session）

- [x] **M1: 核心聊天 UI**
  - [x] ChatWindow 消息列表 + 输入框
  - [x] 用户/助手消息气泡区分
  - [x] Markdown 渲染（react-markdown + remark-gfm）
  - [x] 代码块语法高亮样式
  - [x] 流式输入占位 + 闪烁光标
  - [x] 停止按钮（abort）
  - [x] 新建会话按钮
  - [x] **真实流式渲染** — 通过 `message_start`/`text_delta`/`message_end` 事件实现
  - [x] 消息历史加载（`get_messages`）

- [x] **M2: Provider 与设置**
  - [x] 设置面板 UI（主题、字号、遥测开关）
  - [x] Pi 版本信息展示
  - [x] SQLite 设置持久化
  - [x] Provider 发现（`get_available_models`）
  - [x] 模型切换 UI
  - [ ] llama.cpp 本地 provider 支持

- [x] **M5: 系统托盘**
  - [x] 菜单栏图标 + 右键菜单
  - [x] Show/Hide、New Chat、Settings、Quit
  - [x] 左键单击显示窗口

- [x] **M3: 实时流与队列**
  - [x] 完整事件连线：agent_start/turn_start/message_* /turn_end/agent_end
  - [x] Steer/Follow-up 模式切换
  - [x] 重试横幅（auto_retry_start/end，含 abort_retry 取消按钮）
  - [x] 队列状态显示（queue_update：steering + followUp）
  - [x] 压缩横幅（compaction_start/end）

- [x] **M4: 文件附件与预览**
  - [x] 拖拽上传
  - [x] 图片预览（base64 编码）
  - [ ] 代码/PDF 预览

- [x] **M6: Session 树与 Fork**
  - [x] 侧边栏 Session 列表
  - [x] switch_session / fork
  - [x] Session 统计（`get_session_stats` RPC）

- [ ] **M7: 通知**
  - [ ] 桌面通知（app 最小化时新消息）
  - [ ] 托盘图标角标

- [ ] **M8: 导出/导入**
  - [ ] HTML 导出（export_html RPC）
  - [ ] Markdown/JSON 导出
  - [ ] 导入 .jsonl 到 Pi 会话目录

- [ ] **M9: 打磨与无障碍**
  - [ ] 键盘导航
  - [ ] ARIA 标签
  - [ ] 高对比度主题
  - [ ] 长列表虚拟化

- [ ] **M10: 测试与 CI/CD**
  - [ ] Rust 单元测试
  - [ ] 前端测试
  - [ ] Playwright E2E
  - [ ] GitHub Actions CI

- [ ] **M11: Beta 发布**
  - [ ] 签名与公证
  - [ ] GitHub Releases 分发

- [ ] **M12: 正式发布 v1.0**
  - [ ] 应用商店发布
  - [ ] 公告

### Phase 4: 测试与验证
- [x] Rust 后端编译通过（cargo check + cargo build --release）
- [x] TypeScript 前端编译通过（tsc --noEmit）
- [x] Vite 构建成功
- [x] DMG 构建成功（Pi Desktop_0.1.0_aarch64.dmg）
- [x] 应用启动运行成功
- [x] 修复数据库初始化 bug（CREATE VIEW 语法错误）
- [ ] 系统托盘功能验证
- [ ] 聊天 UI 交互验证
- **Status:** in_progress

### Phase 5: 持续交付
- [ ] 更新 plan.md 标记已完成里程碑
- [ ] 完善 README.md
- [ ] 创建 CHANGELOG.md
- **Status:** pending

## Key Questions
1. `pi --mode rpc` 是否有 dispose/shutdown 命令？还是只能用 SIGTERM？
2. stdout 读取是用线程阻塞读取还是异步 tokio 读取？
3. Pi 的 `text_delta` 事件是否包含完整消息内容还是仅增量？

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| 使用 `std::sync::Mutex` 而非 `tokio::sync::Mutex` | setup 回调是同步的，不能 await；std Mutex 在 async 命令中短暂持有没问题 |
| 系统托盘使用 Tauri 2.0 的 `tray-icon` feature | 原生支持 macOS 菜单栏，无需额外依赖 |
| 前端状态管理使用 Zustand | 轻量、无 boilerplate、TypeScript 友好 |
| 聊天记录不存 SQLite | Pi 自己维护 `~/.pi/agent/sessions/*.jsonl`，app 通过 RPC 读取 |
| 先不打包 pi 二进制 | 依赖用户预安装 `pi`，v1.1 再考虑打包 |
| Ant Design v6 | 组件丰富、主题系统完善、与 React 19 兼容 |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| rustup 工具链 manifest 损坏 | 1 | 卸载后重新安装 stable 工具链 |
| brew install rust 卡住 | 1 | 改用 rustup 安装 |
| `create-tauri-app` 需要终端交互 | 1 | 使用 `--yes` 非交互模式 |
| `AppHandle::emit` 需要 Emitter trait | 1 | 添加 `use tauri::Emitter` |
| MutexGuard 临时值生命周期问题 | 1 | 将 lock 结果保存到变量再使用 |
| `bridge.process.lock().spawn()` 双重借用 | 1 | 分离 spawn 结果变量 |
| `CREATE VIEW AS DELETE` 语法错误 | 1 | 删除无效的 CREATE VIEW，仅保留表创建 |
| rustc 版本读取错误 | 1 | 重新安装 stable 工具链 |

## Notes
- 项目根目录：`/Users/raingor_ye/wwwroot/M-my-project/pi-desktop-dev/`
- Rust 后端：`src-tauri/src/`
- 前端代码：`src/`
- DMG 构建输出：`src-tauri/target/release/bundle/dmg/`
- 构建成功但不打包：`npm run tauri build`
- 开发模式：`npm run tauri dev`