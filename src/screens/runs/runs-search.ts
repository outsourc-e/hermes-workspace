// URL state for the Runs screen.
//
// The URL carries filters and one selected run ID — never prompt text, never
// action payloads, never provider credentials. Everything here is pure so the
// request key can be derived during render without touching the clock.

import type {
  RuntimeRunSortDirection,
  RuntimeRunSortKey,
} from '@/server/runtime-run-projection'

export type RunsView = 'active' | 'recent' | 'attention' | 'archived'
export type RunsKanbanFilter = 'all' | 'linked' | 'unlinked'
export type RunsWindow = '1h' | '24h' | '7d' | '30d' | 'all'
export type RunsPageSize = 25 | 50 | 100

/** Mirrors the validated search schema of the `/runs` route. */
export type RunsSearch = {
  q?: string
  view?: RunsView
  provider?: string
  account?: string
  state?: string
  ownership?: string
  project?: string
  kanban?: RunsKanbanFilter
  task?: string
  window?: RunsWindow
  from?: string
  to?: string
  sort?: RuntimeRunSortKey
  direction?: RuntimeRunSortDirection
  page?: number
  size?: RunsPageSize
  run?: string
}

export const RUNS_VIEWS: ReadonlyArray<{ id: RunsView; label: string; hint: string }> = [
  { id: 'active', label: 'Active', hint: 'Runs a provider reports as running right now.' },
  { id: 'recent', label: 'Recent', hint: 'Every discovered run, newest activity first.' },
  { id: 'attention', label: 'Attention', hint: 'Runs whose host or ownership state cannot be trusted.' },
  { id: 'archived', label: 'Archived', hint: 'Needs durable archive metadata the registry does not record yet.' },
]

/** Views that are presets over the state filter rather than separate inventories. */
const VIEW_STATE: Partial<Record<RunsView, string>> = { active: 'active', attention: 'attention' }

export const RUNS_STATES = ['active', 'idle', 'stopped', 'attention'] as const
export const RUNS_PROVIDERS = ['hermes', 'claude', 'codex', 'unknown'] as const
export const RUNS_OWNERSHIPS = ['free', 'owned', 'recoverable', 'unknown'] as const
export const RUNS_PAGE_SIZES: ReadonlyArray<RunsPageSize> = [25, 50, 100]

export const RUNS_WINDOWS: ReadonlyArray<{ id: RunsWindow; label: string }> = [
  { id: 'all', label: 'Any time' },
  { id: '1h', label: 'Last hour' },
  { id: '24h', label: 'Last 24 hours' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
]

const WINDOW_MS: Record<Exclude<RunsWindow, 'all'>, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
}

const SORT_KEYS: ReadonlyArray<RuntimeRunSortKey> = ['updated', 'created', 'staleness', 'title', 'project', 'provider', 'state']

const MAX_TEXT = 200
const MAX_PAGE = 10_000

function bounded(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, max)
  return trimmed || undefined
}

function boundedIdentity(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed && trimmed.length <= max ? trimmed : undefined
}

function oneOf<T extends string>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  return typeof value === 'string' && (allowed as ReadonlyArray<string>).includes(value) ? (value as T) : fallback
}

export function normalizeView(value: unknown): RunsView {
  return oneOf(value, ['active', 'recent', 'attention', 'archived'] as const, 'recent')
}

export function normalizeKanban(value: unknown): RunsKanbanFilter {
  return oneOf(value, ['all', 'linked', 'unlinked'] as const, 'all')
}

export function normalizeWindow(value: unknown): RunsWindow {
  return oneOf(value, ['1h', '24h', '7d', '30d', 'all'] as const, 'all')
}

export function normalizeSort(value: unknown): RuntimeRunSortKey {
  return oneOf(value, SORT_KEYS, 'updated')
}

export function normalizeDirection(value: unknown): RuntimeRunSortDirection {
  return oneOf(value, ['asc', 'desc'] as const, 'desc')
}

export function normalizePage(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 1
  return Math.min(MAX_PAGE, Math.max(1, Math.trunc(numeric)))
}

export function normalizeSize(value: unknown): RunsPageSize {
  const numeric = typeof value === 'number' ? value : Number(value)
  return RUNS_PAGE_SIZES.includes(numeric as RunsPageSize) ? (numeric as RunsPageSize) : 25
}

/** The state the grid is actually filtered by: the view wins over the raw param. */
export function effectiveState(search: RunsSearch): string | undefined {
  const view = normalizeView(search.view)
  return VIEW_STATE[view] ?? bounded(search.state, 120)
}

/** True when the view is backed by real inventory rather than a deferred feature. */
export function viewHasInventory(view: RunsView): boolean {
  return view !== 'archived'
}

/**
 * Builds the `/api/runtime-runs` query. `now` is passed in rather than read so
 * the caller controls when the relative date window resolves — a value read
 * during render would change on every pass and re-trigger the load effect.
 */
export function runsQueryString(search: RunsSearch, now: number): string {
  const params = new URLSearchParams()
  const set = (name: string, value: string | undefined) => {
    if (value) params.set(name, value)
  }
  set('q', bounded(search.q))
  set('provider', bounded(search.provider, 120))
  set('account', bounded(search.account))
  set('state', effectiveState(search))
  set('ownership', bounded(search.ownership, 120))
  set('project', bounded(search.project))
  set('task', bounded(search.task))
  const kanban = normalizeKanban(search.kanban)
  if (kanban !== 'all') params.set('kanban', kanban)
  const window = normalizeWindow(search.window)
  if (window === 'all') {
    set('from', bounded(search.from, 40))
    set('to', bounded(search.to, 40))
  } else {
    params.set('from', String(Math.max(0, now - WINDOW_MS[window])))
  }
  set('run', boundedIdentity(search.run, 300))
  params.set('sort', normalizeSort(search.sort))
  params.set('direction', normalizeDirection(search.direction))
  params.set('page', String(normalizePage(search.page)))
  params.set('size', String(normalizeSize(search.size)))
  return params.toString()
}

/** Stable identity of the complete metadata request, including a bounded deep-link ID. */
export function runsRequestKey(search: RunsSearch): string {
  return JSON.stringify([
    boundedIdentity(search.run, 300) ?? '',
    bounded(search.q) ?? '',
    bounded(search.provider, 120) ?? '',
    bounded(search.account) ?? '',
    effectiveState(search) ?? '',
    bounded(search.ownership, 120) ?? '',
    bounded(search.project) ?? '',
    bounded(search.task) ?? '',
    normalizeKanban(search.kanban),
    normalizeWindow(search.window),
    bounded(search.from, 40) ?? '',
    bounded(search.to, 40) ?? '',
    normalizeSort(search.sort),
    normalizeDirection(search.direction),
    normalizePage(search.page),
    normalizeSize(search.size),
  ])
}

/** True when anything narrows the inventory beyond the current view preset. */
export function hasActiveFilters(search: RunsSearch): boolean {
  return Boolean(
    bounded(search.q) ||
    bounded(search.provider, 120) ||
    bounded(search.account) ||
    bounded(search.state, 120) ||
    bounded(search.ownership, 120) ||
    bounded(search.project) ||
    bounded(search.task) ||
    normalizeKanban(search.kanban) !== 'all' ||
    normalizeWindow(search.window) !== 'all' ||
    bounded(search.from, 40) ||
    bounded(search.to, 40),
  )
}

/** Every filter cleared; the view, sort, and page size are presentation, not filters. */
export const CLEARED_FILTERS: RunsSearch = {
  q: undefined,
  provider: undefined,
  account: undefined,
  state: undefined,
  ownership: undefined,
  project: undefined,
  task: undefined,
  kanban: 'all',
  window: 'all',
  from: undefined,
  to: undefined,
  page: 1,
}
