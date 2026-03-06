# ClawSuite Live Audit — 2026-03-06
_Browser walkthrough of every screen as a new user would see it_

## Dashboard (`/dashboard`)
- [x] Loads, shows connected status
- [ ] **BUG: Initial load shows "0" for token usage, "—" for model, "$88.68" for cost** — data is stale/cached until sync finishes (~5s). New users see broken numbers first.
- [ ] **BUG: ClawSuite splash overlay** appears on top of dashboard content on first load — blocks interaction, must be dismissed
- [ ] **POLISH: "Syncing" badge** should be more prominent during initial data fetch so users know data is loading

## Chat (`/chat/main`)
- [x] Messages load, tool calls show with pills
- [x] ThinkingBubble shows with shimmer + tool name
- [ ] **BUG: "Configure New Session Started Via Reset" banner** at top of chat — confusing for new users, unclear what action to take
- [ ] **BUG: Context usage bar** at top looks glitchy — green/orange gradient with no label, looks like a rendering artifact
- [ ] **POLISH: Agent Hub sidebar** shows "Idle" even when tools are actively running — should reflect current state
- [ ] **NEEDS TEST: Duplicate message fix** (`9e944f9`) — no duplicates visible in current session ✅

## Agents (`/agents`)
- [x] All agents show with correct status (Available/Idle)
- [x] Action buttons (Chat, Steer, History, Spawn) present
- [x] Grouped by category (Core, Coding, System, Integrations)
- [x] Clean layout, no issues found

## Sessions (`/sessions`)
- [x] 39 sessions listed with model, kind, origin, updated time
- [x] Data looks accurate
- [ ] **POLISH: Session names are raw keys** (e.g. "agent:main:cron:da44e65e...") — should show friendly names
- [ ] **PUNCH LIST #5: Duplicate-looking sessions** (multiple "clawsuite" entries) — need grouping or dedup

## Cron (`/cron`)
- [x] All jobs show with status, last run, search, filter
- [ ] **BUG: "Pre-compaction thread handoff" shows Error** — needs investigation
- [ ] **BUG: "Evening Wrap-up (7pm)" shows Error** — needs investigation
- [x] Overnight Builder correctly shows Disabled

## Settings (`/settings`)
- [x] Profile, Appearance, Chat, Editor, Notifications, Advanced tabs present
- [ ] **POLISH: ClawSuite splash overlay** visible behind settings content
- [ ] **MISSING: No "Reset Connection" button** (punch list #3)
- [ ] **MISSING: No connection diagnostics card** (punch list #8)

## Wizard
- [ ] **BUG: `/wizard` route returns 404** — wizard is modal-only via `GatewaySetupWizard`, no standalone route
- [ ] Should be accessible as a standalone page for new users, not just from settings

## General UX Issues
- [ ] **Sidebar has too many items** (20+ icons) — overwhelming for new users, no labels visible
- [ ] **No onboarding flow** — new user lands on dashboard with no guidance
- [ ] **No "What is ClawSuite?" or help link** anywhere
- [ ] **Mobile responsiveness** — sidebar icons would be inaccessible on small screens
- [ ] **404 page** exists and looks decent with Quick Links

## Priority Fixes for Next Sprint
1. Fix stale dashboard data on initial load (show skeleton/loading state)
2. Remove or fix "Configure New Session" banner in chat
3. Fix context usage bar rendering at top of chat
4. Make wizard accessible as standalone route for new users
5. Add loading/skeleton states everywhere data is async
6. Investigate cron Error states (pre-compaction, evening wrap-up)
