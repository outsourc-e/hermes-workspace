# Current State After Repo Hygiene

Updated: 2026-07-03 23:01 IDT

## Purpose

Single recovery checkpoint that replaces the older stage-by-stage Workspace Core Ops / Goblin checkpoints.

DLV asked to keep only what reflects the current system and remove unnecessary checkpoints.

## Current system state

- Living War Room V3 route remains the active Workspace route.
- Goblin Analytics lives inside room `agora-opportunity`.
- Goblin Radar Desk lives inside station `agora-intake`.
- All 13 rooms remain visible and lit.
- No phase/dimming model should be restored.
- Goblin Analytics is read-only from the UI.
- Goblin data reads through the server route `GET /api/war-room/goblin-analytics`.
- The database foundation is Workspace-wide:
  - shared schema: `workspace_core`
  - Goblin module schema: `goblin_analytics`
- UI must not write to Etsy, suppliers, Discord, or the database without explicit approval gates.

## Important files to keep

```text
src/screens/war-room/living-v3/LivingWarRoomV3.tsx
src/screens/war-room/living-v3/living-war-room-v3.css
src/screens/war-room/living-v3/GoblinAnalyticsShell.tsx
src/screens/war-room/living-v3/goblin-analytics-shell.css
src/screens/war-room/living-v3/WorkspaceCoreOpsPanel.tsx
src/screens/war-room/living-v3/workspace-core-ops-panel.css
src/lib/workspace-core-ops/
src/lib/workspace-kernel/
src/server/goblin-analytics-data.ts
src/routes/api/war-room/goblin-analytics.ts
supabase/migrations/
docs/status/workspace-database-spine-2026-07-03.md
docs/status/repo-hygiene-inventory-2026-07-03.md
```

## Repo hygiene performed

Moved root-level temp/generated files out of the repo into reversible external quarantine:

```text
/Users/mac/.hermes/quarantine/hermes-workspace/repo-hygiene-2026-07-04/root-temp-and-loose-png/
```

Moved group:

- root `tmp_*` scripts/files
- loose root `war-room-*.png` generated images

Nothing was permanently deleted in that group.

## Checkpoint cleanup policy

Older stage checkpoint files were only recovery breadcrumbs for the build-up sequence.
This file replaces them as the current checkpoint.

If old stage details are needed, they were backed up outside the repo before removal.

## Verification after latest cleanup pass

Final status after this hygiene pass:

```text
root tmp / loose root PNG files left: 0
checkpoint files left in this folder: current-state-after-repo-hygiene.md
untracked entries now: 232
```

This reduced untracked entries from 252 to 232 by moving 20 obvious root junk files out of the repo.

Passed after latest functional and hygiene changes:

```bash
pnpm exec vitest run \
  src/routes/api/war-room/-goblin-analytics.test.ts \
  src/screens/war-room/living-v3/LivingWarRoomV3.goblin-shell.test.tsx \
  src/lib/workspace-core-ops/workspace-core-ops.test.ts \
  src/screens/war-room/living-v3/LivingWarRoomV3.core-ops-panel.test.tsx \
  src/lib/war-room/living-v3/living-v3-contract.test.ts
```

Result: 5 files passed, 17 tests passed.

Also passed:

```bash
pnpm typecheck
pnpm build
```

## Repo hygiene pass 2 — 2026-07-04

DLV approved slow cleanup of the whole room.

Moved to external reversible quarantine:

```text
.backup/
status/
WAR_ROOM_CONTEXT.md
handoff.md
docs/*.old War Room root docs
docs/prompts/
old docs/plans/* except workspace-core-ops-v1
generated-candidates/
archive/
docs/status/assets/
docs/status/qa/
docs/status/automation/
public/hermes-petdex-gallery.html
public/petdex-thumbs/
138 one-off asset generation scripts
6 unreferenced public/war-room root files
public/war-room/ui/
```

Important correction during cleanup:

```text
AGENTS.md was restored immediately after macOS case-insensitive filename behavior made agents.md and AGENTS.md resolve as the same file.
AGENTS.md remains present in the repo root.
```

Everything moved is backed up under:

```text
/Users/mac/.hermes/quarantine/hermes-workspace/repo-hygiene-2026-07-04/
```

Current remaining untracked entries:

```text
61
```

Remaining untracked categories are intentionally kept for now:

```text
AGENTS.md
pnpm-workspace.yaml
src/ active Workspace and War Room source files
supabase/ migrations
public/war-room/ active referenced runtime assets
docs/plans/workspace-core-ops-v1
docs/status current lightweight status docs
docs/war-room current War Room docs
scripts current Goblin/product/QA scripts
```

Verification after pass 2:

```text
5 Vitest files passed
17 tests passed
pnpm typecheck passed
pnpm build passed
browser QA passed: 13 rooms, no dimming, Goblin shell ready, Supabase live snapshot
```

## Next safe cleanup buckets

Do not delete blindly.

1. Review generated asset folders.
2. Review old one-off generation scripts under `scripts/`.
3. Review old War Room design docs versus current source of truth.
4. Review `archive/` and `.backup/` only after checking whether they are needed for restore.

Use quarantine first, then verify, then delete only after DLV approval.
