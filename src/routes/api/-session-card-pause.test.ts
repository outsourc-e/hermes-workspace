import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './session-cards.$cardId.pause'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  dashboardFetch: vi.fn(),
  resolveByCardOwner: vi.fn(),
  resolveExact: vi.fn(),
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))
vi.mock('../../server/gateway-capabilities', () => ({
  ensureGatewayProbed: mocks.ensureGatewayProbed,
  dashboardFetch: mocks.dashboardFetch,
}))
vi.mock('../../server/session-card-operation-binding', () => ({
  resolveSessionCardOperationBindingByCardOwner: mocks.resolveByCardOwner,
  resolveExactSessionCardOperationBinding: mocks.resolveExact,
}))

const binding = {
  kind: 'session-card-owner' as const,
  cardId: 'remote:mission-card',
  parentCardId: null,
  canonicalSource: 'remote' as const,
  canonicalSegmentKey: 'remote:private-upstream-tip',
  canonicalTransport: 'gateway' as const,
}

const handler = (Route.options.server?.handlers as any).POST as (args: {
  params: { cardId: string }
  request: Request
}) => Promise<Response>

function request(body: unknown): Request {
  return new Request(
    'http://localhost/api/session-cards/remote%3Amission-card/pause',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

describe('POST /api/session-cards/$cardId/pause Card authority', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isAuthenticated.mockReturnValue(true)
    mocks.resolveByCardOwner.mockResolvedValue(binding)
    mocks.resolveExact.mockResolvedValue({
      kind: 'session-card-owner',
      cardId: binding.cardId,
      parentCardId: null,
    })
    mocks.ensureGatewayProbed.mockResolvedValue({
      dashboard: { available: true },
    })
    mocks.dashboardFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, paused: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('rejects unauthenticated requests before parsing or resolving the body', async () => {
    mocks.isAuthenticated.mockReturnValue(false)
    const unauthenticated = new Request(
      'http://localhost/api/session-cards/remote%3Amission-card/pause',
      {
        method: 'POST',
        body: 'not json',
      },
    )

    const response = await handler({
      params: { cardId: binding.cardId },
      request: unauthenticated,
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized' })
    expect(mocks.resolveByCardOwner).not.toHaveBeenCalled()
    expect(mocks.resolveExact).not.toHaveBeenCalled()
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.dashboardFetch).not.toHaveBeenCalled()
  })

  it('derives the raw agent key on the server and returns only safe Card identity', async () => {
    const response = await handler({
      params: { cardId: binding.cardId },
      request: request({ pause: true, parentCardId: null }),
    })

    expect(response.status).toBe(200)
    expect(mocks.resolveByCardOwner).toHaveBeenCalledWith({
      cardId: binding.cardId,
      parentCardId: null,
      source: 'remote',
      transport: 'gateway',
    })
    expect(mocks.resolveExact).toHaveBeenCalledWith(binding)
    expect(mocks.dashboardFetch).toHaveBeenCalledWith('/api/agent-pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_key: binding.canonicalSegmentKey,
        pause: true,
      }),
    })
    const payload = await response.json()
    expect(payload).toEqual({
      ok: true,
      cardId: binding.cardId,
      parentCardId: null,
      paused: true,
    })
    expect(JSON.stringify(payload)).not.toContain('private-upstream-tip')
  })

  it('rejects rollover after capability discovery immediately before mutation', async () => {
    mocks.resolveExact.mockResolvedValue(null)

    const response = await handler({
      params: { cardId: binding.cardId },
      request: request({ pause: false }),
    })

    expect(response.status).toBe(409)
    expect(mocks.ensureGatewayProbed).toHaveBeenCalled()
    expect(mocks.dashboardFetch).not.toHaveBeenCalled()
  })

  it('fails closed when the requested Card has no exact remote owner', async () => {
    mocks.resolveByCardOwner.mockResolvedValue(null)

    const response = await handler({
      params: { cardId: 'remote:card-a' },
      request: request({ pause: true }),
    })

    expect(response.status).toBe(409)
    expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
    expect(mocks.dashboardFetch).not.toHaveBeenCalled()
  })

  it('rejects browser-supplied raw session keys instead of using them as authority', async () => {
    const response = await handler({
      params: { cardId: binding.cardId },
      request: request({ pause: true, session_key: 'remote:hostile' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.resolveByCardOwner).not.toHaveBeenCalled()
    expect(mocks.dashboardFetch).not.toHaveBeenCalled()
  })
})
