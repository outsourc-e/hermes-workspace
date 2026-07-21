# Workspace Tool Bridge V1 — CTA + Agent Motion Slice

Timestamp: 2026-07-04 23:16:04 IDT +0300

## What changed

Implemented the first safe UI slice for the Workspace Tool Bridge V1 plan. No live marketplace writes, printer commands, DB writes, or Obsidian writes from the app were added.

### Plan/source-of-truth

Updated `docs/plans/workspace-tool-bridge-v1/WORKSPACE_TOOL_BRIDGE_V1_IMPLEMENTATION.md` with:

- Agent ownership/motion requirement: every visible action must declare the responsible agent and the target room/station/tool.
- Universal station CTA standard.
- DOM contract for consistent QA:
  - `data-workspace-station-cta="v1"`
  - `data-action-id`
  - `data-owner-agent-id`
  - `data-target-room-id`
  - `data-target-station-id`
  - `data-target-tool-id`
  - `data-cta-status`
- Proof/readback drawer collapsed by default.
- Strict QA rule: if a station cannot be opened, CTA is missing/misaligned, or raw/mock/debug text is visible, the batch is not done.

### Code slice

Added shared CTA component:

- `src/screens/war-room/living-v3/WorkspaceStationCta.tsx`
- `src/screens/war-room/living-v3/workspace-station-cta.css`
- `src/screens/war-room/living-v3/WorkspaceStationCta.test.tsx`

Wired the CTA into visible surfaces:

- Atlantis Vault: Poseidon → Source Index read-only refresh surface.
- Etsy Product Inbox / visible product console: Loki → Product Inbox search action and Odin → Draft Approval next-step action.
- Etsy Product Prep Workbench tool cards: tool ownership mapping and shared CTA shell.
- Terra Forge visible workspace: Terra → 3D Model Hunt readback/locked action, no fake printer/model action.

CSS fixes:

- Prevented old Etsy/Terra button selectors from overriding the shared CTA internals.
- Fixed RTL alignment so the Etsy CTA sits at the right side of the relevant action area.
- Set CTA internal direction to LTR so owner → tool and status order stays consistent across Hebrew/English rooms.
- Strengthened owner/sublabel/proof contrast.

## QA evidence

Commands run from `/Users/mac/hermes-workspace`:

```bash
pnpm vitest run src/screens/war-room/living-v3/WorkspaceStationCta.test.tsx src/screens/war-room/living-v3/AtlantisVaultSurface.test.tsx src/screens/war-room/living-v3/EtsyProductPrepWorkbench.test.tsx src/screens/war-room/living-v3/LivingWarRoomV3.etsy-primary-workspace-all-stations.test.tsx
```

Result: 4 test files passed, 14 tests passed.

```bash
pnpm typecheck
```

Result: exit 0.

```bash
pnpm build
```

Result: exit 0 (`✓ built`).

```bash
/Users/mac/.local/bin/hermes-browser-harness -c "exec(open('/tmp/workspace_cta_contract_qa.py').read())"
```

Result: exit 0 with `ok: true`.

Browser DOM QA verified:

- Atlantis CTA:
  - `actionId`: `atlantis.refresh-source-index`
  - owner: `poseidon`
  - target: `atlantis-vault / atlantis-index / Source Index`
  - status: `ready`
  - proof collapsed: `true`
  - x/y/size stable and not clipped.
- Etsy CTA:
  - `actionId`: `etsy.product-inbox.live-search`
  - owner: `loki`
  - target: `etsy-market-lab / etsy-loki-product-hunt / Product Inbox`
  - status: `ready`
  - proof collapsed: `true`
  - after RTL fix: x moved to the right side of the relevant action column.
- Etsy draft CTA:
  - `actionId`: `etsy.draft.next-step`
  - owner: `odin`
  - target: `etsy-market-lab / etsy-odin-draft-approval / Draft Approval`
  - status: `needs-approval`
  - proof collapsed: `true`.
- Terra CTA:
  - `actionId`: `terra.primary.terra-model-hunt`
  - owner: `terra`
  - target: `terra-forge / terra-model-hunt / 3D Model Hunt`
  - status: `blocked`
  - proof collapsed: `true`.

Browser visual QA screenshots reviewed:

- `/tmp/workspace_cta_atlantis.png`
- `/tmp/workspace_cta_etsy.png`
- `/tmp/workspace_cta_terra.png`

Visual results:

- Atlantis: CTA visible top/right, readable, proof collapsed, not clipped.
- Etsy: CTA visible, readable, moved to the right side of the product search action area, proof collapsed, not clipped.
- Terra: CTA visible top/right, readable, proof collapsed, not clipped.

Additional scans:

- Search scan found no visible `mock data`, `demo product`, `fake green`, `raw JSON`, `dummy button`, `working-inside-tool`, or old Terra primary LocalOnlyButton in changed visible TSX files.
- One stale phrase `Legacy demo product cleared` was found and changed to `Old local seed cleared`.
- `git diff --check` passed.

## Known boundaries

- This is a UI contract/CTA slice only.
- No runtime DB connection was claimed or added.
- No Supabase/Postgres writes were added.
- No Etsy/marketplace live mutation was added.
- No printer command was added.
- Terra remains correctly blocked where there is no real sender + approval + readback path.

## Next recommended batch

Build Action Registry + Action Run Store foundation:

1. Define typed action registry entries for Atlantis/Etsy/Terra first.
2. Add prepare/approval/readback lifecycle without executing live mutations.
3. Persist action run state locally first, label it truthfully.
4. Only after read/write proof and user approval, wire DB writes.
