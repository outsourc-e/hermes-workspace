import { describe, expect, it } from 'vitest'

import { LIVING_V3_WORLD_CONFIG } from './living-v3-contract'
import { ROOM_WORKBENCH_CONTRACTS, roomWorkbenchContractFor } from './room-workbench-contract'

describe('ROOM_WORKBENCH_CONTRACTS', () => {
  it('defines a product-grade visual workbench contract for every Living V3 room', () => {
    const roomIds = LIVING_V3_WORLD_CONFIG.rooms.map((room) => room.id)

    expect(Object.keys(ROOM_WORKBENCH_CONTRACTS).sort()).toEqual([...roomIds].sort())

    for (const roomId of roomIds) {
      const contract = roomWorkbenchContractFor(roomId)
      expect(contract.roomId).toBe(roomId)
      expect(contract.visualMetaphor).toBeTruthy()
      expect(contract.oneLineJob.length).toBeGreaterThan(24)
      expect(contract.primaryArtifact.length).toBeGreaterThan(24)
      expect(contract.mustShow.length).toBeGreaterThanOrEqual(5)
      expect(contract.mustControl.length).toBeGreaterThanOrEqual(5)
      expect(contract.visualRequirements).toEqual(expect.arrayContaining([
        'summary-cards',
        'status-color-hierarchy',
        'collapsed-proof',
      ]))
      expect(contract.forbiddenPrimaryUi.join(' ')).toMatch(/raw JSON|debug|generic|fake/i)
    }
  })

  it('marks Atlantis as a submerged visual vault, not a text/status page', () => {
    expect(roomWorkbenchContractFor('atlantis-vault')).toMatchObject({
      visualMetaphor: 'submerged-vault',
      primaryArtifact: expect.stringContaining('Vault command map'),
      visualRequirements: expect.arrayContaining(['tables', 'charts', 'media-or-visual-map']),
    })
  })
})
