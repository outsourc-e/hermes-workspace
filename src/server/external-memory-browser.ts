import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const VALID_STATES = new Set(['candidate', 'approved', 'rejected'])

export type ExternalMemoryProvider = {
  id: string
  label: string
  kind: 'custom'
  capabilities: Array<string>
  dbPath: string
  configPath: string
  available: boolean
}

export type ExternalMemoryCandidate = {
  provider: string
  id: string
  text: string
  source: string
  metadata: Record<string, unknown>
  state: string
  contentSha256: string
  createdAt: number
  updatedAt: number
}

export type ExternalMemoryListResult = {
  ok: true
  provider: string
  state: string
  limit: number
  offset: number
  count: number
  total: number
  counts: Record<'candidate' | 'approved' | 'rejected' | 'all', number>
  candidates: Array<ExternalMemoryCandidate>
}

export type ExternalMemorySearchResult = {
  ok: true
  provider: string
  query: string
  limit: number
  count: number
  results: Array<ExternalMemoryCandidate>
}

export type ExternalMemoryCandidateResult = {
  ok: true
  provider: string
  candidate: ExternalMemoryCandidate
}

export type ExternalMemoryDeleteResult = {
  ok: true
  provider: string
  deleted: string
}

type RawProviderConfig = {
  id?: unknown
  name?: unknown
  label?: unknown
  db_path?: unknown
  config_path?: unknown
}

function getHermesHome(): string {
  const envHome = (process.env.HERMES_HOME || process.env.CLAUDE_HOME)?.trim()
  return path.resolve(envHome || path.join(os.homedir(), '.hermes'))
}

function safeProviderId(value: unknown): string | null {
  const provider = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (!provider || !/^[a-z0-9_]+$/.test(provider)) return null
  return provider
}

function resolveUnderHermesHome(hermesHome: string, input: unknown): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  const expanded = raw.startsWith('~/')
    ? path.join(os.homedir(), raw.slice(2))
    : raw
  return path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(hermesHome, expanded)
}

function readProviderRegistry(): Array<RawProviderConfig> {
  const registryPath = path.join(
    getHermesHome(),
    'external_memory_providers.json',
  )
  if (!fs.existsSync(registryPath)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as unknown
    if (Array.isArray(parsed)) return parsed as Array<RawProviderConfig>
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { providers?: unknown }).providers)
    ) {
      return (parsed as { providers: Array<RawProviderConfig> }).providers
    }
  } catch {
    return []
  }
  return []
}

export function listExternalMemoryProviders(): {
  ok: true
  active: string
  providers: Array<ExternalMemoryProvider>
} {
  const hermesHome = getHermesHome()
  const seen = new Set<string>()
  const providers: Array<ExternalMemoryProvider> = []

  for (const item of readProviderRegistry()) {
    const id = safeProviderId(item.id ?? item.name)
    if (!id || seen.has(id)) continue
    const dbPath = resolveUnderHermesHome(hermesHome, item.db_path)
    if (!dbPath) continue
    const configPath = resolveUnderHermesHome(hermesHome, item.config_path)
    seen.add(id)
    providers.push({
      id,
      label: String(
        item.label ||
          id.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
      ),
      kind: 'custom',
      capabilities: ['review', 'search'],
      dbPath,
      configPath,
      available: fs.existsSync(dbPath) || fs.existsSync(path.dirname(dbPath)),
    })
  }

  return { ok: true, active: providers[0]?.id || '', providers }
}

function getProvider(provider?: string): ExternalMemoryProvider {
  const providers = listExternalMemoryProviders().providers
  if (providers.length === 0)
    throw new Error('No external memory providers configured')
  const providerId = provider ? safeProviderId(provider) : providers[0]?.id
  const match = providers.find((item) => item.id === providerId)
  if (!match)
    throw new Error(`External memory provider not found: ${providerId || ''}`)
  return match
}

function coerceLimit(
  value: number | string | undefined,
  defaultValue: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(String(value ?? defaultValue), 10)
  if (!Number.isFinite(parsed)) return defaultValue
  return Math.max(1, Math.min(parsed, maximum))
}

function coerceOffset(value: number | string | undefined): number {
  const parsed = Number.parseInt(String(value ?? 0), 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

const PYTHON_SCRIPT = String.raw`import hashlib, json, sqlite3, sys, time

db_path, provider, mode = sys.argv[1], sys.argv[2], sys.argv[3]
state = sys.argv[4]
limit = int(sys.argv[5])
offset = int(sys.argv[6])
query = sys.argv[7] if len(sys.argv) > 7 else ""

conn = sqlite3.connect("file:" + db_path + ("?mode=ro" if mode in ("list", "search") else ""), uri=True)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

def row_to_candidate(row):
    try:
        metadata = json.loads(row["metadata_json"] or "{}")
        if not isinstance(metadata, dict):
            metadata = {}
    except Exception:
        metadata = {}
    return {
        "provider": provider,
        "id": row["id"],
        "text": row["text"],
        "source": row["source"],
        "metadata": metadata,
        "state": row["state"],
        "contentSha256": row["content_sha256"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }

if mode == "search":
    pattern = "%" + query + "%"
    rows = cur.execute(
        """
        select * from candidates
        where text like ? or metadata_json like ? or source like ?
        order by case when state='approved' then 0 when state='candidate' then 1 else 2 end,
                 updated_at desc
        limit ?
        """,
        (pattern, pattern, pattern, limit),
    ).fetchall()
    result = {"ok": True, "provider": provider, "query": query, "limit": limit, "count": len(rows), "results": [row_to_candidate(row) for row in rows]}
elif mode in ("edit", "approve", "reject", "delete"):
    candidate_id = state
    row = cur.execute("select * from candidates where id=?", (candidate_id,)).fetchone()
    if not row:
        raise RuntimeError("candidate not found: " + candidate_id)
    now = time.time()
    if mode == "delete":
        cur.execute("delete from candidates where id=?", (candidate_id,))
        conn.commit()
        result = {"ok": True, "provider": provider, "deleted": candidate_id}
    else:
        candidate = row_to_candidate(row)
        metadata = dict(candidate.get("metadata") or {})
        if mode == "edit":
            next_text = query.strip()
            if not next_text:
                raise RuntimeError("text is required")
            if candidate.get("state") == "approved":
                raise RuntimeError("approved external memory cannot be edited; create a new candidate instead")
            metadata["edited_at"] = now
            cur.execute(
                "update candidates set text=?, content_sha256=?, metadata_json=?, updated_at=? where id=?",
                (next_text, hashlib.sha256(next_text.encode("utf-8")).hexdigest(), json.dumps(metadata, ensure_ascii=False, sort_keys=True), now, candidate_id),
            )
        elif mode == "approve":
            metadata["approved_at"] = now
            cur.execute("update candidates set state=?, metadata_json=?, updated_at=? where id=?", ("approved", json.dumps(metadata, ensure_ascii=False, sort_keys=True), now, candidate_id))
        else:
            metadata["review_reason"] = query or ""
            metadata["reviewed_at"] = now
            cur.execute("update candidates set state=?, metadata_json=?, updated_at=? where id=?", ("rejected", json.dumps(metadata, ensure_ascii=False, sort_keys=True), now, candidate_id))
        conn.commit()
        updated = cur.execute("select * from candidates where id=?", (candidate_id,)).fetchone()
        result = {"ok": True, "provider": provider, "candidate": row_to_candidate(updated)}
else:
    state_counts = dict(cur.execute("select state, count(*) from candidates group by state").fetchall())
    counts = {
        "candidate": int(state_counts.get("candidate", 0)),
        "approved": int(state_counts.get("approved", 0)),
        "rejected": int(state_counts.get("rejected", 0)),
    }
    counts["all"] = counts["candidate"] + counts["approved"] + counts["rejected"]
    if state == "all":
        rows = cur.execute("select * from candidates order by created_at desc limit ? offset ?", (limit, offset)).fetchall()
        total = counts["all"]
    else:
        rows = cur.execute("select * from candidates where state=? order by created_at desc limit ? offset ?", (state, limit, offset)).fetchall()
        total = counts[state]
    result = {"ok": True, "provider": provider, "state": state, "limit": limit, "offset": offset, "count": len(rows), "total": total, "counts": counts, "candidates": [row_to_candidate(row) for row in rows]}

conn.close()
print(json.dumps(result))
`

function runSqliteQuery<T>(
  provider: ExternalMemoryProvider,
  args: Array<string>,
): T {
  if (!fs.existsSync(provider.dbPath)) {
    throw new Error(`External memory database not found: ${provider.dbPath}`)
  }
  const raw = execFileSync(
    'python3',
    ['-c', PYTHON_SCRIPT, provider.dbPath, provider.id, ...args],
    {
      encoding: 'utf-8',
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    },
  )
  return JSON.parse(raw) as T
}

export function listExternalMemoryCandidates(options: {
  provider?: string
  state?: string
  limit?: number | string
  offset?: number | string
}): ExternalMemoryListResult {
  const provider = getProvider(options.provider)
  const requestedState = String(options.state || 'all')
    .trim()
    .toLowerCase()
  const state =
    !requestedState || requestedState === 'all' ? 'all' : requestedState
  if (state !== 'all' && !VALID_STATES.has(state)) {
    throw new Error('state must be one of: candidate, approved, rejected, all')
  }
  const limit = coerceLimit(options.limit, 100, 500)
  const offset = coerceOffset(options.offset)
  return runSqliteQuery<ExternalMemoryListResult>(provider, [
    'list',
    state,
    String(limit),
    String(offset),
  ])
}

export function searchExternalMemoryCandidates(options: {
  provider?: string
  query: string
  limit?: number | string
}): ExternalMemorySearchResult {
  const provider = getProvider(options.provider)
  const query = options.query.trim()
  if (!query) throw new Error('query is required')
  const limit = coerceLimit(options.limit, 25, 100)
  return runSqliteQuery<ExternalMemorySearchResult>(provider, [
    'search',
    'all',
    String(limit),
    '0',
    query,
  ])
}

function runExternalMemoryMutation<T>(options: {
  provider?: string
  id: string
  mode: 'edit' | 'approve' | 'reject' | 'delete'
  value?: string
}): T {
  const provider = getProvider(options.provider)
  const id = String(options.id || '').trim()
  if (!id) throw new Error('candidate id is required')
  return runSqliteQuery<T>(provider, [
    options.mode,
    id,
    '1',
    '0',
    options.value || '',
  ])
}

export function editExternalMemoryCandidate(options: {
  provider?: string
  id: string
  text: string
}): ExternalMemoryCandidateResult {
  const text = String(options.text || '').trim()
  if (!text) throw new Error('text is required')
  return runExternalMemoryMutation<ExternalMemoryCandidateResult>({
    provider: options.provider,
    id: options.id,
    mode: 'edit',
    value: text,
  })
}

export function approveExternalMemoryCandidate(options: {
  provider?: string
  id: string
}): ExternalMemoryCandidateResult {
  return runExternalMemoryMutation<ExternalMemoryCandidateResult>({
    provider: options.provider,
    id: options.id,
    mode: 'approve',
  })
}

export function rejectExternalMemoryCandidate(options: {
  provider?: string
  id: string
  reason?: string
}): ExternalMemoryCandidateResult {
  return runExternalMemoryMutation<ExternalMemoryCandidateResult>({
    provider: options.provider,
    id: options.id,
    mode: 'reject',
    value: options.reason || '',
  })
}

export function deleteExternalMemoryCandidate(options: {
  provider?: string
  id: string
}): ExternalMemoryDeleteResult {
  return runExternalMemoryMutation<ExternalMemoryDeleteResult>({
    provider: options.provider,
    id: options.id,
    mode: 'delete',
  })
}
