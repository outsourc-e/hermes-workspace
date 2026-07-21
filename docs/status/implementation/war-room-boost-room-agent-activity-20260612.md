# War Room BOOST room-agent activity implementation

Status: implementation ready for gates / visual QA
Owner lane: codexintegrator
Date: 2026-06-12

## Scope

Implemented the bounded BOOST room-agent activity layer inside the allowed War Room v1 files only. This pass does not connect external systems, does not load credentials, does not call live APIs, does not add marketplace/shop/account actions, and does not change public assets or deployment/release surfaces.

## Changed files

- `src/screens/war-room/v1/WarRoomV1.tsx`
- `src/screens/war-room/v1/WarRoomV1RoomAgentLayer.tsx`
- `src/screens/war-room/v1/WarRoomV1FullRoomView.tsx`
- `src/screens/war-room/v1/war-room-v1-types.ts`
- `src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx`
- `scripts/war-room-v1-regression-gate.mjs`
- `docs/status/implementation/war-room-boost-room-agent-activity-20260612.md`

## Hooks added / preserved

Room grid and cell hooks remain room-grid-first and equal/symmetric. Static letter badges were replaced by a typed room-agent layer with:

- `data-war-room-v1-room-agent-layer`
- `data-war-room-v1-room-agent-count`
- `data-war-room-v1-room-agent-unit`
- `data-war-room-v1-room-agent-task-id`
- `data-war-room-v1-room-agent-activity-state`
- `data-war-room-v1-room-agent-station`
- `data-war-room-v1-room-agent-progress`
- `data-war-room-v1-room-agent-read-only="true"`
- `data-war-room-v1-room-agent-external-connected="false"`
- room-agent connector lock / dry-run / no external mutation hooks

Opened room view now exposes compact work context with:

- `data-war-room-v1-full-room-active-unit`
- `data-war-room-v1-full-room-active-station`
- `data-war-room-v1-full-room-chat-affordance`
- `data-war-room-v1-full-room-chat-enabled="false"`
- `data-war-room-v1-full-room-tools-mode="read-only"`
- approval/log count hooks
- connector lock and live-enabled=false hooks
- working station active unit/task/execution-mode/live-enabled=false hooks

Raw proof stays in the closed inspector with hidden-inspector hooks and no-mutation evidence.

## Behavior notes

- Room-agent activity is deterministic from existing read-only task/Kanban-derived mission visuals.
- Fixture/fallback/degraded/stale feed states map to degraded activity; no fake live animation is claimed.
- Approval-required items map to approval-locked; blocked/review-required/QA items map to needs-review.
- Full-room chat is a disabled local placeholder only.
- Connector state remains NOT_CONNECTED / dry-run-or-disabled / no credentials / no live API calls / no external mutation.

## Remaining limitations

This is a compact local UI layer, not a live agent executor. Visual QA should still verify the unit layer is readable at actual browser sizes and that the full-room view does not crowd into a proof/debug wall.

## Safety line

Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only local disabled/dry-run/read-only infrastructure is allowed until DLV explicitly approves live enablement. No git push/merge/release/reset/clean/destructive cleanup.
