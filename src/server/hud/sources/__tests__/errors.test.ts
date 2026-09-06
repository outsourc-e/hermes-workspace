import { describe, expect, it } from 'vitest'
import { errorsAdapter } from '../errors'

describe('errorsAdapter', () => {
  it('returns a numeric error count', async () => {
    const result = await errorsAdapter.fetch()
    expect(result.value).toMatch(/^\d+$/)
    expect(['ok', 'warn', 'err']).toContain(result.tone)
  })
})
