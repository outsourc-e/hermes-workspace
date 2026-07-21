# War Room BOOST room-agent activity no-live safety review

Status: BLOCKED — SAFETY_RISK
Date: 2026-06-12
Reviewer: claudereviewer
Task: t_bedd8646

## Verdict

I cannot mark this `APPROVED:` because the task's mandatory literal safety scanner failed. The implementation otherwise presents a bounded local/read-only checkpoint, visual QA evidence passes, and release/live connector approval gates remain blocked, but the required no-live scan found disallowed literals in scoped source/tests.

## Commands run

1. `NODE_ENV=test pnpm gate:war-room-v1`
   - Exit code: 0
   - Result: PASS (`War Room v1 regression gate: PASS`; six focused v1 suites exited 0).

2. `pnpm typecheck`
   - Exit code: 0
   - Result: PASS (`tsc --noEmit --pretty false`).

3. `pnpm build`
   - Exit code: 0
   - Result: PASS. Existing Vite warnings only: sourcemap warning from `client-process-env`, dynamic/static import chunk warnings, and large chunk warnings.

4. Mandatory safety scan:
   - Exit code: 1
   - Output:

```text
safety_hits= ['src/screens/war-room/v1/war-room-v1-state.ts:autoExecutable: true', 'src/screens/war-room/v1/__tests__/war-room-v1-state.test.ts:autoExecutable: true', "src/screens/war-room/v1/__tests__/war-room-v1-connectors.test.ts:executionMode: 'live'", "src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx:executionMode: 'live'"]
```

## Review findings

- UI honesty: PASS with caveat. Implementation/QA docs describe this as a bounded local UI layer, not final/perfect/live-business-ready.
- Room-agent activity source: PASS. Activity is derived from read-only/local Kanban-derived mission state and deterministic mappings.
- Full-room surfaces: PASS. QA reports verify compact full-room active unit/station, disabled chat, read-only tools, approvals/logs, connector locks, and hidden inspector closed by default.
- Connector/action state: PASS in behavior. Connector registry keeps Etsy/ShotLab/supplier connectors `NOT_CONNECTED`, disabled, credential-free, no live API calls, and no external mutation. Local workspace/archive scaffolds are dry-run/readiness only.
- Hidden live action path: no executable external path found in reviewed source. `executeWarRoomV1ConnectorActionDraft` always returns `ok: false`, `externalMutation: false`, and `liveExecution: false`; live gate requests return `allowed: false`.
- Evidence: regression gate, typecheck, build, implementation note, and visual QA artifacts exist and pass.
- DLV approval-only gates: PASS. Board read-only check shows `t_48d583eb` (`DLV Approval Gate: enable live shop/tool connectors later`) and `t_124c7b12` (`DLV Approval Gate: package War Room release safely`) remain `blocked`.

## Blocking reason

The mission explicitly required the literal safety scan to return no hits and said to complete with `APPROVED:` only if safe. It returned four hits, including one production-source literal `autoExecutable: true` and test literals for live execution-mode contexts. Even where semantically constrained to local read-only or live-rejection tests, these exact strings violate the review gate and can confuse future safety scans/overclaim checks.

## Focused remediation recommendation

Remove or rename the production `autoExecutable: true` local-read-only decision so no War Room v1 scoped implementation source contains the disallowed literal; update tests to assert the same behavior without embedding `autoExecutable: true` or `executionMode: 'live'` literals inside scanned files, then rerun the mandatory safety scan plus `NODE_ENV=test pnpm gate:war-room-v1`, `pnpm typecheck`, and `pnpm build`.

## Safety line

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; this review used only local read-only inspection and did not exercise external systems.
