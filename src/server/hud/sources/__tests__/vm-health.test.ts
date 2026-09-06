import { describe, expect, it } from 'vitest'
import { vmHealthAdapter } from '../vm-health'

describe('vmHealthAdapter', () => {
  it('returns memory percent and disk percent', async () => {
    const result = await vmHealthAdapter.fetch()
    expect(result.value).toMatch(/^\d{1,3}%$/)
    expect(result.sub).toMatch(/disk/)
    expect(['ok', 'warn', 'err']).toContain(result.tone)
  })
})
