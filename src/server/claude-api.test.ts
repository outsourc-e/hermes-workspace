import { describe, expect, it } from 'vitest'

import { toSessionSummary } from './claude-api'
import type { ClaudeSession } from './claude-api'

describe('toSessionSummary', () => {
  it('preserves normalized compression lineage metadata', () => {
    const raw = {
      id: 'segment-2',
      title: 'Compressed chat',
      preview: 'Continue here',
      started_at: 200,
      ended_at: 300,
      last_active: 250,
      input_tokens: 4,
      output_tokens: 6,
      parent_session_id: 'segment-1',
      relationship_type: 'continuation',
      parent_title: 'Original chat',
      parent_source: 'cli',
      session_source: 'cli',
      _lineage_root_id: 'segment-1',
      _lineage_tip_id: 'segment-2',
      _compression_segment_count: 2,
      _parent_lineage_root_id: 'segment-1',
      _parent_lineage_tip_id: 'segment-1',
      pre_compression_snapshot: true,
      source: 'cli',
      end_reason: 'compression',
    } satisfies ClaudeSession

    expect(toSessionSummary(raw)).toMatchObject({
      key: 'segment-2',
      title: 'Compressed chat',
      derivedTitle: 'Compressed chat',
      tokenCount: 10,
      createdAt: 200_000,
      startedAt: 200_000,
      updatedAt: 250_000,
      lineage: {
        parentSessionId: 'segment-1',
        relationshipType: 'continuation',
        parentTitle: 'Original chat',
        parentSource: 'cli',
        sessionSource: 'cli',
        lineageRootId: 'segment-1',
        lineageTipId: 'segment-2',
        compressionSegmentCount: 2,
        parentLineageRootId: 'segment-1',
        parentLineageTipId: 'segment-1',
        isPreCompressionSnapshot: true,
        source: 'cli',
        endReason: 'compression',
        startedAt: 200_000,
        endedAt: 300_000,
      },
    })
  })

  it('preserves explicit fork and generic cross-surface child facts', () => {
    const rows = [
      {
        id: 'fork',
        parent_session_id: 'parent',
        session_source: 'fork',
        relationship_type: 'child_session',
      },
      {
        id: 'child',
        parent_session_id: 'parent',
        relationship_type: 'child_session',
        parent_title: 'Parent',
        parent_source: 'telegram',
        _parent_lineage_root_id: 'root',
        _parent_lineage_tip_id: 'tip',
        _cross_surface_child_session: true,
      },
    ] satisfies Array<ClaudeSession>

    expect(rows.map(toSessionSummary).map((row) => row.lineage)).toEqual([
      {
        parentSessionId: 'parent',
        relationshipType: 'child_session',
        sessionSource: 'fork',
      },
      {
        parentSessionId: 'parent',
        relationshipType: 'child_session',
        parentTitle: 'Parent',
        parentSource: 'telegram',
        parentLineageRootId: 'root',
        parentLineageTipId: 'tip',
        isCrossSurfaceChild: true,
      },
    ])
  })

  it('does not add an empty lineage payload to legacy rows', () => {
    const summary = toSessionSummary({
      id: 'legacy',
      title: 'Legacy',
      started_at: 100,
    })

    expect(summary).not.toHaveProperty('lineage')
  })
})
