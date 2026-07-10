import { describe, expect, it } from 'vitest'
import {
  HUB_DEGREE_THRESHOLD,
  armRankPlacement,
  armTurnsForNoteCount,
  clusterHue,
  emberSize,
  folderTintFor,
  gaussianFrom,
  isHub,
  mulberry32,
  recencyGlow,
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

describe('armTurnsForNoteCount', () => {
  it('grows with the arm real note count — more notes, longer (more-wound) arm', () => {
    expect(armTurnsForNoteCount(10)).toBeLessThan(armTurnsForNoteCount(40))
    expect(armTurnsForNoteCount(40)).toBeLessThan(armTurnsForNoteCount(200))
  })

  it('clamps to [1.6, 6.4]', () => {
    expect(armTurnsForNoteCount(0)).toBe(1.6)
    expect(armTurnsForNoteCount(-5)).toBe(1.6)
    expect(armTurnsForNoteCount(10_000)).toBe(6.4)
  })
})

describe('armRankPlacement', () => {
  it('is deterministic for identical inputs', () => {
    const a = armRankPlacement(3, 12, 1, 4, 'note-a.md')
    const b = armRankPlacement(3, 12, 1, 4, 'note-a.md')
    expect(a).toEqual(b)
  })

  it('produces different jittered output for a different seedKey', () => {
    const a = armRankPlacement(3, 12, 1, 4, 'note-a.md')
    const b = armRankPlacement(3, 12, 1, 4, 'note-b.md')
    expect(a).not.toEqual(b)
  })

  it('radius strictly grows with rank (raw, before jitter)', () => {
    const armNoteCount = 24
    let previousRadius = -Infinity
    for (let rank = 0; rank < armNoteCount; rank += 1) {
      const point = armRankPlacement(rank, armNoteCount, 0, 3, 'seed', {
        raw: true,
      })
      const radius = Math.hypot(point.x, point.z)
      expect(
        radius,
        `rank ${rank}: radius ${radius} should exceed previous ${previousRadius}`,
      ).toBeGreaterThan(previousRadius)
      previousRadius = radius
    }
  })

  it('tNorm walks from just-off-core toward the tip as rank increases', () => {
    const near = armRankPlacement(0, 20, 0, 3, 'seed')
    const far = armRankPlacement(19, 20, 0, 3, 'seed')
    expect(near.tNorm).toBeLessThan(far.tNorm)
    expect(near.tNorm).toBeGreaterThan(0)
    expect(far.tNorm).toBeLessThan(1)
  })

  it('a longer (more-populated) arm reaches farther at its tip than a shorter one', () => {
    // Same relative tip rank (last note in the arm), but a much larger
    // armNoteCount both raises `turns` (armTurnsForNoteCount) and pushes
    // tNorm closer to 1 — the growth mechanic: more notes, longer arm.
    const shortArmTip = armRankPlacement(9, 10, 0, 3, 'seed', { raw: true })
    const longArmTip = armRankPlacement(199, 200, 0, 3, 'seed', { raw: true })
    const shortRadius = Math.hypot(shortArmTip.x, shortArmTip.z)
    const longRadius = Math.hypot(longArmTip.x, longArmTip.z)
    expect(longRadius).toBeGreaterThan(shortRadius)
  })

  it('distinct arms never share an armOffset — same rank/count/seed places differently per arm', () => {
    const armCount = 5
    const seen = new Set<string>()
    for (let armIndex = 0; armIndex < armCount; armIndex += 1) {
      const point = armRankPlacement(2, 10, armIndex, armCount, 'seed', {
        raw: true,
      })
      const key = `${point.x.toFixed(6)}:${point.z.toFixed(6)}`
      expect(seen.has(key), `armIndex ${armIndex} collided with a prior arm`).toBe(
        false,
      )
      seen.add(key)
    }
  })

  it('stays deterministic across repeated calls even with jitter enabled', () => {
    for (let i = 0; i < 20; i += 1) {
      const a = armRankPlacement(i, 30, 2, 4, `note-${i}.md`)
      const b = armRankPlacement(i, 30, 2, 4, `note-${i}.md`)
      expect(a).toEqual(b)
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
