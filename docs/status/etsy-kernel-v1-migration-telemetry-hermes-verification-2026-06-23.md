# Etsy Kernel V1 Migration + Telemetry — Hermes Verification

Verified: 2026-06-23 19:16:33 IDT +0300

## Status

**Hermes functional PASS.**

Codex's latest Etsy end-to-end Kernel V1 migration and persistent telemetry cleanup is verified enough to move to a larger next batch.

## Files inspected

- `src/lib/workspace-kernel/adapters/etsy-market-lab.ts`
- `src/lib/workspace-kernel/adapters/etsy-market-lab.test.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx` telemetry/Kconsole integration markers
- `src/lib/workspace-kernel/` static scan for process/network call sites

## What changed

Codex added Etsy → Kernel adapter functions including:

- `createEtsyKernelArtifact`
- `createEtsyKernelApproval`
- `createEtsyKernelRunForPacket`
- `createSmartIntakeMissionKernelRun`
- `syncEtsyPipelineToWorkspaceRun`
- `buildEtsyKernelStageTimeline`
- `workspaceKernelTelemetryFromRun`

The six Etsy stages now map to kernel artifacts:

1. Smart Intake → `product-candidate-packet`
2. Selected Product → `selected-product-packet`
3. ShotLab → `shotlab-handoff-packet`
4. SEO → `seo-packet`
5. Draft → `etsy-draft-preview-packet`
6. Approval → `approval-packet` + `WorkspaceApproval`

## Verification run by Hermes

Passed:

```bash
pnpm vitest run src/lib/workspace-kernel
# 5 files / 20 tests passed

pnpm vitest run src/lib/war-room/living-v3
# 12 files / 66 tests passed

pnpm vitest run src/lib/war-room/body
# 11 files / 50 tests passed

pnpm build
# passed client + SSR with existing Vite warnings only
```

Static search over `src/lib/workspace-kernel` found no new `child_process`, `spawn`, `exec`, external `fetch`, `axios`, or `XMLHttpRequest` runtime call sites; only test assertions reference those strings.

## Browser smoke

Route:

```text
http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1
```

Steps:

1. Opened route.
2. Opened `Olympus Command → Mission Router`.
3. Clicked `Stage Etsy intake`.
4. Opened the `etsy-smart-product-intake-v1` kernel card.
5. Returned to Mission Router.
6. Inspected persistent telemetry DOM.

Verified telemetry:

```json
{
  "agent": "odin-scout",
  "motion": "basic_station_walk",
  "room": "etsy-market-lab",
  "station": "etsy-ravens-nest",
  "artifact": "product-candidate-packet",
  "safety": "local-only-locked",
  "extDelta": 0,
  "consoleErrors": 0
}
```

## Remaining limit

Kernel state is still UI/session-local. This is now the main blocker to real Workspace/War Room operations:

- refresh can lose run state;
- Hermes/controlled workers still need a typed event ingress path;
- motion/readback is not yet a durable event-driven control spine.

## Next batch

Next prompt:

```text
/Users/mac/hermes-workspace/docs/prompts/codex-next-kernel-control-spine-v2-durable-events-motion-2026-06-23.md
```

Recommended next phase:

```text
Kernel Control Spine V2 = Durable Kernel Store + Typed Event Ingress + Event-Driven Agent Motion
```

This is the right larger step because it solves the actual gap: UI/session-local demos must become durable local runs/events that Hermes/agents can report into safely.
