# RDI Workflow Progress-Based Stall Monitor 改造计划

> 目标：将 RDI workflow 的固定 wall-clock timeout 替换为基于子 Agent 进展的 stall monitor，避免误杀稳定推进的长任务，并确保属主会话总能收到一个结局（完成/stall/人工决策）。

---

## 1. 背景与问题

### 1.1 当前机制

当前 RDI workflow 使用固定轮询超时：

- `wait_for_checkpoints` 每 10 秒轮询一次
- 最多 90 次（15 分钟）未收到 terminal checkpoint 即触发 `timeout` blocker
- `timeout` 在 `rdi.yaml` 的 `escalate` 列表中，直接上升到 Human Gate
- 后续即使把 `timeout` 移到 `retry`，仍然是"时间到了就重试/升级"的墙钟逻辑

### 1.2 已观测到的误杀

- 深度代码审查、大型研究、长时间终端命令等"一直在稳定推进"的任务
- 被固定 15 分钟墙钟超时误杀
- 用户被迫反复点击"继续等待"或"重试"

### 1.3 参考：Hermes 原生 stall monitor

Hermes 子 Agent 系统采用更精细的 stall 检测：

- **无固定 wall-clock 超时**
- **基于进展的监控**：采样 API 调用数、当前工具、最后 token 活动时间
- **有进展的子 Agent 永不被打扰**
- **完全冻结超过阈值才中断**：空闲 450s / 工具内 1200s（慢命令给更高上限）
- **温和中断 + 宽限期**：先中断，给 120s 交付部分结果；仍不返回才强制终结为 stalled
- **完成事件先落 state.db 再投递**：进程重启后可恢复未投递的完成事件
- **实时 transcript 日志**：`~/.hermes/cache/delegation/live/<delegation_id>/`
- **TUI /agents 面板**：实时树状视图、成本汇总、kill/pause 控制

---

## 2. 设计目标

1. **消除固定 wall-clock 超时**，改用 progress-based stall detection
2. **区分"稳定推进"、"工具内慢执行"、"完全冻结"三种状态**
3. **冻结后先温和中断 + 宽限期收集部分结果**，而非直接 Human Gate
4. **stall 后给出结构化结局**：部分 checkpoint、stall 原因、可选 Human Gate
5. **保留 Human Gate 作为最后兜底**，但仅用于真正需要人工判断的场景
6. **向后兼容**：已有 API 行为不破坏，新增 API 与监控器

---

## 3. 关键状态定义

### 3.1 Agent 进展状态

```typescript
type AgentProgressState =
  | 'idle'           // 会话存在但无活动
  | 'active'         // 持续产生 token 或 checkpoint 更新
  | 'in_tool'        // 当前在工具调用内（如 terminal 执行长命令）
  | 'stalled'        // 超过阈值无进展
  | 'grace_period'   // 已请求中断，等待交付部分结果
  | 'terminated'     // 已强制终结
```

### 3.2 阈值配置

```typescript
interface StallThresholds {
  idleMs: number        // 无任何 token/checkpoint 更新的最大空闲时间
  inToolMs: number      // 在单个工具内执行的最大时间（慢命令给更高上限）
  gracePeriodMs: number // 温和中断后等待部分结果的宽限时间
  slowToolMultiplier: number // 已知慢工具（terminal 长命令、git clone 等）的 inTool 倍率
}
```

建议默认值：

```typescript
const DEFAULT_THRESHOLDS: StallThresholds = {
  idleMs: 450_000,        // 7.5 分钟
  inToolMs: 1_200_000,    // 20 分钟
  gracePeriodMs: 120_000, // 2 分钟
  slowToolMultiplier: 2,   // 慢命令上限 40 分钟
}
```

### 3.3 活动样本

```typescript
interface AgentActivitySample {
  workerId: string
  missionId: string
  sessionId?: string
  sampledAt: number
  lastTokenAt: number | null      // 最后一个 token 流出的时间
  lastToolCallAt: number | null   // 最后一个工具调用的开始时间
  lastCheckpointAt: number | null // 最后一个 checkpoint 更新时间
  lastSummaryAt: number | null    // runtime 中 lastSummary 更新时间
  apiCallCount: number            // 已观测到的 API/工具调用总数
  currentTool: string | null      // 当前正在执行的工具名
  currentToolStartedAt: number | null
  paneBytes: number               // tmux pane 当前累积字节数
  paneBytesDelta: number          // 相比上次采样的字节变化
  paneSnapshot: string            // 截屏内容摘要（前 N 字符）
  runtimeState: string            // runtime.json 中的 state
  needsHuman: boolean
  blockedReason: string | null
}
```

---

## 4. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     LangGraph Orchestrator                       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │ wait_for_progress│ -> │ graceful_interrupt│ -> │ collect_partial│ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│         │                      │                      │         │
│         ▼                      ▼                      ▼         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              route_workflow (stalled handling)              │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   Swarm Stall Monitor (new)    │
              │  - sample()                    │
              │  - isStalled()                 │
              │  - requestGracefulInterrupt()  │
              │  - forceTerminate()            │
              └───────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌─────────┐    ┌──────────┐    ┌──────────┐
        │tmux pane│    │runtime.json│   │checkpoint│
        │capture   │    │lastOutputAt│   │harvester │
        └─────────┘    └──────────┘    └──────────┘
```

---

## 5. 需要新建/修改的文件

### 5.1 新增文件

| 文件 | 职责 |
|---|---|
| `src/server/swarm-stall-monitor.ts` | stall monitor 核心：采样、判断、中断、终结 |
| `src/server/swarm-tmux-activity.ts` | 读取 tmux pane 内容、字节数、检测当前工具 |
| `src/routes/api/swarm-stall-monitor.ts` | 暴露 HTTP API：sample / interrupt / terminate |
| `src/routes/api/swarm-stall-status.ts` | 返回当前所有 worker 的 stall 状态汇总 |
| `docs/plans/stall-monitor-plan.md` | 本计划文档 |

### 5.2 修改文件

| 文件 | 修改内容 |
|---|---|
| `hermes_langgraph_orchestrator/nodes.py` | 新增 `wait_for_progress` 节点；修改 `route_workflow` 处理 stalled；移除固定 `max_polls` 超时 |
| `hermes_langgraph_orchestrator/state.py` | 新增 `stall_state`, `grace_period_deadline`, `activity_samples` 等字段 |
| `hermes_langgraph_orchestrator/workflows/rdi.yaml` | 移除 `timeout` 从 escalate；新增 `stall` blocker 类型及阈值配置 |
| `src/routes/api/swarm-langgraph/resume.ts` | 支持 resume from stall（ approved / abort ） |
| `src/server/swarm-missions.ts` | 支持 stalled 状态持久化 |
| `src/server/swarm-runtime.ts` | 暴露更细粒度的活动信号（currentTool、lastTokenAt 等） |

---

## 6. 核心模块设计

### 6.1 `src/server/swarm-stall-monitor.ts`

```typescript
import type { AgentActivitySample, StallThresholds, StallMonitor } from './swarm-stall-monitor-types'

export class SwarmStallMonitor implements StallMonitor {
  private samples = new Map<string, AgentActivitySample>()
  private stallState = new Map<string, 'ok' | 'stalled' | 'grace_period' | 'terminated'>()
  private gracePeriodEndsAt = new Map<string, number>()

  constructor(
    private thresholds: StallThresholds = DEFAULT_THRESHOLDS,
    private tmuxActivity: TmuxActivityReader,
    private runtimeReader: RuntimeActivityReader,
    private checkpointReader: CheckpointActivityReader,
  ) {}

  async sample(workerId: string, missionId: string): Promise<AgentActivitySample> {
    const [tmux, runtime, checkpoint] = await Promise.all([
      this.tmuxActivity.read(workerId),
      this.runtimeReader.read(workerId),
      this.checkpointReader.readLatest(workerId, missionId),
    ])

    const now = Date.now()
    const lastTokenAt = maxNonNull(tmux.lastTokenAt, runtime.lastOutputAt, checkpoint.updatedAt)
    const lastToolCallAt = runtime.activeToolStartedAt ?? tmux.lastToolCallAt
    const currentTool = runtime.activeTool ?? tmux.inferredTool

    const sample: AgentActivitySample = {
      workerId,
      missionId,
      sessionId: runtime.sessionId,
      sampledAt: now,
      lastTokenAt,
      lastToolCallAt,
      lastCheckpointAt: checkpoint.updatedAt,
      lastSummaryAt: runtime.lastSummaryAt,
      apiCallCount: runtime.apiCallCount ?? tmux.apiCallCount ?? 0,
      currentTool,
      currentToolStartedAt: runtime.activeToolStartedAt,
      paneBytes: tmux.paneBytes,
      paneBytesDelta: tmux.paneBytes - (this.samples.get(workerId)?.paneBytes ?? 0),
      paneSnapshot: tmux.paneSnapshot.slice(-2000),
      runtimeState: runtime.state,
      needsHuman: runtime.needsHuman,
      blockedReason: runtime.blockedReason,
    }

    this.samples.set(workerId, sample)
    return sample
  }

  isStalled(sample: AgentActivitySample): boolean {
    const now = Date.now()
    const thresholds = this.thresholdsForTool(sample.currentTool)

    // 1.  pane 有字节变化或 checkpoint 在更新 -> 不 stall
    if (sample.paneBytesDelta > 0 || (sample.lastCheckpointAt && now - sample.lastCheckpointAt < thresholds.idleMs)) {
      return false
    }

    // 2. 在工具内，且时间未超过 inToolMs -> 不 stall
    if (sample.currentTool && sample.currentToolStartedAt && now - sample.currentToolStartedAt < thresholds.inToolMs) {
      return false
    }

    // 3. 完全没有 token 活动时间超过 idleMs -> stall
    if (!sample.lastTokenAt || now - sample.lastTokenAt > thresholds.idleMs) {
      return true
    }

    return false
  }

  async requestGracefulInterrupt(workerId: string): Promise<boolean> {
    // 发送 SIGINT 到 tmux pane 中的 foreground 进程
    // 等待 grace period，让 worker 有机会交付部分 checkpoint
    const sessionName = `swarm-${workerId}`
    await tmuxSendKeys(sessionName, 'C-c')
    this.stallState.set(workerId, 'grace_period')
    this.gracePeriodEndsAt.set(workerId, Date.now() + this.thresholds.gracePeriodMs)
    return true
  }

  async forceTerminate(workerId: string): Promise<void> {
    const sessionName = `swarm-${workerId}`
    await tmuxKillSession(sessionName)
    this.stallState.set(workerId, 'terminated')
  }

  private thresholdsForTool(tool: string | null): StallThresholds {
    const slowTools = ['terminal', 'bash', 'execute_code', 'git', 'npm', 'pnpm', 'pytest']
    if (tool && slowTools.some(t => tool.toLowerCase().includes(t))) {
      return {
        ...this.thresholds,
        inToolMs: this.thresholds.inToolMs * this.thresholds.slowToolMultiplier,
      }
    }
    return this.thresholds
  }
}
```

### 6.2 `src/server/swarm-tmux-activity.ts`

```typescript
export interface TmuxActivity {
  lastTokenAt: number | null
  lastToolCallAt: number | null
  paneBytes: number
  paneSnapshot: string
  inferredTool: string | null
  apiCallCount: number
}

export async function readTmuxActivity(workerId: string): Promise<TmuxActivity> {
  const sessionName = `swarm-${workerId}`
  const paneSnapshot = await tmuxCapturePane(sessionName)
  const bytes = Buffer.byteLength(paneSnapshot, 'utf8')

  // 推断当前工具：从 pane 内容匹配已知工具前缀
  const inferredTool = inferToolFromPane(paneSnapshot)

  // token 活动时间：通过检测 pane 中最近的 Hermes 输出时间戳或进度标记
  const lastTokenAt = extractLastTimestamp(paneSnapshot) ?? null

  // 工具调用时间：匹配 "Invoking tool: xxx" 等标记
  const lastToolCallAt = extractLastToolInvocation(paneSnapshot) ?? null

  return {
    lastTokenAt,
    lastToolCallAt,
    paneBytes: bytes,
    paneSnapshot,
    inferredTool,
    apiCallCount: countToolInvocations(paneSnapshot),
  }
}
```

### 6.3 `hermes_langgraph_orchestrator/nodes.py` 改造

#### 新增 `wait_for_progress` 节点

```python
async def wait_for_progress(state: OrchestratorState) -> dict:
    """
    Progress-based replacement for wait_for_checkpoints.
    
    - Polls /api/swarm-stall-monitor/{worker_id} every 10s.
    - Returns immediately if any terminal checkpoint is ready.
    - If a worker is stalled:
        1. Request graceful interrupt (SIGINT)
        2. Wait grace period
        3. Collect any partial checkpoint from harvester
        4. If nothing -> synthesize STALLED checkpoint
    """
    swarm_url = _swarm_api_url(state)
    assignments = state.get("langgraph_assignments", []) or []
    worker_ids = [a["worker_id"] for a in assignments]
    
    if not worker_ids:
        return {"log_entries": ["[wait_for_progress] no workers to monitor"]}
    
    # TODO: implement loop with stall-monitor API
    pass
```

#### 修改 `route_workflow`

```python
def route_workflow(state: OrchestratorState) -> str:
    # ... existing logic ...
    
    # Handle STALLED verdict: do not auto-retry, escalate to human
    for classification in state.get("classifications", []) or []:
        if classification.get("verdict") == "STALLED":
            return "human_approval"
    
    # ... rest ...
```

### 6.4 `rdi.yaml` 改造

```yaml
name: research_design_implement
version: 2
entry: researcher
# ... transitions unchanged ...

blockers:
  escalate:
    - architecture_decision
    - missing_credential
    - stall          # 新增：真正冻结才上升
  retry:
    - missing_dependency
    - test_failure

settings:
  max_iterations: 8
  terminal_docs: false
  stall_monitor:
    enabled: true
    thresholds:
      idle_ms: 450000
      in_tool_ms: 1200000
      grace_period_ms: 120000
      slow_tool_multiplier: 2
```

---

## 7. 关键算法流程

```
wait_for_progress(worker_ids):
    loop:
        sleep(10s)
        
        for worker_id in worker_ids:
            sample = stall_monitor.sample(worker_id)
            checkpoint = harvest(worker_id)
            
            if checkpoint is terminal:
                return checkpoint
            
            if stall_monitor.isStalled(sample):
                log(f"{worker_id} stalled, requesting graceful interrupt")
                stall_monitor.requestGracefulInterrupt(worker_id)
                
                # 进入 grace period，但继续采样
                grace_deadline = now + grace_period_ms
                while now < grace_deadline:
                    sleep(5s)
                    checkpoint = harvest(worker_id)
                    if checkpoint is terminal or checkpoint.state in ('STALLED_PARTIAL', 'REVIEW_NEEDED'):
                        return checkpoint
                    sample = stall_monitor.sample(worker_id)
                    if not stall_monitor.isStalled(sample):
                        # worker 恢复了，取消 grace period
                        break
                
                # grace period 结束仍无结果
                log(f"{worker_id} still stalled after grace period, force terminate")
                stall_monitor.forceTerminate(worker_id)
                return synthesize_stalled_checkpoint(worker_id, sample)
```

---

## 8. 与现有系统的集成点

### 8.1 与 harvester 的关系

- stall monitor **不替代 harvester**，而是与其协作
- harvester 继续负责收集 checkpoint
- stall monitor 决定"何时该继续等"和"何时该中断"

### 8.2 与 Human Gate 的关系

- **stall** 是新的 escalate blocker，上升到 Human Gate
- Human Gate UI 显示"worker 已冻结"，并提供：
  - **重试**：重新派发同一 worker（带 stall 上下文）
  - **换 worker**：转给其他 worker 处理
  - **结束任务**：abort

### 8.3 与 `/agents` 面板的关系（未来）

- 可在 TUI 的 `/agents` 面板显示每个 worker 的 stall 状态
- 提供 kill/pause 控制
- 实时展示 transcript

---

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 慢命令（如模型下载）被误判为 stall | `slowToolMultiplier` + 工具白名单 |
| tmux pane 采样开销 | 限制采样频率（10s），限制 snapshot 长度（2KB） |
| SIGINT 被 worker 忽略 | grace period 后强制 kill session |
| 进程重启后 stall 状态丢失 | 持久化到 mission state / runtime.json |
| 误判导致任务被中断 | Human Gate 兜底，用户可重试 |

---

## 10. 实现阶段

### Phase 1：基础设施（1-2 天）

- [ ] 新建 `swarm-stall-monitor.ts` 和 `swarm-tmux-activity.ts`
- [ ] 新增 `/api/swarm-stall-monitor/:workerId` API
- [ ] 扩展 `runtime.json` 写入更细粒度的活动信号
- [ ] 单元测试：模拟各种进展/冻结场景

### Phase 2：LangGraph 集成（2-3 天）

- [ ] 新增 `wait_for_progress` 节点
- [ ] 修改 `route_workflow` 支持 `STALLED` verdict
- [ ] 修改 `rdi.yaml` 配置
- [ ] 更新 state 类型

### Phase 3：UI 与体验（1-2 天）

- [ ] Human Gate 显示 stall 原因和部分 snapshot
- [ ] 重试时携带 stall 上下文
- [ ] （可选）TUI /agents 面板 stall 状态

### Phase 4：验证（1-2 天）

- [ ] 长研究任务不触发 stall
- [ ] 冻结任务在阈值后正确 stall
- [ ] grace period 能收集部分结果
- [ ] abort 后正确清理所有 worker

---

## 11. 当前可立即执行的临时缓解

在完整实现前，可以先：

1. 把 `rdi.yaml` 的 `timeout` 移到 `retry`（限制 2 次）
2. 在 `nodes.py` timeout 时先尝试读取 tmux pane 构造 partial checkpoint
3. 增加 `staleMinutes` 到 60 分钟给 researcher

---

## 12. 附录：当前已知信号

### 12.1 runtime.json 可获取

- `state`: idle/executing/blocked
- `lastOutputAt`: 最后输出时间
- `lastCheckIn`: 最后签到时间
- `activeTool`: 当前工具（可为 null）
- `needsHuman`: 是否需要人工
- `blockedReason`: 阻塞原因

### 12.2 swarm-runtime API 可获取

- 所有 worker 的运行时状态
- `currentTask`: 当前任务文本
- `lastSummary`: 最后摘要

### 12.3 tmux pane 可获取

- 当前屏幕输出
- 可推断工具名
- 可检测输出变化

---

*计划创建时间：2026-08-06*
*作者：Hermes Agent*
*状态：待实现*
