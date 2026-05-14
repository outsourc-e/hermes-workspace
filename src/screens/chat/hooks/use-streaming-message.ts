import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatAttachment, ChatMessage } from '../types'
import { readResolvedSessionHeaders } from '@/lib/send-stream-session-headers'
import { useChatStore } from '@/stores/chat-store'
import { pushActivity } from '@/components/inspector/activity-store'

/**
 * Determine whether a stream-resolved session key change should trigger
 * onSessionResolved (which navigates the route). Only bootstrap keys
 * ("new", "main") should promote a backend-returned session ID to the
 * Workspace route identity. Concrete sessions must never be overridden
 * by a backend-derived api-* ID — that causes session splits (#297).
 */
export function shouldResolveStreamSession({
  requestedSessionKey,
  currentSessionKey,
  resolvedSessionKey,
  pinMainSession = false,
}: {
  requestedSessionKey: string
  currentSessionKey: string
  resolvedSessionKey: string
  pinMainSession?: boolean
}): boolean {
  // No change → nothing to resolve
  if (resolvedSessionKey === currentSessionKey) return false
  // "new" should resolve once to a concrete session.
  if (requestedSessionKey === 'new') return true
  // "main" only stays pinned when the current route is intentionally bound to
  // the portable Workspace session in zero-fork mode.
  if (requestedSessionKey === 'main') return !pinMainSession
  // Concrete session → never promote a different backend ID
  return false
}

type StreamingState = {
  isStreaming: boolean
  streamingMessageId: string | null
  streamingText: string
  error: string | null
}

type StreamLifecyclePhase =
  | 'idle'
  | 'requesting'
  | 'accepted'
  | 'active'
  | 'handoff'
  | 'complete'
  | 'error'

type StreamChunk = {
  text?: string
  delta?: string
  content?: string
  chunk?: string
}

type StepUsagePayload = {
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  contextPercent?: number
  model?: string
}

type PortableHistoryMessage = {
  role: string
  content: string
}

type UseStreamingMessageOptions = {
  pinMainSession?: boolean
  onStarted?: (payload: { runId: string | null }) => void
  onChunk?: (text: string, fullText: string) => void
  onComplete?: (message: ChatMessage) => void
  onError?: (error: string) => void
  onThinking?: (thinking: string) => void
  onTool?: (tool: unknown) => void
  onMessageAccepted?: (
    sessionKey: string,
    friendlyId: string,
    clientId: string,
  ) => void
  onAbort?: () => void
  onSessionResolved?: (payload: {
    sessionKey: string
    friendlyId: string
  }) => void
  acceptedTimeoutMs?: number
  handoffTimeoutMs?: number
}

export function useStreamingMessage(options: UseStreamingMessageOptions = {}) {
  const {
    pinMainSession = false,
    onStarted,
    onChunk,
    onComplete,
    onError,
    onThinking,
    onTool,
    onMessageAccepted,
    onAbort,
    onSessionResolved,
    acceptedTimeoutMs,
    handoffTimeoutMs,
  } = options

  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    streamingMessageId: null,
    streamingText: '',
    error: null,
  })

  const eventSourceRef = useRef<AbortController | null>(null)
  const fullTextRef = useRef<string>('')
  const renderedTextRef = useRef<string>('')
  const targetTextRef = useRef<string>('')
  const frameRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const thinkingRef = useRef<string>('')
  const activeRunIdRef = useRef<string | null>(null)
  const delayedUnregisterTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)
  const activeSessionKeyRef = useRef<string>('main')
  // Monotonically increasing token. Each call to startStreaming bumps this so
  // any in-flight processStream loop (or pending microtask processing chunks
  // it has already read into the SSE buffer) can detect that it's stale and
  // refuse to dispatch its events. Without this, chunks from an aborted stream
  // can still write into the new session's chat history during the brief
  // window between abort() and the underlying fetch reader actually stopping.
  // See #297 (cross-session response contamination).
  const streamGenerationRef = useRef<number>(0)
  const lifecyclePhaseRef = useRef<StreamLifecyclePhase>('idle')
  const acceptedAtRef = useRef<number | null>(null)
  const lastActivityAtRef = useRef<number | null>(null)
  const handoffTimerRef = useRef<number | null>(null)
  const stepUsageRef = useRef<StepUsagePayload>({})
  // Captures the sessionKey the caller requested at stream-start time so
  // SSE `started` events can decide whether a backend-returned session ID
  // should be promoted to the route identity. Prevents concrete sessions
  // from being overridden by api-* derivations (#297).
  const requestedSessionKeyRef = useRef<string>('')

  const registerSendStreamRun = useChatStore((s) => s.registerSendStreamRun)
  const unregisterSendStreamRun = useChatStore((s) => s.unregisterSendStreamRun)
  const processStoreEvent = useChatStore((s) => s.processEvent)
  const clearStreamingSession = useChatStore((s) => s.clearStreamingSession)

  const ACCEPTED_NO_ACTIVITY_TIMEOUT_MS = acceptedTimeoutMs ?? 120_000
  const HANDOFF_NO_ACTIVITY_TIMEOUT_MS = handoffTimeoutMs ?? 300_000

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  const clearHandoffTimer = useCallback(() => {
    if (handoffTimerRef.current !== null) {
      window.clearTimeout(handoffTimerRef.current)
      handoffTimerRef.current = null
    }
  }, [])

  const clearSendStreamRun = useCallback(() => {
    if (activeRunIdRef.current) {
      unregisterSendStreamRun(activeRunIdRef.current)
      activeRunIdRef.current = null
    }
  }, [unregisterSendStreamRun])

  const resetActiveStreamState = useCallback(
    (nextSessionKey?: string) => {
      stopFrame()
      clearHandoffTimer()
      clearSendStreamRun()
      // Cancel any delayed unregister from a previous run
      if (delayedUnregisterTimerRef.current) {
        clearTimeout(delayedUnregisterTimerRef.current)
        delayedUnregisterTimerRef.current = null
      }
      clearStreamingSession(activeSessionKeyRef.current)
      if (nextSessionKey) {
        activeSessionKeyRef.current = nextSessionKey
      }
      fullTextRef.current = ''
      renderedTextRef.current = ''
      targetTextRef.current = ''
      thinkingRef.current = ''
      stepUsageRef.current = {}
      lifecyclePhaseRef.current = 'idle'
      acceptedAtRef.current = null
      lastActivityAtRef.current = null
      setState({
        isStreaming: false,
        streamingMessageId: null,
        streamingText: '',
        error: null,
      })
    },
    [clearHandoffTimer, clearSendStreamRun, clearStreamingSession, stopFrame],
  )

  const markActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now()
    if (
      lifecyclePhaseRef.current === 'accepted' ||
      lifecyclePhaseRef.current === 'requesting' ||
      lifecyclePhaseRef.current === 'handoff'
    ) {
      lifecyclePhaseRef.current = 'active'
    }
  }, [])

  const markAccepted = useCallback(() => {
    const now = Date.now()
    acceptedAtRef.current = now
    lastActivityAtRef.current = now
    lifecyclePhaseRef.current = 'accepted'
  }, [])

  const markFailed = useCallback(
    (message: string) => {
      if (finishedRef.current) return
      finishedRef.current = true
      eventSourceRef.current = null
      stopFrame()
      lifecyclePhaseRef.current = 'error'
      clearHandoffTimer()
      clearSendStreamRun()
      clearStreamingSession(activeSessionKeyRef.current)
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: message,
      }))
      onError?.(message)
    },
    [
      clearHandoffTimer,
      clearSendStreamRun,
      clearStreamingSession,
      onError,
      stopFrame,
    ],
  )

  const schedulePostAcceptanceTimeout = useCallback(
    (reason: 'accepted' | 'handoff') => {
      clearHandoffTimer()
      const timeoutMs =
        reason === 'handoff'
          ? HANDOFF_NO_ACTIVITY_TIMEOUT_MS
          : ACCEPTED_NO_ACTIVITY_TIMEOUT_MS
      handoffTimerRef.current = window.setTimeout(() => {
        if (finishedRef.current) return
        if (
          lifecyclePhaseRef.current !== 'accepted' &&
          lifecyclePhaseRef.current !== 'handoff'
        ) {
          return
        }
        if (reason === 'handoff') {
          const store = useChatStore.getState()
          const streamingState =
            store.streamingState.get(activeSessionKeyRef.current) ?? null
          const lastEventTimestamp = store.lastEventAt
          if (
            streamingState !== null ||
            (lastEventTimestamp > 0 &&
              Date.now() - lastEventTimestamp < timeoutMs)
          ) {
            schedulePostAcceptanceTimeout(reason)
            return
          }
        }
        const lastActivityAt =
          lastActivityAtRef.current ?? acceptedAtRef.current
        if (lastActivityAt && Date.now() - lastActivityAt < timeoutMs - 250) {
          schedulePostAcceptanceTimeout(reason)
          return
        }
        markFailed(
          reason === 'handoff'
            ? 'Run stalled after handoff'
            : 'No activity received after message was accepted',
        )
      }, timeoutMs)
    },
    [clearHandoffTimer, markFailed],
  )

  const transitionToHandoff = useCallback(() => {
    if (finishedRef.current) return
    lifecyclePhaseRef.current = 'handoff'
    clearSendStreamRun()
    clearHandoffTimer()
    stopFrame()
    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }))
    schedulePostAcceptanceTimeout('handoff')
  }, [
    clearHandoffTimer,
    clearSendStreamRun,
    schedulePostAcceptanceTimeout,
    stopFrame,
  ])

  useEffect(
    function keepAcceptedRunAliveOnUnmount() {
      return function cleanup() {
        if (!eventSourceRef.current || finishedRef.current) return

        // Navigating away from Chat unmounts this hook. Previously this cleanup
        // aborted /api/send-stream and reset the local stream state, which made
        // the UI look like Hermes stopped thinking. Leave the accepted request
        // alive instead: the server-side route deliberately keeps the upstream
        // Hermes run alive after the browser reader is cancelled, and the
        // persisted waiting/session state lets the screen recover from history
        // or active-run polling when the user comes back.
        lifecyclePhaseRef.current = 'handoff'
        clearSendStreamRun()
        clearHandoffTimer()
        stopFrame()
      }
    },
    [clearHandoffTimer, clearSendStreamRun, stopFrame],
  )

  const pushTargetText = useCallback(
    (target: string) => {
      fullTextRef.current = target
      targetTextRef.current = target

      if (
        renderedTextRef.current.length > target.length ||
        !target.startsWith(renderedTextRef.current)
      ) {
        renderedTextRef.current = ''
      }

      if (frameRef.current !== null) return

      const tick = () => {
        const current = renderedTextRef.current
        const nextTarget = targetTextRef.current

        if (current === nextTarget) {
          frameRef.current = null
          return
        }

        const remaining = nextTarget.length - current.length
        const step = remaining > 48 ? Math.ceil(remaining / 6) : 1
        const nextLength = Math.min(nextTarget.length, current.length + step)
        const nextText = nextTarget.slice(0, nextLength)
        const delta = nextText.slice(current.length)

        renderedTextRef.current = nextText
        setState((prev) => ({
          ...prev,
          streamingText: nextText,
        }))

        if (delta) {
          onChunk?.(delta, nextText)
        }

        frameRef.current = window.requestAnimationFrame(tick)
      }

      frameRef.current = window.requestAnimationFrame(tick)
    },
    [onChunk],
  )

  const finishStream = useCallback(
    (payload?: unknown) => {
      if (finishedRef.current) return
      finishedRef.current = true
      eventSourceRef.current = null
      stopFrame()
      lifecyclePhaseRef.current = 'complete'
      clearHandoffTimer()
      // Delay runId unregistration so chat-events dedup continues filtering
      // for a few seconds after completion — prevents late duplicate messages
      if (delayedUnregisterTimerRef.current) {
        clearTimeout(delayedUnregisterTimerRef.current)
        delayedUnregisterTimerRef.current = null
      }
      const completedRunId = activeRunIdRef.current
      if (completedRunId) {
        activeRunIdRef.current = null
        delayedUnregisterTimerRef.current = setTimeout(() => {
          delayedUnregisterTimerRef.current = null
          unregisterSendStreamRun(completedRunId)
        }, 5000)
      }

      const finalText = fullTextRef.current
      const thinking = thinkingRef.current
      renderedTextRef.current = finalText
      targetTextRef.current = finalText

      setState((prev) => ({
        ...prev,
        isStreaming: false,
        streamingText: finalText,
      }))

      const message: ChatMessage = {
        role: 'assistant',
        content: [
          ...(thinking ? [{ type: 'thinking' as const, thinking }] : []),
          { type: 'text' as const, text: finalText },
        ],
        timestamp: Date.now(),
        __streamingStatus: 'complete',
        ...stepUsageRef.current,
        ...(payload as Record<string, unknown>),
      }

      onComplete?.(message)
    },
    [clearHandoffTimer, onComplete, stopFrame, unregisterSendStreamRun],
  )

  const processEvent = useCallback(
    (event: string, data: unknown) => {
      const payload = data as Record<string, unknown>

      // [DEBUG TUI] Log every SSE event so we can see whether tool.* events arrive
      // from Hermes Agent through Workspace. Toggle off by setting
      // localStorage.removeItem('hermes:debug:sse')
      if (
        typeof window !== 'undefined' &&
        window.localStorage?.getItem('hermes:debug:sse') === '1'
      ) {
        // eslint-disable-next-line no-console
        console.log(
          '[hermes-sse]',
          event,
          (payload?.name as string) || '',
          (payload?.phase as string) || '',
          payload,
        )
      }

      // hb_signal/keepalive events from server: just mark activity, never let them
      // surface as user-visible thinking or tool rows.
      if (event === 'hb_signal' || event === 'heartbeat' || event === 'keepalive' || event === 'ping') {
        markActivity()
        return
      }

      switch (event) {
        case 'started': {
          const resolvedSessionKey =
            typeof payload.sessionKey === 'string' && payload.sessionKey.trim()
              ? payload.sessionKey.trim()
              : activeSessionKeyRef.current
          const resolvedFriendlyId =
            typeof payload.friendlyId === 'string' && payload.friendlyId.trim()
              ? payload.friendlyId.trim()
              : resolvedSessionKey
          if (resolvedSessionKey !== activeSessionKeyRef.current) {
            // Guard: only promote backend session IDs for bootstrap keys.
            // Concrete Workspace sessions must never be overridden (#297).
            if (
              shouldResolveStreamSession({
                requestedSessionKey: requestedSessionKeyRef.current,
                currentSessionKey: activeSessionKeyRef.current,
                resolvedSessionKey,
              })
            ) {
              activeSessionKeyRef.current = resolvedSessionKey
              onSessionResolved?.({
                sessionKey: resolvedSessionKey,
                friendlyId: resolvedFriendlyId,
              })
            }
          }
          // Register runId so chat-events skips duplicate chunks for this run
          const runId = payload.runId as string | undefined
          if (runId) {
            activeRunIdRef.current = runId
            registerSendStreamRun(runId)
          }
          markActivity()
          pushActivity({
            type: 'assistant_start',
            time: new Date().toLocaleTimeString(),
            text: 'Assistant started',
          })
          processStoreEvent({
            type: 'chunk',
            text: '',
            runId: runId ?? undefined,
            sessionKey: activeSessionKeyRef.current,
            transport: 'send-stream',
          })
          onStarted?.({ runId: runId ?? null })
          break
        }
        case 'assistant': {
          const text = (payload as { text?: string }).text ?? ''
          if (text) {
            markActivity()
            processStoreEvent({
              type: 'chunk',
              text,
              runId: activeRunIdRef.current ?? undefined,
              sessionKey: activeSessionKeyRef.current,
              transport: 'send-stream',
            })
            pushTargetText(text)
          }
          break
        }
        case 'chunk': {
          const chunk = payload as StreamChunk
          const fullReplace =
            (chunk as Record<string, unknown>).fullReplace === true
          const newText =
            chunk.delta ?? chunk.text ?? chunk.content ?? chunk.chunk ?? ''
          if (newText) {
            markActivity()
            const accumulated = fullReplace
              ? newText
              : fullTextRef.current + newText
            pushTargetText(accumulated)
            processStoreEvent({
              type: 'chunk',
              text: accumulated,
              fullReplace: true,
              runId: activeRunIdRef.current ?? undefined,
              sessionKey: activeSessionKeyRef.current,
              transport: 'send-stream',
            })
          }
          break
        }
        case 'thinking': {
          const thinking =
            (payload as { text?: string; thinking?: string }).text ??
            (payload as { thinking?: string }).thinking ??
            ''
          // Drop server-side keepalive placeholders that came in as 'thinking'
          // before the dedicated hb_signal event existed. These are not real
          // model thinking and would otherwise pollute the TUI activity card.
          const isKeepalivePlaceholder =
            typeof thinking === 'string' &&
            /^still\s+working[\.\u2026]*\s*$/i.test(thinking.trim())
          if (isKeepalivePlaceholder) break
          if (thinking) {
            markActivity()
            thinkingRef.current = thinking
            processStoreEvent({
              type: 'thinking',
              text: thinking,
              runId: activeRunIdRef.current ?? undefined,
              sessionKey: activeSessionKeyRef.current,
              transport: 'send-stream',
            })
            onThinking?.(thinking)
          }
          break
        }
        case 'tool': {
          markActivity()
          {
            const toolName =
              typeof payload.name === 'string' ? payload.name : 'tool'
            const phase =
              typeof payload.phase === 'string' ? payload.phase : 'calling'
            const isMemory = /memory|remember|recall|save_memory/i.test(
              toolName,
            )
            const isFileWrite = /^(write_file|write|edit|Edit|Write)$/i.test(
              toolName,
            )
            const isFileRead = /^(read_file|read|Read|search_files)$/i.test(
              toolName,
            )
            const eventType = isMemory
              ? 'memory_write'
              : isFileWrite
                ? 'file_write'
                : isFileRead
                  ? 'file_read'
                  : 'tool_call'
            pushActivity({
              type: eventType,
              time: new Date().toLocaleTimeString(),
              text: `${toolName} (${phase})`,
            })
          }
          processStoreEvent({
            type: 'tool',
            phase:
              typeof payload.phase === 'string' ? payload.phase : 'calling',
            name: typeof payload.name === 'string' ? payload.name : 'tool',
            toolCallId:
              typeof payload.toolCallId === 'string'
                ? payload.toolCallId
                : undefined,
            args: payload.args,
            preview:
              typeof payload.preview === 'string' ? payload.preview : undefined,
            result:
              typeof payload.result === 'string' ? payload.result : undefined,
            runId: activeRunIdRef.current ?? undefined,
            sessionKey: activeSessionKeyRef.current,
            transport: 'send-stream',
          })
          onTool?.(payload)
          break
        }
        case 'artifact': {
          markActivity()
          const title =
            typeof payload.title === 'string' && payload.title.trim()
              ? payload.title.trim()
              : 'Artifact created'
          const kind =
            typeof payload.kind === 'string' && payload.kind.trim()
              ? payload.kind.trim()
              : 'artifact'
          const path =
            typeof payload.path === 'string' && payload.path.trim()
              ? payload.path.trim()
              : ''
          pushActivity({
            type: 'artifact',
            time: new Date().toLocaleTimeString(),
            text: path ? `${title} — ${path}` : title,
          })
          processStoreEvent({
            type: 'tool',
            phase: 'complete',
            name: `artifact:${kind}`,
            result: path ? `${title} — ${path}` : title,
            preview:
              typeof payload.preview === 'string' && payload.preview.trim()
                ? payload.preview.trim()
                : undefined,
            // Preserve the structured artifact metadata so the chat renderer
            // can show a first-class artifact card instead of degrading the
            // event to a generic tool row. See #295.
            args: {
              title,
              kind,
              path: path || undefined,
            },
            runId: activeRunIdRef.current ?? undefined,
            sessionKey: activeSessionKeyRef.current,
            transport: 'send-stream',
          })
          break
        }
        case 'step': {
          const nextUsage: StepUsagePayload = {
            inputTokens:
              typeof payload.inputTokens === 'number'
                ? payload.inputTokens
                : stepUsageRef.current.inputTokens,
            outputTokens:
              typeof payload.outputTokens === 'number'
                ? payload.outputTokens
                : stepUsageRef.current.outputTokens,
            cacheRead:
              typeof payload.cacheRead === 'number'
                ? payload.cacheRead
                : stepUsageRef.current.cacheRead,
            cacheWrite:
              typeof payload.cacheWrite === 'number'
                ? payload.cacheWrite
                : stepUsageRef.current.cacheWrite,
            contextPercent:
              typeof payload.contextPercent === 'number'
                ? payload.contextPercent
                : stepUsageRef.current.contextPercent,
            model:
              typeof payload.model === 'string'
                ? payload.model
                : stepUsageRef.current.model,
          }
          stepUsageRef.current = nextUsage
          break
        }
        case 'done': {
          const doneState = (payload as { state?: string }).state
          const errorMessage = (payload as { errorMessage?: string })
            .errorMessage
          pushActivity({
            type: 'assistant_complete',
            time: new Date().toLocaleTimeString(),
            text: doneState === 'error' ? `Error: ${errorMessage}` : 'Complete',
          })
          processStoreEvent({
            type: 'done',
            state: doneState ?? 'final',
            errorMessage,
            message: payload.message as Record<string, unknown> | undefined,
            runId: activeRunIdRef.current ?? undefined,
            sessionKey: activeSessionKeyRef.current,
            transport: 'send-stream',
          })
          if (doneState === 'error' && errorMessage) {
            markFailed(errorMessage)
            break
          }
          finishStream(payload)
          break
        }
        case 'complete': {
          finishStream(payload)
          break
        }
        case 'error': {
          // Ignore late error events after stream already completed or finished
          if (
            finishedRef.current ||
            lifecyclePhaseRef.current === 'complete' ||
            lifecyclePhaseRef.current === 'idle' ||
            lifecyclePhaseRef.current === 'error'
          ) {
            break
          }
          const errorMessage =
            (payload as { message?: string }).message ?? 'Stream error'
          markFailed(errorMessage)
          break
        }
        case 'timeout': {
          if (
            lifecyclePhaseRef.current === 'accepted' ||
            lifecyclePhaseRef.current === 'active' ||
            lifecyclePhaseRef.current === 'handoff'
          ) {
            transitionToHandoff()
          } else {
            markFailed('Request timed out')
          }
          break
        }
        case 'heartbeat': {
          markActivity()
          break
        }
        case 'close': {
          if (fullTextRef.current) {
            finishStream()
          } else if (
            lifecyclePhaseRef.current === 'accepted' ||
            lifecyclePhaseRef.current === 'active' ||
            lifecyclePhaseRef.current === 'handoff'
          ) {
            transitionToHandoff()
          } else {
            markFailed('Hermes Agent connection closed')
          }
          break
        }
      }
    },
    [
      finishStream,
      markFailed,
      onStarted,
      onSessionResolved,
      onThinking,
      onTool,
      markActivity,
      processStoreEvent,
      pushTargetText,
      registerSendStreamRun,
      transitionToHandoff,
    ],
  )

  const startStreaming = useCallback(
    async (params: {
      sessionKey: string
      friendlyId: string
      message: string
      history?: Array<PortableHistoryMessage>
      thinking?: string
      fastMode?: boolean
      attachments?: Array<ChatAttachment>
      idempotencyKey?: string
      model?: string
    }) => {
      if (eventSourceRef.current) {
        // Preserve in-progress response as a partial message before aborting
        // so it doesn't vanish from the UI when the user interrupts
        if (fullTextRef.current && !finishedRef.current) {
          processStoreEvent({
            type: 'done',
            state: 'interrupted',
            sessionKey: activeSessionKeyRef.current,
            transport: 'send-stream',
            message: {
              role: 'assistant',
              content: [
                ...(thinkingRef.current
                  ? [
                      {
                        type: 'thinking' as const,
                        thinking: thinkingRef.current,
                      },
                    ]
                  : []),
                { type: 'text' as const, text: fullTextRef.current },
              ],
              __streamingStatus: 'interrupted',
            } as any,
          })
        }
        eventSourceRef.current.abort()
      }

      const abortController = new AbortController()
      eventSourceRef.current = abortController
      finishedRef.current = false
      resetActiveStreamState(params.sessionKey)
      lifecyclePhaseRef.current = 'requesting'
      requestedSessionKeyRef.current = params.sessionKey

      // Bump the generation token so any chunks the previous stream had
      // already buffered but not yet dispatched (after our abort() call)
      // get rejected when they reach processEvent. The local capture is
      // what this run will compare against. See #297.
      streamGenerationRef.current += 1
      const myGeneration = streamGenerationRef.current
      const mySessionKey = params.sessionKey

      const messageId = `streaming-${Date.now()}`

      setState({
        isStreaming: true,
        streamingMessageId: messageId,
        streamingText: '',
        error: null,
      })

      try {
        const response = await fetch('/api/send-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionKey: params.sessionKey,
            friendlyId: params.friendlyId,
            message: params.message,
            history: params.history,
            thinking: params.thinking,
            fastMode: params.fastMode,
            attachments: params.attachments,
            idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
            model: params.model || undefined,
            locale:
              typeof window !== 'undefined'
                ? localStorage.getItem('hermes-workspace-locale') || 'en'
                : 'en',
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || 'Stream request failed')
        }

        const resolvedHeaders = readResolvedSessionHeaders(response.headers, {
          sessionKey: params.sessionKey,
          friendlyId: params.friendlyId || params.sessionKey,
        })
        const resolvedSessionKey = resolvedHeaders.sessionKey
        const resolvedFriendlyId = resolvedHeaders.friendlyId
        if (resolvedSessionKey !== activeSessionKeyRef.current) {
          // Only promote a backend-returned session ID when the original
          // request was a bootstrap key ("new"/"main"). Concrete Workspace
          // sessions must never be overridden — that causes splits (#297).
          if (
            shouldResolveStreamSession({
              requestedSessionKey: params.sessionKey,
              currentSessionKey: activeSessionKeyRef.current,
              resolvedSessionKey,
              pinMainSession,
            })
          ) {
            activeSessionKeyRef.current = resolvedSessionKey
            onSessionResolved?.({
              sessionKey: resolvedSessionKey,
              friendlyId: resolvedFriendlyId,
            })
          }
        }

        markAccepted()
        schedulePostAcceptanceTimeout('accepted')

        // HTTP 200 — message accepted by Hermes Agent. Clear optimistic "sending"
        // status so the Retry timer never fires. Hermes Agent does NOT echo
        // user messages via SSE, so this is the only confirmation we get.
        if (params.idempotencyKey && onMessageAccepted) {
          onMessageAccepted(
            activeSessionKeyRef.current,
            resolvedFriendlyId,
            params.idempotencyKey,
          )
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Guard against stale streams writing into a newer session.
          // If startStreaming was called again with a different sessionKey,
          // streamGenerationRef has been bumped; this loop's reads are now
          // for an aborted/superseded stream and must not dispatch events.
          // See #297.
          if (streamGenerationRef.current !== myGeneration) {
            try {
              await reader.cancel()
            } catch {
              // Reader may already be closed; safe to ignore.
            }
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue

            // Re-check between events as well — a single read() can yield a
            // batch of buffered events; if a new stream started mid-batch,
            // the rest of this batch must be dropped.
            if (streamGenerationRef.current !== myGeneration) break

            const lines = eventBlock.split('\n')
            let currentEvent = ''
            let currentData = ''

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim()
              } else if (line.startsWith('data: ')) {
                currentData += line.slice(6)
              } else if (line.startsWith('data:')) {
                currentData += line.slice(5)
              }
            }

            if (!currentEvent || !currentData) continue
            try {
              processEvent(currentEvent, JSON.parse(currentData))
            } catch {
              // Ignore invalid SSE data.
            }
          }
        }

        const lifecyclePhase = lifecyclePhaseRef.current as StreamLifecyclePhase
        if (!finishedRef.current && lifecyclePhase !== 'handoff') {
          finishStream()
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          eventSourceRef.current = null
          clearHandoffTimer()
          clearSendStreamRun()
          setState((prev) => ({
            ...prev,
            isStreaming: false,
          }))
          const abortedPhase = lifecyclePhaseRef.current as StreamLifecyclePhase
          if (abortedPhase === 'handoff') {
            schedulePostAcceptanceTimeout('handoff')
            return
          }
          onAbort?.()
          return
        }
        const errorMessage = err instanceof Error ? err.message : String(err)
        markFailed(errorMessage)
      }
    },
    [
      finishStream,
      markAccepted,
      markFailed,
      onAbort,
      onMessageAccepted,
      onSessionResolved,
      pinMainSession,
      processEvent,
      resetActiveStreamState,
      schedulePostAcceptanceTimeout,
    ],
  )

  const cancelStreaming = useCallback(() => {
    if (
      lifecyclePhaseRef.current === 'accepted' ||
      lifecyclePhaseRef.current === 'active' ||
      lifecyclePhaseRef.current === 'handoff'
    ) {
      transitionToHandoff()
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.abort()
      eventSourceRef.current = null
    }
    finishedRef.current = lifecyclePhaseRef.current !== 'handoff'
    if (lifecyclePhaseRef.current !== 'handoff') {
      resetActiveStreamState()
    }
  }, [resetActiveStreamState, transitionToHandoff])

  const resetStreaming = useCallback(() => {
    cancelStreaming()
    setState({
      isStreaming: false,
      streamingMessageId: null,
      streamingText: '',
      error: null,
    })
  }, [cancelStreaming])

  return {
    ...state,
    startStreaming,
    cancelStreaming,
    resetStreaming,
  }
}
