import { describe, expect, it } from 'vitest'
import { createEmptyWorkspaceKernelPersistedState } from '../store'
import { applyWorkspaceKernelEventIngress } from './hermes-event-ingress'

describe('workspace kernel Hermes event ingress adapter', () => {
  it('accepts known typed events and records a local run.started event', () => {
    const result = applyWorkspaceKernelEventIngress({
      producer: 'hermes',
      blueprintId: 'etsy-smart-product-intake-v1',
      eventType: 'run.started',
      summary: 'Hermes readback: stage Smart Intake locally for Dolaro links and images.',
      telemetry: {
        targetRoomId: 'etsy-market-lab',
        targetStationId: 'etsy-loki-product-hunt',
        motion: 'basic_station_walk',
      },
    }, createEmptyWorkspaceKernelPersistedState(100), 101)

    expect(result.ok).toBe(true)
    expect(result.run?.blueprintId).toBe('etsy-smart-product-intake-v1')
    expect(result.event).toMatchObject({
      type: 'run.started',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
    })
    expect(result.telemetry).toMatchObject({
      agentId: 'loki',
      motion: 'basic_station_walk',
      safety: 'local-only-locked',
    })
    expect(result.safety).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('converts live-risk readbacks into local approval gates without unlocking actions', () => {
    const result = applyWorkspaceKernelEventIngress({
      producer: 'controlled-worker',
      blueprintId: 'etsy-smart-product-intake-v1',
      eventType: 'artifact.created',
      summary: 'Publish and upload the live Etsy listing after paid generation.',
    }, createEmptyWorkspaceKernelPersistedState(200), 201)

    expect(result.ok).toBe(true)
    expect(result.run?.blueprintId).toBe('approval-gate-v1')
    expect(result.run?.status).toBe('waiting_approval')
    expect(result.event?.type).toBe('approval.requested')
    expect(result.telemetry?.motion).toBe('waiting_approval')
    expect(result.run?.safety).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('fails closed on invalid shapes', () => {
    const state = createEmptyWorkspaceKernelPersistedState(300)
    const result = applyWorkspaceKernelEventIngress({
      producer: 'unknown',
      eventType: 'run.started',
      summary: 'bad',
    }, state, 301)

    expect(result.ok).toBe(false)
    expect(result.state).toBe(state)
  })
})
