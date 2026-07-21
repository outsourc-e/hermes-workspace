# War Room click-panel inventory — 2026-07-11

## Scope lock

This pass changes only interfaces opened after clicking a tool, station, or agent.

Protected and unchanged:

- room map geometry and camera behavior;
- room art and room identity;
- agent sprites, animation clips, scale, paths, and placement;
- station placement and station IDs;
- ShotLab contracts and ShotLab-owned UI while its new version is being updated;
- live marketplace, supplier, paid-generation, printer, or messaging actions.

## Shared UX contract

Every active panel should show, in this order:

1. identity: room, tool/agent, role;
2. current state: active artifact/packet, progress, and owner;
3. primary action and exact blocker;
4. visible input and output media/artifacts;
5. readback and approval state;
6. source proof and debug only inside collapsed details.

No panel may present raw event/API data as the primary experience. External side effects require an explicit approval gate and a readback receipt.

## Professional Reset Batch 1 ownership — verified 2026-07-11

- Goblin owns discovery, opportunity ranking, and Research Atlas.
- Oracle owns local evidence/provenance verification and allowed-claim confidence.
- Etsy Market Lab owns listing-preparation execution: source truth, variants, SEO, draft, QA, and its existing DLV approval gate.
- Council owns strategic advice and recommendation records; it does not execute and does not replace Etsy approval.
- ShotLab remains the exclusive media-production and asset-state owner. Etsy may stage a media brief and consume returned readiness only.
- `LivingWarRoomV3.tsx` remains the composition root in Batch 1; `OracleWorkbench.tsx` is the first extracted canvas.
- Shared workbench QA markers: `data-professional-workbench="v1"` plus one explicit `data-room-ownership` value per active primary canvas.
- Internal room switchers and the duplicate embedded Research Atlas header were removed. The protected living map, IDs, station placement, agents, and routes were not replaced.
- Corrected MoA review completed in session `20260711_212246_c74ddd`; substantive references were Luna, Terra, and Kimi, aggregated by Sol. Kimi's conflicting suggestion to move ShotLab ownership under Etsy was rejected.

## Professional Reset Batch 2 — Council Clean Command V3 verified 2026-07-11

- Council now has exactly three primary modes: **Start**, **Council**, and **Advisor**.
- Start shows one question surface and one `פתח מועצה` CTA. On mobile, the decorative table and fallback decision are hidden.
- Council shows one concrete decision surface, one visible continuation composer, collapsed advisor opinions, and a compact six-portrait advisor dock. Raw vote/protocol details are not a competing primary panel.
- Advisor shows one private advisor chat with composer/actions and a visible top `חזור להחלטה` path. The Council decision surface is fully unmounted from the visible layout in this mode, so there is no ghosted duplicate panel.
- `CouncilDecisionSummary.tsx` is the first small Council-specific extraction. Existing controlled runner, API routes, local archive/session storage, typed handoff behavior, room/station IDs, map, agents, and external-action locks were preserved.
- Browser/Vision QA passed Start, Council, and Advisor at desktop `1440 × 900` and mobile `390 × 844`: no horizontal overflow, no composer/advisor overlap, and visible mobile controls measure at least `44px` high. Existing Council session state was backed up and restored during Start-mode QA.
- Focused Council test, targeted ESLint, TypeScript, and diff whitespace checks passed. Final full Workspace QA exited `0`: diff, lint budget, TypeScript, full tests, and production build all passed. Artifact: `/Users/mac/.hermes/workspace-health/hermes-workspace/runs/2026-07-11T204306-896Z/quality-run.json`. `overall: warn` is historical lint debt only: `0` errors and `1174/1178` warnings.

## Click-to-component ownership

| Click target | Primary component owner | Current state after this batch | Notes |
| --- | --- | --- | --- |
| Any roaming agent | `AgentWorkbenchPanel.tsx` | Rebuilt v2 | Identity, live state, mission, packet, chat, station actions; persona/window controls collapsed. Sprite and movement unchanged. |
| Etsy Product Search | `EtsyMarketLabPrimaryWorkspace` → `SimpleProductConsole` / `EtsyProductPrepWorkbench.tsx` | Execution-only, verified | Product Inbox remains the receiving board. It can consume a reviewed research handoff, but it no longer owns discovery or mounts Research Atlas. |
| Goblin Research Atlas | `GoblinAnalyticsShell.tsx` → `ResearchAtlasSurface.tsx` | First-class, verified | Goblin owns opportunity discovery, comparative ranking, and shop/product/market research. Radar and Research are the only two primary tabs. |
| Etsy Source Leads / Source Truth / SEO / QA / Draft Approval | `EtsyMarketLabPrimaryWorkspace` and station-specific surfaces in `LivingWarRoomV3.tsx` | Existing dedicated workbenches | No room/station structure changes. ShotLab-owned surface excluded from concurrent edits. |
| Terra Model Hunt / Prep / Printer | `TerraForgePrimaryWorkspace` | Existing dedicated workbench | Model, slicer, printer, and camera readbacks remain truthful and gated. |
| Council | `CouncilChamberSurface.tsx` + `CouncilDecisionSummary.tsx` | Clean Command V3, verified | Three-mode strategic decision workspace: Start, Council, Advisor. It remains advisory/local and does not become a second Etsy approval system or execute room work. |
| Goblin Analytics | `GoblinAnalyticsShell.tsx` | Discovery/research owner, verified | Opportunity Radar and embedded Research Atlas share one primary shell; staged research packets can hand off to Etsy execution state. |
| Atlantis Vault | `AtlantisVaultSurface.tsx` | Existing dedicated workbench | Local asset/media catalog and proof. |
| Command stations | `CommandRoomManagerSurface` + `StationWorkbenchHeader.tsx` | Header rebuilt v2 | Clear room/tool identity, local/readback status, and close action. |
| Gateway stations | Gateway approval gate + `WorkspacePipelineWorkbench` + `StationWorkbenchHeader.tsx` | Header rebuilt v2 | External delivery stays locked behind readback and approval. |
| Oracle signal station | `OracleWorkbench.tsx` → `OracleAluraLocalSearchApp` | Evidence-only workbench, verified | Dedicated primary canvas for local signal/provenance verification; generic drawer and competing Goblin/Etsy canvases stay unmounted. |
| Dormant/support station | Dormant card + collapsed debug + `StationWorkbenchHeader.tsx` | Clarified | Explicitly says no active workbench instead of displaying a fake flow. |

## Research source ownership

The integrated verified source is read-only:

`/Users/mac/dldrop-product-prep/slowtonehandmade_market_intel_2026_07_10/research_hub`

It contains research for:

- `SlowToneHandmade`;
- `JitzzShop`;
- `GazooTrips`.

Verified source artifacts:

- `index.html` — original interactive meta-analysis site;
- `downloads/SlowToneHandmade_market_intelligence_2026-07-10.xlsx`;
- `downloads/JitzzShop_Etsy_eRank_Supplier_Research_2026-07-10.xlsx`;
- `downloads/GazooTrips_Etsy_eRank_Supplier_Research_2026-07-08.xlsx`;
- `QA_REPORT.txt`;
- `ASSET_LIFECYCLE.json`.

The Workspace API proxies only files resolved inside the allowlisted local research root. Mission creation writes a local JSON packet and returns it to `EtsyRoomState.researchMissionPacket`; it does not start browser research or mutate Etsy.

## Batch boundaries

Completed earlier in the day, then superseded by Professional Reset ownership:

- Research Lab contract, server loader/proxy, mission staging, UI, tests, and Tool Registry route remain valid;
- the Research Atlas surface and local mission handoff remain valid, but the primary entry point moved from Etsy to Goblin/Opportunity;
- the duplicate embedded Research Lab in Product Prep remains removed;
- desktop `1440 × 900` and mobile `390 × 844` Browser QA passed after the move, with no page-level horizontal overflow or competing owner canvas;
- Agent Workbench v2 for every agent click;
- Station Workbench Header v2 for generic station drawers;
- final Professional Reset Workspace quality command exited `0`: diff, lint budget, TypeScript, full tests, and production build all passed. The artifact is `overall: warn` only because warnings fell to `1174/1178` and are a baseline-reduction candidate (`/Users/mac/.hermes/workspace-health/hermes-workspace/runs/2026-07-11T185551-771Z/quality-run.json`).

Explicitly deferred until ShotLab is stable:

- ShotLab media/project schema integration;
- ShotLab upload, archive, generation, or readback wiring;
- any component owned by the new ShotLab version.
