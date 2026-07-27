# Logical Session Card Management: Design and Implementation Plan

## Goal

Make the **Session Card** the only user-facing conversation unit in the Chat sidebar.

A Session Card represents one logical parent conversation across its backend storage segments. It owns the user-visible title, pin state, context-menu actions, activity, and main-chat selection. Compression continuations are hidden implementation details of that card. Delegated/subagent sessions remain visible as a tree beneath the card, but do not split, replace, or contaminate the parent conversation.

This plan extends the existing lineage work. It deliberately changes the current limitation documented in `docs/session-lineage.md`: selected continuations must now produce one continuous parent transcript rather than merely a collapsed sidebar row.

## Product contract

### Replacement policy

This is a clean replacement of the Chat session-management UI. Do not retain,
bridge, migrate, or provide fallback behavior for the former per-session UI:

- no per-segment sidebar rows, routes, action menus, pin records, or title records;
- no import of old browser title/pin/pending-send state into the card model;
- no legacy Chat session-list endpoint or alternate rendering path;
- no direct navigation from a user-visible URL to an individual continuation segment.

Only backend session records and their validated lineage facts remain inputs to
the new Session Card projection. They are data, not retained UI behavior.

### One logical parent card

- The Sessions section displays exactly one top-level card for each independent logical conversation.
- A card has a stable `cardId`, distinct from the mutable backend session key used to send the next turn.
- The card title is stable across compression continuations. Its source precedence is:
  1. a user-entered manual title;
  2. an auto-generated title;
  3. the stable default title, `New conversation`.
- Backend segment labels may be mirrored for search/interoperability, but are not the authority for the Session Card title.
- Route selection, React Query keys, pending-send state, and persisted run state must use `cardId` for the user-facing conversation and retain the active backend segment key separately.

### Continuations are invisible

- A compression continuation is neither a top-level card nor a child row.
- The card may optionally expose quiet status text such as `Continued · 3 segments`; it must not expose a separate title, action menu, pin, or selectable session row for any segment.
- The Chat UI navigates only by `cardId`; continuation segment routes are removed from the user-facing route contract.
- The right-hand parent pane renders the ordered, de-duplicated history of all confirmed continuation segments as one continuous transcript.

### Delegates and subagents remain visible children

- A `child_session`, cross-surface child, or delegated/subagent session is a child activity node under the owning parent card.
- The child node exposes only relationship-specific information: name/status, running/completed/failed state, activity, and an optional inspection affordance.
- A child transcript is never merged into the parent transcript. The normal parent pane remains the parent conversation before, during, and after delegation.
- Inspecting a child is secondary state (`inspectedChildSessionKey`) within the selected parent card. It does not select a separate top-level session, replace the card route, or change the Session Card's title/actions. Closing inspection returns to the continuous parent transcript.
- Missing parents, cycles, source mismatches, and unknown relationships remain visible as safe orphan cards. They are never attached by title matching or guessed lineage.

### All user actions belong to the Session Card

Pinning, unpinning, renaming, auto-naming, branching, deletion/archive, sharing, and future card-level actions are presented from the parent Session Card header/context menu, not from a continuation segment or child node.

- **Rename / auto-name:** update card metadata, keyed by `cardId`; do not write only the current segment's title.
- **Pin:** pin `cardId`. Pinning a card never promotes or separately pins a child/subagent node.
- **Branch:** branch the logical parent conversation from its current canonical continuation tip. The created branch becomes a child card/activity node under the parent card; it never branches a delegate by accident.
- **Delete/archive:** present one card-scoped destructive action with explicit copy describing its scope. Do not loop through segment deletion APIs partially. Until an upstream atomic logical-conversation delete contract exists, implement this action as card archival/hiding in Workspace metadata, with a separate explicitly labeled backend-delete flow only when the backend can report complete success.
- Child nodes have no ordinary session action menu. Any future child-specific operation must be a named, relationship-aware action with clear scope rather than reusing the parent-card menu.

## Terminology and identities

| Term                       | Meaning                                                                                                                            | Stable across continuations? |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `cardId`                   | Workspace logical-conversation identity. Prefer a validated lineage root ID; otherwise use the first validated segment/anchor key. | Yes                          |
| `canonicalSegmentKey`      | The current backend session key that receives parent sends and live parent stream events.                                          | No                           |
| `segmentKey`               | A concrete backend session record in a confirmed continuation component.                                                           | No                           |
| `childSessionKey`          | A delegated/subagent/branch backend record attached to a card, with its own transcript.                                            | N/A                          |
| `inspectedChildSessionKey` | Ephemeral UI state for optional child transcript inspection.                                                                       | N/A                          |

`parent_session_id` alone must never establish a card relationship. A continuation requires backend-authoritative continuation metadata, compatible sources, and a valid lifecycle boundary; explicit forks and `child_session` records are never continuations.

## Architecture

### 1. Add a card projection layer

Keep `src/screens/chat/session-lineage.ts` as the low-level, pure relationship classifier and continuation-component builder. Add a separate, pure card projection module, for example `src/screens/chat/session-cards.ts`.

Input:

- normalized `SessionMeta` rows and their existing `lineage` facts;
- durable Workspace card metadata;
- active route/card state and expanded-card state.

Output:

```ts
type SessionCard = {
  cardId: string
  title: string
  titleSource: 'default' | 'auto' | 'manual'
  canonicalSegmentKey: string
  continuationSegmentKeys: string[]
  continuationCount: number
  relationshipKind: 'root' | 'branch' | 'child' | 'orphan'
  parentCardId?: string
  childNodes: SessionCardChild[]
  updatedAt: number
  archived: boolean
}

type SessionCardChild = {
  sessionKey: string
  relationshipKind: 'branch' | 'child'
  title: string
  status: 'idle' | 'running' | 'complete' | 'error'
  updatedAt: number
  continuationCount: number
}
```

The projection must preserve the safety properties already present in `buildSessionTree()`:

- only union confirmed continuation edges;
- select a tip using declared tip, segment count, snapshot status, and activity;
- map every confirmed hidden segment to one visible card;
- bind child/branch nodes to the visible parent card, not to an arbitrary hidden continuation;
- bound depth and make unsafe relationships visible orphans;
- sort deterministically.

`SessionTreeRow` is then a rendering detail of `SessionCard`, rather than the durable identity behind a card. Card identity, titles, pins, and actions are defined only by the new card model.

### 2. Persist card metadata server-side

Replace the current title-only browser store (`src/screens/chat/session-title-store.ts`) with a versioned Workspace metadata store under `getStateDir()` from `src/server/workspace-state-dir.ts`.

Store only list-safe metadata:

```ts
type PersistedSessionCard = {
  cardId: string
  manualTitle?: string
  autoTitle?: string
  updatedAt: number
  archivedAt?: number
}
```

Requirements:

- atomic write/rename, validation on read, bounded record size, and corruption-safe startup behavior;
- no transcript text, attachments, tool output, credentials, or model configuration;
- manual title wins over auto title, and auto title wins over the default;
- do not import, reuse, or translate the old per-session browser title store. The Session Card store is the sole title authority.

### 3. Card-scoped APIs

Replace the Chat UI's raw session-list contract with authenticated Workspace routes that expose only card semantics:

- `GET /api/session-cards`: card projection, child activity metadata, canonical segment key, title source, and safe card aliases.
- `PATCH /api/session-cards/:cardId`: manual title, auto title, or archive state. The server validates title length/source and writes the card store before best-effort backend-label mirroring.
- `GET /api/session-cards/:cardId/history`: ordered parent-only history across verified continuation segments, with cursor/limit paging and a returned `canonicalSegmentKey`.
- `POST /api/session-cards/:cardId/branch`: obtain the latest canonical parent segment, invoke the supported backend whole-conversation fork capability, and attach the returned branch as a card child.
- `POST /api/session-cards/:cardId/archive`: archive/hide the card in Workspace metadata. Do not imply remote deletion.

Each route validates the card against a freshly normalized/session-lineage-projected list. A client-provided segment key, title, or parent ID is never sufficient to construct a relation.

### 4. Continuous parent history

The current `fetchHistory()` and `/api/history` request one `sessionKey` and call `getMessages(sessionKey)`. That cannot meet the continuous-card requirement by itself.

Implement `fetchSessionCardHistory()` and a card-history React Query key such as:

```ts
;['chat', 'card-history', cardId, canonicalSegmentKey, cursor]
```

The server history assembler must:

1. resolve the card from a fresh safe projection;
2. retrieve only its confirmed continuation members, oldest to newest;
3. fetch each segment's messages through the server adapter or a backend lineage-history capability when one becomes available;
4. use stable upstream message IDs for boundary de-duplication and preserve original timestamp/order semantics;
5. never fetch or merge branch/delegate/child messages;
6. return segment provenance internally for diagnostics but not render storage-segment separators in the default parent transcript;
7. return pagination/cursor information without silently dropping old segments.

If a backend cannot retrieve the complete confirmed component, the API must return an explicit completeness state. It must not fabricate a continuous transcript by guessing from titles or joining unverified records. The parent pane may render the available canonical history with a non-sensitive recovery state and retry affordance, but it must preserve the selected card and never substitute a child's history.

Pending sends, recovery messages, and persisted run data are keyed by `(cardId, canonicalSegmentKey, runId)`. The card key prevents a continuation rotation from losing visible parent state; the concrete segment key keeps backend persistence unambiguous.

### 5. Safe live-stream routing

Current `resolveAuthoritativeStreamHandoff()` accepts any changed `data.session_id`. That is too broad: a multiplexed delegate session could take over the parent pane.

Replace it with an asynchronous validated-card-handoff flow:

1. retain the original parent `cardId`, canonical segment, and run ID when `/api/send-stream` starts;
2. when an upstream event names a different session ID, look up/refresh its normalized lineage facts;
3. accept the new ID as the new canonical parent segment only if it is a confirmed continuation in the same `cardId` (or the backend's latest-descendant capability confirms that exact relation);
4. atomically migrate the active persisted run from old canonical segment to the successor while retaining `cardId`;
5. emit `card_handoff` with `{ cardId, fromSegmentKey, canonicalSegmentKey, runId }`, not a generic navigation event;
6. for a child/delegate/branch event, leave the parent stream target and route untouched. Publish card-child activity/status keyed by the parent card instead;
7. for unknown/malformed/cross-source events, preserve the existing parent segment and record a recoverable diagnostic only.

The browser must similarly reject stale card events and must not abort the stream reader merely because the canonical segment changes. Existing session-handoff cancellation/rerender regressions remain required coverage.

### 6. Card-oriented UI

Update the desktop sidebar, mobile sessions panel, and compact chat header to consume `SessionCard` projection data.

Desktop card layout:

```text
Sessions
  [pin] Project planning                         [Card actions]
        Continued · 3 segments
        Delegates (2)                         [disclosure]
          Research delegate · running          [inspect]
          Test delegate · complete             [inspect]
```

- The parent row/card has the title, active state, pin, and one accessible card action menu.
- Delegates are nested within an expandable group; continuation segments are not rendered.
- Card expansion state is keyed by `cardId`, not a selected continuation tip.
- Pinned cards render as whole cards. A child never promotes its root or siblings into the pinned section.
- Mobile reuses the same card projection and has the same action ownership/accessibility model.
- The chat header displays the parent-card title and continuation status. While a child is inspected, it adds a clear `Back to parent conversation` control without changing the selected card.

Route state uses a card route (for example `/chat/cards/:cardId`) that separates stable `cardId` from `canonicalSegmentKey`. Do not expose storage segments in the visible route.

## Implementation slices

Implement in small, independently reviewable commits. Every slice starts with failing tests and applies the Session Card contract to every supported session source.

### Slice 1: Define card domain types and pure projection

Files:

- create `src/screens/chat/session-cards.ts` and tests;
- extend `src/screens/chat/types.ts` with `SessionCard` and `SessionCardChild` view models;
- reuse, do not duplicate, `classifySessionRelationship()` and `buildSessionTree()`.

Tests:

- three confirmed continuation segments produce one card with one canonical segment;
- branch/delegate nodes attach under the card and are never continuation members;
- a delegate whose parent is a hidden segment attaches to the visible parent card;
- invalid/cyclic/missing relations become safe orphan cards;
- card ID, ordering, and active mapping are stable through a refreshed continuation tip.

### Slice 2: Add persisted card metadata

Files:

- create `src/server/session-card-store.ts` and tests;
- create card metadata route tests;
- replace title-store client access with card-aware query/hooks incrementally.

Tests:

- default → auto → manual precedence;
- manual title survives a new continuation segment;
- corruption/read/write failures fail safely without losing the default display title;
- the former per-session browser title store is ignored and cannot affect card titles;
- child title changes cannot overwrite the parent card title.

### Slice 3: Add card APIs and card-scoped actions

Files:

- create `src/routes/api/session-cards/index.ts` and card-specific route modules following existing route conventions;
- replace `useRenameSession` with `useSessionCardActions`;
- add a card-aware auto-title hook based on the first visible parent user turn.

Tests:

- authorization and JSON-content checks are defined directly on the new card routes;
- rename/pin/branch/archive carry `cardId`, never a child or hidden segment key;
- branch resolves the canonical parent segment and rejects unsupported/malformed backend responses;
- archive does not delete remote segments.

### Slice 4: Implement continuous card history

Files:

- create server card-history resolver/route and tests;
- add card-history queries and replace `useChatHistory` for Chat routes;
- key pending/recovery message state exclusively by card identity and canonical segment.

Tests:

- ordered messages from a three-segment continuation chain render once in the parent history;
- duplicate boundary messages are removed only when stable IDs match;
- a child/branch transcript is absent from parent history;
- incomplete backend history reports a safe incomplete state rather than combining untrusted segments;
- pagination retains chronological ordering across a segment boundary.

### Slice 5: Restrict live handoffs to the parent card

Files:

- replace the generic resolver in `src/routes/api/-send-stream-session-handoff.ts`;
- update `src/routes/api/send-stream.ts`, `src/server/run-store.ts`, streaming hooks, and behavior tests.

Tests:

- a same-card confirmed continuation updates canonical segment without a route/card change;
- a child/subagent `session_id` event leaves the selected parent card and parent stream target intact;
- a branch/cross-surface/unknown successor is rejected as a parent handoff;
- run migration is atomic or leaves the old parent run recoverable;
- the reader remains active across card handoff/rerender.

### Slice 6: Render the Session Card on desktop, mobile, and header

Files:

- refactor `sidebar-sessions.tsx`, `session-tree-row.tsx`, `mobile-sessions-panel.tsx`, and `chat-header.tsx` around card models;
- add child inspection UI/state without child action menus.

Tests:

- one parent card remains selected through a delegate lifecycle;
- only the card exposes rename/pin/branch/archive actions;
- continuation segments have no rendered action menus or rows;
- pinning a card leaves delegates nested under it and never independently pins them;
- keyboard/ARIA behavior covers card disclosure, delegate disclosure, card menu, and child inspection.

### Slice 7: Card routing and full regression gate

Files:

- replace chat routes, canonical navigation, realtime history, and persistence tests with card semantics;
- update documentation and credential-free manual verification.

Tests:

- card selection remains stable while its canonical segment rotates;
- refresh during a continuation preserves card title, title source, pinned state, and parent history;
- a subagent stream cannot replace the parent pane;
- every supported session source uses the Session Card contract; no alternate legacy sidebar flow remains;
- desktop and mobile show equivalent card hierarchy and actions.

## Acceptance criteria

The feature is ready when all of the following are true:

1. One parent Session Card is shown for each logical conversation, with a stable manual/auto/default title.
2. Selecting that card renders continuous parent history across validated continuation segments and continues to target the canonical segment for new turns.
3. A delegate or subagent appears under the selected card as status/inspectable child activity, never as a competing top-level chat or parent-stream handoff.
4. Continuations are not individually visible, selectable, pinnable, renamable, branchable, or deletable.
5. Pinning, renaming, auto-naming, branching, and archive/delete behavior originate from the parent Session Card and use `cardId` semantics.
6. No child/branch/subagent transcript is merged into the continuous parent transcript.
7. Invalid lineage never hides a session, creates a false card, or silently moves parent traffic to an unrelated session.
8. Focused unit/route/component behavior tests, `pnpm test`, `pnpm exec tsc --noEmit --pretty false`, lint, production build, Prettier, and `git diff --check` pass.

## Non-goals

- Reimplementing or copying Hermes WebUI markup.
- Treating `parent_session_id` as sufficient relationship proof.
- Merging branch or child/delegate transcripts into the parent transcript.
- Exposing a per-segment session menu.
- Remote destructive deletion without an upstream atomic logical-conversation contract.
- Storing private transcript/tool/credential data in card metadata.
