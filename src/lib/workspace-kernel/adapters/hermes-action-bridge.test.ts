import { describe, expect, it } from 'vitest'
import { routeWorkspaceStationActionEvent } from '../../war-room/living-v3/workspace-station-action-router'
import { workspaceKernelEventIngressFromStationAction } from './hermes-action-bridge'

describe('Hermes Action Bridge V3 adapter', () => {
  it('maps a Hermes Smart Intake station action into a typed durable kernel ingress event', () => {
    const stationAction = routeWorkspaceStationActionEvent({
      source: 'hermes',
      kind: 'prefill_tool',
      taskText: 'Find a gold initial necklace product from local evidence and stage it for Smart Intake.',
      toolId: 'smart-intake-v2',
      readback: 'Hermes requested local Smart Intake staging.',
    }, 1_000)

    const ingress = workspaceKernelEventIngressFromStationAction(stationAction)

    expect(ingress).toMatchObject({
      producer: 'hermes',
      blueprintId: 'etsy-smart-product-intake-v1',
      eventType: 'artifact.created',
      telemetry: {
        agentId: 'loki',
        targetRoomId: 'etsy-market-lab',
        targetStationId: 'etsy-loki-product-hunt',
        motion: 'basic_station_walk',
      },
    })
    expect(ingress.summary).toContain('Hermes Action Bridge V3')
    expect(ingress.summary).toContain('no worker spawn')
  })

  it('keeps approval routes as local approval ingress events', () => {
    const stationAction = routeWorkspaceStationActionEvent({
      source: 'hermes',
      kind: 'request_approval',
      taskText: 'Review upload and publish locks before any live Etsy action.',
      toolId: 'approval-inbox',
      readback: 'Review only.',
    }, 2_000)

    const ingress = workspaceKernelEventIngressFromStationAction(stationAction)

    expect(ingress.blueprintId).toBe('approval-gate-v1')
    expect(ingress.eventType).toBe('approval.requested')
    expect(ingress.telemetry?.agentId).not.toBe('julius')
  })
})
