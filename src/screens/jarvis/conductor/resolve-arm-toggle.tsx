/**
 * The arm switch for the gate's resolve — the visible half of `use-resolve-arm`.
 *
 * It is a switch and nothing more: pressing it changes one boolean in this
 * session and sends nothing. The line under it says which of the two worlds you
 * are in, in the gate's own terms, so that "armed" is never something you have
 * to infer from a button lighting up.
 *
 * ARMED IS NOT RESOLVED. Even lit, APPROVE / REJECT still walk their two-step
 * confirm, and the POST still needs a real approval id — see
 * `use-resolve-approval.ts`, which this slice does not touch. Arming opens LOCK
 * 1 only.
 *
 * The repo's `<Switch>` (`src/components/ui/switch.tsx`) is deliberately not
 * used: it is styled in the app's `primary`/`emerald` scale with raw px, and
 * none of that resolves under `[data-theme='jarvis']`. This is a plain button
 * with `role="switch"`, which is what that primitive would have been anyway.
 *
 * Colour choice: OFF is the board's dim label grey — an inert control. ARMED is
 * the BLOCKED amber the gate itself is drawn in, not the LIVE cyan: cyan on
 * this board means "a real thing is streaming", and amber means "a human is in
 * the loop here". Armed is the second one.
 *
 * Token discipline: no raw colour, size, spacing or radius in this file.
 */
/*
 * NOTE: `clsx` rather than the repo's `cn()`, for the reason given at the top of
 * `src/components/jarvis/approval-gate-card.tsx` — tailwind-merge does not know
 * the `jv-*` scale and drops `text-jv-*` sizes when a `text-jv-*` colour sits
 * beside them.
 */
import { clsx } from 'clsx'

export const ARM_LABEL_OFF = 'LIVE RESOLVE: OFF'
export const ARM_LABEL_ARMED = 'LIVE RESOLVE: ARMED'

export const ARM_NOTE_OFF =
  'The gate is display-only this session. APPROVE / REJECT still walk their confirm step and then stop — nothing is sent to the gateway.'
export const ARM_NOTE_ARMED =
  'Armed for this session only. A CONFIRMED approve or reject now POSTs the real decision to the gateway, and there is no undo. Arming alone sends nothing.'

export function ResolveArmToggle({
  armed,
  onChange,
}: {
  armed: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div data-jv-resolve-armed={armed} className="flex flex-col gap-jv-5">
      <button
        type="button"
        role="switch"
        aria-checked={armed}
        onClick={() => onChange(!armed)}
        className={clsx(
          'flex w-fit items-center gap-jv-8 border px-jv-11 py-jv-7 font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider',
          armed
            ? 'border-jv-blocked-line bg-jv-blocked-bg-chip text-jv-blocked'
            : 'border-jv-border-btn bg-jv-surface-2 text-jv-label',
        )}
      >
        {/* The lamp. Filled when armed, hollow when not — legible before the
            text is read, and never the only signal. */}
        <span
          aria-hidden="true"
          className={clsx(
            'h-jv-6 w-jv-6 flex-none border',
            armed
              ? 'border-jv-blocked bg-jv-blocked'
              : 'border-jv-label-faint bg-jv-surface-0',
          )}
        />
        {armed ? ARM_LABEL_ARMED : ARM_LABEL_OFF}
      </button>

      <p
        className={clsx(
          'font-jv-sans text-jv-md leading-jv-loose',
          armed ? 'text-jv-blocked-soft' : 'text-jv-text-caption',
        )}
      >
        {armed ? ARM_NOTE_ARMED : ARM_NOTE_OFF}
      </p>
    </div>
  )
}
