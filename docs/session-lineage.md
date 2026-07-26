# Session Lineage

## Purpose

Hermes backends can report relationships between session records. Workspace validates those facts and projects them as Session Cards: one stable parent conversation across its confirmed continuation segments, with branches and delegated sessions visible beneath it.

Workspace requests server-assembled Card history across validated parent continuation segments. The parent history never includes a branch, child, or delegate transcript.

## Relationship Kinds and Display

Workspace normalizes sessions into five relationship kinds:

| Kind           | Meaning                                                                                                                                              | User-visible presentation                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `root`         | An independent conversation. Sessions with a `local` or `portable` lineage source are always roots.                                                  | One top-level Session Card.                                                             |
| `continuation` | A backend-confirmed successor segment of the same logical parent conversation, normally created by compression or a compatible lifecycle transition. | Hidden within the parent Card; optional quiet text may report `Continued · N segments`. |
| `branch`       | A whole-conversation fork (`sessionSource: fork`) with an available parent.                                                                          | A child Card or activity node beneath the parent.                                       |
| `child`        | A `child_session` or cross-surface delegated session with an available parent.                                                                       | A nested activity node with optional transcript inspection.                             |
| `orphan`       | A record whose parent cannot be used safely because it is absent, unknown, cyclic, too deep, or otherwise invalid.                                   | A safe top-level Card labeled `Original session unavailable`.                           |

Workspace does not infer a continuation from `parentSessionId`, a declared root/tip, a title, or a continuation label alone. A continuation requires compatible sources and valid backend lifecycle evidence. Explicit forks and child sessions are never continuation members. Unknown or unsafe relationships remain visible as orphans rather than being guessed.

## Stable Card Identity and Canonical Segments

A `cardId` is the stable user-facing identity of a logical parent conversation. A `canonicalSegmentKey` is the mutable backend session key that currently receives parent sends and live parent events.

- Chat routes select the stable Card ID, not an individual storage segment.
- User-facing navigation returns to the last stable Card ID. `new` is the only controlled bootstrap destination; `main` is not a permanent route alias or fallback destination.
- The server resolves the Card from a fresh validated projection and determines its current canonical segment for sending and recovery. A client-provided segment key or parent ID is not relationship authority.
- A confirmed parent continuation may rotate the canonical segment without changing the selected Card, its route, title, pin state, or actions.
- A branch, delegate, child, cross-source record, or malformed event cannot become the parent Card's canonical segment.
- Child inspection is secondary state within the selected parent Card. Closing inspection returns to the parent history; inspection never replaces parent Card selection.

## Continuous Parent History

The Card-history request is assembled on the server. It retrieves only confirmed parent continuation members in order, de-duplicates a boundary message only when stable upstream message identity supports that decision, and returns the current canonical segment with completeness information.

This is not browser-side transcript concatenation. Branch, child, and delegate histories are fetched only for explicit inspection and are never merged into the parent transcript.

Child inspection uses `?inspect=<childCardId>` on the unchanged parent `cardId` route. Workspace accepts the value only when it names a direct child in the selected parent's validated Card projection, then requests that child Card's history separately with the parent Card identity so the server revalidates ownership. The parent Card-history query remains separate and continues to own sends, live state, title, and actions. Removing `inspect` reuses the parent history under the same route.

If the child Card no longer belongs to the parent, the inspection value is malformed, or child history is missing/incomplete, Workspace does not request raw per-session history and does not substitute or merge parent messages into the inspected transcript. Available validated child messages may be shown with the Card-history completeness state; otherwise inspection stays safely empty/unavailable until closed or retried.

## Card-Scoped Actions

User actions belong to the parent Session Card, never to a hidden continuation segment or ordinary child node.

- **Title and pin:** update Card metadata keyed by `cardId`; a continuation or child has no separate title or pin action.
- **Branch:** fork the whole parent conversation from the server-resolved canonical segment. The result appears beneath the parent and cannot replace its selection.
- **Archive:** hide/archive the Card through Workspace metadata. Archival does not delete backend segments.

Branch and archive completion respect newer user intent. If a mutation starts for Card A and the user selects Card B before it completes, the late completion reconciles the Card list but does not navigate away from B. Archiving the still-selected Card moves to the controlled `new` bootstrap only after the archive succeeds.

Workspace exposes no remote logical-Card deletion because there is no upstream atomic logical-conversation deletion contract.

## Conservative Degradation

Malformed or incomplete Card data must fail safely:

- Missing, cyclic, cross-source, or unverified lineage does not create a relationship, hide a record, or reroute parent traffic.
- If the server cannot retrieve the complete confirmed continuation component, Card history reports an explicit incomplete or unavailable state. The selected Card is preserved; Workspace does not fabricate continuity, substitute a child history, or silently fall back to a legacy per-segment route.
- If the canonical parent segment cannot be validated for a send or recovery, Workspace keeps the Card selected and exposes a safe unavailable/retry state rather than guessing a destination.
- Branching remains unavailable when the whole-conversation fork capability or a consistent backend response is absent.
- Metadata corruption must not introduce transcript data or inferred relationships; a safe default display state is preferable to invented Card state.

## Privacy and Source Boundaries

Lineage and Card metadata are list-safe relationship data, not permission to combine session content.

- A source mismatch prevents records from joining the same continuation component.
- `local` and `portable` records remain independent roots even when parent-like metadata is present.
- Cross-surface children may be shown beneath a Card only when validated, and their transcripts remain separate.
- Do not copy credentials, raw transcript text, attachment contents, or tool outputs into documentation, screenshots, fixtures, or troubleshooting notes. Use disposable sessions and non-sensitive markers for verification.

## Troubleshooting

### Parent history is incomplete or unavailable

1. Refresh the Card list so the server can rebuild the projection from current lineage facts.
2. Keep the parent Card selected and retry its history. Do not navigate to a continuation segment or combine exported transcripts manually.
3. Treat a missing segment, inconsistent identity, or malformed lineage response as incomplete Card data. Do not infer relationships from titles or timestamps.

### The branch action is missing or fails

1. A missing action is expected when whole-conversation fork capability has not been confirmed or no canonical parent segment can be validated.
2. Branch the complete Card only; message-targeted branching is not part of this contract.
3. An inconsistent fork response must leave the parent Card selected and unchanged.

## Credential-Free Manual Verification

Follow `AGENTS.md`: reuse the existing gateway on `127.0.0.1:8642` and Dashboard on `127.0.0.1:9119`; do not start duplicate backends.

1. Probe the canonical services and check for an existing Workspace without supplying credentials:

   ```bash
   curl -i --max-time 2 http://127.0.0.1:8642/health
   curl -i --max-time 2 http://127.0.0.1:9119/
   curl -i --max-time 2 http://127.0.0.1:3000/api/sessions
   ```

   A response proves that a listener exists, not that Card behavior is correct. Do not paste tokens into these commands.

2. If Workspace is not already listening on `:3000`, start only Workspace from this checkout:

   ```bash
   pnpm dev --host 127.0.0.1 --port 3000
   ```

   Do not use `pnpm start:all`, because it also starts another gateway.

3. With a disposable, non-sensitive fixture that has a parent continuation and a child, verify on both desktop and mobile:
   - the parent Card remains selected and keeps the same Card route while its canonical continuation changes;
   - parent history is continuous across validated continuation segments, without segment rows or separators;
   - the child appears beneath the parent, can be inspected, and `Back to parent conversation` restores the parent history;
   - child activity or stream events cannot replace the selected parent Card or parent pane;
   - title, pin/unpin, whole-Card branch, and archive actions are available only from the parent Card and retain Card scope;
   - a created branch remains beneath the parent and does not change parent selection;
   - archiving removes the Card from the active list without presenting or performing remote logical-Card deletion.

4. If no safe continuation/child fixture exists, leave that case unforced. Do not edit backend lineage, include secrets, or record raw user transcript, attachment, or tool-output content merely to manufacture a demonstration.
