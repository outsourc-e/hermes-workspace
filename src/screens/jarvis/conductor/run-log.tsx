/**
 * Desktop Conductor — RUN LOG · UNATTENDED (artboard 02).
 *
 * One row per unattended run over the last 12h: TIME / JOB / WORKER / RESULT /
 * OUTCOME / DURATION. The failed row is tinted and re-coloured end to end
 * rather than only in its OUTCOME cell — you should be able to find it while
 * scrolling past, not by reading the right-hand column.
 *
 * Honesty note — `docs/design/jarvis-ui-mapping.md` §3.5 item 13: this table
 * has NO SOURCE. `ClaudeJob` exposes only the LATEST run of each job, so a
 * multi-row per-run history cannot be assembled from today's API at all. The
 * whole section is marked `data-jv-fixture="no-source"`.
 *
 * Token discipline: no raw colour, size, spacing or radius. The column widths
 * are structural and come from `JV_CONDUCTOR` (multiples of `--jv-space-4`).
 */
import { clsx } from 'clsx'
import { ConductorSectionHeading } from './conductor-chrome'
import { JV_CONDUCTOR } from './geometry'
import type {
  ConductorRunFixture,
  ConductorRunLogChromeFixture,
  ConductorRunOutcome,
} from '@/components/jarvis/fixtures'

const HISTORY_NOTE_TITLE =
  'Fixture — ClaudeJob exposes only the latest run, so no per-run history exists today'

const COLUMN_WIDTHS = {
  time: JV_CONDUCTOR.runTimeWidth,
  job: JV_CONDUCTOR.runJobWidth,
  worker: JV_CONDUCTOR.runWorkerWidth,
  outcome: JV_CONDUCTOR.runOutcomeWidth,
  duration: JV_CONDUCTOR.runDurationWidth,
} as const

interface RowTokens {
  row: string
  time: string
  job: string
  worker: string
  result: string
  outcome: string
  duration: string
}

/**
 * A failed run repaints its whole row; success and partial differ only in the
 * OUTCOME cell, which is exactly how much emphasis each deserves.
 */
const OUTCOMES: Record<ConductorRunOutcome, RowTokens> = {
  success: {
    row: '',
    time: 'text-jv-label-faint',
    job: 'text-jv-text-body',
    worker: 'text-jv-text-faint',
    result: 'text-jv-text-detail',
    outcome: 'text-jv-verified',
    duration: 'text-jv-label-dim',
  },
  partial: {
    row: '',
    time: 'text-jv-label-faint',
    job: 'text-jv-text-body',
    worker: 'text-jv-text-faint',
    result: 'text-jv-text-detail',
    outcome: 'text-jv-claimed-text',
    duration: 'text-jv-label-dim',
  },
  failed: {
    row: 'bg-jv-failed-bg-row',
    time: 'text-jv-failed-muted',
    job: 'text-jv-text-bright',
    worker: 'text-jv-text-faint',
    result: 'text-jv-failed-text',
    outcome: 'font-semibold text-jv-failed',
    duration: 'text-jv-label-dim',
  },
}

export function RunLog({
  chrome,
  runs,
}: {
  chrome: ConductorRunLogChromeFixture
  runs: Array<ConductorRunFixture>
}) {
  const { columns } = chrome

  return (
    <section
      aria-label="Unattended run log"
      data-jv-fixture="no-source"
      title={HISTORY_NOTE_TITLE}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ConductorSectionHeading
        heading={{ label: chrome.label, note: chrome.note }}
        trailing={chrome.summary}
        className="px-jv-20 pt-jv-14 pb-jv-9"
      />

      <div className="flex border-b border-jv-line px-jv-20 pb-jv-5 font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wider text-jv-label-ghost">
        <span style={{ width: COLUMN_WIDTHS.time }}>{columns.time}</span>
        <span style={{ width: COLUMN_WIDTHS.job }}>{columns.job}</span>
        <span style={{ width: COLUMN_WIDTHS.worker }}>{columns.worker}</span>
        <span className="flex-1">{columns.result}</span>
        <span className="text-right" style={{ width: COLUMN_WIDTHS.outcome }}>
          {columns.outcome}
        </span>
        <span className="text-right" style={{ width: COLUMN_WIDTHS.duration }}>
          {columns.duration}
        </span>
      </div>

      <div className="flex-1 overflow-hidden">
        {runs.map((run, index) => {
          const tokens = OUTCOMES[run.outcome]
          return (
            <div
              key={`${run.time}-${run.job}`}
              data-jv-run-outcome={run.outcome}
              className={clsx(
                'flex px-jv-20 py-jv-7 font-jv-mono text-jv-md leading-jv-normal',
                // The last row closes the table; the artboard draws no rule
                // under it, so the section ends on the surface, not a hairline.
                index === runs.length - 1
                  ? ''
                  : 'border-b border-jv-line-faint',
                tokens.row,
              )}
            >
              <span
                className={tokens.time}
                style={{ width: COLUMN_WIDTHS.time }}
              >
                {run.time}
              </span>
              <span className={tokens.job} style={{ width: COLUMN_WIDTHS.job }}>
                {run.job}
              </span>
              <span
                className={tokens.worker}
                style={{ width: COLUMN_WIDTHS.worker }}
              >
                {run.worker}
              </span>
              <span className={clsx('flex-1 truncate', tokens.result)}>
                {run.result}
              </span>
              <span
                className={clsx('text-right', tokens.outcome)}
                style={{ width: COLUMN_WIDTHS.outcome }}
              >
                {run.outcome}
              </span>
              <span
                className={clsx('text-right', tokens.duration)}
                style={{ width: COLUMN_WIDTHS.duration }}
              >
                {run.duration}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
