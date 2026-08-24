/**
 * `ClaudeJob` → Conductor SCHEDULED JOBS card. Pure functions only: no React,
 * no fetch, no styling. `use-scheduled-jobs.ts` owns the query; this file owns
 * the honesty.
 *
 * The rule this file enforces is the one from `docs/design/jarvis-ui-mapping.md`
 * §3.4/§3.5: a card may only say what a `ClaudeJob` actually supplies.
 *   • REAL and mapped — name, `schedule_display`, `enabled`, `state`,
 *     `last_run_success`, `last_run_error`, `last_run_at`, `run_count`.
 *   • DERIVED and marked as such below — SILENT/stale, which has no declared
 *     field and is computed from `enabled` + `last_run_at` age.
 *   • NO SOURCE and therefore NEVER produced here — the structured PARTIAL
 *     badge (§3.5 item 11), the launchd "not loaded" diagnostic (item 12), any
 *     run tally beyond `run_count`, and any payload count ("3,209 notes") or
 *     duration ("41s"), none of which `ClaudeJob` carries. A real job simply
 *     does not render those lines; it does not render a plausible guess.
 *
 * `actions` is always empty. TRIAGE / FULL LOG / RELOAD & RUN all imply a side
 * effect, and this slice is read-only — an inert chip on a real card would be a
 * lie about what the board can do.
 */
import type { ClaudeJob } from '@/lib/jobs-api'
import type {
  ConductorJobFixture,
  ConductorJobLineFixture,
  ConductorSectionHeadingFixture,
  MobileJobFixture,
  MobileJobTone,
} from '@/components/jarvis/fixtures'
import { getJobErrorText, isFailedJobState } from '@/lib/jobs-api'

const DAY_MS = 86_400_000

/**
 * DERIVE — SILENT/stale. `ClaudeJob.schedule` is an opaque `Record<string,
 * unknown>` and `schedule_display` is free text, so a per-job cadence cannot be
 * parsed reliably; `next_run_at − last_run_at` is not a cadence either, because
 * for an already-stale job that gap IS the staleness and using it as the
 * threshold would hide exactly the case this section exists to surface.
 *
 * So: one conservative, cadence-independent threshold. Fourteen days is two
 * missed cycles for the slowest schedule these jobs use (weekly) and many more
 * for anything faster, which means a SILENT badge is never a false alarm — at
 * the cost of taking up to 14 days to call a stale hourly job. Under-reporting
 * is the right way to be wrong here.
 */
export const SILENT_THRESHOLD_MS = 14 * DAY_MS

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

function parseTimestamp(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `09:33` for a run today, `Aug 17 09:33` for an older one. */
function formatRunTime(timestamp: number, now: number): string {
  const at = new Date(timestamp)
  const today = new Date(now)
  const clock = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`

  const sameDay =
    at.getFullYear() === today.getFullYear() &&
    at.getMonth() === today.getMonth() &&
    at.getDate() === today.getDate()

  return sameDay
    ? clock
    : `${MONTHS[at.getMonth()]} ${at.getDate()} ${clock}`
}

/**
 * `ops-watch:certs` → `ops-watch`. The owning worker is only ever implied by
 * the name prefix; when a name carries no prefix the cadence line simply omits
 * the worker rather than inventing one.
 */
export function deriveWorkerFromName(name: string): string | null {
  const separator = name.indexOf(':')
  if (separator <= 0) return null
  const prefix = name.slice(0, separator).trim()
  return prefix || null
}

/**
 * The owning profile — `profile`, else `profile_name`, else the prefix of the
 * `id` (`orchestrator:06ec90ba4703` → `orchestrator`), which is where the
 * gateway actually encodes it.
 */
export function deriveProfile(job: ClaudeJob): string | null {
  for (const candidate of [job.profile, job.profile_name]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return deriveWorkerFromName(job.id)
}

/**
 * The card's title, in the board's `owner:job` idiom.
 *
 * This is not cosmetic. Real gateways register the SAME job under several
 * profiles, so `/api/claude-jobs?profiles=all` returns three rows all named
 * "Morning Daily Briefing" — distinct jobs with distinct ids, health and
 * schedules. A bare `job.name` would collapse them into one indistinguishable
 * title (and collide as a React key). The profile is real data and it is what
 * tells them apart, so it goes in front, exactly as `ops-watch:certs` does.
 */
export function deriveCardName(job: ClaudeJob): string {
  const profile = deriveProfile(job)
  return profile ? `${profile}:${job.name}` : job.name
}

/**
 * `schedule_display` when the API sends it. Otherwise the rawest readable form
 * of `schedule` — the first non-empty string in the record, else the record
 * itself — because a wrong-but-tidy cadence is worse than an ugly true one.
 */
export function formatSchedule(job: ClaudeJob): string {
  const display = job.schedule_display
  if (typeof display === 'string' && display.trim()) return display.trim()

  for (const value of Object.values(job.schedule)) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  if (Object.keys(job.schedule).length > 0) {
    try {
      return JSON.stringify(job.schedule)
    } catch {
      // Fall through to the unknown-schedule text below.
    }
  }

  return 'schedule unavailable'
}

/** Whole days since the last run, or `null` when there has never been one. */
export function daysSinceLastRun(
  job: ClaudeJob,
  now: number,
): number | null {
  const lastRun = parseTimestamp(job.last_run_at)
  if (lastRun === null) return null
  return Math.floor((now - lastRun) / DAY_MS)
}

/**
 * FAILED — a failed terminal state, or a last run the API marked unsuccessful.
 *
 * The third clause is not free-standing invention: real records come back with
 * `state: 'scheduled'`, `last_run_success: null` and a populated
 * `last_run_error` ("[blocked_config] provider credential missing: …"). That
 * run did not succeed and the API says why, so badging it OK would be the exact
 * dishonesty this board exists to prevent. `last_run_success === true` still
 * wins, so a stale error left beside a successful run does not turn the card
 * red.
 */
export function isFailedJob(job: ClaudeJob): boolean {
  if (isFailedJobState(job.state)) return true
  if (job.last_run_success === false) return true
  return job.last_run_success !== true && getJobErrorText(job) !== null
}

/**
 * SILENT — enabled, has run before, and has not run since the threshold above.
 *
 * A job that has NEVER run is deliberately not silent: with no `last_run_at`
 * there is no age to report, and the badge counts days. Its card says
 * "no last run recorded" instead, which is the true statement.
 */
export function isSilentJob(job: ClaudeJob, now: number): boolean {
  if (isFailedJob(job)) return false
  if (!job.enabled) return false
  const lastRun = parseTimestamp(job.last_run_at)
  if (lastRun === null) return false
  return now - lastRun > SILENT_THRESHOLD_MS
}

/**
 * The artboard is a fixed 1440×900 frame with `overflow-hidden`, and a real
 * `last_run_error` is unbounded — the gateway serves 300+ character provider
 * diagnostics. Left whole, one failed card grows the section and clips the RUN
 * LOG off the bottom of the board.
 *
 * So the line is clamped to roughly the two lines the artboard allots a failed
 * card, cut at a word boundary and ended with an ellipsis so the truncation
 * declares itself. Nothing is lost: the full text is on the jobs screen, which
 * reads the same record.
 */
const ERROR_TEXT_MAX = 120

export function clampErrorText(text: string): string {
  if (text.length <= ERROR_TEXT_MAX) return text
  const cut = text.slice(0, ERROR_TEXT_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > ERROR_TEXT_MAX / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

function formatRunCount(runCount: unknown): string | null {
  if (typeof runCount !== 'number' || !Number.isFinite(runCount)) return null
  const whole = Math.max(0, Math.floor(runCount))
  return `${whole.toLocaleString('en-US')} ${whole === 1 ? 'run' : 'runs'}`
}

function buildDetail(job: ClaudeJob, now: number): Array<ConductorJobLineFixture> {
  const detail: Array<ConductorJobLineFixture> = []

  const lastRun = parseTimestamp(job.last_run_at)
  const runs = formatRunCount(job.run_count)
  if (lastRun === null) {
    detail.push({ text: 'no last run recorded' })
  } else {
    const parts = [`last ${formatRunTime(lastRun, now)}`]
    if (runs) parts.push(runs)
    detail.push({ text: parts.join(' · ') })
  }

  // REAL — `enabled` is a served field, and a paused job reading as healthy
  // would be the same lie the SILENT card exists to prevent.
  if (!job.enabled) {
    detail.push({ text: 'disabled · not scheduled', tone: 'dim' })
  }

  if (isFailedJob(job)) {
    const error = getJobErrorText(job)
    detail.push({
      text: error ? clampErrorText(error) : 'no error text reported',
      tone: 'failed',
    })
  }

  return detail
}

/**
 * One `ClaudeJob` as one card. `now` is injected so the SILENT derivation is
 * testable and so a list maps against a single clock.
 */
export function mapClaudeJobToConductorFixture(
  job: ClaudeJob,
  now: number = Date.now(),
): ConductorJobFixture {
  const name = deriveCardName(job)
  const worker = deriveWorkerFromName(name)
  const cadence = worker
    ? `${formatSchedule(job)} · ${worker}`
    : formatSchedule(job)

  let tone: ConductorJobFixture['tone'] = 'ok'
  let badge = 'OK'

  if (isFailedJob(job)) {
    tone = 'failed'
    badge = 'FAILED'
  } else if (isSilentJob(job, now)) {
    tone = 'silent'
    badge = `SILENT ${daysSinceLastRun(job, now) ?? 0}d`
  }

  return {
    name,
    tone,
    badge,
    cadence,
    detail: buildDetail(job, now),
    // Read-only slice: no chip here may imply a run, a reload or a triage.
    actions: [],
  }
}

/**
 * A list of cards, with names guaranteed unique.
 *
 * `ScheduledJobs` keys its grid by name, so two cards sharing one would make
 * React reconcile the wrong card — and one of the two would be the FAILED one.
 * `profile:name` separates every real collision seen so far; anything still
 * doubled gets the job's own id appended, which is the only remaining thing
 * that distinguishes them and is, again, real data rather than an index.
 */
export function mapClaudeJobsToConductorFixtures(
  jobs: Array<ClaudeJob>,
  now: number = Date.now(),
): Array<ConductorJobFixture> {
  const seen = new Set<string>()

  return jobs.map((job) => {
    const card = mapClaudeJobToConductorFixture(job, now)
    if (!seen.has(card.name)) {
      seen.add(card.name)
      return card
    }
    const disambiguated = `${card.name} (${job.id})`
    seen.add(disambiguated)
    return { ...card, name: disambiguated }
  })
}

/**
 * The section note counts what is actually registered. "6 registered" is a
 * fixture number; live it has to be the live one.
 */
export function buildScheduledJobsHeading(
  count: number,
): ConductorSectionHeadingFixture {
  return {
    label: 'SCHEDULED JOBS',
    note: `${count} registered · health is last-run, not next-run`,
  }
}

/* ── Mobile ──────────────────────────────────────────────────────────── */

/**
 * SCHEDULE HEALTH on a phone shows only what is broken plus a tally of the
 * rest, so the same mapped cards collapse: failed/silent become rows, every
 * other job becomes the footer count.
 *
 * There is no `partial` entry — PARTIAL is NO SOURCE (§3.5 item 11), so the
 * live footer omits that half of the line entirely rather than carrying a
 * fixture through a live render.
 */
export function mapConductorFixturesToMobileJobs(
  fixtures: Array<ConductorJobFixture>,
): { jobs: Array<MobileJobFixture>; healthy: string } {
  const jobs: Array<MobileJobFixture> = []

  for (const fixture of fixtures) {
    if (fixture.tone !== 'failed' && fixture.tone !== 'silent') continue
    const tone: MobileJobTone = fixture.tone
    // `buildDetail` always writes a last-run line, so `detail[0]` exists.
    const line =
      fixture.detail.find((entry) => entry.tone === 'failed') ??
      fixture.detail[0]

    jobs.push({
      name: fixture.name,
      tone,
      badge: tone === 'failed' ? 'FAIL' : fixture.badge,
      detail: line.text,
    })
  }

  const healthyCount = fixtures.length - jobs.length
  return {
    jobs,
    healthy: `${healthyCount} other ${healthyCount === 1 ? 'job' : 'jobs'} healthy`,
  }
}
