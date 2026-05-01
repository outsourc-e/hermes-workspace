# Hermes Workspace OpenAI-Compat Architecture Spec

> **For Claude:** Use `writing-plans` if this turns into an implementation plan. This doc locks the product and backend compatibility direction.

**Goal:** Make Hermes Workspace work out of the box against vanilla `hermes-agent` and any OpenAI-compatible backend, while unlocking richer workspace features automatically when Claude-specific APIs are available.

**Status:** Approved architectural constraint for the next implementation pass.

---

## 1. Problem

Hermes Workspace currently depends on a forked `hermes-agent` gateway for extended functionality:

- session management
- streaming chat
- memory browser
- skills browser / install flow
- config editing
- capability-aware dashboard behavior

That fork dependency is the wrong shape for distribution.

Current downside:

- users cannot point the workspace at stock `hermes-agent` and expect it to work
- README/setup flow forces a custom fork
- chat reliability is coupled to `/api/sessions` instead of the more portable OpenAI-compatible chat interface
- product adoption is constrained by backend politics instead of frontend usability

We want to reverse that.

---

## 2. Architectural Constraint

This is the decision to lock in:

> **Hermes Workspace must work standalone against any OpenAI-compatible backend.**
>
> Claude-specific workspace features may enhance the experience when the full Hermes Agent API is available, but the product must remain usable without those endpoints.

Non-negotiable implication:

- **The fork cannot remain a product requirement.**
- Enhanced APIs are optional capability unlocks, not startup prerequisites.

---

## 3. Two-Step Strategy

### Step 1 — Make Workspace standalone now

Rewrite the workspace so the core chat product works against:

- vanilla `hermes-agent`
- any backend exposing `/v1/chat/completions`
- any backend exposing `/v1/models` optionally

In this mode, advanced features degrade gracefully when Claude-specific APIs are absent.

### Step 2 — Upstream the richer API later

Submit the custom Claude endpoints into upstream `hermes-agent`, targeting `gateway/platforms/api_server.py`.

If upstream accepts them:

- full workspace functionality works with vanilla `hermes-agent`
- no long-term fork dependency remains
- the enhanced UX becomes a first-class upstream capability, not a private patchset

---

## 4. Product Modes

The workspace should operate in two runtime modes.

### Mode A — Portable OpenAI-Compat Mode

Minimum required backend surface:

- `POST /v1/chat/completions`
- optional `GET /v1/models`

User gets:

- working chat
- streaming assistant responses when backend supports streaming
- model selection when `/v1/models` exists
- basic attachments if backend/model supports them
- clean onboarding and connection state

User does **not** need:

- `/api/sessions`
- `/api/skills`
- `/api/memory`
- `/api/config`
- Claude-specific metadata endpoints

### Mode B — Enhanced Claude Mode

When Claude-specific endpoints are present, unlock:

- session history and named sessions
- memory browser / search / editing
- skills browser / install / management
- config editor
- jobs/cron visibility
- richer capability and workspace introspection

The UI should detect these capabilities and progressively enhance.

---

## 5. Core Product Principle

**Chat is the base product. Everything else is optional enhancement.**

If a user points Hermes Workspace at a valid OpenAI-compatible backend, they should be able to send a message and receive a streamed response without caring whether the backend is Claude, OpenAI, OpenRouter, Ollama, vLLM, or something else.

Anything beyond that should be treated as capability-based augmentation.

---

## 6. Required Behavior Changes

### 6.1 Chat transport

The workspace must stop treating `/api/sessions` as the prerequisite for sending a chat message.

Instead:

1. Detect whether Claude session APIs exist.
2. If yes, use the enhanced Claude session flow.
3. If not, send chat through `POST /v1/chat/completions`.
4. If streaming is supported, render streamed deltas.
5. If streaming is not supported, render standard non-stream response cleanly.

Result:

- missing Claude sessions API must no longer cause the product to hang or hard-fail for basic chat

### 6.2 Capability detection

Capability probing should explicitly distinguish:

#### Core portable capabilities

- health / reachability
- `/v1/chat/completions`
- `/v1/models`
- streaming support if detectable
- attachment / image support if inferable

#### Claude enhancement capabilities

- `/api/sessions`
- `/api/skills`
- `/api/memory`
- `/api/config`
- `/api/jobs`

The app should expose these as two layers:

- `coreCapabilities`
- `enhancedCapabilities`

### 6.3 Graceful degradation

When Claude-specific APIs are missing, the UI must not show broken loaders, dead tabs, or cryptic errors.

Instead, each advanced surface should do one of the following:

- hide itself when not relevant
- show a clear “Not available on this backend” state
- explain what capability would unlock it
- continue to preserve the rest of the app as fully usable

Required degraded states:

- **Sessions:** fallback to ephemeral/local chat thread state
- **Memory:** read-only unavailable state with explanation
- **Skills:** unavailable state with explanation
- **Config:** unavailable state with explanation
- **Jobs:** unavailable state with explanation

### 6.4 Onboarding and setup

The setup flow must stop instructing users that a fork is required.

New setup principle:

- connect any OpenAI-compatible backend first
- verify chat works
- then advertise extra Claude-native features if supported

Onboarding copy should communicate:

- “Works with any OpenAI-compatible backend”
- “Enhanced features unlock automatically with Hermes Agent gateway APIs”

### 6.5 Documentation

README and setup docs must reflect the architecture honestly.

Required messaging:

- workspace works standalone with OpenAI-compatible backends
- vanilla `hermes-agent` is a supported target
- the richer Hermes Agent API is optional for advanced workspace features
- upstreaming those APIs is the long-term path

---

## 7. UX Requirements

### 7.1 Connection status language

Do not frame missing advanced APIs as a fatal error when core chat works.

Use status language like:

- **Connected** — chat available
- **Enhanced** — Claude workspace APIs detected
- **Partial** — chat available, some advanced features unavailable
- **Disconnected** — no usable chat backend detected

### 7.2 Feature gating

Feature gating should feel intentional, not broken.

Good examples:

- “Memory browser requires Claude memory API.”
- “Session history isn’t available on this backend yet.”
- “Connected in portable mode. Chat works; advanced workspace tools are unavailable.”

Bad examples:

- raw 404 text
- spinner forever
- generic 500 banners with no next step
- startup screen claiming setup is incomplete when chat is actually usable

### 7.3 Session behavior in portable mode

When no Claude sessions API exists, the app still needs a sane chat UX.

Portable-mode minimum:

- maintain current thread in client state
- preserve visible message history for the active page/app session
- clearly label it as local / temporary if persistence is unavailable
- avoid fake server session IDs when the backend does not provide them

---

## 8. API Design Direction

### 8.1 Portable path

Primary portable request target:

- `POST /v1/chat/completions`

Expected request compatibility:

- `model`
- `messages`
- `stream`
- `temperature` if supported
- attachments / image content where backend accepts multimodal OpenAI-style messages

Expected response handling:

- SSE stream chunks for streaming mode
- standard OpenAI chat completion JSON for non-stream mode

### 8.2 Enhanced Claude path

Enhanced path remains Claude-native where available, because it provides:

- persistent sessions
- message history
- memory/skills/config surfaces
- richer workspace affordances

That is fine, but it must sit behind capability detection instead of being assumed.

### 8.3 Upstream target

For Step 2, the custom API endpoints should be proposed upstream in:

- `gateway/platforms/api_server.py`

Intent:

- make enhanced workspace APIs part of upstream `hermes-agent`
- remove ongoing maintenance burden of a permanent fork
- let Hermes Workspace treat stock Claude as the best backend, without requiring it

---

## 9. Non-Goals

This spec does **not** require:

- universal parity across every OpenAI-compatible provider
- guaranteed session persistence on non-Hermes backends
- memory/skills/config support outside Claude
- building a backend abstraction for every vendor-specific extension

The goal is simpler:

- portable chat first
- enhanced Claude features second
- no fork requirement

---

## 10. Acceptance Criteria

This initiative is complete when all of the following are true:

### Product acceptance

- A user can launch Hermes Workspace against a stock OpenAI-compatible backend and successfully chat without patching backend code.
- A user can launch Hermes Workspace against vanilla `hermes-agent` and get a working core experience.
- Advanced features do not hard-fail the app when Claude-specific APIs are absent.
- The UI clearly communicates portable mode vs enhanced Claude mode.

### Technical acceptance

- Chat send path no longer hard-depends on `/api/sessions`.
- Capability probing includes `/v1/chat/completions` readiness, not just Claude-specific APIs.
- Missing `/api/sessions`, `/api/skills`, `/api/memory`, or `/api/config` does not block app boot or core chat.
- Portable-mode chat streaming works against OpenAI-compatible SSE responses.

### Documentation acceptance

- README no longer says the fork is required.
- Setup docs describe OpenAI-compatible standalone mode first.
- Enhanced Hermes Agent API support is documented as progressive enhancement.
- Step 2 upstreaming target is documented clearly.

---

## 11. Implementation Guidance

This is not the detailed task plan, but the engineering direction should be:

1. Separate **core chat client** from **Claude enhanced client**.
2. Refactor capability probing into portable vs enhanced layers.
3. Add OpenAI-compatible streaming parser path.
4. Add local-thread fallback for non-session backends.
5. Gate advanced screens cleanly behind capability checks.
6. Rewrite onboarding and docs around portable-first positioning.
7. After Step 1 is stable, prepare the upstream PR for Claude-native endpoints.

---

## 12. Final Decision Statement

Lock this in:

> Hermes Workspace is a standalone frontend for OpenAI-compatible chat backends.
>
> Claude-native APIs are an enhancement layer, not a requirement.
>
> Step 1 is portable compatibility now.
>
> Step 2 is upstreaming the enhanced Hermes Agent APIs so no fork is needed ever again.
