/**
 * JARVIS Mobile Conductor board — artboard 04, 390 × 844.
 *
 * A DIFFERENT COMPOSITION, not the desktop board reflowed. Board 02 is a
 * survey — a ten-card worker grid, six job cards, an eight-row run table — and
 * none of that is a phone screen. Board 04 is a GLANCE SURFACE with one rule:
 * nothing critical requires a scroll. So the ten workers collapse to a
 * four-number strip plus the two that are actually running, the six jobs
 * collapse to the two that are unhealthy plus a one-line tally of the rest,
 * and the run table collapses to time + stem + outcome. What is dropped is
 * dropped because it is survey, not signal.
 *
 * COMPOSES the Slice 2 `WorkerStatusLine` primitive for RUNNING NOW and
 * re-styles it none. NEEDS YOU is deliberately NOT an `ApprovalGateCard`: on
 * the Conductor it is a POINTER to a gate, and drawing the honest blast-radius
 * panel on a glance surface would imply you can decide from here. The gate
 * itself lives on Command.
 *
 * FOUR SECTIONS CAN BE LIVE. SCHEDULE HEALTH accepts real jobs (slice 6a), the
 * STAT STRIP and RUNNING NOW accept real swarm workers (slice 6b), and NEEDS
 * YOU accepts the real pending approval (slice 6c) — all mapped by the routed
 * screen, which owns the only queries and the only store subscription — falling
 * back to the fixtures when nothing is passed, which is what a standalone
 * render and the tests get. This file itself still opens no request and imports
 * no client; it is a frame, not a fetcher, and it resolves nothing: the live
 * NEEDS YOU pointer offers REVIEW and no APPROVE, because approving from a
 * surface that draws no blast-radius panel is exactly what that panel exists to
 * prevent.
 *
 * Live, the footer's PARTIAL half-line is DROPPED rather than carried over
 * (§3.5 item 11: PARTIAL is not a job status, only free text inside
 * `last_run_error`), and no live row is marked `no-source` because nothing
 * unsourced is drawn for a real job or a real worker. RUNNING NOW can be EMPTY
 * live — when nothing is running that is the true answer, and the strip above
 * already says RUNNING 0; padding it with idle workers to keep the section
 * looking full would be the same lie in a different place. Its chain caption
 * stays fixture and stays marked, because the delegation graph has no source
 * (§3.5 item 14). LAST NIGHT is still a fixture, and the rows with NO source
 * at all keep their `data-jv-fixture="no-source"` mark and their line in the
 * banner above the frame.
 *
 * Fluid, not a 390px box: `w-full` with 390 as a MAX and 844 as a MIN.
 *
 * Token discipline: no raw colour, size, spacing or radius. Structural
 * dimensions come from `JV_MOBILE` (multiples of `--jv-space-4`).
 */
import { Link } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { JV_MOBILE } from '../command/geometry'
import { MobileStatusBar } from '../command/mobile-status-bar'
import type {
  ConductorRunOutcome,
  MobileGateSummaryFixture,
  MobileJobFixture,
  MobileJobTone,
  MobileLastNightFixture,
  MobileRunningChainFixture,
  MobileScheduleHealthFixture,
  MobileStatFixture,
  MobileStatTone,
} from '@/components/jarvis/fixtures'
import type { WorkerStatusLineProps } from '@/components/jarvis/types'
import {
  conductorTopbarFixture,
  mobileConductorJobFixtures,
  mobileConductorLastNightFixture,
  mobileConductorNeedsYouFixture,
  mobileConductorRunningChain,
  mobileConductorRunningFixtures,
  mobileConductorScheduleHealth,
  mobileConductorStatFixtures,
  mobileStatusBarFixture,
} from '@/components/jarvis/fixtures'
import { WorkerStatusLine } from '@/components/jarvis/worker-status-line'

const SECTION_LABEL_CLASS =
  'font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-widest text-jv-label'

const TAB_CLASS =
  'flex-1 py-jv-8 text-center font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-wide-2'

/** Only the NUMBER is hue-coded; the label stays neutral in every state. */
const STAT_TONES: Record<MobileStatTone, string> = {
  live: 'text-jv-live',
  blocked: 'text-jv-blocked',
  failed: 'text-jv-failed',
  idle: 'text-jv-label-faint',
}

const JOB_TONES: Record<MobileJobTone, { frame: string; badge: string }> = {
  failed: {
    frame: 'border-jv-failed-line bg-jv-failed-bg',
    badge: 'bg-jv-failed px-jv-5 py-jv-3 text-jv-surface-1',
  },
  silent: {
    frame: 'border-jv-blocked-line bg-jv-blocked-bg-row',
    badge: 'text-jv-blocked',
  },
}

const JOB_DETAIL_TONES: Record<MobileJobTone, string> = {
  failed: 'text-jv-failed-text',
  silent: 'text-jv-blocked-soft',
}

const RUN_OUTCOMES: Record<ConductorRunOutcome, string> = {
  success: 'text-jv-verified',
  partial: 'text-jv-claimed-text',
  failed: 'font-semibold text-jv-failed',
}

function SectionLabel({ label, note }: { label: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-jv-9">
      <span className={SECTION_LABEL_CLASS}>{label}</span>
      {note ? (
        <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-ghost">
          {note}
        </span>
      ) : null}
    </div>
  )
}

/** COMMAND / CONDUCTOR, full-width under the status bar. */
function MobileTabs({ tabs }: { tabs: typeof conductorTopbarFixture.tabs }) {
  return (
    <nav
      aria-label="Boards"
      className="flex flex-none border-b border-jv-line bg-jv-surface-0"
    >
      {tabs.map((tab) =>
        tab.active || !tab.href ? (
          <span
            key={tab.label}
            aria-current={tab.active ? 'page' : undefined}
            className={clsx(TAB_CLASS, 'bg-jv-surface-5 text-jv-text')}
          >
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.label}
            to={tab.href}
            className={clsx(TAB_CLASS, 'text-jv-label-dim')}
          >
            {tab.label}
          </Link>
        ),
      )}
    </nav>
  )
}

/** RUNNING 2 · BLOCKED 1 · FAILED 1 · IDLE 7 — the no-scroll answer. */
function StatStrip({ stats }: { stats: Array<MobileStatFixture> }) {
  return (
    <div className="flex flex-none border-b border-jv-line bg-jv-surface-2">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          data-jv-stat-tone={stat.tone}
          className={clsx(
            'flex-1 px-jv-8 py-jv-9 text-center',
            index > 0 ? 'border-l border-jv-line-soft' : '',
          )}
        >
          <div
            className={clsx(
              'font-jv-mono text-jv-8xl leading-jv-none font-semibold',
              STAT_TONES[stat.tone],
            )}
          >
            {stat.value}
          </div>
          <div className="mt-jv-6 font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wide-2 text-jv-label">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * NEEDS YOU. A pointer to the gate, not the gate: label, what it would do, and
 * the two ways out of this screen.
 */
function NeedsYou({
  data,
  isLive,
}: {
  data: MobileGateSummaryFixture
  isLive: boolean
}) {
  return (
    <section
      aria-label={data.heading}
      data-jv-gate-source={isLive ? 'live' : 'fixture'}
      className="flex flex-col gap-jv-9"
    >
      <SectionLabel label={data.heading} />

      <div className="border border-jv-blocked-line bg-jv-blocked-bg px-jv-12 pt-jv-10 pb-jv-11">
        <div className="flex items-center gap-jv-7">
          <span
            aria-hidden="true"
            className="h-jv-5 w-jv-5 flex-none bg-jv-blocked"
          />
          <span className="font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-wider text-jv-blocked">
            {data.label}
          </span>
        </div>

        <div className="mt-jv-9 font-jv-sans text-jv-4xl leading-jv-normal-2 font-medium text-jv-text-bright">
          {data.title}
        </div>

        <div className="mt-jv-11 flex items-center gap-jv-8">
          {data.actions.map((action, index) => (
            <span
              key={action}
              className={clsx(
                'font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider',
                index === 0
                  ? 'px-jv-16 py-jv-8 bg-jv-verified text-jv-surface-0'
                  : 'px-jv-14 py-jv-8 border border-jv-border-btn-2 text-jv-text-body',
              )}
            >
              {action}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function RunningNow({
  chrome,
  workers,
}: {
  chrome: MobileRunningChainFixture
  workers: Array<WorkerStatusLineProps>
}) {
  return (
    <section aria-label={chrome.heading} className="flex flex-col gap-jv-9">
      <SectionLabel label={chrome.heading} />

      {/* The primitive draws only a top rule, so the list closes itself. */}
      <div className="flex flex-col border-b border-jv-line-soft">
        {workers.map((worker) => (
          <WorkerStatusLine key={worker.name} {...worker} />
        ))}
      </div>

      <div className="flex items-center gap-jv-9">
        <span
          data-jv-fixture="no-source"
          title="Layout convention — no parent→child delegation graph is captured today"
          className="flex-1 font-jv-mono text-jv-sm leading-jv-relaxed text-jv-label-faint"
        >
          {chrome.chain}
        </span>
        <span className="border border-jv-border-btn px-jv-8 py-jv-5 font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wide-2 whitespace-nowrap text-jv-text-faint">
          {chrome.holdLabel}
        </span>
      </div>
    </section>
  )
}

function ScheduleHealth({
  chrome,
  jobs,
}: {
  chrome: MobileScheduleHealthFixture
  jobs: Array<MobileJobFixture>
}) {
  // Empty means live: there is no PARTIAL to report because no such status
  // exists. Rendering the separator over nothing would imply one does.
  const hasPartial = Boolean(chrome.partial)

  return (
    <section aria-label={chrome.heading} className="flex flex-col gap-jv-9">
      <SectionLabel label={chrome.heading} />

      {jobs.map((job) => {
        const tokens = JOB_TONES[job.tone]
        return (
          <div
            key={job.name}
            data-jv-job-tone={job.tone}
            className={clsx('border px-jv-11 pt-jv-9 pb-jv-10', tokens.frame)}
          >
            <div className="flex items-baseline gap-jv-8">
              <span className="flex-1 font-jv-mono text-jv-lg leading-jv-none font-semibold text-jv-text-bright">
                {job.name}
              </span>
              <span
                className={clsx(
                  'font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wide-2 whitespace-nowrap',
                  tokens.badge,
                )}
              >
                {job.badge}
              </span>
            </div>
            <div
              data-jv-fixture={job.noSource ? 'no-source' : undefined}
              className={clsx(
                'mt-jv-6 font-jv-mono text-jv-base leading-jv-loose',
                JOB_DETAIL_TONES[job.tone],
              )}
            >
              {job.detail}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-jv-7 font-jv-mono text-jv-sm leading-jv-none text-jv-label-faint">
        <span aria-hidden="true" className="text-jv-verified">
          ●
        </span>
        <span>{chrome.healthy}</span>
        {hasPartial ? (
          <>
            <span aria-hidden="true" className="text-jv-label-ghost">
              ·
            </span>
            <span data-jv-fixture="no-source" className="text-jv-claimed-text">
              {chrome.partial}
            </span>
          </>
        ) : null}
      </div>
    </section>
  )
}

function LastNight({ data }: { data: MobileLastNightFixture }) {
  return (
    <section
      aria-label={data.heading}
      data-jv-fixture="no-source"
      title="Fixture — ClaudeJob exposes only the latest run, so no per-run history exists today"
      className="flex flex-col gap-jv-9"
    >
      <SectionLabel label={data.heading} note={data.window} />

      <div className="flex flex-col">
        {data.runs.map((run, index) => (
          <div
            key={`${run.time}-${run.job}`}
            data-jv-run-outcome={run.outcome}
            className={clsx(
              'flex items-baseline gap-jv-10 py-jv-7 font-jv-mono text-jv-md leading-jv-none',
              index > 0 ? 'border-t border-jv-line-faint' : '',
            )}
          >
            <span
              className="flex-none text-jv-label-faint"
              style={{ width: JV_MOBILE.runTimeWidth }}
            >
              {run.time}
            </span>
            <span className="flex-1 truncate text-jv-text-body">{run.job}</span>
            <span className={RUN_OUTCOMES[run.outcome]}>{run.outcome}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * The mobile frame on its own — what artboard 04 shows, fluid to the viewport.
 *
 * Jobs and workers come in as props defaulting to the fixtures, so the frame
 * renders standalone with no query client and no store poll mounted, and the
 * slice-5 board is unchanged when nothing is passed.
 */
export function MobileConductorBoard({
  jobs = mobileConductorJobFixtures,
  scheduleHealth = mobileConductorScheduleHealth,
  stats = mobileConductorStatFixtures,
  running = mobileConductorRunningFixtures,
  needsYou = mobileConductorNeedsYouFixture,
  needsYouIsLive = false,
}: {
  jobs?: Array<MobileJobFixture>
  scheduleHealth?: MobileScheduleHealthFixture
  stats?: Array<MobileStatFixture>
  running?: Array<WorkerStatusLineProps>
  needsYou?: MobileGateSummaryFixture
  needsYouIsLive?: boolean
} = {}) {
  return (
    <div
      data-jv-board="mobile-conductor"
      className="flex w-full flex-col overflow-hidden border border-jv-border bg-jv-surface-1 font-jv-sans tracking-normal text-jv-text"
      style={{
        maxWidth: JV_MOBILE.frameWidth,
        minHeight: JV_MOBILE.frameHeight,
      }}
    >
      <MobileStatusBar data={mobileStatusBarFixture} />
      <MobileTabs tabs={conductorTopbarFixture.tabs} />
      <StatStrip stats={stats} />

      <main className="flex min-h-0 flex-1 flex-col gap-jv-16 overflow-y-auto px-jv-14 pt-jv-14 pb-jv-16">
        <NeedsYou data={needsYou} isLive={needsYouIsLive} />
        <RunningNow chrome={mobileConductorRunningChain} workers={running} />
        <ScheduleHealth chrome={scheduleHealth} jobs={jobs} />
        <LastNight data={mobileConductorLastNightFixture} />
      </main>
    </div>
  )
}
