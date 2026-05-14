import { describe, expect, it, vi } from 'vitest'
import {
  registerAppServiceWorker,
  wrapInlineScript,
} from './__root'

describe('root runtime guards', () => {
  it('wraps inline scripts in a top-level try/catch', () => {
    const wrapped = wrapInlineScript('window.answer = 42;')
    expect(wrapped).toContain('try {')
    expect(wrapped).toContain('window.answer = 42;')
    expect(wrapped).toContain("console.error('Inline bootstrap script failed'")
  })

  it('clears old caches and registers the network-only PWA service worker', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const deleteCache = vi.fn().mockResolvedValue(true)

    await expect(
      registerAppServiceWorker({
        serviceWorker: { register },
        cachesApi: { keys: vi.fn().mockResolvedValue(['stale']), delete: deleteCache },
      }),
    ).resolves.toBeUndefined()

    expect(deleteCache).toHaveBeenCalledWith('stale')
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })
})
