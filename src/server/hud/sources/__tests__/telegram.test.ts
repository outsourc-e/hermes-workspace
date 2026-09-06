import { afterEach, describe, expect, it, vi } from 'vitest'
import { telegramAdapter } from '../telegram'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => fetchMock.mockReset())

describe('telegramAdapter', () => {
  it('returns connected when platform state is connected', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platforms: { telegram: { state: 'connected' } } }),
    })
    const r = await telegramAdapter.fetch()
    expect(r.value).toBe('up')
    expect(r.tone).toBe('ok')
  })

  it('returns disconnected when platform state is not connected', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platforms: { telegram: { state: 'disconnected' } },
      }),
    })
    const r = await telegramAdapter.fetch()
    expect(r.value).toBe('down')
    expect(r.tone).toBe('err')
  })

  it('returns unknown when platform missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platforms: {} }),
    })
    const r = await telegramAdapter.fetch()
    expect(r.value).toBe('?')
    expect(r.tone).toBe('warn')
  })

  it('throws on non-OK response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })
    await expect(telegramAdapter.fetch()).rejects.toThrow(/telegram fetch/)
  })
})
