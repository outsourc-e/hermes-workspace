export type LocalThreadMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export type LocalThread = {
  id: string
  label: string
  createdAt: number
  updatedAt: number
  messages: Array<LocalThreadMessage>
}

const threads = new Map<string, LocalThread>()

let threadCounter = 0
let activeThreadId: string | null = null

function nextThreadLabel(): string {
  threadCounter += 1
  return `Chat ${threadCounter}`
}

function createThread(id?: string): LocalThread {
  const timestamp = Date.now()
  const threadId =
    id && id.trim() ? id.trim() : `portable-${crypto.randomUUID()}`
  const thread: LocalThread = {
    id: threadId,
    label: nextThreadLabel(),
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [],
  }

  threads.set(threadId, thread)
  activeThreadId = threadId
  return thread
}

export function getOrCreateThread(id?: string): LocalThread {
  const threadId = id?.trim()
  if (threadId) {
    const existing = threads.get(threadId)
    if (existing) {
      activeThreadId = threadId
      return existing
    }
  }

  return createThread(threadId)
}

export function getThread(id: string): LocalThread | undefined {
  return threads.get(id)
}

export function listThreads(): Array<LocalThread> {
  return [...threads.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function appendMessage(
  threadId: string,
  role: LocalThreadMessage['role'],
  content: string,
): void {
  const thread = getOrCreateThread(threadId)
  const timestamp = Date.now()

  thread.messages.push({
    role,
    content,
    timestamp,
  })
  thread.updatedAt = timestamp
  activeThreadId = thread.id
}

export function renameThread(threadId: string, label: string): void {
  const thread = threads.get(threadId)
  if (!thread) return
  thread.label = label
  thread.updatedAt = Date.now()
}

export function deleteThread(threadId: string): void {
  const deleted = threads.delete(threadId)
  if (!deleted) return
  if (activeThreadId === threadId) {
    activeThreadId = null
  }
}

export function getActiveThreadId(): string | null {
  return activeThreadId
}

export function setActiveThreadId(id: string): void {
  activeThreadId = id
}
