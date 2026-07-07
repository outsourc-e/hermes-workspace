/**
 * Outcome memory for swarm dispatches.
 *
 * Every dispatch appends one JSONL record to .runtime/swarm-outcomes.jsonl.
 * From those records we derive:
 *   - a per-worker scoreboard (success rates by worker and by model tier)
 *   - "lessons" — short strings distilled from recent failures that get
 *     injected into the next dispatch prompt for the same worker, so the
 *     swarm stops repeating the same mistake
 *   - router bias — a tier whose recent success rate for a worker is poor
 *     gets escalated before dispatch instead of after a failure
 *
 * The JSONL file is append-only and capped by rewrite when it grows past
 * MAX_RECORDS * 2 lines. Aggregations read at most the last MAX_RECORDS.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import type { SwarmModelTier } from './swarm-model-router'

export const SWARM_OUTCOMES_PATH = join(
  SWARM_CANONICAL_REPO,
  '.runtime',
  'swarm-outcomes.jsonl',
)

/** Most recent records considered by aggregations. */
const MAX_RECORDS = 2000
/** Rewrite (truncate to newest MAX_RECORDS) when file exceeds this. */
const COMPACT_THRESHOLD = MAX_RECORDS * 2

export type SwarmOutcomeRecord = {
  at: number
  workerId: string
  /** First 300 chars of the task — enough for lessons, small on disk. */
  task: string
  tier: SwarmModelTier | null
  model: string | null
  mode: 'tmux' | 'oneshot'
  ok: boolean
  blocked: boolean
  blockReason: string | null
  checkpointStatus: string | null
  durationMs: number
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export function recordSwarmOutcome(
  record: Omit<SwarmOutcomeRecord, 'at' | 'task'> & { task: string },
): void {
  try {
    const dir = dirname(SWARM_OUTCOMES_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const row: SwarmOutcomeRecord = {
      ...record,
      at: Date.now(),
      task: truncate(record.task, 300),
      blockReason: record.blockReason
        ? truncate(record.blockReason, 300)
        : null,
    }
    appendFileSync(SWARM_OUTCOMES_PATH, `${JSON.stringify(row)}\n`, 'utf8')
    maybeCompact()
  } catch {
    // Outcome memory is best-effort — never fail a dispatch over it.
  }
}

function maybeCompact(): void {
  try {
    const lines = readFileSync(SWARM_OUTCOMES_PATH, 'utf8').split('\n')
    if (lines.length <= COMPACT_THRESHOLD) return
    const kept = lines.filter(Boolean).slice(-MAX_RECORDS)
    writeFileSync(SWARM_OUTCOMES_PATH, `${kept.join('\n')}\n`, 'utf8')
  } catch {
    // best-effort
  }
}

export function readSwarmOutcomes(
  limit: number = MAX_RECORDS,
): Array<SwarmOutcomeRecord> {
  try {
    if (!existsSync(SWARM_OUTCOMES_PATH)) return []
    const lines = readFileSync(SWARM_OUTCOMES_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-limit)
    const out: Array<SwarmOutcomeRecord> = []
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as SwarmOutcomeRecord
        if (parsed && typeof parsed.workerId === 'string') out.push(parsed)
      } catch {
        // skip corrupt line
      }
    }
    return out
  } catch {
    return []
  }
}

export type TierStats = {
  attempts: number
  ok: number
  blocked: number
  successRate: number
  avgDurationMs: number
}

export type WorkerScore = {
  workerId: string
  attempts: number
  ok: number
  blocked: number
  successRate: number
  avgDurationMs: number
  lastAt: number | null
  lastBlockReason: string | null
  byTier: Partial<Record<SwarmModelTier, TierStats>>
}

export type SwarmScoreboard = {
  workers: Array<WorkerScore>
  totalRecords: number
  generatedAt: string
}

function finishStats(s: {
  attempts: number
  ok: number
  blocked: number
  durationTotal: number
}): TierStats {
  return {
    attempts: s.attempts,
    ok: s.ok,
    blocked: s.blocked,
    successRate: s.attempts > 0 ? s.ok / s.attempts : 0,
    avgDurationMs:
      s.attempts > 0 ? Math.round(s.durationTotal / s.attempts) : 0,
  }
}

/** Pure aggregation — exported for tests. */
export function buildScoreboard(
  records: Array<SwarmOutcomeRecord>,
): SwarmScoreboard {
  const byWorker = new Map<
    string,
    {
      attempts: number
      ok: number
      blocked: number
      durationTotal: number
      lastAt: number | null
      lastBlockReason: string | null
      byTier: Map<
        SwarmModelTier,
        { attempts: number; ok: number; blocked: number; durationTotal: number }
      >
    }
  >()

  for (const r of records) {
    let w = byWorker.get(r.workerId)
    if (!w) {
      w = {
        attempts: 0,
        ok: 0,
        blocked: 0,
        durationTotal: 0,
        lastAt: null,
        lastBlockReason: null,
        byTier: new Map(),
      }
      byWorker.set(r.workerId, w)
    }
    w.attempts += 1
    if (r.ok && !r.blocked) w.ok += 1
    if (r.blocked) {
      w.blocked += 1
      w.lastBlockReason = r.blockReason
    }
    w.durationTotal += r.durationMs || 0
    if (w.lastAt === null || r.at > w.lastAt) w.lastAt = r.at
    if (r.tier) {
      let t = w.byTier.get(r.tier)
      if (!t) {
        t = { attempts: 0, ok: 0, blocked: 0, durationTotal: 0 }
        w.byTier.set(r.tier, t)
      }
      t.attempts += 1
      if (r.ok && !r.blocked) t.ok += 1
      if (r.blocked) t.blocked += 1
      t.durationTotal += r.durationMs || 0
    }
  }

  const workers: Array<WorkerScore> = []
  for (const [workerId, w] of byWorker) {
    const byTier: Partial<Record<SwarmModelTier, TierStats>> = {}
    for (const [tier, t] of w.byTier) byTier[tier] = finishStats(t)
    workers.push({
      workerId,
      ...finishStats(w),
      lastAt: w.lastAt,
      lastBlockReason: w.lastBlockReason,
      byTier,
    })
  }
  workers.sort((a, b) => a.workerId.localeCompare(b.workerId))
  return {
    workers,
    totalRecords: records.length,
    generatedAt: new Date().toISOString(),
  }
}

export function getSwarmScoreboard(): SwarmScoreboard {
  return buildScoreboard(readSwarmOutcomes())
}

/**
 * Router learning: should the given tier be escalated for this worker before
 * dispatch? True when the worker's recent record at that tier shows repeated
 * failure (>=3 attempts in the window and success rate below 40%).
 * Exported pure form for tests; dispatch uses tierNeedsEscalation().
 */
export function tierNeedsEscalationFrom(
  records: Array<SwarmOutcomeRecord>,
  workerId: string,
  tier: SwarmModelTier,
  window: number = 10,
): boolean {
  const recent = records
    .filter((r) => r.workerId === workerId && r.tier === tier)
    .slice(-window)
  if (recent.length < 3) return false
  const ok = recent.filter((r) => r.ok && !r.blocked).length
  return ok / recent.length < 0.4
}

export function tierNeedsEscalation(
  workerId: string,
  tier: SwarmModelTier,
): boolean {
  return tierNeedsEscalationFrom(readSwarmOutcomes(500), workerId, tier)
}

/**
 * Router learning, cost direction: can this worker's routed tier be demoted
 * one step? True when the worker's recent record at the LOWER tier is both
 * deep and strong (>=5 attempts in the window, >=80% success) — proof the
 * cheaper/faster model already handles this worker's workload. Pure form for
 * tests; dispatch uses tierCanDemote().
 */
export function tierCanDemoteFrom(
  records: Array<SwarmOutcomeRecord>,
  workerId: string,
  lowerTier: SwarmModelTier,
  window: number = 15,
): boolean {
  const recent = records
    .filter((r) => r.workerId === workerId && r.tier === lowerTier)
    .slice(-window)
  if (recent.length < 5) return false
  const ok = recent.filter((r) => r.ok && !r.blocked).length
  return ok / recent.length >= 0.8
}

export function tierCanDemote(
  workerId: string,
  lowerTier: SwarmModelTier,
): boolean {
  return tierCanDemoteFrom(readSwarmOutcomes(500), workerId, lowerTier)
}

/**
 * Lessons: short bullets distilled from this worker's recent failures,
 * injected into the next dispatch prompt. Deduped by block reason so one
 * recurring failure yields one lesson, not five.
 */
export function lessonsForWorker(
  workerId: string,
  max: number = 3,
): Array<string> {
  const records = readSwarmOutcomes(500)
  const failures = records
    .filter((r) => r.workerId === workerId && (r.blocked || !r.ok))
    .slice(-25)
  const seen = new Set<string>()
  const lessons: Array<string> = []
  for (let i = failures.length - 1; i >= 0 && lessons.length < max; i--) {
    const f = failures[i]
    const reason = (f.blockReason || '').trim()
    if (!reason) continue
    const key = reason.slice(0, 80).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    lessons.push(
      `A previous task ("${truncate(f.task, 90)}") failed with: ${truncate(reason, 160)}. Avoid repeating this failure mode.`,
    )
  }
  return lessons
}
