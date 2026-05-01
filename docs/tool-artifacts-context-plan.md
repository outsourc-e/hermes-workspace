# Tool Output Artifacts / Context Bloat Plan

Date: 2026-04-24

## Problem

Claude Agent sessions fill context extremely fast during normal tool-heavy workflows. In one Workspace session (`cda915a9-fbf6-4bbf-9617-e7e9d26f40be`):

- 256 messages total
- 7 user messages
- 117 assistant messages
- 132 tool messages
- ~603k chars of tool output
- ~152k rough tokens

The bloat is not user/assistant conversation. It is mostly persisted execution trace:

- large `read_file` chunks
- terminal/test logs
- full `skill_view` docs
- GitHub issue/PR listings
- patch/diff outputs

This causes:

1. Context window fills quickly despite normal Claude behavior.
2. Auto-compaction warnings appear early/often.
3. Workspace chat UI becomes dominated by tool cards and looks like user/assistant messages disappeared.
4. The model is force-fed large tool outputs every turn even when it only needs pointers/summaries.

## Key Insight

Claude currently blends two separate concepts:

1. **Conversation/model context** — what the LLM needs to reason.
2. **Execution trace/artifacts** — full tool outputs, logs, file contents, diffs, skill docs.

They should be separated.

## Desired Architecture

Use **artifact-backed tool outputs + compact context projection**.

### Chat transcript should contain

- user messages
- assistant final messages
- compact tool summaries/pointers

Example compact tool message:

```json
{
  "role": "tool",
  "content": {
    "tool": "read_file",
    "summary": "Read src/screens/chat/components/chat-message-list.tsx lines 680-1499",
    "chars": 36334,
    "artifact_id": "toolout_abc123",
    "truncated": true
  }
}
```

### Inspector artifacts should contain

Full tool outputs/logs/artifacts, lazily loaded:

```ts
type InspectorArtifact = {
  id: string
  sessionId: string
  toolCallId?: string
  kind: 'tool_output' | 'file_read' | 'terminal_log' | 'diff' | 'skill_doc'
  title: string
  summary: string
  preview: string
  contentSize: number
  contentPath?: string
  createdAt: number
}
```

### Model context should receive

Only compact summaries by default:

```txt
Tool read_file completed.
Summary: Read chat-message-list.tsx lines 680-1499.
Full output stored as artifact toolout_abc123.
Use artifact_read(toolout_abc123, offset, limit) if needed.
```

## Current Workspace Inspector State

Checked code:

- `src/components/inspector/activity-store.ts`
  - Zustand in-memory store only
  - stores `{ type, time, text }`
  - not durable; gone on refresh
- `src/components/inspector/inspector-panel.tsx`
  - Artifacts tab filters `events.filter(e => e.type === 'artifact')`
  - displays text/time only
  - no full content, IDs, previews, or lazy loading

So the right panel is the correct UX destination, but needs a durable backing store.

## Implementation Options

### Option A — Canonical Claude Agent artifact store

Best long-term because all clients benefit: CLI, gateway, Workspace, future WebUI.

Add a table/store to Claude Agent:

```sql
tool_artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id INTEGER,
  tool_name TEXT,
  kind TEXT,
  title TEXT,
  content_path TEXT,
  content_preview TEXT,
  content_size INTEGER,
  created_at REAL
)
```

Large content on disk:

```txt
~/.claude/sessions/artifacts/<session_id>/<artifact_id>.json
```

API endpoints:

```txt
GET /api/sessions/:sessionId/artifacts
GET /api/artifacts/:artifactId
```

### Option B — Workspace MVP artifact cache

Faster Workspace-only patch.

Store artifacts under:

```txt
~/claude-workspace/.runtime/artifacts/<session_id>/<artifact_id>.json
```

or a small local DB/JSON index.

Workspace `/api/history` or `/api/send-stream` externalizes oversized tool results before rendering/sending to React.

Good MVP, but not enough for canonical model-context bloat unless Claude Agent context builder also stops reinjecting the full tool payload.

## Policy Proposal

Use a size threshold:

```ts
const INLINE_TOOL_OUTPUT_LIMIT = 4_000
```

If tool output <= 4k chars:

- keep inline

If > 4k chars:

- store full output as artifact
- replace chat/session content with summary + artifact pointer
- show compact card in chat
- full content available from Inspector

## Per-tool Defaults

| Tool type | Context policy |
|---|---|
| `read_file` | Store full as artifact; context gets file path, line range, preview/excerpts |
| `search_files` | Keep compact matches inline |
| `terminal` success | Store full log; context gets command, exit code, last ~20 lines |
| `terminal` failure | Store full log; context gets command, exit code, relevant error/tail |
| `skill_view` | Store/reference skill doc; context gets skill name/version/summary/hash |
| `browser_snapshot` | Store full snapshot/artifact; context gets page summary |
| `patch` | Keep summary/full diff if small; externalize large diffs |
| `todo` | Compact state only |
| GitHub issue/PR lists | Store full list; context gets counts/top N |

## Workspace UI Fixes Already Started

Files touched in current worktree:

- `src/stores/chat-store.ts`
  - fixed persisted order: prefer `__historyIndex` before role-rank when timestamps tie
- `src/stores/chat-store.test.ts`
  - regression for user → assistant → user order with tied timestamps
- `src/screens/chat/components/chat-message-list.tsx`
  - stopped trailing tool-only assistant turns from attaching to the last text reply
  - added a terminal fallback assistant status card when persisted history ends with tool-only entries and no final assistant response was saved
- `src/screens/chat/components/chat-message-list.test.tsx`
  - regression for trailing tool-only messages not dominating last text reply
  - regression for detecting a hidden tool-only tail so Workspace can render a human-readable end-state

## Workspace MVP Artifact Store Implemented

Added in the continuation pass:

- `src/server/tool-artifacts-store.ts`
  - durable local artifact index under `.runtime/tool-artifacts/index.json`
  - full tool outputs stored under `.runtime/tool-artifacts/<session_id>/<artifact_id>.json`
  - stable artifact IDs from session/message/tool/content hash to avoid duplicates on repeated history fetches
  - `INLINE_TOOL_OUTPUT_LIMIT = 4_000`
  - `externalizeLargeToolOutput(sessionId, message)` replaces oversized tool results with compact summaries and artifact pointers
- `src/routes/api/artifacts.ts`
  - lists artifact metadata, optional `?sessionId=` filter
- `src/routes/api/artifacts.$artifactId.ts`
  - lazy-loads full artifact content by ID
- `src/routes/api/history.ts`
  - externalizes oversized tool/toolResult messages during history normalization
  - applies the same externalization path to local portable-session fallback messages
- `src/server/claude-api.ts`
  - normalizes backend `role: "tool"` to frontend `role: "toolResult"`
  - hoists `toolCallId` / `toolName` so result maps and tool cards can find outputs
- `src/components/inspector/inspector-panel.tsx`
  - Artifacts tab now reads durable artifacts from `/api/artifacts`
  - clicking an artifact lazy-loads full content from `/api/artifacts/:artifactId`
- `src/server/tool-artifacts-store.test.ts`
  - regression for compact pointer replacement and stable artifact IDs

Verified:

```bash
pnpm vitest run src/server/tool-artifacts-store.test.ts src/screens/chat/components/chat-message-list.test.tsx src/stores/chat-store.test.ts src/screens/chat/components/message-item.test.ts
pnpm exec tsc --noEmit --pretty false
pnpm build
```

All passed. Build only emitted existing chunk-size / sourcemap warnings.

## Current Diagnosis: Workspace vs Claude Agent

The trailing “Tool work completed” card is a Workspace guardrail, not the desired steady state.

Likely responsibility split:

1. **Claude Agent / session persistence is the root source** when stored history ends with tool messages and no final assistant text. A healthy agent transcript should end each tool-using turn with one user-visible assistant outcome: final answer, error, interrupted/cancelled, no-op, or compact tool-work summary.
2. **Workspace had UI/rendering bugs** that made the source problem worse:
   - backend `role: "tool"` was not normalized to frontend `toolResult`
   - `toolCallId` / `toolName` were not hoisted consistently
   - trailing tool-only rows could visually dominate the chat
   - giant tool outputs were rendered inline instead of artifact-backed
3. **Our current setup/session amplifies it** because this conversation is extremely tool-heavy and near context max; dev/tool actions after a human-readable assistant response can leave persisted tool rows at the tail.

Conclusion: Workspace should defensively collapse/tool-summary this state, but the canonical fix belongs in Claude Agent’s stream/session writer: never persist a completed chat turn that ends only with tool output.

## Claude Agent Fix Implemented

Patched `/Users/aurora/claude-agent`:

- `run_agent.py`
  - `_persist_session()` now calls `_ensure_terminal_assistant_message()` before writing JSON/SQLite.
  - If an exit path leaves the transcript ending with `role: "tool"`, Claude appends one compact synthetic assistant message instead of persisting a raw tool tail.
  - `_handle_max_iterations()` now appends fallback summary/failure messages to history in all fallback branches, not just the happy summary path.
- `tests/run_agent/test_860_dedup.py`
  - Added regression: repeated `_persist_session()` calls on a tool-tail transcript append exactly one terminal assistant message and do not duplicate rows.

Verified:

```bash
./.venv/bin/python -m pytest tests/run_agent/test_860_dedup.py -o 'addopts=' -q
./.venv/bin/python -m pytest tests/run_agent/test_860_dedup.py tests/run_agent/test_compression_persistence.py -o 'addopts=' -q
./.venv/bin/python -m py_compile run_agent.py
```

Result: all targeted tests pass.

## Recommended Next Steps

1. Keep Workspace fallback, but treat it as edge-state handling.
2. Continue canonical artifact work in Claude Agent: externalize oversized tool outputs before they enter persisted/model context, not only before Workspace renders history.
3. Continue Workspace polish:
   - explicit “Open artifact” action on compact tool-result cards
   - deep-link Inspector Artifacts tab
   - artifact cleanup/retention policy

## Key Principle

Full tool output belongs in artifacts/logs; model context should get summaries, pointers, and lazy-loaded excerpts only.
