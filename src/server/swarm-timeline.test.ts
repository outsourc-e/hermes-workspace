import { describe, expect, it } from 'vitest'
import { getSwarmTimeline } from './swarm-timeline'

describe('getSwarmTimeline', () => {
  it('returns a newest-first feed without throwing on live data', () => {
    const { entries, generatedAt } = getSwarmTimeline(50)
    expect(typeof generatedAt).toBe('string')
    expect(entries.length).toBeLessThanOrEqual(50)
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].at).toBeGreaterThanOrEqual(entries[i].at)
    }
    for (const e of entries) {
      expect(['mission', 'outcome', 'scheduled', 'sweep']).toContain(e.source)
      expect(typeof e.message).toBe('string')
    }
  })
})
