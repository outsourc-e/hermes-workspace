import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

const requireLocalOrAuth = vi.fn(() => true)
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
  requireLocalOrAuth,
}))

const loadSubscriptionCatalog = vi.fn()
vi.mock('../../server/subscription-model-catalog', () => ({
  loadSubscriptionCatalog: () => loadSubscriptionCatalog(),
}))

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetModules()
  loadSubscriptionCatalog.mockReset()
  requireLocalOrAuth.mockReset()
  requireLocalOrAuth.mockReturnValue(true)
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleErrorSpy.mockRestore()
})

describe('GET /api/orchestration-catalog', () => {
  it('rejects requests outside the local-or-auth boundary before loading the catalog', async () => {
    requireLocalOrAuth.mockReturnValue(false)
    const { Route } = await import('./orchestration-catalog')
    const res = await Route.server.handlers.GET({
      request: new Request('http://workspace.example/api/orchestration-catalog'),
    })

    expect(requireLocalOrAuth).toHaveBeenCalledOnce()
    expect(loadSubscriptionCatalog).not.toHaveBeenCalled()
    expect(res.status).toBe(401)
  })

  it('returns the catalog on success', async () => {
    loadSubscriptionCatalog.mockResolvedValue({ routes: [] })
    const { Route } = await import('./orchestration-catalog')
    const res = await Route.server.handlers.GET({
      request: new Request('http://localhost/api/orchestration-catalog'),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, routes: [] })
  })

  it('returns a fixed generic error and never leaks the caught exception message', async () => {
    const sensitive = 'SECRET_TOKEN=abc123 at /Users/cwm4t/.hermes/config.yaml'
    loadSubscriptionCatalog.mockRejectedValue(new Error(sensitive))
    const { Route } = await import('./orchestration-catalog')
    const res = await Route.server.handlers.GET({
      request: new Request('http://localhost/api/orchestration-catalog'),
    })
    const rawBody = await res.text()
    const body = JSON.parse(rawBody)

    expect(res.status).toBe(500)
    expect(body).toEqual({ ok: false, error: 'Failed to load orchestration catalog.' })
    expect(rawBody).not.toContain(sensitive)
    expect(rawBody).not.toContain('SECRET_TOKEN')
    expect(rawBody).not.toContain('/Users/cwm4t')
  })

  it('logs the real error server-side for diagnostics', async () => {
    const sensitive = new Error('boom: sensitive diagnostic detail')
    loadSubscriptionCatalog.mockRejectedValue(sensitive)
    const { Route } = await import('./orchestration-catalog')
    await Route.server.handlers.GET({
      request: new Request('http://localhost/api/orchestration-catalog'),
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[orchestration-catalog] failed to load catalog:',
      sensitive,
    )
  })

  it('handles non-Error throw values without leaking their content to the client', async () => {
    loadSubscriptionCatalog.mockRejectedValue('raw string throw with secret=xyz')
    const { Route } = await import('./orchestration-catalog')
    const res = await Route.server.handlers.GET({
      request: new Request('http://localhost/api/orchestration-catalog'),
    })
    const rawBody = await res.text()

    expect(res.status).toBe(500)
    expect(rawBody).not.toContain('secret=xyz')
    expect(JSON.parse(rawBody)).toEqual({ ok: false, error: 'Failed to load orchestration catalog.' })
  })
})
