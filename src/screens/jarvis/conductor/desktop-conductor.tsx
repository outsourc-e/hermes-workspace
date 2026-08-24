/**
 * JARVIS Conductor — the routed screen, plus the Desktop Conductor board itself
 * (artboard 02, fixed 1440×900).
 *
 * Slice 5 makes the ROUTE responsive without touching the board. At `lg` and
 * above the screen renders `DesktopConductorBoard` exactly as slice 4 drew it;
 * below `lg` it renders `MobileConductorBoard` — artboard 04, a glance surface
 * that collapses the survey into four numbers and the two things that are
 * broken — rather than reflowing a 1440 board into 390. The swap is CSS
 * (`hidden` / `flex`), not a media-query hook, so there is no viewport read to
 * get wrong on first paint.
 *
 * `DesktopConductorScreen` keeps its slice-4 name because `src/routes/
 * jarvis-conductor.tsx` imports it and routes are out of scope for this slice.
 * It is the Conductor screen at every width, not the desktop one.
 *
 * Top bar (COMMAND/CONDUCTOR tabs) over three stacked sections: WORKER BOARD,
 * SCHEDULED JOBS, RUN LOG · UNATTENDED. Where the Command board answers "what
 * is JARVIS doing with me", this one answers "what is it doing without me" —
 * so FAILED and STALE are the point of the screen, not edge cases: the failed
 * job wears a hazard-striped red frame and the silent one an amber frame, both
 * carrying the diagnostic and the chip you would actually reach for.
 *
 * TWO SECTIONS ARE LIVE. SCHEDULED JOBS reads real `ClaudeJob` records through
 * `useScheduledJobs` (slice 6a) — the same `['claude','jobs']` query the product
 * jobs screen runs. The WORKER BOARD reads real swarm sessions through
 * `useWorkers` (slice 6b), with `blocked` joined from the pending approvals
 * queue. Both are GET only; no mutation anywhere on this board. The RUN LOG and
 * the top bar are still fixtures.
 *
 * The two wires are INDEPENDENT: jobs can be live while workers fall back, or
 * the reverse, so the banner reports each separately rather than declaring the
 * whole board live off one of them.
 *
 * When the gateway is unreachable — the normal case for an offline design
 * review — the hooks return the slice-4 fixtures and `isLive: false`, and the
 * board renders exactly as it did before. The banner above the frame says which
 * of the two you are looking at; it is never left claiming "every value is
 * invented" over live data, or the reverse.
 *
 * Live cards carry no `data-jv-fixture="no-source"` marks, because nothing
 * unsourced is drawn for a real job or a real worker: no PARTIAL badge (§3.5
 * item 11), no launchd diagnostic (item 12), no invented duration, payload count
 * or per-worker narrative, no chain connector between real workers (item 14),
 * and no action chips at all — TRIAGE / FULL LOG / RELOAD & RUN, HOLD ⌥ and
 * OPEN GATE each imply a write this read-only slice cannot do. Those elements
 * survive only on the fixture fallback, where they stay labelled as fixtures
 * both in the banner and via `data-jv-fixture="no-source"` in the DOM.
 *
 * One over-mark is deliberate. `worker-board.tsx` renders its caption inside a
 * `data-jv-fixture="no-source"` span unconditionally, so the live caption — a
 * real roster count — keeps that mark; changing it would mean editing that
 * file's rendering, which is out of scope here. Over-marking under-claims, which
 * is the safe direction to be wrong.
 *
 * Theme handling: the `--jv-*` tokens only resolve under `[data-theme='jarvis']`,
 * so the board sets that attribute on <html> for as long as it is mounted and
 * restores the previous value on unmount — never writing localStorage, so the
 * user's stored theme comes back untouched. Same hook as the Command board,
 * copied rather than shared: lifting it would mean editing that screen, which
 * is out of scope for this slice.
 *
 * One class needs explaining: the board root carries `tracking-normal`. The app
 * sets `letter-spacing: -0.15px` on `html, body` in `styles.css`, which every
 * descendant inherits; the artboard's text is untracked. Without this the whole
 * board renders a hair tight, and the drift compounds across a long mono line
 * like a run-log result. Resetting it at the board root is local and additive —
 * the explicit `tracking-jv-*` on labels and badges still wins over it.
 *
 * Token discipline: no raw colour, size, spacing or radius in this directory.
 * Structural dimensions come from `JV_BOARD` / `JV_CONDUCTOR` (multiples of
 * `--jv-space-4`).
 */
import { useEffect } from 'react'
import { JV_BOARD, JV_MOBILE } from '../command/geometry'
import { ConductorTopbar } from './conductor-topbar'
import { MobileConductorBoard } from './mobile-conductor'
import { RunLog } from './run-log'
import { ScheduledJobs } from './scheduled-jobs'
import { useApprovals } from './use-approvals'
import { useScheduledJobs } from './use-scheduled-jobs'
import { useWorkers } from './use-workers'
import { WorkerBoard } from './worker-board'
import type { ScheduledJobsData } from './use-scheduled-jobs'
import type { WorkersData } from './use-workers'
import {
  conductorFixtureNotice,
  conductorJobFixtures,
  conductorJobsHeading,
  conductorNoSourceNotice,
  conductorRunLogChrome,
  conductorRunLogFixtures,
  conductorTopbarFixture,
  conductorWorkerBoardHeading,
  conductorWorkerCardFixtures,
  mobileFixtureNotice,
} from '@/components/jarvis/fixtures'

const THEME_ATTRIBUTE = 'data-theme'
const JARVIS_THEME = 'jarvis'

/** Applies `data-theme='jarvis'` for the lifetime of the board only. */
function useJarvisThemeAttribute() {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute(THEME_ATTRIBUTE)
    root.setAttribute(THEME_ATTRIBUTE, JARVIS_THEME)
    return () => {
      if (previous === null) {
        root.removeAttribute(THEME_ATTRIBUTE)
      } else {
        root.setAttribute(THEME_ATTRIBUTE, previous)
      }
    }
  }, [])
}

/**
 * The honesty banner now has FOUR readings, because the two wires fail
 * independently: jobs live, workers live, both, or neither.
 * `conductorFixtureNotice` says every value is invented — true only when
 * neither is up — so the banner is assembled per section instead of picked from
 * a pair of constants. The NO SOURCE notice below it is printed either way,
 * because that list is about the design, not about the connection.
 */
const LIVE_WORKERS_CLAUSE =
  'The WORKER BOARD is LIVE — real swarm sessions (GET /api/gateway/sessions), with BLOCKED joined from the pending approvals queue (GET /api/gateway/approvals). Status is the swarm store’s heuristic, not an authoritative gateway signal, and a real card draws no per-worker narrative and no chain connector, because neither has a source.'

const LIVE_JOBS_CLAUSE =
  'SCHEDULED JOBS is LIVE — real ClaudeJob records read from the gateway (GET /api/claude-jobs, the same query the jobs screen runs).'

const READ_ONLY_CLAUSE =
  'Read-only: this board issues no write of any kind, so live cards carry no action chips and nothing without a source is drawn on them.'

const MOBILE_LIVE_WORKERS_CLAUSE =
  'The stat strip and RUNNING NOW are LIVE — counted from the same real swarm sessions as the desktop board, BLOCKED joined from pending approvals.'

const MOBILE_LIVE_JOBS_CLAUSE =
  'SCHEDULE HEALTH is LIVE — the same real ClaudeJob records as the desktop board, collapsed to what is unhealthy.'

const MOBILE_LIVE_GATE_CLAUSE =
  'NEEDS YOU is LIVE — the oldest pending approval from GET /api/gateway/approvals, with the rest counted behind it. It offers REVIEW only: this glance surface draws no blast-radius panel, so it must not offer a decision.'

function buildNotice(
  fallback: string,
  clauses: Array<string>,
  stillFixture: Array<string>,
): string {
  if (clauses.length === 0) return fallback
  return `${clauses.join(' ')} ${READ_ONLY_CLAUSE} Still invented fixtures: ${stillFixture.join(' · ')}.`
}

function buildConductorNotice(
  workersLive: boolean,
  jobsLive: boolean,
): string {
  const clauses: Array<string> = []
  const stillFixture: Array<string> = []

  if (workersLive) clauses.push(LIVE_WORKERS_CLAUSE)
  else stillFixture.push('the worker board')
  if (jobsLive) clauses.push(LIVE_JOBS_CLAUSE)
  else stillFixture.push('scheduled jobs')
  stillFixture.push('the run log', 'the top bar')

  return buildNotice(conductorFixtureNotice, clauses, stillFixture)
}

function buildMobileConductorNotice(
  workersLive: boolean,
  jobsLive: boolean,
  gateLive: boolean,
): string {
  const clauses: Array<string> = []
  const stillFixture: Array<string> = []

  if (workersLive) clauses.push(MOBILE_LIVE_WORKERS_CLAUSE)
  else stillFixture.push('the stat strip', 'RUNNING NOW')
  if (jobsLive) clauses.push(MOBILE_LIVE_JOBS_CLAUSE)
  else stillFixture.push('SCHEDULE HEALTH')
  if (gateLive) clauses.push(MOBILE_LIVE_GATE_CLAUSE)
  else stillFixture.push('NEEDS YOU')
  stillFixture.push('LAST NIGHT')

  return buildNotice(mobileFixtureNotice, clauses, stillFixture)
}

/**
 * The board frame on its own — 1440×900, exactly what the artboard shows.
 *
 * Job data arrives as props with the fixtures as defaults, so the frame still
 * renders standalone with no query client mounted; the routed screen below
 * passes the live jobs in when the gateway has any.
 */
export function DesktopConductorBoard({
  jobs = conductorJobFixtures,
  jobsHeading = conductorJobsHeading,
  workers = conductorWorkerCardFixtures,
  workerHeading = conductorWorkerBoardHeading,
}: {
  jobs?: ScheduledJobsData['jobs']
  jobsHeading?: ScheduledJobsData['heading']
  workers?: WorkersData['cards']
  workerHeading?: WorkersData['heading']
} = {}) {
  return (
    <div
      data-jv-board="desktop-conductor"
      className="flex flex-none flex-col overflow-hidden border border-jv-border bg-jv-surface-1 font-jv-sans tracking-normal text-jv-text"
      style={{
        width: JV_BOARD.frameWidth,
        height: JV_BOARD.frameHeight,
      }}
    >
      <ConductorTopbar data={conductorTopbarFixture} />

      <WorkerBoard heading={workerHeading} cards={workers} />

      <ScheduledJobs heading={jobsHeading} jobs={jobs} />

      <RunLog chrome={conductorRunLogChrome} runs={conductorRunLogFixtures} />
    </div>
  )
}

/**
 * The dev route's page. One route, two compositions: the desktop board at `lg`
 * and above, the mobile board below it. Both are mounted and CSS picks one —
 * a CSS swap cannot mismatch on first paint the way a `matchMedia` read can.
 *
 * Both wires are read ONCE here and handed to both frames, so the hidden one
 * still costs only its markup: a second `useScheduledJobs` / `useWorkers` call
 * would share the cache and the store anyway, but one read keeps the two frames
 * provably showing the same jobs and the same workers at the same moment.
 */
export function DesktopConductorScreen() {
  useJarvisThemeAttribute()
  const scheduled = useScheduledJobs()
  const workers = useWorkers()
  // DISPLAY only, and read-only: `useApprovals` issues the same GET the worker
  // board already shares. The resolve mutation is not imported on this screen at
  // all — the Conductor pointer offers REVIEW, never APPROVE.
  const approvals = useApprovals()

  return (
    <div className="min-h-screen bg-jv-bg font-jv-sans tracking-normal text-jv-text">
      <div className="hidden flex-col items-center gap-jv-16 p-jv-24 lg:flex">
        <header
          className="flex w-full flex-col gap-jv-6"
          style={{ maxWidth: JV_BOARD.frameWidth }}
        >
          <div className="flex items-baseline gap-jv-12">
            <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider-2 text-jv-live">
              02 · DESKTOP CONDUCTOR
            </span>
            <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-dim">
              1440 × 900
            </span>
            <span className="font-jv-sans text-jv-md leading-jv-none text-jv-label">
              everything running, everything scheduled
            </span>
          </div>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-text-caption">
            {buildConductorNotice(workers.isLive, scheduled.isLive)}
          </p>
          <p className="font-jv-sans text-jv-lg leading-jv-loose text-jv-blocked-dim">
            {conductorNoSourceNotice}
          </p>
        </header>

        <DesktopConductorBoard
          jobs={scheduled.jobs}
          jobsHeading={scheduled.heading}
          workers={workers.cards}
          workerHeading={workers.heading}
        />
      </div>

      <div className="flex flex-col items-center gap-jv-12 p-jv-14 lg:hidden">
        <header
          className="flex w-full flex-col gap-jv-6"
          style={{ maxWidth: JV_MOBILE.frameWidth }}
        >
          <div className="flex items-baseline gap-jv-9">
            <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider-2 text-jv-live">
              04 · MOBILE CONDUCTOR
            </span>
            <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-dim">
              390 × 844
            </span>
          </div>
          <p className="font-jv-sans text-jv-md leading-jv-loose text-jv-text-caption">
            {buildMobileConductorNotice(
              workers.isLive,
              scheduled.isLive,
              approvals.isLive,
            )}
          </p>
          <p className="font-jv-sans text-jv-md leading-jv-loose text-jv-blocked-dim">
            {conductorNoSourceNotice}
          </p>
        </header>

        <MobileConductorBoard
          jobs={scheduled.mobileJobs}
          scheduleHealth={scheduled.mobileScheduleHealth}
          stats={workers.mobileStats}
          running={workers.mobileRunning}
          needsYou={approvals.needsYou}
          needsYouIsLive={approvals.isLive}
        />
      </div>
    </div>
  )
}
