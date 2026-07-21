# Agora of Opportunity — Room Project Spec

**Room ID:** `agora-opportunity`
**Status:** room-project-packet / local scaffolding
**Owner agent:** Athena
**Safety mode:** read-only / dry-run / draft-only only
**Opportunity scoring:** temporary until stable scoring service is approved

## Purpose

The Agora turns raw product ideas, Alura/Etsy research, and Oracle signals into reviewable opportunities. It never performs live marketplace actions.

## Stations

| Station ID | Name | Kind | Accepts |
|---|---|---|---|
| `agora-intake` | Opportunity Intake | intake | task, research-request |
| `agora-planning` | Market Sorting Table | planning | task, asset-request |

## Data contract

- `AgoraOpportunity` — a product candidate with temporary opportunity score.
- `AgoraOpportunityStatus` — intake → scoring → research/awaiting-proof → ready-for-review → approved-to-forge → archived.
- `scoreAgoraOpportunity()` — temporary heuristic; weights are explicit and replaceable.
- `createAgoraOpportunity()` / `updateAgoraOpportunityFromIntelligence()` — factory helpers.
- `buildAgoraOpportunityQueue()` — read-only queue grouped by status and priority.

## Agents

| Agent ID | Display name | Role | Home station | Profile |
|---|---|---|---|---|
| `agent-athena` | Athena | opportunity-strategist | agora-planning | chatgptheavy |
| `agent-agora-scout-1` | Agora Scout | market-scout | agora-intake | workerkimi |
| `agent-supplier-proof-runner-1` | Supplier Proof Runner | supplier-proof-runner | agora-intake | workerkimi |

## Read-only connector

- `product-intelligence-connector` via `GET /api/product-intelligence`
- Mode: `read-only`
- Purpose: seed opportunities and enrich supplier/keyword evidence

## Outputs

- `src/screens/war-room/v1/room-projects/agora/`
- `public/war-room/v42-connected-ops/agora/manifest.json`
- Consumed by integration cards later; does not edit shared hot files.

## Safety locks

- `externalActionsEnabled: false`
- `liveEtsyEnabled: false`
- `liveSupplierEnabled: false`
- All handoffs to Forge / Merchant Harbor carry review locks.
