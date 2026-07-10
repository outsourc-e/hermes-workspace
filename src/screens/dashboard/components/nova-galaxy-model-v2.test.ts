import { describe, expect, it } from 'vitest'
import {
  HUB_DEGREE_THRESHOLD,
  clusterHue,
  emberSize,
  folderTintFor,
  gaussianFrom,
  isHub,
  mulberry32,
  recencyGlow,
  spiralPosition,
} from './nova-galaxy-model'

describe('mulberry32 + gaussianFrom', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect(a()).toBe(b())
    expect(a()).toBe(b())
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)()
    const b = mulberry32(2)()
    expect(a).not.toBe(b)
  })

  it('gaussianFrom stays finite across many draws', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 200; i += 1) {
      expect(Number.isFinite(gaussianFrom(rng))).toBe(true)
    }
  })
})

describe('spiralPosition', () => {
  it('is deterministic — same inputs produce the same outputs', () => {
    const a = spiralPosition(5, 1, 3, 0.6)
    const b = spiralPosition(5, 1, 3, 0.6)
    expect(a).toEqual(b)
  })

  it('differs across arms for the same seed and radius', () => {
    const arm0 = spiralPosition(5, 0, 3, 0.6)
    const arm1 = spiralPosition(5, 1, 3, 0.6)
    expect(arm0).not.toEqual(arm1)
  })

  it('radius grows with radiusNorm — low radiusNorm stays near the core, high radiusNorm reaches the rim', () => {
    // radiusNorm gates the exponential term multiplicatively, so the
    // gap between a low and high sample dwarfs the bounded jitter
    // term at every seed — this is a wide-margin comparison, not an
    // exact-boundary one, precisely so it isn't seed-flaky.
    for (let seed = 1; seed <= 10; seed += 1) {
      const near = spiralPosition(seed, 0, 3, 0.05)
      const far = spiralPosition(seed, 0, 3, 0.95)
      const nearRadius = Math.hypot(near.x, near.z)
      const farRadius = Math.hypot(far.x, far.z)
      expect(farRadius, `seed ${seed}: far=${farRadius} near=${nearRadius}`).toBeGreaterThan(
        nearRadius,
      )
    }
  })
})

describe('clusterHue', () => {
  it('cycles through the 4-hue palette deterministically', () => {
    expect(clusterHue(0)).toBe('blue')
    expect(clusterHue(1)).toBe('blue2')
    expect(clusterHue(2)).toBe('amber')
    expect(clusterHue(3)).toBe('blend')
    expect(clusterHue(4)).toBe('blue')
  })

  it('is stable for the same folderIndex', () => {
    expect(clusterHue(11)).toBe(clusterHue(11))
  })
})

describe('recencyGlow', () => {
  const now = '2026-07-10T12:00:00.000Z'

  it('is 1.0 for anything modified within the last 7 days', () => {
    expect(recencyGlow('2026-07-09T12:00:00.000Z', now)).toBe(1)
    expect(recencyGlow(now, now)).toBe(1)
  })

  it('falls off linearly and clamps at 0.35 for anything 90+ days old', () => {
    expect(recencyGlow('2026-04-11T12:00:00.000Z', now)).toBe(0.35)
    expect(recencyGlow('2020-01-01T00:00:00.000Z', now)).toBe(0.35)
  })

  it('sits strictly between 0.35 and 1 at the midpoint of the falloff window', () => {
    const midpoint = new Date(
      Date.parse('2026-07-03T12:00:00.000Z') -
        ((90 - 7) / 2) * 86_400_000,
    ).toISOString()
    const glow = recencyGlow(midpoint, now)
    expect(glow).toBeGreaterThan(0.35)
    expect(glow).toBeLessThan(1)
  })

  it('falls back to 0.35 for unparseable dates', () => {
    expect(recencyGlow('not-a-date', now)).toBe(0.35)
  })
})

describe('emberSize + isHub', () => {
  it('grows monotonically with degree', () => {
    expect(emberSize(0)).toBeLessThan(emberSize(3))
    expect(emberSize(3)).toBeLessThan(emberSize(10))
  })

  it('is 1 at degree 0', () => {
    expect(emberSize(0)).toBe(1)
  })

  it('flags hubs at the documented threshold', () => {
    expect(HUB_DEGREE_THRESHOLD).toBe(6)
    expect(isHub(5)).toBe(false)
    expect(isHub(6)).toBe(true)
    expect(isHub(20)).toBe(true)
  })
})

describe('galaxy tint tripwire — canon blues/ambers only', () => {
  const CANON = new Set([
    '#FFB347',
    '#FF8C1A',
    '#FFD27A',
    '#63C7FF',
    '#9DDCFF',
    '#2E7FD9',
  ])
  const FOLDERS = [
    'agents/claude',
    'agents/gpt',
    'agents/kimi',
    'knowledge',
    'inbox',
    'field stars',
    'totally-unknown-folder',
    'random/deep/path',
  ]

  it('folderTintFor returns only canon blues/ambers for every folder shape', () => {
    for (const folder of FOLDERS) {
      const tint = folderTintFor(folder)
      expect(CANON.has(tint), `folderTintFor("${folder}") returned off-canon tint ${tint}`).toBe(true)
    }
  })

  it('the unknown-folder default is never green or rose', () => {
    const tint = folderTintFor('zzz-not-a-real-folder')
    expect(tint).not.toBe('#7D9573')
    expect(CANON.has(tint)).toBe(true)
  })
})
