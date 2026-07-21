# Checkpoint — Atlantis marked UI fix + Workspace Tool Bridge plan

Timestamp: 2026-07-04 20:40:44 IDT +0300

## Mission

DLV asked to raise Workspace from beta into a full action surface equivalent to Discord workflows, and to fix the marked Atlantis UI bug where proof/store details looked like an unreadable debug scroll strip.

## What changed

### Atlantis UI

- The selected store/proof area is now a readable compact card.
- Proof paths are collapsed behind a compact summary.
- Raw/debug artifact labels are hidden from the primary Atlantis view.
- Global alert stack / legacy `L` overlay is hidden only in Atlantis primary workspace.

### UI language cleanup

- Removed visible `Proof / debug details` label from Atlantis.
- Replaced raw Atlantis artifact labels with human labels.
- Replaced visible “not mock data / No fake GREEN” phrasing in Goblin with product language.
- Replaced Terra “dummy buttons” copy with product wording.
- Replaced visible Etsy fallback origin badges with human evidence labels.

### Plan/source of truth

- Saved full plan: `docs/plans/workspace-tool-bridge-v1/WORKSPACE_TOOL_BRIDGE_V1_IMPLEMENTATION.md`.
- Updated Obsidian source-of-truth: `01 Projects/War Room/Universal Workspace Action Wrapper - מקור אמת.md`.
- Updated daily note and hot cache.

## Files touched in this batch

```text
src/screens/war-room/living-v3/AtlantisVaultSurface.tsx
src/screens/war-room/living-v3/AtlantisVaultSurface.test.tsx
src/screens/war-room/living-v3/atlantis-vault-surface.css
src/screens/war-room/living-v3/LivingWarRoomV3.tsx
src/screens/war-room/living-v3/living-war-room-v3.css
src/screens/war-room/living-v3/GoblinAnalyticsShell.tsx
src/screens/war-room/living-v3/LivingWarRoomV3.goblin-shell.test.tsx
src/lib/war-room/living-v3/workspace-tool-registry.ts
docs/plans/workspace-tool-bridge-v1/WORKSPACE_TOOL_BRIDGE_V1_IMPLEMENTATION.md
```

Plus earlier Atlantis API/new room files from the same broader Atlantis stage:

```text
src/lib/war-room/living-v3/atlantis-vault-contract.ts
src/server/atlantis-vault-data.ts
src/server/atlantis-vault-data.test.ts
src/routes/api/war-room/atlantis-vault/status.ts
```

## Verification

```text
pnpm vitest run src/screens/war-room/living-v3/AtlantisVaultSurface.test.tsx src/server/atlantis-vault-data.test.ts src/lib/war-room/living-v3/living-v3-contract.test.ts src/screens/war-room/living-v3/LivingWarRoomV3.goblin-shell.test.tsx src/screens/war-room/living-v3/LivingWarRoomV3.etsy-primary-workspace-all-stations.test.tsx src/screens/war-room/living-v3/EtsyProductPrepWorkbench.test.tsx src/routes/api/war-room/-station-action-router.test.ts
=> 7 files passed, 31 tests passed

pnpm typecheck
=> passed

pnpm build
=> passed

Browser DOM QA, Atlantis Source Index
=> ok=true
=> selected store detail 887x115
=> proofOpen=false
=> hasDebugTitle=false
=> hasRawArtifactKind=false
=> hasMockWords=false
=> alertStackVisible=false
=> visibleTinyScrollers=[]

Visual QA
=> previously marked Stores detail area is readable and not clipped; Proof appears collapsed as a compact `2 proof paths` control.
```

## Audit findings to carry forward

- Atlantis marked bug is fixed.
- 24 stations were scanned with no tiny clipped scrollers found in the one-page audit run.
- Global notification noise can still pollute other rooms and needs a focused Notification/Approval Inbox cleanup in the Tool Bridge phase.
- Etsy stations are structurally connected but need stronger artifact-first flow to feel like a full workflow instead of readback-heavy beta.
- Terra printer control is safe/locked but must keep product wording and no inactive machine command buttons.

## Next recommended batch

Start with `Workspace Tool Bridge V1 / Batch 1`:

1. `WorkspaceActionDefinition` contracts.
2. Action registry for Etsy, Terra, Atlantis, Command, browser/search, Obsidian, Google, DB, Discord.
3. Local `ActionRun` store.
4. `prepare/approve/run/recent` server API skeleton.
5. Universal `WorkspaceActionDock` in Atlantis + Olympus Command first.
6. Tests + typecheck + build + browser QA.

## Hard stops

- No live external side effects without DLV approval.
- No DB write claim without runtime read/write proof.
- No mock/static product data.
- No destructive repo cleanup.
