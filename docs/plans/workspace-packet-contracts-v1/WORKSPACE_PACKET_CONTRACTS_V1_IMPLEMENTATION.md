---
title: "Workspace Packet Contracts V1 Implementation Plan"
type: implementation-plan
status: awaiting-execution-approval
created: 2026-07-18 20:10:32 IDT +0300
updated: 2026-07-18 20:10:32 IDT +0300
owners: [DLV, Hermes]
source_of_truth:
  - "/Users/mac/Documents/Hermes Second Brain/04 Decisions/Workspace Room-Agent Ownership Matrix 2026-07-18.md"
  - "/Users/mac/Documents/Hermes Second Brain/04 Decisions/Workspace Handoff Packet Contracts 2026-07-18.md"
---

# Workspace Packet Contracts V1 Implementation Plan

> **For Hermes:** Use `subagent-driven-development` to execute this plan task-by-task. Require spec-compliance review before code-quality review. Do not let a worker edit outside the task allowlist.

**Goal:** Implement the locked Universal Packet Envelope, typed domain Packets, explicit receiver ACKs, immutable revisions, idempotency, approval binding, delivery reconciliation and Run Readback as the governed data spine of Hermes Workspace.

**Architecture:** Extend the existing `src/lib/workspace-kernel` rather than creating a competing orchestrator. Packet content is immutable and content-addressed; lifecycle state is projected from append-only events and ACK records. Local atomic persistence is implemented first, then mirrored additively to `workspace_core`; current Workspace Run V2 data and room UIs remain readable throughout the migration.

**Tech Stack:** TypeScript 5.7, Zod 3, Vitest 3, TanStack Start/Router, React 19, Node `crypto`/`fs`, Supabase Postgres/PostgREST, Playwright/browser-harness for live UI QA.

---

## 1. Approval scope

This document is a plan, not execution approval.

Execution requires a separate DLV approval for the exact milestone and allowed paths. No task in this plan authorizes:

- Etsy draft save, publish, renew, message, order or account mutation.
- Supplier contact or purchase.
- Paid ShotLab/media generation.
- Printer upload, start, pause, resume or cancel.
- Discord or other external delivery.
- Supabase migration apply to the live project.
- Git reset, rebase, merge, broad cleanup, commit or push.
- Deletion of historical files, profiles or visual assets.

## 2. Repository-grounded baseline

Captured at `2026-07-18 20:09 IDT +0300`:

- Repository: `/Users/mac/hermes-workspace`
- Branch: `main`
- HEAD: `a97f6d05`
- Upstream tracking snapshot: `origin/main`; local tracking state is behind `25`, ahead `1`.
- Dirty tree: `44` tracked deletions, `71` tracked modifications and `3159` untracked entries (`3274` total status entries).
- Current relevant code is already modified/untracked by other work. Never assume an existing diff belongs to this mission.
- Current Kernel baseline:
  - `17` test files passed.
  - `73/73` tests passed.
  - `git diff --check` passed.
- The baseline is not release readiness. It proves only that the current Kernel-focused tests pass before this mission.

### Existing seams to extend

- Core contracts: `src/lib/workspace-kernel/contracts.ts`
- Run reducer: `src/lib/workspace-kernel/reducer.ts`
- Atomic local Run store: `src/lib/workspace-kernel/store.ts`
- Existing scoped context packet: `src/lib/workspace-kernel/context-packet.ts`
- Mission spine: `src/lib/workspace-kernel/mission-spine.ts`
- Public exports: `src/lib/workspace-kernel/index.ts`
- Safe route preview/commit boundary: `src/routes/api/war-room/workspace-kernel/route-action.ts`
- Supabase mirror: `src/server/workspace-core-db.ts`
- Existing Goblin packet: `src/lib/war-room/goblin/goblin-opportunity-packet.ts`
- Existing Etsy contracts: `src/lib/war-room/living-v3/etsy-room-contracts.ts`
- Existing UI hook: `src/hooks/use-war-room-body.ts`
- Existing mission UI seam: `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`

## 3. Non-negotiable implementation invariants

1. There is one Packet engine under `workspace-kernel`; domain rooms do not invent their own lifecycle/idempotency engines.
2. `GET` remains read-only and cannot create a Packet, ACK, Run, Grant or persistence write.
3. Packet payload and immutable envelope fields are covered by `contentHash`.
4. Lifecycle status, ACK and readback are append-only records outside the hashed content body. This resolves lifecycle transitions without mutating offered content.
5. Same `idempotencyKey` + same `contentHash` returns the original result. Same key + different hash returns conflict.
6. Unsupported schema Major is blocked; the receiver never guesses.
7. Handoff is incomplete until the receiver validates and returns explicit ACK.
8. No Run can become `completed` while a required Step is unaccepted or a side effect lacks confirmed readback.
9. DLV ApprovalGrant binds exact Packet hash, action, target, scope, maximum cost and expiry.
10. Historical Run V2 state remains readable. Migration is additive and reversible.
11. Legacy profile IDs may be read for historical records but cannot receive new routing after their migration gate.
12. Main UI shows objective, owner, input/output Artifact, status, blocker, approval and next action. Hashes/raw JSON stay under Details.
13. No room geometry, map visibility or visual asset deletion is part of Packet V1.

## 4. Target file layout

```text
src/lib/workspace-kernel/packets/
  types.ts
  schemas.ts
  canonical-json.ts
  factory.ts
  lifecycle.ts
  ack.ts
  packet-store.ts
  packet-store.test.ts
  index.ts
  domain/
    execution-plan.ts
    opportunity.ts
    evidence-allowed-claims.ts
    supplier-evidence.ts
    listing-ready-draft.ts
    asset-production.ts
    print-ready.ts
    context.ts
    cost-risk-lock.ts
    roster-availability.ts
    code-automation.ts
    strategic-decision.ts
    delivery.ts
    run-readback.ts
  adapters/
    legacy-artifact.ts
    goblin-opportunity-v1.ts
    obsidian-context-v1.ts
    etsy-room-v1.ts

src/routes/api/war-room/workspace-kernel/
  packets.ts
  packet-handoff.ts
  -packets.test.ts
  -packet-handoff.test.ts

src/screens/war-room/living-v3/
  WorkspaceMissionPacketRail.tsx
  WorkspaceMissionPacketRail.test.tsx
  workspace-mission-packet-rail.css

scripts/
  capture-workspace-packet-checkpoint.mjs
  verify-workspace-packet-contracts.mjs

supabase/migrations/
  20260718200627_workspace_packet_contracts_v1.sql

docs/plans/workspace-packet-contracts-v1/
  WORKSPACE_PACKET_CONTRACTS_V1_IMPLEMENTATION.md
  HANDOFF.md
  checkpoints/
```

`routeTree.gen.ts` is generated by the normal TanStack/Vite toolchain. Do not hand-edit it.

## 5. Milestone gates

### Milestone A — Local Packet foundation

Tasks 0–6. No UI, Supabase write or domain migration.

Gate:

```bash
pnpm vitest run src/lib/workspace-kernel/packets src/lib/workspace-kernel/*.test.ts
pnpm typecheck
```

### Milestone B — First truthful vertical slice

Tasks 7–12. Implements `ExecutionPlan → Goblin Opportunity → Oracle Evidence → Etsy Draft → RunReadback` locally only.

Gate:

```bash
pnpm vitest run \
  src/lib/workspace-kernel/packets \
  src/lib/war-room/goblin \
  src/lib/war-room/living-v3/etsy-room-contracts.test.ts \
  src/lib/workspace-kernel/adapters
```

### Milestone C — Remaining room contracts

Tasks 13–18. Supplier, Asset, Print, Context, Cost/Roster/Code/Council and Delivery contracts; no live execution.

### Milestone D — Persistence and UI projection

Tasks 19–22. Supabase migration artifact, mirror adapter, compact UI rail and legacy profile routing block.

### Milestone E — Full verification and handoff

Tasks 23–24. Full suite/build/browser QA, diff review, checkpoint and execution handoff.

---

## Task 0: Capture a non-destructive pre-mutation checkpoint

**Objective:** Preserve the exact pre-mission state of every shared file this mission may touch without copying or cleaning the entire dirty repository.

**Files:**

- Create: `scripts/capture-workspace-packet-checkpoint.mjs`
- Create: `docs/plans/workspace-packet-contracts-v1/HANDOFF.md`
- Create at runtime outside repo: `~/hermes-rescue/workspace-packet-contracts-v1/<timestamp>/`

**Steps:**

1. Write the checkpoint script with an explicit allowed-path array.
2. Record branch, HEAD, upstream divergence, tracked status, complete untracked list and `git diff --binary`.
3. For each allowed existing file, copy it to the rescue directory and record byte size plus SHA-256.
4. For each intended new file, record `MISSING_BEFORE`.
5. Refuse to run if the rescue target already exists.
6. Run the script and read back `manifest.json` plus `README.md`.

**Verification:**

```bash
node scripts/capture-workspace-packet-checkpoint.mjs --label pre-milestone-a
```

Expected: a new external rescue directory, a manifest entry for every allowed path and no repository content mutation except the script/HANDOFF files themselves.

**Stop condition:** Any intended shared file changes between manifest capture and first patch. Re-capture; do not overwrite.

## Task 1: Define core Packet and lifecycle types

**Objective:** Create the single TypeScript vocabulary used by every room.

**Files:**

- Create: `src/lib/workspace-kernel/packets/types.ts`
- Create: `src/lib/workspace-kernel/packets/types.test.ts`
- Modify: `src/lib/workspace-kernel/index.ts`

**Required core shape:**

```ts
export type WorkspacePacketStatus =
  | 'draft'
  | 'ready'
  | 'offered'
  | 'accepted'
  | 'blocked'
  | 'rejected'
  | 'superseded'
  | 'cancelled'

export type WorkspacePacketType =
  | 'execution-plan'
  | 'opportunity'
  | 'evidence-allowed-claims'
  | 'supplier-evidence'
  | 'listing-ready-draft'
  | 'asset-production'
  | 'print-ready'
  | 'context'
  | 'cost-risk-lock'
  | 'roster-availability'
  | 'code-automation'
  | 'strategic-decision'
  | 'delivery-request'
  | 'delivery-readback'
  | 'run-readback'

export type UniversalPacketEnvelope<TPayload = unknown> = {
  packetId: string
  packetLineageId: string
  revision: number
  supersedesPacketId: string | null
  runId: string
  schemaVersion: string
  packetType: WorkspacePacketType
  from: { roomId: string; agentId: string | null }
  to: { roomId: string; agentId: string | null }
  createdAt: string
  sourceRefs: string[]
  evidenceRefs: string[]
  assumptions: string[]
  missingFields: string[]
  lockedActions: string[]
  approval: {
    required: boolean
    stage: string | null
    grantId: string | null
  }
  acceptanceCriteria: Array<{ criterionId: string; description: string; required: boolean }>
  idempotencyKey: string
  contentHash: string
  payload: TPayload
}
```

Lifecycle status/readback must not be mutable fields in the hashed content object. They are derived from Task 4 events.

**TDD:**

1. Write compile-time/fixture tests for all 15 Packet types and eight statuses.
2. Verify tests fail before implementation.
3. Add the minimal types and exports.
4. Verify tests pass.

## Task 2: Add strict Zod Envelope and registry schemas

**Objective:** Reject malformed Packets and unknown live-action fields at the boundary.

**Files:**

- Create: `src/lib/workspace-kernel/packets/schemas.ts`
- Create: `src/lib/workspace-kernel/packets/schemas.test.ts`

**Steps:**

1. Create strict schemas for IDs, ISO timestamps, SemVer, refs, endpoints, approval binding and acceptance criteria.
2. Create `UniversalPacketEnvelopeSchema` with `.strict()`.
3. Add `WorkspacePacketPayloadSchemaRegistry` keyed by `WorkspacePacketType`.
4. Implement `parseWorkspacePacket` and `safeParseWorkspacePacket`.
5. Test unknown top-level fields, empty IDs, invalid SemVer, invalid revision, unknown Packet type and missing required fields.
6. Test that domain payload validation is selected by `packetType`.

**Verification:**

```bash
pnpm vitest run src/lib/workspace-kernel/packets/schemas.test.ts
```

Expected: invalid Packets fail closed with field-level errors; valid fixtures pass.

## Task 3: Implement canonical JSON and content hashing

**Objective:** Produce deterministic SHA-256 hashes independent of object key order.

**Files:**

- Create: `src/lib/workspace-kernel/packets/canonical-json.ts`
- Create: `src/lib/workspace-kernel/packets/canonical-json.test.ts`
- Create: `src/lib/workspace-kernel/packets/factory.ts`
- Create: `src/lib/workspace-kernel/packets/factory.test.ts`

**Hash policy:**

Include all immutable content fields. Exclude `contentHash` itself and all derived lifecycle/ACK/readback data. Do not exclude assumptions, missing fields, locks, approval binding or acceptance criteria.

**Required API:**

```ts
export function canonicalizeWorkspacePacketContent(value: unknown): string
export function workspacePacketContentHash(packetWithoutHash: unknown): string
export function createWorkspacePacket<TPayload>(input: CreateWorkspacePacketInput<TPayload>): UniversalPacketEnvelope<TPayload>
export function reviseWorkspacePacket<TPayload>(previous: UniversalPacketEnvelope, input: ReviseWorkspacePacketInput<TPayload>): UniversalPacketEnvelope<TPayload>
```

**Tests:**

- Same semantic content with different key order produces the same hash.
- Any immutable payload/evidence/lock/target change produces a different hash.
- Revision increments, lineage remains stable and `supersedesPacketId` points to the prior Packet.
- A revision always gets a new `packetId`.

## Task 4: Implement append-only lifecycle, ACK and idempotency

**Objective:** Make Handoffs explicit, replay-safe and receiver-owned.

**Files:**

- Create: `src/lib/workspace-kernel/packets/lifecycle.ts`
- Create: `src/lib/workspace-kernel/packets/lifecycle.test.ts`
- Create: `src/lib/workspace-kernel/packets/ack.ts`
- Create: `src/lib/workspace-kernel/packets/ack.test.ts`

**Required records:**

```ts
export type WorkspacePacketLifecycleEvent = {
  eventId: string
  packetId: string
  type: 'created' | 'ready' | 'offered' | 'accepted' | 'blocked' | 'rejected' | 'superseded' | 'cancelled'
  actorRoomId: string
  actorAgentId: string | null
  createdAt: string
  reason: string | null
  payload: Record<string, unknown>
}

export type HandoffAck = {
  ackId: string
  packetId: string
  acceptedContentHash: string
  receiver: { roomId: string; agentId: string | null }
  outcome: 'accepted' | 'blocked' | 'rejected'
  checkedCriteriaIds: string[]
  missingFields: string[]
  evidenceRefs: string[]
  reason: string | null
  createdAt: string
}
```

**Rules to test:**

- Sender can mark `ready` and `offered`; receiver alone can ACK.
- `accepted` requires all required criteria and exact content hash.
- Unsupported schema Major returns blocked ACK.
- Same idempotency key/hash replays original result.
- Same idempotency key/different hash returns typed conflict.
- Offered content cannot be revised in place.
- Rejected/superseded/cancelled are terminal for that Packet ID.

## Task 5: Create an isolated atomic Packet store

**Objective:** Persist Packets and append-only lifecycle records without breaking `workspace-kernel-v2` Run state.

**Files:**

- Create: `src/lib/workspace-kernel/packets/packet-store.ts`
- Create: `src/lib/workspace-kernel/packets/packet-store.test.ts`

**Runtime files:**

```text
data/workspace-kernel/packets-v1.json
data/workspace-kernel/packet-events-v1.jsonl
data/workspace-kernel/handoff-acks-v1.jsonl
```

**Rules:**

- Schema: `workspace-packet-store-v1`.
- Atomic temp-write + rename.
- Store Packets by `packetId`; enforce unique `(packetLineageId, revision)`.
- Preserve append-only events/ACKs; deduplicate only exact IDs.
- A corrupt store is returned as a blocked diagnostic and is never silently overwritten with an empty store.
- Existing Run store files remain untouched.

**Tests:**

- Empty load.
- Save/readback.
- Replay merge.
- idempotency conflict.
- corrupt JSON fail-closed.
- interrupted temp file does not replace last good state.
- retention never drops Packets referenced by an active Run.

## Task 6: Add ExecutionPlan and RunReadback domain schemas

**Objective:** Make Hermes routing and final completion proof typed before migrating domain rooms.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/execution-plan.ts`
- Create: `src/lib/workspace-kernel/packets/domain/execution-plan.test.ts`
- Create: `src/lib/workspace-kernel/packets/domain/run-readback.ts`
- Create: `src/lib/workspace-kernel/packets/domain/run-readback.test.ts`

**ExecutionPlan required fields:** objective, request summary, scope in/out, constraints, ordered/parallel Step graph, dependencies, room/agent owner, input/output Packet types, approval gates, acceptance criteria, stop conditions and retry policy.

**RunReadback rules:**

- One Packet per Run.
- `completed` requires every required Step ACK = accepted.
- Every side-effect Step requires confirmed Delivery/Action Readback.
- Partial success maps to `partially_completed`, never `completed`.
- Late reconciliation creates a revision in the same lineage.

## Task 7: Bridge Packet references into WorkspaceRun without breaking V2

**Objective:** Let existing Runs reference new Packets while historical V2 Runs remain readable.

**Files:**

- Modify: `src/lib/workspace-kernel/contracts.ts`
- Modify: `src/lib/workspace-kernel/reducer.ts`
- Modify: `src/lib/workspace-kernel/reducer.test.ts`
- Modify: `src/lib/workspace-kernel/mission-spine.ts`
- Modify: `src/lib/workspace-kernel/mission-spine.test.ts`

**Additive fields:**

```ts
executionPlanPacketId?: string
packetRefs?: string[]
runReadbackPacketId?: string
```

**New Run event types:**

```text
packet.created
packet.ready
packet.offered
packet.acknowledged
packet.blocked
packet.rejected
packet.superseded
```

**Rules:**

- Do not change the stored `workspace-kernel-v2` discriminator in this task.
- Existing Runs with no Packet refs render exactly as before.
- New Runs create an ExecutionPlan Packet before room work begins.
- `completeWorkspaceRun` must refuse completion when required Packet proof is absent; expose a typed blocked result instead of silently completing.

## Task 8: Add authenticated read/create and Handoff API routes

**Objective:** Expose the Packet engine through safe server boundaries.

**Files:**

- Create: `src/routes/api/war-room/workspace-kernel/packets.ts`
- Create: `src/routes/api/war-room/workspace-kernel/-packets.test.ts`
- Create: `src/routes/api/war-room/workspace-kernel/packet-handoff.ts`
- Create: `src/routes/api/war-room/workspace-kernel/-packet-handoff.test.ts`

**API contract:**

- `GET /api/war-room/workspace-kernel/packets?runId=...` is read-only and `cache-control: no-store`.
- `POST .../packets` creates a local `draft` or `ready` Packet after auth, strict schema validation and idempotency check.
- `POST .../packet-handoff` supports typed `offer` or `ack`; no generic arbitrary action string.
- No endpoint executes a domain side effect.

**Negative tests:** unauthorized, malformed JSON, unknown fields, unsupported Major, wrong receiver, missing acceptance proof, same key/different hash, and GET mutation check.

## Task 9: Migrate Goblin Opportunity through an adapter

**Objective:** Preserve the verified Goblin implementation while moving envelope concerns into the shared engine.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/opportunity.ts`
- Create: `src/lib/workspace-kernel/packets/domain/opportunity.test.ts`
- Create: `src/lib/workspace-kernel/packets/adapters/goblin-opportunity-v1.ts`
- Create: `src/lib/workspace-kernel/packets/adapters/goblin-opportunity-v1.test.ts`
- Modify narrowly: `src/lib/war-room/goblin/goblin-opportunity-packet.ts`
- Modify narrowly: `src/lib/war-room/goblin/goblin-opportunity-packet.test.ts`

**Rules:**

- One Packet per candidate, grouped by `researchBatchId`.
- Every metric has value/unit/time/source or evidence ref.
- Every score references observed metrics and includes reason.
- Hypotheses are separate from observations.
- Envelope owns status, sources, evidence, missing fields, locks and receiver.
- Existing Goblin packet API remains through a compatibility adapter for one migration release.

## Task 10: Implement Oracle Evidence/Allowed Claims

**Objective:** Replace overall PASS with claim-level truth.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/evidence-allowed-claims.ts`
- Create: `src/lib/workspace-kernel/packets/domain/evidence-allowed-claims.test.ts`

**Required Claim fields:** claim ID/text, verdict, evidence refs, confidence, allowed wording, forbidden wording, conditions, caveats and optional recheck time.

**Acceptance rules:**

- Mixed verdicts are allowed only when core Product Truth is complete.
- Unsupported/unknown wording is locked.
- Conditional wording creates mandatory downstream constraints.
- Missing identity/material/dimensions/variant/safety/compliance truth blocks the whole Packet when relevant.

## Task 11: Implement SupplierEvidence and ListingReadyDraft

**Objective:** Complete the commerce chain without enabling marketplace writes.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/supplier-evidence.ts`
- Create: `src/lib/workspace-kernel/packets/domain/supplier-evidence.test.ts`
- Create: `src/lib/workspace-kernel/packets/domain/listing-ready-draft.ts`
- Create: `src/lib/workspace-kernel/packets/domain/listing-ready-draft.test.ts`
- Create: `src/lib/workspace-kernel/packets/adapters/etsy-room-v1.ts`
- Create: `src/lib/workspace-kernel/packets/adapters/etsy-room-v1.test.ts`

**Supplier rules:** one supplier offer + exact variant per Packet; `family_only` and image similarity cannot become verified source match.

**Listing rules:** one intended Etsy listing + shop per Packet; variants are nested. `ready` requires truthful complete required fields, dimensions with units, media order/alt text, claim enforcement and QA. Unknown required truth blocks. Publish remains locked.

## Task 12: Prove the first local vertical slice

**Objective:** Demonstrate `ExecutionPlan → Opportunity → Evidence → Listing Draft → RunReadback` with ACKs and no external action.

**Files:**

- Create: `src/lib/workspace-kernel/packets/vertical-slice-commerce.test.ts`

**Test scenario:**

1. Hermes creates ExecutionPlan.
2. Goblin produces two candidate Packets in one research batch.
3. Oracle accepts one and blocks one with missing evidence.
4. Etsy accepts a complete Draft Packet and blocks an unknown-required-field revision.
5. Hermes cannot complete while a required ACK is blocked.
6. After corrected revision and ACK, RunReadback becomes `completed`.
7. Verify external/live action count remains zero.

## Task 13: Implement AssetProduction and PrintReady

**Objective:** Add Hephaestus and Terra Artifact contracts with strict QA gates.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/asset-production.ts`
- Create: `src/lib/workspace-kernel/packets/domain/asset-production.test.ts`
- Create: `src/lib/workspace-kernel/packets/domain/print-ready.ts`
- Create: `src/lib/workspace-kernel/packets/domain/print-ready.test.ts`

**Asset gate:** all required items approved, item/set Visual QA, lifecycle refs and finality. Temporary/candidate is not Final.

**Print gate:** exact model/version/checksum, Model QA, plate/Slicer QA and G-code validation for exact printer/material/nozzle/profile. `ready` never means upload/start.

## Task 14: Migrate scoped ContextPacket

**Objective:** Adapt the current Obsidian context implementation to the Universal Envelope without regressing its compact local-only behavior.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/context.ts`
- Create: `src/lib/workspace-kernel/packets/domain/context.test.ts`
- Create: `src/lib/workspace-kernel/packets/adapters/obsidian-context-v1.ts`
- Create: `src/lib/workspace-kernel/packets/adapters/obsidian-context-v1.test.ts`
- Modify narrowly: `src/lib/workspace-kernel/context-packet.ts`
- Modify narrowly: `src/lib/workspace-kernel/context-packet.test.ts`

**Rules:** per Step/receiver; ranked sources; provenance; contradictions; excluded scope; redaction. Freshness is per item: durable, TTL or revalidate-on-use. No raw vault dump or writeback.

## Task 15: Implement CostRiskLock and ApprovalGrant

**Objective:** Bind DLV approvals to exact actions and prevent broad reusable approval.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/cost-risk-lock.ts`
- Create: `src/lib/workspace-kernel/packets/domain/cost-risk-lock.test.ts`
- Create: `src/lib/workspace-kernel/packets/approval-grant.ts`
- Create: `src/lib/workspace-kernel/packets/approval-grant.test.ts`
- Modify narrowly: `src/lib/workspace-kernel/contracts.ts`
- Modify narrowly: `src/lib/workspace-kernel/reducer.ts`

**Tests:** hash/action/target/scope/cost binding, expiry, one-time use, revision invalidation and stage separation. Draft Save ≠ Publish; Upload ≠ Start; Message Draft ≠ Send.

## Task 16: Implement Roster, Code and Council Packets

**Objective:** Cover Pantheon, Daedalus and Council without conflating identity, execution or routing.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/roster-availability.ts`
- Create: `src/lib/workspace-kernel/packets/domain/roster-availability.test.ts`
- Create: `src/lib/workspace-kernel/packets/domain/code-automation.ts`
- Create: `src/lib/workspace-kernel/packets/domain/code-automation.test.ts`
- Create: `src/lib/workspace-kernel/packets/domain/strategic-decision.ts`
- Create: `src/lib/workspace-kernel/packets/domain/strategic-decision.test.ts`

**Rules:**

- Roster is a short-TTL snapshot for one routing decision; Pantheon reports, Hermes assigns.
- Code Packet is one change set/Step with scope, diff, tests, checkpoint and rollback; no commit/push.
- Council Packet is one Decision Question with all advisor responses, abstentions and dissent; Julius summarizes, DLV decides.

## Task 17: Implement Delivery request/readback and reconciliation

**Objective:** Model Gateway delivery safely while keeping all live delivery disabled.

**Files:**

- Create: `src/lib/workspace-kernel/packets/domain/delivery.ts`
- Create: `src/lib/workspace-kernel/packets/domain/delivery.test.ts`
- Create: `src/lib/workspace-kernel/packets/delivery-reconciliation.ts`
- Create: `src/lib/workspace-kernel/packets/delivery-reconciliation.test.ts`

**Rules:** one destination/account/action per Packet; batch ID is UI grouping only. `confirmed_delivered` requires external handle and readback. `unknown_outcome` blocks retry until reconciliation proves delivered or absent. Tests must use fake in-memory connectors only.

## Task 18: Add the full Packet schema verifier

**Objective:** Prevent a domain contract from silently disappearing or drifting.

**Files:**

- Create: `scripts/verify-workspace-packet-contracts.mjs`
- Create: `src/lib/workspace-kernel/packets/contract-registry.test.ts`
- Modify: `package.json`

**Package script:**

```json
"qa:packet-contracts": "node scripts/verify-workspace-packet-contracts.mjs && vitest run src/lib/workspace-kernel/packets"
```

**Verifier checks:** all 15 Packet types registered; each has schema, fixture and acceptance test; no duplicate type; schema Major supported; strict unknown-field rejection; no live-action field outside Delivery/CostRisk/Approval structures.

## Task 19: Add an additive Supabase Packet schema migration

**Objective:** Persist Packets as first-class records without repurposing Goblin-only handoff rows or mutating current production data.

**Files:**

- Create: `supabase/migrations/20260718200627_workspace_packet_contracts_v1.sql`
- Create: `src/server/workspace-packet-db.ts`
- Create: `src/server/workspace-packet-db.test.ts`
- Modify narrowly: `src/server/workspace-core-db.ts`

**Additive tables:**

```text
workspace_core.packets
workspace_core.packet_lifecycle_events
workspace_core.handoff_acks
workspace_core.approval_grants
```

**Database rules:**

- Unique Packet ID.
- Unique `(packet_lineage_id, revision)`.
- Unique idempotency key; application verifies hash equality and returns conflict otherwise.
- Immutable Packet content columns; lifecycle in event table.
- RLS enabled with no anon/authenticated policy in foundation stage.
- Explicit service-role grants only.
- No delete migration and no backfill mutation in V1.
- Existing `goblin_analytics.workspace_handoffs` remains untouched; an adapter may read it during transition.

**Gate:** Generate and inspect SQL; run against disposable/local or explicitly approved staging only. Do not apply to the live Supabase project without a separate DLV approval and pre/post row-count readback.

## Task 20: Mirror Packets with local-first fallback

**Objective:** Extend current Supabase mirroring while preserving a working local source when Supabase is disabled/unavailable.

**Files:**

- Modify: `src/server/workspace-packet-db.ts`
- Modify: `src/server/workspace-core-db.ts`
- Create: `src/server/workspace-packet-db.integration.test.ts`

**Tests:** Vitest defaults to no Supabase, local fallback is truthful, secrets are redacted, replay is idempotent, conflict is surfaced, and a Supabase error cannot erase local Packet state.

## Task 21: Replace hardcoded mission steps with Packet projection

**Objective:** Make the visible mission rail derive from ExecutionPlan, current Packet lifecycle and ACKs.

**Files:**

- Modify: `src/lib/workspace-kernel/mission-spine.ts`
- Modify: `src/lib/workspace-kernel/mission-spine.test.ts`
- Create: `src/screens/war-room/living-v3/WorkspaceMissionPacketRail.tsx`
- Create: `src/screens/war-room/living-v3/WorkspaceMissionPacketRail.test.tsx`
- Create: `src/screens/war-room/living-v3/workspace-mission-packet-rail.css`
- Modify narrowly: `src/screens/war-room/living-v3/LivingWarRoomV3.tsx`

**Primary UI fields:** Step, owner, room, input Artifact, output Artifact, status, blocker, approval and next action.

**Details only:** Packet ID, lineage, revision, hash, raw schema errors, evidence/source refs and full ACK body.

**Stable QA markers:**

```text
data-workspace-packet-rail="v1"
data-packet-step-status
data-packet-handoff-status
data-packet-approval-status
data-packet-details-collapsed="true"
```

No map geometry change, room hiding, debug wall or toy counter.

## Task 22: Block new routing to retired duplicate profiles

**Objective:** Apply the locked ownership map without deleting historical records or assets.

**Files:**

- Modify narrowly after fresh read: `src/lib/war-room/body/worker-profiles.ts`
- Modify narrowly after fresh read: `src/lib/war-room/living-v3/living-v3-contract.ts`
- Modify narrowly after fresh read: `src/lib/workspace-kernel/mission-spine.ts`
- Modify matching tests in those directories.

**Migration policy:**

- Historical IDs remain readable through an explicit alias/deprecation registry.
- New routing is blocked for Signal Runner, Merchant Scout, Atlantis Archivist, Treasury Guardian and Athena Agent.
- Goblin receives new discovery routing.
- Ares/Aphrodite remain visual Companions and never enter the Roster candidate list.
- Roster Keeper remains a System Service.
- Athena media remains `keep-until-replaced`; no asset deletion.
- Existing `run-athena` compatibility route is first changed to typed `410 retired`/migration guidance only after fresh call-site search and explicit subtask approval. Do not silently remove it.

## Task 23: Run the verification ladder

**Objective:** Prove behavior from pure contracts through the live UI without enabling external actions.

**Focused gates:**

```bash
pnpm qa:packet-contracts
pnpm vitest run src/lib/workspace-kernel
pnpm vitest run src/lib/war-room/goblin
pnpm vitest run src/lib/war-room/body
pnpm vitest run src/lib/war-room/living-v3
pnpm vitest run src/routes/api/war-room/workspace-kernel
pnpm typecheck
pnpm lint:budget
pnpm build
git diff --check
```

**API proof:** authenticated GET is read-only; POST requires auth/idempotency; replay/conflict/unsupported Major/wrong receiver/missing ACK all behave as specified.

**Browser QA route:**

```text
http://127.0.0.1:3000/war-room?etsyOps=1&bodyRuntime=1
```

**Browser checks:** desktop and phone; all rooms remain visible; Packet rail is compact; Details collapsed; status colors readable in three seconds; IDs remain LTR; no broken media; no console errors; no failed internal requests; no forbidden external requests; publish/send/spend/print controls remain locked.

**Baseline comparison:** report newly passing/failing tests relative to the captured `73/73` Kernel baseline. Do not claim full green if warning budget or unrelated pre-existing failures remain.

## Task 24: Diff review, post-checkpoint and execution handoff

**Objective:** Produce auditable proof and a safe continuation point.

**Steps:**

1. Inspect `git diff --stat` and full diffs only for allowed paths.
2. Scan changed files for secrets, debug output, merge markers, TODO/FIXME/HACK and generated junk.
3. Re-run the checkpoint script with `--label post-milestone-<x>`.
4. Compare pre/post hash manifests and confirm every changed path is allowed.
5. Update `docs/plans/workspace-packet-contracts-v1/HANDOFF.md` with actual commands/results, blockers and next exact action.
6. Update the Obsidian project, decision, hot, log and daily pages with concise proof.
7. Do not commit or push unless DLV separately approves an exact file manifest.

---

## 6. Rollback strategy

Rollback is per milestone, never repository-wide.

1. Freeze Packet mutation endpoints; keep read paths available.
2. Restore only files listed in the milestone pre-checkpoint from the external rescue copy.
3. Quarantine new runtime Packet store files; do not delete them.
4. Keep existing Run V2 state untouched.
5. If Supabase migration was applied in an approved environment, disable Packet mirror in config first. A reverse SQL migration requires separate approval and row-count backup; never drop tables automatically.
6. Re-run the exact pre-milestone focused tests and browser smoke.
7. Record rollback proof and hashes in `HANDOFF.md` and Obsidian.

## 7. Stop conditions

Stop immediately and write a checkpoint if any occurs:

- An allowed shared file changed after the pre-checkpoint.
- A worker attempts to edit outside its task allowlist.
- Packet creation mutates state during GET.
- Same key/different hash does not return conflict.
- Offered content changes in place.
- A receiver can be ACKed by the sender.
- A Run reaches `completed` without required ACK/readback.
- A live/external action becomes reachable.
- A test run touches live Supabase, Etsy, Discord, supplier, ShotLab or printer systems.
- Browser QA shows missing rooms, broken map interaction or debug content in the primary view.
- Context pressure becomes too high to preserve exact repo state.

## 8. Recommended execution order

1. Approve Milestone A only.
2. Execute Tasks 0–6 with one implementation subagent per task and two-stage review.
3. Review the actual diff and gates with DLV.
4. Approve Milestone B only after Milestone A proof.
5. Continue milestone-by-milestone; never approve all database/UI/profile migration work as one batch.

## 9. Definition of done for Packet Contracts V1

Packet Contracts V1 is complete only when:

- All locked Packet types exist in one registry and validate strictly.
- Lifecycle, ACK, versioning, idempotency and content hashing pass positive and negative tests.
- Existing Run V2 data remains readable.
- The first commerce vertical slice completes only with valid ACKs.
- Remaining room contracts have fixtures and acceptance tests.
- ApprovalGrant and Delivery reconciliation are enforced.
- Local atomic persistence and optional Supabase mirror have readback.
- The UI shows practical Step/Artifact/Approval/next-action state with technical details collapsed.
- Retired profiles cannot receive new routing, while historical records and assets remain readable.
- Full required tests/build/browser QA and pre/post manifests are recorded.
- No live side effect, unapproved migration, deletion, commit or push occurred.
