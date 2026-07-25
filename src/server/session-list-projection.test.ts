import { describe, expect, it } from 'vitest'

import { projectSessionListLineage } from './session-list-projection'
import type { SessionSummary } from '../screens/chat/types'

type ListSession = SessionSummary & {
  key: string
  friendlyId: string
}

function session(
  key: string,
  overrides: Partial<ListSession> = {},
): ListSession {
  return {
    key,
    friendlyId: key,
    updatedAt: 1,
    ...overrides,
  }
}

describe('projectSessionListLineage', () => {
  it('classifies continuation, branch, child, local, and orphan rows on the server', () => {
    const rows = projectSessionListLineage([
      session('parent', {
        lineage: {
          source: 'cli',
          endReason: 'compression',
          endedAt: 2_000,
        },
      }),
      session('continuation', {
        lineage: {
          parentSessionId: 'parent',
          source: 'cli',
          startedAt: 2_000,
        },
      }),
      session('fork', {
        lineage: {
          parentSessionId: 'parent',
          sessionSource: 'fork',
        },
      }),
      session('child', {
        lineage: {
          parentSessionId: 'parent',
          relationshipType: 'child_session',
        },
      }),
      session('local', {
        source: 'local',
        lineage: { source: 'local', parentSessionId: 'missing' },
      }),
      session('orphan', {
        lineage: { parentSessionId: 'missing' },
      }),
    ])

    expect(
      Object.fromEntries(
        rows.map((row) => [row.key, row.lineage.relationshipKind]),
      ),
    ).toEqual({
      parent: 'root',
      continuation: 'continuation',
      fork: 'branch',
      child: 'child',
      local: 'root',
      orphan: 'orphan',
    })
  })

  it('fails open for corrupt old metadata and emits a kind for every row', () => {
    const corrupt = session('corrupt', {
      lineage: {
        parentSessionId: 42,
        relationshipType: { unexpected: true },
        source: ['invalid'],
      } as unknown as ListSession['lineage'],
    })

    expect(() => projectSessionListLineage([corrupt])).not.toThrow()
    expect(projectSessionListLineage([corrupt])[0]?.lineage).toEqual({
      relationshipKind: 'root',
    })
  })
})
