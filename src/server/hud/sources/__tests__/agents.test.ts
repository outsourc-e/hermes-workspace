import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentsAdapter } from '../agents'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => fetchMock.mockReset())

describe('agentsAdapter', () => {
  it('returns active_agents count from /health/detailed', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        active_agents: 3,
        gateway_state: 'ready',
        platforms: { sms: { state: 'connected' } },
      }),
    })
    const result = await agentsAdapter.fetch()
    expect(result.value).toBe('3')
    expect(['ok', 'info']).toContain(result.tone)
  })

  it('throws on non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(agentsAdapter.fetch()).rejects.toThrow(/agents fetch/)
  })
})
