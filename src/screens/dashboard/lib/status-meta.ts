/**
 * Canonical status tones for every dashboard status literal in use
 * across live-systems-card, agent-lanes-card, nova-session-bridge-card,
 * agent-workforce-card, and control-loops-card.
 *
 * Bucketed per the binding spec: healthy = gold (--theme-success),
 * attention/needs-Taylor = amber (--theme-warning), danger = warm
 * red-amber (--theme-danger), inert = navy-muted (--theme-muted).
 * Distinction is by color family + the caller's own dot/pill shape —
 * never by green.
 */
export type DashboardStatusLiteral =
  | 'operational'
  | 'connected'
  | 'reachable'
  | 'approval-gated'
  | 'degraded'
  | 'offline'
  | 'not-wired'
  | 'active'
  | 'idle'
  | 'setup-needed'
  | 'unknown'
  | 'ready'
  | 'partial'

export type StatusTone = {
  label: string
  dot: string
  tone: string
}

type ToneFamily = 'success' | 'warning' | 'danger' | 'muted'

const FAMILY: Record<DashboardStatusLiteral, ToneFamily> = {
  operational: 'success',
  connected: 'success',
  active: 'success',
  ready: 'success',
  reachable: 'warning',
  'approval-gated': 'warning',
  degraded: 'warning',
  'setup-needed': 'warning',
  partial: 'warning',
  offline: 'danger',
  'not-wired': 'muted',
  idle: 'muted',
  unknown: 'muted',
}

const LABEL_OVERRIDE: Partial<Record<DashboardStatusLiteral, string>> = {
  'approval-gated': 'needs Taylor',
  'not-wired': 'not wired',
  'setup-needed': 'setup needed',
}

const FAMILY_VAR: Record<ToneFamily, string> = {
  success: '--theme-success',
  warning: '--theme-warning',
  danger: '--theme-danger',
  muted: '--theme-muted',
}

function toneClasses(family: ToneFamily): { dot: string; tone: string } {
  const varName = FAMILY_VAR[family]
  return {
    dot: `bg-[var(${varName})]`,
    tone: `border-[color-mix(in_srgb,var(${varName})_35%,var(--theme-border))] text-[var(${varName})]`,
  }
}

/**
 * Resolve a dashboard status literal to its label/dot/tone classes.
 * Unknown strings fall back to the `muted` family rather than throwing,
 * since status enums are sourced from server payloads.
 */
export function STATUS_TONE(status: string): StatusTone {
  const known = status as DashboardStatusLiteral
  const family = FAMILY[known] ?? 'muted'
  const classes = toneClasses(family)
  return {
    label: LABEL_OVERRIDE[known] ?? status,
    dot: classes.dot,
    tone: classes.tone,
  }
}
