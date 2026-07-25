# Session Lineage Management Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make PickNik Hermes Workspace treat compression continuations, explicit branches, and delegated/subagent sessions as distinct, navigable relationships while retaining the Workspace visual language rather than copying hermes-webui's UI.

**Architecture:** Preserve relationship facts from Hermes through the adapter, Workspace session route, React Query types, and normalization. Centralize all classification and tree projection in a pure, tested `session-lineage` module; sidebar and mobile components render its typed view-model rather than reimplementing lineage rules. Resolve a selected session to the backend-confirmed continuation tip before history/send operations, and expose whole-conversation branching only when the selected transport advertises support.

**Tech Stack:** TypeScript, TanStack Start routes, React 19, TanStack Query/Router, Vitest, existing Hermes gateway/dashboard adapters.

---

## Current evidence and constraints

- Workspace currently receives `parent_session_id` in `src/server/claude-api.ts:35-51` and `src/server/claude-dashboard-api.ts:3-22`, but `toSessionSummary()` removes it in `src/server/claude-api.ts:322-357` and `normalizeSessions()` cannot retain it in `src/screens/chat/utils.ts:210-272`.
- The current sidebar is a flat map of `SessionMeta` entries (`src/screens/chat/components/sidebar/sidebar-sessions.tsx:49-60`, `:132-143`). It must not become a second relationship-classification implementation.
- Existing Hermes behavior is the reference for *semantics*, not markup or styling:
  - Compression continuations collapse to one visible logical conversation.
  - Explicit forks and generic child/subagent sessions remain distinct children.
  - `parent_session_id` alone is insufficient; fork/source/lifecycle metadata determines the relationship.
  - Hidden/old continuation URLs resolve to the current tip without making explicit branches inherit the parent's transcript.
- Treat dashboard endpoints as private/version-sensitive. The Workspace proxy must feature-detect, handle missing metadata/endpoints without breaking ordinary chats, and never assume a transport can fork merely because a different Hermes transport can.
- Preserve existing portable/local sessions as unlinked roots. Do not invent a database schema or copy transcript-merging logic into Workspace.
- Scope the first user-facing branch feature to **Branch conversation** (entire available transcript). Do not advertise message-level branching until the negotiated backend contract supports a history cutoff/message ID (`keep_count` or equivalent).

## Domain contract to implement

Add a typed server/client-safe contract. Names may be adjusted to match project conventions, but keep the semantics:

```ts
export type SessionRelationshipKind =
  | 'root'
  | 'continuation'
  | 'branch'
  | 'child'
  | 'orphan'

export type SessionLineage = {
  parentSessionId?: string
  relationshipKind: SessionRelationshipKind
  lineageRootId?: string
  lineageTipId?: string
  compressionSegmentCount?: number
  parentTitle?: string
  parentSource?: string
  source?: string
  sessionSource?: string
  endReason?: string
  isPreCompressionSnapshot?: boolean
  isCrossSurfaceChild?: boolean
}

export type SessionTreeRow = {
  session: SessionMeta
  depth: number
  isExpandable: boolean
  isExpanded: boolean
  childCount: number
  continuationCount: number
  parentKey?: string
  isOrphan: boolean
}
```

Classification precedence:

1. Local/portable sessions are `root`.
2. An explicit branch marker (`sessionSource === 'fork'`) is `branch`, never a continuation.
3. A backend `relationship_type === 'child_session'` is `child`, except the explicit fork case above.
4. A backend lineage root/tip or valid fallback lifecycle edge is `continuation` only when parent/child sources are compatible and the parent ended with `compression` or `cli_close` at a valid temporal boundary.
5. A parent-linked entry that cannot be safely classified or whose parent is unavailable is an `orphan`; render it, do not hide or merge it.
6. Detect cycles and cap tree depth. A cycle becomes visible root/orphan rows rather than an infinite tree.

## Acceptance criteria

1. A compression chain of N sessions appears as one selectable logical conversation, with a clear non-modal count/status such as “Continued · N segments.”
2. Branches and delegated/subagent children remain individual selectable rows beneath their parent logical conversation; they are never collapsed into the continuation row.
3. An absent parent, cross-surface child, stale/cyclic metadata, or unsupported backend never causes a session to disappear or block the sidebar.
4. Selecting a compressed ancestor is canonicalized to the backend-confirmed current descendant before loading/sending; a branch is never redirected to its parent/tip.
5. The session menu can branch a supported concrete conversation, creates/navigates to the returned child, and fails visibly without corrupting the parent cache.
6. Desktop and mobile use the same tree projection and semantic labels; keyboard navigation, rename/delete/pin behavior, and ordinary flat-session behavior remain intact.
7. New unit/component/route tests cover relationship classification, collapse, orphan/cycle behavior, canonical navigation, and feature-gated branching.

## Delivery slices

Ship the work as small independently reviewable commits. Slices 1–4 establish correctness without forcing the new visual hierarchy; slices 5–7 introduce the interface and branch action.

### Task 1: Define a lossless upstream session metadata type

**Objective:** Preserve relationship fields returned by current and future Hermes implementations without changing visible behavior yet.

**Files:**
- Modify: `src/server/claude-api.ts:35-51`, `:322-357`
- Modify: `src/server/claude-dashboard-api.ts:3-22`
- Modify: `src/screens/chat/types.ts:84-120`
- Create: `src/server/claude-api.test.ts`

**Step 1: Write failing adapter tests**

Add table-driven tests for `toSessionSummary()` that provide raw rows containing:

- compression fields: `parent_session_id`, `_lineage_root_id`, `_lineage_tip_id`, `_compression_segment_count`, `pre_compression_snapshot`, `end_reason`, source/session-source;
- explicit branch fields: `parent_session_id`, `session_source: 'fork'`, `relationship_type: 'child_session'`;
- generic/cross-surface child fields: `relationship_type`, `parent_title`, `_parent_lineage_root_id`, `_parent_lineage_tip_id`, `_cross_surface_child_session`.

Assert that relationship data is preserved exactly in a nested `lineage` object or in intentionally named flat fields. Assert title/timestamp/token behavior remains unchanged.

Run:

```bash
pnpm vitest run src/server/claude-api.test.ts
```

Expected: FAIL because the current adapter output drops the metadata.

**Step 2: Extend raw transport types**

Add optional fields to `ClaudeSession` and `DashboardSession` for every field in the compatibility contract. Do not use `any`, and do not serialize `model_config` or other heavy/unneeded raw configuration to the browser.

**Step 3: Extend `SessionSummary` and `SessionMeta`**

Add an optional `lineage` payload containing only list-safe metadata. Keep the existing fields backward-compatible so local sessions and older tests compile unchanged.

**Step 4: Preserve fields in `toSessionSummary()`**

Map source timestamps and metadata once at the server boundary. Normalize snake_case upstream names to the chosen Workspace contract here; do not make React components inspect underscored/raw backend names.

**Step 5: Re-run focused tests**

```bash
pnpm vitest run src/server/claude-api.test.ts src/screens/chat/utils.test.ts
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/server/claude-api.ts src/server/claude-dashboard-api.ts src/screens/chat/types.ts src/server/claude-api.test.ts
git commit -m "feat(sessions): preserve lineage metadata in summaries"
```

### Task 2: Retain and normalize lineage metadata on the client

**Objective:** Make session normalization preserve the typed contract while sanitizing malformed optional data.

**Files:**
- Modify: `src/screens/chat/utils.ts:210-272`
- Modify: `src/screens/chat/utils.test.ts`
- Modify: `src/screens/chat/chat-queries.ts:18-64` only if its session reconciliation must retain a new field

**Step 1: Write failing normalization tests**

Add cases that verify:

- valid lineage fields survive normalization;
- empty strings, negative/non-finite segment counts, and unknown `relationshipKind` values are dropped/normalized safely;
- a no-lineage legacy session remains byte-for-byte equivalent in the existing meaningful fields;
- optimistic newly-created and local sessions normalize as roots.

Run:

```bash
pnpm vitest run src/screens/chat/utils.test.ts src/screens/chat/chat-queries.reconcile-session.test.ts
```

Expected: FAIL because `normalizeSessions()` currently returns no lineage payload.

**Step 2: Implement one normalization helper**

Create a local helper in `utils.ts` (or a narrowly named shared helper if both server and browser need it) that parses safe strings/booleans/counts and produces a valid `SessionLineage` shape. Do not classify the graph here; only normalize individual records.

**Step 3: Ensure cache reconciliation spreads lineage correctly**

When a fresh server row replaces an optimistic/cached row, it must preserve the new authoritative lineage fields instead of retaining stale optimistic root state.

**Step 4: Run focused tests and typecheck**

```bash
pnpm vitest run src/screens/chat/utils.test.ts src/screens/chat/chat-queries.reconcile-session.test.ts
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/screens/chat/types.ts src/screens/chat/utils.ts src/screens/chat/utils.test.ts src/screens/chat/chat-queries.ts src/screens/chat/chat-queries.reconcile-session.test.ts
git commit -m "feat(sessions): normalize lineage metadata"
```

### Task 3: Build and test the pure lineage classifier

**Objective:** Establish one authoritative, side-effect-free interpretation of continuation, branch, child, and orphan relationships.

**Files:**
- Create: `src/screens/chat/session-lineage.ts`
- Create: `src/screens/chat/session-lineage.test.ts`
- Modify: `src/screens/chat/types.ts`

**Step 1: Write classifier tests first**

Create table-driven tests covering at least:

1. root/local session;
2. `sessionSource: 'fork'` with a parent is a branch even if compression fields are present;
3. `relationshipType: 'child_session'` is a child;
4. valid same-source compression/`cli_close` edge is a continuation;
5. cross-surface parent/child is not a continuation;
6. a child created before the parent termination boundary is not a continuation;
7. unknown/missing parent is an orphan;
8. malformed timestamps and legacy missing `endedAt` use the documented conservative fallback;
9. a parent cycle terminates deterministically.

Use a small fixture builder so tests state only the relevant lineage facts.

Run:

```bash
pnpm vitest run src/screens/chat/session-lineage.test.ts
```

Expected: FAIL because the module does not exist.

**Step 2: Implement `classifySessionRelationship()`**

The function must consume normalized `SessionMeta` records plus an ID lookup and return a classification without mutation. Match the precedence and safety rules in the Domain contract. Use a visited-ID set; do not recurse indefinitely.

**Step 3: Keep backend metadata authoritative**

When present, server-provided `relationshipType`, lineage root/tip, and cross-surface marker win over heuristic fallback. Heuristics exist only for older transports that provide raw parent/lifecycle fields.

**Step 4: Run tests**

```bash
pnpm vitest run src/screens/chat/session-lineage.test.ts src/screens/chat/utils.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/screens/chat/session-lineage.ts src/screens/chat/session-lineage.test.ts src/screens/chat/types.ts
git commit -m "feat(sessions): classify session lineage safely"
```

### Task 4: Project a stable, collapsed session tree

**Objective:** Turn flat session metadata into render rows that collapse compression segments and retain child/fork relationships.

**Files:**
- Modify: `src/screens/chat/session-lineage.ts`
- Modify: `src/screens/chat/session-lineage.test.ts`

**Step 1: Write failing tree-projection tests**

Cover:

- a three-segment compression chain yields exactly one root row with `continuationCount: 3` and the current/tip session key;
- tip selection precedence: declared tip, largest segment count, non-snapshot, newest activity;
- explicit branch under a compressed root remains a child row and is not counted as a compression segment;
- nested children are ordered by latest activity and have deterministic depth;
- an orphan is a visible root/orphan row;
- active hidden continuation/child causes its ancestor group to be marked for expansion;
- duplicate IDs, cycles, and a max-depth boundary do not throw or drop unrelated sessions;
- local sessions remain roots.

Run:

```bash
pnpm vitest run src/screens/chat/session-lineage.test.ts
```

Expected: FAIL until the projection function exists.

**Step 2: Implement `buildSessionTree()`**

Return a pure `SessionTree` containing root rows, a flat render order, an index by key, and expanded ancestor IDs. Group continuations first; attach branches/children to the selected logical root or to their visible parent. Preserve orphans as top-level rows.

Do not sort or group dates inside the lineage helper. It should supply stable logical roots; presentation grouping remains a sidebar concern.

**Step 3: Define pin semantics explicitly**

Pinned continuation roots stay pinned as one conversation. If a stored pin references a hidden ancestor, resolve it to the selected tip in memory and migrate the local pinned key on the next successful sidebar refresh. A pinned branch remains pinned independently.

Add tests for these cases before implementing any migration behavior.

**Step 4: Run tests**

```bash
pnpm vitest run src/screens/chat/session-lineage.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/screens/chat/session-lineage.ts src/screens/chat/session-lineage.test.ts
git commit -m "feat(sessions): project collapsed session lineage trees"
```

### Task 5: Add Workspace proxy contracts for canonical descendants and branches

**Objective:** Keep backend-private details behind authenticated Workspace routes and make unsupported capabilities explicit.

**Files:**
- Modify: `src/server/claude-api.ts:128-237`
- Modify: `src/server/claude-dashboard-api.ts:115-178`
- Modify: `src/server/gateway-capabilities.ts`
- Create: `src/routes/api/sessions/$sessionKey.latest-descendant.ts`
- Create: `src/routes/api/sessions/$sessionKey.fork.ts`
- Create: `src/routes/api/sessions/$sessionKey.latest-descendant.test.ts`
- Create: `src/routes/api/sessions/$sessionKey.fork.test.ts`

**Step 1: Write failing route tests**

Mock adapters and assert:

- latest-descendant returns `{ requestedSessionKey, sessionKey, path, changed }` when supported;
- absence/404/unsupported capability returns the original key with `changed: false`, not a route error;
- the fork route requires Workspace authentication and JSON content type;
- unsupported fork capability returns the standard feature-unavailable payload/status, not a fake success;
- a successful whole-session branch returns the normalized child summary and canonical parent key;
- error paths leave the session list unchanged.

Run:

```bash
pnpm vitest run 'src/routes/api/sessions/$sessionKey.latest-descendant.test.ts' 'src/routes/api/sessions/$sessionKey.fork.test.ts'
```

Expected: FAIL because the routes/helpers do not exist.

**Step 2: Add adapter methods and capability probes**

Add `getLatestDescendant(sessionId)` and `forkSession(sessionId, options?)` to the unified adapter. Extend the dashboard/gateway capability result with explicit booleans such as `latestDescendant` and `sessionFork`; do not infer them solely from `sessions` or `enhancedChat`.

Probe/version-gate the configured backend once and cache the result using the existing capability mechanism. If a private dashboard endpoint is unavailable, return a graceful capability result rather than retrying every render.

**Step 3: Implement the Workspace routes**

- `latest-descendant` is read-only and may safely fall back to the requested ID.
- `fork` initially accepts only optional title metadata; reject `keepCount`/message targeting until the capability contract supports it.
- Apply the same auth and request validation conventions as `src/routes/api/sessions.ts:27-84`.
- Use `toSessionSummary()` for all responses so no route leaks raw backend field names.

**Step 4: Run tests and typecheck**

```bash
pnpm vitest run 'src/routes/api/sessions/$sessionKey.latest-descendant.test.ts' 'src/routes/api/sessions/$sessionKey.fork.test.ts' src/server/claude-api.test.ts
pnpm exec tsc --noEmit --pretty false
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/claude-api.ts src/server/claude-dashboard-api.ts src/server/gateway-capabilities.ts 'src/routes/api/sessions/$sessionKey.latest-descendant.ts' 'src/routes/api/sessions/$sessionKey.fork.ts' 'src/routes/api/sessions/$sessionKey.latest-descendant.test.ts' 'src/routes/api/sessions/$sessionKey.fork.test.ts'
git commit -m "feat(sessions): add canonical descendant and branch routes"
```

### Task 6: Canonicalize continuation navigation and streaming handoff

**Objective:** Ensure a selected compression ancestor moves to the confirmed active continuation tip without redirecting branches/children incorrectly.

**Files:**
- Modify: `src/routes/api/history.ts:43-81`
- Modify: `src/screens/chat/chat-screen.tsx:667-675`, `:964-975`, `:2531-2540`
- Modify: `src/screens/chat/hooks/use-streaming-message.ts:7-34`, `:892-916`
- Modify: `src/routes/api/send-stream.ts:1093-1125`, terminal event handling near `:1584-1595`
- Create: `src/screens/chat/session-canonicalization.test.ts`
- Modify: `src/screens/chat/hooks/use-streaming-message.test.ts`

**Step 1: Write failing canonicalization tests**

Test these behaviors with mocked fetch/queries/router callbacks:

- opening an old compression ancestor resolves and replaces the URL with the confirmed tip before fetching history;
- an explicit branch with a parent is not redirected;
- missing/unavailable resolver preserves the selected key;
- an SSE event that names a different session does not on its own replace a concrete key;
- after a completed stream, a refresh plus authoritative lineage/descendant confirmation promotes a concrete session to the new continuation tip;
- cached history and session list are re-keyed/invalidated consistently, with no duplicate optimistic message;
- branch history is never client-side merged with its parent.

Run:

```bash
pnpm vitest run src/screens/chat/session-canonicalization.test.ts src/screens/chat/hooks/use-streaming-message.test.ts
```

Expected: FAIL before canonicalization exists.

**Step 2: Add a single canonicalization service/hook**

Implement one helper/hook that calls the Workspace latest-descendant proxy, checks the current normalized lineage classification, and returns either the original key or a confirmed continuation tip. It must use `navigate(..., { replace: true })` only after confirmation.

**Step 3: Use canonical keys at read/send boundaries**

- Resolve in `/api/history` or immediately before its source read so cold links do not render stale segment-only history.
- Resolve before a non-bootstrap send when safe; retain current behavior if the resolver is unavailable.
- On terminal streaming completion, invalidate/refetch the session list, then canonicalize only if the fresh server relation confirms compression continuation.

Do not perform browser-side parent/child transcript stitching. The backend owns continuation transcript materialization; Workspace only selects the canonical session ID.

**Step 4: Run focused tests**

```bash
pnpm vitest run src/screens/chat/session-canonicalization.test.ts src/screens/chat/hooks/use-streaming-message.test.ts src/screens/chat/chat-queries.reconcile-session.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/api/history.ts src/routes/api/send-stream.ts src/screens/chat/chat-screen.tsx src/screens/chat/hooks/use-streaming-message.ts src/screens/chat/session-canonicalization.test.ts src/screens/chat/hooks/use-streaming-message.test.ts
git commit -m "feat(sessions): canonicalize compression continuations"
```

### Task 7: Render the relationship-aware desktop sessions panel

**Objective:** Replace the flat session map with Workspace-native nested conversation rows driven exclusively by `SessionTreeRow`.

**Files:**
- Modify: `src/screens/chat/components/sidebar/sidebar-sessions.tsx:22-198`
- Modify: `src/screens/chat/components/sidebar/session-item.tsx:1-251`
- Modify: `src/screens/chat/components/chat-sidebar.tsx:1021-1120`
- Create: `src/screens/chat/components/sidebar/session-tree-row.tsx`
- Create: `src/screens/chat/components/sidebar/sidebar-sessions.test.tsx`
- Create: `src/screens/chat/components/sidebar/session-tree-row.test.tsx`

**Step 1: Write failing component tests**

Use Testing Library to assert:

- one collapsed continuation root is rendered with an accessible continued-segment label/count;
- a branch and a child render with indentation and distinct semantic labels (for example “Branch” and “Delegated session”), not a copy of WebUI terminology/markup;
- a child disclosure is keyboard-operable and uses `aria-expanded`/`aria-controls`;
- selecting any visible child links to its own `/chat/:sessionKey` route;
- active hidden children expand their ancestors;
- orphans remain visible and announce missing parent context non-destructively;
- pin/rename/delete actions still target the actual selected child/root session;
- an ordinary flat list renders unchanged in hierarchy-free deployments.

Run:

```bash
pnpm vitest run src/screens/chat/components/sidebar/sidebar-sessions.test.tsx src/screens/chat/components/sidebar/session-tree-row.test.tsx
```

Expected: FAIL before the new rows exist.

**Step 2: Project before presentation**

In `SidebarSessions`, call `buildSessionTree()` once with sessions, active key, and pinned state. Keep existing date/recency grouping only for visible logical roots. Children remain within the owning root's group, preventing related rows from splitting between “Today” and “Previous Days.”

**Step 3: Create a Workspace-native row component**

`SessionTreeRow` should own indentation, disclosure, relationship badge/count, and recursive child rendering. Reuse current `SessionItem` visual primitives/menu actions where practical, but pass a typed render model rather than adding raw lineage conditionals throughout `SessionItem`.

Suggested appearance:

- continuation root: existing session row plus a subtle “Continued” count/tooltip;
- branch: indented existing row plus a branch icon/text label;
- delegated child: indented existing row plus a neutral delegated-work label;
- orphan: top-level existing row plus a quiet “Original session unavailable” hint.

Do not duplicate the WebUI connector art, global DOM behavior, or legacy menus.

**Step 4: Preserve memo correctness**

Update `areSidebarSessionsEqual()` and `areSessionItemsEqual()` to compare the lineage fields and expansion-relevant keys that affect rendering. Avoid storing derived tree state in the session query cache.

**Step 5: Run tests**

```bash
pnpm vitest run src/screens/chat/session-lineage.test.ts src/screens/chat/components/sidebar/sidebar-sessions.test.tsx src/screens/chat/components/sidebar/session-tree-row.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/screens/chat/components/sidebar/sidebar-sessions.tsx src/screens/chat/components/sidebar/session-item.tsx src/screens/chat/components/sidebar/session-tree-row.tsx src/screens/chat/components/sidebar/sidebar-sessions.test.tsx src/screens/chat/components/sidebar/session-tree-row.test.tsx src/screens/chat/components/chat-sidebar.tsx
git commit -m "feat(sessions): render lineage-aware sidebar rows"
```

### Task 8: Apply the same projection to mobile and add parent context in chat

**Objective:** Keep relationship semantics consistent outside the desktop sidebar without overloading the chat transcript.

**Files:**
- Modify: `src/components/mobile-sessions-panel.tsx`
- Modify: `src/screens/chat/chat-screen.tsx`
- Modify: `src/screens/chat/components/chat-header.tsx` if it owns the active-session title area
- Create: `src/components/mobile-sessions-panel.test.tsx`
- Create: `src/screens/chat/components/session-lineage-context.test.tsx`

**Step 1: Write failing mobile/context tests**

Assert that mobile uses the same hierarchy/projection semantics as desktop and that a branch/child chat header can show a compact parent-context link without changing the transcript. Verify that a continuation root displays its segment count but does not render the hidden snapshot list.

**Step 2: Reuse the shared tree model**

Do not create separate mobile lineage logic. Pass the output of `buildSessionTree()` or a small reusable tree-list component into the mobile panel.

**Step 3: Add minimal chat context**

For a branch or child, provide a small accessible parent link/breadcrumb near the active title. For a continuation, show the logical conversation count only. The link should navigate; it must not merge/reload parent messages inside the current transcript view.

**Step 4: Run focused tests**

```bash
pnpm vitest run src/components/mobile-sessions-panel.test.tsx src/screens/chat/components/session-lineage-context.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/mobile-sessions-panel.tsx src/screens/chat/chat-screen.tsx src/screens/chat/components/chat-header.tsx src/components/mobile-sessions-panel.test.tsx src/screens/chat/components/session-lineage-context.test.tsx
git commit -m "feat(sessions): expose lineage on mobile and chat headers"
```

### Task 9: Expose feature-gated whole-conversation branching

**Objective:** Let users create a supported branch from the session menu without affecting continuation behavior.

**Files:**
- Modify: `src/screens/chat/components/sidebar/session-item.tsx`
- Modify: `src/screens/chat/components/chat-sidebar.tsx`
- Modify: `src/screens/chat/chat-screen.tsx`
- Modify: `src/screens/chat/chat-queries.ts`
- Create: `src/screens/chat/components/sidebar/session-branch-action.test.tsx`
- Modify: `src/routes/api/sessions/$sessionKey.fork.test.ts`

**Step 1: Write failing UX tests**

Assert:

- supported non-local conversation shows “Branch conversation” in its menu;
- local/portable sessions and unsupported transports omit or disable the action with an explanatory tooltip;
- selecting it calls only the Workspace fork route;
- pending state prevents duplicate requests;
- success inserts/reconciles the child row, expands its parent, and navigates to the child;
- failure shows an error toast and retains the current route/list unchanged.

**Step 2: Add the menu action and mutation**

Place branch beside existing non-destructive session actions. Reuse current toast/query invalidation conventions. Always re-fetch sessions after success rather than fabricating an incomplete relationship object solely from client state.

**Step 3: Do not add point-in-time UI yet**

Leave a typed extension point in the proxy options for an eventual `keepCount` or message ID, but do not expose it. Add a capability test proving an unsupported cutoff is rejected before it reaches a backend.

**Step 4: Run tests**

```bash
pnpm vitest run src/screens/chat/components/sidebar/session-branch-action.test.tsx 'src/routes/api/sessions/$sessionKey.fork.test.ts' src/screens/chat/session-lineage.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/screens/chat/components/sidebar/session-item.tsx src/screens/chat/components/chat-sidebar.tsx src/screens/chat/chat-screen.tsx src/screens/chat/chat-queries.ts src/screens/chat/components/sidebar/session-branch-action.test.tsx 'src/routes/api/sessions/$sessionKey.fork.test.ts'
git commit -m "feat(sessions): add supported conversation branching"
```

### Task 10: Regression, compatibility, and operator documentation

**Objective:** Validate the complete flow against supported and degraded Hermes deployments, then document the user-visible contract.

**Files:**
- Modify: `docs/workspace-chat-session-routing.md`
- Create: `docs/session-lineage.md`
- Modify: `src/screens/chat/session-lineage.test.ts`
- Modify: `src/routes/api/sessions/$sessionKey.latest-descendant.test.ts`
- Modify: `src/routes/api/sessions/$sessionKey.fork.test.ts`

**Step 1: Add final integration-level unit scenarios**

Cover a full data sequence:

1. parent session is loaded;
2. compression creates a descendant during/after a stream;
3. refresh returns lineage metadata;
4. current route moves to tip;
5. sidebar shows one root;
6. user branches it;
7. sidebar shows branch as child;
8. opening the branch loads only its own transcript through backend history;
9. deleting/losing an original parent leaves an orphan visible.

**Step 2: Document API and UI behavior**

`docs/session-lineage.md` should document:

- the relationship kinds and what users see;
- continuation versus branch semantics;
- backend capability/degradation behavior;
- no client-side transcript merging;
- privacy/source boundary rules;
- how to troubleshoot stale links and unsupported branch actions.

Update `docs/workspace-chat-session-routing.md` to distinguish stable same-ID gateway continuation from compression-driven descendant canonicalization.

**Step 3: Execute validation**

```bash
pnpm vitest run src/server/claude-api.test.ts src/screens/chat/utils.test.ts src/screens/chat/chat-queries.reconcile-session.test.ts src/screens/chat/hooks/use-streaming-message.test.ts src/screens/chat/session-lineage.test.ts src/screens/chat/session-canonicalization.test.ts 'src/routes/api/sessions/$sessionKey.latest-descendant.test.ts' 'src/routes/api/sessions/$sessionKey.fork.test.ts' src/screens/chat/components/sidebar/sidebar-sessions.test.tsx src/screens/chat/components/sidebar/session-tree-row.test.tsx src/screens/chat/components/sidebar/session-branch-action.test.tsx src/components/mobile-sessions-panel.test.tsx src/screens/chat/components/session-lineage-context.test.tsx
pnpm exec tsc --noEmit --pretty false
pnpm lint
pnpm build
git diff --check
```

Expected: all selected tests, typecheck, lint, and build pass; `git diff --check` is clean.

**Step 4: Manual smoke test against canonical local services**

Follow `AGENTS.md`: first verify the existing Workspace Sessions endpoint instead of starting a duplicate service. Use one gateway (`:8642`), one dashboard (`:9119`), and Workspace (`:3000`). Verify:

1. ordinary same-session continuation remains intact;
2. a synthetic/real compression continuation selects the tip after refresh;
3. a known child/subagent is shown beneath its parent or as an orphan if unavailable;
4. branch action is visible only when backend capability is confirmed;
5. desktop/mobile navigation and keyboard focus work;
6. no credentials, session contents, or tool outputs are copied into tests/docs.

**Step 5: Commit**

```bash
git add docs/workspace-chat-session-routing.md docs/session-lineage.md src
 git commit -m "docs: describe workspace session lineage behavior"
```

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `parent_session_id` is overloaded | Use precedence-based classification; never collapse solely on parent presence. |
| Dashboard and gateway versions disagree | Add explicit capabilities and graceful fallbacks; keep ordinary flat behavior when unavailable. |
| A continuation tip is not in the first 50 rows | Render loaded orphan/root safely; later add pagination/canonical fetch before making it invisible. Do not hide rows just because a parent/tip is absent. |
| Client transcript merging duplicates tool rows | Do not implement it. Ask the backend for the canonical tip/history and let Hermes own materialization. |
| Stale stream event accidentally redirects a branch | Require fresh resolver/classification confirmation before replacing a concrete route. |
| Nested UI breaks pinned/rename/delete/menu behavior | Tree rows retain original `SessionMeta` actions and receive focused component tests. |
| Private endpoint may be unavailable | Workspace-owned proxy routes return capability-aware fallbacks; menu is not exposed without support. |
| Cycle/corrupt data causes recursion/freeze | Bounded visited-ID traversal, depth limits, and visible orphan fallback tests. |

## Deferred follow-ups

- Message-level “Branch from here” after the supported backend contract carries a verified cutoff/message ID and copied-context semantics.
- Server-side pagination/tree query if large histories make a 50-row list insufficient for relationship completeness.
- Archive/delete semantics specific to a lineage (for example, whether archive applies to only a visible tip or logical conversation) after product policy is decided.
- Optional per-user preferences for hiding delegated child rows by default; first release should use a simple disclosure, not a new settings surface.

## Definition of done

- All acceptance criteria pass in automated tests and the local smoke flow.
- Workspace behavior degrades to the current flat sidebar when a backend cannot supply lineage/fork capabilities.
- Relationship classification lives in one tested module, not adapters/components.
- No session relationship is silently lost, incorrectly merged, or incorrectly redirected.
- Implementation commits are small, independently reviewable, and do not include generated artifacts or credentials.
