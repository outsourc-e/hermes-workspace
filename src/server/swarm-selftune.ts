/**
 * Self-tuning: failure autopsies + anomaly detection.
 *
 * Autopsies: when a goal or pipeline dies, a researcher task is queued to
 * write a root-cause note into vault/autopsies/ — which the RAG index then
 * feeds back into future dispatch prompts. Deduped by subject fingerprint.
 *
 * Anomalies: compares today's failure rate and dispatch volume against the
 * trailing 7 days; a big regression fires one phone push per day at most
 * (state in .runtime/selftune-state.json).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { notifyPhone } from './notify'
import { SWARM_CANONICAL_REPO } from './swarm-environment'
import { readSwarmOutcomes } from './swarm-outcomes'
import { enqueueTask, listQueue } from './swarm-queue'

export const AUTOPSY_PREFIX = '[autopsy]'

function statePath(): string {
  return (
    process.env.HERMES_SELFTUNE_STATE_PATH ||
    join(SWARM_CANONICAL_REPO, '.runtime', 'selftune-state.json')
  )
}

/** Queue a root-cause investigation for a failed goal/pipeline. */
export function enqueueAutopsy(input: {
  kind: 'goal' | 'pipeline'
  subject: string
  context: string
}): boolean {
  try {
    const fingerprint = `autopsy:${input.kind}:${input.subject.slice(0, 60)}`
    const open = listQueue().some(
      (i) =>
        (i.status === 'queued' || i.status === 'dispatched') &&
        i.note === fingerprint,
    )
    if (open) return false
    enqueueTask({
      task: [
        `${AUTOPSY_PREFIX} A swarm ${input.kind} failed. Write a root-cause autopsy.`,
        '',
        `Subject: ${input.subject.slice(0, 300)}`,
        `Context:\n${input.context.slice(0, 2500)}`,
        '',
        'Investigate why it failed (read the relevant logs/notes under',
        `${SWARM_CANONICAL_REPO}/.runtime and ~/.hermes/logs if needed).`,
        'Write a concise note to vault/autopsies/ named',
        'autopsy-YYYY-MM-DD-<slug>.md with: what happened, root cause,',
        'and one concrete prevention. Do not fix anything else.',
      ].join('\n'),
      worker: 'researcher',
      priority: 2,
      note: fingerprint,
    })
    return true
  } catch {
    return false
  }
}

export type AnomalyReport = {
  alerts: Array<string>
  today: { attempts: number; failRate: number }
  baseline: { attemptsPerDay: number; failRate: number }
}

/**
 * Compare today with the trailing week. Pure — callers decide what to do
 * with the alerts (the API route pushes to the phone once per day).
 */
export function detectAnomalies(now = Date.now()): AnomalyReport {
  const dayMs = 86_400_000
  const records = readSwarmOutcomes()
  const today = records.filter((r) => r.at >= now - dayMs)
  const prior = records.filter(
    (r) => r.at >= now - 8 * dayMs && r.at < now - dayMs,
  )
  const failRate = (rs: Array<{ ok: boolean }>) =>
    rs.length ? rs.filter((r) => !r.ok).length / rs.length : 0
  const report: AnomalyReport = {
    alerts: [],
    today: { attempts: today.length, failRate: failRate(today) },
    baseline: {
      attemptsPerDay: prior.length / 7,
      failRate: failRate(prior),
    },
  }
  // Failure-rate regression: meaningful sample, doubled and above 40%.
  if (
    today.length >= 5 &&
    report.today.failRate >= 0.4 &&
    report.today.failRate >= 2 * Math.max(report.baseline.failRate, 0.1)
  ) {
    report.alerts.push(
      `Failure rate ${Math.round(report.today.failRate * 100)}% today vs ${Math.round(report.baseline.failRate * 100)}% baseline (${today.length} dispatches)`,
    )
  }
  // Volume spike: runaway automation burning tokens.
  if (
    report.baseline.attemptsPerDay >= 1 &&
    today.length >= 20 &&
    today.length >= 4 * report.baseline.attemptsPerDay
  ) {
    report.alerts.push(
      `Dispatch volume spike: ${today.length} today vs ~${Math.round(report.baseline.attemptsPerDay)}/day baseline`,
    )
  }
  return report
}

/** Run detection and push at most one phone alert per calendar day. */
export function runAnomalyCheck(): AnomalyReport {
  const report = detectAnomalies()
  if (!report.alerts.length) return report
  try {
    const today = new Date().toISOString().slice(0, 10)
    let state: { lastAnomalyPushDay?: string } = {}
    try {
      if (existsSync(statePath())) {
        state = JSON.parse(readFileSync(statePath(), 'utf8')) as typeof state
      }
    } catch {
      /* fresh state */
    }
    if (state.lastAnomalyPushDay !== today) {
      notifyPhone({
        title: 'Swarm anomaly',
        message: report.alerts.join('\n'),
        priority: 4,
        tags: ['chart_with_downwards_trend'],
      })
      mkdirSync(dirname(statePath()), { recursive: true })
      writeFileSync(
        statePath(),
        JSON.stringify({ ...state, lastAnomalyPushDay: today }),
      )
    }
  } catch {
    /* best-effort */
  }
  return report
}
