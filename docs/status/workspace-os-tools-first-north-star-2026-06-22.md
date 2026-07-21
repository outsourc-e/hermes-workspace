# Workspace OS — Tools-First North Star

Updated: 2026-06-22 13:37:00 IDT +0300

## DLV direction

DLV clarified this is not a request to create many visible agents. The target is a polished Workspace operating system where each recurring task becomes an integrated tool with the right UI for that task.

Examples like Etsy product gallery or daily news board are examples of the desired pattern, not direct isolated feature orders.

## Smart Hive Intake Principle — 2026-06-22

DLV clarified that Workspace agents must not be rigid form processors that only work when the input is perfect. The target is a smart AI hive behind polished tools: DLV may provide any mix of AliExpress links, Google Docs, Google Sheets, Google Drive folders, local files/images, and a free-form prompt.

The manager/agents should infer the task, inspect sources, match scattered assets to products, choose the best evidence/images, propose a method, ask only when genuinely blocked, and return auditable outputs. For Etsy/Product Prep this means product dossiers, selected image sets, ShotLab preparation recommendations, SEO/Draft handoff, and QA warnings.

`Sheet Intake V1 — local file only` is useful scaffolding, not the product target. The next target is `Smart Intake Agent V2`: messy sources + prompt → smart source/image/product matching → clean gallery/dossiers/handoff.

Important visual/product rule: the hive/swarm should not appear as dozens of visible agents in the room. A room should have at most 3–4 visible agents when truly needed. Most work should be represented by stations/tools: each station is both DLV's management interface and the metaphorical handle for a behind-the-scenes swarm capability.

## Universal Action Wrapper / Operating Kernel Pivot — 2026-06-23

DLV clarified the scaling target: roughly 10 rooms with many stations and many possible worker/model profiles. The Workspace must not be built by connecting a bespoke cable for every room/station/action.

New rule:

```text
Build one plug first: Intent → Blueprint → Run → Event → Packet/Artifact → Station UI → Approval → Result/Readback.
Rooms are views/control surfaces over that kernel.
Stations are tool adapters over blueprints.
Workers/models are worker profiles that speak the same contract.
```

Immediate implementation target:

`Universal Workspace Action Wrapper / Operating Kernel V1`

Reference files:

- `docs/status/workspace-universal-action-wrapper-source-of-truth-2026-06-23.md`
- `docs/prompts/codex-mega-prompt-universal-workspace-action-wrapper-v1-2026-06-23.md`

This supersedes doing another Etsy-only cable or starting final natural animation before the kernel exists.

## North Star

```text
Discord-era work
→ Workspace-native command/tool surfaces
→ beautiful task-specific UI
→ Hermes/Codex/agents behind the scenes only where useful
→ visible QA / approval / artifact readback
```

## Product principle

Prefer:

- integrated tools with tailored UI;
- galleries inside the tool that needs them;
- rich artifact panels, previews, dossiers, boards, approvals, and logs;
- one main command-room manager/conductor that understands the whole Workspace;
- small invisible/specialized workers behind the tool when needed.

Avoid:

- “1000 agents” as user-facing clutter;
- generic chat-only workflows;
- dashboard cards pretending to be real tools;
- making a new room/agent for every small task;
- carrying Discord-only UX into Workspace without a proper visual surface.

## Command Room requirement

Command Room should provide one primary Workspace manager that DLV can talk to.

This manager should be able to:

- understand current Workspace state;
- route tasks to existing tools/rooms;
- decide whether the right answer is a new tool, new room, new worker, or just a better UI inside an existing tool;
- split work safely for Codex/Hermes/other workers;
- monitor loops and blockers;
- tell DLV when a request should not become a new agent/room;
- keep approvals and live-action gates visible.

## Tool surface requirement

Every important tool should have its own appropriate UI, for example:

- Product sorting → product gallery with images, titles, scoring, warnings, markdown dossier preview, selection action.
- ShotLab prep → media/gallery/workflow surface with source truth, generation state, QA, rejected/approved assets, handoff packet.
- Daily news → pleasant interactive bulletin board / newspaper surface, not just a Discord text dump.
- SEO/Alura → searchable database/workbench with metrics, score, chosen tags, evidence, missing metrics.
- Approvals → decision inbox with evidence and locked/live actions.

## Discord parity requirement

DLV wants to be able to do inside Workspace what he currently does through Discord, but with a better UI:

- start tasks;
- talk to the main manager;
- review outputs;
- inspect galleries/artifacts;
- approve or reject handoffs;
- see logs/status;
- continue workflows;
- manage agents/tools safely.

Discord remains useful as remote-control/summarized-output, but Workspace should become the primary human-facing operating surface.

## Skill/action conversion rule

Long-term target:

```text
Each recurring skill / action / service / text workflow
→ one Workspace-native surface or panel
→ typed intent/event/action contract
→ artifact storage/readback
→ QA and approval gate
```

This does not mean building everything at once. It means every new major workflow should be designed as a Workspace tool surface first, not as a bare chat prompt or random new agent.

## Codex / Hermes split

Codex should own:

- UI design and implementation;
- React/TypeScript/CSS;
- tool surfaces;
- visual polish;
- local app state and tests/build.

Hermes should own:

- source-of-truth/context;
- typed intents/events;
- connecting controlled workers/tools;
- safety/approval gates;
- QA/readback;
- deciding whether to route to existing tool, new tool, new room, or new worker.

## Immediate implication

Do not solve the Sheet/Product request by adding many visible agents. Solve it as a single polished tool/workbench:

```text
Sheet Intake / Product Gallery tool
→ optional hidden workers for sorting/QA
→ DLV selects product
→ ShotLab Handoff tool
```

## First implementation direction

Before adding more live connectors, build a shared Workspace tool pattern:

1. `Command Room Manager` surface.
2. `Tool Registry` / available tools panel.
3. `Run / Artifact / Approval` model.
4. First vertical slice: `Sheet Intake V1 — local file only` with product gallery and markdown dossiers.
5. Then connect selected product to existing Etsy Market Lab packet flow.

## Safety

Live actions remain gated:

- no Etsy publish/upload/edit without explicit approval;
- no supplier messages/purchases;
- no paid generation without phase gate;
- no Google Sheet writes unless approved;
- no uncontrolled worker fan-out;
- every task should expose what is allowed, what is locked, and what artifact was produced.
