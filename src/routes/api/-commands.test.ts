import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from './commands'

const mocks = vi.hoisted(() => ({
  isAuthenticated: vi.fn(),
  getTuiCommandCatalog: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: mocks.isAuthenticated,
}))

vi.mock('../../server/tui-command-catalog', () => ({
  getTuiCommandCatalog: mocks.getTuiCommandCatalog,
}))

type GetHandler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { GET: GetHandler } } }

const handler = (Route as unknown as TestRoute).server.handlers.GET

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAuthenticated.mockReturnValue(true)
})

describe('GET /api/commands', () => {
  it('returns the TUI command catalog', async () => {
    mocks.getTuiCommandCatalog.mockResolvedValue([
      { command: '/model', description: 'Switch model' },
    ])

    const response = await handler({
      request: new Request('http://workspace.test/api/commands'),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      commands: [{ command: '/model', description: 'Switch model' }],
    })
  })

  it('rejects unauthenticated browser requests', async () => {
    mocks.isAuthenticated.mockReturnValue(false)

    const response = await handler({
      request: new Request('http://workspace.test/api/commands'),
    })

    expect(response.status).toBe(401)
    expect(mocks.getTuiCommandCatalog).not.toHaveBeenCalled()
  })

  it('reports catalog failures without exposing dashboard credentials', async () => {
    mocks.getTuiCommandCatalog.mockRejectedValue(
      new Error('Timed out reading the Hermes command catalog'),
    )

    const response = await handler({
      request: new Request('http://workspace.test/api/commands'),
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'Timed out reading the Hermes command catalog',
    })
  })
})
