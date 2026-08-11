import { describe, expect, it } from 'vitest'

import { runsQueryString, runsRequestKey } from './runs-search'

describe('Runs request identity', () => {
  it('includes only a bounded run ID and changes when the deep-link selection changes', () => {
    const first = { run: 'codex:first', page: 1, size: 25 } as const
    const second = { ...first, run: 'codex:second' }

    expect(new URLSearchParams(runsQueryString(first, 1_000)).get('run')).toBe('codex:first')
    expect(runsRequestKey(first)).not.toBe(runsRequestKey(second))
    expect(new URLSearchParams(runsQueryString({ ...first, run: 'x'.repeat(301) }, 1_000)).has('run')).toBe(false)
  })
})
