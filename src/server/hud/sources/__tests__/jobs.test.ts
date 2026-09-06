import { describe, expect, it } from 'vitest'
import { computeJobsStat } from '../jobs'

describe('computeJobsStat', () => {
  it('counts successes and failures across last 24h', () => {
    const now = Date.now()
    const fixture = {
      jobs: [
        {
          id: 'a',
          last_run_at: new Date(now - 3600_000).toISOString(),
          last_status: 'ok',
          enabled: true,
        },
        {
          id: 'b',
          last_run_at: new Date(now - 7200_000).toISOString(),
          last_status: 'error',
          enabled: true,
        },
        {
          id: 'c',
          last_run_at: new Date(now - 90_000_000).toISOString(),
          last_status: 'ok',
          enabled: true,
        },
        { id: 'd', last_run_at: null, last_status: null, enabled: false },
      ],
    }
    const stat = computeJobsStat(fixture)
    expect(stat.ok24h).toBe(1)
    expect(stat.failed24h).toBe(1)
  })
})
