import { describe, expect, it } from 'vitest'
import { buildVaultGraphInsights } from './vault-graph-insights'

const NOW = '2026-07-08T12:00:00.000Z'

function node(
  id: string,
  partial: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: id,
    path: `${id}.md`,
    folder: 'agents/claude',
    modified: '2026-07-07T00:00:00.000Z',
    ...partial,
  }
}

describe('buildVaultGraphInsights', () => {
  it('finds orphan notes with no edges at all', () => {
    const insights = buildVaultGraphInsights(
      {
        nodes: [node('a'), node('b'), node('lonely')],
        edges: [{ source: 'a', target: 'b' }],
      },
      NOW,
    )
    expect(insights.orphans.map((o) => o.id)).toEqual(['lonely'])
  })

  it('flags stale important notes (high degree, old modified)', () => {
    const edges = [
      { source: 'hub', target: 'a' },
      { source: 'hub', target: 'b' },
      { source: 'c', target: 'hub' },
      { source: 'd', target: 'hub' },
      { source: 'e', target: 'hub' },
    ]
    const insights = buildVaultGraphInsights(
      {
        nodes: [
          node('hub', { modified: '2026-04-01T00:00:00.000Z' }),
          node('a'),
          node('b'),
          node('c'),
          node('d'),
          node('e'),
        ],
        edges,
      },
      NOW,
    )
    expect(insights.staleImportant.map((n) => n.id)).toContain('hub')
    expect(insights.staleImportant.map((n) => n.id)).not.toContain('a')
  })

  it('detects heavily-referenced notes that never link back', () => {
    const edges = [
      { source: 'a', target: 'sink' },
      { source: 'b', target: 'sink' },
      { source: 'c', target: 'sink' },
    ]
    const insights = buildVaultGraphInsights(
      { nodes: [node('a'), node('b'), node('c'), node('sink')], edges },
      NOW,
    )
    expect(insights.missingBacklinks.map((m) => m.id)).toContain('sink')
  })

  it('surfaces duplicate title candidates', () => {
    const insights = buildVaultGraphInsights(
      {
        nodes: [
          node('n1', { title: 'Job Board Pipeline' }),
          node('n2', { title: 'job board pipeline' }),
          node('n3', { title: 'Completely different' }),
        ],
        edges: [{ source: 'n1', target: 'n3' }, { source: 'n2', target: 'n3' }],
      },
      NOW,
    )
    expect(insights.duplicateCandidates).toHaveLength(1)
    expect(insights.duplicateCandidates[0].ids.sort()).toEqual(['n1', 'n2'])
  })

  it('shapes recommendations as review inputs, never edits', () => {
    const insights = buildVaultGraphInsights(
      {
        nodes: [node('lonely'), node('x'), node('y')],
        edges: [{ source: 'x', target: 'y' }],
      },
      NOW,
    )
    expect(insights.recommendations.length).toBeGreaterThan(0)
    for (const rec of insights.recommendations) {
      expect(rec.title.length).toBeGreaterThan(0)
      expect(rec.reason.length).toBeGreaterThan(0)
      expect(rec.notePaths.length).toBeGreaterThan(0)
    }
  })

  it('caps list sizes and tolerates an empty graph', () => {
    const many = Array.from({ length: 40 }, (_, i) => node(`orphan-${i}`))
    const insights = buildVaultGraphInsights({ nodes: many, edges: [] }, NOW)
    expect(insights.orphans.length).toBeLessThanOrEqual(15)
    const empty = buildVaultGraphInsights({}, NOW)
    expect(empty.orphans).toHaveLength(0)
    expect(empty.recommendations).toHaveLength(0)
  })
})
