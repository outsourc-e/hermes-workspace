# Obsidian Context Packet V1 + Hermes Intent/Event Bridge V4

Date: 2026-06-26
Repo: `/Users/mac/hermes-workspace`

## Summary

Implemented the local-only Obsidian Context Packet V1 path:

- allowlisted read-only Obsidian markdown notes
- compact `obsidian-context-packet-v1`
- real persisted Kernel Store V2 `artifact.created` event
- compact Command Room readback
- Hermes Intent/Event Bridge marker `v4`

No Obsidian writeback, live marketplace action, external connector, worker spawn, or browser/runtime automation was added.

## Files changed

- `src/lib/workspace-kernel/contracts.ts`
- `src/lib/workspace-kernel/index.ts`
- `src/lib/workspace-kernel/context-packet.ts`
- `src/lib/workspace-kernel/context-packet.test.ts`
- `src/lib/workspace-kernel/obsidian-context.ts`
- `src/lib/workspace-kernel/obsidian-context.test.ts`
- `src/lib/workspace-kernel/adapters/obsidian-context-ingress.ts`
- `src/lib/workspace-kernel/adapters/obsidian-context-ingress.test.ts`
- `src/routes/api/war-room/obsidian-context/packet.ts`
- `src/routes/api/war-room/obsidian-context/-packet.test.ts`
- `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`
- `src/screens/war-room/living-v3/LivingWarRoomV3.etsy-live-markers.test.ts`
- `src/screens/war-room/living-v3/living-war-room-v3.css`
- `docs/status/obsidian-context-hermes-intents-events-v1-2026-06-26.md`

## Tests and build

```text
pnpm vitest run src/lib/workspace-kernel --reporter=basic
PASS: 13 files / 40 tests
```

```text
pnpm vitest run src/routes/api/war-room/workspace-kernel src/routes/api/war-room/obsidian-context --reporter=basic
PASS: 3 files / 13 tests
```

```text
pnpm vitest run src/screens/war-room/living-v3/EtsyProductPrepWorkbench.test.tsx src/screens/war-room/living-v3/LivingWarRoomV3.etsy-live-markers.test.ts src/screens/war-room/living-v3/LivingWarRoomV3.etsy-primary-workspace-all-stations.test.tsx --reporter=basic
PASS: 3 files / 10 tests
```

```text
pnpm build
PASS
```

Notes: Vitest printed the existing deprecated `basic` reporter notice. The build printed existing Vite dynamic-import/chunk warnings.

## Browser QA

Route:

```text
http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1
```

Viewport: `1280x768`.

Initial route markers:

- `data-product-prep-workbench="v1"`: true
- `data-workbench-mode="practical"`: true
- `data-live-actions-locked="true"`: true
- `data-debug-proof-collapsed="true"`: true
- document width/window width: `1280/1280`
- visible kernel telemetry strip: false
- visible event readback: false
- Etsy drawer in DOM: false
- visible system footer/sidebar: false

After clicking `Mission Router` then `Attach Obsidian Context Packet locally`:

- `data-obsidian-context-packet="v1"`
- `data-obsidian-context-source-count="7"`
- `data-obsidian-context-local-only="true"`
- `data-hermes-intent-event-bridge="v4"`
- context details collapsed: true
- event count: `269 -> 272`
- `data-workspace-kernel-last-artifact="obsidian-context-packet"`
- `data-workspace-kernel-last-agent="odin-scout"`
- `data-workspace-kernel-last-room="etsy-market-lab"`
- `data-workspace-kernel-last-station="etsy-ravens-nest"`
- `data-workspace-kernel-safety="local-only-locked"`
- frozen flags visible in manager: true

After refresh and reopening `Mission Router`:

- `data-obsidian-context-packet="v1"`
- source count: `7`
- `data-workspace-kernel-last-artifact="obsidian-context-packet"`
- event count persisted at `272`

Browser network/console:

- console errors: `0`
- external requests: `0`
- War Room/Obsidian/marketplace failed requests: `0`
- observed same-origin shell abort: `POST /api/terminal-stream net::ERR_ABORTED`

The terminal-stream abort is from the surrounding desktop terminal shell stream, not the Obsidian packet route, marketplace, or War Room runtime action.

## Safety scan

Focused scan over touched files:

```text
child_process
spawn(
exec(
execFile(
api.etsy
etsy.com
googleapis
```

Result: no matches.

Broader prompted scan terms had expected static/test-only matches:

- `ShotLab` and `Discord send` in locked-action text
- `.raw/` in the path traversal test
- existing Living V3 static/demo copy for local Alura, AliExpress, sample `https://...`, and ShotLab labels

No new runtime live connectors, new process spawning, external marketplace/account calls, Obsidian writeback, arbitrary local file reads, or uncontrolled workers were added.

## Limitations

- The Workspace app can only read the hardcoded Obsidian allowlist.
- Missing allowlisted notes become `status:"missing"`; blocked paths fail closed.
- This does not implement Obsidian writeback, live Etsy research, Etsy draft upload, paid generation, supplier messaging, or live worker execution.
