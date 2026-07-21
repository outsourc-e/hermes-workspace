# Council War Table Candidate — Technical QA / Manifest Handoff

Status: candidate/pass-qa/not-live. This is a technical handoff only; no public/war-room asset, React path, or live manifest was edited.

## Source package

- Asset id: `station_council_war_table`
- Registry id: `olympus-command.council-war-table.v001`
- Candidate PNG: `generated-candidates/war-room/olympus-command/station-props/v1/council-war-table/station_council_war_table.png`
- Metadata: `generated-candidates/war-room/olympus-command/station-props/v1/council-war-table/station_council_war_table.metadata.json`
- Proof sheet: `generated-candidates/war-room/olympus-command/station-props/v1/council-war-table/station_council_war_table_proof_dark_light.png`
- Alpha mask proof: `generated-candidates/war-room/olympus-command/station-props/v1/council-war-table/station_council_war_table_alpha_mask.png`
- Upstream tasks: `t_cdcda7e1`, `t_9eae259c`, registry handoff `t_9a6c9ae4`

## Actual image dimensions and alpha

Measured from the candidate file with Python/Pillow:

| Field | Value |
| --- | --- |
| Format/mode | PNG / RGBA |
| Native size | 1586 x 992 px |
| Alpha extrema | (0, 255) |
| Non-transparent pixels | 1,080,874 / 1,573,312 (68.7006%) |
| Fully opaque pixels | 1,080,811 / 1,573,312 (68.6965%) |
| Partial-alpha pixels | 63 / 1,573,312 (0.0040%) |
| Alpha content bounds | left=11, top=27, right=1576, bottom=946 |
| Content bounds size | 1565 x 919 px |
| Content center | x=50.03%, y=49.04% |

Transparent padding around alpha bounds:

| Side | Padding |
| --- | --- |
| Left | 11 px (0.69%) |
| Top | 27 px (2.72%) |
| Right | 10 px (0.63%) |
| Bottom | 46 px (4.64%) |

Bounds as normalized source-canvas percentages:

```json
{ "x": "0.69%", "y": "2.72%", "w": "98.68%", "h": "92.64%" }
```

## Visual/proof notes

The dark/light proof shows an isolated wide Olympus/Hellenistic command table: bronze/dark marble body, Greek-key rim, abstract campaign-map tabletop, and subtle cyan accents. It reads as one station prop, not a room scene, UI card, or modern dashboard surface.

Technical concern: horizontal transparent padding is very tight (about 10–11 px each side). This is acceptable for candidate proof, but before live integration it should be normalized with additional transparent safety margin so focus rings, hover glows, shadows, and operator overlap do not clip.

## Suggested station anchor and operator spot

- Visual center / focus anchor: tabletop center, approximately `x=50%`, `y=49%` in the source image.
- Suggested manifest anchor: `center` rather than bottom-center, because the asset is a top-down/shallow-overhead table with a clear tabletop center and symmetric footprint.
- Suggested click hotspot: center tabletop region, not the ornamental wing/corner protrusions.
- Suggested operator spot: bottom/front center of the table, approximately room-space `x=50`, `y=73`, facing north/up toward the table.
- Suggested z-index band: station/main prop range, around `zIndex: 380`; operator/character should render above it in the 600–799 character range unless deliberate occlusion is introduced.

## Proposed future manifest placement fields

Candidate-only draft fields for a future manifest/integration card. These are not live and were not written into any public manifest:

```json
{
  "id": "station-council-war-table",
  "name": "Council War Table",
  "kind": "station",
  "stationKind": "mission-intake-council-war-table",
  "asset": "/war-room/layered/olympus-command/stations/station_council_war_table.png",
  "status": "candidate/pass-qa/not-live",
  "bounds": { "x": 50, "y": 58, "w": 46, "h": 28 },
  "anchor": "center",
  "hotspot": { "x": 50, "y": 49, "w": 36, "h": 18 },
  "operatorSpot": { "x": 50, "y": 73, "facing": "north" },
  "zIndex": 380,
  "nativeSize": { "w": 1586, "h": 992 },
  "transparentContentBoundsPx": {
    "left": 11,
    "top": 27,
    "right": 1576,
    "bottom": 946,
    "w": 1565,
    "h": 919
  },
  "safety": {
    "externalMode": "mock/theoretical/read-only",
    "forbiddenLiveActions": [
      "etsy-publish",
      "etsy-edit",
      "supplier-message",
      "paid-shotlab-generation"
    ]
  }
}
```

Placement rationale: the table is a central council/mission station and should likely occupy a broad central footprint in Olympus Command, below/near the main command/council focus zone. The draft `bounds` intentionally leaves room for a front/bottom operator sprite and optional focus/selection glow.

## Normalization needed before live integration

1. Keep this candidate outside `public/war-room` until a future approved integration card.
2. Add transparent safety margin before live use, especially left/right. Recommended target: at least 5–8% padding on each side after normalization, or an explicit hover/focus-ring margin in the renderer.
3. If copied to a live asset path later, preserve RGBA alpha and re-run alpha bounds/extrema checks after any crop/scale/export.
4. Do not upscale blindly as a “4K” asset; this station can be placed/scaled as a modular prop, but release QA should verify it remains crisp at the actual in-room display size.
5. Keep labels, status text, Kanban/JARVIS copy, and any cockpit UI as separate HTML or frame layers; do not bake text into this station image.
6. If a glow/focus ring is needed, create it as a separate overlay asset or CSS effect clipped outside the prop bounds; do not modify the table art destructively.

## Safety statement

Etsy/shops not connected; only mock/theoretical UI allowed. No Etsy/shop/supplier/AliExpress/Alibaba/ShotLab paid/live connection or write was performed. No public app path, React component, live manifest, or `public/war-room` asset was changed. Candidate-b was not promoted.

## Verification run

- `test -f docs/status/technical-art/council-war-table-candidate-technical-handoff.md && grep -q station_council_war_table docs/status/technical-art/council-war-table-candidate-technical-handoff.md && grep -q not-live docs/status/technical-art/council-war-table-candidate-technical-handoff.md`
- Python/Pillow image inspection of `station_council_war_table.png` returned RGBA 1586 x 992, alpha extrema `(0, 255)`, content bounds `(11, 27, 1576, 946)`.
