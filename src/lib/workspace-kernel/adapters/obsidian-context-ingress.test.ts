import { describe, expect, it } from 'vitest'
import { createEmptyWorkspaceKernelPersistedState } from '../store'
import { buildWorkspaceContextPacket } from '../context-packet'
import { applyWorkspaceKernelEventIngress } from './hermes-event-ingress'
import {
  workspaceArtifactFromObsidianContextPacket,
  workspaceKernelEventIngressFromObsidianContextPacket,
} from './obsidian-context-ingress'

function packet() {
  return buildWorkspaceContextPacket({
    createdAtMs: 4000,
    targetRoomId: 'etsy-market-lab',
    targetStationId: 'etsy-loki-product-hunt',
    mission: 'Attach scoped context.',
    sourceNotes: [
      {
        noteId: 'obsidian:wiki/hot.md',
        title: 'Hot Cache',
        relativePath: 'wiki/hot.md',
        kind: 'hot-cache',
        status: 'loaded',
        content: 'Decision: keep context local-only.',
      },
    ],
  })
}

describe('workspaceKernelEventIngressFromObsidianContextPacket', () => {
  it('creates a local artifact.created ingress for Odin, never Julius', () => {
    const contextPacket = packet()
    const ingress = workspaceKernelEventIngressFromObsidianContextPacket(contextPacket)

    expect(ingress).toMatchObject({
      producer: 'hermes',
      blueprintId: 'generic-project-status-v1',
      eventType: 'artifact.created',
      telemetry: {
        agentId: 'loki',
        targetRoomId: 'etsy-market-lab',
        targetStationId: 'etsy-loki-product-hunt',
        motion: 'working',
      },
    })
    expect(ingress.telemetry?.agentId).not.toBe('julius')
    expect(ingress.artifact).toMatchObject({
      kind: 'obsidian-context-packet',
      dataOrigin: 'local-only',
      roomId: 'etsy-market-lab',
      stationId: 'etsy-loki-product-hunt',
      payload: { packet: contextPacket },
    })
  })

  it('records an artifact.created kernel event with the obsidian-context-packet kind', () => {
    const state = createEmptyWorkspaceKernelPersistedState(3900)
    const result = applyWorkspaceKernelEventIngress(
      workspaceKernelEventIngressFromObsidianContextPacket(packet()),
      state,
      4100,
    )

    expect(result.ok).toBe(true)
    expect(result.event?.type).toBe('artifact.created')
    expect(result.telemetry).toMatchObject({
      agentId: 'loki',
      motion: 'working',
      artifactKind: 'obsidian-context-packet',
    })
    expect(result.run?.artifacts[0]).toMatchObject({
      kind: 'obsidian-context-packet',
      dataOrigin: 'local-only',
    })
  })

  it('carries missing source provenance and locked actions into the artifact', () => {
    const contextPacket = buildWorkspaceContextPacket({
      createdAtMs: 4200,
      targetRoomId: 'etsy-market-lab',
      targetStationId: 'etsy-loki-product-hunt',
      sourceNotes: [
        {
          noteId: 'obsidian:missing',
          title: 'Missing',
          relativePath: 'wiki/hot.md',
          kind: 'hot-cache',
          status: 'missing',
        },
      ],
    })
    const artifact = workspaceArtifactFromObsidianContextPacket(contextPacket)

    expect(artifact.missingFields.join(' ')).toContain('wiki/hot.md:missing')
    expect(artifact.lockedActions.join(' ')).toContain('Obsidian vault writeback')
  })
})
