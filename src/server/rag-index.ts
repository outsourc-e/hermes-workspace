/**
 * Local RAG memory layer.
 *
 * Embeds durable knowledge (vault notes, skills, playbook, recent swarm
 * outcomes, shared handoffs) into a single on-disk vector index using a
 * local ollama embedding model — no cloud calls, no new dependencies.
 *
 * Design:
 *   - Index lives at ~/.hermes/memory/rag-index.json
 *   - Incremental: chunks are keyed by source path + mtime; unchanged files
 *     reuse their stored vectors, so refresh cost is proportional to churn.
 *   - Refresh is throttled (REFRESH_MIN_MS) and lazy — callers just search.
 *   - Graceful degradation: if ollama is down or the model is missing,
 *     search falls back to keyword scoring over the stored chunk text.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import { readSwarmOutcomes } from './swarm-outcomes'

export type RagChunk = {
  id: string
  source: 'vault' | 'playbook' | 'outcome' | 'handoff'
  path: string
  mtime: number
  text: string
  vec: Array<number> | null
}

export type RagHit = {
  source: RagChunk['source']
  path: string
  score: number
  snippet: string
}

const EMBED_URL =
  process.env.HERMES_OLLAMA_URL || 'http://127.0.0.1:11434/api/embed'
const EMBED_MODEL = process.env.HERMES_EMBED_MODEL || 'nomic-embed-text'
const INDEX_PATH = join(homedir(), '.hermes', 'memory', 'rag-index.json')
const REFRESH_MIN_MS = 5 * 60 * 1000
const MAX_FILES = 800
const MAX_CHUNK_CHARS = 1400
const MAX_OUTCOMES = 200
const EMBED_BATCH = 32

function vaultDir(): string {
  return (
    process.env.HERMES_KNOWLEDGE_VAULT || join(homedir(), 'workspace', 'vault')
  )
}

function handoffsDir(): string {
  return join(homedir(), '.hermes', 'memory', 'handoffs', 'swarm')
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/** Split markdown into heading-aligned chunks capped at MAX_CHUNK_CHARS. */
export function chunkMarkdown(text: string): Array<string> {
  const sections = text.split(/\n(?=## )/)
  const out: Array<string> = []
  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue
    if (trimmed.length <= MAX_CHUNK_CHARS) {
      out.push(trimmed)
      continue
    }
    for (let i = 0; i < trimmed.length; i += MAX_CHUNK_CHARS) {
      out.push(trimmed.slice(i, i + MAX_CHUNK_CHARS))
    }
  }
  return out.filter((c) => c.length >= 40)
}

function listMarkdownFiles(root: string, maxDepth = 4): Array<string> {
  if (!existsSync(root)) return []
  const out: Array<string> = []
  function walk(dir: string, depth: number) {
    if (depth > maxDepth || out.length >= MAX_FILES) return
    let names: Array<string> = []
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      const path = join(dir, name)
      let st
      try {
        st = statSync(path)
      } catch {
        continue
      }
      if (st.isDirectory()) walk(path, depth + 1)
      else if (name.endsWith('.md') && out.length < MAX_FILES) out.push(path)
    }
  }
  walk(root, 0)
  return out
}

// ---------------------------------------------------------------------------
// Source gathering — returns desired chunk set (vectors filled later)
// ---------------------------------------------------------------------------

function gatherDesiredChunks(): Array<RagChunk> {
  const chunks: Array<RagChunk> = []

  const addFile = (path: string, source: RagChunk['source']) => {
    try {
      const st = statSync(path)
      const text = readFileSync(path, 'utf8')
      chunkMarkdown(text).forEach((chunk, i) => {
        chunks.push({
          id: `${path}#${i}@${st.mtimeMs}`,
          source,
          path,
          mtime: st.mtimeMs,
          text: chunk,
          vec: null,
        })
      })
    } catch {
      /* unreadable file — skip */
    }
  }

  for (const file of listMarkdownFiles(vaultDir())) addFile(file, 'vault')
  addFile(join(SWARM_CANONICAL_REPO, 'SWARM-OPERATIONS-PLAYBOOK.md'), 'playbook')
  for (const file of listMarkdownFiles(handoffsDir(), 1)) {
    addFile(file, 'handoff')
  }

  for (const r of readSwarmOutcomes(MAX_OUTCOMES)) {
    const status = r.blocked ? `BLOCKED: ${r.blockReason ?? ''}` : r.ok ? 'DONE' : 'FAILED'
    const text = `[${r.workerId}] ${status} — ${r.task}`
    if (text.length < 40) continue
    chunks.push({
      id: `outcome@${r.at}:${r.workerId}`,
      source: 'outcome',
      path: 'swarm-outcomes.jsonl',
      mtime: r.at,
      text,
      vec: null,
    })
  }
  return chunks
}

// ---------------------------------------------------------------------------
// Embedding + persistence
// ---------------------------------------------------------------------------

async function embedBatch(
  inputs: Array<string>,
): Promise<Array<Array<number>> | null> {
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { embeddings?: Array<Array<number>> }
    return data.embeddings && data.embeddings.length === inputs.length
      ? data.embeddings
      : null
  } catch {
    return null
  }
}

type RagIndexFile = {
  model: string
  updatedAt: number
  chunks: Array<RagChunk>
}

function loadIndex(): RagIndexFile {
  try {
    if (existsSync(INDEX_PATH)) {
      return JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as RagIndexFile
    }
  } catch {
    /* corrupt index — rebuild */
  }
  return { model: EMBED_MODEL, updatedAt: 0, chunks: [] }
}

function saveIndex(index: RagIndexFile): void {
  mkdirSync(dirname(INDEX_PATH), { recursive: true })
  const tmp = `${INDEX_PATH}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(index))
  renameSync(tmp, INDEX_PATH)
}

let refreshInFlight: Promise<RagIndexFile> | null = null

/**
 * Bring the index up to date. Reuses vectors for unchanged chunk ids,
 * embeds only new/changed chunks. Returns the (possibly partly unembedded)
 * index — chunks that failed to embed keep vec=null and still work via
 * keyword fallback.
 */
export async function refreshRagIndex(force = false): Promise<RagIndexFile> {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = (async () => {
    const index = loadIndex()
    if (
      !force &&
      index.model === EMBED_MODEL &&
      Date.now() - index.updatedAt < REFRESH_MIN_MS
    ) {
      return index
    }
    const existing = new Map(
      index.model === EMBED_MODEL
        ? index.chunks.map((c) => [c.id, c] as const)
        : [],
    )
    const desired = gatherDesiredChunks()
    for (const chunk of desired) {
      const prior = existing.get(chunk.id)
      if (prior?.vec) chunk.vec = prior.vec
    }
    const pending = desired.filter((c) => !c.vec)
    for (let i = 0; i < pending.length; i += EMBED_BATCH) {
      const batch = pending.slice(i, i + EMBED_BATCH)
      const vecs = await embedBatch(batch.map((c) => c.text))
      if (!vecs) break // ollama down — keep nulls, keyword fallback covers them
      batch.forEach((c, j) => {
        c.vec = vecs[j]
      })
    }
    const next: RagIndexFile = {
      model: EMBED_MODEL,
      updatedAt: Date.now(),
      chunks: desired,
    }
    saveIndex(next)
    return next
  })()
  try {
    return await refreshInFlight
  } finally {
    refreshInFlight = null
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function cosine(a: Array<number>, b: Array<number>): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom > 0 ? dot / denom : 0
}

function keywordScore(text: string, query: string): number {
  const lower = text.toLowerCase()
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 3)
  if (!tokens.length) return 0
  let hits = 0
  for (const t of tokens) if (lower.includes(t)) hits += 1
  return hits / tokens.length
}

export async function ragSearch(
  query: string,
  k = 5,
): Promise<Array<RagHit>> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const index = await refreshRagIndex()
  if (!index.chunks.length) return []

  const queryVec = (await embedBatch([trimmed]))?.[0] ?? null
  const scored = index.chunks.map((chunk) => ({
    chunk,
    score:
      queryVec && chunk.vec
        ? cosine(queryVec, chunk.vec)
        : keywordScore(chunk.text, trimmed),
  }))
  const threshold = queryVec ? 0.45 : 0.34
  return scored
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(20, k)))
    .map((s) => ({
      source: s.chunk.source,
      path: s.chunk.path,
      score: Number(s.score.toFixed(4)),
      snippet: s.chunk.text.slice(0, 500),
    }))
}

/** Bounded, never-throws variant for the dispatch hot path. */
export async function ragSearchSafe(
  query: string,
  k = 2,
  timeoutMs = 4000,
): Promise<Array<RagHit>> {
  try {
    return await Promise.race([
      ragSearch(query, k),
      new Promise<Array<RagHit>>((resolveEmpty) =>
        setTimeout(() => resolveEmpty([]), timeoutMs),
      ),
    ])
  } catch {
    return []
  }
}

export function ragIndexStats(): {
  chunks: number
  embedded: number
  updatedAt: number
  model: string
} {
  const index = loadIndex()
  return {
    chunks: index.chunks.length,
    embedded: index.chunks.filter((c) => c.vec).length,
    updatedAt: index.updatedAt,
    model: index.model,
  }
}
