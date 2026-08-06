import { useCallback, useEffect, useRef, useState } from 'react'
import { isValidSessionCardHandoffTransition } from '../chat-queries'
import type {
  SessionCardHandoffAuthority,
  SessionCardHandoffTransition,
} from '../chat-queries'
import type { ChatAttachment, ChatMessage, SessionCard } from '../types'
import { useChatStore } from '@/stores/chat-store'
import { pushActivity } from '@/components/inspector/activity-store'

const SESSION_BOOTSTRAP_KEYS = new Set(['main', 'new'])

function isExactNonblankIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
}

function sourceQualifiedIdentitySource(
  value: unknown,
): 'local' | 'remote' | null {
  if (!isExactNonblankIdentity(value)) return null
  if (value.startsWith('local:') && value.length > 'local:'.length) {
    return 'local'
  }
  if (value.startsWith('remote:') && value.length > 'remote:'.length) {
    return 'remote'
  }
  return null
}

/**
 * Determine whether authoritative stream session data should trigger a route
 * handoff. Portable `main` remains pinned, but remote concrete sessions may
 * legitimately continue under a successor session identifier.
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
  // Concrete remote sessions hand off when the stream names a successor.
  return true
}

export function resolveAuthoritativeSessionHandoffEvent(
  event: string,
  data: unknown,
): {
  fromSessionKey: string
  sessionKey: string
  friendlyId: string
  runId: string | null
  verifiedCardAuthority?: SessionCardHandoffAuthority
} | null {
  if (event !== 'session_handoff' || !data || typeof data !== 'object') {
    return null
  }
  const payload = data as Record<string, unknown>
  const fromSessionKey =
    typeof payload.fromSessionKey === 'string'
      ? payload.fromSessionKey.trim()
      : ''
  const sessionKey =
    typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : ''
  if (
    !fromSessionKey ||
    !sessionKey ||
    SESSION_BOOTSTRAP_KEYS.has(sessionKey) ||
    fromSessionKey === sessionKey
  )
    return null
  const friendlyId =
    typeof payload.friendlyId === 'string' && payload.friendlyId.trim()
      ? payload.friendlyId.trim()
      : sessionKey
  const runId =
    typeof payload.runId === 'string' && payload.runId.trim()
      ? payload.runId.trim()
      : null
  let verifiedCardAuthority: SessionCardHandoffAuthority | undefined
  if (payload.verifiedCardAuthority !== undefined) {
    if (
      !payload.verifiedCardAuthority ||
      typeof payload.verifiedCardAuthority !== 'object' ||
      Array.isArray(payload.verifiedCardAuthority)
    ) {
      return null
    }
    const authority = payload.verifiedCardAuthority as Record<string, unknown>
    const authorityCardId = authority.cardId
    const authorityCanonicalSegmentKey = authority.canonicalSegmentKey
    const authoritySource = sourceQualifiedIdentitySource(authorityCardId)
    const authoritySegments = authority.continuationSegmentKeys
    if (
      !isExactNonblankIdentity(authorityCardId) ||
      !authoritySource ||
      authority.cardId !== friendlyId ||
      authority.canonicalSource !== authoritySource ||
      !isExactNonblankIdentity(authorityCanonicalSegmentKey) ||
      authorityCanonicalSegmentKey !== sessionKey ||
      sourceQualifiedIdentitySource(authorityCanonicalSegmentKey) !==
        authoritySource ||
      authority.relationshipKind !== 'root' ||
      !Array.isArray(authoritySegments) ||
      authoritySegments.length === 0 ||
      new Set(authoritySegments).size !== authoritySegments.length ||
      authoritySegments.at(-1) !== sessionKey ||
      !authoritySegments.every(
        (segmentKey) =>
          isExactNonblankIdentity(segmentKey) &&
          sourceQualifiedIdentitySource(segmentKey) === authoritySource,
      )
    ) {
      return null
    }
    verifiedCardAuthority = {
      cardId: authorityCardId,
      canonicalSource: authoritySource,
      canonicalSegmentKey: authorityCanonicalSegmentKey,
      continuationSegmentKeys: [...authoritySegments],
      relationshipKind: 'root',
      childNodes: [],
    }
  }
  return {
    fromSessionKey,
    sessionKey,
    friendlyId,
    runId,
    ...(verifiedCardAuthority ? { verifiedCardAuthority } : {}),
  }
}

export function resolveAuthoritativeCardHandoffEvent(
  event: string,
  data: unknown,
): SessionCardHandoffTransition | null {
  if (event !== 'card_handoff' || !data || typeof data !== 'object') {
    return null
  }
  const payload = data as Record<string, unknown>
  const { cardId, fromSegmentKey, canonicalSegmentKey } = payload
  const cardSource = sourceQualifiedIdentitySource(cardId)
  const fromSource = sourceQualifiedIdentitySource(fromSegmentKey)
  const canonicalSource = sourceQualifiedIdentitySource(canonicalSegmentKey)
  if (
    !isExactNonblankIdentity(cardId) ||
    !isExactNonblankIdentity(fromSegmentKey) ||
    !isExactNonblankIdentity(canonicalSegmentKey) ||
    !cardSource ||
    fromSource !== cardSource ||
    canonicalSource !== cardSource ||
    SESSION_BOOTSTRAP_KEYS.has(canonicalSegmentKey) ||
    fromSegmentKey === canonicalSegmentKey ||
    !isExactNonblankIdentity(payload.runId)
  ) {
    return null
  }
  const runId = payload.runId
  if (
    !Array.isArray(payload.verifiedContinuationSegmentKeys) ||
    payload.verifiedContinuationSegmentKeys.length < 2 ||
    !payload.verifiedContinuationSegmentKeys.every(isExactNonblankIdentity)
  ) {
    return null
  }
  return {
    cardId,
    fromSegmentKey,
    canonicalSegmentKey,
    runId,
    verifiedContinuationSegmentKeys: [
      ...payload.verifiedContinuationSegmentKeys,
    ],
  }
}

export type AuthoritativeCardHandoff = NonNullable<
  ReturnType<typeof resolveAuthoritativeCardHandoffEvent>
>

export function shouldApplyCardHandoff({
  handoff,
  activeCard,
  sessionCards,
  currentSegmentKey,
  activeRunId,
}: {
  handoff: AuthoritativeCardHandoff
  activeCard?: Pick<
    SessionCard,
    | 'cardId'
    | 'canonicalSource'
    | 'canonicalSegmentKey'
    | 'continuationSegmentKeys'
    | 'relationshipKind'
    | 'childNodes'
  >
  sessionCards?: ReadonlyArray<SessionCard>
  currentSegmentKey: string
  activeRunId: string | null
}): boolean {
  return (
    Boolean(activeRunId) &&
    handoff.runId === activeRunId &&
    isValidSessionCardHandoffTransition({
      handoff,
      activeCard,
      currentSegmentKey,
      sessionCards,
    })
  )
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
  /** Called only once a successful response has yielded an actual SSE reader. */
  onReaderOpened?: (sessionKey: string) => void
  onAbort?: (sessionKey: string) => void
  onSessionResolved?: (payload: {
    fromSessionKey: string
    sessionKey: string
    friendlyId: string
    reason: 'bootstrap' | 'stream-handoff'
  }) => void
  activeCard?: SessionCard
  sessionCards?: ReadonlyArray<SessionCard>
  onCardHandoff?: (
    payload: AuthoritativeCardHandoff,
    authority: SessionCardHandoffAuthority,
  ) => boolean
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
    onReaderOpened,
    onAbort,
    onSessionResolved,
    activeCard,
    sessionCards,
    onCardHandoff,
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
  // Browser ownership is Card-only once an authoritative Card is known. Raw
  // segment keys remain confined to the request and SSE transport boundary.
  const activeCardIdRef = useRef<string | null>(null)
  // Stream-owned Card authority. Unlike the render-captured active Card, this
  // advances synchronously while a coalesced SSE batch is being processed.
  // That lets a bootstrap handoff establish Card ownership before a chained
  // card_handoff in the same reader.read() result, without weakening the exact
  // Card/segment checks for unrelated events.
  const activeStreamCardRef = useRef<SessionCardHandoffAuthority | null>(null)
  // After one accepted Card continuation, event-derived authority cannot chain
  // again until React supplies a mounted Card projection containing that tip.
  const awaitingProjectedSegmentRef = useRef<string | null>(null)
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
  const processCardEvent = useChatStore((s) => s.processCardEvent)
  const clearStreamingSession = useChatStore((s) => s.clearStreamingSession)
  const clearCardStreaming = useChatStore((s) => s.clearCardStreaming)
  const claimSessionStateForCard = useChatStore(
    (s) => s.claimSessionStateForCard,
  )

  const processBrowserEvent = useCallback(
    (event: Parameters<typeof processStoreEvent>[0]) => {
      const cardId = activeCardIdRef.current
      if (cardId) processCardEvent(cardId, event)
      else processStoreEvent(event)
    },
    [processCardEvent, processStoreEvent],
  )

  const clearBrowserStreaming = useCallback(() => {
    const cardId = activeCardIdRef.current
    if (cardId) clearCardStreaming(cardId)
    else clearStreamingSession(activeSessionKeyRef.current)
  }, [clearCardStreaming, clearStreamingSession])

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
      clearBrowserStreaming()
      activeCardIdRef.current = null
      activeStreamCardRef.current = null
      awaitingProjectedSegmentRef.current = null
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
    [clearBrowserStreaming, clearHandoffTimer, clearSendStreamRun, stopFrame],
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
      clearBrowserStreaming()
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        error: message,
      }))
      onError?.(message)
      useChatStore.getState().setHeartbeatActivity(null)
    },
    [
      clearBrowserStreaming,
      clearHandoffTimer,
      clearSendStreamRun,
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
            store.streamingState.get(
              activeCardIdRef.current ?? activeSessionKeyRef.current,
            ) ?? null
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
        ...(completedRunId
          ? {
              runId: completedRunId,
              stableId: `stream-run:${completedRunId}`,
            }
          : {}),
      }

      onComplete?.(message)
      useChatStore.getState().setHeartbeatActivity(null)
    },
    [clearHandoffTimer, onComplete, stopFrame, unregisterSendStreamRun],
  )

  const applySessionHandoff = useCallback(
    (
      fromSessionKey: string,
      resolvedSessionKey: string,
      resolvedFriendlyId: string,
      verifiedCardAuthority?: SessionCardHandoffAuthority,
    ) => {
      const currentSessionKey = activeSessionKeyRef.current
      if (fromSessionKey !== currentSessionKey) return
      if (
        !shouldResolveStreamSession({
          requestedSessionKey: requestedSessionKeyRef.current,
          currentSessionKey,
          resolvedSessionKey,
          pinMainSession,
        })
      ) {
        return
      }

      const hasVerifiedCardAuthority =
        SESSION_BOOTSTRAP_KEYS.has(fromSessionKey) &&
        verifiedCardAuthority &&
        verifiedCardAuthority.cardId === resolvedFriendlyId &&
        verifiedCardAuthority.canonicalSegmentKey === resolvedSessionKey
      if (hasVerifiedCardAuthority) {
        claimSessionStateForCard(fromSessionKey, verifiedCardAuthority.cardId)
        activeCardIdRef.current = verifiedCardAuthority.cardId
        activeStreamCardRef.current = verifiedCardAuthority
      }
      activeSessionKeyRef.current = resolvedSessionKey
      onSessionResolved?.({
        fromSessionKey,
        sessionKey: resolvedSessionKey,
        friendlyId: resolvedFriendlyId || resolvedSessionKey,
        reason: SESSION_BOOTSTRAP_KEYS.has(fromSessionKey)
          ? 'bootstrap'
          : 'stream-handoff',
      })
    },
    [claimSessionStateForCard, onSessionResolved, pinMainSession],
  )

  const processEvent = useCallback(
    (event: string, data: unknown) => {
      const payload = data as Record<string, unknown>

      // [DEBUG TUI] Log every SSE event so we can see whether tool.* events arrive
      // from Hermes Agent through Workspace. Toggle off by setting
      // localStorage.removeItem('hermes:debug:sse')
      if (
        typeof window !== 'undefined' &&
        window.localStorage.getItem('hermes:debug:sse') === '1'
      ) {
        console.log(
          '[hermes-sse]',
          event,
          (payload.name as string) || '',
          (payload.phase as string) || '',
          payload,
        )
      }

      // hb_signal/keepalive events from server: just mark activity, never let them
      // surface as user-visible thinking or tool rows.
      if (
        event === 'hb_signal' ||
        event === 'heartbeat' ||
        event === 'keepalive' ||
        event === 'ping'
      ) {
        markActivity()
        return
      }

      switch (event) {
        case 'started': {
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
          processBrowserEvent({
            type: 'chunk',
            text: '',
            runId: runId ?? undefined,
            sessionKey: activeSessionKeyRef.current,
            transport: 'send-stream',
          })
          onStarted?.({ runId: runId ?? null })
          break
        }
        case 'card_handoff': {
          const handoff = resolveAuthoritativeCardHandoffEvent(event, data)
          const streamCard = activeStreamCardRef.current
          const projectedCard = activeCard
          const awaitingProjectedSegment = awaitingProjectedSegmentRef.current
          const projectionHasAcceptedPredecessor = Boolean(
            awaitingProjectedSegment &&
            projectedCard &&
            projectedCard.cardId === streamCard?.cardId &&
            projectedCard.continuationSegmentKeys.includes(
              awaitingProjectedSegment,
            ),
          )
          if (awaitingProjectedSegment && !projectionHasAcceptedPredecessor) {
            break
          }
          if (projectionHasAcceptedPredecessor) {
            awaitingProjectedSegmentRef.current = null
          }
          const renderCard =
            projectedCard &&
            projectedCard.cardId === streamCard?.cardId &&
            projectedCard.continuationSegmentKeys.includes(
              activeSessionKeyRef.current,
            )
              ? projectedCard
              : (streamCard ?? undefined)
          if (
            !handoff ||
            !shouldApplyCardHandoff({
              handoff,
              activeCard: renderCard,
              sessionCards,
              currentSegmentKey: activeSessionKeyRef.current,
              activeRunId: activeRunIdRef.current,
            })
          ) {
            break
          }
          const targetCardAuthority: SessionCardHandoffAuthority = {
            ...renderCard!,
            canonicalSegmentKey: handoff.canonicalSegmentKey,
            continuationSegmentKeys: [
              ...handoff.verifiedContinuationSegmentKeys,
            ],
          }
          // The Card cache/recovery move must agree before the live store and
          // stream baseline advance. A missing consumer fails closed.
          if (onCardHandoff?.(handoff, targetCardAuthority) !== true) break
          activeRunIdRef.current = handoff.runId
          registerSendStreamRun(handoff.runId)
          // Same-Card continuation: only the ephemeral transport segment moves.
          // Browser live state remains under the single stable Card owner.
          activeSessionKeyRef.current = handoff.canonicalSegmentKey
          activeCardIdRef.current = handoff.cardId
          activeStreamCardRef.current = targetCardAuthority
          awaitingProjectedSegmentRef.current = handoff.canonicalSegmentKey
          onSessionResolved?.({
            fromSessionKey: handoff.fromSegmentKey,
            sessionKey: handoff.canonicalSegmentKey,
            friendlyId: handoff.cardId,
            reason: 'stream-handoff',
          })
          break
        }
        case 'session_handoff': {
          if (activeStreamCardRef.current) break
          const handoff = resolveAuthoritativeSessionHandoffEvent(event, data)
          if (!handoff) break
          if (handoff.runId) {
            activeRunIdRef.current = handoff.runId
            registerSendStreamRun(handoff.runId)
          }
          applySessionHandoff(
            handoff.fromSessionKey,
            handoff.sessionKey,
            handoff.friendlyId,
            handoff.verifiedCardAuthority,
          )
          break
        }
        case 'assistant': {
          const text = (payload as { text?: string }).text ?? ''
          if (text) {
            markActivity()
            processBrowserEvent({
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
            processBrowserEvent({
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
            /^still\s+working[.\u2026]*\s*$/i.test(thinking.trim())
          if (isKeepalivePlaceholder) break
          if (thinking) {
            markActivity()
            thinkingRef.current = thinking
            processBrowserEvent({
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
          processBrowserEvent({
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
          processBrowserEvent({
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
          processBrowserEvent({
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
          const activity =
            (payload as { activity?: string | null }).activity ?? null
          useChatStore.getState().setHeartbeatActivity(activity)
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
      activeCard,
      applySessionHandoff,
      finishStream,
      markFailed,
      onCardHandoff,
      onStarted,
      onThinking,
      onTool,
      markActivity,
      processBrowserEvent,
      pushTargetText,
      registerSendStreamRun,
      sessionCards,
      transitionToHandoff,
    ],
  )

  // A stream reader can outlive the render that started it. Dispatch through
  // the latest callback so a bootstrap route rerender can supply its accepted
  // Card identity before a later card_handoff arrives on the same reader.
  const processEventRef = useRef(processEvent)
  processEventRef.current = processEvent

  const startStreaming = useCallback(
    async (params: {
      sessionKey: string
      friendlyId: string
      cardId?: string
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
          processBrowserEvent({
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
      activeCardIdRef.current = params.cardId ?? null
      const selectedCard = activeCard
      activeStreamCardRef.current =
        selectedCard &&
        selectedCard.cardId === params.cardId &&
        selectedCard.continuationSegmentKeys.includes(params.sessionKey)
          ? selectedCard
          : null
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
      useChatStore.getState().setHeartbeatActivity(null)

      try {
        const response = await fetch('/api/send-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionKey: params.sessionKey,
            friendlyId: params.friendlyId,
            cardId: params.cardId,
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

        markAccepted()
        schedulePostAcceptanceTimeout('accepted')

        // HTTP 200 — message accepted by Hermes Agent. Clear optimistic "sending"
        // status so the Retry timer never fires. Hermes Agent does NOT echo
        // user messages via SSE, so this is the only confirmation we get.
        if (params.idempotencyKey && onMessageAccepted) {
          onMessageAccepted(
            activeSessionKeyRef.current,
            params.friendlyId || activeSessionKeyRef.current,
            params.idempotencyKey,
          )
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }
        // Do not report local ownership until the response has produced a real
        // SSE reader. A hanging request or body-less success must remain subject
        // to normal active-run/history fail-closed recovery.
        onReaderOpened?.(mySessionKey)

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
              processEventRef.current(currentEvent, JSON.parse(currentData))
            } catch {
              // Ignore invalid SSE data.
            }
          }
        }

        const lifecyclePhase = lifecyclePhaseRef.current as StreamLifecyclePhase
        const streamFinished = () => finishedRef.current
        if (!streamFinished() && lifecyclePhase !== 'handoff') {
          // If the stream ended cleanly (no 'done' event) but we never received
          // any response text, treat it as a failure rather than a successful
          // empty completion. This happens when a proxy (e.g., Tailscale Serve)
          // closes the connection after an idle timeout — the reader returns
          // { done: true } but the model was still generating. Fixes #512.
          if (
            !fullTextRef.current &&
            (lifecyclePhase === 'accepted' || lifecyclePhase === 'active')
          ) {
            markFailed(
              'Connection closed before response was received. The backend may still be processing — check server logs or retry.',
            )
          } else {
            finishStream()
          }
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
          onAbort?.(mySessionKey)
          return
        }
        const errorMessage = err instanceof Error ? err.message : String(err)
        markFailed(errorMessage)
      }
    },
    [
      activeCard,
      applySessionHandoff,
      finishStream,
      markAccepted,
      markFailed,
      onAbort,
      onMessageAccepted,
      onReaderOpened,
      processBrowserEvent,
      resetActiveStreamState,
      schedulePostAcceptanceTimeout,
    ],
  )

  const cancelStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.abort()
      eventSourceRef.current = null
    }
    finishedRef.current = true
    resetActiveStreamState()
  }, [resetActiveStreamState])

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
