# Merchant Harbor — Room Project Packet

> Room factory output for War Room v1 connected cells.
> Source contracts:
> - `docs/status/automation/2026-06-16-war-room-10h-event-driven-run-contract.md`
> - `docs/status/automation/2026-06-16-war-room-10h-room-factory-addendum.md`

## Identity

- **roomId:** `merchant-harbor`
- **label:** Merchant Harbor
- **myth:** Odysseus prepares supplier routes
- **agent:** Odysseus (harbor scout)
- **tone:** blue

## Safety spine (absolute)

- External actions: **disabled**
- Live Etsy: **disabled**
- Paid generation: **disabled**
- Supplier connectors: **NOT_CONNECTED**
- No supplier messages, purchases, account actions, or live marketplace queries.
- All supplier proof states are read-only / unverified / verified-local-evidence only.

## Stations

| stationId | label | role | risk | action label |
|---|---|---|---|---|
| `supplier-proof-desk` | Supplier proof desk | Collect read-only supplier evidence | Read-only research only | stage supplier proof locally |
| `harbor-archive-shelf` | Harbor archive shelf | Store local evidence bundles | Local read-only memory | bundle local evidence |
| `harbor-approval-shrine` | Harbor approval shrine | Gate every live supplier action | Blocks every live external action | hold supplier action for DLV approval |

## Agents

| id | displayName | role | home station | state |
|---|---|---|---|---|
| `odysseus-scout` | Odysseus | advisor | supplier-proof-desk | working |
| `harbor-reviewer` | Harbor Reviewer | reviewer | harbor-approval-shrine | needs-review |

## Packet kinds

- `supplier-proof-packet` — carries read-only supplier evidence
- `supplier-rejection-packet` — returned when proof is insufficient
- `forge-handoff-packet` — promoted to Forge when verified-local-evidence

## Workflow: Harbor → Forge → Approval

1. Odysseus scouts a supplier and stages a `supplier-proof-packet` at the proof desk.
2. Harbor Reviewer inspects evidence and marks state as one of:
   - `unverified`
   - `read-only-unverified`
   - `verified-local-evidence`
   - `rejected-local-evidence`
3. Only `verified-local-evidence` packets may be promoted to `forge-handoff-packet` and routed to `forge-of-hephaestus`.
4. Unverified packets become `supplier-rejection-packet` and route to `approval-seal` for DLV review.

## Local code module

- `src/screens/war-room/v1/room-projects/merchant-harbor/merchant-harbor-project.ts`

## Assets

- Room shell: `public/war-room/v42-connected-ops/rooms/room-merchant-harbor-shell.svg`
- Supplier proof packet: `public/war-room/v42-connected-ops/packets/supplier-proof-packet.sheet.svg`
- Station glyph: `public/war-room/v42-connected-ops/merchant-harbor/supplier-proof-station.svg`

## Connector registry mapping

- Uses connector `supplier-research-draft-connector` (lockState: `NOT_CONNECTED`, executionMode: `disabled`).
- Capability: `supplier-evidence-draft` — local supplier evidence draft only.

## Status

- **Phase:** local draft / readiness state
- **Quality claim:** candidate-proof / prompt pack; not final premium art
- **Next blocker:** DLV approval required before any live supplier action
