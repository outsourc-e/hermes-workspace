import { create } from 'zustand'
import {
  sanitizeCardOwnedMessage,
  sanitizeCardOwnedValue,
} from '../screens/chat/card-transcript-recovery'
import type {
  ChatMessage,
  MessageContent,
  TextContent,
  ThinkingContent,
  ToolCallContent,
} from '../screens/chat/types'

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
  /** Messages received via real-time stream; main Chat entries use Card IDs. */
  realtimeMessages: Map<string, Array<ChatMessage>>
  /** Current streaming state per session */
  streamingState: Map<string, StreamingState>
  /** Independent immutable-run streams nested under the stable Card owner. */
  cardStreamingRuns: Map<string, Map<string, StreamingState>>
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
  processEvent: (event: ChatStreamEvent, ownerCardId?: string) => void
  processCardEvent: (cardId: string, event: ChatStreamEvent) => void
  getCardRealtimeMessages: (cardId: string) => Array<ChatMessage>
  getCardStreamingState: (cardId: string) => StreamingState | null
  getCardStreamingStates: (cardId: string) => Array<StreamingState>
  hydrateCardStreamingState: (cardId: string) => void
  clearCard: (cardId: string) => void
  clearCardRealtimeBuffer: (cardId: string) => void
  clearCardStreaming: (cardId: string, runId?: string) => void
  mergeCardHistoryMessages: (
    cardId: string,
    historyMessages: Array<ChatMessage>,
  ) => Array<ChatMessage>
  claimSessionStateForCard: (sessionKey: string, cardId: string) => void
  getRealtimeMessages: (sessionKey: string) => Array<ChatMessage>
  getStreamingState: (sessionKey: string) => StreamingState | null
  clearSession: (sessionKey: string) => void
  handoffSession: (fromSessionKey: string, toSessionKey: string) => void
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
  waitingSessionMeta: Partial<
    Record<string, { since: number; runId: string | null }>
  >
  /** Mark a session as waiting for a response */
  setSessionWaiting: (sessionKey: string, runId?: string | null) => void
  /** Clear waiting state for a session */
  clearSessionWaiting: (sessionKey: string) => void
  /** Check if a session is waiting for a response */
  isSessionWaiting: (sessionKey: string) => boolean
  setCardWaiting: (cardId: string, runId?: string | null) => void
  clearCardWaiting: (cardId: string) => void
  isCardWaiting: (cardId: string) => boolean

  /** Last activity description forwarded via heartbeat — used by ThinkingBubble
   *  to show meaningful progress during long reasoning stretches */
  heartbeatActivity: string | null
  setHeartbeatActivity: (activity: string | null) => void
}

const createEmptyStreamingState = (): StreamingState => ({
  runId: null,
  text: '',
  thinking: '',
  lifecycleEvents: [],
  toolCalls: [],
})

const CARD_STREAMING_STORAGE_PREFIX = 'workspace.chat-card-streaming.v1:'
const CARD_WAITING_STORAGE_PREFIX = 'workspace.chat-card-waiting.v1:'
const LEGACY_CHAT_STORAGE_PREFIXES = [
  'claude_waiting_',
  'claude_streaming_',
  'claude_realtime_',
] as const
const WAITING_TTL_MS = 120_000
const CARD_STREAMING_ENVELOPE_VERSION = 2

function isAuthoritativeCardId(cardId: string): boolean {
  return cardId === cardId.trim() && /^(?:local|remote):\S+$/.test(cardId)
}

function withoutTransportOwnership(message: ChatMessage): ChatMessage {
  return sanitizeCardOwnedMessage(message)
}

function sanitizeCardStreamingState(state: StreamingState): StreamingState {
  return sanitizeCardOwnedValue(state) as StreamingState
}

function cleanupLegacyChatStorage(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index)
      if (
        key &&
        LEGACY_CHAT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Browser storage can be unavailable; live in-memory Card state still works.
  }
}

function cardStorageKey(prefix: string, cardId: string): string {
  return `${prefix}${encodeURIComponent(cardId)}`
}

function normalizeCardStreamingStates(
  states: ReadonlyArray<StreamingState>,
): Array<StreamingState> {
  const normalized = new Map<string, StreamingState>()
  let ownerOnly: StreamingState | null = null
  for (const state of states) {
    const sanitized = sanitizeCardStreamingState(state)
    if (
      (sanitized.runId !== null && typeof sanitized.runId !== 'string') ||
      typeof sanitized.text !== 'string' ||
      typeof sanitized.thinking !== 'string' ||
      !Array.isArray(sanitized.lifecycleEvents) ||
      !Array.isArray(sanitized.toolCalls)
    ) {
      continue
    }
    if (sanitized.runId) normalized.set(sanitized.runId, sanitized)
    else ownerOnly = sanitized
  }
  return [...(ownerOnly ? [ownerOnly] : []), ...normalized.values()]
}

function writeCardStreamingStates(
  cardId: string,
  states: ReadonlyArray<StreamingState>,
): void {
  if (typeof sessionStorage === 'undefined' || !isAuthoritativeCardId(cardId)) {
    return
  }
  const runs = normalizeCardStreamingStates(states)
  if (runs.length === 0) {
    removePersistedCardStreamingState(cardId)
    return
  }
  cleanupLegacyChatStorage()
  try {
    sessionStorage.setItem(
      cardStorageKey(CARD_STREAMING_STORAGE_PREFIX, cardId),
      JSON.stringify({
        version: CARD_STREAMING_ENVELOPE_VERSION,
        cardId,
        savedAt: Date.now(),
        runs,
      }),
    )
  } catch {
    // In-memory Card state remains authoritative when persistence is denied.
  }
}

function persistCardStreamingStates(
  cardId: string,
  states: ReadonlyArray<StreamingState>,
): void {
  if (!isAuthoritativeCardId(cardId)) return
  // Each accepted event is a recovery checkpoint. Deferring this write behind
  // a trailing timer can lose sibling runs when the page is remounted first.
  writeCardStreamingStates(cardId, states)
}

function removePersistedCardStreamingState(cardId: string): void {
  if (typeof sessionStorage === 'undefined') return
  cleanupLegacyChatStorage()
  try {
    sessionStorage.removeItem(
      cardStorageKey(CARD_STREAMING_STORAGE_PREFIX, cardId),
    )
  } catch {
    // In-memory cleanup still succeeds when persistence is denied.
  }
}

export function restoreCardStreamingStates(
  cardId: string,
): Array<StreamingState> {
  if (typeof sessionStorage === 'undefined' || !isAuthoritativeCardId(cardId)) {
    return []
  }
  cleanupLegacyChatStorage()
  const storageKey = cardStorageKey(CARD_STREAMING_STORAGE_PREFIX, cardId)
  let raw: string | null
  try {
    raw = sessionStorage.getItem(storageKey)
  } catch {
    return []
  }
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const savedAt =
      typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
        ? parsed.savedAt
        : typeof parsed._savedAt === 'number' &&
            Number.isFinite(parsed._savedAt)
          ? parsed._savedAt
          : null
    if (!savedAt || savedAt <= 0) {
      sessionStorage.removeItem(storageKey)
      return []
    }
    const {
      _savedAt: _legacySavedAt,
      savedAt: _legacySavedAtV2,
      version: _legacyVersion,
      cardId: _legacyCardId,
      runs: _legacyRuns,
      ...legacyState
    } = parsed
    const candidateStates =
      parsed.version === CARD_STREAMING_ENVELOPE_VERSION &&
      parsed.cardId === cardId &&
      Array.isArray(parsed.runs)
        ? (parsed.runs as Array<StreamingState>)
        : [legacyState as StreamingState]
    const sanitized = normalizeCardStreamingStates(candidateStates)
    if (sanitized.length === 0) {
      sessionStorage.removeItem(storageKey)
      return []
    }
    const sanitizedRaw = JSON.stringify({
      version: CARD_STREAMING_ENVELOPE_VERSION,
      cardId,
      savedAt,
      runs: sanitized,
    })
    if (sanitizedRaw !== raw) sessionStorage.setItem(storageKey, sanitizedRaw)
    return sanitized
  } catch {
    sessionStorage.removeItem(storageKey)
    return []
  }
}

export function restoreCardStreamingState(
  cardId: string,
): StreamingState | null {
  return restoreCardStreamingStates(cardId).at(-1) ?? null
}

function persistCardWaitingState(
  cardId: string,
  meta: { since: number; runId: string | null },
): void {
  if (typeof sessionStorage === 'undefined' || !isAuthoritativeCardId(cardId)) {
    return
  }
  cleanupLegacyChatStorage()
  try {
    sessionStorage.setItem(
      cardStorageKey(CARD_WAITING_STORAGE_PREFIX, cardId),
      JSON.stringify({ cardId, ...meta }),
    )
  } catch {
    // In-memory Card state remains authoritative when persistence is denied.
  }
}

function removeCardWaitingState(cardId: string): void {
  if (typeof sessionStorage === 'undefined') return
  cleanupLegacyChatStorage()
  try {
    sessionStorage.removeItem(
      cardStorageKey(CARD_WAITING_STORAGE_PREFIX, cardId),
    )
  } catch {
    // In-memory cleanup still succeeds when persistence is denied.
  }
}

function restoreWaitingCards(): {
  keys: Set<string>
  meta: Partial<Record<string, { since: number; runId: string | null }>>
} {
  const keys = new Set<string>()
  const meta: Partial<Record<string, { since: number; runId: string | null }>> =
    {}
  if (typeof sessionStorage === 'undefined') return { keys, meta }
  cleanupLegacyChatStorage()

  const now = Date.now()
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const storageKey = sessionStorage.key(index)
    if (!storageKey?.startsWith(CARD_WAITING_STORAGE_PREFIX)) continue
    const encodedCardId = storageKey.slice(CARD_WAITING_STORAGE_PREFIX.length)
    let cardId = ''
    try {
      cardId = decodeURIComponent(encodedCardId)
      const parsed = JSON.parse(sessionStorage.getItem(storageKey) ?? '') as {
        cardId?: unknown
        since?: unknown
        runId?: unknown
      }
      if (
        !isAuthoritativeCardId(cardId) ||
        parsed.cardId !== cardId ||
        typeof parsed.since !== 'number' ||
        now - parsed.since >= WAITING_TTL_MS
      ) {
        sessionStorage.removeItem(storageKey)
        continue
      }
      keys.add(cardId)
      meta[cardId] = {
        since: parsed.since,
        runId: typeof parsed.runId === 'string' ? parsed.runId : null,
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

function getMessageRunId(msg: ChatMessage | null | undefined): string {
  if (!msg) return ''
  const raw = msg as Record<string, unknown>
  return normalizeString(raw.runId) || normalizeString(raw.run_id)
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
  const raw = msg as Record<string, unknown>
  const value = raw.__historyIndex ?? raw.historyIndex
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

  const leftHistoryIndex = getMessageHistoryIndex(left)
  const rightHistoryIndex = getMessageHistoryIndex(right)
  if (
    leftHistoryIndex !== undefined &&
    rightHistoryIndex !== undefined &&
    leftHistoryIndex !== rightHistoryIndex
  ) {
    return leftHistoryIndex - rightHistoryIndex
  }

  const leftRank = getMessageChronologyRank(left)
  const rightRank = getMessageChronologyRank(right)
  if (leftRank !== rightRank) return leftRank - rightRank

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

const _restoredWaiting = restoreWaitingCards()

export const useChatStore = create<ChatState>((set, get) => ({
  connectionState: 'disconnected',
  lastError: null,
  realtimeMessages: new Map(),
  streamingState: new Map(),
  cardStreamingRuns: new Map(),
  lastEventAt: 0,
  sendStreamRunIds: new Set(),
  waitingSessionKeys: _restoredWaiting.keys,
  waitingSessionMeta: _restoredWaiting.meta,
  heartbeatActivity: null,

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
    cleanupLegacyChatStorage()
    set({ waitingSessionKeys: nextKeys, waitingSessionMeta: nextMeta })
  },

  clearSessionWaiting: (sessionKey) => {
    const nextKeys = new Set(get().waitingSessionKeys)
    nextKeys.delete(sessionKey)
    const { [sessionKey]: _, ...nextMeta } = get().waitingSessionMeta
    cleanupLegacyChatStorage()
    set({ waitingSessionKeys: nextKeys, waitingSessionMeta: nextMeta })
  },

  isSessionWaiting: (sessionKey) => {
    return get().waitingSessionKeys.has(sessionKey)
  },

  setCardWaiting: (cardId, runId) => {
    if (!isAuthoritativeCardId(cardId)) return
    const meta = {
      since: get().waitingSessionMeta[cardId]?.since ?? Date.now(),
      runId: runId ?? null,
    }
    const nextKeys = new Set(get().waitingSessionKeys)
    nextKeys.add(cardId)
    const nextMeta = { ...get().waitingSessionMeta, [cardId]: meta }
    persistCardWaitingState(cardId, meta)
    set({ waitingSessionKeys: nextKeys, waitingSessionMeta: nextMeta })
  },

  clearCardWaiting: (cardId) => {
    if (!isAuthoritativeCardId(cardId)) return
    const nextKeys = new Set(get().waitingSessionKeys)
    nextKeys.delete(cardId)
    const { [cardId]: _, ...nextMeta } = get().waitingSessionMeta
    removeCardWaitingState(cardId)
    set({ waitingSessionKeys: nextKeys, waitingSessionMeta: nextMeta })
  },

  isCardWaiting: (cardId) => {
    return isAuthoritativeCardId(cardId) && get().waitingSessionKeys.has(cardId)
  },

  setHeartbeatActivity: (activity) => {
    set({ heartbeatActivity: activity })
  },

  processEvent: (event, ownerCardId) => {
    if (ownerCardId && !isAuthoritativeCardId(ownerCardId)) return
    const state = get()
    const sessionKey = ownerCardId ?? event.sessionKey
    const now = Date.now()
    const cardRuns = ownerCardId
      ? new Map(state.cardStreamingRuns.get(ownerCardId) ?? [])
      : null
    const explicitRunId =
      normalizeString(event.runId) ||
      (event.type === 'message' ||
      event.type === 'user_message' ||
      event.type === 'done'
        ? getMessageRunId(event.message)
        : '')
    const cardRunId = ownerCardId
      ? explicitRunId ||
        (cardRuns?.size === 1 ? (cardRuns.keys().next().value ?? '') : '')
      : ''
    const previousStreamingState = (
      streamingMap: Map<string, StreamingState>,
    ) => {
      if (ownerCardId && cardRuns && cardRunId) {
        const exactRun = cardRuns.get(cardRunId)
        if (exactRun) return exactRun
        // A legacy owner-only projection may acquire its first immutable run.
        // Once any immutable sibling exists, a new run starts empty.
        if (cardRuns.size > 0) return createEmptyStreamingState()
      }
      return streamingMap.get(sessionKey) ?? createEmptyStreamingState()
    }
    const commitStreamingState = (
      streamingMap: Map<string, StreamingState>,
      next: StreamingState,
    ) => {
      if (!ownerCardId || !cardRuns || !cardRunId) {
        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        return
      }
      const normalizedNext = sanitizeCardStreamingState({
        ...next,
        runId: cardRunId,
      })
      cardRuns.delete(cardRunId)
      cardRuns.set(cardRunId, normalizedNext)
      const nextCardRuns = new Map(state.cardStreamingRuns)
      nextCardRuns.set(ownerCardId, cardRuns)
      streamingMap.set(sessionKey, normalizedNext)
      set({
        streamingState: streamingMap,
        cardStreamingRuns: nextCardRuns,
        lastEventAt: now,
      })
      persistCardStreamingStates(ownerCardId, Array.from(cardRuns.values()))
    }

    // An owner-only event is admissible while there is at most one candidate
    // run. Once a Card has concurrent runs, immutable run identity is required;
    // guessing would overwrite the wrong lifecycle/content row.
    if (ownerCardId && cardRuns && cardRuns.size > 1 && !cardRunId) return

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
        let browserMessage = ownerCardId
          ? withoutTransportOwnership(normalizedMessage)
          : normalizedMessage
        const incomingRunId =
          normalizeString(event.runId) || getMessageRunId(browserMessage)
        if (browserMessage.role === 'assistant' && incomingRunId) {
          browserMessage = {
            ...browserMessage,
            runId: incomingRunId,
            stableId:
              normalizeString(
                (browserMessage as Record<string, unknown>).stableId,
              ) || `stream-run:${incomingRunId}`,
          }
        }

        const newId = getMessageId(browserMessage)
        const newClientNonce = getClientNonce(browserMessage)
        const newMultipartSignature = messageMultipartSignature(browserMessage)

        const optimisticIndexByNonce =
          newClientNonce.length > 0
            ? sessionMessages.findIndex((existing) => {
                if (existing.role !== browserMessage.role) return false
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
            : browserMessage.role === 'user'
              ? sessionMessages.findIndex((existing) => {
                  if (existing.role !== 'user') return false
                  if (!isOptimisticUserCandidate(existing)) return false
                  const existingText = extractMessageText(existing)
                  const incomingText = extractMessageText(browserMessage)
                  if (
                    existingText &&
                    incomingText &&
                    existingText === incomingText
                  ) {
                    return true
                  }
                  const existingAttachments = getAttachmentSignature(existing)
                  const incomingAttachments =
                    getAttachmentSignature(browserMessage)
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
        const newPlainText = extractMessageText(browserMessage)
        const isExternalInboundUser =
          browserMessage.role === 'user' &&
          isExternalInboundUserSource((event as any).source)
        const incomingEventTime =
          getMessageEventTime(normalizedMessage) ?? incomingReceiveTime

        const duplicateIndex = sessionMessages.findIndex((existing) => {
          if (existing.role !== browserMessage.role) return false
          const existingRunId = getMessageRunId(existing)
          if (
            incomingRunId &&
            existingRunId &&
            incomingRunId !== existingRunId
          ) {
            return false
          }
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
          ...browserMessage,
          __realtimeSource:
            event.type === 'user_message' ? (event as any).source : undefined,
          __receiveTime: incomingReceiveTime,
          __realtimeSequence: realtimeMessageSequence++,
          status: undefined,
        }

        if (optimisticIndex >= 0) {
          const optimisticMessage = sessionMessages[optimisticIndex]
          if (!optimisticMessage) break
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
          // Multiple message.started events from the agent create distinct
          // realtime entries with empty content. Replace the previous empty
          // assistant message instead of appending — prevents "3 individual
          // messages then one final" bug where each tool phase looks like a
          // separate assistant bubble.
          if (
            incomingMessage.role === 'assistant' &&
            newPlainText.length === 0 &&
            sessionMessages.length > 0
          ) {
            let prevEmptyIdx = -1
            for (
              let index = sessionMessages.length - 1;
              index >= 0;
              index -= 1
            ) {
              const candidate = sessionMessages[index]
              if (
                candidate?.role === 'assistant' &&
                extractMessageText(candidate).length === 0
              ) {
                prevEmptyIdx = index
                break
              }
            }
            if (prevEmptyIdx >= 0) {
              sessionMessages[prevEmptyIdx] = incomingMessage
              messages.set(
                sessionKey,
                sortMessagesChronologically(sessionMessages),
              )
              set({ realtimeMessages: messages, lastEventAt: now })
              break
            }
          }
          sessionMessages.push(incomingMessage)
          messages.set(sessionKey, sortMessagesChronologically(sessionMessages))
          set({ realtimeMessages: messages, lastEventAt: now })
        }
        break
      }

      case 'chunk': {
        const streamingMap = new Map(state.streamingState)
        const prev = previousStreamingState(streamingMap)

        // Server sends full accumulated text with fullReplace=true
        // Replace entire text (default), or append if fullReplace is explicitly false
        const next: StreamingState = {
          ...prev,
          text: stripFinalTags(
            event.fullReplace === false ? prev.text + event.text : event.text,
          ),
          runId: event.runId ?? prev.runId,
        }

        commitStreamingState(streamingMap, next)

        break
      }

      case 'thinking': {
        const streamingMap = new Map(state.streamingState)
        const prev = previousStreamingState(streamingMap)
        const next: StreamingState = {
          ...prev,
          thinking: event.text,
          runId: event.runId ?? prev.runId,
        }

        commitStreamingState(streamingMap, next)
        break
      }

      case 'status':
      case 'lifecycle': {
        const streamingMap = new Map(state.streamingState)
        const prev = previousStreamingState(streamingMap)
        const next: StreamingState = {
          ...prev,
          runId: event.runId ?? prev.runId,
          lifecycleEvents: [
            ...prev.lifecycleEvents,
            parseLifecycleEvent(event.text, now),
          ],
        }

        commitStreamingState(streamingMap, next)
        break
      }

      case 'tool': {
        const streamingMap = new Map(state.streamingState)
        const prev = previousStreamingState(streamingMap)

        const toolCallId =
          event.toolCallId ??
          `${event.name || 'tool'}-${event.runId || sessionKey}-${prev.toolCalls.length}`
        const existingToolIndex = prev.toolCalls.findIndex(
          (tc) => tc.id === toolCallId,
        )

        const nextToolCalls = [...prev.toolCalls]
        const existingToolCall = nextToolCalls[existingToolIndex]

        const eventArgs = ownerCardId
          ? sanitizeCardOwnedValue(event.args)
          : event.args
        if (existingToolCall) {
          nextToolCalls[existingToolIndex] = {
            ...existingToolCall,
            phase: event.phase,
            args: eventArgs ?? existingToolCall.args,
            preview: (event as any).preview ?? existingToolCall.preview,
            result: (event as any).result ?? existingToolCall.result,
          }
        } else {
          // Create entry for ANY phase (complete, error, skill.loaded, artifact.created, etc.)
          // Events like skill.loaded arrive with phase 'complete' and no prior 'start' — create them too
          nextToolCalls.push({
            id: toolCallId,
            name: event.name,
            phase: event.phase,
            args: eventArgs,
            preview: (event as any).preview,
            result: (event as any).result,
          })
        }

        const next: StreamingState = {
          ...prev,
          runId: event.runId ?? prev.runId,
          toolCalls: nextToolCalls,
        }
        const browserNext = ownerCardId
          ? sanitizeCardStreamingState(next)
          : next

        commitStreamingState(streamingMap, browserNext)
        break
      }

      case 'done': {
        const streamingMap = new Map(state.streamingState)
        const streaming = ownerCardId
          ? cardRuns?.get(cardRunId)
          : streamingMap.get(sessionKey)

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
          const streamToolCallsToEmbed = streaming?.toolCalls.length
            ? streaming.toolCalls
            : undefined
          completeMessage = {
            ...(ownerCardId
              ? withoutTransportOwnership(cleanedMessage)
              : cleanedMessage),
            timestamp: getMessageEventTime(cleanedMessage) ?? now,
            __receiveTime: now,
            __realtimeSequence: realtimeMessageSequence++,
            __streamingStatus:
              event.state === 'interrupted'
                ? 'interrupted'
                : event.state === 'error'
                  ? 'error'
                  : 'complete',
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
            __streamingStatus:
              event.state === 'interrupted'
                ? 'interrupted'
                : event.state === 'error'
                  ? 'error'
                  : 'complete',
          }
        }

        const terminalRunId =
          normalizeString(event.runId) ||
          getMessageRunId(completeMessage) ||
          normalizeString(streaming?.runId)
        if (completeMessage && terminalRunId) {
          completeMessage = {
            ...completeMessage,
            runId: terminalRunId,
            stableId:
              normalizeString(
                (completeMessage as Record<string, unknown>).stableId,
              ) || `stream-run:${terminalRunId}`,
          }
        }
        if (completeMessage && ownerCardId) {
          completeMessage = withoutTransportOwnership(completeMessage)
        }

        let nextRealtimeMessages: Map<string, Array<ChatMessage>> | undefined
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
            const existingRunId = getMessageRunId(existing)
            if (
              terminalRunId &&
              existingRunId &&
              terminalRunId !== existingRunId
            ) {
              return false
            }
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
            nextRealtimeMessages = messages
          } else {
            // If there IS a duplicate (e.g. a tagged pre-final message was stored),
            // replace it with the clean final version so the UI shows clean text.
            const existingIdx = sessionMessages.findIndex((existing) => {
              if (existing.role !== 'assistant') return false
              const existingRunId = getMessageRunId(existing)
              if (
                terminalRunId &&
                existingRunId &&
                terminalRunId !== existingRunId
              ) {
                return false
              }
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
              nextRealtimeMessages = messages
            }
          }
        }

        // Publish the terminal message and remove its streaming projection in a
        // single store update. Subscribers must never observe both rows for the
        // same run, even when terminal persistence is still in flight.
        if (ownerCardId && cardRuns && cardRunId) {
          cardRuns.delete(cardRunId)
          const nextCardRuns = new Map(state.cardStreamingRuns)
          if (cardRuns.size > 0) nextCardRuns.set(ownerCardId, cardRuns)
          else nextCardRuns.delete(ownerCardId)
          const remaining = Array.from(cardRuns.values()).at(-1)
          if (remaining) streamingMap.set(sessionKey, remaining)
          else streamingMap.delete(sessionKey)
          set({
            ...(nextRealtimeMessages
              ? { realtimeMessages: nextRealtimeMessages }
              : {}),
            streamingState: streamingMap,
            cardStreamingRuns: nextCardRuns,
            lastEventAt: now,
          })
          if (remaining) {
            persistCardStreamingStates(
              ownerCardId,
              Array.from(cardRuns.values()),
            )
          } else removePersistedCardStreamingState(ownerCardId)
        } else {
          streamingMap.delete(sessionKey)
          set({
            ...(nextRealtimeMessages
              ? { realtimeMessages: nextRealtimeMessages }
              : {}),
            streamingState: streamingMap,
            lastEventAt: now,
          })
          if (ownerCardId) removePersistedCardStreamingState(ownerCardId)
        }
        break
      }
    }
  },

  processCardEvent: (cardId, event) => {
    if (!isAuthoritativeCardId(cardId)) return
    get().processEvent(event, cardId)
  },

  getCardRealtimeMessages: (cardId) => {
    if (!isAuthoritativeCardId(cardId)) return []
    return get().realtimeMessages.get(cardId) ?? []
  },

  getCardStreamingState: (cardId) => {
    if (!isAuthoritativeCardId(cardId)) return null
    return (
      Array.from(get().cardStreamingRuns.get(cardId)?.values() ?? []).at(-1) ??
      get().streamingState.get(cardId) ??
      restoreCardStreamingState(cardId)
    )
  },

  getCardStreamingStates: (cardId) => {
    if (!isAuthoritativeCardId(cardId)) return []
    const active = Array.from(
      get().cardStreamingRuns.get(cardId)?.values() ?? [],
    )
    if (active.length > 0) return active
    const restored = restoreCardStreamingStates(cardId)
    if (restored.length > 0) return restored
    const projected = get().streamingState.get(cardId)
    return projected ? [projected] : []
  },

  hydrateCardStreamingState: (cardId) => {
    if (
      !isAuthoritativeCardId(cardId) ||
      get().streamingState.has(cardId) ||
      get().cardStreamingRuns.has(cardId)
    )
      return
    const restored = restoreCardStreamingStates(cardId)
    if (restored.length === 0) return
    const streamingState = new Map(get().streamingState)
    streamingState.set(cardId, restored.at(-1)!)
    const cardStreamingRuns = new Map(get().cardStreamingRuns)
    const restoredRuns = restored.filter(
      (state): state is StreamingState & { runId: string } =>
        typeof state.runId === 'string' && state.runId.length > 0,
    )
    if (restoredRuns.length > 0) {
      cardStreamingRuns.set(
        cardId,
        new Map(restoredRuns.map((state) => [state.runId, state])),
      )
    }
    set({ streamingState, cardStreamingRuns, lastEventAt: Date.now() })
  },

  clearCard: (cardId) => {
    if (!isAuthoritativeCardId(cardId)) return
    get().clearSession(cardId)
    get().clearCardWaiting(cardId)
    removePersistedCardStreamingState(cardId)
  },

  clearCardRealtimeBuffer: (cardId) => {
    if (!isAuthoritativeCardId(cardId)) return
    get().clearRealtimeBuffer(cardId)
  },

  clearCardStreaming: (cardId, runId) => {
    if (!isAuthoritativeCardId(cardId)) return
    if (!runId) {
      get().clearStreamingSession(cardId)
      const cardStreamingRuns = new Map(get().cardStreamingRuns)
      cardStreamingRuns.delete(cardId)
      set({ cardStreamingRuns })
      removePersistedCardStreamingState(cardId)
      return
    }
    const runs = new Map(get().cardStreamingRuns.get(cardId) ?? [])
    if (!runs.delete(runId)) return
    const cardStreamingRuns = new Map(get().cardStreamingRuns)
    const streamingState = new Map(get().streamingState)
    const remaining = Array.from(runs.values()).at(-1)
    if (remaining) {
      cardStreamingRuns.set(cardId, runs)
      streamingState.set(cardId, remaining)
      persistCardStreamingStates(cardId, Array.from(runs.values()))
    } else {
      cardStreamingRuns.delete(cardId)
      streamingState.delete(cardId)
      removePersistedCardStreamingState(cardId)
    }
    set({ cardStreamingRuns, streamingState })
  },

  mergeCardHistoryMessages: (cardId, historyMessages) => {
    if (!isAuthoritativeCardId(cardId)) return historyMessages
    return get().mergeHistoryMessages(cardId, historyMessages)
  },

  claimSessionStateForCard: (sessionKey, cardId) => {
    if (!sessionKey || !isAuthoritativeCardId(cardId)) return
    get().handoffSession(sessionKey, cardId)
    const claimedMessages = get().realtimeMessages.get(cardId)
    if (claimedMessages) {
      const realtimeMessages = new Map(get().realtimeMessages)
      realtimeMessages.set(
        cardId,
        claimedMessages.map(withoutTransportOwnership),
      )
      set({ realtimeMessages })
    }
    const runs = Array.from(get().cardStreamingRuns.get(cardId)?.values() ?? [])
    const streaming = get().streamingState.get(cardId)
    if (runs.length > 0) persistCardStreamingStates(cardId, runs)
    else if (streaming) persistCardStreamingStates(cardId, [streaming])
    const waiting = get().waitingSessionMeta[cardId]
    if (waiting) persistCardWaitingState(cardId, waiting)
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
    const cardStreamingRuns = new Map(get().cardStreamingRuns)
    messages.delete(sessionKey)
    streaming.delete(sessionKey)
    cardStreamingRuns.delete(sessionKey)
    set({
      realtimeMessages: messages,
      streamingState: streaming,
      cardStreamingRuns,
    })
  },

  handoffSession: (fromSessionKey, toSessionKey) => {
    if (!fromSessionKey || !toSessionKey || fromSessionKey === toSessionKey)
      return

    const state = get()
    const messages = new Map(state.realtimeMessages)
    const sourceMessages = messages.get(fromSessionKey) ?? []
    const targetMessages = messages.get(toSessionKey) ?? []
    const mergedMessages = [...sourceMessages]
    for (const message of targetMessages) {
      const messageId = getMessageId(message)
      const messageText = extractMessageText(message)
      const isDuplicate = mergedMessages.some((existing) => {
        if (existing.role !== message.role) return false
        const existingId = getMessageId(existing)
        if (messageId && existingId && messageId === existingId) return true
        return Boolean(
          messageText && messageText === extractMessageText(existing),
        )
      })
      if (!isDuplicate) mergedMessages.push(message)
    }
    messages.delete(fromSessionKey)
    if (mergedMessages.length > 0) {
      messages.set(toSessionKey, sortMessagesChronologically(mergedMessages))
    }

    const streaming = new Map(state.streamingState)
    const sourceStreaming = streaming.get(fromSessionKey)
    const targetStreaming = streaming.get(toSessionKey)
    streaming.delete(fromSessionKey)
    if (sourceStreaming || targetStreaming) {
      const primary = (sourceStreaming ?? targetStreaming) as StreamingState
      const secondary = (targetStreaming ?? sourceStreaming) as StreamingState
      const toolCalls = [...primary.toolCalls]
      for (const toolCall of secondary.toolCalls) {
        const index = toolCalls.findIndex(
          (candidate) => candidate.id === toolCall.id,
        )
        if (index >= 0) toolCalls[index] = { ...toolCalls[index], ...toolCall }
        else toolCalls.push(toolCall)
      }
      const lifecycleEvents = [...primary.lifecycleEvents]
      for (const lifecycleEvent of secondary.lifecycleEvents) {
        const isDuplicate = lifecycleEvents.some(
          (candidate) =>
            candidate.text === lifecycleEvent.text &&
            candidate.timestamp === lifecycleEvent.timestamp,
        )
        if (!isDuplicate) lifecycleEvents.push(lifecycleEvent)
      }
      const nextStreaming: StreamingState = {
        ...primary,
        runId: primary.runId ?? secondary.runId ?? null,
        text:
          primary.text.length >= secondary.text.length
            ? primary.text
            : secondary.text,
        thinking: primary.thinking || secondary.thinking,
        toolCalls,
        lifecycleEvents,
      }
      streaming.set(toSessionKey, nextStreaming)
    }

    const waitingSessionKeys = new Set(state.waitingSessionKeys)
    const waitingSessionMeta = { ...state.waitingSessionMeta }
    const sourceWaiting = waitingSessionMeta[fromSessionKey]
    if (waitingSessionKeys.delete(fromSessionKey)) {
      waitingSessionKeys.add(toSessionKey)
      waitingSessionMeta[toSessionKey] =
        waitingSessionMeta[toSessionKey] ?? sourceWaiting
      delete waitingSessionMeta[fromSessionKey]
    }

    set({
      realtimeMessages: messages,
      streamingState: streaming,
      waitingSessionKeys,
      waitingSessionMeta,
    })
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
    if (get().streamingState.size === 0 && get().cardStreamingRuns.size === 0)
      return
    set({ streamingState: new Map(), cardStreamingRuns: new Map() })
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
        // Streaming realtime text is a prefix of the final server text.
        // Match either direction to prevent duplicates when the server
        // returns the complete message after the realtime buffer had a
        // partial version.
        if (rtText.length > 0 && histText.length > 0) {
          if (histText.startsWith(rtText) || rtText.startsWith(histText))
            return true
        }
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
