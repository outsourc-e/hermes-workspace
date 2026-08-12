import { describe, expect, it } from 'vitest'
import { MISSION_TEMPLATES, buildMissionFromTemplate } from './templates'
import { validateMission } from './graph-engine'

describe('mission templates', () => {
  it('builds valid coding and release graphs', () => {
    for (const template of ['coding', 'release'] as const) {
      const mission = buildMissionFromTemplate({ id: `m-${template}`, objective: 'ship change', template })
      expect(validateMission(mission).mission).not.toBeNull()
    }
  })

  it('keeps all templates declarative', () => {
    expect(Object.keys(MISSION_TEMPLATES)).toEqual(['coding', 'research', 'qa', 'release', 'maintenance'])
    expect(MISSION_TEMPLATES.coding.buildNodes({ missionId: 'm', objective: 'x' }).map((node) => node.role)).toEqual([
      'researcher', 'orchestrator', 'builder', 'reviewer', 'qa', 'builder',
    ])
  })
})
