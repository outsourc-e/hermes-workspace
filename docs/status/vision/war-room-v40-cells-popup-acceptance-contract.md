# War Room V40 cells-popup acceptance contract

Status: PASS / vision acceptance contract only
Owner lane: visionarchitect
Date: 2026-06-13 02:29:16 IDT +0300
Source: `docs/status/automation/war-room-v40-6h-focused-dev-team-run-20260613.md`
Scope: documentation-only. No React/source/runtime asset edits, no live connectors, no marketplace or external actions.

## 1. Product sentence for this 6h run

V40 should read at first glance as a practical local AI-agent operating environment: a cells-only command board where visible workers, packets, and tool actions show what the agents are doing now; clicking a cell opens one centered room popup with the useful tool/action surface; closing returns to the clean cells-only board.

This run is allowed to improve the beta slice. It must not claim final, premium, release-ready, or TikTok/reference-level quality unless later visual QA proves that standard.

## 2. Locked structure acceptance bar

PASS only if the implementation preserves all four structure locks:

1. Main `/war-room` view is cells only.
2. Main view does not show an opened detailed room, side decision cockpit, or generic dashboard panel by default.
3. Clicking a cell/room opens a centered popup/modal room.
4. Closing the popup returns to the same cells-only main board.

FAIL / regress if:

- room detail is rendered inline inside the main board;
- the main board becomes a card dashboard around the cells;
- closing a popup leaves detail panels, decision panels, or modal leftovers on the main board;
- navigation requires a separate route or non-obvious state instead of cell click -> centered popup -> close.

## 3. First-glance user value

A non-technical viewer should understand within five seconds:

- this is a work operating room, not a decorative game screen;
- each cell is a department/agent room with a current job or queue;
- workers are present and visibly doing local work;
- packets/handoffs move between rooms with source, target, and purpose;
- risky/live actions are locked and require DLV approval;
- the next useful action is to click a cell and inspect the active room/tool.

The first screen should prioritize live work state over lore. Mythic/visual theme is acceptable only when it clarifies the operating system.

## 4. Cells-only main requirements

The cells board should show:

- 6+ readable cells visible at normal Workspace viewport size;
- short cell labels only: room name, current role, active packet/job count, and one compact state line;
- visible worker/agent presence in or near cells;
- visible packet/handoff markers between cells when a workflow is active;
- no long explanations, no repeated station cards, no giant feed, and no always-open decision panel;
- read-only/local-only safety state visible without dominating the board.

Acceptance examples:

- Agora cell shows opportunity scouting worker plus one packet heading to Forge.
- Forge cell shows draft/tool work, not a generic card saying “ready”.
- Approval/Treasury cell shows locked DLV gate, not an enabled publish button.

## 5. Popup room requirements

Clicking any implemented cell should open a centered popup/modal room that contains the detailed operating surface for that room.

A passing popup has:

- a clear room title and current operating mode;
- visible worker/agent inside the room;
- one practical tool/action surface specific to that room, not a reused generic cockpit;
- input/source context, concrete output/artifact, next handoff, and locked risks;
- one obvious close control that returns to the cells-only board;
- no live external action controls enabled.

The popup may still be beta if art quality is rough, but it must be practically useful and must not be just a themed text card.

## 6. Tool/action animation bar

At least one visible action must make the system feel alive and practical.

PASS examples:

- a worker walks/routes to a station after selecting an action;
- a tool has a visible work state such as scan, forge, sort, draft, review, or approval-lock pulse;
- a packet visibly moves from source cell to target cell before or during popup work;
- a local draft/output area updates after a draft-only action.

FAIL examples:

- only decorative random particles;
- random worker jitter with no job source/target/purpose;
- action buttons that only change text in a generic card;
- animations that imply live Etsy/shop/Discord/supplier action.

## 7. Visible workers bar

Workers must be visible as active operators, not just names in a list.

PASS requires at least one worker/agent representation with:

- room ownership or current role;
- current action state such as idle, routing, working, reviewing, blocked, or awaiting approval;
- visual relationship to a packet, station, or tool;
- restrained movement that supports comprehension rather than noisy random motion.

Still beta if workers are placeholder sprites/tokens, but acceptable for this run if they are readable, purposeful, and connected to real local state.

## 8. Safety / no-live acceptance bar

Every visible business/marketplace/agent action must remain safe:

- connectors show `NOT_CONNECTED`, local-only, read-only, draft-only, mock, disabled, or approval-gated;
- no Etsy/shop/supplier/publishing/paid-generation/account/message/order/refund/purchase/Discord/live external actions;
- no credential prompts and no live connector enablement;
- no POST/PATCH/DELETE mutation controls for external services;
- local draft outputs and approval queues are allowed only when clearly marked as local/draft.

Any enabled live external action is an immediate FAIL regardless of visual improvement.

## 9. What still counts as beta

The run should be honest. The V40 slice is still beta if any of these remain true:

- art/assets are placeholders or CSS-looking;
- only one or two cells have useful popup tools;
- worker models are tokens rather than polished characters;
- animations are deterministic demos rather than full live task orchestration;
- packets use fixture/local data rather than complete backend routing;
- visual QA says the screen is functional but not show-off/premium;
- the room popup is useful but not yet a final app surface.

Beta is acceptable for this run if the structure is locked, user value is obvious, one popup tool is practical, workers/actions are visible, and safety is preserved.

## 10. Machine-checkable review checklist

A reviewer can mark this V40 run PASS only if all are true:

1. Main closed state: `/war-room` shows cells only.
2. Main closed state: no detailed room/decision panel is open by default.
3. Cell interaction: clicking a representative cell opens a centered popup/modal room.
4. Close interaction: close returns to the cells-only board.
5. Practicality: popup shows source/input, concrete output/artifact, next handoff, and locked risks for at least one station/tool.
6. Activity: at least one visible worker and one visible tool/action/packet animation exist and have a clear job purpose.
7. Safety: all external actions remain `NOT_CONNECTED` / local-only / draft-only / read-only / approval-gated.
8. Honesty: final handoff separates functional pass from product-quality pass and says what remains beta.

## 11. Handoff to implementation lanes

Implementation lanes should improve visible outcomes in this order:

1. Preserve cells-only main and popup-close behavior.
2. Make one popup room practically useful with a station-specific tool/action surface.
3. Add visible worker + packet/tool animation tied to a real local job purpose.
4. Improve visual polish without adding dashboard clutter or live actions.
5. Run build, browser/console QA, screenshot QA, and no-live safety review before any PASS claim.

Verdict: PASS. This contract is ready for codex/integration, art/technical-art, and QA lanes as the acceptance bar for the V40 6h focused run.
