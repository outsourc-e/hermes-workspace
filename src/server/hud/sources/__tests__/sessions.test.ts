import { describe, expect, it } from 'vitest'
import { computeSessionsStat } from '../sessions'

describe('computeSessionsStat', () => {
  it('counts active sessions across hosts', () => {
    const data = {
      hosts: [
        { host: 'home-pc', activeLast1h: 2 },
        { host: 'mac', activeLast1h: 1 },
        { host: 'idle', activeLast1h: 0 },
      ],
    }
    const s = computeSessionsStat(data)
    expect(s.value).toBe('3')
    expect(s.sub).toBe('2 hosts')
  })

  it('handles all idle', () => {
    expect(
      computeSessionsStat({ hosts: [{ host: 'a', activeLast1h: 0 }] }).value,
    ).toBe('0')
  })
})
