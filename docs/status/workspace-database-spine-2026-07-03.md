# Workspace Database Spine — 2026-07-03

Timestamp: 2026-07-03 22:54:28 IDT +0300

## Why this exists

DLV called out the new database as the base for Goblin Analytics and the rest of Workspace.
This file makes that explicit so future Workspace work does not treat the DB as a one-off Goblin implementation.

## Decision

The new Supabase/Postgres foundation is the Workspace-wide data spine.

Current schemas:

- `workspace_core`
  - shared foundation for agents, runs, approvals, artifacts, events, source records, and evidence assets.
- `goblin_analytics`
  - first module-specific schema using the shared foundation.

Current API read model:

- `GET /api/war-room/goblin-analytics`
- server-side readback only.
- no client-side credentials.
- no writeback from the UI.

## Rule for future Workspace modules

When adding or upgrading Workspace rooms/tools, prefer this pattern:

1. Put shared operational entities in `workspace_core`.
2. Put room-specific data in a module schema.
3. Expose server-side GET/read APIs first.
4. Only add write APIs after explicit DLV approval and safety gates.
5. Never expose Supabase credentials in React/browser code.
6. UI must show freshness/source/blocked state instead of pretending data is live.

Planned modules that should connect to this spine later:

- Daily News / Gateway
- Approvals Inbox
- Artifacts Inbox
- Etsy Market Lab
- Terra / 3D QA
- Council decisions and handoffs
- Archive / Search

## Applied in this run

`src/server/goblin-analytics-data.ts` now includes a `database` block in every Goblin snapshot:

- provider: `supabase` or `none`
- core schema: `workspace_core`
- module schema: `goblin_analytics`
- read model: `server-rest`
- live source flag
- list of future Workspace modules to connect

`src/screens/war-room/living-v3/GoblinAnalyticsShell.tsx` now displays a DB readback strip so the operator can see:

- whether this is Supabase live readback or fallback
- how many DB rows drive the current screen
- when the data was last read

## Not done yet

- No writeback APIs were added.
- Other rooms are not migrated yet.
- Approvals/Daily News/Artifacts still need their own DB-backed read models.
- No schema migration was changed in this run.

## Safety

This is read-only. No Etsy write, no supplier message, no Discord send, no publishing, no live marketplace action.
