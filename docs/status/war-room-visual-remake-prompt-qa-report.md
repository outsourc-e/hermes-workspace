# War Room Visual Remake — Olympus Command Prompt QA Report

Task: `t_a1beef2e`
Role: Prompt QA
Reviewed prompt pack: `/Users/mac/hermes-workspace/docs/status/war-room-visual-remake-olympus-command-prompt-pack.md`
Reviewed checklist: `/Users/mac/hermes-workspace/docs/status/war-room-visual-remake-qa-checklist.md`
Required docs read:
- `/Users/mac/hermes-workspace/docs/war-room-visual-studio-operating-system.md`
- `/Users/mac/hermes-workspace/docs/war-room-visual-remake-production-line.md`
- `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`

## Result

FAIL — minor pre-generation prompt fix required.

The prompt pack is strong and mostly aligned with the studio OS: it is modular, semantic-layer based, safety-scoped, text-free, deterministic, and correctly tells the Asset Creator to generate only `floor_base.png` first. However, it misses one required prompt-review gate from the QA checklist: explicit reference-image handling. The checklist requires prompts to say references are style/quality only and not copy targets. The prompt pack does not currently include that rule.

Because this is a prompt-pack QA gate before ChatGPT generation, the fix should be applied before the Asset Creator starts, especially if any reference image will be uploaded.

## May ChatGPT generation start with floor_base only?

Not yet as written.

Generation may start with `floor_base.png` only after applying the exact prompt fixes below, or if the Asset Creator explicitly uses no uploaded reference images and records that decision. Best recommendation: patch the prompt pack first, then allow exactly one controlled `floor_base.png` candidate only.

No station, prop, frame, overlay, plaque, character, or later asset generation should start until the floor-base candidate passes visual QA.

## Gate results

| Gate | Result | Notes |
|---|---:|---|
| Separate semantic layers | PASS | The pack defines `floor_base.png`, separate `station_*`, `prop_*`, `overlay_*`, `frame_*`, and `plaque_*` assets. |
| No one-giant-PNG final room | PASS | Global lock and universal rejection checklist forbid one giant completed room PNG. |
| Floor base first | PASS | Controlled generation order explicitly says Prompt 01 only first, stop for visual QA, then continue. |
| Empty floor/walls base | PASS with small tightening | Prompt 01 correctly bans tables, stations, props, characters, UI, central sigil, clutter, and blocked placement. Tighten statue/decor wording below. |
| No baked UI/text/gibberish | PASS | Strong global and per-prompt bans on text, labels, fake buttons, screenshots, pseudo-text, and dashboards. |
| Transparent props/stations/frames/overlays | PASS | Later assets explicitly require transparent background. `floor_base.png` is correctly not transparent-only because it is the room base. |
| Premium War Room style | PASS | Premium mythic Greek + futuristic JARVIS / obsidian / antique gold / cyan Hermes direction matches the studio OS and production line. |
| Safety boundary | PASS | Explicitly forbids Etsy/shop/supplier/ShotLab paid/live/write actions and requires mock/theoretical/read-only concepts only. |
| Concrete output paths and next partner needs | PASS | Candidate folder and deterministic filenames are concrete; next handoff says Asset Creator should use only Prompt 01 first. |
| Reference image style-only / no-copy rule | FAIL | Missing explicit rule required by the QA checklist. |
| 4K-ready floor-base requirement | FAIL / tighten before generation | Prompt 01 says 16:9 PNG, but does not explicitly request 4K-ready / highest available 16:9. Add this to reduce low-res floor-base risk. |

## Exact prompt fixes required before generation

### Fix 1 — Add a global reference-image rule after line 16

Add this paragraph under `## Global production lock`, after the style bible paragraph:

```text
Reference-image rule: if any reference image is uploaded during ChatGPT generation, use it only as art-quality, material, lighting, camera, and polish direction. Do not copy exact artwork, labels, UI layout, symbols, character poses, proprietary marks, or room composition from the reference. If no reference image is used, record `references: none` in the asset creator handoff.
```

### Fix 2 — Add the reference rule inside Prompt 01 before the content request

In Prompt 01, insert immediately after line 43 / before `Create exactly one...`:

```text
If a reference image is attached, use it only as art-quality and polish direction. Do not copy exact artwork, labels, symbols, UI layout, room layout, proprietary marks, or character poses.
```

This keeps the first floor-base generation safe even when the Asset Creator uploads an approved War Room style reference.

### Fix 3 — Make Prompt 01 explicitly 4K-ready

Replace Prompt 01 composition line:

```text
- 16:9 landscape PNG.
```

with:

```text
- 4K-ready 16:9 landscape PNG, ideally 3840×2160 or the highest available 16:9 output from ChatGPT; keep details readable after downscaling into the app.
```

This aligns the floor-base prompt with the premium asset pipeline expectation for room backgrounds.

### Fix 4 — Tighten the empty-base ban on statues/decorative objects

Replace Prompt 01 strict content line:

```text
- No gods, humans, Hermes character, workers, silhouettes, statues as active props, or avatars.
```

with:

```text
- No gods, humans, Hermes character, workers, silhouettes, statues, busts, decorative figures, avatars, or character-like shapes.
```

Reason: `statues as active props` leaves room for passive statues baked into the floor base. For movement-first floor art, even decorative figures should be separate future layers.

## Non-blocking notes for later prompts

1. Prompt 02 and later prompts are not approved for generation yet; they are only structurally acceptable after `floor_base.png` passes visual QA.
2. Optional overlay prompts correctly say “optional separate follow-up only”; Asset Creator should not bundle them with station prompts.
3. Prompt 07 plaques are appropriate because they are text-free surfaces for real HTML overlay.
4. Prompt 08 `floor_lane_markings.png` should remain optional and low-contrast. If generated later, Visual QA must reject it if it makes the floor feel cluttered or blocks walkable space.

## Final decision

- Overall prompt-pack QA: FAIL until the four fixes above are applied.
- Generation permission: do not start yet as written.
- After fixes: generation may start with exactly one controlled `floor_base.png` candidate under `/Users/mac/hermes-workspace/generated-candidates/war-room/olympus-command/v1/candidate-a/floor_base.png`.
- Scope lock remains active: no image generation by this QA task, no app-code edits, no Etsy/shop/supplier/ShotLab paid/live/write connections or actions.
