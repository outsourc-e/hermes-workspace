# ClawSuite Task Specs — Ready for Sonnet ACP
_Created: 2026-03-07 20:16 EST_

Each task is self-contained with exact files, exact changes, and verification steps.
Spawn with: `sessions_spawn runtime:acp model:sonnet46-coding`

---

## TASK-01: Strip Queued Message Wrappers
**Priority:** P0 | **Files:** 2 | **Est:** 15 min

### Problem
OpenClaw wraps queued messages in `[Queued messages while agent was busy]\n---\nQueued #1\n{text}`. This raw wrapper shows in chat UI. Should display only the actual message text.

### Changes

**File: `src/screens/chat/chat-screen.tsx`**
In `finalDisplayMessages` useMemo (around line 535), add a text-cleaning step for user messages:

```typescript
// Add this helper above the component or in src/lib/strip-queued-wrapper.ts
function stripQueuedWrapper(text: string): string {
  if (!text.includes('[Queued messages while agent was busy]')) return text
  // Extract messages after "Queued #N" headers
  const parts = text.split(/---\s*\n?Queued #\d+\s*\n/)
  // Last part is the actual message, or join all parts
  const messages = parts
    .map(p => p.replace(/^\[Queued messages while agent was busy\]\s*\n?/, '').trim())
    .filter(Boolean)
  return messages.join('\n\n')
}
```

Apply it in `textFromMessage()` or wherever user message text is extracted for display. Search for the function `textFromMessage` and wrap its return.

**File: `src/screens/chat/components/message-actions-bar.tsx`**
Remove the `isQueued` clock icon + "Sent" label section (lines 74-93). The in-bubble "Sent" label in message-item.tsx is sufficient. Don't remove the prop — just don't render the UI for it.

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `fix: strip queued message wrappers + remove duplicate Sent label`
4. Push to origin main

---

## TASK-02: First-Run Wizard Rewrite (Step 1 copy)
**Priority:** P0 | **Files:** 1 | **Est:** 20 min

### Problem
First step of gateway-setup-wizard says "Enter your OpenClaw gateway URL and token" — meaningless to new users.

### Changes

**File: `src/components/gateway-setup-wizard.tsx`**

Find the first step content (around line 387-390 where it says "Enter your OpenClaw gateway URL and token"). Replace with three clear choice cards:

```tsx
<div className="grid gap-3">
  <button onClick={() => setSetupMode('local')} className="rounded-xl border border-primary-200 dark:border-neutral-700 p-4 text-left hover:bg-primary-50 dark:hover:bg-neutral-800 transition-colors">
    <p className="font-semibold text-primary-900 dark:text-neutral-100">Use this computer</p>
    <p className="text-sm text-primary-500 dark:text-neutral-400 mt-1">Install and run everything locally. Best for personal use.</p>
  </button>
  <button onClick={() => setSetupMode('remote')} className="rounded-xl border border-primary-200 dark:border-neutral-700 p-4 text-left hover:bg-primary-50 dark:hover:bg-neutral-800 transition-colors">
    <p className="font-semibold text-primary-900 dark:text-neutral-100">Connect another machine</p>
    <p className="text-sm text-primary-500 dark:text-neutral-400 mt-1">Connect to OpenClaw running on a server, Pi, or another computer.</p>
  </button>
  <button onClick={() => setSetupMode('cloud')} className="rounded-xl border border-primary-200 dark:border-neutral-700 p-4 text-left hover:bg-primary-50 dark:hover:bg-neutral-800 transition-colors">
    <p className="font-semibold text-primary-900 dark:text-neutral-100">ClawSuite Cloud</p>
    <p className="text-sm text-primary-500 dark:text-neutral-400 mt-1">No setup needed. Managed hosting with one click. <span className="text-xs opacity-60">(Coming soon)</span></p>
  </button>
</div>
```

Add state: `const [setupMode, setSetupMode] = useState<'local' | 'remote' | 'cloud' | null>(null)`

- 'local' → triggers existing local setup flow (EventSource to /api/local-setup)
- 'remote' → shows existing URL + token fields
- 'cloud' → shows "Coming soon" message with waitlist link

Only show the URL/token fields when setupMode === 'remote'. The existing local setup flow stays exactly as-is, just reached through the card instead of being the default.

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `feat: outcome-first wizard — Use this computer / Connect / Cloud cards`
4. Push to origin main

---

## TASK-03: Connection Error Taxonomy
**Priority:** P1 | **Files:** 1 | **Est:** 15 min

### Problem
Connection errors show raw technical text. Users need plain-language explanations.

### Changes

**File: `src/screens/chat/components/gateway-status-message.tsx`** (or wherever the gateway error state renders — search for "not connected" or "connection" error messages)

Add an error classifier function:

```typescript
function classifyConnectionError(error?: string, status?: number): {
  title: string
  description: string
  action: string
} {
  if (!error && !status) return {
    title: 'Not connected',
    description: 'ClawSuite can\'t reach the gateway.',
    action: 'Check that OpenClaw is running, then try again.'
  }
  if (status === 401 || error?.includes('auth') || error?.includes('token')) return {
    title: 'Authentication required',
    description: 'The gateway rejected the connection token.',
    action: 'Go to Settings → Advanced → Gateway to update your token.'
  }
  if (status === 403 || error?.includes('pair')) return {
    title: 'Pairing required',
    description: 'This device isn\'t paired with the gateway yet.',
    action: 'Run "openclaw pair" on the gateway machine.'
  }
  if (error?.includes('ECONNREFUSED') || error?.includes('fetch')) return {
    title: 'Gateway unreachable',
    description: 'Can\'t connect to the gateway at the configured URL.',
    action: 'Make sure OpenClaw is running and the URL is correct.'
  }
  return {
    title: 'Connection error',
    description: error || 'Something went wrong.',
    action: 'Try refreshing or check Settings → Advanced → Gateway.'
  }
}
```

Use this to render structured error messages instead of raw error text.

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `feat: connection error taxonomy — human-readable gateway errors`
4. Push to origin main

---

## TASK-04: Auth Hardening — Localhost-Only Sensitive Endpoints
**Priority:** P1 (pre-beta) | **Files:** 1 | **Est:** 15 min

### Problem
When no CLAWSUITE_PASSWORD is set, ALL endpoints are open to any network request.

### Changes

**File: `src/server/auth-middleware.ts`**

Add a helper:

```typescript
function isLocalRequest(request: Request): boolean {
  // Check common headers for client IP
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || '127.0.0.1'
  const localIPs = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']
  return localIPs.includes(ip)
}
```

Modify `isAuthenticated()`: when no password is configured, still allow access but ONLY from localhost for sensitive endpoints. Add a new export:

```typescript
export function requireLocalOrAuth(request: Request): boolean {
  if (isAuthenticated(request)) return true
  return isLocalRequest(request)
}
```

Then in these files, replace `isAuthenticated` with `requireLocalOrAuth`:
- `src/routes/api/update-check.ts` (the POST handler that runs git pull)
- `src/routes/api/local-setup.ts` 
- `src/routes/api/terminal-stream.ts`
- `src/routes/api/files.ts` (DELETE handler only)

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `security: restrict sensitive endpoints to localhost when no password set`
4. Push to origin main

---

## TASK-05: Wire formatModelName Across All Surfaces
**Priority:** P1 | **Files:** 4 | **Est:** 20 min

### Problem
Raw model IDs like `anthropic/claude-sonnet-4-6` still appear in usage modal, agents screen, remote agents panel, and agent hub layout.

### Changes

Import `formatModelName` from `@/lib/format-model-name` in each file and wrap model display strings:

**File: `src/components/usage-meter/usage-details-modal.tsx`**
- Line ~384-405: where `model.model` is displayed, wrap with `formatModelName(model.model)`
- Line ~415-438: where `session.model` is displayed, wrap with `formatModelName(session.model)`

**File: `src/screens/gateway/agents-screen.tsx`**
- Line ~1069: where tokens are shown with model, wrap model display
- Line ~660-677: any raw model references

**File: `src/screens/gateway/components/remote-agents-panel.tsx`**
- Line ~141: strip provider prefix → replace with `formatModelName()`
- Line ~154: where `tok` is shown

**File: `src/screens/gateway/agent-hub-layout.tsx`**
- Line ~99-100: raw `anthropic/claude-sonnet-4-6` labels
- Line ~169, ~195: manual split on `/` → replace with `formatModelName()`

Search for patterns: `.model` displayed in JSX, `.split('/')`, model IDs in strings.

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `feat: human-readable model names across all UI surfaces`
4. Push to origin main

---

## TASK-06: Empty States with Action Steps
**Priority:** P2 | **Files:** 3 | **Est:** 10 min

### Problem
Empty states just say "No X yet" without guiding the user to a next action.

### Changes

**File: `src/screens/chat/components/sidebar/sidebar-sessions.tsx`**
- Line ~149: `No sessions yet.` → `No sessions yet. Start a conversation to see them here.`

**File: `src/components/usage-meter/usage-details-modal.tsx`**
- Line ~489: `No providers connected` → `No providers connected. Add a provider in Settings to start chatting.`

**File: `src/components/agent-view/agent-view-panel.tsx`**
- Already updated — verify the text says "Spawn agents from chat or CLI"

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `ux: action-oriented empty states`
4. Push to origin main

---

## TASK-07: Reliable Chat Sync — Adaptive Polling + Visibility Refresh
**Priority:** P0 | **Files:** 2 | **Est:** 20 min

### Problem
Chat history goes stale when SSE drops. Poll interval is 30-60s. No fast recovery when connection drops or app returns to foreground. Result: user sees old messages, no indication data is stale.

### Fix: Adaptive polling based on SSE connection state

**File: `src/screens/chat/chat-screen.tsx`**

1. Read the `connectionState` from `useGatewayChatStore`:
```typescript
const connectionState = useGatewayChatStore((s) => s.connectionState)
```

2. Change `historyQuery` refetchInterval to be dynamic — fast when SSE is down:
```typescript
refetchInterval: connectionState === 'connected' ? 30_000 : 5_000,
```
This means: when SSE is healthy, poll every 30s. When SSE drops/reconnecting, poll every 5s as fallback.

3. Add a `visibilitychange` listener that force-refetches on tab focus:
```typescript
useEffect(() => {
  function handleVisibility() {
    if (document.visibilityState === 'visible') {
      void historyQuery.refetch()
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [historyQuery])
```

4. Also add `refetchOnWindowFocus: true` to historyQuery options if not already set (check first).

**File: `src/hooks/use-gateway-chat-stream.ts`**

5. When SSE connection state transitions to `disconnected` or `error`, trigger an immediate history refetch signal. Find where `connectionState` is set to `disconnected` and dispatch a custom event or call a passed-in callback:
```typescript
// When connection drops, signal chat screen to refetch
if (newState === 'disconnected' || newState === 'error') {
  window.dispatchEvent(new CustomEvent('clawsuite:sse-dropped'))
}
```

6. In `chat-screen.tsx`, listen for this event and refetch:
```typescript
useEffect(() => {
  function handleSSEDrop() {
    void historyQuery.refetch()
  }
  window.addEventListener('clawsuite:sse-dropped', handleSSEDrop)
  return () => window.removeEventListener('clawsuite:sse-dropped', handleSSEDrop)
}, [historyQuery])
```

### What this achieves
- SSE connected → 30s polling (unchanged, SSE handles realtime)
- SSE drops → immediate refetch + 5s polling until reconnected  
- App comes back to foreground → instant refetch
- No UI changes needed, works on all platforms including mobile

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `fix: adaptive chat polling — fast recovery when SSE drops, instant on visibility`
4. Do NOT push
5. When done: `openclaw system event --text "Codex done: TASK-07 chat sync committed" --mode now`

---

## TASK-08: Research Card — Live Action Timeline in Chat
**Priority:** P1 (after hotfixes) | **Files:** 3-4 new + existing | **Est:** 45 min

### Concept
When Aurora (or any agent) is working, show a collapsible card in the chat that lists each action as it happens — like ChatGPT's deep research card but for ALL agent activity.

```
┌─────────────────────────────────────────┐
│ ⚡ Aurora is working...          ▾ hide │
│                                         │
│ ✅ Read ROADMAP.md                      │
│ ✅ Spawned Codex (calm-wharf)           │
│ 🔄 Verifying build...                   │
│ ⏳ Push to origin/main                  │
│                                         │
│ 3 tools · 12s                    Done ✓ │
└─────────────────────────────────────────┘
```

Collapses to a summary pill when done:
`⚡ Ran 3 tools · 12s · Done ✓`

### Data Source
Tool calls already flow through the SSE stream as `tool_call` and `tool_result` events in `chat-event-bus.ts`. The `ThinkingBubble` in `chat-message-list.tsx` already tracks the active tool name. We just need to collect the full sequence and render it as a timeline.

### New Files

**`src/screens/chat/components/research-card.tsx`**
```tsx
type ResearchStep = {
  id: string
  toolName: string        // e.g. "exec", "Read", "sessions_spawn"
  label: string           // human-readable: "Running build...", "Reading ROADMAP.md"
  status: 'running' | 'done' | 'error'
  startedAt: number
  durationMs?: number
}

type ResearchCardProps = {
  steps: ResearchStep[]
  isActive: boolean       // true while streaming
  totalDurationMs: number
  onToggle: () => void
  collapsed: boolean
}
```

Tool name → human label mapping:
- `exec` → "Running command"
- `Read` / `read` → "Reading {filename from args}"
- `Write` / `write` → "Writing {filename}"
- `Edit` / `edit` → "Editing {filename}"
- `web_search` → "Searching the web"
- `web_fetch` → "Fetching page"
- `sessions_spawn` → "Spawning agent"
- `sessions_send` → "Steering agent"
- `memory_search` → "Searching memory"
- `browser` → "Controlling browser"
- `image` → "Analyzing image"
- default → capitalize tool name

**`src/hooks/use-research-card.ts`**
Hook that subscribes to the SSE stream and builds the step list:
- Listen for `tool_call` events → add step with `status: 'running'`
- Listen for `tool_result` events → update matching step to `status: 'done'` + record duration
- Reset when new message is sent
- Expose `{ steps, isActive, totalDurationMs, collapsed, setCollapsed }`

### Integration

**`src/screens/chat/components/chat-message-list.tsx`**
- Show `<ResearchCard>` above the `ThinkingBubble` when `steps.length > 0 && isStreaming`
- Pass `useResearchCard()` data down as props
- Hide the card (collapse to pill) when streaming ends, show summary

**`src/screens/chat/chat-screen.tsx`**
- Wire `useResearchCard` hook, pass to message list

### Design
- Background: `bg-primary-50 dark:bg-neutral-900`
- Border: `border border-primary-200 dark:border-neutral-700`
- Step icons: `✅` done, `🔄` running (animate-spin), `⏳` pending, `❌` error
- Collapsed pill: same style as tool pills in existing chat
- Smooth expand/collapse with framer-motion (already in project)

### Verification
1. `npx tsc --noEmit` — zero errors
2. `npm run build` — succeeds
3. Commit: `feat: research card — live action timeline during agent responses`
4. Do NOT push
5. When done: `openclaw system event --text "Codex done: TASK-08 research card committed" --mode now`
