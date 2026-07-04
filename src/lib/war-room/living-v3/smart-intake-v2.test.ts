import { describe, expect, it } from 'vitest'
import {
  createSmartIntakeMission,
  dossierForSmartIntakeMatch,
  imageSetForSmartIntakeMatch,
  selectedSmartIntakeMatch,
} from './smart-intake-v2'

describe('Smart Intake V2 contracts', () => {
  it('detects mixed source refs without executing live services', () => {
    const mission = createSmartIntakeMission([
      'Find a gold bow necklace for DolaroBoutique',
      'https://www.aliexpress.com/item/1005000000000000.html',
      'https://docs.google.com/spreadsheets/d/private/edit',
      'https://drive.google.com/drive/folders/source-images',
      'data/etsy-market-lab/imports/bow-necklace.png',
    ].join('\n'), 20_000)

    expect(mission.missionId).toBe('smart-intake-ffk')
    expect(mission.safety.usageAllowed).toBe(false)
    expect(mission.safety.workerSpawnAllowed).toBe(false)
    expect(mission.sources.map((source) => source.kind)).toEqual(expect.arrayContaining([
      'aliexpress_link',
      'google_sheet_link',
      'google_drive_folder',
      'local_image',
      'freeform_prompt',
    ]))
    expect(mission.sources.find((source) => source.kind === 'aliexpress_link')?.accessState).toBe('blocked_live')
    expect(mission.sources.find((source) => source.kind === 'google_sheet_link')?.accessState).toBe('auth_required')
    expect(mission.agentTasks.map((task) => task.stationId)).toEqual([
      'source-intake',
      'image-match',
      'dossier-builder',
      'shotlab-prep-approval',
    ])
    expect(mission.evidence.length).toBeGreaterThanOrEqual(4)
    expect(mission.productMatches.length).toBeGreaterThanOrEqual(1)
    expect(mission.imageSets[0].items.length).toBeGreaterThanOrEqual(1)
    expect(mission.markdownDossiers[0].markdown).toContain('## Source Intake')
    expect(mission.markdownDossiers[0].markdown).toContain('## ShotLab Readiness')
  })

  it('keeps public image URLs as refs and exposes gallery/dossier helpers', () => {
    const mission = createSmartIntakeMission('https://example.com/bow.jpg make a delicate gold bow necklace listing', 21_000)
    const match = selectedSmartIntakeMatch(mission)
    expect(match?.title).toContain('Bow')
    expect(match?.evidenceIds.length).toBeGreaterThan(0)

    const imageSet = imageSetForSmartIntakeMatch(mission, match?.matchId)
    expect(imageSet?.items[0]).toMatchObject({
      previewMode: 'external_ref_not_loaded',
      selected: true,
    })

    const dossier = dossierForSmartIntakeMatch(mission, match?.matchId)
    expect(dossier?.markdown).toContain('Public image URL')
    expect(mission.gallery[0]).toMatchObject({
      matchId: match?.matchId,
      imageCount: expect.any(Number),
    })
  })
})
