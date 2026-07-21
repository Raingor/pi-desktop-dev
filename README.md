# Pi Desktop

Pi-Agent 原生桌面客户端 — 一个围绕 `pi --mode rpc` 子进程的 GUI Shell，作为 Pi 终端 TUI 的桌面替代方案。

## 架构

```
Tauri App (Rust 主进程)
  ├── Frontend (React + Ant Design)
  ├── PiBridge (Rust 模块)
  │   └── 管控 `pi --mode rpc` 子进程（JSONL 通信）
  └── OS 集成（系统托盘、通知、拖拽等）
```

## 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Tauri 2.0 |
| 后端 | Rust (PiBridge + rusqlite) |
| 前端 | React 19 + TypeScript |
| UI | Ant Design 6 |
| 状态 | Zustand |
| 通信 | JSONL over stdin/stdout (Pi RPC 协议) |

## 前置条件

- [Pi-Agent](https://pi.dev/docs/latest/quickstart) — 需预先安装
- Rust 工具链（`rustup`）
- Node.js 18+

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布版
npm run tauri build
```

## 项目状态

| 里程碑 | 状态 |
|---------|------|
| M0 - 项目脚手架 | ✅ 完成 |
| M0.5 - PiBridge 模块 | 🔄 骨架完成 |
| M1 - 核心聊天 UI | 🔄 骨架完成 |
| M2 - Provider 配置 | ⬜ 未开始 |
| M3 - 实时流与队列 | ⬜ 未开始 |
| M4 - 文件附件 | ⬜ 未开始 |
| M5 - 系统托盘 | ✅ 完成 |
| M6 - Session 管理 | ⬜ 未开始 |
| M7-M12 | ⬜ 未开始 |

详见 [plan.md](plan.md) 和 [task_plan.md](task_plan.md)。

## 关键设计决策

- **不存储聊天记录** — Pi 自己维护 `~/.pi/agent/sessions/*.jsonl`，app 通过 RPC 读取
- **不管理 LLM 凭证** — Pi 自己维护 `~/.pi/agent/auth.json`
- **不打包 pi 二进制** — v1.0 依赖用户预安装，v1.1 再考虑打包
- **macOS 通用二进制** — Rust 同时编译 x86_64 和 arm64，Tauri bundler 合成 universal binary

## 项目文件

| 文件 | 说明 |
|------|------|
| `plan.md` | 项目计划（13 个里程碑） |
| `integration-spec.md` | Pi RPC 集成规范 |
| `task_plan.md` | 当前任务跟踪 |
| `findings.md` | 研究发现与决策记录 |
| `progress.md` | 进度日志 |
| `src-tauri/src/` | Rust 后端代码 |
| `src/` | React 前端代码 |