/**
 * Proactive proposals: the swarm suggests its own work.
 *
 * Deterministic scanners over the evidence the swarm already produces
 * (outcomes, scoreboard, sweep logs) generate queue items with status
 * 'proposed'. Proposals never dispatch on their own — the operator approves
 * them (UI Approve button, Discord `!approve <id>`) which flips them to
 * 'queued' for the normal drain. Each scanner dedups via a fingerprint in
 * the item's note, so the same suggestion is made at most once while open.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { buildScoreboard, readSwarmOutcomes } from './swarm-outcomes'
import { enqueueTask, listQueue } from './swarm-queue'

const MAX_OPEN_PROPOSALS = 5

function openFingerprints(): Set<string> {
  return new Set(
    listQueue()
      .filter((i) =>
        ['proposed', 'queued', 'dispatched'].includes(i.status),
      )
      .map((i) => i.note ?? '')
      .filter(Boolean),
  )
}

type Proposal = {
  fingerprint: string
  task: string
  worker: string | null
  priority: 1 | 2 | 3
}

/** Scanner: same block reason ≥3 times in the last 50 outcomes. */
function scanRepeatedFailures(): Array<Proposal> {
  const recent = readSwarmOutcomes(50)
  const byReason = new Map<string, number>()
  for (const r of recent) {
    if (!r.blocked || !r.blockReason) continue
    const key = r.blockReason.slice(0, 60)
    byReason.set(key, (byReason.get(key) ?? 0) + 1)
  }
  const out: Array<Proposal> = []
  for (const [reason, count] of byReason) {
    if (count < 3) continue
    out.push({
      fingerprint: `propose:recurring-failure:${reason.slice(0, 40)}`,
      task: `Investigate a recurring swarm failure: ${count} recent dispatches blocked with "${reason}". Find the root cause in the dispatch pipeline or worker setup and either fix it or write up exactly what the operator must change. Evidence lives in .runtime/swarm-outcomes.jsonl.`,
      worker: 'researcher',
      priority: 2,
    })
  }
  return out
}

/** Scanner: worker under 50% success with ≥5 attempts. */
function scanWeakWorkers(): Array<Proposal> {
  const sb = buildScoreboard(readSwarmOutcomes(200))
  const out: Array<Proposal> = []
  for (const w of sb.workers) {
    if (w.attempts < 5) continue
    const rate = w.ok / w.attempts
    if (rate >= 0.5) continue
    out.push({
      fingerprint: `propose:weak-worker:${w.workerId}`,
      task: `Worker "${w.workerId}" is succeeding on only ${Math.round(rate * 100)}% of its last ${w.attempts} tasks. Review its recent outcomes in .runtime/swarm-outcomes.jsonl and its profile config under ~/.hermes/profiles/${w.workerId}/ — diagnose whether the model tier, prompt, or task routing is wrong, and report the single most impactful change.`,
      worker: 'researcher',
      priority: 2,
    })
  }
  return out
}

/** Scanner: zombie reaps or branch-guard events in recent sweep logs. */
function scanSweepIncidents(): Array<Proposal> {
  const dir = join(homedir(), '.hermes', 'memory', 'swarm', 'lifecycle-logs')
  const out: Array<Proposal> = []
  try {
    if (!existsSync(dir)) return out
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .slice(-2)
    let zombies = 0
    for (const file of files) {
      for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
        if (line.includes('"zombie_reaped"')) zombies += 1
      }
    }
    if (zombies >= 3) {
      out.push({
        fingerprint: 'propose:frequent-zombies',
        task: `The zombie reaper has reset stuck workers ${zombies} times in the last two days — worker sessions are dying without terminal checkpoints. Investigate why tmux workers exit silently (check ~/.hermes/logs and recent lifecycle logs) and propose a fix.`,
        worker: 'researcher',
        priority: 2,
      })
    }
  } catch {
    /* best-effort */
  }
  return out
}

/**
 * Run all scanners, file new proposals (deduped, capped). Returns ids of
 * newly created proposals.
 */
export function generateProposals(): Array<string> {
  const open = openFingerprints()
  const openProposedCount = listQueue().filter(
    (i) => i.status === 'proposed',
  ).length
  let budget = Math.max(0, MAX_OPEN_PROPOSALS - openProposedCount)
  const created: Array<string> = []
  const all = [
    ...scanRepeatedFailures(),
    ...scanWeakWorkers(),
    ...scanSweepIncidents(),
  ]
  for (const proposal of all) {
    if (budget <= 0) break
    if (open.has(proposal.fingerprint)) continue
    try {
      const item = enqueueTask({
        task: proposal.task,
        worker: proposal.worker,
        priority: proposal.priority,
        note: proposal.fingerprint,
        status: 'proposed',
      })
      created.push(item.id)
      open.add(proposal.fingerprint)
      budget -= 1
    } catch {
      /* skip bad proposal */
    }
  }
  return created
}
