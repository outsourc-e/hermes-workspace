import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authenticated: true,
  ensureGatewayProbed: vi.fn(),
  execFileSync: vi.fn(() =>
    JSON.stringify({
      sessionCount: 47,
      messageCount: 912,
      toolCallCount: 77,
      totalTokens: 123456,
      estimatedCostUsd: 42.5,
      lastSessionTitle: 'RAW STATE DB SESSION TITLE',
      lastSessionAt: 1700000000,
    }),
  ),
}))

vi.mock('node:fs', () => ({
  existsSync: (target: string) =>
    [
      '/mock/root/profiles',
      '/mock/home',
      '/mock/home/state.db',
      '/mock/home/gateway_state.json',
      '/mock/home/config.yaml',
      '/mock/home/cron/jobs.json',
    ].includes(String(target)),
  readFileSync: (target: string) => {
    if (target === '/mock/home/gateway_state.json') {
      return JSON.stringify({
        pid: null,
        gateway_state: 'running',
        platforms: {
          telegram: {
            state: 'connected',
            updatedAt: '2026-07-27T00:00:00Z',
          },
        },
      })
    }
    if (target === '/mock/home/config.yaml') {
      return 'model: test-model\nprovider: test-provider\n'
    }
    if (target === '/mock/home/cron/jobs.json') {
      return JSON.stringify([{ id: 'daily' }, { id: 'weekly' }])
    }
    throw new Error(`Unexpected read: ${target}`)
  },
  readdirSync: () => [],
  statSync: () => ({ isDirectory: () => true }),
}))

vi.mock('node:child_process', () => ({
  execFileSync: mocks.execFileSync,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (options: unknown) => options,
}))

vi.mock('@tanstack/react-start', () => ({
  json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => mocks.authenticated,
}))

vi.mock('../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  CLAUDE_API: 'http://gateway.test',
  ensureGatewayProbed: mocks.ensureGatewayProbed,
}))

vi.mock('../../server/claude-paths', () => ({
  getClaudeRoot: () => '/mock/root',
  getProfileClaudeHome: (profile: string) => `/mock/root/profiles/${profile}`,
  getWorkspaceClaudeHome: () => '/mock/home',
}))

vi.mock('../../server/swarm-roster', () => ({
  formatSwarmWorkerLabel: (profile: string) => profile,
  rosterByWorkerId: () => new Map(),
}))

async function getHandler() {
  vi.resetModules()
  const { Route } = await import('./crew-status')
  return (
    Route as unknown as {
      server: {
        handlers: { GET: (ctx: { request: Request }) => Promise<Response> }
      }
    }
  ).server.handlers.GET
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authenticated = true
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        tasks: [
          { assignee: 'workspace', column: 'in_progress' },
          { assignee: 'workspace', column: 'done' },
        ],
      }),
    ),
  )
})

describe('GET /api/crew-status', () => {
  it('requires Workspace authentication before profile inspection', async () => {
    mocks.authenticated = false
    const handler = await getHandler()

    const response = await handler({
      request: new Request('http://workspace.test/api/crew-status'),
    })

    expect(response.status).toBe(401)
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.execFileSync).not.toHaveBeenCalled()
  })

  it('returns profile health/control data without reading or exposing state.db activity', async () => {
    const handler = await getHandler()

    const response = await handler({
      request: new Request('http://workspace.test/api/crew-status'),
    })
    const body = (await response.json()) as {
      crew: Array<Record<string, unknown>>
      fetchedAt: number
    }

    expect(response.status).toBe(200)
    expect(body.crew).toHaveLength(1)
    expect(body.crew[0]).toMatchObject({
      id: 'workspace',
      displayName: 'Workspace',
      profileFound: true,
      gatewayState: 'running',
      processAlive: false,
      model: 'test-model',
      provider: 'test-provider',
      cronJobCount: 2,
      assignedTaskCount: 1,
    })
    expect(mocks.execFileSync).not.toHaveBeenCalled()
    expect(Object.keys(body.crew[0] ?? {})).not.toEqual(
      expect.arrayContaining([
        'lastSessionTitle',
        'lastSessionAt',
        'sessionCount',
        'messageCount',
        'toolCallCount',
        'totalTokens',
        'estimatedCostUsd',
      ]),
    )
  })
})
