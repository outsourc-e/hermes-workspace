# Treasury Approval / Money Locks room packet — 2026-06-16

Status: local room-project packet only; not integrated into shared hot UI files.

## Purpose

Treasury owns approval queue visibility, money locks, and action drafts that may later be reviewed by DLV. It must never execute or imply approval for Etsy/shop/supplier/account/order/refund/message/purchase/publish/paid-generation actions.

## Local artifacts

- Data module: `src/screens/war-room/v1/room-projects/treasury/treasury-room-project.ts`
- Public packet manifest: `public/war-room/v42-connected-ops/treasury/project-packets.json`
- Source shell asset already available: `public/war-room/v42-connected-ops/rooms/room-treasury-commerce-shell.svg`
- Existing character assets already available under `public/war-room/treasury-dwarf-360-v2/processed/`

## Packets

1. `treasury-packet-approval-queue-v1` — local approval queue packet; DLV approval required for any live/external action.
2. `treasury-packet-money-locks-v1` — blocks paid-generation, purchases, refunds, messages, account changes, and shop mutations.
3. `treasury-packet-action-draft-v1` — moves local action draft evidence to the command table as a sealed packet only.

## Evidence checklist

- DLV approval intent must be explicit before any future live action.
- Cost/account/paid/shop-write risk must be enumerated.
- Connector state must show no credentials, no live API calls, and `liveEnabled=false`.
- Approved/rejected packets should create Atlantis archive records as local source truth only.

## Agent motion

- `treasury-agent-lock-warden` reviews approval and money-lock packets at the approval seal.
- `treasury-agent-approval-runner` carries local draft packets toward the command table.

## Safety statement

All packet and action records are local-only. `externalActionsEnabled=false`, `liveEtsyEnabled=false`, `paidGenerationEnabled=false`, `credentialsLoaded=false`, `liveApiCallsEnabled=false`, and all mutation flags remain false.
