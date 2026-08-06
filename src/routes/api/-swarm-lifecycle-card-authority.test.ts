import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from './swarm-lifecycle'

const mocks = vi.hoisted(() => ({
  autoSweep: vi.fn(),
  handoff: vi.fn(),
  renew: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))
vi.mock('../../server/auth-middleware', () => ({ isAuthenticated: () => true }))
vi.mock('../../server/swarm-foundation', () => ({
  listSwarmWorkerIds: () => ['builder'],
}))
vi.mock('../../server/swarm-roster', () => ({
  isSwarmWorkerId: (value: unknown) => value === 'builder',
}))
vi.mock('../../server/session-card-operation-binding', () => ({
  parseSessionCardOperationBinding: (value: unknown) =>
    value && typeof value === 'object' ? value : null,
}))
vi.mock('../../server/swarm-lifecycle', () => ({
  autoSweepLifecycle: mocks.autoSweep,
  getSwarmLifecycleStatus: vi.fn(),
  notifyHandoffWritten: mocks.notify,
  renewWorker: mocks.renew,
  requestWorkerHandoff: mocks.handoff,
}))

type Handler = (context: { request: Request }) => Promise<Response>
type TestRoute = { server: { handlers: { POST: Handler } } }
const handler = (Route as unknown as TestRoute).server.handlers.POST

const cardBinding = {
  kind: 'session-card-owner',
  cardId: 'local:builder-card',
  parentCardId: null,
  canonicalSource: 'local',
  canonicalSegmentKey: 'local:builder',
  canonicalTransport: 'tmux',
}

function request(body: Record<string, unknown>) {
  return new Request('http://workspace.test/api/swarm-lifecycle', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handoff.mockResolvedValue({ ok: true })
  mocks.renew.mockResolvedValue({ ok: true })
  mocks.notify.mockResolvedValue(true)
  mocks.autoSweep.mockResolvedValue([])
})

describe('POST /api/swarm-lifecycle Card authority', () => {
  it.each(['request-handoff', 'renew', 'notify-handoff-written'])(
    'rejects raw-only %s',
    async (action) => {
      const response = await handler({
        request: request({ action, workerId: 'builder' }),
      })

      expect(response.status).toBe(400)
      expect(mocks.handoff).not.toHaveBeenCalled()
      expect(mocks.renew).not.toHaveBeenCalled()
      expect(mocks.notify).not.toHaveBeenCalled()
    },
  )

  it('rejects raw-only auto-sweep', async () => {
    const response = await handler({
      request: request({ action: 'auto-sweep' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.autoSweep).not.toHaveBeenCalled()
  })

  it('passes exact Card binding into lifecycle mutation', async () => {
    const response = await handler({
      request: request({
        action: 'request-handoff',
        workerId: 'builder',
        cardBinding,
      }),
    })

    expect(response.status).toBe(200)
    expect(mocks.handoff).toHaveBeenCalledWith('builder', cardBinding)
  })
})
