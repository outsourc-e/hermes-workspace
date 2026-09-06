import { describe, expect, it } from 'vitest'
import { deriveNextDeadline } from '../uni-deadlines'

describe('deriveNextDeadline', () => {
  it('returns soonest future deadline', () => {
    const items = [
      {
        id: 'a',
        unit: 'ANAT304',
        title: 'lab',
        kind: 'due' as const,
        due: new Date(Date.now() + 7 * 86400_000).toISOString(),
      },
      {
        id: 'b',
        unit: 'PHYSIO',
        title: 'exam',
        kind: 'assessment' as const,
        due: new Date(Date.now() + 2 * 86400_000).toISOString(),
      },
    ]
    const next = deriveNextDeadline(items)
    expect(next?.title).toBe('PHYSIO')
    expect(next?.label).toMatch(/UNI/)
  })

  it('returns null if all deadlines past', () => {
    const items = [
      {
        id: 'x',
        unit: 'X',
        title: 'X',
        kind: 'due' as const,
        due: new Date(Date.now() - 86400_000).toISOString(),
      },
    ]
    expect(deriveNextDeadline(items)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(deriveNextDeadline([])).toBeNull()
  })

  it('formats days remaining in label', () => {
    const items = [
      {
        id: 'a',
        unit: 'X',
        title: 'Y',
        kind: 'due' as const,
        due: new Date(Date.now() + 3 * 86400_000).toISOString(),
      },
    ]
    const next = deriveNextDeadline(items)
    expect(next?.label).toMatch(/3D|2D/) // depending on rounding
  })
})
