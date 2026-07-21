import { describe, expect, it } from 'vitest'
import {
  OBSIDIAN_CONTEXT_FORBIDDEN_ACTIONS,
  WORKSPACE_CONTEXT_PACKET_EXCERPT_MAX_CHARS,
  buildWorkspaceContextPacket,
} from './context-packet'

describe('buildWorkspaceContextPacket', () => {
  it('creates a compact local-only packet with provenance and safety rails', () => {
    const packet = buildWorkspaceContextPacket({
      createdAtMs: 1000,
      targetRoomId: 'etsy-market-lab',
      targetStationId: 'etsy-loki-product-hunt',
      mission: 'Use Obsidian context for local Odin product prep only.',
      sourceNotes: [
        {
          noteId: 'obsidian:wiki/hot.md',
          title: 'Hot Cache',
          relativePath: 'wiki/hot.md',
          kind: 'hot-cache',
          status: 'loaded',
          content: [
            '# Hot Cache',
            '- Decision: Obsidian context must be scoped and auditable.',
            '- Safety: local-only, frozen, no live actions.',
            '- Artifact: Kernel Store V2 obsidian-context-packet.',
          ].join('\n'),
        },
      ],
    })

    expect(packet).toMatchObject({
      version: 'obsidian-context-packet-v1',
      packetId: 'obsidian-context-1000',
      targetRoomId: 'etsy-market-lab',
      targetStationId: 'etsy-loki-product-hunt',
      localOnly: true,
      writebackAllowed: false,
    })
    expect(packet.sourceNotes[0]).toMatchObject({
      noteId: 'obsidian:wiki/hot.md',
      relativePath: 'wiki/hot.md',
      status: 'loaded',
    })
    expect(packet.decisions.join(' ')).toContain('Obsidian context must be scoped')
    expect(packet.safetyRails).toEqual(expect.arrayContaining(['localOnly:true', 'writebackAllowed:false']))
    expect(packet.forbiddenActions).toEqual(expect.arrayContaining(OBSIDIAN_CONTEXT_FORBIDDEN_ACTIONS))
  })

  it('caps mission and excerpts instead of carrying a raw vault dump', () => {
    const packet = buildWorkspaceContextPacket({
      createdAtMs: 2000,
      targetRoomId: 'olympus-command',
      targetStationId: 'mission-router',
      mission: 'x'.repeat(2_000),
      sourceNotes: [
        {
          noteId: 'obsidian:long',
          title: 'Long',
          relativePath: 'wiki/hot.md',
          kind: 'hot-cache',
          status: 'loaded',
          content: 'very long context '.repeat(500),
        },
      ],
    })

    expect(packet.mission.length).toBeLessThanOrEqual(360)
    expect(packet.sourceNotes[0].excerpt.length).toBeLessThanOrEqual(WORKSPACE_CONTEXT_PACKET_EXCERPT_MAX_CHARS)
    expect(packet.sourceNotes[0].excerpt).toContain('...')
  })
})
