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

export type CelestialKind = 'core' | 'planet' | 'tag' | 'comet'

export type GalaxyArm = {
  id: string
  name: string
  index: number
  angle: number
  bodyCount: number
  systemCount: number
  tint: string
}

export type CelestialBody = KnowledgeGraphNode & {
  id: string
  title: string
  path: string
  folder: string
  kind: CelestialKind
  degree: number
  importance: number
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
  baseZ: number
  jitter: number
  excerpt: string
}

export type PlanetarySystem = {
  id: string
  folder: string
  armId: string
  armIndex: number
  planet: CelestialBody
  tags: Array<CelestialBody>
  moons: Array<CelestialBody>
  bodyCount: number
  totalLinks: number
  sizeTier: number
  baseX: number
  baseY: number
  baseZ: number
  armPosition: number
}

export type StarfieldPoint = {
  x: number
  y: number
  z: number
  r: number
  layer: number
  alpha: number
  warm: boolean
}

export type GalaxyConstellationLink = KnowledgeGraphEdge & {
  strength: number
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
  links: Array<GalaxyConstellationLink>
  totals: {
    bodies: number
    links: number
    systems: number
    comets: number
  }
}

export type LabelKind = 'planet' | 'tag'

export type LabelCandidate = {
  id: string
  kind: LabelKind
  body: CelestialBody
  priority: number
}

export type ProjectedLabel = LabelCandidate & {
  x: number
  y: number
  scale: number
  opacity: number
  active: boolean
}

export function focusBodyForNavigation(
  model: GalaxyModel,
  body: CelestialBody | null,
): CelestialBody | null {
  if (!body) return null
  return model.systemByBodyId.get(body.id)?.planet ?? body
}

export function folderTintFor(folder: string): string {
  const key = folder.trim().toLowerCase()
  if (key === 'agents/claude' || key.startsWith('agents/claude/'))
    return '#D7A84A'
  if (key === 'agents/gpt' || key.startsWith('agents/gpt/')) return '#B46B37'
  if (key === 'agents/kimi' || key.startsWith('agents/kimi/')) return '#B66A73'
  if (key === 'knowledge' || key.startsWith('knowledge/')) return '#BFA35A'
  if (key === 'inbox' || key.startsWith('inbox/')) return '#6F819D'
  if (key.includes('claude')) return '#D7A84A'
  if (key.includes('gpt') || key.includes('codex')) return '#B46B37'
  if (key.includes('kimi') || key.includes('nova')) return '#B66A73'
  if (key.includes('knowledge') || key.includes('notes')) return '#BFA35A'
  if (key.includes('inbox') || key.includes('triage')) return '#6F819D'
  return '#7D9573'
}

export function focusDistanceForSystem(
  system: Pick<PlanetarySystem, 'bodyCount' | 'sizeTier'> & {
    planet: Pick<CelestialBody, 'kind' | 'sizeTier' | 'importance'>
  },
): number {
  const mass =
    Math.sqrt(Math.max(1, system.bodyCount)) * 1.85 +
    system.sizeTier * 1.35 +
    Math.log2(system.planet.importance + 1) * 0.9
  const coreBonus = system.planet.kind === 'core' ? 3.5 : 0
  return clamp(12.5 + mass + coreBonus, 12, 36)
}

export function selectLabelCandidates(input: {
  model: GalaxyModel
  selectedBody: CelestialBody | null
  hoveredBody: CelestialBody | null
  searchTerm: string
  mode: 'overview' | 'focus'
}): Array<LabelCandidate> {
  const query = input.searchTerm.trim().toLowerCase()
  const selectedSystem = input.selectedBody
    ? input.model.systemByBodyId.get(input.selectedBody.id)
    : undefined
  const hoveredSystem = input.hoveredBody
    ? input.model.systemByBodyId.get(input.hoveredBody.id)
    : undefined
  const activeSystemIds = new Set<string>()
  if (selectedSystem) activeSystemIds.add(selectedSystem.id)
  if (hoveredSystem) activeSystemIds.add(hoveredSystem.id)

  const candidates = new Map<string, LabelCandidate>()
  const push = (body: CelestialBody, kind: LabelKind, priority: number) => {
    const existing = candidates.get(body.id)
    if (existing && existing.priority >= priority) return
    candidates.set(body.id, {
      id: body.id,
      kind,
      body,
      priority,
    })
  }

  const rankedSystems = [...input.model.systems].sort(
    (a, b) =>
      b.planet.importance - a.planet.importance ||
      b.totalLinks - a.totalLinks ||
      a.planet.title.localeCompare(b.planet.title),
  )

  for (const system of rankedSystems) {
    const isActive = activeSystemIds.has(system.id)
    const isCore = system.planet.kind === 'core'
    const overviewHub =
      input.mode === 'overview' &&
      (isCore ||
        rankedSystems.indexOf(system) < 6 ||
        system.planet.importance >= 24)
    if (isActive || isCore || overviewHub || query) {
      push(
        system.planet,
        'planet',
        (isCore ? 120 : 80) +
          system.planet.importance +
          (isActive ? 40 : 0),
      )
    }

    const tagBudget =
      isActive || input.mode === 'focus'
        ? 14
        : query
          ? 8
          : overviewHub
            ? 1
            : 0
    const rankedTags = [...system.tags].sort(
      (a, b) =>
        b.importance - a.importance || a.title.localeCompare(b.title),
    )
    let shown = 0
    for (const tag of rankedTags) {
      const matches =
        !query ||
        tag.title.toLowerCase().includes(query) ||
        tag.path.toLowerCase().includes(query) ||
        tag.folder.toLowerCase().includes(query)
      const selected =
        tag.id === input.selectedBody?.id || tag.id === input.hoveredBody?.id
      if (!matches && !selected && !isActive && input.mode === 'overview') {
        if (shown >= tagBudget) continue
        if (tag.importance < 12 && tag.recencyTier === 'cool') continue
      }
      if (!matches && !selected && !isActive && !overviewHub) continue
      if (!matches && !selected && shown >= tagBudget) continue
      push(
        tag,
        'tag',
        (selected ? 70 : isActive ? 40 : 12) +
          tag.importance +
          (tag.recencyTier === 'hot' ? 8 : 0),
      )
      shown += 1
      if (!selected && shown >= tagBudget) {
        // keep scanning only for explicit matches/selection
        if (!query) break
      }
    }
  }

  if (input.selectedBody) {
    const kind =
      input.selectedBody.kind === 'tag' || input.selectedBody.kind === 'comet'
        ? 'tag'
        : 'planet'
    push(input.selectedBody, kind === 'tag' ? 'tag' : 'planet', 200)
  }
  if (input.hoveredBody) {
    const kind =
      input.hoveredBody.kind === 'tag' || input.hoveredBody.kind === 'comet'
        ? 'tag'
        : 'planet'
    push(input.hoveredBody, kind === 'tag' ? 'tag' : 'planet', 180)
  }

  return Array.from(candidates.values()).sort(
    (a, b) => b.priority - a.priority || a.body.title.localeCompare(b.body.title),
  )
}

export function resolveProjectedLabels(
  labels: Array<ProjectedLabel>,
  minDistance = 30,
): Array<ProjectedLabel> {
  const accepted: Array<ProjectedLabel> = []
  const ordered = [...labels].sort(
    (a, b) => b.priority - a.priority || a.body.title.localeCompare(b.body.title),
  )
  for (const label of ordered) {
    const collides = accepted.some((other) => {
      const dx = other.x - label.x
      const dy = other.y - label.y
      return Math.sqrt(dx * dx + dy * dy) < minDistance
    })
    if (!collides) accepted.push(label)
  }
  return accepted
}

type SeedNode = KnowledgeGraphNode & {
  id: string
  title: string
  path: string
  folder: string
  degree: number
  excerpt: string
}

type Vec3 = { x: number; y: number; z: number }

const FIELD_ARM_ID = 'field-stars'

const FOLDER_TINTS = [
  '#D7A84A',
  '#B46B37',
  '#B66A73',
  '#BFA35A',
  '#6F819D',
  '#7D9573',
]

const ARM_DEPTH_BIAS = [-18, 14, -8, 22, -24, 10]

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

export function seededUnit(seed: string): number {
  let value = hashString(seed) + 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
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
    folder:
      node.folder && !/[\\/]/.test(node.folder)
        ? node.folder
        : fallbackFolder(path),
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
  const systemCount = clamp(Math.round(Math.sqrt(nodes.length) * 0.54), 2, 9)
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
      for (const neighbor of neighbors)
        if (seedNeighbors.has(neighbor)) shared += 1
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

function operationalImportance(
  node: SeedNode,
  kind: CelestialKind,
  recency: { tier: CelestialBody['recencyTier']; ageHours: number },
): number {
  const kindWeight = kind === 'core' ? 20 : kind === 'planet' ? 8 : kind === 'tag' ? 2 : 1
  const recencyWeight = recency.tier === 'hot' ? 4 : recency.tier === 'warm' ? 2 : 0
  return kindWeight + node.degree * 6 + recencyWeight
}

function sizeTier(value: number, max: number): number {
  if (max <= 0) return 1
  return clamp(Math.ceil((value / max) * 5), 1, 5)
}

function folderAnchor(arm: GalaxyArm): Vec3 {
  const angle = arm.angle
  const radius = 46 + arm.index * 3.5
  const depthBias = ARM_DEPTH_BIAS[arm.index % ARM_DEPTH_BIAS.length] ?? 0
  return {
    x: Math.cos(angle) * radius + depthBias * 0.18,
    y: Math.sin(angle * 1.17) * 18 + (arm.index % 2 === 0 ? 6 : -5),
    z: Math.sin(angle) * radius + depthBias,
  }
}

function stableJitter(seed: string, scale: number): Vec3 {
  return {
    x: (seededUnit(`${seed}:jx`) - 0.5) * scale,
    y: (seededUnit(`${seed}:jy`) - 0.5) * scale * 0.62,
    z: (seededUnit(`${seed}:jz`) - 0.5) * scale,
  }
}

function settleSystems(
  systems: Array<{
    id: string
    arm: GalaxyArm
    totalLinks: number
    position: Vec3
  }>,
  links: Array<KnowledgeGraphEdge>,
): Map<string, Vec3> {
  const positions = new Map(
    systems.map((system) => [system.id, { ...system.position }]),
  )
  const systemByPlanet = new Map(
    systems.map((system) => [
      system.id.split(':').at(-1) ?? system.id,
      system.id,
    ]),
  )
  const linkedSystems = links
    .map((link) => ({
      source: systemByPlanet.get(link.source),
      target: systemByPlanet.get(link.target),
    }))
    .filter((link): link is { source: string; target: string } =>
      Boolean(link.source && link.target && link.source !== link.target),
    )

  for (let step = 0; step < 90; step += 1) {
    const deltas = new Map(
      systems.map((system) => [system.id, { x: 0, y: 0, z: 0 }]),
    )

    for (let i = 0; i < systems.length; i += 1) {
      for (let j = i + 1; j < systems.length; j += 1) {
        const a = positions.get(systems[i].id)!
        const b = positions.get(systems[j].id)!
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dz = a.z - b.z
        const distanceSq = Math.max(24, dx * dx + dy * dy + dz * dz)
        const force = 86 / distanceSq
        const distance = Math.sqrt(distanceSq)
        // Soft minimum spacing keeps systems from collapsing into one blob.
        const separation = distance < 22 ? ((22 - distance) / 22) * 1.4 : 0
        const ax = (dx / distance) * (force + separation)
        const ay = (dy / distance) * (force + separation) * 1.08
        const az = (dz / distance) * (force + separation)
        const da = deltas.get(systems[i].id)!
        const db = deltas.get(systems[j].id)!
        da.x += ax
        da.y += ay
        da.z += az
        db.x -= ax
        db.y -= ay
        db.z -= az
      }
    }

    for (const link of linkedSystems) {
      const a = positions.get(link.source)!
      const b = positions.get(link.target)!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dz = b.z - a.z
      const da = deltas.get(link.source)!
      const db = deltas.get(link.target)!
      da.x += dx * 0.0024
      da.y += dy * 0.0024
      da.z += dz * 0.0024
      db.x -= dx * 0.0024
      db.y -= dy * 0.0024
      db.z -= dz * 0.0024
    }

    for (const system of systems) {
      const position = positions.get(system.id)!
      const delta = deltas.get(system.id)!
      const anchor = folderAnchor(system.arm)
      position.x += delta.x + (anchor.x - position.x) * 0.011
      position.y += delta.y + (anchor.y - position.y) * 0.014
      position.z += delta.z + (anchor.z - position.z) * 0.011
    }
  }

  return positions
}

function createBody(input: {
  node: SeedNode
  kind: CelestialKind
  arm: GalaxyArm
  systemId?: string
  planetId?: string
  base: Vec3
  sizeTier: number
  offset?: Vec3
}): CelestialBody {
  const recency = recencyFor(input.node.modified || input.node.updated)
  const hash = hashString(input.node.id)
  const offset = input.offset ?? { x: 0, y: 0, z: 0 }
  return {
    ...input.node,
    kind: input.kind,
    importance: operationalImportance(input.node, input.kind, recency),
    systemId: input.systemId,
    planetId: input.planetId,
    armId: input.arm.id,
    armIndex: input.arm.index,
    sizeTier: input.sizeTier,
    recencyTier: recency.tier,
    recencyAgeHours: recency.ageHours,
    orbitRadius: 0,
    orbitPeriod: 210 + (hash % 260),
    orbitPhase: (hash % 6283) / 1000,
    orbitTilt: -0.55 + seededUnit(`${input.node.id}:tilt`) * 1.1,
    baseX: input.base.x + offset.x,
    baseY: input.base.y + offset.y,
    baseZ: input.base.z + offset.z,
    jitter: (seededUnit(`${input.node.id}:jitter`) - 0.5) * 2,
    excerpt: input.node.excerpt,
  }
}

function cometPoint(index: number, total: number, seed: string): Vec3 {
  const lane = total <= 1 ? 0.5 : index / (total - 1)
  const side = seededUnit(`${seed}:side`) > 0.5 ? -1 : 1
  return {
    x: side * (44 + seededUnit(`${seed}:x`) * 18),
    y: -18 + lane * 36 + (seededUnit(`${seed}:y`) - 0.5) * 10,
    z: (seededUnit(`${seed}:z`) - 0.5) * 62,
  }
}

function createStarfield(): Array<StarfieldPoint> {
  return Array.from({ length: 1350 }, (_, index) => {
    const seed = `star:${index}`
    const layer = index % 3
    return {
      x: (seededUnit(`${seed}:x`) - 0.5) * (150 + layer * 70),
      y: (seededUnit(`${seed}:y`) - 0.5) * (90 + layer * 42),
      z: (seededUnit(`${seed}:z`) - 0.5) * (150 + layer * 90),
      r: 0.035 + layer * 0.018 + seededUnit(`${seed}:r`) * 0.04,
      layer,
      alpha: 0.18 + seededUnit(`${seed}:a`) * 0.58,
      warm: seededUnit(`${seed}:warm`) > 0.78,
    }
  })
}

function strongestLinks(
  bodies: Array<CelestialBody>,
  edges: Array<KnowledgeGraphEdge>,
): Array<GalaxyConstellationLink> {
  const bodyById = new Map(bodies.map((body) => [body.id, body]))
  const sorted = [...edges]
    .filter((edge) => bodyById.has(edge.source) && bodyById.has(edge.target))
    .map((edge) => {
      const source = bodyById.get(edge.source)!
      const target = bodyById.get(edge.target)!
      return {
        ...edge,
        strength:
          source.degree +
          target.degree +
          (source.systemId === target.systemId ? 4 : 0),
      }
    })
    .sort((a, b) => b.strength - a.strength)
  const counts = new Map<string, number>()
  const capped: Array<GalaxyConstellationLink> = []
  for (const link of sorted) {
    const sourceCount = counts.get(link.source) ?? 0
    const targetCount = counts.get(link.target) ?? 0
    if (sourceCount >= 2 || targetCount >= 2) continue
    capped.push(link)
    if (capped.length >= 260) break
    counts.set(link.source, sourceCount + 1)
    counts.set(link.target, targetCount + 1)
  }
  return capped
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
    tint: folderTintFor(name) || FOLDER_TINTS[index] || FOLDER_TINTS.at(-1)!,
  }))
  if (arms.length === 0) {
    arms.push({
      id: FIELD_ARM_ID,
      name: 'field stars',
      index: 0,
      angle: -Math.PI / 2,
      bodyCount: linkedNodes.length,
      systemCount: 0,
      tint: folderTintFor('field stars'),
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
    tint: folderTintFor('field stars'),
  }

  const nodesByArm = new Map<string, Array<SeedNode>>()
  for (const node of linkedNodes) {
    const arm = armByFolder.get(node.folder) ?? fieldArm
    const bucket = nodesByArm.get(arm.id) ?? []
    bucket.push(node)
    nodesByArm.set(arm.id, bucket)
    if (arm.id === FIELD_ARM_ID) fieldArm.bodyCount += 1
  }
  if (fieldArm.bodyCount > 0 && !arms.some((arm) => arm.id === FIELD_ARM_ID))
    arms.push(fieldArm)

  const maxDegree = Math.max(1, ...nodes.map((node) => node.degree))
  const coreSeed =
    linkedNodes.length > 0
      ? [...linkedNodes].sort(
          (a, b) => b.degree - a.degree || a.title.localeCompare(b.title),
        )[0]
      : undefined

  const communityEntries: Array<{
    arm: GalaxyArm
    seedId: string
    planet: SeedNode
    community: Array<SeedNode>
    totalLinks: number
    initial: Vec3
  }> = []

  for (const arm of arms) {
    const armNodes = nodesByArm.get(arm.id) ?? []
    const seeds = chooseSeeds(armNodes)
    const communities = assignCommunities(armNodes, seeds, adjacency)
    const entries = Array.from(communities.entries())
      .map(([seedId, community]) => {
        const planet = [...community].sort(
          (a, b) => b.degree - a.degree || a.title.localeCompare(b.title),
        )[0]
        const totalLinks = community.reduce((sum, node) => sum + node.degree, 0)
        return { seedId, planet, community, totalLinks }
      })
      .sort((a, b) => b.community.length - a.community.length)
    arm.systemCount = entries.length
    entries.forEach((entry, index) => {
      const anchor = folderAnchor(arm)
      const spread = stableJitter(entry.seedId, 24 + index * 2.6)
      communityEntries.push({
        ...entry,
        arm,
        initial: {
          x: anchor.x + spread.x,
          y: anchor.y + spread.y + (index % 3 - 1) * 4.5,
          z: anchor.z + spread.z,
        },
      })
    })
  }

  const layoutSeeds = communityEntries.map((entry) => ({
    id: `${entry.arm.id}:${entry.planet.id}`,
    arm: entry.arm,
    totalLinks: entry.totalLinks,
    position: entry.initial,
  }))
  const settled = settleSystems(layoutSeeds, edges)

  const systems: Array<PlanetarySystem> = []
  const bodies: Array<CelestialBody> = []
  const systemById = new Map<string, PlanetarySystem>()
  const systemByBodyId = new Map<string, PlanetarySystem>()
  const bodyById = new Map<string, CelestialBody>()

  for (const entry of communityEntries) {
    const systemId = `${entry.arm.id}:${entry.planet.id}`
    const base = settled.get(systemId) ?? entry.initial
    const planet = createBody({
      node: entry.planet,
      kind: entry.planet.id === coreSeed?.id ? 'core' : 'planet',
      arm: entry.arm,
      systemId,
      base,
      sizeTier: sizeTier(entry.totalLinks, maxDegree * 6),
    })
    const tags = entry.community
      .filter((node) => node.id !== entry.planet.id)
      .map((node, index) => {
        const ring =
          9.2 + (index % 12) * 2.15 + seededUnit(`${node.id}:ring`) * 5.4
        const theta =
          seededUnit(`${node.id}:theta`) * Math.PI * 2 +
          (index / Math.max(1, entry.community.length)) * 0.85
        const vertical =
          (seededUnit(`${node.id}:vertical`) - 0.5) * 22 +
          Math.sin(theta * 1.7) * 2.4
        return createBody({
          node,
          kind: 'tag',
          arm: entry.arm,
          systemId,
          planetId: planet.id,
          base,
          sizeTier: sizeTier(node.degree, maxDegree),
          offset: {
            x: Math.cos(theta) * ring,
            y: vertical,
            z: Math.sin(theta) * ring * 0.92,
          },
        })
      })
    const system: PlanetarySystem = {
      id: systemId,
      folder: entry.arm.name,
      armId: entry.arm.id,
      armIndex: entry.arm.index,
      planet,
      tags,
      moons: tags,
      bodyCount: 1 + tags.length,
      totalLinks: entry.totalLinks,
      sizeTier: planet.sizeTier,
      baseX: base.x,
      baseY: base.y,
      baseZ: base.z,
      armPosition: seededUnit(`${systemId}:position`),
    }
    systems.push(system)
    systemById.set(system.id, system)
    for (const body of [planet, ...tags]) {
      bodies.push(body)
      bodyById.set(body.id, body)
      systemByBodyId.set(body.id, system)
    }
  }

  const cometArm = arms.find((arm) => arm.id === FIELD_ARM_ID) || arms[0]
  const comets = orphanNodes.map((node, index) => {
    const point = cometPoint(index, orphanNodes.length, node.id)
    const comet = createBody({
      node,
      kind: 'comet',
      arm: cometArm,
      base: point,
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
    links: strongestLinks(bodies, edges),
    totals: {
      bodies: nodes.length,
      links: edges.length,
      systems: systems.length,
      comets: comets.length,
    },
  }
}
