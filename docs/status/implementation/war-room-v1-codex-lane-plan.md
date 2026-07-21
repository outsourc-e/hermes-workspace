# War Room v1 Codex lane plan — isolated implementation lane

Status: BLOCKED for implementation until the Claude vision review blocker is resolved.
Owner: codexintegrator
Date: 2026-06-12
Scope: planning/documentation only. No app code was edited and no Codex implementation lane was started.

## 0. Blocker discovered during required review read

Required review input `docs/status/vision/claude-vision-review-war-room-v1.md` is a FAIL for direct implementation.

Exact blocker:
- The build spec still claims Q1-Q10 as source locks while `war-room-final-vision-live-spec.md` includes Q11 and Q12.
- Claude Vision requires Q11/Q12 to become hard source locks before implementation:
  - Q11: GBA/Pokemon-like, small, clean, very readable.
  - Q12: functional real-state tool plus game-like dashboard, with progressive disclosure and no overload/confusion.
- Claude Vision requires additional sections before coding: information hierarchy/progressive disclosure, GBA/Pokemon readability constraints, minimal vertical-slice implementation order, station-minimum clarification, approval object requirements, placeholder policy, and a pre-implementation re-review gate.

This plan is therefore a ready-to-use Codex lane plan, but the first implementation card must not run until a vision/spec revision card fixes the above and a follow-up vision/art review passes.

## 1. Inputs read

- `docs/status/vision/war-room-v1-build-spec.md`
- `docs/status/vision/war-room-v1-implementation-roadmap.md`
- `docs/status/vision/claude-architecture-review-war-room-v1.md`
- `docs/status/vision/claude-vision-review-war-room-v1.md`
- `docs/status/automation/war-room-agent-routing-policy.md`
- `kanban-codex-lane` skill
- `package.json` for verification commands

## 2. Non-negotiable product and safety locks for the Codex lane

Codex is an input lane only. Hermes owns Kanban lifecycle, diff review, acceptance, testing, browser QA, rollback, and handoff.

Implementation must preserve these locks:
- Real Kanban task/run state is the eventual authoritative lifecycle truth.
- Phase 1 may use clearly labeled fixtures/placeholders only to prove mapper/manifest/rendering; it must not present fake demo data as live.
- Movement and station placement must be a pure function of mapper output plus manifest coordinates, not random decorative CSS loops.
- The route must stay isolated behind `/war-room?v1=1` or an equally explicit non-default flag until QA approves default use.
- No Etsy/shop/supplier/ShotLab/paid/account/live business write is allowed.
- No enabled publish, purchase, supplier message, paid generation, refund, renewal, or shop/account edit affordance may appear.
- Approval events must be spatially attached to the central command table/approval seal, not hidden in a disconnected modal/shrine/card.
- The primary read must be a clean GBA/Pokemon-like historical pixel strategy map, not flat SaaS cards, glassmorphism, JARVIS-first sci-fi, Olympus temple-first, HD-2D clutter, or generic Tailwind dashboard.
- Every meaningful state must have deterministic `data-war-room-v1-*` attributes and accessible text fallback.

## 3. Allowed files for first coding lane after blocker is resolved

The first Codex implementation card should be Phase 1 only. Allowed app-code files:

- `src/screens/war-room/war-room-screen.tsx`
  - Only to route an explicit v1 flag such as `/war-room?v1=1` to the new component.
  - Must not make v1 the default route.
- `src/screens/war-room/v1/WarRoomV1.tsx`
  - New v1 map shell component.
- `src/screens/war-room/v1/war-room-v1-types.ts`
  - New lifecycle, raw task/run input, station, route, unit, mission visual types.
- `src/screens/war-room/v1/war-room-v1-state.ts`
  - Pure mapper from task/run fields to mission visual state. No DOM/network/random/Date.now-only behavior.
- `src/screens/war-room/v1/war-room-v1-manifest.ts`
  - Semantic manifest with station ids, coordinates, routes, unit idle positions, and placeholder/reference labels.
- `src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts`
  - Focused deterministic mapper tests.
- Optional: `src/screens/war-room/v1/WarRoomV1.css` or `src/screens/war-room/v1/war-room-v1.css`
  - Only if styling cannot remain local; must avoid dashboard/card/glass patterns.

Allowed docs/status files:
- `docs/status/implementation/war-room-v1-codex-lane-plan.md` for this plan only.
- A follow-up implementation card may append a short evidence note under `docs/status/implementation/` only if requested by the card.

Disallowed in first coding lane:
- `src/server/war-room-ops-data.ts` and any Kanban/server adapter files. Phase 2 owns real Kanban feed integration.
- `docs/status/war-room-asset-registry.json` and `public/war-room/**`. Phase 1 must not promote or integrate live art assets.
- Existing visual-remake/generated asset files.
- Package/dependency changes unless a test/build command proves an existing missing dependency and Hermes approves scope.
- Any Hermes config, credentials, gateway, marketplace, shop, supplier, ShotLab, payment, or account files.

## 4. Isolated worktree pattern

The current shared checkout is dirty and behind origin, so Codex must not run directly in `/Users/mac/hermes-workspace`.

Use a temporary worktree created from the same base branch as the shared workspace:

```bash
TASK_ID="t_81d6efb1"
REPO="/Users/mac/hermes-workspace"
BASE="$(git -C "$REPO" branch --show-current)"
SAFE_TASK="$(printf '%s' "$TASK_ID" | tr -cd '[:alnum:]_-')"
STAMP="$(date -u +%Y%m%d%H%M%S)"
BRANCH="codex/${SAFE_TASK}/${STAMP}"
WORKTREE="/tmp/${SAFE_TASK}-codex-war-room-v1-${STAMP}"

git -C "$REPO" worktree add -b "$BRANCH" "$WORKTREE" "$BASE"
git -C "$WORKTREE" status --short --branch
```

Do not run `git fetch`, `pull`, `reset`, or branch-changing commands in the shared workspace without an explicit supervisor instruction. The worktree branch is disposable.

After Codex exits, Hermes must inspect and selectively apply only the accepted scoped diff back to the shared workspace. Preferred reconciliation:

```bash
git -C "$WORKTREE" status --short --branch
git -C "$WORKTREE" diff --stat
git -C "$WORKTREE" diff -- src/screens/war-room/war-room-screen.tsx src/screens/war-room/v1
```

Then either:
- copy/cherry-pick only accepted files into the Hermes-owned workspace after review, or
- reject the lane and keep a patch artifact for analysis.

Cleanup after acceptance/rejection:

```bash
git -C "$REPO" worktree remove "$WORKTREE"
git -C "$REPO" branch -D "$BRANCH"
```

Keep the worktree only if it is needed as a review artifact and record the absolute path in the Kanban handoff.

## 5. Exact Codex prompt outline

Use `codex exec --full-auto` in the isolated worktree. `/goal` is not needed for Phase 1 because this should be a bounded diff.

Prompt outline:

```text
Task id: <implementation-card-id>
Parent plan: docs/status/implementation/war-room-v1-codex-lane-plan.md
Repository/worktree: <WORKTREE>
Branch: <BRANCH>

Hermes owns the Kanban lifecycle. You are Codex as an isolated implementation input lane only.
Do not call Hermes kanban tools, gateway messaging, external services, marketplace/shop/supplier/ShotLab actions, or edit files outside this worktree.
Do not read, print, write, or require secrets/tokens/credentials.

Product target:
Build Phase 1 only for War Room v1: a clean GBA/Pokemon-like, top-down/isometric historical pixel strategy map shell where task lifecycle state is represented spatially by stations, mission marker, and embodied general/advisor unit. This is not final art and must not look like a SaaS dashboard/glass card UI.

Before coding, read these files:
- docs/status/vision/war-room-final-vision-live-spec.md
- docs/status/vision/war-room-v1-build-spec.md after the Q11/Q12 revision has landed
- docs/status/vision/war-room-v1-implementation-roadmap.md
- docs/status/vision/claude-architecture-review-war-room-v1.md
- docs/status/vision/<passing follow-up vision/art review file>
- docs/status/automation/war-room-agent-routing-policy.md
- docs/status/implementation/war-room-v1-codex-lane-plan.md

Allowed files:
- src/screens/war-room/war-room-screen.tsx
- src/screens/war-room/v1/WarRoomV1.tsx
- src/screens/war-room/v1/war-room-v1-types.ts
- src/screens/war-room/v1/war-room-v1-state.ts
- src/screens/war-room/v1/war-room-v1-manifest.ts
- src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
- optional local v1 CSS file under src/screens/war-room/v1/

Do not modify package.json, lockfiles, server adapters, public assets, generated candidates, asset registry, or existing unrelated War Room/game files unless a required compile error forces a tiny import-only adjustment. If that happens, stop and explain before broadening scope.

Required implementation:
1. Define v1 lifecycle enum/state with intake, triage/planning, assignment, ready, claimed, active, qa-review, blocked-needs-input, approval-required, remediation, completed-archived, superseded-canceled, parent-waiting, stale-running if needed by tests.
2. Define raw task/run input type with task id/title/status/assignee/priority/parents/children/run id/run status/started/heartbeat/block reason/review-required/approval risk/completion summary/superseded reason.
3. Define mission visual output with lifecycle, station id, route id/path id, unit id/role, accessible label, display label, risk/approval metadata, evidence freshness, placeholder/reference flags.
4. Implement a pure mapper. No DOM, network, random movement, or decorative timers.
5. Add tests for ready, claimed/running, stale running, review-required, blocked needs input, approval-gated risky action, completed, superseded, parent-waiting, and remediation child.
6. Add manifest station ids: mission-intake-gate, planning-strategy-desk, assignment-dais, ready-staging-lane, active-work-station, qa-inspection-table, blocker-decision-lane, central-command-table, approval-seal, archive-victory-ledger, gateway-beacon.
7. Render /war-room?v1=1 with one fixture mission marker and one embodied general/advisor unit placed from mapper + manifest. Clearly label fixture/placeholder state as non-live Phase 1 state proof.
8. Add deterministic data attributes: data-war-room-v1-map, data-war-room-v1-station, data-war-room-v1-task-id, data-war-room-v1-lifecycle, data-war-room-v1-agent-unit, data-war-room-v1-approval-lock.
9. Keep base map calm: one followed task path primary, short sparse labels, details on selection/inspection only. Avoid flat cards/glass/KPI grid/dashboard table dominance.
10. Expose locked approval copy and do not render enabled live-action controls.

Verification Codex may run:
- pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
- pnpm typecheck
- pnpm build

Required Codex final output:
- Summary of files changed.
- Diff/commit list if any commits were made.
- Exact commands run with exit codes.
- Known risks or skipped gates.
- Confirmation that no files outside the allowed scope were changed.
```

## 6. Verification commands Hermes must run after Codex exits

From the accepted workspace, not trusting Codex self-report:

```bash
git status --short --branch
git diff --stat
git diff -- src/screens/war-room/war-room-screen.tsx src/screens/war-room/v1
pnpm vitest run src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts
pnpm typecheck
pnpm build
```

Browser QA after build/dev server is available:

```bash
pnpm dev
```

Then use browser automation against `/war-room?v1=1` and assert:
- route loads with no uncaught console errors;
- `[data-war-room-v1-map]` exists exactly once;
- every required station id exists as `[data-war-room-v1-station="..."]`;
- at least one `[data-war-room-v1-task-id]` marker has visible task id/title/status/assignee text;
- at least one `[data-war-room-v1-agent-unit]` exists and reads as commander/general/advisor, not a circle/pill/avatar-only token;
- `[data-war-room-v1-approval-lock]` exists with target/action/risk/locked copy for risky actions;
- no enabled controls exist for publish, purchase, supplier message, paid generation, refund, renewal, shop/account edit, or live external write;
- primary DOM/visual structure is map/stations/units, not a dominant grid of generic cards/glass panels.

If any command fails, Hermes must reject or partially accept only safe fixes, then create a focused remediation card with the exact failing command/output.

## 7. Rollback plan

Because Codex runs in an isolated worktree, the default rollback is to reject the worktree and remove it:

```bash
git -C "/Users/mac/hermes-workspace" worktree remove "$WORKTREE"
git -C "/Users/mac/hermes-workspace" branch -D "$BRANCH"
```

If an accepted patch has already been copied into the shared workspace:
1. Save evidence first:
   ```bash
   git diff -- src/screens/war-room/war-room-screen.tsx src/screens/war-room/v1 > /tmp/war-room-v1-rejected.patch
   ```
2. Revert only files from the accepted Phase 1 scope. Do not use broad `git reset --hard` in the dirty shared workspace.
3. Delete newly added `src/screens/war-room/v1/**` files only if they came from the rejected patch and are not used by a later accepted card.
4. Restore `src/screens/war-room/war-room-screen.tsx` by targeted patch or checkout from the pre-acceptance version if safe.
5. Rerun `git status --short --branch` and record the rollback commands/results in the Kanban handoff.

## 8. First coding card breakdown

Do not dispatch these until the vision/spec blocker is resolved.

### Card A — Vision/spec revision gate

Assignee: `visionarchitect` or `claudevision`/`artdirector` per board policy.

Scope:
- Update `docs/status/vision/war-room-v1-build-spec.md` from Q1-Q10 to Q1-Q12.
- Add Q11/Q12 source locks.
- Add information hierarchy/progressive disclosure section.
- Add GBA/Pokemon readability constraints.
- Add minimal vertical-slice implementation order.
- Clarify v1 station minimum and quiet/background station behavior.
- Add approval object requirements.
- Add placeholder policy.
- Add pre-implementation review gate.

Acceptance:
- Follow-up vision/art review passes for direct Phase 1 implementation.
- No app code edited.

### Card B — Codex Integrator Phase 1 setup and isolated Codex run

Assignee: `codexintegrator`.

Parents: Card A.

Scope:
- Create isolated worktree/branch.
- Run bounded `codex exec --full-auto` with the prompt outline in this plan.
- Reconcile Codex diff manually.
- Do not start Phase 2 real Kanban feed.

Acceptance:
- Only allowed Phase 1 files changed.
- Focused mapper tests pass.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- Hermes reviewed diff and recorded Codex lane metadata.
- If code is changed, block with `review-required:` and attach commands/diff summary for independent review.

### Card C — QA Agent Phase 1 independent browser/typecheck gate

Assignee: `qaagent` or `visualqaagent` depending board availability.

Parents: Card B after implementation review unblocks.

Scope:
- Re-run typecheck, focused tests, build.
- Launch route `/war-room?v1=1`.
- Verify DOM attributes, station ids, marker/unit text, approval locks, no enabled live-action controls, and no console errors.
- Capture screenshot/evidence if board conventions allow.

Acceptance:
- All machine gates pass with exact command outputs.
- Visual/product check confirms first read is map/stations/units, not SaaS/glass/JARVIS/Olympus temple-first.

### Card D — Warroom Agent Phase 2 read-only Kanban adapter

Assignee: `warroomagent` or `codexintegrator` if scope is multi-file/state-sync heavy.

Parents: Card C.

Scope:
- Add read-only Kanban adapter and real task feed.
- Normalize task/run fields into the Phase 1 mapper.
- Show honest unavailable state if Kanban cannot be read.

Acceptance:
- At least one real Kanban task can appear as a mission marker when data exists.
- No fake live task is presented as real.
- Source precedence is documented and tested.

## 9. Current task conclusion

This task produced the isolated Codex lane plan, but implementation is intentionally blocked because the required Claude Vision review fails direct implementation until the build spec is revised and re-reviewed.
