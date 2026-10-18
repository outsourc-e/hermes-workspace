import { stripQueuedWrapper } from '@/lib/strip-queued-wrapper'
import { textFromMessage } from './utils'
import type { ChatAttachment, ChatMessage } from './types'


export type StickyStreamingTextState = {
  runId: string | null
  text: string
}

export function advanceStickyStreamingText(params: {
  isStreaming: boolean
  runId: string | null
  rawText: string
  smoothedText: string
  previousState: StickyStreamingTextState
}): StickyStreamingTextState {
  const { isStreaming, runId, rawText, smoothedText, previousState } = params

  if (!isStreaming) {
    return { runId: null, text: '' }
  }

  const nextRunId = runId ?? previousState.runId ?? 'streaming'
  const isNewRun = nextRunId !== previousState.runId
  const candidateText = smoothedText || rawText
  const nextText = candidateText.length > 0
    ? candidateText
    : isNewRun
      ? ''
      : previousState.text

  return {
    runId: nextRunId,
    text: nextText,
  }
}

type OptimisticMessagePayload = {
  clientId: string
  optimisticId: string
  optimisticMessage: ChatMessage
}

export function createOptimisticMessage(
  body: string,
  attachments: Array<ChatAttachment> = [],
): OptimisticMessagePayload {
  const clientId = crypto.randomUUID()
  const optimisticId = `opt-${clientId}`
  const timestamp = Date.now()
  const textContent =
    body.length > 0 ? [{ type: 'text' as const, text: body }] : []

  const optimisticMessage: ChatMessage = {
    role: 'user',
    content: textContent.length > 0 ? textContent : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    __optimisticId: optimisticId,
    __createdAt: timestamp,
    clientId,
    client_id: clientId,
    status: 'sending',
    timestamp,
  }

  return { clientId, optimisticId, optimisticMessage }
}


// ── Ported from chat-screen.tsx (screen pure helpers) ──────────────
export function stripQueuedWrapperFromUserMessage(message: ChatMessage): ChatMessage {
  if (message.role !== 'user') return message

  const text = textFromMessage(message)
  const cleanedText = stripQueuedWrapper(text)
  if (cleanedText === text) return message

  return {
    ...message,
    content: [{ type: 'text', text: cleanedText }],
    text: cleanedText,
    body: cleanedText,
    message: cleanedText,
  }
}

export function shouldCollapseTextDuplicate(
  existing: ChatMessage,
  candidate: ChatMessage,
): boolean {
  if (existing.role !== candidate.role) return false

  if (candidate.role === 'assistant') {
    return true
  }

  if (candidate.role !== 'user') return false

  const existingTs = getMessageTimestampValue(existing)
  const candidateTs = getMessageTimestampValue(candidate)
  if (existingTs !== null && candidateTs !== null) {
    if (Math.abs(existingTs - candidateTs) > 15_000) return false
  }

  // Collapse same-turn user duplicates even after the optimistic marker has been
  // cleared. The send path can leave us with an optimistic local message plus a
  // confirmed/history copy after completion; requiring one side to still look
  // optimistic misses that handoff and leaves both visible.
  const existingSig = getMessageAttachmentSignature(existing)
  const candidateSig = getMessageAttachmentSignature(candidate)
  if (existingSig && candidateSig) {
    return existingSig === candidateSig
  }

  return true
}

export function isOptimisticUserMessage(message: ChatMessage): boolean {
  const raw = message as Record<string, unknown>
  return (
    normalizeMessageValue(raw.__optimisticId).length > 0 ||
    ['sending', 'sent', 'done'].includes(getMessageStatusValue(message))
  )
}

export function getMessageAttachmentSignature(message: ChatMessage): string {
  if (!Array.isArray(message.attachments) || message.attachments.length === 0) {
    return ''
  }

  return message.attachments
    .map((attachment) => {
      const name = typeof attachment?.name === 'string' ? attachment.name : ''
      const size =
        typeof attachment?.size === 'number' ? String(attachment.size) : ''
      const type =
        typeof attachment?.contentType === 'string'
          ? attachment.contentType
          : ''
      return `${name}:${size}:${type}`
    })
    .sort()
    .join('|')
}

export function getMessageTimestampValue(message: ChatMessage): number | null {
  const raw = message as Record<string, unknown>
  const candidates = [
    raw.timestamp,
    raw.__createdAt,
    raw.createdAt,
    raw.created_at,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate < 1_000_000_000_000 ? candidate * 1000 : candidate
    }
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate)
      if (!Number.isNaN(parsed)) return parsed
    }
  }

  return null
}

export function getMessageStatusValue(message: ChatMessage): string {
  return normalizeMessageValue((message as Record<string, unknown>).status)
}

export function getMessageRetryAttachments(
  message: ChatMessage,
): Array<ChatAttachment> {
  if (!Array.isArray(message.attachments)) return []
  return message.attachments.filter((attachment) => {
    return Boolean(attachment) && typeof attachment === 'object'
  })
}

export function isRetryableQueuedMessage(message: ChatMessage): boolean {
  if ((message.role || '') !== 'user') return false
  const raw = message as Record<string, unknown>
  const status = normalizeMessageValue(raw.status)
  return status === 'error'
}

export function getRetryMessageKey(message: ChatMessage): string {
  const clientId = getMessageClientId(message)
  if (clientId) return `client:${clientId}`

  const raw = message as Record<string, unknown>
  const optimisticId = normalizeMessageValue(raw.__optimisticId)
  if (optimisticId) return `optimistic:${optimisticId}`

  const messageId = normalizeMessageValue(raw.id)
  if (messageId) return `id:${messageId}`

  const timestamp = normalizeMessageValue(
    typeof raw.timestamp === 'number' ? String(raw.timestamp) : raw.timestamp,
  )
  const messageText = textFromMessage(message).trim()
  return `fallback:${message.role ?? 'unknown'}:${timestamp}:${messageText}`
}

export function getMessageClientId(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  const directClientId = normalizeMessageValue(raw.clientId)
  if (directClientId) return directClientId

  const alternateClientId = normalizeMessageValue(raw.client_id)
  if (alternateClientId) return alternateClientId

  const optimisticId = normalizeMessageValue(raw.__optimisticId)
  if (optimisticId.startsWith('opt-')) {
    return optimisticId.slice(4)
  }
  return ''
}

export function messageFallbackSignature(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  const timestamp = normalizeMessageValue(
    typeof raw.timestamp === 'number' ? String(raw.timestamp) : raw.timestamp,
  )

  const contentParts = Array.isArray(message.content)
    ? message.content
        .map((part: any) => {
          if (part.type === 'text') {
            return `t:${typeof part.text === 'string' ? part.text.trim() : ''}`
          }
          if (part.type === 'thinking') {
            return `th:${typeof part.thinking === 'string' ? part.thinking : ''}`
          }
          if (part.type === 'toolCall') {
            const toolPart = part
            return `tc:${toolPart.id ?? ''}:${toolPart.name ?? ''}`
          }
          return `p:${part.type ?? ''}`
        })
        .join('|')
    : ''

  const attachments = Array.isArray(message.attachments)
    ? message.attachments
        .map((attachment) => {
          const name =
            typeof attachment?.name === 'string' ? attachment.name : ''
          const size =
            typeof attachment?.size === 'number' ? String(attachment.size) : ''
          const type =
            typeof attachment?.contentType === 'string'
              ? attachment.contentType
              : ''
          return `${name}:${size}:${type}`
        })
        .join('|')
    : ''

  return `${message.role ?? 'unknown'}:${timestamp}:${contentParts}:${attachments}`
}

export function exportConversationTranscript(payload: {
  sessionLabel: string
  messages: Array<ChatMessage>
}) {
  if (typeof document === 'undefined') return false

  const sessionToken =
    sanitizeExportToken(payload.sessionLabel) || 'conversation'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const body = payload.messages
    .map((message) => {
      const role =
        typeof message.role === 'string' && message.role.trim()
          ? message.role.trim().toUpperCase()
          : 'MESSAGE'
      const text = textFromMessage(message).trim()
      const attachments = Array.isArray(message.attachments)
        ? message.attachments
            .map((attachment) => attachment?.name?.trim())
            .filter((value): value is string => Boolean(value))
        : []

      const lines = [`## ${role}`]
      if (text) lines.push(text)
      if (attachments.length > 0) {
        lines.push('', 'Attachments:')
        for (const attachment of attachments) {
          lines.push(`- ${attachment}`)
        }
      }
      return lines.join('\n')
    })
    .join('\n\n')
    .trim()

  const content = `# Hermes Conversation Export\n\nSession: ${payload.sessionLabel}\nExported: ${new Date().toISOString()}\n\n${body || '_No messages in this conversation._'}\n`
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sessionToken}-${timestamp}.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

export function sanitizeExportToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildPortableHistory(
  messages: Array<ChatMessage>,
): Array<PortableHistoryMessage> {
  return messages
    .filter(
      (
        message,
      ): message is ChatMessage & { role: 'user' | 'assistant' | 'system' } =>
        message.role === 'user' ||
        message.role === 'assistant' ||
        message.role === 'system',
    )
    .filter((message) => (message as any).__streamingStatus !== 'streaming')
    .map((message) => {
      const content = getPortableHistoryContent(message)
      if (!content) return null
      return {
        role: message.role,
        content,
      }
    })
    .filter((message): message is PortableHistoryMessage => message !== null)
    .slice(-20)
}

export function getPortableHistoryContent(message: ChatMessage): string {
  const text = textFromMessage(message).trim()
  if (text) return text
  if (
    message.role === 'user' &&
    Array.isArray(message.attachments) &&
    message.attachments.length > 0
  ) {
    return 'Please review the attached content.'
  }
  return ''
}

export function normalizeMessageValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

export function stripDataUrlPrefix(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const commaIndex = trimmed.indexOf(',')
  if (trimmed.toLowerCase().startsWith('data:') && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1).trim()
  }
  return trimmed
}

export function readDataUrlMimeType(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = /^data:([^;,]+)[^,]*,/i.exec(value.trim())
  return match?.[1]?.trim().toLowerCase() || ''
}

export function isImageMimeType(value: unknown): boolean {
  const normalized = normalizeMimeType(value)
  return normalized.startsWith('image/')
}

export function normalizeMimeType(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

export type PortableHistoryMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type ChatScreenProps = {
  activeFriendlyId: string
  isNewChat?: boolean
  onSessionResolved?: (payload: {
    sessionKey: string
    friendlyId: string
  }) => void
  forcedSessionKey?: string
  /** Hide header + file explorer + terminal for panel mode */
  compact?: boolean
  /**
   * Disables internal `navigate()` side effects so the chat can be embedded
   * in other routes (e.g. Operations orchestrator card) without yanking the
   * user out to /chat/<uuid> on mount, refresh, or after send.
   */
  embedded?: boolean
}
