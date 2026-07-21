# Repo Hygiene Inventory — 2026-07-03

Timestamp: 2026-07-03 22:54:28 IDT +0300

## What DLV asked

Fix the repo so it is not messy/junk-filled.

## Safety boundary

No files were deleted, moved, or quarantined in this pass.

Reason: the repo is very dirty and contains many active War Room/Workspace additions. DLV's standing rule is no edits/rollback/deletes without plan + backup/quarantine + approval. This document is the safe inventory and quarantine plan.

## Current status summary

`git status --short` summary:

- deleted tracked: 1
- modified tracked: 274
- added tracked: 141
- untracked: 252

Top changed roots:

- `src`: 446 entries
- `scripts`: 154 entries
- `docs`: 28 entries
- `public`: 3 entries
- `playground-ws-worker`: 2 entries
- root config/files: several entries
- `supabase`: 1 root entry
- `status`: 1 root entry

Important implication: this is not safe to auto-clean with delete/move. Some untracked files are active product work.

## Obvious root-level junk candidates

These are candidates for quarantine, not deletion:

```text
tmp_asset_first_chatgpt_generate.py
tmp_asset_first_direct_cdp_packet.py
tmp_asset_first_retry_packet.py
tmp_cdp_download_latest.cjs
tmp_cdp_inspect.cjs
tmp_check_cdp.py
tmp_check_ws.cjs
tmp_check_ws.js
tmp_gemini_mythic_submit_download.py
tmp_gemini_poll_download.py
tmp_gemini_submit.py
tmp_generate_olympus_floor_base.py
tmp_make_contact_sheet.py
tmp_prompt_hermes_mythic_base.txt
war-room-forge-chatgpt-asset-cell-final.png
war-room-forge-chatgpt-asset-cell.png
war-room-forge-focus-cleanup-final.png
war-room-forge-focus-cleanup.png
war-room-overhead-forge-cell-CELL-ONLY.png
war-room-overhead-forge-cell.png
```

## Likely active work — do not quarantine blindly

- `src/lib/war-room/**`
- `src/screens/war-room/**`
- `src/routes/api/war-room/**`
- `src/lib/workspace-core-ops/**`
- `src/lib/workspace-kernel/**`
- `src/server/goblin-analytics-data.ts`
- `supabase/**`
- `docs/plans/workspace-core-ops-v1/**`
- `docs/status/workspace-database-spine-2026-07-03.md`

## Proposed cleanup plan after approval

1. Create quarantine directory:

```text
.quarantine/repo-hygiene-2026-07-03/
```

2. Move only obvious root-level temp files and loose generated PNGs into quarantine.
3. Run tests/build/browser QA.
4. If everything passes, keep quarantine for review.
5. Delete only after explicit DLV approval.

## Git hygiene recommendation

Split future commits into small logical groups:

1. Goblin DB/API/data readback.
2. Goblin UI/workbench improvements.
3. Workspace Core Ops panel.
4. Supabase migrations.
5. Repo hygiene/quarantine.

Do not mix generated asset cleanup with functional Goblin changes.

---

## 2026-07-10 — Phase 1 Batch 2 current ownership snapshot

Timestamp: 2026-07-10 18:36:47 IDT +0300

This section supersedes the counts in the 2026-07-03 snapshot above. The older section remains as historical evidence.

### Authority and safety boundary

- DLV approved continuing to the next Phase 1 batch in Discord message `1525161340623257660`.
- The Workspace MoA council reviewed this batch read-only: Sol aggregated Luna, Terra, and Kimi.
- No files or assets are deleted, moved, quarantined, staged, committed, fetched, pulled, or pushed in this batch.
- Existing dirty work is frozen. A path is not considered generated, disposable, or legacy from its name alone.
- Private rollback checkpoint: `/Users/mac/hermes-checkpoints/workspace-phase1-batch2-20260710-182811/`.

### Current repository truth

- Branch: `main...origin/main [ahead 1, behind 25]`.
- Tracked modified: `36`.
- Untracked files: `3,082`.
- Staged files: `0`.
- Total dirty entries: `3,118`.
- Tracked files in repository: `1,034`.
- Approximate dirty-file payload: `1,202.04 MiB`.
- Large dirty files at or above 5 MiB: `18`.
- Main untracked roots: `public/` 2,798; `docs/` 172; `src/` 94; `scripts/` 13; `supabase/` 3; repository root 2.

Machine-readable evidence:

- `inventory.json` — counts, buckets, large files, tracked roots and lifecycle files.
- `status-records.json` — one record per dirty path with status, size, root and preliminary class.
- `group-summary.json` — public asset groups by file count and bytes.
- `asset-root-reference-matrix.json` — static source-reference matrix for every `public/war-room/*` root.
- `batch2-manifest.json` — allowed edit scope, pre-edit SHA-256 values and rollback instructions.

All files above are in the private checkpoint directory, outside the repository.

### Ownership classes adopted for this phase

| Class | Evidence | Phase 1 handling |
|---|---|---|
| `source` | Authored application code, tests, config, migrations, control documents | Existing dirty files are frozen; edit only an explicitly named and backed-up path |
| `generated` | Explicit generator/build/config evidence, not naming alone | Do not hand-edit, regenerate, format, or clean |
| `runtime-live` | Direct active source references and/or lifecycle `live_paths` | Absolute no-touch unless a replacement has separate approval and readback |
| `proof` | QA reports, screenshots, contact sheets, status evidence | Preserve verbatim |
| `archive` | ZIP packages, rejected raw evidence, superseded packages | Preserve; no movement or deletion in Phase 1 |
| `unknown-owner` | No decisive producer, consumer, lifecycle or named owner | Freeze until ownership is proven |

### Protected current runtime roots

- `public/war-room/living-v3/**` — active Living V3 runtime; 232 dirty entries / 66.39 MiB in this snapshot.
- `public/war-room/direct-overhead-v4-4k-empty/**` — current floor contract; 9 entries / 85.37 MiB.
- `public/war-room/etsy-ops-v4/**` — active Etsy room/runtime contract; 130 entries / 40.67 MiB.
- `public/war-room/council/**` — current Council UI plus QA/legacy references; preserve the entire root.
- `public/war-room/olympus-command/**` — cross-screen dependency used by Gateway; preserve the entire root.
- `public/war-room/living-v3/agents/poseidon/**` — explicitly `integrated-live` with `keep-until-replaced` lifecycle policy.
- `data/**`, `.runtime/**`, workspace DB/state files, generated route tree, build output, caches and lockfiles — no-touch.

Static references prove consumers, not that every file below a root is needed. Therefore the protected unit for this batch is the complete root.

### Legacy candidates — freeze, do not clean

The source-reference matrix found roots referenced only by `src/screens/war-room/game/**`, including:

- `public/war-room/vNext/**`
- `public/war-room/hercules-style/**`
- `public/war-room/hephaestus-90frame-v2/**`
- `public/war-room/direct-overhead-v2/**`
- `public/war-room/live-atlas-r1/**`
- `public/war-room/live-atlas-r2/**`
- several treasury, harbor, Agora and Atlantis V1/V4 families

These are `legacy-retire-first`, not `cleanup-safe`. Retirement requires a separate route/consumer change, browser QA, quarantine manifest, approval, and only then possible deletion review.

### Poseidon truth correction

The live lifecycle file at `public/war-room/living-v3/agents/poseidon/ASSET_LIFECYCLE.json` confirms:

- source package: `docs/status/assets/poseidon-sea-pet-v1-20260704/**`
- live runtime: `public/war-room/living-v3/agents/poseidon/**`
- status: `integrated-live`
- cleanup policy: `keep-until-replaced`

The older human registry statement that Poseidon had no live path is stale and must not be used for cleanup decisions.

### Scoped lint ownership decision

`src/server/atlantis-vault-data.test.ts` is untracked source, so ordinary `git diff` cannot prove a safe edit. The MoA allowed exactly one behavior-neutral change after explicit batch authorization:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
```

Verification must compare the complete file to the private baseline with `git diff --no-index`, then run focused ESLint and focused Vitest. Do not use `pnpm check`, `eslint --fix`, Prettier write mode, staging, or repository-wide formatters.

### Next ownership work

1. Keep all current roots frozen during runtime-blocker fixes.
2. Add or repair lifecycle manifests only when a producer, consumer and owner can be proven.
3. Retire legacy screen consumers before considering any asset quarantine.
4. Any future cleanup must use `live/keep`, `review`, and `safe-to-quarantine` buckets, with human approval between quarantine and deletion.

---

## 2026-07-10 — Hermes World retirement

Timestamp: 2026-07-10 21:32:22 IDT +0300

DLV explicitly determined that Hermes World / Playground is unrelated to the Workspace product and approved its removal in Discord message `1525201395379343472`.

The following isolated product surface was removed from navigation and runtime routing:

- desktop and mobile Hermes World links
- `/playground`
- `/api/playground-npc`
- the standalone multiplayer worker and local WebSocket launcher
- game-only Three.js dependencies, historical goal documents, trailer script, and the unused 3D avatar README

The mobile slot now opens the real `/war-room` Workspace route. Shared `/public/avatars/**`, shared `ws`, all War Room roots, route-independent Workspace code, proof, and unknown-owner assets were preserved.

Nine isolated roots containing `1,848` files and `171,182,665` bytes were moved reversibly to:

`/Users/mac/hermes-quarantine/workspace-remove-hermesworld-20260710-210930/`

The SHA-256 checkpoint, edit backups, removal inventory, lockfile comparison, and restore instructions are stored at:

`/Users/mac/hermes-checkpoints/workspace-remove-hermesworld-20260710-210930/`

No permanent deletion, staging, commit, reset, clean, pull, push, or remote Cloudflare decommission was performed. A deployed remote worker, if still present, requires a separate external-action approval before decommissioning.
