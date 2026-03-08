import { useCallback, useEffect, useRef, useState } from 'react'
import { useGatewayChatStore } from '@/stores/gateway-chat-store'
import type { GatewayAttachment, GatewayMessage } from '../types'

type StreamingState = {
  isStreaming: boolean
  streamingMessageId: string | null
  streamingText: string
  error: string | null
}

type StreamChunk = {
  text?: string
  delta?: string
  content?: string
  chunk?: string
}

type UseStreamingMessageOptions = {
  onStarted?: (payload: { runId: string | null }) => void
  onChunk?: (text: string, fullText: string) => void
  onComplete?: (message: GatewayMessage) => void
  onError?: (error: string) => void
  onThinking?: (thinking: string) => void
  onTool?: (tool: unknown) => void
  onMessageAccepted?: (sessionKey: string, friendlyId: string, clientId: string) => void
}

export function useStreamingMessage(options: UseStreamingMessageOptions = {}) {
  const { onStarted, onChunk, onComplete, onError, onThinking, onTool, onMessageAccepted } = options

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
  const activeSessionKeyRef = useRef<string>('main')

  const registerSendStreamRun = useGatewayChatStore((s) => s.registerSendStreamRun)
  const unregisterSendStreamRun = useGatewayChatStore((s) => s.unregisterSendStreamRun)
  const processStoreEvent = useGatewayChatStore((s) => s.processEvent)

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  useEffect(
    function cleanupStreamingOnUnmount() {
      return function cleanup() {
        if (eventSourceRef.current) {
          eventSourceRef.current.abort()
          eventSourceRef.current = null
        }
        finishedRef.current = true
        stopFrame()
      }
    },
    [stopFrame],
  )

  const markFailed = useCallback(
    (message: string) => {
      finishedRef.current = true
      eventSourceRef.current = null
      stopFrame()
      if (activeRunIdRef.current) {
        unregisterSendStreamRun(activeRunIdRef.current)
        activeRunIdRef.current = null
      }
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: message,
      }))
      onError?.(message)
    },
    [onError, stopFrame, unregisterSendStreamRun],
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
      // Unregister runId — chat-events can now process events freely again
      if (activeRunIdRef.current) {
        unregisterSendStreamRun(activeRunIdRef.current)
        activeRunIdRef.current = null
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

      const message: GatewayMessage = {
        role: 'assistant',
        content: [
          ...(thinking ? [{ type: 'thinking' as const, thinking }] : []),
          { type: 'text' as const, text: finalText },
        ],
        timestamp: Date.now(),
        __streamingStatus: 'complete',
        ...(payload as Record<string, unknown>),
      }

      onComplete?.(message)
    },
    [onComplete, stopFrame, unregisterSendStreamRun],
  )

  const processEvent = useCallback(
    (event: string, data: unknown) => {
      const payload = data as Record<string, unknown>

      switch (event) {
        case 'started': {
          // Register runId so chat-events skips duplicate chunks for this run
          const runId = payload.runId as string | undefined
          if (runId) {
            activeRunIdRef.current = runId
            registerSendStreamRun(runId)
          }
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
          const newText =
            chunk.delta ?? chunk.text ?? chunk.content ?? chunk.chunk ?? ''
          if (newText) {
            pushTargetText(fullTextRef.current + newText)
          }
          break
        }
        case 'thinking': {
          const thinking =
            (payload as { text?: string; thinking?: string }).text ??
            (payload as { thinking?: string }).thinking ??
            ''
          if (thinking) {
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
            runId: activeRunIdRef.current ?? undefined,
            sessionKey: activeSessionKeyRef.current,
            transport: 'send-stream',
          })
          onTool?.(payload)
          break
        }
        case 'done': {
          const doneState = (payload as { state?: string }).state
          const errorMessage = (payload as { errorMessage?: string })
            .errorMessage
          processStoreEvent({
            type: 'done',
            state: doneState ?? 'final',
            errorMessage,
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
          const errorMessage =
            (payload as { message?: string }).message ?? 'Stream error'
          markFailed(errorMessage)
          break
        }
        case 'timeout': {
          markFailed('Request timed out')
          break
        }
        case 'close': {
          if (fullTextRef.current) {
            finishStream()
          } else {
            markFailed('Gateway connection closed')
          }
          break
        }
      }
    },
    [
      finishStream,
      markFailed,
      onStarted,
      onThinking,
      onTool,
      processStoreEvent,
      pushTargetText,
      registerSendStreamRun,
    ],
  )

  const startStreaming = useCallback(
    async (params: {
      sessionKey: string
      friendlyId: string
      message: string
      thinking?: string
      attachments?: Array<GatewayAttachment>
      idempotencyKey?: string
    }) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.abort()
      }

      const abortController = new AbortController()
      eventSourceRef.current = abortController
      finishedRef.current = false
      stopFrame()
      fullTextRef.current = ''
      renderedTextRef.current = ''
      targetTextRef.current = ''
      thinkingRef.current = ''
      activeRunIdRef.current = null
      activeSessionKeyRef.current = params.sessionKey

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
            thinking: params.thinking,
            attachments: params.attachments,
            idempotencyKey: params.idempotencyKey ?? crypto.randomUUID(),
          }),
          signal: abortController.signal,
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || 'Stream request failed')
        }

        // HTTP 200 — message accepted by gateway. Clear optimistic "sending"
        // status so the Retry timer never fires. The gateway does NOT echo
        // user messages via SSE, so this is the only confirmation we get.
        if (params.idempotencyKey && onMessageAccepted) {
          onMessageAccepted(params.sessionKey, params.friendlyId, params.idempotencyKey)
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

          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue

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

        if (!finishedRef.current) {
          finishStream()
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const errorMessage = err instanceof Error ? err.message : String(err)
        markFailed(errorMessage)
      }
    },
    [finishStream, markFailed, processEvent, stopFrame],
  )

  const cancelStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.abort()
      eventSourceRef.current = null
    }
    finishedRef.current = true
    stopFrame()
    fullTextRef.current = ''
    renderedTextRef.current = ''
    targetTextRef.current = ''
    thinkingRef.current = ''
    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }))
  }, [stopFrame])

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
