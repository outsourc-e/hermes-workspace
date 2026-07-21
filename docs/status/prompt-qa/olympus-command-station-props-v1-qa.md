# Prompt QA — Olympus Command station props v1

Task: `t_e2ae814b`
Reviewed prompt pack: `docs/status/prompt-packs/olympus-command-station-props-v1.md`
Parent prompt-architect task: `t_326824cc`
Status: PASS

## PASS/FAIL result

PASS — the prompt pack is safe for the next Asset Creator card, with the next card limited to one controlled first candidate only: `station_council_war_table.png`.

## QA checks

| Gate | Result | Evidence |
| --- | --- | --- |
| One controlled first candidate only | PASS | Lines 52-58 require generating only Prompt 01 first, stopping after download, and continuing later prompts only after QA/alpha checks. |
| First candidate is Council War Table station prop | PASS | Lines 62-75 define Prompt 01 as `station_council_war_table.png` at the controlled generated-candidates path. |
| Transparent PNG station prop requirements | PASS | Lines 79 and 89-96 require exactly one production-ready transparent PNG, isolated table prop, no baked floor/walls/background, transparent padding, and operator/focus space. |
| Mythology/history/Olympus first | PASS | Lines 15-23 and 86-104 prioritize ancient Greek/Hellenistic, dark marble, antique bronze/gold, Greek-key, temple geometry, parchment/campaign-map craft, and museum-quality strategy-game object art. |
| Hermes/JARVIS subtle only | PASS | Lines 22-23 and 86-104 restrict cyan Hermes/JARVIS energy to restrained accents and subtle abstract wing/caduceus ornaments, not logos or dominant sci-fi. |
| No baked text/UI/dashboard/screens | PASS | Lines 25-31 and 105-108 forbid baked text, pseudo-text, labels, buttons, dashboard cards, charts, progress bars, data tables, screens, controls, app screenshots, and monitor/holographic UI surfaces. |
| No people/gods unless later character assets | PASS | Lines 28 and 109 forbid people, gods, statues, busts, avatars, silhouettes, hands, faces, and character-like figures in station props. |
| No one giant room PNG | PASS | Lines 30, 111-112, 419, and 453-460 forbid one giant room PNG, surrounding room scene, multiple assets/contact sheets, and live/public integration. |
| generated-candidates output only | PASS | Lines 36-50 and 391-407 require downloads only under `/Users/mac/hermes-workspace/generated-candidates/war-room/olympus-command/station-props/v1/` and explicitly never to `public/war-room`. |
| Metadata handoff | PASS | Lines 389-407 require metadata beside the candidate with prompt pack path, prompt id, local output path, generation time, session note, references, generated URL if safe, and safety statement. |
| Prompt QA / Asset QA handoff | PASS | Lines 409-440 provide prompt QA and post-generation asset QA checklists, including alpha verification and visual/style rejection gates. |
| Later sequence controlled | PASS | Lines 125-387 mark later prompts as later-only and blocked until the controlled first candidate passes QA. Lines 442-451 require stopping and writing remediation if drift/failure occurs. |

## Required fixes if FAIL

None. No blocking fixes are required before the next Asset Creator card.

## Non-blocking caution for Asset Creator

The Asset Creator must still enforce the pack exactly:

1. Generate only Prompt 01 first.
2. Save only `/Users/mac/hermes-workspace/generated-candidates/war-room/olympus-command/station-props/v1/candidate-a/station_council_war_table.png` plus metadata/proof artifacts under generated-candidates.
3. Do not create later station props until the Council War Table passes visual QA and technical alpha verification.
4. Do not copy to `public/war-room`, update registry/live manifests, integrate into the app, or promote candidate-b.

## Safety statement

This QA reviewed prompt text only. I did not generate assets, did not use ShotLab paid generation, did not integrate or promote any candidate, did not copy anything into `public/war-room`, did not connect Etsy/shops/suppliers/AliExpress/Alibaba/ShotLab, and did not perform any live or paid write action. The next permitted step is a single controlled ChatGPT asset candidate under generated-candidates only, followed by separate visual/alpha QA before any downstream use.
