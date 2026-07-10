import { describe, expect, it } from 'vitest'
import { GALAXY_PALETTE, NOVA_COCKPIT_TOKENS } from './nova-cockpit-theme'

type Hsl = { h: number; s: number; l: number }

/** Minimal #rgb / #rrggbb / rgba(r,g,b,a) → HSL, tripwire-local only. */
function hexToHsl(hex: string): Hsl {
  let r = 0
  let g = 0
  let b = 0
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16)
    g = parseInt(hex[2] + hex[2], 16)
    b = parseInt(hex[3] + hex[3], 16)
  } else {
    r = parseInt(hex.slice(1, 3), 16)
    g = parseInt(hex.slice(3, 5), 16)
    b = parseInt(hex.slice(5, 7), 16)
  }
  return rgbToHsl(r, g, b)
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
  else h = 60 * ((rn - gn) / delta + 4)
  if (h < 0) h += 360
  return { h, s, l }
}

/** Extract every #hex / rgba(...) color literal in a CSS value string. */
function extractColors(value: string): Array<Hsl> {
  const colors: Array<Hsl> = []
  const hexMatches = value.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []
  for (const hex of hexMatches) colors.push(hexToHsl(hex))
  const rgbaMatches = value.matchAll(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/g,
  )
  for (const match of rgbaMatches) {
    colors.push(rgbToHsl(Number(match[1]), Number(match[2]), Number(match[3])))
  }
  return colors
}

function isNeutral(c: Hsl): boolean {
  return c.s < 0.12
}
function isNavySurface(c: Hsl): boolean {
  return c.h >= 200 && c.h <= 235 && c.l < 0.35
}
function isAmberOrGold(c: Hsl): boolean {
  return c.h >= 15 && c.h <= 50
}
function isWarmRed(c: Hsl): boolean {
  return c.h >= 0 && c.h < 15
}
function isGreenLeak(c: Hsl): boolean {
  return c.h > 70 && c.h < 170 && c.s >= 0.12
}
function isPurpleLeak(c: Hsl): boolean {
  return c.h > 250 && c.h < 300 && c.s >= 0.12
}
function isCyanChromeLeak(c: Hsl): boolean {
  return c.h > 170 && c.h < 200 && c.s > 0.3
}

describe('cockpit chrome token tripwire', () => {
  const entries = Object.entries(NOVA_COCKPIT_TOKENS)

  it('every chrome token color resolves to navy, amber/gold, warm-red, or neutral', () => {
    for (const [key, value] of entries) {
      const colors = extractColors(value)
      for (const color of colors) {
        const ok =
          isNeutral(color) ||
          isNavySurface(color) ||
          isAmberOrGold(color) ||
          isWarmRed(color)
        expect(
          ok,
          `${key}="${value}" resolved to h=${color.h.toFixed(1)} s=${color.s.toFixed(2)} l=${color.l.toFixed(2)}, outside the navy/amber/warm-red/neutral chrome canon`,
        ).toBe(true)
      }
    }
  })

  it('no chrome token leaked a green hue', () => {
    for (const [key, value] of entries) {
      for (const color of extractColors(value)) {
        expect(isGreenLeak(color), `${key}="${value}" leaked a green hue`).toBe(
          false,
        )
      }
    }
  })

  it('no chrome token leaked a purple hue', () => {
    for (const [key, value] of entries) {
      for (const color of extractColors(value)) {
        expect(
          isPurpleLeak(color),
          `${key}="${value}" leaked a purple hue`,
        ).toBe(false)
      }
    }
  })

  it('no chrome token leaked a saturated cyan hue', () => {
    for (const [key, value] of entries) {
      for (const color of extractColors(value)) {
        expect(
          isCyanChromeLeak(color),
          `${key}="${value}" leaked a saturated cyan hue into chrome`,
        ).toBe(false)
      }
    }
  })

  it('GALAXY_PALETTE.blues stays untouched — neon blues are canon there, never in chrome', () => {
    expect(GALAXY_PALETTE.blues).toEqual(['#63C7FF', '#9DDCFF', '#2E7FD9'])
  })
})
