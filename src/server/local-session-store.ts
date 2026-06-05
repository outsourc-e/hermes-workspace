import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = join(process.cwd(), '.runtime')
const SESSIONS_FILE = join(DATA_DIR, 'local-sessions.json')
const MAX_MESSAGES_PER_SESSION = 500

export type LocalSession = {
  id: string
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

type StoreData = {
  sessions: Record<string, LocalSession>
  messages: Record<string, Array<LocalMessage>>
}

let store: StoreData = { sessions: {}, messages: {} }

function loadFromDisk(): void {
  try {
    if (existsSync(SESSIONS_FILE)) {
      const raw = readFileSync(SESSIONS_FILE, 'utf-8')
      const parsed = JSON.parse(raw) as StoreData
      if (parsed.sessions && parsed.messages) {
        store = parsed
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
  return Object.values(store.sessions).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getLocalSession(sessionId: string): LocalSession | null {
  return store.sessions[sessionId] ?? null
}

export function ensureLocalSession(
  sessionId: string,
  model?: string,
): LocalSession {
  if (!store.sessions[sessionId]) {
    store.sessions[sessionId] = {
      id: sessionId,
      title: null,
      model: model ?? null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
    }
    store.messages[sessionId] = []
    saveToDisk()
  }
  return store.sessions[sessionId]
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
  delete store.messages[sessionId]
  saveToDisk()
}

export function getLocalMessages(sessionId: string): Array<LocalMessage> {
  return store.messages[sessionId] ?? []
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
    const messages = store.messages[session.id] ?? []
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
  store.messages[sessionId] = messages
  messages.push(message)
  if (store.messages[sessionId].length > MAX_MESSAGES_PER_SESSION) {
    store.messages[sessionId] = store.messages[sessionId].slice(
      -MAX_MESSAGES_PER_SESSION,
    )
  }
  session.messageCount = store.messages[sessionId].length
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
