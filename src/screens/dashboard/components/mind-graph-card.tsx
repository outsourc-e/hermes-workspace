import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildGalaxyModel,
  clamp,
  hashString,
  obsidianUri,
  shortTitle,
} from './nova-galaxy-model'
import type {
  CelestialBody,
  GalaxyArm,
  GalaxyModel,
  KnowledgeGraphResponse,
  PlanetarySystem,
} from './nova-galaxy-model'

type ScreenBody = {
  body: CelestialBody
  x: number
  y: number
  radius: number
  opacity: number
}

type CameraState = {
  x: number
  y: number
  scale: number
}

type GalaxyCanvasProps = {
  model: GalaxyModel
  selectedBody: CelestialBody | null
  hoveredBody: CelestialBody | null
  disabledArms: Set<string>
  searchTerm: string
  reducedLabels: boolean
  isLoading: boolean
  onHover: (body: CelestialBody | null) => void
  onSelect: (body: CelestialBody | null) => void
}

const SPACE = '#0D0E18'
const SPACE_DEEP = '#090A12'
const PANEL = '#16172A'
const WARM_BROWN = '#4A2A10'
const COPPER = '#7A441E'
const TAN = '#D4A276'
const AMBER = '#FF8C1A'
const GOLD = '#FFB347'
const STAR = '#FFD27A'
const STRONG = '#FFF1CC'

async function readKnowledgeGraph(): Promise<KnowledgeGraphResponse> {
  const response = await fetch('/api/knowledge/graph')
  if (!response.ok) {
    throw new Error(`knowledge graph ${response.status}`)
  }
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
  if (body.kind === 'moon') return 'Moon'
  return 'Comet'
}

function systemForBody(
  model: GalaxyModel,
  body: CelestialBody | null,
): PlanetarySystem | null {
  if (!body) return null
  return model.systemByBodyId.get(body.id) ?? null
}

function warmth(body: CelestialBody): number {
  if (body.kind === 'core') return 1
  if (body.recencyTier === 'hot') return 0.92
  if (body.recencyTier === 'warm') return 0.68
  return 0.34
}

function worldToScreen(
  x: number,
  y: number,
  width: number,
  height: number,
  camera: CameraState,
  rotation: number,
): { x: number; y: number } {
  const nx = x - 50
  const ny = (y - 50) / 0.62
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const rx = nx * cos - ny * sin
  const ry = nx * sin + ny * cos
  return {
    x: width / 2 + (rx - camera.x) * (width / 100) * camera.scale,
    y: height / 2 + (ry * 0.62 - camera.y) * (height / 100) * camera.scale,
  }
}

function systemPosition(system: PlanetarySystem): { x: number; y: number } {
  return { x: system.baseX, y: system.baseY }
}

function drawDisc(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  alpha: number,
): void {
  context.globalAlpha = alpha
  context.fillStyle = fill
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 1
}

function drawGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
  gradient.addColorStop(0, color.replace('ALPHA', `${alpha}`))
  gradient.addColorStop(0.44, color.replace('ALPHA', `${alpha * 0.24}`))
  gradient.addColorStop(1, color.replace('ALPHA', '0'))
  context.fillStyle = gradient
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
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

function bodyRadius(body: CelestialBody, system?: PlanetarySystem): number {
  if (body.kind === 'core') return 12 + body.sizeTier * 1.8
  if (body.kind === 'planet')
    return 7.8 + (system?.sizeTier ?? body.sizeTier) * 1.55
  if (body.kind === 'comet') return 1.3
  return 2 + body.sizeTier * 0.56
}

function drawOrb(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  body: CelestialBody,
  alpha: number,
): void {
  const hot = warmth(body) > 0.65 || body.kind === 'core'
  const rim = body.kind === 'core' ? AMBER : hot ? GOLD : TAN
  const gradient = context.createRadialGradient(
    x - radius * 0.34,
    y - radius * 0.42,
    Math.max(1, radius * 0.08),
    x,
    y,
    radius,
  )
  gradient.addColorStop(0, `rgba(255, 241, 204, ${0.95 * alpha})`)
  gradient.addColorStop(0.18, `rgba(255, 179, 71, ${0.82 * alpha})`)
  gradient.addColorStop(0.56, `rgba(122, 68, 30, ${0.72 * alpha})`)
  gradient.addColorStop(1, `rgba(13, 14, 24, ${0.96 * alpha})`)
  context.fillStyle = gradient
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = hot
    ? `rgba(255, 179, 71, ${0.62 * alpha})`
    : `rgba(212, 162, 118, ${0.36 * alpha})`
  context.lineWidth = Math.max(0.8, radius * 0.08)
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.stroke()

  if (body.kind === 'core' || body.kind === 'planet') {
    context.save()
    context.translate(x, y)
    context.rotate(body.orbitTilt)
    context.strokeStyle = `rgba(255, 179, 71, ${0.2 * alpha})`
    context.lineWidth = Math.max(0.7, radius * 0.045)
    context.beginPath()
    context.ellipse(0, 0, radius * 1.3, radius * 0.42, 0, 0, Math.PI * 2)
    context.stroke()
    context.restore()
  }

  context.fillStyle = rim
  context.globalAlpha = 0.22 * alpha
  context.beginPath()
  context.arc(
    x + radius * 0.18,
    y + radius * 0.16,
    radius * 0.58,
    0,
    Math.PI * 2,
  )
  context.fill()
  context.globalAlpha = 1
}

function drawGalaxyLinks(
  context: CanvasRenderingContext2D,
  model: GalaxyModel,
  points: Map<string, ScreenBody>,
  activeSystem: PlanetarySystem | null,
  searchTerm: string,
  searchActive: boolean,
): void {
  context.save()
  context.globalCompositeOperation = 'destination-over'
  for (const link of model.links) {
    const source = points.get(link.source)
    const target = points.get(link.target)
    if (!source || !target) continue
    if (source.opacity < 0.1 || target.opacity < 0.1) continue
    const active =
      activeSystem &&
      (source.body.systemId === activeSystem.id ||
        target.body.systemId === activeSystem.id)
    const searched =
      searchActive &&
      (matchesSearch(source.body, searchTerm) ||
        matchesSearch(target.body, searchTerm))
    const distance = Math.hypot(source.x - target.x, source.y - target.y)
    if (!active && !searched) continue
    if (!active && searched && distance > 460) continue
    const opacity = active ? 0.28 : 0.16
    const midX = (source.x + target.x) / 2
    const midY = (source.y + target.y) / 2
    const bend = Math.min(42, distance * 0.08)
    context.strokeStyle = active
      ? `rgba(255, 179, 71, ${opacity})`
      : `rgba(122, 68, 30, ${opacity})`
    context.lineWidth = active ? 1.1 : 0.65
    context.beginPath()
    context.moveTo(source.x, source.y)
    context.quadraticCurveTo(midX, midY - bend, target.x, target.y)
    context.stroke()
    context.shadowBlur = 0
  }
  context.restore()
}
function drawBackground(
  context: CanvasRenderingContext2D,
  model: GalaxyModel,
  width: number,
  height: number,
  camera: CameraState,
  rotation: number,
): void {
  const bg = context.createRadialGradient(
    width * 0.5,
    height * 0.5,
    0,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72,
  )
  bg.addColorStop(0, PANEL)
  bg.addColorStop(0.42, SPACE)
  bg.addColorStop(1, SPACE_DEEP)
  context.fillStyle = bg
  context.fillRect(0, 0, width, height)

  for (const star of model.starfield) {
    const drift = (star.layer - 1) * 3
    const x = ((star.x / 100) * width + camera.x * drift + width) % width
    const y = ((star.y / 100) * height + camera.y * drift + height) % height
    context.fillStyle = star.warm
      ? `rgba(255, 210, 122, ${star.alpha * 0.68})`
      : `rgba(255, 241, 204, ${star.alpha * 0.5})`
    context.beginPath()
    context.arc(x, y, star.r, 0, Math.PI * 2)
    context.fill()
  }

  context.save()
  context.globalCompositeOperation = 'lighter'
  for (const arm of model.arms) {
    const center = worldToScreen(50, 50, width, height, camera, rotation)
    const dust = context.createRadialGradient(
      center.x + Math.cos(arm.angle) * width * 0.12,
      center.y + Math.sin(arm.angle) * height * 0.08,
      0,
      center.x + Math.cos(arm.angle) * width * 0.12,
      center.y + Math.sin(arm.angle) * height * 0.08,
      Math.max(width, height) * 0.34,
    )
    dust.addColorStop(0, 'rgba(122, 68, 30, 0.045)')
    dust.addColorStop(0.46, 'rgba(74, 42, 16, 0.018)')
    dust.addColorStop(1, 'rgba(74, 42, 16, 0)')
    context.fillStyle = dust
    context.beginPath()
    context.ellipse(
      center.x + Math.cos(arm.angle) * width * 0.12,
      center.y + Math.sin(arm.angle) * height * 0.08,
      width * 0.34,
      height * 0.14,
      arm.angle + 0.55,
      0,
      Math.PI * 2,
    )
    context.fill()
  }
  context.restore()
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

function GalaxyCanvas({
  model,
  selectedBody,
  hoveredBody,
  disabledArms,
  searchTerm,
  reducedLabels,
  isLoading,
  onHover,
  onSelect,
}: GalaxyCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const screenBodiesRef = useRef<Array<ScreenBody>>([])
  const cameraRef = useRef<CameraState>({ x: 0, y: 0, scale: 1 })
  const selectedSystem = systemForBody(model, selectedBody)
  const activeIds = useMemo(
    () => activeSystemIds(model, selectedBody, hoveredBody),
    [hoveredBody, model, selectedBody],
  )
  const searchActive = searchTerm.trim().length > 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let frame = 0
    let reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    const draw = (now: number) => {
      const time = reducedMotion ? 0 : now / 1000
      const target: CameraState = selectedSystem
        ? {
            x: selectedSystem.baseX - 50,
            y: selectedSystem.baseY - 50,
            scale: 1.82,
          }
        : { x: 0, y: 0, scale: 1 }
      const camera = cameraRef.current
      const damping = reducedMotion ? 1 : 0.075
      camera.x += (target.x - camera.x) * damping
      camera.y += (target.y - camera.y) * damping
      camera.scale += (target.scale - camera.scale) * damping

      const rotation = reducedMotion ? 0 : time * ((Math.PI * 2) / 520)
      context.clearRect(0, 0, width, height)
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      drawBackground(context, model, width, height, camera, rotation)

      const points = new Map<string, ScreenBody>()
      const activeSystem = selectedSystem ?? systemForBody(model, hoveredBody)

      for (const system of model.systems) {
        const position = systemPosition(system)
        const planetPoint = worldToScreen(
          position.x,
          position.y,
          width,
          height,
          camera,
          rotation,
        )
        const systemActive = activeIds.has(system.id)
        const armDisabled = disabledArms.has(system.armId)
        const systemDimmed = activeIds.size > 0 && !systemActive

        if (systemActive) {
          context.save()
          context.globalAlpha = 0.72
          context.strokeStyle = 'rgba(255, 179, 71, 0.34)'
          context.lineWidth = 1
          for (const moon of system.moons) {
            context.beginPath()
            context.ellipse(
              planetPoint.x,
              planetPoint.y,
              moon.orbitRadius * camera.scale,
              moon.orbitRadius * 0.46 * camera.scale,
              moon.orbitTilt,
              0,
              Math.PI * 2,
            )
            context.stroke()
          }
          context.restore()
        }

        const planetRadius = bodyRadius(system.planet, system) * camera.scale
        let planetOpacity = armDisabled ? 0.15 : 0.86
        if (systemDimmed) planetOpacity *= 0.28
        if (searchActive && !matchesSearch(system.planet, searchTerm))
          planetOpacity *= 0.18
        const planetWarmth = warmth(system.planet)
        const pulse =
          system.planet.recencyTier === 'hot' && !reducedMotion
            ? 1 + Math.sin(time * 1.95 + system.planet.orbitPhase) * 0.12
            : 1

        if (system.planet.kind === 'core' || systemActive) {
          drawGlow(
            context,
            planetPoint.x,
            planetPoint.y,
            planetRadius * (system.planet.kind === 'core' ? 9 : 4.2),
            'rgba(255, 140, 26, ALPHA)',
            (system.planet.kind === 'core' ? 0.34 : 0.18) * planetOpacity,
          )
        }
        drawOrb(
          context,
          planetPoint.x,
          planetPoint.y,
          planetRadius * pulse,
          system.planet,
          planetOpacity,
        )
        points.set(system.planet.id, {
          body: system.planet,
          x: planetPoint.x,
          y: planetPoint.y,
          radius: planetRadius,
          opacity: planetOpacity,
        })

        for (const moon of system.moons) {
          const orbit = reducedMotion
            ? moon.orbitPhase
            : time / moon.orbitPeriod + moon.orbitPhase
          const moonX =
            planetPoint.x +
            Math.cos(orbit * Math.PI * 2) * moon.orbitRadius * camera.scale
          const moonY =
            planetPoint.y +
            Math.sin(orbit * Math.PI * 2) *
              moon.orbitRadius *
              0.46 *
              camera.scale
          let opacity = armDisabled ? 0.15 : 0.54
          if (systemDimmed) opacity *= 0.28
          if (searchActive && !matchesSearch(moon, searchTerm)) opacity *= 0.14
          if (systemActive) opacity = Math.max(opacity, 0.86)
          const moonPulse =
            moon.recencyTier === 'hot' && !reducedMotion
              ? 1 + Math.sin(time * 1.7 + moon.orbitPhase) * 0.1
              : 1
          const radius =
            bodyRadius(moon) * camera.scale * (systemActive ? 1.25 : 1)
          if (moon.recencyTier === 'hot' || systemActive) {
            drawGlow(
              context,
              moonX,
              moonY,
              radius * (systemActive ? 4.8 : 3.2),
              'rgba(255, 179, 71, ALPHA)',
              (systemActive ? 0.15 : 0.09) * opacity,
            )
          }
          drawOrb(context, moonX, moonY, radius * moonPulse, moon, opacity)
          points.set(moon.id, {
            body: moon,
            x: moonX,
            y: moonY,
            radius,
            opacity,
          })
        }
      }

      const visibleComets = model.comets.slice(0, 5)
      visibleComets.forEach((comet, index) => {
        const drift = reducedMotion
          ? 0
          : (time / comet.orbitPeriod + index * 0.11) % 1
        const base = worldToScreen(
          comet.baseX,
          comet.baseY,
          width,
          height,
          camera,
          rotation * 0.35,
        )
        const lane = (drift - 0.5) * width * 0.38
        const x = base.x + lane
        const y =
          base.y +
          Math.sin(drift * Math.PI * 2 + comet.orbitPhase) * height * 0.06
        let opacity = disabledArms.has(comet.armId) ? 0.12 : 0.34
        if (activeIds.size > 0) opacity *= 0.55
        if (searchActive && !matchesSearch(comet, searchTerm)) opacity *= 0.16
        context.strokeStyle = `rgba(122, 68, 30, ${opacity * 0.34})`
        context.lineWidth = 1
        context.beginPath()
        context.moveTo(x - 16 * camera.scale, y + 3 * camera.scale)
        context.lineTo(x - 5 * camera.scale, y + 1 * camera.scale)
        context.stroke()
        drawDisc(context, x, y, 1.4 * camera.scale, TAN, opacity)
        points.set(comet.id, { body: comet, x, y, radius: 5, opacity })
      })

      drawGalaxyLinks(
        context,
        model,
        points,
        activeSystem,
        searchTerm,
        searchActive,
      )

      if (searchActive) {
        context.save()
        context.strokeStyle = 'rgba(255, 179, 71, 0.28)'
        context.lineWidth = 0.7
        for (const point of points.values()) {
          if (!matchesSearch(point.body, searchTerm)) continue
          context.beginPath()
          context.moveTo(width * 0.5, 28)
          context.lineTo(point.x, point.y)
          context.stroke()
          drawGlow(
            context,
            point.x,
            point.y,
            point.radius * 5,
            'rgba(255, 179, 71, ALPHA)',
            0.18,
          )
        }
        context.restore()
      }

      const labels: Array<ScreenBody> = []
      const corePoint = model.core ? points.get(model.core.id) : undefined
      if (corePoint) labels.push(corePoint)
      if (reducedLabels) {
        for (const system of model.systems.slice(0, 5)) {
          const point = points.get(system.planet.id)
          if (point && point.body.kind !== 'core') labels.push(point)
        }
      }
      if (!reducedLabels && activeSystem) {
        for (const body of [
          activeSystem.planet,
          ...activeSystem.moons.slice(0, 18),
        ]) {
          const point = points.get(body.id)
          if (point) labels.push(point)
        }
      }
      drawGalaxyLinks(
        context,
        model,
        points,
        activeSystem,
        searchTerm,
        searchActive,
      )

      if (searchActive) {
        for (const point of points.values()) {
          if (matchesSearch(point.body, searchTerm)) labels.push(point)
        }
      }
      context.font = '11px JetBrains Mono, ui-monospace, monospace'
      context.textAlign = 'center'
      context.textBaseline = 'top'
      for (const point of labels) {
        if (point.opacity < 0.18) continue
        context.shadowColor = 'rgba(9, 10, 18, 0.9)'
        context.shadowBlur = 8
        context.fillStyle = point.body.kind === 'core' ? STRONG : STAR
        context.globalAlpha = point.body.kind === 'core' ? 0.9 : 0.76
        context.fillText(
          shortTitle(point.body.title).slice(
            0,
            point.body.kind === 'core' ? 34 : 24,
          ),
          point.x,
          point.y + point.radius + 7,
        )
      }
      context.shadowBlur = 0
      context.globalAlpha = 1
      screenBodiesRef.current = Array.from(points.values())

      if (isLoading) {
        context.fillStyle = STAR
        context.font = '12px JetBrains Mono, ui-monospace, monospace'
        context.fillText('mapping vault', width / 2, height / 2 + 32)
      }

      frame = window.requestAnimationFrame(draw)
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleMotionChange = () => {
      reducedMotion = media.matches
    }
    media.addEventListener('change', handleMotionChange)
    frame = window.requestAnimationFrame(draw)

    const nearestBody = (event: MouseEvent): CelestialBody | null => {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      let nearest: ScreenBody | null = null
      for (const point of screenBodiesRef.current) {
        if (point.opacity < 0.12) continue
        const distance = Math.hypot(point.x - x, point.y - y)
        if (
          distance <= Math.max(9, point.radius + 6) &&
          (!nearest || distance < Math.hypot(nearest.x - x, nearest.y - y))
        ) {
          nearest = point
        }
      }
      return nearest?.body ?? null
    }

    const onMouseMove = (event: MouseEvent) => {
      const body = nearestBody(event)
      canvas.style.cursor = body ? 'pointer' : 'crosshair'
      onHover(body)
    }
    const onMouseLeave = () => {
      canvas.style.cursor = 'crosshair'
      onHover(null)
    }
    const onClick = (event: MouseEvent) => onSelect(nearestBody(event))

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('click', onClick)

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      media.removeEventListener('change', handleMotionChange)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('click', onClick)
    }
  }, [
    activeIds,
    disabledArms,
    hoveredBody,
    isLoading,
    model,
    onHover,
    onSelect,
    reducedLabels,
    searchActive,
    searchTerm,
    selectedBody,
    selectedSystem,
  ])

  return (
    <canvas
      ref={canvasRef}
      className="nova-galaxy-canvas absolute inset-0 size-full"
      aria-label="Solar-system spiral galaxy map of the Obsidian vault"
      role="img"
    />
  )
}

export function MindGraphCard() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
  const model = useMemo(
    () => buildGalaxyModel(graphQuery.data),
    [graphQuery.data],
  )
  const selectedBody = selectedId
    ? (model.bodyById.get(selectedId) ?? null)
    : null
  const hoveredBody = hoveredId ? (model.bodyById.get(hoveredId) ?? null) : null
  const focusedBody = selectedBody ?? hoveredBody ?? model.core
  const focusedSystem = systemForBody(model, focusedBody)
  const largestSystems = model.systems.slice(0, 6)
  const visibleComets = model.comets.slice(0, 3)

  const clearSelection = useCallback(() => setSelectedId(null), [])
  useEscape(clearSelection)

  const handleHover = useCallback((body: CelestialBody | null) => {
    setHoveredId(body?.id ?? null)
  }, [])

  const handleSelect = useCallback((body: CelestialBody | null) => {
    setSelectedId(body?.id ?? null)
  }, [])

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
      className="nova-galaxy-card relative overflow-hidden rounded-xl border p-3 sm:p-4"
    >
      <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="nova-label">Mind graph</div>
              <h2
                id="nova-mind-graph-title"
                className="mt-1 text-2xl font-semibold text-[var(--theme-text-strong)]"
              >
                Obsidian galaxy
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--theme-muted)]">
                Notes become planets, moons, and comets. Recent work warms the
                sky; touch a system and it wakes.
              </p>
            </div>
            <div className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-accent-secondary)]">
              {graphQuery.isFetching ? 'syncing' : 'vault live'} -{' '}
              {model.totals.bodies} bodies - {model.totals.links} links
            </div>
          </div>

          <div className="nova-galaxy-field relative mt-3 min-h-[430px] flex-1 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] sm:h-[560px] lg:h-[650px]">
            <GalaxyCanvas
              model={model}
              selectedBody={selectedBody}
              hoveredBody={hoveredBody}
              disabledArms={disabledArms}
              searchTerm={searchTerm}
              reducedLabels={
                !selectedBody && !hoveredBody && !searchTerm.trim()
              }
              isLoading={graphQuery.isLoading}
              onHover={handleHover}
              onSelect={handleSelect}
            />
            <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-2">
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
                    className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
                      disabled
                        ? 'border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.58)] text-[var(--theme-muted-2)]'
                        : 'border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] text-[var(--theme-accent-secondary)]'
                    }`}
                    aria-pressed={!disabled}
                  >
                    {arm.name}
                  </button>
                )
              })}
              <label className="ml-auto flex min-w-[180px] items-center rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.72)] px-2 py-1 backdrop-blur-sm">
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

        <aside className="relative z-10 flex w-full flex-col gap-3 lg:w-72">
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
            <div className="nova-label">Focused star</div>
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
                  {focusedBody.kind === 'moon' ||
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
