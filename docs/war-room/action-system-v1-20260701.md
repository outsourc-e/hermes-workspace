# Workspace Action System V1 — 2026-07-01

Goal: stop treating the War Room as a chat skin. Every explicit request should become a visible run:

`Intent → capability check → assigned agent/tool → host result/artifact → UI receipt → approval gate / next action`

## Implemented in this slice

### 1. No automatic fake ACK bubble

Removed the generated `Hermes: קיבלתי... אני המנתב...` reply from live agent chat.

Normal chat can still answer, but explicit action requests are represented as Action Run receipts instead of scripted acknowledgements.

### 2. Hermes can route Terra model-search requests

If DLV asks Hermes something like:

> שלח את טרה לחפש 20 פידגטים להדפסה ותציג לי כרטיסים

The route now classifies this as:

- requestedByAgentId: `hermes`
- assignedAgentId: `terra`
- intent: `terra_model_search`
- targetRoomId: `terra-forge`
- targetStationId: `terra-model-hunt`
- toolId: `terra-printables-readonly-search`

The host tool runs and returns a real `terraModelSearch` payload for the Terra Model Hunt UI.

Smoke result on 2026-07-01:

- API: `/api/war-room/agent-control/live-chat`
- request: Hermes → Terra search 20 fidgets
- status: `completed_host_tool`
- candidates: `20`
- totalCount: `79`

### 3. Missing capability becomes a build proposal, not a fake answer

If DLV asks for a real action that has no connected host tool yet, the system returns:

- status: `blocked_missing_capability`
- capability: `missing`
- reportedCost: `0 model calls; capability check stopped before agent execution`
- buildPlan:
  1. define exact intent/capability
  2. choose owner agent + visual room/station
  3. connect safe host tool returning artifact/readback
  4. show result as cards/table/board and persist history
  5. add approval gate + tests/browser QA

Smoke result on 2026-07-01:

- request: Loki → “שלח 10 הודעות לספקים עכשיו”
- status: `blocked_missing_capability`
- no Hermes CLI/model call spawned for the missing action path

### 4. Chat/panel persistence hardened

- stored chat history increased from 60 to 200 messages
- visible selected-agent history increased from 5 to 40 messages
- action results render as `receipt` messages, not normal agent chat
- agent window layout remains persisted in localStorage
- added `Fit Wide` beside `Reset Window`
- changed agent window to flex layout so chat gets usable scroll space

## Forward build loop

When the user asks for something that does not exist yet, Workspace should not silently fail or answer with slogans. It should create a Build Proposal Card:

1. **Understand** — classify user intent and required outcome.
2. **Match** — search capability registry: existing room/station/tool/agent/profile.
3. **Route** — if found, run the safe host tool and show artifact.
4. **Block safely** — if missing, do not pretend execution happened.
5. **Propose build** — define owner, missing connector, UI surface, data source, approval gates, tests.
6. **Ask DLV only for meaningful approval** — names, destructive actions, live account writes, new profile/tool permissions.
7. **Implement as a bounded slice** — backup, patch, test, browser QA, document.
8. **Promote into capability registry** — so next time the same intent runs automatically.

## Next necessary slices

1. Capability registry file/table instead of ad-hoc regex routing.
2. Agent Pack registry: profile + skills + Obsidian packet + allowed tools + room/station ownership.
3. Real Etsy action runners for Loki/Thor/Odin, starting with safe read-only/product-intake flows.
4. Visual Build Proposal Card in Hermes Command, not only API payload/receipt.
5. Browser test that sends Hermes→Terra from the UI and verifies Terra cards appear after reload.
