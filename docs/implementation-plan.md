# Hermes Workspace OpenAI-Compat Implementation Plan

Source spec: `docs/hermes-openai-compat-spec.md`
Repo root: `clawsuite/`

## Executive summary

This plan implements Section 11 of the spec in seven workstreams:

1. Separate core chat client from Hermes enhanced client
2. Refactor capability probing into portable vs enhanced layers
3. Add OpenAI-compatible streaming parser path
4. Add local-thread fallback for non-session backends
5. Gate advanced screens cleanly behind capability checks
6. Rewrite onboarding and docs around portable-first positioning
7. Prepare upstream PR package for Hermes-native endpoints

Primary constraint: core chat must work without `/api/sessions`, `/api/skills`, `/api/memory`, `/api/config`, or `/api/jobs`.

---

## Recommended execution order

### Sequential foundation

1. **Step 2 — Capability probing refactor**
2. **Step 1 — Split chat backends**
3. **Step 3 — OpenAI-compatible streaming path**
4. **Step 4 — Local-thread fallback**
5. **Step 5 — Advanced screen gating**
6. **Step 6 — Onboarding/docs rewrite**
7. **Step 7 — Upstream PR prep**

### Parallelization notes

- **Step 2 and Step 1** should be treated as effectively sequential. The backend split should be built on the new capability model, not the old boolean bundle.
- **Step 3** can start once Step 1 has established the portable chat abstraction, but before Step 4 is fully finished.
- **Step 4** can run in parallel with the later half of Step 3 once the portable response shape is known.
- **Step 5** can be split across multiple coding agents by screen/route, but only after Step 2 lands.
- **Step 6** can start once Step 2 names the new statuses and Step 5 confirms which features are portable vs enhanced.
- **Step 7** is last and needs human review.

---

## Dependency graph

- **Step 2 blocks:** 1, 3, 5, 6
- **Step 1 blocks:** 3, 4
- **Step 3 blocks:** 4
- **Step 4 blocks:** final chat UX signoff, parts of 6
- **Step 5 blocks:** final docs/onboarding wording in 6
- **Step 6 blocks:** release readiness
- **Step 7 blocks:** nothing in Step 1 ship path; it is post-stability work

---

## Step 1 — Separate core chat client from Hermes enhanced client

**Scope:** Large
**Can go to coding agent:** Yes
**Needs human review:** Light product review only
**Blocked by:** Step 2

### Goal
Stop routing all chat behavior through Hermes session assumptions. Introduce a portable chat path and an enhanced Hermes path behind a shared server-side interface.

### Files to modify

- `src/server/hermes-api.ts`
  - Narrow this file to Hermes-enhanced APIs only.
  - Remove responsibility for being the implicit universal chat client.
  - Keep Hermes session, memory, skills, config, jobs helpers here.
  - Export only Hermes-native functions and types.

- `src/routes/api/send-stream.ts`
  - Replace direct dependence on `createSession()` + `streamChat()` as the only path.
  - Route requests through a backend selector that chooses Hermes-enhanced vs portable OpenAI-compat.
  - Preserve attachment normalization here unless moved into a shared helper.

- `src/routes/api/send.ts`
  - Either deprecate fully or rewire to the new backend abstraction for non-stream fallback.
  - Remove the current hard 503-on-no-sessions behavior.

- `src/routes/api/sessions/send.ts`
  - Keep Hermes-session semantics only.
  - Make its purpose explicit: enhanced mode helper, not the core chat entrypoint.

- `src/routes/api/history.ts`
  - Stop assuming history means Hermes server history only.
  - Add clear response semantics for portable/local mode.

- `src/routes/api/session-status.ts`
  - Split Hermes session status from portable thread status.
  - Return transport-aware metadata instead of an empty Hermes-shaped object when sessions are absent.

- `src/server/session-utils.ts`
  - Expand synthetic session handling to distinguish true Hermes sessions from local/portable thread IDs.

- `src/screens/chat/types.ts`
  - Add explicit portable/local thread metadata fields.
  - Add capability/source metadata to history/session payload types if needed.

### New files to create

- `src/server/chat-backends.ts`
  - Shared server-side interface for `send`, `stream`, session mode, and response normalization.

- `src/server/openai-compat-api.ts`
  - Portable OpenAI-compatible backend client.
  - Handles `/v1/chat/completions` request/response shape.

- `src/server/chat-mode.ts`
  - Small resolver that maps current capabilities to `portable` vs `enhanced-hermes` mode.

### Notes

This step is the structural cleanup that makes the rest sane. Do not mix parser work and UI fallback work into this step.

---

## Step 2 — Refactor capability probing into portable vs enhanced layers

**Scope:** Medium
**Can go to coding agent:** Yes
**Needs human review:** Minimal
**Blocks:** 1, 3, 5, 6

### Goal
Replace the current flat capabilities object with a two-layer model:

- `coreCapabilities` → portable chat readiness
- `enhancedCapabilities` → Hermes-native extras

### Files to modify

- `src/server/gateway-capabilities.ts`
  - Refactor probe model to include:
    - backend reachability / health
    - `/v1/chat/completions` availability
    - `/v1/models` availability
    - streaming support if inferable
    - Hermes extras: sessions, skills, memory, config, jobs
  - Introduce a transport/mode summary, not just booleans.
  - Keep cache semantics but return richer typed data.

- `src/routes/api/gateway-status.ts`
  - Return the new structured capability payload.
  - Expose portable vs enhanced layer clearly for the client.

- `src/routes/api/connection-status.ts`
  - Change status logic from “jobs missing = partial” to portable-first semantics:
    - connected
    - enhanced
    - partial
    - disconnected
  - Use chat readiness as the base truth, not jobs/config/session extras.

- `src/components/status-indicator.tsx`
  - Update labels and tooltip logic to use the new status model.
  - Reflect “chat works, extras unavailable” as partial rather than disconnected.

- `src/screens/dashboard/dashboard-screen.tsx`
  - Stop reading capability state directly from the old shape.
  - Gate widgets by the new enhanced capability layer.

### New files to create

- None required if `gateway-capabilities.ts` stays maintainable.
- Optional: `src/lib/gateway-capability-labels.ts` if the client needs shared label mapping.

### Notes

This step is conflict-heavy because many later steps touch capability consumers.

---

## Step 3 — Add OpenAI-compatible streaming parser path

**Scope:** Large
**Can go to coding agent:** Yes
**Needs human review:** Moderate QA review on stream behavior
**Blocked by:** Steps 1 and 2
**Blocks:** 4

### Goal
Support OpenAI-compatible SSE and non-stream JSON responses in the main chat path.

### Files to modify

- `src/routes/api/send-stream.ts`
  - Add transport branch for portable OpenAI-compatible streaming.
  - Normalize OpenAI delta events into the frontend event shape already consumed by chat UI.
  - Ensure non-stream fallback still returns usable output when streaming is unavailable.

- `src/server/openai-compat-api.ts`
  - Implement `/v1/chat/completions` call logic.
  - Support both `stream: true` SSE and standard JSON responses.
  - Normalize assistant text, tool-call deltas if present, finish reasons, errors, and attachment payloads where possible.

- `src/server/chat-backends.ts`
  - Define normalized event contract for both Hermes-enhanced and portable transports.

- `src/screens/chat/chat-screen.tsx`
  - Make sure current stream consumer tolerates portable-mode events that may omit Hermes-specific run/session metadata.
  - Avoid assuming server-created sessions during stream startup and completion.

- `src/screens/chat/chat-queries.ts`
  - Update helpers that append and reconcile messages so they work with portable event payloads.

- `src/screens/chat/utils.ts`
  - Harden text extraction and fallback parsing for portable OpenAI-style messages.

- `src/screens/chat/hooks/use-streaming-message.ts`
  - Confirm streaming state machine works when event payloads come from the portable parser.

- `src/screens/chat/hooks/use-smooth-streaming-text.ts`
  - Verify no Hermes-only assumptions in text smoothing path.

### New files to create

- If kept separate from Step 1:
  - `src/server/openai-stream-parser.ts`
    - Dedicated SSE chunk parser for OpenAI-compatible streams.

### Notes

Do not try to solve local persistence here. This step is strictly transport normalization.

---

## Step 4 — Add local-thread fallback for non-session backends

**Scope:** Large
**Can go to coding agent:** Yes
**Needs human review:** Yes, because this changes core chat UX
**Blocked by:** Step 3

### Goal
Make chat usable without server sessions by storing active thread state client-side and exposing that state consistently across the chat screen.

### Files to modify

- `src/screens/chat/chat-queries.ts`
  - Add portable/local history fetch behavior.
  - Stop assuming `/api/sessions` is the source of truth for all visible threads.

- `src/screens/chat/hooks/use-chat-sessions.ts`
  - Support a “local thread” list or synthetic single-thread model when enhanced sessions are unavailable.
  - Prevent polling loops that expect server sessions in portable mode.

- `src/screens/chat/hooks/use-chat-history.ts`
  - Load local-thread history when portable mode is active.
  - Avoid Hermes history fetch assumptions.

- `src/screens/chat/hooks/use-realtime-chat-history.ts`
  - Merge streamed messages into local thread state cleanly.

- `src/screens/chat/session-title-store.ts`
  - Decide whether local threads get client-side generated names.
  - Keep title state working for portable threads.

- `src/screens/chat/pending-send.ts`
  - Make pending-send state transport-aware.

- `src/screens/chat/chat-screen.tsx`
  - Show “local/temporary” state where relevant.
  - Ensure new chat, retry, rename, and export flows behave sensibly in portable mode.

- `src/stores/chat-store.ts`
  - Add transport/mode-aware state if not already tracked elsewhere.
  - Potential home for local thread persistence if React Query alone gets messy.

- `src/routes/api/history.ts`
  - Return a portable-mode payload that represents local history clearly, even if server history is unavailable.

- `src/routes/chat/$sessionKey.tsx`
  - Ensure route loading works with synthetic local thread IDs.

- `src/routes/chat/index.tsx`
  - Ensure default navigation picks the correct portable thread behavior.

### New files to create

- `src/lib/local-chat-threads.ts`
  - Lightweight local persistence helper for thread IDs, labels, timestamps, and message snapshots.

### Notes

This is one of the highest-risk UX steps. It touches the largest surface area in the app.

---

## Step 5 — Gate advanced screens cleanly behind capability checks

**Scope:** Large
**Can go to coding agent:** Yes, split by screen/route
**Needs human review:** Yes for memory/config product semantics
**Blocked by:** Step 2

### Goal
Ensure advanced workspace surfaces either hide, degrade cleanly, or show intentional “not available on this backend” states.

### Files to modify

#### Capability-aware route/API layer

- `src/routes/api/sessions.ts`
  - Keep enhanced-mode behavior, but make portable-mode response explicit and non-error for list reads.

- `src/routes/api/sessions/$sessionKey.status.ts`
  - Align per-session status with portable/local thread semantics.

- `src/routes/api/skills.ts`
  - Return a strong capability-unavailable shape the UI can render intentionally.

- `src/routes/api/hermes-jobs.ts`
  - Same for jobs list/create flows.

- `src/routes/api/hermes-jobs.$jobId.ts`
  - Same for per-job actions/output.

- `src/routes/api/hermes-config.ts`
  - Product decision point: keep local `.hermes` editing as a special-case local feature, or gate it as Hermes-enhanced only.
  - If spec is followed strictly, the route should advertise availability separately from portable chat readiness.

- `src/routes/api/memory/list.ts`
- `src/routes/api/memory/read.ts`
- `src/routes/api/memory/search.ts`
- `src/routes/api/memory/write.ts`
  - Same product decision point as config.
  - Today these are local file-browser endpoints over `~/.hermes`, not Hermes HTTP APIs.
  - Needs explicit review instead of accidental behavior.

#### Screen/UI layer

- `src/screens/skills/skills-screen.tsx`
  - Render unavailable state instead of generic fetch errors.

- `src/screens/jobs/jobs-screen.tsx`
  - Render unavailable state and disable create/edit actions cleanly.

- `src/screens/memory/memory-browser-screen.tsx`
  - Either preserve local memory browser as a local-only feature with honest labeling, or gate it behind enhanced/local-Hermes availability.
  - This requires human product review.

- `src/screens/dashboard/dashboard-screen.tsx`
  - Hide or badge widgets that require enhanced APIs.

- `src/components/inspector/inspector-panel.tsx`
  - Replace hardcoded `http://localhost:8642` fetches with app routes/capability-aware sources.
  - Gate memory/skills tabs instead of raw failing fetches.

- `src/hooks/use-search-data.ts`
  - Make global search resilient when sessions/skills APIs are absent.

- `src/lib/jobs-api.ts`
  - Surface capability-unavailable errors intentionally so the jobs screen can render them cleanly.

- `src/components/settings-dialog/settings-dialog.tsx`
  - Gate config-dependent controls behind capability checks.

- `src/screens/settings/providers-screen.tsx`
  - Same for provider/config management UI.

### New files to create

- `src/components/backend-unavailable-state.tsx`
  - Shared empty/error state component for gated features.

- `src/lib/feature-gates.ts`
  - Shared helpers that map capabilities to screen-level booleans.

### Notes

This step is ideal for parallelization by domain:

- Agent A: sessions/history/search
- Agent B: skills/jobs/dashboard/inspector
- Agent C: memory/config/settings

But `dashboard-screen.tsx` and `inspector-panel.tsx` need extra review because they currently mix assumptions from multiple backends.

---

## Step 6 — Rewrite onboarding and docs around portable-first positioning

**Scope:** Medium
**Can go to coding agent:** Yes for docs and wiring; human should review copy
**Needs human review:** Yes
**Blocked by:** Steps 2 and 5

### Goal
Stop telling users the fork is required. Teach portable mode first, enhanced Hermes second.

### Files to modify

- `README.md`
  - Rewrite quick start to lead with OpenAI-compatible backend support.
  - Remove fork-required language.
  - Reframe enhanced APIs as optional unlocks.

- `docs/hermes-openai-compat-spec.md`
  - Add a short implementation-status note if needed once work begins.

- `src/components/connection-startup-screen.tsx`
  - Remove “Clone Hermes Agent (with WebAPI)” framing.
  - Replace with backend-agnostic connection/setup guidance.
  - If auto-start remains Hermes-specific, label it clearly as a convenience path, not a requirement.

- `src/components/onboarding/hermes-onboarding.tsx`
  - Rework flow around:
    - connect backend
    - select provider/model if available
    - test chat
    - mention enhanced features if detected
  - Stop using `/api/hermes-config` success as the primary proof that the backend is usable.

- `src/components/onboarding/setup-step-content.tsx`
  - Update portable vs enhanced messaging.

- `src/components/mobile-prompt/MobileSetupModal.tsx`
  - Align mobile copy with the new architecture.

- `src/components/status-indicator.tsx`
  - Use final status labels from Step 2 in user-facing copy.

- `src/routes/api/connection-status.ts`
  - Finalize response wording fields if the UI wants server-provided labels/messages.

### New files to create

- None required.

### Notes

This step should land after the actual capability behavior exists, otherwise the copy will lie.

---

## Step 7 — Prepare upstream PR package for Hermes-native endpoints

**Scope:** Medium
**Can go to coding agent:** Partially
**Needs human review:** Yes, definitely
**Blocked by:** Stable Step 1 implementation

### Goal
Prepare the Hermes-native enhancement layer for upstreaming so the workspace no longer needs a permanent fork.

### Files to modify in this repo

- `docs/hermes-openai-compat-spec.md`
  - Add a short “upstream API target” appendix summarizing endpoints and rationale.

- `docs/implementation-plan.md`
  - Mark Step 7 complete and note final endpoint inventory after implementation stabilizes.

- `README.md`
  - Once upstream path is real, update language around “enhanced Hermes mode”.

### New files to create in this repo

- `docs/upstream-hermes-api-proposal.md`
  - Endpoint inventory
  - request/response shapes
  - why each endpoint belongs in upstream
  - what remains optional

### Expected upstream target outside this repo

- `gateway/platforms/api_server.py`

### Notes

This is not just coding. It needs API design review, naming review, and likely simplification before upstreaming.

---

## Conflict-heavy files

These files are likely to be touched by multiple steps and should be single-owner or carefully sequenced:

- `src/server/gateway-capabilities.ts`
  - Steps 2, 5, 6

- `src/server/hermes-api.ts`
  - Steps 1, 3, 5

- `src/routes/api/send-stream.ts`
  - Steps 1, 3

- `src/routes/api/history.ts`
  - Steps 1, 4, 5

- `src/routes/api/session-status.ts`
  - Steps 1, 4, 5

- `src/screens/chat/chat-screen.tsx`
  - Steps 3, 4

- `src/screens/chat/chat-queries.ts`
  - Steps 3, 4

- `src/screens/dashboard/dashboard-screen.tsx`
  - Steps 2, 5

- `src/components/status-indicator.tsx`
  - Steps 2, 6

- `src/components/onboarding/hermes-onboarding.tsx`
  - Steps 3, 6

- `src/components/inspector/inspector-panel.tsx`
  - Step 5 only, but it is already structurally messy and should not be edited in parallel with dashboard/status work unless scoped tightly.

---

## New files inventory

Recommended new files:

- `src/server/chat-backends.ts`
- `src/server/openai-compat-api.ts`
- `src/server/chat-mode.ts`
- `src/server/openai-stream-parser.ts` (optional but recommended)
- `src/lib/local-chat-threads.ts`
- `src/components/backend-unavailable-state.tsx`
- `src/lib/feature-gates.ts`
- `docs/upstream-hermes-api-proposal.md`

---

## Coding-agent split recommendation

### Good coding-agent tasks

#### Agent package A — transport/core
- Step 2
- Step 1
- Step 3

Why: mostly server and transport logic, easier to verify with targeted tests/manual QA.

#### Agent package B — local thread UX
- Step 4

Why: concentrated chat UX/state work, but should be owned by one agent because `chat-screen.tsx` is a conflict magnet.

#### Agent package C — advanced feature gating
- Step 5 split by domain
  - C1: sessions/history/search
  - C2: skills/jobs/dashboard
  - C3: memory/config/settings

Why: these can be parallelized if file ownership is clean.

#### Agent package D — docs/onboarding
- Step 6

Why: low-risk code plus documentation.

### Human-review-required areas

- Final portable vs enhanced status wording in `src/routes/api/connection-status.ts` and `src/components/status-indicator.tsx`
- Memory/config product semantics in:
  - `src/routes/api/hermes-config.ts`
  - `src/routes/api/memory/*`
  - `src/screens/memory/memory-browser-screen.tsx`
- Local-thread UX decisions in `src/screens/chat/chat-screen.tsx`
- Upstream endpoint proposal in Step 7

---

## Suggested milestone breakdown

### Milestone 1 — Core portable chat works
Includes:
- Step 2
- Step 1
- Step 3

Definition of done:
- `/api/send-stream` works without `/api/sessions`
- OpenAI-compatible backend can stream chat
- connection status reflects portable readiness

### Milestone 2 — Portable chat UX is usable
Includes:
- Step 4

Definition of done:
- local thread persists across active app usage
- no broken “new/main session” behavior
- exports/retries/basic titles still work

### Milestone 3 — Enhanced-only features stop breaking portable mode
Includes:
- Step 5

Definition of done:
- skills/jobs/memory/config/session-history surfaces either work or degrade intentionally

### Milestone 4 — Product messaging matches reality
Includes:
- Step 6

Definition of done:
- README and onboarding no longer require the fork

### Milestone 5 — Upstream package ready
Includes:
- Step 7

Definition of done:
- upstream proposal doc exists and reflects post-implementation API reality

---

## Staff-engineer caveats

1. `src/components/inspector/inspector-panel.tsx` currently hardcodes `http://localhost:8642`. That is architectural debt and should be fixed early in Step 5, not patched around.
2. `src/routes/api/memory/*` and `src/routes/api/hermes-config.ts` do not actually depend on Hermes HTTP APIs today; they operate on local `~/.hermes` state. That is useful, but it conflicts with the stricter reading of the new spec. This needs explicit product review, not accidental retention.
3. `src/screens/chat/chat-screen.tsx` is the biggest merge-conflict risk in the repo for this project. Do not parallelize multiple chat UX tasks into it at once.
4. Do not rewrite everything at once. Land capability model first, then transport split, then portable session fallback. Otherwise you get a week of fake green states and broken chat.
