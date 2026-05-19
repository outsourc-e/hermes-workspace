import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStream } from '../../../hooks/use-chat-stream'
import { useChatStore } from '../../../stores/chat-store'
import { appendHistoryMessage, chatQueryKeys } from '../chat-queries'
import { toast } from '../../../components/ui/toast'
import { textFromMessage } from '../utils'
import type { ChatMessage } from '../types'
import type { StreamingState } from '../../../stores/chat-store'

const PORTABLE_HISTORY_STORAGE_KEY = 'claude_portable_chat_main'
const PORTABLE_HISTORY_LIMIT = 100

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
  const attachments = Array.isArray(
    (message as Record<string, unknown>).attachments,
  )
    ? ((message as Record<string, unknown>).attachments as Array<
        Record<string, unknown>
      >)
    : []
  if (attachments.length === 0) return ''
  return attachments
    .map((a) => `${String(a.name ?? '')}:${String(a.size ?? '')}`)
    .sort()
    .join('|')
}

function persistPortableHistory(messages: Array<ChatMessage>) {
  if (typeof window === 'undefined') return

  const persistedMessages = messages
    .filter((message) => message.__streamingStatus !== 'streaming')
    .slice(-PORTABLE_HISTORY_LIMIT)

  try {
    window.localStorage.setItem(
      PORTABLE_HISTORY_STORAGE_KEY,
      JSON.stringify({
        messages: persistedMessages,
        updatedAt: Date.now(),
      }),
    )
  } catch {
    // Ignore persistence failures (quota, private mode, malformed messages).
  }
}

const EMPTY_MESSAGES: Array<ChatMessage> = []
const EMPTY_TOOL_CALLS: Array<{
  id: string
  name: string
  phase: string
  args?: unknown
}> = []
const EMPTY_LIFECYCLE_EVENTS: StreamingState['lifecycleEvents'] = []

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
  portableMode = false,
  onUserMessage,
  onApprovalRequest,
  onCompactionStart,
  onCompactionEnd,
}: UseRealtimeChatHistoryOptions & { portableMode?: boolean }) {
  const queryClient = useQueryClient()
  const effectiveFriendlyId = portableMode ? 'main' : friendlyId
  const effectiveSessionKey = portableMode ? 'main' : sessionKey
  const [lastCompletedRunAt, setLastCompletedRunAt] = useState<number | null>(
    null,
  )
  const completedStreamingTextRef = useRef<string>('')
  const completedStreamingThinkingRef = useRef<string>('')
  const lastCompactionSignalRef = useRef<string>('')
  const isBackfillingRef = useRef(false)
  const clearCompletedStreaming = useCallback(() => {
    completedStreamingTextRef.current = ''
    completedStreamingThinkingRef.current = ''
  }, [])

  const backfillHistory = useCallback(async () => {
    if (!effectiveSessionKey || effectiveSessionKey === 'new') return
    if (isBackfillingRef.current) return

    isBackfillingRef.current = true
    try {
      const key = chatQueryKeys.history(
        effectiveFriendlyId,
        effectiveSessionKey,
      )
      await queryClient.invalidateQueries({ queryKey: key, exact: true })
      await queryClient.refetchQueries({
        queryKey: key,
        exact: true,
        type: 'active',
      })
    } finally {
      isBackfillingRef.current = false
    }
  }, [effectiveFriendlyId, effectiveSessionKey, queryClient])

  useEffect(() => {
    if (!enabled) return
    if (!effectiveSessionKey || effectiveSessionKey === 'new') return
    void backfillHistory()
  }, [backfillHistory, effectiveSessionKey, enabled])

  const { connectionState, lastError, reconnect } = useChatStream({
    sessionKey: effectiveSessionKey === 'new' ? undefined : effectiveSessionKey,
    enabled: enabled && effectiveSessionKey !== 'new',
    onReconnect: useCallback(() => {
      void backfillHistory()
    }, [backfillHistory]),
    onSilentTimeout: useCallback(
      (_silentForMs: number) => {
        void backfillHistory()
      },
      [backfillHistory],
    ),
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
            msgText.startsWith('Store durable memories now') ||
            msgText.startsWith('APPEND new content only and do not overwrite') ||
            msgText.startsWith('A subagent task') ||
            msgText.startsWith('[Queued announce messages') ||
            msgText.startsWith('Summarize this naturally for the user') ||
            (msgText.startsWith('Stats: runtime') &&
              msgText.includes('sessionKey agent:'))
          ) {
            onUserMessage?.(message, source)
            return
          }
        }

        clearCompletedStreaming()

        // When we receive a user message from an external channel,
        // append it to the query cache immediately for instant display
        if (effectiveSessionKey && effectiveSessionKey !== 'new') {
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
              const key = chatQueryKeys.history(
                effectiveFriendlyId,
                effectiveSessionKey,
              )
              const cached =
                queryClient.getQueryData<Record<string, unknown>>(key)
              const existing = (cached?.messages ?? []) as Array<any>
              const hasOptimistic = existing.some((m: any) => {
                if (m.role !== 'user') return false
                const isOptimistic =
                  typeof m.__optimisticId === 'string' &&
                  m.__optimisticId.length > 0
                if (!isOptimistic) return false
                // Text match (plain-text messages)
                if (
                  echoText.length > 0 &&
                  extractUserMessageText(m).trim() === echoText
                ) {
                  return true
                }
                // Attachment signature match (image-only messages)
                if (
                  echoAttachSig.length > 0 &&
                  attachmentSignature(m) === echoAttachSig
                ) {
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

          appendHistoryMessage(
            queryClient,
            effectiveFriendlyId,
            effectiveSessionKey,
            {
              ...message,
              __realtimeSource: source,
            },
          )
        }
        onUserMessage?.(message, source)
      },
      [
        clearCompletedStreaming,
        effectiveFriendlyId,
        effectiveSessionKey,
        onUserMessage,
        queryClient,
      ],
    ),
    onDone: useCallback(
      (
        _state: string,
        eventSessionKey: string,
        streamingSnapshot: StreamingState | null,
      ) => {
        const currentState =
          eventSessionKey === effectiveSessionKey ? streamingSnapshot : null
        if (currentState?.text) {
          completedStreamingTextRef.current = currentState.text
        }
        if (currentState?.thinking) {
          completedStreamingThinkingRef.current = currentState.thinking
        }

        // Track when generation completes for this session
        if (
          eventSessionKey === effectiveSessionKey ||
          !effectiveSessionKey ||
          effectiveSessionKey === 'new'
        ) {
          setLastCompletedRunAt(Date.now())
          // Refetch history after generation completes — keeps chat in sync
          if (effectiveSessionKey && effectiveSessionKey !== 'new') {
            const key = chatQueryKeys.history(
              effectiveFriendlyId,
              effectiveSessionKey,
            )
            const prevData =
              queryClient.getQueryData<Record<string, unknown>>(key)
            const prevCount =
              (prevData?.messages as Array<unknown> | undefined)?.length ?? 0

            // Issue #441 fix: Directly merge realtime buffer into history cache
            // INSTEAD of invalidateQueries. The old approach caused a race:
            // invalidateQueries → refetch (async) → merge runs with stale data
            // → duplicates appear briefly → refetch completes → fixed.
            //
            // New approach: merge realtime messages into the cache synchronously,
            // then clear the realtime buffer in the same tick. A background
            // refetch runs after for consistency but doesn't block rendering.
            const store = useChatStore.getState()
            const realtimeMessages =
              store.realtimeMessages.get(effectiveSessionKey) ?? []
            const historyMessages = prevData?.messages as
              | Array<unknown>
              | undefined

            if (realtimeMessages.length > 0 && Array.isArray(historyMessages)) {
              // Deduplicate: remove any realtime messages already in history
              const historyTexts = new Set(
                historyMessages.map((m: unknown) => {
                  const raw = m as Record<string, unknown>
                  const content = raw.content ?? raw.text ?? ''
                  return `${raw.role ?? ''}:${JSON.stringify(content)}`
                }),
              )
              const dedupedRealtime = realtimeMessages.filter((m: unknown) => {
                const raw = m as Record<string, unknown>
                const content = raw.content ?? raw.text ?? ''
                const sig = `${raw.role ?? ''}:${JSON.stringify(content)}`
                return !historyTexts.has(sig)
              })

              if (dedupedRealtime.length > 0) {
                const merged = [...historyMessages, ...dedupedRealtime].sort(
                  (a: unknown, b: unknown) => {
                    const aTs = (a as Record<string, unknown>).createdAt as
                      | number
                      | undefined
                    const bTs = (b as Record<string, unknown>).createdAt as
                      | number
                      | undefined
                    if (typeof aTs === 'number' && typeof bTs === 'number')
                      return aTs - bTs
                    return 0
                  },
                )
                queryClient.setQueryData(key, {
                  ...(prevData ?? {}),
                  messages: merged,
                })
              }
            }

            // Clear realtime buffer immediately — no more stale data in render
            store.clearRealtimeBuffer(effectiveSessionKey)
            clearCompletedStreaming()

            // Background refetch for long-term consistency — doesn't block render
            queryClient.invalidateQueries({ queryKey: key, refetchType: 'all' })

            // Check for compaction — significant message count drop
            const newData =
              queryClient.getQueryData<Record<string, unknown>>(key)
            const newCount =
              (newData?.messages as Array<unknown> | undefined)?.length ?? 0
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
          }
        }
      },
      [
        clearCompletedStreaming,
        effectiveFriendlyId,
        effectiveSessionKey,
        onCompactionEnd,
        queryClient,
      ],
    ),
    onCompaction: useCallback(
      (event: CompactionEvent) => {
        if (!event.sessionKey || event.sessionKey !== effectiveSessionKey)
          return

        if (event.phase === 'start') {
          lastCompactionSignalRef.current = `compaction:${event.sessionKey}:start`
          onCompactionStart?.()
          return
        }

        if (event.phase === 'end') {
          lastCompactionSignalRef.current = ''
          onCompactionEnd?.()
        }
      },
      [effectiveSessionKey, onCompactionEnd, onCompactionStart],
    ),
    onApprovalRequest,
  })

  const mergeHistoryMessages = useChatStore((s) => s.mergeHistoryMessages)
  const clearSession = useChatStore((s) => s.clearSession)
  const lastEventAt = useChatStore((s) => s.lastEventAt)
  const clearRealtimeBuffer = useChatStore((s) => s.clearRealtimeBuffer)
  const realtimeMessages = useChatStore(
    (s) => s.realtimeMessages.get(effectiveSessionKey) ?? EMPTY_MESSAGES,
  )

  // Subscribe directly to streaming state — useMemo with stable fn ref was stale (bug #1)
  const streamingState = useChatStore(
    (s) => s.streamingState.get(effectiveSessionKey) ?? null,
  )
  const streamingStateRef = useRef(streamingState)
  const lastStreamClearTimeRef = useRef<number>(0)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const delayedClearSessionTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const activeSessionKeyRef = useRef(effectiveSessionKey)
  const isUnmountingRef = useRef(false)
  activeSessionKeyRef.current = effectiveSessionKey

  useEffect(() => {
    const prev = streamingStateRef.current
    streamingStateRef.current = streamingState
    const startedNewStream =
      streamingState !== null &&
      (prev === null || prev.runId !== streamingState.runId)
    if (startedNewStream) {
      clearCompletedStreaming()
    }
    // Streaming just completed — capture final text so the message stays
    // visible during the handoff from streaming placeholder to history message.
    // The stub useChatStream never fires onDone, so this is the only path.
    if (prev && prev.text && !streamingState) {
      completedStreamingTextRef.current = prev.text
      if (prev.thinking) {
        completedStreamingThinkingRef.current = prev.thinking
      }
      lastStreamClearTimeRef.current = Date.now()
    }
  }, [clearCompletedStreaming, streamingState])

  // Merge history with real-time messages
  // Re-merge when realtime events arrive (lastEventAt changes)
  const mergedMessages = useMemo(() => {
    if (effectiveSessionKey === 'new') return historyMessages
    return mergeHistoryMessages(effectiveSessionKey, historyMessages)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSessionKey, historyMessages, mergeHistoryMessages, lastEventAt])

  useEffect(() => {
    if (!portableMode) return
    if (mergedMessages.length === 0) return
    persistPortableHistory(mergedMessages)
  }, [mergedMessages, portableMode])

  // History has caught up — cleanup realtime buffer outside render
  // DISABLED: This was aggressively clearing realtime messages before history
  // caught up, causing the "message appears then disappears" bug.
  // TODO: Re-enable with smarter timing (e.g. only after history confirms the message)
  useEffect(() => {
    return // disabled
    if (portableMode) return
    if (!effectiveSessionKey || effectiveSessionKey === 'new') return
    if (realtimeMessages.length === 0) return
    if (mergedMessages.length !== historyMessages.length) return
    clearRealtimeBuffer(effectiveSessionKey)
  }, [
    clearRealtimeBuffer,
    effectiveSessionKey,
    historyMessages.length,
    mergedMessages.length,
    realtimeMessages.length,
  ])

  useEffect(() => {
    if (!onCompactionStart) return
    if (realtimeMessages.length === 0) return
    const latest = realtimeMessages[realtimeMessages.length - 1]

    const textCandidates = [
      textFromMessage(latest),
      ...(Array.isArray(latest.content) ? latest.content : []).map((part) => {
        if (part.type === 'text') return String(part.text ?? '')
        if (part.type === 'thinking') return String(part.thinking ?? '')
        return ''
      }),
    ]
      .join('\n')
      .toLowerCase()

    // Only trigger on Hermes Agent's actual mid-compaction signal.
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
    if (!effectiveSessionKey || effectiveSessionKey === 'new' || !enabled)
      return
    syncIntervalRef.current = setInterval(() => {
      // Don't poll during active streaming — causes flicker/overwrites
      if (streamingStateRef.current !== null) return
      // Guard window: don't poll right after streaming clears — new stream
      // may be starting and history API may return stale/incomplete data
      if (Date.now() - lastStreamClearTimeRef.current < 3000) return
      const key = chatQueryKeys.history(
        effectiveFriendlyId,
        effectiveSessionKey,
      )
      queryClient.invalidateQueries({ queryKey: key })
    }, 30000)
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [effectiveFriendlyId, effectiveSessionKey, enabled, queryClient])

  // Clear realtime buffer when session changes
  useEffect(() => {
    if (!effectiveSessionKey || effectiveSessionKey === 'new') return undefined
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
        if (activeSessionKeyRef.current === effectiveSessionKey) return
        clearSession(effectiveSessionKey)
      }, 5000)
    }
  }, [effectiveSessionKey, clearSession])

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
  const realtimeLifecycleEvents =
    streamingState?.lifecycleEvents ?? EMPTY_LIFECYCLE_EVENTS

  return {
    messages: mergedMessages,
    connectionState,
    lastError,
    reconnect,
    isRealtimeStreaming,
    realtimeStreamingText,
    realtimeStreamingThinking,
    realtimeLifecycleEvents,
    completedStreamingText: completedStreamingTextRef,
    completedStreamingThinking: completedStreamingThinkingRef,
    clearCompletedStreaming,
    streamingRunId: streamingState?.runId ?? null,
    activeToolCalls: streamingState?.toolCalls ?? EMPTY_TOOL_CALLS,
    lastCompletedRunAt, // Parent watches this to clear waitingForResponse
  }
}
