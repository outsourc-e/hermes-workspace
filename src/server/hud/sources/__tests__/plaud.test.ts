import { describe, expect, it } from 'vitest'
import { computePlaudStat } from '../plaud'

describe('computePlaudStat', () => {
  it('counts untranscribed recordings', () => {
    const data = [
      { id: '1', transcribed: true },
      { id: '2', transcribed: false },
      { id: '3', transcribed: false },
    ]
    expect(computePlaudStat(data).value).toBe('2')
  })
  it('handles empty input', () => {
    expect(computePlaudStat([]).value).toBe('0')
  })
  it('tone is ok when nothing untranscribed', () => {
    const data = [{ id: '1', transcribed: true }]
    expect(computePlaudStat(data).tone).toBe('ok')
  })
  it('tone is info when untranscribed > 0', () => {
    const data = [{ id: '1', transcribed: false }]
    expect(computePlaudStat(data).tone).toBe('info')
  })
})
