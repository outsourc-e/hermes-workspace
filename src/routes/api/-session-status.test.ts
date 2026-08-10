import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './session-status'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  getGatewayCapabilities: vi.fn(),
  getSession: vi.fn(),
  getConfig: vi.fn(),
  resolveCard: vi.fn(),
  getLocalSession: vi.fn(),
  getActiveRunForSession: vi.fn(),
  readContextUsage: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../server/claude-api', () => ({
  ensureGatewayProbed: mocks.ensureGatewayProbed,
  getGatewayCapabilities: mocks.getGatewayCapabilities,
  getSession: mocks.getSession,
  getConfig: mocks.getConfig,
}))

vi.mock('../../server/session-card-service', () => ({
  sessionCardService: { resolveCard: mocks.resolveCard },
}))

vi.mock('../../server/local-session-store', () => ({
  getLocalSession: mocks.getLocalSession,
}))

vi.mock('../../server/run-store', () => ({
  getActiveRunForSession: mocks.getActiveRunForSession,
}))

vi.mock('../../server/context-usage', () => ({
  readContextUsage: mocks.readContextUsage,
}))

type GetHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { GET: GetHandler } } }

const handler = (Route as unknown as TestRoute).server.handlers.GET

function resolvedRemoteCard() {
  return {
    card: {
      cardId: 'card:alpha',
      canonicalSource: 'remote',
      canonicalTransport: 'gateway',
      title: 'Release planning',
      titleSource: 'manual',
      canonicalSegmentKey: 'remote:tip',
      continuationSegmentKeys: ['remote:root', 'remote:tip'],
      continuationCount: 2,
      relationshipKind: 'root',
      childNodes: [],
      activity: { state: 'running', updatedAt: 50 },
      updatedAt: 50,
      archived: false,
      pinned: false,
    },
    aliases: ['card:alpha'],
    sourceBySegmentKey: new Map([
      ['remote:root', 'gateway'],
      ['remote:tip', 'gateway'],
    ]),
    upstreamKeyBySegmentKey: new Map([
      ['remote:root', 'raw-root-secret'],
      ['remote:tip', 'raw-tip-secret'],
    ]),
    collection: { completeness: 'complete', retryable: false, sources: [] },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAuthenticated.mockReturnValue(true)
  mocks.ensureGatewayProbed.mockResolvedValue(undefined)
  mocks.getGatewayCapabilities.mockReturnValue({
    sessions: true,
    config: true,
    dashboard: { available: false },
  })
  mocks.getConfig.mockResolvedValue({ model: 'gpt-4.1', provider: 'openai' })
  mocks.resolveCard.mockResolvedValue(resolvedRemoteCard())
  mocks.readContextUsage.mockImplementation((key: string) =>
    Promise.resolve({
      model: key === 'raw-tip-secret' ? 'gpt-4.1' : 'gpt-4o',
      contextPercent: key === 'raw-tip-secret' ? 35 : 20,
      maxTokens: 1000,
      usedTokens: key === 'raw-tip-secret' ? 350 : 200,
    }),
  )
  mocks.getSession.mockImplementation((key: string) =>
    Promise.resolve({
      id: key,
      model: key === 'raw-tip-secret' ? 'gpt-4.1' : 'gpt-4o',
      input_tokens: key === 'raw-tip-secret' ? 30 : 10,
      output_tokens: key === 'raw-tip-secret' ? 12 : 4,
    }),
  )
  mocks.getLocalSession.mockReturnValue(null)
  mocks.getActiveRunForSession.mockResolvedValue(null)
})

describe('GET /api/session-status Card projection', () => {
  it('serializes only Card-native identity and aggregates proven Card segments', async () => {
    const response = await handler({
      request: new Request(
        'http://workspace.test/api/session-status?cardId=card%3Aalpha',
      ),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      ok: true,
      payload: {
        cards: [
          {
            cardId: 'card:alpha',
            title: 'Release planning',
            canonicalSource: 'remote',
            state: 'running',
            updatedAt: 50,
            usage: {
              model: 'gpt-4.1',
              modelProvider: 'openai',
              inputTokens: 40,
              outputTokens: 16,
              totalTokens: 56,
              contextPercent: 35,
              maxTokens: 2000,
              usedTokens: 550,
            },
          },
        ],
      },
    })

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('raw-root-secret')
    expect(serialized).not.toContain('raw-tip-secret')
    expect(serialized).not.toContain('sessionKey')
    expect(serialized).not.toContain('sessionLabel')
    expect(serialized).not.toContain('segment')
  })

  it('projects only the latest continuation segment when the Context Window scope is requested', async () => {
    const response = await handler({
      request: new Request(
        'http://workspace.test/api/session-status?cardId=card%3Aalpha&usageScope=latest-continuation',
      ),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.payload.cards[0].usage).toEqual({
      model: 'gpt-4.1',
      modelProvider: 'openai',
      inputTokens: 30,
      outputTokens: 12,
      totalTokens: 42,
      contextPercent: 35,
      maxTokens: 1000,
      usedTokens: 350,
    })
    expect(mocks.getSession).toHaveBeenCalledTimes(1)
    expect(mocks.getSession).toHaveBeenCalledWith('raw-tip-secret')
  })

  it('omits a source-mismatched record instead of leaking or aggregating it', async () => {
    const resolved = resolvedRemoteCard()
    resolved.sourceBySegmentKey.set('remote:tip', 'dashboard')
    mocks.resolveCard.mockResolvedValue(resolved)

    const response = await handler({
      request: new Request(
        'http://workspace.test/api/session-status?cardId=card%3Aalpha',
      ),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.payload.cards[0].usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
      usedTokens: 200,
    })
    expect(mocks.getSession).not.toHaveBeenCalledWith('raw-tip-secret')
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('raw-tip-secret')
    expect(serialized).not.toContain('dashboard')
  })

  it('rejects an upstream identity mismatch without exposing either raw identity', async () => {
    mocks.getSession.mockImplementation((key: string) =>
      Promise.resolve({
        id: key === 'raw-tip-secret' ? 'foreign-session-secret' : key,
        model: 'gpt-4o',
        input_tokens: key === 'raw-tip-secret' ? 999 : 10,
        output_tokens: key === 'raw-tip-secret' ? 999 : 4,
      }),
    )

    const response = await handler({
      request: new Request(
        'http://workspace.test/api/session-status?cardId=card%3Aalpha',
      ),
    })

    const body = await response.json()
    expect(body.payload.cards[0].usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('raw-tip-secret')
    expect(serialized).not.toContain('foreign-session-secret')
  })

  it('does not accept the retired raw sessionKey query shape', async () => {
    const response = await handler({
      request: new Request(
        'http://workspace.test/api/session-status?sessionKey=raw-tip-secret',
      ),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, payload: { cards: [] } })
    expect(mocks.resolveCard).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it.each(['main', 'new'])(
    'treats the legacy %s bootstrap alias as aggregate status',
    async (cardId) => {
      const response = await handler({
        request: new Request(
          `http://workspace.test/api/session-status?cardId=${cardId}`,
        ),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        ok: true,
        payload: { cards: [] },
      })
      expect(mocks.resolveCard).not.toHaveBeenCalled()
      expect(mocks.getSession).not.toHaveBeenCalled()
    },
  )

  it('continues rejecting unknown Card IDs', async () => {
    mocks.resolveCard.mockRejectedValue(new Error('missing Card'))

    const response = await handler({
      request: new Request(
        'http://workspace.test/api/session-status?cardId=unknown-card',
      ),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Card usage unavailable',
    })
  })
})
