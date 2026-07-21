# Forge of Hephaestus — Room Project Packet

> Room factory output for War Room v1 connected cells.
> Source contracts:
> - `docs/status/automation/2026-06-16-war-room-10h-event-driven-run-contract.md`
> - `docs/status/automation/2026-06-16-war-room-10h-room-factory-addendum.md`

## Identity

- **roomId:** `forge-of-hephaestus`
- **label:** Forge of Hephaestus
- **myth:** Hephaestus turns ideas into drafts
- **agent:** Hephaestus (draft maker)
- **tone:** orange

## Safety spine (absolute)

- External actions: **disabled**
- Live Etsy: **disabled**
- Paid generation: **disabled**
- Etsy/ShotLab connectors: **NOT_CONNECTED**
- No listing publish, edit, renewal, refund, or paid generation.
- All production is draft-only / dry-run readiness state.

## Stations

| stationId | label | role | risk | action label |
|---|---|---|---|---|
| `prompt-anvil` | Prompt anvil | Shape draft prompts from safe briefs | Draft-only until approval | forge a local draft packet |
| `staging-shelf` | Staging shelf | Hold staged assets before generation | Local assets only | stage local assets |
| `image-readiness-table` | Image readiness table | Check image readiness without generation | Readiness state only; no paid generation | check image readiness locally |
| `listing-preview-dock` | Listing preview dock | Render local listing preview drafts | No Etsy/listing write connected | preview local listing draft |
| `artifact-output-crate` | Artifact output crate | Package local draft artifacts | Local draft artifacts only | package local artifact bundle |
| `forge-approval-shrine` | Forge approval shrine | Gate every live production action | Blocks every live external action | hold production action for DLV approval |

## Agents

| id | displayName | role | home station | state |
|---|---|---|---|---|
| `hephaestus-artisan` | Hephaestus | asset-creator | prompt-anvil | working |
| `forge-qa-captain` | Forge QA Captain | qa-agent | image-readiness-table | working |
| `listing-preview-scribe` | Listing Preview Scribe | technical-artist | listing-preview-dock | working |

## Draft-production stages

| stage | meaning |
|---|---|
| `prompt` | Prompt draft exists |
| `staging` | Assets staged |
| `image-readiness` | Readiness report ready |
| `listing-preview` | Local listing preview drafted |
| `artifact-output` | Local artifact bundle ready |
| `approval-queued` | Packet queued at approval seal |

## ShotLab readiness states

| state | meaning |
|---|---|
| `not-ready` | No prompt or assets |
| `prompt-ready` | Prompt drafted |
| `assets-staged` | Prompt + assets staged |
| `shotlab-dry-run-ready` | Ready for dry-run display only |
| `dlv-approval-required` | Needs DLV approval to proceed |

## Packet kinds

- `draft-artifact-packet` — carries prompt + staged assets
- `listing-preview-packet` — carries local listing preview draft
- `approval-request-packet` — queued at approval seal

## Workflow: Harbor → Forge → Approval

1. A `forge-handoff-packet` arrives from Merchant Harbor.
2. Hephaestus forges a `draft-artifact-packet` at the prompt anvil.
3. Assets move to the staging shelf; QA checks image readiness.
4. Listing Preview Scribe drafts a local listing preview (no publish).
5. The artifact output crate bundles the local draft.
6. Packet advances to `approval-queued` and routes to `approval-seal` as `approval-request-packet`.

## Local code module

- `src/screens/war-room/v1/room-projects/forge-of-hephaestus/forge-project.ts`

## Assets

- Room shell: `public/war-room/v42-connected-ops/rooms/room-hephaestus-forge-shell.svg`
- Draft artifact packet: `public/war-room/v42-connected-ops/packets/draft-artifact-packet.sheet.svg`
- Forge artisan agent sheet: `public/war-room/v42-connected-ops/agents/agent-forge-artisan.sheet.svg`
- Station glyph: `public/war-room/v42-connected-ops/forge-of-hephaestus/prompt-anvil-station.svg`

## Connector registry mapping

- Uses connectors:
  - `etsy-shop-draft-connector` (lockState: `NOT_CONNECTED`, executionMode: `disabled`)
  - `shotlab-draft-connector` (lockState: `NOT_CONNECTED`, executionMode: `disabled`)
- Capabilities: `listing-draft`, `shop-catalog`, `creative-draft` — all local draft visibility only.

## Status

- **Phase:** local draft / readiness state
- **Quality claim:** candidate-proof / prompt pack; not final premium art
- **Next blocker:** DLV approval required before paid generation, ShotLab run, or listing publish
