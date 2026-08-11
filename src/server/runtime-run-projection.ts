// Provider-neutral, read-only projection of the provider runtime registry.
//
// Everything here is pure: no filesystem, no provider process, no service call.
// The projection is an explicit allowlist — records are never spread — so a
// registry row that grows a prompt, transcript, argv, token, or credential
// field can never reach an API response through this module.

import type {
  CapabilityState,
  ProviderRuntimeRecord,
  RuntimeCapability,
  RuntimeKind,
  RuntimeOperation,
} from './provider-runtime-control-plane'

export type RuntimeRunProvider = 'hermes' | 'claude' | 'codex' | 'unknown'
export type RuntimeRunState = 'active' | 'idle' | 'stopped' | 'attention'
export type RuntimeRunOwnershipState = 'free' | 'owned' | 'recoverable' | 'unknown'

export type RuntimeRunCapability = {
  state: CapabilityState
  invokable: boolean
  explanation: string
  deferred?: boolean
}

export type RuntimeRunOwnership = {
  state: RuntimeRunOwnershipState
  owner: string | null
  expiresAt: number | null
  abandoned: boolean
}

export type RuntimeRun = {
  id: string
  source: 'provider-runtime'
  provider: RuntimeRunProvider
  runtimeKind: string
  nativeId: string
  shortId: string
  account: string
  accountKey: string
  route: string | null
  model: string | null
  project: string | null
  worktree: string | null
  cwd: string | null
  title: string
  state: RuntimeRunState
  hostKind: string
  linked: boolean
  kanbanTaskId: string | null
  parentRuntimeId: string | null
  ownership: RuntimeRunOwnership
  capabilities: Record<RuntimeOperation, RuntimeRunCapability>
  createdAt: number
  updatedAt: number
  stalenessMs: number
}

export type RuntimeRunLinkFilter = 'all' | 'linked' | 'unlinked'
export type RuntimeRunFilters = {
  provider?: ReadonlyArray<string>
  account?: ReadonlyArray<string>
  state?: ReadonlyArray<string>
  ownership?: ReadonlyArray<string>
  project?: ReadonlyArray<string>
  linked?: RuntimeRunLinkFilter
  kanbanTaskId?: string
  updatedFrom?: number
  updatedTo?: number
  query?: string
}

export type RuntimeRunSortKey = 'updated' | 'created' | 'staleness' | 'title' | 'project' | 'provider' | 'state'
export type RuntimeRunSortDirection = 'asc' | 'desc'

export type RuntimeRunPage = {
  items: Array<RuntimeRun>
  total: number
  page: number
  pageSize: number
  pages: number
  hasNext: boolean
  hasPrevious: boolean
}

export type RuntimeRunSummary = {
  total: number
  active: number
  idle: number
  stopped: number
  attention: number
  idleResumable: number
  linkedKanban: number
  unlinkedKanban: number
  owned: number
  recoverable: number
  unknownOwnership: number
  stale: number
  byProvider: Record<string, number>
  byState: Record<RuntimeRunState, number>
}

export const RUNTIME_OPERATIONS: ReadonlyArray<RuntimeOperation> = [
  'create', 'resume', 'fork', 'send', 'steer', 'interrupt',
  'status', 'list', 'archive', 'attach', 'discoverPeers', 'crossSessionMessage',
]

export const RUNTIME_RUN_SORT_KEYS: ReadonlyArray<RuntimeRunSortKey> = ['updated', 'created', 'staleness', 'title', 'project', 'provider', 'state']

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
/** Hard ceiling on how many registry rows a single projection pass will read. */
export const MAX_PROJECTED_RUNS = 5_000
export const STALE_AFTER_MS = 15 * 60_000

const MAX_QUERY = 200

// Effective policy, not just the declared matrix: an operation is only invokable
// when Workspace actually owns a verified channel for it today. Codex fork is
// disabled until crash-safe recovery exists; steer and interrupt require a
// persistent app-server connection that Workspace does not own.
const HERMES_SERVICE_UNDISPATCHABLE = ['create', 'resume', 'fork', 'send', 'steer', 'interrupt', 'archive', 'attach', 'discoverPeers', 'crossSessionMessage'] as const
const HERMES_SERVICE_EXPLANATION = 'Not invokable from Runs until the runtime service owns a verified Hermes worker-host dispatch path.'
const NON_INVOKABLE: Partial<Record<RuntimeKind, ReadonlyArray<RuntimeOperation>>> = {
  hermes_profile: HERMES_SERVICE_UNDISPATCHABLE,
  claude_session: ['archive', 'send', 'discoverPeers'],
  codex_thread: ['fork', 'steer', 'interrupt', 'attach'],
}
const NON_INVOKABLE_EXPLANATION: Partial<Record<RuntimeKind, Partial<Record<RuntimeOperation, string>>>> = {
  hermes_profile: Object.fromEntries(
    HERMES_SERVICE_UNDISPATCHABLE.map((operation) => [operation, HERMES_SERVICE_EXPLANATION]),
  ),
  claude_session: {
    archive: 'Archive is not implemented by the isolated Claude runtime adapter.',
    send: 'Send is not implemented by the isolated Claude runtime adapter.',
    discoverPeers: 'Peer discovery is not implemented by the Runs runtime service path.',
  },
  codex_thread: {
    fork: 'Disabled until provider fork identity has crash-safe durable recovery or idempotency.',
    steer: 'Disabled until Workspace owns one persistent Codex app-server connection for the active turn.',
    interrupt: 'Disabled until Workspace owns one persistent Codex app-server connection for the active turn.',
    attach: 'Attach is not implemented by the isolated Codex runtime service path.',
  },
}

const KIND_LABELS: Record<string, string> = {
  hermes_profile: 'Hermes profile',
  claude_session: 'Claude session',
  codex_thread: 'Codex thread',
}
const KIND_PROVIDERS: Record<string, RuntimeRunProvider> = {
  hermes_profile: 'hermes',
  claude_session: 'claude',
  codex_thread: 'codex',
}
const ID_PROVIDERS: Record<string, RuntimeRunProvider> = {
  hermes: 'hermes',
  claude: 'claude',
  codex: 'codex',
}
const STATE_RANK: Record<RuntimeRunState, number> = { attention: 0, active: 1, idle: 2, stopped: 3 }

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const cleaned = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 31 || (code >= 127 && code <= 159) ? ' ' : character
  }).join('').trim()
  return cleaned ? cleaned.slice(0, max) : null
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(numeric)))
}

/**
 * Last path segment for both Windows and POSIX shapes, without touching the
 * filesystem: handles `C:/a/b`, `D:\a\b`, `\\server\share\b`, mixed separators,
 * trailing separators, and bare drive roots (which yield no project name).
 */
export function pathProjectName(value: unknown): string | null {
  const raw = text(value, 1_024)
  if (!raw) return null
  const segments = raw.split(/[\\/]+/).filter((segment) => segment && segment !== '.' && segment !== '..')
  const last = segments.at(-1)
  if (!last || /^[A-Za-z]:$/.test(last)) return null
  return last.slice(0, 80)
}

function providerOf(kind: unknown, runtimeId: string): RuntimeRunProvider {
  if (typeof kind === 'string' && Object.hasOwn(KIND_PROVIDERS, kind)) return KIND_PROVIDERS[kind]
  const prefix = runtimeId.split(':', 1)[0] ?? ''
  return ID_PROVIDERS[prefix] ?? 'unknown'
}

function policyKindOf(kind: unknown, runtimeId: string): RuntimeKind | null {
  if (kind === 'hermes_profile' && runtimeId.startsWith('hermes:')) return kind
  if (kind === 'claude_session' && runtimeId.startsWith('claude:')) return kind
  if (kind === 'codex_thread' && runtimeId.startsWith('codex:')) return kind
  return null
}

function stateOf(hostStatus: unknown): RuntimeRunState {
  if (hostStatus === 'running') return 'active'
  if (hostStatus === 'idle') return 'idle'
  if (hostStatus === 'stopped') return 'stopped'
  return 'attention'
}

function projectOwnership(lease: unknown, now: number): RuntimeRunOwnership {
  if (!lease || typeof lease !== 'object') return { state: 'free', owner: null, expiresAt: null, abandoned: false }
  const raw = lease as Record<string, unknown>
  const owner = text(raw.owner, 120)
  const expiresAt = typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt) ? raw.expiresAt : null
  const abandoned = raw.abandoned === true
  if (abandoned) {
    if (expiresAt !== null && expiresAt <= now) return { state: 'recoverable', owner, expiresAt, abandoned }
    return { state: 'unknown', owner, expiresAt, abandoned }
  }
  if (expiresAt === null || expiresAt <= now) return { state: 'unknown', owner, expiresAt, abandoned }
  return { state: 'owned', owner, expiresAt, abandoned }
}

function projectCapabilities(source: unknown, kind: RuntimeKind | null): Record<RuntimeOperation, RuntimeRunCapability> {
  const declared = (source && typeof source === 'object' ? source : {}) as Record<string, RuntimeCapability | undefined>
  const blocked = new Set<RuntimeOperation>(kind === null
    ? RUNTIME_OPERATIONS.filter((operation) => operation !== 'status' && operation !== 'list')
    : NON_INVOKABLE[kind] ?? [])
  const blockedExplanation = kind === null ? undefined : NON_INVOKABLE_EXPLANATION[kind]
  const result = {} as Record<RuntimeOperation, RuntimeRunCapability>
  for (const operation of RUNTIME_OPERATIONS) {
    const entry = declared[operation]
    const declaredState = entry?.state
    const state: CapabilityState = declaredState === 'supported' || declaredState === 'degraded' || declaredState === 'experimental'
      ? declaredState
      : 'unsupported'
    const explanation = text(entry?.explanation, 400) ?? 'Not exposed by this runtime adapter.'
    result[operation] = blocked.has(operation)
      ? { state: 'unsupported', invokable: false, explanation: kind === null
        ? 'Not invokable because the persisted runtime kind cannot be verified.'
        : blockedExplanation?.[operation] ?? explanation, deferred: true }
      : { state, invokable: state !== 'unsupported', explanation, ...(entry?.deferred === true ? { deferred: true } : {}) }
  }
  return result
}

function projectTitle(kanbanTaskId: string | null, project: string | null, kindLabel: string, shortId: string): string {
  const title = kanbanTaskId && project ? `${kanbanTaskId} · ${project}`
    : kanbanTaskId ? kanbanTaskId
    : project ? `${project} · ${kindLabel}`
    : shortId ? `${kindLabel} · ${shortId}`
    : kindLabel
  return title.slice(0, 160)
}

/** Projects one registry record into a provider-neutral, privacy-safe run. */
export function projectRuntimeRun(record: ProviderRuntimeRecord, now: number = Date.now()): RuntimeRun {
  const raw = record as unknown as Record<string, unknown>
  const id = text(raw.runtimeId, 300) ?? ''
  const kind = text(raw.kind, 64) ?? 'unknown'
  const nativeId = text(raw.externalId, 256) ?? ''
  const project = pathProjectName(raw.worktree) ?? pathProjectName(raw.cwd)
  const worktree = text(raw.worktree, 1_024)
  const cwd = text(raw.cwd, 1_024)
  const kanbanTaskId = text(raw.kanbanTaskId, 64)
  const shortId = nativeId.slice(0, 12)
  const updatedAt = finite(raw.updatedAt)
  const accountKey = text(raw.accountAlias, 120) ?? ''
  const provider = providerOf(raw.kind, id)
  const ownership = projectOwnership(raw.lease, now)
  const projectedState = ownership.state === 'unknown' ? 'attention' : stateOf(raw.hostStatus)
  return {
    id,
    source: 'provider-runtime',
    provider,
    runtimeKind: kind,
    nativeId,
    shortId,
    account: accountKey,
    accountKey,
    route: text(raw.routeRef, 200),
    model: text(raw.model, 200),
    project,
    worktree,
    cwd,
    title: projectTitle(kanbanTaskId, project, KIND_LABELS[kind] ?? 'Provider runtime', shortId),
    state: projectedState,
    hostKind: text(raw.hostKind, 32) ?? 'unknown',
    linked: Boolean(kanbanTaskId),
    kanbanTaskId,
    parentRuntimeId: text(raw.parentRuntimeId, 300),
    ownership,
    capabilities: projectCapabilities(raw.capabilities, policyKindOf(raw.kind, id)),
    createdAt: finite(raw.createdAt),
    updatedAt,
    stalenessMs: Math.max(0, now - updatedAt),
  }
}

/** Projects a bounded slice of the registry; never reads more than MAX_PROJECTED_RUNS rows. */
export function projectRuntimeRuns(records: unknown, now: number = Date.now(), limit: number = MAX_PROJECTED_RUNS): Array<RuntimeRun> {
  if (!Array.isArray(records)) return []
  const bounded = clampInt(limit, 0, MAX_PROJECTED_RUNS, MAX_PROJECTED_RUNS)
  return records.slice(0, bounded).map((record) => projectRuntimeRun(record as ProviderRuntimeRecord, now))
}

function normalizeSet(values: ReadonlyArray<string> | undefined): Set<string> | null {
  if (!Array.isArray(values)) return null
  const normalized = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return normalized.length ? new Set(normalized) : null
}

function haystack(run: RuntimeRun): string {
  return [run.id, run.title, run.nativeId, run.account, run.project, run.kanbanTaskId, run.provider, run.model, run.route, run.runtimeKind]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/** Applies every provided filter with AND semantics; absent or empty filters do not constrain. */
export function filterRuntimeRuns(runs: ReadonlyArray<RuntimeRun>, filters: RuntimeRunFilters = {}): Array<RuntimeRun> {
  const providers = normalizeSet(filters.provider)
  const accounts = normalizeSet(filters.account)
  const states = normalizeSet(filters.state)
  const ownerships = normalizeSet(filters.ownership)
  const projects = normalizeSet(filters.project)
  const linked = filters.linked ?? 'all'
  const kanbanTaskId = typeof filters.kanbanTaskId === 'string' ? filters.kanbanTaskId.trim().toLowerCase() : ''
  const updatedFrom = typeof filters.updatedFrom === 'number' && Number.isFinite(filters.updatedFrom) ? filters.updatedFrom : null
  const updatedTo = typeof filters.updatedTo === 'number' && Number.isFinite(filters.updatedTo) ? filters.updatedTo : null
  const query = typeof filters.query === 'string' ? filters.query.trim().slice(0, MAX_QUERY).toLowerCase() : ''
  return runs.filter((run) => {
    if (providers && !providers.has(run.provider)) return false
    if (accounts && !accounts.has(run.account.toLowerCase())) return false
    if (states && !states.has(run.state)) return false
    if (ownerships && !ownerships.has(run.ownership.state)) return false
    if (projects && !projects.has((run.project ?? '').toLowerCase())) return false
    if (linked === 'linked' && !run.linked) return false
    if (linked === 'unlinked' && run.linked) return false
    if (kanbanTaskId && (run.kanbanTaskId ?? '').toLowerCase() !== kanbanTaskId) return false
    if (updatedFrom !== null && run.updatedAt < updatedFrom) return false
    if (updatedTo !== null && run.updatedAt > updatedTo) return false
    if (query && !haystack(run).includes(query)) return false
    return true
  })
}

function compare(a: RuntimeRun, b: RuntimeRun, key: RuntimeRunSortKey): number {
  switch (key) {
    case 'created': return a.createdAt - b.createdAt
    case 'staleness': return a.stalenessMs - b.stalenessMs
    case 'title': return a.title.localeCompare(b.title)
    case 'project': return (a.project ?? '').localeCompare(b.project ?? '')
    case 'provider': return a.provider.localeCompare(b.provider)
    case 'state': return STATE_RANK[a.state] - STATE_RANK[b.state]
    default: return a.updatedAt - b.updatedAt
  }
}

/**
 * Total order: the requested key and direction, then always the runtime ID
 * ascending, so equal keys never reorder between requests.
 */
export function sortRuntimeRuns(
  runs: ReadonlyArray<RuntimeRun>,
  key: RuntimeRunSortKey = 'updated',
  direction: RuntimeRunSortDirection = 'desc',
): Array<RuntimeRun> {
  const sortKey = RUNTIME_RUN_SORT_KEYS.includes(key) ? key : 'updated'
  const factor = direction === 'asc' ? 1 : -1
  return [...runs].sort((a, b) => {
    const primary = compare(a, b, sortKey) * factor
    return primary !== 0 ? primary : a.id.localeCompare(b.id)
  })
}

/** Clamps the page window into range so an out-of-bounds request still returns a real page. */
export function paginateRuntimeRuns(
  runs: ReadonlyArray<RuntimeRun>,
  page: unknown = 1,
  pageSize: unknown = DEFAULT_PAGE_SIZE,
): RuntimeRunPage {
  const total = runs.length
  const size = clampInt(pageSize, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE)
  const pages = Math.max(1, Math.ceil(total / size))
  const number = clampInt(page, 1, pages, 1)
  const start = (number - 1) * size
  return {
    items: runs.slice(start, start + size),
    total,
    page: number,
    pageSize: size,
    pages,
    hasNext: number < pages,
    hasPrevious: number > 1,
  }
}

/** Counts only what is in `runs` — the summary never claims more than it was given. */
export function summarizeRuntimeRuns(runs: ReadonlyArray<RuntimeRun>, now: number = Date.now()): RuntimeRunSummary {
  const byState: Record<RuntimeRunState, number> = { active: 0, idle: 0, stopped: 0, attention: 0 }
  const byProvider: Record<string, number> = {}
  let linkedKanban = 0
  let owned = 0
  let recoverable = 0
  let unknownOwnership = 0
  let stale = 0
  for (const run of runs) {
    byState[run.state] += 1
    byProvider[run.provider] = (byProvider[run.provider] ?? 0) + 1
    if (run.linked) linkedKanban += 1
    if (run.ownership.state === 'owned') owned += 1
    if (run.ownership.state === 'recoverable') recoverable += 1
    if (run.ownership.state === 'unknown') unknownOwnership += 1
    if (now - run.updatedAt >= STALE_AFTER_MS) stale += 1
  }
  return {
    total: runs.length,
    active: byState.active,
    idle: byState.idle,
    stopped: byState.stopped,
    attention: byState.attention,
    idleResumable: byState.idle + byState.stopped,
    linkedKanban,
    unlinkedKanban: runs.length - linkedKanban,
    owned,
    recoverable,
    unknownOwnership,
    stale,
    byProvider,
    byState,
  }
}
