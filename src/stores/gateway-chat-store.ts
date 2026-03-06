import { create } from 'zustand'
import type {
  GatewayMessage,
  MessageContent,
  ToolCallContent,
  ThinkingContent,
  TextContent,
} from '../screens/chat/types'

export type ChatStreamEvent =
  | { type: 'message'; message: GatewayMessage; sessionKey: string }
  | {
      type: 'chunk'
      text: string
      runId?: string
      sessionKey: string
      fullReplace?: boolean
    }
  | { type: 'thinking'; text: string; runId?: string; sessionKey: string }
  | {
      type: 'tool'
      phase: string
      name: string
      toolCallId?: string
      args?: unknown
      runId?: string
      sessionKey: string
    }
  | {
      type: 'done'
      state: string
      errorMessage?: string
      runId?: string
      sessionKey: string
      message?: GatewayMessage
    }
  | {
      type: 'user_message'
      message: GatewayMessage
      sessionKey: string
      source?: string
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
  toolCalls: Array<{
    id: string
    name: string
    phase: string
    args?: unknown
    result?: string
  }>
}

type GatewayChatState = {
  connectionState: ConnectionState
  lastError: string | null
  /** Messages received via real-time stream, keyed by sessionKey */
  realtimeMessages: Map<string, Array<GatewayMessage>>
  /** Current streaming state per session */
  streamingState: Map<string, StreamingState>
  /** Timestamp of last received event */
  lastEventAt: number
  /**
   * RunIds currently being handled by send-stream (the active send SSE).
   * chat-events must skip chunk/done events for these runIds to avoid duplicates.
   */
  sendStreamRunIds: Set<string>

  // Actions
  setConnectionState: (state: ConnectionState, error?: string) => void
  processEvent: (event: ChatStreamEvent) => void
  getRealtimeMessages: (sessionKey: string) => Array<GatewayMessage>
  getStreamingState: (sessionKey: string) => StreamingState | null
  clearSession: (sessionKey: string) => void
  clearRealtimeBuffer: (sessionKey: string) => void
  clearStreamingSession: (sessionKey: string) => void
  clearAllStreaming: () => void
  mergeHistoryMessages: (
    sessionKey: string,
    historyMessages: Array<GatewayMessage>,
  ) => Array<GatewayMessage>
  /** Register a runId as being handled by send-stream — chat-events will skip it */
  registerSendStreamRun: (runId: string) => void
  /** Unregister a runId when send-stream completes */
  unregisterSendStreamRun: (runId: string) => void
  /** Check if a runId is being handled by send-stream */
  isSendStreamRun: (runId: string | undefined) => boolean
}

const createEmptyStreamingState = (): StreamingState => ({
  runId: null,
  text: '',
  thinking: '',
  toolCalls: [],
})

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Strip <final>...</final> wrapper tags that the OpenClaw gateway emits as a
 * streaming-completion sentinel in agent chunk events.
 *
 * The gateway sometimes wraps the last streaming chunk (or a standalone
 * assistant-message event that fires before the formal `state: 'final'` chat
 * event) in <final>…</final> tags.  When the subsequent clean `done` event
 * arrives, the dedup logic compares its text against the already-stored tagged
 * version — they don't match — so BOTH messages end up in realtimeMessages and
 * appear side-by-side in the UI.
 *
 * Stripping these tags at the store boundary (before storing or comparing)
 * ensures the two copies are treated as the same message regardless of whether
 * the gateway included the sentinel tags or not.
 */
function stripFinalTags(text: string): string {
  // <final>…</final>  — strip outer wrapper (case-insensitive, allows whitespace)
  let result = text.replace(/^\s*<final>\s*([\s\S]*?)\s*<\/final>\s*$/i, '$1').trim()
  // P7: strip internal model tags that should never appear in rendered output.
  // Matches gateway control UI's rg/ig/ag stripping functions.
  // Respects code blocks — only strip tags outside of ``` fences.
  result = stripInternalTags(result)
  return result
}

/**
 * Strip internal model tags (<thinking>, <antThinking>, <thought>,
 * <parameter name="newText">, <relevant_memories>) that can leak into
 * displayed text. Only strips outside code blocks to avoid breaking code samples.
 * Mirrors the gateway control UI's tag-stripping pipeline.
 */
function stripInternalTags(text: string): string {
  // Split on code blocks to avoid stripping inside them
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part // inside code block — leave untouched
    return part
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .replace(/<antThinking>[\s\S]*?<\/antThinking>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<parameter name="newText">[\s\S]*?<\/antml:parameter>/gi, '')
      .replace(/<relevant_memories>[\s\S]*?<\/relevant_memories>/gi, '')
      .trim()
  }).join('')
}

/**
 * Return a copy of `msg` with <final>...</final> tags stripped from all text
 * content blocks.  Other content types (thinking, toolCall, etc.) are left
 * untouched.  If the message has no text content the original object is
 * returned as-is so we don't allocate unnecessarily.
 */
function stripFinalTagsFromMessage(msg: GatewayMessage): GatewayMessage {
  let modified = false
  const rawMessage = msg as Record<string, unknown>
  const nextMessage: GatewayMessage & Record<string, unknown> = { ...msg }

  if (Array.isArray(msg.content)) {
    const nextContent = msg.content.map((part) => {
      if (part.type !== 'text') return part
      const raw = (part as any).text ?? ''
      const stripped = stripFinalTags(typeof raw === 'string' ? raw : String(raw))
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

function getMessageId(msg: GatewayMessage | null | undefined): string | undefined {
  if (!msg) return undefined
  const id = (msg as { id?: string }).id
  if (typeof id === 'string' && id.trim().length > 0) return id
  const messageId = (msg as { messageId?: string }).messageId
  if (typeof messageId === 'string' && messageId.trim().length > 0) return messageId
  return undefined
}

function getClientNonce(msg: GatewayMessage | null | undefined): string {
  if (!msg) return ''
  const raw = msg as Record<string, unknown>
  return (
    normalizeString(raw.clientId) ||
    normalizeString(raw.client_id) ||
    normalizeString(raw.nonce) ||
    normalizeString(raw.idempotencyKey)
  )
}

function messageMultipartSignature(msg: GatewayMessage | null | undefined): string {
  if (!msg) return ''
  let content = Array.isArray(msg.content)
    ? msg.content
        .map((part) => {
          if (part.type === 'text') return `t:${String((part as any).text ?? '').trim()}`
          if (part.type === 'thinking') return `h:${String((part as any).thinking ?? '').trim()}`
          if (part.type === 'toolCall') return `tc:${String((part as any).id ?? '')}:${String((part as any).name ?? '')}`
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
        .map((attachment: any) => `${String(attachment?.name ?? '')}:${String(attachment?.size ?? '')}:${String(attachment?.contentType ?? '')}`)
        .join('|')
    : ''
  return `${msg.role ?? 'unknown'}:${content}:${attachments}`
}

export const useGatewayChatStore = create<GatewayChatState>((set, get) => ({
  connectionState: 'disconnected',
  lastError: null,
  realtimeMessages: new Map(),
  streamingState: new Map(),
  lastEventAt: 0,
  sendStreamRunIds: new Set(),

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

  processEvent: (event) => {
    const state = get()
    const sessionKey = event.sessionKey
    const now = Date.now()

    // Skip chunk/thinking/tool/done events for runs being handled by send-stream.
    // send-stream is the authoritative handler for active sends — chat-events
    // fires the same events in parallel, causing duplicate messages.
    if (
      (event.type === 'chunk' || event.type === 'thinking' || event.type === 'tool' || event.type === 'done') &&
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
        // gateway-injected control messages — mirror the filter in use-chat-history.ts.
        if (event.message.role === 'user') {
          const rawText = extractMessageText(event.message)
          if (
            rawText.startsWith('Pre-compaction memory flush') ||
            rawText.includes('Store durable memories now') ||
            rawText.includes('APPEND new content only and do not overwrite') ||
            rawText.startsWith('A subagent task') ||
            rawText.startsWith('[Queued announce messages') ||
            rawText.includes('Summarize this naturally for the user') ||
            (rawText.includes('Stats: runtime') && rawText.includes('sessionKey agent:'))
          ) {
            break
          }
        }

        const messages = new Map(state.realtimeMessages)
        const sessionMessages = [...(messages.get(sessionKey) ?? [])]

        // Strip <final>…</final> sentinel tags from assistant messages before
        // storing or comparing.  The gateway can emit a bare assistant-message
        // event (state=undefined) whose text is still wrapped in these tags,
        // and the subsequent clean `done` event then fails the dedup check
        // because the stored text differs from the final text.
        const normalizedMessage =
          event.message.role === 'assistant'
            ? stripFinalTagsFromMessage(event.message)
            : event.message

        const newId = getMessageId(normalizedMessage)
        const newClientNonce = getClientNonce(normalizedMessage)
        const newMultipartSignature = messageMultipartSignature(normalizedMessage)

        const optimisticIndex =
          newClientNonce.length > 0
            ? sessionMessages.findIndex((existing) => {
                if (existing.role !== normalizedMessage.role) return false
                const existingNonce = getClientNonce(existing)
                if (existingNonce.length === 0 || existingNonce !== newClientNonce) {
                  return false
                }
                return (
                  normalizeString((existing as any).status) === 'sending' ||
                  Boolean((existing as any).__optimisticId)
                )
              })
            : -1

        // Plain-text extraction for content-based dedup (catches identical
        // replies that arrive with different IDs from different channels).
        const newPlainText = extractMessageText(normalizedMessage)

        const duplicateIndex = sessionMessages.findIndex((existing) => {
          if (existing.role !== normalizedMessage.role) return false
          const existingId = getMessageId(existing)
          if (newId && existingId && newId === existingId) return true

          const existingNonce = getClientNonce(existing)
          if (newClientNonce && existingNonce && newClientNonce === existingNonce) {
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
          // (e.g. same reply routed from Telegram + ClawSuite).
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
        const incomingMessage: GatewayMessage = {
          ...normalizedMessage,
          __realtimeSource:
            event.type === 'user_message' ? (event as any).source : undefined,
          status: undefined,
        }

        if (optimisticIndex >= 0) {
          sessionMessages[optimisticIndex] = {
            ...sessionMessages[optimisticIndex],
            ...incomingMessage,
          }
          messages.set(sessionKey, sessionMessages)
          set({ realtimeMessages: messages, lastEventAt: now })
          break
        }

        if (duplicateIndex === -1) {
          sessionMessages.push(incomingMessage)
          messages.set(sessionKey, sessionMessages)
          set({ realtimeMessages: messages, lastEventAt: now })
        }
        break
      }

      case 'chunk': {
        const streamingMap = new Map(state.streamingState)
        const prev =
          streamingMap.get(sessionKey) ?? createEmptyStreamingState()

        // Gateway sends full accumulated text with fullReplace=true
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
        break
      }

      case 'thinking': {
        const streamingMap = new Map(state.streamingState)
        const prev =
          streamingMap.get(sessionKey) ?? createEmptyStreamingState()
        const next: StreamingState = {
          ...prev,
          thinking: event.text,
          runId: event.runId ?? prev.runId,
        }

        streamingMap.set(sessionKey, next)
        set({ streamingState: streamingMap, lastEventAt: now })
        break
      }

      case 'tool': {
        const streamingMap = new Map(state.streamingState)
        const prev =
          streamingMap.get(sessionKey) ?? createEmptyStreamingState()

        const toolCallId =
          event.toolCallId ??
          `${event.name || 'tool'}-${event.runId || sessionKey}-${prev.toolCalls.length}`
        const existingToolIndex = prev.toolCalls.findIndex(
          (tc) => tc.id === toolCallId,
        )

        let nextToolCalls = [...prev.toolCalls]

        if (existingToolIndex >= 0) {
          nextToolCalls[existingToolIndex] = {
            ...nextToolCalls[existingToolIndex],
            phase: event.phase,
            args: event.args,
            result: (event as any).result ?? nextToolCalls[existingToolIndex].result,
          }
        } else if (event.phase === 'calling' || event.phase === 'start') {
          nextToolCalls.push({
            id: toolCallId,
            name: event.name,
            phase: event.phase,
            args: event.args,
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
        break
      }

      case 'done': {
        const streamingMap = new Map(state.streamingState)
        const streaming = streamingMap.get(sessionKey)

        // Build the complete message — prefer authoritative final payload (bug #8 fix)
        let completeMessage: GatewayMessage | null = null

        if (event.message) {
          // Prefer done event's message payload — it's the authoritative final response.
          // Strip <final>…</final> sentinel tags: the `done` message may still carry
          // them if the gateway serialises the final state from its streaming buffer.
          const cleanedMessage = stripFinalTagsFromMessage(event.message)
          // Preserve tool calls from streaming state on the final message so
          // ToolCallPill can render them even after streaming state is cleared.
          // Fast tool runs clear streaming state before React renders — embedding
          // __streamToolCalls ensures pills survive in the history message.
          const streamToolCallsToEmbed = streaming?.toolCalls?.length
            ? streaming.toolCalls
            : undefined
          completeMessage = {
            ...cleanedMessage,
            timestamp: now,
            __streamingStatus: 'complete' as any,
            ...(streamToolCallsToEmbed ? { __streamToolCalls: streamToolCallsToEmbed } : {}),
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
            if (completeId && existingId && completeId === existingId) return true
            if (completeText && completeText === extractMessageText(existing)) return true
            return false
          })

          if (!isDuplicate) {
            sessionMessages.push(completeMessage)
            messages.set(sessionKey, sessionMessages)
            set({ realtimeMessages: messages })
          } else {
            // If there IS a duplicate (e.g. a tagged pre-final message was stored),
            // replace it with the clean final version so the UI shows clean text.
            const existingIdx = sessionMessages.findIndex((existing) => {
              if (existing.role !== 'assistant') return false
              const existingId = getMessageId(existing)
              if (completeId && existingId && completeId === existingId) return true
              if (completeText && completeText === extractMessageText(existing)) return true
              return false
            })
            if (existingIdx >= 0) {
              sessionMessages[existingIdx] = {
                ...sessionMessages[existingIdx],
                ...completeMessage,
              }
              messages.set(sessionKey, sessionMessages)
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
      return historyMessages
    }

    // Find messages in realtime that aren't in history yet.
    //
    // CRITICAL: use extractMessageText() (not extractTextFromContent) so that
    // SSE echoes with top-level text/body/message fields are matched against
    // optimistic messages that use the content-array format. This was the root
    // cause of the persistent duplicate-message bug — mergeHistoryMessages was
    // the only layer that didn't handle the format mismatch, so the SSE echo
    // always survived the merge and appeared alongside the optimistic copy.
    const newRealtimeMessages = realtimeMessages.filter((rtMsg) => {
      const rtId = getMessageId(rtMsg)
      const rtText = extractMessageText(rtMsg)
      const rtNonce = getClientNonce(rtMsg)
      const rtSignature = messageMultipartSignature(rtMsg)

      return !historyMessages.some((histMsg) => {
        const histId = getMessageId(histMsg)
        if (rtId && histId && rtId === histId) {
          return true
        }

        const histNonce = getClientNonce(histMsg)
        if (rtNonce && histNonce && rtNonce === histNonce) {
          return true
        }

        // Text match: use multi-format extraction for both sides so that
        // content-array messages match top-level text field messages.
        if (histMsg.role === rtMsg.role && rtText) {
          const histText = extractMessageText(histMsg)
          if (histText === rtText) return true
        }

        // Optimistic message match: same role + (text OR attachment sig)
        const histRaw = histMsg as Record<string, unknown>
        const histIsOptimistic =
          normalizeString(histRaw.status) === 'sending' ||
          normalizeString(histRaw.__optimisticId).length > 0

        if (histIsOptimistic && histMsg.role === rtMsg.role) {
          // Text-based match (plain text messages)
          if (rtText) {
            const histText = extractMessageText(histMsg)
            if (histText === rtText) return true
            // Prefix match: the gateway may enrich the body with inline
            // <attachment> tags that weren't in the original optimistic message.
            // The enriched body starts with the original text.
            if (histText && rtText.startsWith(histText)) return true
          }
          // Attachment-based match for paste/image messages
          const rtAttachments = Array.isArray((rtMsg as any).attachments)
            ? (rtMsg as any).attachments as Array<Record<string, unknown>>
            : []
          const histAttachments = Array.isArray((histMsg as any).attachments)
            ? (histMsg as any).attachments as Array<Record<string, unknown>>
            : []
          if (
            rtAttachments.length > 0 &&
            rtAttachments.length === histAttachments.length
          ) {
            const rtSig = rtAttachments
              .map(
                (a) =>
                  `${normalizeString(a.name)}:${String(a.size ?? '')}`,
              )
              .sort()
              .join('|')
            const histSig = histAttachments
              .map(
                (a) =>
                  `${normalizeString(a.name)}:${String(a.size ?? '')}`,
              )
              .sort()
              .join('|')
            if (rtSig && rtSig === histSig) return true
          }
        }

        return (
          rtSignature.length > 0 &&
          rtSignature === messageMultipartSignature(histMsg)
        )
      })
    })

    if (newRealtimeMessages.length === 0) {
      return historyMessages
    }

    // Append new realtime messages to history
    return [...historyMessages, ...newRealtimeMessages]
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
 * Extract text from a GatewayMessage using multiple strategies:
 *   1. content array (canonical format)
 *   2. top-level text/body/message fields (legacy / some gateway adapters)
 *
 * Some gateways echo user messages with a top-level `text` field instead of
 * the `content` array. Using only extractTextFromContent() would return ''
 * for those, causing dedup to fail in mergeHistoryMessages.
 */
function extractMessageText(msg: GatewayMessage | null | undefined): string {
  if (!msg) return ''
  const fromContent = extractTextFromContent(msg.content)
  if (fromContent.length > 0) return fromContent

  const raw = msg as Record<string, unknown>
  for (const key of ['text', 'body', 'message']) {
    const val = raw[key]
    if (typeof val === 'string' && val.trim().length > 0) return stripFinalTags(val.trim())
  }
  return ''
}
