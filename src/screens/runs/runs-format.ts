// Display helpers for the Runs screen. Durations are formatted from the
// server-supplied staleness so the age shown never depends on client clock
// skew against the machine that projected the inventory.

import type { RuntimeRun, RuntimeRunState } from '@/server/runtime-run-projection'

export const EM_DASH = '—'

export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return EM_DASH
  const seconds = Math.floor(ms / 1000)
  if (seconds < 45) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function formatTimestamp(ms: number | null): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return EM_DASH
  return new Date(ms).toLocaleString()
}

export function formatCount(value: number): string {
  return Number.isFinite(value) ? new Intl.NumberFormat().format(value) : EM_DASH
}

export function pluralRuns(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'run' : 'runs'}`
}

const PROVIDER_LABELS: Record<string, string> = {
  hermes: 'Hermes',
  claude: 'Claude',
  codex: 'Codex',
  unknown: 'Unknown',
}

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

const STATE_LABELS: Record<RuntimeRunState, string> = {
  active: 'Active',
  idle: 'Idle',
  stopped: 'Stopped',
  attention: 'Attention',
}

export function stateLabel(state: RuntimeRunState): string {
  return STATE_LABELS[state]
}

const OWNERSHIP_LABELS: Record<string, string> = {
  free: 'No writer lease',
  owned: 'Leased',
  recoverable: 'Lease recoverable',
  unknown: 'Lease unverified',
}

export function ownershipLabel(state: string): string {
  return OWNERSHIP_LABELS[state] ?? state
}

/** Last two path segments — enough to tell worktrees apart without the full path. */
export function shortPath(value: string | null): string {
  if (!value) return EM_DASH
  const segments = value.split(/[\\/]+/).filter(Boolean)
  return segments.length <= 2 ? value : `…/${segments.slice(-2).join('/')}`
}

export function routeLabel(run: RuntimeRun): string {
  return run.model || run.route || EM_DASH
}
