# Workspace Chat Session Routing

## Purpose

Hermes Workspace routes chat by stable Session Card identity while backend storage may rotate through continuation segments. A Card route identifies the logical parent conversation; it does not expose or select an individual continuation segment.

For each send, stream handoff, and recovery operation, the server validates the Card against current lineage data and resolves its mutable canonical segment. Workspace also supports OpenAI-compatible `/v1/chat/completions`; its session headers carry that resolved backend segment and are transport details, not user-facing identity.

See [Session Lineage](./session-lineage.md) for Card projection, actions, history, and degradation behavior.

## Identity and Routing Contract

| Identity              | Scope                              | Contract                                                                                               |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `cardId`              | Stable logical parent conversation | Owns the visible route, selection, title, pin state, actions, pending state, and parent-history query. |
| `canonicalSegmentKey` | Mutable backend parent segment     | Receives the next parent send and live parent stream events after server-side validation.              |
| `childSessionKey`     | Branch/delegate/child record       | May be used for explicit inspection, but cannot take over the parent Card route or canonical segment.  |

A browser-supplied segment key, title, or parent ID is never sufficient to construct a Card relation or choose a send destination. A confirmed continuation may update `canonicalSegmentKey` while `cardId` and parent selection remain unchanged.

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
- branch resolves the current canonical parent segment and forks the whole Card;
- archive changes Workspace metadata and hides the Card from the active list.

Continuation segments and ordinary child nodes do not own these actions. Archive is not remote logical-Card deletion, and Workspace exposes no such deletion without an upstream atomic logical-conversation contract.

## Conservative Degradation

Malformed or incomplete Card data must not invent a relationship or destination.

- If Card projection or canonical-segment validation is unavailable, preserve the selected Card and present a safe unavailable/retry state. Do not guess a segment, accept a child, or silently use a legacy per-segment route.
- If only part of a confirmed continuation component can be retrieved, report history as incomplete. Do not fabricate a continuous transcript or merge a branch/delegate/child transcript.
- A malformed stream handoff cannot change the route, Card selection, or parent send target.
- An unavailable or inconsistent fork response leaves the parent Card unchanged.

## Credential-Free Manual Verification

Reuse the canonical gateway on `127.0.0.1:8642` and Dashboard on `127.0.0.1:9119`. Do not start duplicate backends.

1. Probe the existing services and Workspace endpoint without supplying credentials:

   ```bash
   curl -i --max-time 2 http://127.0.0.1:8642/health
   curl -i --max-time 2 http://127.0.0.1:9119/
   curl -i --max-time 2 http://127.0.0.1:3000/api/sessions
   ```

2. If Workspace is not already listening, start only Workspace on `:3000`:

   ```bash
   pnpm dev --host 127.0.0.1 --port 3000
   ```

   Do not use `pnpm start:all`; it also starts another gateway.

3. With disposable, non-sensitive Card data, verify the same behavior on desktop and mobile:
   - send parent turns before and after a validated continuation and confirm the Card route and selection stay stable while delivery resolves to the current canonical segment;
   - refresh and confirm one continuous parent history spans the validated continuation segments;
   - inspect a child and use `Back to parent conversation`; confirm neither inspection nor child activity replaces the parent Card or parent send target;
   - rename, pin/unpin, create a whole-Card branch, and archive from the parent Card only;
   - confirm the branch remains beneath the parent and the parent stays selected;
   - confirm an archived Card leaves the active list without any remote logical-Card deletion claim or flow.

4. A health response proves reachability only. If no safe continuation/child fixture exists, leave that case unforced. Do not supply or record credentials, raw user transcript content, attachments, or tool output.
