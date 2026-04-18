import { describe, expect, it, vi } from 'vitest'
import {
  unregisterServiceWorkers,
  wrapInlineScript,
} from './__root'

describe('root runtime guards', () => {
  it('wraps inline scripts in a top-level try/catch', () => {
    const wrapped = wrapInlineScript('window.answer = 42;')
    expect(wrapped).toContain('try {')
    expect(wrapped).toContain('window.answer = 42;')
    expect(wrapped).toContain("console.error('Inline bootstrap script failed'")
  })

  it('swallows getRegistrations rejections', async () => {
    const getRegistrations = vi.fn().mockRejectedValue(new Error('boom'))
    const unregister = vi.fn()

    await expect(
      unregisterServiceWorkers({
        serviceWorker: { getRegistrations },
        cachesApi: { keys: vi.fn().mockResolvedValue(['stale']), delete: unregister },
      }),
    ).resolves.toBeUndefined()

    expect(getRegistrations).toHaveBeenCalledTimes(1)
    expect(unregister).toHaveBeenCalledWith('stale')
  })
})
