import { describe, expect, it } from 'vitest'
import {
  WORKSPACE_DOMAIN_ROOM_MAP,
  WORKSPACE_KERNEL_LOCKED_ACTIONS,
  WORKSPACE_WORKER_PROFILES,
  getWorkspaceBlueprintById,
  getWorkspaceBlueprintRegistry,
} from './blueprints'
import type { WorkspaceBlueprintId } from './contracts'

const requiredBlueprints: Array<WorkspaceBlueprintId> = [
  'atlantis-vault-governance-v1',
  'etsy-smart-product-intake-v1',
  'etsy-draft-prep-v1',
  'shotlab-media-prep-v1',
  'seo-alura-keyword-v1',
  'supplier-proof-v1',
  'cad-3d-print-design-v1',
  'daily-news-content-v1',
  'discord-readback-v1',
  'generic-project-status-v1',
  'approval-gate-v1',
]

describe('workspace kernel blueprint registry', () => {
  it('includes required Kernel V1 blueprints with stable routing fields', () => {
    const registry = getWorkspaceBlueprintRegistry()
    expect(registry.map((blueprint) => blueprint.blueprintId)).toEqual(expect.arrayContaining(requiredBlueprints))

    for (const blueprintId of requiredBlueprints) {
      const blueprint = getWorkspaceBlueprintById(blueprintId)
      expect(blueprint).toBeTruthy()
      expect(blueprint?.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(blueprint?.domain).toBeTruthy()
      expect(blueprint?.roomId).toBeTruthy()
      expect(blueprint?.riskClass).toMatch(/^R[0-5]_/)
      expect(blueprint?.approvalPolicy.mode).toBeTruthy()
      expect(blueprint?.lockedActions).toEqual(expect.arrayContaining(WORKSPACE_KERNEL_LOCKED_ACTIONS.slice(0, 3)))
      expect(blueprint?.defaultNextStep.length).toBeGreaterThan(10)
    }
  })

  it('maps the requested operating domains onto existing Living V3 rooms', () => {
    expect(WORKSPACE_DOMAIN_ROOM_MAP['data-vault'].roomId).toBe('atlantis-vault')
    expect(WORKSPACE_DOMAIN_ROOM_MAP.etsy.roomId).toBe('etsy-market-lab')
    expect(WORKSPACE_DOMAIN_ROOM_MAP.shotlab.roomId).toBe('etsy-market-lab')
    expect(WORKSPACE_DOMAIN_ROOM_MAP['seo-alura'].roomId).toBe('etsy-market-lab')
    expect(WORKSPACE_DOMAIN_ROOM_MAP.supplier.roomId).toBe('etsy-market-lab')
    expect(WORKSPACE_DOMAIN_ROOM_MAP['cad-3d-print'].roomId).toBe('terra-forge')
    expect(WORKSPACE_DOMAIN_ROOM_MAP['content-news'].roomId).toBe('gateway-cockpit')
    expect(WORKSPACE_DOMAIN_ROOM_MAP.approval.roomId).toBe('olympus-command')
    expect(WORKSPACE_DOMAIN_ROOM_MAP['agent-ops'].roomId).toBe('council-strategists')
  })

  it('registers Poseidon as the Atlantis Vault mind without pretending a live runner is connected', () => {
    const blueprint = getWorkspaceBlueprintById('atlantis-vault-governance-v1')
    const poseidonProfile = WORKSPACE_WORKER_PROFILES.find((profile) => profile.profileId === 'controlled-poseidon-vault-v1')

    expect(blueprint).toMatchObject({
      domain: 'data-vault',
      roomId: 'atlantis-vault',
      stationId: 'atlantis-index',
      outputKinds: ['data-vault-audit-packet', 'obsidian-context-packet'],
      allowedWorkerProfileIds: ['controlled-poseidon-vault-v1', 'hermes-manager'],
    })
    expect(blueprint?.lockedActions).toEqual(expect.arrayContaining([
      'database write without DLV approval',
      'Obsidian write without DLV approval',
      'bulk cleanup/delete without readback',
    ]))
    expect(poseidonProfile).toMatchObject({
      roomId: 'atlantis-vault',
      agentId: 'poseidon',
      connected: false,
      approvedControlledRunner: false,
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
    })
  })

  it('registers each council general as a separate approved Hermes profile', () => {
    const councilProfiles = WORKSPACE_WORKER_PROFILES.filter((profile) => profile.profileScope === 'council-general')

    expect(councilProfiles.map((profile) => profile.profileId)).toEqual([
      'council-julius',
      'council-alexander',
      'council-napoleon',
      'council-saladin',
      'council-genghis',
      'council-hannibal',
    ])
    expect(new Set(councilProfiles.map((profile) => profile.hermesProfileId))).toEqual(new Set([
      'julius',
      'alexander',
      'napoleon',
      'saladin',
      'genghis',
      'hannibal',
    ]))
    for (const profile of councilProfiles) {
      expect(profile.roomId).toBe('council-strategists')
      expect(profile.connected).toBe(true)
      expect(profile.approvedControlledRunner).toBe(true)
      expect(profile.independentProfile).toBe(true)
      expect(profile.workerSpawnAllowed).toBe(false)
      expect(profile.lockedActions).toEqual(expect.arrayContaining(['worker fan-out or uncontrolled runner spawn', "a general using another general's Hermes profile"]))
    }
  })
})
