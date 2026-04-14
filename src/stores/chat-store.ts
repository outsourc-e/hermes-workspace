import { create } from 'zustand'
import type {
  ChatMessage,
  MessageContent,
  TextContent,
  ThinkingContent,
  ToolCallContent,
} from '../screens/chat/types'

let _streamingPersistTimer: ReturnType<typeof setTimeout> | null = null

export type ChatStreamEvent =
  | {
      type: 'message'
      message: ChatMessage
      sessionKey: string
      runId?: string
      transport?: 'chat-events' | 'send-stream'
    }
  | {
      type: 'chunk'
      text: string
      runId?: string
      sessionKey: string
      fullReplace?: boolean
      transport?: 'chat-events' | 'send-stream'
    }
  | {
      type: 'thinking'
      text: string
      runId?: string
      sessionKey: string
      transport?: 'chat-events' | 'send-stream'
    }
  | {
      type: 'tool'
      phase: string
      name: string
      toolCallId?: string
      args?: unknown
      preview?: string
      result?: string
      runId?: string
      sessionKey: string
      transport?: 'chat-events' | 'send-stream'
    }
  | {
      type: 'done'
      state: string
      errorMessage?: string
      runId?: string
      sessionKey: string
      message?: ChatMessage
      transport?: 'chat-events' | 'send-stream'
    }
  | {
      type: 'user_message'
      message: ChatMessage
      sessionKey: string
      source?: string
      runId?: string
      transport?: 'chat-events' | 'send-stream'
    }
  | {
      type: 'status' | 'lifecycle'
      text: string
      sessionKey: string
      runId?: string
      transport?: 'chat-events' | 'send-stream'
    }

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export type StreamingState = {
  runId: string | null
  text: string
  thinking: string
  lifecycleEvents: Array<{
    text: string
    emoji: string
    timestamp: number
    isError: boolean
  }>
  toolCalls: Array<{
    id: string
    name: string
    phase: string
    args?: unknown
    preview?: string
    result?: string
  }>
}

type ChatState = {
  connectionState: ConnectionState
  lastError: string | null
  /** Messages received via real-time stream, keyed by sessionKey */
  realtimeMessages: Map<string, Array<ChatMessage>>
  /** Current streaming state per session */
  streamingState: Map<string, StreamingState>
  /** Timestamp of last received event */
  lastEventAt: number
  /**
   * RunIds currently being handled by send-stream (the active send SSE).
   * Server-side dedup is the primary defense. This client-side set remains as
   * a fallback in case a stale event slips through after transport issues.
   */
  sendStreamRunIds: Set<string>

  // Actions
  setConnectionState: (state: ConnectionState, error?: string) => void
  processEvent: (event: ChatStreamEvent) => void
  getRealtimeMessages: (sessionKey: string) => Array<ChatMessage>
  getStreamingState: (sessionKey: string) => StreamingState | null
  clearSession: (sessionKey: string) => void
  clearRealtimeBuffer: (sessionKey: string) => void
  clearStreamingSession: (sessionKey: string) => void
  clearAllStreaming: () => void
  mergeHistoryMessages: (
    sessionKey: string,
    historyMessages: Array<ChatMessage>,
  ) => Array<ChatMessage>
  /** Register a runId as being handled by send-stream — chat-events will skip it */
  registerSendStreamRun: (runId: string) => void
  /** Unregister a runId when send-stream completes */
  unregisterSendStreamRun: (runId: string) => void
  /** Check if a runId is being handled by send-stream */
  isSendStreamRun: (runId: string | undefined) => boolean

  /** Sessions currently waiting for a response — survives component unmount */
  waitingSessionKeys: Set<string>
  waitingSessionMeta: Record<
    string,
    { since: number; runId: string | null }
  >
  /** Mark a session as waiting for a response */
  setSessionWaiting: (sessionKey: string, runId?: string | null) => void
  /** Clear waiting state for a session */
  clearSessionWaiting: (sessionKey: string) => void
  /** Check if a session is waiting for a response */
  isSessionWaiting: (sessionKey: string) => boolean
}

const createEmptyStreamingState = (): StreamingState => ({
  runId: null,
  text: '',
  thinking: '',
  lifecycleEvents: [],
  toolCalls: [],
})

function persistStreamingState(
  sessionKey: string,
  state: StreamingState,
): void {
  if (typeof sessionStorage === 'undefined') return
  if (_streamingPersistTimer) clearTimeout(_streamingPersistTimer)
  _streamingPersistTimer = setTimeout(() => {
    sessionStorage.setItem(
      `hermes_streaming_${sessionKey}`,
      JSON.stringify({ ...state, _savedAt: Date.now() }),
    )
  }, 500)
}

export function restoreStreamingState(
  sessionKey: string,
): StreamingState | null {
  if (typeof sessionStorage === 'undefined') return null

  const storageKey = `hermes_streaming_${sessionKey}`
  const raw = sessionStorage.getItem(storageKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as StreamingState & { _savedAt?: unknown }
    const savedAt =
      typeof parsed._savedAt === 'number' && Number.isFinite(parsed._savedAt)
        ? parsed._savedAt
        : null

    if (!savedAt || Date.now() - savedAt > 60_000) {
      sessionStorage.removeItem(storageKey)
      return null
    }

    const { _savedAt, ...streamingState } = parsed
    return streamingState
  } catch {
    sessionStorage.removeItem(storageKey)
    return null
  }
}

const WAITING_TTL_MS = 120_000
const WAITING_STORAGE_PREFIX = 'hermes_waiting_'

function persistWaitingState(
  sessionKey: string,
  meta: { since: number; runId: string | null },
): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(
    `${WAITING_STORAGE_PREFIX}${sessionKey}`,
    JSON.stringify(meta),
  )
}

function removeWaitingState(sessionKey: string): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(`${WAITING_STORAGE_PREFIX}${sessionKey}`)
}

function restoreWaitingSessions(): {
  keys: Set<string>
  meta: Record<string, { since: number; runId: string | null }>
} {
  const keys = new Set<string>()
  const meta: Record<string, { since: number; runId: string | null }> = {}
  if (typeof sessionStorage === 'undefined') return { keys, meta }

  const now = Date.now()
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const storageKey = sessionStorage.key(i)
    if (!storageKey || !storageKey.startsWith(WAITING_STORAGE_PREFIX)) continue
    const sessionKey = storageKey.slice(WAITING_STORAGE_PREFIX.length)
    try {
      const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? '')
      if (
        typeof parsed.since === 'number' &&
        now - parsed.since < WAITING_TTL_MS
      ) {
        keys.add(sessionKey)
        meta[sessionKey] = {
          since: parsed.since,
          runId: typeof parsed.runId === 'string' ? parsed.runId : null,
        }
      } else {
        sessionStorage.removeItem(storageKey)
      }
    } catch {
      sessionStorage.removeItem(storageKey)
    }
  }
  return { keys, meta }
}

let realtimeMessageSequence = 0

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Strip <final>...</final> wrapper tags that the server emits as a
 * streaming-completion sentinel in agent chunk events.
 *
 * The server sometimes wraps the last streaming chunk (or a standalone
 * assistant-message event that fires before the formal `state: 'final'` chat
 * event) in <final>…</final> tags.  When the subsequent clean `done` event
 * arrives, the dedup logic compares its text against the already-stored tagged
 * version — they don't match — so BOTH messages end up in realtimeMessages and
 * appear side-by-side in the UI.
 *
 * Stripping these tags at the store boundary (before storing or comparing)
 * ensures the two copies are treated as the same message regardless of whether
 * the server included the sentinel tags or not.
 */
function stripFinalTags(text: string): string {
  // <final>…</final>  — strip outer wrapper (case-insensitive, allows whitespace)
  let result = text
    .replace(/^\s*<final>\s*([\s\S]*?)\s*<\/final>\s*$/i, '$1')
    .trim()
  // P7: strip internal model tags that should never appear in rendered output.
  // Matches chat UI's rg/ig/ag stripping functions.
  // Respects code blocks — only strip tags outside of ``` fences.
  result = stripInternalTags(result)
  return result
}

/**
 * Strip internal model tags (<thinking>, <antThinking>, <thought>,
 * <parameter name="newText">, <relevant_memories>) that can leak into
 * displayed text. Only strips outside code blocks to avoid breaking code samples.
 * Mirrors the chat control UI's tag-stripping pipeline.
 */
function stripInternalTags(text: string): string {
  // Split on code blocks to avoid stripping inside them
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part // inside code block — leave untouched
      return part
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        .replace(/<antThinking>[\s\S]*?<\/antThinking>/gi, '')
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/<parameter name="newText">[\s\S]*?<\/antml:parameter>/gi, '')
        .replace(/<relevant_memories>[\s\S]*?<\/relevant_memories>/gi, '')
        .trim()
    })
    .join('')
}

const LIFECYCLE_PREFIX_EMOJIS = ['⏳', '⚠️', '🔄', '🗜️', '❌'] as const

function parseLifecycleEvent(
  text: string,
  timestamp: number,
): {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
} {
  const trimmed = text.trim()
  const matchedEmoji =
    LIFECYCLE_PREFIX_EMOJIS.find((emoji) => trimmed.startsWith(emoji)) ?? ''
  const normalizedText = matchedEmoji
    ? trimmed.slice(matchedEmoji.length).trimStart()
    : trimmed
  const lowerText = normalizedText.toLowerCase()
  const isError =
    matchedEmoji === '❌' ||
    matchedEmoji === '⚠️' ||
    lowerText.includes('error') ||
    lowerText.includes('failed')

  return {
    text: normalizedText || trimmed,
    emoji: matchedEmoji,
    timestamp,
    isError,
  }
}

/**
 * Return a copy of `msg` with <final>...</final> tags stripped from all text
 * content blocks.  Other content types (thinking, toolCall, etc.) are left
 * untouched.  If the message has no text content the original object is
 * returned as-is so we don't allocate unnecessarily.
 */
function stripFinalTagsFromMessage(msg: ChatMessage): ChatMessage {
  let modified = false
  const rawMessage = msg as Record<string, unknown>
  const nextMessage: ChatMessage & Record<string, unknown> = { ...msg }

  if (Array.isArray(msg.content)) {
    const nextContent = msg.content.map((part) => {
      if (part.type !== 'text') return part
      const raw = (part as any).text ?? ''
      const stripped = stripFinalTags(
        typeof raw === 'string' ? raw : String(raw),
      )
      if (stripped === raw) return part
      modified = true
      return { ...part, text: stripped }
    })
    nextMessage.content = nextContent as typeof msg.content
  }

  for (const key of ['text', 'body', 'message'] as const) {
    const value = rawMessage[key]
    if (typeof value !== 'string') continue
    const stripped = stripFinalTags(value)
    if (stripped === value) continue
    nextMessage[key] = stripped
    modified = true
  }

  if (!modified) return msg
  return nextMessage
}

function getMessageId(msg: ChatMessage | null | undefined): string | undefined {
  if (!msg) return undefined
  const id = (msg as { id?: string }).id
  if (typeof id === 'string' && id.trim().length > 0) return id
  const messageId = (msg as { messageId?: string }).messageId
  if (typeof messageId === 'string' && messageId.trim().length > 0)
    return messageId
  return undefined
}

function getClientNonce(msg: ChatMessage | null | undefined): string {
  if (!msg) return ''
  const raw = msg as Record<string, unknown>
  return (
    normalizeString(raw.clientId) ||
    normalizeString(raw.client_id) ||
    normalizeString(raw.nonce) ||
    normalizeString(raw.idempotencyKey)
  )
}

function getMessageEventTime(
  msg: ChatMessage | null | undefined,
): number | undefined {
  if (!msg) return undefined
  const raw = msg as Record<string, unknown>
  for (const key of ['createdAt', 'timestamp'] as const) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Date.parse(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function getMessageReceiveTime(
  msg: ChatMessage | null | undefined,
): number | undefined {
  if (!msg) return undefined
  const value = (msg as Record<string, unknown>).__receiveTime
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getMessageHistoryIndex(
  msg: ChatMessage | null | undefined,
): number | undefined {
  if (!msg) return undefined
  const value = (msg as Record<string, unknown>).__historyIndex
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getMessageRealtimeSequence(
  msg: ChatMessage | null | undefined,
): number | undefined {
  if (!msg) return undefined
  const value = (msg as Record<string, unknown>).__realtimeSequence
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function hasToolCalls(msg: ChatMessage | null | undefined): boolean {
  if (!msg) return false
  if (Array.isArray(msg.content)) {
    const contentHasToolCalls = msg.content.some(
      (part) => part.type === 'toolCall',
    )
    if (contentHasToolCalls) return true
  }

  const raw = msg as Record<string, unknown>
  return (
    (Array.isArray(raw.streamToolCalls) && raw.streamToolCalls.length > 0) ||
    (Array.isArray(raw.__streamToolCalls) && raw.__streamToolCalls.length > 0)
  )
}

function getMessageChronologyRank(msg: ChatMessage): number {
  const role = normalizeString(msg.role).toLowerCase()
  if (role === 'user') return 0
  if (role === 'assistant' && hasToolCalls(msg)) return 1
  if (role === 'tool' || role === 'toolresult' || role === 'tool_result')
    return 2
  if (role === 'assistant') return 3
  return 4
}

function compareMessagesByTime(left: ChatMessage, right: ChatMessage): number {
  const leftTime = getMessageEventTime(left) ?? getMessageReceiveTime(left) ?? 0
  const rightTime =
    getMessageEventTime(right) ?? getMessageReceiveTime(right) ?? 0
  if (leftTime !== rightTime) return leftTime - rightTime

  const leftRank = getMessageChronologyRank(left)
  const rightRank = getMessageChronologyRank(right)
  if (leftRank !== rightRank) return leftRank - rightRank

  const leftHistoryIndex = getMessageHistoryIndex(left)
  const rightHistoryIndex = getMessageHistoryIndex(right)
  if (
    leftHistoryIndex !== undefined &&
    rightHistoryIndex !== undefined &&
    leftHistoryIndex !== rightHistoryIndex
  ) {
    return leftHistoryIndex - rightHistoryIndex
  }

  const leftRealtimeSequence = getMessageRealtimeSequence(left)
  const rightRealtimeSequence = getMessageRealtimeSequence(right)
  if (
    leftRealtimeSequence !== undefined &&
    rightRealtimeSequence !== undefined &&
    leftRealtimeSequence !== rightRealtimeSequence
  ) {
    return leftRealtimeSequence - rightRealtimeSequence
  }

  const leftId = getMessageId(left) ?? ''
  const rightId = getMessageId(right) ?? ''
  return leftId.localeCompare(rightId)
}

function sortMessagesChronologically(
  messages: Array<ChatMessage>,
): Array<ChatMessage> {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const byTime = compareMessagesByTime(left.message, right.message)
      if (byTime !== 0) return byTime
      return left.index - right.index
    })
    .map(({ message }) => message)
}

function isExternalInboundUserSource(source: unknown): boolean {
  const normalized = normalizeString(source).toLowerCase()
  return (
    normalized === 'webchat' ||
    normalized === 'signal' ||
    normalized === 'telegram'
  )
}

function getAttachmentSignature(msg: ChatMessage | null | undefined): string {
  if (!msg) return ''
  const attachments = Array.isArray((msg as any).attachments)
    ? ((msg as any).attachments as Array<Record<string, unknown>>)
    : []
  if (attachments.length === 0) return ''
  return attachments
    .map((attachment) => {
      return `${normalizeString(attachment.name)}:${String(attachment.size ?? '')}`
    })
    .sort()
    .join('|')
}

function isOptimisticUserCandidate(
  msg: ChatMessage | null | undefined,
): boolean {
  if (!msg || msg.role !== 'user') return false
  const raw = msg as Record<string, unknown>
  return (
    normalizeString(raw.__optimisticId).length > 0 ||
    ['sending', 'queued', 'sent', 'done'].includes(normalizeString(raw.status))
  )
}

function messageMultipartSignature(
  msg: ChatMessage | null | undefined,
): string {
  if (!msg) return ''
  let content = Array.isArray(msg.content)
    ? msg.content
        .map((part) => {
          if (part.type === 'text')
            return `t:${String((part as any).text ?? '').trim()}`
          if (part.type === 'thinking')
            return `h:${String((part as any).thinking ?? '').trim()}`
          if (part.type === 'toolCall')
            return `tc:${String((part as any).id ?? '')}:${String((part as any).name ?? '')}`
          return `p:${String((part as any).type ?? '')}`
        })
        .join('|')
    : ''
  // Fallback: if content array is empty/missing, check top-level text fields
  // so that legacy-format messages still produce a meaningful signature.
  if (!content) {
    const raw = msg as Record<string, unknown>
    for (const key of ['text', 'body', 'message']) {
      const val = raw[key]
      if (typeof val === 'string' && val.trim().length > 0) {
        content = `t:${stripFinalTags(val.trim())}`
        break
      }
    }
  }
  const attachments = Array.isArray((msg as any).attachments)
    ? (msg as any).attachments
        .map(
          (attachment: any) =>
            `${String(attachment?.name ?? '')}:${String(attachment?.size ?? '')}:${String(attachment?.contentType ?? '')}`,
        )
        .join('|')
    : ''
  return `${msg.role ?? 'unknown'}:${content}:${attachments}`
}

const _restoredWaiting = restoreWaitingSessions()

export const useChatStore = create<ChatState>((set, get) => ({
  connectionState: 'disconnected',
  lastError: null,
  realtimeMessages: new Map(),
  streamingState: new Map(),
  lastEventAt: 0,
  sendStreamRunIds: new Set(),
  waitingSessionKeys: _restoredWaiting.keys,
  waitingSessionMeta: _restoredWaiting.meta,

  setConnectionState: (connectionState, error) => {
    set({ connectionState, lastError: error ?? null })
  },

  registerSendStreamRun: (runId) => {
    const next = new Set(get().sendStreamRunIds)
    next.add(runId)
    set({ sendStreamRunIds: next })
  },

  unregisterSendStreamRun: (runId) => {
    const next = new Set(get().sendStreamRunIds)
    next.delete(runId)
    set({ sendStreamRunIds: next })
  },

  isSendStreamRun: (runId) => {
    if (!runId) return false
    return get().sendStreamRunIds.has(runId)
  },

  setSessionWaiting: (sessionKey, runId) => {
    const meta = {
      since: get().waitingSessionMeta[sessionKey]?.since ?? Date.now(),
      runId: runId ?? null,
    }
    const nextKeys = new Set(get().waitingSessionKeys)
    nextKeys.add(sessionKey)
    const nextMeta = { ...get().waitingSessionMeta, [sessionKey]: meta }
    persistWaitingState(sessionKey, meta)
    set({ waitingSessionKeys: nextKeys, waitingSessionMeta: nextMeta })
  },

  clearSessionWaiting: (sessionKey) => {
    const nextKeys = new Set(get().waitingSessionKeys)
    nextKeys.delete(sessionKey)
    const { [sessionKey]: _, ...nextMeta } = get().waitingSessionMeta
    removeWaitingState(sessionKey)
    set({ waitingSessionKeys: nextKeys, waitingSessionMeta: nextMeta })
  },

  isSessionWaiting: (sessionKey) => {
    return get().waitingSessionKeys.has(sessionKey)
  },

  processEvent: (event) => {
    const state = get()
    const sessionKey = event.sessionKey
    const now = Date.now()

    // Skip ALL events for runs being handled by send-stream.
    // send-stream is the authoritative handler for active sends — chat-events
    // fires the same events in parallel, causing duplicate messages.
    // Previously only covered chunk/thinking/tool/done — missing 'message'
    // was the root cause of the persistent duplication bug.
    if (
      event.transport !== 'send-stream' &&
      event.runId &&
      get().sendStreamRunIds.has(event.runId)
    ) {
      return
    }

    switch (event.type) {
      case 'message':
      case 'user_message': {
        // Filter internal system event messages that should never appear in chat.
        // These are pre-compaction flushes, heartbeat prompts, and similar
        // server-injected control messages — mirror the filter in use-chat-history.ts.
        if (event.message.role === 'user') {
          const rawText = extractMessageText(event.message)
          if (
            rawText.startsWith('Pre-compaction memory flush') ||
            rawText.includes('Store durable memories now') ||
            rawText.includes('APPEND new content only and do not overwrite') ||
            rawText.startsWith('A subagent task') ||
            rawText.startsWith('[Queued announce messages') ||
            rawText.includes('Summarize this naturally for the user') ||
            (rawText.includes('Stats: runtime') &&
              rawText.includes('sessionKey agent:'))
          ) {
            break
          }
        }

        const messages = new Map(state.realtimeMessages)
        const sessionMessages = [...(messages.get(sessionKey) ?? [])]
        const incomingReceiveTime = now

        // Strip <final>…</final> sentinel tags from assistant messages before
        // storing or comparing.  The server can emit a bare assistant-message
        // event (state=undefined) whose text is still wrapped in these tags,
        // and the subsequent clean `done` event then fails the dedup check
        // because the stored text differs from the final text.
        const normalizedMessage =
          event.message.role === 'assistant'
            ? stripFinalTagsFromMessage(event.message)
            : event.message

        const newId = getMessageId(normalizedMessage)
        const newClientNonce = getClientNonce(normalizedMessage)
        const newMultipartSignature =
          messageMultipartSignature(normalizedMessage)

        const optimisticIndexByNonce =
          newClientNonce.length > 0
            ? sessionMessages.findIndex((existing) => {
                if (existing.role !== normalizedMessage.role) return false
                const existingNonce = getClientNonce(existing)
                if (
                  existingNonce.length === 0 ||
                  existingNonce !== newClientNonce
                ) {
                  return false
                }
                return (
                  normalizeString((existing as any).status) === 'sending' ||
                  Boolean((existing as any).__optimisticId)
                )
              })
            : -1

        const optimisticIndex =
          optimisticIndexByNonce >= 0
            ? optimisticIndexByNonce
            : normalizedMessage.role === 'user'
              ? sessionMessages.findIndex((existing) => {
                  if (existing.role !== 'user') return false
                  if (!isOptimisticUserCandidate(existing)) return false
                  const existingText = extractMessageText(existing)
                  const incomingText = extractMessageText(normalizedMessage)
                  if (
                    existingText &&
                    incomingText &&
                    existingText === incomingText
                  ) {
                    return true
                  }
                  const existingAttachments = getAttachmentSignature(existing)
                  const incomingAttachments =
                    getAttachmentSignature(normalizedMessage)
                  return (
                    existingText.length === 0 &&
                    incomingText.length === 0 &&
                    existingAttachments.length > 0 &&
                    existingAttachments === incomingAttachments
                  )
                })
              : -1

        // Plain-text extraction for content-based dedup (catches identical
        // replies that arrive with different IDs from different channels).
        const newPlainText = extractMessageText(normalizedMessage)
        const isExternalInboundUser =
          normalizedMessage.role === 'user' &&
          isExternalInboundUserSource((event as any).source)
        const incomingEventTime =
          getMessageEventTime(normalizedMessage) ?? incomingReceiveTime

        const duplicateIndex = sessionMessages.findIndex((existing) => {
          if (existing.role !== normalizedMessage.role) return false
          const existingId = getMessageId(existing)
          if (newId && existingId && newId === existingId) return true

          const existingNonce = getClientNonce(existing)
          if (
            newClientNonce &&
            existingNonce &&
            newClientNonce === existingNonce
          ) {
            return true
          }

          if (
            newMultipartSignature.length > 0 &&
            newMultipartSignature === messageMultipartSignature(existing)
          ) {
            return true
          }

          // Content-text dedup: identical assistant text within the same
          // session should never appear twice, even if message IDs differ
          // (e.g. same reply routed from Telegram + Hermes Workspace).
          if (
            normalizedMessage.role === 'assistant' &&
            newPlainText.length > 20 &&
            newPlainText === extractMessageText(existing)
          ) {
            return true
          }

          return false
        })

        // Mark user messages from external sources
        const incomingMessage: ChatMessage = {
          ...normalizedMessage,
          __realtimeSource:
            event.type === 'user_message' ? (event as any).source : undefined,
          __receiveTime: incomingReceiveTime,
          __realtimeSequence: realtimeMessageSequence++,
          status: undefined,
        }

        if (optimisticIndex >= 0) {
          const optimisticMessage = sessionMessages[optimisticIndex]
          const incomingText = extractMessageText(incomingMessage)
          const optimisticText = extractMessageText(optimisticMessage)
          const incomingHasAttachments =
            Array.isArray((incomingMessage as any).attachments) &&
            (incomingMessage as any).attachments.length > 0
          const optimisticHasAttachments =
            Array.isArray((optimisticMessage as any).attachments) &&
            (optimisticMessage as any).attachments.length > 0

          sessionMessages[optimisticIndex] = {
            ...optimisticMessage,
            ...incomingMessage,
            content:
              incomingText.length > 0 || !optimisticText.length
                ? incomingMessage.content
                : optimisticMessage.content,
            attachments:
              incomingHasAttachments || !optimisticHasAttachments
                ? incomingMessage.attachments
                : optimisticMessage.attachments,
            __optimisticId: undefined,
            status: undefined,
          }
          messages.set(sessionKey, sortMessagesChronologically(sessionMessages))
          set({ realtimeMessages: messages, lastEventAt: now })
          break
        }

        const hasRecentExternalDuplicate =
          isExternalInboundUser &&
          newPlainText.length > 0 &&
          sessionMessages.some((existing) => {
            if (existing.role !== 'user') return false
            if (extractMessageText(existing) !== newPlainText) return false
            const existingEventTime =
              getMessageEventTime(existing) ?? getMessageReceiveTime(existing)
            if (existingEventTime === undefined) return false
            return Math.abs(incomingEventTime - existingEventTime) <= 10_000
          })

        if (hasRecentExternalDuplicate) {
          break
        }

        if (duplicateIndex === -1) {
          sessionMessages.push(incomingMessage)
          messages.set(sessionKey, sortMessagesChronologically(sessionMessages))
          set({ realtimeMessages: messages, lastEventAt: now })
        }
        break
      }

      case 'chunk': {
        const streamingMap = new Map(state.streamingState)
        const prev = streamingMap.get(sessionKey) ?? createEmptyStreamingState()

        // Server sends full accumulated text with fullReplace=true
        // Replace entire text (default), or append if fullReplace is explicitly false
        const next: StreamingState = {
          ...prev,
          text: stripFinalTags(
            event.fullReplace === false ? prev.text + event.text : event.text,
          ),
          runId: event.runId ?? prev.runId,
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        persistStreamingState(sessionKey, next)

        break
      }

      case 'thinking': {
        const streamingMap = new Map(state.streamingState)
        const prev = streamingMap.get(sessionKey) ?? createEmptyStreamingState()
        const next: StreamingState = {
          ...prev,
          thinking: event.text,
          runId: event.runId ?? prev.runId,
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        persistStreamingState(sessionKey, next)
        break
      }

      case 'status':
      case 'lifecycle': {
        const streamingMap = new Map(state.streamingState)
        const prev = streamingMap.get(sessionKey) ?? createEmptyStreamingState()
        const next: StreamingState = {
          ...prev,
          runId: event.runId ?? prev.runId,
          lifecycleEvents: [
            ...prev.lifecycleEvents,
            parseLifecycleEvent(event.text, now),
          ],
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        persistStreamingState(sessionKey, next)
        break
      }

      case 'tool': {
        const streamingMap = new Map(state.streamingState)
        const prev = streamingMap.get(sessionKey) ?? createEmptyStreamingState()

        const toolCallId =
          event.toolCallId ??
          `${event.name || 'tool'}-${event.runId || sessionKey}-${prev.toolCalls.length}`
        const existingToolIndex = prev.toolCalls.findIndex(
          (tc) => tc.id === toolCallId,
        )

        const nextToolCalls = [...prev.toolCalls]

        if (existingToolIndex >= 0) {
          nextToolCalls[existingToolIndex] = {
            ...nextToolCalls[existingToolIndex],
            phase: event.phase,
            args: event.args ?? nextToolCalls[existingToolIndex].args,
            preview:
              (event as any).preview ??
              nextToolCalls[existingToolIndex].preview,
            result:
              (event as any).result ?? nextToolCalls[existingToolIndex].result,
          }
        } else {
          // Create entry for ANY phase (complete, error, skill.loaded, artifact.created, etc.)
          // Events like skill.loaded arrive with phase 'complete' and no prior 'start' — create them too
          nextToolCalls.push({
            id: toolCallId,
            name: event.name,
            phase: event.phase,
            args: event.args,
            preview: (event as any).preview,
            result: (event as any).result,
          })
        }

        const next: StreamingState = {
          ...prev,
          runId: event.runId ?? prev.runId,
          toolCalls: nextToolCalls,
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        persistStreamingState(sessionKey, next)
        break
      }

      case 'done': {
        const streamingMap = new Map(state.streamingState)
        const streaming = streamingMap.get(sessionKey)

        // Build the complete message — prefer authoritative final payload (bug #8 fix)
        let completeMessage: ChatMessage | null = null

        if (event.message) {
          // Prefer done event's message payload — it's the authoritative final response.
          // Strip <final>…</final> sentinel tags: the `done` message may still carry
          // them if the server serialises the final state from its streaming buffer.
          const cleanedMessage = ensureAssistantTextContent(
            stripFinalTagsFromMessage(event.message),
          )
          // Preserve tool calls from streaming state on the final message so
          // ToolCallPill can render them even after streaming state is cleared.
          // Fast tool runs clear streaming state before React renders — embedding
          // __streamToolCalls ensures pills survive in the history message.
          const streamToolCallsToEmbed = streaming?.toolCalls?.length
            ? streaming.toolCalls
            : undefined
          completeMessage = {
            ...cleanedMessage,
            timestamp: getMessageEventTime(cleanedMessage) ?? now,
            __receiveTime: now,
            __realtimeSequence: realtimeMessageSequence++,
            __streamingStatus: 'complete' as any,
            ...(streamToolCallsToEmbed
              ? { __streamToolCalls: streamToolCallsToEmbed }
              : {}),
          }
        } else if (streaming && streaming.text) {
          // Fallback: build from streaming state if no final payload.
          // Strip any <final> tags that may have accumulated in the stream buffer.
          const cleanStreamText = stripFinalTags(streaming.text)
          const content: Array<MessageContent> = []

          if (streaming.thinking) {
            content.push({
              type: 'thinking',
              thinking: streaming.thinking,
            } as ThinkingContent)
          }

          if (cleanStreamText) {
            content.push({
              type: 'text',
              text: cleanStreamText,
            } as TextContent)
          }

          for (const toolCall of streaming.toolCalls) {
            content.push({
              type: 'toolCall',
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.args as Record<string, unknown> | undefined,
            } as ToolCallContent)
          }

          completeMessage = {
            role: 'assistant',
            content,
            timestamp: now,
            __receiveTime: now,
            __realtimeSequence: realtimeMessageSequence++,
            __streamingStatus: 'complete',
          }
        }

        if (completeMessage) {
          const messages = new Map(state.realtimeMessages)
          const sessionMessages = [...(messages.get(sessionKey) ?? [])]

          // Deduplicate: by ID or exact content (bug #7 fix).
          // extractMessageText handles both content-array and legacy top-level
          // text/body/message payloads, and strips <final> tags for both.
          const completeText = extractMessageText(completeMessage)
          const completeId = getMessageId(completeMessage)
          const isDuplicate = sessionMessages.some((existing) => {
            if (existing.role !== 'assistant') return false
            const existingId = getMessageId(existing)
            if (completeId && existingId && completeId === existingId)
              return true
            if (completeText && completeText === extractMessageText(existing))
              return true
            return false
          })

          if (!isDuplicate) {
            sessionMessages.push(completeMessage)
            messages.set(
              sessionKey,
              sortMessagesChronologically(sessionMessages),
            )
            set({ realtimeMessages: messages })
          } else {
            // If there IS a duplicate (e.g. a tagged pre-final message was stored),
            // replace it with the clean final version so the UI shows clean text.
            const existingIdx = sessionMessages.findIndex((existing) => {
              if (existing.role !== 'assistant') return false
              const existingId = getMessageId(existing)
              if (completeId && existingId && completeId === existingId)
                return true
              if (completeText && completeText === extractMessageText(existing))
                return true
              return false
            })
            if (existingIdx >= 0) {
              sessionMessages[existingIdx] = {
                ...sessionMessages[existingIdx],
                ...completeMessage,
              }
              messages.set(
                sessionKey,
                sortMessagesChronologically(sessionMessages),
              )
              set({ realtimeMessages: messages })
            }
          }
        }

        // Clear streaming state immediately — tool calls are preserved via
        // __streamToolCalls embedded on completeMessage above, so pills survive
        // in the history message without needing streaming state alive.
        // DO NOT keep a stub here — it keeps isRealtimeStreaming=true which
        // injects an invisible streaming placeholder that causes a blank gap.
        streamingMap.delete(sessionKey)
        set({ streamingState: streamingMap, lastEventAt: now })
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(`hermes_streaming_${sessionKey}`)
        }
        break
      }
    }
  },

  getRealtimeMessages: (sessionKey) => {
    return get().realtimeMessages.get(sessionKey) ?? []
  },

  getStreamingState: (sessionKey) => {
    return get().streamingState.get(sessionKey) ?? null
  },

  clearSession: (sessionKey) => {
    const messages = new Map(get().realtimeMessages)
    const streaming = new Map(get().streamingState)
    messages.delete(sessionKey)
    streaming.delete(sessionKey)
    set({ realtimeMessages: messages, streamingState: streaming })
  },

  clearRealtimeBuffer: (sessionKey) => {
    const messages = new Map(get().realtimeMessages)
    messages.delete(sessionKey)
    set({ realtimeMessages: messages })
  },

  clearStreamingSession: (sessionKey) => {
    const streaming = new Map(get().streamingState)
    if (!streaming.has(sessionKey)) return
    streaming.delete(sessionKey)
    set({ streamingState: streaming })
  },

  clearAllStreaming: () => {
    if (get().streamingState.size === 0) return
    set({ streamingState: new Map() })
  },

  mergeHistoryMessages: (sessionKey, historyMessages) => {
    const realtimeMessages = get().realtimeMessages.get(sessionKey) ?? []

    if (realtimeMessages.length === 0) {
      return sortMessagesChronologically(historyMessages)
    }

    const matchesRealtimeMessage = (
      histMsg: ChatMessage,
      rtMsg: ChatMessage,
    ): boolean => {
      const rtId = getMessageId(rtMsg)
      const rtText = extractMessageText(rtMsg)
      const rtNonce = getClientNonce(rtMsg)
      const rtSignature = messageMultipartSignature(rtMsg)
      const histId = getMessageId(histMsg)
      if (rtId && histId && rtId === histId) {
        return true
      }

      const histNonce = getClientNonce(histMsg)
      if (rtNonce && histNonce && rtNonce === histNonce) {
        return true
      }

      if (histMsg.role === rtMsg.role && rtText) {
        const histText = extractMessageText(histMsg)
        if (histText === rtText) return true
      }

      const histRaw = histMsg as Record<string, unknown>
      const histIsOptimistic =
        normalizeString(histRaw.status) === 'sending' ||
        normalizeString(histRaw.__optimisticId).length > 0

      if (histIsOptimistic && histMsg.role === rtMsg.role) {
        if (rtText) {
          const histText = extractMessageText(histMsg)
          if (histText === rtText) return true
          if (histText && rtText.startsWith(histText)) return true
        }
        const rtAttachments = Array.isArray((rtMsg as any).attachments)
          ? ((rtMsg as any).attachments as Array<Record<string, unknown>>)
          : []
        const histAttachments = Array.isArray((histMsg as any).attachments)
          ? ((histMsg as any).attachments as Array<Record<string, unknown>>)
          : []
        if (
          rtAttachments.length > 0 &&
          rtAttachments.length == histAttachments.length
        ) {
          const rtSig = rtAttachments
            .map((a) => `${normalizeString(a.name)}:${String(a.size ?? '')}`)
            .sort()
            .join('|')
          const histSig = histAttachments
            .map((a) => `${normalizeString(a.name)}:${String(a.size ?? '')}`)
            .sort()
            .join('|')
          if (rtSig && rtSig === histSig) return true
        }
      }

      return (
        rtSignature.length > 0 &&
        rtSignature === messageMultipartSignature(histMsg)
      )
    }

    const mergedHistoryMessages = historyMessages.map((histMsg) => {
      const matchingRealtime = realtimeMessages.find((rtMsg) =>
        matchesRealtimeMessage(histMsg, rtMsg),
      )
      if (!matchingRealtime) return histMsg
      // Preserve attachments from the optimistic/realtime message when history doesn't have them
      const merged = mergeRealtimeAssistantMetadata(histMsg, matchingRealtime)
      const rtAttachments = (matchingRealtime as any).attachments
      const histAttachments = (merged as any).attachments
      if (
        Array.isArray(rtAttachments) &&
        rtAttachments.length > 0 &&
        (!Array.isArray(histAttachments) || histAttachments.length === 0)
      ) {
        return { ...merged, attachments: rtAttachments }
      }
      return merged
    })

    const newRealtimeMessages = realtimeMessages.filter(
      (rtMsg) =>
        !mergedHistoryMessages.some((histMsg) =>
          matchesRealtimeMessage(histMsg, rtMsg),
        ),
    )

    if (newRealtimeMessages.length === 0) {
      return sortMessagesChronologically(mergedHistoryMessages)
    }

    return sortMessagesChronologically([
      ...mergedHistoryMessages,
      ...newRealtimeMessages,
    ])
  },
}))

function extractTextFromContent(
  content: Array<MessageContent> | undefined,
): string {
  if (!content || !Array.isArray(content)) return ''
  return stripFinalTags(
    content
      .filter(
        (c): c is TextContent =>
          c.type === 'text' && typeof (c as any).text === 'string',
      )
      .map((c) => c.text)
      .join('\n')
      .trim(),
  )
}

/**
 * Extract text from a ChatMessage using multiple strategies:
 *   1. content array (canonical format)
 *   2. top-level text/body/message fields (legacy / some server adapters)
 *
 * Some servers echo user messages with a top-level `text` field instead of
 * the `content` array. Using only extractTextFromContent() would return ''
 * for those, causing dedup to fail in mergeHistoryMessages.
 */
function extractMessageText(msg: ChatMessage | null | undefined): string {
  if (!msg) return ''
  const fromContent = extractTextFromContent(msg.content)
  if (fromContent.length > 0) return fromContent

  const raw = msg as Record<string, unknown>
  for (const key of ['text', 'body', 'message']) {
    const val = raw[key]
    if (typeof val === 'string' && val.trim().length > 0)
      return stripFinalTags(val.trim())
  }
  return ''
}

function ensureAssistantTextContent(msg: ChatMessage): ChatMessage {
  if (msg.role !== 'assistant') return msg
  if (Array.isArray(msg.content) && msg.content.length > 0) return msg

  const text = extractMessageText(msg)
  if (!text) return msg

  return {
    ...msg,
    content: [{ type: 'text', text } as TextContent],
  }
}

function mergeRealtimeAssistantMetadata(
  historyMessage: ChatMessage,
  realtimeMessage: ChatMessage,
): ChatMessage {
  if (
    historyMessage.role !== 'assistant' ||
    realtimeMessage.role !== 'assistant'
  ) {
    return historyMessage
  }

  const realtimeToolCalls = Array.isArray(
    (realtimeMessage as any).__streamToolCalls,
  )
    ? (realtimeMessage as any).__streamToolCalls
    : []
  const historyToolCalls = Array.isArray(
    (historyMessage as any).__streamToolCalls,
  )
    ? (historyMessage as any).__streamToolCalls
    : []
  const historyStreamToolCalls = Array.isArray(
    (historyMessage as any).streamToolCalls,
  )
    ? (historyMessage as any).streamToolCalls
    : []

  if (
    realtimeToolCalls.length === 0 ||
    historyToolCalls.length > 0 ||
    historyStreamToolCalls.length > 0
  ) {
    return historyMessage
  }

  return {
    ...historyMessage,
    __streamToolCalls: realtimeToolCalls,
    streamToolCalls: realtimeToolCalls,
  }
}
