/**
 * Desktop Conductor — the two bits of chrome all three sections share: the
 * section heading (label + dim caption) and the action chip.
 *
 * Extracted because WORKER BOARD, SCHEDULED JOBS and RUN LOG draw the same
 * heading, and because the chips on a worker card and on a job card are the
 * same four variants. Keeping one copy means the amber "waiting on a human"
 * chip cannot drift between the two places it appears.
 *
 * Chips are PRESENTATIONAL — spans, not buttons, with no handler. Nothing on
 * this board acts; slice 6 decides what OPEN GATE or RELOAD & RUN actually do.
 *
 * Token discipline: no raw colour, size, spacing or radius in this file.
 */
import { clsx } from 'clsx'
import type {
  ConductorChipFixture,
  ConductorChipTone,
  ConductorSectionHeadingFixture,
} from '@/components/jarvis/fixtures'

const CHIP_BASE =
  'font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wide-2 whitespace-nowrap'

const CHIP_TONES: Record<ConductorChipTone, string> = {
  // Recedes: this is the "don't touch unless you mean it" affordance.
  hold: 'border border-jv-border-btn px-jv-7 py-jv-5 text-jv-text-faint',
  outline: 'border border-jv-border-btn-2 px-jv-8 py-jv-5 text-jv-text-dim',
  // Filled chips invert — board surface on the reserved hue.
  blocked: 'bg-jv-blocked px-jv-8 py-jv-5 text-jv-surface-1',
  failed: 'bg-jv-failed px-jv-8 py-jv-5 text-jv-surface-1',
}

export function ConductorChip({ chip }: { chip: ConductorChipFixture }) {
  return (
    <span
      data-jv-chip-tone={chip.tone}
      className={clsx(CHIP_BASE, CHIP_TONES[chip.tone])}
    >
      {chip.label}
    </span>
  )
}

/**
 * `SECTION LABEL   dim caption`, optionally with something pushed to the right
 * (the run log's tally) and a `no-source` mark on the caption.
 */
export function ConductorSectionHeading({
  heading,
  trailing,
  noSource,
  className,
  title,
}: {
  heading: ConductorSectionHeadingFixture
  trailing?: string
  /** Marks the CAPTION as fixture-only — used for the chain description. */
  noSource?: boolean
  className?: string
  title?: string
}) {
  return (
    <div className={clsx('flex items-baseline gap-jv-12', className)}>
      <span className="font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-widest whitespace-nowrap text-jv-label">
        {heading.label}
      </span>
      <span
        data-jv-fixture={noSource ? 'no-source' : undefined}
        title={title}
        className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-ghost"
      >
        {heading.note}
        {heading.noteAccent ? (
          <span className="text-jv-text-faint">{heading.noteAccent}</span>
        ) : null}
      </span>
      {trailing ? (
        <>
          <span className="flex-1" />
          <span className="font-jv-mono text-jv-sm leading-jv-none whitespace-nowrap text-jv-label-faint">
            {trailing}
          </span>
        </>
      ) : null}
    </div>
  )
}
