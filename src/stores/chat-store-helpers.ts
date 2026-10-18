// Pure message-utility helpers extracted from chat-store.ts (behavior-preserving).
// No zustand/state access — everything here is a pure function over message data.
import type {
  ChatMessage,
  MessageContent,
  TextContent,
  ThinkingContent,
  ToolCallContent,
} from '../screens/chat/types'

export function normalizeString(value: unknown): string {
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
export function stripFinalTags(text: string): string {
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
export function stripInternalTags(text: string): string {
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

export function parseLifecycleEvent(
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
export function stripFinalTagsFromMessage(msg: ChatMessage): ChatMessage {
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

export function getMessageId(msg: ChatMessage | null | undefined): string | undefined {
  if (!msg) return undefined
  const id = (msg as { id?: string }).id
  if (typeof id === 'string' && id.trim().length > 0) return id
  const messageId = (msg as { messageId?: string }).messageId
  if (typeof messageId === 'string' && messageId.trim().length > 0)
    return messageId
  return undefined
}

export function getClientNonce(msg: ChatMessage | null | undefined): string {
  if (!msg) return ''
  const raw = msg as Record<string, unknown>
  return (
    normalizeString(raw.clientId) ||
    normalizeString(raw.client_id) ||
    normalizeString(raw.nonce) ||
    normalizeString(raw.idempotencyKey)
  )
}

export function getMessageEventTime(
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

export function getMessageReceiveTime(
  msg: ChatMessage | null | undefined,
): number | undefined {
  if (!msg) return undefined
  const value = (msg as Record<string, unknown>).__receiveTime
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function getMessageHistoryIndex(
  msg: ChatMessage | null | undefined,
): number | undefined {
  if (!msg) return undefined
  const raw = msg as Record<string, unknown>
  const value = raw.__historyIndex ?? raw.historyIndex
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function getMessageRealtimeSequence(
  msg: ChatMessage | null | undefined,
): number | undefined {
  if (!msg) return undefined
  const value = (msg as Record<string, unknown>).__realtimeSequence
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function hasToolCalls(msg: ChatMessage | null | undefined): boolean {
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

export function getMessageChronologyRank(msg: ChatMessage): number {
  const role = normalizeString(msg.role).toLowerCase()
  if (role === 'user') return 0
  if (role === 'assistant' && hasToolCalls(msg)) return 1
  if (role === 'tool' || role === 'toolresult' || role === 'tool_result')
    return 2
  if (role === 'assistant') return 3
  return 4
}

export function compareMessagesByTime(left: ChatMessage, right: ChatMessage): number {
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

export function sortMessagesChronologically(
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

export function isExternalInboundUserSource(source: unknown): boolean {
  const normalized = normalizeString(source).toLowerCase()
  return (
    normalized === 'webchat' ||
    normalized === 'signal' ||
    normalized === 'telegram'
  )
}

export function getAttachmentSignature(msg: ChatMessage | null | undefined): string {
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

export function isOptimisticUserCandidate(
  msg: ChatMessage | null | undefined,
): boolean {
  if (!msg || msg.role !== 'user') return false
  const raw = msg as Record<string, unknown>
  return (
    normalizeString(raw.__optimisticId).length > 0 ||
    ['sending', 'queued', 'sent', 'done'].includes(normalizeString(raw.status))
  )
}

export function messageMultipartSignature(
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

export function extractTextFromContent(
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
export function extractMessageText(msg: ChatMessage | null | undefined): string {
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

export function ensureAssistantTextContent(msg: ChatMessage): ChatMessage {
  if (msg.role !== 'assistant') return msg
  if (Array.isArray(msg.content) && msg.content.length > 0) return msg

  const text = extractMessageText(msg)
  if (!text) return msg

  return {
    ...msg,
    content: [{ type: 'text', text } as TextContent],
  }
}

export function mergeRealtimeAssistantMetadata(
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
