import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ETSY_OPS_ACTION_POLICIES,
  ETSY_OPS_AGENT_ANIMATION_MANIFESTS,
  ETSY_OPS_EXTERNAL_STATIONS,
  ETSY_OPS_PRIMARY_AGENT_IDS,
  ETSY_OPS_ROOM_PLUGIN,
  ETSY_OPS_ROUTES,
  ETSY_OPS_STATIONS,
  etsyOpsActionPolicyById,
  etsyOpsStationById,
} from './etsy-ops-room-contract'

function readPngSize(publicAssetPath: string) {
  const cleanPath = publicAssetPath.split('?')[0]?.replace(/^\//, '') ?? ''
  const filePath = path.join(process.cwd(), 'public', cleanPath)
  expect(existsSync(filePath), `${filePath} should exist`).toBe(true)
  const file = readFileSync(filePath)
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  }
}

describe('Etsy Ops room contract', () => {
  it('defines the full modular Etsy Ops room as replaceable stations and routes', () => {
    expect(ETSY_OPS_STATIONS.map((station) => station.id)).toEqual([
      'product-intake',
      'seo-oracle',
      'supplier-proof',
      'media-sources',
      'shotlab-prep',
      'listing-draft',
      'price-margin',
      'dlv-approval',
      'archive-vault',
    ])
    expect(ETSY_OPS_EXTERNAL_STATIONS.map((station) => station.id)).toEqual(['rest-lounge'])
    expect(ETSY_OPS_ROUTES.length).toBeGreaterThanOrEqual(7)
    expect(ETSY_OPS_ROUTES.some((route) => route.manualOnly && route.to === 'dlv-approval')).toBe(true)
    expect(etsyOpsStationById('rest-lounge')?.label).toBe('Rest Hall')
  })

  it('keeps station actions explicit and room-specific', () => {
    const shotlab = etsyOpsStationById('shotlab-prep')
    const supplier = etsyOpsStationById('supplier-proof')
    const listing = etsyOpsStationById('listing-draft')

    expect(shotlab?.actions).toEqual(['queue-shotlab-prep', 'request-dlv-approval'])
    expect(supplier?.actions).toEqual(expect.arrayContaining(['message-supplier', 'buy-sample']))
    expect(listing?.actions).toEqual(expect.arrayContaining(['stage-upload-preview', 'edit-live-listing']))
  })

  it('declares the V2 room plugin and the three primary living agents', () => {
    expect(ETSY_OPS_ROOM_PLUGIN).toMatchObject({
      version: 'etsy-ops-room-v2',
      defaultCameraMode: 'room',
      safety: {
        allExternalActionsApprovalOnly: true,
        liveExternalMutation: false,
      },
    })
    expect(ETSY_OPS_PRIMARY_AGENT_IDS).toEqual([
      'athena-market-strategist',
      'hephaestus-shotlab-artificer',
      'caesar-hermes-approval-commander',
    ])
    expect(Object.values(ETSY_OPS_AGENT_ANIMATION_MANIFESTS).every((manifest) => manifest.targetFrames === 96)).toBe(true)
    expect(Object.values(ETSY_OPS_AGENT_ANIMATION_MANIFESTS).every((manifest) => manifest.availableFrames === 96)).toBe(true)
    expect(Object.values(ETSY_OPS_AGENT_ANIMATION_MANIFESTS).every((manifest) => manifest.status === 'runtime-ready')).toBe(true)
    for (const manifest of Object.values(ETSY_OPS_AGENT_ANIMATION_MANIFESTS)) expect(manifest.bakedTextAllowed).toBe(false)
    expect(ETSY_OPS_AGENT_ANIMATION_MANIFESTS['athena-market-strategist'].clips.every((clip) => clip.assetPath?.includes('/war-room/etsy-ops-v4/'))).toBe(true)
    expect(ETSY_OPS_AGENT_ANIMATION_MANIFESTS['hephaestus-shotlab-artificer'].clips.every((clip) => clip.assetPath?.includes('/war-room/etsy-ops-v4/'))).toBe(true)
    expect(ETSY_OPS_AGENT_ANIMATION_MANIFESTS['caesar-hermes-approval-commander'].clips.every((clip) => clip.assetPath?.includes('/war-room/etsy-ops-julius-v1/'))).toBe(true)
  })

  it('serves regenerated band-safe 192px agent strips instead of stale cropped assets', () => {
    for (const [agentId, manifest] of Object.entries(ETSY_OPS_AGENT_ANIMATION_MANIFESTS)) {
      expect(manifest.frameSizePx).toEqual({ w: 192, h: 192 })
      if (agentId === 'caesar-hermes-approval-commander') {
        expect(manifest.id).toBe('julius-caesar-v1-runtime')
      }
      for (const clip of manifest.clips) {
        expect(clip.assetPath).toContain('?v=')
        if (agentId === 'caesar-hermes-approval-commander') {
          expect(clip.assetPath).toContain('/war-room/etsy-ops-julius-v1/')
          expect(clip.assetPath).toContain('?v=julius-v1-20260619')
        }
        const size = readPngSize(clip.assetPath ?? '')
        expect(size).toEqual({ width: clip.frameCount * 192, height: 192 })
      }
    }
  })

  it('keeps Julius isolated in his own validated asset pack', () => {
    const manifestPath = path.join(process.cwd(), 'public', 'war-room', 'etsy-ops-julius-v1', 'manifest.json')
    expect(existsSync(manifestPath), `${manifestPath} should exist`).toBe(true)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      id?: string
      version?: string
      frameSizePx?: { w?: number; h?: number }
      framesPerStrip?: number
      states?: Array<string>
      qa?: { contactSheet?: string }
    }

    expect(manifest).toMatchObject({
      id: 'julius-caesar-v1',
      version: 'julius-v1-20260619',
      frameSizePx: { w: 192, h: 192 },
      framesPerStrip: 8,
    })
    expect(manifest.states).toEqual(expect.arrayContaining([
      'idle',
      'walk-south',
      'walk-north',
      'walk-east',
      'walk-west',
      'work-at-station',
      'talk-status',
      'carry-packet',
      'wait-approval',
    ]))
    expect(existsSync(path.join(process.cwd(), 'public', manifest.qa?.contactSheet?.replace(/^\//, '') ?? ''))).toBe(true)
  })

  it('declares high-frame motion clips for every movement axis and core action', () => {
    const requiredStates = [
      'idle',
      'walk-north',
      'walk-south',
      'walk-east',
      'walk-west',
      'walk-north-east',
      'walk-north-west',
      'walk-south-east',
      'walk-south-west',
      'carry-packet',
      'work-at-station',
      'talk-status',
      'wait-approval',
      'rest-or-blocked',
    ]

    for (const manifest of Object.values(ETSY_OPS_AGENT_ANIMATION_MANIFESTS)) {
      expect(manifest.clips.map((clip) => clip.state)).toEqual(expect.arrayContaining(requiredStates))
      for (const state of requiredStates) {
        const clip = manifest.clips.find((candidate) => candidate.state === state)
        expect(clip?.motionFrameCount).toBeGreaterThanOrEqual(state.startsWith('walk-') || state === 'carry-packet' ? 48 : 24)
      }
    }
  })

  it('converts every live marketplace/supplier/paid intent into manual approval packets only', () => {
    for (const actionId of ['simulate-live-publish', 'edit-live-listing', 'message-supplier', 'buy-sample', 'queue-shotlab-prep'] as const) {
      const policy = etsyOpsActionPolicyById(actionId)
      expect(policy).toMatchObject({
        riskClass: 'approval-required',
        mode: 'manual-approval-packet',
        createsKanbanCard: true,
        liveExternalMutation: false,
      })
    }
  })

  it('does not expose any policy that can mutate external systems live', () => {
    for (const policy of ETSY_OPS_ACTION_POLICIES) expect(policy.liveExternalMutation).toBe(false)
    expect(ETSY_OPS_ACTION_POLICIES.filter((policy) => policy.targetSystem === 'etsy-shop').every((policy) => policy.mode === 'manual-approval-packet')).toBe(true)
    expect(ETSY_OPS_ACTION_POLICIES.filter((policy) => policy.targetSystem === 'supplier-marketplace').every((policy) => policy.mode === 'manual-approval-packet')).toBe(true)
  })
})
