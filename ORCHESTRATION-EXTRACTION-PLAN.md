# Orchestration Extraction Plan

> Blueprint for ClawSuite Agent Hub rewrite, extracted from Mission Control + OpenClaw Studio patterns.  
> Generated 2026-03-04

---

## Section 1: Agent Spawning

### How Mission Control Spawns Agents

Mission Control uses a **CLI-first approach** — it shells out to the `openclaw` binary on the server side:

```typescript
// mission-control/src/lib/command.ts
export function runOpenClaw(args: string[], options: CommandOptions = {}) {
  return runCommand(config.openclawBin, args, {
    ...options,
    cwd: options.cwd || config.openclawStateDir || process.cwd()
  })
}
```

For sending messages to agents, it calls:
```typescript
// mission-control/src/app/api/agents/message/route.ts
await runOpenClaw([
  'gateway', 'sessions_send',
  '--session', agent.session_key,
  '--message', `Message from ${from}: ${message}`
], { timeoutMs: 10000 })
```

For spawning, the orchestration bar hits `/api/spawn`:
```typescript
// orchestration-bar.tsx — executeTemplate()
const res = await fetch('/api/spawn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    task: template.task_prompt,
    model: template.model,
    label: template.name,
    timeoutSeconds: template.timeout_seconds,
  })
})
```

Mission Control also **syncs agents from `openclaw.json`** — it reads the gateway config file, extracts agent definitions, and upserts them into its SQLite DB. This gives it a persistent agent registry independent of runtime sessions.

**Key insight**: MC doesn't use `sessions.patch` or `sessions.spawn` directly. It calls the CLI which handles session lifecycle internally. Agents are pre-configured in `openclaw.json`, not dynamically created per-mission.

### How Studio Spawns Agents

Studio uses a **WebSocket-based GatewayClient** with direct RPC calls:

```typescript
// openclaw-studio/src/lib/gateway/GatewayClient.ts
class GatewayClient {
  async call<T = unknown>(method: string, params: unknown): Promise<T> {
    if (!this.client || !this.client.connected) {
      throw new Error("Gateway is not connected.");
    }
    const payload = await this.client.request<T>(method, params);
    return payload as T;
  }
}
```

For session settings (model, exec policy):
```typescript
// Studio's syncGatewaySessionSettings
await client.call<GatewaySessionsPatchResult>("sessions.patch", {
  key: sessionKey,
  model: model ?? null,
  thinkingLevel: thinkingLevel ?? null,
  execHost: execHost ?? null,
  execSecurity: execSecurity ?? null,
  execAsk: execAsk ?? null,
});
```

For sending messages (which implicitly creates sessions):
```typescript
// chatSendOperation.ts — sendChatMessageViaStudio()
const sendResult = await params.client.call("chat.send", {
  sessionKey: params.sessionKey,
  message: buildAgentInstruction({ message: trimmed }),
  deliver: false,
  idempotencyKey: runId,
});
```

**Key pattern**: Studio uses `sessions.patch` to configure settings, then `chat.send` to send the first message. The session is implicitly created when `sessions.patch` is called with a new key. Studio also tracks `sessionCreated` state per agent to avoid redundant patches.

Studio generates session keys with the format `agent:{agentId}:{mainKey}`:
```typescript
export const buildAgentMainSessionKey = (agentId: string, mainKey: string) => {
  return `agent:${trimmedAgent}:${trimmedKey}`;
};
```

### How ClawSuite Currently Spawns (BROKEN)

ClawSuite uses `sessions.patch` to create sessions, which is **not the right RPC method**:

```typescript
// clawsuite/src/routes/api/sessions.ts — POST handler
const payload = await gatewayRpc<SessionsPatchResponse>(
  'sessions.patch',
  baseParams,  // { key: friendlyId, label? }
)
```

Then a separate patch for model:
```typescript
// Step 2: Apply model as a separate patch
await gatewayRpc<SessionsPatchResponse>('sessions.patch', {
  key: resolvedSessionKey,
  model,
})
```

And for dispatch, it uses `sessions.send` (with `chat.send` fallback):
```typescript
// clawsuite/src/routes/api/agent-dispatch.ts
return await gatewayRpc<DispatchGatewayResponse>('sessions.send', {
  sessionKey: payload.sessionKey,
  message: payload.message,
  lane: 'subagent',
  deliver: false,
  timeoutMs: 120_000,
  idempotencyKey: payload.idempotencyKey,
})
```

**Problems**:
1. `sessions.patch` creates sessions but doesn't properly initialize them for agent use — it's meant for updating settings on existing sessions
2. No session isolation — all hub sessions share the same namespace pattern `hub-{name}-{random}`
3. Model is applied in a separate call that might fail silently
4. No deduplication — relies on label matching to find existing sessions, which is fragile
5. No `sessionCreated` tracking, so we can't distinguish "needs initialization" from "already running"

### Exact Code Changes for ClawSuite

**1. Fix `src/routes/api/sessions.ts` POST handler:**

Replace the `sessions.patch` approach with `sessions.spawn` (if available) or the Studio pattern of `sessions.patch` + `chat.send`:

```typescript
// NEW: Proper session creation
POST: async ({ request }) => {
  // ... auth checks ...
  const body = await request.json()
  const friendlyId = body.friendlyId || randomUUID()
  const label = body.label || undefined
  const model = body.model || undefined

  // Use sessions.patch to create/configure the session in one call
  const patchParams: Record<string, unknown> = { 
    key: friendlyId,
    ...(label ? { label } : {}),
    ...(model ? { model } : {}),
    // Include exec settings for agent sessions
    execHost: 'gateway',
    execSecurity: body.execSecurity || 'full',
    execAsk: body.execAsk || 'off',
  }

  const payload = await gatewayRpc('sessions.patch', patchParams)
  
  // Return whether model was actually applied
  const resolvedSessionKey = payload.key || friendlyId
  return json({
    ok: true,
    sessionKey: resolvedSessionKey,
    friendlyId,
    modelApplied: !model || payload.resolved?.model === model,
    entry: payload.entry,
  })
}
```

**2. Add session key format matching Studio's pattern:**

```typescript
// In agent-hub-layout.tsx spawnAgentSession()
const sessionKey = `agent:hub:${baseName}-${suffix}`
// This gives us: agent:hub:researcher-abc123
// Matches the agent:{namespace}:{id} pattern Studio uses
```

**3. Track session creation state:**

```typescript
// Add to agent hub state
const [sessionCreatedMap, setSessionCreatedMap] = useState<Record<string, boolean>>({})

// After successful spawn:
setSessionCreatedMap(prev => ({ ...prev, [member.id]: true }))
```

---

## Section 2: Task Dispatch & Orchestration

### Mission Control's Task Planning Flow

MC has a full **Kanban task board** (`task-board-panel.tsx`, 1665 lines) with:

- 6 status columns: `inbox → assigned → in_progress → review → quality_review → done`
- Priority levels: `low | medium | high | critical | urgent`
- Drag-and-drop between columns
- Per-agent task assignment
- Comment threads with @mentions
- Project-scoped task grouping with ticket prefixes (e.g., `PROJ-42`)
- Task metadata including estimated/actual hours

**API-backed persistence** via `/api/tasks` routes:
```
GET    /api/tasks              — List with filters (status, assignee, project)
POST   /api/tasks              — Create task
GET    /api/tasks/[id]         — Get single task
PUT    /api/tasks/[id]         — Update task (status, assignment, etc.)
DELETE /api/tasks/[id]         — Delete task
POST   /api/tasks/[id]/broadcast — Broadcast task to agent
POST   /api/tasks/[id]/comments  — Add comment
```

Task broadcast to agents sends the task content via `sessions_send`:
```
POST /api/tasks/[id]/broadcast → runOpenClaw(['gateway', 'sessions_send', ...])
```

### How Tasks Are Dispatched to Agents

MC doesn't have ClawSuite's "mission" concept. Instead it uses:

1. **Direct command** (orchestration bar): Select agent → type message → send via `/api/agents/message`
2. **Workflow templates**: Pre-configured task+model combos, one-click spawn via `/api/spawn`
3. **Task broadcast**: Assign a task to an agent, then broadcast it
4. **Pipelines**: Multi-step workflows (separate `PipelineTab` component)

The orchestration bar has 4 tabs:
- **Command**: Direct agent messaging (select agent + message input)
- **Workflows**: Template library with tags, model selection, timeout
- **Pipelines**: Multi-step sequential workflows
- **Fleet**: Agent status overview (online/busy/error counts)

### Mission Control's Orchestration Controls

The orchestration bar provides:
```typescript
// Agent selection dropdown (only agents with session_key)
agents.filter(a => a.session_key).map(a => (
  <option value={a.name}>{a.name} ({a.status})</option>
))

// Send command via RPC
await fetch('/api/agents/message', {
  method: 'POST',
  body: JSON.stringify({ to: selectedAgent, content: message, from: 'operator' })
})
```

Fleet monitoring:
```typescript
const onlineCount = agents.filter(a => a.status === 'idle' || a.status === 'busy').length
const busyCount = agents.filter(a => a.status === 'busy').length
const errorCount = agents.filter(a => a.status === 'error').length
```

### What to Port to ClawSuite

**Priority ports:**

1. **Workflow templates** — ClawSuite has missions but no reusable templates. Port MC's template system:
   - Template CRUD (name, model, task_prompt, timeout, tags)
   - One-click execute
   - Tag-based filtering
   - Usage tracking (use_count, last_used_at)
   
2. **Direct agent messaging** — ClawSuite dispatches to agents at mission start but can't send follow-up commands. Add an inline command input per agent.

3. **Task status columns** — ClawSuite has a basic task list. Upgrade to MC's 6-column Kanban with drag-and-drop.

4. **Fleet overview** — Add MC's fleet card pattern to the agent hub header showing online/busy/error counts.

**Skip for now:**
- Pipelines (too complex, missions serve this role)
- Project scoping (not needed yet)
- @mention system (nice-to-have, not critical)

---

## Section 3: Runtime Event Handling

### Studio's Event Classification System

Studio has a sophisticated 3-layer event handling architecture:

**Layer 1: Event Classification** (`runtimeEventBridge.ts`)
```typescript
export type GatewayEventKind = "summary-refresh" | "runtime-chat" | "runtime-agent" | "ignore";

export const classifyGatewayEventKind = (event: string): GatewayEventKind => {
  if (event === "presence" || event === "heartbeat") return "summary-refresh";
  if (event === "chat") return "runtime-chat";
  if (event === "agent") return "runtime-agent";
  return "ignore";
};
```

**Layer 2: Policy Decisions** (`runtimeEventPolicy.ts`)

The policy layer outputs **intent objects** (not direct mutations):
```typescript
export type RuntimePolicyIntent =
  | { kind: "ignore"; reason: string }
  | { kind: "clearRunTracking"; runId: string }
  | { kind: "markRunClosed"; runId: string }
  | { kind: "markThinkingStarted"; runId: string; at: number }
  | { kind: "clearPendingLivePatch"; agentId: string }
  | { kind: "queueLivePatch"; agentId: string; patch: Partial<AgentState> }
  | { kind: "dispatchUpdateAgent"; agentId: string; patch: Partial<AgentState> }
  | { kind: "requestHistoryRefresh"; agentId: string; reason: string }
  | { kind: "queueLatestUpdate"; agentId: string; message: string }
  | { kind: "scheduleSummaryRefresh"; delayMs: number; includeHeartbeatRefresh: boolean };
```

The delta handler is critical — it decides what to do with streaming chunks:
```typescript
// For delta events:
if (runId && input.isClosedRun) return [{ kind: "ignore", reason: "closed-run-delta" }];
if (runId && activeRunId && activeRunId !== runId) return [{ kind: "clearRunTracking", runId }];
// ... build patch with streamText, thinkingTrace, status: "running"
```

For final/terminal events:
```typescript
// Clear streaming state, mark idle or error
const patch: Partial<AgentState> = {
  streamText: null,
  thinkingTrace: null,
  runStartedAt: null,
};
if (input.shouldSetRunIdle) { patch.status = "idle"; patch.runId = null; }
```

**Layer 3: Event Handler** (`gatewayRuntimeEventHandler.ts`)

The handler coordinates everything:
```typescript
export function createGatewayRuntimeEventHandler(deps) {
  // Manages coordinator state, lifecycle fallback timers, summary refresh timers
  
  const handleEvent = (event: EventFrame) => {
    const eventKind = classifyGatewayEventKind(event.event);
    if (eventKind === "summary-refresh") { /* schedule summary reload */ }
    if (eventKind === "runtime-chat") { handleRuntimeChatEvent(payload); }
    if (eventKind === "runtime-agent") { handleRuntimeAgentEvent(payload); }
  };
}
```

Key features:
- **Closed run tracking** — prevents late events from corrupting state (30s TTL)
- **Lifecycle fallback** — if no lifecycle event arrives, marks agent idle anyway
- **Thinking trace tracking** — separate stream for reasoning tokens
- **Run deduplication** — ensures only one active run per agent
- **Summary snapshot** — periodic refresh from gateway presence/heartbeat events

### How Studio Handles SSE vs ClawSuite's Raw EventSource

Studio uses a **WebSocket connection** (not SSE), receiving `EventFrame` objects:
```typescript
export type EventFrame = {
  type: "event";
  event: string;  // "chat", "agent", "presence", "heartbeat"
  payload?: unknown;
  seq?: number;
  stateVersion?: GatewayStateVersion;
};
```

ClawSuite uses **raw EventSource** (SSE) for streaming, which is simpler but less capable:
- No bidirectional communication
- No frame sequencing
- No gap detection
- No heartbeat/presence events

### What to Port to ClawSuite

**Critical ports:**

1. **Event classification layer** — Add a `classifyEvent` function to route SSE events:
```typescript
// New file: src/lib/gateway-events.ts
type EventKind = 'chat-delta' | 'chat-final' | 'agent-lifecycle' | 'heartbeat' | 'ignore'

function classifySSEEvent(event: MessageEvent): EventKind {
  const data = JSON.parse(event.data)
  if (data.event === 'chat') {
    return data.payload?.state === 'delta' ? 'chat-delta' : 'chat-final'
  }
  if (data.event === 'agent') return 'agent-lifecycle'
  if (data.event === 'heartbeat' || data.event === 'presence') return 'heartbeat'
  return 'ignore'
}
```

2. **Closed run tracking** — Prevent late SSE events from updating completed agents:
```typescript
const closedRuns = new Set<string>()
const CLOSED_RUN_TTL_MS = 30_000

function markRunClosed(runId: string) {
  closedRuns.add(runId)
  setTimeout(() => closedRuns.delete(runId), CLOSED_RUN_TTL_MS)
}

function isClosedRun(runId: string): boolean {
  return closedRuns.has(runId)
}
```

3. **Run ID tracking per agent** — Know which run belongs to which agent:
```typescript
const activeRunByAgent = new Map<string, string>()
// On delta: if runId !== activeRunByAgent.get(agentId), clear old run
// On final: activeRunByAgent.delete(agentId), markRunClosed(runId)
```

4. **Lifecycle status management** — Port Studio's idle/running/error transitions:
```typescript
type AgentStatus = 'idle' | 'running' | 'error' | 'awaiting_input'

function resolveStatusFromEvent(event: ParsedEvent, currentStatus: AgentStatus): AgentStatus {
  if (event.kind === 'chat-delta') return 'running'
  if (event.kind === 'chat-final') {
    if (event.payload.state === 'error') return 'error'
    return 'idle'
  }
  if (event.kind === 'agent-lifecycle') {
    if (event.payload.data?.phase === 'start') return 'running'
    if (event.payload.data?.phase === 'end') return 'idle'
    if (event.payload.data?.phase === 'error') return 'error'
  }
  return currentStatus
}
```

---

## Section 4: Exec Approvals

### Studio's Full Approval Flow

Studio has a comprehensive exec approval system across 10 files (1514 lines total):

**Types** (`types.ts`):
```typescript
export type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

export type PendingExecApproval = {
  id: string;
  agentId: string | null;
  sessionKey: string | null;
  command: string;
  cwd: string | null;
  host: string | null;
  security: string | null;
  ask: string | null;
  resolvedPath: string | null;
  createdAtMs: number;
  expiresAtMs: number;
  resolving: boolean;
  error: string | null;
};
```

**Lifecycle** (`execApprovalLifecycleWorkflow.ts`):

1. Gateway emits `exec.approval.requested` event
2. `resolveExecApprovalEventEffects` parses the event and creates a `PendingExecApproval`
3. Approval is scoped to an agent (or unscoped if agent can't be resolved)
4. UI displays the pending approval with command details

**Resolution** (`execApprovalResolveOperation.ts`):
```typescript
export const resolveExecApprovalViaStudio = async (params) => {
  // 1. Mark approval as resolving (loading state)
  setLocalApprovalState(true, null);
  
  // 2. Send decision to gateway
  await params.client.call("exec.approval.resolve", { 
    id, 
    decision: params.decision  // "allow-once" | "allow-always" | "deny"
  });
  
  // 3. Remove from pending list
  removeLocalApproval(id);
  
  // 4. If allowed, wait for the run to complete then refresh history
  if (decision === "allow-once" || decision === "allow-always") {
    await params.client.call("agent.wait", { runId: activeRunId, timeoutMs: 15_000 });
    await params.requestHistoryRefresh(targetAgentId);
  }
};
```

**Control Loop** (`execApprovalControlLoopWorkflow.ts`):

The control loop handles:
- **Pause-on-approval**: When an approval arrives, the agent's run is paused
- **Auto-resume**: After approval resolution, if no more pending approvals, auto-resume the run
- **Pruning**: Expired approvals are automatically removed
- **Awaiting user input patches**: Agents with pending approvals get `status: "awaiting_input"`

```typescript
export const planPauseRunIntent = (params) => {
  // Resolve which agent to pause based on approval's sessionKey
  const agent = resolvePauseTargetAgent({ approval, preferredAgentId, agents });
  // Check pause policy
  const shouldPause = shouldPauseRunForPendingExecApproval({ agent, approval, pausedRunId });
  // Return pause intent with agentId, sessionKey, runId
};

export const planAutoResumeIntent = (params) => {
  // After approval resolved, check if any more approvals pending
  // If none, return resume intent
};
```

### ClawSuite's Current Approach

ClawSuite has **no exec approval handling** in the agent hub. Agents run with `execSecurity: 'full'` or `execAsk: 'off'`, so approvals never trigger. This is fine for trusted workloads but blocks more careful execution modes.

### What to Port to ClawSuite

**Phase 1 (minimal, high-value):**

1. Add exec approval event detection to SSE handler:
```typescript
// In SSE event handler
if (event.event === 'exec.approval.requested') {
  const approval = parseExecApproval(event.payload)
  setPendingApprovals(prev => [...prev, approval])
}
if (event.event === 'exec.approval.resolved') {
  setPendingApprovals(prev => prev.filter(a => a.id !== event.payload.id))
}
```

2. Add inline approval card in agent chat view:
```tsx
{pendingApprovals.filter(a => a.sessionKey === agent.sessionKey).map(approval => (
  <div className="border border-amber-500/30 rounded-lg p-3 bg-amber-500/5">
    <div className="text-sm font-mono">{approval.command}</div>
    <div className="flex gap-2 mt-2">
      <button onClick={() => resolveApproval(approval.id, 'allow-once')}>Allow Once</button>
      <button onClick={() => resolveApproval(approval.id, 'allow-always')}>Always Allow</button>
      <button onClick={() => resolveApproval(approval.id, 'deny')}>Deny</button>
    </div>
  </div>
))}
```

3. Gateway RPC for resolution:
```typescript
async function resolveApproval(id: string, decision: ExecApprovalDecision) {
  await gatewayRpc('exec.approval.resolve', { id, decision })
}
```

**Phase 2 (later):**
- Pause/resume agent runs on approval
- Auto-resume after all approvals cleared
- Approval expiry and pruning

---

## Section 5: Mission Reports & Output

### How Mission Control Captures Agent Output

MC receives agent output via WebSocket events:

```typescript
// websocket.ts — handleGatewayFrame()
if (frame.event === 'tick') {
  // Snapshot contains session data with token counts, costs
  const snapshot = frame.payload?.snapshot
  if (snapshot?.sessions) {
    setSessions(snapshot.sessions.map(session => ({
      key: session.key,
      model: normalizeModel(session.model),
      tokens: `${session.totalTokens || 0}/${session.contextTokens || 35000}`,
      active: isActive(session.updatedAt),
      cost: session.cost,
      // ...
    })))
  }
}
```

MC also reads sessions directly from disk:
```typescript
// sessions.ts — getAllGatewaySessions()
// Reads {OPENCLAW_STATE_DIR}/agents/{agentName}/sessions/sessions.json
// Gets token counts, model, channel, active status per session
```

### How Studio Handles Transcript History

Studio has the most sophisticated history handling:

```typescript
// runtimeEventBridge.ts — buildHistoryLines()
export const buildHistoryLines = (messages: ChatHistoryMessage[]): HistoryLinesResult => {
  // Processes each message:
  // - User messages: formatted as "> {text}" with timestamp metadata
  // - Assistant messages: includes thinking traces, tool lines, normalized text
  // - Tracks lastAssistant, lastUser, timestamps
  // Returns { lines, lastAssistant, lastAssistantAt, lastRole, lastUser, lastUserAt }
}

// History sync merges real-time stream with loaded history
export const buildHistorySyncPatch = ({ messages, currentLines, loadedAt, status, runId }) => {
  const { lines, lastAssistant, ... } = buildHistoryLines(messages)
  const mergedLines = mergeHistoryWithPending(lines, currentLines)
  return {
    outputLines: mergedLines,
    lastResult: lastAssistant ?? null,
    latestPreview: lastAssistant,
    lastUserMessage: lastUser,
    historyLoadedAt: loadedAt,
  }
}
```

Key pattern: Studio maintains `outputLines` per agent (an array of rendered markdown lines), plus `lastResult` for the most recent assistant message, and `latestPreview` for the sidebar summary.

### Fix for ClawSuite's Report Quality

ClawSuite's `buildMissionCompletionSnapshot` captures output lines from a ref:
```typescript
const agentSummaries: MissionAgentSummary[] = teamSnapshot.map((member) => ({
  agentId: member.id,
  agentName: member.name,
  modelId: member.modelId,
  lines: agentOutputLinesRef.current[member.id] ?? [],  // Often empty or partial!
}))
```

**The problem**: `agentOutputLinesRef` is populated from SSE streaming events, which only capture the last 6 lines per event and cap at 200 total. This misses most of the agent's output.

**Fix — Fetch complete history on mission completion:**

```typescript
// Add to agent-hub-layout.tsx
async function fetchAgentFinalOutput(sessionKey: string): Promise<string[]> {
  try {
    // Use gateway RPC to get full session history
    const response = await fetch('/api/sessions/history', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionKey, limit: 100 })
    })
    if (!response.ok) return []
    const data = await response.json()
    
    // Extract assistant messages
    return (data.messages ?? [])
      .filter((m: any) => m.role === 'assistant')
      .map((m: any) => {
        const text = typeof m.content === 'string' 
          ? m.content 
          : Array.isArray(m.content) 
            ? m.content.map((p: any) => p.text || '').join(' ')
            : ''
        return text.trim()
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

// In stopMissionAndCleanup, BEFORE building snapshot:
const enrichedOutputs: Record<string, string[]> = {}
await Promise.all(
  Object.entries(agentSessionMap).map(async ([agentId, sessionKey]) => {
    enrichedOutputs[agentId] = await fetchAgentFinalOutput(sessionKey)
  })
)
// Then use enrichedOutputs in the snapshot instead of agentOutputLinesRef
```

**New API route** `src/routes/api/sessions-history.ts`:
```typescript
POST: async ({ request }) => {
  const { sessionKey, limit } = await request.json()
  const result = await gatewayRpc('sessions.history', {
    key: sessionKey,
    limit: limit || 50,
  })
  return json({ messages: result.messages || [] })
}
```

---

## Section 6: Token/Cost Dashboard

### Mission Control's Token Dashboard Patterns

MC has a full dashboard (`token-dashboard-panel.tsx`, 643 lines) using **Recharts**:

**Data sources:**
```typescript
// Stats endpoint with timeframe filtering
const response = await fetch(`/api/tokens?action=stats&timeframe=${selectedTimeframe}`)
// Returns:
interface UsageStats {
  summary: { totalTokens, totalCost, requestCount, avgTokensPerRequest, avgCostPerRequest }
  models: Record<string, { totalTokens, totalCost, requestCount }>
  sessions: Record<string, { totalTokens, totalCost, requestCount }>
  timeframe: string
}

// Trends endpoint
const response = await fetch(`/api/tokens?action=trends&timeframe=${selectedTimeframe}`)
// Returns time-series data with timestamp, tokens, cost, requests
```

**Charts:**
1. **Usage Trends** — LineChart with tokens + requests over time
2. **Token Usage by Model** — BarChart comparing models
3. **Cost Distribution by Model** — PieChart (top 6 models)
4. **Model Efficiency Comparison** — Horizontal bar chart ($/1K tokens)

**Performance Insights:**
- Most efficient model (lowest $/token)
- Most used model (highest request count)
- Optimization potential (savings if all tasks used cheapest model)
- Alert conditions (cost > $100, savings > 20%, requests > 1000)

**Export:**
```typescript
const exportData = async (format: 'json' | 'csv') => {
  const response = await fetch(`/api/tokens?action=export&timeframe=${selectedTimeframe}&format=${format}`)
  const blob = await response.blob()
  // Download as file
}
```

### What to Port

ClawSuite already has a cost page. Enhance it with:

1. **Timeframe selector** — hour/day/week/month toggle (MC pattern)
2. **Model breakdown charts** — port the BarChart + PieChart from MC
3. **Efficiency insights** — the "optimization potential" calculation
4. **Per-session cost** — MC's session cost breakdown, useful for seeing per-mission costs
5. **Export** — CSV/JSON export functionality

**Don't port:**
- The alert system (overkill for our scale)
- Real-time trend charts (we don't have enough data points yet)

---

## Section 7: Implementation Order

### Prioritized Changes

| # | Change | Effort | Impact | Dependencies |
|---|--------|--------|--------|-------------|
| 1 | **Fix session spawning** — sessions.patch with model+exec in one call | S (2h) | Critical | None |
| 2 | **Event classification layer** — add gateway-events.ts | M (4h) | High | None |
| 3 | **Closed run tracking** — prevent stale event corruption | S (1h) | High | #2 |
| 4 | **Fetch full history on mission complete** — fix report quality | M (4h) | High | None |
| 5 | **Run ID tracking per agent** — active run map | S (2h) | High | #2 |
| 6 | **Agent lifecycle status** — idle/running/error from events | M (3h) | High | #2, #5 |
| 7 | **Inline agent messaging** — send follow-up commands | M (4h) | Medium | #1 |
| 8 | **Exec approval cards** — in-chat approval UI | M (6h) | Medium | #2, #6 |
| 9 | **Workflow templates** — reusable mission templates | L (8h) | Medium | None |
| 10 | **Fleet overview header** — online/busy/error counts | S (1h) | Low | #6 |
| 11 | **Token dashboard enhancements** — charts + insights | L (8h) | Low | None |
| 12 | **Kanban task board** — 6-column drag-and-drop | XL (16h) | Medium | None |

### File-by-File Change List

**New files:**
- `src/lib/gateway-events.ts` — Event classification + closed run tracking (#2, #3)
- `src/routes/api/sessions-history.ts` — Fetch full session history (#4)
- `src/components/agent-hub/approval-card.tsx` — Exec approval UI (#8)
- `src/components/agent-hub/fleet-header.tsx` — Fleet status overview (#10)

**Modified files:**
- `src/routes/api/sessions.ts` — Fix POST handler to include model+exec in one call (#1)
- `src/routes/api/agent-dispatch.ts` — No changes needed (already correct)
- `src/screens/gateway/agent-hub-layout.tsx`:
  - `spawnAgentSession()` — Use new session key format (#1)
  - `handleSSEEvent()` — Add event classification (#2, #3, #5, #6)
  - `buildMissionCompletionSnapshot()` — Fetch full history (#4)
  - `stopMissionAndCleanup()` — Await history fetch before snapshot (#4)
  - Add inline message input per agent (#7)
  - Add approval event handling (#8)
- `src/hooks/use-agent-view.ts` — Add lifecycle status from events (#6)

### Dependencies

```
#1 (fix spawning) → standalone, do first
#2 (event classification) → #3 (closed runs), #5 (run tracking), #6 (lifecycle)
#4 (history fetch) → standalone, do early for quick report quality win
#6 (lifecycle) → #8 (approvals), #10 (fleet header)
#7 (inline messaging) → needs #1 for proper sessions
```

### Recommended Implementation Waves

**Wave 1 (Critical fixes, 1 day):** #1, #4
**Wave 2 (Event system, 2 days):** #2, #3, #5, #6
**Wave 3 (UX enhancements, 2 days):** #7, #8, #10
**Wave 4 (Nice-to-haves, 3 days):** #9, #11, #12
