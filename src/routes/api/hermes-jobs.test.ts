import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))
vi.mock('../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: '',
  HERMES_API: 'http://127.0.0.1:8642',
  HERMES_UPGRADE_INSTRUCTIONS: 'upgrade hermes-agent',
  ensureGatewayProbed: vi.fn(),
  dashboardFetch: vi.fn(),
}))

import { isAuthenticated } from '../../server/auth-middleware'
import { ensureGatewayProbed, dashboardFetch } from '../../server/gateway-capabilities'
import { Route } from './hermes-jobs'

const handlers = () => (Route as unknown as { options: { server: { handlers: Record<string, (ctx: { request: Request }) => Promise<Response>> } } }).options.server.handlers

function getReq(url = 'http://localhost:3001/api/hermes-jobs'): Request {
  return new Request(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/hermes-jobs', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const res = await handlers().GET({ request: getReq() })
    expect(res.status).toBe(401)
  })

  it('returns empty jobs with capability payload when gateway lacks jobs', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(ensureGatewayProbed).mockResolvedValue({ jobs: false } as never)
    const res = await handlers().GET({ request: getReq() })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { jobs: unknown[] }
    expect(body.jobs).toEqual([])
  })

  it('forwards to dashboard cron endpoint and normalizes arrays', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(ensureGatewayProbed).mockResolvedValue({
      jobs: true,
      dashboard: { available: true },
    } as never)
    vi.mocked(dashboardFetch).mockResolvedValue(
      new Response(JSON.stringify([{ id: 'j1' }]), { status: 200 }),
    )
    const res = await handlers().GET({ request: getReq() })
    expect(vi.mocked(dashboardFetch).mock.calls[0][0]).toContain('/api/cron/jobs')
    expect(await res.json()).toEqual({ jobs: [{ id: 'j1' }] })
  })
})

describe('POST /api/hermes-jobs', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const res = await handlers().POST({
      request: new Request('http://localhost:3001/api/hermes-jobs', { method: 'POST' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 503 when gateway lacks jobs support', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(ensureGatewayProbed).mockResolvedValue({ jobs: false } as never)
    const res = await handlers().POST({
      request: new Request('http://localhost:3001/api/hermes-jobs', {
        method: 'POST',
        body: JSON.stringify({ name: 'x' }),
      }),
    })
    expect(res.status).toBe(503)
  })
})
