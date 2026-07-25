# Session Lineage

## Purpose

Hermes backends can report relationships between session records. Workspace uses that metadata to keep related sessions discoverable, collapse confirmed compression continuations into one logical conversation, and show branches or delegated sessions beneath their parent.

Lineage changes navigation and presentation only. Workspace does not concatenate transcripts in the browser.

## Relationship Kinds and Display

Workspace normalizes sessions into five relationship kinds:

| Kind           | Meaning                                                                                                                                                  | User-visible presentation                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `root`         | An independent session. Sessions with a `local` or `portable` lineage source are always roots.                                                           | A top-level session row.                                                                                                 |
| `continuation` | A backend-confirmed successor segment of the same logical conversation, normally created by compression or a compatible lifecycle transition.            | Confirmed segments collapse to one row represented by the selected tip. Multiple segments show `Continued · N segments`. |
| `branch`       | A whole-session fork (`sessionSource: fork`) with an available parent.                                                                                   | A nested row labeled `Branch`; a continued branch shows `Branch · N segments`.                                           |
| `child`        | A `child_session` or cross-surface child with an available parent.                                                                                       | A nested row labeled `Delegated session`; continued children retain that label and add their segment count.              |
| `orphan`       | A related session whose parent cannot be used safely: for example, the parent is absent, the relation is unknown, or the ancestry is cyclic or too deep. | A discoverable top-level row labeled `Original session unavailable`.                                                     |

Rows with children can be expanded. The active row's ancestors are expanded automatically. Continuation selection prefers a backend-declared tip, then the greatest compression segment count, a non-snapshot record, and the most recent activity.

Workspace does not infer a continuation from `parentSessionId`, a declared root/tip, or a continuation label alone. Every collapse requires matching sources and lifecycle evidence: the parent ended with `compression` or `cli_close`, and the child has a valid start time that is not before the parent's recorded end when that boundary is available. Recognized continuation metadata identifies a candidate but cannot skip those checks. An explicit unknown relationship is shown as an orphan rather than guessed.

## Continuations Versus Branches

A **continuation** is another storage segment of the same logical conversation. Workspace maps all confirmed segment IDs to one visible tip and navigates stale segment routes to the backend's latest descendant when that capability is available.

A **branch** is a separate conversation derived from a parent. It remains a child row and loads history for its own authoritative backend session ID. The fork API creates whole-session branches only; message-targeted branching is rejected.

Neither behavior merges message arrays client-side. Collapsing continuation rows is a display and routing operation, and opening any row loads that backend session's history. In particular, a branch does not inherit a browser-combined copy of its parent's transcript.

## Backend Capabilities and Degradation

Lineage is optional backend functionality and must not block ordinary history navigation.

- `GET /api/sessions/:sessionKey/latest-descendant` proxies canonical resolution. On an upstream failure it returns the requested key unchanged with `supported: false` and `changed: false`.
- The client accepts a replacement only when the response is successful and explicitly reports `supported: true`, `changed: true`, the exact requested key, and a different non-empty session key. Unsupported, failed, unchanged, or malformed responses keep the original key. An aborted navigation remains aborted rather than being converted to a fallback.
- If lineage metadata is missing, independent sessions remain ordinary roots. Related records with enough child or fork context but no available parent remain visible as orphans.
- Branch creation is shown only when the `sessionFork` capability is confirmed and the row has an authoritative remote backend key. `local` and `portable` sessions are not fork-eligible.
- A missing or failed fork capability probe, or a backend that reports fork unavailable, produces a capability-unavailable `503` response. Other upstream fork failures return `502`.
- Successful fork navigation also requires the response to identify the requested parent and a new authoritative child session. Workspace does not navigate on an inconsistent response.

## Privacy and Source Boundaries

Lineage metadata is list-safe relationship data, not permission to combine session content.

- A source mismatch prevents two records from being collapsed as a continuation.
- `local` and `portable` records stay independent roots even if parent-like metadata is present.
- Cross-surface children can be represented as related rows when the backend says so, but their transcripts are still fetched from their own session records.
- Do not copy credentials, transcript text, attachment contents, or tool outputs into documentation, test fixtures, screenshots, or troubleshooting notes. Use disposable sessions and non-sensitive marker text for verification.

## Troubleshooting

### A stale link does not move to the continuation tip

1. Refresh the session list and reopen the link. Canonicalization occurs only for a supported, changed, matching latest-descendant response.
2. If the backend does not support latest-descendant resolution, Workspace intentionally keeps the requested key so normal history can load.
3. If that old record no longer exists, open the current tip or visible orphan from the Sessions list. Do not guess a successor from titles or manually combine exported transcripts.
4. If a response names the wrong requested session or an empty/same descendant, treat it as an incompatible backend response; Workspace safely ignores it.

### The branch action is missing or fails

1. A missing action is expected when fork capability has not been confirmed, the session has no authoritative backend key, or its source is `local` or `portable`.
2. Refresh after the gateway is reachable so capabilities can be probed again. A `503` means whole-session branching is unavailable on that backend.
3. Branch the complete conversation. Message IDs, message indexes, keep counts, and other message-targeting options are not supported.
4. A `502` indicates an upstream failure or an inconsistent fork response. Keep using the parent session and retry only after the backend is healthy.

## Credential-Free Manual Verification

Follow `AGENTS.md`: reuse the existing gateway on `127.0.0.1:8642` and Dashboard on `127.0.0.1:9119`; do not start duplicate backends.

1. Probe the canonical services and check for an existing Workspace before starting anything:

   ```bash
   curl -i --max-time 2 http://127.0.0.1:8642/health
   curl -i --max-time 2 http://127.0.0.1:9119/
   curl -i --max-time 2 http://127.0.0.1:3000/api/sessions
   ```

   An HTTP response, including an authentication response, proves a listener exists; it does not by itself prove lineage behavior. Do not paste tokens into these commands.

2. If Workspace is not already listening on `:3000`, start only Workspace from this checkout:

   ```bash
   pnpm dev --host 127.0.0.1 --port 3000
   ```

   Do not use `pnpm start:all`, because it also starts another gateway.

3. In Workspace, use a disposable, non-sensitive remote session:
   - send two ordinary turns and confirm they remain one same-ID conversation;
   - open a session for which the backend already reports a compression continuation, refresh, and confirm the route and visible row select the tip with a segment count;
   - confirm a known delegated child is nested, or is labeled unavailable when its parent is absent;
   - when the branch action is present, create a whole-session branch and confirm it appears beneath the parent and opens only its own backend history;
   - repeat navigation in desktop and mobile session lists, including expand/collapse and keyboard focus.

4. If no safe compressed or child fixture exists, leave that manual case unforced and use the focused automated lineage tests. Do not edit backend state or copy real session content merely to manufacture a demo.
