# War Room Horizontal Mini-Rooms 50f — ChatGPT/Codex Asset Prompt Pack

Created: 2026-06-17
Task: `t_a03526a1`
Status: prompt pack for candidate assets only. Do not claim generated output is final until QA passes.

## Global negative prompt / ban list

No baked readable text, no dashboard cards as rooms, no abstract connected-atlas lines, no square-first rooms, no UI buttons for live actions, no Etsy/store/supplier/customer/account/purchase/refund/send/publish success cues, no checker/card backgrounds, no CSS-looking circles/halos/tokens, no one giant fantasy map.

## Room shell prompt template

Create an isolated modular pixel-art Hermes/Olympus War Room room shell asset for `{room_id}`. Horizontal rectangular miniature room, thick marble/stone walls, bronze/gold trim, tiled floor, dark obsidian/navy outside edge, doorway sockets matching the manifest, one blank plaque with absolutely no text. It must be a small version of itself for the all-rooms main screen, with empty space reserved for tiny agent and station props. Style must match the approved modular pixel room references, not a dashboard card and not a giant fantasy map.

## Road/bridge kit prompt

Create an isolated modular pixel-art paved corridor/bridge kit for a Hermes/Olympus War Room: horizontal road, vertical road, four corners, four T-junctions, cross-junction, short room-to-road bridge, long bridge span, doorway threshold, manual approval gate overlay, blocked gate overlay, cyan/gold route-glow overlay. Physical stone/bronze road pieces that can snap to rooms. Transparent or clean isolated background. No abstract SVG line look. No text.

## Agent 96-frame prompt template

Create a transparent pixel-art 96-frame sprite sheet for `{agent_id}` in room `{room_id}`. Frame size 48x48, 8 columns x 12 rows. Row order: idle, walk-north, walk-south, walk-east, walk-west, carry-packet-north, carry-packet-south, carry-packet-east, carry-packet-west, work-at-station, talk-status, rest-or-blocked. Character identity: `{identity}`. Packet: `{packet}`. Work animation: `{work}`. Slow real movement, readable at tiny room scale, same costume/style across all states, first frame of every state usable as reduced-motion still. Transparent background. No text, no card UI, no live external action.

## Per-agent prompt variables

- `agent-athena-opportunity` / `agora-opportunity`: identity=`Athena strategist with ledger, lens, small market basket`; packet=`opportunity scroll`; work=`compares product tokens on score scale, read-only shortlist`.
- `agent-oracle-signal-analyst` / `oracle-signals`: identity=`purple/blue oracle analyst with crystal lens and star cloak`; packet=`signal orb`; work=`reads crystal pool/keyword constellation`.
- `agent-hephaestus-forge-operator` / `hephaestus-forge`: identity=`forge smith with hammer/apron/ember rim`; packet=`draft artifact crate`; work=`strikes anvil, adjusts draft rack, furnace spark loop`.
- `agent-harbor-scout` / `merchant-harbor`: identity=`dock inspector with spyglass and cargo tag sash`; packet=`supplier proof crate`; work=`inspects crate/table and applies risk tag, no order/message cue`.
- `agent-gateway-messenger` / `gateway-discord-cockpit`: identity=`messenger captain with relay baton and guarded satchel`; packet=`internal dispatch packet`; work=`works relay beacon/draft scroll station without sending externally`.
- `agent-atlantis-archivist` / `atlantis-vault`: identity=`teal/blue scribe with shell stylus and tablet`; packet=`archive tablet/evidence folder`; work=`shelves tablet and opens provenance ledger`.
- `agent-hermes-conductor` / `olympus-command`: identity=`Hermes courier-general with gold/cyan sash, wing cues, caduceus pointer`; packet=`sealed mission scroll`; work=`stamps/points at command table and route map`.
- `agent-treasury-guard` / `treasury-approval`: identity=`approval warden with shield/key/locked coin seal`; packet=`commerce lock packet`; work=`guards approval shrine and inspects locked ledger`.
- `agent-roman-producer` / `roman-dev-studio`: identity=`Roman engineer-producer with red cloak and blueprint shield`; packet=`implementation packet/blueprint`; work=`uses build bench and QA shield rack`.
- `agent-rest-steward` / `rest-room-agent-lounge`: identity=`lounge steward/off-duty helper with cup/blanket`; packet=`rest token`; work=`lounge upkeep and true rest/recharge poses`.

## Station prompt template

Create a transparent pixel-art station/effect sheet for `{station_id}` in `{room_id}`. 5 rows x 8 frames: idle, active-work, packet-received, output-ready, blocked-manual-approval. The station must look like a real in-world prop/tool in a Hermes/Olympus miniature room, not a SaaS widget. State effects should be subtle: glow, locks, seals, physical packet docking, sparks/water/crystal/bronze effects as appropriate. No text. No live action success cues.

## Contact sheet requirement

For every generated sheet, create a proof contact sheet with source prompt path, asset path, dimensions, alpha verdict, frame boundaries, row labels outside the asset image only, rejected-candidate notes, and visual QA verdict. Never wire a candidate live before this proof exists.
