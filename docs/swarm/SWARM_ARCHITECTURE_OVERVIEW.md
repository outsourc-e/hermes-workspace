# Hermes Workspace Swarm 软件架构详解

> **版本**: 基于 Hermes Workspace v2.3.0  
> **最后更新**: 2026-08-09  
> **涵盖范围**: 整体架构、多 Agent 协同机制、Swarm Board 与 Hermes Kanban 关系
>
> **现行真源（勿以文中旧 builder/reviewer 示例为准）**：
> - Roster / pipeline：[`AGENTS.md`](../../AGENTS.md) + [`swarm.yaml`](../../swarm.yaml)
> - LangGraph 默认 workflow：`hermes_langgraph_orchestrator/workflows/radw.yaml`
> - 派发与交接：[`DISPATCH-GUIDE.md`](./DISPATCH-GUIDE.md) · [`HANDOFF-PROTOCOL.md`](./HANDOFF-PROTOCOL.md)

---

## 目录

1. [系统概览](#1-系统概览)
2. [核心架构层](#2-核心架构层)
3. [多 Agent 协同机制](#3-多-agent-协同机制)
4. [派发流程详解](#4-派发流程详解)
5. [Swarm Board 与 Hermes Kanban 的关系](#5-swarm-board-与-hermes-kanban-的关系)
6. [关键数据结构](#6-关键数据结构)
7. [文件索引](#7-文件索引)

---

## 1. 系统概览

Hermes Workspace Swarm 是一个**持久化多 Agent 协同系统**，构建在 [Hermes Agent](https://github.com/NousResearch/hermes-agent) 之上。它将工作区转变为一个实时控制平面：多个 Hermes Agent 以持久 tmux 会话运行，由 Orchestrator 统一调度，通过结构化 checkpoint 进行通信。

### 核心设计原则

- **Profile 隔离**：每个 Worker 是独立的 Hermes Agent Profile（`~/.hermes/profiles/<worker-id>/`）
- **tmux 持久化**：Worker 运行在 tmux 会话中，跨任务保持上下文
- **Checkpoint 通信**：Worker 通过结构化文本块报告状态，而非自由格式消息
- **文件系统状态总线**：`runtime.json` 记录每个 Worker 的运行时状态
- **证据驱动**：Checkpoint 必须包含可验证的证据（文件变更、命令输出），而非主观描述

### 技术栈

```
┌──────────────────────────────────────────────────────────┐
│                    Hermes Workspace                       │
│  React + TanStack Router + Vite + TypeScript (Web UI)    │
│  Node.js 服务端 (API routes, tmux 管理, 通知路由)         │
└──────────────────────┬───────────────────────────────────┘
                       │ HTTP API
┌──────────────────────▼───────────────────────────────────┐
│                    Hermes Agent                           │
│  Gateway (:8642) — chat, models, streaming, jobs         │
│  Dashboard (:9119) — sessions, skills, config, MCP       │
│  Kanban Plugin — SQLite 任务存储 + Dispatcher             │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 核心架构层

### 2.1 架构分层图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户交互层                                 │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────────┐  │
│  │  Chat    │  │  Swarm2   │  │  Tasks   │  │  Dashboard    │  │
│  │  (对话)   │  │  (控制平面) │  │  (任务)   │  │  (总览)       │  │
│  └──────────┘  └─────┬─────┘  └──────────┘  └───────────────┘  │
├──────────────────────┼──────────────────────────────────────────┤
│                  API 路由层 (:3000)                               │
│  ┌──────────────────┼──────────────────────────────────────┐    │
│  │ /api/swarm-dispatch    → 派发任务到 Worker               │    │
│  │ /api/swarm-roster      → Worker 花名册                   │    │
│  │ /api/swarm-runtime     → Worker 运行时状态               │    │
│  │ /api/swarm-missions    → Mission 历史                    │    │
│  │ /api/swarm-kanban      → 看板 CRUD                       │    │
│  │ /api/swarm-direct-chat → 直接向 Worker 发送消息          │    │
│  │ /api/conductor-spawn   → Conductor 任务启动              │    │
│  │ /api/swarm-orchestrator-loop → 自动编排循环              │    │
│  └──────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────┤
│                     服务端模块层                                  │
│  ┌─────────────────────┐  ┌──────────────────────────────┐      │
│  │ swarm-foundation.ts  │  │ swarm-notifications.ts       │      │
│  │ (路径/profile管理)    │  │ (通知路由与发布)              │      │
│  ├─────────────────────┤  ├──────────────────────────────┤      │
│  │ swarm-roster.ts      │  │ swarm-checkpoints.ts         │      │
│  │ (swarm.yaml 解析)    │  │ (Checkpoint 解析与契约)       │      │
│  ├─────────────────────┤  ├──────────────────────────────┤      │
│  │ swarm-missions.ts    │  │ swarm-mode.ts                │      │
│  │ (Mission 持久化)      │  │ (auto/manual 控制模式)        │      │
│  ├─────────────────────┤  ├──────────────────────────────┤      │
│  │ kanban-backend.ts    │  │ swarm-kanban-store.ts        │      │
│  │ (三层看板后端)         │  │ (本地 JSON 看板存储)          │      │
│  └─────────────────────┘  └──────────────────────────────┘      │
├──────────────────────────────────────────────────────────────────┤
│                    基础设施层 (tmux + 文件系统)                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  tmux sessions: swarm-orchestrator, swarm-builder, ...   │   │
│  │  runtime.json: ~/.hermes/profiles/<worker>/runtime.json  │   │
│  │  swarm.yaml: <repo>/swarm.yaml                           │   │
│  │  kanban.db: ~/.hermes/kanban.db (SQLite)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Worker 定义 (swarm.yaml)

`swarm.yaml` 是 Swarm 系统的配置中心，定义了所有 Worker 的身份和能力：

```yaml
# 完整字段以仓库根目录 swarm.yaml 为准；示意：
workers:
  - id: orchestrator
    wrapper: orchestrator:plan
  - id: researcher
    wrapper: researcher:quick
  - id: architect
    wrapper: architect:design
  - id: developer
    wrapper: developer:implement
  - id: writer
    wrapper: writer:author
  - id: learning
    wrapper: learning
```

每个 Worker 对应：
- **Profile**: `~/.hermes/profiles/<worker-id>/` 下的独立 Hermes Agent 配置
- **Wrapper**: `~/.local/bin/` 下的启动脚本
- **Skills**: 注入到 Agent system prompt 的专业技能

### 2.3 运行时状态 (runtime.json)

每个 Worker 的 `runtime.json` 是文件系统状态总线的核心：

```json
{
  "workerId": "builder",
  "role": "builder",
  "state": "running",
  "phase": "executing",
  "currentTask": "Implement rate limiter",
  "checkpointStatus": null,
  "lastSummary": "Shipped rate limiter — token bucket...",
  "nextAction": "awaiting review",
  "blockedReason": null
}
```

所有组件通过读写此文件同步状态，无需中心化状态服务。

---

## 3. 多 Agent 协同机制

### 3.1 协同架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                         用户 (Eric)                                   │
│                            │                                         │
│                    意图 / 审批 / 判断                                  │
│                            ▼                                         │
│  ┌──────────────────────────────────────────────────────┐            │
│  │                   Aurora (主 Agent)                    │            │
│  │         将意图翻译为 SwarmBrief / 任务分解              │            │
│  └──────────────────────┬───────────────────────────────┘            │
│                         │ SwarmBrief                                │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────────────┐            │
│  │               Orchestrator (编排器)                    │            │
│  │   ┌─────────────────────────────────────────────┐    │            │
│  │   │  • 接收 checkpoint 通知                       │    │            │
│  │   │  • 决定下一步: continue / repair / review    │    │            │
│  │   │  • 调用 POST /api/swarm-dispatch 派发        │    │            │
│  │   │  • 自动编排循环 (swarm-orchestrator-loop)     │    │            │
│  │   └─────────────────────────────────────────────┘    │            │
│  └──┬──────────┬──────────┬──────────┬──────────────────┘            │
│     │          │          │          │                               │
│     ▼          ▼          ▼          ▼                               │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐                            │
│  │Builder│ │Review│ │  QA  │ │Researcher│  ...                       │
│  │  tmux │ │ tmux │ │ tmux │ │   tmux   │                            │
│  └──┬───┘ └──┬───┘ └──┬───┘ └────┬─────┘                            │
│     │        │        │          │                                    │
│     │  结构化 Checkpoint (runtime.json + 对话历史)                     │
│     │        │        │          │                                    │
│     └────────┴────────┴──────────┘                                    │
│                    │                                                  │
│                    ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐            │
│  │           通知路由 (swarm-notifications.ts)            │            │
│  │   • DONE/HANDOFF/BLOCKED → Orchestrator              │            │
│  │   • NEEDS_INPUT → 主会话升级                          │            │
│  │   • 去重: checkpoint 签名 + 已处理集合                 │            │
│  └──────────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 通信机制：tmux 注入

Worker 间通信的核心是 **tmux send-keys**，而非 HTTP 回调或消息队列：

```
┌─────────────┐    tmux load-buffer     ┌──────────────────┐
│  dispatch   │ ──────────────────────▶ │  Worker tmux      │
│  server     │    + paste-buffer       │  session          │
│             │    + 双重 Enter          │                   │
└─────────────┘                         │  hermes agent     │
       │                                │  (profile:builder) │
       │  轮询 runtime.json             │                   │
       │  和对话历史                     └──────────────────┘
       │                                        │
       │  读取 checkpoint                       │ 写入 checkpoint
       ▼                                        ▼
┌─────────────────────────────────────────────────────┐
│              runtime.json (文件系统)                  │
│  STATE: DONE | BLOCKED | NEEDS_INPUT | HANDOFF      │
│  FILES_CHANGED: [...]                                │
│  COMMANDS_RUN: [...]                                 │
│  RESULT: ...                                         │
└─────────────────────────────────────────────────────┘
```

**两种派发模式**：
1. **tmux 持久会话**（默认）：长任务，保持上下文，通过 `sendPromptToLiveSession()` 将完整 prompt 写入 `swarm-task.md` 后注入短指令
2. **oneshot 回退**：tmux 基础设施不可用（未安装）或 `HERMES_SWARM_FORCE_ONESHOT=1` 时使用 `hermes chat -q` 一次性执行

**fail-fast 规则**：tmux 已安装但 session 启动、paste 或 send-keys 失败时，派发直接报错，**不**静默回退 oneshot；由 Human Gate 或运维介入处理。

### 3.3 Checkpoint 契约

Worker 完成任务后返回结构化 checkpoint：

```text
STATE: DONE | BLOCKED | NEEDS_INPUT | HANDOFF | IN_PROGRESS | NEEDS_REVIEW
FILES_CHANGED: exact paths or none
COMMANDS_RUN: exact commands or none
RESULT: concrete result/proof
BLOCKER: blocker or none
NEXT_ACTION: exact recommended next action
```

**好的 checkpoint 包含证据，坏的 checkpoint 包含形容词。**

### 3.4 通知路由规则

| Checkpoint 状态 | 路由目标 | 说明 |
|---|---|---|
| `DONE` | Orchestrator | 任务完成，等待下一步指令 |
| `HANDOFF` | Orchestrator | 任务交接给其他 Worker |
| `BLOCKED` | Orchestrator | 遇到阻塞，需要决策 |
| `NEEDS_INPUT` | 主会话升级 | 需要人工输入 |
| Orchestrator 不可达 | 主会话升级 | 兜底升级 |

**去重机制**：
- `orchestratorProcessedRaw`：已处理的原始 checkpoint 集合
- `lastNotifiedCheckpointSignature`：上次通知的签名，防止重复通知

---

## 4. 派发流程详解

### 4.1 核心函数调用链

```
dispatchSwarmAssignments()                    [swarm-dispatch.ts:1018]
  │
  ├─ 解析 assignments (worker × task 映射)
  ├─ 创建 Mission 记录
  │
  └─ Promise.all(assignments.map(runWorker))
       │
       └─ runWorker()                         [swarm-dispatch.ts:760]
            │
            ├─ 1. 构建 prompt
            │     (任务描述 + checkpoint 契约 + 约束)
            │
            ├─ 2. 标记 runtime.json 状态
            │     state: "running", phase: "dispatched"
            │
            ├─ 3. 解析投递模式 resolveDeliveryMode()
            │     ├─ 默认 tmux（tmux 可用时）
            │     ├─ HERMES_SWARM_FORCE_ONESHOT=1 → oneshot
            │     └─ tmux 不可用 → oneshot + deliveryFallback=tmux_unavailable
            │
            ├─ 4. tmux 注入（默认）
            │     └─ sendPromptToLiveSession()  [swarm-dispatch.ts]
            │          ├─ 写 swarm-task.md（完整 prompt）
            │          ├─ tmux load-buffer + paste-buffer（短指令）
            │          └─ tmux send-keys Enter Enter
            │     运行期失败 → fail-fast，不静默回退
            │
            ├─ 5. oneshot 回退（仅 tmux 不可用或强制）
            │     └─ wrapper `hermes chat -q "<prompt>"`
            │
            ├─ 6. 等待 checkpoint
            │     └─ waitForFreshCheckpoint()   [swarm-dispatch.ts]
            │          轮询 runtime.json + 对话历史
            │          oneshot 在 stdout 无 checkpoint 时同样走此路径
            │
            ├─ 7. 记录结果
            │     └─ markCheckpointResult()
            │
            └─ 8. 返回 { workerId, delivery, checkpoint, ... }
```

### 4.2 Orchestrator 的三种调用路径

#### 路径 A: Conductor 原生派发

```
用户 → Conductor UI → conductor-spawn.ts
  │
  ├─ mode: "dashboard" → 使用 Hermes Dashboard mission API
  │
  └─ mode: "native-swarm" → 直接调用 dispatchSwarmAssignments()
       │
       └─ 并行派发 builder + reviewer + qa ...
            │
            └─ 完成后 → checkpoint 通知 → Orchestrator tmux
```

#### 路径 B: 自动编排循环

```
swarm-orchestrator-loop.ts (独立 API 端点)
  │
  ├─ 轮询所有 Worker 的 runtime.json
  ├─ 检测 DONE/BLOCKED 状态
  ├─ 自动决定下一步 (continue/repair/review)
  └─ 调用 POST /api/swarm-dispatch 续派
```

#### 路径 C: 直接 API 调用

```
外部系统 / 脚本 → POST /api/swarm-dispatch
  │
  └─ { assignments: [{ workerId: "builder", task: "..." }] }
       │
       └─ dispatchSwarmAssignments()
```

### 4.3 Orchestrator 的被动响应模式

Orchestrator **不是**独立调度进程，而是一个普通 Worker Profile，运行在 tmux 会话中：

1. 其他 Worker 完成任务 → checkpoint 写入 runtime.json
2. `swarm-notifications.ts` 检测到新 checkpoint
3. 通过 tmux send-keys 将 checkpoint 注入 Orchestrator 的 tmux 会话
4. Orchestrator Agent 读取 checkpoint，决定下一步
5. Orchestrator 自行调用 `POST /api/swarm-dispatch` 派发下一轮任务

---

## 5. Swarm Board 与 Hermes Kanban 的关系

### 5.1 两套系统对比

| 维度 | Hermes 内置 Kanban | Swarm Board（工作区看板） |
|---|---|---|
| **存储** | SQLite (`~/.hermes/kanban.db`) | JSON 文件 (`~/.hermes/swarm2-kanban.json`) |
| **派发机制** | 内置 Dispatcher，自动 spawn worker 进程 | `swarm-dispatch.ts`，通过 tmux 注入 prompt |
| **任务生命周期** | triage → todo → ready → running → done/blocked | backlog → todo → ready → running → review → blocked → done |
| **Worker 通信** | 进程级，通过 `KANBAN_GUIDANCE` 注入 system prompt | tmux 会话级，通过 checkpoint 结构化文本 |
| **依赖管理** | 内置 parent/child 门控（父任务 done 后子任务自动 ready） | 无内置依赖，由 Orchestrator 手动编排 |
| **心跳/超时** | 内置 heartbeat、max_runtime、retry 诊断 | 无内置，由 `swarm-orchestrator-loop.ts` 轮询 |
| **UI** | `hermes kanban` CLI + Dashboard 插件 | Swarm2 Web UI 中的 `<Swarm2KanbanBoard>` 组件 |

### 5.2 数据桥接：三层后端

```
┌─────────────────────────────────────────────────────┐
│                  Swarm Board UI                      │
│            (swarm2-kanban-board.tsx)                  │
└─────────────────────┬───────────────────────────────┘
                      │  GET/POST/PATCH /api/swarm-kanban
                      ▼
┌─────────────────────────────────────────────────────┐
│              kanban-backend.ts                       │
│   ┌──────────┐  ┌──────────────┐  ┌───────────────┐ │
│   │  local   │  │    claude    │  │ hermes-proxy  │ │
│   │ (JSON)   │  │  (SQLite直连)│  │  (HTTP代理)   │ │
│   └──────────┘  └──────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────┘
```

1. **`claude` 后端**（优先）：直接读写 Hermes Kanban 的 `kanban.db` SQLite 文件。这是**共享数据源**模式。

2. **`hermes-proxy` 后端**：通过 HTTP 代理访问 Hermes Dashboard 的 `/api/plugins/kanban/*` 路由。用于远程工作区场景。

3. **`local` 后端**（兜底）：纯 JSON 文件存储。当 Hermes Kanban 不可用时自动启用。

### 5.3 状态映射

```
Hermes Kanban          →    Swarm Board
─────────────────────────────────────────
triage / queued        →    backlog
todo                   →    todo
ready                  →    ready
running / claimed      →    running
(无对应)               →    review    ← Swarm 独有
blocked                →    blocked
done / complete        →    done
```

注意 `review` 是 Swarm Board 独有的泳道，Hermes Kanban 没有原生支持。写回时 `review` 被映射为 `ready`。

### 5.4 派发机制的独立性

**这是最关键的区别**——两套系统的派发路径完全不同：

```
Hermes Kanban 派发链:
  kanban_create() → SQLite INSERT → Dispatcher 轮询 → spawn worker 进程
       ↓
  worker 通过 KANBAN_GUIDANCE 注入 system prompt
       ↓
  worker 调用 kanban_complete() / kanban_block()

Swarm 派发链:
  Swarm Board 卡片 → 用户手动 Router 派发 → POST /api/swarm-dispatch
       ↓
  dispatchSwarmAssignments() → runWorker() → tmux send-keys 注入 prompt
       ↓
  worker 完成后写 runtime.json checkpoint
       ↓
  swarm-notifications.ts 通知 Orchestrator
```

**Swarm 不使用 Hermes Kanban 的 Dispatcher。** 即使 Swarm Board 从同一个 `kanban.db` 读取卡片，点击 "Run" 按钮触发的也是 Swarm 自己的 `swarm-dispatch.ts` 流程（tmux 注入），而不是 Hermes Kanban 的进程 spawn。

### 5.5 Kanban 技能的角色

`swarm.yaml` 中 Orchestrator 的 skills 列表包含 `kanban-orchestrator` 和 `kanban-worker`：

- **`kanban-orchestrator`**：教 Agent 如何分解任务、创建卡片、路由工作。核心规则是 "Decompose, don't execute"。
- **`kanban-worker`**：教 Agent worker 生命周期（orient → work → heartbeat → block/complete）。
- **`kanban-codex-lane`**：教 Agent 如何将 Codex CLI 作为隔离实现通道使用。

这些技能教 Agent **如何使用 Hermes Kanban 工具**（`kanban_create`、`kanban_complete`、`kanban_block` 等），但实际派发仍然走 Swarm 的 tmux 通道。

### 5.6 整体关系图

```
┌──────────────────────────────────────────────────────────┐
│                     Hermes Agent                          │
│  ┌────────────────────┐    ┌───────────────────────────┐ │
│  │   Hermes Kanban     │    │   Swarm Workspace         │ │
│  │  ┌──────────────┐  │    │  ┌─────────────────────┐  │ │
│  │  │ kanban.db    │◄─┼────┼──┤ Swarm Board (UI)    │  │ │
│  │  │ (SQLite)     │  │    │  │ swarm2-kanban.json  │  │ │
│  │  └──────┬───────┘  │    │  └─────────────────────┘  │ │
│  │         │           │    │           │                │ │
│  │  ┌──────▼───────┐  │    │  ┌────────▼──────────┐    │ │
│  │  │  Dispatcher  │  │    │  │ swarm-dispatch.ts │    │ │
│  │  │ (进程spawn)   │  │    │  │ (tmux注入)        │    │ │
│  │  └──────────────┘  │    │  └────────┬──────────┘    │ │
│  └────────────────────┘    │           │                │ │
│                             │  ┌────────▼──────────┐    │ │
│  ┌────────────────────┐    │  │  Worker tmux       │    │ │
│  │  Kanban Skills      │    │  │  sessions          │    │ │
│  │  - orchestrator     │    │  │  (builder,         │    │ │
│  │  - worker           │    │  │   reviewer, qa…)   │    │ │
│  │  - codex-lane       │    │  └───────────────────┘    │ │
│  └────────────────────┘    └───────────────────────────┘ │
└──────────────────────────────────────────────────────────┘

数据层：共享 kanban.db（通过 kanban-backend.ts 桥接）
派发层：完全独立（Dispatcher vs tmux）
技能层：教 Agent 使用 kanban_* 工具，但派发仍走 Swarm 通道
```

---

## 6. 关键数据结构

### 6.1 SwarmBrief（任务契约）

```yaml
brief_id: brief-<timestamp>-<slug>
worker: builder
project: hermes-workspace
goal: Implement rate limiter with token bucket algorithm
why_now: Needed for API protection
scope:
  - rate_limiter.py
  - tests/test_rate_limiter.py
deliverables:
  - src/rate_limiter.py
  - tests/test_rate_limiter.py
test_or_proof:
  - pytest tests/test_rate_limiter.py -v
constraints:
  - Must use token bucket algorithm
  - Must support user_id and IP fallback
checkpoint_contract:
  state: DONE
  files_changed: [src/rate_limiter.py, tests/test_rate_limiter.py]
  commands_run: [pytest tests/test_rate_limiter.py -v]
  proof: 14/14 tests pass
  next_action: Submit for review
  blockers: none
escalation:
  on_blocked: route to orchestrator
  on_done: route to reviewer
budget:
  wall_clock_hours: 2
```

### 6.2 Checkpoint（Worker 返回）

```text
STATE: DONE
FILES_CHANGED: src/rate_limiter.py, tests/test_rate_limiter.py
COMMANDS_RUN: pytest tests/test_rate_limiter.py -v
RESULT: 14/14 tests pass, token bucket with user_id primary + IP fallback
BLOCKER: none
NEXT_ACTION: Submit for code review by reviewer
```

### 6.3 runtime.json（Worker 状态）

```json
{
  "workerId": "builder",
  "role": "builder",
  "state": "running",
  "phase": "executing",
  "currentTask": "Implement rate limiter",
  "cwd": "/home/ramon.jing/hermes-workspace",
  "lastOutputTime": 1717800000000,
  "lastCheckin": 1717800000000,
  "lastSummary": "Shipped rate limiter — token bucket...",
  "nextAction": "awaiting review",
  "blockedReason": null,
  "checkpointStatus": "DONE",
  "taskCount": 42,
  "cronCount": 3
}
```

### 6.4 SwarmKanbanCard（看板卡片）

```typescript
type SwarmKanbanCard = {
  id: string
  title: string
  spec: string
  acceptanceCriteria: string[]
  assignedWorker: string | null
  reviewer: string | null
  status: 'backlog' | 'todo' | 'ready' | 'running' | 'review' | 'blocked' | 'done'
  missionId: string | null
  reportPath: string | null
  createdBy: string
  createdAt: number
  updatedAt: number
  parents?: string[]
  children?: string[]
  latestRun?: { summary?: string; outcome?: string; status?: string }
  source?: string
}
```

---

## 7. 文件索引

### 核心源代码

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/routes/api/swarm-dispatch.ts` | 1138 | 核心派发逻辑：`dispatchSwarmAssignments()`, `runWorker()`, `sendPromptToLiveSession()`, `waitForFreshCheckpoint()` |
| `src/routes/api/swarm-orchestrator-loop.ts` | ~600 | 自动编排循环：轮询 Worker 状态并自动续派 |
| `src/routes/api/swarm-roster.ts` | ~50 | Worker 花名册 API |
| `src/routes/api/conductor-spawn.ts` | 477 | Conductor 任务启动入口（dashboard / native-swarm 双模式） |
| `src/routes/api/swarm-direct-chat.ts` | 293 | 直接向 Worker tmux 会话发送消息 |
| `src/routes/api/swarm-kanban.ts` | 93 | 看板 CRUD API |
| `src/server/swarm-foundation.ts` | ~600 | 基础设施：路径、profile 管理 |
| `src/server/swarm-notifications.ts` | ~300 | 通知路由与发布 |
| `src/server/swarm-roster.ts` | ~180 | 读取 `swarm.yaml` 并校验 Worker 定义 |
| `src/server/swarm-checkpoints.ts` | ~120 | Checkpoint 解析与契约定义 |
| `src/server/swarm-mode.ts` | 63 | 控制模式（auto/manual）读写 |
| `src/server/swarm-missions.ts` | 478 | Mission 持久化与状态管理 |
| `src/server/kanban-backend.ts` | 629 | 三层看板后端（local / claude / hermes-proxy） |
| `src/server/swarm-kanban-store.ts` | 161 | 本地 JSON 看板存储 |
| `src/server/kanban-dashboard-proxy.ts` | 203 | Hermes Dashboard Kanban 插件 HTTP 代理 |
| `src/server/claude-tasks-backend.ts` | 166 | Claude Tasks 兼容层 |
| `src/screens/swarm2/swarm2-screen.tsx` | 1774 | Swarm2 主界面 |
| `src/screens/swarm2/swarm2-kanban-board.tsx` | 503 | 看板 UI 组件 |
| `src/lib/tasks-api.ts` | 263 | 任务 API 客户端（自动后端检测） |

### 配置文件

| 文件 | 职责 |
|---|---|
| `swarm.yaml` | Worker 定义、角色、工具、技能配置 |
| `AGENTS.md` | Agent 契约与操作规则 |
| `docs/swarm/ARCHITECTURE.md` | Swarm 架构文档 |

### Skills（技能文件）

| Skill | 路径 | 职责 |
|---|---|---|
| `kanban-orchestrator` | `devops/kanban-orchestrator/` | 任务分解、卡片创建、路由编排 |
| `kanban-worker` | `devops/kanban-worker/` | Worker 生命周期、handoff 格式、pitfalls |
| `kanban-codex-lane` | `autonomous-ai-agents/kanban-codex-lane/` | Codex CLI 作为隔离实现通道 |
| `hermes-agent` | (内置) | Hermes Agent 配置与扩展指南 |

---

## 附录：一句话总结

> **Swarm 是一个基于 Profile 隔离 + tmux 持久会话 + 文件系统状态总线 + 结构化 Checkpoint 的多 Agent 协同系统。Swarm Board 是 Hermes Kanban 的可视化 + 替代派发层——共享数据存储，但用自己的 tmux + checkpoint 机制替代了 Hermes Kanban 的进程 Dispatcher。Orchestrator 不是独立调度进程，而是一个被动响应的 Agent Profile，通过接收 checkpoint 通知来决定下一步派发。**
