# Workspace Core Ops V1 — Execution Plan

Updated: 2026-07-03 14:59:40 IDT +0300

## Goal

Build the Workspace toward a real Discord-replacement operating center without hiding/dimming rooms or inventing live data.

The active work is limited to staged, checkpointed implementation around:

1. Global Notifications
2. Global Approval Inbox
3. Artifact / delivery registry
4. Daily News Board inside Gateway
5. Goblin Analytics on the existing Agora room
6. Etsy Market Lab completion path
7. Terra / 3D completion path
8. Hermes Command + Council operating path
9. Archive / Search foundation

## Non-goals / hard stops

- Do not rename room IDs unless a later stage explicitly proves it is safe.
- Do not dim, hide, or visually disable rooms.
- Do not delete unrelated files.
- Do not rollback the dirty repo broadly.
- Do not call live Etsy, supplier messaging, Discord send, printer actions, paid media generation, or external marketplace APIs from the app.
- Do not fake live data.
- Do not add another standalone screen when the existing War Room surface can host the workflow.

## Context sources used

- User Discord document: `/Users/mac/.hermes/cache/documents/doc_dd7b8baf0131_message.txt`
- User Discord document: `/Users/mac/.hermes/cache/documents/doc_f4af3b19a853_message.txt`
- Workspace repo instructions: `/Users/mac/hermes-workspace/AGENTS.md`
- Goblin plan in Second Brain:
  `/Users/mac/Documents/Hermes Second Brain/01 Projects/Etsy Market Lab/Product Tracker/Goblin Analytics - Agora Workspace Room Plan 2026-07-03.md`
- Goblin skill reference:
  `etsy-competitor-evidence-research/references/goblin-analytics-agora-workspace-room-plan-2026-07-03.md`

## Active route for visual QA

```text
http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1
```

## Current repo warning

The repo is already very dirty and `main` is behind `origin/main` by 25 commits.

This execution must therefore:

- make only narrow patches;
- write checkpoint files after every stage;
- never assume unrelated dirty files are ours;
- inspect diffs before each final status;
- avoid destructive cleanup.

## Stage order

### Stage 0 — Mission card + recovery checkpoints

Status: started 2026-07-03 14:59 IDT.

Deliverables:

- This execution plan.
- A stage checkpoint file.
- A rolling handoff file for recovery.

### Stage 1 — Core Ops data contracts / safe derivation layer

Goal: derive notifications, approvals, and artifacts from existing read-only state before adding UI.

Likely files:

```text
src/lib/workspace-core-ops/
src/lib/workspace-core-ops/*.test.ts
```

Rules:

- Pure functions first.
- No browser, no external calls, no live actions.
- Read existing `workspace-kernel` state shape only.

### Stage 2 — Global UI shell

Goal: add a compact War Room global ops strip/drawer for notifications, approvals, and artifacts.

Likely files:

```text
src/screens/war-room/living-v3/WorkspaceCoreOpsPanel.tsx
src/screens/war-room/living-v3/workspace-core-ops-panel.css
src/screens/war-room/living-v3/LivingWarRoomV3.tsx
```

Rules:

- Keep all rooms visible and lit.
- Do not change map geometry.
- Do not add text-heavy dashboard walls.

### Stage 3 — Daily News Board inside Gateway

Goal: show cron/news jobs and latest status in Gateway Cockpit, read-only first.

Rules:

- Use existing `/api/claude-jobs` where possible.
- No Discord send.
- Show generated/failed/waiting/sent/unknown truthfully.

### Stage 4 — Goblin Analytics shell on Agora

Goal: repurpose display labels and station surface around existing IDs.

Keep IDs:

```text
agora-opportunity
agora-intake
```

Display labels:

```text
Agora of Opportunity -> Goblin Analytics
Opportunity Stalls -> Goblin Radar Desk
```

Rules:

- No fake data.
- Empty DB state must be honest.
- No Etsy writes or supplier messages.

### Stage 5 — Goblin Analytics read-only API

Goal: `GET /api/war-room/goblin-analytics` returns shaped empty/DB data.

Likely files:

```text
src/server/goblin-analytics-data.ts
src/routes/api/war-room/goblin-analytics.ts
```

Rules:

- GET only first.
- Separate DB namespace: `data/goblin-analytics/goblin_analytics.db`.
- Join Product Intelligence read-only only when useful.

### Stage 6 — Goblin Analytics workbench

Goal: visual workbench with hero, KPI cards, radar board, dossier, charts, feed, proof drawers.

Likely files:

```text
src/screens/war-room/living-v3/GoblinAnalyticsWorkbench.tsx
src/screens/war-room/living-v3/goblin-analytics-workbench.css
```

Rules:

- Use real thumbnails only.
- Neutral placeholder when missing.
- Caveats are badges, not kill switches.
- Hard blocks are explicit.

### Later stages

- Etsy 100% product flow.
- Terra / 3D 100% artifact flow.
- Hermes Command route-to-room flow.
- Council decision-to-plan flow.
- Archive/search foundation.

## Checkpoint protocol

After every stage, write a markdown file under:

```text
docs/plans/workspace-core-ops-v1/checkpoints/
```

Each checkpoint must include:

- stage name;
- timestamp;
- mission goal;
- what changed;
- files touched;
- commands run;
- test results;
- browser/API proof;
- what remains;
- exact next step;
- stop conditions;
- recovery notes if context is lost.

## Stop condition

If context grows too large, tests fail unexpectedly, or UI looks wrong, stop after writing a recovery checkpoint. Do not keep patching blindly.
