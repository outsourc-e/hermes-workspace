/**
 * Epistemic mark — the KN / RC / AS inline claim marker.
 *
 * The product's core idea: every claim carries how it is known. The underline
 * STYLE is part of the semantics (solid = Known, dotted = Recalled, dashed =
 * Assumed) and is itself a token (`--jv-<kind>-rule-style`), so the binding
 * lives in `src/jarvis-theme.css` and cannot drift here.
 *
 * Token discipline: no raw colour, size, or px value in this file.
 */
import type { EpistemicMarkKind, EpistemicMarkProps } from './types'

interface MarkTokens {
  /** `border-bottom` shorthand: width, style token, colour token. */
  rule: string
  /** Superscript colour token. */
  sup: string
  /** Optional body-text colour token (the artboard dims Assumed claims). */
  text?: string
  tag: string
}

const MARKS: Record<EpistemicMarkKind, MarkTokens> = {
  known: {
    rule: 'var(--jv-space-1) var(--jv-known-rule-style) var(--jv-known-rule)',
    sup: 'var(--jv-known-sup)',
    tag: 'KN',
  },
  recalled: {
    rule: 'var(--jv-space-1) var(--jv-recalled-rule-style) var(--jv-recalled-rule)',
    sup: 'var(--jv-recalled-sup)',
    tag: 'RC',
  },
  assumed: {
    rule: 'var(--jv-space-1) var(--jv-assumed-rule-style) var(--jv-assumed-rule)',
    sup: 'var(--jv-assumed-sup)',
    text: 'var(--jv-text-dim)',
    tag: 'AS',
  },
}

export function EpistemicMark({ mark, children }: EpistemicMarkProps) {
  const tokens = MARKS[mark]

  return (
    <>
      <span
        data-jv-mark={mark}
        style={{ borderBottom: tokens.rule, color: tokens.text }}
      >
        {children}
      </span>
      <sup
        aria-label={mark}
        className="ml-jv-3 align-[var(--jv-space-3)] font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wide"
        style={{ color: tokens.sup }}
      >
        {tokens.tag}
      </sup>
    </>
  )
}
