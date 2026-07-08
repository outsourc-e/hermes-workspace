import { describe, expect, it } from 'vitest'
import { buildGalaxyModel } from './nova-galaxy-model'
import type { KnowledgeGraphResponse } from './nova-galaxy-model'

function graph(): KnowledgeGraphResponse {
  return {
    nodes: [
      { id: 'hub.md', title: 'Hub note', folder: 'agents/claude', path: 'hub.md' },
      { id: 'a.md', title: 'Note A', folder: 'agents/claude', path: 'a.md' },
      { id: 'b.md', title: 'Note B', folder: 'agents/claude', path: 'b.md' },
      { id: 'c.md', title: 'Note C', folder: 'knowledge', path: 'c.md' },
      { id: 'd.md', title: 'Note D', folder: 'knowledge', path: 'd.md' },
      {
        id: 'lonely.md',
        title: 'Lonely note',
        folder: 'inbox',
        path: 'lonely.md',
      },
    ],
    edges: [
      { source: 'hub.md', target: 'a.md' },
      { source: 'hub.md', target: 'b.md' },
      { source: 'a.md', target: 'hub.md' },
      { source: 'c.md', target: 'hub.md' },
      { source: 'c.md', target: 'd.md' },
    ],
  }
}

describe('buildGalaxyModel', () => {
  it('crowns the most-linked note as the core', () => {
    const model = buildGalaxyModel(graph())
    expect(model.core.id).toBe('hub.md')
    expect(model.core.kind).toBe('core')
  })

  it('turns orphan notes into comets', () => {
    const model = buildGalaxyModel(graph())
    const lonely = model.bodyById.get('lonely.md')
    expect(lonely?.kind).toBe('comet')
  })

  it('assigns bodies to arms derived from folders', () => {
    const model = buildGalaxyModel(graph())
    expect(model.arms.length).toBeGreaterThan(0)
    const a = model.bodyById.get('a.md')
    expect(a?.armId).toBeTruthy()
  })

  it('is deterministic for identical input', () => {
    const first = buildGalaxyModel(graph())
    const second = buildGalaxyModel(graph())
    const firstBody = first.bodyById.get('a.md')
    const secondBody = second.bodyById.get('a.md')
    expect(firstBody?.baseX).toBe(secondBody?.baseX)
    expect(firstBody?.baseY).toBe(secondBody?.baseY)
    expect(firstBody?.baseZ).toBe(secondBody?.baseZ)
  })

  it('represents every real note exactly once and invents none', () => {
    const model = buildGalaxyModel(graph())
    const inputIds = new Set(graph().nodes?.map((node) => node.id))
    for (const id of model.bodyById.keys()) {
      expect(inputIds.has(id)).toBe(true)
    }
    expect(model.bodyById.size).toBe(inputIds.size)
  })

  it('tolerates an empty graph without throwing', () => {
    const model = buildGalaxyModel({ nodes: [], edges: [] })
    expect(model.bodyById.size).toBeGreaterThanOrEqual(0)
  })
})
