import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './sessions'
import type {
  ClaudeSession,
  ClaudeSessionSummary,
} from '../../server/claude-api'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: vi.fn(),
  listSessions: vi.fn(),
  toSessionSummary: vi.fn(),
  listLocalSessions: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../server/claude-api', () => ({
  SESSIONS_API_UNAVAILABLE_MESSAGE: 'Sessions unavailable',
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  ensureGatewayProbed: mocks.ensureGatewayProbed,
  getGatewayCapabilities: mocks.getGatewayCapabilities,
  listSessions: mocks.listSessions,
  toSessionSummary: mocks.toSessionSummary,
  updateSession: vi.fn(),
}))

vi.mock('../../server/local-session-store', () => ({
  deleteLocalSession: vi.fn(),
  getLocalSession: vi.fn(),
  listLocalSessions: mocks.listLocalSessions,
  updateLocalSessionTitle: vi.fn(),
}))

type GetHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { GET: GetHandler } } }

const handler = (Route as unknown as TestRoute).server.handlers.GET

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAuthenticated.mockReturnValue(true)
  mocks.ensureGatewayProbed.mockResolvedValue({ sessions: true })
  mocks.getGatewayCapabilities.mockReturnValue({ sessions: true })
  mocks.listLocalSessions.mockReturnValue([])
  mocks.toSessionSummary.mockImplementation(
    (raw: ClaudeSession): ClaudeSessionSummary => ({
      key: raw.id,
      friendlyId: raw.id,
      updatedAt: (raw.last_active ?? raw.started_at ?? 0) * 1_000,
      source: raw.source,
      lineage:
        raw.parent_session_id ||
        raw.relationship_type ||
        raw.session_source ||
        raw.end_reason ||
        raw.source
          ? {
              ...(raw.parent_session_id
                ? { parentSessionId: raw.parent_session_id }
                : {}),
              ...(raw.relationship_type
                ? { relationshipType: raw.relationship_type }
                : {}),
              ...(raw.session_source
                ? { sessionSource: raw.session_source }
                : {}),
              ...(raw.end_reason ? { endReason: raw.end_reason } : {}),
              ...(raw.source ? { source: raw.source } : {}),
              ...(typeof raw.started_at === 'number'
                ? { startedAt: raw.started_at * 1_000 }
                : {}),
              ...(typeof raw.ended_at === 'number'
                ? { endedAt: raw.ended_at * 1_000 }
                : {}),
            }
          : undefined,
    }),
  )
})

describe('GET /api/sessions lineage projection', () => {
  it('emits server-classified relationshipKind values and local roots', async () => {
    mocks.listSessions.mockResolvedValue([
      {
        id: 'parent',
        source: 'cli',
        ended_at: 2,
        end_reason: 'compression',
      },
      {
        id: 'continuation',
        source: 'cli',
        started_at: 2.001,
        parent_session_id: 'parent',
      },
      {
        id: 'fork',
        parent_session_id: 'parent',
        session_source: 'fork',
      },
      {
        id: 'child',
        parent_session_id: 'parent',
        relationship_type: 'child_session',
      },
      { id: 'orphan', parent_session_id: 'missing' },
    ] satisfies Array<ClaudeSession>)
    mocks.listLocalSessions.mockReturnValue([
      {
        id: 'local',
        title: 'Local Chat',
        createdAt: 1,
        updatedAt: 2,
        messageCount: 0,
        model: 'local-model',
      },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/sessions'),
    })
    const body = (await response.json()) as {
      sessions: Array<{
        key: string
        lineage?: { relationshipKind?: string }
      }>
    }

    expect(response.status).toBe(200)
    expect(
      Object.fromEntries(
        body.sessions.map((row) => [row.key, row.lineage?.relationshipKind]),
      ),
    ).toEqual({
      parent: 'root',
      continuation: 'continuation',
      fork: 'branch',
      child: 'child',
      orphan: 'orphan',
      local: 'root',
    })
  })
})
