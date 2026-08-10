import { describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(() => true),
  requireLocalOrAuth: vi.fn(() => false),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => authMocks)

async function handlers() {
  const module = await import('./swarm-dispatch')
  return (module as any).Route.server.handlers
}

describe('/api/swarm-dispatch authorization', () => {
  it('rejects dispatch when the local-or-auth boundary denies the request', async () => {
    const route = await handlers()
    const response = await route.POST({
      request: new Request('http://workspace.example/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workerIds: ['swarm1'], prompt: 'must not run' }),
      }),
    })

    expect(authMocks.requireLocalOrAuth).toHaveBeenCalledOnce()
    expect(response.status).toBe(401)
  })
})
