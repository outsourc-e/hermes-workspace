# Living War Room V3 Separation

Current V3 is isolated under these roots:

- Code: `src/screens/war-room/living-v3/`
- Runtime/contracts: `src/lib/war-room/living-v3/`
- Assets: `public/war-room/living-v3/`
- Asset build script: `scripts/war-room-living-v3-build-assets.py`
- Docs: `docs/war-room/living-v3/`

Canonical QA routes:

- Current V3: `/war-room?livingV3=1`
- Etsy compatibility route normalized to V3: `/war-room?etsyOps=1`
- Typo-safe Etsy compatibility route normalized to V3: `/war-room?etsyOps=1.`
- Previous Etsy Ops room, kept only for comparison: `/war-room?legacyEtsyOps=1`

Legacy roots are intentionally left in place and must not be imported by V3:

- `src/screens/war-room/etsy-ops/`
- `src/screens/war-room/v1/`
- `src/screens/war-room/overhead/`
- `src/screens/war-room/overhead-v2/`
- `public/war-room/etsy-ops-v4/`
- `public/war-room/etsy-ops-julius-v1/`

V3 may read safe business data later through adapters, but visual runtime manifests and UI assets must resolve only to `/war-room/living-v3`.

Hermes adapter contract:

- `assignTask`
- `setAgentState` can be represented as a task assignment or future state patch
- `moveAgentToRoom`
- `raiseAlert`
- `createApprovalPacket`

No Etsy, supplier, paid generation, account, or live computer action is executed by V3. External actions remain local approval packets until Hermes adds an explicit manual approval bridge.
