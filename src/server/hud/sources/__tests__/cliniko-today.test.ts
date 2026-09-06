import { describe, expect, it } from 'vitest'
import { computeClinikoStat } from '../cliniko-today'

describe('computeClinikoStat', () => {
  it('returns appointment count', () => {
    const stat = computeClinikoStat({
      count: 3,
      appointments: [{}, {}, {}],
    } as any)
    expect(stat.value).toBe('3')
    expect(stat.sub).toBe('today')
  })
  it('handles zero appointments', () => {
    expect(
      computeClinikoStat({ count: 0, appointments: [] } as any).value,
    ).toBe('0')
  })
  it('falls back to appointments array length when count is missing', () => {
    const stat = computeClinikoStat({ appointments: [{}, {}] } as any)
    expect(stat.value).toBe('2')
  })
  it('tone is always info', () => {
    expect(computeClinikoStat({ count: 5, appointments: [] } as any).tone).toBe(
      'info',
    )
  })
})
