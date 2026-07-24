import { describe, expect, it } from 'vitest'
import { buildEtsyOpsRoomState } from '../../server/war-room-etsy-ops'
import {
  buildAgentRuntimeSnapshots,
  buildRuntimeSummary,
  directionBetweenPoints,
  separateAgentCollisions,
  validateAnimationManifest,
} from './etsy-ops-living-runtime'

describe('Etsy Ops living runtime', () => {
  it('builds the V2 room around three primary living agents', () => {
    const state = buildEtsyOpsRoomState('/definitely-missing-hermes-workspace-root')

    expect(state.mode).toBe('etsy-ops-room-v2')
    expect(state.plugin.version).toBe('etsy-ops-room-v2')
    expect(state.agents.map((agent) => agent.id)).toEqual([
      'athena-market-strategist',
      'hephaestus-shotlab-artificer',
      'caesar-hermes-approval-commander',
    ])
    for (const agent of state.agents) expect(agent.modelProfileId).toBe('chatgpt-5.5')
    expect(state.agents.every((agent) => agent.route.length >= 6)).toBe(true)
  })

  it('moves agents along their room routes instead of pinning them to station cards', () => {
    const state = buildEtsyOpsRoomState('/definitely-missing-hermes-workspace-root')
    const early = buildAgentRuntimeSnapshots(state.agents, 3_100)
    const later = buildAgentRuntimeSnapshots(state.agents, 8_600)

    expect(early).toHaveLength(3)
    expect(early.some((snapshot, index) => snapshot.x !== later[index].x || snapshot.y !== later[index].y)).toBe(true)
    expect(later.some((snapshot) => snapshot.activity === 'walking' || snapshot.activity === 'carrying' || snapshot.activity === 'working')).toBe(true)
  })

  it('samples high-frame motion separately from the source sprite frame count', () => {
    const state = buildEtsyOpsRoomState('/definitely-missing-hermes-workspace-root')
    const snapshots = buildAgentRuntimeSnapshots(state.agents, 12_400)

    expect(snapshots.every((snapshot) => snapshot.motionFrameCount >= 24)).toBe(true)
    expect(snapshots.some((snapshot) => snapshot.motionFrameCount >= 48)).toBe(true)
    expect(snapshots.every((snapshot) => snapshot.spriteFrameCount >= 1)).toBe(true)
    expect(snapshots.every((snapshot) => snapshot.motionFrameIndex < snapshot.motionFrameCount)).toBe(true)
    expect(snapshots.every((snapshot) => snapshot.spriteFrameIndex < snapshot.spriteFrameCount)).toBe(true)
  })

  it('separates overlapping agents before rendering them on the living map', () => {
    const state = buildEtsyOpsRoomState('/definitely-missing-hermes-workspace-root')
    const snapshots = buildAgentRuntimeSnapshots(state.agents, 12_400)
    const overlapped = snapshots.map((snapshot) => ({ ...snapshot, x: 50, y: 50 }))
    const separated = separateAgentCollisions(overlapped)
    const distances = separated.flatMap((snapshot, index) =>
      separated.slice(index + 1).map((other) => Math.hypot(other.x - snapshot.x, other.y - snapshot.y)),
    )

    expect(Math.min(...distances)).toBeGreaterThan(1)
  })

  it('supports every motion axis needed for future generated atlases', () => {
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe('east')
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe('west')
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe('north')
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe('south')
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: 1, y: -1 })).toBe('north-east')
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: -1, y: -1 })).toBe('north-west')
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe('south-east')
    expect(directionBetweenPoints({ x: 0, y: 0 }, { x: -1, y: 1 })).toBe('south-west')
  })

  it('uses generated runtime assets instead of old style-lock candidates', () => {
    const state = buildEtsyOpsRoomState('/definitely-missing-hermes-workspace-root')
    const summary = buildRuntimeSummary(state.agents)

    expect(summary.agentCount).toBe(3)
    expect(summary.targetFramesPerAgent).toBe(96)
    expect(summary.allExternalActionsLocked).toBe(true)
    expect(summary.styleLockRequired).toBe(false)
    expect(summary.pendingFullGeneration).toEqual([])

    for (const agent of state.agents) {
      const validation = validateAnimationManifest(agent.animation)
      expect(validation.ok).toBe(true)
      expect(validation.warnings).toEqual([])
      expect(agent.animation.availableFrames).toBe(96)
      expect(agent.animation.status).toBe('runtime-ready')
      if (agent.id === 'caesar-hermes-approval-commander') {
        expect(agent.portraitUrl).toContain('/war-room/etsy-ops-julius-v1/')
        expect(agent.spriteUrl).toContain('/war-room/etsy-ops-julius-v1/')
        expect(agent.animation.id).toBe('julius-caesar-v1-runtime')
        expect(agent.animation.clips.every((clip) => clip.assetPath?.includes('/war-room/etsy-ops-julius-v1/'))).toBe(true)
      } else {
        expect(agent.portraitUrl).toContain('/war-room/etsy-ops-v4/')
        expect(agent.spriteUrl).toContain('/war-room/etsy-ops-v4/')
        expect(agent.animation.clips.every((clip) => clip.assetPath?.includes('/war-room/etsy-ops-v4/'))).toBe(true)
      }
    }
  })
})
