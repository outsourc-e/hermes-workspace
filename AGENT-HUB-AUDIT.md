# Agent Hub / Mission Control — Code Audit Report

**Date:** 2026-03-04  
**Auditor:** Aurora (subagent)  
**Scope:** Mission lifecycle, session persistence, report viewing, refresh/polling, UX gaps

---

## Executive Summary

The Agent Hub's mission system has a **fundamental architectural split** that causes most reported bugs: missions are managed through **two completely independent systems** that don't talk to each other.

1. **The sidebar Agent View** (`use-agent-view.ts` + `agent-view-panel.tsx`) — polls `/api/sessions` via gateway, tracks all subagent sessions in real-time, classifies them as active/queued/history.
2. **The Mission Control hub** (`agent-hub-layout.tsx` + `mission-checkpoint.ts`) — manages missions via localStorage + per-agent SSE streams, with its own session spawning, task dispatch, and report generation.

These two systems share almost no state. A mission started from the hub creates gateway sessions, but the hub tracks them in React state + localStorage — not through the gateway's session metadata. When you navigate away, React state dies. When you come back, the hub doesn't know how to reconstruct the mission from gateway sessions.

---

## Finding 1: Missions Disappear When Navigating Away

**Severity: P0**  
**Root Cause:** Mission runtime state is held entirely in React component state within `AgentHubLayout`.

### Evidence

In `agent-hub-layout.tsx`, all mission state lives in `useState` hooks:

```typescript
const [missionActive, setMissionActive] = useState(false)
const [missionGoal, setMissionGoal] = useState('')
const [activeMissionName, setActiveMissionName] = useState('')
const [missionTasks, setMissionTasks] = useState<Array<HubTask>>([])
const [agentSessionMap, setAgentSessionMap] = useState<Record<string, string>>(...)
const [missionState, setMissionState] = useState<'running' | 'paused' | 'stopped'>('stopped')
```

When the user navigates away from `/agent-swarm`, `AgentHubLayout` unmounts. All of this state is destroyed. When the user returns, the component remounts with fresh default state — `missionActive: false`, `missionState: 'stopped'`, empty tasks, etc.

### What IS Persisted

There is a checkpoint system in `mission-checkpoint.ts`:

```typescript
// localStorage keys:
const CURRENT_KEY = 'clawsuite:mission-checkpoint'
const HISTORY_KEY = 'clawsuite:mission-history'
```

And `agent-hub-layout.tsx` does call `saveMissionCheckpoint()` at various points — task status updates, mission stop. It also reads the checkpoint on mount:

```typescript
const [restoreCheckpoint, setRestoreCheckpoint] = useState<MissionCheckpoint | null>(() => {
  const cp = loadMissionCheckpoint()
  return cp?.status === 'running' ? cp : null
})
```

**But the restore banner is never rendered.** The variables are declared and then silenced:

```typescript
void restoreCheckpoint
void restoreDismissed
```

So the checkpoint is saved to localStorage, but the restore UI was never implemented. The user sees nothing when they return.

### What's Also Persisted

Agent session mappings are stored in localStorage:

```typescript
// key: 'clawsuite:hub-agent-sessions'
// value: { [agentId]: { sessionKey, model? } }
```

This is read on mount, but since `missionActive` defaults to `false` and no restore flow exists, these sessions are orphaned.

### Fix Recommendation

1. **Implement the restore flow.** When `AgentHubLayout` mounts and finds a `running` checkpoint in localStorage:
   - Set `missionActive = true`, `missionState = 'running'`
   - Restore `missionTasks`, `team`, `agentSessionMap` from the checkpoint
   - Re-open SSE streams to the existing sessions
   - Show a "Mission in progress — reconnecting..." banner

2. **Move critical mission state to Zustand with `persist` middleware** (like `useAgentViewStore` already does). This survives navigation without relying on localStorage checkpoint sync.

---

## Finding 2: Completed Missions Don't Appear in Missions Tab

**Severity: P0**  
**Root Cause:** The Missions tab's `HistoryView` looks for two things, and the data pipeline for both is fragile.

### How HistoryView Works

In `agent-hub-layout.tsx`, the `HistoryView` component:

1. **Fetches `/api/sessions`** and filters for sessions where `label.startsWith('Mission:')`:
   ```typescript
   const missionSessions = (data.sessions ?? [])
     .filter((s) => {
       const label = readString(s.label)
       return label.startsWith('Mission:')
     })
   ```

2. **Reads `loadMissionHistory()` from localStorage** — the archived checkpoints.

### Why Completed Missions Vanish

**Problem A: Gateway session lifecycle.** When a mission completes, `stopMissionAndCleanup()` is called:

```typescript
const stopMissionAndCleanup = useCallback((reason: 'aborted' | 'completed' = 'aborted') => {
  // ...
  Object.values(agentSessionMap).forEach((sessionKey) => {
    // ABORT the chat
    fetch('/api/chat-abort', { ... })
    // DELETE the session
    fetch(`/api/sessions?sessionKey=${encodeURIComponent(sessionKey)}`, {
      method: 'DELETE',
    }).catch(() => {})
  })
  // ...
})
```

**The sessions are DELETED from the gateway on completion.** So when `HistoryView` fetches `/api/sessions`, the completed mission's sessions no longer exist. They were just destroyed.

**Problem B: The checkpoint is archived, but...** `archiveMissionToHistory()` IS called before cleanup, which writes to `clawsuite:mission-history` in localStorage. And `HistoryView` DOES read this. So local checkpoints should appear.

BUT — if `stopMissionAndCleanup` is called via the auto-completion path (SSE `done` events), there's a timing issue. The `buildMissionCompletionSnapshot` is called, but it captures from `agentOutputLinesRef` which may not have the final output yet. The snapshot is stored in `missionCompletionSnapshotRef` — but is it actually saved to localStorage history?

Looking at the `missionState` transition effect — when `missionState` goes from `'running'` to `'stopped'`, the component needs to detect this and archive. But if the component has already unmounted (user navigated away), this effect never runs.

**Problem C: Old missions showing (7d ago).** These are gateway sessions that were created with `Mission:` labels but were never deleted (perhaps from a crash or the user closing the browser before cleanup). They persist in the gateway's session store. Recently completed ones are gone because `stopMissionAndCleanup` explicitly deletes them.

### Fix Recommendation

1. **Don't delete gateway sessions on mission completion.** Instead, patch their status to `completed` via `sessions.patch`. This preserves them for the history view.
2. **Add a `completedAt` timestamp** to the session metadata when completing.
3. **Archive to localStorage immediately in `stopMissionAndCleanup`** before deleting sessions, ensuring the checkpoint has all output data.
4. **Consider a dedicated `/api/mission-history` endpoint** that stores mission reports server-side rather than relying on localStorage.

---

## Finding 3: Can't View Final Report After Completion

**Severity: P1**  
**Root Cause:** Reports are generated in-memory and stored in localStorage, but the viewing flow is incomplete.

### How Reports Work

When a mission completes, `generateMissionReport()` creates a markdown report from:
- Mission goal, team, tasks
- Per-agent output (from `agentOutputLinesRef`)
- Detected artifacts (code blocks, URLs, tables)
- Token count and cost estimate

This report is saved via `saveStoredMissionReport()` to:
```typescript
const MISSION_REPORTS_STORAGE_KEY = 'clawsuite-mission-reports'
const MAX_MISSION_REPORTS = 10
```

### The Problem

The report generation happens in a `useEffect` that watches `missionState` transitions. When the state goes from `running` → `stopped`, it reads `missionCompletionSnapshotRef.current`, generates a report, and saves it.

But there are multiple failure modes:

1. **Snapshot is null.** If the mission auto-completes via the SSE safety net (`setTimeout` 6000ms), and the ref was set from a stale closure, the snapshot may be incomplete or null.

2. **Component unmount race.** If the user navigates away while the 5000ms/6000ms auto-completion timer is pending, the callback still fires but `setMissionState` on an unmounted component is a no-op. The report is never generated.

3. **`HistoryView` shows checkpoints, not reports.** Even if the report is saved to `clawsuite-mission-reports`, the `HistoryView` component shows:
   - Local checkpoints from `clawsuite:mission-history` (label, team, tasks — but NOT the full report)
   - Gateway sessions with `Mission:` prefix (which are deleted on completion)
   
   There's no UI in `HistoryView` that reads from `clawsuite-mission-reports` and shows the full markdown report.

4. **`selectedReport` state exists** in `AgentHubLayout` — there's state for viewing a report (`selectedReport`, `completionReportVisible`, `completionReport`), but the `HistoryView` component doesn't use these. They're used by report modals that are triggered from the completion flow, not from the history tab.

### Fix Recommendation

1. **Add a "View Report" button to each item in `HistoryView`** that loads from `clawsuite-mission-reports` by matching `missionId`.
2. **Store the report markdown inside the checkpoint** (`MissionCheckpoint.report?: string`) so history items are self-contained.
3. **Generate the report synchronously in `stopMissionAndCleanup`** before any async cleanup, to avoid timing issues.

---

## Finding 4: Sidebar Agent View vs Hub Are Disconnected

**Severity: P1**  
**Root Cause:** Two independent polling/display systems with no shared state.

### The Sidebar (`use-agent-view.ts` + `agent-view-panel.tsx`)

- Polls `/api/sessions` every 5s via `fetchSessions()`
- Filters sessions with `isAgentSession()` — includes anything with `subagent:` in the key
- Classifies into active/queued/history based on status
- Displays in the right sidebar panel

### The Hub (`agent-hub-layout.tsx`)

- Manages its own `agentSessionMap` (agentId → sessionKey)
- Opens SSE streams per agent
- Tracks status via `agentSessionStatus` React state
- Has its own task board, artifacts, output lines, etc.

### Consequences

- A mission running in the hub appears in the sidebar as individual agents, but there's no "mission" concept in the sidebar.
- The sidebar's "History" section (`historyAgents`) shows completed/failed sessions, but these are individual agent sessions — not grouped as a mission.
- Killing an agent from the sidebar doesn't notify the hub's mission state.
- The hub creates sessions labeled `Mission: {agentName}`, but the sidebar doesn't give these special treatment.

### Fix Recommendation

Create a shared `MissionStore` (Zustand with persist) that both the sidebar and hub can read from:
```typescript
type MissionStore = {
  activeMission: {
    id: string
    goal: string
    team: TeamMember[]
    tasks: HubTask[]
    agentSessions: Record<string, string>
    state: 'running' | 'paused' | 'stopped'
    startedAt: number
  } | null
  missionHistory: StoredMissionReport[]
}
```

---

## Finding 5: 68% Mission Failure Rate

**Severity: P1**  
**Root Cause:** Multiple factors contribute to high failure rates.

### Analysis

1. **Session deletion = "failed" in the sidebar.** When `stopMissionAndCleanup` deletes sessions, any that haven't reached `complete` status are classified as `failed` by `use-agent-view.ts`:
   ```typescript
   if (['failed', 'error', 'cancelled', 'canceled', 'killed'].includes(status))
     return 'failed'
   ```
   Deleting a session while it's running or idle causes the gateway to mark it with an error/cancelled stop reason.

2. **Staleness heuristic misclassification.** In `agent-swarm-store.ts`:
   ```typescript
   if (hasTokens && staleness > 30_000) return 'complete'
   ```
   But in `use-agent-view.ts`:
   ```typescript
   if (tokens > 0 && staleness > 30_000) return 'complete'
   ```
   Sessions that are actually still running but haven't sent an update in 30s get marked as "complete" prematurely.

3. **No error recovery.** When a session fails (model error, rate limit, etc.), the hub detects it via SSE `error` events but has no retry mechanism. The task stays in `in_progress` and the mission eventually times out.

### Fix Recommendation

1. Stop deleting sessions on mission completion — patch status instead.
2. Increase the staleness threshold to 120s for "complete" heuristic.
3. Add retry logic: if an agent session errors, auto-spawn a replacement session for the same tasks.

---

## Finding 6: All Missions Show "1 Agent"

**Severity: P2**  
**Root Cause:** The sidebar Agent View treats each session independently.

The sidebar (`agent-view-panel.tsx`) shows agents individually — there's no mission grouping. When it says "1 agent", it means 1 active session, not "1 agent in the mission." If a mission spawned 3 agents, the sidebar would show 3 separate agent cards.

The "1 agent" display is likely because:
1. Only 1 agent was actually spawned per mission (sequential processing)
2. Or other agent sessions completed/failed quickly and moved to history

The hub does support multi-agent teams, but sequential processing dispatches one agent at a time:
```typescript
const [processType, setProcessType] = useState<'sequential' | 'hierarchical' | 'parallel'>('parallel')
```

Default is `parallel` but the actual dispatch logic may serialize. Would need to trace the dispatch flow deeper.

---

## Finding 7: Usage & Cost Shows $0.00

**Severity: P2**  
**Root Cause:** Cost tracking uses a rough heuristic, and the data source is unreliable.

In `agent-hub-layout.tsx`:
```typescript
const ROUGH_COST_PER_1K_TOKENS_USD = 0.01

function estimateMissionCost(tokenCount: number): number {
  return Number(((tokenCount / 1000) * ROUGH_COST_PER_1K_TOKENS_USD).toFixed(2))
}
```

Token count is tracked via SSE chunks:
```typescript
setMissionTokenCount((current) => current + Math.ceil(text.length / 4))
```

This is a rough char/4 estimate. If SSE streams aren't connected (sessions failed to spawn, or component unmounted), `missionTokenCount` stays at 0, giving $0.00 cost.

In the sidebar, `formatCost` sums `agent.estimatedCost` which comes from:
```typescript
function readEstimatedCost(session, status, tokenCount): number {
  // Falls back to: tokenCount * 0.000004
}
```

If the gateway doesn't report cost (most don't for OAuth sessions), and token count is low or zero, cost shows as $0.00.

### Fix Recommendation

1. Use the gateway's actual token counts from session metadata instead of character-count heuristics.
2. If using OAuth providers (free), display "Free (OAuth)" instead of $0.00 to avoid confusion.

---

## Finding 8: Refresh/Polling Architecture

**Severity: P2**

### Current Setup

- **Sidebar:** `REFRESH_INTERVAL_MS = 5000` — polls `/api/sessions` every 5s
- **Hub:** SSE streams per agent for real-time updates, plus:
  - Gateway status: 15s polling
  - Session status: 10s polling via `useQuery` in `AgentsScreen`
  - Approvals: 8s polling
- **No SSE for mission-level events.** The hub opens per-agent SSE streams but there's no centralized event that says "mission completed."

### Race Conditions

1. **SSE `done` event → mission auto-complete.** Uses a `setTimeout(5000)` delay to let output flush. If 2 agents finish within 5s of each other, both `done` events fire, but only the second one triggers auto-complete. The first agent's final output may not be captured in the snapshot.

2. **Component unmount during timeout.** If user navigates away during the 5000ms window, `setMissionState` is called on an unmounted component. React ignores this silently, so the mission never transitions to `stopped` and the report is never generated.

### Fix Recommendation

1. Move auto-completion logic out of the component — use a Zustand store action or a service worker.
2. Use `AbortController` for cleanup on unmount, and persist mission state to localStorage before the component unmounts.
3. Add an `onbeforeunload` handler to save checkpoint if mission is active.

---

## Architecture Recommendations

### 1. Unified Mission Store (Zustand + persist)

Replace the 15+ `useState` hooks in `AgentHubLayout` with a single Zustand store:

```typescript
const useMissionStore = create(persist(
  (set, get) => ({
    activeMission: null as ActiveMission | null,
    missionHistory: [] as MissionReport[],
    
    startMission: (goal, team, tasks) => { ... },
    completeMission: () => { ... },
    abortMission: () => { ... },
    updateTaskStatus: (taskId, status) => { ... },
  }),
  { name: 'clawsuite:mission-store' }
))
```

Benefits:
- Survives navigation (persist middleware)
- Shared between sidebar and hub
- Single source of truth
- Testable

### 2. Don't Delete Sessions on Completion

Patch session status to `completed` with metadata. This preserves history in the gateway and lets HistoryView find them.

### 3. Mission Report Storage

Store reports as part of the mission checkpoint, not in a separate localStorage key. Include the full markdown report in `MissionCheckpoint` so HistoryView can render it directly.

### 4. Implement the Restore Banner

The code is half-written — `restoreCheckpoint` state is loaded from localStorage but the UI is `void`-silenced. Wire it up to show a "Resume mission?" banner with the mission goal and team info.

### 5. Add `beforeunload` Guard

```typescript
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (missionActive) {
      saveMissionCheckpoint(currentCheckpoint)
      e.preventDefault()
    }
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [missionActive])
```

---

## Summary Table

| # | Finding | Severity | Files |
|---|---------|----------|-------|
| 1 | Missions disappear on navigation — React state only, restore UI voided | **P0** | `agent-hub-layout.tsx`, `mission-checkpoint.ts` |
| 2 | Completed missions vanish — sessions deleted on completion | **P0** | `agent-hub-layout.tsx` (`stopMissionAndCleanup`) |
| 3 | Can't view final report — report stored but no UI to access from history | **P1** | `agent-hub-layout.tsx` (`HistoryView`, `selectedReport`) |
| 4 | Sidebar and Hub disconnected — two independent tracking systems | **P1** | `use-agent-view.ts`, `agent-hub-layout.tsx` |
| 5 | 68% failure rate — session deletion + staleness heuristic | **P1** | `agent-hub-layout.tsx`, `agent-swarm-store.ts`, `use-agent-view.ts` |
| 6 | "1 agent" display — sidebar doesn't group by mission | **P2** | `agent-view-panel.tsx` |
| 7 | $0.00 cost — heuristic token counting, OAuth shows as free | **P2** | `agent-hub-layout.tsx` |
| 8 | Race conditions in auto-completion timers | **P2** | `agent-hub-layout.tsx` (SSE `done` handler) |

---

*End of audit. No code changes made.*
