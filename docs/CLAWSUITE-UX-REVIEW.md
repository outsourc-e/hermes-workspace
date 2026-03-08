# ClawSuite UX Review

Date: 2026-03-08

Scope:
- Existing context from `AUDIT-REPORT.md`
- First-run onboarding and gateway setup
- Agent discovery and sidebar behavior
- Session/model/token presentation
- Chat reliability and error handling
- Missing baseline desktop-app affordances

Method:
- Reviewed `src/` as a first-time, non-technical user
- Focused on clarity, trust, onboarding, feedback, and recoverability
- Ignored code quality except where it directly affects UX behavior

## Overall Assessment

ClawSuite already feels powerful, but it still behaves like an operator console that assumes the user understands gateway architecture, session types, model IDs, and transport states. A technical user can infer what is happening. A first-time desktop user cannot.

The biggest UX risk is not visual polish. It is hidden system distinctions leaking into the interface:
- some agents appear in one place but not another
- setup asks for gateway concepts before the app has earned that complexity
- usage surfaces expose raw provider/model strings
- chat states expose transport semantics like `Queued`, `Live`, `Offline`, retries, and compaction without enough plain-language framing

That creates a trust problem. The app often knows what is happening, but it does not explain it in user language.

## 1. Agent Sidebar Gap

### Issue

Severity: `P0`

The product exposes multiple kinds of “agents,” but the main experience does not unify them. In practice:
- `src/screens/gateway/agents-screen.tsx:660-677` only treats unmatched sessions with `subagent:` keys as extra active sessions.
- `src/components/agent-view/agent-view-panel.tsx:611-612` separately loads CLI agents through `useCliAgents()`.
- `src/components/agent-view/agent-view-panel.tsx:1134-1214` shows a dedicated `CLI Agents` section.
- `src/hooks/use-cli-agents.ts:78` and `src/routes/api/cli-agents.ts:281-301` already provide a working CLI-agent feed.
- `src/components/agent-view/agent-view-panel.tsx:1127` says “No active subagents. Spawn agents from chat to see them here,” even though CLI agents may already be running elsewhere.

From a first-time user perspective, this is one mental model:
- “I started an agent.”

But the UI splits that into two technical implementations:
- gateway/session-spawned agents
- shell/exec CLI agents

Users should not have to know that distinction to find their work.

### User Impact

- A user launches Codex or another shell-based agent and expects it to appear in the main agent roster.
- It does not appear where they are looking.
- The app therefore feels broken, incomplete, or inconsistent.
- The wording “No active subagents” is actively misleading when CLI agents exist.

### Suggested Fix

Unify the sidebar and agent surfaces around a user-facing concept:
- “Active agents”
- “Recent agents”
- “Finished agents”

Then add source as metadata, not as the primary grouping:
- `Gateway`
- `CLI`
- `External`

The sidebar should show all active agent-like activity in one place:
- name
- current task summary
- status
- runtime / last active
- open chat / open output / stop actions where available

If a capability differs by source, the row can explain it:
- “CLI agent, output only”
- “Gateway agent, chat available”

### Product Recommendation

Preferred behavior:
1. Merge `sessions_spawn`, gateway sessions, and `cli-agents` into one “Agents” list.
2. Default-sort by active now, then most recent.
3. Use a small source badge, not a separate panel.
4. Never show “No agents” if any agent process is active anywhere the app can detect.

## 2. Gateway Connection and First-Run Setup

### Issue

Severity: `P0`

The first-run setup is much more infrastructure-heavy than the product presentation implies.

Evidence:
- `src/components/gateway-setup-wizard.tsx:387-390` opens with “Enter your OpenClaw gateway URL and token” and tells users to run `openclaw config get gateway.auth.token`.
- `src/components/gateway-setup-wizard.tsx:568-570` says ClawSuite is “installing and starting OpenClaw in the background.”
- `src/components/gateway-setup-wizard.tsx:178` starts an `EventSource('/api/local-setup')` immediately for local setup.
- `src/routes/api/local-setup.ts:94-104` installs OpenClaw globally with `npm install -g openclaw` if missing.
- `src/routes/api/local-setup.ts:104-111` launches `openclaw gateway start --bind lan`.
- `src/hooks/use-gateway-setup.ts:157-179` can skip straight to provider setup after autodiscovery, which helps, but the mental model still remains gateway-first.

This is confusing for a user who “just downloaded the .dmg” because the app behaves less like a desktop app and more like a local admin/control panel for another product.

### User Impact

Likely first-run questions:
- “What is OpenClaw versus ClawSuite?”
- “Why is this app installing a CLI tool?”
- “Why do I need a gateway URL and token in a desktop app?”
- “What happens if this background install fails?”
- “Why is the app telling me terminal commands before I’ve even used it?”

There is also a second onboarding layer:
- `src/routes/__root.tsx:302-303` mounts both `GatewaySetupWizard` and `OnboardingTour`.
- `src/components/onboarding/onboarding-tour.tsx:41-57` waits for gateway setup completion, then starts the product tour.

That sequencing is logical technically, but emotionally it means onboarding starts with infrastructure work, not value.

### Secondary Gaps

Severity: `P1`

- Local setup lacks plain-language explanation of what is being installed, where, and whether admin access may be required.
- Failure states are thin. The UI shows raw error text, but not user-friendly recovery branches.
- `src/components/gateway-setup-wizard.tsx:387-390` uses CLI/token language even when the user likely chose “Local Gateway.”
- `src/components/onboarding/provider-select-step.tsx:314-350` allows “Continue” without requiring successful validation, which is flexible for power users but risky for beginners.
- `src/routes/connect.tsx:23-49` still contains an older environment-variable/manual setup route. Even if not primary, it signals product ambiguity.

### Suggested Fix

Reframe setup around choices a non-technical user understands:

Step 1:
- “How do you want to use ClawSuite?”
- `Use this Mac`
- `Connect another machine`
- `Use ClawSuite Cloud`

Step 2 for local:
- “ClawSuite needs to install and start the local engine it uses to run agents.”
- Explain:
  - what will be installed
  - where it runs
  - whether it stays local
  - whether internet is needed
  - what to do if it fails

Step 3:
- only show gateway URL/token details under an “Advanced” or “Manual setup” affordance

### Product Recommendation

Best first-run copy should answer:
- What is ClawSuite?
- What is OpenClaw?
- Why do I need it?
- What is happening on my machine right now?
- What can I do if this step fails?

## 3. Session Usage Stats, Model Names, and Token Counts

### Issue

Severity: `P1`

ClawSuite exposes backend identifiers and raw usage units in user-facing surfaces.

Evidence:
- `src/components/usage-meter/usage-details-modal.tsx:384-405` shows raw `model.model`.
- `src/components/usage-meter/usage-details-modal.tsx:415-438` shows raw `session.model`.
- `src/screens/gateway/components/remote-agents-panel.tsx:141` strips provider prefixes visually, but `:154` still shows `tok`.
- `src/screens/gateway/agents-screen.tsx:1069` shows `X tokens`.
- `src/screens/gateway/agent-hub-layout.tsx:99-100` contains raw labels like `anthropic/claude-sonnet-4-6`.
- `src/screens/gateway/agent-hub-layout.tsx:169` and `:195` manually split on `/`, which confirms raw IDs are still the source of truth in UI paths.

For technical users, this is acceptable. For mainstream users, it reads like internal telemetry.

### User Impact

Users will ask:
- “What is `anthropic/claude-sonnet-4-5`?”
- “Are tokens good or bad?”
- “Is 42,000 tokens a lot?”
- “Why am I seeing provider slugs instead of product names?”
- “Why is one screen saying `tok`, another `tokens`, and another showing raw model IDs?”

### Suggested Fix

Translate usage into plain-language product labels:
- `Claude Sonnet`
- `GPT-5`
- `Gemini 2.0 Flash`

Then optionally expose technical detail on hover or in an expandable detail row:
- “Provider: Anthropic”
- “Model ID: anthropic/claude-sonnet-4-5”

Token usage should be reframed:
- `Conversation size`
- `Context used`
- `AI usage today`

Examples:
- `32k tokens` → `Large conversation`
- `78% context used` → keep percent, because it signals nearing a limit
- `12.4k input / 3.1k output` → only in advanced detail

### Product Recommendation

Default display:
- friendly model name
- cost
- simple usage label

Advanced display:
- provider
- exact model ID
- input/output tokens
- timestamps

## 4. Chat Reliability and Trust Signals

### Issue

Severity: `P1`

The chat experience clearly contains significant engineering work to suppress duplicate events and smooth streaming, but many of the resulting UI states still feel transport-oriented rather than user-oriented.

Evidence of reliability complexity:
- `src/server/chat-event-bus.ts:4-6` explicitly documents duplicate-event handling.
- `src/stores/gateway-chat-store.ts:282` notes parallel event paths causing duplicate messages.
- `src/screens/chat/hooks/use-realtime-chat-history.ts:30-31` references duplicate messages visible in chat.
- `src/hooks/use-gateway-chat-stream.ts:78-79` clears streaming state after 30s of silence.
- `src/screens/chat/hooks/use-realtime-chat-history.ts:335` polls history every 30s when not streaming.

Visible user-facing symptoms:
- `src/screens/chat/components/message-item.tsx:952-953` shows a `Queued` badge inside the message.
- `src/screens/chat/components/message-actions-bar.tsx:74-104` can show `Queued` plus retry controls in the action bar.
- `src/screens/chat/components/chat-message-list.tsx:152` shows “Taking longer than usual…” and “Still working… this is taking a while.”
- `src/screens/chat/components/chat-message-list.tsx:1201-1203` inserts a warning banner when a session is mostly tool chatter.
- `src/screens/chat/components/realtime-status.tsx:30-46` exposes transport states as `Live`, `Connecting...`, `Offline`, `Error`.
- `src/screens/chat/components/chat-message-list.tsx:328` literally notes “Pull-to-refresh removed (was buggy on mobile).”

### User Impact

The issue is not that the app surfaces status. The issue is that it surfaces too much of the pipeline and not enough plain-language interpretation.

Examples of confusing moments:
- `Queued` can look like “message failed” even when it is actually fine.
- “Offline” may refer to the realtime event stream, not the chat session, gateway, or internet.
- A tool-heavy conversation shows a big warning, which may make the user think something went wrong rather than “this agent mostly worked in tools.”
- Multiple layers of indicators can stack:
  - typing/thinking bubble
  - active tool badges
  - streaming placeholder
  - queued label
  - retry
  - live/offline dot

That is a lot of interpretation work for a casual user.

### Suggested Fix

Collapse technical states into human meanings:

Replace:
- `Queued`

With:
- `Sent`
- `Agent is working`

Replace:
- `Live / Offline / Error`

With:
- `Connected`
- `Reconnecting`
- `Updates paused`

Provide recovery language when there is real risk:
- “Response may be delayed. You can keep waiting or resend.”

Avoid showing retry affordances unless the app is confident the send failed.

### Specific UX Recommendations

- Keep retry hidden for states that are merely slow.
- Add one unified status line above the composer or below the header for connection/retry state instead of scattering status across message rows and header dots.
- Convert tool-only notices into a neutral explanation:
  - “This task mostly ran through tools. Expand details if you want the full execution log.”
- When reconnecting, preserve user confidence:
  - “Reconnecting to live updates. Your conversation is safe.”

## 5. Missing Basics for a Desktop AI App

### 5.1 Settings Are Present but Not Product-Legible

Severity: `P1`

There is a settings dialog, but it still feels like internal preferences rather than a clear “control center.”

Evidence:
- `src/components/settings-dialog/settings-dialog.tsx:661-738` places gateway connection under `Advanced`.
- `src/components/settings-dialog/settings-dialog.tsx:916` ends with “Changes saved automatically.”
- `src/components/settings-dialog/settings-dialog.tsx:206` says “No email connected.”

Gap:
- no clear top-level account/workspace status
- no obvious “Connections” area
- no simple explanation of what settings matter for first use

Suggested fix:
- add a first section called `General` or `Workspace`
- surface:
  - connected gateway
  - provider status
  - notifications status
  - help/docs/support

### 5.2 Keyboard Shortcuts Exist but Are Poorly Discoverable

Severity: `P2`

Evidence:
- `src/components/keyboard-shortcuts-modal.tsx:22` defines `?` for shortcuts.
- `src/components/keyboard-shortcuts-modal.tsx:106` labels the modal clearly.

Gap:
- discovery relies on already knowing `?`
- no persistent help entry in settings or menu

Suggested fix:
- add `Keyboard Shortcuts` as an explicit item under settings/help
- mention it in onboarding or the search modal

### 5.3 Help and Docs Are Too Sparse at the Point of Failure

Severity: `P1`

Evidence:
- `src/components/gateway-setup-wizard.tsx:883-890` has a generic documentation link in the footer.

Gap:
- setup failures do not route users to contextual help
- no “What is a gateway?” explainer
- no quick troubleshooting choices

Suggested fix:
- add task-based help links:
  - `I just want to run locally`
  - `Setup failed`
  - `I already have OpenClaw installed`
  - `What is the token?`

### 5.4 Empty States Are Functional but Not Reassuring

Severity: `P2`

Evidence:
- `src/screens/chat/components/sidebar/sidebar-sessions.tsx:149` says `No sessions yet.`
- `src/components/usage-meter/usage-details-modal.tsx:489` says `No providers connected`

Gap:
- empty states often stop at absence, not next action

Suggested fix:
- pair every empty state with a concrete next step
- examples:
  - `No sessions yet. Start your first conversation`
  - `No providers connected. Add a provider to start chatting`

### 5.5 Debug Surfaces Leak Into Primary Navigation

Severity: `P2`

Evidence:
- `src/screens/chat/components/chat-sidebar.tsx:838-840` places `Debug` in primary navigation and can badge it with an error dot.

Gap:
- a normal user does not expect “Debug” to be a first-class nav item
- the error dot creates anxiety without context

Suggested fix:
- move `Debug` under advanced/help/developer mode
- reserve the primary nav for user goals, not internal diagnostics

### 5.6 Notifications Are Underdeveloped as a User Feature

Severity: `P2`

Evidence:
- `src/components/settings-dialog/settings-dialog.tsx:619-656` exposes only simple alert toggles and a usage threshold

Gap:
- no explicit notification permissions flow
- no obvious background completion alerts
- no “notify when agent finishes” affordance

Suggested fix:
- add basic desktop expectations:
  - notify on task complete
  - notify on agent approval needed
  - notify on failure

## Prioritized Punch List

### Highest Priority

1. `P0` Unify agent discovery across gateway sessions and CLI/shell agents.
   Files:
   - `src/screens/gateway/agents-screen.tsx`
   - `src/components/agent-view/agent-view-panel.tsx`
   - `src/hooks/use-cli-agents.ts`
   - `src/routes/api/cli-agents.ts`

2. `P0` Rewrite first-run setup to be outcome-first, not gateway-first.
   Files:
   - `src/components/gateway-setup-wizard.tsx`
   - `src/hooks/use-gateway-setup.ts`
   - `src/routes/api/local-setup.ts`

3. `P1` Add plain-language recovery states for setup failures and connection problems.
   Files:
   - `src/components/gateway-setup-wizard.tsx`
   - `src/screens/chat/components/realtime-status.tsx`
   - `src/screens/chat/components/gateway-status-message.tsx`

### Next Priority

4. `P1` Replace raw model IDs with friendly model names across session and usage surfaces.
   Files:
   - `src/components/usage-meter/usage-details-modal.tsx`
   - `src/screens/gateway/agents-screen.tsx`
   - `src/screens/gateway/components/remote-agents-panel.tsx`
   - `src/screens/gateway/agent-hub-layout.tsx`

5. `P1` Reframe token counts into user-comprehensible usage language.
   Files:
   - `src/components/usage-meter/usage-details-modal.tsx`
   - `src/screens/gateway/agents-screen.tsx`
   - any session summary surfaces in `src/screens/gateway/agent-hub-layout.tsx`

6. `P1` Simplify message status language so users see one clear meaning instead of transport jargon.
   Files:
   - `src/screens/chat/components/message-item.tsx`
   - `src/screens/chat/components/message-actions-bar.tsx`
   - `src/screens/chat/components/chat-message-list.tsx`
   - `src/screens/chat/components/realtime-status.tsx`

### Important but Secondary

7. `P2` Make help/docs context-sensitive during onboarding and setup failure.
   Files:
   - `src/components/gateway-setup-wizard.tsx`
   - `src/routes/connect.tsx`

8. `P2` Make keyboard shortcuts discoverable from visible UI, not only `?`.
   Files:
   - `src/components/keyboard-shortcuts-modal.tsx`
   - `src/components/settings-dialog/settings-dialog.tsx`

9. `P2` Improve empty states with action-oriented next steps.
   Files:
   - `src/screens/chat/components/sidebar/sidebar-sessions.tsx`
   - `src/components/usage-meter/usage-details-modal.tsx`
   - other screens already using `src/components/empty-state.tsx`

10. `P2` Remove or demote developer-facing items from primary navigation for non-technical users.
    Files:
    - `src/screens/chat/components/chat-sidebar.tsx`

## Bottom Line

ClawSuite’s UX issue is not lack of capability. It is that first-time users are being asked to think like maintainers of the system rather than users of the product.

The most important shift is conceptual:
- stop exposing implementation distinctions as if they were user distinctions
- make setup explain intent before mechanism
- translate system telemetry into plain-language product feedback

Once that is done, the app will feel much more trustworthy without losing its power-user depth.
