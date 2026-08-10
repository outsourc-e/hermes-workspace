import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Route,
  SEND_STREAM_MAX_AGGREGATE_ATTACHMENT_DECODED_BYTES,
  SEND_STREAM_MAX_ATTACHMENT_COUNT,
  SEND_STREAM_MAX_ATTACHMENT_ENCODED_CHARS,
  SEND_STREAM_MAX_REQUEST_BYTES,
} from './send-stream'
import { STREAM_PROVENANCE_ID_LIMIT } from './-send-stream-session-handoff'
import type * as RunStore from '../../server/run-store'

const mocks = vi.hoisted(() => ({
  ensureGatewayProbed: vi.fn(),
  resolveSessionKey: vi.fn(),
  listSessions: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  getLatestDescendant: vi.fn(),
  streamChat: vi.fn(),
  getMessages: vi.fn(),
  appendRunText: vi.fn(),
  createPersistedRun: vi.fn(),
  migratePersistedRun: vi.fn(),
  markRunStatus: vi.fn(),
  setRunThinking: vi.fn(),
  upsertRunToolCall: vi.fn(),
  loadWorkspaceCatalog: vi.fn(),
  resolveSessionCard: vi.fn(),
  resolveRemoteCardByUpstreamSession: vi.fn(),
  resolveLocalCardByUpstreamSession: vi.fn(),
  resolveExactSessionCardOperationBinding: vi.fn(),
  isExplicitSendStreamBootstrap: vi.fn(),
  appendLocalMessage: vi.fn(),
  ensureLocalSession: vi.fn(),
  getLocalSession: vi.fn(),
  touchLocalSession: vi.fn(),
  buildResolvedSessionHeaders: vi.fn(() => ({})),
  openaiChat: vi.fn(),
  streamResponses: vi.fn(),
  resolveCurrentGatewayModel: vi.fn(),
  getDiscoveredModels: vi.fn(),
  getLocalProviderDef: vi.fn(),
  getChatMode: vi.fn(),
  observeCardActivity: vi.fn(),
  observeChildLifecycle: vi.fn(),
  publishCardActivityEvent: vi.fn(),
  publishChatEvent: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../lib/send-stream-session-headers', () => ({
  buildResolvedSessionHeaders: mocks.buildResolvedSessionHeaders,
}))

vi.mock('../../lib/workspace-message-scope', () => ({
  buildWorkspaceScopedTextMessage: (message: string) => message,
}))

vi.mock('../../server/session-utils', () => ({
  resolveSessionKey: mocks.resolveSessionKey,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))

vi.mock('../../server/rate-limit', () => ({
  requireJsonContentType: () => null,
}))

vi.mock('../../server/chat-event-bus', () => ({
  publishCardActivityEvent: mocks.publishCardActivityEvent,
  publishChatEvent: mocks.publishChatEvent,
}))

vi.mock('../../server/send-run-tracker', () => ({
  registerActiveSendRun: vi.fn(),
  unregisterActiveSendRun: vi.fn(),
}))

vi.mock('../../server/run-store', async (importOriginal) => {
  const actual = await importOriginal<typeof RunStore>()
  return {
    appendRunText: mocks.appendRunText,
    createPersistedRun: mocks.createPersistedRun,
    createRunTextPersistenceBuffer: actual.createRunTextPersistenceBuffer,
    migratePersistedRun: mocks.migratePersistedRun,
    persistedRunMatchesOwner: actual.persistedRunMatchesOwner,
    markRunStatus: mocks.markRunStatus,
    setRunThinking: mocks.setRunThinking,
    upsertRunToolCall: mocks.upsertRunToolCall,
  }
})

vi.mock('../../server/gateway-capabilities', () => ({
  getChatMode: mocks.getChatMode,
}))

vi.mock('../../server/session-card-service', () => ({
  sessionCardService: {
    resolveCard: mocks.resolveSessionCard,
    resolveRemoteCardByUpstreamSession:
      mocks.resolveRemoteCardByUpstreamSession,
    resolveLocalCardByUpstreamSession: mocks.resolveLocalCardByUpstreamSession,
    observeCardActivity: mocks.observeCardActivity,
    observeChildLifecycle: mocks.observeChildLifecycle,
  },
}))

vi.mock('../../server/session-card-operation-binding', () => ({
  resolveExactSessionCardOperationBinding:
    mocks.resolveExactSessionCardOperationBinding,
}))

vi.mock('./-send-stream-authority', () => ({
  isExplicitSendStreamBootstrap: mocks.isExplicitSendStreamBootstrap,
}))

vi.mock('../../server/local-session-store', () => ({
  appendLocalMessage: mocks.appendLocalMessage,
  ensureLocalSession: mocks.ensureLocalSession,
  getLocalSession: mocks.getLocalSession,
  getLocalMessages: vi.fn(() => []),
  touchLocalSession: mocks.touchLocalSession,
}))

vi.mock('../../server/local-provider-discovery', () => ({
  getDiscoveredModels: mocks.getDiscoveredModels,
  getLocalProviderDef: mocks.getLocalProviderDef,
}))

vi.mock('../../server/configured-primary-model', () => ({
  resolveCurrentGatewayModel: mocks.resolveCurrentGatewayModel,
}))

vi.mock('../../server/openai-compat-api', () => ({
  openaiChat: mocks.openaiChat,
}))

vi.mock('../../server/responses-api', () => ({
  streamResponses: mocks.streamResponses,
}))

vi.mock('../../server/portable-history', () => ({
  selectPortableConversationHistory: vi.fn(() => []),
}))

vi.mock('../../server/claude-api', () => ({
  SESSIONS_API_UNAVAILABLE_MESSAGE: 'sessions unavailable',
  createSession: mocks.createSession,
  ensureGatewayProbed: mocks.ensureGatewayProbed,
  getGatewayCapabilities: () => ({ sessions: true }),
  getSession: mocks.getSession,
  getLatestDescendant: mocks.getLatestDescendant,
  getMessages: mocks.getMessages,
  listSessions: mocks.listSessions,
  streamChat: mocks.streamChat,
}))

vi.mock('./workspace', () => ({
  loadWorkspaceCatalog: mocks.loadWorkspaceCatalog,
}))

type SendStreamHandler = (context: { request: Request }) => Promise<Response>

type TestRoute = {
  server: { handlers: { POST: SendStreamHandler } }
}

const handler = (Route as unknown as TestRoute).server.handlers.POST

function parseEvents(body: string) {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event = block
        .split('\n')
        .find((line) => line.startsWith('event: '))
        ?.slice(7)
      const data = block
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
      return { event, data: data ? JSON.parse(data) : null }
    })
    .filter(({ event }) => Boolean(event))
}

function confirmContinuation(fromSessionId: string, sessionId: string): void {
  mocks.getLatestDescendant.mockResolvedValue({
    requestedSessionId: fromSessionId,
    sessionId,
    path: [fromSessionId, sessionId],
    changed: true,
    supported: true,
  })
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function observeRootCardActivityOn(sessionKey: string) {
  let observedAt = 100
  mocks.observeCardActivity.mockImplementation(
    (input: {
      cardId: string
      upstreamSessionKey: string
      runId: string
      state: 'running' | 'completed' | 'error' | 'pending_approval'
    }) =>
      Promise.resolve({
        cardId: input.cardId,
        sessionKey,
        runId: input.runId,
        state: input.state,
        updatedAt: observedAt++,
      }),
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('send-stream bootstrap session handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ensureGatewayProbed.mockResolvedValue(undefined)
    mocks.loadWorkspaceCatalog.mockResolvedValue(null)
    mocks.resolveSessionKey.mockImplementation(
      ({ rawSessionKey }: { rawSessionKey: string }) =>
        Promise.resolve({ sessionKey: rawSessionKey }),
    )
    mocks.createSession.mockResolvedValue({ id: 'created-session' })
    mocks.listSessions.mockResolvedValue([])
    mocks.getLocalSession.mockReturnValue(null)
    mocks.getSession.mockImplementation((sessionId: string) =>
      Promise.resolve({
        id: sessionId,
        source: 'cli',
        session_source: 'cli',
      }),
    )
    mocks.getLatestDescendant.mockImplementation((sessionId: string) =>
      Promise.resolve({
        requestedSessionId: sessionId,
        sessionId,
        path: [sessionId],
        changed: false,
        supported: false,
      }),
    )
    mocks.resolveSessionCard.mockRejectedValue(new Error('card unavailable'))
    mocks.resolveRemoteCardByUpstreamSession.mockRejectedValue(
      new Error('card unavailable'),
    )
    mocks.resolveLocalCardByUpstreamSession.mockRejectedValue(
      new Error('card unavailable'),
    )
    mocks.resolveExactSessionCardOperationBinding.mockImplementation(
      (binding: { cardId: string; parentCardId: string | null }) =>
        Promise.resolve({
          kind: 'session-card-owner',
          cardId: binding.cardId,
          parentCardId: binding.parentCardId,
        }),
    )
    // Legacy lifecycle cases isolate downstream streaming behavior. Authority
    // classification is covered directly and by focused route cases below.
    mocks.isExplicitSendStreamBootstrap.mockReturnValue(true)
    mocks.observeCardActivity.mockResolvedValue(null)
    mocks.observeChildLifecycle.mockResolvedValue(null)
    mocks.getMessages.mockResolvedValue([])
    mocks.getChatMode.mockReturnValue('enhanced')
    mocks.resolveCurrentGatewayModel.mockImplementation(
      (requestedModel: unknown) =>
        typeof requestedModel === 'string' &&
        requestedModel !== 'hermes-agent' &&
        requestedModel !== 'default'
          ? requestedModel
          : 'configured-primary-model',
    )
    mocks.getDiscoveredModels.mockReturnValue([])
    mocks.getLocalProviderDef.mockReturnValue(undefined)
    mocks.appendRunText.mockResolvedValue(null)
    mocks.createPersistedRun.mockResolvedValue(undefined)
    mocks.migratePersistedRun.mockImplementation(
      (_fromSessionKey, toSessionKey, runId, friendlyId, cardIdentity) =>
        Promise.resolve({
          sessionKey: toSessionKey,
          runId,
          friendlyId,
          ...cardIdentity,
        }),
    )
    mocks.markRunStatus.mockResolvedValue(null)
    mocks.streamChat.mockImplementation(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe('created-session')
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'run-1', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'run-1', session_id: 'created-session' },
        })
      },
    )
  })

  it('resolves the virtual hermes-agent model to the configured primary model before gateway send', async () => {
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          message: 'use the configured model',
          model: 'hermes-agent',
        }),
      }),
    })
    await response.text()

    expect(mocks.resolveCurrentGatewayModel).toHaveBeenCalledWith(
      'hermes-agent',
    )
    expect(mocks.streamChat).toHaveBeenCalledWith(
      'created-session',
      expect.objectContaining({ model: 'configured-primary-model' }),
      expect.any(Object),
    )
  })

  it.each([
    {
      label: 'gateway streamChat',
      source: 'remote' as const,
      responses: false,
      upstream: () => mocks.streamChat,
    },
    {
      label: 'dashboard-projected gateway streamChat',
      source: 'remote' as const,
      canonicalTransport: 'dashboard' as const,
      responses: false,
      upstream: () => mocks.streamChat,
    },
    {
      label: 'local Responses',
      source: 'local' as const,
      responses: true,
      upstream: () => mocks.streamResponses,
    },
    {
      label: 'local openaiChat',
      source: 'local' as const,
      responses: false,
      upstream: () => mocks.openaiChat,
    },
  ])(
    'revalidates a delayed Card rollover before the $label mutation and returns 409',
    async ({ source, canonicalTransport, responses, upstream }) => {
      vi.stubEnv('HERMES_USE_RESPONSES', responses ? '1' : '0')
      const cardId = `${source}:mutation-card`
      const segmentKey = `${source}:mutation-segment`
      const upstreamKey = `${source}-upstream-session`
      mocks.resolveSessionCard.mockResolvedValueOnce({
        card: {
          cardId,
          canonicalSegmentKey: segmentKey,
          canonicalSource: source,
          canonicalTransport:
            source === 'remote' ? (canonicalTransport ?? 'gateway') : undefined,
          continuationSegmentKeys: [cardId, segmentKey],
          continuationCount: 2,
          relationshipKind: 'root',
        },
        sourceBySegmentKey: new Map([[segmentKey, source]]),
        upstreamKeyBySegmentKey: new Map([[segmentKey, upstreamKey]]),
        collection: { completeness: 'complete', retryable: false },
      })
      const rollover = deferred<null>()
      mocks.resolveExactSessionCardOperationBinding
        .mockResolvedValueOnce({
          kind: 'session-card-owner',
          cardId,
          parentCardId: null,
        })
        .mockReturnValueOnce(rollover.promise)

      const responsePending = handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            cardId,
            sessionKey: segmentKey,
            friendlyId: cardId,
            message: 'do not send after rollover',
          }),
        }),
      })

      await vi.waitFor(() => {
        expect(
          mocks.resolveExactSessionCardOperationBinding,
        ).toHaveBeenCalledTimes(2)
        expect(
          mocks.resolveExactSessionCardOperationBinding,
        ).toHaveBeenCalledWith({
          kind: 'session-card-owner',
          cardId,
          parentCardId: null,
          canonicalSource: source,
          canonicalSegmentKey: segmentKey,
          canonicalTransport:
            source === 'remote' ? (canonicalTransport ?? 'gateway') : 'tmux',
        })
      })
      expect(upstream()).not.toHaveBeenCalled()

      rollover.resolve(null)
      const response = await responsePending

      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({
        ok: false,
        error: 'Session Card ownership changed before send',
      })
      expect(upstream()).not.toHaveBeenCalled()
      if (source === 'local') {
        expect(mocks.ensureLocalSession).not.toHaveBeenCalled()
        expect(mocks.createPersistedRun).not.toHaveBeenCalled()
        expect(mocks.appendLocalMessage).not.toHaveBeenCalled()
        expect(mocks.observeCardActivity).not.toHaveBeenCalled()
        expect(mocks.publishCardActivityEvent).not.toHaveBeenCalled()
      }
    },
  )

  it('revalidates a delayed upstream run-start callback before persisted run creation', async () => {
    const cardId = 'remote:delayed-event-card'
    const segmentKey = 'remote:delayed-event-segment'
    const upstreamKey = 'delayed-event-upstream'
    let rolledOver = false
    const emitRunStarted = deferred<void>()

    mocks.resolveSessionCard.mockResolvedValueOnce({
      card: {
        cardId,
        canonicalSegmentKey: segmentKey,
        canonicalSource: 'remote',
        canonicalTransport: 'gateway',
        continuationSegmentKeys: [cardId, segmentKey],
        continuationCount: 2,
        relationshipKind: 'root',
      },
      sourceBySegmentKey: new Map([[segmentKey, 'remote']]),
      upstreamKeyBySegmentKey: new Map([[segmentKey, upstreamKey]]),
      collection: { completeness: 'complete', retryable: false },
    })
    mocks.resolveExactSessionCardOperationBinding.mockImplementation(
      (binding: { cardId: string; parentCardId: string | null }) =>
        Promise.resolve(
          rolledOver
            ? null
            : {
                kind: 'session-card-owner',
                cardId: binding.cardId,
                parentCardId: binding.parentCardId,
              },
        ),
    )
    mocks.streamChat.mockImplementationOnce(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe(upstreamKey)
        await emitRunStarted.promise
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'delayed-event-run', session_id: upstreamKey },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'delayed-event-run', session_id: upstreamKey },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId,
          sessionKey: segmentKey,
          friendlyId: cardId,
          message: 'do not persist after rollover',
        }),
      }),
    })
    expect(response.status).toBe(200)
    expect(mocks.resolveExactSessionCardOperationBinding).toHaveBeenCalledTimes(
      2,
    )

    rolledOver = true
    emitRunStarted.resolve()
    const events = parseEvents(await response.text())

    expect(mocks.resolveExactSessionCardOperationBinding).toHaveBeenCalledTimes(
      3,
    )
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
    expect(mocks.observeCardActivity).not.toHaveBeenCalled()
    expect(mocks.markRunStatus).not.toHaveBeenCalled()
    expect(events).toContainEqual({
      event: 'error',
      data: expect.objectContaining({
        message: 'Session Card ownership changed before send',
      }),
    })
  })

  it.each([
    {
      label: 'local session creation',
      rollOverAfter: 'session' as const,
      expected: { run: 0, user: 0, running: 0, provider: 0 },
      responseStatus: 409,
    },
    {
      label: 'persisted run creation',
      rollOverAfter: 'run' as const,
      expected: { run: 1, user: 0, running: 0, provider: 0 },
      responseStatus: 409,
    },
    {
      label: 'durable user message append',
      rollOverAfter: 'user' as const,
      expected: { run: 1, user: 1, running: 0, provider: 0 },
      responseStatus: 409,
    },
    {
      label: 'running activity persistence',
      rollOverAfter: 'activity' as const,
      expected: { run: 1, user: 1, running: 1, provider: 0 },
      responseStatus: 409,
    },
    {
      label: 'provider mutation',
      rollOverAfter: 'provider' as const,
      expected: { run: 1, user: 1, running: 1, provider: 1 },
      responseStatus: 200,
    },
  ])(
    'revalidates immediately after $label and preserves only already accepted local side effects',
    async ({ rollOverAfter, expected, responseStatus }) => {
      const cardId = 'local:mutation-card'
      const segmentKey = 'local:mutation-segment'
      const upstreamKey = 'local-upstream-session'
      let rolledOver = false
      mocks.getChatMode.mockReturnValue('portable')
      mocks.resolveSessionCard.mockResolvedValueOnce({
        card: {
          cardId,
          canonicalSegmentKey: segmentKey,
          canonicalSource: 'local',
          canonicalTransport: 'tmux',
          continuationSegmentKeys: [cardId, segmentKey],
          continuationCount: 2,
          relationshipKind: 'root',
        },
        sourceBySegmentKey: new Map([[segmentKey, 'local']]),
        upstreamKeyBySegmentKey: new Map([[segmentKey, upstreamKey]]),
        collection: { completeness: 'complete', retryable: false },
      })
      mocks.resolveExactSessionCardOperationBinding.mockImplementation(
        (binding: { cardId: string; parentCardId: string | null }) =>
          Promise.resolve(
            rolledOver
              ? null
              : {
                  kind: 'session-card-owner',
                  cardId: binding.cardId,
                  parentCardId: binding.parentCardId,
                },
          ),
      )
      mocks.ensureLocalSession.mockImplementation(() => {
        if (rollOverAfter === 'session') rolledOver = true
      })
      mocks.createPersistedRun.mockImplementation(() => {
        if (rollOverAfter === 'run') rolledOver = true
        return Promise.resolve(undefined)
      })
      mocks.appendLocalMessage.mockImplementation(
        (_sessionKey: string, message: { role: string }) => {
          if (message.role === 'user' && rollOverAfter === 'user') {
            rolledOver = true
          }
        },
      )
      let activityTimestamp = 100
      mocks.observeCardActivity.mockImplementation(
        (input: {
          cardId: string
          upstreamSessionKey: string
          runId: string
          state: 'running' | 'completed' | 'error' | 'pending_approval'
        }) => {
          if (input.state === 'running' && rollOverAfter === 'activity') {
            rolledOver = true
          }
          return Promise.resolve({
            cardId: input.cardId,
            sessionKey: segmentKey,
            runId: input.runId,
            state: input.state,
            updatedAt: activityTimestamp++,
          })
        },
      )
      mocks.openaiChat.mockImplementation(() => {
        if (rollOverAfter === 'provider') rolledOver = true
        return Promise.resolve({
          async *[Symbol.asyncIterator]() {
            await Promise.resolve()
            yield { type: 'text', text: 'accepted assistant output' }
          },
        })
      })

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            cardId,
            sessionKey: segmentKey,
            friendlyId: cardId,
            message: 'accepted user turn',
          }),
        }),
      })
      const responseBody = await response.text()

      expect(response.status).toBe(responseStatus)
      expect(mocks.ensureLocalSession).toHaveBeenCalledTimes(1)
      expect(mocks.createPersistedRun).toHaveBeenCalledTimes(expected.run)
      expect(
        mocks.appendLocalMessage.mock.calls.filter(
          ([, persisted]) => persisted.role === 'user',
        ),
      ).toHaveLength(expected.user)
      expect(
        mocks.observeCardActivity.mock.calls.filter(
          ([input]) => input.state === 'running',
        ),
      ).toHaveLength(expected.running)
      expect(mocks.openaiChat).toHaveBeenCalledTimes(expected.provider)

      // Rollover never rewrites or deletes an already accepted session, run, or
      // user turn. It only terminalizes the exact run that this request created.
      expect(
        mocks.appendLocalMessage.mock.calls.filter(
          ([, persisted]) => persisted.role === 'assistant',
        ),
      ).toHaveLength(0)
      expect(mocks.touchLocalSession).not.toHaveBeenCalled()
      expect(
        mocks.observeCardActivity.mock.calls.filter(
          ([input]) => input.state === 'completed' || input.state === 'error',
        ),
      ).toHaveLength(0)
      expect(mocks.markRunStatus).toHaveBeenCalledTimes(expected.run)
      if (expected.run > 0) {
        expect(mocks.markRunStatus).toHaveBeenCalledWith(
          segmentKey,
          expect.any(String),
          'error',
          'Session Card ownership changed before send',
        )
      }
      if (responseStatus === 409) {
        expect(JSON.parse(responseBody)).toEqual({
          ok: false,
          error: 'Session Card ownership changed before send',
        })
      } else {
        expect(parseEvents(responseBody)).toContainEqual({
          event: 'error',
          data: expect.objectContaining({
            message: 'Session Card ownership changed before send',
          }),
        })
      }
    },
  )

  it('rejects a raw existing-session send without Card authority before any provider or durable mutation', async () => {
    mocks.isExplicitSendStreamBootstrap.mockReturnValueOnce(false)
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'existing-session',
          friendlyId: 'existing-session',
          message: 'hello',
        }),
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Session Card authority required for existing session',
    })
    expect(mocks.resolveSessionKey).not.toHaveBeenCalled()
    expect(mocks.ensureLocalSession).not.toHaveBeenCalled()
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
    expect(mocks.openaiChat).not.toHaveBeenCalled()
    expect(mocks.streamResponses).not.toHaveBeenCalled()
  })

  it('fails enhanced main closed when runtime discovery fails before projection', async () => {
    mocks.listSessions.mockRejectedValueOnce(
      new Error('gateway inventory failed'),
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'main',
          friendlyId: 'main',
          message: 'do not guess main authority',
        }),
      }),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Unable to verify existing main Session Card ownership',
    })
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.resolveRemoteCardByUpstreamSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
  })

  it('fails enhanced main closed when any existing runtime has no exact Card projection', async () => {
    mocks.listSessions.mockResolvedValueOnce([{ id: 'existing-empty-runtime' }])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'main',
          friendlyId: 'main',
          message: 'do not mutate unowned main',
        }),
      }),
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'Existing main Session Card ownership is unavailable',
    })
    expect(mocks.resolveRemoteCardByUpstreamSession).toHaveBeenCalledWith(
      'existing-empty-runtime',
    )
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
  })

  it('binds a dashboard-projected enhanced main runtime to its exact remote Card before streaming', async () => {
    mocks.listSessions.mockResolvedValueOnce([{ id: 'existing-main-runtime' }])
    mocks.resolveRemoteCardByUpstreamSession.mockResolvedValueOnce({
      card: {
        cardId: 'remote:main-card',
        canonicalSource: 'remote',
        canonicalTransport: 'dashboard',
        canonicalSegmentKey: 'remote:main-tip',
        continuationSegmentKeys: ['remote:main-card', 'remote:main-tip'],
        continuationCount: 2,
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete', retryable: false },
      sourceBySegmentKey: new Map([['remote:main-tip', 'remote']]),
      upstreamKeyBySegmentKey: new Map([
        ['remote:main-tip', 'existing-main-runtime'],
      ]),
    })
    mocks.streamChat.mockImplementationOnce(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe('existing-main-runtime')
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'main-run', session_id: sessionKey },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'main-run', session_id: sessionKey },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'main',
          friendlyId: 'main',
          message: 'continue exact main',
        }),
      }),
    })

    expect(response.status).toBe(200)
    const events = parseEvents(await response.text())
    expect(events[0]).toMatchObject({
      event: 'session_handoff',
      data: {
        fromSessionKey: 'main',
        sessionKey: 'remote:main-tip',
        friendlyId: 'remote:main-card',
      },
    })
    expect(mocks.resolveExactSessionCardOperationBinding).toHaveBeenCalledTimes(
      3,
    )
    expect(mocks.resolveExactSessionCardOperationBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: 'remote:main-card',
        canonicalSegmentKey: 'remote:main-tip',
        canonicalTransport: 'dashboard',
      }),
    )
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'remote:main-tip',
      friendlyId: 'remote:main-card',
    })
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it.each([
    '',
    'not-a-data-url',
    'data:image/png;base64,',
    'data:image/png,AAAA',
    'data:;base64,AAAA',
    'data:image/png;base64,@@@',
  ])(
    'rejects malformed attachment dataUrl %j before transport acceptance',
    async (dataUrl) => {
      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'new',
            friendlyId: 'new',
            message: 'hello',
            attachments: [{ name: 'broken.png', dataUrl }],
          }),
        }),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: 'invalid attachment data',
      })
      expect(mocks.createSession).not.toHaveBeenCalled()
      expect(mocks.ensureLocalSession).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.openaiChat).not.toHaveBeenCalled()
      expect(mocks.streamResponses).not.toHaveBeenCalled()
    },
  )

  it('accepts the browser text-attachment base64 data-URL envelope', async () => {
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'review this text file',
          attachments: [
            {
              id: 'browser-text-file',
              name: 'notes.txt',
              contentType: 'text/plain',
              size: 8,
              dataUrl: 'data:text/plain;base64,aGVsbG8gz4A=',
            },
          ],
        }),
      }),
    })

    expect(response.status).toBe(200)
    await response.text()
    expect(mocks.streamChat).toHaveBeenCalledTimes(1)
    expect(mocks.createSession).toHaveBeenCalledTimes(1)
  })

  it('rejects a request body above the route byte limit before mutation', async () => {
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'x'.repeat(SEND_STREAM_MAX_REQUEST_BYTES),
        }),
      }),
    })

    expect(response.status).toBe(413)
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
  })

  it('rejects too many attachments before normalization or mutation', async () => {
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'bounded attachments',
          attachments: Array.from(
            { length: SEND_STREAM_MAX_ATTACHMENT_COUNT + 1 },
            (_, index) => ({
              id: `attachment-${index}`,
              name: `${index}.txt`,
              contentType: 'text/plain',
              size: 1,
              dataUrl: 'data:text/plain;base64,QQ==',
            }),
          ),
        }),
      }),
    })

    expect(response.status).toBe(413)
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
  })

  it('rejects oversized encoded attachment content before mutation', async () => {
    const oversizedBase64 = 'A'.repeat(
      SEND_STREAM_MAX_ATTACHMENT_ENCODED_CHARS + 4,
    )
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'oversized attachment',
          attachments: [
            {
              name: 'oversized.bin',
              contentType: 'application/octet-stream',
              dataUrl: `data:application/octet-stream;base64,${oversizedBase64}`,
            },
          ],
        }),
      }),
    })

    expect(response.status).toBe(413)
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
  })

  it('rejects attachment content above the aggregate decoded-byte limit', async () => {
    const decodedBytesPerAttachment =
      Math.floor(SEND_STREAM_MAX_AGGREGATE_ATTACHMENT_DECODED_BYTES / 2) + 3
    const encodedCharsPerAttachment =
      Math.ceil(decodedBytesPerAttachment / 3) * 4
    const base64 = 'A'.repeat(encodedCharsPerAttachment)
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'aggregate attachment limit',
          attachments: ['first', 'second'].map((id) => ({
            id,
            name: `${id}.bin`,
            contentType: 'application/octet-stream',
            dataUrl: `data:application/octet-stream;base64,${base64}`,
          })),
        }),
      }),
    })

    expect(response.status).toBe(413)
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
  })

  it('rejects declared attachment size that disagrees with decoded content', async () => {
    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'mismatched attachment',
          attachments: [
            {
              name: 'one-byte.txt',
              contentType: 'text/plain',
              size: 2,
              dataUrl: 'data:text/plain;base64,QQ==',
            },
          ],
        }),
      }),
    })

    expect(response.status).toBe(400)
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
  })

  it('rejects an initially stale local Card before local session or provider mutation', async () => {
    mocks.getDiscoveredModels.mockReturnValue([
      { id: 'local-model', name: 'Local Model', provider: 'local-provider' },
    ])
    mocks.getLocalProviderDef.mockReturnValue({
      id: 'local-provider',
      type: 'openai-compat',
    })
    mocks.resolveSessionCard.mockResolvedValueOnce({
      card: {
        cardId: 'local:card',
        canonicalSegmentKey: 'local:session',
        continuationSegmentKeys: ['local:session'],
        continuationCount: 1,
        canonicalSource: 'local',
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete', retryable: false },
      sourceBySegmentKey: new Map([['local:session', 'local']]),
      upstreamKeyBySegmentKey: new Map([['local:session', 'session']]),
    })
    mocks.resolveExactSessionCardOperationBinding.mockResolvedValueOnce(null)

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'local:session',
          cardId: 'local:card',
          model: 'local-model',
          message: 'hello',
        }),
      }),
    })

    expect(response.status).toBe(409)
    expect(mocks.ensureLocalSession).not.toHaveBeenCalled()
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
    expect(mocks.openaiChat).not.toHaveBeenCalled()
    expect(mocks.streamResponses).not.toHaveBeenCalled()
  })

  it.each(['new', 'main'])(
    'emits the pre-stream %s-to-concrete handoff before ordinary stream events',
    async (bootstrapSessionKey) => {
      mocks.resolveRemoteCardByUpstreamSession.mockResolvedValueOnce({
        card: {
          cardId: 'remote:created-card',
          canonicalSegmentKey: 'remote:created-segment',
          canonicalSource: 'remote',
          continuationSegmentKeys: ['remote:created-segment'],
          relationshipKind: 'root',
        },
        sourceBySegmentKey: new Map([['remote:created-segment', 'remote']]),
        upstreamKeyBySegmentKey: new Map([
          ['remote:created-segment', 'created-session'],
        ]),
        collection: { completeness: 'complete' },
      })
      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: bootstrapSessionKey,
            friendlyId: bootstrapSessionKey,
            message: 'hello',
          }),
        }),
      })

      expect(response.status).toBe(200)
      const events = parseEvents(await response.text())
      expect(events[0]).toEqual({
        event: 'session_handoff',
        data: {
          fromSessionKey: bootstrapSessionKey,
          sessionKey: 'remote:created-segment',
          friendlyId: 'remote:created-card',
          runId: null,
          verifiedCardAuthority: {
            cardId: 'remote:created-card',
            canonicalSource: 'remote',
            canonicalSegmentKey: 'remote:created-segment',
            continuationSegmentKeys: ['remote:created-segment'],
            relationshipKind: 'root',
          },
        },
      })
      expect(
        events.filter(({ event }) => event === 'session_handoff'),
      ).toHaveLength(1)
      expect(events.some(({ event }) => event === 'started')).toBe(true)
    },
  )

  it.each(['new', 'main'])(
    'keeps enhanced %s bootstrap identity fail-closed when the authoritative Card is not yet available',
    async (bootstrapSessionKey) => {
      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: bootstrapSessionKey,
            friendlyId: bootstrapSessionKey,
            message: 'hello',
          }),
        }),
      })

      expect(response.status).toBe(200)
      const events = parseEvents(await response.text())
      expect(
        events.filter(({ event }) => event === 'session_handoff'),
      ).toHaveLength(0)
      expect(events.some(({ event }) => event === 'started')).toBe(true)
      expect(
        events
          .map(({ data }) => data?.sessionKey)
          .filter((sessionKey) => sessionKey !== undefined),
      ).toEqual([bootstrapSessionKey, bootstrapSessionKey])
      expect(JSON.stringify(events)).not.toContain('created-session')
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(mocks.appendRunText).not.toHaveBeenCalled()
      expect(mocks.markRunStatus).not.toHaveBeenCalled()
      expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
        sessionKey: bootstrapSessionKey,
        friendlyId: bootstrapSessionKey,
      })
    },
  )

  it('keeps an invalid enhanced bootstrap projection out of SSE and run persistence', async () => {
    mocks.resolveRemoteCardByUpstreamSession.mockResolvedValueOnce({
      card: {
        cardId: 'remote:created-card',
        canonicalSegmentKey: 'remote:created-segment',
        continuationSegmentKeys: ['remote:created-segment'],
        relationshipKind: 'root',
      },
      sourceBySegmentKey: new Map([['remote:created-segment', 'remote']]),
      upstreamKeyBySegmentKey: new Map([
        ['remote:created-segment', 'created-session'],
      ]),
      collection: { completeness: 'incomplete' },
    })

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.some(({ event }) => event === 'session_handoff')).toBe(false)
    expect(
      events
        .map(({ data }) => data?.sessionKey)
        .filter((sessionKey) => sessionKey !== undefined),
    ).toEqual(['new', 'new'])
    expect(JSON.stringify(events)).not.toContain('created-session')
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
  })

  it('keeps a verified backend continuation private while bootstrap projection remains unavailable', async () => {
    confirmContinuation('created-session', 'successor-session')
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'private-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'private-run',
            session_id: 'successor-session',
            delta: 'continued privately',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'private-run', session_id: 'successor-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.some(({ event }) => event === 'session_handoff')).toBe(false)
    expect(
      events
        .map(({ data }) => data?.sessionKey)
        .filter((sessionKey) => sessionKey !== undefined),
    ).toEqual(['new', 'new', 'new'])
    expect(JSON.stringify(events)).not.toContain('created-session')
    expect(JSON.stringify(events)).not.toContain('successor-session')
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
    expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
    expect(mocks.appendRunText).not.toHaveBeenCalled()
    expect(mocks.markRunStatus).not.toHaveBeenCalled()
  })

  it('migrates a persisted run when an authoritative successor arrives after run start', async () => {
    mocks.resolveSessionKey.mockResolvedValueOnce({
      sessionKey: 'created-session',
    })
    confirmContinuation('created-session', 'successor-session')
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'run-migrate', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'run-migrate',
            session_id: 'successor-session',
            delta: 'continued',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: {
            run_id: 'run-migrate',
            session_id: 'successor-session',
          },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello',
        }),
      }),
    })

    await response.text()
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: 'run-migrate',
      sessionKey: 'created-session',
      friendlyId: 'created-session',
    })
    expect(mocks.migratePersistedRun).toHaveBeenCalledWith(
      'created-session',
      'successor-session',
      'run-migrate',
      'successor-session',
    )
    expect(mocks.createPersistedRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.migratePersistedRun.mock.invocationCallOrder[0]!,
    )
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'successor-session',
      'run-migrate',
      'continued',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'successor-session',
      'run-migrate',
      'complete',
      undefined,
    )
  })

  it('falls back to an exclusive durable record identity on provider run collisions', async () => {
    mocks.createPersistedRun
      .mockRejectedValueOnce(
        Object.assign(new Error('collision'), { code: 'EEXIST' }),
      )
      .mockResolvedValueOnce({ status: 'accepted' })
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'provider-collision', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: { run_id: 'provider-collision', delta: 'owned output' },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'provider-collision', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })
    await response.text()

    expect(mocks.createPersistedRun).toHaveBeenCalledTimes(2)
    const fallback = mocks.createPersistedRun.mock.calls[1]?.[0] as {
      runId: string
      providerRunId: string
    }
    expect(fallback).toMatchObject({ providerRunId: 'provider-collision' })
    expect(fallback.runId).toMatch(/^persisted-[a-f0-9-]{36}$/)
    expect(fallback.runId).not.toBe('provider-collision')
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      fallback.runId,
      'owned output',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      fallback.runId,
      'complete',
      undefined,
    )
  })

  it('preserves ordinary identifier-less events for an unconflicted parent run', async () => {
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: { run_id: 'parent-run', delta: 'ordinary parent text' },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'parent-run' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.find(({ event }) => event === 'started')).toEqual({
      event: 'started',
      data: {
        runId: 'parent-run',
        sessionKey: 'created-session',
        friendlyId: 'created-session',
      },
    })
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'created-session',
      friendlyId: 'created-session',
    })
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'ordinary parent text',
          sessionKey: 'created-session',
          runId: 'parent-run',
        },
      },
    ])
    expect(events.filter(({ event }) => event === 'done')).toHaveLength(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      'parent-run',
      'ordinary parent text',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'parent-run',
      'complete',
      undefined,
    )
  })

  it('publishes only verified root Card activity to the stream and app event bus', async () => {
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:parent',
        continuationSegmentKeys: ['remote:parent'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['remote:parent', 'gateway']]),
      upstreamKeyBySegmentKey: new Map([['remote:parent', 'parent-session']]),
    })
    let observedAt = 100
    mocks.observeCardActivity.mockImplementation(
      (input: {
        cardId: string
        upstreamSessionKey: string
        runId: string
        state: 'running' | 'completed' | 'error' | 'pending_approval'
      }) =>
        Promise.resolve({
          cardId: input.cardId,
          sessionKey: 'remote:parent',
          runId: input.runId,
          state: input.state,
          updatedAt: observedAt++,
        }),
    )
    mocks.streamChat.mockImplementationOnce(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe('parent-session')
        for (const event of [
          'run.started',
          'approval.request',
          'run.completed',
        ]) {
          await options.onEvent({
            event,
            data: { run_id: 'parent-run', session_id: 'parent-session' },
          })
        }
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:parent',
          friendlyId: 'remote:parent-card',
          message: 'run safely',
        }),
      }),
    })

    const activityEvents = parseEvents(await response.text()).filter(
      ({ event }) => event === 'card_activity',
    )
    expect(
      activityEvents.map(({ data }) => ({
        state: data.state,
        activity: data.activity,
      })),
    ).toEqual([
      { state: 'running', activity: 'run.started' },
      { state: 'pending_approval', activity: 'approval.request' },
      { state: 'completed', activity: 'run.completed' },
    ])
    expect(mocks.observeCardActivity).toHaveBeenCalledTimes(3)
    expect(mocks.publishCardActivityEvent.mock.calls).toEqual(
      activityEvents.map(({ data }) => [data]),
    )
  })

  it.each([
    'timeout',
    'producer failure',
    'request abort',
    'consumer cancel',
  ] as const)(
    'projects a validated root Card error on route-owned %s',
    async (termination) => {
      vi.useFakeTimers()
      try {
        mocks.resolveSessionCard.mockResolvedValue({
          card: {
            cardId: 'remote:parent-card',
            canonicalSegmentKey: 'remote:parent',
            continuationSegmentKeys: ['remote:parent'],
            relationshipKind: 'root',
          },
          collection: { completeness: 'complete' },
          sourceBySegmentKey: new Map([['remote:parent', 'gateway']]),
          upstreamKeyBySegmentKey: new Map([
            ['remote:parent', 'parent-session'],
          ]),
        })
        observeRootCardActivityOn('remote:parent')
        const producerStarted = deferred<void>()
        mocks.streamChat.mockImplementationOnce(
          async (
            _sessionKey: string,
            _request: unknown,
            options: {
              onEvent: (payload: {
                event: string
                data: Record<string, unknown>
              }) => Promise<void>
            },
          ) => {
            await options.onEvent({
              event: 'run.started',
              data: {
                run_id: 'route-owned-run',
                session_id: 'parent-session',
              },
            })
            producerStarted.resolve(undefined)
            if (termination === 'producer failure') {
              throw new Error('producer failed')
            }
            return new Promise<void>(() => undefined)
          },
        )
        const requestAbort = new AbortController()
        const response = await handler({
          request: new Request('http://workspace.test/api/send-stream', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              cardId: 'remote:parent-card',
              sessionKey: 'remote:parent',
              friendlyId: 'remote:parent-card',
              message: 'run until route termination',
            }),
            signal: requestAbort.signal,
          }),
        })
        let responseClosed: Promise<unknown>
        if (termination === 'consumer cancel') {
          responseClosed = Promise.resolve()
        } else {
          responseClosed = response.text()
        }
        await producerStarted.promise

        if (termination === 'timeout') {
          await vi.advanceTimersByTimeAsync(600_000)
        } else if (termination === 'request abort') {
          requestAbort.abort()
        } else if (termination === 'consumer cancel') {
          responseClosed = response.body!.cancel()
        }
        await responseClosed
        await Promise.resolve()

        expect(mocks.observeCardActivity.mock.calls).toEqual([
          [
            {
              cardId: 'remote:parent-card',
              upstreamSessionKey: 'parent-session',
              runId: 'route-owned-run',
              state: 'running',
            },
          ],
          [
            {
              cardId: 'remote:parent-card',
              upstreamSessionKey: 'parent-session',
              runId: 'route-owned-run',
              state: 'error',
            },
          ],
        ])
        expect(
          mocks.publishCardActivityEvent.mock.calls.map(([payload]) => ({
            state: payload.state,
            activity: payload.activity,
          })),
        ).toEqual([
          { state: 'running', activity: 'run.started' },
          { state: 'error', activity: 'error' },
        ])
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('does not manufacture route-owned Card errors before a parent run is proven', async () => {
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:parent',
        continuationSegmentKeys: ['remote:parent'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['remote:parent', 'gateway']]),
      upstreamKeyBySegmentKey: new Map([['remote:parent', 'parent-session']]),
    })
    observeRootCardActivityOn('remote:parent')
    mocks.streamChat.mockRejectedValueOnce(new Error('producer failed early'))

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:parent',
          friendlyId: 'remote:parent-card',
          message: 'fail before run identity',
        }),
      }),
    })
    await response.text()

    expect(mocks.observeCardActivity).not.toHaveBeenCalled()
    expect(mocks.publishCardActivityEvent).not.toHaveBeenCalled()
  })

  it('publishes validated child lifecycle while preserving the parent Card stream', async () => {
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:parent',
        continuationSegmentKeys: ['remote:parent'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['remote:parent', 'gateway']]),
      upstreamKeyBySegmentKey: new Map([['remote:parent', 'parent-session']]),
    })
    let observedAt = 100
    mocks.observeChildLifecycle.mockImplementation(
      (input: {
        parentCardId: string
        childUpstreamSessionKey: string
        runId: string
        status: 'running' | 'complete' | 'error'
      }) =>
        Promise.resolve({
          cardId: input.parentCardId,
          childCardId: 'remote:child-card',
          childSessionKey: 'remote:child-session',
          runId: input.runId,
          status: input.status,
          updatedAt: observedAt++,
        }),
    )
    mocks.streamChat.mockImplementationOnce(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe('parent-session')
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'parent-run', session_id: 'parent-session' },
        })
        for (const payload of [
          {
            event: 'message.started',
            data: { run_id: 'child-success', session_id: 'child-session' },
          },
          {
            event: 'run.completed',
            data: { run_id: 'child-success', session_id: 'child-session' },
          },
          {
            event: 'run.started',
            data: { run_id: 'child-error', session_id: 'child-session' },
          },
          {
            event: 'error',
            data: { run_id: 'child-error', session_id: 'child-session' },
          },
        ]) {
          await options.onEvent(payload)
        }
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'parent-run',
            session_id: 'parent-session',
            delta: 'parent remains canonical',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'parent-run', session_id: 'parent-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:parent',
          friendlyId: 'remote:parent-card',
          message: 'delegate safely',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(
      events
        .filter(({ event }) => event === 'card_child_activity')
        .map(({ data }) => ({ status: data.status, activity: data.activity })),
    ).toEqual([
      { status: 'running', activity: 'message.started' },
      { status: 'complete', activity: 'run.completed' },
      { status: 'running', activity: 'run.started' },
      { status: 'error', activity: 'error' },
    ])
    expect(mocks.publishChatEvent).toHaveBeenCalledTimes(4)
    expect(events.some(({ event }) => event === 'card_handoff')).toBe(false)
    expect(events.some(({ event }) => event === 'session_handoff')).toBe(false)
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'parent remains canonical',
          sessionKey: 'remote:parent',
          runId: 'parent-run',
        },
      },
    ])
    expect(events.at(-1)).toEqual({
      event: 'done',
      data: {
        state: 'complete',
        sessionKey: 'remote:parent',
        runId: 'parent-run',
      },
    })
    expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
  })

  it('omits late superseded child terminals from SSE and public Card activity', async () => {
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:parent',
        continuationSegmentKeys: ['remote:parent'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['remote:parent', 'gateway']]),
      upstreamKeyBySegmentKey: new Map([['remote:parent', 'parent-session']]),
    })
    let currentChildRun: string | null = null
    let terminal = false
    const supersededRuns = new Set<string>()
    mocks.observeChildLifecycle.mockImplementation(
      (input: {
        parentCardId: string
        childUpstreamSessionKey: string
        runId: string
        status: 'running' | 'complete' | 'error'
      }) => {
        if (supersededRuns.has(input.runId)) return Promise.resolve(null)
        if (input.status === 'running') {
          if (currentChildRun === input.runId && terminal)
            return Promise.resolve(null)
          if (currentChildRun && currentChildRun !== input.runId) {
            supersededRuns.add(currentChildRun)
          }
          currentChildRun = input.runId
          terminal = false
        } else {
          if (currentChildRun !== input.runId || terminal)
            return Promise.resolve(null)
          terminal = true
        }
        return Promise.resolve({
          cardId: input.parentCardId,
          childCardId: 'remote:child-card',
          childSessionKey: 'remote:child-session',
          runId: input.runId,
          status: input.status,
          updatedAt: 100,
        })
      },
    )
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'parent-run', session_id: 'parent-session' },
        })
        for (const payload of [
          {
            event: 'run.started',
            data: { run_id: 'child-a', session_id: 'child-session' },
          },
          {
            event: 'run.started',
            data: { run_id: 'child-b', session_id: 'child-session' },
          },
          {
            event: 'run.completed',
            data: { run_id: 'child-a', session_id: 'child-session' },
          },
          {
            event: 'run.completed',
            data: { run_id: 'child-b', session_id: 'child-session' },
          },
          {
            event: 'message.started',
            data: { run_id: 'child-a', session_id: 'child-session' },
          },
          {
            event: 'message.started',
            data: { run_id: 'child-b', session_id: 'child-session' },
          },
        ]) {
          await options.onEvent(payload)
        }
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'parent-run', session_id: 'parent-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:parent',
          friendlyId: 'remote:parent-card',
          message: 'delegate with replacement',
        }),
      }),
    })
    const activities = parseEvents(await response.text())
      .filter(({ event }) => event === 'card_child_activity')
      .map(({ data }) => ({ runId: data.runId, status: data.status }))

    expect(activities).toEqual([
      { runId: 'child-a', status: 'running' },
      { runId: 'child-b', status: 'running' },
      { runId: 'child-b', status: 'complete' },
    ])
    expect(mocks.publishChatEvent.mock.calls.map((call) => call[1])).toEqual(
      activities.map((activity) => expect.objectContaining(activity)),
    )
  })

  it('keeps rejected child output entirely out of the parent stream', async () => {
    confirmContinuation('created-session', 'child-session')
    mocks.streamChat.mockImplementationOnce(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe('created-session')
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'run-child', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'message.started',
          data: {
            run_id: 'run-child',
            session_id: 'child-session',
            relationship_type: 'child_session',
            parent_session_id: 'created-session',
            message: { id: 'child-message' },
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'run-child',
            session_id: 'child-session',
            delta: 'child activity',
          },
        })
        for (const rejectedFacts of [
          { relationship_type: 'subagent' },
          { session_source: 'fork' },
          { _cross_surface_child_session: true },
        ]) {
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: 'run-child',
              session_id: 'child-session',
              delta: 'other rejected output',
              ...rejectedFacts,
            },
          })
        }
        await options.onEvent({
          event: 'assistant.completed',
          data: {
            run_id: 'run-child',
            session_id: 'child-session',
            content: 'child final answer',
          },
        })
        await options.onEvent({
          event: 'tool.progress',
          data: {
            run_id: 'run-child',
            session_id: 'child-session',
            relationship_type: 'child_session',
            parent_session_id: 'created-session',
            tool_name: '_thinking',
            delta: 'Child diagnostic activity',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'run-child',
            session_id: 'created-session',
            delta: 'parent answer',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: {
            run_id: 'run-child',
            session_id: 'child-session',
            relationship_type: 'child_session',
            parent_session_id: 'created-session',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: {
            run_id: 'run-child',
            session_id: 'created-session',
          },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.some(({ event }) => event === 'session_handoff')).toBe(false)
    expect(events.some(({ event }) => event === 'message')).toBe(false)
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'parent answer',
          sessionKey: 'created-session',
          runId: 'run-child',
        },
      },
    ])
    expect(events.some(({ event }) => event === 'thinking')).toBe(false)
    expect(events.at(-1)).toEqual({
      event: 'done',
      data: {
        state: 'complete',
        sessionKey: 'created-session',
        runId: 'run-child',
      },
    })
    expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      'run-child',
      'parent answer',
      { replace: false },
    )
    expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
  })

  it('keeps an active-run alias quarantined across an explicit parent event', async () => {
    const historyReads: Array<string> = []
    mocks.getMessages.mockImplementation((sessionKey: string) => {
      historyReads.push(sessionKey)
      return Promise.resolve([])
    })
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'shared-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'child-session',
            relationship_type: 'subagent',
            delta: 'rejected child prefix',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'created-session',
            delta: 'legitimate parent prefix',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            delta: 'id-less rejected child tail',
          },
        })
        await options.onEvent({
          event: 'tool.progress',
          data: {
            run_id: 'shared-run',
            tool_name: '_thinking',
            delta: 'id-less rejected child activity',
          },
        })
        await options.onEvent({
          event: 'error',
          data: {
            run_id: 'shared-run',
            message: 'id-less rejected child failure',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'shared-run' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'created-session',
            delta: ' legitimate parent tail',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'shared-run', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'legitimate parent prefix',
          sessionKey: 'created-session',
          runId: 'shared-run',
        },
      },
      {
        event: 'chunk',
        data: {
          text: ' legitimate parent tail',
          sessionKey: 'created-session',
          runId: 'shared-run',
        },
      },
    ])
    expect(events.some(({ event }) => event === 'error')).toBe(false)
    expect(events.filter(({ event }) => event === 'done')).toHaveLength(1)
    expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      'shared-run',
      'legitimate parent prefix legitimate parent tail',
      { replace: false },
    )
    expect(mocks.setRunThinking).not.toHaveBeenCalled()
    expect(mocks.upsertRunToolCall).not.toHaveBeenCalled()
    expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'shared-run',
      'complete',
      undefined,
    )
    expect(historyReads).toEqual(['created-session', 'created-session'])
    expect(mocks.getLatestDescendant).not.toHaveBeenCalled()
    expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
  })

  it('does not clear another rejected source when a shared-run continuation is confirmed', async () => {
    confirmContinuation('created-session', 'successor-session')
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'shared-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'child-session',
            relationship_type: 'subagent',
            delta: 'rejected child prefix',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'successor-session',
            delta: 'confirmed continuation',
          },
        })
        await options.onEvent({
          event: 'tool.progress',
          data: {
            run_id: 'shared-run',
            tool_name: '_thinking',
            delta: 'id-less rejected child activity',
          },
        })
        await options.onEvent({
          event: 'assistant.completed',
          data: {
            run_id: 'shared-run',
            content: 'id-less rejected child final',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'shared-run' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'successor-session',
            delta: ' continuation tail',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'shared-run', session_id: 'successor-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'session_handoff')).toEqual([
      {
        event: 'session_handoff',
        data: {
          fromSessionKey: 'created-session',
          sessionKey: 'successor-session',
          friendlyId: 'successor-session',
          runId: 'shared-run',
        },
      },
    ])
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'confirmed continuation',
          sessionKey: 'successor-session',
          runId: 'shared-run',
        },
      },
      {
        event: 'chunk',
        data: {
          text: ' continuation tail',
          sessionKey: 'successor-session',
          runId: 'shared-run',
        },
      },
    ])
    expect(events.some(({ event }) => event === 'thinking')).toBe(false)
    expect(events.filter(({ event }) => event === 'done')).toHaveLength(1)
    expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'successor-session',
      'shared-run',
      'confirmed continuation continuation tail',
      { replace: false },
    )
    expect(mocks.setRunThinking).not.toHaveBeenCalled()
    expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'successor-session',
      'shared-run',
      'complete',
      undefined,
    )
  })

  it.each([
    [
      'unsupported verification',
      { session_id: 'candidate-session' },
      {
        requestedSessionId: 'created-session',
        sessionId: 'candidate-session',
        path: ['created-session', 'candidate-session'],
        changed: true,
        supported: false,
      },
    ],
    [
      'malformed verification',
      { session_id: 'candidate-session' },
      {
        requestedSessionId: 'created-session',
        sessionId: 'candidate-session',
        path: ['other', 'candidate-session'],
        changed: true,
        supported: true,
      },
    ],
    [
      'mismatched verification',
      { session_id: 'candidate-session' },
      {
        requestedSessionId: 'created-session',
        sessionId: 'other-session',
        path: ['created-session', 'other-session'],
        changed: true,
        supported: true,
      },
    ],
    [
      'unknown relationship',
      {
        session_id: 'candidate-session',
        relationship_type: 'mystery',
      },
      null,
    ],
  ])(
    'quarantines candidate output after %s, including a later id-omitted event',
    async (_label, candidateData, verification) => {
      if (verification)
        mocks.getLatestDescendant.mockResolvedValue(verification)
      mocks.streamChat.mockImplementationOnce(
        async (
          _sessionKey: string,
          _request: unknown,
          options: {
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          await options.onEvent({
            event: 'run.started',
            data: { run_id: 'parent-run', session_id: 'created-session' },
          })
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: 'candidate-run',
              delta: 'candidate text',
              ...candidateData,
            },
          })
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: 'parent-run',
              session_id: 'created-session',
              delta: 'parent text',
            },
          })
          await options.onEvent({
            event: 'assistant.completed',
            data: {
              run_id: 'candidate-run',
              content: 'interleaved id-omitted candidate final',
            },
          })
          await options.onEvent({
            event: 'run.completed',
            data: { run_id: 'parent-run', session_id: 'created-session' },
          })
        },
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })

      const events = parseEvents(await response.text())
      expect(events.filter(({ event }) => event === 'chunk')).toEqual([
        {
          event: 'chunk',
          data: {
            text: 'parent text',
            sessionKey: 'created-session',
            runId: 'parent-run',
          },
        },
      ])
      expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
      expect(mocks.appendRunText).toHaveBeenCalledWith(
        'created-session',
        'parent-run',
        'parent text',
        { replace: false },
      )
    },
  )

  it('keeps an unconfirmed candidate quarantined until that exact continuation is accepted', async () => {
    mocks.getLatestDescendant
      .mockResolvedValueOnce({
        requestedSessionId: 'created-session',
        sessionId: 'successor-session',
        path: ['created-session', 'successor-session'],
        changed: true,
        supported: false,
      })
      .mockResolvedValueOnce({
        requestedSessionId: 'created-session',
        sessionId: 'successor-session',
        path: ['created-session', 'successor-session'],
        changed: true,
        supported: true,
      })
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'parent-run',
            session_id: 'successor-session',
            delta: 'still unconfirmed',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'parent-run',
            session_id: 'successor-session',
            delta: 'now confirmed',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'parent-run', session_id: 'successor-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'session_handoff')).toEqual([
      {
        event: 'session_handoff',
        data: {
          fromSessionKey: 'created-session',
          sessionKey: 'successor-session',
          friendlyId: 'successor-session',
          runId: 'parent-run',
        },
      },
    ])
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'now confirmed',
          sessionKey: 'successor-session',
          runId: 'parent-run',
        },
      },
    ])
    expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'successor-session',
      'parent-run',
      'now confirmed',
      { replace: false },
    )
  })

  it('prevents a rejected run.started event from claiming the parent run lifecycle', async () => {
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: {
            run_id: 'child-run',
            session_id: 'child-session',
            relationship_type: 'subagent',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: { delta: 'id-omitted child text' },
        })
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'parent-run',
            session_id: 'created-session',
            delta: 'parent text',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'started')).toEqual([
      {
        event: 'started',
        data: {
          runId: 'parent-run',
          sessionKey: 'created-session',
          friendlyId: 'created-session',
        },
      },
    ])
    expect(mocks.createPersistedRun).toHaveBeenCalledTimes(1)
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: 'parent-run',
      sessionKey: 'created-session',
      friendlyId: 'created-session',
    })
    expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      'parent-run',
      'parent text',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'parent-run',
      'complete',
      undefined,
    )
  })

  it.each([
    {
      label: 'same-source control',
      parent: { source: 'cli', session_source: 'cli' },
      candidate: {
        source: 'cli',
        session_source: 'cli',
        parent_source: 'cli',
      },
      accepted: true,
    },
    {
      label: 'CLI parent and Telegram candidate',
      parent: { source: 'cli', session_source: 'cli' },
      candidate: { source: 'telegram', session_source: 'telegram' },
      accepted: false,
    },
    {
      label: 'contradictory candidate source fields',
      parent: { source: 'cli', session_source: 'cli' },
      candidate: { source: 'cli', session_source: 'telegram' },
      accepted: false,
    },
    {
      label: 'contradictory candidate parent_source',
      parent: { source: 'cli', session_source: 'cli' },
      candidate: {
        source: 'cli',
        session_source: 'cli',
        parent_source: 'telegram',
      },
      accepted: false,
    },
    {
      label: 'contradictory active parent context',
      parent: { source: 'cli', session_source: 'telegram' },
      candidate: { source: 'cli', session_source: 'cli' },
      accepted: false,
    },
    {
      label: 'unavailable active parent context',
      parent: {},
      candidate: { source: 'cli', session_source: 'cli' },
      accepted: false,
    },
  ])(
    'binds continuation publication and migration to the active source: $label',
    async ({ parent, candidate, accepted }) => {
      mocks.getSession.mockResolvedValueOnce({
        id: 'created-session',
        ...parent,
      })
      confirmContinuation('created-session', 'successor-session')
      mocks.streamChat.mockImplementationOnce(
        async (
          _sessionKey: string,
          _request: unknown,
          options: {
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          await options.onEvent({
            event: 'run.started',
            data: { run_id: 'parent-run', session_id: 'created-session' },
          })
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: 'parent-run',
              session_id: 'successor-session',
              relationship_type: 'continuation',
              delta: 'candidate continuation',
              ...candidate,
            },
          })
          await options.onEvent({
            event: 'run.completed',
            data: {
              run_id: 'parent-run',
              session_id: accepted ? 'successor-session' : 'created-session',
            },
          })
        },
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })

      const events = parseEvents(await response.text())
      expect(
        events.filter(({ event }) => event === 'session_handoff'),
      ).toHaveLength(accepted ? 1 : 0)
      expect(events.filter(({ event }) => event === 'chunk')).toEqual(
        accepted
          ? [
              {
                event: 'chunk',
                data: {
                  text: 'candidate continuation',
                  sessionKey: 'successor-session',
                  runId: 'parent-run',
                },
              },
            ]
          : [],
      )
      expect(mocks.migratePersistedRun).toHaveBeenCalledTimes(accepted ? 1 : 0)
      expect(mocks.appendRunText).toHaveBeenCalledTimes(accepted ? 1 : 0)
    },
  )

  it.each([
    ['omitted event source facts', {}],
    [
      'spoofed CLI event source facts',
      { source: 'cli', session_source: 'cli', parent_source: 'cli' },
    ],
  ])(
    'rejects a backend-confirmed Telegram target with %s',
    async (_label, candidateSources) => {
      const historyReads: Array<string> = []
      mocks.getSession.mockImplementation((sessionId: string) =>
        Promise.resolve({
          id: sessionId,
          source: sessionId === 'successor-session' ? 'telegram' : 'cli',
          session_source:
            sessionId === 'successor-session' ? 'telegram' : 'cli',
        }),
      )
      mocks.getMessages.mockImplementation((sessionKey: string) => {
        historyReads.push(sessionKey)
        return Promise.resolve([])
      })
      confirmContinuation('created-session', 'successor-session')
      mocks.streamChat.mockImplementationOnce(
        async (
          _sessionKey: string,
          _request: unknown,
          options: {
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          await options.onEvent({
            event: 'run.started',
            data: { run_id: 'parent-run', session_id: 'created-session' },
          })
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: 'parent-run',
              session_id: 'successor-session',
              relationship_type: 'continuation',
              delta: 'cross-source candidate text',
              ...candidateSources,
            },
          })
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: 'parent-run',
              session_id: 'created-session',
              delta: 'parent survived',
            },
          })
          await options.onEvent({
            event: 'run.completed',
            data: { run_id: 'parent-run', session_id: 'created-session' },
          })
        },
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })

      const events = parseEvents(await response.text())
      expect(events.some(({ event }) => event === 'session_handoff')).toBe(
        false,
      )
      expect(events.filter(({ event }) => event === 'chunk')).toEqual([
        {
          event: 'chunk',
          data: {
            text: 'parent survived',
            sessionKey: 'created-session',
            runId: 'parent-run',
          },
        },
      ])
      expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
      expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
      expect(mocks.appendRunText).toHaveBeenCalledWith(
        'created-session',
        'parent-run',
        'parent survived',
        { replace: false },
      )
      expect(historyReads).toEqual(['created-session', 'created-session'])
      expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
      expect(mocks.markRunStatus).toHaveBeenCalledWith(
        'created-session',
        'parent-run',
        'complete',
        undefined,
      )
    },
  )

  it('keeps same-session bad provenance sticky without rejecting explicit parent events', async () => {
    const historyReads: Array<string> = []
    mocks.getMessages.mockImplementation((sessionKey: string) => {
      historyReads.push(sessionKey)
      return Promise.resolve([])
    })
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'shared-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'created-session',
            relationship_type: 'subagent',
            delta: 'same-session rejected prefix',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'created-session',
            delta: 'explicit parent prefix',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: { run_id: 'shared-run', delta: 'id-less rejected text' },
        })
        await options.onEvent({
          event: 'tool.progress',
          data: {
            run_id: 'shared-run',
            tool_name: '_thinking',
            delta: 'id-less rejected activity',
          },
        })
        await options.onEvent({
          event: 'error',
          data: { run_id: 'shared-run', message: 'id-less rejected failure' },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'shared-run' },
        })
        await options.onEvent({
          event: 'assistant.completed',
          data: {
            run_id: 'shared-run',
            content: 'id-less rejected final',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'shared-run',
            session_id: 'created-session',
            delta: ' explicit parent tail',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'shared-run', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'explicit parent prefix',
          sessionKey: 'created-session',
          runId: 'shared-run',
        },
      },
      {
        event: 'chunk',
        data: {
          text: ' explicit parent tail',
          sessionKey: 'created-session',
          runId: 'shared-run',
        },
      },
    ])
    expect(events.some(({ event }) => event === 'thinking')).toBe(false)
    expect(events.some(({ event }) => event === 'error')).toBe(false)
    expect(events.filter(({ event }) => event === 'done')).toHaveLength(1)
    expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      'shared-run',
      'explicit parent prefix explicit parent tail',
      { replace: false },
    )
    expect(mocks.setRunThinking).not.toHaveBeenCalled()
    expect(historyReads).toEqual(['created-session', 'created-session'])
    expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
  })

  it('fails closed for identifier-less events after provenance saturation', async () => {
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
        for (let index = 0; index <= STREAM_PROVENANCE_ID_LIMIT; index += 1) {
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: `rejected-run-${index}`,
              session_id: `rejected-session-${index}`,
              relationship_type: 'subagent',
              delta: `rejected-${index}`,
            },
          })
        }
        await options.onEvent({
          event: 'assistant.delta',
          data: { run_id: 'parent-run', delta: 'saturated id-less text' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'parent-run',
            session_id: 'created-session',
            delta: 'explicit parent survives saturation',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'explicit parent survives saturation',
          sessionKey: 'created-session',
          runId: 'parent-run',
        },
      },
    ])
    expect(mocks.appendRunText).toHaveBeenCalledTimes(1)
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      'parent-run',
      'explicit parent survives saturation',
      { replace: false },
    )
    expect(mocks.getLatestDescendant).not.toHaveBeenCalled()
    expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'tool.pending',
      upstreamEvent: 'tool.pending',
      makeData: (marker: string) => ({
        tool_name: marker,
        tool_call_id: `${marker}-id`,
      }),
      outputEvent: 'tool',
      output: { phase: 'start', name: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'tool.started',
      upstreamEvent: 'tool.started',
      makeData: (marker: string) => ({
        tool_name: marker,
        tool_call_id: `${marker}-id`,
      }),
      outputEvent: 'tool',
      output: { phase: 'start', name: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'tool.calling',
      upstreamEvent: 'tool.calling',
      makeData: (marker: string) => ({
        tool_name: marker,
        tool_call_id: `${marker}-id`,
      }),
      outputEvent: 'tool',
      output: { phase: 'calling', name: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'tool.running',
      upstreamEvent: 'tool.running',
      makeData: (marker: string) => ({
        tool_name: marker,
        tool_call_id: `${marker}-id`,
      }),
      outputEvent: 'tool',
      output: { phase: 'calling', name: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'thinking tool.progress',
      upstreamEvent: 'tool.progress',
      makeData: (marker: string) => ({
        tool_name: '_thinking',
        delta: marker,
      }),
      outputEvent: 'thinking',
      output: { text: 'valid-activity' },
      persistence: 'thinking',
    },
    {
      label: 'ordinary tool.progress',
      upstreamEvent: 'tool.progress',
      makeData: (marker: string) => ({
        tool_name: 'search',
        tool_call_id: `${marker}-id`,
        delta: marker,
      }),
      outputEvent: 'tool',
      output: { phase: 'calling', result: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'tool.completed',
      upstreamEvent: 'tool.completed',
      makeData: (marker: string) => ({
        tool_name: 'search',
        tool_call_id: `${marker}-id`,
        result: marker,
      }),
      outputEvent: 'tool',
      output: { phase: 'complete', result: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'tool.failed',
      upstreamEvent: 'tool.failed',
      makeData: (marker: string) => ({
        tool_name: 'search',
        tool_call_id: `${marker}-id`,
        message: marker,
      }),
      outputEvent: 'tool',
      output: { phase: 'error', result: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'memory.updated',
      upstreamEvent: 'memory.updated',
      makeData: (marker: string) => ({ message: marker }),
      outputEvent: 'tool',
      output: { phase: 'complete', name: 'memory', result: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'skill.loaded',
      upstreamEvent: 'skill.loaded',
      makeData: (marker: string) => ({ skill_name: marker }),
      outputEvent: 'tool',
      output: { phase: 'complete', name: 'skill', result: 'valid-activity' },
      persistence: 'tool',
    },
    {
      label: 'artifact.created',
      upstreamEvent: 'artifact.created',
      makeData: (marker: string) => ({ artifact: { title: marker } }),
      outputEvent: 'artifact',
      output: { title: 'valid-activity' },
      persistence: 'none',
    },
  ])(
    'isolates rejected $label provenance while preserving valid parent output and state',
    async ({ upstreamEvent, makeData, outputEvent, output, persistence }) => {
      mocks.streamChat.mockImplementationOnce(
        async (
          _sessionKey: string,
          _request: unknown,
          options: {
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          await options.onEvent({
            event: 'run.started',
            data: { run_id: 'parent-run', session_id: 'created-session' },
          })
          await options.onEvent({
            event: upstreamEvent,
            data: {
              run_id: 'child-run',
              session_id: 'child-session',
              relationship_type: 'subagent',
              ...makeData('rejected-activity'),
            },
          })
          await options.onEvent({
            event: upstreamEvent,
            data: {
              run_id: 'parent-run',
              session_id: 'created-session',
              ...makeData('valid-activity'),
            },
          })
          await options.onEvent({
            event: 'run.completed',
            data: { run_id: 'parent-run', session_id: 'created-session' },
          })
        },
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })

      const events = parseEvents(await response.text())
      expect(JSON.stringify(events)).not.toContain('rejected-activity')
      expect(events.filter(({ event }) => event === outputEvent)).toEqual([
        expect.objectContaining({
          data: expect.objectContaining({
            ...output,
            sessionKey: 'created-session',
            runId: 'parent-run',
          }),
        }),
      ])

      if (persistence === 'thinking') {
        expect(mocks.setRunThinking).toHaveBeenCalledTimes(1)
        expect(mocks.setRunThinking).toHaveBeenCalledWith(
          'created-session',
          'parent-run',
          'valid-activity',
        )
        expect(mocks.upsertRunToolCall).not.toHaveBeenCalled()
      } else if (persistence === 'tool') {
        expect(mocks.upsertRunToolCall).toHaveBeenCalledTimes(1)
        expect(mocks.upsertRunToolCall).toHaveBeenCalledWith(
          'created-session',
          'parent-run',
          expect.objectContaining(output),
        )
        expect(mocks.setRunThinking).not.toHaveBeenCalled()
      } else {
        expect(mocks.setRunThinking).not.toHaveBeenCalled()
        expect(mocks.upsertRunToolCall).not.toHaveBeenCalled()
      }
    },
  )

  it('persists later text and completion after a recoverable tool failure', async () => {
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'recoverable-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'tool.failed',
          data: {
            run_id: 'recoverable-run',
            session_id: 'created-session',
            tool_name: 'search',
            tool_call_id: 'recoverable-tool',
            message: 'search failed but the agent recovered',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'recoverable-run',
            session_id: 'created-session',
            delta: 'answer after failed tool',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'recoverable-run', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'tool')).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({
          phase: 'error',
          toolCallId: 'recoverable-tool',
        }),
      }),
    ])
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ text: 'answer after failed tool' }),
      }),
    ])
    expect(events.filter(({ event }) => event === 'done')).toHaveLength(1)
    expect(mocks.upsertRunToolCall).toHaveBeenCalledWith(
      'created-session',
      'recoverable-run',
      expect.objectContaining({ id: 'recoverable-tool', phase: 'error' }),
    )
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'created-session',
      'recoverable-run',
      'answer after failed tool',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'recoverable-run',
      'complete',
      undefined,
    )
  })

  it.each([
    {
      terminalEvent: 'run.completed',
      expectedRunStatus: 'complete',
      expectedClientEvent: 'done',
      expectedClientState: 'complete',
    },
    {
      terminalEvent: 'run.succeeded',
      expectedRunStatus: 'complete',
      expectedClientEvent: 'done',
      expectedClientState: 'complete',
    },
    {
      terminalEvent: 'error',
      expectedRunStatus: 'error',
      expectedClientEvent: 'error',
      expectedClientState: undefined,
    },
    {
      terminalEvent: 'run.failed',
      expectedRunStatus: 'error',
      expectedClientEvent: 'error',
      expectedClientState: undefined,
    },
    {
      terminalEvent: 'run.error',
      expectedRunStatus: 'error',
      expectedClientEvent: 'error',
      expectedClientState: undefined,
    },
    {
      terminalEvent: 'run.cancelled',
      expectedRunStatus: 'handoff',
      expectedClientEvent: 'done',
      expectedClientState: 'interrupted',
    },
    {
      terminalEvent: 'run.canceled',
      expectedRunStatus: 'handoff',
      expectedClientEvent: 'done',
      expectedClientState: 'interrupted',
    },
  ] as const)(
    'terminalizes a parent run on $terminalEvent without a later deadline timeout',
    async ({
      terminalEvent,
      expectedRunStatus,
      expectedClientEvent,
      expectedClientState,
    }) => {
      vi.useFakeTimers()
      try {
        mocks.streamChat.mockImplementationOnce(
          async (
            _sessionKey: string,
            _request: unknown,
            options: {
              onEvent: (payload: {
                event: string
                data: Record<string, unknown>
              }) => Promise<void>
            },
          ) => {
            await options.onEvent({
              event: 'run.started',
              data: { run_id: 'parent-run', session_id: 'created-session' },
            })
            await options.onEvent({
              event: terminalEvent,
              data: {
                run_id: 'parent-run',
                session_id: 'created-session',
                message: 'upstream terminal message',
              },
            })
          },
        )

        const response = await handler({
          request: new Request('http://workspace.test/api/send-stream', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionKey: 'created-session',
              friendlyId: 'created-session',
              message: 'hello',
            }),
          }),
        })
        const responseText = response.text()

        await vi.advanceTimersByTimeAsync(600_000)
        const events = parseEvents(await responseText)

        expect(
          events.filter(({ event }) => event === expectedClientEvent),
        ).toEqual([
          {
            event: expectedClientEvent,
            data:
              expectedClientEvent === 'error'
                ? {
                    message: 'upstream terminal message',
                    sessionKey: 'created-session',
                    runId: 'parent-run',
                  }
                : {
                    state: expectedClientState,
                    sessionKey: 'created-session',
                    runId: 'parent-run',
                  },
          },
        ])
        expect(
          events.some(
            ({ event, data }) =>
              event === 'error' && data?.message === 'Stream timeout',
          ),
        ).toBe(false)
        expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
        expect(mocks.markRunStatus).toHaveBeenCalledWith(
          'created-session',
          'parent-run',
          expectedRunStatus,
          expectedRunStatus === 'error'
            ? 'upstream terminal message'
            : undefined,
        )
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('does not let rejected terminal events fail, complete, close, or backfill the parent stream', async () => {
    const historyReads: Array<string> = []
    mocks.getMessages.mockImplementation((sessionKey: string) => {
      historyReads.push(sessionKey)
      return Promise.resolve([])
    })
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'error',
          data: {
            run_id: 'child-run',
            session_id: 'child-session',
            session_source: 'fork',
            message: 'child failed',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: {
            run_id: 'child-run',
            session_id: 'child-session',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'child-run' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'parent-run',
            session_id: 'created-session',
            delta: 'parent survived',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'parent-run', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.some(({ event }) => event === 'error')).toBe(false)
    expect(events.filter(({ event }) => event === 'done')).toHaveLength(1)
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'parent survived',
          sessionKey: 'created-session',
          runId: 'parent-run',
        },
      },
    ])
    expect(historyReads).toEqual(['created-session', 'created-session'])
    expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'parent-run',
      'complete',
      undefined,
    )
  })

  it('rejects unsafe upstream run ids before lifecycle ownership or emission', async () => {
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: '../../escaped-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'tool.started',
          data: {
            run_id: 'run%2fencoded',
            session_id: 'created-session',
            tool_name: 'unsafe_tool',
          },
        })
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'safe-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'safe-run',
            session_id: 'created-session',
            delta: 'safe output',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'safe-run', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'started')).toEqual([
      {
        event: 'started',
        data: {
          runId: 'safe-run',
          sessionKey: 'created-session',
          friendlyId: 'created-session',
        },
      },
    ])
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'safe output',
          sessionKey: 'created-session',
          runId: 'safe-run',
        },
      },
    ])
    expect(mocks.createPersistedRun).toHaveBeenCalledTimes(1)
    expect(mocks.createPersistedRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'safe-run' }),
    )
    expect(mocks.upsertRunToolCall).not.toHaveBeenCalled()
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'safe-run',
      'complete',
      undefined,
    )
  })

  it('binds same-parent tool and terminal events to the first accepted run id', async () => {
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'run-a', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'tool.started',
          data: {
            run_id: 'run-b',
            session_id: 'created-session',
            tool_name: 'wrong_run_tool',
            tool_call_id: 'wrong-call',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'run-b', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'tool.started',
          data: {
            run_id: 'run-a',
            session_id: 'created-session',
            tool_name: 'right_run_tool',
            tool_call_id: 'right-call',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'run-a', session_id: 'created-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'tool')).toEqual([
      {
        event: 'tool',
        data: expect.objectContaining({
          name: 'right_run_tool',
          toolCallId: 'right-call',
          runId: 'run-a',
        }),
      },
    ])
    expect(events.filter(({ event }) => event === 'done')).toEqual([
      {
        event: 'done',
        data: {
          state: 'complete',
          sessionKey: 'created-session',
          runId: 'run-a',
        },
      },
    ])
    expect(mocks.upsertRunToolCall).toHaveBeenCalledTimes(1)
    expect(mocks.upsertRunToolCall).toHaveBeenCalledWith(
      'created-session',
      'run-a',
      expect.objectContaining({ id: 'right-call', name: 'right_run_tool' }),
    )
    expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'run-a',
      'complete',
      undefined,
    )
  })

  it('invalidates an origin poll and terminally backfills successor-only tool activity after handoff', async () => {
    mocks.resolveSessionKey.mockResolvedValueOnce({
      sessionKey: 'created-session',
    })
    confirmContinuation('created-session', 'successor-session')
    let resolveOriginPoll:
      | ((messages: Array<Record<string, unknown>>) => void)
      | undefined
    const originPollResult = new Promise<Array<Record<string, unknown>>>(
      (resolve) => {
        resolveOriginPoll = resolve
      },
    )
    let observeOriginPoll: (() => void) | undefined
    const originPollStarted = new Promise<void>((resolve) => {
      observeOriginPoll = resolve
    })
    let resolveTerminalPersistence: (() => void) | undefined
    const terminalPersistence = new Promise<void>((resolve) => {
      resolveTerminalPersistence = resolve
    })
    let observeSuccessorBackfill: (() => void) | undefined
    const successorBackfillStarted = new Promise<void>((resolve) => {
      observeSuccessorBackfill = resolve
    })
    let originReads = 0
    let completionStarted = false
    let successorReads = 0
    const sourceMessages = Array.from({ length: 6 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `old-${index}`,
    }))
    const successorMessages = [
      { role: 'user', content: 'current turn' },
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'handoff-tool',
            function: { name: 'search', arguments: { query: 'lineage' } },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'handoff-tool',
        content: 'successor result',
      },
    ]
    const staleOriginMessages = [
      ...sourceMessages,
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'stale-origin-tool',
            function: { name: 'read_file', arguments: { path: '/stale' } },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'stale-origin-tool',
        content: 'must not cross the handoff',
      },
    ]
    mocks.getMessages.mockImplementation((sessionKey: string) => {
      if (sessionKey === 'successor-session') {
        successorReads += 1
        expect(completionStarted).toBe(true)
        observeSuccessorBackfill?.()
        return Promise.resolve(successorMessages)
      }
      originReads += 1
      if (originReads === 1) return Promise.resolve(sourceMessages)
      observeOriginPoll?.()
      return originPollResult
    })
    mocks.markRunStatus.mockReturnValueOnce(terminalPersistence)
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'run-tools', session_id: 'created-session' },
        })
        await originPollStarted
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'run-tools',
            session_id: 'successor-session',
            delta: 'continued',
          },
        })
        completionStarted = true
        const completion = options.onEvent({
          event: 'run.completed',
          data: { run_id: 'run-tools', session_id: 'successor-session' },
        })
        await successorBackfillStarted
        await Promise.resolve()
        await Promise.resolve()
        resolveOriginPoll?.(staleOriginMessages)
        await Promise.resolve()
        await Promise.resolve()
        resolveTerminalPersistence?.()
        await completion
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(originReads).toBe(2)
    expect(successorReads).toBe(1)
    const toolEvents = events
      .filter(({ event }) => event === 'tool')
      .map(({ data }) => data)
    expect(toolEvents).toEqual([
      expect.objectContaining({
        toolCallId: 'handoff-tool',
        phase: 'complete',
        result: 'successor result',
        sessionKey: 'successor-session',
        runId: 'run-tools',
      }),
    ])
    expect(events.findIndex(({ event }) => event === 'tool')).toBeLessThan(
      events.findIndex(({ event }) => event === 'done'),
    )
    expect(mocks.upsertRunToolCall).toHaveBeenCalledTimes(1)
    expect(mocks.upsertRunToolCall).toHaveBeenCalledWith(
      'successor-session',
      'run-tools',
      {
        id: 'handoff-tool',
        name: 'search',
        phase: 'complete',
        args: { query: 'lineage' },
        result: 'successor result',
      },
    )
    expect(mocks.upsertRunToolCall.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markRunStatus.mock.invocationCallOrder[0]!,
    )
  })

  it('durably records synthetic tool progress before emission and its terminal upgrade before completion', async () => {
    vi.useFakeTimers()
    try {
      const callingMessages = [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'synthetic-tool',
              function: {
                name: 'read_file',
                arguments: { path: '/tmp/input.txt' },
              },
            },
          ],
        },
      ]
      const completeMessages = [
        ...callingMessages,
        {
          role: 'tool',
          tool_call_id: 'synthetic-tool',
          content: 'durable output',
        },
      ]
      mocks.getMessages
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(callingMessages)
        .mockResolvedValueOnce(completeMessages)
      mocks.streamChat.mockImplementationOnce(
        async (
          _sessionKey: string,
          _request: unknown,
          options: {
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          await options.onEvent({
            event: 'run.started',
            data: { run_id: 'run-synthetic', session_id: 'created-session' },
          })
          await vi.advanceTimersByTimeAsync(600)
          await options.onEvent({
            event: 'run.completed',
            data: { run_id: 'run-synthetic', session_id: 'created-session' },
          })
        },
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })

      const events = parseEvents(await response.text())
      expect(
        events
          .filter(({ event }) => event === 'tool')
          .map(({ data }) => data?.phase),
      ).toEqual(['calling', 'complete'])
      expect(mocks.upsertRunToolCall).toHaveBeenCalledTimes(2)
      expect(mocks.upsertRunToolCall).toHaveBeenNthCalledWith(
        1,
        'created-session',
        'run-synthetic',
        expect.objectContaining({
          id: 'synthetic-tool',
          phase: 'calling',
        }),
      )
      expect(mocks.upsertRunToolCall).toHaveBeenNthCalledWith(
        2,
        'created-session',
        'run-synthetic',
        expect.objectContaining({
          id: 'synthetic-tool',
          phase: 'complete',
          result: 'durable output',
        }),
      )
      expect(mocks.upsertRunToolCall.mock.invocationCallOrder[1]).toBeLessThan(
        mocks.markRunStatus.mock.invocationCallOrder[0]!,
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the stream deadline while the authoritative parent lookup is pending', async () => {
    vi.useFakeTimers()
    try {
      let resolveParentLookup:
        | ((session: { id: string; source: string }) => void)
        | undefined
      mocks.getSession.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveParentLookup = resolve
        }),
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })
      const responseText = response.text()

      await vi.advanceTimersByTimeAsync(600_000)
      const events = parseEvents(await responseText)

      expect(events.at(-1)).toEqual({
        event: 'error',
        data: {
          message: 'Stream timeout',
          sessionKey: 'created-session',
        },
      })
      expect(mocks.getMessages).not.toHaveBeenCalled()
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)

      resolveParentLookup?.({ id: 'created-session', source: 'cli' })
      await Promise.resolve()
      await Promise.resolve()
      expect(mocks.getMessages).not.toHaveBeenCalled()
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    { bootstrapSessionKey: 'main', pendingBootstrap: 'listSessions' },
    { bootstrapSessionKey: 'new', pendingBootstrap: 'createSession' },
  ] as const)(
    'closes the stream deadline while $pendingBootstrap bootstrap is pending',
    async ({ bootstrapSessionKey, pendingBootstrap }) => {
      vi.useFakeTimers()
      try {
        let resolveBootstrap:
          | ((value: Array<{ id: string }> | { id: string }) => void)
          | undefined
        const bootstrapPending = new Promise<
          Array<{ id: string }> | { id: string }
        >((resolve) => {
          resolveBootstrap = resolve
        })
        if (pendingBootstrap === 'listSessions') {
          mocks.listSessions.mockReturnValueOnce(bootstrapPending)
        } else {
          mocks.createSession.mockReturnValueOnce(bootstrapPending)
        }

        const responsePending = handler({
          request: new Request('http://workspace.test/api/send-stream', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionKey: bootstrapSessionKey,
              friendlyId: bootstrapSessionKey,
              message: 'hello',
            }),
          }),
        })

        await vi.advanceTimersByTimeAsync(600_000)
        const response = await responsePending
        if (bootstrapSessionKey === 'main') {
          expect(response.status).toBe(504)
          await expect(response.json()).resolves.toEqual({
            ok: false,
            error: 'Stream timeout',
          })
        } else {
          const events = parseEvents(await response.text())
          expect(events.at(-1)).toEqual({
            event: 'error',
            data: {
              message: 'Stream timeout',
              sessionKey: bootstrapSessionKey,
            },
          })
          expect(events.some(({ event }) => event === 'session_handoff')).toBe(
            false,
          )
        }
        expect(mocks.getSession).not.toHaveBeenCalled()
        expect(mocks.getMessages).not.toHaveBeenCalled()
        expect(mocks.streamChat).not.toHaveBeenCalled()
        expect(mocks.createPersistedRun).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)

        resolveBootstrap?.(
          pendingBootstrap === 'listSessions'
            ? [{ id: 'late-reused-session' }]
            : { id: 'late-created-session' },
        )
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        expect(mocks.getSession).not.toHaveBeenCalled()
        expect(mocks.getMessages).not.toHaveBeenCalled()
        expect(mocks.streamChat).not.toHaveBeenCalled()
        expect(mocks.createPersistedRun).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('terminates an already-aborted request before any route work begins', async () => {
    vi.useFakeTimers()
    try {
      const requestAbort = new AbortController()
      requestAbort.abort()

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
          signal: requestAbort.signal,
        }),
      })

      expect(response.status).toBe(499)
      expect(await response.text()).toBe('')
      expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
      expect(mocks.resolveSessionKey).not.toHaveBeenCalled()
      expect(mocks.loadWorkspaceCatalog).not.toHaveBeenCalled()
      expect(mocks.listSessions).not.toHaveBeenCalled()
      expect(mocks.createSession).not.toHaveBeenCalled()
      expect(mocks.getSession).not.toHaveBeenCalled()
      expect(mocks.getMessages).not.toHaveBeenCalled()
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    'gateway probe',
    'body parse',
    'session resolution',
    'workspace resolution',
  ] as const)(
    'observes abort while deferred in pre-stream %s',
    async (phase) => {
      vi.useFakeTimers()
      try {
        const phaseStarted = deferred<void>()
        let releasePhase: () => void = () => undefined
        const requestAbort = new AbortController()
        const request = new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
          signal: requestAbort.signal,
        })

        if (phase === 'gateway probe') {
          const pending = deferred<undefined>()
          mocks.ensureGatewayProbed.mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () => pending.resolve(undefined)
        } else if (phase === 'body parse') {
          const pending = deferred<ReadableStreamReadResult<Uint8Array>>()
          vi.spyOn(request.body!, 'getReader').mockReturnValueOnce({
            read: () => {
              phaseStarted.resolve(undefined)
              return pending.promise
            },
            cancel: vi.fn(),
          } as never)
          releasePhase = () => pending.resolve({ done: true, value: undefined })
        } else if (phase === 'session resolution') {
          const pending = deferred<{ sessionKey: string }>()
          mocks.resolveSessionKey.mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () =>
            pending.resolve({ sessionKey: 'created-session' })
        } else {
          const pending = deferred<null>()
          mocks.loadWorkspaceCatalog.mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () => pending.resolve(null)
        }

        const responsePending = handler({ request })
        await phaseStarted.promise

        requestAbort.abort()
        const response = await responsePending

        expect(response.status).toBe(499)
        expect(await response.text()).toBe('')
        expect(mocks.listSessions).not.toHaveBeenCalled()
        expect(mocks.createSession).not.toHaveBeenCalled()
        expect(mocks.getSession).not.toHaveBeenCalled()
        expect(mocks.getMessages).not.toHaveBeenCalled()
        expect(mocks.streamChat).not.toHaveBeenCalled()
        expect(mocks.createPersistedRun).not.toHaveBeenCalled()
        expect(mocks.appendRunText).not.toHaveBeenCalled()
        expect(mocks.markRunStatus).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)

        releasePhase()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        expect(mocks.listSessions).not.toHaveBeenCalled()
        expect(mocks.createSession).not.toHaveBeenCalled()
        expect(mocks.getSession).not.toHaveBeenCalled()
        expect(mocks.getMessages).not.toHaveBeenCalled()
        expect(mocks.streamChat).not.toHaveBeenCalled()
        expect(mocks.createPersistedRun).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it.each([
    'gateway probe',
    'body parse',
    'session resolution',
    'workspace resolution',
  ] as const)(
    'bounds deferred pre-stream %s with the shared stream deadline',
    async (phase) => {
      vi.useFakeTimers()
      try {
        const phaseStarted = deferred<void>()
        let releasePhase: () => void = () => undefined
        const request = new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        })

        if (phase === 'gateway probe') {
          const pending = deferred<undefined>()
          mocks.ensureGatewayProbed.mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () => pending.resolve(undefined)
        } else if (phase === 'body parse') {
          const pending = deferred<ReadableStreamReadResult<Uint8Array>>()
          vi.spyOn(request.body!, 'getReader').mockReturnValueOnce({
            read: () => {
              phaseStarted.resolve(undefined)
              return pending.promise
            },
            cancel: vi.fn(),
          } as never)
          releasePhase = () => pending.resolve({ done: true, value: undefined })
        } else if (phase === 'session resolution') {
          const pending = deferred<{ sessionKey: string }>()
          mocks.resolveSessionKey.mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () =>
            pending.resolve({ sessionKey: 'created-session' })
        } else {
          const pending = deferred<null>()
          mocks.loadWorkspaceCatalog.mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () => pending.resolve(null)
        }

        const responsePending = handler({ request })
        await phaseStarted.promise

        await vi.advanceTimersByTimeAsync(600_000)
        const response = await responsePending

        expect(response.status).toBe(504)
        expect(await response.json()).toEqual({
          ok: false,
          error: 'Stream timeout',
        })
        expect(mocks.listSessions).not.toHaveBeenCalled()
        expect(mocks.createSession).not.toHaveBeenCalled()
        expect(mocks.getSession).not.toHaveBeenCalled()
        expect(mocks.getMessages).not.toHaveBeenCalled()
        expect(mocks.streamChat).not.toHaveBeenCalled()
        expect(mocks.createPersistedRun).not.toHaveBeenCalled()
        expect(mocks.appendRunText).not.toHaveBeenCalled()
        expect(mocks.markRunStatus).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)

        releasePhase()
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        expect(mocks.listSessions).not.toHaveBeenCalled()
        expect(mocks.createSession).not.toHaveBeenCalled()
        expect(mocks.getSession).not.toHaveBeenCalled()
        expect(mocks.getMessages).not.toHaveBeenCalled()
        expect(mocks.streamChat).not.toHaveBeenCalled()
        expect(mocks.createPersistedRun).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('client abort closes a deferred parent lookup without late follow-up work', async () => {
    vi.useFakeTimers()
    try {
      let resolveParentLookup:
        | ((session: { id: string; source: string }) => void)
        | undefined
      let observeParentLookup: (() => void) | undefined
      const parentLookupStarted = new Promise<void>((resolve) => {
        observeParentLookup = resolve
      })
      mocks.getSession.mockImplementationOnce(() => {
        observeParentLookup?.()
        return new Promise((resolve) => {
          resolveParentLookup = resolve
        })
      })
      const requestAbort = new AbortController()

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
          signal: requestAbort.signal,
        }),
      })
      const responseText = response.text()
      await parentLookupStarted

      requestAbort.abort()
      const events = parseEvents(await responseText)

      expect(events).toEqual([])
      expect(mocks.getMessages).not.toHaveBeenCalled()
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)

      resolveParentLookup?.({ id: 'created-session', source: 'cli' })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(mocks.getMessages).not.toHaveBeenCalled()
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(mocks.appendRunText).not.toHaveBeenCalled()
      expect(mocks.markRunStatus).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('client abort closes deferred baseline history without starting polling or production', async () => {
    vi.useFakeTimers()
    try {
      let resolveBaseline:
        | ((messages: Array<Record<string, unknown>>) => void)
        | undefined
      let observeBaseline: (() => void) | undefined
      const baselineStarted = new Promise<void>((resolve) => {
        observeBaseline = resolve
      })
      mocks.getMessages.mockImplementationOnce(() => {
        observeBaseline?.()
        return new Promise((resolve) => {
          resolveBaseline = resolve
        })
      })
      const requestAbort = new AbortController()

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
          signal: requestAbort.signal,
        }),
      })
      const responseText = response.text()
      await baselineStarted

      requestAbort.abort()
      const events = parseEvents(await responseText)

      expect(events).toEqual([])
      expect(mocks.getMessages).toHaveBeenCalledTimes(1)
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)

      resolveBaseline?.([])
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(mocks.getMessages).toHaveBeenCalledTimes(1)
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(mocks.appendRunText).not.toHaveBeenCalled()
      expect(mocks.markRunStatus).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the stream deadline while baseline history is pending', async () => {
    vi.useFakeTimers()
    try {
      let resolveBaseline:
        | ((messages: Array<Record<string, unknown>>) => void)
        | undefined
      mocks.getMessages.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveBaseline = resolve
        }),
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })
      const responseText = response.text()

      await vi.advanceTimersByTimeAsync(600_000)
      const events = parseEvents(await responseText)

      expect(events.at(-1)).toEqual({
        event: 'error',
        data: {
          message: 'Stream timeout',
          sessionKey: 'created-session',
        },
      })
      expect(mocks.getMessages).toHaveBeenCalledTimes(1)
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)

      resolveBaseline?.([])
      await Promise.resolve()
      await Promise.resolve()
      expect(mocks.streamChat).not.toHaveBeenCalled()
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['persistedRunReady', 'markRunStatus'] as const)(
    'closes an active run at the deadline while %s is pending',
    async (pendingWrite) => {
      vi.useFakeTimers()
      try {
        let resolveTerminalWrite: ((value: unknown) => void) | undefined
        let observeTerminalWrite: (() => void) | undefined
        const terminalWriteStarted = new Promise<void>((resolve) => {
          observeTerminalWrite = resolve
        })
        const pendingTerminalWrite = new Promise((resolve) => {
          resolveTerminalWrite = resolve
        })
        if (pendingWrite === 'persistedRunReady') {
          mocks.createPersistedRun.mockImplementationOnce(() => {
            observeTerminalWrite?.()
            return pendingTerminalWrite
          })
        } else {
          mocks.markRunStatus.mockImplementationOnce(() => {
            observeTerminalWrite?.()
            return pendingTerminalWrite
          })
        }

        let emitLateEvent:
          | ((payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>)
          | undefined
        let observeCompletionStart: (() => void) | undefined
        const completionStarted = new Promise<void>((resolve) => {
          observeCompletionStart = resolve
        })
        mocks.streamChat.mockImplementationOnce(
          async (
            _sessionKey: string,
            _request: unknown,
            options: {
              onEvent: (payload: {
                event: string
                data: Record<string, unknown>
              }) => Promise<void>
            },
          ) => {
            emitLateEvent = options.onEvent
            await options.onEvent({
              event: 'run.started',
              data: {
                run_id: 'deadline-run',
                session_id: 'created-session',
              },
            })
            await options.onEvent({
              event: 'assistant.delta',
              data: {
                run_id: 'deadline-run',
                session_id: 'created-session',
                delta: 'before deadline',
              },
            })
            observeCompletionStart?.()
            await options.onEvent({
              event: 'run.completed',
              data: {
                run_id: 'deadline-run',
                session_id: 'created-session',
              },
            })
          },
        )

        const response = await handler({
          request: new Request('http://workspace.test/api/send-stream', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionKey: 'created-session',
              friendlyId: 'created-session',
              message: 'hello',
            }),
          }),
        })
        const responseText = response.text()
        await completionStarted
        await terminalWriteStarted

        await vi.advanceTimersByTimeAsync(600_000)
        const events = parseEvents(await responseText)

        expect(events.some(({ event }) => event === 'done')).toBe(false)
        expect(events.at(-1)).toEqual({
          event: 'error',
          data: {
            message: 'Stream timeout',
            sessionKey: 'created-session',
          },
        })
        expect(vi.getTimerCount()).toBe(0)

        await emitLateEvent?.({
          event: 'tool.progress',
          data: {
            run_id: 'deadline-run',
            session_id: 'created-session',
            tool_name: '_thinking',
            delta: 'late parent activity',
          },
        })
        expect(mocks.setRunThinking).not.toHaveBeenCalled()

        resolveTerminalWrite?.(null)
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('keeps the shared deadline armed while producer-failure terminal persistence is pending', async () => {
    vi.useFakeTimers()
    const terminalWriteStarted = deferred<void>()
    const terminalWrite = deferred<null>()
    let responseText: Promise<string> | undefined
    try {
      mocks.markRunStatus.mockImplementationOnce(() => {
        terminalWriteStarted.resolve(undefined)
        return terminalWrite.promise
      })
      mocks.streamChat.mockImplementationOnce(
        async (
          _sessionKey: string,
          _request: unknown,
          options: {
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          await options.onEvent({
            event: 'run.started',
            data: {
              run_id: 'producer-failure-run',
              session_id: 'created-session',
            },
          })
          throw new Error('producer failed')
        },
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })
      let responseClosed = false
      responseText = response.text().then((text) => {
        responseClosed = true
        return text
      })
      await terminalWriteStarted.promise

      expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
      expect(mocks.markRunStatus).toHaveBeenCalledWith(
        'created-session',
        'producer-failure-run',
        'error',
        'producer failed',
      )

      await vi.advanceTimersByTimeAsync(600_000)
      await Promise.resolve()
      await Promise.resolve()

      expect(responseClosed).toBe(true)
      const events = parseEvents(await responseText)
      expect(events.at(-1)).toEqual({
        event: 'error',
        data: {
          message: 'Stream timeout',
          sessionKey: 'created-session',
        },
      })
      expect(mocks.markRunStatus).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      terminalWrite.resolve(null)
      await responseText
      vi.useRealTimers()
    }
  })

  it('times out and cleans up while streamChat itself remains pending', async () => {
    vi.useFakeTimers()
    try {
      let observeStreamStart: (() => void) | undefined
      const streamStarted = new Promise<void>((resolve) => {
        observeStreamStart = resolve
      })
      let emitLateEvent:
        | ((payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>)
        | undefined
      let upstreamSignal: AbortSignal | undefined
      mocks.getMessages
        .mockResolvedValueOnce([])
        .mockReturnValue(new Promise(() => undefined))
      mocks.streamChat.mockImplementationOnce(
        (
          _sessionKey: string,
          _request: unknown,
          options: {
            signal: AbortSignal
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          upstreamSignal = options.signal
          emitLateEvent = options.onEvent
          observeStreamStart?.()
          return new Promise<void>(() => undefined)
        },
      )

      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
        }),
      })
      const responseText = response.text()
      await streamStarted

      await vi.advanceTimersByTimeAsync(600_000)
      const events = parseEvents(await responseText)

      expect(upstreamSignal?.aborted).toBe(true)
      expect(events.at(-1)).toEqual({
        event: 'error',
        data: {
          message: 'Stream timeout',
          sessionKey: 'created-session',
        },
      })
      expect(mocks.appendRunText).not.toHaveBeenCalled()
      expect(mocks.markRunStatus).not.toHaveBeenCalled()
      expect(mocks.migratePersistedRun).not.toHaveBeenCalled()

      await emitLateEvent?.({
        event: 'assistant.delta',
        data: {
          run_id: 'late-run',
          session_id: 'created-session',
          delta: 'must not mutate after timeout',
        },
      })
      expect(mocks.createPersistedRun).not.toHaveBeenCalled()
      expect(mocks.appendRunText).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['request abort', 'deadline', 'consumer close'] as const)(
    'does not let a deferred handoff flush escape the stream lifetime on %s',
    async (closure) => {
      vi.useFakeTimers()
      try {
        confirmContinuation('created-session', 'successor-session')
        const flushStarted = deferred<void>()
        const pendingFlush = deferred<null>()
        mocks.appendRunText.mockImplementationOnce(() => {
          flushStarted.resolve(undefined)
          return pendingFlush.promise
        })
        mocks.streamChat.mockImplementationOnce(
          async (
            _sessionKey: string,
            _request: unknown,
            options: {
              onEvent: (payload: {
                event: string
                data: Record<string, unknown>
              }) => Promise<void>
            },
          ) => {
            await options.onEvent({
              event: 'run.started',
              data: {
                run_id: 'deferred-migration-run',
                session_id: 'created-session',
              },
            })
            await options.onEvent({
              event: 'assistant.delta',
              data: {
                run_id: 'deferred-migration-run',
                session_id: 'created-session',
                delta: 'origin text',
              },
            })
            await options.onEvent({
              event: 'assistant.delta',
              data: {
                run_id: 'deferred-migration-run',
                session_id: 'successor-session',
                delta: 'late successor text',
              },
            })
          },
        )
        const requestAbort = new AbortController()
        const response = await handler({
          request: new Request('http://workspace.test/api/send-stream', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              sessionKey: 'created-session',
              friendlyId: 'created-session',
              message: 'hello',
            }),
            signal: requestAbort.signal,
          }),
        })
        let responseClosed: Promise<unknown> = Promise.resolve()
        if (closure !== 'consumer close') {
          responseClosed = response.text()
        }
        await flushStarted.promise

        if (closure === 'request abort') requestAbort.abort()
        else if (closure === 'deadline') {
          await vi.advanceTimersByTimeAsync(600_000)
        } else {
          responseClosed = response.body!.cancel()
        }
        await Promise.resolve()

        expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)

        pendingFlush.resolve(null)
        await responseClosed
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()

        expect(mocks.migratePersistedRun).not.toHaveBeenCalled()
        expect(
          mocks.markRunStatus.mock.calls.some(
            ([sessionKey]) => sessionKey === 'successor-session',
          ),
        ).toBe(false)
        expect(vi.getTimerCount()).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('does not adopt a successor from migration that resolves after abort', async () => {
    vi.useFakeTimers()
    try {
      confirmContinuation('created-session', 'successor-session')
      const migrationStarted = deferred<void>()
      const pendingMigration = deferred<{
        sessionKey: string
        runId: string
      }>()
      mocks.migratePersistedRun.mockImplementationOnce(() => {
        migrationStarted.resolve(undefined)
        return pendingMigration.promise
      })
      mocks.streamChat.mockImplementationOnce(
        async (
          _sessionKey: string,
          _request: unknown,
          options: {
            onEvent: (payload: {
              event: string
              data: Record<string, unknown>
            }) => Promise<void>
          },
        ) => {
          await options.onEvent({
            event: 'run.started',
            data: {
              run_id: 'late-migration-run',
              session_id: 'created-session',
            },
          })
          await options.onEvent({
            event: 'assistant.delta',
            data: {
              run_id: 'late-migration-run',
              session_id: 'successor-session',
              delta: 'successor text',
            },
          })
        },
      )
      const requestAbort = new AbortController()
      const response = await handler({
        request: new Request('http://workspace.test/api/send-stream', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey: 'created-session',
            friendlyId: 'created-session',
            message: 'hello',
          }),
          signal: requestAbort.signal,
        }),
      })
      const responseClosed = response.text()
      await migrationStarted.promise

      requestAbort.abort()
      await responseClosed
      expect(mocks.migratePersistedRun).toHaveBeenCalledTimes(1)

      pendingMigration.resolve({
        sessionKey: 'successor-session',
        runId: 'late-migration-run',
      })
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(
        mocks.markRunStatus.mock.calls.some(
          ([sessionKey]) => sessionKey === 'successor-session',
        ),
      ).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the handoff stream and persistence chain alive when run migration rejects', async () => {
    mocks.resolveSessionKey.mockResolvedValueOnce({
      sessionKey: 'created-session',
    })
    confirmContinuation('created-session', 'successor-session')
    const durableRuns = new Map<
      string,
      { assistantText: string; status: string }
    >()
    mocks.createPersistedRun.mockImplementationOnce(({ sessionKey }) => {
      const run = { assistantText: '', status: 'accepted' }
      durableRuns.set(sessionKey, run)
      return Promise.resolve(run)
    })
    mocks.appendRunText.mockImplementation(
      (sessionKey, _runId, text, options) => {
        const run = durableRuns.get(sessionKey)
        if (!run) return Promise.resolve(null)
        run.assistantText = options?.replace
          ? text
          : `${run.assistantText}${text}`
        run.status = 'active'
        return Promise.resolve(run)
      },
    )
    mocks.markRunStatus.mockImplementation((sessionKey, _runId, status) => {
      const run = durableRuns.get(sessionKey)
      if (!run) return Promise.resolve(null)
      run.status = status
      return Promise.resolve(run)
    })
    mocks.migratePersistedRun.mockRejectedValueOnce(
      new Error('recovery store unavailable'),
    )
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: {
            run_id: 'run-recovery-failure',
            session_id: 'created-session',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'run-recovery-failure',
            session_id: 'created-session',
            delta: 'before handoff; ',
          },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'run-recovery-failure',
            session_id: 'successor-session',
            delta: 'after handoff',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: {
            run_id: 'run-recovery-failure',
            session_id: 'successor-session',
          },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(
      events.filter(({ event }) => event === 'chunk').map(({ data }) => data),
    ).toEqual([
      {
        text: 'before handoff; ',
        sessionKey: 'created-session',
        runId: 'run-recovery-failure',
      },
      {
        text: 'after handoff',
        sessionKey: 'successor-session',
        runId: 'run-recovery-failure',
      },
    ])
    expect(events.at(-1)).toEqual({
      event: 'done',
      data: {
        state: 'complete',
        sessionKey: 'successor-session',
        runId: 'run-recovery-failure',
      },
    })
    expect(events.some(({ event }) => event === 'error')).toBe(false)

    expect(mocks.appendRunText).toHaveBeenNthCalledWith(
      1,
      'created-session',
      'run-recovery-failure',
      'before handoff; ',
      { replace: false },
    )
    expect(mocks.appendRunText).toHaveBeenNthCalledWith(
      2,
      'created-session',
      'run-recovery-failure',
      'after handoff',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'created-session',
      'run-recovery-failure',
      'complete',
      undefined,
    )
    expect(durableRuns.get('created-session')).toEqual({
      assistantText: 'before handoff; after handoff',
      status: 'complete',
    })
    expect(durableRuns.has('successor-session')).toBe(false)
    expect(mocks.appendRunText.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.migratePersistedRun.mock.invocationCallOrder[0]!,
    )
    expect(mocks.migratePersistedRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.appendRunText.mock.invocationCallOrder[1]!,
    )
    expect(mocks.appendRunText.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.markRunStatus.mock.invocationCallOrder[0]!,
    )
  })

  it('publishes a selected local Card canonical key while sending its bootstrap-shaped upstream key', async () => {
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'local:parent-card',
        canonicalSegmentKey: 'local:main',
        continuationSegmentKeys: ['local:main'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['local:main', 'local']]),
      upstreamKeyBySegmentKey: new Map([['local:main', 'main']]),
    })
    mocks.openaiChat.mockResolvedValueOnce([
      { type: 'text', text: 'local response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'local:parent-card',
          sessionKey: 'local:main',
          friendlyId: 'local:parent-card',
          message: 'hello locally',
        }),
      }),
    })

    expect(response.status).toBe(200)
    const events = parseEvents(await response.text())
    expect(mocks.openaiChat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'hello locally' }),
      ]),
      expect.objectContaining({
        stream: true,
        sessionId: 'main',
      }),
    )
    expect(events.filter(({ event }) => event === 'chunk')).toEqual([
      {
        event: 'chunk',
        data: {
          text: 'local response',
          fullReplace: true,
          sessionKey: 'local:main',
          runId: expect.any(String),
        },
      },
    ])
    expect(events.find(({ event }) => event === 'started')).toEqual({
      event: 'started',
      data: {
        runId: expect.any(String),
        sessionKey: 'local:main',
        friendlyId: 'local:parent-card',
      },
    })
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'local:main',
      friendlyId: 'local:parent-card',
    })
    expect(JSON.stringify(events)).not.toContain('"sessionKey":"main"')
    expect(mocks.resolveLocalCardByUpstreamSession).not.toHaveBeenCalled()
    expect(mocks.streamChat).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.getMessages).not.toHaveBeenCalled()
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: expect.any(String),
      sessionKey: 'local:main',
      friendlyId: 'local:parent-card',
      cardId: 'local:parent-card',
      canonicalSegmentKey: 'local:main',
    })
  })

  it('projects selected local Card start and completion activity', async () => {
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'local:parent-card',
        canonicalSegmentKey: 'local:main',
        continuationSegmentKeys: ['local:main'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['local:main', 'local']]),
      upstreamKeyBySegmentKey: new Map([['local:main', 'main']]),
    })
    observeRootCardActivityOn('local:main')
    mocks.openaiChat.mockResolvedValueOnce([
      { type: 'text', text: 'local response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'local:parent-card',
          sessionKey: 'local:main',
          friendlyId: 'local:parent-card',
          message: 'observe local success',
        }),
      }),
    })
    const activities = parseEvents(await response.text()).filter(
      ({ event }) => event === 'card_activity',
    )

    expect(
      activities.map(({ data }) => ({
        state: data.state,
        activity: data.activity,
      })),
    ).toEqual([
      { state: 'running', activity: 'run.started' },
      { state: 'completed', activity: 'run.completed' },
    ])
    const runId = activities[0]?.data.runId
    expect(mocks.observeCardActivity.mock.calls).toEqual([
      [
        {
          cardId: 'local:parent-card',
          upstreamSessionKey: 'main',
          runId,
          state: 'running',
        },
      ],
      [
        {
          cardId: 'local:parent-card',
          upstreamSessionKey: 'main',
          runId,
          state: 'completed',
        },
      ],
    ])
    expect(mocks.publishCardActivityEvent.mock.calls).toEqual(
      activities.map(({ data }) => [data]),
    )
  })

  it('projects a selected local Card error after an authoritative start', async () => {
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'local:parent-card',
        canonicalSegmentKey: 'local:main',
        continuationSegmentKeys: ['local:main'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['local:main', 'local']]),
      upstreamKeyBySegmentKey: new Map([['local:main', 'main']]),
    })
    observeRootCardActivityOn('local:main')
    mocks.openaiChat.mockRejectedValueOnce(new Error('local producer failed'))

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'local:parent-card',
          sessionKey: 'local:main',
          friendlyId: 'local:parent-card',
          message: 'observe local failure',
        }),
      }),
    })
    const activities = parseEvents(await response.text()).filter(
      ({ event }) => event === 'card_activity',
    )

    expect(
      activities.map(({ data }) => ({
        state: data.state,
        activity: data.activity,
      })),
    ).toEqual([
      { state: 'running', activity: 'run.started' },
      { state: 'error', activity: 'error' },
    ])
    expect(mocks.publishCardActivityEvent.mock.calls).toEqual(
      activities.map(({ data }) => [data]),
    )
  })

  it('qualifies every Card-owned portable main identity while retaining raw main only for the backend call', async () => {
    mocks.getChatMode.mockReturnValue('portable')
    mocks.getLocalSession.mockReturnValue({ id: 'main' })
    mocks.resolveLocalCardByUpstreamSession.mockResolvedValueOnce({
      card: {
        cardId: 'local:main-card',
        canonicalSegmentKey: 'local:main',
        canonicalSource: 'local',
        continuationSegmentKeys: ['local:main'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['local:main', 'local']]),
      upstreamKeyBySegmentKey: new Map([['local:main', 'main']]),
    })
    mocks.openaiChat.mockResolvedValueOnce([
      {
        type: 'tool',
        name: 'read_file',
        toolCallId: 'portable-main-tool',
        status: 'completed',
        label: 'read complete',
      },
      { type: 'text', text: 'portable main response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'main',
          friendlyId: 'main',
          message: 'hello portable main',
        }),
      }),
    })

    expect(response.status).toBe(200)
    const events = parseEvents(await response.text())
    expect(mocks.openaiChat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ sessionId: 'main' }),
    )
    expect(
      events
        .filter(({ data }) => data?.sessionKey !== undefined)
        .map(({ data }) => data?.sessionKey),
    ).toEqual(['local:main', 'local:main', 'local:main', 'local:main'])
    expect(events.find(({ event }) => event === 'started')?.data).toMatchObject(
      {
        sessionKey: 'local:main',
        friendlyId: 'local:main-card',
      },
    )
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'local:main',
      friendlyId: 'local:main-card',
    })
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: expect.any(String),
      sessionKey: 'local:main',
      friendlyId: 'local:main-card',
      cardId: 'local:main-card',
      canonicalSegmentKey: 'local:main',
    })
  })

  it('preserves raw portable main identities when no authoritative local Card exists', async () => {
    mocks.getChatMode.mockReturnValue('portable')
    mocks.openaiChat.mockResolvedValueOnce([
      { type: 'text', text: 'legacy portable response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'main',
          friendlyId: 'main',
          message: 'hello legacy portable main',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(
      events
        .filter(({ data }) => data?.sessionKey !== undefined)
        .map(({ data }) => data?.sessionKey),
    ).toEqual(['main', 'main', 'main'])
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'main',
      friendlyId: 'main',
    })
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: expect.any(String),
      sessionKey: 'main',
      friendlyId: 'main',
    })
  })

  it('converges a portable new bootstrap through a fresh local parent Card before starting the run', async () => {
    mocks.getChatMode.mockReturnValue('portable')
    mocks.resolveLocalCardByUpstreamSession.mockImplementationOnce(
      (upstreamSessionKey: string) =>
        Promise.resolve({
          card: {
            cardId: 'local:created-card',
            canonicalSegmentKey: 'local:created-segment',
            canonicalSource: 'local',
            continuationSegmentKeys: ['local:created-segment'],
            relationshipKind: 'root',
          },
          collection: { completeness: 'complete' },
          sourceBySegmentKey: new Map([['local:created-segment', 'local']]),
          upstreamKeyBySegmentKey: new Map([
            ['local:created-segment', upstreamSessionKey],
          ]),
        }),
    )
    mocks.openaiChat.mockResolvedValueOnce([
      { type: 'text', text: 'portable response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello portably',
        }),
      }),
    })

    expect(response.status).toBe(200)
    const events = parseEvents(await response.text())
    const generatedUpstreamKey = mocks.ensureLocalSession.mock.calls[0]?.[0]
    expect(generatedUpstreamKey).toEqual(expect.any(String))
    expect(generatedUpstreamKey).not.toBe('new')
    expect(mocks.resolveLocalCardByUpstreamSession).toHaveBeenCalledWith(
      generatedUpstreamKey,
    )
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'new',
      friendlyId: 'new',
    })
    expect(events.slice(0, 2)).toEqual([
      {
        event: 'session_handoff',
        data: {
          fromSessionKey: 'new',
          sessionKey: 'local:created-segment',
          friendlyId: 'local:created-card',
          runId: expect.any(String),
          verifiedCardAuthority: {
            cardId: 'local:created-card',
            canonicalSource: 'local',
            canonicalSegmentKey: 'local:created-segment',
            continuationSegmentKeys: ['local:created-segment'],
            relationshipKind: 'root',
          },
        },
      },
      {
        event: 'started',
        data: {
          runId: expect.any(String),
          sessionKey: 'local:created-segment',
          friendlyId: 'local:created-card',
        },
      },
    ])
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: expect.any(String),
      sessionKey: 'local:created-segment',
      friendlyId: 'local:created-card',
      cardId: 'local:created-card',
      canonicalSegmentKey: 'local:created-segment',
    })
    expect(mocks.openaiChat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ sessionId: generatedUpstreamKey }),
    )
    expect(JSON.stringify(events)).not.toContain(generatedUpstreamKey)
  })

  it('keeps portable new on bootstrap identity and skips raw run persistence when no authoritative local Card is available', async () => {
    mocks.getChatMode.mockReturnValue('portable')
    mocks.openaiChat.mockResolvedValueOnce([
      { type: 'text', text: 'portable response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello portably',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    const generatedUpstreamKey = mocks.ensureLocalSession.mock.calls[0]?.[0]
    expect(events.some(({ event }) => event === 'session_handoff')).toBe(false)
    expect(
      events
        .map(({ data }) => data?.sessionKey)
        .filter((sessionKey) => sessionKey !== undefined),
    ).toEqual(['new', 'new', 'new'])
    expect(JSON.stringify(events)).not.toContain(generatedUpstreamKey)
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'new',
      friendlyId: 'new',
    })
  })

  it.each([
    [
      'incomplete projection',
      {
        card: {
          cardId: 'local:created-card',
          canonicalSegmentKey: 'local:created-segment',
          canonicalSource: 'local',
          continuationSegmentKeys: ['local:created-segment'],
          relationshipKind: 'root',
        },
        collection: { completeness: 'incomplete' },
        sourceBySegmentKey: new Map([['local:created-segment', 'local']]),
        upstreamKeyBySegmentKey: new Map([
          ['local:created-segment', 'generated-upstream'],
        ]),
      },
    ],
    [
      'child Card',
      {
        card: {
          cardId: 'local:created-child',
          canonicalSegmentKey: 'local:created-segment',
          canonicalSource: 'local',
          continuationSegmentKeys: ['local:created-segment'],
          relationshipKind: 'child',
          parentCardId: 'local:parent',
        },
        collection: { completeness: 'complete' },
        sourceBySegmentKey: new Map([['local:created-segment', 'local']]),
        upstreamKeyBySegmentKey: new Map([
          ['local:created-segment', 'generated-upstream'],
        ]),
      },
    ],
    [
      'non-local canonical source',
      {
        card: {
          cardId: 'remote:created-card',
          canonicalSegmentKey: 'remote:created-segment',
          canonicalSource: 'remote',
          continuationSegmentKeys: ['remote:created-segment'],
          relationshipKind: 'root',
        },
        collection: { completeness: 'complete' },
        sourceBySegmentKey: new Map([['remote:created-segment', 'remote']]),
        upstreamKeyBySegmentKey: new Map([
          ['remote:created-segment', 'generated-upstream'],
        ]),
      },
    ],
  ])('fails closed for a portable bootstrap %s', async (_label, candidate) => {
    mocks.getChatMode.mockReturnValue('portable')
    mocks.resolveLocalCardByUpstreamSession.mockImplementationOnce(
      (upstreamSessionKey: string) =>
        Promise.resolve({
          ...candidate,
          upstreamKeyBySegmentKey: new Map(
            [...candidate.upstreamKeyBySegmentKey].map(
              ([segmentKey, mappedUpstreamKey]) => [
                segmentKey,
                mappedUpstreamKey === 'generated-upstream'
                  ? upstreamSessionKey
                  : mappedUpstreamKey,
              ],
            ),
          ),
        }),
    )
    mocks.openaiChat.mockResolvedValueOnce([
      { type: 'text', text: 'portable response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'new',
          friendlyId: 'new',
          message: 'hello portably',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    const generatedUpstreamKey = mocks.ensureLocalSession.mock.calls[0]?.[0]
    expect(events.some(({ event }) => event === 'session_handoff')).toBe(false)
    expect(JSON.stringify(events)).not.toContain(generatedUpstreamKey)
    expect(mocks.createPersistedRun).not.toHaveBeenCalled()
  })

  it('qualifies portable main after resolving its authoritative local Card identity', async () => {
    mocks.getChatMode.mockReturnValue('portable')
    mocks.getLocalSession.mockReturnValue({ id: 'main' })
    mocks.resolveLocalCardByUpstreamSession.mockResolvedValueOnce({
      card: {
        cardId: 'local:main-card',
        canonicalSegmentKey: 'local:main',
        canonicalSource: 'local',
        continuationSegmentKeys: ['local:main'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['local:main', 'local']]),
      upstreamKeyBySegmentKey: new Map([['local:main', 'main']]),
    })
    mocks.openaiChat.mockResolvedValueOnce([
      { type: 'text', text: 'portable response' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey: 'main',
          friendlyId: 'main',
          message: 'hello main',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.some(({ event }) => event === 'session_handoff')).toBe(false)
    expect(events.find(({ event }) => event === 'started')).toEqual({
      event: 'started',
      data: {
        runId: expect.any(String),
        sessionKey: 'local:main',
        friendlyId: 'local:main-card',
      },
    })
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: expect.any(String),
      sessionKey: 'local:main',
      friendlyId: 'local:main-card',
      cardId: 'local:main-card',
      canonicalSegmentKey: 'local:main',
    })
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'local:main',
      friendlyId: 'local:main-card',
    })
  })

  it('publishes a remote Card canonical key while keeping its locally discovered model on gateway transport', async () => {
    mocks.getChatMode.mockReturnValue('portable')
    mocks.resolveSessionCard.mockResolvedValue({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:session',
        continuationSegmentKeys: ['remote:session'],
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map([['remote:session', 'gateway']]),
      upstreamKeyBySegmentKey: new Map([['remote:session', 'session']]),
    })
    mocks.getDiscoveredModels.mockReturnValue([
      { id: 'local-model', provider: 'ollama' },
    ])
    mocks.getLocalProviderDef.mockReturnValue({
      baseUrl: 'http://localhost:11434/v1',
    })
    mocks.streamChat.mockImplementationOnce(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe('session')
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'remote-run', session_id: 'session' },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'remote-run', session_id: 'session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:session',
          friendlyId: 'remote:parent-card',
          model: 'local-model',
          message: 'stay remote',
        }),
      }),
    })

    expect(response.status).toBe(200)
    const events = parseEvents(await response.text())
    expect(events.find(({ event }) => event === 'started')).toEqual({
      event: 'started',
      data: {
        runId: 'remote-run',
        sessionKey: 'remote:session',
        friendlyId: 'remote:parent-card',
      },
    })
    expect(mocks.buildResolvedSessionHeaders).toHaveBeenCalledWith({
      sessionKey: 'remote:session',
      friendlyId: 'remote:parent-card',
    })
    expect(JSON.stringify(events)).not.toContain('"sessionKey":"session"')
    expect(mocks.streamChat).toHaveBeenCalledTimes(1)
    expect(mocks.openaiChat).not.toHaveBeenCalled()
  })

  it('translates projected Card keys for upstream send and same-Card handoff', async () => {
    const card = (
      canonicalSegmentKey: string,
      continuationSegmentKeys: Array<string>,
      upstreamEntries: Array<[string, string]>,
    ) => ({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey,
        continuationSegmentKeys,
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map(
        upstreamEntries.map(([segmentKey]) => [segmentKey, 'gateway']),
      ),
      upstreamKeyBySegmentKey: new Map(upstreamEntries),
    })
    mocks.resolveSessionCard
      .mockResolvedValueOnce(
        card(
          'remote:created-session',
          ['remote:created-session'],
          [['remote:created-session', 'created-session']],
        ),
      )
      .mockResolvedValue(
        card(
          'remote:successor-session',
          ['remote:created-session', 'remote:successor-session'],
          [
            ['remote:created-session', 'created-session'],
            ['remote:successor-session', 'successor-session'],
          ],
        ),
      )
    mocks.streamChat.mockImplementationOnce(
      async (
        sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        expect(sessionKey).toBe('created-session')
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'card-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'card-run',
            session_id: 'successor-session',
            delta: 'continued response',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'card-run', session_id: 'successor-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:created-session',
          friendlyId: 'remote:parent-card',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(mocks.resolveSessionKey).not.toHaveBeenCalled()
    expect(mocks.resolveSessionCard).toHaveBeenNthCalledWith(
      1,
      'remote:parent-card',
    )
    expect(mocks.streamChat).toHaveBeenCalledTimes(1)
    expect(mocks.openaiChat).not.toHaveBeenCalled()
    expect(events.filter(({ event }) => event === 'card_handoff')).toEqual([
      {
        event: 'card_handoff',
        data: {
          cardId: 'remote:parent-card',
          fromSegmentKey: 'remote:created-session',
          canonicalSegmentKey: 'remote:successor-session',
          runId: 'card-run',
          verifiedContinuationSegmentKeys: [
            'remote:created-session',
            'remote:successor-session',
          ],
        },
      },
    ])
    expect(events.filter(({ event }) => event === 'session_handoff')).toEqual(
      [],
    )
    expect(mocks.createPersistedRun).toHaveBeenCalledWith({
      runId: 'card-run',
      sessionKey: 'remote:created-session',
      friendlyId: 'remote:parent-card',
      cardId: 'remote:parent-card',
      canonicalSegmentKey: 'remote:created-session',
    })
    expect(mocks.migratePersistedRun).toHaveBeenCalledWith(
      'remote:created-session',
      'remote:successor-session',
      'card-run',
      'remote:parent-card',
      {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:successor-session',
      },
    )
  })

  it('keeps a rejected Card migration recoverable without disrupting the handoff stream', async () => {
    const card = (
      canonicalSegmentKey: string,
      continuationSegmentKeys: Array<string>,
      upstreamEntries: Array<[string, string]>,
    ) => ({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey,
        continuationSegmentKeys,
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map(
        upstreamEntries.map(([segmentKey]) => [segmentKey, 'gateway']),
      ),
      upstreamKeyBySegmentKey: new Map(upstreamEntries),
    })
    mocks.resolveSessionCard
      .mockResolvedValueOnce(
        card(
          'remote:created-session',
          ['remote:created-session'],
          [['remote:created-session', 'created-session']],
        ),
      )
      .mockResolvedValue(
        card(
          'remote:successor-session',
          ['remote:created-session', 'remote:successor-session'],
          [
            ['remote:created-session', 'created-session'],
            ['remote:successor-session', 'successor-session'],
          ],
        ),
      )
    mocks.migratePersistedRun.mockRejectedValueOnce(
      new Error('forced Card migration rejection'),
    )
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'card-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'card-run',
            session_id: 'successor-session',
            delta: 'continued response',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'card-run', session_id: 'successor-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:created-session',
          friendlyId: 'remote:parent-card',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.filter(({ event }) => event === 'card_handoff')).toEqual([
      {
        event: 'card_handoff',
        data: {
          cardId: 'remote:parent-card',
          fromSegmentKey: 'remote:created-session',
          canonicalSegmentKey: 'remote:successor-session',
          runId: 'card-run',
          verifiedContinuationSegmentKeys: [
            'remote:created-session',
            'remote:successor-session',
          ],
        },
      },
    ])
    expect(events.at(-1)).toEqual({
      event: 'done',
      data: {
        state: 'complete',
        sessionKey: 'remote:successor-session',
        runId: 'card-run',
      },
    })
    expect(mocks.migratePersistedRun).toHaveBeenCalledWith(
      'remote:created-session',
      'remote:successor-session',
      'card-run',
      'remote:parent-card',
      {
        cardId: 'remote:parent-card',
        canonicalSegmentKey: 'remote:successor-session',
      },
    )
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'remote:created-session',
      'card-run',
      'continued response',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'remote:created-session',
      'card-run',
      'complete',
      undefined,
    )
    expect(mocks.migratePersistedRun.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.appendRunText.mock.invocationCallOrder[0]!,
    )
    expect(mocks.appendRunText.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.markRunStatus.mock.invocationCallOrder[0]!,
    )
  })

  it('does not persist Card stream content into an incompatible migrated run owner', async () => {
    const card = (
      canonicalSegmentKey: string,
      continuationSegmentKeys: Array<string>,
      upstreamEntries: Array<[string, string]>,
    ) => ({
      card: {
        cardId: 'remote:parent-card',
        canonicalSegmentKey,
        continuationSegmentKeys,
        relationshipKind: 'root',
      },
      collection: { completeness: 'complete' },
      sourceBySegmentKey: new Map(
        upstreamEntries.map(([segmentKey]) => [segmentKey, 'gateway']),
      ),
      upstreamKeyBySegmentKey: new Map(upstreamEntries),
    })
    mocks.resolveSessionCard
      .mockResolvedValueOnce(
        card(
          'remote:created-session',
          ['remote:created-session'],
          [['remote:created-session', 'created-session']],
        ),
      )
      .mockResolvedValue(
        card(
          'remote:successor-session',
          ['remote:created-session', 'remote:successor-session'],
          [
            ['remote:created-session', 'created-session'],
            ['remote:successor-session', 'successor-session'],
          ],
        ),
      )
    mocks.migratePersistedRun.mockResolvedValueOnce({
      runId: 'card-run',
      sessionKey: 'remote:successor-session',
      friendlyId: 'remote:other-card',
      cardId: 'remote:other-card',
      canonicalSegmentKey: 'remote:successor-session',
    })
    mocks.streamChat.mockImplementationOnce(
      async (
        _sessionKey: string,
        _request: unknown,
        options: {
          onEvent: (payload: {
            event: string
            data: Record<string, unknown>
          }) => Promise<void>
        },
      ) => {
        await options.onEvent({
          event: 'run.started',
          data: { run_id: 'card-run', session_id: 'created-session' },
        })
        await options.onEvent({
          event: 'assistant.delta',
          data: {
            run_id: 'card-run',
            session_id: 'successor-session',
            delta: 'parent-only response',
          },
        })
        await options.onEvent({
          event: 'run.completed',
          data: { run_id: 'card-run', session_id: 'successor-session' },
        })
      },
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/send-stream', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardId: 'remote:parent-card',
          sessionKey: 'remote:created-session',
          friendlyId: 'remote:parent-card',
          message: 'hello',
        }),
      }),
    })

    const events = parseEvents(await response.text())
    expect(events.at(-1)).toEqual({
      event: 'done',
      data: {
        state: 'complete',
        sessionKey: 'remote:successor-session',
        runId: 'card-run',
      },
    })
    expect(mocks.appendRunText).toHaveBeenCalledWith(
      'remote:created-session',
      'card-run',
      'parent-only response',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'remote:created-session',
      'card-run',
      'complete',
      undefined,
    )
    expect(
      mocks.appendRunText.mock.calls.some(
        (call) => call[0] === 'remote:successor-session',
      ),
    ).toBe(false)
    expect(
      mocks.markRunStatus.mock.calls.some(
        (call) => call[0] === 'remote:successor-session',
      ),
    ).toBe(false)
  })
})
