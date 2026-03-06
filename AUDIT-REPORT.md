# ClawSuite Audit Report
**Date:** March 5, 2026  
**Auditor:** Aurora  
**Codebase:** 464 files, 113,222 lines of TypeScript/React  

---

## 🔴 Critical Issues

### 1. agent-hub-layout.tsx is 9,411 lines
This single file contains the entire Agent Hub — wizard, config, team management, mission control, run console, approvals, cost dashboard, learnings, and more. This is a maintenance nightmare and will cause merge conflicts on every change. **Needs splitting into 15-20 focused components.**

### 2. Codex CLI auth corruption
`~/.codex/auth.json` got overwritten with an Anthropic key during model switch experiments. Codex CLI is non-functional until `codex login` is run interactively. **Eric needs to run `codex login` in terminal.**

### 3. Duplicate message rendering (gateway-side)
The gateway sends identical response events to both Telegram and ClawSuite SSE streams. Client-side dedup fix pushed (content-text matching) but the root cause is gateway-side. **Filed as known issue — needs OpenClaw upstream fix.**

---

## 🟡 Code Quality

### Good
- ✅ TypeScript strict mode, zero compilation errors
- ✅ Clean TanStack Router setup with typed routes
- ✅ Zustand stores for state management (gateway-chat-store is well-structured)
- ✅ Server/client separation via TanStack Start

### Needs Work
- **27 console.log statements** in production code (9 in gateway.ts, 3 in run-console.tsx, 1 in agent-hub)
- **1 TODO** (diagnostics route port)
- **BUG-4 and BUG-5 comments** — fixed but comments reference old bug tracker, should be cleaned
- **CSS class constants** (lines 298-305 in agent-hub) — should be extracted to a shared styles file or use CVA patterns consistently
- **Hardcoded cost constant** `ROUGH_COST_PER_1K_TOKENS_USD = 0.01` — should come from config or model catalog
- **No test coverage** beyond 2 test files (providers.test.ts, usage-cost.test.ts, workspace-shell.test.ts, onboarding-tour.test.ts)

---

## 🟡 UX/UI Issues

### From code review:
1. **No loading states on many API routes** — several routes return raw errors without user-friendly fallbacks
2. **console.log fallbacks in run-console.tsx** (lines 544, 551) — "approve pending approval" logged to console instead of proper handler
3. **Agent Hub wizard has 4 steps** (gateway → team → goal → launch) but no skip/back validation
4. **Mobile support is partially implemented** — hooks exist (use-mobile-keyboard, use-swipe-navigation, use-pull-to-refresh) but many screens aren't responsive
5. **No offline state handling** — if gateway goes down, UI shows reconnect banner but chat history may be lost

---

## 🟡 Missing Features (for polished product)

1. **Onboarding wizard** — exists in code (`src/components/onboarding/`) but needs polish for Electron first-run
2. **CS-023: SSE → task status live updates** — still pending from HEARTBEAT.md
3. **Settings page** — provider wizard works but no way to manage channels, nodes, or advanced config from UI
4. **Export/import** — export menu exists but limited to single chat sessions
5. **Keyboard shortcuts modal** — component exists but needs documentation/discoverability
6. **Cost analytics** — screen exists but only shows estimates, not real provider costs
7. **Skills marketplace** — skills screen shows installed skills but no install/search from ClawHub
8. **No error reporting/telemetry** — no Sentry or similar for crash reports

---

## 🟡 Performance Concerns

1. **agent-hub-layout.tsx (9.4K lines)** — will cause long initial parse and re-render on any state change. Should be code-split.
2. **gateway-chat-store** — stores all messages in memory Map. No pagination for long conversations. Could grow unbounded.
3. **SSE reconnection** — 20s pong timeout + reconnect logic is solid but no backoff on repeated failures
4. **Bundle size** — `agents-screen` chunk is 714KB. Could be lazy-loaded.

---

## 🟡 Security Concerns

1. **Auth middleware** exists (`src/server/auth-middleware.ts`) — good
2. **Rate limiting** exists (`src/server/rate-limit.ts`) — good
3. **No CSP headers visible** — should add Content-Security-Policy for Electron
4. **Electron preload uses contextIsolation: true, sandbox: true** — good
5. **API keys in localStorage?** — need to verify provider keys aren't stored client-side in plain text

---

## 📋 Prioritized Action Items

### P0 — Before Electron release
1. Split `agent-hub-layout.tsx` into focused modules (wizard, config, mission, run-console, approvals, cost, learnings)
2. Fix Codex auth (`codex login`)
3. Remove console.log statements from production paths
4. Add CSP headers for Electron
5. Test onboarding flow end-to-end

### P1 — Polish
6. Fix run-console approve/deny console.log fallbacks
7. Add loading states to API routes
8. Clean up BUG-4/BUG-5 comments
9. Extract shared CSS class constants
10. Lazy-load agent-hub chunk

### P2 — Features
11. CS-023: SSE live task status
12. Skills marketplace (ClawHub integration)
13. Real cost tracking from provider responses
14. Settings page for channels/nodes
15. Cloud onboarding flow (Hetzner provisioning)

### P3 — Quality
16. Add error boundary to all screens (only exists globally)
17. Add Sentry or similar error reporting
18. Write tests for gateway-chat-store dedup logic
19. Add E2E tests for critical paths (chat, agent spawn)
20. Set up CI with lint + typecheck + test
