/**
 * `WorkspaceCheckpointVerificationItem` → `VerificationBadge` props. Pure
 * functions only: no React, no fetch, no styling.
 * `use-checkpoint-verification.ts` owns the query; this file owns the honesty.
 *
 * WHICH verification this is. `docs/design/jarvis-ui-mapping.md` §3.6 is
 * explicit that verified-vs-claimed on a CHAT MESSAGE is NO SOURCE (§3.5 items
 * 2–3) and that the ONE real source in the codebase is out-of-band from chat:
 * the code checks a workspace checkpoint records — `tsc | tests | lint | e2e`,
 * each with a `status`, real `output` and a `checked_at`. So everything mapped
 * here is a statement about CODE, never about a conversational claim, and the
 * surface that renders it says so. Nothing in this file may be pointed at a
 * message.
 *
 * The four statuses, and why two of them produce no badge:
 *   • `passed`  → VERIFIED. A check ran and succeeded; `output` is the evidence.
 *   • `failed`  → CLAIMED · UNVERIFIED. The badge has two states and `verified`
 *     is the affirmative one, so a failing check cannot wear it — that would
 *     read as "this passed". It is rendered as the un-affirmed state instead,
 *     and because "CLAIMED · UNVERIFIED" alone could be misread as "we don't
 *     know", the title says FAILED outright and the real `output` sits under it.
 *   • `missing` / `not_configured` → NO BADGE. These are honest non-states: no
 *     check ran, so there is nothing verified AND nothing claimed. They are
 *     returned separately by `mapCheckpointToInertChecks` as inert lines, so
 *     the surface can say "lint: not configured" without dressing it as either
 *     verdict. Nothing here ever invents a `passed`.
 *
 * `actions` is always empty. TRIAGE / RE-RUN imply a write, and this slice is
 * read-only — an inert chip on a real badge would be a lie about what the
 * surface can do.
 */
import type {
  WorkspaceCheckpointDetail,
  WorkspaceCheckpointVerificationItem,
  WorkspaceCheckpointVerificationKey,
} from '@/lib/workspace-checkpoints'
import type { VerificationBadgeProps } from '@/components/jarvis/types'
import { parseUtcTimestamp } from '@/lib/workspace-checkpoints'

/** Render order — the order the checks run in, not the order the API returns. */
export const VERIFICATION_KEYS: Array<WorkspaceCheckpointVerificationKey> = [
  'tsc',
  'tests',
  'lint',
  'e2e',
]

/**
 * The check's own name, uppercased into the board's label idiom.
 *
 * This prefix is real data — it is the key the API stores the item under — and
 * it is load-bearing twice over. `label` is free text with an `'Unknown'`
 * fallback in the normalizer, so a bare title can end up saying nothing about
 * WHICH check it is; and two checks may ship the same label, which would
 * collide as a React key on the rendered list. The scope fixes both without
 * adding a word the backend did not supply.
 */
const KEY_SCOPE: Record<WorkspaceCheckpointVerificationKey, string> = {
  tsc: 'TSC',
  tests: 'TESTS',
  lint: 'LINT',
  e2e: 'E2E',
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * `09:38` for a check run today, `Aug 17 09:38` for an older one — the same
 * shape the Conductor's run times use, so one board reads in one register.
 *
 * `checked_at` arrives either as an ISO string or as a SQLite `2026-03-10
 * 21:40:00` with no zone, which `parseUtcTimestamp` (the lib's own reader, so
 * this file does not fork the rule) resolves as UTC. An unparseable value
 * yields nothing rather than "Invalid Date".
 */
export function formatCheckedAt(
  checkedAt: string | null,
  now: number = Date.now(),
): string | undefined {
  if (typeof checkedAt !== 'string' || !checkedAt.trim()) return undefined

  const at = parseUtcTimestamp(checkedAt)
  if (Number.isNaN(at.getTime())) return undefined

  const today = new Date(now)
  const clock = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()

  return sameDay ? clock : `${MONTHS[at.getMonth()]} ${at.getDate()} ${clock}`
}

/**
 * A real `output` is unbounded — a failing `tsc` prints every error it found,
 * and a failing test run prints stack traces. Rendered whole, one badge grows
 * past the surface it sits on and pushes everything after it off screen.
 *
 * So the output is clamped twice: to the first few lines, and each line to
 * roughly the width the badge allots. Both clamps announce themselves (a
 * trailing ellipsis, and a counted "more output lines" line) so a reader can
 * never mistake a clipped pass for a clean one. Nothing is lost — the full
 * output is on the checkpoint itself, which is where a triage belongs.
 */
export const EVIDENCE_LINE_MAX = 120
export const EVIDENCE_LINES_MAX = 4

export function clampEvidenceLine(text: string): string {
  if (text.length <= EVIDENCE_LINE_MAX) return text
  const cut = text.slice(0, EVIDENCE_LINE_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > EVIDENCE_LINE_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * `output` as evidence lines, or nothing at all.
 *
 * An absent or blank `output` returns `undefined` rather than a stand-in: the
 * badge simply carries no evidence block, which is the true statement. Writing
 * "exit 0" under a passed check with no output would be inventing the one thing
 * this component exists to be trusted about.
 */
export function mapOutputToEvidence(
  output: string | null,
): Array<string> | undefined {
  if (typeof output !== 'string') return undefined

  const lines = output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  if (lines.length === 0) return undefined

  const shown = lines.slice(0, EVIDENCE_LINES_MAX).map(clampEvidenceLine)
  const hidden = lines.length - shown.length
  if (hidden > 0) {
    shown.push(`… +${hidden} more output ${hidden === 1 ? 'line' : 'lines'}`)
  }
  return shown
}

function readLabel(item: WorkspaceCheckpointVerificationItem): string {
  const label = item.label.trim()
  return label ? label : 'no command reported'
}

/**
 * One verification item as one badge, or `null` when the item is a non-state.
 *
 * `now` is injected so the same-day branch of the timestamp is testable and so
 * a whole map reads against one clock.
 */
export function mapVerificationItemToBadge(
  item: WorkspaceCheckpointVerificationItem,
  key: WorkspaceCheckpointVerificationKey,
  now: number = Date.now(),
): VerificationBadgeProps | null {
  if (item.status !== 'passed' && item.status !== 'failed') return null

  const scope = KEY_SCOPE[key]
  const passed = item.status === 'passed'

  return {
    state: passed ? 'verified' : 'claimed',
    title: passed
      ? `${scope} · ${readLabel(item)}`
      : `${scope} FAILED · ${readLabel(item)}`,
    evidence: mapOutputToEvidence(item.output),
    time: formatCheckedAt(item.checked_at, now),
    // Read-only slice: no chip here may imply a re-run or a triage.
    actions: [],
  }
}

/**
 * Every check that actually ran, in check order. A checkpoint whose checks are
 * all `missing`/`not_configured` maps to an empty list — which the surface
 * renders as the inert lines below, never as a fixture standing in for a real
 * verdict.
 */
export function mapCheckpointToBadges(
  detail: WorkspaceCheckpointDetail,
  now: number = Date.now(),
): Array<VerificationBadgeProps> {
  const badges: Array<VerificationBadgeProps> = []

  for (const key of VERIFICATION_KEYS) {
    const badge = mapVerificationItemToBadge(detail.verification[key], key, now)
    if (badge) badges.push(badge)
  }

  return badges
}

/** A check that produced no verdict — rendered as plain text, never as a badge. */
export interface CheckpointInertCheck {
  key: WorkspaceCheckpointVerificationKey
  /** `TSC`, `TESTS`, … — the same scope the badges use. */
  scope: string
  status: 'missing' | 'not_configured'
  /** What the absence actually means, in the API's own terms. */
  note: string
}

/**
 * The other half of the truth: which checks did NOT run.
 *
 * Dropping these silently would leave a checkpoint with one green TSC badge
 * looking fully verified. Stated, the same checkpoint reads "tsc passed, tests
 * never ran, lint and e2e are not configured" — which is what the API said.
 */
export function mapCheckpointToInertChecks(
  detail: WorkspaceCheckpointDetail,
): Array<CheckpointInertCheck> {
  const inert: Array<CheckpointInertCheck> = []

  for (const key of VERIFICATION_KEYS) {
    const item = detail.verification[key]
    if (item.status !== 'missing' && item.status !== 'not_configured') continue

    inert.push({
      key,
      scope: KEY_SCOPE[key],
      status: item.status,
      note:
        item.status === 'not_configured'
          ? 'not configured for this project · no verdict'
          : 'never ran · no verdict recorded',
    })
  }

  return inert
}

/**
 * Which checkpoint the badges above belong to. Real fields only — the task
 * name, the project, and the checkpoint's own review status — so a reader can
 * tell whether they are looking at last week's run.
 */
export function buildCheckpointSourceLine(
  detail: WorkspaceCheckpointDetail,
): string {
  const parts: Array<string> = []

  const task = detail.task_name?.trim()
  if (task) parts.push(task)

  const project = detail.project_name?.trim()
  if (project) parts.push(project)

  parts.push(`checkpoint ${detail.id.slice(0, 8)}`)
  parts.push(detail.status)

  return parts.join(' · ')
}
