# Swarm 派发指南

一句话：**Hermes Swarm 的「真派发」是 `POST /api/swarm-dispatch`（tmux 注入 + checkpoint）**。其它名字（`workspace-dispatch`、`kanban_create`、`delegate_task`、wrapper）是不同层的东西，不要混用。

角色交接与升级：[`HANDOFF-PROTOCOL.md`](./HANDOFF-PROTOCOL.md) · [`ESCALATION-GUIDE.md`](./ESCALATION-GUIDE.md)。

---

## 1. 先分清两件事

| 概念 | 是什么 |
|------|--------|
| **Swarm** | `swarm.yaml` 里定义的 worker：`orchestrator`、`researcher`、`architect`、`developer`、`writer`、`learning`。各有 profile、模型、tmux 会话。architect 在规格阶段选定 `executor: developer \| writer`（互斥，不双轨并行）。 |
| **Hermes Kanban** | 通用任务看板（`kanban.db`）。`kanban_create` 等工具属于这一层。 |

Swarm Board **读** Kanban 数据，但点「Run」派发 worker 时走的是 **Swarm 自己的** `/api/swarm-dispatch`，不是 Kanban Dispatcher。

---

## 2. 五种机制（一张表）

| # | 名字 | 本质 | 谁有 | 跨 profile | 等结果 | 典型场景 |
|---|------|------|------|------------|--------|----------|
| **①** | **`POST /api/swarm-dispatch`** | Workspace 服务端把任务 **paste 进 worker 的 tmux**，轮询 checkpoint | Workspace 跑着时；CLI 用 `curl` 调 | ✅ `workerId` | ✅ `waitForCheckpoint` | **正式多 agent 任务**、LangGraph Phase 2、Swarm2 UI |
| **②** | **CLI wrapper** | `researcher:quick` 等 → `hermes -p <profile> chat -q` | 终端 | ✅ 每个 wrapper 不同 `-p` | ❌ 看终端输出 | **无 Workspace**、一次性任务、autoresearch 派发 |
| **③** | **`delegate_task`** | 父 agent 起 **同 profile 子 agent** | CLI orchestrator | ❌ 同模型 | 后台通知 | orchestrator **内部**并行子任务 |
| **④** | **`kanban_create`** | 往 Kanban **写卡片**；Hermes Kanban Dispatcher 另有一套 spawn | CLI orchestrator | 卡片可写 assignee | 轮询 Kanban 状态 | **规划、分解、看板**；不等于 Swarm tmux 派发 |
| **⑤** | **`sessions_spawn` / `sessions_yield`** | 托管 agent 的会话编排（`workspace-dispatch` skill 原文） | 仅有 session 工具的 **托管环境** | ❌ 默认模型 | yield | Gateway/Workspace 内嵌 agent；**CLI `hermes -p orchestrator` 没有** |

**① 是 Swarm 设计的标准路径。② 是 CLI 下的实用替代。③④⑤ 不要当成「派 researcher 去调研」的主通道。**

---

## 3. 架构图（只记两条链）

```text
Swarm 派发链（orchestrator → researcher → architect → (developer | writer) → learning）
────────────────────────────────────────────────────────
  Orchestrator / UI / curl / LangGraph
           │
           ▼
  POST /api/swarm-dispatch
           │
           ▼
  tmux send-keys → swarm-researcher / swarm-architect / swarm-developer 或 swarm-writer / …
           │
           ▼
  worker 写 checkpoint (runtime.json / 会话)
           │
           ▼
  通知 orchestrator 继续下一轮（交接见 HANDOFF-PROTOCOL.md；executor 互斥）


Hermes Kanban 链（规划用，和上面不是同一条路）
────────────────────────────────────────────────────────
  kanban_create(assignee="researcher", ...)
           │
           ▼
  kanban.db ← Swarm Board 也读这里（仅数据共享）
           │
           ▼
  Kanban Dispatcher spawn（≠ swarm-dispatch.ts）
```

---

## 4. 按「你在哪跑 orchestrator」选方法

### A. Workspace 已启动（`pnpm dev`，:3000）

**首选 ① Swarm API**

```bash
curl -s -X POST http://127.0.0.1:3000/api/swarm-dispatch \
  -H 'Content-Type: application/json' \
  -d '{
    "assignments": [{
      "workerId": "researcher",
      "task": "Wiki-first 事实调研 X，结束输出 STATE: DONE checkpoint"
    }],
    "waitForCheckpoint": true,
    "checkpointPollSeconds": 120
  }'
```

前提：对应 worker 的 tmux 已存在（Swarm UI 里 Start，或 `POST /api/swarm-tmux-start`）。

CLI 里的 orchestrator：用 **`terminal` 工具执行上述 curl**。

### B. 只有终端 CLI（`hermes -p orchestrator`）

**没有** `sessions_spawn`，**不要**按 `workspace-dispatch` skill 下半段的 spawn/yield 去做。

| 目的 | 用法 |
|------|------|
| 派 researcher / architect / developer 干活 | **②** `terminal` 跑 wrapper：`researcher:quick chat -q "..."` |
| 要 checkpoint 契约 + 多 worker 串联 | 先起 Workspace，回到 **①** |
| orchestrator 自己拆的小步、同模型 | **③** `delegate_task` |
| 只分解任务、上板 | **④** `kanban_create`（执行仍要 ① 或 ②） |

### C. Autoresearch 专项

| 环境 | 派发方式 |
|------|----------|
| CLI | `orchestrator:autoresearch` 写契约 → `terminal` 跑 `architect:autoresearch` / `developer:autoresearch` |
| Workspace | `orchestrator:autoresearch` 或 API：`workerId: architect`，task 里带 contract 路径 |

见 [AUTORESEARCH-GUIDE.md](./AUTORESEARCH-GUIDE.md)。

---

## 5. 决策树（30 秒）

```text
需要派 swarm.yaml 里的 specialist（researcher/architect/developer）？
│
├─ 是 → Workspace (:3000) 在跑？
│      ├─ 是 → ① POST /api/swarm-dispatch（要 checkpoint 就 waitForCheckpoint）
│      └─ 否 → ② terminal + wrapper（oneshot，无统一 checkpoint）
│
├─ 只是 orchestrator 内部并行、不换 profile → ③ delegate_task
│
├─ 只是规划/看板、还没真要跑 worker → ④ kanban_create
│
└─ 看到 workspace-dispatch skill 里的 sessions_spawn？
       → ⑤ 仅托管 agent 环境；CLI orchestrator 跳过，用 ① 或 ②
```

---

## 6. 常见误区

| 误区 | 事实 |
|------|------|
| `workspace-dispatch` skill = Swarm 派发 | ❌ skill 名易误导；Swarm 真派发是 **`/api/swarm-dispatch`** |
| `kanban_create(assignee=researcher)` = 派 Swarm researcher | ❌ 写的是 Kanban 卡；Swarm tmux 派发仍要 **①** |
| `delegate_task` 能派到 researcher 模型 | ❌ 子 agent 跟父 **同 profile/模型** |
| CLI orchestrator 能用 `sessions_spawn` | ❌ 没有该工具 |
| wrapper 和 Swarm API 等价 | ❌ wrapper 是 oneshot CLI；API 是 tmux + checkpoint + mission 状态 |

---

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| [QUICKSTART.md](./QUICKSTART.md) §6 | Swarm API curl 示例 |
| [SWARM_ARCHITECTURE_OVERVIEW.md](./SWARM_ARCHITECTURE_OVERVIEW.md) §5.4 | Kanban vs Swarm 派发独立性 |
| [AUTORESEARCH-GUIDE.md](./AUTORESEARCH-GUIDE.md) | autoresearch 一键入口 |
| `skills/workspace-dispatch/SKILL.md` | 托管环境下的 sessions 编排（⑤） |
| `skills/swarm/orchestrator-core/SKILL.md` | orchestrator 路由契约 |

---

## 8. orchestrator 工具与机制对照

`swarm.yaml` 里 orchestrator 的 tools：

| tool | 对应机制 |
|------|----------|
| `terminal` | 执行 ① curl、② wrapper 命令 |
| `delegation` | ③ `delegate_task` |
| `kanban` | ④ `kanban_create` 等 |
| `clarify` | 向人确认（greenlight、wizard） |
| （无 sessions_spawn） | ⑤ 不在 CLI orchestrator |

**Skill `workspace-dispatch` 不在 orchestrator profile 上**（避免 CLI 误用 `sessions_spawn`）。Conductor 从文件读取该 skill；Swarm 派发见 ①。
