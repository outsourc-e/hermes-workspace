import { describe, expect, it } from 'vitest'
import { JV_BOARD, JV_MOBILE, jvGrid, jvRule } from './geometry'

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

describe('jvRule', () => {
  it('adds the hairline a bordered edge eats under border-box', () => {
    expect(jvRule(11)).toBe('calc(var(--jv-space-4) * 11 + var(--jv-space-1))')
  })

  it('gives the top bar 44px of content UNDER its rule, not including it', () => {
    // The bar carries `border-b`, and `box-sizing: border-box` subtracts that
    // border from `height` instead of adding it — so `jvGrid(11)` left a 43px
    // bar and sat both desktop boards a pixel high. Regression guard.
    expect(JV_BOARD.topbarHeight).toBe(jvRule(11))
    expect(JV_BOARD.topbarHeight).not.toBe(jvGrid(11))
  })
})

describe('JV_MOBILE', () => {
  it('maps the mobile artboard frame to 390 × 844 on the same grid', () => {
    // 97.5 * 4 = 390, 211 * 4 = 844
    expect(JV_MOBILE.frameWidth).toBe(jvGrid(97.5))
    expect(JV_MOBILE.frameHeight).toBe(jvGrid(211))
  })

  it('measures its status bar exactly like the desktop top bar', () => {
    expect(JV_MOBILE.statusBarHeight).toBe(JV_BOARD.topbarHeight)
  })

  it('never emits a raw px value', () => {
    for (const value of Object.values(JV_MOBILE)) {
      expect(value).not.toMatch(/\d+px/)
      expect(value).toContain('var(--jv-space-')
    }
  })
})
