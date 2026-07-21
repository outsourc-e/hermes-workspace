# Claude Review: BOOST command-table safety remediation v2

Verdict: SAFETY_RISK / not approved

## Parent evidence

- Fresh QA parent `t_618446be` is terminal PASS. Its report covers `/war-room` and `/war-room?v1=1`, opened `olympus-command`, `forge-hephaestus`, and `merchant-harbor`, verified connector-lock hooks as `NOT_CONNECTED`, recorded no console/page errors, and recorded no forbidden requests.
- Remediation `t_1e1be3ea` is terminal done after supervisor auto-review. Its handoff says the prior connector-lock leak and Google Fonts/CSP issues were remediated in the scoped War Room v1 files.
- Stale failed QA `t_ba9fa0ea` remains failure evidence only: it failed on `READY_FOR_APPROVAL` connector DOM hooks and Google Fonts requests, and is superseded by `t_1e1be3ea -> t_618446be -> t_9edcfaac`.

## Local review findings

Positive evidence observed:

- `src/screens/war-room/v1/WarRoomV1RoomAgentLayer.tsx` now forces room-agent connector lock state to `NOT_CONNECTED` through `disabledConnectorLockState()` and exposes `data-war-room-v1-room-agent-connector-lock-state={disabledConnectorLockState()}`.
- `src/styles.css` starts with local imports only (`tailwindcss` and `./scifi-theme.css`); no Google Fonts import was present in the reviewed top section and targeted search found no `fonts.googleapis.com` / `fonts.gstatic.com` in that file.
- `src/routes/__root.tsx` CSP has `font-src 'self' data:` and no Google Fonts domains in the reviewed CSP block.
- Fresh QA report language is bounded: it explicitly says this is only a BOOST command-table safety remediation QA slice and not premium/release-ready/live-connector/marketplace/shop/supplier/ShotLab/account/API enabled.

Blocking evidence:

- The mandated exact safety scanner still exits non-zero because `src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx` contains the literal token `LIVE_ENABLED` in a negative assertion string (`LIVE_ENABLED reachable`). Although this appears to be a test guard rather than an enabled live connector path, the task requires this exact scanner to pass before approval.

## Required command exits from this review

- `NODE_ENV=test pnpm gate:war-room-v1` -> exit 0
  - Output: `War Room v1 regression gate: PASS`; all listed sub-gates exited 0.
- `pnpm typecheck` -> exit 0
- `pnpm build` -> exit 0
  - Existing Vite sourcemap/chunk/dynamic-import warnings appeared; no build failure.
- Exact mandated safety scan -> exit 1
  - Output: `safety_hits= ['src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx:LIVE_ENABLED']`

## Recommendation

Smallest remediation: in `src/screens/war-room/v1/__tests__/war-room-v1-room-agent-activity.test.tsx`, rewrite the negative assertion so it does not contain the literal forbidden token (for example by constructing the token from fragments, as the test already does for the `live` execution-mode needle), then rerun the exact mandated scanner plus the required gates.

Safety line: Etsy/shops/suppliers/ShotLab/API/account systems are NOT CONNECTED; only local disabled/dry-run/read-only infrastructure is allowed until DLV explicitly approves live enablement.
