import { describe, expect, it } from 'vitest'
import { retiredWarRoomAgentAlias } from '../war-room/body/worker-profiles'
import { attachWorkspaceArtifact, createWorkspaceApprovalForRun, createWorkspaceArtifactForRun, createWorkspaceRun, recordWorkspaceRunPacketEvent, requestWorkspaceApproval } from './reducer'
import { routeWorkspaceActionToBlueprint } from './router'
import { buildKernelAgentDisplayStates, kernelAgentDisplayStateToLivingTask, latestKernelAgentDisplayState } from './motion'

describe('workspace kernel event-driven motion display state', () => {
  it('maps Etsy intake events to Odin at Loki Product Hunt and never Julius', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'motion-etsy',
      createdAtMs: 100,
      source: 'ui',
      intent: 'smart intake',
      summary: 'Dolaro AliExpress Drive Sheet local prompt',
      input: { text: 'Dolaro AliExpress Drive Sheet local prompt' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 100)
    const artifact = createWorkspaceArtifactForRun(run, route.blueprint, 102)
    const state = attachWorkspaceArtifact({ runs: [run] }, run.runId, artifact)
    const displays = buildKernelAgentDisplayStates({
      runs: state.runs,
      events: state.runs.flatMap((item) => item.events),
    })
    const display = latestKernelAgentDisplayState({
      runs: state.runs,
      events: state.runs.flatMap((item) => item.events),
    })

    expect(displays.map((item) => item.agentId)).toContain('loki')
    expect(display).toMatchObject({
      agentId: 'loki',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      mode: 'working',
      currentArtifactKind: 'product-candidate-packet',
    })
    expect(displays.map((item) => item.agentId)).not.toContain('julius')
  })

  it('maps approval requests to waiting approval tasks', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'motion-approval',
      createdAtMs: 200,
      source: 'ui',
      intent: 'publish',
      summary: 'Publish upload live Etsy listing',
      input: { text: 'publish upload live listing' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 200)
    const approval = createWorkspaceApprovalForRun(run, route.blueprint, 202)
    const state = requestWorkspaceApproval({ runs: [run] }, run.runId, approval)
    const display = latestKernelAgentDisplayState({
      runs: state.runs,
      events: state.runs.flatMap((item) => item.events),
    })!
    const task = kernelAgentDisplayStateToLivingTask(display)

    expect(display.mode).toBe('waiting_approval')
    expect(task.kind).toBe('approval')
    expect(task.badge).toBe('approval')
    expect(task.packetLabel).toBe('kernel event')
  })

  it('maps council worker profile events to that general instead of a shared visual persona', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'motion-council',
      createdAtMs: 300,
      source: 'ui',
      intent: 'council opinion',
      summary: 'Hannibal should review hidden risks',
      requestedWorkerProfileId: 'council-hannibal',
      input: { text: 'Hannibal should review hidden risks' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 300)
    const display = latestKernelAgentDisplayState({
      runs: [run],
      events: run.events,
    })!

    expect(run.assignedWorkerProfileId).toBe('council-hannibal')
    expect(display.agentId).toBe('hannibal')
    expect(display.roomId).toBe('council-strategists')
    expect(display.stationId).toBe('council-table')
  })

  it('keeps council artifacts in the council room instead of the generic blueprint room', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'council-artifact-room',
      createdAtMs: 400,
      source: 'ui',
      intent: 'council strategy round',
      summary: 'Council should review alert language',
      input: { text: 'Ask the council to review alert language.' },
      requestedWorkerProfileId: 'council-julius',
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 400)
    const artifact = createWorkspaceArtifactForRun(run, route.blueprint, 401)

    expect(run.ownerRoomId).toBe('council-strategists')
    expect(artifact.roomId).toBe('council-strategists')
    expect(artifact.stationId).toBe('council-table')
  })

  it('routes Gateway display work to Heimdall instead of the retired Signal Runner alias', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'motion-gateway-canonical-owner',
      createdAtMs: 450,
      source: 'ui',
      intent: 'daily news',
      summary: 'Daily news channel readback',
      input: { text: 'Prepare a daily news briefing and channel readback.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 450)
    const display = latestKernelAgentDisplayState({ runs: [run], events: run.events })!

    expect(run.blueprintId).toBe('daily-news-content-v1')
    expect(display.agentId).toBe('heimdall')
    expect(display.agentId).not.toBe('signal-runner')
    expect(retiredWarRoomAgentAlias(display.agentId)).toBeNull()
    expect(display.roomId).toBe('gateway-cockpit')
  })

  it('maps every Packet lifecycle event to working or blocked without changing map routing', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'motion-packet-events',
      createdAtMs: 500,
      source: 'hermes',
      intent: 'packet lifecycle projection',
      summary: 'Project Packet lifecycle into existing motion states',
      input: { text: 'Local packet events only.' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 500, {
      executionPlanPacketId: 'packet-plan-motion',
    })
    const cases = [
      ['packet.created', 'working'],
      ['packet.ready', 'working'],
      ['packet.offered', 'working'],
      ['packet.acknowledged', 'working'],
      ['packet.superseded', 'working'],
      ['packet.blocked', 'blocked'],
      ['packet.rejected', 'blocked'],
    ] as const

    for (const [index, [type, expectedMode]] of cases.entries()) {
      const state = recordWorkspaceRunPacketEvent({ runs: [run] }, run.runId, {
        type,
        packetId: `packet-motion-${index}`,
        ...(type === 'packet.acknowledged'
          ? { ackId: 'ack-motion', outcome: 'accepted' as const }
          : {}),
      }, 510 + index)
      const display = latestKernelAgentDisplayState({
        runs: state.runs,
        events: state.runs.flatMap((item) => item.events),
      })

      expect(display).toMatchObject({
        agentId: 'hermes',
        roomId: run.ownerRoomId,
        stationId: run.ownerStationId,
        mode: expectedMode,
      })
    }
  })
})
