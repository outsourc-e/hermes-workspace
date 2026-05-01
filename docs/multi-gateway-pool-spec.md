# Multi-Gateway Pool Architecture
## Hermes Workspace — Profile-Parallel Agent Execution

### Status: Design Document — PR Proposal

---

## 1. Problem Statement

Hermes Workspace currently operates as a **single-gateway, single-profile UI**. The gateway loads one `HERMES_HOME` at startup and all chat sessions, operations, and memory access flow through that one process.

For multi-profile users (the primary Claude use case), this means:
- **No parallel agent execution**: Cannot brainstorm with Nous while Jules orchestrates Architect and Sentinel in Operations
- **No profile identity in chat**: The "agent" is always whoever the single gateway was launched as
- **Terminal fragmentation**: Users must open separate terminal windows per profile to achieve true multi-agent workflows
- **Session pollution**: All sessions pile into one pool regardless of which agent personality created them

### User Story

> "I think strategically with Nous about Ascent Performance features while Jules orchestrates building with Architect and Sentinel. I want to quick-switch between these agent conversations in the same workspace window, with each agent maintaining its own memory, skills, and session context."

---

## 2. First-Principles Design

**Core truth**: Each Hermes profile is a **distinct cognitive agent** — different SOUL.md, different skills, different memory, different purpose. They are not "modes" of one agent. They are parallel agents.

**Implication**: The workspace must be an **agent orchestrator**, not just a UI skin over one gateway.

**Constraint**: Hermes Agent gateway is designed as a single-tenant process. It cannot dynamically reload profiles. Each profile needs its own gateway instance.

**Solution**: The workspace maintains a **gateway pool** — one gateway process per active profile, each on its own port, all health-monitored, all routable from the UI.

**Design principles:**
1. **Profile-count agnostic**: Works for 1 profile or 100. No hardcoded limits, arrays, or switch statements enumerating specific profiles.
2. **Privacy by design**: No PII, API keys, passwords, or secrets in code, logs, or PRs. All sensitive data stays in profile-local `.env` files.
3. **Backward compatible**: Single-profile users unaffected. Pool mode is opt-in.
4. **Fail-safe**: A dead gateway does not crash the workspace. Graceful fallback always available.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Hermes Workspace UI                      │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────┐  │
│  │ Chat    │  │ Ops     │  │ Memory  │  │ Profile       │  │
│  │ (Nous)  │  │ (Jules) │  │ (all)   │  │ Selector      │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  └───────┬───────┘  │
└───────┼────────────┼────────────┼────────────────┼──────────┘
        │            │            │                │
        └────────────┴────────────┘                │
                   │                               │
        ┌──────────┴──────────┐                    │
        │  Gateway Router     │                    │
        │  (workspace server) │                    │
        └──────────┬──────────┘                    │
                   │                               │
    ┌──────────────┼──────────────┐                │
    │              │              │                │
┌───┴───┐    ┌────┴────┐   ┌─────┴─────┐   ┌─────┴─────┐
│Gateway│    │ Gateway │   │  Gateway  │   │  Gateway  │
│:8642  │    │ :8643   │   │  :8644    │   │  :8645    │
│(nous) │    │ (jules) │   │ (architect│   │ (sentinel)│
└───┬───┘    └────┬────┘   └─────┬─────┘   └─────┬─────┘
    │             │              │               │
┌───┴───┐    ┌────┴────┐   ┌─────┴─────┐   ┌─────┴─────┐
│nous/  │    │jules/   │   │architect/ │   │sentinel/  │
│config │    │config   │   │config     │   │config     │
│memory │    │memory   │   │memory     │   │memory     │
│skills │    │skills   │   │skills     │   │skills     │
│sessions│   │sessions │   │sessions   │   │sessions   │
└───────┘    └─────────┘   └───────────┘   └───────────┘
```

---

## 4. Gateway Pool Manager

### 4.1 Port Assignment Convention

```typescript
const BASE_PORT = 8642
function getGatewayPort(profileName: string, profiles: string[]): number {
  const index = profiles.indexOf(profileName)
  return BASE_PORT + Math.max(0, index)
}
```

Profiles are sorted alphabetically to ensure stable port assignment. A persistence file (`gateway-pool.json`) remembers assignments across restarts.

**Profile-count agnostic**: The pool manager discovers profiles dynamically from the filesystem (`~/.hermes/profiles/*`). There is no hardcoded list, no maximum count, and no special-casing of specific profile names. A user with 2 profiles and a user with 50 profiles use the exact same code path.

### 4.2 Gateway Lifecycle States

```typescript
type GatewayState = 
  | 'spawning'      // Process starting
  | 'healthy'       // Responded to /health within 5s
  | 'degraded'      // Slow responses (>2s)
  | 'dead'          // Failed health check 3x
  | 'stopped'       // User explicitly stopped
```

### 4.3 Spawn Protocol

```typescript
function spawnGateway(profileName: string, port: number): ChildProcess {
  const profilePath = path.join(getClaudeRoot(), 'profiles', profileName)
  const env = {
    ...process.env,
    HERMES_HOME: profilePath,
    CLAUDE_GATEWAY_PORT: String(port),
    CLAUDE_PROFILE_NAME: profileName,
  }
  return spawn('claude', ['gateway', '--port', String(port)], { env })
}
```

**Note**: The gateway must be spawned via `hermes gateway`, not via the workspace's internal gateway.ts. The workspace becomes an orchestrator, not a gateway host.

### 4.4 Health Monitor

- Poll each gateway `GET /health` every 30s
- 3 consecutive failures → mark `dead`, auto-restart (with backoff)
- Slow response (>2s) → mark `degraded`, log warning
- Recovery → mark `healthy`

### 4.5 Shutdown Protocol

On workspace exit (SIGTERM):
1. Send graceful shutdown to all gateways (`POST /shutdown`)
2. Wait 10s
3. SIGKILL any remaining
4. Persist gateway-pool.json state

---

## 5. Request Routing Layer

### 5.1 API Route Changes

All workspace API routes gain **profile context**:

```typescript
// Current: /api/chat/completions
// New:    /api/chat/completions?profile=nous
//         or header: X-Claude-Profile: nous

// Gateway proxy routes:
// /api/gateway/{profile}/chat/completions
// /api/gateway/{profile}/sessions
// /api/gateway/{profile}/memory
// etc.
```

### 5.2 Router Implementation

```typescript
// src/server/gateway-router.ts
export async function proxyToGateway(
  profileName: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const gateway = gatewayPool.get(profileName)
  if (!gateway || gateway.state !== 'healthy') {
    throw new Error(`Gateway for profile "${profileName}" is unavailable`)
  }
  const url = `http://127.0.0.1:${gateway.port}${path}`
  return fetch(url, init)
}
```

### 5.3 Backward Compatibility

When no profile is specified:
- Default to `activeProfile` (from `~/.hermes/active_profile` file)
- If that file doesn't exist, default to first available profile
- Single-profile users see **zero behavioral change**

---

## 6. Session Isolation Model

### 6.1 Session Storage

Currently: All sessions in `~/.hermes/sessions/` (or profile's sessions dir)

With multi-gateway: Each gateway manages its own sessions in its own profile directory. The workspace **aggregates** them for display but **routes** them per-profile.

```typescript
// src/server/sessions-aggregator.ts
export async function listAllSessions(): Promise<SessionMeta[]> {
  const profiles = listProfiles()
  const allSessions = await Promise.all(
    profiles.map(async (profile) => {
      const gateway = gatewayPool.get(profile.name)
      if (!gateway) return []
      const res = await fetch(`http://127.0.0.1:${gateway.port}/api/sessions`)
      const sessions = await res.json()
      return sessions.map((s: SessionMeta) => ({
        ...s,
        profile: profile.name,
        profileColor: getProfileColor(profile.name),
      }))
    })
  )
  return allSessions.flat().sort((a, b) => b.updatedAt - a.updatedAt)
}
```

### 6.2 Session Display

Sessions in sidebar are **grouped by profile** with visual distinction:

```
SESSIONS
▼ nous (green dot)
  ├─ Hello from workspace test · 3:05 PM
  └─ Email triage architecture · Apr 22
▼ jules (blue dot)
  ├─ Ascent build orchestration · 2:30 PM
  └─ PR #118 coordination · Apr 21
▼ architect (purple dot)
  └─ Gateway pool refactor · Apr 20
```

---

## 7. UI Changes

### 7.1 Profile Selector (Global Header)

A persistent pill/button in the top-left (next to sidebar toggle):

```
[☰] [ nous ▼ ]              Hermes Workspace
```

- Dropdown lists all profiles with status indicators
- Green dot = gateway healthy
- Yellow dot = degraded
- Red dot = dead/stopped
- Clicking switches active profile for the **current panel**
- `Cmd+Shift+1..6` keyboard shortcuts for rapid switching

### 7.2 Chat Screen

- Empty state shows active profile name + model (already implemented in PR #118)
- Session list shows profile-colored dots per session
- Composer sends to active profile's gateway
- "New Session" creates session scoped to active profile

### 7.3 Operations / Conductor

- Task cards show which profile they're running on
- "Run on" dropdown when creating tasks
- Operations dashboard aggregates tasks across all profiles

### 7.4 Memory Browser

- Memory entries tagged with profile
- Filter by profile
- Cross-profile memory search (optional, user-configurable)

---

## 8. File Changes Required

### New Files
```
src/server/gateway-pool.ts          # Core pool manager
src/server/gateway-pool.test.ts     # Pool tests
src/server/gateway-router.ts        # Request routing layer
src/server/sessions-aggregator.ts   # Multi-profile session aggregation
src/components/profile-selector.tsx # Global profile switcher
src/components/profile-badge.tsx    # Small profile indicator
src/hooks/use-gateway-pool.ts       # React hook for pool state
src/routes/api/gateway-pool.ts      # Pool status API
```

### Modified Files
```
src/server/profiles-browser.ts      # Add gateway port field
src/routes/api/profiles/list.ts     # Include gateway status
src/routes/api/chat.ts              # Route to correct gateway
src/routes/api/sessions.ts          # Aggregate across gateways
src/screens/chat/chat-screen.tsx    # Pass profile context
src/screens/chat/components/chat-header.tsx  # Show profile badge
src/screens/chat/components/chat-empty-state.tsx  # Already done
src/components/workspace-shell.tsx  # Add profile selector
src/server/local-provider-discovery.ts  # Multi-gateway provider discovery
```

---

## 9. Configuration

### Environment Variables
```bash
CLAUDE_GATEWAY_POOL_ENABLED=true   # Enable multi-gateway mode
CLAUDE_GATEWAY_BASE_PORT=8642      # Starting port
CLAUDE_GATEWAY_POOL_MAX=10         # Max concurrent gateways
CLAUDE_GATEWAY_HEALTH_INTERVAL=30  # Health check seconds
```

### workspace-overrides.json
```json
{
  "gatewayPool": {
    "enabled": true,
    "autoSpawn": ["nous", "jules"],
    "portOverrides": {
      "nous": 8642,
      "jules": 9000
    }
  }
}
```

---

## 10. Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Gateway fails to spawn | Show error toast, allow retry, fallback to active profile |
| Port already in use | Auto-increment port, log warning |
| Profile deleted while gateway running | Stop gateway, remove from pool |
| Workspace crashes | On restart, check for orphaned gateways, adopt or kill |
| Single-profile user | Pool mode off by default, zero impact |
| Gateway version mismatch | Log warning, attempt spawn anyway |
| Memory pressure | Allow user to stop idle gateways, keep active ones |

---

## 11. Security & Privacy Considerations

- Gateways bind to `127.0.0.1` only (already default)
- No cross-profile memory leakage (each gateway has its own `HERMES_HOME`)
- Profile selector respects auth middleware
- Admin-only: ability to spawn/stop gateways
- **No secrets in code or PRs**: API keys, passwords, tokens, and PII must never appear in source code, test fixtures, log output, or PR descriptions. All sensitive configuration lives in profile-local `.env` files which are `.gitignore`d.
- **Sanitized examples**: Architecture diagrams and examples use fictional profile names (e.g., `agent-alpha`, `agent-beta`) or generic placeholders, never real user profile names, paths, or credentials.
- **No hardcoded paths**: Port assignments, profile directories, and gateway URLs are resolved dynamically. No `/Users/...` or `C:\Users\...` paths in code.
- **Log safety**: Gateway pool logs must redact any env vars containing `KEY`, `TOKEN`, `SECRET`, or `PASSWORD`.

---

## 12. Performance

| Metric | Target |
|--------|--------|
| Gateway spawn time | < 3s |
| Profile switch latency | < 200ms (no spawn needed) |
| Health check overhead | < 10ms per gateway |
| Memory per gateway | ~100-200MB |
| Max recommended profiles | 10 (configurable) |

---

## 13. Backward Compatibility

- **Single-profile users**: Completely unaffected. Pool mode off by default.
- **Multi-profile users (current)**: Pool mode can be toggled in Settings. When off, behavior matches current single-gateway mode.
- **Existing sessions**: Preserved. Each session already lives in its profile directory. The workspace just aggregates them properly.
- **API contracts**: All existing `/api/*` routes work unchanged when no profile specified.

---

## 14. Migration Path

1. **Phase 1 (This PR)**: Pool manager + routing layer + profile selector in chat
2. **Phase 2 (Follow-up)**: Session aggregation with profile grouping
3. **Phase 3 (Follow-up)**: Operations/Conductor multi-profile support
4. **Phase 4 (Follow-up)**: Memory browser cross-profile search

---

## 15. Related Work

- PR #118: Profile-aware config (merged) — provides `HERMES_HOME` resolution and profile listing
- Issue #?: Multi-profile session management (to be created)
- Issue #?: Gateway lifecycle hooks (to be created)

---

## 16. Open Questions for Discussion

1. Should the workspace auto-spawn all profile gateways on startup, or only on first use?
2. Should there be a "workspace default" profile that's always active, or should each panel remember its last profile?
3. How should the Conductor page handle tasks that span multiple profiles (e.g., Jules delegates to Architect)?
4. Should profiles share a unified notification stream, or should each profile have its own notification badge?

---

*Authored by Nous (Vivere Vitalis) for the Hermes Workspace project.*
*First-principles architecture: if each profile is a distinct agent, the workspace must be an agent orchestrator.*
