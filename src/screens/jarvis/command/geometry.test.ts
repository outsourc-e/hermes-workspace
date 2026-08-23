import { describe, expect, it } from 'vitest'
import { JV_BOARD, jvGrid } from './geometry'

describe('jvGrid', () => {
  it('expresses a dimension as a multiple of the 4px --jv-space-4 grid', () => {
    expect(jvGrid(55)).toBe('calc(var(--jv-space-4) * 55)')
  })

  it('keeps half-steps exact rather than rounding them', () => {
    expect(jvGrid(8.5)).toBe('calc(var(--jv-space-4) * 8.5)')
  })

  it('never emits a raw px value', () => {
    for (const value of Object.values(JV_BOARD)) {
      expect(value).not.toMatch(/\d+px/)
      expect(value).toContain('var(--jv-space-')
    }
  })

  it('maps the artboard frame to 1440 × 900 on the grid', () => {
    // 360 * 4 = 1440, 225 * 4 = 900
    expect(JV_BOARD.frameWidth).toBe(jvGrid(360))
    expect(JV_BOARD.frameHeight).toBe(jvGrid(225))
  })
})
