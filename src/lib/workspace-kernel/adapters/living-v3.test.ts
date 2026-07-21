import { describe, expect, it } from 'vitest'
import { createWorkspaceArtifactForRun, createWorkspaceRun } from '../reducer'
import { routeWorkspaceActionToBlueprint } from '../router'
import {
  workspaceArtifactToRoomPacket,
  workspaceRunToLivingV3Task,
  workspaceRunToStationAction,
} from './living-v3'

describe('workspace kernel Living V3 adapter', () => {
  it('maps Etsy Smart Intake runs to the existing Station Action Router path', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'adapter-etsy',
      createdAtMs: 300,
      source: 'ui',
      intent: 'smart intake',
      summary: 'Dolaro AliExpress Google Drive local image prompt',
      input: { text: 'Dolaro AliExpress Google Drive local image prompt' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 300)
    const result = workspaceRunToStationAction(run, 301)

    expect(result?.route.stationHandoff.toolId).toBe('smart-intake-v2')
    expect(result?.route.target).toMatchObject({
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      surfaceId: 'smart-intake',
    })
    expect(result?.movement).toMatchObject({
      agentId: 'loki',
      mode: 'basic_station_walk',
    })
    expect(result?.movement.agentId).not.toBe('julius')
  })

  it('maps non-Etsy runs to basic Living V3 task metadata', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'adapter-cad',
      createdAtMs: 302,
      source: 'ui',
      intent: 'cad',
      summary: 'STL OpenSCAD print prep',
      input: { text: 'STL OpenSCAD print prep' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 302)
    const task = workspaceRunToLivingV3Task(run)

    expect(task).toMatchObject({
      agentId: 'terra',
      roomId: 'terra-forge',
      stationId: 'terra-modeling-studio',
      kind: 'approval',
      badge: 'blocked',
    })
  })

  it('converts artifacts to portable room packet readback', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'adapter-news',
      createdAtMs: 303,
      source: 'ui',
      intent: 'daily news',
      summary: 'Daily news briefing',
      input: { text: 'Daily news briefing' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 303)
    const artifact = createWorkspaceArtifactForRun(run, route.blueprint, 304)
    const packet = workspaceArtifactToRoomPacket(artifact)
    const task = workspaceRunToLivingV3Task(run)

    expect(task.agentId).toBe('heimdall')
    expect(task.agentId).not.toBe('signal-runner')
    expect(packet).toMatchObject({
      packetId: artifact.artifactId,
      runId: run.runId,
      kind: 'news-brief-packet',
      roomId: 'gateway-cockpit',
      stationId: 'gateway-console',
      dataOrigin: 'approval-required',
    })
  })
})
