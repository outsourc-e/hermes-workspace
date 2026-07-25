import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './send-stream'
import type * as RunStore from '../../server/run-store'

const mocks = vi.hoisted(() => ({
  resolveSessionKey: vi.fn(),
  createSession: vi.fn(),
  streamChat: vi.fn(),
  getMessages: vi.fn(),
  appendRunText: vi.fn(),
  createPersistedRun: vi.fn(),
  migratePersistedRun: vi.fn(),
  markRunStatus: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../lib/send-stream-session-headers', () => ({
  buildResolvedSessionHeaders: () => ({}),
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
  publishChatEvent: vi.fn(),
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
    markRunStatus: mocks.markRunStatus,
    setRunThinking: vi.fn(),
    upsertRunToolCall: vi.fn(),
  }
})

vi.mock('../../server/gateway-capabilities', () => ({
  getChatMode: () => 'enhanced',
}))

vi.mock('../../server/local-session-store', () => ({
  appendLocalMessage: vi.fn(),
  ensureLocalSession: vi.fn(),
  getLocalMessages: vi.fn(() => []),
  touchLocalSession: vi.fn(),
}))

vi.mock('../../server/local-provider-discovery', () => ({
  getDiscoveredModels: () => [],
  getLocalProviderDef: () => undefined,
}))

vi.mock('../../server/openai-compat-api', () => ({
  openaiChat: vi.fn(),
}))

vi.mock('../../server/responses-api', () => ({
  streamResponses: vi.fn(),
}))

vi.mock('../../server/portable-history', () => ({
  selectPortableConversationHistory: vi.fn(() => []),
}))

vi.mock('../../server/claude-api', () => ({
  SESSIONS_API_UNAVAILABLE_MESSAGE: 'sessions unavailable',
  createSession: mocks.createSession,
  ensureGatewayProbed: vi.fn().mockResolvedValue(undefined),
  getGatewayCapabilities: () => ({ sessions: true }),
  getMessages: mocks.getMessages,
  listSessions: vi.fn().mockResolvedValue([]),
  streamChat: mocks.streamChat,
}))

vi.mock('./workspace', () => ({
  loadWorkspaceCatalog: vi.fn().mockResolvedValue(null),
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

describe('send-stream bootstrap session handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveSessionKey.mockImplementation(
      ({ rawSessionKey }: { rawSessionKey: string }) =>
        Promise.resolve({ sessionKey: rawSessionKey }),
    )
    mocks.createSession.mockResolvedValue({ id: 'created-session' })
    mocks.getMessages.mockResolvedValue([])
    mocks.appendRunText.mockResolvedValue(null)
    mocks.createPersistedRun.mockResolvedValue(undefined)
    mocks.migratePersistedRun.mockResolvedValue(undefined)
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

  it.each(['new', 'main'])(
    'emits the pre-stream %s-to-concrete handoff before ordinary stream events',
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
      expect(events[0]).toEqual({
        event: 'session_handoff',
        data: {
          fromSessionKey: bootstrapSessionKey,
          sessionKey: 'created-session',
          friendlyId: 'created-session',
          runId: null,
        },
      })
      expect(
        events.filter(({ event }) => event === 'session_handoff'),
      ).toHaveLength(1)
      expect(events.some(({ event }) => event === 'started')).toBe(true)
    },
  )

  it('migrates a persisted run when an authoritative successor arrives after run start', async () => {
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
  })

  it('keeps the handoff stream and persistence chain alive when run migration rejects', async () => {
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
      'successor-session',
      'run-recovery-failure',
      'after handoff',
      { replace: false },
    )
    expect(mocks.markRunStatus).toHaveBeenCalledWith(
      'successor-session',
      'run-recovery-failure',
      'complete',
      undefined,
    )
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
})
