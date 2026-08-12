# Workspace Chat Session Routing

## Purpose

Hermes Workspace routes chat by stable Session Card identity while backend storage may rotate through continuation segments. A Card route identifies the logical parent conversation; it does not expose or select an individual continuation segment.

For each send, stream handoff, and recovery operation, the server validates the Card against current lineage data and resolves its mutable canonical segment. Workspace also supports OpenAI-compatible `/v1/chat/completions`; its session headers carry that resolved backend segment and are transport details, not user-facing identity.

See [Session Lineage](./session-lineage.md) for Card projection, actions, history, and degradation behavior.

## Identity and Routing Contract

| Identity/field        | Scope                              | Contract                                                                                                                     |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `cardId`              | Stable logical parent conversation | Owns the visible route, selection, title, pin state, actions, pending state, and parent-history query.                       |
| `canonicalSegmentKey` | Mutable backend parent segment     | Receives the next parent send and live parent stream events after server-side validation.                                    |
| `canonicalSource`     | Canonical read source              | Identifies the validated Card/segment identity domain: `local` or `remote`.                                                  |
| `canonicalTransport`  | Authorized mutation transport      | Identifies the exact remote adapter that owns the canonical segment: `gateway` or `dashboard`; it is not a capability grant. |
| `childSessionKey`     | Branch/delegate/child record       | May be used for explicit inspection, but cannot take over the parent Card route or canonical segment.                        |

A browser-supplied segment key, title, or parent ID is never sufficient to construct a Card relation or choose a send destination. A confirmed continuation may update `canonicalSegmentKey` while `cardId` and parent selection remain unchanged.

`canonicalSource` answers where Workspace may read and validate the Card; `canonicalTransport` answers which exact adapter may perform a transport-specific mutation. Workspace accepts only `gateway` or `dashboard` as transport values. A missing or unsupported transport never inherits authority from `canonicalSource`, another Card, or a globally advertised capability. Card and segment identities remain source-qualified; do not strip or rewrite their source prefixes to make a transport appear compatible.

## Parent History and Continuity

Workspace requests Card history from the server. The server assembles ordered, de-duplicated parent history across the Card's validated continuation segments and reports whether that component is complete. The browser does not concatenate segment transcripts.

Branch, child, and delegate transcripts are excluded from parent history. They are loaded separately only when the user inspects that child, and returning from inspection restores the same selected parent Card.

The inspection URL is `/chat/<parentCardId>?inspect=<childCardId>`. The route validates `childCardId` against the selected parent's projected direct children; the parent route, title, action ownership, canonical send target, and parent-history query do not change. The child-history request carries both child and parent Card IDs, and the server revalidates that relationship before assembling only the child's continuation component. Closing inspection removes the query state and reveals the already-separate parent history.

Malformed or stale inspection identity and missing, failed, or incomplete child history never trigger `/api/history` or another raw-session fallback. A valid partial child response may display only its available child messages; a missing or failed response stays empty/unavailable rather than showing parent messages as though they belonged to the child.

Pending sends, recovery state, and persisted runs retain both Card identity and the concrete canonical segment so a valid continuation rotation does not turn a storage key into a new user-facing conversation.

## Gateway Session Headers

The OpenAI-compatible transport uses these server-to-gateway headers when a canonical segment is available:

| Header                | Purpose                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `X-Hermes-Session-Id` | Identifies the validated backend segment that should receive the request. |
| `X-Claude-Session-Id` | Compatibility alias for the same validated backend segment.               |

These headers are independent of bearer-token presence. Authentication, when required, is enforced separately. They do not authorize the browser to select a segment, prove a lineage relation, or permit a child session to become the parent target.

For a backend that continues a conversation under one ID, the canonical segment can remain unchanged across requests. When backend-authoritative lineage confirms a parent continuation under a new ID, the server may rotate the canonical segment without changing the Card route.

## Validated Stream Handoffs

An upstream session-ID change is accepted as a parent handoff only after the server confirms that the new record is a continuation within the same Card.

- A confirmed same-Card continuation updates the canonical segment and retains the original `cardId`, parent selection, and active parent stream.
- A branch, delegate, child, cross-source record, unknown relation, or malformed event leaves the parent Card and routing target unchanged.
- Child activity is published beneath the parent Card and may be inspected; it is not a navigation event.
- Stale or inconsistent Card events are rejected rather than rerouting traffic.

## Card-Scoped Operations

Routing for user actions also starts from `cardId`:

- title and pin changes update Card metadata;
- branch resolves the current canonical parent segment and forks the whole Card only when `canonicalSource` is `remote`, `canonicalTransport` is `gateway`, and that gateway positively advertises whole-session fork support;
- archive changes Workspace metadata and hides the Card from the active list.

Continuation segments and ordinary child nodes do not own these actions. Archive is not remote logical-Card deletion, and Workspace exposes no such deletion without an upstream atomic logical-conversation contract.

## Conservative Degradation

Malformed or incomplete Card data must not invent a relationship or destination.

- If Card projection or canonical-segment validation is unavailable, preserve the selected Card and present a safe unavailable/retry state. Do not guess a segment, accept a child, or silently use a legacy per-segment route.
- If only part of a confirmed continuation component can be retrieved, report history as incomplete. Do not fabricate a continuous transcript or merge a branch/delegate/child transcript.
- A malformed stream handoff cannot change the route, Card selection, or parent send target.
- An unavailable or inconsistent fork response leaves the parent Card unchanged.
- An absent, malformed, or unsupported `canonicalTransport` fails closed for transport-specific mutations. A `dashboard` Card may remain valid for reads while whole-Card branching stays disabled; Workspace never borrows the gateway's fork capability for it.

### A valid Card has no whole-Card branch action

1. In the already-authenticated `/api/session-cards` response, locate the Card by its exact source-qualified `cardId`; do not match or rewrite only the upstream suffix.
2. Confirm that the Card has a complete, non-retryable unique resolution and `canonicalSource: "remote"`. These checks establish read/routing validity, not branch authority.
3. Inspect `canonicalTransport`. `gateway` is the only transport eligible for whole-Card branching. `dashboard` or an absent value explains a valid Card whose branch affordance is disabled. Any other value is unsupported wire data and must be rejected rather than coerced.
4. If the transport is `gateway`, confirm that the same gateway currently advertises `sessionFork`. A missing/failed capability probe or `sessionFork: false` keeps the action disabled.
5. Restore the owning source or gateway capability and refresh the Card list. Do not copy credentials into a probe, change source-qualified IDs, route the mutation through `/api/sessions`, or start a duplicate gateway to force the action.

## Credential-Free Manual Verification

Reuse the canonical gateway on `127.0.0.1:8642` and Dashboard on `127.0.0.1:9119`. Do not start duplicate backends.

1. Probe the existing services and the Card-native Workspace endpoint without supplying credentials:

   ```bash
   curl -i --max-time 2 http://127.0.0.1:8642/health
   curl -i --max-time 2 http://127.0.0.1:9119/
   curl -i --max-time 2 http://127.0.0.1:3000/api/session-cards
   ```

   `/api/sessions` is not a Card-health probe. A `401` from `/api/session-cards` confirms only that Workspace is reachable and authentication is required. Do not put a token in this command or shell history; continue through the already-authenticated Workspace UI or the operator-approved credential mechanism.

2. If Workspace is not already listening, start only Workspace on `:3000`:

   ```bash
   pnpm dev --host 127.0.0.1 --port 3000
   ```

   Do not use `pnpm start:all`; it also starts another gateway.

3. An authenticated successful list is a `200` JSON object with `cards`, `cardResolutions`, `completeness`, `retryable`, and `sources`. Each Card exposes its stable `cardId`, authoritative `canonicalSource`, optional `canonicalTransport`, mutable `canonicalSegmentKey`, continuation keys, relationship information, and child nodes. `canonicalTransport`, when present, is exactly `gateway` or `dashboard`; it names the mutation-owning adapter for a remote canonical segment. Each returned Card must have exactly one matching `cardResolutions` entry. Each source entry reports `source`, `status`, `fetched`, and `retryable`, with an optional bounded `reason` or sanitized `error`.

   Treat the projection as fully complete only when top-level `completeness` is `complete`, top-level `retryable` is `false`, every reported source is complete/non-retryable, and every Card resolution is complete/non-retryable. An empty `cards` array can be a valid complete result. Do not rely on top-level completeness alone: source collection may be complete while one Card remains incomplete because a confirmed continuation segment is unavailable.

4. A top-level incomplete/retryable response is a usable partial snapshot, not a complete inventory. A returned Card remains routable only when its own unique resolution is complete/non-retryable and its `canonicalSource` is `local` or `remote`. Treat that Card as unavailable if its resolution is incomplete/retryable, absent, duplicated, or contradictory, or if its canonical source is missing or invalid. A routable Card is not necessarily mutable: whole-Card branch authorization additionally requires `canonicalSource: "remote"`, `canonicalTransport: "gateway"`, and the gateway's positive fork capability. Keep the user's Card selection, disable unsafe sends/recovery or branching as appropriate, and retry `/api/session-cards` after the affected source recovers. Never guess the canonical segment or transport, route via a child, or fall back to `/api/sessions`.

   The `sources` array identifies whether collection was incomplete or unavailable and whether retry is safe. Restore or wait for the affected canonical service, then refresh/retry. Do not start duplicate services solely because one source is degraded, edit lineage to force completeness, merge transcripts manually, or archive/delete the Card to recover.

5. With disposable, non-sensitive Card data, verify the same behavior on desktop and mobile:
   - send parent turns before and after a validated continuation and confirm the Card route and selection stay stable while delivery resolves to the current canonical segment;
   - refresh and confirm one continuous parent history spans the validated continuation segments;
   - inspect a child and use `Back to parent conversation`; confirm neither inspection nor child activity replaces the parent Card or parent send target;
   - rename, pin/unpin, create a whole-Card branch, and archive from the parent Card only;
   - confirm the branch remains beneath the parent and the parent stays selected;
   - confirm an archived Card leaves the active list without any remote logical-Card deletion claim or flow.

6. Health and list responses prove only the states described above, not end-to-end Card behavior. If no safe continuation/child fixture exists, leave that case unforced. Do not supply or record credentials, raw user transcript content, attachments, or tool output.
