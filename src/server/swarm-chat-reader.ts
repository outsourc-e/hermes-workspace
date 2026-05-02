import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export type SwarmChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number | null
}

export type SwarmChatReadResult = {
  sessionId: string | null
  sessionTitle: string | null
  messages: Array<SwarmChatMessage>
  ok: boolean
  error?: string
}

const PYTHON_SCRIPT = `import json, sqlite3, sys

db_path = sys.argv[1]
limit = int(sys.argv[2])

conn = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

table_names = {row[0] for row in cur.execute(
    "SELECT name FROM sqlite_master WHERE type='table'"
).fetchall()}

session_id = None
session_title = None
messages = []

if "sessions" in table_names:
    session_cols = {row[1] for row in cur.execute("PRAGMA table_info(sessions)").fetchall()}
    title_col = "title" if "title" in session_cols else None
    started_col = (
        "started_at" if "started_at" in session_cols
        else ("created_at" if "created_at" in session_cols else None)
    )
    order_clause = "ORDER BY " + started_col + " DESC" if started_col else ""
    select_cols = ["id"]
    if title_col:
        select_cols.append(title_col)
    if started_col:
        select_cols.append(started_col)
    row = cur.execute(
        "SELECT " + ", ".join(select_cols) + " FROM sessions " + order_clause + " LIMIT 1"
    ).fetchone()
    if row is not None:
        session_id = row["id"]
        if title_col:
            session_title = row[title_col]

if session_id and "messages" in table_names:
    msg_cols = {row[1] for row in cur.execute("PRAGMA table_info(messages)").fetchall()}
    role_col = "role" if "role" in msg_cols else None
    content_col = (
        "content" if "content" in msg_cols
        else ("text" if "text" in msg_cols else None)
    )
    ts_col = (
        "created_at" if "created_at" in msg_cols
        else ("timestamp" if "timestamp" in msg_cols
              else ("started_at" if "started_at" in msg_cols else None))
    )
    if role_col and content_col:
        order_by = ts_col if ts_col else "id"
        ts_select = ", " + ts_col + " as ts" if ts_col else ""
        rows = cur.execute(
            "SELECT id, " + role_col + " as role, " + content_col + " as content"
            + ts_select
            + " FROM messages WHERE session_id = ? ORDER BY " + order_by + " DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        for r in reversed(rows):
            content = r["content"]
            text = ""
            if isinstance(content, str):
                stripped = content.strip()
                if stripped.startswith("[") or stripped.startswith("{"):
                    try:
                        parsed = json.loads(content)
                        if isinstance(parsed, list):
                            parts = []
                            for block in parsed:
                                if not isinstance(block, dict):
                                    continue
                                btype = block.get("type")
                                if btype in (None, "text"):
                                    parts.append(block.get("text", ""))
                                elif btype == "tool_use":
                                    parts.append("[tool:" + str(block.get("name", "?")) + "]")
                                elif btype == "tool_result":
                                    val = block.get("content", "")
                                    if isinstance(val, list):
                                        sub = []
                                        for v in val:
                                            if isinstance(v, dict) and v.get("type") == "text":
                                                sub.append(v.get("text", ""))
                                        val = "\\n".join(sub)
                                    parts.append(str(val)[:400])
                            text = "\\n".join(p for p in parts if p)
                        elif isinstance(parsed, dict):
                            text = parsed.get("text") or parsed.get("content") or content
                        else:
                            text = content
                    except Exception:
                        text = content
                else:
                    text = content
            else:
                text = str(content) if content is not None else ""
            ts = None
            if ts_col:
                raw_ts = r["ts"]
                if isinstance(raw_ts, (int, float)):
                    ts = int(raw_ts)
                elif isinstance(raw_ts, str):
                    try:
                        ts = int(raw_ts)
                    except ValueError:
                        ts = None
            messages.append({
                "id": str(r["id"]),
                "role": r["role"] or "assistant",
                "content": text.strip(),
                "timestamp": ts,
            })

conn.close()
print(json.dumps({
    "sessionId": session_id,
    "sessionTitle": session_title,
    "messages": messages,
}))
`

export function readWorkerMessages(profilePath: string, limit: number): SwarmChatReadResult {
  const dbPath = join(profilePath, 'state.db')
  if (!existsSync(dbPath)) {
    return {
      sessionId: null,
      sessionTitle: null,
      messages: [],
      ok: false,
    }
  }
  try {
    const raw = execFileSync(
      'python3',
      ['-c', PYTHON_SCRIPT, dbPath, String(limit)],
      { encoding: 'utf-8', timeout: 5_000 },
    )
    const parsed = JSON.parse(raw) as {
      sessionId: string | null
      sessionTitle: string | null
      messages: Array<SwarmChatMessage>
    }
    return { ...parsed, ok: true }
  } catch (err) {
    return {
      sessionId: null,
      sessionTitle: null,
      messages: [],
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
