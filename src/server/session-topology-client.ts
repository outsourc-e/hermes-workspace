const TOPOLOGY_PATH = '/v1/session-topology'
const DEFAULT_PAGE_SIZE = 500
const DEFAULT_MAX_ROWS = 50_000
const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_RETRY_BACKOFF_MS = 100
const MAX_BUSY_RETRIES = 2
const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const RELATIONSHIPS = new Set<SessionTopologyRelationship>([
  'root',
  'continuation',
  'branch',
  'delegate',
  'child',
  'orphan',
])
const RESPONSE_KEYS = new Set(['sessions', 'snapshot', 'next_cursor'])
const SESSION_KEYS = new Set([
  'id',
  'parent_session_id',
  'source',
  'started_at',
  'ended_at',
  'end_reason',
  'archived',
  'relationship',
])

export type SessionTopologyRelationship =
  | 'root'
  | 'continuation'
  | 'branch'
  | 'delegate'
  | 'child'
  | 'orphan'

export type SessionTopologyTimestamp = string | number

export type SessionTopologySession = {
  id: string
  parent_session_id: string | null
  source: string
  started_at: SessionTopologyTimestamp
  ended_at: SessionTopologyTimestamp | null
  end_reason: string | null
  archived: boolean
  relationship: SessionTopologyRelationship
}

export type SessionTopologySnapshot = {
  sessions: Array<SessionTopologySession>
  snapshot: string
}

export type SessionTopologySource = {
  listAll: () => Promise<SessionTopologySnapshot>
  invalidate: () => void
}

type SessionTopologyPage = SessionTopologySnapshot & {
  nextCursor: string | null
}

type SessionTopologyClientOptions = {
  baseUrl: string | undefined
  token: string | undefined
  fetch?: typeof fetch
  pageSize?: number
  maxRows?: number
  timeoutMs?: number
  retryBackoffMs?: number
  profile?: string
}

export class SessionTopologyUnavailableError extends Error {
  constructor() {
    super('Session topology is unavailable.')
    this.name = 'SessionTopologyUnavailableError'
  }
}

function unavailable(): never {
  throw new SessionTopologyUnavailableError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.size && keys.every((key) => expected.has(key))
}

function isExactNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function isTimestamp(value: unknown): value is SessionTopologyTimestamp {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    !Number.isNaN(value)
  ) {
    return true
  }
  return isExactNonemptyString(value) && Number.isFinite(Date.parse(value))
}

function parseSession(value: unknown): SessionTopologySession {
  if (!isRecord(value) || !hasExactKeys(value, SESSION_KEYS)) unavailable()
  if (
    !isExactNonemptyString(value.id) ||
    !isExactNonemptyString(value.source) ||
    !isTimestamp(value.started_at) ||
    typeof value.archived !== 'boolean' ||
    typeof value.relationship !== 'string' ||
    !RELATIONSHIPS.has(value.relationship as SessionTopologyRelationship)
  ) {
    unavailable()
  }

  const parent = value.parent_session_id
  const relationship = value.relationship as SessionTopologyRelationship
  const parentless = relationship === 'root' || relationship === 'orphan'
  if (
    (parent !== null && !isExactNonemptyString(parent)) ||
    (parentless && parent !== null) ||
    (!parentless && !isExactNonemptyString(parent))
  ) {
    unavailable()
  }

  const endedAt = value.ended_at
  const endReason = value.end_reason
  if (
    (endedAt !== null && !isTimestamp(endedAt)) ||
    (endReason !== null && !isExactNonemptyString(endReason)) ||
    (endedAt === null) !== (endReason === null)
  ) {
    unavailable()
  }

  return {
    id: value.id,
    parent_session_id: parent,
    source: value.source,
    started_at: value.started_at,
    ended_at: endedAt,
    end_reason: endReason,
    archived: value.archived,
    relationship,
  }
}

function parsePage(value: unknown): SessionTopologyPage {
  if (!isRecord(value) || !hasExactKeys(value, RESPONSE_KEYS)) unavailable()
  if (
    !Array.isArray(value.sessions) ||
    !isExactNonemptyString(value.snapshot) ||
    (value.next_cursor !== null && !isExactNonemptyString(value.next_cursor))
  ) {
    unavailable()
  }
  return {
    sessions: value.sessions.map(parseSession),
    snapshot: value.snapshot,
    nextCursor: value.next_cursor,
  }
}

function timestampMilliseconds(value: SessionTopologyTimestamp): number {
  return typeof value === 'number' ? value * 1000 : Date.parse(value)
}

function validateAggregate(sessions: Array<SessionTopologySession>): void {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  if (byId.size !== sessions.length) unavailable()
  const continuationChildByParent = new Map<string, string>()

  for (const session of sessions) {
    if (
      session.ended_at !== null &&
      timestampMilliseconds(session.ended_at) <
        timestampMilliseconds(session.started_at)
    ) {
      unavailable()
    }
    const parentId = session.parent_session_id
    if (parentId === null) continue
    const parent = byId.get(parentId)
    if (!parent || parent.id === session.id) unavailable()
    if (
      session.relationship !== 'delegate' &&
      session.source !== parent.source
    ) {
      unavailable()
    }
    if (session.relationship === 'continuation') {
      if (
        parent.end_reason !== 'compression' ||
        continuationChildByParent.has(parentId)
      ) {
        unavailable()
      }
      continuationChildByParent.set(parentId, session.id)
    }

    const visited = new Set([session.id])
    let current: SessionTopologySession | undefined = session
    while (current.parent_session_id) {
      if (visited.has(current.parent_session_id)) unavailable()
      visited.add(current.parent_session_id)
      current = byId.get(current.parent_session_id)
      if (!current) unavailable()
    }
  }
}

function endpointFromBase(baseUrl: string | undefined): URL {
  if (!isExactNonemptyString(baseUrl)) unavailable()
  let base: URL
  try {
    base = new URL(baseUrl)
  } catch {
    unavailable()
  }
  if (
    (base.protocol !== 'http:' && base.protocol !== 'https:') ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash
  ) {
    unavailable()
  }
  return new URL(TOPOLOGY_PATH, base.origin)
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? Math.min(Number(value), maximum)
    : fallback
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class SessionTopologyClient implements SessionTopologySource {
  private readonly baseUrl: string | undefined
  private readonly token: string | undefined
  private readonly fetchImpl: typeof fetch
  private readonly pageSize: number
  private readonly maxRows: number
  private readonly timeoutMs: number
  private readonly retryBackoffMs: number
  private readonly profile: string | undefined
  private generation = 0
  private inFlight:
    | { generation: number; promise: Promise<SessionTopologySnapshot> }
    | undefined

  constructor(options: SessionTopologyClientOptions) {
    this.baseUrl = options.baseUrl
    this.token = options.token
    this.fetchImpl = options.fetch ?? fetch
    this.pageSize = positiveInteger(
      options.pageSize,
      DEFAULT_PAGE_SIZE,
      DEFAULT_PAGE_SIZE,
    )
    this.maxRows = positiveInteger(
      options.maxRows,
      DEFAULT_MAX_ROWS,
      DEFAULT_MAX_ROWS,
    )
    this.timeoutMs = positiveInteger(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      60_000,
    )
    this.retryBackoffMs = positiveInteger(
      options.retryBackoffMs,
      DEFAULT_RETRY_BACKOFF_MS,
      1_000,
    )
    this.profile = options.profile
  }

  listAll(): Promise<SessionTopologySnapshot> {
    if (this.inFlight?.generation === this.generation) {
      return this.inFlight.promise
    }
    const generation = this.generation
    const promise = this.collect().finally(() => {
      if (
        this.inFlight?.generation === generation &&
        this.inFlight.promise === promise
      ) {
        this.inFlight = undefined
      }
    })
    this.inFlight = { generation, promise }
    return promise
  }

  invalidate(): void {
    this.generation += 1
    this.inFlight = undefined
  }

  private async fetchPage(url: string): Promise<SessionTopologyPage> {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await this.fetchImpl(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${this.token}`,
          },
          signal: controller.signal,
        })
        if (response.status === 503) {
          if (attempt >= MAX_BUSY_RETRIES) unavailable()
        } else {
          if (
            !response.ok ||
            !response.headers
              .get('content-type')
              ?.toLowerCase()
              .startsWith('application/json')
          ) {
            unavailable()
          }
          return parsePage(await response.json())
        }
      } finally {
        clearTimeout(timeout)
      }

      await delay(this.retryBackoffMs * 2 ** attempt)
    }
  }

  private async collect(): Promise<SessionTopologySnapshot> {
    try {
      const endpoint = endpointFromBase(this.baseUrl)
      if (!isExactNonemptyString(this.token)) unavailable()
      if (this.profile !== undefined && !PROFILE_PATTERN.test(this.profile)) {
        unavailable()
      }

      const sessions: Array<SessionTopologySession> = []
      const seenIds = new Set<string>()
      const seenCursors = new Set<string>()
      let expectedSnapshot: string | undefined
      let cursor: string | undefined

      for (;;) {
        endpoint.search = ''
        endpoint.searchParams.set('limit', String(this.pageSize))
        if (this.profile !== undefined) {
          endpoint.searchParams.set('profile', this.profile)
        }
        if (cursor !== undefined) {
          endpoint.searchParams.set('cursor', cursor)
          endpoint.searchParams.set('snapshot', expectedSnapshot!)
        }

        const page = await this.fetchPage(endpoint.toString())
        if (expectedSnapshot === undefined) {
          expectedSnapshot = page.snapshot
        } else if (page.snapshot !== expectedSnapshot) {
          unavailable()
        }

        if (page.sessions.length > this.pageSize) unavailable()
        for (const session of page.sessions) {
          if (seenIds.has(session.id) || sessions.length >= this.maxRows) {
            unavailable()
          }
          seenIds.add(session.id)
          sessions.push(session)
        }

        if (page.nextCursor === null) break
        if (
          page.sessions.length === 0 ||
          seenCursors.has(page.nextCursor) ||
          sessions.length >= this.maxRows
        ) {
          unavailable()
        }
        seenCursors.add(page.nextCursor)
        cursor = page.nextCursor
      }

      validateAggregate(sessions)
      return { sessions, snapshot: expectedSnapshot }
    } catch (error) {
      if (error instanceof SessionTopologyUnavailableError) throw error
      throw new SessionTopologyUnavailableError()
    }
  }
}

export function createSessionTopologyClientFromEnv(): SessionTopologyClient {
  return new SessionTopologyClient({
    baseUrl: process.env.SESSION_TOPOLOGY_ADAPTER_URL,
    token: process.env.SESSION_TOPOLOGY_ADAPTER_TOKEN,
  })
}
