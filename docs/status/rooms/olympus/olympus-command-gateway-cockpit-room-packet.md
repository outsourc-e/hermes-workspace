# Olympus Command + Gateway/Discord cockpit room packet

Status: room-specific project packet only — not integrated, not final/premium quality.
Task: `t_6bb8fef0`
Workspace boundary: `/Users/mac/hermes-workspace`

## Purpose

Olympus Command is the War Room conductor cell. It receives room-factory outputs, routes the next responsible lane, keeps review/approval locks visible, and hosts a Gateway/Discord cockpit that is strictly read-only/status/draft-only.

The room must feel like a command dais inside the connected cell atlas, not a generic dashboard. Raw logs, full task ids, connector details, and draft text stay hidden behind room popup/inspector affordances.

## Hard safety for this room

- Gateway controls are read-only status evidence only.
- Discord controls are draft-only/local-only; no send, react, mention, moderation, or API side effect.
- No credentials are loaded or displayed.
- No Kanban mutation from the UI.
- No Etsy/shop/supplier/customer/account/paid-generation actions.
- No final/premium art claim; all placeholders remain prototype/candidate until QA/review.

## Stations and tools

| Station | Purpose | Visible tools | Allowed packets | Forbidden controls |
| --- | --- | --- | --- | --- |
| Mission routing dais | Route local room packets and choose next responsible lane | room queue map, route seal selector, review stamp | mission-routing, room-integration-handoff, approval-lock | auto-dispatch, git actions, external sends |
| Review lock table | Keep QA/no-overclaim/DLV locks physically visible | visual QA lens, safety seal, artifact proof tray | qa-review-request, safety-review-request, approval-lock | approve final quality, bypass review |
| Gateway status console | Show Gateway/API/Discord bridge health as read-only evidence | heartbeat lamps, channel status lamps, error quarantine tray | gateway-status-read, approval-lock | restart gateway, edit config, load creds, send messages |
| Discord draft telegraph | Prepare future human-triggered command/message drafts without sending | draft composer plaque, human send keyhole, disabled outbound wire | discord-draft-command, approval-lock | send, schedule, mention, react, moderate, call Discord API |

## Visible agents

| Agent | Lane | Home station | Visible state | Safety locks |
| --- | --- | --- | --- | --- |
| Olympus Conductor | conductor | mission-routing-dais | routing | cannot send Discord; cannot mutate Kanban from UI |
| Safety Marshal | architecture/safety review | review-lock-table | reviewing | externalMutationAllowed=false |
| Gateway Watch Runner | gateway-watch | gateway-status-console | watching | read-only evidence only; credentialsLoaded=false |
| Discord Draft Scribe | dispatch-draft | discord-draft-telegraph | drafting | draft-only; human action required for any future send |

## Workflow packets in

1. `packet-room-output-review`
   - Source: worker room such as Forge/Agora/Oracle/Merchant Harbor.
   - Target: Olympus review lock table.
   - Carries: room-specific docs, manifests, assets, QA evidence.
   - Lock: review required; prototype/non-final until QA and no-overclaim review.

2. `packet-gateway-health-read`
   - Source: Gateway/Dispatch status surface.
   - Target: Gateway status console.
   - Carries: read-only heartbeat/degraded/error evidence.
   - Lock: no action path enabled; display only.

## Workflow packets out

1. `packet-route-room-qa`
   - Source: Olympus mission routing dais.
   - Target: QA/archive/review lane.
   - Carries: local room packet and proof links.
   - Lock: browser/build/visual proof required before shared hot-file integration.

2. `packet-discord-draft-only`
   - Source: Discord draft telegraph.
   - Target: future Gateway/Dispatch review lane.
   - Carries: local draft copy only.
   - Lock: Discord side effects are forbidden in this run; future explicit DLV approval required.

## Gateway/Discord cockpit contract

Allowed in this room:

- Show Gateway/API/Discord health as `READ_ONLY_READY`, `NOT_CONNECTED`, `DRAFT_ONLY`, or `BLOCKED_FOR_DLV_APPROVAL`.
- Compose local draft text for a future explicit human action.
- Validate draft copy locally and show why it is locked.
- Show disabled outbound wire/keyhole visual so the user sees there is no send path.

Forbidden in this room:

- Sending Discord messages or reactions.
- Mentioning users, moderating, editing channels, or making Discord API calls.
- Restarting Gateway, editing config, loading credentials, or mutating connected services.
- Auto-approving drafts or scheduling sends.

## Local module and manifest

- TypeScript room packet: `src/screens/war-room/v1/room-projects/olympus/olympus-room-project.ts`
- Runtime candidate manifest: `public/war-room/v42-connected-ops/olympus/manifest.json`
- This documentation packet: `docs/status/rooms/olympus/olympus-command-gateway-cockpit-room-packet.md`

These are room-specific outputs only. A later integration card may import the module into shared War Room state and UI after QA/review.

## Assets needed and temporary placeholders

Existing candidate placeholder:

- `public/war-room/v42-connected-ops/rooms/room-olympus-command-shell.svg` — room shell placeholder, not final/premium art.

Needed separate assets:

1. `olympus-gateway-console-prop` — read-only console with heartbeat/status lamps and no-send lock.
2. `olympus-discord-draft-telegraph-prop` — draft-only telegraph with disabled outbound wire and human-action keyhole seal.
3. `olympus-conductor-token` — routing/reviewing/drafting/approval-locked poses.
4. `gateway-readonly-packet` — status evidence packet, reduced-motion static marker required.
5. `discord-draft-seal-packet` — draft packet that stops at approval lock; no outbound animation.

All text/status labels must be live overlays, not baked into images. No credentials, raw tokens, channel ids, or Discord message copy should appear in assets.

## Integration notes for later card

- Do not edit shared hot files until an integration card owns the merge.
- Import `OLYMPUS_ROOM_PROJECT` and map stations/agents/packets into the room graph/control spine.
- Keep popup copy short: room name, one action line, output label/status, lock label.
- Main atlas should show only a command cell, route sockets, one conductor/runner, and lock/status lights.
- Reduced-motion mode should keep packet source/target/socket evidence while disabling route travel.

## Acceptance checks for later QA

- `/war-room?v1=1` still loads without console errors.
- Olympus popup shows mission routing, review lock, Gateway status, and Discord draft stations.
- Gateway status controls are read-only and do not expose restart/config/credential mutation.
- Discord draft controls are disabled/draft-only; no send path exists.
- No final/premium art claim appears.
