/**
 * Desktop Conductor — SCHEDULED JOBS (artboard 02).
 *
 * A 3-column grid of job cards. Health here is LAST-run, not next-run — a job
 * with a perfectly valid schedule that has not fired in 23 days is the failure
 * this section exists to surface, so `failed` and `silent` are the loudest
 * cards on the board:
 *   • FAILED — red frame, hazard-striped left edge, the actual error text,
 *     and the two chips you would reach for (TRIAGE / FULL LOG).
 *   • SILENT — amber frame, the arithmetic that proves the silence
 *     ("expected 4 runs · got 0 · never errored") and the launchd diagnostic
 *     that explains it.
 * `PARTIAL` is deliberately quieter: same frame as OK, amber badge only.
 *
 * Honesty notes (`docs/design/jarvis-ui-mapping.md`):
 *   • §3.4 — name, cadence, last-run success/error and next-run ARE real today
 *     (the `ClaudeJob` records the jobs endpoint serves). Not read here.
 *   • §3.5 item 11 — PARTIAL is not a job status; it only ever exists as free
 *     text inside `last_run_error`. Its badge is marked `no-source`.
 *   • §3.5 item 12 — the launchd "not loaded" line has no source at all.
 *
 * Token discipline: no raw colour, size, spacing or radius. The hazard stripe
 * is a `repeating-linear-gradient` over `--jv-failed` / `--jv-failed-bg` at
 * `--jv-space-4` intervals, so even the stripe resolves through the tokens.
 */
import { clsx } from 'clsx'
import { JV_BOARD } from '../command/geometry'
import { ConductorChip, ConductorSectionHeading } from './conductor-chrome'
import type {
  ConductorJobFixture,
  ConductorJobLineTone,
  ConductorJobTone,
  ConductorSectionHeadingFixture,
} from '@/components/jarvis/fixtures'

/**
 * The 3px striped edge on a failed job — a second, non-colour signal that this
 * card is the emergency, readable before any text is.
 */
const HAZARD_STRIPE =
  'repeating-linear-gradient(0deg, var(--jv-failed) 0 var(--jv-space-4), var(--jv-failed-bg) var(--jv-space-4) var(--jv-space-8))'

interface JobTokens {
  frame: string
  name: string
  /** Filled for FAILED, plain coloured text for the rest. */
  badge: string
  detail: string
  /** Failed cards inset their content to clear the hazard stripe. */
  inset?: string
  stripe?: boolean
}

const JOB_TONES: Record<ConductorJobTone, JobTokens> = {
  ok: {
    frame: 'border-jv-border-muted bg-jv-surface-2',
    name: 'font-medium text-jv-text',
    badge: 'text-jv-verified',
    detail: 'text-jv-label-dim',
  },
  partial: {
    // Same frame as OK on purpose: the run happened, it just wasn't whole.
    frame: 'border-jv-border-muted bg-jv-surface-2',
    name: 'font-medium text-jv-text',
    badge: 'text-jv-claimed-text',
    detail: 'text-jv-label-dim',
  },
  failed: {
    frame: 'border-jv-failed-line bg-jv-failed-bg',
    name: 'font-semibold text-jv-text-bright',
    badge: 'bg-jv-failed px-jv-5 py-jv-3 text-jv-surface-1',
    detail: 'text-jv-text-faint',
    inset: 'pl-jv-6',
    stripe: true,
  },
  silent: {
    frame: 'border-jv-blocked-line bg-jv-blocked-bg-row',
    name: 'font-semibold text-jv-text-bright',
    badge: 'text-jv-blocked',
    detail: 'text-jv-blocked-soft',
  },
}

const LINE_TONES: Record<Exclude<ConductorJobLineTone, 'default'>, string> = {
  failed: 'text-jv-failed-text',
  dim: 'text-jv-blocked-dim',
}

function JobCard({ job }: { job: ConductorJobFixture }) {
  const tokens = JOB_TONES[job.tone]

  return (
    <div
      data-jv-job-tone={job.tone}
      className={clsx(
        'relative border px-jv-11 pt-jv-9 pb-jv-10',
        tokens.frame,
      )}
    >
      {tokens.stripe ? (
        <span
          aria-hidden="true"
          className="absolute top-jv-0 bottom-jv-0 left-jv-0 w-jv-3"
          style={{ backgroundImage: HAZARD_STRIPE }}
        />
      ) : null}

      <div className={clsx('flex items-baseline gap-jv-8', tokens.inset)}>
        <span
          className={clsx(
            'flex-1 font-jv-mono text-jv-lg leading-jv-none',
            tokens.name,
          )}
        >
          {job.name}
        </span>
        <span
          data-jv-fixture={job.badgeNoSource ? 'no-source' : undefined}
          className={clsx(
            'font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wide-2 whitespace-nowrap',
            tokens.badge,
          )}
        >
          {job.badge}
        </span>
      </div>

      <div
        className={clsx(
          'mt-jv-6 font-jv-mono text-jv-base leading-jv-loose',
          tokens.detail,
          tokens.inset,
        )}
      >
        <div>{job.cadence}</div>
        {job.detail.map((line) => (
          <div
            key={line.text}
            data-jv-fixture={line.noSource ? 'no-source' : undefined}
            className={
              line.tone && line.tone !== 'default'
                ? LINE_TONES[line.tone]
                : undefined
            }
          >
            {line.text}
          </div>
        ))}
      </div>

      {job.actions?.length ? (
        <div className={clsx('mt-jv-8 flex gap-jv-6', tokens.inset)}>
          {job.actions.map((chip) => (
            <ConductorChip key={chip.label} chip={chip} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ScheduledJobs({
  heading,
  jobs,
}: {
  heading: ConductorSectionHeadingFixture
  jobs: Array<ConductorJobFixture>
}) {
  return (
    <section
      aria-label="Scheduled jobs"
      className="flex-none border-b border-jv-line px-jv-20 pt-jv-16"
      style={{ paddingBottom: JV_BOARD.gap18 }}
    >
      <ConductorSectionHeading heading={heading} className="mb-jv-10" />

      <div className="grid grid-cols-3 gap-jv-12">
        {jobs.map((job) => (
          <JobCard key={job.name} job={job} />
        ))}
      </div>
    </section>
  )
}
