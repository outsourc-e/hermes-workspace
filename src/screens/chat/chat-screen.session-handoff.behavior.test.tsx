// @vitest-environment jsdom
import React, { useCallback, useRef, useState } from 'react'
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { getByRole } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { applySessionRouteResolution } from '../../routes/chat/-session-route-state'
import { useChatStore } from '../../stores/chat-store'
import { CHAT_SUBMIT_SELECTION_EVENT } from './chat-events'
import { chatQueryKeys, sessionCardQueryKeys } from './chat-queries'
import { ChatScreen } from './chat-screen'
import {
  hasPendingGeneration,
  persistPendingMessage,
  readPendingMessage,
  resetPendingSend,
} from './pending-send'
import type { SessionRouteResolutionPayload } from '../../routes/chat/-session-route-state'
import type {
  SessionCardHistoryResponse,
  SessionCardListWire,
} from './chat-queries'
import type { ChatMessage, HistoryResponse, SessionCard } from './types'

const navigate = vi.fn()
const cardMutationMocks = vi.hoisted(() => ({
  archiveSessionCard: vi.fn(),
  branchSessionCard: vi.fn(),
  updateSessionCardMetadata: vi.fn(),
}))
const queryContext = vi.hoisted(() => ({
  client: null as unknown as QueryClient,
  cardHistories: new Map<string, SessionCardHistoryResponse>(),
  cardHistoryRefetches: new Map<string, ReturnType<typeof vi.fn>>(),
  cardHistoryInput: null as null | {
    cardId: string
    canonicalSegmentKey: string
  },
  chatMode: 'enhanced' as 'enhanced' | 'portable',
  connectionState: 'connected' as 'connected' | 'disconnected',
  realtimeStreaming: false,
  realtimeStreamingText: '',
  realtimeStreamingThinking: '',
  realtimeLifecycleEvents: [] as Array<unknown>,
  realtimeToolCalls: [] as Array<{ name: string }>,
  realtimeInput: null as null | {
    sessionKey: string
    friendlyId: string
    portableMode: boolean
    enabled: boolean
  },
  activeRunInput: null as null | {
    sessionKey: string
    cardId?: string
    enabled: boolean
    shouldApplyResult?: (sessionKey: string) => boolean
  },
  activeRunAutoComplete: true,
  messageListProps: null as null | {
    sessionKey?: string
    waitingForResponse?: boolean
    isStreaming?: boolean
    activeToolCalls: Array<{ name: string }>
    liveToolActivity: Array<{ name: string }>
  },
  messageListSnapshots: [] as Array<{
    sessionKey?: string
    waitingForResponse?: boolean
  }>,
  mobile: false,
  legacySessionsFailure: false,
  newRouteResolvesLegacyMain: false,
  legacySessionsEnabled: undefined as boolean | undefined,
  legacyHistoryInput: null as null | {
    activeFriendlyId: string
    activeSessionKey: string
    forcedSessionKey?: string
  },
  legacySessionsRefetch: vi.fn(),
  mobileSessionCards: [] as Array<SessionCard>,
}))

function cardList(
  cards: Array<SessionCard>,
  incompleteCardIds: ReadonlyArray<string> = [],
): SessionCardListWire {
  const incompleteIds = new Set(incompleteCardIds)
  return {
    cards,
    cardResolutions: cards.map((card) => ({
      cardId: card.cardId,
      completeness: incompleteIds.has(card.cardId) ? 'incomplete' : 'complete',
      retryable: incompleteIds.has(card.cardId),
    })),
    completeness: 'complete',
    retryable: false,
    sources: [],
  }
}

vi.mock('./chat-queries', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  archiveSessionCard: cardMutationMocks.archiveSessionCard,
  branchSessionCard: cardMutationMocks.branchSessionCard,
  updateSessionCardMetadata: cardMutationMocks.updateSessionCardMetadata,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useQueryClient: () => queryContext.client,
    useQuery: ({ queryKey }: { queryKey: Array<unknown> }) => {
      const isCardHistory =
        queryKey[0] === 'chat' &&
        queryKey[1] === 'session-cards' &&
        queryKey[2] === 'history'
      if (isCardHistory) {
        queryContext.cardHistoryInput = {
          cardId: String(queryKey[3] ?? ''),
          canonicalSegmentKey: String(queryKey[4] ?? ''),
        }
      }
      const historyCardId = isCardHistory
        ? String(queryKey[3] ?? '')
        : queryKey[0] === 'chat' &&
            queryKey[1] === 'session-cards' &&
            queryKey[2] === 'child-history'
          ? String(queryKey[4] ?? '')
          : ''
      const data = historyCardId
        ? queryContext.cardHistories.get(historyCardId)
        : queryKey[0] === 'models'
          ? { models: [] }
          : queryKey[0] === 'claude' && queryKey[1] === 'status'
            ? { ok: true, status: 200 }
            : ''
      return {
        data,
        dataUpdatedAt: 0,
        error: null,
        isError: false,
        isFetching: false,
        isLoading: false,
        isSuccess: true,
        refetch:
          queryContext.cardHistoryRefetches.get(historyCardId) ??
          vi.fn().mockResolvedValue(undefined),
      }
    },
  }
})

vi.mock('../../stores/chat-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & { useChatStore: typeof useChatStore }
  >()
  const original = actual.useChatStore
  const useChatStoreWithoutSubscription = Object.assign(
    <T,>(selector: (state: ReturnType<typeof original.getState>) => T) =>
      selector(original.getState()),
    original,
  )
  return { ...actual, useChatStore: useChatStoreWithoutSubscription }
})

vi.mock('@/stores/workspace-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & {
      useWorkspaceStore: {
        getState: () => unknown
      }
    }
  >()
  const original = actual.useWorkspaceStore
  const useWorkspaceStoreWithoutSubscription = Object.assign(
    (selector: (state: unknown) => unknown) => selector(original.getState()),
    original,
  )
  return {
    ...actual,
    useWorkspaceStore: useWorkspaceStoreWithoutSubscription,
  }
})

vi.mock('@/stores/terminal-panel-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & {
      useTerminalPanelStore: {
        getState: () => unknown
      }
    }
  >()
  const original = actual.useTerminalPanelStore
  const useTerminalPanelStoreWithoutSubscription = Object.assign(
    (selector: (state: unknown) => unknown) => selector(original.getState()),
    original,
  )
  return {
    ...actual,
    useTerminalPanelStore: useTerminalPanelStoreWithoutSubscription,
  }
})

vi.mock('@/stores/chat-activity-store', async (importOriginal) => {
  const actual = await importOriginal<
    Record<string, unknown> & {
      useChatActivityStore: {
        getState: () => unknown
      }
    }
  >()
  const original = actual.useChatActivityStore
  const useChatActivityStoreWithoutSubscription = Object.assign(
    (selector: (state: unknown) => unknown) => selector(original.getState()),
    original,
  )
  return {
    ...actual,
    useChatActivityStore: useChatActivityStoreWithoutSubscription,
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('./components/chat-header', () => ({
  ChatHeader: ({
    activeTitle,
    onRenameTitle,
  }: {
    activeTitle: string
    onRenameTitle?: (nextTitle: string) => Promise<void> | void
  }) => (
    <div>
      <div data-testid="chat-header-title">{activeTitle}</div>
      <button
        type="button"
        data-testid="chat-header-rename"
        disabled={!onRenameTitle}
        onClick={() => void onRenameTitle?.('Renamed from header')}
      />
    </div>
  ),
}))
vi.mock('./components/chat-message-list', () => ({
  ChatMessageList: (props: {
    messages: Array<ChatMessage>
    waitingForResponse?: boolean
    isStreaming?: boolean
    activeToolCalls?: Array<{ name: string }>
    liveToolActivity?: Array<{ name: string }>
    sessionKey?: string
  }) => {
    queryContext.messageListProps = {
      sessionKey: props.sessionKey,
      waitingForResponse: props.waitingForResponse,
      isStreaming: props.isStreaming,
      activeToolCalls: props.activeToolCalls ?? [],
      liveToolActivity: props.liveToolActivity ?? [],
    }
    queryContext.messageListSnapshots.push({
      sessionKey: props.sessionKey,
      waitingForResponse: props.waitingForResponse,
    })
    return (
      <div data-testid="chat-transcript">{JSON.stringify(props.messages)}</div>
    )
  },
}))
vi.mock('./components/chat-empty-state', () => ({ ChatEmptyState: () => null }))
vi.mock('./components/connection-status-message', () => ({
  ConnectionStatusMessage: ({ error }: { error: string }) => (
    <div data-testid="connection-error">{error}</div>
  ),
}))
vi.mock('./components/context-bar', () => ({ ContextBar: () => null }))
vi.mock('@/components/file-explorer', () => ({
  FileExplorerSidebar: () => null,
}))
vi.mock('@/components/terminal-panel', () => ({ TerminalPanel: () => null }))
vi.mock('@/components/agent-view/agent-view-panel', () => ({
  AgentViewPanel: () => null,
}))
vi.mock('@/components/model-suggestion-toast', () => ({
  ModelSuggestionToast: () => null,
}))
vi.mock('@/components/mobile-sessions-panel', () => ({
  MobileSessionsPanel: (props: {
    sessionCards: Array<SessionCard>
    onSelectSession?: (cardId: string) => void
    onRenameCard?: (cardId: string, nextTitle: string) => void
    onTogglePin?: (cardId: string) => void
    onBranchCard?: (cardId: string) => void
    onArchiveCard?: (cardId: string) => void
  }) => {
    queryContext.mobileSessionCards = props.sessionCards
    return (
      <div>
        {props.sessionCards.map((card) => (
          <button
            key={card.cardId}
            type="button"
            onClick={() => props.onSelectSession?.(card.cardId)}
          >
            {card.title}
          </button>
        ))}
        <button
          type="button"
          data-testid="mobile-rename"
          onClick={() => props.onRenameCard?.('remote:parent', 'Mobile title')}
        />
        <button
          type="button"
          data-testid="mobile-pin"
          onClick={() => props.onTogglePin?.('remote:parent')}
        />
        <button
          type="button"
          data-testid="mobile-branch"
          onClick={() => props.onBranchCard?.('remote:parent')}
        />
        <button
          type="button"
          data-testid="mobile-archive"
          onClick={() => props.onArchiveCard?.('remote:parent')}
        />
      </div>
    )
  },
}))
vi.mock('@/components/usage-meter/context-alert-modal', () => ({
  ContextAlertModal: () => null,
}))
vi.mock('@/components/error-toast', () => ({
  ErrorToastContainer: () => null,
  showErrorToast: vi.fn(),
}))
vi.mock('./components/chat-composer', () => ({
  ChatComposer: (props: {
    onSubmit: (
      body: string,
      attachments: Array<never>,
      fastMode: boolean,
      helpers: {
        reset: () => void
        setValue: () => void
        getValue: () => string
      },
    ) => void
  }) => (
    <button
      type="button"
      data-testid="send-message"
      onClick={() =>
        props.onSubmit('continue', [], false, {
          reset() {},
          setValue() {},
          getValue: () => '',
        })
      }
    >
      Send
    </button>
  ),
}))

vi.mock('./hooks/use-chat-measurements', () => ({
  useChatMeasurements: () => ({
    headerRef: { current: null },
    composerRef: { current: null },
    mainRef: { current: null },
    pinGroupMinHeight: 0,
    headerHeight: 0,
  }),
}))
vi.mock('./hooks/use-chat-mobile', () => ({
  useChatMobile: () => ({ isMobile: queryContext.mobile }),
}))
vi.mock('./hooks/use-chat-sessions', () => ({
  useChatSessions: ({
    activeFriendlyId,
    forcedSessionKey,
    enabled,
  }: {
    activeFriendlyId: string
    forcedSessionKey?: string
    enabled?: boolean
  }) => {
    queryContext.legacySessionsEnabled = enabled
    const routeHasNoLegacySession =
      queryContext.newRouteResolvesLegacyMain && activeFriendlyId === 'new'
    const sessionKey = routeHasNoLegacySession
      ? ''
      : (forcedSessionKey ?? activeFriendlyId)
    const activeSession = routeHasNoLegacySession
      ? undefined
      : {
          key: sessionKey,
          friendlyId: activeFriendlyId,
          updatedAt: 1,
          lineage: { source: 'remote' as const },
        }
    return {
      sessionsQuery: {
        status: queryContext.legacySessionsFailure ? 'error' : 'success',
        isSuccess: !queryContext.legacySessionsFailure,
        refetch: queryContext.legacySessionsRefetch,
      },
      sessions:
        queryContext.legacySessionsFailure || !activeSession
          ? []
          : [activeSession],
      activeSession: queryContext.legacySessionsFailure
        ? undefined
        : activeSession,
      activeExists: !queryContext.legacySessionsFailure,
      activeSessionKey: sessionKey,
      activeTitle: activeFriendlyId,
      sessionsError: queryContext.legacySessionsFailure
        ? 'Unauthorized legacy sessions'
        : null,
      sessionsLoading: false,
      sessionsFetching: false,
      refetchSessions: vi.fn(),
    }
  },
}))
vi.mock('./hooks/use-chat-history', () => ({
  useChatHistory: ({
    activeFriendlyId,
    activeSessionKey,
    forcedSessionKey,
  }: {
    activeFriendlyId: string
    activeSessionKey: string
    forcedSessionKey?: string
  }) => {
    queryContext.legacyHistoryInput = {
      activeFriendlyId,
      activeSessionKey,
      ...(forcedSessionKey === undefined ? {} : { forcedSessionKey }),
    }
    const sessionKey =
      forcedSessionKey ??
      (activeSessionKey ||
        (queryContext.newRouteResolvesLegacyMain && activeFriendlyId === 'new'
          ? 'main'
          : activeSessionKey))
    return {
      historyQuery: {
        data: { sessionKey, messages: [] },
        dataUpdatedAt: 0,
        isError: false,
        isFetching: false,
        isLoading: false,
        isSuccess: true,
        refetch: vi.fn().mockResolvedValue(undefined),
      },
      historyMessages: [],
      messageCount: 0,
      historyError: null,
      resolvedSessionKey: sessionKey,
      activeCanonicalKey: sessionKey,
      sessionKeyForHistory: sessionKey,
    }
  },
}))
vi.mock('./hooks/use-realtime-chat-history', () => ({
  useRealtimeChatHistory: (input: {
    historyMessages: Array<ChatMessage>
    sessionKey: string
    friendlyId: string
    portableMode: boolean
    enabled: boolean
  }) => {
    queryContext.realtimeInput = input
    return {
      messages: input.historyMessages,
      lastCompletedRunAt: 0,
      connectionState: queryContext.connectionState,
      isRealtimeStreaming: queryContext.realtimeStreaming,
      realtimeStreamingText: queryContext.realtimeStreamingText,
      realtimeStreamingThinking: queryContext.realtimeStreamingThinking,
      realtimeLifecycleEvents: queryContext.realtimeLifecycleEvents,
      completedStreamingText: { current: '' },
      completedStreamingThinking: { current: '' },
      clearCompletedStreaming: vi.fn(),
      streamingRunId: null,
      activeToolCalls: queryContext.realtimeToolCalls,
    }
  },
}))
vi.mock('./hooks/use-smooth-streaming-text', () => ({
  useSmoothStreamingText: (text: string) => text,
}))
vi.mock('./hooks/use-active-run-check', () => ({
  activeRunCheckUrl: (sessionKey: string, cardId?: string) => {
    const path = `/api/sessions/${encodeURIComponent(sessionKey)}/active-run`
    return cardId ? `${path}?cardId=${encodeURIComponent(cardId)}` : path
  },
  useActiveRunCheck: (input: {
    sessionKey: string
    cardId?: string
    enabled: boolean
    shouldApplyResult?: (sessionKey: string) => boolean
    onCheckComplete?: (sessionKey: string) => void
  }) => {
    queryContext.activeRunInput = input
    React.useEffect(() => {
      if (queryContext.activeRunAutoComplete) {
        input.onCheckComplete?.(input.sessionKey)
      }
    }, [input.onCheckComplete, input.sessionKey])
  },
}))
vi.mock('./hooks/use-auto-session-title', () => ({
  useAutoSessionTitle: () => {},
}))
vi.mock('./hooks/use-rename-session', () => ({
  useRenameSession: () => ({ renameSession: vi.fn(), renaming: false }),
}))
vi.mock('./hooks/use-context-alert', () => ({
  useContextAlert: () => ({
    alertOpen: false,
    alertThreshold: 0,
    alertPercent: 0,
    dismissAlert: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-model-suggestions', () => ({
  useModelSuggestions: () => ({
    suggestion: null,
    dismiss: vi.fn(),
    dismissForSession: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-research-card', () => ({ useResearchCard: () => null }))
vi.mock('@/hooks/use-tap-debug', () => ({ useTapDebug: () => {} }))
vi.mock('@/hooks/use-chat-mode', () => ({
  useChatMode: () => queryContext.chatMode,
}))

class StubEventSource {
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await React.act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function userMessage(id: string, text: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', text }],
    timestamp: 1,
  }
}

function createRootCard({
  cardId,
  canonicalSegmentKey,
  canonicalSource = 'remote',
  continuationSegmentKeys = [canonicalSegmentKey],
  updatedAt = 1,
}: {
  cardId: string
  canonicalSegmentKey: string
  canonicalSource?: 'local' | 'remote'
  continuationSegmentKeys?: Array<string>
  updatedAt?: number
}): SessionCard {
  return {
    cardId,
    canonicalSource,
    title: cardId,
    titleSource: 'manual',
    canonicalSegmentKey,
    continuationSegmentKeys,
    continuationCount: continuationSegmentKeys.length,
    relationshipKind: 'root',
    childNodes: [],
    updatedAt,
    archived: false,
    pinned: false,
  }
}

type RouteState = { friendlyId: string; sessionKey: string }

function ChatRouteHarness({
  initialRoute,
  onRouteResolution,
}: {
  initialRoute: RouteState
  onRouteResolution?: (payload: SessionRouteResolutionPayload) => void
}) {
  const queryClient = useQueryClient()
  const [route, setRoute] = useState(initialRoute)
  const latestRouteRef = useRef(initialRoute)
  const handleSessionResolved = useCallback(
    (payload: SessionRouteResolutionPayload) => {
      const currentRoute = latestRouteRef.current
      const transition = applySessionRouteResolution({
        queryClient,
        activeFriendlyId: currentRoute.friendlyId,
        fallbackSessionKey: currentRoute.sessionKey,
        payload,
      })
      latestRouteRef.current = transition.resolvedRoute
      onRouteResolution?.(payload)
      setRoute(transition.resolvedRoute)
    },
    [onRouteResolution, queryClient],
  )

  return (
    <div
      data-testid="route-state"
      data-friendly-id={route.friendlyId}
      data-session-key={route.sessionKey}
    >
      <button
        type="button"
        data-testid="navigate-away"
        onClick={() =>
          setRoute({ friendlyId: 'other-route', sessionKey: 'other-session' })
        }
      >
        Navigate away
      </button>
      <ChatScreen
        activeFriendlyId={route.friendlyId}
        forcedSessionKey={route.sessionKey}
        isNewChat={route.friendlyId === 'new'}
        onSessionResolved={handleSessionResolved}
        compact
      />
    </div>
  )
}

type HandoffEvent =
  | {
      event?: 'session_handoff'
      fromSessionKey: string
      sessionKey: string
      friendlyId: string
      runId: string
    }
  | {
      event: 'card_handoff'
      cardId: string
      fromSegmentKey: string
      canonicalSegmentKey: string
      runId: string
    }

function createReaderHarness(
  handoffs: Array<HandoffEvent> = [
    {
      fromSessionKey: 'backend-parent',
      sessionKey: 'canonical-child',
      friendlyId: 'child-friendly',
      runId: 'run-1',
    },
  ],
) {
  const encoder = new TextEncoder()
  let releaseFirstRead: (() => void) | undefined
  let releaseTerminalRead: (() => void) | undefined
  let requestSignal: AbortSignal | undefined
  let requestBody: Record<string, unknown> | undefined
  let rejectCurrentRead: ((reason?: unknown) => void) | undefined
  let rejectFirstRead: ((reason?: unknown) => void) | undefined
  let rejectPendingRead: ((reason?: unknown) => void) | undefined
  const firstRead = new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve, reject) => {
      rejectFirstRead = reject
      releaseFirstRead = () => {
        rejectCurrentRead = undefined
        resolve({
          done: false,
          value: encoder.encode(
            handoffs
              .flatMap((handoff) => {
                const { event = 'session_handoff', ...payload } = handoff
                return [
                  `event: ${event}`,
                  `data: ${JSON.stringify(payload)}`,
                  '',
                ]
              })
              .concat('')
              .join('\n'),
          ),
        })
      }
    },
  )
  const terminalRead = new Promise<ReadableStreamReadResult<Uint8Array>>(
    (resolve) => {
      releaseTerminalRead = () => {
        resolve({
          done: false,
          value: encoder.encode(
            [
              'event: done',
              'data: {"state":"complete","sessionKey":"backend-b","runId":"run-chain"}',
              '',
              '',
            ].join('\n'),
          ),
        })
      }
    },
  )
  const pendingRead = new Promise<ReadableStreamReadResult<Uint8Array>>(
    (_resolve, reject) => {
      rejectPendingRead = reject
    },
  )
  const reader = {
    read: vi
      .fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
      .mockImplementationOnce(() => {
        rejectCurrentRead = rejectFirstRead
        return firstRead
      })
      .mockImplementationOnce(() => {
        return terminalRead
      })
      .mockImplementation(() => {
        rejectCurrentRead = rejectPendingRead
        return pendingRead
      }),
    cancel: vi.fn().mockResolvedValue(undefined),
  }

  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (String(input) === '/api/send-stream') {
      requestSignal = init?.signal ?? undefined
      requestBody =
        typeof init?.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined
      requestSignal?.addEventListener(
        'abort',
        () => rejectCurrentRead?.(new DOMException('Aborted', 'AbortError')),
        { once: true },
      )
      return Promise.resolve({
        ok: true,
        status: 200,
        body: { getReader: () => reader },
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      } as unknown as Response)
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, models: [] }),
      text: () => Promise.resolve(''),
    } as unknown as Response)
  })

  return {
    reader,
    releaseHandoff: () => releaseFirstRead?.(),
    releaseTerminal: () => releaseTerminalRead?.(),
    getRequestSignal: () => requestSignal,
    getRequestBody: () => requestBody,
  }
}

describe('ChatScreen authoritative session handoff route lifecycle', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('EventSource', StubEventSource)
    window.localStorage.clear()
    window.sessionStorage.clear()
    resetPendingSend()
    navigate.mockReset()
    cardMutationMocks.archiveSessionCard
      .mockReset()
      .mockResolvedValue(undefined)
    cardMutationMocks.branchSessionCard.mockReset().mockResolvedValue(undefined)
    cardMutationMocks.updateSessionCardMetadata
      .mockReset()
      .mockResolvedValue(undefined)
    queryContext.cardHistories.clear()
    queryContext.cardHistoryRefetches.clear()
    queryContext.cardHistoryInput = null
    queryContext.chatMode = 'enhanced'
    queryContext.connectionState = 'connected'
    queryContext.realtimeStreaming = false
    queryContext.realtimeStreamingText = ''
    queryContext.realtimeStreamingThinking = ''
    queryContext.realtimeLifecycleEvents = []
    queryContext.realtimeToolCalls = []
    queryContext.realtimeInput = null
    queryContext.activeRunInput = null
    queryContext.activeRunAutoComplete = true
    queryContext.messageListProps = null
    queryContext.messageListSnapshots = []
    queryContext.mobile = false
    queryContext.legacySessionsFailure = false
    queryContext.newRouteResolvesLegacyMain = false
    queryContext.legacySessionsEnabled = undefined
    queryContext.legacyHistoryInput = null
    queryContext.legacySessionsRefetch.mockReset()
    queryContext.mobileSessionCards = []
    for (const sessionKey of [
      'new',
      'backend-parent',
      'canonical-child',
      'backend-a',
      'backend-b',
      'friendly-route',
      'other-session',
    ]) {
      useChatStore.getState().clearSession(sessionKey)
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetPendingSend()
  })

  it('exposes the header metadata callback only for root Cards and never PATCHes an orphan', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined)
    const rootCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Parent Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:parent-tip',
      continuationSegmentKeys: ['remote:parent-tip'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    const orphanCard: SessionCard = {
      ...rootCard,
      relationshipKind: 'orphan',
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const reactRoot = createRoot(container)
    const render = (activeCard: SessionCard) => {
      React.act(() => {
        reactRoot.render(
          <QueryClientProvider client={queryClient}>
            <ChatScreen
              activeFriendlyId={activeCard.cardId}
              activeCard={activeCard}
              sessionCardList={cardList([activeCard])}
            />
          </QueryClientProvider>,
        )
      })
    }

    render(rootCard)
    const rename = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-header-rename"]',
    )!
    expect(rename.disabled).toBe(false)
    await React.act(async () => {
      rename.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(cardMutationMocks.updateSessionCardMetadata).toHaveBeenCalledWith(
      rootCard.cardId,
      { manualTitle: 'Renamed from header' },
    )

    render(orphanCard)
    const orphanRename = container.querySelector<HTMLButtonElement>(
      '[data-testid="chat-header-rename"]',
    )!
    expect(orphanRename.disabled).toBe(true)
    React.act(() => orphanRename.click())
    expect(cardMutationMocks.updateSessionCardMetadata).toHaveBeenCalledTimes(1)

    React.act(() => reactRoot.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('fails closed when stale mobile callbacks target a non-root Card', async () => {
    queryContext.mobile = true
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const orphanCard: SessionCard = {
      cardId: 'remote:orphan',
      canonicalSource: 'remote',
      title: 'Orphan Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:orphan-tip',
      continuationSegmentKeys: ['remote:orphan-tip'],
      continuationCount: 1,
      relationshipKind: 'orphan',
      childNodes: [],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const reactRoot = createRoot(container)
    React.act(() => {
      reactRoot.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={orphanCard.cardId}
            activeCard={orphanCard}
            sessionCardList={cardList([orphanCard])}
          />
        </QueryClientProvider>,
      )
    })

    await React.act(async () => {
      for (const testId of [
        'mobile-rename',
        'mobile-pin',
        'mobile-branch',
        'mobile-archive',
      ]) {
        container
          .querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
          .click()
      }
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(cardMutationMocks.updateSessionCardMetadata).not.toHaveBeenCalled()
    expect(cardMutationMocks.branchSessionCard).not.toHaveBeenCalled()
    expect(cardMutationMocks.archiveSessionCard).not.toHaveBeenCalled()

    React.act(() => reactRoot.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('does not navigate over a newer Card when an earlier mobile archive completes', async () => {
    queryContext.mobile = true
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined)
    let resolveArchive: (() => void) | undefined
    cardMutationMocks.archiveSessionCard.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveArchive = resolve
        }),
    )
    const parentCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Parent Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:parent-tip',
      continuationSegmentKeys: ['remote:parent-tip'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    const newerCard: SessionCard = {
      ...parentCard,
      cardId: 'remote:newer',
      title: 'Newer Card',
      canonicalSegmentKey: 'remote:newer-tip',
      continuationSegmentKeys: ['remote:newer-tip'],
      updatedAt: 3,
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (activeCard: SessionCard) => {
      React.act(() => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <ChatScreen
              activeFriendlyId={activeCard.cardId}
              activeCard={activeCard}
              sessionCardList={cardList([parentCard, newerCard])}
            />
          </QueryClientProvider>,
        )
      })
    }

    render(parentCard)
    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="mobile-archive"]')!
        .click()
    })
    expect(cardMutationMocks.archiveSessionCard).toHaveBeenCalledWith(
      parentCard.cardId,
    )

    render(newerCard)
    await React.act(async () => {
      resolveArchive?.()
      await Promise.resolve()
      await Promise.resolve()
    })
    await waitForAssertion(() => expect(invalidate).toHaveBeenCalledTimes(2))

    expect(navigate).not.toHaveBeenCalled()

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('mounts one complete and one incomplete Card but gives the mobile menu only the complete Card', () => {
    queryContext.mobile = true
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const complete: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Complete Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:parent-tip',
      continuationSegmentKeys: ['remote:parent-tip'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    const incomplete: SessionCard = {
      ...complete,
      cardId: 'remote:incomplete',
      title: 'Incomplete Card',
      canonicalSegmentKey: 'remote:incomplete-tip',
      continuationSegmentKeys: ['remote:incomplete-tip'],
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={complete.cardId}
            activeCard={complete}
            sessionCardList={cardList(
              [complete, incomplete],
              [incomplete.cardId],
            )}
          />
        </QueryClientProvider>,
      )
    })

    expect(queryContext.mobileSessionCards).toEqual([complete])
    expect(container.textContent).toContain(complete.title)
    expect(container.textContent).not.toContain(incomplete.title)

    React.act(() => root.unmount())
    container.remove()
    queryClient.clear()
  })

  it('shows only validated child Card history and restores parent history under the same Card', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Parent Card title',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:parent-tip',
      continuationSegmentKeys: ['remote:parent', 'remote:parent-tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [
        {
          cardId: 'remote:child',
          sessionKey: 'remote:child-tip',
          continuationSegmentKeys: ['remote:child', 'remote:child-tip'],
          relationshipKind: 'child',
          title: 'Delegate',
          status: 'complete',
          updatedAt: 2,
          continuationCount: 2,
        },
      ],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set('remote:parent', {
      sessionKey: 'remote:parent-tip',
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:parent-tip',
      messages: [userMessage('parent-message', 'parent transcript')],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    queryContext.cardHistories.set('remote:child', {
      sessionKey: 'remote:child-tip',
      cardId: 'remote:child',
      canonicalSegmentKey: 'remote:child-tip',
      messages: [userMessage('child-message', 'child transcript')],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:child-root',
          retryable: true,
          error: 'temporarily unavailable',
        },
      ],
    })
    const retryChildHistory = vi.fn().mockResolvedValue(undefined)
    queryContext.cardHistoryRefetches.set('remote:child', retryChildHistory)

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (inspectedChildCardId?: string) => {
      React.act(() => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <ChatScreen
              activeFriendlyId="remote:parent"
              activeCard={activeCard}
              inspectedChildCardId={inspectedChildCardId}
              sessionCardList={cardList([activeCard])}
            />
          </QueryClientProvider>,
        )
      })
    }

    render('remote:child')
    await waitForAssertion(() => {
      const transcript =
        container.querySelector('[data-testid="chat-transcript"]')
          ?.textContent ?? ''
      expect(transcript).not.toContain('child transcript')
      expect(transcript).not.toContain('parent transcript')
      expect(
        container.querySelector('[data-testid="chat-header-title"]')
          ?.textContent,
      ).toBe('Parent Card title')
      expect(getByRole(container, 'status').textContent).toContain(
        'Inspected child history is unavailable until the complete transcript can be loaded',
      )
    })
    React.act(() => {
      getByRole(container, 'button', {
        name: 'Retry inspected child history',
      }).click()
    })
    expect(retryChildHistory).toHaveBeenCalledTimes(1)

    queryContext.cardHistories.delete('remote:child')
    render('remote:child')
    await waitForAssertion(() => {
      const transcript =
        container.querySelector('[data-testid="chat-transcript"]')
          ?.textContent ?? ''
      expect(transcript).not.toContain('parent transcript')
      expect(transcript).not.toContain('child transcript')
    })

    render()
    await waitForAssertion(() => {
      const transcript =
        container.querySelector('[data-testid="chat-transcript"]')
          ?.textContent ?? ''
      expect(transcript).toContain('parent transcript')
      expect(transcript).not.toContain('child transcript')
    })

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('hides retryable incomplete parent Card history and refetches that Card in place', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Parent Card title',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:parent-tip',
      continuationSegmentKeys: ['remote:parent', 'remote:parent-tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set('remote:parent', {
      sessionKey: 'remote:parent-tip',
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:parent-tip',
      messages: [userMessage('available-message', 'available transcript')],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:missing-segment',
          retryable: true,
          error: 'temporarily unavailable',
        },
      ],
    })
    const retryParentHistory = vi.fn().mockResolvedValue(undefined)
    queryContext.cardHistoryRefetches.set('remote:parent', retryParentHistory)

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId="remote:parent"
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(container.textContent).not.toContain('available transcript')
      expect(getByRole(container, 'status').textContent).toContain(
        'Conversation history is unavailable until the complete transcript can be loaded',
      )
      expect(container.textContent).not.toContain('remote:missing-segment')
    })
    React.act(() => {
      getByRole(container, 'button', {
        name: 'Retry parent conversation history',
      }).click()
    })
    expect(retryParentHistory).toHaveBeenCalledTimes(1)
    expect(container.textContent).not.toContain('available transcript')

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('sends with the parent Card identity and transcript while inspecting child history', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Parent Card title',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:parent-tip',
      continuationSegmentKeys: ['remote:parent', 'remote:parent-tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [
        {
          cardId: 'remote:child',
          sessionKey: 'remote:child-tip',
          continuationSegmentKeys: ['remote:child', 'remote:child-tip'],
          relationshipKind: 'child',
          title: 'Delegate',
          status: 'complete',
          updatedAt: 2,
          continuationCount: 2,
        },
      ],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set('remote:parent', {
      sessionKey: 'remote:parent-tip',
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:parent-tip',
      messages: [userMessage('parent-message', 'parent transcript')],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    queryContext.cardHistories.set('remote:child', {
      sessionKey: 'remote:child-tip',
      cardId: 'remote:child',
      canonicalSegmentKey: 'remote:child-tip',
      messages: [userMessage('child-message', 'child transcript')],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const stream = createReaderHarness([])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId="remote:parent"
            activeCard={activeCard}
            inspectedChildCardId="remote:child"
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(
        container.querySelector('[data-testid="chat-transcript"]')?.textContent,
      ).toContain('child transcript')
    })
    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })

    await waitForAssertion(() => expect(stream.getRequestBody()).toBeDefined())
    expect(stream.getRequestBody()).toMatchObject({
      sessionKey: 'remote:parent-tip',
      friendlyId: 'remote:parent',
      cardId: 'remote:parent',
      message: 'continue',
      history: [{ role: 'user', content: 'parent transcript' }],
    })
    expect(JSON.stringify(stream.getRequestBody()?.history)).not.toContain(
      'child transcript',
    )

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('keeps a remote Card on canonical gateway transport when global chat mode is portable', async () => {
    queryContext.chatMode = 'portable'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard: SessionCard = {
      cardId: 'opaque-card-id',
      canonicalSource: 'remote',
      title: 'Remote Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'opaque-canonical-segment',
      continuationSegmentKeys: ['opaque-canonical-segment'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 1,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set(activeCard.cardId, {
      sessionKey: activeCard.canonicalSegmentKey,
      cardId: activeCard.cardId,
      canonicalSegmentKey: activeCard.canonicalSegmentKey,
      messages: [userMessage('remote-history', 'remote Card history')],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const stream = createReaderHarness([])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={activeCard.cardId}
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })

    await waitForAssertion(() => expect(stream.getRequestBody()).toBeDefined())
    expect(stream.getRequestBody()).toMatchObject({
      sessionKey: 'opaque-canonical-segment',
      friendlyId: 'opaque-card-id',
      cardId: 'opaque-card-id',
      history: [{ role: 'user', content: 'remote Card history' }],
    })
    expect(queryContext.realtimeInput).toMatchObject({
      sessionKey: 'opaque-canonical-segment',
      friendlyId: 'opaque-card-id',
      portableMode: false,
      enabled: true,
    })
    // The local reader owns this active send, so recovery polling must stay
    // disabled until it finishes.
    await waitForAssertion(() =>
      expect(queryContext.activeRunInput).toMatchObject({
        sessionKey: 'opaque-canonical-segment',
        cardId: 'opaque-card-id',
        enabled: false,
      }),
    )

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('keeps a local Card on canonical portable transport when global chat mode is enhanced', async () => {
    queryContext.chatMode = 'enhanced'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard: SessionCard = {
      cardId: 'another-opaque-card-id',
      canonicalSource: 'local',
      title: 'Local Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'another-opaque-canonical-segment',
      continuationSegmentKeys: ['another-opaque-canonical-segment'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 1,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set(activeCard.cardId, {
      sessionKey: activeCard.canonicalSegmentKey,
      cardId: activeCard.cardId,
      canonicalSegmentKey: activeCard.canonicalSegmentKey,
      messages: [userMessage('local-history', 'local Card history')],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const stream = createReaderHarness([])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={activeCard.cardId}
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })

    await waitForAssertion(() => expect(stream.getRequestBody()).toBeDefined())
    expect(stream.getRequestBody()).toMatchObject({
      sessionKey: 'another-opaque-canonical-segment',
      friendlyId: 'another-opaque-card-id',
      cardId: 'another-opaque-card-id',
      history: [{ role: 'user', content: 'local Card history' }],
    })
    expect(queryContext.realtimeInput).toMatchObject({
      sessionKey: 'another-opaque-canonical-segment',
      friendlyId: 'another-opaque-card-id',
      portableMode: false,
      enabled: true,
    })
    await waitForAssertion(() =>
      expect(queryContext.activeRunInput).toMatchObject({
        sessionKey: 'another-opaque-canonical-segment',
        cardId: 'another-opaque-card-id',
        enabled: false,
      }),
    )

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('fails closed when an active Card has no authoritative canonical source', async () => {
    queryContext.chatMode = 'portable'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard: SessionCard = {
      cardId: 'unqualified-card',
      title: 'Unverified Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'unqualified-segment',
      continuationSegmentKeys: ['unqualified-segment'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 1,
      archived: false,
      pinned: false,
    }
    const stream = createReaderHarness([])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={activeCard.cardId}
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await React.act(async () => Promise.resolve())

    expect(stream.getRequestBody()).toBeUndefined()
    expect(queryContext.realtimeInput).toMatchObject({ enabled: false })
    expect(queryContext.activeRunInput).toMatchObject({ enabled: false })
    expect(container.textContent).toContain(
      'Session Card canonical source is missing or invalid.',
    )

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('rerenders the real ChatScreen on an authoritative handoff without aborting its active reader', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'backend-parent',
    )
    const targetHistoryKey = chatQueryKeys.history(
      'child-friendly',
      'canonical-child',
    )
    const routeResolution = vi.fn()
    const stream = createReaderHarness()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{
              friendlyId: 'friendly-route',
              sessionKey: 'backend-parent',
            }}
            onRouteResolution={routeResolution}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })

    await waitForAssertion(() => {
      expect(stream.getRequestSignal()).toBeDefined()
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1)
    })

    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    persistPendingMessage({
      sessionKey: 'backend-parent',
      friendlyId: 'friendly-route',
      message: 'continue',
      attachments: [],
      optimisticMessage,
    })
    useChatStore.getState().processEvent({
      type: 'message',
      message: userMessage('live-1', 'live message'),
      sessionKey: 'backend-parent',
      transport: 'send-stream',
    })
    useChatStore.getState().setSessionWaiting('backend-parent', 'run-1')

    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-friendly-id'),
      ).toBe('child-friendly')
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('canonical-child')
    })

    expect(routeResolution).toHaveBeenCalledWith({
      fromSessionKey: 'backend-parent',
      sessionKey: 'canonical-child',
      friendlyId: 'child-friendly',
      reason: 'stream-handoff',
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<HistoryResponse>(targetHistoryKey)?.messages,
    ).toEqual([optimisticMessage])
    expect(
      readPendingMessage('canonical-child', 'child-friendly'),
    ).toMatchObject({
      sessionKey: 'canonical-child',
      friendlyId: 'child-friendly',
      message: 'continue',
    })
    expect(
      useChatStore.getState().getRealtimeMessages('backend-parent'),
    ).toEqual([])
    expect(
      useChatStore.getState().getRealtimeMessages('canonical-child'),
    ).toMatchObject([userMessage('live-1', 'live message')])
    expect(useChatStore.getState().isSessionWaiting('backend-parent')).toBe(
      false,
    )
    expect(useChatStore.getState().isSessionWaiting('canonical-child')).toBe(
      true,
    )
    expect(stream.reader.read).toHaveBeenCalledTimes(2)
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('uses an immediate Card handoff until a projection containing it advances to a newer canonical segment', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const initialCard = createRootCard({
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:a',
    })
    queryContext.cardHistories.set(initialCard.cardId, {
      sessionKey: 'remote:a',
      cardId: initialCard.cardId,
      canonicalSegmentKey: 'remote:a',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const stream = createReaderHarness([
      {
        event: 'card_handoff',
        cardId: initialCard.cardId,
        fromSegmentKey: 'remote:a',
        canonicalSegmentKey: 'remote:b',
        runId: 'run-card-advance',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (activeCard: SessionCard) => {
      React.act(() => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <ChatScreen
              activeFriendlyId={activeCard.cardId}
              activeCard={activeCard}
              sessionCardList={cardList([activeCard])}
              compact
            />
          </QueryClientProvider>,
        )
      })
    }

    render(initialCard)
    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() =>
      expect(stream.getRequestBody()).toMatchObject({
        sessionKey: 'remote:a',
        cardId: initialCard.cardId,
      }),
    )
    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(queryContext.cardHistoryInput).toEqual({
        cardId: initialCard.cardId,
        canonicalSegmentKey: 'remote:b',
      })
      expect(queryContext.realtimeInput).toMatchObject({
        sessionKey: 'remote:b',
        friendlyId: initialCard.cardId,
        enabled: true,
      })
      expect(queryContext.activeRunInput).toMatchObject({
        sessionKey: 'remote:b',
        cardId: initialCard.cardId,
        enabled: false,
      })
    })

    const advancedCard = createRootCard({
      cardId: initialCard.cardId,
      canonicalSegmentKey: 'remote:c',
      continuationSegmentKeys: ['remote:a', 'remote:b', 'remote:c'],
      updatedAt: 3,
    })
    queryContext.cardHistories.set(advancedCard.cardId, {
      sessionKey: 'remote:c',
      cardId: advancedCard.cardId,
      canonicalSegmentKey: 'remote:c',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    render(advancedCard)

    await waitForAssertion(() => {
      expect(queryContext.cardHistoryInput).toEqual({
        cardId: advancedCard.cardId,
        canonicalSegmentKey: 'remote:c',
      })
      expect(queryContext.realtimeInput).toMatchObject({
        sessionKey: 'remote:c',
        friendlyId: advancedCard.cardId,
        enabled: true,
      })
      expect(queryContext.activeRunInput).toMatchObject({
        sessionKey: 'remote:c',
        cardId: advancedCard.cardId,
        enabled: true,
      })
    })

    React.act(() => {
      window.dispatchEvent(
        new CustomEvent(CHAT_SUBMIT_SELECTION_EVENT, {
          detail: { text: 'send after projection advance' },
        }),
      )
    })
    await waitForAssertion(() =>
      expect(stream.getRequestBody()).toMatchObject({
        sessionKey: 'remote:c',
        friendlyId: advancedCard.cardId,
        cardId: advancedCard.cardId,
        message: 'send after projection advance',
      }),
    )

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('clears a Card handoff when switching to a source-qualified sibling Card', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const remoteCard = createRootCard({
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:a',
    })
    const localCard = createRootCard({
      cardId: 'local:parent',
      canonicalSegmentKey: 'local:tip',
      canonicalSource: 'local',
    })
    for (const card of [remoteCard, localCard]) {
      queryContext.cardHistories.set(card.cardId, {
        sessionKey: card.canonicalSegmentKey,
        cardId: card.cardId,
        canonicalSegmentKey: card.canonicalSegmentKey,
        messages: [],
        completeness: 'complete',
        retryable: false,
        missingSegments: [],
      })
    }
    const stream = createReaderHarness([
      {
        event: 'card_handoff',
        cardId: remoteCard.cardId,
        fromSegmentKey: 'remote:a',
        canonicalSegmentKey: 'remote:b',
        runId: 'run-before-switch',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (activeCard: SessionCard) => {
      React.act(() => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <ChatScreen
              activeFriendlyId={activeCard.cardId}
              activeCard={activeCard}
              sessionCardList={cardList([remoteCard, localCard])}
              compact
            />
          </QueryClientProvider>,
        )
      })
    }

    render(remoteCard)
    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() => expect(stream.getRequestBody()).toBeDefined())
    stream.releaseHandoff()
    await waitForAssertion(() =>
      expect(queryContext.realtimeInput).toMatchObject({
        sessionKey: 'remote:b',
        friendlyId: remoteCard.cardId,
      }),
    )

    render(localCard)
    await waitForAssertion(() =>
      expect(queryContext.realtimeInput).toMatchObject({
        sessionKey: 'local:tip',
        friendlyId: localCard.cardId,
      }),
    )
    render(remoteCard)
    await waitForAssertion(() => {
      expect(queryContext.cardHistoryInput).toEqual({
        cardId: remoteCard.cardId,
        canonicalSegmentKey: 'remote:a',
      })
      expect(queryContext.realtimeInput).toMatchObject({
        sessionKey: 'remote:a',
        friendlyId: remoteCard.cardId,
      })
      expect(queryContext.activeRunInput).toMatchObject({
        sessionKey: 'remote:a',
        cardId: remoteCard.cardId,
      })
    })

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('rejects a Card handoff carrying the same unqualified ID from another source', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard = createRootCard({
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:a',
    })
    queryContext.cardHistories.set(activeCard.cardId, {
      sessionKey: 'remote:a',
      cardId: activeCard.cardId,
      canonicalSegmentKey: 'remote:a',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const stream = createReaderHarness([
      {
        event: 'card_handoff',
        cardId: 'local:parent',
        fromSegmentKey: 'remote:a',
        canonicalSegmentKey: 'remote:b',
        runId: 'run-wrong-source',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={activeCard.cardId}
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })
    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() => expect(stream.getRequestBody()).toBeDefined())
    stream.releaseHandoff()
    await waitForAssertion(() =>
      expect(stream.reader.read).toHaveBeenCalledTimes(2),
    )

    expect(queryContext.cardHistoryInput).toEqual({
      cardId: activeCard.cardId,
      canonicalSegmentKey: 'remote:a',
    })
    expect(queryContext.realtimeInput).toMatchObject({
      sessionKey: 'remote:a',
      friendlyId: activeCard.cardId,
    })
    expect(queryContext.activeRunInput).toMatchObject({
      sessionKey: 'remote:a',
      cardId: activeCard.cardId,
    })

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('accepts two consecutive same-Card canonical handoffs without changing the parent route', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Parent Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'backend-parent',
      continuationSegmentKeys: ['backend-parent'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 1,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set('remote:parent', {
      sessionKey: 'backend-parent',
      cardId: 'remote:parent',
      canonicalSegmentKey: 'backend-parent',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const stream = createReaderHarness([
      {
        event: 'card_handoff',
        cardId: 'remote:parent',
        fromSegmentKey: 'backend-parent',
        canonicalSegmentKey: 'backend-a',
        runId: 'run-card-chain',
      },
      {
        event: 'card_handoff',
        cardId: 'remote:parent',
        fromSegmentKey: 'backend-a',
        canonicalSegmentKey: 'backend-b',
        runId: 'run-card-chain',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId="remote:parent"
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    const sourceKey = sessionCardQueryKeys.history(
      'remote:parent',
      'backend-parent',
    )
    await waitForAssertion(() =>
      expect(
        queryClient.getQueryData<SessionCardHistoryResponse>(sourceKey)
          ?.messages,
      ).toHaveLength(1),
    )
    stream.releaseHandoff()

    const finalKey = sessionCardQueryKeys.history('remote:parent', 'backend-b')
    await waitForAssertion(() =>
      expect(
        queryClient.getQueryData<SessionCardHistoryResponse>(finalKey)
          ?.messages,
      ).toHaveLength(1),
    )
    expect(
      queryClient.getQueryData(
        sessionCardQueryKeys.history('remote:parent', 'backend-a'),
      ),
    ).toBeUndefined()
    expect(navigate).not.toHaveBeenCalled()
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('keeps live response and tool activity visible while a Card handoff waits for history reconciliation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard = createRootCard({
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:a',
    })
    queryContext.cardHistories.set(activeCard.cardId, {
      sessionKey: 'remote:a',
      cardId: activeCard.cardId,
      canonicalSegmentKey: 'remote:a',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const stream = createReaderHarness([
      {
        event: 'card_handoff',
        cardId: activeCard.cardId,
        fromSegmentKey: 'remote:a',
        canonicalSegmentKey: 'remote:b',
        runId: 'run-live-handoff',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={activeCard.cardId}
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() => expect(stream.getRequestBody()).toBeDefined())

    // Simulate an advancing Card projection: the live reader has accepted the
    // handoff, but the successor history is not yet authoritative. Active-run
    // reconciliation is intentionally left unsettled to model a strict API
    // response that cannot confirm the just-superseded canonical segment.
    queryContext.activeRunAutoComplete = false
    queryContext.realtimeStreaming = true
    queryContext.realtimeToolCalls = [{ name: 'terminal' }]
    queryContext.cardHistories.set(activeCard.cardId, {
      sessionKey: 'remote:b',
      cardId: activeCard.cardId,
      canonicalSegmentKey: 'remote:b',
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: 'remote:b',
          retryable: true,
          error: 'projection is catching up',
        },
      ],
    })
    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(queryContext.realtimeInput).toMatchObject({
        sessionKey: 'remote:b',
        friendlyId: activeCard.cardId,
        enabled: true,
      })
      expect(queryContext.messageListProps).toMatchObject({
        waitingForResponse: true,
        isStreaming: true,
        activeToolCalls: [{ name: 'terminal' }],
      })
    })
    expect(queryContext.activeRunInput).toMatchObject({ enabled: false })
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('keeps partial Card history fail-closed when no local reader owns it', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const activeCard = createRootCard({
      cardId: 'remote:partial',
      canonicalSegmentKey: 'remote:partial-tip',
    })
    queryContext.cardHistories.set(activeCard.cardId, {
      sessionKey: activeCard.canonicalSegmentKey,
      cardId: activeCard.cardId,
      canonicalSegmentKey: activeCard.canonicalSegmentKey,
      messages: [],
      completeness: 'partial',
      retryable: true,
      missingSegments: [
        {
          segmentKey: activeCard.canonicalSegmentKey,
          retryable: true,
          error: 'history unavailable',
        },
      ],
    })
    queryContext.realtimeStreaming = true
    queryContext.realtimeToolCalls = [{ name: 'stale-tool' }]
    // This models a recovery-confirmed wait while Card history remains partial.
    useChatStore
      .getState()
      .setSessionWaiting(activeCard.canonicalSegmentKey, 'run-partial')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId={activeCard.cardId}
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(queryContext.messageListProps).toMatchObject({
        waitingForResponse: false,
        isStreaming: false,
        activeToolCalls: [],
        liveToolActivity: [],
      })
    })

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('polls active-run recovery with the stable Card ID after canonical migration', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    queryContext.connectionState = 'disconnected'
    useChatStore.getState().setConnectionState('disconnected')
    const activeCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Parent Card',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:migrated-tip',
      continuationSegmentKeys: ['remote:parent', 'remote:migrated-tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 2,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set('remote:parent', {
      sessionKey: 'remote:migrated-tip',
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:migrated-tip',
      messages: [],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId="remote:parent"
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })
    React.act(() => {
      useChatStore
        .getState()
        .setSessionWaiting('remote:migrated-tip', 'run-migrated')
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId="remote:parent"
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
            compact
          />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(queryContext.activeRunInput).toMatchObject({
        sessionKey: 'remote:migrated-tip',
        cardId: 'remote:parent',
        enabled: true,
      })
    })

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('keeps an active Card independent from legacy session-list/history identity and retries', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    queryContext.legacySessionsFailure = true
    const activeCard: SessionCard = {
      cardId: 'remote:parent',
      canonicalSource: 'remote',
      title: 'Card survives legacy failure',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:tip',
      continuationSegmentKeys: ['remote:tip'],
      continuationCount: 1,
      relationshipKind: 'root',
      childNodes: [],
      updatedAt: 1,
      archived: false,
      pinned: false,
    }
    queryContext.cardHistories.set('remote:parent', {
      sessionKey: 'remote:tip',
      cardId: 'remote:parent',
      canonicalSegmentKey: 'remote:tip',
      messages: [
        userMessage('card-message', 'Card transcript remains visible'),
      ],
      completeness: 'complete',
      retryable: false,
      missingSegments: [],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatScreen
            activeFriendlyId="remote:parent"
            activeCard={activeCard}
            sessionCardList={cardList([activeCard])}
          />
        </QueryClientProvider>,
      )
    })

    await waitForAssertion(() => {
      expect(queryContext.legacySessionsEnabled).toBe(false)
      expect(queryContext.legacyHistoryInput).toEqual({
        activeFriendlyId: 'new',
        activeSessionKey: '',
      })
      expect(container.textContent).toContain('Card transcript remains visible')
      expect(container.textContent).not.toContain(
        'Unauthorized legacy sessions',
      )
      expect(navigate).not.toHaveBeenCalledWith({ to: '/', replace: true })
    })
    React.act(() => window.dispatchEvent(new Event('claude:health-restored')))
    expect(queryContext.legacySessionsRefetch).not.toHaveBeenCalled()

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('normalizes bootstrap and immediate authoritative handoffs to the final successor in one reader batch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    queryContext.newRouteResolvesLegacyMain = true
    const sourceHistoryKey = chatQueryKeys.history('new', 'new')
    const intermediateHistoryKey = chatQueryKeys.history(
      'intermediate-friendly',
      'backend-a',
    )
    const targetCardHistoryKey = sessionCardQueryKeys.history(
      'successor-friendly',
      'backend-b',
    )
    const stream = createReaderHarness([
      {
        fromSessionKey: 'new',
        sessionKey: 'backend-a',
        friendlyId: 'intermediate-friendly',
        runId: 'run-chain',
      },
      {
        fromSessionKey: 'backend-a',
        sessionKey: 'backend-b',
        friendlyId: 'successor-friendly',
        runId: 'run-chain',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{ friendlyId: 'new', sessionKey: 'new' }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() => {
      expect(stream.getRequestSignal()).toBeDefined()
      expect(useChatStore.getState().isSessionWaiting('new')).toBe(true)
      expect(useChatStore.getState().isSessionWaiting('main')).toBe(false)
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1)
    })
    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    persistPendingMessage({
      sessionKey: 'new',
      friendlyId: 'new',
      message: 'continue',
      attachments: [],
      optimisticMessage,
    })
    useChatStore.getState().processEvent({
      type: 'message',
      message: userMessage('live-chain', 'chain message'),
      sessionKey: 'new',
      transport: 'send-stream',
    })
    useChatStore.getState().setSessionWaiting('new', 'run-chain')

    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('backend-b')
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(queryClient.getQueryData(intermediateHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<SessionCardHistoryResponse>(targetCardHistoryKey)
        ?.messages,
    ).toEqual([optimisticMessage])
    expect(readPendingMessage('backend-b', 'successor-friendly')).toMatchObject(
      {
        sessionKey: 'backend-b',
        friendlyId: 'successor-friendly',
      },
    )
    expect(useChatStore.getState().getRealtimeMessages('new')).toEqual([])
    expect(useChatStore.getState().getRealtimeMessages('backend-a')).toEqual([])
    expect(
      useChatStore.getState().getRealtimeMessages('backend-b'),
    ).toMatchObject([userMessage('live-chain', 'chain message')])
    expect(useChatStore.getState().isSessionWaiting('new')).toBe(false)
    expect(useChatStore.getState().isSessionWaiting('backend-a')).toBe(false)
    expect(useChatStore.getState().isSessionWaiting('backend-b')).toBe(true)
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    // The real Card route can unmount ChatScreen while it resolves the newly
    // created Card. The accepted reader must still clear the handoff target
    // when its terminal event arrives.
    React.act(() => root.unmount())
    stream.releaseTerminal()
    await waitForAssertion(() => {
      expect(useChatStore.getState().isSessionWaiting('backend-b')).toBe(false)
    })
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('keeps enhanced new-chat bootstrap on the allowed route until an authoritative Card handoff', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history('new', 'new')
    const targetCardHistoryKey = sessionCardQueryKeys.history(
      'remote:created-card',
      'remote:created-segment',
    )
    const stream = createReaderHarness([
      {
        fromSessionKey: 'new',
        sessionKey: 'remote:created-segment',
        friendlyId: 'remote:created-card',
        runId: 'run-bootstrap-card',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{ friendlyId: 'new', sessionKey: 'new' }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })

    await waitForAssertion(() => {
      expect(queryContext.legacySessionsEnabled).toBe(false)
      expect(stream.getRequestBody()).toMatchObject({
        sessionKey: 'new',
        friendlyId: 'new',
        message: 'continue',
      })
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1)
    })
    expect(
      container
        .querySelector('[data-testid="route-state"]')
        ?.getAttribute('data-friendly-id'),
    ).toBe('new')
    expect(navigate).not.toHaveBeenCalled()
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          (call: [RequestInfo | URL, RequestInit?]) =>
            String(call[0]) === '/api/sessions',
        ),
    ).toBe(false)

    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-friendly-id'),
      ).toBe('remote:created-card')
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('remote:created-segment')
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<SessionCardHistoryResponse>(targetCardHistoryKey)
        ?.messages,
    ).toEqual([optimisticMessage])
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('routes portable new-chat bootstrap through new until an authoritative Card handoff', async () => {
    queryContext.chatMode = 'portable'
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history('new', 'new')
    const targetCardHistoryKey = sessionCardQueryKeys.history(
      'local:created-card',
      'local:created-segment',
    )
    const stream = createReaderHarness([
      {
        fromSessionKey: 'new',
        sessionKey: 'local:created-segment',
        friendlyId: 'local:created-card',
        runId: 'run-portable-bootstrap-card',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{ friendlyId: 'new', sessionKey: 'new' }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })

    await waitForAssertion(() => {
      expect(stream.getRequestBody()).toMatchObject({
        sessionKey: 'new',
        friendlyId: 'new',
        message: 'continue',
      })
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1)
    })
    expect(
      container
        .querySelector('[data-testid="route-state"]')
        ?.getAttribute('data-friendly-id'),
    ).toBe('new')
    expect(navigate).not.toHaveBeenCalled()
    expect(queryContext.realtimeInput).toMatchObject({
      sessionKey: 'new',
      friendlyId: 'new',
      portableMode: false,
      enabled: true,
    })
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([input, init]) =>
            String(input) === '/api/sessions' && init?.method === 'POST',
        ),
    ).toBe(false)

    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-friendly-id'),
      ).toBe('local:created-card')
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('local:created-segment')
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<SessionCardHistoryResponse>(targetCardHistoryKey)
        ?.messages,
    ).toEqual([optimisticMessage])
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('migrates backend state when the successor key collides with the active friendly route id', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'backend-parent',
    )
    const targetHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'friendly-route',
    )
    const stream = createReaderHarness([
      {
        fromSessionKey: 'backend-parent',
        sessionKey: 'friendly-route',
        friendlyId: 'friendly-route',
        runId: 'run-collision',
      },
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{
              friendlyId: 'friendly-route',
              sessionKey: 'backend-parent',
            }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() =>
      expect(
        queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)?.messages,
      ).toHaveLength(1),
    )
    const optimisticMessage =
      queryClient.getQueryData<HistoryResponse>(sourceHistoryKey)!.messages[0]!
    persistPendingMessage({
      sessionKey: 'backend-parent',
      friendlyId: 'friendly-route',
      message: 'continue',
      attachments: [],
      optimisticMessage,
    })
    useChatStore.getState().setSessionWaiting('backend-parent', 'run-collision')

    stream.releaseHandoff()

    await waitForAssertion(() => {
      expect(
        container
          .querySelector('[data-testid="route-state"]')
          ?.getAttribute('data-session-key'),
      ).toBe('friendly-route')
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeUndefined()
    expect(
      queryClient.getQueryData<HistoryResponse>(targetHistoryKey)?.messages,
    ).toEqual([optimisticMessage])
    expect(
      readPendingMessage('friendly-route', 'friendly-route'),
    ).toMatchObject({ sessionKey: 'friendly-route' })
    expect(useChatStore.getState().isSessionWaiting('backend-parent')).toBe(
      false,
    )
    expect(useChatStore.getState().isSessionWaiting('friendly-route')).toBe(
      true,
    )
    expect(stream.reader.cancel).not.toHaveBeenCalled()
    expect(stream.getRequestSignal()?.aborted).toBe(false)

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })

  it('still cancels a stream on unrelated route navigation and leaves state on the origin', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    queryContext.client = queryClient
    const sourceHistoryKey = chatQueryKeys.history(
      'friendly-route',
      'backend-parent',
    )
    const stream = createReaderHarness()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    React.act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ChatRouteHarness
            initialRoute={{
              friendlyId: 'friendly-route',
              sessionKey: 'backend-parent',
            }}
          />
        </QueryClientProvider>,
      )
    })

    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="send-message"]')!
        .click()
    })
    await waitForAssertion(() =>
      expect(stream.getRequestSignal()).toBeDefined(),
    )

    useChatStore.getState().processEvent({
      type: 'message',
      message: userMessage('live-origin', 'origin message'),
      sessionKey: 'backend-parent',
      transport: 'send-stream',
    })
    // A destination wait restored from storage must remain unverified while
    // this unrelated local stream is still being cancelled.
    useChatStore.getState().setSessionWaiting('other-session', 'stale-run')
    queryContext.activeRunAutoComplete = false
    React.act(() => {
      container
        .querySelector<HTMLElement>('[data-testid="navigate-away"]')!
        .click()
    })

    expect(
      queryContext.messageListSnapshots.some(
        (snapshot: { sessionKey?: string; waitingForResponse?: boolean }) =>
          snapshot.sessionKey === 'other-session' &&
          snapshot.waitingForResponse === true,
      ),
    ).toBe(false)

    await waitForAssertion(() =>
      expect(stream.getRequestSignal()?.aborted).toBe(true),
    )
    await waitForAssertion(() => {
      expect(hasPendingGeneration()).toBe(false)
      expect(useChatStore.getState().isSessionWaiting('backend-parent')).toBe(
        false,
      )
      expect(useChatStore.getState().isSessionWaiting('other-session')).toBe(
        true,
      )
    })
    expect(queryClient.getQueryData(sourceHistoryKey)).toBeDefined()
    expect(
      useChatStore.getState().getRealtimeMessages('backend-parent'),
    ).toMatchObject([userMessage('live-origin', 'origin message')])
    expect(
      useChatStore.getState().getRealtimeMessages('other-session'),
    ).toEqual([])

    React.act(() => root.unmount())
    document.body.removeChild(container)
    queryClient.clear()
  })
})
