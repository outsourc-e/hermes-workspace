import { describe, expect, it, vi } from 'vitest'

import { resolveLatestDescendant } from './latest-descendant'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('resolveLatestDescendant', () => {
  it('returns a supported changed canonical descendant', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        supported: true,
        changed: true,
        requestedSessionKey: 'parent',
        sessionKey: 'child',
      }),
    )

    await expect(
      resolveLatestDescendant('parent', { fetcher }),
    ).resolves.toEqual({
      requestedSessionKey: 'parent',
      sessionKey: 'child',
      changed: true,
    })
    expect(fetcher).toHaveBeenCalledWith(
      '/api/sessions/parent/latest-descendant',
      expect.objectContaining({ signal: undefined }),
    )
  })

  it('retains the requested session when the server reports no change', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        supported: true,
        changed: false,
        requestedSessionKey: 'parent',
        sessionKey: 'parent',
      }),
    )

    await expect(
      resolveLatestDescendant('parent', { fetcher }),
    ).resolves.toEqual({
      requestedSessionKey: 'parent',
      sessionKey: 'parent',
      changed: false,
    })
  })

  it.each([
    { ok: true, supported: true, changed: true, sessionKey: '' },
    {
      ok: true,
      supported: true,
      changed: true,
      requestedSessionKey: 'different-request',
      sessionKey: 'child',
    },
    { ok: true, supported: false, changed: true, sessionKey: 'remote' },
    null,
  ])('falls back for malformed or unsupported payload %#', async (payload) => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(payload))

    await expect(
      resolveLatestDescendant('parent', { fetcher }),
    ).resolves.toEqual({
      requestedSessionKey: 'parent',
      sessionKey: 'parent',
      changed: false,
    })
  })

  it('falls back without blocking history when the request fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network unavailable'))

    await expect(
      resolveLatestDescendant('parent', { fetcher }),
    ).resolves.toEqual({
      requestedSessionKey: 'parent',
      sessionKey: 'parent',
      changed: false,
    })
  })

  it('propagates cancellation so stale route resolutions cannot win a race', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('Aborted', 'AbortError')
    const fetcher = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(abortError), {
            once: true,
          })
        }),
    )

    const resolution = resolveLatestDescendant('parent', {
      fetcher,
      signal: controller.signal,
    })
    controller.abort()

    await expect(resolution).rejects.toBe(abortError)
  })
})
