import { describe, expect, it } from 'vitest'
import { computeWhoopData, recommendActivity } from '../whoop'

describe('recommendActivity', () => {
  it('returns Rest when sleep < 6h regardless of recovery', () => {
    const r = recommendActivity({
      sleep_hours: 4.5,
      recovery_pct: 80,
      day_strain: 8,
    })
    expect(r.activity).toBe('Rest')
    expect(r.reason).toMatch(/sleep/)
  })

  it('returns Gym for green recovery with moderate strain', () => {
    const r = recommendActivity({
      sleep_hours: 8,
      recovery_pct: 75,
      day_strain: 10,
    })
    expect(r.activity).toBe('Gym')
    expect(r.reason).toMatch(/Green/i)
  })

  it('downgrades green to Walk when yesterday was heavy', () => {
    const r = recommendActivity({
      sleep_hours: 8,
      recovery_pct: 75,
      day_strain: 18,
    })
    expect(r.activity).toBe('Walk')
    expect(r.reason).toMatch(/heavy/i)
  })

  it('returns Walk for yellow recovery', () => {
    const r = recommendActivity({
      sleep_hours: 7,
      recovery_pct: 55,
      day_strain: 8,
    })
    expect(r.activity).toBe('Walk')
    expect(r.reason).toMatch(/Yellow/i)
  })

  it('returns Yoga for red recovery', () => {
    const r = recommendActivity({
      sleep_hours: 7,
      recovery_pct: 25,
      day_strain: 6,
    })
    expect(r.activity).toBe('Yoga')
    expect(r.reason).toMatch(/Red/i)
  })

  it('returns Day off when no recovery data', () => {
    const r = recommendActivity({})
    expect(r.activity).toBe('Day off')
  })
})

describe('computeWhoopData', () => {
  it('includes recovery band + recommendation as title', () => {
    const w = computeWhoopData({
      recovery_pct: 64,
      hrv_ms: 43.2,
      resting_hr_bpm: 76,
      sleep_hours: 12.2,
      sleep_performance_pct: 83,
      day_strain: 10.7,
    })
    expect(w.label).toMatch(/RECOVERY · 64% · YELLOW/)
    expect(w.title).toBe('Walk')
    expect(w.sub).toContain('HRV 43')
    expect(w.sub).toContain('RHR 76')
    expect(w.sub).toContain('Sleep 12.2h')
    expect(w.sub).toContain('Strain 10.7')
    expect(w.details).toBeDefined()
    expect(w.details?.hrv_ms).toBe(43.2)
    expect(w.recommendation?.activity).toBe('Walk')
  })

  it('drops missing stats from the sub line', () => {
    const w = computeWhoopData({ recovery_pct: 70, sleep_hours: 7.5 })
    expect(w.sub).toBe('Sleep 7.5h')
  })

  it('shows GREEN band at recovery >= 67', () => {
    expect(computeWhoopData({ recovery_pct: 67 }).label).toMatch(/GREEN/)
    expect(computeWhoopData({ recovery_pct: 66 }).label).toMatch(/YELLOW/)
  })

  it('shows RED band at recovery 1..33', () => {
    expect(computeWhoopData({ recovery_pct: 33 }).label).toMatch(/RED/)
    expect(computeWhoopData({ recovery_pct: 34 }).label).toMatch(/YELLOW/)
    expect(computeWhoopData({ recovery_pct: 0 }).label).toMatch(/—/)
  })
})
