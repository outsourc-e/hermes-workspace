import { describe, expect, it } from 'vitest'
import { buildWorkspaceContextPacket } from '../../context-packet'
import { ContextPayloadSchema } from '../domain/context'
import { obsidianContextV1ToWorkspacePacket } from './obsidian-context-v1'

function legacyPacket() {
  return buildWorkspaceContextPacket({
    packetId: 'legacy-context-1',
    createdAtMs: Date.parse('2026-07-19T08:00:00.000Z'),
    targetRoomId: 'olympus-command',
    targetStationId: 'command-table',
    mission: 'Continue one approved local milestone.',
    sourceNotes: [
      {
        noteId: 'decision-note',
        title: 'Workspace decision',
        relativePath: '04 Decisions/packet.md',
        kind: 'decision',
        status: 'loaded',
        updatedAt: '2026-07-19T07:30:00.000Z',
        excerpt: 'Milestone C approved. Credentials were removed.',
      },
      {
        noteId: 'missing-project-note',
        title: 'Missing project note',
        relativePath: '01 Projects/missing.md',
        kind: 'project-source-of-truth',
        status: 'missing',
      },
    ],
    decisions: ['Milestone C only.'],
    safetyRails: ['No live action.'],
    forbiddenActions: ['Milestone D persistence'],
    nextAction: 'Implement Task 14 locally.',
  })
}

function options() {
  return {
    runId: 'run-context-1',
    executionPlanPacketId: 'packet-plan-context-1',
    stepId: 'step-context-1',
    receiverAgentId: 'hermes-command',
    from: { roomId: 'data-vault', agentId: 'hermes-vault' },
  }
}

describe('obsidian-context-packet-v1 adapter', () => {
  it('maps the legacy packet without mutating it or inventing redaction audit detail', () => {
    const legacy = legacyPacket()
    const before = structuredClone(legacy)
    const packet = obsidianContextV1ToWorkspacePacket(legacy, options())
    expect(legacy).toEqual(before)
    expect(packet.packetType).toBe('context')
    expect(packet.to).toEqual({ roomId: legacy.targetRoomId, agentId: 'hermes-command' })
    expect(ContextPayloadSchema.parse(packet.payload)).toEqual(packet.payload)
    expect(packet.payload.sources.map((source) => source.rank)).toEqual([1, 2, 3])
    expect(packet.payload.contextItems.every((item) => (
      item.sourceIds.length === 1 && item.sourceIds[0] === 'legacy-packet-legacy-context-1'
    ))).toBe(true)
    expect(packet.payload.sources.every((source) => (
      source.redaction.state === 'pre_sanitized' && source.redaction.detail === 'unknown'
    ))).toBe(true)
    expect(packet.payload.sources[1].freshness).toEqual({
      policy: 'revalidate_on_use',
      observedAt: '2026-07-19T07:30:00.000Z',
      expiresAt: null,
    })
  })

  it('requires explicit Step and receiver metadata instead of guessing from room/station', () => {
    expect(() => obsidianContextV1ToWorkspacePacket(legacyPacket(), {
      ...options(),
      stepId: '',
    })).toThrow(/step/i)
    expect(() => obsidianContextV1ToWorkspacePacket(legacyPacket(), {
      ...options(),
      receiverAgentId: '',
    })).toThrow(/receiver|agent/i)
  })

  it('rejects vault traversal, absolute paths and encoded traversal', () => {
    for (const relativePath of [
      '../outside.md',
      '/Users/mac/outside.md',
      'C:/outside.md',
      '%2e%2e/outside.md',
      'folder%5C..%5Coutside.md',
      'C:%5Coutside.md',
    ]) {
      const legacy = legacyPacket()
      legacy.sourceNotes[0].relativePath = relativePath
      expect(() => obsidianContextV1ToWorkspacePacket(legacy, options())).toThrow(/vault-relative|path/i)
    }
  })

  it('keeps vault writeback locked and records missing legacy provenance', () => {
    const packet = obsidianContextV1ToWorkspacePacket(legacyPacket(), options())
    expect(packet.payload.localOnly).toBe(true)
    expect(packet.payload.writebackAllowed).toBe(false)
    expect(packet.lockedActions).toContain('Obsidian vault writeback from Workspace app')
    expect(packet.missingFields).toContain('sourceNotes.missing-project-note:missing')
  })
})
