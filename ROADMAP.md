# ClawSuite Ship Roadmap
_Updated: 2026-03-12 00:50 EST_
_Source: 4 external audits + internal punch list + Eric priority reset_

## 🔥 Current Shipping Sequence (reset 2026-03-12)
1. **Workspace first** — finish `/hub-beta` / Mission Control so Eric can run parallel projects without being the bottleneck.
2. **Chat fixes + reliability** — paste duplicate, word-by-word streaming, session/missions persistence, EventSource cleanup.
3. **Atomicbot-style onboarding** — hide the gateway, bundle stealth local OpenClaw, or connect existing / start cloud.
4. **Electron app ship path** — native app, subscriptions, updates, polished recovery states.
5. **Post-ship pivot** — make Workspace/backend support broader than OpenClaw, but do **not** block ship on that abstraction.

## 🧭 Product Direction
- **Near-term product:** native ClawSuite app with bundled or invisible OpenClaw gateway.
- **User promise:** install app, choose local/existing/cloud, start using agents immediately.
- **Strategic posture:** ship the OpenClaw-wrapped product first, then widen into a model/backend-agnostic orchestration platform.

## ✅ Done (2026-03-07)
- [x] Chat duplication fix — singleton event bus + text-based dedup (`e939e97`, `075b473`)
- [x] False Retry fix — never show when assistant already replied (`4d4bb59`)
- [x] Update check crash on packaged installs (`fe95ac1`)
- [x] Session friendly names — `agent:main:cron:UUID` → "Cron Task" (`a01747d`)
- [x] Model name humanizer — `anthropic/claude-sonnet-4-5` → "Claude Sonnet 4.5" (`a01747d`)
- [x] Dashboard loading skeletons on metric cards (`c8b1519`)
- [x] Chat status language — "Queued"→"Sent", "Offline"→"Updates paused" (`5acaca2`)
- [x] Agent sidebar unification — CLI agents visible, no false "No agents" (`2bd71ef`)
- [x] Queued message wrapper stripped from chat UI (`ab9c2d9`)
- [x] Duplicate "Sent" label removed from actions bar (`ab9c2d9`)
- [x] Audit docs + ROADMAP saved to repo

## 🔴 P0 — Ship Blockers
- [ ] **Workspace unpark + finish core flow** — Goal → Decompose → Execute → Quality Gate → Assemble → PR in `/hub-beta`
- [ ] **First-run wizard rewrite** — outcome-first ("Use this Mac" / "Connect Existing" / "Start Cloud"), see TASK-02 in docs/TASK-SPECS.md
- [ ] **Stealth gateway bundle** — local OpenClaw auto-started inside Electron, invisible to end user unless debugging
- [ ] **Auth default hardening** — localhost-only for sensitive endpoints when no password set, see TASK-04
- [ ] **Mission state persistence** — Zustand+persist instead of React useState (missions die on nav)
- [ ] **Stop deleting sessions on mission complete** — patch status instead of DELETE

## 🟠 P1 — Critical UX
- [ ] **Word-by-word streaming in chat UI** — match current OpenClaw streaming feel in ClawSuite
- [ ] **Paste duplicate fix** — harden `gateway-chat-store.ts` dedup logic
- [ ] **6 redundant EventSource connections** — consolidate to shared singleton client-side
- [ ] **Connection error taxonomy** — plain-language gateway errors + actionable recovery
- [ ] **formatModelName across all surfaces** — usage modal, agents screen, remote panel, hub layout, see TASK-05
- [ ] **Onboarding recovery states** — if local gateway install/start/connect fails, explain exactly what to do next
- [ ] **Usage sidebar UX** — human-readable labels, progress bars, contextual help
- [ ] **Empty states with action steps** — see TASK-06

## 🔵 P2 — Polish
- [ ] **Break up agent-hub-layout.tsx** (8,756 lines → extract by domain)
- [ ] **Break up chat-composer.tsx** (2,303 lines)
- [ ] **Dashboard loading shimmer on metric cards**
- [ ] **Splash screen fast-dismiss on gateway:health-restored**
- [ ] **Context bar label visibility**
- [ ] **Developer mode toggle** — one switch for tool messages, reasoning, verbose metadata
- [ ] **In-app diagnostics card** ("Why not connected?")
- [ ] **Empty states with action-oriented next steps**
- [ ] **Move Debug out of primary nav**
- [ ] **Keyboard shortcuts discoverable from UI**
- [ ] **Cron error investigation** (pre-compaction handoff, evening wrap-up)

## 🟣 Ship Requirements
- [ ] **Bundle OpenClaw inside Electron** — users won't have Node.js
- [ ] **Windows .exe build** — run `electron:build:win` on PC2 (100.122.180.1)
- [ ] **Wire electron-updater** — auto-updates via GitHub Releases
- [ ] **Code signing** — skip for beta ($99 Apple + $200 Windows)

## 🔒 Security (before public beta)
- [ ] Require auth by default OR restrict to localhost when no password
- [ ] Lock down `/api/update-check` (git pull + npm install from UI)
- [ ] Lock down `/api/local-setup` (global package install)
- [ ] Remove browser `--no-sandbox` + CSP stripping from default path
- [ ] Add `Secure` flag to session cookies
- [ ] Session persistence (currently in-memory Set, dies on restart)

## 📊 Code Health
- [ ] Formalize gateway payload types (too much `any`)
- [ ] Remove duplicate terminal panel implementations
- [ ] Resolve PWA contradiction (service workers nuked on boot)
- [ ] Enforce design system (dark-only docs but light mode exists)
- [ ] Add test coverage for privileged + stateful flows
- [ ] Clean up Tauri scaffold (unused, Electron is active path)

## 🎯 Next Up (TASK-08)
- [ ] **Research Card** — live action timeline in chat showing every tool step, collapses to summary pill when done. Same pattern as ChatGPT deep research but for all Aurora activity. Spec in docs/TASK-SPECS.md.

## 🏢 Future: Virtual Office Sidebar (post Research Card)
- Extend right sidebar to show Aurora's current task at top of agent panel
- Each spawned Codex agent gets its own "desk" card with live process log
- Clicking a desk opens that agent's output
- Ties Research Card (chat inline) + agent sidebar together into one coherent office view
