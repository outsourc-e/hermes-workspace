import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './send-stream'
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
    setRunThinking: mocks.setRunThinking,
    upsertRunToolCall: mocks.upsertRunToolCall,
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
    mocks.getMessages.mockResolvedValue([])
    mocks.appendRunText.mockResolvedValue(null)
    mocks.createPersistedRun.mockResolvedValue(undefined)
    mocks.migratePersistedRun.mockImplementation(
      (_fromSessionKey, toSessionKey, runId) =>
        Promise.resolve({
          sessionKey: toSessionKey,
          runId,
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

  it('invalidates an origin poll and terminally backfills successor-only tool activity after handoff', async () => {
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
        const responseText = response.text()

        await vi.advanceTimersByTimeAsync(600_000)
        const events = parseEvents(await responseText)

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
          const pending = deferred<string>()
          vi.spyOn(request, 'text').mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () =>
            pending.resolve(
              JSON.stringify({
                sessionKey: 'created-session',
                friendlyId: 'created-session',
                message: 'hello',
              }),
            )
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
          const pending = deferred<string>()
          vi.spyOn(request, 'text').mockImplementationOnce(() => {
            phaseStarted.resolve(undefined)
            return pending.promise
          })
          releasePhase = () =>
            pending.resolve(
              JSON.stringify({
                sessionKey: 'created-session',
                friendlyId: 'created-session',
                message: 'hello',
              }),
            )
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
})
