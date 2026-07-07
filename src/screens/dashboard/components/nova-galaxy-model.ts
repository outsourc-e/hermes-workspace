export type KnowledgeGraphNode = {
  id: string
  title: string
  path?: string
  folder?: string
  type?: string
  tags?: Array<string>
  modified?: string
  updated?: string
  summary?: string
  excerpt?: string
  wikilinks?: Array<string>
}

export type KnowledgeGraphEdge = {
  source: string
  target: string
}

export type KnowledgeGraphResponse = {
  nodes?: Array<KnowledgeGraphNode>
  edges?: Array<KnowledgeGraphEdge>
}

export type CelestialKind = 'core' | 'planet' | 'moon' | 'comet'

export type GalaxyArm = {
  id: string
  name: string
  index: number
  angle: number
  bodyCount: number
  systemCount: number
}

export type CelestialBody = KnowledgeGraphNode & {
  id: string
  title: string
  path: string
  folder: string
  kind: CelestialKind
  degree: number
  systemId?: string
  planetId?: string
  armId: string
  armIndex: number
  sizeTier: number
  recencyTier: 'hot' | 'warm' | 'cool'
  recencyAgeHours: number
  orbitRadius: number
  orbitPeriod: number
  orbitPhase: number
  orbitTilt: number
  baseX: number
  baseY: number
  jitter: number
  excerpt: string
}

export type PlanetarySystem = {
  id: string
  folder: string
  armId: string
  armIndex: number
  planet: CelestialBody
  moons: Array<CelestialBody>
  bodyCount: number
  totalLinks: number
  sizeTier: number
  baseX: number
  baseY: number
  armPosition: number
}

export type StarfieldPoint = {
  x: number
  y: number
  r: number
  layer: number
  alpha: number
  warm: boolean
}

export type GalaxyModel = {
  arms: Array<GalaxyArm>
  systems: Array<PlanetarySystem>
  bodies: Array<CelestialBody>
  comets: Array<CelestialBody>
  core: CelestialBody | null
  bodyById: Map<string, CelestialBody>
  systemById: Map<string, PlanetarySystem>
  systemByBodyId: Map<string, PlanetarySystem>
  starfield: Array<StarfieldPoint>
  totals: {
    bodies: number
    links: number
    systems: number
    comets: number
  }
}

type SeedNode = KnowledgeGraphNode & {
  id: string
  title: string
  path: string
  folder: string
  degree: number
  excerpt: string
}

const FIELD_ARM_ID = 'field-stars'

export function shortTitle(value: string): string {
  return value
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function obsidianUri(body: CelestialBody): string {
  return `obsidian://open?path=${encodeURIComponent(body.path)}`
}

function fallbackFolder(id: string): string {
  const parts = id.split(/[\\/]/).filter(Boolean)
  if (parts.length >= 2 && parts[0] === 'agents')
    return `${parts[0]}/${parts[1]}`
  return parts[0] || 'vault'
}

function normalizeNode(node: KnowledgeGraphNode): SeedNode {
  const path = node.path || node.id
  return {
    ...node,
    id: node.id,
    title: node.title || shortTitle(path),
    path,
    folder: node.folder || fallbackFolder(path),
    degree: 0,
    excerpt: node.excerpt || node.summary || '',
  }
}

function buildAdjacency(
  nodes: Array<SeedNode>,
  edges: Array<KnowledgeGraphEdge>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  for (const node of nodes) adjacency.set(node.id, new Set())
  for (const edge of edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue
    adjacency.get(edge.source)?.add(edge.target)
    adjacency.get(edge.target)?.add(edge.source)
  }
  return adjacency
}

function chooseSeeds(nodes: Array<SeedNode>): Array<SeedNode> {
  const systemCount = clamp(Math.round(Math.sqrt(nodes.length) / 2), 1, 6)
  return [...nodes]
    .sort((a, b) => b.degree - a.degree || a.title.localeCompare(b.title))
    .slice(0, systemCount)
}

function assignCommunities(
  nodes: Array<SeedNode>,
  seeds: Array<SeedNode>,
  adjacency: Map<string, Set<string>>,
): Map<string, Array<SeedNode>> {
  const communities = new Map<string, Array<SeedNode>>()
  for (const seed of seeds) communities.set(seed.id, [seed])

  for (const node of nodes) {
    if (communities.has(node.id)) continue
    let bestSeed = seeds[hashString(node.id) % Math.max(1, seeds.length)]
    let bestScore = Number.NEGATIVE_INFINITY
    const neighbors = adjacency.get(node.id) ?? new Set<string>()

    for (const seed of seeds) {
      const seedNeighbors = adjacency.get(seed.id) ?? new Set<string>()
      let shared = 0
      for (const neighbor of neighbors) {
        if (seedNeighbors.has(neighbor)) shared += 1
      }
      const direct = neighbors.has(seed.id) ? 10 : 0
      const sameType = node.type && seed.type && node.type === seed.type ? 2 : 0
      const score = direct + shared * 3 + sameType + seed.degree * 0.08
      if (score > bestScore) {
        bestScore = score
        bestSeed = seed
      }
    }

    communities.get(bestSeed.id)?.push(node)
  }

  return communities
}

function recencyFor(modified?: string): {
  tier: CelestialBody['recencyTier']
  ageHours: number
} {
  const modifiedTime = modified ? Date.parse(modified) : Number.NaN
  const ageHours = Number.isFinite(modifiedTime)
    ? Math.max(0, (Date.now() - modifiedTime) / 3_600_000)
    : 9999
  if (ageHours <= 48) return { tier: 'hot', ageHours }
  if (ageHours <= 168) return { tier: 'warm', ageHours }
  return { tier: 'cool', ageHours }
}

function systemPoint(
  arm: GalaxyArm,
  position: number,
  seed: string,
): { x: number; y: number } {
  const radius = 10 + position * 39
  const bend = position * 2.55
  const jitterAngle = ((hashString(`${seed}:angle`) % 1000) / 1000 - 0.5) * 0.24
  const jitterRadius =
    ((hashString(`${seed}:radius`) % 1000) / 1000 - 0.5) * 5.6
  const theta = arm.angle + bend + jitterAngle
  return {
    x: clamp(50 + Math.cos(theta) * (radius + jitterRadius), 7, 93),
    y: clamp(50 + Math.sin(theta) * (radius + jitterRadius) * 0.58, 9, 91),
  }
}

function cometPoint(
  index: number,
  total: number,
  seed: string,
): { x: number; y: number } {
  const lane = total <= 1 ? 0.5 : index / (total - 1)
  const side = hashString(`${seed}:side`) % 2 === 0 ? -1 : 1
  return {
    x: clamp(50 + side * (32 + (hashString(`${seed}:x`) % 18)), 2, 98),
    y: clamp(
      12 + lane * 76 + ((hashString(`${seed}:y`) % 1000) / 1000 - 0.5) * 12,
      5,
      95,
    ),
  }
}

function sizeTier(value: number, max: number): number {
  if (max <= 0) return 1
  return clamp(Math.ceil((value / max) * 5), 1, 5)
}

function orbitDistance(
  moon: SeedNode,
  planet: SeedNode,
  adjacency: Map<string, Set<string>>,
): number {
  const moonNeighbors = adjacency.get(moon.id) ?? new Set<string>()
  if (moonNeighbors.has(planet.id)) return 1
  const planetNeighbors = adjacency.get(planet.id) ?? new Set<string>()
  for (const neighbor of moonNeighbors) {
    if (planetNeighbors.has(neighbor)) return 2
  }
  return 3
}

function createBody(input: {
  node: SeedNode
  kind: CelestialKind
  arm: GalaxyArm
  systemId?: string
  planetId?: string
  baseX: number
  baseY: number
  sizeTier: number
  orbitDistance?: number
}): CelestialBody {
  const recency = recencyFor(input.node.modified || input.node.updated)
  const hash = hashString(input.node.id)
  const distance = input.orbitDistance ?? 1
  return {
    ...input.node,
    kind: input.kind,
    systemId: input.systemId,
    planetId: input.planetId,
    armId: input.arm.id,
    armIndex: input.arm.index,
    sizeTier: input.sizeTier,
    recencyTier: recency.tier,
    recencyAgeHours: recency.ageHours,
    orbitRadius: input.kind === 'moon' ? 18 + distance * 18 + (hash % 9) : 0,
    orbitPeriod: 210 + (hash % 260),
    orbitPhase: (hash % 6283) / 1000,
    orbitTilt: -0.55 + (hashString(`${input.node.id}:tilt`) % 1100) / 1000,
    baseX: input.baseX,
    baseY: input.baseY,
    jitter: ((hashString(`${input.node.id}:jitter`) % 1000) / 1000 - 0.5) * 2,
    excerpt: input.node.excerpt,
  }
}

function createStarfield(): Array<StarfieldPoint> {
  return Array.from({ length: 360 }, (_, index) => {
    const seed = `star:${index}`
    const layer = index % 3
    return {
      x: (hashString(`${seed}:x`) % 10000) / 100,
      y: (hashString(`${seed}:y`) % 10000) / 100,
      r: 0.32 + layer * 0.16 + (hashString(`${seed}:r`) % 35) / 100,
      layer,
      alpha: 0.2 + (hashString(`${seed}:a`) % 45) / 100,
      warm: hashString(`${seed}:warm`) % 5 === 0,
    }
  })
}

export function buildGalaxyModel(
  graph: KnowledgeGraphResponse | undefined,
): GalaxyModel {
  const nodes = (graph?.nodes ?? []).map(normalizeNode)
  const edges = graph?.edges ?? []
  const adjacency = buildAdjacency(nodes, edges)
  for (const node of nodes) node.degree = adjacency.get(node.id)?.size ?? 0

  const linkedNodes = nodes.filter((node) => node.degree > 0)
  const orphanNodes = nodes.filter((node) => node.degree === 0)
  const folderCounts = new Map<string, number>()
  for (const node of linkedNodes) {
    folderCounts.set(node.folder, (folderCounts.get(node.folder) ?? 0) + 1)
  }

  const mainFolders = Array.from(folderCounts.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  const armCount = clamp(mainFolders.length || 1, 2, 6)
  const arms: Array<GalaxyArm> = mainFolders.map(([name, count], index) => ({
    id: name,
    name,
    index,
    angle: -Math.PI / 2 + (Math.PI * 2 * index) / armCount,
    bodyCount: count,
    systemCount: 0,
  }))
  if (arms.length === 0) {
    arms.push({
      id: FIELD_ARM_ID,
      name: 'field stars',
      index: 0,
      angle: -Math.PI / 2,
      bodyCount: linkedNodes.length,
      systemCount: 0,
    })
  }

  const armByFolder = new Map(arms.map((arm) => [arm.id, arm]))
  const fieldArm: GalaxyArm = {
    id: FIELD_ARM_ID,
    name: 'field stars',
    index: arms.length,
    angle: Math.PI / 2,
    bodyCount: 0,
    systemCount: 0,
  }

  const nodesByArm = new Map<string, Array<SeedNode>>()
  for (const node of linkedNodes) {
    const arm = armByFolder.get(node.folder) ?? fieldArm
    const bucket = nodesByArm.get(arm.id) ?? []
    bucket.push(node)
    nodesByArm.set(arm.id, bucket)
    if (arm.id === FIELD_ARM_ID) fieldArm.bodyCount += 1
  }
  if (fieldArm.bodyCount > 0) arms.push(fieldArm)

  const maxDegree = Math.max(1, ...nodes.map((node) => node.degree))
  const coreSeed =
    linkedNodes.length > 0
      ? [...linkedNodes].sort(
          (a, b) => b.degree - a.degree || a.title.localeCompare(b.title),
        )[0]
      : undefined
  const systems: Array<PlanetarySystem> = []
  const bodies: Array<CelestialBody> = []
  const systemById = new Map<string, PlanetarySystem>()
  const systemByBodyId = new Map<string, PlanetarySystem>()
  const bodyById = new Map<string, CelestialBody>()

  for (const arm of arms) {
    const armNodes = nodesByArm.get(arm.id) ?? []
    const seeds = chooseSeeds(armNodes)
    const communities = assignCommunities(armNodes, seeds, adjacency)
    const communityEntries = Array.from(communities.entries())
      .map(([seedId, community]) => {
        const planet = [...community].sort(
          (a, b) => b.degree - a.degree || a.title.localeCompare(b.title),
        )[0]
        return { seedId, planet, community }
      })
      .sort((a, b) => b.community.length - a.community.length)

    arm.systemCount = communityEntries.length
    communityEntries.forEach((entry, index) => {
      const armPosition = (index + 1) / (communityEntries.length + 1)
      const point = systemPoint(arm, armPosition, entry.seedId)
      const totalLinks = entry.community.reduce(
        (sum, node) => sum + node.degree,
        0,
      )
      const systemId = `${arm.id}:${entry.planet.id}`
      const planet = createBody({
        node: entry.planet,
        kind: entry.planet.id === coreSeed?.id ? 'core' : 'planet',
        arm,
        systemId,
        baseX: point.x,
        baseY: point.y,
        sizeTier: sizeTier(totalLinks, maxDegree * 6),
      })
      const moons = entry.community
        .filter((node) => node.id !== entry.planet.id)
        .map((node) =>
          createBody({
            node,
            kind: 'moon',
            arm,
            systemId,
            planetId: planet.id,
            baseX: point.x,
            baseY: point.y,
            sizeTier: sizeTier(node.degree, maxDegree),
            orbitDistance: orbitDistance(node, entry.planet, adjacency),
          }),
        )
      const system: PlanetarySystem = {
        id: systemId,
        folder: arm.name,
        armId: arm.id,
        armIndex: arm.index,
        planet,
        moons,
        bodyCount: 1 + moons.length,
        totalLinks,
        sizeTier: planet.sizeTier,
        baseX: point.x,
        baseY: point.y,
        armPosition,
      }
      systems.push(system)
      systemById.set(system.id, system)
      for (const body of [planet, ...moons]) {
        bodies.push(body)
        bodyById.set(body.id, body)
        systemByBodyId.set(body.id, system)
      }
    })
  }

  const cometArm = arms.find((arm) => arm.id === FIELD_ARM_ID) || arms[0]
  const comets = orphanNodes.map((node, index) => {
    const point = cometPoint(index, orphanNodes.length, node.id)
    const comet = createBody({
      node,
      kind: 'comet',
      arm: cometArm,
      baseX: point.x,
      baseY: point.y,
      sizeTier: 1,
    })
    bodyById.set(comet.id, comet)
    bodies.push(comet)
    return comet
  })

  return {
    arms,
    systems: systems.sort((a, b) => b.bodyCount - a.bodyCount),
    bodies,
    comets,
    core: coreSeed ? (bodyById.get(coreSeed.id) ?? null) : null,
    bodyById,
    systemById,
    systemByBodyId,
    starfield: createStarfield(),
    totals: {
      bodies: nodes.length,
      links: edges.length,
      systems: systems.length,
      comets: comets.length,
    },
  }
}
