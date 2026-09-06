import { describe, expect, it } from 'vitest'
import { snapshotHandler } from '../../../routes/api/hud/snapshot'

describe('snapshotHandler', () => {
  it('returns JSON with generatedAt and widgets object', async () => {
    const res = await snapshotHandler()
    const body = await res.json()
    expect(body.generatedAt).toBeTypeOf('number')
    expect(body.widgets).toBeTypeOf('object')
  })

  it('responds within 2 seconds even with no adapters', async () => {
    const start = Date.now()
    await snapshotHandler()
    expect(Date.now() - start).toBeLessThan(2000)
  })
})
