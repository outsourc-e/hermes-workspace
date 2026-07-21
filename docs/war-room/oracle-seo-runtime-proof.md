# Oracle SEO agent runtime proof — prototype, not final art

This proof is for the War Room `oracle-signals` / `Oracle SEO` room. It documents the local runtime motion contract used when final premium sprite sheets are not available.

Status: `runtime-proof-not-final-art`

Implemented runtime hooks:
- Agent: `agent-oracle-signal-analyst`
- Room: `oracle-signals`
- Full motion frame contract: 50+ deterministic runtime frames (96 by default through the room manifest; tests force 50 to prove the minimum gate)
- Reduced-motion fallback: one still checkpoint frame, no travel
- State hooks exposed to renderer/tests: `work`, `talk`, `rest`
- Path/target contract: home point -> work station -> talk/manual review hook -> rest point
- External/live safety: no Etsy/shop/account/supplier/customer/paid actions are connected or implied

Renderer proof surfaces:
- `data-war-room-v1-oracle-agent-runtime-proof`
- `data-war-room-v1-oracle-agent-runtime-total-frames`
- `data-war-room-v1-oracle-agent-runtime-reduced-motion-frames`
- `data-war-room-v1-oracle-agent-runtime-state-hooks`
- `data-war-room-v1-oracle-agent-runtime-path-contract`
- `data-war-room-v1-oracle-agent-runtime-final-art-claim="false"`
- Per-frame marker attributes: `data-war-room-v1-oracle-agent-frame`, `data-war-room-v1-oracle-agent-state`, `data-war-room-v1-oracle-agent-target`, `data-war-room-v1-oracle-agent-direction`

Verification run:
- `pnpm exec vitest run src/lib/war-room/horizontal-mini-rooms-runtime-spine.test.ts src/lib/war-room/horizontal-mini-rooms-motion.test.ts src/lib/war-room/horizontal-mini-rooms-room-agent-motion.test.ts` — 3 files / 21 tests passed.
- `pnpm exec eslint src/lib/war-room/horizontal-mini-rooms-motion.ts src/lib/war-room/horizontal-mini-rooms-runtime-spine.ts src/lib/war-room/horizontal-mini-rooms-runtime-spine.test.ts src/lib/war-room/horizontal-mini-rooms-room-agent-motion.ts src/screens/war-room/v1/WarRoomV1HorizontalMiniRooms.tsx` — passed, with only the repo's existing `.eslintignore` deprecation warning.

Limitations:
- This is a runtime/prototype motion proof, not final premium character art.
- Global project `tsc --noEmit --pretty false` was attempted twice and timed out at 300s and 900s in this worker run, so the targeted Vitest + ESLint gates above are the verified gates for this card.
