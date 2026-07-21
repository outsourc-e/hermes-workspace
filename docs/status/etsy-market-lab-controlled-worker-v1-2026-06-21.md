# Etsy Market Lab — Controlled One-Shot Hermes Worker V1

Updated: 2026-06-21 23:11:05 IDT +0300

## Status

**PASS — Controlled One-Shot Hermes Worker V1 connected and verified.**

Official surface remains:

```text
/war-room?etsyOps=1&bodyRuntime=1
```

## What changed

- Added a real bounded Hermes child-worker runner in:
  - `src/lib/war-room/body/controlled-athena-runner.ts`
- The runner uses `execFile` without a shell and only through this controlled runner path.
- The child command is bounded with:
  - `hermes chat`
  - `-Q`
  - `--ignore-rules`
  - `--max-turns 1`
  - `--source war-room-controlled-<agent>`
  - `-t none`
  - strict JSON-only prompt
  - timeout clamp: 5s–90s, default 45s
- Added explicit usage readback:
  - actual cost line is parsed if Hermes CLI reports one
  - otherwise the UI/event says: `actual cost not reported by Hermes CLI; budget: one Hermes CLI model call, max-turns=1`
- Connected one UI button only:
  - `Hermes V1`
  - chip: `H1`
  - room: `etsy-market-lab`
  - station: `etsy-ravens-nest`
- The worker returns one JSON recommendation and creates a local approval packet.
- No Etsy, supplier, paid generation, Discord send, file edit, command tool, browser automation, Kanban dispatch, or worker fan-out is allowed by the worker prompt/route contract.

## Safety scan

Targeted scan result:

- `src/routes/api/war-room/**`: no `node:child_process`, `execFile`, `spawn`, or `exec` found.
- `src/screens/war-room/living-v3/**`: no `node:child_process`, `execFile`, `spawn`, or `exec` found.
- `src/lib/war-room/body/controlled-athena-runner.ts`: the only new controlled `execFile` site for the one-shot worker.

Existing unrelated `execFile` sites still exist in broader Workspace routes such as swarm/files APIs; they are not part of the Etsy Market Lab intent path.

## Real browser worker QA

Route:

```text
http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1
```

Clicked:

```text
Hermes V1
```

Observed:

- HUD changed to `H1✓`.
- Control returned to `FROZEN`.
- Body runtime stayed `BODY`.
- Agent-control state after run:
  - `mode: frozen`
  - `frozen: true`
  - `usageAllowed: false`
  - `workerSpawnAllowed: false`
  - safety locks all false for live/purchases/paid/supplier actions
- Real worker run id:
  - `hermes-ui-mqo80h97`
- Worker event path included:
  - `control.local_only`
  - `agent.intent.received`
  - `agent.moved`
  - `agent.said`
  - `agent.started_work`
  - `approval.requested`
  - `agent.connection.frozen`
  - `control.frozen`
- Worker output summary seen in events:
  - `Reviewed the Etsy Market Lab packet flow under local-only constraints and identified a safe handoff that records a recommendation without triggering external actions.`
- Console errors: none.
- External browser resources: `externalCount=0`.

Note: Hermes CLI did not expose a numeric actual cost line in the browser run. The code now records this explicitly and keeps the hard budget visible.

## Full Etsy local flow QA

Same browser session, same-origin `/api/war-room/intents` flow:

```text
prepare_product_scout_packet_local
select_etsy_candidate_local
create_shotlab_handoff_local
create_seo_packet_local
create_draft_payload_local
request_dlv_approval_local
```

Result:

- HTTP statuses: `200, 200, 200, 200, 200, 200`
- `ok`: `true` for all six steps
- QA run id: `browser-qa-mqo81i9f`
- final stage: `approval_waiting`
- approval status: `waiting_operator`
- final control state:
  - `mode: frozen`
  - `usageAllowed: false`
  - `workerSpawnAllowed: false`
- locked actions still include:
  - `Etsy publish`
  - `Etsy upload draft`
  - `Etsy edit listing`
  - `Etsy renew`
  - `Etsy purchase`
  - `supplier message`
  - `AliExpress/Alibaba live call`
  - `Alura live call`
- external browser resources: `externalCount=0`
- console errors after run: none

## Tests and build

Passed before final documentation update:

```text
pnpm vitest run src/lib/war-room/body/controlled-athena-runner.test.ts src/lib/war-room/body/oracle-scout-event-bridge.test.ts
# 2 files / 15 tests passed

pnpm vitest run src/lib/war-room/body
# 10 files / 43 tests passed

pnpm vitest run src/lib/war-room/living-v3
# 8 files / 45 tests passed

pnpm build
# client + SSR passed
```

After the usage-readback polish, reran:

```text
pnpm vitest run src/lib/war-room/body/controlled-athena-runner.test.ts src/lib/war-room/body/oracle-scout-event-bridge.test.ts
# 2 files / 15 tests passed

pnpm build
# client + SSR passed
```

Build warnings were existing Vite chunk/dynamic-import warnings, not failures.

## Files changed

- `src/lib/war-room/body/controlled-athena-runner.ts`
- `src/lib/war-room/body/controlled-agent-flow.ts`
- `src/lib/war-room/body/controlled-athena-runner.test.ts`
- `src/lib/war-room/body/oracle-scout-event-bridge.test.ts`
- `src/hooks/use-war-room-body.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- `docs/status/etsy-market-lab-current-source-of-truth.md`
- this file

## Current limitations

- This is not internet product search yet.
- The worker is a proof of real Hermes child-worker connection and safe event/readback wiring.
- It runs one model call and returns JSON only.
- It does not use tools, browse, call Etsy, call suppliers, write Sheets, invoke ShotLab, publish, upload, or fan out.
- Actual numeric model cost is captured only if the Hermes CLI prints a cost/usage line; the verified browser run did not print one.

## Next safe phase

```text
Controlled Product Scout Worker V2
```

Scope for V2:

- still one worker only
- still no live Etsy or supplier actions
- allow read-only web/product research only if DLV approves that exact capability
- output must become a `ProductScoutPacket` with candidates/evidence/missing fields
- UI must show results inside Odin/Scout workbench before any ShotLab/SEO handoff
