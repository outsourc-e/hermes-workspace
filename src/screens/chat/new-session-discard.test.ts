import { describe, expect, it, vi } from 'vitest'
import { createNewSessionDiscardLifecycle } from './new-session-discard'

const firstCardId = 'remote:first-card'
const secondCardId = 'remote:second-card'
const token = 'a'.repeat(43)

describe('New Session discard lifecycle', () => {
  it('discards only an abandoned Card and retains the active one', async () => {
    const request = vi.fn(() => Promise.resolve('discarded' as const))
    const lifecycle = createNewSessionDiscardLifecycle(request)
    lifecycle.register(firstCardId, token)
    lifecycle.register(secondCardId, token)

    await expect(lifecycle.discardAbandoned(secondCardId)).resolves.toEqual([
      firstCardId,
    ])
    expect(request).toHaveBeenCalledWith(
      { cardId: firstCardId, discardToken: token },
      false,
    )
    await expect(lifecycle.discardAbandoned(secondCardId)).resolves.toEqual([])
  })

  it('retains a Card as soon as a message send starts', async () => {
    const request = vi.fn(() => Promise.resolve('discarded' as const))
    const lifecycle = createNewSessionDiscardLifecycle(request)
    lifecycle.register(firstCardId, token)

    lifecycle.retain(firstCardId)

    await expect(lifecycle.discardAbandoned(null)).resolves.toEqual([])
    expect(request).not.toHaveBeenCalled()
  })

  it('keeps transient failures queued for a later navigation retry', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce('retry' as const)
      .mockResolvedValueOnce('discarded' as const)
    const lifecycle = createNewSessionDiscardLifecycle(request)
    lifecycle.register(firstCardId, token)

    await expect(lifecycle.discardAbandoned(null)).resolves.toEqual([])
    await expect(lifecycle.discardAbandoned(null)).resolves.toEqual([
      firstCardId,
    ])
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('drops a candidate when the server conservatively keeps it', async () => {
    const request = vi.fn(() => Promise.resolve('retained' as const))
    const lifecycle = createNewSessionDiscardLifecycle(request)
    lifecycle.register(firstCardId, token)

    await expect(lifecycle.discardAbandoned(null)).resolves.toEqual([])
    await expect(lifecycle.discardAbandoned(null)).resolves.toEqual([])
    expect(request).toHaveBeenCalledTimes(1)
  })
})
