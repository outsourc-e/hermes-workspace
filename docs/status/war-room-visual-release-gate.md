# War Room visual remake release gate — final batch checklist

Purpose: final Release Reviewer gate before any visual remake batch is called done, live, or release-ready. This gate is stricter than implementation review: it checks the full evidence chain from registry to browser QA and confirms the batch can be disabled or rolled back without business side effects.

Scope and safety boundary:
- Work stays inside `/Users/mac/hermes-workspace` and Kanban board `warroom`.
- No Etsy/shop/supplier/AliExpress/Alibaba/ShotLab paid or live connections, writes, uploads, purchases, publishes, renewals, messages, refunds, account actions, or paid generation.
- No credentials, tokens, private customer/order data, account ids, or live write endpoints may appear in release notes, manifests, screenshots, logs, or registry records.
- CSS/React may place, mask, animate, label, and orchestrate approved assets; CSS/SVG/Pillow/procedural drawings must not be accepted as final room art.
- Final visual assets must stay modular and registry-driven, not one giant interactive PNG.

## Required source files for release review

A release reviewer must inspect or receive exact references to:

1. Production system docs:
   - `docs/war-room-visual-studio-operating-system.md`
   - `docs/war-room-visual-remake-production-line.md`
   - `/Users/mac/.hermes/agent-blueprints/WAR_ROOM_24H_AUTONOMOUS_DEV_GUARDRAILS.md`
2. Registry and manifest sources:
   - `docs/status/war-room-asset-registry.json`
   - relevant room manifest(s), e.g. `public/war-room/.../room_manifest.json`, `public/war-room/manifests/*.json`, or documented stub/contract paths
   - `docs/status/war-room-layered-asset-manifest-contract.md` when schema questions arise
3. QA evidence:
   - implementation card id(s)
   - asset creator / slicer / integrator / QA card id(s)
   - browser screenshot paths or browser-vision summaries
   - console/network findings
   - build/typecheck results or explicit skip reason
4. Safety evidence:
   - statement that all business/shop/supplier/ShotLab actions remain mock-only, read-only, draft-only, disabled, or not connected
   - proof that any visible risky action is locked or clearly marked preview/local/theoretical

## Release decision states

Use only these final states:

- `PASS`: all mandatory gates pass and rollback/disable instructions are documented.
- `FAIL`: at least one hard gate fails; create or request focused remediation before release.
- `BLOCKED`: evidence is missing or a human decision is required; do not infer release readiness.
- `REFERENCE_ONLY`: batch contains useful mood/contact/reference assets but is not final interactive room art.

Do not use soft language such as “probably ready” or “looks okay”. The release result must be one of the states above.

## Hard PASS/FAIL gates

### Gate 1 — Registry completeness

PASS only if every final or live visual asset in the batch has a registry record with:
- stable asset id and room id
- asset type, such as `floor_base`, `station`, `prop`, `character`, `overlay`, or `ui_frame`
- status that matches reality: `approved`, `sliced`, `manifested`, `integrated`, `browser_qa_passed`, or `live`
- owner and next owner or final owner
- source/provenance reference
- candidate path when applicable
- approved path when applicable
- live path when the app uses it
- final use and forbidden-use notes for important assets

FAIL if:
- a visible final asset lacks a registry entry
- registry status says `live` or `browser_qa_passed` without QA evidence
- temporary/reference/candidate files are marked final without approval
- live paths in the registry do not match files referenced by manifests or app code

### Gate 2 — Asset provenance

PASS only if final premium assets have traceable provenance:
- prompt id, prompt pack, or asset contract reference
- generator/source note, normally ChatGPT premium asset pipeline or another approved generated asset source
- generated/downloaded time when available
- local candidate path and approved/live path
- contact sheet, QA image, or screenshot when available
- clear note when an asset is reused existing approved art rather than newly generated

FAIL if:
- provenance is “looks AI-generated” with no path/source trail
- an uploaded reference, contact sheet, placeholder, CSS/SVG/Pillow/procedural drawing, or one-off screenshot is treated as final art
- an asset came from live/paid ShotLab generation or any unapproved external write path
- baked gibberish text, fake UI, or copied reference details remain in final assets

### Gate 3 — Modular semantic layers

PASS only if the batch follows the layered asset model:
- floor/base is separate and mostly empty architecture, with no baked stations, labels, gods, fake dashboards, or clutter needed for interaction
- stations, props, characters, overlays, and UI frames are separate semantic assets where relevant
- transparent props/characters/stations have alpha verification or equivalent QA proof
- every interactive object can move, hide, replace, animate, or receive a hotspot independently
- full-scene images are only temporary references/contact sheets unless explicitly marked `REFERENCE_ONLY`

FAIL if:
- the final interactive room is one giant PNG with HTML labels layered over it
- future station state or agent movement requires regenerating the whole scene
- key station/prop positions are hardcoded in JSX when the batch required manifest-driven placement
- click targets do not align with visible objects

### Gate 4 — Manifest and app reference consistency

PASS only if:
- room manifest paths match registry live/approved paths
- manifest has exactly one floor/base layer for each released room
- manifest declares normalized bounds, z-index, anchor/scale, hotspot/operator/safe-text data where relevant
- app-public URLs are under `/war-room/...` and resolve in the built/browser app
- image elements load with nonzero natural dimensions in browser QA
- safety fields forbid Etsy/shop/supplier/ShotLab paid/live actions at room and station level where applicable

FAIL if:
- manifest references missing files, old candidates, or local absolute paths not served by the app
- registry says an asset is integrated but the manifest/app uses another path
- safety fields are missing from stations that imply business actions
- manifest stores credentials, private data, or live write endpoints

### Gate 5 — QA evidence packet

PASS only if the release packet includes:
- implementation and upstream card ids reviewed
- exact routes reviewed, usually `/war-room` plus any room/station state in scope
- exact files/assets/manifests reviewed
- screenshot paths or browser-vision notes from the actual app viewport
- browser console/network result, including missing asset checks
- at least one primary interaction path when UI wiring is in scope
- raw or summarized build/typecheck output when app/source files changed
- explicit safety statement confirming no live business side effects

FAIL if:
- visual approval is based only on a static file preview while the app route was changed
- screenshots are missing for a visual release
- console/network checks are missing for an integrated visual release
- build/typecheck is skipped without reason after code/manifest integration
- QA evidence is from a different room, stale path, or pre-change build

### Gate 6 — Browser premium look and readability

PASS only if actual browser evidence shows:
- first glance looks like a premium Olympus/JARVIS War Room, not generic SaaS dashboard/CSS cards
- generated visual layer dominates without burying the scene under status pills and debug panels
- labels/copy are real readable HTML or placed inside generated safe plaques/frames
- no important object is clipped, hidden by Workspace chrome, too tiny, or visually detached from its click target
- motion is calm and purposeful; no jitter or random decorative movement

FAIL if:
- release would embarrass the product in a 5-second non-technical review
- assets look like stickers pasted onto a dashboard shell
- baked AI gibberish, fake UI text, or illegible room labels are visible
- route has stale loaders, broken perspective, overlapping controls, or inaccessible close/back actions

### Gate 7 — No temporary assets marked final

PASS only if:
- assets in `artifacts/war-room/candidates/...`, contact sheets, mood boards, screenshots, references, stub placeholders, and QA scratch files remain marked candidate/reference/temporary
- any intentionally temporary asset has a visible follow-up owner and is not required for final release claims
- registry `temporary` or `reference_only` status is not counted as final release readiness

FAIL if:
- a candidate/contact/reference file is copied into a live path without approval and QA
- release notes call temporary art final
- CSS/SVG/Pillow/procedural fallback art is hidden behind “temporary” language while the batch is declared done

### Gate 8 — Build, typecheck, route, and console checks

PASS only if:
- `pnpm build` passes after app/source changes, or the release notes state why no app/source changes occurred
- typecheck is run after TypeScript, manifest types, data contracts, core components, or loader changes, or an unrelated baseline failure is documented
- browser route loads without new uncaught exceptions, hydration errors, failed asset requests, or missing manifest errors
- primary click/open/close path works for integrated stations or panels

FAIL if:
- app/source changed but no build result is provided
- manifest/assets are referenced by code but cannot be resolved at runtime
- console contains new errors, 404 assets, or broken imports
- release packet hides type/build failures as “known” without evidence

### Gate 9 — No business side effects

PASS only if:
- no real Etsy/shop/supplier/AliExpress/Alibaba/ShotLab paid/live connection was opened, edited, messaged, purchased, uploaded, published, renewed, refunded, or otherwise written
- UI states involving business actions are mock-only, theoretical, preview-only, local-only, draft-only, read-only, disabled, or not connected
- screenshots and logs do not expose credentials, tokens, private customer/order data, account ids, or live operational secrets
- all external-mode labels match the guardrails

FAIL and stop immediately if:
- any live external write path is connected or executed without explicit DLV approval
- release requires credentials or destructive admin actions
- mock data is presented as real store state

### Gate 10 — Rollback / disable plan

PASS only if the release packet names a smallest safe rollback/disable action, such as:
- revert the manifest pointer for the room to the previous approved manifest
- disable the new room/station behind an existing feature flag or route guard
- remove the new asset id(s) from the active room manifest while keeping files archived
- mark the registry assets `rejected`, `temporary`, or `reference_only` and restore previous approved/live paths
- keep business action surfaces locked while the visual batch is disabled

FAIL if:
- there is no documented way to back out a bad visual batch without broad deletion, `git reset`, `git clean`, destructive checkout, DB/admin commands, or external service changes
- rollback depends on deleting evidence or overwriting source/candidate files
- disabling the visual batch would unlock or obscure safety controls

## Release review procedure

1. Confirm the card scope and upstream ids.
2. Read the production-line, operating-system, guardrail, registry, manifest, and QA checklist documents.
3. Compare registry asset ids and statuses against the manifest/app paths.
4. Verify each final visual asset has provenance and is not CSS/SVG/Pillow/procedural final art.
5. Check that candidate/contact/reference/temporary assets are not counted as final.
6. Review browser evidence: screenshots, console/network checks, and interaction path notes.
7. Review build/typecheck output or documented skip reason.
8. Confirm safety locks and no business side effects.
9. Confirm rollback/disable plan.
10. Write one final `PASS`, `FAIL`, `BLOCKED`, or `REFERENCE_ONLY` decision with exact failing gates or exact release-ready evidence.

## Final release handoff template

```markdown
Visual batch release decision: PASS | FAIL | BLOCKED | REFERENCE_ONLY

Reviewed:
- Batch/card ids: ...
- Route(s): ...
- Registry: ...
- Manifest(s): ...
- Asset paths: ...

Evidence:
- Registry completeness: PASS/FAIL — ...
- Asset provenance: PASS/FAIL — ...
- Modular layers: PASS/FAIL — ...
- Manifest/app consistency: PASS/FAIL — ...
- QA screenshots/browser: PASS/FAIL — ...
- Build/typecheck: PASS/FAIL/NA — ...
- Temporary assets not final: PASS/FAIL — ...
- Business side effects: PASS/FAIL — Etsy/shops/suppliers/ShotLab paid/live actions not connected; only mock/theoretical/read-only/draft/disabled UI.
- Rollback/disable plan: PASS/FAIL — ...

Release notes:
- What is approved or rejected: ...
- Remaining visual gaps: ...
- Follow-up owner/card needed if FAIL/BLOCKED: ...
```

## Final rule

A visual remake batch is not release-ready until registry, provenance, modular-layer, manifest, QA, browser, build/typecheck, safety, temporary-asset, and rollback gates all pass or are explicitly marked not applicable with evidence. Missing evidence is `BLOCKED`, not `PASS`.
