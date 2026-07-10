import { useMutation, useQuery, useQueryClient  } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { GALAXY_PALETTE } from '../lib/nova-cockpit-theme'
import {
  buildGalaxyModel,
  clamp,
  clusterHue,
  emberSize,
  focusBodyForNavigation,
  focusDistanceForSystem,
  folderTintFor,
  hashString,
  isHub,
  obsidianUri,
  recencyGlow,
  resolveProjectedLabels,
  selectLabelCandidates,
  shortTitle,
  spiralPosition,
} from './nova-galaxy-model'
import type { VaultGraphInsights } from '../../../server/vault-graph-insights'
import type {
  CelestialBody,
  GalaxyArm,
  GalaxyModel,
  KnowledgeGraphResponse,
  PlanetarySystem,
  ProjectedLabel,
} from './nova-galaxy-model'

type DustField = {
  positions: Float32Array
  colors: Float32Array
}

type NebulaRegion = {
  armId: string
  color: string
  position: { x: number; y: number; z: number }
  scale: number
  opacity: number
}

type Galaxy3DProps = {
  model: GalaxyModel
  dustField: DustField
  nebulaRegions: Array<NebulaRegion>
  selectedBody: CelestialBody | null
  hoveredBody: CelestialBody | null
  disabledArms: Set<string>
  searchTerm: string
  thisWeekOnly: boolean
  isLoading: boolean
  onHover: (body: CelestialBody | null) => void
  onSelect: (body: CelestialBody | null) => void
}
type CameraState = {
  yaw: number
  pitch: number
  distance: number
  target: THREE.Vector3
}
// Embers-only: every planet-kind body (including the core) renders as a
// soft additive amber sprite instead of a textured sphere/ring/atmosphere
// mesh trio. The core stacks two sprites (outer halo + inner glow); every
// other planet is a single sprite.
type PlanetObject = {
  body: CelestialBody
  system: PlanetarySystem
  sprites: Array<THREE.Sprite>
  materials: Array<THREE.SpriteMaterial>
  baseScales: Array<number>
  baseOpacities: Array<number>
}
type TagObject = {
  body: CelestialBody
  mesh: THREE.Mesh
  material: THREE.MeshStandardMaterial
}
type CometObject = {
  body: CelestialBody
  group: THREE.Group
  material: THREE.MeshBasicMaterial
  tailMaterial: THREE.LineBasicMaterial
}
type LineObject = {
  source: string
  target: string
  strength: number
  material: THREE.LineDashedMaterial
}

const SPACE = '#030814'
const SPACE_SOFT = '#071426'
const AMBER = '#FF8C1A'
const GOLD = '#FFB347'
const TAN = '#D4A276'
const COPPER = '#7A441E'
const NEUTRAL_TAG = '#C9B79A'
const OVERVIEW_DISTANCE = 96
const GLIDE_DURATION_MS = 600
// Embers-only planet sizing: emberSize(degree) * ~2.2, matching the
// approved dust-forward demo (no textured spheres/rings/atmospheres).
const PLANET_EMBER_SCALE = 2.2
const CORE_INNER_MULTIPLIER = 1.5
const CORE_OUTER_MULTIPLIER = 2.7
// Rough radius of the settled system layout (folderAnchor tops out around
// 46 + 5*3.5) — used only as a reference scale for the nebula-clamp and
// spiral-arm-blend math below, not an exact bound.
const GALAXY_RADIUS = 62
const NEBULA_MAX_OPACITY = 0.15
const NEBULA_MAX_SCALE = GALAXY_RADIUS * 0.28
// Blend embers 20-30% toward their arm's logarithmic spiral path so the
// dust arms read as the hero once the planet meshes are gone.
const SPIRAL_ARM_COUNT = 3
const SPIRAL_BLEND = 0.25
const SPIRAL_TO_SYSTEM_SCALE = 7.1

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

async function readKnowledgeGraph(): Promise<KnowledgeGraphResponse> {
  const response = await fetch('/api/knowledge/graph')
  if (!response.ok) throw new Error(`knowledge graph ${response.status}`)
  return (await response.json()) as KnowledgeGraphResponse
}

function formatModified(value?: string): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function bodyLabel(body: CelestialBody): string {
  if (body.kind === 'core') return 'Galactic core'
  if (body.kind === 'planet') return 'Planet'
  if (body.kind === 'tag') return 'Text tag'
  return 'Comet'
}

function systemForBody(
  model: GalaxyModel,
  body: CelestialBody | null,
): PlanetarySystem | null {
  if (!body) return null
  return model.systemByBodyId.get(body.id) ?? null
}

function activeSystemIds(
  model: GalaxyModel,
  selectedBody: CelestialBody | null,
  hoveredBody: CelestialBody | null,
): Set<string> {
  const ids = new Set<string>()
  const selectedSystem = systemForBody(model, selectedBody)
  const hoveredSystem = systemForBody(model, hoveredBody)
  if (selectedSystem) ids.add(selectedSystem.id)
  if (hoveredSystem) ids.add(hoveredSystem.id)
  return ids
}

function matchesSearch(body: CelestialBody, searchTerm: string): boolean {
  const query = searchTerm.trim().toLowerCase()
  if (!query) return true
  return (
    body.title.toLowerCase().includes(query) ||
    body.path.toLowerCase().includes(query) ||
    body.folder.toLowerCase().includes(query)
  )
}

function warmth(body: CelestialBody): number {
  if (body.kind === 'core') return 1
  if (body.recencyTier === 'hot') return 0.92
  if (body.recencyTier === 'warm') return 0.68
  return 0.34
}

function bodyPosition(body: CelestialBody): THREE.Vector3 {
  return new THREE.Vector3(body.baseX, body.baseY, body.baseZ)
}

/**
 * Nudge a body's (x, z) 20-30% toward the nearest point on its arm's
 * logarithmic spiral curve (same `spiralPosition` the dust field uses),
 * so embers read as riding the arms instead of scattering off them.
 * `spiralPosition`'s output lives in a much smaller coordinate space than
 * the settled system layout, so it is rescaled by SPIRAL_TO_SYSTEM_SCALE
 * before blending.
 */
function armSpiralBlend(body: CelestialBody): { x: number; z: number } {
  const radius = Math.hypot(body.baseX, body.baseZ)
  const radiusNorm = clamp(radius / GALAXY_RADIUS, 0.04, 1)
  const armIndex = body.armIndex % SPIRAL_ARM_COUNT
  const seedIndex = hashString(body.id) % 100_000
  const spiral = spiralPosition(seedIndex, armIndex, SPIRAL_ARM_COUNT, radiusNorm)
  const targetX = spiral.x * SPIRAL_TO_SYSTEM_SCALE
  const targetZ = spiral.z * SPIRAL_TO_SYSTEM_SCALE
  return {
    x: body.baseX + (targetX - body.baseX) * SPIRAL_BLEND,
    z: body.baseZ + (targetZ - body.baseZ) * SPIRAL_BLEND,
  }
}

/** Visual placement for an ember: planets/core/tags blend toward their
 * spiral arm; comets keep their own drifting-orphan base position. */
function emberPosition(body: CelestialBody): THREE.Vector3 {
  if (body.kind === 'comet') return bodyPosition(body)
  const blended = armSpiralBlend(body)
  return new THREE.Vector3(blended.x, body.baseY, blended.z)
}

/** Base sprite scale for a planet-kind ember: emberSize(degree) * ~2.2,
 * with a small size bump for hub bodies (mirrors the tag-ember rule). */
function planetEmberBaseSize(body: CelestialBody): number {
  const hub = isHub(body.degree)
  return emberSize(body.degree) * PLANET_EMBER_SCALE * (hub ? 1.12 : 1)
}

function createStarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255, 241, 204, 1)')
  gradient.addColorStop(0.34, 'rgba(255, 210, 122, 0.42)')
  gradient.addColorStop(1, 'rgba(255, 210, 122, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 32, 32)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Soft additive ember sprite — reuses the star/glow canvas texture so
 * every planet-kind body (and the core) renders as a glowing point of
 * light instead of a textured sphere. */
function createEmberSprite(
  texture: THREE.Texture,
  color: string,
  opacity: number,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Sprite(material)
}

function useEscape(handler: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handler])
}

function createClusterNebula(color: string, opacity: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')!
  const base = new THREE.Color(color)
  const glow = context.createRadialGradient(256, 256, 0, 256, 256, 256)
  glow.addColorStop(
    0,
    `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, 0.10)`,
  )
  glow.addColorStop(
    0.34,
    `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, 0.05)`,
  )
  glow.addColorStop(
    0.72,
    `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, 0.02)`,
  )
  glow.addColorStop(1, 'rgba(9, 10, 18, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 512, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    // Clamped hard: stacked additive nebula sprites were blowing out to a
    // solid cyan-white blob before this cap.
    opacity: clamp(opacity, 0, NEBULA_MAX_OPACITY),
    blending: THREE.AdditiveBlending,
  })
  return new THREE.Sprite(material)
}

const DUST_POINTS_PER_ARM = 5500
const DUST_ARM_COUNT = 3

function clusterHueColor(hue: ReturnType<typeof clusterHue>): string {
  switch (hue) {
    case 'blue':
      return GALAXY_PALETTE.blues[0]
    case 'blue2':
      return GALAXY_PALETTE.blues[1]
    case 'amber':
      return GALAXY_PALETTE.ambers[0]
    case 'blend':
      return GALAXY_PALETTE.ambers[2]
  }
}

function buildDustField(): DustField {
  const total = DUST_POINTS_PER_ARM * DUST_ARM_COUNT
  const positions = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)
  let cursor = 0
  for (let arm = 0; arm < DUST_ARM_COUNT; arm += 1) {
    for (let i = 0; i < DUST_POINTS_PER_ARM; i += 1) {
      const radiusNorm = i / DUST_POINTS_PER_ARM
      const point = spiralPosition(i, arm, DUST_ARM_COUNT, radiusNorm)
      positions[cursor * 3] = point.x
      positions[cursor * 3 + 1] = point.y
      positions[cursor * 3 + 2] = point.z
      // amber core → neon-blue arms → deep-blue rim. The core stop must be
      // warm gold, not near-white: white dust + additive stacking is what
      // bloomed the dense center into the cyan-green hotspot.
      const color = new THREE.Color()
      if (radiusNorm < 0.18) color.set(GALAXY_PALETTE.ambers[2])
      else if (radiusNorm < 0.62) color.set(GALAXY_PALETTE.blues[0])
      else color.set(GALAXY_PALETTE.blues[2])
      colors[cursor * 3] = color.r
      colors[cursor * 3 + 1] = color.g
      colors[cursor * 3 + 2] = color.b
      cursor += 1
    }
  }
  return { positions, colors }
}

function buildNebulaRegions(model: GalaxyModel): Array<NebulaRegion> {
  return model.arms.map((arm, index) => {
    const systemsInArm = model.systems.filter((s) => s.armId === arm.id)
    const center = systemsInArm.reduce(
      (acc, system) => ({
        x: acc.x + system.baseX / Math.max(1, systemsInArm.length),
        y: acc.y + system.baseY / Math.max(1, systemsInArm.length),
        z: acc.z + system.baseZ / Math.max(1, systemsInArm.length),
      }),
      { x: 0, y: 0, z: 0 },
    )
    return {
      armId: arm.id,
      color: clusterHueColor(clusterHue(index)),
      position: center,
      // No single nebula blob may exceed ~28% of the galaxy radius — the
      // old 26-50 range was blowing out into a solid bright wash.
      scale: clamp(14 + Math.min(8, systemsInArm.length * 1.1), 8, NEBULA_MAX_SCALE),
      opacity: clamp(
        0.06 + Math.min(0.05, systemsInArm.length * 0.008),
        0.04,
        NEBULA_MAX_OPACITY,
      ),
    }
  })
}

type ClusterLabel = {
  armId: string
  name: string
  x: number
  y: number
  opacity: number
}

function Galaxy3D({
  model,
  dustField,
  nebulaRegions,
  selectedBody,
  hoveredBody,
  disabledArms,
  searchTerm,
  thisWeekOnly,
  isLoading,
  onHover,
  onSelect,
}: Galaxy3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [labels, setLabels] = useState<Array<ProjectedLabel>>([])
  const [clusterLabels, setClusterLabels] = useState<Array<ClusterLabel>>([])
  const selectedRef = useRef<CelestialBody | null>(selectedBody)
  const hoveredRef = useRef<CelestialBody | null>(hoveredBody)
  const disabledRef = useRef<Set<string>>(disabledArms)
  const searchRef = useRef(searchTerm)
  const thisWeekRef = useRef(thisWeekOnly)
  const reducedMotionRef = useRef(false)
  const cameraStateRef = useRef<CameraState>({
    yaw: -0.92,
    pitch: 0.28,
    distance: OVERVIEW_DISTANCE,
    target: new THREE.Vector3(0, 4, 0),
  })
  const glideRef = useRef<{
    active: boolean
    startedAt: number
    fromTarget: THREE.Vector3
    fromDistance: number
    toTarget: THREE.Vector3
    toDistance: number
  } | null>(null)

  useEffect(() => {
    selectedRef.current = selectedBody
    hoveredRef.current = hoveredBody
    disabledRef.current = disabledArms
    searchRef.current = searchTerm
    thisWeekRef.current = thisWeekOnly
  }, [disabledArms, hoveredBody, searchTerm, selectedBody, thisWeekOnly])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SPACE)
    scene.fog = new THREE.FogExp2(SPACE_SOFT, 0.0062)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 520)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearColor(SPACE, 1)
    renderer.domElement.className =
      'nova-galaxy-canvas absolute inset-0 size-full'
    renderer.domElement.setAttribute(
      'aria-label',
      '3D Obsidian knowledge galaxy',
    )
    host.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight('#C8B59A', 0.28)
    const key = new THREE.DirectionalLight('#FFE4A6', 2.7)
    key.position.set(-28, 26, 34)
    const coreLight = new THREE.PointLight('#FFB347', 1.8, 140)
    coreLight.position.set(-10, 12, 24)
    const fill = new THREE.PointLight('#163456', 0.58, 180)
    fill.position.set(34, -16, -30)
    // Rim stays in the canon family — the old #7D9573 green rim light
    // washed every ember with the pre-canon tint.
    const rim = new THREE.DirectionalLight('#2E7FD9', 0.35)
    rim.position.set(18, 8, -40)
    scene.add(ambient, key, coreLight, fill, rim)

    const starPositions = new Float32Array(model.starfield.length * 3)
    const starColors = new Float32Array(model.starfield.length * 3)
    model.starfield.forEach((star, index) => {
      starPositions[index * 3] = star.x
      starPositions[index * 3 + 1] = star.y
      starPositions[index * 3 + 2] = star.z
      const color = new THREE.Color(star.warm ? '#FFD27A' : '#FFF1CC')
      color.multiplyScalar(star.alpha)
      starColors[index * 3] = color.r
      starColors[index * 3 + 1] = color.g
      starColors[index * 3 + 2] = color.b
    })
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(starPositions, 3),
    )
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3))
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        map: createStarTexture(),
        size: 0.46,
        vertexColors: true,
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    scene.add(stars)

    const dustGeometry = new THREE.BufferGeometry()
    dustGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(dustField.positions, 3),
    )
    dustGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(dustField.colors, 3),
    )
    const starTexture = createStarTexture()
    const dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        // Soft-sprite texture + larger size: at overview distance (~96) the
        // untextured 0.22 points were sub-pixel and the spiral read as empty
        // space. Dust-forward means the arms must visibly carry the scene.
        map: starTexture,
        size: 0.62,
        vertexColors: true,
        transparent: true,
        // 0.62 opacity overexposed dense regions: additive stacking bloomed
        // past blue into white-teal (reads green). Keep arms visible but let
        // the core saturate warm instead of clipping to white.
        opacity: 0.4,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    const dustGroup = new THREE.Group()
    dustGroup.add(dust)
    scene.add(dustGroup)

    const nebulaSprites = nebulaRegions.map((region) => {
      const sprite = createClusterNebula(region.color, region.opacity)
      sprite.position.set(region.position.x, region.position.y, region.position.z)
      sprite.scale.set(region.scale, region.scale * 0.55, 1)
      scene.add(sprite)
      return sprite
    })

    const planetObjects = new Map<string, PlanetObject>()
    const tagObjects: Array<TagObject> = []
    const tagGeometry = new THREE.IcosahedronGeometry(0.28, 1)
    const hitObjects: Array<THREE.Object3D> = []
    const bodyPositions = new Map<string, THREE.Vector3>()

    for (const system of model.systems) {
      const body = system.planet
      const armTint =
        model.arms.find((arm) => arm.id === system.planet.armId)?.tint ??
        folderTintFor(system.folder)
      const planetHub = isHub(body.degree)
      const baseSize = planetEmberBaseSize(body)
      const position = emberPosition(body)
      const sprites: Array<THREE.Sprite> = []
      const materials: Array<THREE.SpriteMaterial> = []
      const baseScales: Array<number> = []
      const baseOpacities: Array<number> = []

      if (body.kind === 'core') {
        // Bigger soft amber core-glow: two stacked additive sprites — a
        // wide soft outer halo plus a brighter, tighter inner glow —
        // rather than a single mesh.
        const outerScale = baseSize * CORE_OUTER_MULTIPLIER
        const innerScale = baseSize * CORE_INNER_MULTIPLIER
        const outer = createEmberSprite(starTexture, AMBER, 0.4)
        outer.scale.set(outerScale, outerScale, 1)
        outer.position.copy(position)
        outer.userData.bodyId = body.id
        const inner = createEmberSprite(starTexture, GOLD, 0.92)
        inner.scale.set(innerScale, innerScale, 1)
        inner.position.copy(position)
        inner.userData.bodyId = body.id
        scene.add(outer, inner)
        sprites.push(outer, inner)
        materials.push(
          outer.material as THREE.SpriteMaterial,
          inner.material as THREE.SpriteMaterial,
        )
        baseScales.push(outerScale, innerScale)
        baseOpacities.push(0.4, 0.92)
      } else {
        // Every other planet-kind body: a single large amber ember, no
        // textured sphere/ring/atmosphere meshes.
        const scale = baseSize
        const sprite = createEmberSprite(
          starTexture,
          planetHub ? GOLD : AMBER,
          planetHub ? 0.92 : 0.82,
        )
        sprite.scale.set(scale, scale, 1)
        sprite.position.copy(position)
        sprite.userData.bodyId = body.id
        scene.add(sprite)
        sprites.push(sprite)
        materials.push(sprite.material as THREE.SpriteMaterial)
        baseScales.push(scale)
        baseOpacities.push(planetHub ? 0.92 : 0.82)
      }

      bodyPositions.set(body.id, position.clone())
      planetObjects.set(body.id, {
        body,
        system,
        sprites,
        materials,
        baseScales,
        baseOpacities,
      })
      for (const tag of system.tags) {
        const tagMaterial = new THREE.MeshStandardMaterial({
          color: NEUTRAL_TAG,
          emissive: new THREE.Color(armTint),
          emissiveIntensity: tag.recencyTier === 'hot' ? 0.46 : 0.12,
          roughness: 0.58,
          metalness: 0.12,
          transparent: true,
          opacity: 0.88,
        })
        const marker = new THREE.Mesh(tagGeometry, tagMaterial)
        marker.position.copy(emberPosition(tag))
        const nowIso = new Date().toISOString()
        const glow = recencyGlow(tag.modified ?? tag.updated ?? '', nowIso)
        const hub = isHub(tag.degree)
        marker.scale.setScalar(emberSize(tag.degree) * (hub ? 1.15 : 1))
        tagMaterial.emissiveIntensity = hub ? 0.55 : 0.12 + glow * 0.3
        tagMaterial.emissive = new THREE.Color(hub ? AMBER : armTint)
        marker.userData.bodyId = tag.id
        bodyPositions.set(tag.id, marker.position.clone())
        hitObjects.push(marker)
        scene.add(marker)
        tagObjects.push({ body: tag, mesh: marker, material: tagMaterial })
      }
    }

    const cometObjects: Array<CometObject> = []
    model.comets.forEach((body) => {
      const group = new THREE.Group()
      group.position.copy(bodyPosition(body))
      const material = new THREE.MeshBasicMaterial({
        color: TAN,
        transparent: true,
        opacity: 0.5,
      })
      const comet = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 8),
        material,
      )
      comet.userData.bodyId = body.id
      hitObjects.push(comet)
      const tailMaterial = new THREE.LineBasicMaterial({
        color: COPPER,
        transparent: true,
        opacity: 0.18,
      })
      const tail = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-1.8, 0.22, 0),
          new THREE.Vector3(-0.18, 0, 0),
        ]),
        tailMaterial,
      )
      group.add(tail, comet)
      scene.add(group)
      bodyPositions.set(body.id, group.position.clone())
      cometObjects.push({ body, group, material, tailMaterial })
    })

    const homeTarget = (() => {
      if (model.systems.length === 0) return new THREE.Vector3(0, 4, 0)
      const target = new THREE.Vector3()
      let weightTotal = 0
      // Bias overview toward top systems but keep the camera off-center so
      // composition reads as layered depth instead of a dead-on blob.
      for (const system of model.systems.slice(0, 10)) {
        const position = bodyPositions.get(system.planet.id)
        if (!position) continue
        const weight = Math.max(1, Math.sqrt(system.totalLinks))
        target.addScaledVector(position, weight)
        weightTotal += weight
      }
      if (weightTotal <= 0) return new THREE.Vector3(0, 4, 0)
      target.divideScalar(weightTotal)
      target.y += 3.5
      target.x -= 6
      target.z += 4
      return target
    })()
    if (!selectedRef.current) {
      cameraStateRef.current.target.copy(homeTarget)
      cameraStateRef.current.distance = OVERVIEW_DISTANCE
      cameraStateRef.current.yaw = -0.92
      cameraStateRef.current.pitch = 0.28
    }
    const lineObjects: Array<LineObject> = []
    for (const link of model.links) {
      const source = bodyPositions.get(link.source)
      const target = bodyPositions.get(link.target)
      if (!source || !target) continue
      const sourceBody = model.bodyById.get(link.source)
      const targetBody = model.bodyById.get(link.target)
      const sameSystem =
        Boolean(sourceBody?.systemId) &&
        sourceBody?.systemId === targetBody?.systemId
      const geometry = new THREE.BufferGeometry().setFromPoints([
        source,
        target,
      ])
      const material = new THREE.LineDashedMaterial({
        color: sameSystem
          ? folderTintFor(sourceBody?.folder ?? 'vault')
          : GOLD,
        transparent: true,
        opacity: sameSystem ? 0.05 : 0.028,
        dashSize: sameSystem ? 0.22 : 0.34,
        gapSize: sameSystem ? 0.36 : 0.5,
        depthWrite: false,
      })
      const line = new THREE.LineSegments(geometry, material)
      line.computeLineDistances()
      scene.add(line)
      lineObjects.push({
        source: link.source,
        target: link.target,
        strength: link.strength,
        material,
      })
    }

    const spokeObjects: Array<LineObject> = []
    if (model.core) {
      const corePosition = bodyPositions.get(model.core.id)
      if (corePosition) {
        for (const system of model.systems) {
          if (system.planet.id === model.core.id) continue
          const systemPosition = bodyPositions.get(system.planet.id)
          if (!systemPosition) continue
          const geometry = new THREE.BufferGeometry().setFromPoints([
            systemPosition,
            corePosition,
          ])
          const material = new THREE.LineBasicMaterial({
            color: AMBER,
            transparent: true,
            opacity: 0.035,
            depthWrite: false,
          })
          const line = new THREE.Line(geometry, material)
          scene.add(line)
          spokeObjects.push({
            source: system.planet.id,
            target: model.core.id,
            strength: 0,
            material: material as unknown as THREE.LineDashedMaterial,
          })
        }
      }
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let width = 1
    let height = 1
    let frame = 0
    let lastLabelUpdate = 0
    let lastClusterLabelUpdate = 0
    let lastSelectedId: string | null = selectedRef.current?.id ?? null
    let isDragging = false
    let lastPointer = { x: 0, y: 0 }
    let pointerMoved = false
    let pointerParallax = { x: 0, y: 0 }
    let parallaxYaw = 0
    let parallaxPitch = 0
    const ROTATION_PERIOD_MS = 110_000

    const resize = () => {
      const bounds = host.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const updateCamera = (now: number) => {
      const state = cameraStateRef.current
      const selected = selectedRef.current
      const focusBody = focusBodyForNavigation(model, selected)
      const selectedSystem = focusBody
        ? model.systemByBodyId.get(focusBody.id)
        : null
      const selectedPosition = focusBody ? bodyPositions.get(focusBody.id) : null
      const desiredTarget = selectedPosition
        ? selectedPosition.clone().add(new THREE.Vector3(0, 1.4, 0))
        : homeTarget
      const desiredDistance = selectedSystem
        ? focusDistanceForSystem(selectedSystem)
        : OVERVIEW_DISTANCE

      // L3: click = go & read — a genuine selection change kicks off a
      // fixed ~600ms eased glide instead of the open-ended exponential
      // follow (which converges but has no defined duration).
      const currentSelectedId = selected?.id ?? null
      if (currentSelectedId !== lastSelectedId && !reducedMotionRef.current) {
        glideRef.current = {
          active: true,
          startedAt: now,
          fromTarget: state.target.clone(),
          fromDistance: state.distance,
          toTarget: desiredTarget.clone(),
          toDistance: desiredDistance,
        }
        lastSelectedId = currentSelectedId
      } else if (currentSelectedId !== lastSelectedId) {
        // Reduced motion: snap instead of gliding.
        state.target.copy(desiredTarget)
        state.distance = desiredDistance
        lastSelectedId = currentSelectedId
      }

      const glide = glideRef.current
      if (glide?.active) {
        const t = clamp((now - glide.startedAt) / GLIDE_DURATION_MS, 0, 1)
        const eased = easeInOutCubic(t)
        state.target.lerpVectors(glide.fromTarget, glide.toTarget, eased)
        state.distance = glide.fromDistance + (glide.toDistance - glide.fromDistance) * eased
        if (t >= 1) glide.active = false
      } else {
        // No active glide (idle overview, or drag-driven re-target): keep
        // the original soft exponential follow so free-look drag doesn't
        // feel snappy/robotic.
        state.target.lerp(desiredTarget, reducedMotionRef.current ? 1 : 0.055)
        state.distance +=
          (desiredDistance - state.distance) *
          (reducedMotionRef.current ? 1 : 0.048)
      }

      if (!selected && !isDragging && !reducedMotionRef.current) {
        state.yaw += Math.sin(now / 14000) * 0.00016 + 0.00012
        state.pitch +=
          (0.28 + Math.sin(now / 21000) * 0.03 - state.pitch) * 0.01
      }
      state.pitch = clamp(state.pitch, -0.62, 0.78)
      state.distance = clamp(state.distance, 11, 140)
      const appliedYaw = state.yaw + parallaxYaw
      const appliedPitch = clamp(state.pitch + parallaxPitch, -0.62, 0.78)
      const cosPitch = Math.cos(appliedPitch)
      camera.position.set(
        state.target.x + Math.sin(appliedYaw) * cosPitch * state.distance,
        state.target.y + Math.sin(appliedPitch) * state.distance,
        state.target.z + Math.cos(appliedYaw) * cosPitch * state.distance,
      )
      camera.lookAt(state.target)
    }

    const bodyVisibleOpacity = (
      body: CelestialBody,
      activeIds: Set<string>,
      query: string,
      nowIso: string = new Date().toISOString(),
    ) => {
      const disabled = disabledRef.current.has(body.armId)
      let opacity = disabled ? 0.15 : 1
      if (activeIds.size > 0 && body.systemId && !activeIds.has(body.systemId))
        opacity *= 0.34
      if (query && !matchesSearch(body, query)) opacity *= 0.16
      // L5 "this week" filter: dims embers with recencyGlow < 1 (i.e. not
      // touched in the last 7 days, per recencyGlow's hot-day cutoff) —
      // visuals only, bodies stay in the model.
      if (thisWeekRef.current) {
        const glow = recencyGlow(body.modified ?? body.updated ?? '', nowIso)
        if (glow < 1) opacity *= 0.2
      }
      return opacity
    }
    const updateVisualState = (now: number) => {
      const selected = selectedRef.current
      const hovered = hoveredRef.current
      const query = searchRef.current.trim()
      const activeIds = activeSystemIds(model, selected, hovered)
      const activeBodyId = selected?.id ?? hovered?.id
      const nowIso = new Date().toISOString()
      // L2: bodies directly wikilinked to the hovered ember brighten
      // alongside the neon-blue edge flare below.
      const hoveredLinkedIds = new Set<string>()
      if (hovered) {
        for (const link of lineObjects) {
          if (link.source === hovered.id) hoveredLinkedIds.add(link.target)
          else if (link.target === hovered.id) hoveredLinkedIds.add(link.source)
        }
      }
      for (const planet of planetObjects.values()) {
        const opacity = bodyVisibleOpacity(planet.body, activeIds, query, nowIso)
        const active =
          activeIds.has(planet.system.id) || planet.body.id === activeBodyId
        const warm = warmth(planet.body)
        // Existing slow hub pulse — the sin-based scale wobble every
        // recency-hot body already got, now applied to sprite scale
        // instead of mesh scale/rotation (billboards don't spin).
        const pulse =
          planet.body.recencyTier === 'hot' && !reducedMotionRef.current
            ? 1 + Math.sin(now / 720 + planet.body.orbitPhase) * 0.07
            : 1
        const activeBoost = active ? 1.16 : 0.9 + warm * 0.1
        for (let index = 0; index < planet.sprites.length; index += 1) {
          const scale = planet.baseScales[index] * pulse * activeBoost
          planet.sprites[index].scale.set(scale, scale, 1)
          planet.materials[index].opacity =
            opacity * planet.baseOpacities[index] * (active ? 1 : 0.88)
        }
      }
      for (const tag of tagObjects) {
        const opacity = bodyVisibleOpacity(tag.body, activeIds, query, nowIso)
        const active =
          (tag.body.systemId && activeIds.has(tag.body.systemId)) ||
          tag.body.id === activeBodyId
        const linked = !active && hoveredLinkedIds.has(tag.body.id)
        const pulse =
          tag.body.recencyTier === 'hot' && !reducedMotionRef.current
            ? 1 + Math.sin(now / 680 + tag.body.orbitPhase) * 0.13
            : 1
        const hub = isHub(tag.body.degree)
        const glow = recencyGlow(tag.body.modified ?? tag.body.updated ?? '', nowIso)
        const baseScale = emberSize(tag.body.degree) * (hub ? 1.15 : 1)
        tag.mesh.scale.setScalar(baseScale * pulse * (active ? 1.28 : linked ? 1.12 : 1))
        tag.material.opacity =
          opacity * (active ? 1 : linked ? 0.88 : 0.62) * (0.55 + glow * 0.45)
        tag.material.emissiveIntensity = hub
          ? 0.78
          : active
            ? 0.6
            : linked
              ? 0.5
              : 0.12 + glow * 0.3
      }
      for (const comet of cometObjects) {
        const drift = reducedMotionRef.current
          ? 0
          : now / comet.body.orbitPeriod / 28
        comet.group.position.x =
          comet.body.baseX + Math.sin(drift + comet.body.orbitPhase) * 8
        comet.group.position.y =
          comet.body.baseY + Math.cos(drift * 0.7 + comet.body.orbitPhase) * 2
        comet.group.position.z =
          comet.body.baseZ + Math.cos(drift + comet.body.orbitPhase) * 8
        const opacity = bodyVisibleOpacity(comet.body, activeIds, query, nowIso)
        comet.material.opacity = opacity * 0.48
        comet.tailMaterial.opacity = opacity * 0.16
      }
      for (const link of lineObjects) {
        const source = model.bodyById.get(link.source)
        const target = model.bodyById.get(link.target)
        const active =
          (source?.systemId && activeIds.has(source.systemId)) ||
          (target?.systemId && activeIds.has(target.systemId)) ||
          source?.id === activeBodyId ||
          target?.id === activeBodyId
        // L2 edge-flare: hovered ember's links brighten to neon-blue for
        // this frame only — recomputed every frame, never persisted state.
        const isHoverFlare =
          Boolean(hovered) && (source?.id === hovered?.id || target?.id === hovered?.id)
        const searched = Boolean(
          query &&
          ((source && matchesSearch(source, query)) ||
            (target && matchesSearch(target, query))),
        )
        const backbone = link.strength >= 12
        if (isHoverFlare) {
          link.material.color.set(GALAXY_PALETTE.blues[0])
          link.material.opacity = 0.72
        } else {
          link.material.color.set(
            source && target && source.systemId === target.systemId
              ? folderTintFor(source.folder)
              : GOLD,
          )
          if (active) link.material.opacity = 0.42
          else if (searched) link.material.opacity = 0.22
          else if (backbone) link.material.opacity = 0.07
          else link.material.opacity = 0.025
        }
      }
    }

    const projectLabels = () => {
      const selected = selectedRef.current
      const hovered = hoveredRef.current
      const query = searchRef.current.trim()
      const activeIds = activeSystemIds(model, selected, hovered)
      const mode = selected || hovered || query ? 'focus' : 'overview'
      const candidates = selectLabelCandidates({
        model,
        selectedBody: selected,
        hoveredBody: hovered,
        searchTerm: query,
        mode,
      })
      const projected: Array<ProjectedLabel> = []
      const vector = new THREE.Vector3()
      for (const candidate of candidates) {
        const point = emberPosition(candidate.body)
        if (candidate.kind === 'planet') {
          const right = new THREE.Vector3().setFromMatrixColumn(
            camera.matrixWorld,
            0,
          )
          const up = new THREE.Vector3().setFromMatrixColumn(
            camera.matrixWorld,
            1,
          )
          const size = planetEmberBaseSize(candidate.body)
          const offset =
            candidate.body.kind === 'core'
              ? size * CORE_OUTER_MULTIPLIER * 0.9
              : size * 0.85
          point.addScaledVector(right, offset)
          point.addScaledVector(up, offset * 0.28)
        }
        vector.copy(point).project(camera)
        if (vector.z < -1 || vector.z > 1) continue
        const distance = camera.position.distanceTo(point)
        if (
          candidate.kind === 'tag' &&
          mode === 'overview' &&
          distance > 52 &&
          candidate.body.id !== hovered?.id &&
          candidate.body.id !== selected?.id
        ) {
          continue
        }
        const active =
          Boolean(
            candidate.body.systemId && activeIds.has(candidate.body.systemId),
          ) ||
          candidate.body.id === hovered?.id ||
          candidate.body.id === selected?.id
        const searched = Boolean(query && matchesSearch(candidate.body, query))
        let opacity = bodyVisibleOpacity(candidate.body, activeIds, query)
        if (candidate.kind === 'tag' && !active && !searched) opacity *= 0.34
        if (candidate.kind === 'planet' && !active && !searched)
          opacity *= mode === 'overview' ? 0.9 : 0.72
        projected.push({
          id: candidate.id,
          kind: candidate.kind,
          body: candidate.body,
          priority: candidate.priority,
          x: (vector.x * 0.5 + 0.5) * width,
          y: (-vector.y * 0.5 + 0.5) * height,
          scale: clamp(1.08 - distance / 170, 0.58, 0.96),
          opacity,
          active: active || searched,
        })
      }
      setLabels(
        resolveProjectedLabels(projected, mode === 'overview' ? 34 : 26),
      )
    }

    // L1: always-on cluster/arm-level labels, thrown at 4Hz — deliberately
    // coarser than the 90ms planet/tag cadence above so this cheap layer
    // never gets starved by the denser one, and doesn't trigger re-renders
    // at a rate that could cause a re-render storm.
    const projectClusterLabels = () => {
      const vector = new THREE.Vector3()
      const projected: Array<ClusterLabel> = []
      for (const region of nebulaRegions) {
        vector.set(region.position.x, region.position.y, region.position.z)
        vector.project(camera)
        if (vector.z < -1 || vector.z > 1) continue
        const arm = model.arms.find((a) => a.id === region.armId)
        if (!arm) continue
        const distance = camera.position.distanceTo(
          new THREE.Vector3(region.position.x, region.position.y, region.position.z),
        )
        projected.push({
          armId: region.armId,
          name: arm.name,
          x: (vector.x * 0.5 + 0.5) * width,
          y: (-vector.y * 0.5 + 0.5) * height,
          // Fades as the camera closes in — "constellation names always
          // on, soft zoomed out, fade as camera closes in" (spec L1).
          opacity: clamp(1 - (OVERVIEW_DISTANCE - distance) / OVERVIEW_DISTANCE, 0.12, 0.85),
        })
      }
      setClusterLabels(projected)
    }

    const animate = (now: number) => {
      if (!reducedMotionRef.current) {
        dustGroup.rotation.y = (now / ROTATION_PERIOD_MS) * Math.PI * 2
        for (const sprite of nebulaSprites) {
          sprite.material.rotation =
            (now / ROTATION_PERIOD_MS) * Math.PI * 2 * 0.4
        }
      }
      parallaxYaw += (pointerParallax.x * 0.05 - parallaxYaw) * 0.04
      parallaxPitch += (pointerParallax.y * 0.03 - parallaxPitch) * 0.04
      updateCamera(now)
      updateVisualState(now)
      refreshEmberScreenPositions()
      renderer.render(scene, camera)
      if (now - lastLabelUpdate > 90) {
        projectLabels()
        lastLabelUpdate = now
      }
      if (now - lastClusterLabelUpdate > 250) {
        projectClusterLabels()
        lastClusterLabelUpdate = now
      }
      if (!document.hidden && isVisible) {
        frame = window.requestAnimationFrame(animate)
      }
    }

    const motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionMedia.matches
    const onMotionChange = () => {
      reducedMotionRef.current = motionMedia.matches
    }
    const normalizedPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    }
    // Comets still have real hit geometry (small sphere mesh) sized to
    // their visual radius, so raycasting still finds them. Embers-only
    // planets/core no longer have any mesh to raycast against — they are
    // picked exclusively through the screen-space nearest-neighbor path
    // below, same as tags.
    const pickPlanet = (event: PointerEvent): CelestialBody | null => {
      normalizedPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(hitObjects, false)[0]
      return hit
        ? (model.bodyById.get(String(hit.object.userData.bodyId)) ?? null)
        : null
    }
    // L2 hover-identify + planet/core selection: nearest ember within 24
    // screen px wins over raycast picking for every kind that renders as a
    // sprite (tags, planets, core). Tag embers are visually small dots and
    // planet/core embers have no mesh at all post embers-only conversion,
    // so screen-space nearest-neighbor is the primary picker; raycast only
    // remains as a fallback for comets (which keep a real hit-sphere).
    const NEAREST_EMBER_PX = 24
    const emberScreenPositions = new Map<string, { x: number; y: number }>()
    const refreshEmberScreenPositions = () => {
      const vector = new THREE.Vector3()
      emberScreenPositions.clear()
      for (const tag of tagObjects) {
        vector.copy(tag.mesh.position).project(camera)
        if (vector.z < -1 || vector.z > 1) continue
        emberScreenPositions.set(tag.body.id, {
          x: (vector.x * 0.5 + 0.5) * width,
          y: (-vector.y * 0.5 + 0.5) * height,
        })
      }
      for (const planet of planetObjects.values()) {
        const anchor = planet.sprites[0]
        if (!anchor) continue
        vector.copy(anchor.position).project(camera)
        if (vector.z < -1 || vector.z > 1) continue
        emberScreenPositions.set(planet.body.id, {
          x: (vector.x * 0.5 + 0.5) * width,
          y: (-vector.y * 0.5 + 0.5) * height,
        })
      }
    }
    const pickNearestEmber = (event: PointerEvent): CelestialBody | null => {
      const bounds = renderer.domElement.getBoundingClientRect()
      const px = event.clientX - bounds.left
      const py = event.clientY - bounds.top
      let best: { id: string; distance: number } | null = null
      for (const [id, pos] of emberScreenPositions) {
        const distance = Math.hypot(pos.x - px, pos.y - py)
        if (distance <= NEAREST_EMBER_PX && (!best || distance < best.distance)) {
          best = { id, distance }
        }
      }
      return best ? (model.bodyById.get(best.id) ?? null) : null
    }
    const onPointerMove = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect()
      pointerParallax = {
        x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        y: ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
      }
      if (isDragging) {
        const dx = event.clientX - lastPointer.x
        const dy = event.clientY - lastPointer.y
        if (Math.abs(dx) + Math.abs(dy) > 2) pointerMoved = true
        cameraStateRef.current.yaw -= dx * 0.0045
        cameraStateRef.current.pitch -= dy * 0.0038
        lastPointer = { x: event.clientX, y: event.clientY }
        return
      }
      const nearestEmber = pickNearestEmber(event)
      const body = nearestEmber ?? pickPlanet(event)
      renderer.domElement.style.cursor = body ? 'pointer' : 'grab'
      onHover(body)
    }
    const onPointerDown = (event: PointerEvent) => {
      isDragging = true
      pointerMoved = false
      lastPointer = { x: event.clientX, y: event.clientY }
      renderer.domElement.setPointerCapture(event.pointerId)
    }
    const onPointerUp = (event: PointerEvent) => {
      isDragging = false
      renderer.domElement.releasePointerCapture(event.pointerId)
      // Click target matches whatever hover identified (L2 → L3): nearest
      // screen-space ember wins over raycast so the body under the hover
      // chip is always the body a click selects.
      const body = pickNearestEmber(event) ?? pickPlanet(event)
      if (!pointerMoved) onSelect(body)
    }
    const onPointerLeave = () => {
      if (!isDragging) onHover(null)
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      cameraStateRef.current.distance += event.deltaY * 0.028
      cameraStateRef.current.distance = clamp(
        cameraStateRef.current.distance,
        12,
        140,
      )
    }

    let isVisible = true
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        const wasVisible = isVisible
        isVisible = entry.isIntersecting
        if (isVisible && !wasVisible && !document.hidden) {
          frame = window.requestAnimationFrame(animate)
        }
      },
      { threshold: 0.05 },
    )
    intersectionObserver.observe(host)
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame)
      } else if (isVisible) {
        frame = window.requestAnimationFrame(animate)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()
    motionMedia.addEventListener('change', onMotionChange)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointerup', onPointerUp)
    renderer.domElement.addEventListener('pointerleave', onPointerLeave)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })
    frame = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      motionMedia.removeEventListener('change', onMotionChange)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      renderer.domElement.removeEventListener('wheel', onWheel)
      setLabels([])
      setClusterLabels([])
      scene.traverse((object) => {
        if (
          'geometry' in object &&
          object.geometry instanceof THREE.BufferGeometry
        ) {
          object.geometry.dispose()
        }
        if ('material' in object) {
          const material = object.material
          if (Array.isArray(material))
            material.forEach((item) => item.dispose())
          else if (material instanceof THREE.Material) material.dispose()
        }
      })
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [model, dustField, nebulaRegions, onHover, onSelect])

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden">
      {isLoading ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--theme-accent-secondary)]">
          mapping vault
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 z-[9]">
        {clusterLabels.map((cluster) => (
          <div
            key={cluster.armId}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,179,71,0.14)] bg-[rgba(5,11,22,0.5)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--theme-accent-secondary)] backdrop-blur-sm"
            style={{ left: cluster.x, top: cluster.y, opacity: cluster.opacity }}
          >
            {cluster.name}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 z-10">
        {labels.map((label) => (
          <button
            type="button"
            key={`${label.kind}:${label.id}`}
            onClick={() => onSelect(label.body)}
            onMouseEnter={() => onHover(label.body)}
            onMouseLeave={() => onHover(null)}
            className={`pointer-events-auto absolute max-w-[190px] -translate-x-1/2 -translate-y-1/2 truncate border backdrop-blur-sm transition-colors ${
              label.kind === 'planet'
                ? 'rounded-md border-[rgba(255,210,122,0.12)] bg-[rgba(2,7,18,0.42)] px-1.5 text-[12px] font-semibold text-[var(--theme-text-strong)] shadow-[0_0_14px_rgba(2,7,18,0.9)]'
                : 'rounded border-[rgba(255,179,71,0.12)] bg-[rgba(9,10,18,0.55)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--theme-text-soft)]'
            } ${label.active ? 'text-[var(--theme-accent-secondary)] border-[rgba(255,179,71,0.34)]' : ''}`}
            style={{
              left: label.x,
              top: label.y,
              opacity: label.opacity,
              transform: `translate(-50%, -50%) scale(${label.scale})`,
              boxShadow:
                label.kind === 'planet'
                  ? `0 0 0 1px ${folderTintFor(label.body.folder)}33`
                  : undefined,
            }}
            title={label.body.title}
          >
            {shortTitle(label.body.title).slice(
              0,
              label.kind === 'planet' ? 36 : 24,
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
export function MindGraphCard() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [disabledArms, setDisabledArms] = useState<Set<string>>(() => new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [thisWeekOnly, setThisWeekOnly] = useState(false)
  // L4 search-to-fly: debounce keystrokes 300ms before hitting the real
  // vault search endpoint, so the 3D-highlight `searchTerm` state above
  // (already wired) stays snappy while the results dropdown below stays
  // network-quiet.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => window.clearTimeout(handle)
  }, [searchTerm])
  const searchResultsQuery = useQuery({
    queryKey: ['dashboard', 'knowledge-search', debouncedSearch],
    enabled: debouncedSearch.length > 0,
    queryFn: async (): Promise<{
      results: Array<{ path: string; title: string; line: number; text: string }>
    }> => {
      const response = await fetch(
        `/api/knowledge/search?q=${encodeURIComponent(debouncedSearch)}`,
      )
      if (!response.ok) throw new Error(`search ${response.status}`)
      return (await response.json()) as {
        results: Array<{ path: string; title: string; line: number; text: string }>
      }
    },
    staleTime: 15_000,
  })
  const searchResults = (searchResultsQuery.data?.results ?? []).slice(0, 8)
  const graphQuery = useQuery({
    queryKey: ['dashboard', 'knowledge-galaxy'],
    queryFn: readKnowledgeGraph,
    staleTime: 20_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: true,
  })
  const insightsQuery = useQuery({
    queryKey: ['dashboard', 'knowledge-insights'],
    queryFn: async (): Promise<{ ok: boolean; insights: VaultGraphInsights }> => {
      const response = await fetch('/api/knowledge/insights')
      if (!response.ok) throw new Error(`insights ${response.status}`)
      return (await response.json()) as { ok: boolean; insights: VaultGraphInsights }
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
  const queryClient = useQueryClient()
  const proposeCleanup = useMutation({
    mutationFn: async (rec: VaultGraphInsights['recommendations'][number]) => {
      const response = await fetch('/api/knowledge/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec),
      })
      if (!response.ok) throw new Error(`propose ${response.status}`)
      return response.json()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['taylor-approvals'] })
      void queryClient.invalidateQueries({ queryKey: ['nova-fabric'] })
    },
  })
  const model = useMemo(
    () => buildGalaxyModel(graphQuery.data),
    [graphQuery.data],
  )
  const dustField = useMemo(() => buildDustField(), [])
  const nebulaRegions = useMemo(() => buildNebulaRegions(model), [model])
  const selectedBody = selectedId
    ? (model.bodyById.get(selectedId) ?? null)
    : null
  const inspectedBody = inspectedId
    ? (model.bodyById.get(inspectedId) ?? null)
    : null
  // Operational galaxy: a selected real note is read from the vault via
  // /api/knowledge/read (content + resolved backlinks) — no invented data.
  const selectedNotePath =
    inspectedBody && inspectedBody.path.toLowerCase().endsWith('.md')
      ? inspectedBody.path
      : null
  const noteQuery = useQuery({
    queryKey: ['dashboard', 'knowledge-note', selectedNotePath],
    enabled: selectedNotePath !== null,
    queryFn: async (): Promise<{
      page: { title: string; path: string; modified: string }
      content: string
      backlinks: Array<string>
    }> => {
      const response = await fetch(
        `/api/knowledge/read?path=${encodeURIComponent(selectedNotePath ?? '')}`,
      )
      if (!response.ok) throw new Error(`read ${response.status}`)
      return (await response.json()) as {
        page: { title: string; path: string; modified: string }
        content: string
        backlinks: Array<string>
      }
    },
    staleTime: 60_000,
  })
  const hoveredBody = hoveredId ? (model.bodyById.get(hoveredId) ?? null) : null
  const focusedBody = inspectedBody ?? hoveredBody ?? model.core
  const largestSystems = model.systems.slice(0, 6)
  const visibleComets = model.comets.slice(0, 3)

  useEffect(() => {
    if (!selectedId) {
      setInspectedId(null)
      return
    }
    const arrival = window.setTimeout(() => setInspectedId(selectedId), 860)
    return () => window.clearTimeout(arrival)
  }, [selectedId])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setInspectedId(null)
  }, [])
  useEscape(clearSelection)
  const handleHover = useCallback(
    (body: CelestialBody | null) => setHoveredId(body?.id ?? null),
    [],
  )
  const handleSelect = useCallback(
    (body: CelestialBody | null) => setSelectedId(body?.id ?? null),
    [],
  )
  const toggleArm = (arm: GalaxyArm) => {
    setDisabledArms((current) => {
      const next = new Set(current)
      if (next.has(arm.id)) next.delete(arm.id)
      else next.add(arm.id)
      return next
    })
  }

  return (
    <section
      id="nova-mind-graph"
      aria-labelledby="nova-mind-graph-title"
      className="nova-galaxy-card relative overflow-hidden rounded-xl border p-2.5 sm:p-4"
    >
      <div className="relative z-10 flex flex-col gap-3 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="nova-label">Operational map</div>
              <h2
                id="nova-mind-graph-title"
                className="mt-1 text-xl font-semibold text-[var(--theme-text-strong)] sm:text-2xl"
              >
                Nova’s working universe
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--theme-muted)]">
                Projects, agents, handoffs, and decisions mapped as a navigable
                3D field. Select a body to fly into its system.
              </p>
            </div>
            <div className="max-w-full rounded-full border border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-accent-secondary)] sm:tracking-[0.16em]">
              {graphQuery.isFetching ? 'syncing' : 'vault live'} -{' '}
              {model.totals.bodies} bodies - {model.totals.links} links
            </div>
          </div>

          <div className="nova-galaxy-field relative mt-3 h-[58vh] min-h-[360px] flex-1 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] lg:h-[70vh] lg:min-h-[560px]">
            <Galaxy3D
              model={model}
              dustField={dustField}
              nebulaRegions={nebulaRegions}
              selectedBody={selectedBody}
              hoveredBody={hoveredBody}
              disabledArms={disabledArms}
              searchTerm={searchTerm}
              thisWeekOnly={thisWeekOnly}
              isLoading={graphQuery.isLoading}
              onHover={handleHover}
              onSelect={handleSelect}
            />
            <div className="absolute left-2 right-2 top-2 z-20 flex flex-wrap items-center gap-1.5 sm:left-3 sm:right-3 sm:top-3 sm:gap-2">
              <div className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.72)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted)] backdrop-blur-sm">
                auto-sync 45s
              </div>
              {model.arms.slice(0, 7).map((arm) => {
                const disabled = disabledArms.has(arm.id)
                return (
                  <button
                    type="button"
                    key={arm.id}
                    onClick={() => toggleArm(arm)}
                    className={`rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors sm:text-[10px] sm:tracking-[0.12em] ${disabled ? 'border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.58)] text-[var(--theme-muted-2)]' : 'border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] text-[var(--theme-accent-secondary)]'}`}
                    aria-pressed={!disabled}
                  >
                    {arm.name}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setThisWeekOnly((current) => !current)}
                className={`rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors sm:text-[10px] sm:tracking-[0.12em] ${thisWeekOnly ? 'border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] text-[var(--theme-accent-secondary)]' : 'border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.58)] text-[var(--theme-muted-2)]'}`}
                aria-pressed={thisWeekOnly}
              >
                this week
              </button>
              <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-auto sm:min-w-[180px]">
                <label className="flex w-full min-w-0 items-center rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.72)] px-2 py-1 backdrop-blur-sm">
                  <span className="sr-only">Search galaxy notes</span>
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search notes"
                    className="w-full bg-transparent font-mono text-[11px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted-2)]"
                  />
                </label>
                {debouncedSearch && searchResults.length > 0 ? (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--theme-border)] bg-[rgba(5,11,22,0.94)] p-1 backdrop-blur-sm">
                    {searchResults.map((result) => {
                      const inGalaxy = model.bodyById.has(result.path)
                      return (
                        <button
                          key={result.path}
                          type="button"
                          disabled={!inGalaxy}
                          onClick={() => {
                            if (!inGalaxy) return
                            setSelectedId(result.path)
                            setSearchTerm(result.title)
                          }}
                          className={`flex w-full items-center justify-between gap-2 truncate rounded px-2 py-1 text-left font-mono text-[10px] ${
                            inGalaxy
                              ? 'text-[var(--theme-text-soft)] hover:bg-[var(--theme-accent-subtle)] hover:text-[var(--theme-accent-secondary)]'
                              : 'cursor-default text-[var(--theme-muted-2)]'
                          }`}
                          title={result.text}
                        >
                          <span className="truncate">{shortTitle(result.title)}</span>
                          {!inGalaxy ? (
                            <span className="shrink-0 text-[9px] normal-case tracking-normal text-[var(--theme-muted-2)]">
                              not in galaxy (tag/unlinked)
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.72)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--theme-muted)] backdrop-blur-sm">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: GALAXY_PALETTE.blues[0] }} />
                color = cluster
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ background: GALAXY_PALETTE.ambers[1] }} />
                size = links
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 animate-pulse rounded-full" style={{ background: GALAXY_PALETTE.ambers[0] }} />
                pulse = hub
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: '#FFF1CC' }} />
                bright = this week
              </span>
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full" style={{ background: TAN }} />
                comet = orphan
              </span>
            </div>
            {graphQuery.isError ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
                <div>
                  <div className="nova-label">Vault signal lost</div>
                  <p className="mt-2 text-sm text-[var(--theme-muted)]">
                    Knowledge graph endpoint did not answer. The dashboard will
                    reconnect automatically.
                  </p>
                </div>
              </div>
            ) : null}
            {!graphQuery.isLoading && model.totals.bodies === 0 ? (
              <div className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center">
                <div>
                  <div className="nova-label">No vault bodies yet</div>
                  <p className="mt-2 text-sm text-[var(--theme-muted)]">
                    Add linked notes to the knowledge vault and this galaxy will
                    populate from Obsidian-style wikilinks.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="relative z-10 grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:flex xl:w-72 xl:flex-col">
          <div className="rounded-xl border border-[var(--theme-border)] bg-[rgba(22,23,42,0.78)] p-3">
            <div className="nova-label">Obsidian reflection</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.52)] p-3">
                <div className="nova-label">bodies</div>
                <div className="nova-metric mt-1 text-xl">
                  {model.totals.bodies}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.52)] p-3">
                <div className="nova-label">systems</div>
                <div className="nova-metric mt-1 text-xl">
                  {model.totals.systems}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.38)] px-3 py-2">
                <div className="nova-label">links</div>
                <div className="nova-metric mt-1 text-sm">
                  {model.totals.links}
                </div>
              </div>
              <div className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.38)] px-3 py-2">
                <div className="nova-label">comets</div>
                <div className="nova-metric mt-1 text-sm">
                  {model.totals.comets}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--theme-border)] bg-[rgba(22,23,42,0.78)] p-3">
            <div className="nova-label">System inspector</div>
            <div className="mt-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.54)] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--theme-text-strong)]">
                    {focusedBody
                      ? shortTitle(focusedBody.title)
                      : 'Waiting for vault'}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                    {focusedBody
                      ? `${bodyLabel(focusedBody)} - ${focusedBody.degree} links`
                      : 'sync pending'}
                  </div>
                </div>
                {focusedBody ? (
                  <span className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-accent-secondary)]">
                    {focusedBody.folder}
                  </span>
                ) : null}
              </div>
              {focusedBody ? (
                <div className="mt-3 space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                    modified {formatModified(focusedBody.modified)}
                  </div>
                  <p className="line-clamp-4 text-xs leading-relaxed text-[var(--theme-text-soft)]">
                    {focusedBody.excerpt || 'No preview text yet.'}
                  </p>
                  {focusedBody.kind === 'tag' ||
                  focusedBody.kind === 'comet' ? (
                    <a
                      href={obsidianUri(focusedBody)}
                      className="inline-flex rounded-lg border border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-accent-secondary)] hover:border-[var(--theme-accent-border)]"
                    >
                      Open in Obsidian
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>

            {selectedNotePath ? (
              <div className="mt-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.54)] px-3 py-2">
                <div className="nova-label">Note (live from vault)</div>
                {noteQuery.isLoading ? (
                  <p className="mt-2 text-[11px] text-[var(--theme-muted)]">
                    Reading {selectedNotePath}…
                  </p>
                ) : null}
                {noteQuery.isError ? (
                  <p className="mt-2 text-[11px] text-[var(--theme-danger)]">
                    Could not read this note from the vault.
                  </p>
                ) : null}
                {noteQuery.data ? (
                  <>
                    <div className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--theme-text-soft)]">
                      {noteQuery.data.content.trim() || 'Empty note.'}
                    </div>
                    <div className="mt-2 border-t border-[var(--theme-border-subtle)] pt-2">
                      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                        {noteQuery.data.backlinks.length} backlink
                        {noteQuery.data.backlinks.length === 1 ? '' : 's'}
                      </div>
                      {noteQuery.data.backlinks.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {noteQuery.data.backlinks.slice(0, 6).map((backlink) => (
                            <button
                              key={backlink}
                              type="button"
                              onClick={() => setSelectedId(backlink)}
                              title={backlink}
                              className="max-w-full truncate rounded-full border border-[var(--theme-border)] px-2 py-0.5 font-mono text-[9px] text-[var(--theme-accent-secondary)] transition-colors hover:border-[var(--theme-accent-border)]"
                            >
                              {backlink.split('/').pop()?.replace(/\.md$/i, '') ?? backlink}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--theme-border)] bg-[rgba(22,23,42,0.78)] p-3">
            <div className="nova-label">Planetary systems</div>
            <div className="mt-2 space-y-2">
              {largestSystems.map((system) => (
                <button
                  type="button"
                  key={system.id}
                  onClick={() => setSelectedId(system.planet.id)}
                  className="w-full rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.48)] px-3 py-2 text-left transition-colors hover:border-[var(--theme-accent-border)] hover:bg-[var(--theme-accent-subtle)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="nova-fragment text-[var(--theme-accent-secondary)]">
                      {shortTitle(system.planet.title).slice(0, 24)}
                    </span>
                    <span className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-text)]">
                      {system.bodyCount}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                    {system.folder} - {system.totalLinks} links
                  </div>
                </button>
              ))}
            </div>
          </div>

          {insightsQuery.data?.insights ? (
            <div className="rounded-xl border border-[var(--theme-border)] bg-[rgba(22,23,42,0.78)] p-3">
              <div className="nova-label">Vault health</div>
              <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                <span>{insightsQuery.data.insights.orphans.length} orphans</span>
                <span>{insightsQuery.data.insights.staleImportant.length} stale hubs</span>
                <span>{insightsQuery.data.insights.duplicateCandidates.length} dupe candidates</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {insightsQuery.data.insights.recommendations.slice(0, 3).map((rec) => (
                  <div
                    key={`${rec.kind}-${rec.title}`}
                    className="rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.4)] px-2 py-1.5"
                  >
                    <div className="truncate font-mono text-[10px] text-[var(--theme-text-soft)]">
                      {rec.title}
                    </div>
                    <button
                      type="button"
                      disabled={proposeCleanup.isPending}
                      onClick={() => proposeCleanup.mutate(rec)}
                      className="mt-1 rounded border border-[var(--theme-border)] px-2 py-0.5 text-[10px] text-[var(--theme-text)] hover:border-[var(--theme-accent-border)] disabled:opacity-50"
                    >
                      Propose cleanup review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {visibleComets.length > 0 ? (
            <div className="rounded-xl border border-[var(--theme-border)] bg-[rgba(22,23,42,0.78)] p-3">
              <div className="nova-label">Passing comets</div>
              <div className="mt-2 space-y-1.5">
                {visibleComets.map((comet) => (
                  <button
                    type="button"
                    key={comet.id}
                    onClick={() => setSelectedId(comet.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.4)] px-2 py-1.5 text-left hover:border-[var(--theme-accent-border)]"
                  >
                    <span className="truncate font-mono text-[10px] text-[var(--theme-text-soft)]">
                      {shortTitle(comet.title)}
                    </span>
                    <span className="text-[10px] text-[var(--theme-muted)]">
                      orphan
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  )
}
