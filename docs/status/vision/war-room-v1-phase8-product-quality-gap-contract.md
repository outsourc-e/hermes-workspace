# War Room v1 Phase 8 Product-Quality Gap Contract

Status: product-quality / vision contract only
Owner lane: claudevision
Date: 2026-06-12
Scope: read-only/spec-only. This document does not implement code, generate assets, approve release packaging, or authorize live actions.

## 1. Phase 7 verified checkpoint vs current DLV target

Phase 7 functional/lifecycle checkpoint: PASS.

Verified evidence from `t_73fd6680`, `t_46cb9630`, and `t_ee0b33b8` shows `/war-room` and `/war-room?v1=1` can truthfully present a local read-only lifecycle-readiness proof:

- `source=local-hermes-kanban`, `live=true`, `degraded=false` when the local board is readable.
- `local-hermes-kanban` task evidence appears in the lifecycle proof with stable DOM hooks.
- The route/API/UI keep Kanban lifecycle access read-only; POST/PATCH/DELETE probes returned method-not-allowed.
- The safety spine remains explicit: Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only mock/theoretical/read-only UI is allowed.
- The browser/product QA evidence found no enabled controls for publish, purchase, supplier message, paid generation, refund, renewal, shop/account edits, or Kanban mutation actions.

Current DLV product target: not yet fully passed.

The target remains a clean GBA/Pokemon-like top-down/isometric historical strategy War Room: a unified mixed-empires command map with small moving general/advisor units, live Kanban/task lifecycle, risky decisions rising to the central war table for DLV approval, and no flat SaaS/glassmorphism drift.

## 2. Separate verdicts

Functional/lifecycle PASS:
Phase 7 is safe to describe as a verified local/read-only lifecycle-readiness checkpoint backed by real local Hermes Kanban evidence.

Product-quality/visual PASS:
Not yet. The visible evidence is acceptable as a lifecycle proof and no new glassmorphism/SaaS dominance was introduced, but the current screen still reads more like a proof/debug contract surface than the final clean GBA historical strategy game-world product.

Safe DLV-facing claim:
"War Room v1 has a verified local/read-only Kanban lifecycle proof and safety locks. It is not final release packaging and not final product-quality art direction."

Unsafe claim:
"The War Room is visually done, release-ready, fully autonomous, connected to shops/suppliers/ShotLab/API/account systems, or approved for live actions."

## 3. Top 3 product-quality gaps from Phase 7 evidence

### Gap 1 — Proof surface still dominates over game-world first-read

Visible/inferable evidence:
The screenshot evidence shows a brown/gold pixel-styled surface with a large text header, safety banner, proof panel, and numbered lifecycle evidence cards. This is honest and useful, but the first read is still documentation/proof-heavy rather than a living top-down/isometric war-table map.

Product risk:
Future workers may keep adding status/proof cards because they are easy to verify, causing the product to slide back toward a dressed-up dashboard instead of a GBA strategy command world.

Phase 8 contract response:
Before broad code work, define a product-quality visual contract that turns the Phase 7 proof into a game-world hierarchy: central war table first, one followed mission path second, quiet background lifecycle markers third, inspection/proof details only on selection.

### Gap 2 — General/advisor unit quality is not yet proven as a moving GBA strategy unit system

Visible/inferable evidence:
Phase 7 QA verified an embodied agent/unit hook and lifecycle route hooks. The visible screenshot crop, however, does not prove a polished small general/advisor sprite system with clean silhouettes, idle/walk/work states, and readable station-to-station movement as the dominant product read.

Product risk:
The app can satisfy DOM hooks while still feeling like task cards plus labels. That fails DLV Q4/Q5 if workers are not visibly embodied as small strategy units moving through the lifecycle.

Phase 8 contract response:
Art direction must specify minimum unit readability and movement semantics before any assetcreator or broad codexintegrator pass: unit roles, silhouette scale, palette, readable walk paths, reduced-motion fallback, selected-task-only strong motion, and DOM hooks that prove state derives from real lifecycle fields.

### Gap 3 — Mixed-empires historical style and no flat SaaS constraint need a stricter acceptance gate

Visible/inferable evidence:
The Phase 7 screenshot passes the safety/lifecycle gate and does not show glassmorphism, but it still relies on rectangular proof panels and dense monospaced evidence cards. It does not yet prove the unified Rome/Greece/Napoleon/Asia/East historical command-board style, premium GBA readability, or final diegetic UI language.

Product risk:
Implementers may keep the rectangles, headers, and evidence tiles as the final visual language because they are functional. That would under-deliver the historical strategy War Room target and could become flat SaaS in parchment/pixel clothing.

Phase 8 contract response:
Require an artdirector-owned style/visual contract with explicit negative examples: no flat SaaS, no glass panels, no KPI/card grid dominance, no dark clutter, no HD-2D bloom spectacle, no oversized ornate monuments, no tiny unreadable units, no one-piece baked room PNG as the interactive surface.

## 4. Smallest safe Phase 8 direction

Phase 8 should be a product-quality/visual-contract gate, not implementation.

Recommended next 1-2 cards:

1. `artdirector`: Phase 8 GBA historical strategy visual contract
   - Output a concise style contract for the central war table, map hierarchy, unit silhouettes, lifecycle stations, approval seals, labels, palette, and anti-SaaS negatives.
   - Include a source-to-visual mapping table for local Kanban lifecycle fields.
   - No code edits, no final assets, no ChatGPT paid generation, no live app/public integration.

2. `visualqaagent`: Phase 8 visual-evidence checklist and screenshot rubric
   - Convert the style contract into screenshot/DOM/browser acceptance gates.
   - Must verify central war table first-read, one followed mission path, quiet background tasks, readable GBA unit/station scale, `local-hermes-kanban` source truth, and no enabled live/Kanban mutation controls.
   - No app mutation and no release approval.

Conditional later card only after those pass:
- `codexintegrator` or `warroomagent`: one bounded implementation slice that reduces proof-card dominance and aligns the existing Phase 7 lifecycle surface to the approved visual contract.
- `claudearchitect` only if UI state semantics or API/source synchronization change.
- `releaseagent` / `claudereviewer` only for overclaim/release gates after implementation and QA evidence exist.

## 5. Explicit out of scope

Phase 8 does NOT authorize:

- Release packaging, Git cleanup, push/merge/reset/clean/rollback, or default-route release claims.
- Code implementation before the product-quality/visual contract is accepted.
- App/public path changes, final asset promotion, or registry changes except if a later dedicated approved card says so.
- Etsy/shop/supplier/ShotLab live or paid actions.
- Real AliExpress/Alibaba purchases/messages/account actions.
- Kanban mutations from the War Room UI/API: no task create, dispatch, complete, unblock, archive, approve, or write endpoint.
- God/model/asset-family replacement unless a later dedicated approved asset card exists.
- Claiming final product-quality PASS, full live automation, or external/API/account connectivity.

## 6. Machine-checkable acceptance criteria for next implementation/QA card

A later Phase 8 implementation/QA card may pass only if all applicable checks are true and recorded with exact commands/artifact paths:

### DOM/source semantics

- `[data-war-room-v1-map]` exists exactly once.
- `[data-war-room-v1-station="central-command-table"]` exists and is in the primary map surface.
- Lifecycle proof/source hooks still report `data-war-room-v1-lifecycle-trail-source="local-hermes-kanban"` when board data is readable.
- API/browser evidence still shows `ok=true`, `source=local-hermes-kanban`, `live=true`, `degraded=false`, and real task count > 0.
- Every visible mission marker has a stable task id hook and accessible text for task id/title/status/assignee.
- Every visible general/advisor unit has a stable unit hook, role label, lifecycle/station hook, and deterministic source mapping from task/assignee/lifecycle state.
- The selected/followed task path is machine-identifiable; background tasks are machine-identifiable as secondary/quiet.

### Safety locks

- No enabled controls exist for publish, purchase, supplier message, paid generation, refund, renewal, shop/account edits, or external live actions.
- No enabled controls exist for War Room Kanban mutation actions from route/UI/API: create, dispatch, complete, unblock, archive, approve, POST, PATCH, DELETE.
- POST/PATCH/DELETE probes against the lifecycle endpoint still return read-only method-not-allowed unless a separate approved architecture card explicitly changes the contract.
- The UI contains visible safety copy that Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED.

### Build/typecheck/browser evidence

- `pnpm gate:war-room-v1` exits 0.
- `pnpm typecheck` exits 0.
- `pnpm build` exits 0.
- `/war-room` and `/war-room?v1=1` return HTTP 200.
- Browser console/page-error checks report zero relevant runtime errors.
- Screenshot/manifest artifacts are written under `docs/status/qa/screenshots/` or a documented QA path.

### Product-quality visual gate

- First read is a top-down/isometric historical strategy command map with central war table, not a proof dashboard.
- The map uses clean GBA/Pokemon-like readability: clear walk paths, small readable unit silhouettes, limited palette, restrained effects, and low clutter.
- One followed mission path is visually primary; secondary proof details are hidden, quiet, or selection-based.
- No flat SaaS, no glassmorphism, no KPI/card-grid dominance, no generic Tailwind admin table, no sci-fi cockpit dominance, no temple-first relapse.
- Any placeholder art is labeled temporary/prototype and does not get presented as final v1 art.

## 7. Completion boundary

This contract is complete when future workers can safely continue from Phase 7 without confusing lifecycle readiness with product-quality readiness. The next safe step is an artdirector/visual-contract gate, followed by visualqaagent evidence, and only then a bounded implementation lane if the contract is accepted.
