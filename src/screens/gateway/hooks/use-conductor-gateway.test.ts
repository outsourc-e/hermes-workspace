import { describe, expect, it } from 'vitest'

import { shouldPersistActiveConductorMission } from './use-conductor-gateway'

describe('Conductor active mission persistence', () => {
  it('persists only resumable in-flight phases', () => {
    expect(shouldPersistActiveConductorMission('decomposing')).toBe(true)
    expect(shouldPersistActiveConductorMission('running')).toBe(true)
  })

  it('does not persist terminal or idle phases as the active mission', () => {
    expect(shouldPersistActiveConductorMission('idle')).toBe(false)
    expect(shouldPersistActiveConductorMission('complete')).toBe(false)
  })
})
