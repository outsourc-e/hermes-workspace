import { useCallback, useEffect, useRef } from 'react'
import { useGatewayChatStore } from '../stores/gateway-chat-store'
import type { StreamingState } from '../stores/gateway-chat-store'
import type { GatewayMessage } from '../screens/chat/types'

export const CHAT_TOOL_CALL_EVENT = 'clawsuite:chat-tool-call'
export const CHAT_TOOL_RESULT_EVENT = 'clawsuite:chat-tool-result'
export const CHAT_STREAM_DONE_EVENT = 'clawsuite:chat-stream-done'

type UseGatewayChatStreamOptions = {
  /** Session key to filter events for (optional - receives all if not specified) */
  sessionKey?: string
  /** Whether the stream should be active */
  enabled?: boolean
  /** Callback when a user message arrives from an external channel */
  onUserMessage?: (message: GatewayMessage, source?: string) => void
  /** Callback when assistant streaming chunk arrives */
  onChunk?: (text: string, sessionKey: string) => void
  /** Callback when assistant thinking updates */
  onThinking?: (text: string, sessionKey: string) => void
  /** Callback when a generation completes */
  onDone?: (
    state: string,
    sessionKey: string,
    streamingSnapshot: StreamingState | null,
  ) => void
  /** Callback when a tool approval is requested */
  onApprovalRequest?: (approval: Record<string, unknown>) => void
}

export function useGatewayChatStream(
  options: UseGatewayChatStreamOptions = {},
) {
  const {
    enabled = true,
    onUserMessage,
    onChunk,
    onThinking,
    onDone,
    onApprovalRequest,
  } = options

  const connectionState = useGatewayChatStore((s) => s.connectionState)
  const setConnectionState = useGatewayChatStore((s) => s.setConnectionState)
  const processEvent = useGatewayChatStore((s) => s.processEvent)
  const clearStreamingSession = useGatewayChatStore((s) => s.clearStreamingSession)
  const clearAllStreaming = useGatewayChatStore((s) => s.clearAllStreaming)
  const lastError = useGatewayChatStore((s) => s.lastError)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamTimeoutsRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map())
  const reconnectAttempts = useRef(0)
  const mountedRef = useRef(true)

  // Store callbacks in refs to avoid reconnecting when they change
  const onUserMessageRef = useRef(onUserMessage)
  const onChunkRef = useRef(onChunk)
  const onThinkingRef = useRef(onThinking)
  const onDoneRef = useRef(onDone)
  const onApprovalRequestRef = useRef(onApprovalRequest)
  onUserMessageRef.current = onUserMessage
  onChunkRef.current = onChunk
  onThinkingRef.current = onThinking
  onDoneRef.current = onDone
  onApprovalRequestRef.current = onApprovalRequest

  const dispatchSSEDroppedEvent = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('clawsuite:sse-dropped'))
  }, [])

  const dispatchChatToolEvent = useCallback(
    (
      eventName: typeof CHAT_TOOL_CALL_EVENT | typeof CHAT_TOOL_RESULT_EVENT,
      detail: Record<string, unknown>,
    ) => {
      if (typeof window === 'undefined') return
      window.dispatchEvent(new CustomEvent(eventName, { detail }))
    },
    [],
  )

  const dispatchChatStreamDoneEvent = useCallback((detail: Record<string, unknown>) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(CHAT_STREAM_DONE_EVENT, { detail }))
  }, [])

  const clearStreamTimeout = useCallback((sessionKey: string) => {
    const timeoutId = streamTimeoutsRef.current.get(sessionKey)
    if (!timeoutId) return
    clearTimeout(timeoutId)
    streamTimeoutsRef.current.delete(sessionKey)
  }, [])

  const touchStreamTimeout = useCallback(
    (sessionKey: string) => {
      clearStreamTimeout(sessionKey)
      const timeoutId = setTimeout(() => {
        streamTimeoutsRef.current.delete(sessionKey)
        clearStreamingSession(sessionKey)
      }, 30000)
      streamTimeoutsRef.current.set(sessionKey, timeoutId)
    },
    [clearStreamTimeout, clearStreamingSession],
  )

  const clearAllStreamTimeouts = useCallback(() => {
    for (const timeoutId of streamTimeoutsRef.current.values()) {
      clearTimeout(timeoutId)
    }
    streamTimeoutsRef.current.clear()
  }, [])

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    setConnectionState('connecting')

    // Always connect without session filter — store handles filtering.
    // This prevents reconnects when sessionKey changes (which was causing red dot).
    const url = '/api/chat-events'

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    // Native open event fires on initial connect AND every auto-reconnect
    eventSource.onopen = () => {
      if (!mountedRef.current) return
      reconnectAttempts.current = 0
      // Mark connected immediately — don't wait for custom 'connected' event
      setConnectionState('connected')
    }

    eventSource.addEventListener('connected', () => {
      if (!mountedRef.current) return
      reconnectAttempts.current = 0
      setConnectionState('connected')
    })

    eventSource.addEventListener('disconnected', () => {
      if (!mountedRef.current) return
      clearAllStreamTimeouts()
      clearAllStreaming()
      setConnectionState('disconnected')
      dispatchSSEDroppedEvent()
      scheduleReconnect()
    })

    eventSource.addEventListener('error', () => {
      if (!mountedRef.current) return

      if (eventSource.readyState === EventSource.CLOSED) {
        clearAllStreamTimeouts()
        clearAllStreaming()
        setConnectionState('disconnected')
        dispatchSSEDroppedEvent()
        scheduleReconnect()
      }
      // Don't set 'connecting' on transient errors — EventSource auto-reconnects
      // and onopen will fire when it succeeds. Avoids flashing red dot.
    })

    eventSource.addEventListener('heartbeat', () => {
      // Keep-alive received, connection is healthy
    })

    // Chat event handlers
    eventSource.addEventListener('chunk', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          text: string
          runId?: string
          sessionKey: string
        }
        processEvent({ type: 'chunk', ...data })
        touchStreamTimeout(data.sessionKey)
        onChunkRef.current?.(data.text, data.sessionKey)
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('thinking', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          text: string
          runId?: string
          sessionKey: string
        }
        processEvent({ type: 'thinking', ...data })
        touchStreamTimeout(data.sessionKey)
        onThinkingRef.current?.(data.text, data.sessionKey)
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('tool', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          phase: string
          name: string
          toolCallId?: string
          args?: unknown
          result?: string
          runId?: string
          sessionKey: string
        }
        processEvent({ type: 'tool', ...data, result: data.result } as any)
        touchStreamTimeout(data.sessionKey)
        if (data.phase === 'done' || data.phase === 'error') {
          dispatchChatToolEvent(CHAT_TOOL_RESULT_EVENT, data)
        } else if (data.phase === 'calling' || data.phase === 'start') {
          dispatchChatToolEvent(CHAT_TOOL_CALL_EVENT, data)
        }
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('tool_use', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          name?: string
          id?: string
          toolCallId?: string
          args?: unknown
          arguments?: unknown
          runId?: string
          sessionKey: string
        }
        processEvent({
          type: 'tool',
          phase: 'calling',
          name: data.name ?? 'tool',
          toolCallId: data.toolCallId ?? data.id,
          args: data.args ?? data.arguments,
          runId: data.runId,
          sessionKey: data.sessionKey,
        })
        touchStreamTimeout(data.sessionKey)
        dispatchChatToolEvent(CHAT_TOOL_CALL_EVENT, {
          phase: 'calling',
          name: data.name ?? 'tool',
          toolCallId: data.toolCallId ?? data.id,
          args: data.args ?? data.arguments,
          runId: data.runId,
          sessionKey: data.sessionKey,
        })
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('tool_result', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          name?: string
          id?: string
          toolCallId?: string
          runId?: string
          sessionKey: string
          isError?: boolean
          error?: string
        }
        processEvent({
          type: 'tool',
          phase: data.isError || data.error ? 'error' : 'done',
          name: data.name ?? 'tool',
          toolCallId: data.toolCallId ?? data.id,
          runId: data.runId,
          sessionKey: data.sessionKey,
        })
        touchStreamTimeout(data.sessionKey)
        dispatchChatToolEvent(CHAT_TOOL_RESULT_EVENT, {
          phase: data.isError || data.error ? 'error' : 'done',
          name: data.name ?? 'tool',
          toolCallId: data.toolCallId ?? data.id,
          runId: data.runId,
          sessionKey: data.sessionKey,
          isError: data.isError,
          error: data.error,
        })
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('user_message', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          message: GatewayMessage
          sessionKey: string
          source?: string
        }
        processEvent({ type: 'user_message', ...data })
        onUserMessageRef.current?.(data.message, data.source)
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('message', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          message: GatewayMessage
          sessionKey: string
        }
        console.log(`[SSE] message event received: role=${data.message?.role} sessionKey=${data.sessionKey}`)
        processEvent({ type: 'message', ...data })
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('done', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          state: string
          errorMessage?: string
          runId?: string
          sessionKey: string
          message?: GatewayMessage
        }
        console.log(`[SSE] done event received: runId=${data.runId} state=${data.state} sessionKey=${data.sessionKey}`)
        const streamingSnapshot =
          useGatewayChatStore.getState().streamingState.get(data.sessionKey) ?? null
        processEvent({ type: 'done', ...data })
        clearStreamTimeout(data.sessionKey)
        dispatchChatStreamDoneEvent(data)
        onDoneRef.current?.(data.state, data.sessionKey, streamingSnapshot)
      } catch {
        // Ignore parse errors
      }
    })

    eventSource.addEventListener('state', (event) => {
      // P6: on 'started', kick off streaming state immediately so the thinking
      // indicator appears before the first chunk arrives (eliminates blank gap).
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as {
          state: string
          runId?: string
          sessionKey: string
        }
        if (data.state === 'started' && data.sessionKey && data.runId) {
          processEvent({ type: 'chunk', text: '', runId: data.runId, sessionKey: data.sessionKey })
          touchStreamTimeout(data.sessionKey)
        }
      } catch {
        // ignore parse errors
      }
    })

    eventSource.addEventListener('approval_request', (event) => {
      if (!mountedRef.current) return
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        onApprovalRequestRef.current?.(data)
      } catch {
        // Ignore parse errors
      }
    })
  }, [
    enabled,
    setConnectionState,
    processEvent,
    clearAllStreaming,
    clearAllStreamTimeouts,
    clearStreamTimeout,
    dispatchChatStreamDoneEvent,
    dispatchChatToolEvent,
    dispatchSSEDroppedEvent,
    touchStreamTimeout,
  ])

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current || !enabled) return

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    const attempts = reconnectAttempts.current
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000) // Exponential backoff, max 30s

    reconnectTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return
      reconnectAttempts.current++
      connect()
    }, delay)
  }, [enabled, connect])

  const disconnect = useCallback(() => {
    clearAllStreamTimeouts()

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    clearAllStreaming()
    setConnectionState('disconnected')
  }, [clearAllStreaming, clearAllStreamTimeouts, setConnectionState])

  const reconnect = useCallback(() => {
    disconnect()
    reconnectAttempts.current = 0
    connect()
  }, [disconnect, connect])

  useEffect(() => {
    mountedRef.current = true

    if (enabled) {
      connect()
    }

    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [enabled, connect, disconnect])

  // No longer reconnect on sessionKey change — SSE receives all events,
  // store handles session filtering. This prevents connection drops.

  return {
    connectionState,
    lastError,
    reconnect,
    disconnect,
  }
}
