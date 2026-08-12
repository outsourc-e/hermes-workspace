import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = join(process.cwd(), '.runtime')
const SESSIONS_FILE = join(DATA_DIR, 'local-sessions.json')
const MAX_HOT_MESSAGES_PER_SESSION = 500
const MAX_RETAINED_MESSAGES_PER_SESSION = 5_000

export type LocalSession = {
  id: string
  /** Explicit remote identity when this row is a portable cache of that session. */
  upstreamSessionId?: string
  title: string | null
  model: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

export type LocalMessage = {
  id: string
  role: string
  content: string
  timestamp: number
  toolCalls?: unknown
  toolCallId?: string
  toolName?: string
}

type LocalHistoryState = {
  generation: number
  truncated: boolean
}

export type LocalMessagesResult = {
  messages: Array<LocalMessage>
  source: 'local'
  generation: number
  truncated: boolean
  snapshot: string
}

type StoreData = {
  sessions: Partial<Record<string, LocalSession>>
  /** Older retained rows, ordered before the bounded hot message window. */
  archive: Record<string, Array<LocalMessage>>
  messages: Record<string, Array<LocalMessage>>
  history: Record<string, LocalHistoryState>
}

let store: StoreData = { sessions: {}, archive: {}, messages: {}, history: {} }

function loadFromDisk(): void {
  try {
    if (existsSync(SESSIONS_FILE)) {
      const raw = readFileSync(SESSIONS_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed as Partial<StoreData>
        if (
          candidate.sessions &&
          typeof candidate.sessions === 'object' &&
          candidate.messages &&
          typeof candidate.messages === 'object'
        ) {
          const persistedMessages = candidate.messages
          const persistedArchive =
            candidate.archive && typeof candidate.archive === 'object'
              ? candidate.archive
              : {}
          const persistedHistory =
            candidate.history && typeof candidate.history === 'object'
              ? candidate.history
              : {}
          const archive: StoreData['archive'] = {}
          const messages: StoreData['messages'] = {}
          const history: StoreData['history'] = {}
          const sessionIds = new Set([
            ...Object.keys(persistedMessages),
            ...Object.keys(persistedArchive),
          ])
          for (const sessionId of sessionIds) {
            const hotMessages = Array.isArray(persistedMessages[sessionId])
              ? persistedMessages[sessionId]
              : []
            const archivedMessages = Array.isArray(persistedArchive[sessionId])
              ? persistedArchive[sessionId]
              : []
            const allRetained = [...archivedMessages, ...hotMessages]
            const exceededRetentionLimit =
              allRetained.length > MAX_RETAINED_MESSAGES_PER_SESSION
            const retainedMessages = exceededRetentionLimit
              ? allRetained.slice(-MAX_RETAINED_MESSAGES_PER_SESSION)
              : allRetained
            const hotStart = Math.max(
              0,
              retainedMessages.length - MAX_HOT_MESSAGES_PER_SESSION,
            )
            archive[sessionId] = retainedMessages.slice(0, hotStart)
            messages[sessionId] = retainedMessages.slice(hotStart)
            const persisted = persistedHistory[sessionId]
            const hasValidPersistedHistory = Boolean(
              persisted &&
              Number.isSafeInteger(persisted.generation) &&
              persisted.generation >= 0 &&
              typeof persisted.truncated === 'boolean',
            )
            history[sessionId] = {
              generation: hasValidPersistedHistory
                ? Math.max(persisted!.generation, allRetained.length)
                : allRetained.length,
              // A legacy full hot window cannot prove that no older row was
              // evicted. Preserve every row but migrate it fail-closed.
              truncated:
                exceededRetentionLimit ||
                (hasValidPersistedHistory
                  ? persisted!.truncated
                  : archivedMessages.length === 0 &&
                    hotMessages.length >= MAX_HOT_MESSAGES_PER_SESSION),
            }
          }
          store = {
            sessions: candidate.sessions,
            archive,
            messages,
            history,
          }
        }
      }
    }
  } catch {
    // ignore corrupt local cache
  }
}

function saveToDisk(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(SESSIONS_FILE, JSON.stringify(store, null, 2))
  } catch {
    // ignore cache write failures
  }
}

loadFromDisk()

export function listLocalSessions(): Array<LocalSession> {
  return Object.values(store.sessions)
    .filter((session): session is LocalSession => session !== undefined)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getLocalSession(sessionId: string): LocalSession | null {
  return store.sessions[sessionId] ?? null
}

export function ensureLocalSession(
  sessionId: string,
  model?: string,
  upstreamSessionId?: string,
): LocalSession {
  let session = store.sessions[sessionId]
  if (!session) {
    session = {
      id: sessionId,
      ...(upstreamSessionId ? { upstreamSessionId } : {}),
      title: null,
      model: model ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    }
    store.sessions[sessionId] = session
    store.archive[sessionId] = []
    store.messages[sessionId] = []
    store.history[sessionId] = { generation: 0, truncated: false }
    saveToDisk()
  } else if (
    upstreamSessionId &&
    session.upstreamSessionId !== upstreamSessionId
  ) {
    session.upstreamSessionId = upstreamSessionId
    saveToDisk()
  }
  store.history[sessionId] ??= {
    generation:
      (store.archive[sessionId]?.length ?? 0) +
      (store.messages[sessionId]?.length ?? 0),
    truncated: false,
  }
  store.archive[sessionId] ??= []
  return session
}

export function updateLocalSessionTitle(
  sessionId: string,
  title: string,
): void {
  const session = store.sessions[sessionId]
  if (session) {
    session.title = title
    session.updatedAt = Date.now()
    saveToDisk()
  }
}

export function touchLocalSession(sessionId: string): void {
  const session = store.sessions[sessionId]
  if (session) session.updatedAt = Date.now()
}

export function deleteLocalSession(sessionId: string): void {
  delete store.sessions[sessionId]
  delete store.archive[sessionId]
  delete store.messages[sessionId]
  delete store.history[sessionId]
  saveToDisk()
}

export function getLocalMessages(sessionId: string): Array<LocalMessage> {
  return [
    ...(store.archive[sessionId] ?? []),
    ...(store.messages[sessionId] ?? []),
  ]
}

export function getLocalMessagesResult(sessionId: string): LocalMessagesResult {
  const messages = getLocalMessages(sessionId)
  const state = store.history[sessionId] ?? {
    generation: messages.length,
    truncated: false,
  }
  return {
    messages,
    source: 'local',
    generation: state.generation,
    truncated: state.truncated,
    snapshot: JSON.stringify([
      state.generation,
      state.truncated,
      messages.length,
      messages[0]?.id ?? null,
      messages[messages.length - 1]?.id ?? null,
    ]),
  }
}

export function searchLocalSessions(
  query: string,
  limit = 20,
): Array<LocalSession & { snippet: string }> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []

  const results: Array<LocalSession & { snippet: string }> = []
  const sessions = listLocalSessions()

  for (const session of sessions) {
    const title = session.title || ''
    const messages = getLocalMessages(session.id)
    const matchingMessage = messages.find((message) =>
      message.content.toLowerCase().includes(normalized),
    )
    if (!title.toLowerCase().includes(normalized) && !matchingMessage) {
      continue
    }

    const content = matchingMessage?.content || title || session.id
    const lowerContent = content.toLowerCase()
    const matchIndex = lowerContent.indexOf(normalized)
    const start = matchIndex >= 0 ? Math.max(0, matchIndex - 80) : 0
    const snippet = content.slice(start, start + 220).trim()
    results.push({ ...session, snippet })
    if (results.length >= limit) break
  }

  return results
}

export function appendLocalMessage(
  sessionId: string,
  message: LocalMessage,
): void {
  const session = ensureLocalSession(sessionId)
  const messages = store.messages[sessionId] ?? []
  const archive = (store.archive[sessionId] ??= [])
  store.messages[sessionId] = messages
  messages.push(message)
  const history = (store.history[sessionId] ??= {
    generation: archive.length + messages.length - 1,
    truncated: false,
  })
  history.generation += 1
  if (messages.length > MAX_HOT_MESSAGES_PER_SESSION) {
    archive.push(
      ...messages.splice(0, messages.length - MAX_HOT_MESSAGES_PER_SESSION),
    )
  }
  const retainedCount = archive.length + messages.length
  if (retainedCount > MAX_RETAINED_MESSAGES_PER_SESSION) {
    history.truncated = true
    archive.splice(0, retainedCount - MAX_RETAINED_MESSAGES_PER_SESSION)
  }
  session.messageCount = history.generation
  session.updatedAt = Date.now()
  scheduleSave()
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveToDisk()
  }, 2000)
}
