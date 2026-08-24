/**
 * Verification badge — VERIFIED vs CLAIMED · UNVERIFIED.
 *
 * The honest distinction the product is built on: evidence attached, or the
 * agent's word only. This component renders whichever state it is handed and
 * decides nothing — there is no verification logic here (see
 * `docs/design/jarvis-ui-mapping.md` §3.5, item 2).
 *
 * Token discipline: no raw colour, size, or px value in this file. The claimed
 * card's hatch fill derives its tint from `--jv-blocked` via `color-mix`, so
 * the amber is still written down exactly once, in the token layer.
 */
/*
 * NOTE: these components use `clsx` directly rather than the repo's `cn()`
 * helper. `cn()` runs tailwind-merge, which does not know the `jv-*` scale and
 * classifies `text-jv-3xs` (a font size) into the same conflict group as
 * `text-jv-verified` (a colour) — so the size gets silently dropped whenever a
 * colour appears alongside it. No class set below relies on conflict
 * resolution, so plain `clsx` is both correct and lossless here.
 */
import { clsx } from 'clsx'
import type { VerificationBadgeProps } from './types'

/** 135° hatch over the claimed card — the artboard's "unverified" texture. */
const CLAIMED_HATCH =
  'repeating-linear-gradient(135deg, transparent 0 var(--jv-space-6), color-mix(in srgb, var(--jv-blocked) 5%, transparent) var(--jv-space-6) var(--jv-space-7))'

const LABEL_CLASS =
  'font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-wide-2'

export function VerificationBadge({
  state,
  title,
  evidence,
  time,
  actions,
}: VerificationBadgeProps) {
  const verified = state === 'verified'

  return (
    <div
      data-jv-verification={state}
      className={clsx(
        'px-jv-10 py-jv-7 border',
        verified
          ? 'border-solid border-jv-verified-line bg-jv-verified-bg'
          : 'border-dashed border-jv-claimed-line',
      )}
      style={verified ? undefined : { background: CLAIMED_HATCH }}
    >
      <div className="flex items-center gap-jv-7">
        <span
          className={clsx(
            LABEL_CLASS,
            verified ? 'text-jv-verified' : 'text-jv-claimed-text',
          )}
        >
          {verified ? 'VERIFIED' : 'CLAIMED · UNVERIFIED'}
        </span>
        {time ? (
          <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-faint">
            {time}
          </span>
        ) : null}
      </div>

      <div
        className={clsx(
          'mt-jv-6 font-jv-sans text-jv-xl leading-jv-relaxed',
          verified ? 'text-jv-text-evidence' : 'text-jv-text-dim-2',
        )}
      >
        {title}
      </div>

      {evidence && evidence.length > 0 ? (
        <div className="mt-jv-6 font-jv-mono text-jv-base leading-jv-loose text-jv-text-detail">
          {evidence.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      ) : null}

      {actions && actions.length > 0 ? (
        <div className="mt-jv-7 flex gap-jv-6">
          {actions.map((action, index) => (
            <span
              key={action}
              className={clsx(
                'px-jv-8 py-jv-4 font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-label-2',
                index === 0
                  ? 'bg-jv-claimed-text text-jv-surface-1'
                  : 'border border-jv-border-btn text-jv-text-dim-2',
              )}
            >
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
