# Hermes Workspace — E2E Audit

## Summary
Hermes Workspace is only partially rewired. The core chat/session/history/model/skills/memory surface is connected to Hermes FastAPI on `http://127.0.0.1:8642` and the live backend currently exposes exactly `/health`, `/v1/models`, `/api/config`, `/api/memory`, `/api/skills*`, and `/api/sessions*`. Everything outside that surface falls into one of three buckets: local-only features that still work without Hermes (files, terminal, password auth, theme/local settings), legacy OpenClaw gateway features left in the UI but stubbed out (logs, agents, channels, approvals, nodes, cron, model/config mutation), and separate workspace-daemon features that talk to another backend entirely, not Hermes. For tomorrow’s demo, chat works, sessions mostly work, memory/skills browse works, files/terminal work locally, but a large share of non-chat navigation is still a facade.

## Feature Matrix
| Feature | Status | Notes |
|---|---|---|
| Chat send/stream | ⚠️ PARTIAL | Hermes SSE works, but wrapper lives in `src/routes/api/send-stream.ts`, not `src/server/send-stream.ts`; missing abort and some event translations. |
| Chat history | ✅ WORKING | `/api/history` maps Hermes messages to frontend format via `toGatewayMessage()`. |
| Session list/create/delete | ✅ WORKING | `/api/sessions` is Hermes-backed and verified live. |
| Session switch/friendly IDs | ⚠️ PARTIAL | `resolveSessionKey()` does no lookup; friendly IDs are treated as raw IDs and `main` is synthetic. |
| Session rename | ✅ WORKING | `/api/sessions` `PATCH` calls Hermes `PATCH /api/sessions/{id}`. |
| Session title generation | ❌ STUBBED | `/api/session-title` returns `501`. |
| Chat abort | ❌ STUBBED | `/api/chat-abort` returns `{ ok: true }` but does not cancel anything. |
| Model listing | ⚠️ PARTIAL | `/api/models` reads Hermes `/v1/models` but filters by local provider config; can hide valid Hermes models. |
| Model switching | ❌ STUBBED | `/api/model-switch` only echoes parsed model info; does not persist to Hermes. |
| Tool call rendering | ⚠️ PARTIAL | Historical tool calls render from `tool_calls`; live stream only translates a subset of Hermes tool events. |
| Error handling when Hermes is down | ⚠️ PARTIAL | Core fetches fail closed, but several screens still show gateway-era wording and generic 500s. |
| Inspector Activity tab | ⚠️ PARTIAL | Local activity store only; not Hermes-backed. |
| Inspector Files tab | ❌ STUBBED | Derived from local activity events only; no file API query. |
| Inspector Memory tab | ✅ WORKING | Calls Hermes `/api/memory` directly. |
| Inspector Skills tab | ✅ WORKING | Calls Hermes `/api/skills` directly. |
| Inspector Logs tab | ❌ STUBBED | Dumps local activity JSON, not backend logs. |
| Sessions page | ❌ STUBBED | Reads `/api/gateway/sessions`, which returns an empty array. |
| Files page | ✅ WORKING | Local file browser/editor via `/api/files`; not Hermes-backed. |
| Memory page | ✅ WORKING | Local memory browser over `/api/memory/*`; functional, but not using Hermes `/api/memory`. |
| Skills page | ⚠️ PARTIAL | Browse works from Hermes `/api/skills`; install/toggle actions return `501`. |
| Activity page | ❌ STUBBED | Activity stream is permanently disconnected; only local terminal events populate it. |
| Cron/Jobs page | ❌ STUBBED | `gatewayCronRpc()` returns `[]`; CRUD actions hit empty fake backend. |
| Settings page: theme/local prefs | ✅ WORKING | Persisted in `localStorage` via Zustand and theme storage. |
| Settings page: gateway config | ❌ STUBBED | Old gateway setup UX remains; save/discover endpoints return `501`. |
| Settings page: provider/model config | ⚠️ PARTIAL | Reads Hermes `/v1/models` and `/api/config`, but all save/remove flows hit stubbed mutation routes. |
| Onboarding wizard | ⚠️ PARTIAL | Generic onboarding works locally; gateway setup wizard still exists and is no longer relevant to Hermes FastAPI. |
| First launch with no sessions | ⚠️ PARTIAL | Redirects to `/chat/main`; no explicit Hermes session bootstrap until first send. |
| Terminal | ✅ WORKING | Full local PTY terminal exists and is wired to `/api/terminal-*`. |
| Gateway logs | ❌ STUBBED | `/api/gateway/logs` returns `501`. |
| Gateway agents/channels/nodes/approvals/usage | ❌ STUBBED | Endpoints return empty arrays or `501`; no Hermes equivalent exists. |
| Workspace daemon panels/stats | 🔌 MISSING | These depend on separate daemon APIs, not Hermes FastAPI. |

## Chat System Deep Dive

### Actual server/client surface
- `src/server/hermes-api.ts`
  - Real Hermes-backed methods: `checkHealth`, `listSessions`, `getSession`, `createSession`, `updateSession`, `deleteSession`, `getMessages`, `searchSessions`, `forkSession`, `streamChat`, `sendChat`, `getMemory`, `listSkills`, `getSkill`, `getSkillCategories`, `getConfig`, `listModels`, `isHermesAvailable`.
  - Verified against live Hermes OpenAPI on March 15, 2026: every method above exists except there is no Hermes endpoint for model switching, abort, gateway logs, agents, cron, approvals, or config patch.
- Streaming is not in `src/server/send-stream.ts`; the active wrapper is `src/routes/api/send-stream.ts`.

### Message ordering
- Historical ordering is correct.
  - Hermes returns messages in chronological order.
  - `/api/history` slices the tail but preserves order.
  - `appendHistoryMessage()` inserts late SSE echoes by timestamp instead of appending blindly.
- Realtime merge is still fragile.
  - `mergeHistoryMessages()` appends unseen realtime messages after history rather than fully re-sorting, so ordering depends on history already being mostly correct.

### Session management
- Create/list/delete/rename are real.
  - `/api/sessions` maps directly to Hermes session CRUD.
  - Verified live by creating and deleting `audit-probe-session`.
- Switch/resolve behavior is weak.
  - `resolveSessionKey()` never resolves friendly IDs against session data.
  - Route param values like `main` and `new` are frontend inventions, not Hermes concepts.
  - If `main` does not exist in Hermes, first send can fail with `session not found`.

### Tool call rendering
- Historical tool calls work if Hermes persisted `tool_calls` JSON on assistant messages and tool-role messages for results.
- Live stream coverage is incomplete.
  - Mapped: `tool.pending`, `tool.started`, `tool.progress` (only `_thinking`), `tool.completed`, `tool.failed`.
  - Not mapped: other Hermes tool events if backend adds them.
  - `tool.completed` drops result payload; UI mostly gets phase markers, not rich results.

### Error handling and “Failed to send”
- Send path:
  1. `ChatScreen` creates optimistic user message.
  2. `useStreamingMessage.startStreaming()` `POST`s `/api/send-stream`.
  3. `/api/send-stream` resolves session key and calls `streamChat()` against Hermes.
  4. If Hermes fetch fails or stream errors, route emits SSE `error`.
  5. `useStreamingMessage` turns that into `markFailed()`.
  6. `ChatScreen.onError()` marks optimistic message as `error` and shows `Failed to send message`.
- Problems:
  - `/api/send-stream` emits `done` on Hermes `error`, but raw route exceptions emit `error`; the client handles both, but semantics are inconsistent.
  - `/api/chat-abort` does nothing, so a stalled send cannot be cancelled.
  - `src/server/chat-event-bus.ts` has `hasActiveSendRun()` hardcoded to `false`, so dedupe is delegated to the client store only.
  - Many user-facing strings still say “gateway” even though failures are Hermes fetch failures.

### Verified live Hermes SSE behavior
- Confirmed events from live backend: `session.created`, `run.started`, `message.started`, then assistant output persisted correctly in `/api/sessions/{id}/messages`.
- The frontend wrapper does not expose `session.created`.
- The wrapper currently never emits `step` usage events, even though `useStreamingMessage` supports them.

## Route-by-Route Breakdown

### User-facing routes
| Route file | Route | Status | What it fetches / does |
|---|---|---|---|
| `src/routes/index.tsx` | `/` | ✅ WORKING | Redirects to `/chat/main`. |
| `src/routes/chat/index.tsx` | `/chat` | ✅ WORKING | Redirects to `/chat/main`. |
| `src/routes/chat/$sessionKey.tsx` | `/chat/:sessionKey` | ⚠️ PARTIAL | Loads `ChatScreen`; chat data is real, but route/session identity model is synthetic. |
| `src/routes/sessions.tsx` | `/sessions` | ❌ STUBBED | `SessionsScreen` fetches `/api/gateway/sessions`, which is empty. |
| `src/routes/files.tsx` | `/files` | ✅ WORKING | Local file explorer/editor via `/api/files`; not Hermes. |
| `src/routes/memory.tsx` | `/memory` | ✅ WORKING | Uses `/api/memory/list`, `/read`, `/search`, `/write` backed by local filesystem memory browser. |
| `src/routes/skills.tsx` | `/skills` | ⚠️ PARTIAL | Reads Hermes skills via `/api/skills`; install/toggle is `501`. |
| `src/routes/activity.tsx` | `/activity` | ❌ STUBBED | Subscribes to `/api/events`; server activity stream is permanently disconnected. |
| `src/routes/cron.tsx` | `/cron` | ❌ STUBBED | Uses `/api/cron*`; server cron RPC is hardcoded empty. |
| `src/routes/terminal.tsx` | `/terminal` | ✅ WORKING | Local PTY terminal via `/api/terminal-stream`, `/input`, `/resize`, `/close`. |
| `src/routes/settings/index.tsx` | `/settings` | ⚠️ PARTIAL | Theme/local prefs work; gateway/provider save flows do not. |
| `src/routes/settings/providers.tsx` | `/settings/providers` | ⚠️ PARTIAL | Reads Hermes models/config, but writes are stubbed. |
| `src/routes/gateway/logs.tsx` | `/gateway/logs` | ❌ STUBBED | `/api/gateway/logs` returns `501`. |
| `src/routes/$.tsx` | 404 | ✅ WORKING | Static fallback page. |

### Important API route groups
| API group | Status | Notes |
|---|---|---|
| `/api/sessions`, `/api/history`, `/api/send-stream`, `/api/sessions/send`, `/api/sessions/$sessionKey/status`, `/api/ping` | ✅/⚠️ | Core Hermes integration. |
| `/api/models`, `/api/config-get`, `/api/session-status` | ⚠️ | Read from Hermes, but shaped through old gateway assumptions. |
| `/api/model-switch`, `/api/chat-abort`, `/api/send`, `/api/session-title` | ❌ | Stubs / no-op. |
| `/api/gateway/*` | ❌ | Mostly empty arrays or `501`. |
| `/api/cron*` | ❌ | All depend on `gatewayCronRpc()` which returns `[]`. |
| `/api/browser*` | ❌ | Depend on `gatewayRpc()` which always rejects `Not available`. |
| `/api/memory/*` | ✅ | Local filesystem memory APIs, not Hermes memory API. |
| `/api/files` | ✅ | Local filesystem APIs. |
| `/api/terminal*` | ✅ | Local PTY backend. |
| `/api/workspace/*` | 🔌 | Separate workspace daemon surface; not Hermes FastAPI. |

## Inspector Panel
| Tab | Status | Notes |
|---|---|---|
| Activity | ⚠️ PARTIAL | Uses local `activity-store`; reflects only front-end pushed events from chat streaming. |
| Files | ❌ STUBBED | Extracts file names from local activity text; does not query files or Hermes. |
| Memory | ✅ WORKING | Direct `fetch('http://localhost:8642/api/memory')`. |
| Skills | ✅ WORKING | Direct `fetch('http://localhost:8642/api/skills')`. |
| Logs | ❌ STUBBED | Displays JSON-serialized local activity events, not backend logs. |

## API Client Coverage (hermes-api.ts methods vs Hermes FastAPI endpoints)

### Hermes endpoints that exist and are covered
| Hermes endpoint | `hermes-api.ts` method | Coverage |
|---|---|---|
| `GET /health` | `checkHealth()`, `isHermesAvailable()` | ✅ |
| `GET /api/sessions` | `listSessions()` | ✅ |
| `POST /api/sessions` | `createSession()` | ✅ |
| `GET /api/sessions/{session_id}` | `getSession()` | ✅ |
| `PATCH /api/sessions/{session_id}` | `updateSession()` | ✅ |
| `DELETE /api/sessions/{session_id}` | `deleteSession()` | ✅ |
| `GET /api/sessions/{session_id}/messages` | `getMessages()` | ✅ |
| `POST /api/sessions/{session_id}/chat` | `sendChat()` | ✅ |
| `POST /api/sessions/{session_id}/chat/stream` | `streamChat()` | ✅ |
| `GET /api/sessions/search` | `searchSessions()` | ✅ |
| `POST /api/sessions/{session_id}/fork` | `forkSession()` | ✅ |
| `GET /api/memory` | `getMemory()` | ✅ |
| `GET /api/skills` | `listSkills()` | ✅ |
| `GET /api/skills/{name}` | `getSkill()` | ✅ |
| `GET /api/skills/categories` | `getSkillCategories()` | ✅ |
| `GET /api/config` | `getConfig()` | ✅ |
| `GET /v1/models` | `listModels()` | ✅ |

### Frontend expectations with no Hermes endpoint
| Frontend/API expectation | Status | Why |
|---|---|---|
| Abort active chat run | ❌ | No Hermes abort route used; `/api/chat-abort` is a no-op. |
| Switch session model | ❌ | `/api/model-switch` only parses model/provider strings. |
| Update Hermes config | ❌ | `/api/config-patch` is `501`. |
| Gateway status/logs/agents/channels/nodes/approvals/usage | ❌ | No Hermes FastAPI equivalents; legacy UI remains. |
| Cron jobs | ❌ | No Hermes FastAPI cron endpoints in current OpenAPI. |

## Missing Features
- Real model switching and session-level config mutation.
- Abort/cancel for in-flight chat runs.
- Real session title generation.
- Real approvals UI and API.
- Any live logs page for Hermes itself.
- Agent registry / channels / nodes views wired to Hermes.
- Browser control APIs; current browser routes still depend on dead `gatewayRpc()`.
- Usage/cost analytics; `/api/usage`, `/api/cost`, `/api/usage-analytics`, and `/api/context-usage` are placeholders.
- A Hermes-native first-run/session bootstrap flow; `main` is assumed, not guaranteed.
- Rich inspector data for files/logs.

## Recommendations
1. Fix the demo path first: make `/chat/new` create a Hermes session immediately, stop assuming `main`, and keep route param = actual Hermes session id.
2. Replace all remaining “gateway” UX on visible pages. The current sessions/logs/settings/cron copy and route names make the product look more wired than it is.
3. Remove or hide stub pages for tomorrow: `/sessions`, `/gateway/logs`, `/cron`, provider mutation controls, approvals, agent registry surfaces.
4. Implement real `chat abort` and real `model switch`, or remove the controls entirely.
5. Make `session-status` and `models` stop depending on local provider config unless that config is actually writable in Hermes Workspace.
6. Either delete the gateway setup wizard or rename/repurpose it for Hermes server detection; right now it is obsolete and points at `ws://127.0.0.1:18789`.
7. Decide whether memory/skills should use Hermes directly everywhere or the local proxy APIs everywhere. The current split is inconsistent.
8. If workspace-daemon features are part of the product, explicitly label them as separate from Hermes; right now they look like core app features but use a different backend.
