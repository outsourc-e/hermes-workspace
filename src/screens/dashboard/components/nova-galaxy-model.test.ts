import { describe, expect, it } from 'vitest'
import {
  buildGalaxyModel,
  focusBodyForNavigation,
  focusDistanceForSystem,
  folderTintFor,
  resolveProjectedLabels,
  selectLabelCandidates,
} from './nova-galaxy-model'
import type {
  CelestialBody,
  KnowledgeGraphResponse,
  PlanetarySystem,
} from './nova-galaxy-model'

function graph(): KnowledgeGraphResponse {
  return {
    nodes: [
      { id: 'hub.md', title: 'Hub note', folder: 'agents/claude', path: 'hub.md' },
      { id: 'a.md', title: 'Note A', folder: 'agents/claude', path: 'a.md' },
      { id: 'b.md', title: 'Note B', folder: 'agents/claude', path: 'b.md' },
      { id: 'c.md', title: 'Note C', folder: 'knowledge', path: 'c.md' },
      { id: 'd.md', title: 'Note D', folder: 'knowledge', path: 'd.md' },
      { id: 'e.md', title: 'Note E', folder: 'agents/gpt', path: 'e.md' },
      { id: 'f.md', title: 'Note F', folder: 'agents/gpt', path: 'f.md' },
      { id: 'g.md', title: 'Note G', folder: 'agents/gpt', path: 'g.md' },
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
      { source: 'e.md', target: 'f.md' },
      { source: 'e.md', target: 'g.md' },
      { source: 'f.md', target: 'e.md' },
    ],
  }
}

function distance3(
  a: { baseX: number; baseY: number; baseZ: number },
  b: { baseX: number; baseY: number; baseZ: number },
): number {
  const dx = a.baseX - b.baseX
  const dy = a.baseY - b.baseY
  const dz = a.baseZ - b.baseZ
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

describe('buildGalaxyModel', () => {
  it('crowns the most-linked note as the core', () => {
    const model = buildGalaxyModel(graph())
    expect(model.core?.id).toBe('hub.md')
    expect(model.core?.kind).toBe('core')
  })

  it('ranks highly connected hubs above passive notes for operational sizing', () => {
    const model = buildGalaxyModel(graph())
    const core = model.bodyById.get('hub.md')
    const leaf = model.bodyById.get('a.md')

    expect(core?.importance).toBeGreaterThan(leaf?.importance ?? 0)
  })

  it('navigates a selected idea into its owning system hub', () => {
    const model = buildGalaxyModel(graph())
    const leaf = model.bodyById.get('a.md') ?? null

    expect(focusBodyForNavigation(model, leaf)?.id).toBe('hub.md')
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

  it('separates major systems into distinct operational neighborhoods', () => {
    const model = buildGalaxyModel(graph())
    const planets = model.systems.map((system) => system.planet)
    expect(planets.length).toBeGreaterThanOrEqual(2)

    let minPlanetDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < planets.length; i += 1) {
      for (let j = i + 1; j < planets.length; j += 1) {
        minPlanetDistance = Math.min(
          minPlanetDistance,
          distance3(planets[i], planets[j]),
        )
      }
    }
    expect(minPlanetDistance).toBeGreaterThan(18)

    const depths = planets.map((planet) => planet.baseZ)
    const depthSpan = Math.max(...depths) - Math.min(...depths)
    const heights = planets.map((planet) => planet.baseY)
    const heightSpan = Math.max(...heights) - Math.min(...heights)
    expect(depthSpan + heightSpan).toBeGreaterThan(24)
  })

  it('keeps tags near their planet but not stacked into a single point', () => {
    const model = buildGalaxyModel(graph())
    const system = model.systems.find((entry) => entry.tags.length >= 2)
    expect(system).toBeTruthy()
    if (!system) return

    for (const tag of system.tags) {
      const radial = distance3(tag, system.planet)
      expect(radial).toBeGreaterThan(7)
      expect(radial).toBeLessThan(42)
    }
  })
})

describe('folderTintFor', () => {
  it('maps known operational folders to distinct system colors', () => {
    expect(folderTintFor('agents/claude')).toBe('#FFB347')
    expect(folderTintFor('agents/gpt')).toBe('#FF8C1A')
    expect(folderTintFor('agents/kimi')).toBe('#63C7FF')
    expect(folderTintFor('knowledge')).toBe('#9DDCFF')
    expect(folderTintFor('inbox')).toBe('#2E7FD9')
    expect(folderTintFor('misc-projects')).toBe('#9DDCFF')
  })
})

describe('focusDistanceForSystem', () => {
  it('pulls closer for small systems and stays farther for large ones', () => {
    const small = {
      bodyCount: 3,
      sizeTier: 1,
      planet: { kind: 'planet', sizeTier: 1, importance: 10 },
    } as PlanetarySystem
    const large = {
      bodyCount: 48,
      sizeTier: 5,
      planet: { kind: 'core', sizeTier: 5, importance: 80 },
    } as PlanetarySystem

    const near = focusDistanceForSystem(small)
    const far = focusDistanceForSystem(large)
    expect(far).toBeGreaterThan(near)
    expect(near).toBeGreaterThanOrEqual(12)
    expect(far).toBeLessThanOrEqual(36)
  })
})

describe('selectLabelCandidates / resolveProjectedLabels', () => {
  it('limits overview labels to hubs and a few high-importance tags', () => {
    const model = buildGalaxyModel(graph())
    const candidates = selectLabelCandidates({
      model,
      selectedBody: null,
      hoveredBody: null,
      searchTerm: '',
      mode: 'overview',
    })

    const planetCount = candidates.filter((item) => item.kind === 'planet').length
    const tagCount = candidates.filter((item) => item.kind === 'tag').length
    expect(planetCount).toBeLessThanOrEqual(8)
    expect(tagCount).toBeLessThanOrEqual(4)
    expect(candidates.some((item) => item.body.kind === 'core')).toBe(true)
  })

  it('reveals more local tags when a system is focused', () => {
    const model = buildGalaxyModel(graph())
    const leaf = model.bodyById.get('a.md') ?? null
    const focused = selectLabelCandidates({
      model,
      selectedBody: leaf,
      hoveredBody: null,
      searchTerm: '',
      mode: 'focus',
    })
    const overview = selectLabelCandidates({
      model,
      selectedBody: null,
      hoveredBody: null,
      searchTerm: '',
      mode: 'overview',
    })
    const focusedTags = focused.filter((item) => item.kind === 'tag').length
    const overviewTags = overview.filter((item) => item.kind === 'tag').length
    expect(focusedTags).toBeGreaterThan(overviewTags)
  })

  it('keeps focus labels local instead of flooding every system', () => {
    const model = buildGalaxyModel(graph())
    const leaf = model.bodyById.get('a.md') ?? null
    const selectedSystem = leaf
      ? model.systemByBodyId.get(leaf.id)
      : undefined
    const focused = selectLabelCandidates({
      model,
      selectedBody: leaf,
      hoveredBody: null,
      searchTerm: '',
      mode: 'focus',
    })

    expect(focused.length).toBeLessThanOrEqual(22)
    const foreignTags = focused.filter(
      (item) =>
        item.kind === 'tag' &&
        item.body.systemId &&
        item.body.systemId !== selectedSystem?.id,
    )
    expect(foreignTags.length).toBe(0)
  })

  it('rejects overlapping lower-priority labels in screen space', () => {
    const model = buildGalaxyModel(graph())
    const core = model.core
    const leaf = model.bodyById.get('a.md')
    expect(core && leaf).toBeTruthy()
    if (!core || !leaf) return

    const resolved = resolveProjectedLabels(
      [
        {
          id: core.id,
          kind: 'planet',
          body: core,
          x: 100,
          y: 100,
          scale: 1,
          opacity: 1,
          active: true,
          priority: 100,
        },
        {
          id: leaf.id,
          kind: 'tag',
          body: leaf,
          x: 104,
          y: 102,
          scale: 0.8,
          opacity: 0.5,
          active: false,
          priority: 10,
        },
      ],
      28,
    )

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.id).toBe(core.id)
  })
})
