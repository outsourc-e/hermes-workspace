import { useMutation, useQuery, useQueryClient  } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  buildGalaxyModel,
  clamp,
  focusBodyForNavigation,
  focusDistanceForSystem,
  folderTintFor,
  obsidianUri,
  resolveProjectedLabels,
  seededUnit,
  selectLabelCandidates,
  shortTitle,
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
type Galaxy3DProps = {
  model: GalaxyModel
  selectedBody: CelestialBody | null
  hoveredBody: CelestialBody | null
  disabledArms: Set<string>
  searchTerm: string
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
type PlanetObject = {
  body: CelestialBody
  system: PlanetarySystem
  mesh: THREE.Mesh
  ring: THREE.Mesh
  atmosphere: THREE.Mesh
  material: THREE.MeshStandardMaterial
  ringMaterial: THREE.MeshBasicMaterial
  atmosphereMaterial: THREE.ShaderMaterial
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

function planetRadius(body: CelestialBody, system?: PlanetarySystem): number {
  const importance = Math.max(body.importance, system?.planet.importance ?? 0)
  const scaled = Math.log2(importance + 1)
  if (body.kind === 'core') return 3.65 + scaled * 0.58
  return 1.38 + scaled * 0.48
}

function createPlanetTexture(body: CelestialBody): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')!

  const base = context.createLinearGradient(0, 0, 256, 256)
  base.addColorStop(0, body.kind === 'core' ? '#7A4619' : '#5A4530')
  base.addColorStop(0.34, body.kind === 'core' ? '#4A2B12' : '#3C2F23')
  base.addColorStop(0.72, body.kind === 'core' ? '#28180B' : '#211A16')
  base.addColorStop(1, '#05070C')
  context.fillStyle = base
  context.fillRect(0, 0, 256, 256)

  for (let i = 0; i < 74; i += 1) {
    const seed = `${body.id}:texture:${i}`
    context.globalAlpha = 0.055 + seededUnit(`${seed}:a`) * 0.13
    context.strokeStyle =
      seededUnit(`${seed}:warm`) > 0.62
        ? body.kind === 'core'
          ? '#FFB85A'
          : '#C78A4B'
        : body.kind === 'core'
          ? '#9D5B22'
          : '#4F83A8'
    context.lineWidth = 1 + seededUnit(`${seed}:w`) * 5
    context.beginPath()
    const y = seededUnit(`${seed}:y`) * 256
    context.moveTo(-42, y)
    context.bezierCurveTo(
      54,
      y + (seededUnit(`${seed}:c1`) - 0.5) * 82,
      162,
      y + (seededUnit(`${seed}:c2`) - 0.5) * 96,
      304,
      y + (seededUnit(`${seed}:c3`) - 0.5) * 56,
    )
    context.stroke()
  }

  const stormCount = body.kind === 'core' ? 5 : 3
  for (let i = 0; i < stormCount; i += 1) {
    const seed = `${body.id}:storm:${i}`
    const x = 54 + seededUnit(`${seed}:x`) * 150
    const y = 48 + seededUnit(`${seed}:y`) * 160
    const radius = 7 + seededUnit(`${seed}:r`) * 18
    const glow = context.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(
      0,
      body.kind === 'core'
        ? 'rgba(255, 179, 71, 0.26)'
        : 'rgba(255, 196, 122, 0.08)',
    )
    glow.addColorStop(1, 'rgba(255, 179, 71, 0)')
    context.globalAlpha = 1
    context.fillStyle = glow
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  const limb = context.createRadialGradient(88, 70, 18, 128, 128, 142)
  limb.addColorStop(0, 'rgba(255, 241, 204, 0.26)')
  limb.addColorStop(0.36, 'rgba(255, 179, 71, 0.06)')
  limb.addColorStop(0.74, 'rgba(2, 7, 18, 0.14)')
  limb.addColorStop(1, 'rgba(1, 4, 10, 0.56)')
  context.globalAlpha = 1
  context.fillStyle = limb
  context.fillRect(0, 0, 256, 256)

  context.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function createAtmosphereMaterial(
  color: string,
  opacity: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 viewDir = normalize(vViewPosition);
        float rim = 1.0 - max(dot(normalize(vNormal), viewDir), 0.0);
        float halo = smoothstep(0.28, 1.0, rim);
        gl_FragColor = vec4(glowColor, halo * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  })
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

function useEscape(handler: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handler()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handler])
}

function createFogNebula(): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext('2d')!
  const glow = context.createRadialGradient(256, 256, 0, 256, 256, 256)
  glow.addColorStop(0, 'rgba(255, 179, 71, 0.12)')
  glow.addColorStop(0.34, 'rgba(122, 68, 30, 0.07)')
  glow.addColorStop(0.72, 'rgba(74, 42, 16, 0.03)')
  glow.addColorStop(1, 'rgba(9, 10, 18, 0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 512, 512)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
  })
  const sprite = new THREE.Sprite(material)
  sprite.position.set(-28, -10, -48)
  sprite.scale.set(92, 42, 1)
  return sprite
}
function Galaxy3D({
  model,
  selectedBody,
  hoveredBody,
  disabledArms,
  searchTerm,
  isLoading,
  onHover,
  onSelect,
}: Galaxy3DProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [labels, setLabels] = useState<Array<ProjectedLabel>>([])
  const selectedRef = useRef<CelestialBody | null>(selectedBody)
  const hoveredRef = useRef<CelestialBody | null>(hoveredBody)
  const disabledRef = useRef<Set<string>>(disabledArms)
  const searchRef = useRef(searchTerm)
  const reducedMotionRef = useRef(false)
  const cameraStateRef = useRef<CameraState>({
    yaw: -0.92,
    pitch: 0.28,
    distance: OVERVIEW_DISTANCE,
    target: new THREE.Vector3(0, 4, 0),
  })

  useEffect(() => {
    selectedRef.current = selectedBody
    hoveredRef.current = hoveredBody
    disabledRef.current = disabledArms
    searchRef.current = searchTerm
  }, [disabledArms, hoveredBody, searchTerm, selectedBody])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SPACE)
    scene.fog = new THREE.FogExp2(SPACE_SOFT, 0.0062)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 520)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
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
    const rim = new THREE.DirectionalLight('#7D9573', 0.35)
    rim.position.set(18, 8, -40)
    scene.add(ambient, key, coreLight, fill, rim, createFogNebula())

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

    const planetObjects = new Map<string, PlanetObject>()
    const tagObjects: Array<TagObject> = []
    const tagGeometry = new THREE.IcosahedronGeometry(0.28, 1)
    const hitObjects: Array<THREE.Object3D> = []
    const bodyPositions = new Map<string, THREE.Vector3>()

    for (const system of model.systems) {
      const body = system.planet
      const radius = planetRadius(body, system)
      const texture = createPlanetTexture(body)
      const armTint =
        model.arms.find((arm) => arm.id === system.planet.armId)?.tint ??
        folderTintFor(system.folder)
      const material = new THREE.MeshStandardMaterial({
        color: body.kind === 'core' ? '#FFE2A8' : '#E8D7BC',
        map: texture,
        roughness: 0.94,
        metalness: 0.03,
        emissive:
          body.kind === 'core'
            ? new THREE.Color('#7A441E')
            : new THREE.Color('#121820'),
        emissiveIntensity: body.kind === 'core' ? 0.22 : 0.08,
        transparent: true,
        opacity: 0.98,
      })
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 48, 32),
        material,
      )
      mesh.position.copy(bodyPosition(body))
      mesh.userData.bodyId = body.id
      bodyPositions.set(body.id, mesh.position.clone())
      hitObjects.push(mesh)

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: body.kind === 'core' ? AMBER : armTint,
        transparent: true,
        opacity: body.kind === 'core' ? 0.42 : 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          radius * (body.kind === 'core' ? 1.92 : 1.78),
          Math.max(0.034, radius * 0.028),
          12,
          140,
        ),
        ringMaterial,
      )
      ring.position.copy(mesh.position)
      ring.rotation.set(body.orbitTilt, 0.42, 0.12)

      const atmosphereMaterial = createAtmosphereMaterial(
        body.kind === 'core' ? AMBER : armTint,
        body.kind === 'core' ? 0.4 : 0.24,
      )
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(
          radius * (body.kind === 'core' ? 1.34 : 1.24),
          32,
          20,
        ),
        atmosphereMaterial,
      )
      atmosphere.position.copy(mesh.position)
      scene.add(atmosphere, mesh, ring)
      planetObjects.set(body.id, {
        body,
        system,
        mesh,
        ring,
        atmosphere,
        material,
        ringMaterial,
        atmosphereMaterial,
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
        marker.position.copy(bodyPosition(tag))
        marker.scale.setScalar(
          0.62 + Math.min(0.9, Math.log2(tag.importance + 1) * 0.2),
        )
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

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let width = 1
    let height = 1
    let frame = 0
    let lastLabelUpdate = 0
    let isDragging = false
    let lastPointer = { x: 0, y: 0 }
    let pointerMoved = false

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
      state.target.lerp(desiredTarget, reducedMotionRef.current ? 1 : 0.055)
      state.distance +=
        (desiredDistance - state.distance) *
        (reducedMotionRef.current ? 1 : 0.048)
      if (!selected && !isDragging && !reducedMotionRef.current) {
        state.yaw += Math.sin(now / 14000) * 0.00016 + 0.00012
        state.pitch +=
          (0.28 + Math.sin(now / 21000) * 0.03 - state.pitch) * 0.01
      }
      state.pitch = clamp(state.pitch, -0.62, 0.78)
      state.distance = clamp(state.distance, 11, 140)
      const cosPitch = Math.cos(state.pitch)
      camera.position.set(
        state.target.x + Math.sin(state.yaw) * cosPitch * state.distance,
        state.target.y + Math.sin(state.pitch) * state.distance,
        state.target.z + Math.cos(state.yaw) * cosPitch * state.distance,
      )
      camera.lookAt(state.target)
    }

    const bodyVisibleOpacity = (
      body: CelestialBody,
      activeIds: Set<string>,
      query: string,
    ) => {
      const disabled = disabledRef.current.has(body.armId)
      let opacity = disabled ? 0.15 : 1
      if (activeIds.size > 0 && body.systemId && !activeIds.has(body.systemId))
        opacity *= 0.34
      if (query && !matchesSearch(body, query)) opacity *= 0.16
      return opacity
    }
    const updateVisualState = (now: number) => {
      const selected = selectedRef.current
      const hovered = hoveredRef.current
      const query = searchRef.current.trim()
      const activeIds = activeSystemIds(model, selected, hovered)
      const activeBodyId = selected?.id ?? hovered?.id
      for (const planet of planetObjects.values()) {
        const opacity = bodyVisibleOpacity(planet.body, activeIds, query)
        const active =
          activeIds.has(planet.system.id) || planet.body.id === activeBodyId
        const warm = warmth(planet.body)
        const pulse =
          planet.body.recencyTier === 'hot' && !reducedMotionRef.current
            ? 1 + Math.sin(now / 720 + planet.body.orbitPhase) * 0.07
            : 1
        planet.mesh.scale.setScalar(pulse)
        planet.mesh.rotation.y += reducedMotionRef.current
          ? 0
          : 0.0028 + planet.body.sizeTier * 0.00045
        planet.material.opacity = opacity * (active ? 1 : 0.9)
        planet.ringMaterial.opacity =
          opacity *
          (planet.body.kind === 'core' ? 0.44 : active ? 0.36 : 0.2)
        planet.atmosphereMaterial.uniforms.uOpacity.value =
          opacity *
          (planet.body.kind === 'core'
            ? 0.32
            : active || warm > 0.65
              ? 0.24
              : 0.12)
      }
      for (const tag of tagObjects) {
        const opacity = bodyVisibleOpacity(tag.body, activeIds, query)
        const active =
          (tag.body.systemId && activeIds.has(tag.body.systemId)) ||
          tag.body.id === activeBodyId
        const pulse =
          tag.body.recencyTier === 'hot' && !reducedMotionRef.current
            ? 1 + Math.sin(now / 680 + tag.body.orbitPhase) * 0.13
            : 1
        const baseScale =
          0.62 + Math.min(0.9, Math.log2(tag.body.importance + 1) * 0.2)
        tag.mesh.scale.setScalar(baseScale * pulse * (active ? 1.28 : 1))
        tag.material.opacity = opacity * (active ? 1 : 0.62)
        tag.material.emissiveIntensity =
          active ? 0.78 : tag.body.recencyTier === 'hot' ? 0.48 : 0.16
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
        const opacity = bodyVisibleOpacity(comet.body, activeIds, query)
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
        const searched = Boolean(
          query &&
          ((source && matchesSearch(source, query)) ||
            (target && matchesSearch(target, query))),
        )
        const backbone = link.strength >= 12
        if (active) link.material.opacity = 0.42
        else if (searched) link.material.opacity = 0.22
        else if (backbone) link.material.opacity = 0.07
        else link.material.opacity = 0.025
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
        const point = bodyPosition(candidate.body)
        if (candidate.kind === 'planet') {
          const right = new THREE.Vector3().setFromMatrixColumn(
            camera.matrixWorld,
            0,
          )
          const up = new THREE.Vector3().setFromMatrixColumn(
            camera.matrixWorld,
            1,
          )
          const offset =
            planetRadius(candidate.body) *
            (candidate.body.kind === 'core' ? 1.75 : 1.5)
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

    const animate = (now: number) => {
      updateCamera(now)
      updateVisualState(now)
      renderer.render(scene, camera)
      if (now - lastLabelUpdate > 90) {
        projectLabels()
        lastLabelUpdate = now
      }
      frame = window.requestAnimationFrame(animate)
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
    const pickPlanet = (event: PointerEvent): CelestialBody | null => {
      normalizedPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(hitObjects, false)[0]
      return hit
        ? (model.bodyById.get(String(hit.object.userData.bodyId)) ?? null)
        : null
    }
    const onPointerMove = (event: PointerEvent) => {
      if (isDragging) {
        const dx = event.clientX - lastPointer.x
        const dy = event.clientY - lastPointer.y
        if (Math.abs(dx) + Math.abs(dy) > 2) pointerMoved = true
        cameraStateRef.current.yaw -= dx * 0.0045
        cameraStateRef.current.pitch -= dy * 0.0038
        lastPointer = { x: event.clientX, y: event.clientY }
        return
      }
      const body = pickPlanet(event)
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
      const body = pickPlanet(event)
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
      motionMedia.removeEventListener('change', onMotionChange)
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
      renderer.domElement.removeEventListener('wheel', onWheel)
      setLabels([])
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
  }, [model, onHover, onSelect])

  return (
    <div ref={hostRef} className="absolute inset-0 overflow-hidden">
      {isLoading ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--theme-accent-secondary)]">
          mapping vault
        </div>
      ) : null}
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

          <div className="nova-galaxy-field relative mt-3 h-[58vh] min-h-[360px] flex-1 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] sm:h-[560px] lg:h-[650px]">
            <Galaxy3D
              model={model}
              selectedBody={selectedBody}
              hoveredBody={hoveredBody}
              disabledArms={disabledArms}
              searchTerm={searchTerm}
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
              <label className="order-last flex w-full min-w-0 items-center rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.72)] px-2 py-1 backdrop-blur-sm sm:order-none sm:ml-auto sm:w-auto sm:min-w-[180px]">
                <span className="sr-only">Search galaxy notes</span>
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search notes"
                  className="w-full bg-transparent font-mono text-[11px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted-2)]"
                />
              </label>
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
