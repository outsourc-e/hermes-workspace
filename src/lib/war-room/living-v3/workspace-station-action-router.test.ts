import { describe, expect, it } from 'vitest'
import { routeWorkspaceStationActionEvent } from './workspace-station-action-router'

function actionTypes(result: ReturnType<typeof routeWorkspaceStationActionEvent>) {
  return result.uiActions.map((action) => action.type)
}

describe('Workspace station action router', () => {
  it('routes messy Hermes events into Smart Intake V2 with local UI actions', () => {
    const result = routeWorkspaceStationActionEvent({
      eventId: 'event-messy-smart-intake',
      source: 'controlled-worker',
      kind: 'prefill_tool',
      taskText: [
        'Find Dolaro jewelry products from AliExpress links, Google Drive images, Google Sheet rows,',
        'local files, local images, and a freeform prompt, then stage the best candidate for ShotLab/SEO/draft approval.',
      ].join(' '),
      payload: { packetLabel: 'messy-source-packet' },
    }, 123)

    expect(result.route.stationHandoff.toolId).toBe('smart-intake-v2')
    expect(result.route.target).toMatchObject({
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      surfaceId: 'smart-intake',
      action: 'open_and_prefill_smart_intake',
    })
    expect(actionTypes(result)).toEqual(expect.arrayContaining([
      'focus_station',
      'set_tool_surface',
      'prefill_tool',
      'record_receipt',
      'queue_basic_agent_motion',
    ]))
    expect(result.movement).toMatchObject({
      mode: 'basic_station_walk',
      agentId: 'loki',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      naturalMotionReady: true,
      polishedAutonomyReady: false,
    })
    expect(result.movement.agentId).not.toBe('julius')
  })

  it('uses explicit valid tool hints before freeform task text', () => {
    const result = routeWorkspaceStationActionEvent({
      source: 'hermes',
      kind: 'open_station',
      toolId: 'seo-workbench',
      taskText: 'Open whatever station is appropriate for this product packet.',
    }, 456)

    expect(result.route.stationHandoff.toolId).toBe('seo-workbench')
    expect(result.route.target).toMatchObject({
      stationId: 'etsy-thor-seo-metrics',
      surfaceId: 'seo-workbench',
    })
    expect(result.movement.agentId).toBe('thor')
  })

  it('uses explicit known station hints before freeform task text', () => {
    const result = routeWorkspaceStationActionEvent({
      source: 'hermes',
      kind: 'open_station',
      stationId: 'etsy-thor-shotlab-prep',
      taskText: 'Open the relevant station.',
    }, 789)

    expect(result.route.stationHandoff.toolId).toBe('shotlab-handoff')
    expect(result.route.target).toMatchObject({
      stationId: 'etsy-thor-shotlab-prep',
      surfaceId: 'shotlab-handoff',
    })
    expect(result.movement.agentId).toBe('thor')
  })

  it('keeps hidden worker and new-agent requests blocked and non-spawning', () => {
    const result = routeWorkspaceStationActionEvent({
      source: 'hermes',
      kind: 'route_task',
      taskText: 'Create a new agent worker swarm for sorting products and fan-out.',
    }, 1_000)

    expect(result.route.recommendation.decision).toBe('create_hidden_worker')
    expect(result.route.target.action).toBe('blocked_hidden_worker')
    expect(result.route.stationHandoff.status).toBe('blocked')
    expect(result.safety.workerSpawnAllowed).toBe(false)
    expect(result.safety.spawnsWorkers).toBe(false)
    expect(result.safety.usageAllowed).toBe(false)
  })

  it('routes upload publish approval requests to local approval while locked', () => {
    const result = routeWorkspaceStationActionEvent({
      source: 'controlled-worker',
      kind: 'request_approval',
      taskText: 'Request approval before any upload, publish, or Etsy draft action.',
      readback: 'DLV approval requested for local packet only.',
    }, 1_100)

    expect(result.route.stationHandoff.toolId).toBe('approval-inbox')
    expect(result.route.target).toMatchObject({
      roomId: 'olympus-command',
      stationId: 'mission-router',
      surfaceId: 'approval-inbox',
    })
    expect(actionTypes(result)).toContain('request_approval_local')
    expect(result.safety).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
      acceptsOnlyTypedEvents: true,
      mutatesExternalSystems: false,
      spawnsWorkers: false,
    })
  })
})
