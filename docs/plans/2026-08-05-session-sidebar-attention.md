# Desktop Session Sidebar Attention Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Make the desktop sessions sidebar width user-adjustable, expose compact live-work status on Card rows, and alert a user to unseen completed responses or pending command approvals in other Cards.

**Architecture:** Keep the whole desktop ChatSidebar as the resizable boundary so the navigation rail, session panel, panel-local failure notice, and Card action popovers remain geometrically coherent. Persist an expanded desktop width in the existing ChatSettings store, while retaining the fixed 48px collapsed rail and current mobile behavior. Extend the authoritative Card projection with a validated, bounded direct-card activity record emitted by the stream path; the desktop sidebar consumes that state to render a compact CSS spinner and derives transient, fail-closed unseen-attention state from activity epochs plus the active Card route.

**Tech Stack:** React 19, TypeScript, TanStack Query, Zustand persistence, Motion, Tailwind CSS, Vitest + jsdom.

---

### Task 1: Add a persisted and bounded desktop sidebar width setting

**Objective:** Persist a safe expanded desktop width without changing mobile or the collapsed 48px rail.

**Files:**
- Modify: `src/hooks/use-chat-settings.ts`
- Modify: `src/screens/chat/components/chat-sidebar.tsx`
- Test: `src/hooks/use-chat-settings.test.ts` (create if absent) or the existing closest settings-store test
- Test: `src/components/workspace-shell.test.ts`

**Step 1: Write failing setting tests**

Cover the default width, legacy persisted state with no width, and malformed/out-of-range persisted widths. The test must assert that the store supplies the default or clamped value rather than an invalid CSS width.

**Step 2: Implement the bounded setting seam**

Add named desktop-width constants and a `sidebarWidth` number to `ChatSettings`. Use a single clamp/normalization helper in persistence merge and updates. Default to the present expanded total width (300px), retain a usable lower bound for the rail plus Card titles, and cap the panel so it cannot consume the desktop viewport. Export a selector for the normalized value.

**Step 3: Drive desktop expanded width from the setting**

In `ChatSidebar`, read the selector and replace only the desktop expanded `motion.aside` width. Preserve `48px` collapsed behavior, `85vw` mobile behavior, hover-preview semantics, and non-chat compact navigation behavior.

**Step 4: Run focused checks**

Run `pnpm vitest run src/components/workspace-shell.test.ts` and the settings-store test. Expected: PASS.

**Step 5: Commit**

Commit the setting foundation with a narrow `feat(chat): persist desktop sidebar width` message.

### Task 2: Add accessible desktop resize interaction at the sidebar boundary

**Objective:** Let desktop users drag or keyboard-adjust the expanded sessions sidebar without disturbing mobile, collapse, or overlay behavior.

**Files:**
- Modify: `src/screens/chat/components/chat-sidebar.tsx`
- Test: `src/screens/chat/components/chat-sidebar.test.tsx` (create if absent) or the nearest existing sidebar behavior test
- Test: `src/components/workspace-shell.test.ts`

**Step 1: Write failing interaction tests**

Render the desktop sidebar and assert:
- an enabled separator/resize handle exists only for the expanded desktop Chat surface;
- pointer drag updates the persisted expanded width, with min/max clamping;
- keyboard ArrowLeft/ArrowRight adjusts by a documented increment, Home/End choose bounds, and `aria-valuenow` reflects the result;
- the handle is absent/inert for mobile and the collapsed rail.

**Step 2: Implement the minimal resize handler**

Add a visually narrow right-edge handle inside the desktop `motion.aside`, not a document overlay. Use pointer capture or document cleanup that is released on pointer-up/cancel and component unmount. Use the normalized settings update function, prevent text selection while dragging, and avoid a Motion width spring competing with an active drag. Use a native focusable separator with `aria-orientation="vertical"`, labelled value text, and complete keyboard support.

**Step 3: Verify affected sidebar-local surfaces**

Keep `DesktopSidebarContent`, `SidebarSessions`, action failure notice, pinned/session scrolling, and Card action menus inside the resized parent with `min-w-0` so only the sessions/sidebar region changes width. Do not resize global dialogs, Search, mobile drawers, or the main content region independently.

**Step 4: Run focused checks**

Run the new sidebar test and `pnpm vitest run src/components/workspace-shell.test.ts`. Expected: PASS.

**Step 5: Commit**

Commit with `feat(chat): make desktop session sidebar resizable`.

### Task 3: Project direct Card activity from the authoritative stream path

**Objective:** Supply a root Card with a trusted, time-bounded activity state for live response and approval attention instead of guessing from title or generic timestamp updates.

**Files:**
- Modify: `src/screens/chat/types.ts`
- Modify: `src/screens/chat/session-cards.ts`
- Modify: `src/server/session-card-service.ts`
- Modify: `src/routes/api/-send-stream-session-handoff.ts`
- Modify: `src/routes/api/send-stream.ts`
- Test: `src/screens/chat/session-cards.test.ts`
- Test: `src/server/session-card-service.test.ts`
- Test: `src/routes/api/-send-stream.bootstrap-handoff.test.ts`

**Step 1: Write failing projection and lifecycle tests**

Define a Card activity contract with a stable activity timestamp/epoch and states for `running`, terminal response, terminal error, and pending approval. Test that only a validated active Card/run can start or complete its activity, stale/superseded run events cannot overwrite a newer run, terminal states expire, and malformed/ambiguous source identity fails closed.

**Step 2: Implement the bounded service-side lifecycle record**

Mirror the existing child lifecycle safety rules for direct root Cards: validate identity, bind a run to a visible unarchived authoritative Card, reject invalid state regressions, bound retained records, and apply a shorter running TTL and terminal TTL. Feed the activity map into the Card projection so list/detail wire responses carry one authoritative activity object per root Card.

**Step 3: Classify stream events conservatively**

Extend the stream event classifier with the exact command-approval event names received from the Hermes transport and map only those names to `awaiting_approval`. Preserve existing success/error/cancelled semantics. On verified parent stream events, observe the direct Card lifecycle, emit the Card activity notification, and publish it to the existing chat event channel. Do not infer approval from arbitrary tool text or from global gateway approval rows that cannot be proven to belong to this Card.

**Step 4: Run focused checks**

Run `pnpm vitest run src/screens/chat/session-cards.test.ts src/server/session-card-service.test.ts src/routes/api/-send-stream.bootstrap-handoff.test.ts`. Expected: PASS.

**Step 5: Commit**

Commit with `feat(session-cards): project direct card activity`.

### Task 4: Invalidate Card inventory promptly and derive unseen attention safely

**Objective:** Make desktop Cards reflect remote activity quickly and flash only when a different Card has a newly completed response or verified pending approval that has not been viewed.

**Files:**
- Create: `src/screens/chat/hooks/use-session-card-attention.ts`
- Modify: `src/screens/chat/components/chat-sidebar.tsx`
- Modify: `src/screens/chat/components/sidebar/sidebar-sessions.tsx`
- Modify: `src/screens/chat/components/sidebar/session-tree-row.tsx`
- Test: `src/screens/chat/components/sidebar/sidebar-sessions.test.tsx`
- Test: `src/screens/chat/components/chat-sidebar.test.tsx` (or the nearest existing desktop-sidebar test)

**Step 1: Write failing stateful regressions**

Test the complete render/update sequence, not just callbacks:
- first inventory hydration establishes a baseline and does not flash old Cards;
- a non-active Card changing to a new completed response or verified pending approval gains attention;
- the active Card never flashes;
- route/data rerender that makes the alerted Card active clears its attention and it remains clear;
- a normal metadata/title update, a stale activity epoch, an error state, incomplete Card data, or an unproven activity event does not produce an alert;
- published activity invalidates/refetches the Card inventory without changing unrelated query keys.

**Step 2: Implement a Card-keyed, in-memory attention projection**

The hook records the latest seen activity epoch per stable Card ID, initializes a baseline on first complete inventory, and returns a Card-ID set for non-active Cards whose new activity is response-complete or awaiting approval. Clear a Card once it becomes the active route. Keep it in-memory for this browser view; do not create a raw session-key store or persist stale alerts across a restart.

**Step 3: Wire prompt inventory reconciliation**

Subscribe once to the existing Card activity notification channel from `ChatSidebar` and invalidate only the Card list/detail queries. Let the server projection be the source of truth; reject malformed payloads and let normal polling reconcile dropped events.

**Step 4: Run focused checks**

Run the sidebar/component tests and `pnpm vitest run src/screens/chat/chat-queries.session-cards.test.ts`. Expected: PASS.

**Step 5: Commit**

Commit with `feat(chat): highlight unseen card activity`.

### Task 5: Render compact working and attention affordances on Card rows

**Objective:** Give every visible row a compact, accessible live indicator and a low-frequency background attention flash without disrupting titles, row actions, tree semantics, or mobile.

**Files:**
- Modify: `src/screens/chat/components/sidebar/session-item.tsx`
- Modify: `src/screens/chat/components/sidebar/session-tree-row.tsx`
- Modify: `src/screens/chat/components/sidebar/sidebar-sessions.tsx`
- Test: `src/screens/chat/components/sidebar/session-tree-row.test.tsx`
- Test: `src/screens/chat/components/sidebar/sidebar-sessions.test.tsx`

**Step 1: Write failing UI tests**

Assert a `running` Card renders a tiny labelled, decorative CSS spinner (not a large asset or a layout-shifting image); pending approval has concise accessible text; Card row data/aria state exposes attention; and attention styling is absent for active, viewed, inactive-idle, incomplete, and error Cards. Cover a nested Card row as well as a root row.

**Step 2: Implement presentation-only props and styles**

Thread Card activity and attention through `SidebarSessions` and `SessionTreeRow` into `SessionItem`. Add a compact CSS ring/spinner next to the title for active work, with a screen-reader status label. Add a low-frequency CSS background animation only to non-active attention rows; respect `prefers-reduced-motion` and never replace the active/hover/focus styling or hide menu controls.

**Step 3: Run focused checks**

Run `pnpm vitest run src/screens/chat/components/sidebar/session-tree-row.test.tsx src/screens/chat/components/sidebar/sidebar-sessions.test.tsx`. Expected: PASS.

**Step 4: Commit**

Commit with `feat(chat): show card activity and attention state`.

### Task 6: Integration gates and browser verification

**Objective:** Prove all four requested behaviors work together at the integrated candidate SHA.

**Files:**
- Modify only if a regression is exposed by the checks above.

**Step 1: Run automated gates**

Run:
- `pnpm vitest run src/components/workspace-shell.test.ts src/screens/chat/components/sidebar/sidebar-sessions.test.tsx src/screens/chat/components/sidebar/session-tree-row.test.tsx src/server/session-card-service.test.ts src/screens/chat/session-cards.test.ts`
- `pnpm lint src/hooks/use-chat-settings.ts src/screens/chat/components/chat-sidebar.tsx src/screens/chat/components/sidebar/session-item.tsx src/screens/chat/components/sidebar/session-tree-row.tsx src/screens/chat/components/sidebar/sidebar-sessions.tsx src/screens/chat/hooks/use-session-card-attention.ts src/server/session-card-service.ts src/routes/api/send-stream.ts`
- `pnpm build`
- `git diff --check`

**Step 2: Browser smoke test**

With the existing local Workspace runtime, use an authenticated browser check at a desktop viewport to verify: drag and keyboard resize; sidebar-local content follows the new boundary; a running Card shows the compact spinner; and a non-active Card with fresh completed/approval activity flashes until its Card is opened. Assert no console/page errors.

**Step 3: Final review and commit**

Run specification compliance review first, then code-quality review against the exact integrated SHA. Commit remaining test/format repairs with `test(chat): cover session sidebar attention` if needed.
