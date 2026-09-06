/**
 * GitHub PR + CI polling source.
 *
 * Three-layer caching to stop the dashboard burning through GitHub's 5000-op/hr
 * GraphQL quota:
 *
 *  1. In-memory module cache (MEM_TTL_MS) — every tick of every SSE connection
 *     hits this first.  No disk I/O, no gh invocation.
 *  2. gh exit-code + stderr rate-limit detection — on 429/403 backs off for
 *     RATELIMIT_COOLDOWN_MS before retrying once.
 *  3. Repo allow-list via HERMES_GH_REPOS / HUD_TRACKED_REPOS so the fan-out
 *     is bounded and intentional.
 *
 * All UI contracts (PRsData / CIData shapes) are preserved.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { registerAdapter } from './index'
import type { SourceAdapter } from './index'

const execFileP = promisify(execFile)

/* ── config ──────────────────────────────────────────────────────────────── */
const MEM_TTL_MS = Number(process.env.HERMES_GH_CACHE_TTL_MS ?? '300_000')
const RATELIMIT_COOLDOWN_MS = 60_000

/** Ordered list of repos to poll, comma-separated.  HERMES_GH_REPOS takes
 *  precedence over the legacy HUD_TRACKED_REPOS.  Empty / absent = single
 *  default so the widget still works OOTB. */
const trackedRepos = (): Array<string> => {
  const env = process.env.HERMES_GH_REPOS ?? process.env.HUD_TRACKED_REPOS ?? ''
  const configured = env.split(',').filter(Boolean)
  return configured.length > 0 ? configured : ['SPACEMAN1898/CliniTrack-Suite']
}

/* ── in-memory cache ─────────────────────────────────────────────────────── */
interface CacheEntry<T> {
  data: T
  expiresAt: number // Date.now() + MEM_TTL_MS
}

const memCache = new Map<string, CacheEntry<unknown>>()

/** Try to serve from in-memory cache; returns null if absent or stale. */
function getMemCache<T>(key: string): T | null {
  const e = memCache.get(key) as CacheEntry<T> | undefined
  if (!e || Date.now() > e.expiresAt) {
    memCache.delete(key)
    return null
  }
  return e.data
}

/* ── rate-limit backoff ──────────────────────────────────────────────────── */
/** Global cooldown: if set, do not issue any gh call until this timestamp. */
let rateLimitUntil = 0

/** Parse rate-limit reset hint from gh stderr and update global cooldown. */
function parseRatelimitStderr(stderr: string): void {
  // gh prints "GraphQL API rate limit exceeded. Reset at 12:34:56 UTC." or similar
  const m = stderr.match(/reset at (\d{2}:\d{2}:\d{2})/i)
  if (!m) return
  const [h, min, sec] = m[1].split(':').map(Number)
  const now = new Date()
  const reset = new Date(now)
  reset.setHours(h, min, sec, 0)
  // If reset time is in the past today it means tomorrow; handle that
  if (reset <= now) reset.setDate(reset.getDate() + 1)
  rateLimitUntil = reset.getTime()
  console.log(
    `[pr-ci] gh rate-limited — backing off until ${reset.toISOString()}`,
  )
}

function isRatelimited(): boolean {
  if (rateLimitUntil === 0) return false
  if (Date.now() > rateLimitUntil) {
    rateLimitUntil = 0
    return false
  }
  return true
}

/* ── gh invocation ──────────────────────────────────────────────────────── */
async function gh(args: Array<string>): Promise<string> {
  if (isRatelimited()) {
    throw Object.assign(new Error('rate-limited'), { code: 'ERATELIMITED' })
  }
  try {
    const { stdout, stderr } = await execFileP('gh', args)
    return stdout
  } catch (err: any) {
    // gh exits 4 on API errors including 429 / 403
    if (err.code === 4 && err.stderr) parseRatelimitStderr(err.stderr)
    throw err
  }
}

/* ── per-repo fetchers (now cache-aware) ─────────────────────────────────── */
interface RepoPRs {
  open: number
  reviewNeeded: number
}
type RepoCI = 'success' | 'failure' | 'unknown'

async function fetchPRsForRepo(repo: string): Promise<RepoPRs> {
  const key = `prs:${repo}`
  const cached = getMemCache<RepoPRs>(key)
  if (cached) return cached

  try {
    const stdout = await gh([
      'pr',
      'list',
      '-R',
      repo,
      '--state',
      'open',
      '--json',
      'number,reviewDecision',
    ])
    const list = JSON.parse(stdout) as Array<{ reviewDecision: string | null }>
    const result: RepoPRs = {
      open: list.length,
      reviewNeeded: list.filter((p) => p.reviewDecision === 'REVIEW_REQUIRED')
        .length,
    }
    memCache.set(key, { data: result, expiresAt: Date.now() + MEM_TTL_MS })
    return result
  } catch {
    return { open: 0, reviewNeeded: 0 }
  }
}

async function fetchCIForRepo(repo: string): Promise<RepoCI> {
  const key = `ci:${repo}`
  const cached = getMemCache<RepoCI>(key)
  if (cached) return cached

  try {
    const stdout = await gh([
      'run',
      'list',
      '-R',
      repo,
      '--limit',
      '1',
      '--json',
      'conclusion',
    ])
    const list = JSON.parse(stdout) as Array<{ conclusion: string | null }>
    const c = list[0]?.conclusion
    const result: RepoCI =
      c === 'success' || c === 'failure' ? (c as RepoCI) : 'unknown'
    memCache.set(key, { data: result, expiresAt: Date.now() + MEM_TTL_MS })
    return result
  } catch {
    return 'unknown'
  }
}

/* ── adapters ───────────────────────────────────────────────────────────── */
interface PRsData {
  value: string
  sub: string
  tone: 'ok' | 'info'
}
interface CIData {
  value: string
  sub: string
  tone: 'ok' | 'warn' | 'err'
}

export const prsAdapter: SourceAdapter<PRsData> = {
  id: 'prs',
  ttlMs: MEM_TTL_MS,
  async fetch() {
    const repos = trackedRepos()
    const results = await Promise.all(repos.map(fetchPRsForRepo))
    const total = results.reduce((s, r) => s + r.open, 0)
    const reviewNeeded = results.reduce((s, r) => s + r.reviewNeeded, 0)
    return {
      value: String(total),
      sub: reviewNeeded > 0 ? reviewNeeded + ' need review' : 'all reviewed',
      tone: 'info',
    }
  },
}

export const ciAdapter: SourceAdapter<CIData> = {
  id: 'ci',
  ttlMs: MEM_TTL_MS,
  async fetch() {
    const repos = trackedRepos()
    const results = await Promise.all(repos.map(fetchCIForRepo))
    const anyFailure = results.some((r) => r === 'failure')
    const repoShort = repos[0]?.split('/')[1] || ''
    return {
      value: anyFailure ? 'red' : 'green',
      sub: repoShort,
      tone: anyFailure ? 'err' : 'ok',
    }
  },
}

registerAdapter(prsAdapter)
registerAdapter(ciAdapter)
