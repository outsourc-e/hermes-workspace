import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStream } from '../../../hooks/use-chat-stream'
import { useChatStore } from '../../../stores/chat-store'
import type { StreamingState } from '../../../stores/chat-store'
import { appendHistoryMessage, chatQueryKeys } from '../chat-queries'
import { toast } from '../../../components/ui/toast'
import type { ChatMessage } from '../types'
import { textFromMessage } from '../utils'

/** Read clientId from a message using either camelCase or snake_case field. */
function readClientId(message: ChatMessage): string {
  const raw = message as Record<string, unknown>
  for (const key of ['clientId', 'client_id']) {
    const val = raw[key]
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }
  return ''
}

/**
 * Extract plain-text content from a user message for dedup comparison.
 *
 * Uses a multi-field strategy because different server versions / channel
 * adapters shape the SSE payload differently:
 *   • Modern format:  content: [{type:'text', text:'...'}]
 *   • Legacy format:  text: '...' | body: '...' | message: '...'
 *
 * textFromMessage() only reads the content-array format, so using it alone
 * causes the dedup to miss echoes that carry a top-level `text` field,
 * leaving those duplicate messages visible in the chat.
 */
function extractUserMessageText(message: ChatMessage): string {
  // Primary: content-array format (modern canonical)
  const fromContent = textFromMessage(message).trim()
  if (fromContent.length > 0) return fromContent

  // Fallback: top-level text/body/message fields (legacy / some channel adapters)
  const raw = message as Record<string, unknown>
  for (const key of ['text', 'body', 'message']) {
    const val = raw[key]
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }

  return ''
}

/**
 * Build a compact attachment-identity signature for image-only dedup.
 * Compares name + size because those survive the round-trip to the server;
 * base64 content is stripped before storage.
 */
function attachmentSignature(message: ChatMessage): string {
  const attachments = Array.isArray((message as Record<string, unknown>).attachments)
    ? ((message as Record<string, unknown>).attachments as Array<Record<string, unknown>>)
    : []
  if (attachments.length === 0) return ''
  return attachments
    .map((a) => `${String(a.name ?? '')}:${String(a.size ?? '')}`)
    .sort()
    .join('|')
}

const EMPTY_MESSAGES: ChatMessage[] = []
const EMPTY_TOOL_CALLS: Array<{ id: string; name: string; phase: string; args?: unknown }> = []

type UseRealtimeChatHistoryOptions = {
  sessionKey: string
  friendlyId: string
  historyMessages: Array<ChatMessage>
  enabled?: boolean
  onUserMessage?: (message: ChatMessage, source?: string) => void
  onApprovalRequest?: (approval: Record<string, unknown>) => void
  onCompactionStart?: () => void
  onCompactionEnd?: () => void
}

type CompactionEvent = {
  phase?: string
  sessionKey: string
}

/**
 * Hook that makes SSE the PRIMARY source for new messages and streaming.
 * - Streaming chunks update the chat-store (already happens)
 * - When 'done' arrives, the complete message is immediately available
 * - History polling is now just a backup/backfill mechanism
 */
export function useRealtimeChatHistory({
  sessionKey,
  friendlyId,
  historyMessages,
  enabled = true,
  onUserMessage,
  onApprovalRequest,
  onCompactionStart,
  onCompactionEnd,
}: UseRealtimeChatHistoryOptions) {
  const queryClient = useQueryClient()
  const [lastCompletedRunAt, setLastCompletedRunAt] = useState<number | null>(
    null,
  )
  const completedStreamingTextRef = useRef<string>('')
  const completedStreamingThinkingRef = useRef<string>('')
  const lastCompactionSignalRef = useRef<string>('')
  const isBackfillingRef = useRef(false)

  const backfillHistory = useCallback(async () => {
    if (!sessionKey || sessionKey === 'new') return
    if (isBackfillingRef.current) return

    isBackfillingRef.current = true
    try {
      const key = chatQueryKeys.history(friendlyId, sessionKey)
      await queryClient.invalidateQueries({ queryKey: key, exact: true })
      await queryClient.refetchQueries({ queryKey: key, exact: true, type: 'active' })
    } finally {
      isBackfillingRef.current = false
    }
  }, [friendlyId, queryClient, sessionKey])

  useEffect(() => {
    if (!enabled) return
    if (!sessionKey || sessionKey === 'new') return
    void backfillHistory()
  }, [backfillHistory, enabled, sessionKey])

  const { connectionState, lastError, reconnect } = useChatStream({
    sessionKey: sessionKey === 'new' ? undefined : sessionKey,
    enabled: enabled && sessionKey !== 'new',
    onReconnect: useCallback(() => {
      void backfillHistory()
    }, [backfillHistory]),
    onSilentTimeout: useCallback((_silentForMs: number) => {
      void backfillHistory()
    }, [backfillHistory]),
    onUserMessage: useCallback(
      (message: ChatMessage, source?: string) => {
        // Filter internal system messages (pre-compaction flushes, heartbeat
        // prompts, subagent announcements) — these should never appear in the
        // chat UI. The chat-store has its own filter, but this callback
        // also appends directly to the query cache via appendHistoryMessage,
        // bypassing the store filter entirely.
        if (message.role === 'user') {
          const msgText = extractUserMessageText(message)
          if (
            msgText.startsWith('Pre-compaction memory flush') ||
            msgText.includes('Pre-compaction memory flush') ||
            msgText.includes('Store durable memories now') ||
            msgText.includes('APPEND new content only and do not overwrite') ||
            msgText.startsWith('A subagent task') ||
            msgText.startsWith('[Queued announce messages') ||
            msgText.includes('Summarize this naturally for the user') ||
            (msgText.includes('Stats: runtime') && msgText.includes('sessionKey agent:'))
          ) {
            onUserMessage?.(message, source)
            return
          }
        }

        // When we receive a user message from an external channel,
        // append it to the query cache immediately for instant display
        if (sessionKey && sessionKey !== 'new') {
          // Early-exit dedup: if the SSE echo has no clientId AND its text
          // content (or attachment signature) matches an existing optimistic
          // user message in the cache, skip the append — the optimistic entry
          // is already displayed.
          //
          // Bug: previous implementation used textFromMessage() which only
          // reads from the content-array format. Some server / channel
          // adapters echo the message with a top-level `text` or `body` field
          // instead, causing extractUserMessageText() to return '' and the
          // dedup guard to be skipped — resulting in a duplicate user message.
          //
          // Fix: use extractUserMessageText() which checks both the
          // content-array AND legacy top-level text/body/message fields.
          // For image-only messages (no text), fall back to attachment
          // signature matching so those are also deduplicated.
          const echoClientId = readClientId(message)
          if (!echoClientId) {
            const echoText = extractUserMessageText(message)
            const echoAttachSig = attachmentSignature(message)
            const hasContent = echoText.length > 0 || echoAttachSig.length > 0
            if (hasContent) {
              const key = chatQueryKeys.history(friendlyId, sessionKey)
              const cached = queryClient.getQueryData(key) as
                | { messages?: ChatMessage[] }
                | undefined
              const existing = cached?.messages ?? []
              const hasOptimistic = existing.some((m) => {
                if (m.role !== 'user') return false
                const isOptimistic =
                  typeof m.__optimisticId === 'string' &&
                  m.__optimisticId.length > 0
                if (!isOptimistic) return false
                // Text match (plain-text messages)
                if (echoText.length > 0 && extractUserMessageText(m).trim() === echoText) {
                  return true
                }
                // Attachment signature match (image-only messages)
                if (echoAttachSig.length > 0 && attachmentSignature(m) === echoAttachSig) {
                  return true
                }
                return false
              })
              if (hasOptimistic) {
                // The optimistic message is already displayed — skip SSE echo
                onUserMessage?.(message, source)
                return
              }
            }
          }

          appendHistoryMessage(queryClient, friendlyId, sessionKey, {
            ...message,
            __realtimeSource: source,
          })
        }
        onUserMessage?.(message, source)
      },
      [queryClient, friendlyId, sessionKey, onUserMessage],
    ),
    onDone: useCallback(
      (
        _state: string,
        eventSessionKey: string,
        streamingSnapshot: StreamingState | null,
      ) => {
        const currentState =
          eventSessionKey === sessionKey ? streamingSnapshot : null
        if (currentState?.text) {
          completedStreamingTextRef.current = currentState.text
        }
        if (currentState?.thinking) {
          completedStreamingThinkingRef.current = currentState.thinking
        }

        // Track when generation completes for this session
        if (
          eventSessionKey === sessionKey ||
          !sessionKey ||
          sessionKey === 'new'
        ) {
          setLastCompletedRunAt(Date.now())
          // Refetch history after generation completes — keeps chat in sync
          if (sessionKey && sessionKey !== 'new') {
            const key = chatQueryKeys.history(friendlyId, sessionKey)
            const prevData = queryClient.getQueryData(key) as
              | { messages?: ChatMessage[] }
              | undefined
            const prevCount = prevData?.messages?.length ?? 0

            // Refetch immediately — done event message is already in realtime store
            queryClient.invalidateQueries({ queryKey: key }).then(() => {
              completedStreamingTextRef.current = ''
              completedStreamingThinkingRef.current = ''

              // Check for compaction — significant message count drop
              const newData = queryClient.getQueryData(key) as
                | { messages?: ChatMessage[] }
                | undefined
              const newCount = newData?.messages?.length ?? 0
              if (
                prevCount > 10 &&
                newCount > 0 &&
                newCount < prevCount * 0.6
              ) {
                onCompactionEnd?.()
                toast(
                  'Context compacted — older messages were summarized to free up space',
                  {
                    type: 'info',
                    icon: '🗜️',
                    duration: 8000,
                  },
                )
              }
            })
          }
        }
      },
      [sessionKey, friendlyId, queryClient, onCompactionEnd],
    ),
    onCompaction: useCallback((event: CompactionEvent) => {
      if (!event.sessionKey || event.sessionKey !== sessionKey) return

      if (event.phase === 'start') {
        lastCompactionSignalRef.current = `compaction:${event.sessionKey}:start`
        onCompactionStart?.()
        return
      }

      if (event.phase === 'end') {
        lastCompactionSignalRef.current = ''
        onCompactionEnd?.()
      }
    }, [onCompactionEnd, onCompactionStart, sessionKey]),
    onApprovalRequest,
  })

  const mergeHistoryMessages = useChatStore((s) => s.mergeHistoryMessages)
  const clearSession = useChatStore((s) => s.clearSession)
  const lastEventAt = useChatStore((s) => s.lastEventAt)
  const clearRealtimeBuffer = useChatStore((s) => s.clearRealtimeBuffer)
  const realtimeMessages = useChatStore(
    (s) => s.realtimeMessages.get(sessionKey) ?? EMPTY_MESSAGES,
  )

  // Subscribe directly to streaming state — useMemo with stable fn ref was stale (bug #1)
  const streamingState = useChatStore((s) => s.streamingState.get(sessionKey) ?? null)
  const streamingStateRef = useRef(streamingState)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const delayedClearSessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSessionKeyRef = useRef(sessionKey)
  const isUnmountingRef = useRef(false)
  activeSessionKeyRef.current = sessionKey

  useEffect(() => {
    streamingStateRef.current = streamingState
  }, [streamingState])

  // Merge history with real-time messages
  // Re-merge when realtime events arrive (lastEventAt changes)
  const mergedMessages = useMemo(() => {
    if (sessionKey === 'new') return historyMessages
    return mergeHistoryMessages(sessionKey, historyMessages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, historyMessages, mergeHistoryMessages, lastEventAt])

  // History has caught up — cleanup realtime buffer outside render
  useEffect(() => {
    if (!sessionKey || sessionKey === 'new') return
    if (realtimeMessages.length === 0) return
    if (mergedMessages.length !== historyMessages.length) return
    clearRealtimeBuffer(sessionKey)
  }, [
    clearRealtimeBuffer,
    historyMessages.length,
    mergedMessages.length,
    realtimeMessages.length,
    sessionKey,
  ])

  useEffect(() => {
    if (!onCompactionStart) return
    if (realtimeMessages.length === 0) return
    const latest = realtimeMessages[realtimeMessages.length - 1]
    if (!latest) return

    const textCandidates = [
      textFromMessage(latest),
      ...((Array.isArray(latest.content) ? latest.content : []).map((part) => {
        if (part.type === 'text') return String(part.text ?? '')
        if (part.type === 'thinking') return String(part.thinking ?? '')
        return ''
      })),
    ]
      .join('\n')
      .toLowerCase()

    // Only trigger on Hermes's actual mid-compaction signal.
    // "pre-compaction memory flush" and "store durable memories now" are routine
    // heartbeat messages — do NOT match those here.
    if (!textCandidates.includes('compacting context')) return

    const signal = `${latest.role ?? ''}:${textCandidates}`
    if (signal === lastCompactionSignalRef.current) return
    lastCompactionSignalRef.current = signal
    onCompactionStart()
  }, [onCompactionStart, realtimeMessages])

  // Periodic history sync — catch missed messages every 30s
  // Skip during active streaming to prevent race conditions
  useEffect(() => {
    if (!sessionKey || sessionKey === 'new' || !enabled) return
    syncIntervalRef.current = setInterval(() => {
      // Don't poll during active streaming — causes flicker/overwrites
      if (streamingStateRef.current !== null) return
      const key = chatQueryKeys.history(friendlyId, sessionKey)
      queryClient.invalidateQueries({ queryKey: key })
    }, 30000)
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [sessionKey, friendlyId, enabled, queryClient])

  // Clear realtime buffer when session changes
  useEffect(() => {
    if (!sessionKey || sessionKey === 'new') return undefined
    if (delayedClearSessionTimeoutRef.current) {
      clearTimeout(delayedClearSessionTimeoutRef.current)
      delayedClearSessionTimeoutRef.current = null
    }

    // Clear on unmount/session change after a delay
    // to allow history to catch up
    return () => {
      if (isUnmountingRef.current) return
      if (delayedClearSessionTimeoutRef.current) {
        clearTimeout(delayedClearSessionTimeoutRef.current)
      }
      delayedClearSessionTimeoutRef.current = setTimeout(() => {
        delayedClearSessionTimeoutRef.current = null
        if (activeSessionKeyRef.current === sessionKey) return
        clearSession(sessionKey)
      }, 5000)
    }
  }, [sessionKey, clearSession])

  useEffect(() => {
    isUnmountingRef.current = false
    return () => {
      isUnmountingRef.current = true
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
      if (delayedClearSessionTimeoutRef.current) {
        clearTimeout(delayedClearSessionTimeoutRef.current)
        delayedClearSessionTimeoutRef.current = null
      }
    }
  }, [])

  // Compute streaming UI state
  const isRealtimeStreaming = streamingState !== null
  const realtimeStreamingText = streamingState?.text ?? ''
  const realtimeStreamingThinking = streamingState?.thinking ?? ''

  return {
    messages: mergedMessages,
    connectionState,
    lastError,
    reconnect,
    isRealtimeStreaming,
    realtimeStreamingText,
    realtimeStreamingThinking,
    completedStreamingText: completedStreamingTextRef,
    completedStreamingThinking: completedStreamingThinkingRef,
    streamingRunId: streamingState?.runId ?? null,
    activeToolCalls: streamingState?.toolCalls ?? EMPTY_TOOL_CALLS,
    lastCompletedRunAt, // Parent watches this to clear waitingForResponse
  }
}
