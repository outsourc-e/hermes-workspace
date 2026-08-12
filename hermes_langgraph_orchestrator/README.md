# Hermes LangGraph Swarm Orchestrator

LangGraph 作为 Hermes Swarm 的**确定性编排大脑**：加载 workflow.yaml → 校验 roster → 派发 worker → 等待 checkpoint → 路由到下一个 worker，支持人工门控与 resume。

---

## 目录

- [环境准备](#环境准备)
- [同步 Hermes Profiles](#同步-hermes-profiles)
- [重启 Workspace](#重启-workspace)
- [创建自定义编排任务](#创建自定义编排任务)
- [执行任务派发与编排](#执行任务派发与编排)
  - [真实编排](#真实编排)
  - [Mock 模式（CI / 无 Workspace）](#mock-模式ci--无-workspace)
  - [从 human gate 恢复](#从-human-gate-恢复)
- [查看与 Attach tmux](#查看与-attach-tmux)
- [状态与日志](#状态与日志)
- [常见问题](#常见问题)

---

## 环境准备

```bash
cd ~/hermes-workspace/hermes_langgraph_orchestrator
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

> 如果系统已安装全部依赖，也可以直接用 `python3 -m hermes_langgraph_orchestrator ...`。
> 但 Phase 2 的 SQLite checkpointer 需要 `langgraph-checkpoint-sqlite`，建议用上面的 venv。

### 从任意目录启动

`python -m` **只能跟模块名**，不能写路径（`-m ../hermes-workspace/...` 会报 `Relative module names not supported`）。
且 orchestrator 包默认**未装进 venv**，在非 workspace 目录下 `-m hermes_langgraph_orchestrator` 会报 `No module named ...`。

推荐三种方式（任选其一）：

**1. 包装脚本（推荐）**

```bash
# 可加 PATH，或直接用绝对路径
~/hermes-workspace/hermes_langgraph_orchestrator/bin/hermes-langgraph \
  --execute \
  --mission-id "research-vmc-$(date +%s)" \
  --goal "调研世界模型在VMC控制中的应用现状和发展趋势" \
  --workflow research_only
```

`--workflow` 支持短名（`research_only`）、相对 workspace 路径、或绝对路径。

**2. 直接运行 `__main__.py`**

```bash
~/hermes-workspace/hermes_langgraph_orchestrator/.venv/bin/python \
  ~/hermes-workspace/hermes_langgraph_orchestrator/__main__.py \
  --execute --mission-id test-001 --goal "..." --workflow research_only
```

**3. 设置 `PYTHONPATH` 后用 `-m`**

```bash
PYTHONPATH=~/hermes-workspace \
  ~/hermes-workspace/hermes_langgraph_orchestrator/.venv/bin/python \
  -m hermes_langgraph_orchestrator --execute ...
```

可选：在 venv 里 `pip install -e hermes_langgraph_orchestrator` 后，任意目录 `-m` 也能工作，并会安装 `hermes-langgraph` 命令。

---

## 同步 Hermes Profiles

`swarm.yaml` 是 roster **真源**（worker id、model、tools、skills、mission 等）。LangGraph dispatch / tmux 启动时，Hermes 实际读的是 `~/.hermes/profiles/<workerId>/` 下的运行时配置。改完 `swarm.yaml` 后需同步 profile，否则 roster 上的 model / toolsets 只是展示，worker 仍用旧配置。

### 三层对齐关系

```text
swarm.yaml                    ~/.hermes/profiles/<id>/           ~/.local/bin/
(roster 真源)            →    config.yaml / SOUL.md / skills   →   orchestrator:plan 等 wrapper
  model: provider/model-id     model.provider + model.default       hermes -p <profile>
  tools: [...]                 toolsets: [...]
  skills: [...]                skills/<skill>/SKILL.md
  mission / role               SOUL.md + memory/IDENTITY.md
```

运行时还会由 dispatch / tmux-start 自动调用 `syncSwarmProfileModel()` 同步 **model**；但 toolsets、SOUL、IDENTITY、swarm skills 需手动跑同步脚本。

### 一键同步

在仓库根目录执行：

```bash
cd ~/hermes-workspace

# 1. 同步 config.yaml（model + toolsets）、SOUL.md、memory/IDENTITY.md、skills/swarm/ 下的角色技能
node scripts/sync-swarm-profiles.mjs

# 2. 同步 autoresearch 技能与 wrapper（orchestrator:autoresearch-dispatch 等）
bash scripts/sync-autoresearch-skills.sh
```

`sync-swarm-profiles.mjs` 对每个 `swarm.yaml` worker 写入：

| 文件 | 来源字段 | 备注 |
|------|----------|------|
| `config.yaml` → `model.provider` / `model.default` | `model`（`provider/model-id`，见根目录 `swarm.yaml`） | |
| `config.yaml` → `toolsets` | `tools` | **learning** 为合并（union），保留原有 `hermes-cli` 等 |
| `config.yaml` → `kanban.orchestrator_profile` | orchestrator 固定为 `orchestrator` | |
| `SOUL.md` | `name`, `role`, `mission`, … | **learning** 保留 `agents/learning/SOUL.md` 教学人格，仅追加 swarm 扩展段 |
| `memory/IDENTITY.md` | 同上 + `skills`, `capabilities` | learning 额外标注 tutor + retrospective 双模式 |
| `skills/<skill>/` | `skills` 列表中存在于 `skills/swarm/` 的条目 | |

Hub / bundled 技能（`gstack-for-hermes`、`llm-wiki`、`obsidian` 等）不在 `skills/swarm/`，由 Hermes profile skills hub 提供，脚本会跳过。

### 当前 roster 与 profile 映射

| Worker | Wrapper | Modes |
|--------|---------|-------|
| `orchestrator` | `orchestrator:plan` | plan, autoresearch-dispatch |
| `researcher` | `researcher:quick` | quick |
| `architect` | `architect:design` | design, autoresearch |
| `developer` | `developer:implement` | implement, autoresearch |
| `writer` | `writer:author` | author, autoresearch |
| `learning` | `learning` | tutor + swarm retrospective（SOUL 合并，不覆盖） |

**Model：** 以根目录 [`swarm.yaml`](../swarm.yaml) 的 `model` 字段为准（勿在文档中硬编码）。改完后跑 `node scripts/sync-swarm-profiles.mjs`。角色/技能合同见 [`AGENTS.md`](../AGENTS.md)。

### 何时需要同步

- 修改 `swarm.yaml` 中的 `model`、`tools`、`skills`、`mission`、`role` 后
- 新增 worker 并创建 `~/.hermes/profiles/<id>/` 目录后
- 更新 `skills/swarm/` 下角色技能（`orchestrator-core`、`researcher-core` 等）后
- 启动 LangGraph 真实编排前，确认 profile 与 roster 一致

同步后若 worker tmux session 已在运行，建议重启 session 使新 toolsets / SOUL 生效：

```bash
curl -s -X POST http://localhost:3000/api/swarm-tmux-stop \
  -H 'Content-Type: application/json' -d '{"workerId":"researcher"}'
curl -s -X POST http://localhost:3000/api/swarm-tmux-start \
  -H 'Content-Type: application/json' -d '{"workerId":"researcher"}'
```

---

## 重启 Workspace

Workspace 必须运行在 `http://localhost:3000`，LangGraph orchestrator 通过它访问 roster、tmux、dispatch、mission 等 API。

### 1. 找到当前进程

```bash
lsof -i :3000
```

典型输出：

```text
COMMAND     PID       USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    1990100 ramon.jing   37u  IPv4 ...    0t0      TCP *:3000 (LISTEN)
```

### 2. 停止并重启

**方法 A：在原终端里操作**

找到你之前运行 `pnpm dev` 的窗口，按 `Ctrl + C`，然后：

```bash
cd ~/hermes-workspace
TMUX_BIN=/usr/bin/tmux pnpm dev
```

**方法 B：找不到原终端**

```bash
kill 1990100          # 把 PID 换成 lsof 看到的
# 确认端口释放
lsof -i :3000

# 重新启动
cd ~/hermes-workspace
TMUX_BIN=/usr/bin/tmux pnpm dev
```

### 3. 验证 Workspace 已恢复

```bash
curl -s http://localhost:3000/api/swarm-roster | python3 -m json.tool
curl -s -X POST http://localhost:3000/api/swarm-tmux-start \
  -H 'Content-Type: application/json' \
  -d '{"workerId":"researcher"}' | python3 -m json.tool
```

如果 tmux 返回 `spawn /opt/homebrew/bin/tmux ENOENT`，说明 `TMUX_BIN` 没传对，按方法 B 重启。

---

## 创建自定义编排任务

LangGraph **图结构是固定的**（init → dispatch → wait → classify → route → human gate）；**编排逻辑由 workflow YAML 声明**。换任务类型时：

1. 在 `hermes_langgraph_orchestrator/workflows/` 新建或复制一份 YAML
2. 确保 `entry` / `transitions` 里引用的 worker 都在 `swarm.yaml` roster 中
3. 启动 mission 时用 `--workflow <path|id>`（或 API 的 `workflowId`）指向该文件

> 未传 `--workflow` 时默认 `workflows/radw.yaml`（Research → Architect → Developer|Writer + Gate C/H）。编排逻辑完全由 workflow YAML 决定。

### 架构关系

```text
swarm.yaml          workflow.yaml              LangGraph 图
(roster 真源)   →   (状态机 / 路由规则)   →   (固定节点，读 YAML 做 route)
  researcher          entry: researcher          init_mission 校验 roster
  architect           transitions[]              route_workflow 匹配 verdict
  developer|writer    blockers.retry/escalate    human_approval 人工门控
  learning            settings.max_iterations
  orchestrator
```

当前 roster（`swarm.yaml`）：`orchestrator`、`researcher`、`architect`、`developer`、`writer`、`learning`。workflow 里出现的每个 worker id 必须在此列表中。

### 内置 workflow 示例

| 文件 | 入口 | 路径 | 适用场景 |
|---|---|---|---|
| `radw.yaml` | `researcher` | 调研 → 设计 → (developer\|writer) → 审查 + Harden | 默认全流程（Gate C/H） |
| `rdi.yaml` | `researcher` | 调研 → 设计 → developer → 审查 + Harden | 纯代码交付（无 writer 车道） |
| `research_only.yaml` | `researcher` | 调研 → architect 对抗审查（3 轮未达成一致 → Human Gate） | 纯调研、文献综述、选项备忘录 |
| `design_implement.yaml` | `architect` | 设计 → 实现 → 审查（跳过调研） | 需求已明确、直接设计与开发 |

### 第一步：编写 workflow YAML

最小模板：

```yaml
name: my_workflow
version: 1
entry: researcher          # 第一个派发的 worker
description: |
  一句话说明这条编排解决什么问题。

transitions:
  - from: researcher       # 哪个 worker 的 checkpoint 触发了这条边
    "on":
      verdict: DONE        # 匹配 WorkerClassification.verdict
      # review_outcome: approved   # 可选，architect 审查时常用
    to: architect          # 下一个 worker；null = 任务结束
    reason: "调研完成，进入设计"
    # max_iterations: 3    # 可选，限制 from→to 循环次数（审查环）

blockers:
  escalate:                # 这些 blocker_type → Human Gate
    - architecture_decision
    - missing_credential
  retry:                   # 这些 blocker_type → 自动重试同一 worker
    - timeout
    - test_failure
    - missing_dependency

settings:
  max_iterations: 5        # 全局路由轮数上限
  terminal_docs: false     # true 时启用 workflow 里声明的 terminal_docs 边
```

**路由匹配规则**（`workflow.py` → `route_by_workflow`）：

| checkpoint 状态 | 行为 |
|---|---|
| `SKIP` | 继续轮询，不派发 |
| `BLOCKED` + `blockers.retry` | 重试同一 worker |
| `BLOCKED` / `NEEDS_INPUT` / `HANDOFF`（其他） | Human Gate |
| `DONE` | 按 `transitions` 第一条匹配的边派发；`to: null` 则 finalize |
| 无匹配 transition | Human Gate（避免静默结束） |

`transitions` 按文件顺序匹配；更具体的边（带 `review_outcome`）应写在更泛的边**前面**（参考 `design_implement.yaml`）。

### 第二步：校验 workflow

```bash
cd ~/hermes-workspace

hermes_langgraph_orchestrator/.venv/bin/python -c "
from hermes_langgraph_orchestrator.workflow import load_workflow, validate_workflow_against_roster
wf = load_workflow('hermes_langgraph_orchestrator/workflows/research_only.yaml')
roster = {'orchestrator','researcher','architect','developer','writer','learning'}
print('OK' if not validate_workflow_against_roster(wf, roster) else validate_workflow_against_roster(wf, roster))
"
```

或跑单元测试：

```bash
hermes_langgraph_orchestrator/.venv/bin/python -m pytest \
  tests/test_langgraph_orchestrator.py::test_load_default_workflow -v
```

### 第三步：启动 mission（非默认 RADW）

**纯调研任务**（`research_only.yaml`）：researcher 完成调研后由 architect 做对抗审查；双方通过 `REVIEW_OUTCOME: approved|changes_requested` 协商。`architect→researcher` 修订环最多 3 次，仍不一致则 Human Gate 梳理分歧点由人工裁决。

```bash
hermes-langgraph \
  --execute \
  --mission-id research-memo-001 \
  --goal "调研某领域方案现状与关键技术取舍" \
  --workflow research_only
```

**跳过调研，直接设计+实现**（`design_implement.yaml`）：

```bash
hermes_langgraph_orchestrator/.venv/bin/python -m hermes_langgraph_orchestrator \
  --execute \
  --mission-id impl-from-spec-001 \
  --goal "按已有 ARCHITECTURE.md 实现 half_car + lqr 模块" \
  --workflow hermes_langgraph_orchestrator/workflows/design_implement.yaml
```

**HTTP API**（`workflowId` = YAML 路径）：

```bash
curl -s -X POST http://127.0.0.1:3000/api/swarm-langgraph/run \
  -H 'Content-Type: application/json' \
  -d '{
    "missionGoal": "调研 JAX 在车辆悬架建模中的实践",
    "missionId": "research-memo-002",
    "workflowId": "hermes_langgraph_orchestrator/workflows/research_only.yaml",
    "maxIterations": 8
  }' | python3 -m json.tool
```

**Dashboard**：`/swarm2` → **LangGraph** 面板可填可选 **Workflow**（如 `radw` / `research_only`）；留空则用默认 `radw.yaml`。

### `mission-id` 规则

- 每个新任务用**新的** `mission-id`（= LangGraph `thread_id`）
- 同一 ID 会复用 SQLite checkpoint；Human Gate 暂停的 mission 用 [`--resume`](#从-human-gate-恢复)，不要用相同 ID 重跑 `--execute`

### 新增 worker 时

若 workflow 需要 roster 里没有的角色（例如 `qa`、`builder`）：

1. 在 `swarm.yaml` 增加 worker 定义（wrapper / profile / skills 与 `AGENTS.md` 对齐）
2. 创建 `~/.hermes/profiles/<id>/` 并运行 [同步 Hermes Profiles](#同步-hermes-profiles)
3. 重启 Workspace（`pnpm dev`）让 roster API 生效
4. 在 workflow YAML 中引用新 `id`
5. `init_mission` 会在启动时校验；引用未知 worker 会直接失败并写入 `collection_error`

### 启动后验证

```bash
tmux ls
ls -t logs/execute_*.json | head -1
curl -s "http://127.0.0.1:3000/api/orchestrator-state?missionId=<id>" | python3 -m json.tool
```

日志里应出现 `[init_mission] workflow=<your_workflow_name>`。

---

## 执行任务派发与编排

所有命令都从仓库根目录执行，且需要 **`--execute`**（查询状态用 `--get-state` / `--list-active-gates`）。

```bash
cd ~/hermes-workspace
```

### 真实编排

会真实启动 tmux session（默认 `tmux-tui`）、派发任务、等待 checkpoint、按 workflow YAML 自动路由。

**推荐（TUI paste 不稳定时）**：在 `hermes-workspace/.env` 加 `HERMES_SWARM_TMUX_MODE=cli`，重启 `pnpm dev`。

```bash
# .env
HERMES_SWARM_TMUX_MODE=cli
TMUX_BIN=/usr/bin/tmux
```

```bash
hermes_langgraph_orchestrator/.venv/bin/python -m hermes_langgraph_orchestrator \
  --execute --mission-id radw-real-001 \
  --goal "调研并交付可验证的实现"
```

流程示例（默认 RADW）：

```text
researcher → architect → (developer | writer) → architect(review+harden) → done
```

### Mock 模式（CI / 无 Workspace）

适合 CI 或没有启动 Workspace 时验证编排流程（`--mock-services`，按 workflow 合成 checkpoint，不调用真实 tmux/dispatch API）。

```bash
# 默认 RADW + generic（happy path，含 Gate H pass）
hermes_langgraph_orchestrator/.venv/bin/python -m hermes_langgraph_orchestrator \
  --execute --mock-services --mission-id radw-mock-001

# developer 首次 BLOCKED → Human Gate（测 resume）
hermes-langgraph --execute --mock-services --mock-profile blocked_once \
  --mission-id blocked-mock-001

# 指定 workflow（generic：一轮审查后通过）
hermes-langgraph --execute --mock-services --workflow research_only \
  --mission-id research-mock-001 --goal "调研 mock"

# 测试 Human Gate（architect 始终 changes_requested，审查环触顶）
hermes-langgraph --execute --mock-services --workflow research_only \
  --mock-profile human_gate --mission-id research-gate-mock-001
```

**`--mock-profile` 策略**

| Profile | 用途 |
|---------|------|
| `auto` | 等同 `generic` |
| `generic` | 通用：worker DONE；有审查环时 architect 先 `changes_requested` 再 `approved`（Gate H workflow 会带 `HARDEN_OUTCOME: pass`） |
| `blocked_once` | developer 首次 BLOCKED，二次 DONE（测 Human Gate / resume） |
| `cdc` | `blocked_once` 的废弃别名 |
| `human_gate` | architect 审查始终 `changes_requested`，用于测审查环触顶 → Human Gate |

`blocked_once` Mock 路径：

```text
researcher → architect → developer(BLOCKED) → human gate
resume approved → developer DONE → architect approved(+harden) → finalize
```

### 从 human gate 恢复

**Dashboard（推荐）：** 打开 `/swarm2`，Human Gate 面板提供两个预设选项 + 自定义说明框，点 **确认并继续** 或 **中止**。

**CLI：**

```bash
hermes_langgraph_orchestrator/.venv/bin/python -m hermes_langgraph_orchestrator \
  --execute --mission-id radw-real-001 --resume approved

# 或放弃当前 mission
hermes_langgraph_orchestrator/.venv/bin/python -m hermes_langgraph_orchestrator \
  --execute --mission-id radw-real-001 --resume abort
```

**HTTP API：**

```bash
# 继续（可带人工决策）
curl -s -X POST http://127.0.0.1:3000/api/swarm-langgraph/resume \
  -H 'Content-Type: application/json' \
  -d '{
    "missionId": "radw-real-001",
    "action": "approved",
    "choice": "primary",
    "targetWorkerId": "developer",
    "humanNote": "先修 P0：half_car 字段顺序"
  }' | python3 -m json.tool
```

`choice`：`primary` | `secondary` | `custom`（仅填自定义说明时）。`action`：`approved` | `abort`。

恢复依赖 SQLite checkpointer，默认路径 `~/.hermes/langgraph-checkpoints.db`。也可以用 `--checkpoint-path` 自定义。

### 常用 CLI 参数

| 参数 | 说明 |
|---|---|
| `--execute` | 运行 LangGraph 编排（必须，除非 `--get-state` / `--list-active-gates`） |
| `--mock-services` | mock init/ensure/dispatch/classify，不依赖 Workspace |
| `--mock-profile auto\|generic\|blocked_once\|cdc\|human_gate` | mock checkpoint 策略（需配合 `--mock-services`） |
| `--mission-id <id>` | mission 标识，也是 LangGraph thread_id |
| `--goal "..."` | 自定义 mission goal |
| `--initial-workers researcher,architect` | 跳过 workflow entry，直接派发指定 worker |
| `--max-iterations 5` | 最大路由轮数 |
| `--workflow path/to.yaml` | 自定义 workflow YAML（默认 `workflows/radw.yaml`） |
| `--checkpoint-path path.db` | 自定义 SQLite checkpointer |
| `--resume approved\|abort` | 从 human gate 恢复 |
| `--get-state` | 读取 mission 状态（JSON） |
| `--list-active-gates` | 列出所有 Human Gate 暂停的 mission |

---

## 查看与 Attach tmux

每个 worker 对应一个 tmux session：`swarm-<workerId>`。

### 查看有几个正在运行的 tmux

```bash
tmux ls
```

典型输出：

```text
swarm-researcher: 1 windows (created Fri Jun 12 13:06:12 2026) [80x24]
swarm-architect: 1 windows (created Fri Jun 12 13:08:45 2026) [80x24]
```

### Attach 到某个 worker 的 tmux

```bash
tmux attach -t swarm-researcher
```

> **已在 tmux 内时**：不要嵌套 `attach`（会报 `sessions should be nested with care`）。改用：
>
> ```bash
> tmux switch-client -t swarm-architect   # 切换到目标 session
> # 或先 Ctrl+b d detach，再 tmux attach -t swarm-architect
> ```
>
> 不进入 session 也可查看输出：`tmux capture-pane -t swarm-architect -p | tail -80`

Attach 后按 `Ctrl + B` 再按 `D` 可以** detach**（保持 session 后台运行）。

### 批量查看所有 swarm session

```bash
for s in $(tmux ls -F '#{session_name}' | grep '^swarm-'); do
  echo "=== $s ==="
  tmux capture-pane -p -t "$s" -S -20
done
```

### 结束某个 worker session

```bash
tmux kill-session -t swarm-researcher
```

或者通过 Workspace API：

```bash
curl -s -X POST http://localhost:3000/api/swarm-tmux-stop \
  -H 'Content-Type: application/json' \
  -d '{"workerId":"researcher"}' | python3 -m json.tool
```

---

## 状态与日志

### LangGraph 执行日志

```bash
ls logs/
# execute_<mission>_<timestamp>.json
```

### SQLite checkpointer

默认在 `~/.hermes/langgraph-checkpoints.db`，可以用 sqlite3 查看：

```bash
sqlite3 ~/.hermes/langgraph-checkpoints.db "SELECT thread_id, checkpoint_id FROM checkpoints ORDER BY checkpoint_id DESC LIMIT 10;"
```

### Mission 状态

```bash
curl -s "http://localhost:3000/api/swarm-missions?id=radw-real-001" | python3 -m json.tool
```

---

## Tmux Worker 生命周期（Swarm2 Runtime）

| 步骤 | API | 行为 |
|------|-----|------|
| 创建 | `POST /api/swarm-tmux-start` | `tmux new-session -d -s swarm-<role> "<shell\|hermes --tui>"` |
| 分发 | `POST /api/swarm-dispatch` | `tmux send-keys` 注入任务（TUI paste 或 CLI `hermes chat -q`） |
| 交互 | `POST /api/swarm-tmux-scroll` | copy-mode 滚动；Runtime 通过 `capture-pane` 读输出 |
| 销毁 | `POST /api/swarm-tmux-stop` | `tmux kill-session` |

派发模式：

| 模式 | 环境变量 / `deliveryMode` | 创建 | 分发 |
|------|---------------------------|------|------|
| `tmux-tui` | 默认 | `hermes chat --tui` | paste SwarmBrief 进 TUI |
| `tmux-cli` | `HERMES_SWARM_TMUX_MODE=cli` | `bash -l` + Hermes env | `send-keys` 跑 `swarm-run.sh` |
| `oneshot` | `HERMES_SWARM_FORCE_ONESHOT=1` | 无 tmux | 直接 `hermes chat -q` |

---

## 常见问题

### 0. `Failed to fetch roster` / `Workspace timed out` / preflight failed

Phase 2 真实执行依赖 **Hermes Workspace**（`:3000`）。常见根因：

1. **`pnpm dev` 刚启动**：Vite 首次编译 SSR API 路由可能 **>5s**，旧版 preflight 会误报 timeout。现已自动重试最多 6 次（读超时 12s/次）。
2. **Workspace 未运行**：先 `pnpm dev`，等 Vite ready 后再跑 LangGraph。

```bash
cd hermes-workspace && pnpm dev
curl -s http://127.0.0.1:3000/api/swarm-roster | head
```

CLI 启动时会自动加载 `hermes-workspace/.env`（不覆盖已有环境变量）。若启用了 `HERMES_PASSWORD`，设置 `HERMES_WORKSPACE_TOKEN`。

CLI 会在 `--execute` 前做 preflight；也可手动指定 API 地址：`--swarm-url http://127.0.0.1:3000/api`。

### 1. `ensure_sessions researcher: error (Server error '500' ... ENOENT)`

Workspace 没找到 tmux。重启 Workspace 时带 `TMUX_BIN`：

```bash
TMUX_BIN=/usr/bin/tmux pnpm dev
```

### 2. `researcher=SKIP` 后进入 human gate

这发生在真实执行早期：dispatch 返回了 `IN_PROGRESS` checkpoint。当前版本已加入 `wait_for_checkpoints` 轮询，会等到 researcher 完成后再路由，不再误判为人工门控。

### 3. Phase 2 真实执行卡住/超时

- 检查 worker tmux 是否还在：`tmux ls`
- Attach 看 worker 在干嘛：`tmux attach -t swarm-researcher`
- 检查 mission 状态：`curl /api/swarm-missions?id=<missionId>`
- 如果 worker 长时间不产出 checkpoint，会超时进 human gate，可用 `--resume approved` 重试

### 4. 如何运行测试

```bash
hermes_langgraph_orchestrator/.venv/bin/python -m pytest tests/test_langgraph_orchestrator.py -v
```
