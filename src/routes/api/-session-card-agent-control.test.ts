import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route as KillRoute } from './session-cards.$cardId.kill'
import { Route as SteerRoute } from './session-cards.$cardId.steer'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  ensureGatewayProbed: vi.fn(),
  dashboardFetch: vi.fn(),
  parseBinding: vi.fn(),
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
  parseSessionCardOperationBinding: mocks.parseBinding,
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
const owner = {
  kind: 'session-card-owner' as const,
  cardId: binding.cardId,
  parentCardId: null,
}

type Handler = (args: {
  params: { cardId: string }
  request: Request
}) => Promise<Response>

type ControlCase = {
  action: 'kill' | 'steer'
  handler: Handler
  body: Record<string, unknown>
  upstreamPath: string
  upstreamBody: Record<string, unknown>
}

const cases: Array<ControlCase> = [
  {
    action: 'steer',
    handler: (SteerRoute.options.server?.handlers as any).POST as Handler,
    body: { cardBinding: binding, message: 'continue carefully' },
    upstreamPath: '/api/agent-steer',
    upstreamBody: {
      session_key: binding.canonicalSegmentKey,
      message: 'continue carefully',
    },
  },
  {
    action: 'kill',
    handler: (KillRoute.options.server?.handlers as any).POST as Handler,
    body: { cardBinding: binding },
    upstreamPath: '/api/agent-kill',
    upstreamBody: { session_key: binding.canonicalSegmentKey },
  },
]

function request(action: ControlCase['action'], body: unknown): Request {
  return new Request(
    `http://localhost/api/session-cards/${encodeURIComponent(binding.cardId)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

describe.each(cases)(
  'POST Session Card $action authority',
  ({ action, handler, body, upstreamPath, upstreamBody }) => {
    beforeEach(() => {
      vi.clearAllMocks()
      mocks.isAuthenticated.mockReturnValue(true)
      mocks.parseBinding.mockReturnValue(binding)
      mocks.resolveExact.mockResolvedValue(owner)
      mocks.ensureGatewayProbed.mockResolvedValue({
        dashboard: { available: true },
      })
      mocks.dashboardFetch.mockResolvedValue(
        Response.json({ ok: true }, { status: 200 }),
      )
    })

    it('uses only the exact Card binding and returns no raw transport identity', async () => {
      const response = await handler({
        params: { cardId: binding.cardId },
        request: request(action, body),
      })

      expect(response.status).toBe(200)
      expect(mocks.parseBinding).toHaveBeenCalledWith(binding, {
        source: 'remote',
        transport: 'gateway',
      })
      expect(mocks.resolveExact).toHaveBeenCalledTimes(2)
      expect(mocks.dashboardFetch).toHaveBeenCalledWith(upstreamPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(upstreamBody),
      })
      const payload = await response.json()
      expect(payload).toEqual({
        ok: true,
        cardId: binding.cardId,
        parentCardId: null,
      })
      expect(JSON.stringify(payload)).not.toContain('private-upstream-tip')
    })

    it('re-resolves after capability discovery and blocks rollover before upstream mutation', async () => {
      mocks.resolveExact
        .mockResolvedValueOnce(owner)
        .mockResolvedValueOnce(null)

      const response = await handler({
        params: { cardId: binding.cardId },
        request: request(action, body),
      })

      expect(response.status).toBe(409)
      expect(mocks.ensureGatewayProbed).toHaveBeenCalledTimes(1)
      expect(mocks.resolveExact).toHaveBeenCalledTimes(2)
      expect(mocks.dashboardFetch).not.toHaveBeenCalled()
    })

    it('rejects raw session-key authority before gateway discovery or mutation', async () => {
      mocks.parseBinding.mockReturnValue(null)
      const response = await handler({
        params: { cardId: binding.cardId },
        request: request(action, {
          ...body,
          cardBinding: undefined,
          sessionKey: binding.canonicalSegmentKey,
        }),
      })

      expect(response.status).toBe(400)
      expect(mocks.resolveExact).not.toHaveBeenCalled()
      expect(mocks.ensureGatewayProbed).not.toHaveBeenCalled()
      expect(mocks.dashboardFetch).not.toHaveBeenCalled()
    })
  },
)
