/**
 * Playground 3D World — real R3F scene with iso camera, walking player,
 * NPCs, and clickable portal. Hackathon base for Hermes Playground.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Sparkles } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import * as THREE from 'three'
import type { PlaygroundWorldId } from '../lib/playground-rpg'
import { botsFor, type BotProfile } from '../lib/playground-bots'
import { ScatteredScenery } from './playground-environment'
import { usePlaygroundMultiplayer, type RemotePlayer as MpRemotePlayer, type IncomingChat } from '../hooks/use-playground-multiplayer'
import { loadAvatarConfig, type AvatarConfig } from '../lib/avatar-config'
import { PlaygroundNpcGlb } from './playground-npc-glb'
import { SpeechBubble } from './speech-bubble'
import { useHermesWorldSettings } from './hermesworld-settings'

/**
 * Module-level GLB presence probe. Returns:
 *   'unknown' — still probing
 *   'present' — use GLB body
 *   'missing' — fall back to voxel body
 *
 * Synchronous read after first probe; the NPC component re-renders when
 * the result resolves.
 */
const _glbPresence = new Map<string, 'unknown' | 'present' | 'missing'>()
function npcGlbUrl(id: string) {
  const safe = id.replace(/[^a-z0-9_-]+/gi, '') || 'villager-common'
  return `/assets/hermesworld/characters/${safe}.glb`
}
function useGlbAvailable(id: string, enabled: boolean): boolean {
  const [_, force] = useState(0)
  const url = npcGlbUrl(id)
  const cached = _glbPresence.get(url)
  useEffect(() => {
    if (!enabled || cached === 'present' || cached === 'missing') return
    if (typeof window === 'undefined') return
    _glbPresence.set(url, 'unknown')
    let cancelled = false
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (cancelled) return
        const ct = r.headers.get('content-type') || ''
        const isReal = r.ok
          && !ct.includes('text/html')
          && (ct.includes('octet-stream') || ct.includes('gltf') || ct.includes('binary') || ct === '' || ct.includes('application/'))
        _glbPresence.set(url, isReal ? 'present' : 'missing')
        force((n) => n + 1)
      })
      .catch(() => {
        if (cancelled) return
        _glbPresence.set(url, 'missing')
        force((n) => n + 1)
      })
    return () => { cancelled = true }
  }, [cached, enabled, url])
  return enabled && cached === 'present'
}

function useAvatarConfig() {
  const [cfg, setCfg] = useState<AvatarConfig>(() => loadAvatarConfig())
  useEffect(() => {
    const update = () => setCfg(loadAvatarConfig())
    window.addEventListener('hermes-playground-avatar-changed', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('hermes-playground-avatar-changed', update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return cfg
}

type DecorType = 'training' | 'classical' | 'tech' | 'forest' | 'temple' | 'arena'

type WorldDef = {
  id: PlaygroundWorldId
  name: string
  accent: string
  groundColor: string
  skyColor: string
  ambient: string
  pillarColor: string
  pillarType: DecorType
  fogNear: number
  fogFar: number
}

const WORLDS_3D: Record<PlaygroundWorldId, WorldDef> = {
  training: {
    id: 'training',
    name: 'Training Grounds',
    accent: '#5eead4',
    groundColor: '#1c4a3b',
    skyColor: '#0b2530',
    ambient: '#2a6b59',
    pillarColor: '#99f6e4',
    pillarType: 'training',
    fogNear: 16,
    fogFar: 54,
  },
  agora: {
    id: 'agora',
    name: 'The Agora',
    accent: '#d9b35f',
    groundColor: '#6b9a55',
    skyColor: '#b9e2ef',
    ambient: '#d7be88',
    pillarColor: '#f3dcb0',
    pillarType: 'classical',
    fogNear: 18,
    fogFar: 62,
  },
  forge: {
    id: 'forge',
    name: 'The Forge',
    accent: '#22d3ee',
    groundColor: '#21192a',
    skyColor: '#090611',
    ambient: '#45211c',
    pillarColor: '#ff8a3d',
    pillarType: 'tech',
    fogNear: 10,
    fogFar: 42,
  },
  grove: {
    id: 'grove',
    name: 'The Grove',
    accent: '#34d399',
    groundColor: '#193b2c',
    skyColor: '#071811',
    ambient: '#1f5f48',
    pillarColor: '#86efac',
    pillarType: 'forest',
    fogNear: 11,
    fogFar: 44,
  },
  oracle: {
    id: 'oracle',
    name: 'Oracle Temple',
    accent: '#a78bfa',
    groundColor: '#261b46',
    skyColor: '#0b0718',
    ambient: '#33215e',
    pillarColor: '#c4b5fd',
    pillarType: 'temple',
    fogNear: 12,
    fogFar: 46,
  },
  arena: {
    id: 'arena',
    name: 'Benchmark Arena',
    accent: '#fb7185',
    groundColor: '#491827',
    skyColor: '#1b070c',
    ambient: '#55202c',
    pillarColor: '#fda4af',
    pillarType: 'arena',
    fogNear: 10,
    fogFar: 38,
  },
}

const ZONE_FALLBACK_BACKGROUNDS: Partial<Record<PlaygroundWorldId, string>> = {
  training: '/assets/hermesworld/zones/zone-1.jpg',
  forge: '/assets/hermesworld/zones/zone-2.jpg',
  grove: '/assets/hermesworld/zones/zone-3.jpg',
  oracle: '/assets/hermesworld/zones/zone-4.jpg',
  arena: '/assets/hermesworld/zones/zone-5.jpg',
}

/* ── Ground ── */
/** Procedural stone-tile plaza overlay (canvas texture). Used as a circular */
/** floor under the central HermesStatue in Training Grounds + Agora. */
function stoneTileTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Base: warm stone
  ctx.fillStyle = '#5a5240'
  ctx.fillRect(0, 0, size, size)
  // Tiles: ~7×7 with mortar gaps
  const tile = size / 8
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      // Slight color variation per tile
      const v = Math.floor(60 + Math.random() * 30)
      ctx.fillStyle = `rgb(${v + 30},${v + 22},${v + 8})`
      ctx.fillRect(x * tile + 2, y * tile + 2, tile - 4, tile - 4)
      // Subtle highlights/cracks
      if (Math.random() < 0.25) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'
        ctx.beginPath()
        ctx.moveTo(x * tile + Math.random() * tile, y * tile + Math.random() * tile)
        ctx.lineTo(x * tile + Math.random() * tile, y * tile + Math.random() * tile)
        ctx.stroke()
      }
      // Specular highlight on a corner
      if (Math.random() < 0.4) {
        ctx.fillStyle = `rgba(255,240,200,${0.04 + Math.random() * 0.06})`
        ctx.fillRect(x * tile + 4, y * tile + 4, tile / 2, tile / 8)
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  return tex
}

function Ground({ world }: { world: WorldDef }) {
  const isAgora = world.id === 'agora'
  const showPlaza = world.id === 'training' || world.id === 'agora'
  const stoneTex = useMemo(() => stoneTileTexture(), [])
  // Build a subtle procedural grass color variation by jittering vertex colors
  const grassGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(120, 120, 80, 80)
    const colors = new Float32Array(g.attributes.position.count * 3)
    const base = new THREE.Color(world.groundColor)
    for (let i = 0; i < g.attributes.position.count; i++) {
      const c = base.clone()
      const jitter = (Math.random() - 0.5) * 0.08
      c.r = Math.max(0, Math.min(1, c.r + jitter * 0.6))
      c.g = Math.max(0, Math.min(1, c.g + jitter))
      c.b = Math.max(0, Math.min(1, c.b + jitter * 0.4))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [world.groundColor])
  return (
    <group>
      {/* Base grass / terrain */}
      <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={grassGeo}>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} />
      </mesh>
      {/* Stone-tile circular plaza under central statue — polygon-offset prevents */}
      {/* z-fighting with the statue inscription ring + Agora accent ring above. */}
      {showPlaza && stoneTex && (
        <mesh receiveShadow position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
          <circleGeometry args={[7, 64]} />
          <meshStandardMaterial
            map={stoneTex}
            roughness={0.9}
            metalness={0.05}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      )}
      {/* Soft subtle accent ring far out, only for non-agora worlds */}
      {!isAgora && (
        <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[18, 24, 80]} />
          <meshStandardMaterial color={world.accent} emissive={world.accent} emissiveIntensity={0.12} transparent opacity={0.08} />
        </mesh>
      )}
    </group>
  )
}

/* ── Monster (PvE) ── */
function Monster({
  position,
  color = '#ef4444',
  hp,
  hpMax,
  onAttack,
  defeated,
}: {
  position: [number, number, number]
  color?: string
  hp: number
  hpMax: number
  onAttack: () => void
  defeated: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime() + phase
    ref.current.position.y = defeated ? -2 : Math.sin(t * 1.4) * 0.15
    ref.current.rotation.y = t * 0.5
  })
  if (defeated) return null
  const hpPct = Math.max(0, Math.min(1, hp / hpMax))
  return (
    <group ref={ref} position={position}>
      {/* Floating dark spire */}
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onAttack()
        }}
        castShadow
      >
        <octahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial color="#220815" emissive={color} emissiveIntensity={0.8} roughness={0.3} />
      </mesh>
      {/* Outer ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.1, 0.04, 12, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
      </mesh>
      {/* HP bar */}
      <Html position={[0, 1.6, 0]} center distanceFactor={8}>
        <div style={{ width: 90, padding: 2, background: 'rgba(0,0,0,0.85)', borderRadius: 4, border: `1px solid ${color}` }}>
          <div style={{ height: 6, background: '#1f2937', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${hpPct * 100}%`, background: color, transition: 'width 200ms' }} />
          </div>
          <div style={{ marginTop: 2, fontSize: 9, color: 'white', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Rogue Model
          </div>
          <div style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center' }}>
            {hp}/{hpMax} HP · click to attack
          </div>
        </div>
      </Html>
    </group>
  )
}

/* ── Pillars / Decor ── */
function ClassicalPillars({ world }: { world: WorldDef }) {
  const pillars = useMemo(() => {
    const positions: Array<[number, number, number]> = []
    for (let x = -16; x <= 16; x += 4) {
      positions.push([x, 0, -14])
      positions.push([x, 0, 14])
    }
    return positions
  }, [])
  return (
    <>
      {pillars.map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.4, 0.5, 3, 12]} />
            <meshStandardMaterial color={world.pillarColor} roughness={0.6} />
          </mesh>
          <mesh castShadow position={[0, 3.15, 0]}>
            <boxGeometry args={[1.4, 0.25, 1.4]} />
            <meshStandardMaterial color={world.pillarColor} roughness={0.5} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[3.5, 4, 64]} />
        <meshStandardMaterial
          color={world.accent}
          emissive={world.accent}
          emissiveIntensity={0.4}
          transparent
          opacity={0.85}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {/* Central Hermes statue — plaza centerpiece */}
      <HermesStatue position={[0, 0, 0]} scale={1.15} accent={world.accent} base="#e6dcc4" />
      {/* Banners along the colonnade entrances */}
      <HermesBanner position={[-17, 0, -9.5]} rotation={[0, Math.PI / 2, 0]} color={world.accent} />
      <HermesBanner position={[17, 0, -9.5]} rotation={[0, -Math.PI / 2, 0]} color={world.accent} />
      <HermesBanner position={[-17, 0, 9.5]} rotation={[0, Math.PI / 2, 0]} color={world.accent} />
      <HermesBanner position={[17, 0, 9.5]} rotation={[0, -Math.PI / 2, 0]} color={world.accent} />
      {/* Braziers around the central statue */}
      {[[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]].map(([x, z], i) => (
        <Brazier key={i} position={[x, 0, z]} color="#fbbf24" />
      ))}
    </>
  )
}

function TechPillars({ world }: { world: WorldDef }) {
  const [settings] = useHermesWorldSettings()
  const photosensitiveMode = settings.accessibility.photosensitiveMode
  const cubes = useMemo(() => {
    const positions: Array<[number, number, number]> = []
    for (let x = -14; x <= 14; x += 5) {
      positions.push([x, 0, -12])
      positions.push([x, 0, 12])
    }
    return positions
  }, [])
  return (
    <>
      {cubes.map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          <mesh castShadow position={[0, 0.9, 0]}>
            <boxGeometry args={[1.6, 1.8, 1.6]} />
            <meshStandardMaterial color="#0f172a" emissive={world.pillarColor} emissiveIntensity={0.4} roughness={0.3} />
          </mesh>
          <mesh position={[0, 1.86, 0]}>
            <boxGeometry args={[1.2, 0.05, 1.2]} />
            <meshStandardMaterial color={world.pillarColor} emissive={world.pillarColor} emissiveIntensity={2} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[4, 4.4, 64]} />
        <meshStandardMaterial color={world.accent} emissive={world.accent} emissiveIntensity={1} />
      </mesh>
      <ForgeSuperFurnace position={[0, 0, 0]} accent={world.accent} ember="#ff8a3d" />
      {/* Cyan-flame Forge braziers */}
      {[[-5, -5], [5, -5], [-5, 5], [5, 5]].map(([x, z], i) => (
        <Brazier key={i} position={[x, 0, z]} color={world.accent} />
      ))}
      {/* Tech-banners with Hermes sigil */}
      <HermesBanner position={[-9, 0, 0]} rotation={[0, Math.PI / 2, 0]} color={world.accent} cloth="#0a0e1a" />
      <HermesBanner position={[9, 0, 0]} rotation={[0, -Math.PI / 2, 0]} color={world.accent} cloth="#0a0e1a" />
      {/* Floating data motes — disabled in Photosensitive Mode */}
      {!photosensitiveMode && <Sparkles count={20} scale={[18, 5, 18]} size={1.8} speed={0.12} color={world.accent} opacity={0.22} />}
    </>
  )
}

/* ── Forest decor (Grove) ── */
function ForestDecor({ world }: { world: WorldDef }) {
  const trees = useMemo(() => {
    const out: Array<[number, number, number, number]> = []
    const seed = (i: number) => Math.sin(i * 9.31) * 0.5 + 0.5
    for (let i = 0; i < 22; i++) {
      const ang = (i / 22) * Math.PI * 2
      const r = 9 + seed(i) * 8
      const x = Math.cos(ang) * r
      const z = Math.sin(ang) * r
      const scale = 0.8 + seed(i + 9) * 0.6
      out.push([x, 0, z, scale])
    }
    return out
  }, [])
  return (
    <>
      {trees.map(([x, y, z, s], i) => (
        <group key={i} position={[x, y, z]} scale={s}>
          {/* trunk */}
          <mesh castShadow position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.15, 0.22, 1.4, 8]} />
            <meshStandardMaterial color="#5b3a1f" roughness={0.8} />
          </mesh>
          {/* canopy */}
          <mesh castShadow position={[0, 1.85, 0]}>
            <coneGeometry args={[0.95, 1.7, 8]} />
            <meshStandardMaterial color="#1f8b4f" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0, 2.55, 0]}>
            <coneGeometry args={[0.7, 1.2, 8]} />
            <meshStandardMaterial color={world.pillarColor} roughness={0.7} emissive={world.pillarColor} emissiveIntensity={0.06} />
          </mesh>
        </group>
      ))}
      {/* Mossy center ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[3, 4, 64]} />
        <meshStandardMaterial color={world.accent} emissive={world.accent} emissiveIntensity={0.4} />
      </mesh>
      <MemoryTree position={[0, 0, 0]} accent={world.accent} />
    </>
  )
}

/* ── Temple decor (Oracle) ── */
function TempleDecor({ world }: { world: WorldDef }) {
  const [settings] = useHermesWorldSettings()
  const photosensitiveMode = settings.accessibility.photosensitiveMode
  const crystals = useMemo(() => {
    const out: Array<[number, number, number, number]> = []
    const seed = (i: number) => Math.sin(i * 17.7) * 0.5 + 0.5
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2
      const r = 7 + seed(i) * 5
      out.push([Math.cos(ang) * r, 1.2 + seed(i + 3) * 0.8, Math.sin(ang) * r, 0.6 + seed(i + 7) * 0.5])
    }
    return out
  }, [])
  return (
    <>
      {crystals.map(([x, y, z, s], i) => (
        <FloatCrystal key={i} position={[x, y, z]} scale={s} color={world.pillarColor} />
      ))}
      {/* outer ring of low pillars */}
      {Array.from({ length: 12 }).map((_, i) => {
        const ang = (i / 12) * Math.PI * 2
        return (
          <group key={`p${i}`} position={[Math.cos(ang) * 6, 0, Math.sin(ang) * 6]}>
            <mesh castShadow position={[0, 0.6, 0]}>
              <cylinderGeometry args={[0.25, 0.3, 1.2, 12]} />
              <meshStandardMaterial color={world.pillarColor} emissive={world.pillarColor} emissiveIntensity={0.2} roughness={0.5} />
            </mesh>
          </group>
        )
      })}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[3.2, 3.6, 64]} />
        <meshStandardMaterial color={world.accent} emissive={world.accent} emissiveIntensity={1} />
      </mesh>
      <OracleRingTower position={[0, 0, 0]} accent={world.accent} />
      {/* Mystical incense braziers */}
      <Brazier position={[-4, 0, 0]} color="#a78bfa" />
      <Brazier position={[4, 0, 0]} color="#a78bfa" />
      <Brazier position={[0, 0, -4]} color="#a78bfa" />
      <Brazier position={[0, 0, 4]} color="#a78bfa" />
      {/* Floating runes — disabled in Photosensitive Mode */}
      {!photosensitiveMode && <Sparkles count={16} scale={[14, 6, 14]} size={1.9} speed={0.1} color={world.accent} opacity={0.22} />}
    </>
  )
}

function ForgeSuperFurnace({ position, accent, ember }: { position: [number, number, number]; accent: string; ember: string }) {
  const ringRef = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ringRef.current) ringRef.current.rotation.y = clock.getElapsedTime() * 0.35
  })
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <cylinderGeometry args={[2.1, 2.6, 0.7, 16]} />
        <meshStandardMaterial color="#1f2937" roughness={0.45} metalness={0.25} emissive={ember} emissiveIntensity={0.12} />
      </mesh>
      <mesh castShadow position={[0, 1.45, 0]}>
        <cylinderGeometry args={[1.15, 1.45, 2.2, 12]} />
        <meshStandardMaterial color="#0f172a" roughness={0.38} metalness={0.35} emissive={accent} emissiveIntensity={0.38} />
      </mesh>
      <mesh position={[0, 2.7, 0]}>
        <coneGeometry args={[1.4, 1.25, 8]} />
        <meshStandardMaterial color="#2a1420" roughness={0.42} emissive={ember} emissiveIntensity={0.55} />
      </mesh>
      <group ref={ringRef} position={[0, 2.05, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[2.05, 0.045, 10, 64]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.25} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, Math.PI / 3]}><torusGeometry args={[1.45, 0.035, 10, 64]} /><meshStandardMaterial color={ember} emissive={ember} emissiveIntensity={1.15} /></mesh>
      </group>
      {[-1.4, 1.4].map((x) => <mesh key={x} castShadow position={[x, 0.85, 0]}><boxGeometry args={[0.45, 1.25, 0.55]} /><meshStandardMaterial color="#111827" emissive={ember} emissiveIntensity={0.35} /></mesh>)}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a, i) => <mesh key={i} position={[Math.cos(a) * 2.8, 0.04, Math.sin(a) * 2.8]} rotation={[-Math.PI / 2, 0, a]}><planeGeometry args={[0.36, 3.4]} /><meshStandardMaterial color={ember} emissive={ember} emissiveIntensity={0.75} transparent opacity={0.55} /></mesh>)}
      <pointLight position={[0, 2.1, 0]} color={ember} intensity={2.6} distance={13} />
      <pointLight position={[0, 2.8, 0]} color={accent} intensity={1.8} distance={12} />
    </group>
  )
}

function MemoryTree({ position, accent }: { position: [number, number, number]; accent: string }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.42, 0.7, 2.9, 10]} />
        <meshStandardMaterial color="#5b3a1f" roughness={0.82} emissive={accent} emissiveIntensity={0.08} />
      </mesh>
      {[0, 0.8, -0.85, 1.7, -1.7].map((x, i) => <mesh key={i} castShadow position={[x, 3.0 + (i % 2) * 0.25, i === 0 ? 0 : x * 0.18]}><dodecahedronGeometry args={[1.05 - Math.min(i, 2) * 0.12, 0]} /><meshStandardMaterial color={i === 0 ? '#86efac' : '#2bbf6f'} roughness={0.72} emissive={accent} emissiveIntensity={0.12} flatShading /></mesh>)}
      <mesh position={[0, 4.3, 0]}><octahedronGeometry args={[0.34, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.4} transparent opacity={0.9} /></mesh>
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a, i) => <mesh key={i} position={[Math.cos(a) * 2.9, 0.05, Math.sin(a) * 2.9]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.22, 18]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.55} transparent opacity={0.55} /></mesh>)}
      <pointLight position={[0, 3.6, 0]} color={accent} intensity={1.6} distance={12} />
    </group>
  )
}

function OracleRingTower({ position, accent }: { position: [number, number, number]; accent: string }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.y = clock.getElapsedTime() * 0.22
  })
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, 0.28, 0]}><cylinderGeometry args={[1.9, 2.3, 0.56, 18]} /><meshStandardMaterial color="#312e81" roughness={0.5} emissive={accent} emissiveIntensity={0.18} /></mesh>
      <mesh castShadow position={[0, 1.55, 0]}><cylinderGeometry args={[0.42, 0.58, 2.4, 12]} /><meshStandardMaterial color="#171032" roughness={0.42} emissive={accent} emissiveIntensity={0.35} /></mesh>
      <group ref={ref} position={[0, 3.0, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[2.2, 0.045, 12, 72]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.35} /></mesh>
        <mesh rotation={[0.75, 0, 0]}><torusGeometry args={[1.55, 0.04, 12, 72]} /><meshStandardMaterial color="#c4b5fd" emissive="#c4b5fd" emissiveIntensity={1.2} /></mesh>
        <mesh rotation={[0, 0, 0.75]}><torusGeometry args={[1.0, 0.035, 12, 64]} /><meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.95} /></mesh>
        <mesh><octahedronGeometry args={[0.42, 0]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.8} transparent opacity={0.9} /></mesh>
      </group>
      <pointLight position={[0, 3, 0]} color={accent} intensity={2.1} distance={13} />
    </group>
  )
}

function FloatCrystal({ position, scale, color }: { position: [number, number, number]; scale: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime() + phase
    ref.current.position.y = position[1] + Math.sin(t * 0.8) * 0.2
    ref.current.rotation.y += 0.01
  })
  return (
    <mesh ref={ref} position={position} scale={scale}>
      <octahedronGeometry args={[0.6, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} transparent opacity={0.85} />
    </mesh>
  )
}

/* ── Arena decor (Benchmark Arena) ── */
function ArenaDecor({ world }: { world: WorldDef }) {
  const seats = useMemo(() => {
    const out: Array<[number, number, number]> = []
    for (let ring = 0; ring < 3; ring++) {
      const r = 9 + ring * 1.6
      const count = 24 + ring * 4
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2
        out.push([Math.cos(ang) * r, ring * 0.6, Math.sin(ang) * r])
      }
    }
    return out
  }, [])
  return (
    <>
      {seats.map((pos, i) => (
        <mesh key={i} position={[pos[0], pos[1] + 0.3, pos[2]]} castShadow>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <meshStandardMaterial color="#27121a" emissive={world.pillarColor} emissiveIntensity={0.06} roughness={0.5} />
        </mesh>
      ))}
      {/* central duel medallion */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[2.4, 4.4, 64]} />
        <meshStandardMaterial color={world.accent} emissive={world.accent} emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.15, 48]} />
        <meshStandardMaterial color="#16070a" emissive={world.accent} emissiveIntensity={0.22} roughness={0.45} />
      </mesh>
      <pointLight position={[0, 4, 0]} color={world.accent} intensity={2.2} distance={14} />
      {/* scoreboard pillars */}
      {[-7, 7].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh castShadow position={[0, 1.4, 0]}>
            <boxGeometry args={[0.6, 2.8, 0.6]} />
            <meshStandardMaterial color="#0f172a" emissive={world.accent} emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0, 2.5, 0]}>
            <boxGeometry args={[1.6, 0.8, 0.18]} />
            <meshStandardMaterial color="#0f172a" emissive={world.accent} emissiveIntensity={1.4} />
          </mesh>
        </group>
      ))}
      {/* Braziers ringing the duel medallion */}
      {Array.from({ length: 6 }).map((_, i) => {
        const ang = (i / 6) * Math.PI * 2
        return <Brazier key={`bz${i}`} position={[Math.cos(ang) * 5.2, 0, Math.sin(ang) * 5.2]} color="#fb7185" />
      })}
      {/* Banners flanking the entrances */}
      <HermesBanner position={[-9, 0, -9]} rotation={[0, 0.5, 0]} color={world.accent} cloth="#3b0a1c" />
      <HermesBanner position={[9, 0, -9]} rotation={[0, -0.5, 0]} color={world.accent} cloth="#3b0a1c" />
      <HermesBanner position={[-9, 0, 9]} rotation={[0, 2.5, 0]} color={world.accent} cloth="#3b0a1c" />
      <HermesBanner position={[9, 0, 9]} rotation={[0, -2.5, 0]} color={world.accent} cloth="#3b0a1c" />
    </>
  )
}

function TrainingDecor({ world }: { world: WorldDef }) {
  const labels = [
    { text: 'Arrival Circle', pos: [-11, 2.4, 8] as [number, number, number] },
    { text: 'Trainer’s Ring', pos: [-5, 2.4, -4] as [number, number, number] },
    { text: 'Quartermaster Tent', pos: [-14, 2.4, -10] as [number, number, number] },
    { text: 'Archive Podium', pos: [6, 2.4, 0] as [number, number, number] },
    { text: 'Forge Gate', pos: [14, 2.6, -10] as [number, number, number] },
    { text: 'Hermes Sigil', pos: [0, 4.5, 0] as [number, number, number] },
  ]

  return (
    <>
      {/* Premium readable routes: the world should pull the eye toward the next stop, not rely only on HUD text. */}
      <PathRibbon from={[0, 0]} to={[-11, 8]} color="#5eead4" width={1.25} />
      <PathRibbon from={[0, 0]} to={[-5, -4]} color="#fb7185" width={1.2} />
      <PathRibbon from={[0, 0]} to={[6, 0]} color="#a78bfa" width={1.08} />
      <PathRibbon from={[0, 0]} to={[14, -10]} color="#22d3ee" width={1.35} />
      <PathRibbon from={[-5, -4]} to={[-14, -10]} color="#fbbf24" width={1.08} />
      {/* Hermes statue at the heart of the grounds */}
      <HermesStatue position={[0, 0, 0]} accent={world.accent} />
      {/* Practice dummies + weapon racks around the trainer’s ring */}
      <PracticeDummy position={[-7.4, 0, -3.2]} />
      <PracticeDummy position={[-2.8, 0, -6.6]} />
      <PracticeDummy position={[-7.6, 0, -6.4]} />
      <WeaponRack position={[-9.2, 0, -3.0]} accent={world.accent} />
      <WeaponRack position={[-9.2, 0, -5.6]} accent="#fde68a" />
      {/* Banners flanking the Forge Gate */}
      <HermesBanner position={[11.6, 0, -10]} rotation={[0, 0.4, 0]} color={world.accent} />
      <HermesBanner position={[16.4, 0, -10]} rotation={[0, -0.4, 0]} color="#fbbf24" />
      {/* Banners by Arrival Circle */}
      <HermesBanner position={[-13.2, 0, 8]} rotation={[0, 0.6, 0]} color={world.accent} />
      <HermesBanner position={[-8.8, 0, 8]} rotation={[0, -0.6, 0]} color={world.accent} />
      {/* Braziers around the central statue and trainer ring */}
      <Brazier position={[3.2, 0, 3.2]} color="#fbbf24" />
      <Brazier position={[-3.2, 0, 3.2]} color="#fbbf24" />
      <Brazier position={[3.2, 0, -3.2]} color="#fb923c" />
      <Brazier position={[-3.2, 0, -3.2]} color="#fb923c" />
      <Brazier position={[-2.0, 0, -1.6]} color="#fb7185" />
      <Brazier position={[-8.0, 0, -1.6]} color="#fb7185" />
      <mesh position={[-11, 0.05, 8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[2.4, 3.4, 72]} />
        <meshStandardMaterial color={world.accent} emissive={world.accent} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-5, 0.04, -4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[3, 4.6, 72]} />
        <meshStandardMaterial color="#fb7185" emissive="#fb7185" emissiveIntensity={0.45} />
      </mesh>
      <group position={[-14, 0, -10]}>
        <mesh castShadow position={[0, 2.2, 0]}>
          <coneGeometry args={[3.2, 4.2, 4]} />
          <meshStandardMaterial color="#1d4ed8" roughness={0.7} emissive="#22d3ee" emissiveIntensity={0.12} />
        </mesh>
        <mesh castShadow position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 1.5, 8]} />
          <meshStandardMaterial color="#d1d5db" roughness={0.8} />
        </mesh>
      </group>
      <group position={[6, 0, 0]}>
        <mesh castShadow position={[0, 0.6, 0]}>
          <cylinderGeometry args={[1.2, 1.6, 1.2, 18]} />
          <meshStandardMaterial color="#312e81" roughness={0.55} emissive="#a78bfa" emissiveIntensity={0.16} />
        </mesh>
        <mesh castShadow position={[0, 1.35, 0]}>
          <boxGeometry args={[1.9, 0.2, 1.2]} />
          <meshStandardMaterial color="#c4b5fd" emissive="#a78bfa" emissiveIntensity={0.4} />
        </mesh>
      </group>
      <group position={[14, 0, -10]}>
        <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <ringGeometry args={[2.8, 4.6, 72]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.28} transparent opacity={0.48} />
        </mesh>
        <mesh castShadow position={[0, 2.3, 0]}>
          <torusGeometry args={[2.2, 0.18, 18, 64]} />
          <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={1.75} />
        </mesh>
        <mesh castShadow position={[0, 2.3, -0.08]} rotation={[0, 0, Math.PI / 4]}>
          <torusGeometry args={[1.55, 0.06, 12, 48]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1.1} transparent opacity={0.9} />
        </mesh>
        {[-2.8, 2.8].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <mesh castShadow position={[0, 1.5, 0]}>
              <boxGeometry args={[0.7, 3, 0.7]} />
              <meshStandardMaterial color="#0f172a" emissive="#22d3ee" emissiveIntensity={0.32} />
            </mesh>
            <mesh castShadow position={[0, 3.25, 0]}>
              <coneGeometry args={[0.65, 0.85, 4]} />
              <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.45} roughness={0.42} />
            </mesh>
          </group>
        ))}
        <pointLight position={[0, 2.5, 0]} color="#22d3ee" intensity={2.4} distance={13} />
      </group>
      {labels.map((label) => (
        <Html key={label.text} position={label.pos} center distanceFactor={12}>
          <div style={{ padding: '4px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.7)', color: 'white', border: `1px solid ${world.accent}`, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            {label.text}
          </div>
        </Html>
      ))}
    </>
  )
}

function PathRibbon({
  from,
  to,
  color,
  width = 1.1,
}: {
  from: [number, number]
  to: [number, number]
  color: string
  width?: number
}) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.sqrt(dx * dx + dz * dz)
  const angle = Math.atan2(dx, dz)
  return (
    <group position={[from[0] + dx / 2, 0.018, from[1] + dz / 2]} rotation={[0, angle, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#80633d" roughness={0.92} transparent opacity={0.74} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-width / 2, 0.006, 0]}>
        <planeGeometry args={[0.06, length]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.72} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[width / 2, 0.006, 0]}>
        <planeGeometry args={[0.06, length]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} transparent opacity={0.72} />
      </mesh>
    </group>
  )
}

/* ── Hermes statue — winged-sandals hero centerpiece for plazas ── */
function HermesStatue({
  position = [0, 0, 0],
  scale = 1,
  accent = '#f5d97a',
  base = '#cbd5e1',
}: {
  position?: [number, number, number]
  scale?: number
  accent?: string
  base?: string
}) {
  return (
    <group position={position} scale={scale}>
      {/* tiered plinth */}
      <mesh castShadow receiveShadow position={[0, 0.18, 0]}>
        <cylinderGeometry args={[1.6, 1.8, 0.36, 24]} />
        <meshStandardMaterial color={base} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 0.5, 0]}>
        <cylinderGeometry args={[1.25, 1.5, 0.32, 20]} />
        <meshStandardMaterial color={base} roughness={0.6} />
      </mesh>
      {/* legs */}
      <mesh castShadow position={[-0.18, 1.05, 0]}>
        <cylinderGeometry args={[0.13, 0.16, 0.9, 10]} />
        <meshStandardMaterial color={base} roughness={0.55} />
      </mesh>
      <mesh castShadow position={[0.18, 1.05, 0]}>
        <cylinderGeometry args={[0.13, 0.16, 0.9, 10]} />
        <meshStandardMaterial color={base} roughness={0.55} />
      </mesh>
      {/* torso */}
      <mesh castShadow position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.32, 0.38, 0.8, 12]} />
        <meshStandardMaterial color={base} roughness={0.5} />
      </mesh>
      {/* chlamys cape */}
      <mesh castShadow position={[0, 1.62, -0.2]} rotation={[0.18, 0, 0]}>
        <planeGeometry args={[1.0, 1.1]} />
        <meshStandardMaterial color={accent} side={THREE.DoubleSide} roughness={0.6} emissive={accent} emissiveIntensity={0.12} />
      </mesh>
      {/* head */}
      <mesh castShadow position={[0, 2.32, 0]}>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color={base} roughness={0.5} />
      </mesh>
      {/* winged petasos (helmet) */}
      <mesh castShadow position={[0, 2.55, 0]}>
        <coneGeometry args={[0.32, 0.18, 18]} />
        <meshStandardMaterial color={accent} metalness={0.45} roughness={0.4} emissive={accent} emissiveIntensity={0.35} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[s * 0.34, 2.55, 0]} rotation={[0, 0, s * 0.6]}>
          <coneGeometry args={[0.08, 0.42, 6]} />
          <meshStandardMaterial color="#fff5d1" emissive={accent} emissiveIntensity={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* caduceus staff */}
      <mesh castShadow position={[0.45, 1.6, 0.05]} rotation={[0, 0, -0.05]}>
        <cylinderGeometry args={[0.04, 0.04, 2.2, 8]} />
        <meshStandardMaterial color={accent} metalness={0.6} roughness={0.3} emissive={accent} emissiveIntensity={0.25} />
      </mesh>
      <mesh castShadow position={[0.45, 2.74, 0.05]}>
        <torusGeometry args={[0.12, 0.04, 8, 16]} />
        <meshStandardMaterial color={accent} metalness={0.7} roughness={0.25} emissive={accent} emissiveIntensity={0.55} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[0.45 + s * 0.12, 2.78, 0.05]} rotation={[0, 0, s * 0.4]}>
          <coneGeometry args={[0.06, 0.22, 6]} />
          <meshStandardMaterial color="#fff5d1" emissive={accent} emissiveIntensity={0.6} />
        </mesh>
      ))}
      {/* winged sandals (small accents at feet) */}
      {[-1, 1].map((s) => (
        <mesh key={`sandal${s}`} castShadow position={[s * 0.18, 0.7, 0.15]} rotation={[0, 0, s * 0.4]}>
          <coneGeometry args={[0.06, 0.18, 6]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} />
        </mesh>
      ))}
      {/* base inscription glow ring — polygon-offset to prevent z-fighting with the stone plaza below */}
      <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.85, 2.1, 48]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.55}
          transparent
          opacity={0.7}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  )
}

/* ── Practice dummy + weapon rack ── */
function PracticeDummy({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* base */}
      <mesh castShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.45, 0.55, 0.2, 10]} />
        <meshStandardMaterial color="#3f2a18" roughness={0.85} />
      </mesh>
      {/* post */}
      <mesh castShadow position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 1.5, 8]} />
        <meshStandardMaterial color="#5b3a1f" roughness={0.85} />
      </mesh>
      {/* torso bag */}
      <mesh castShadow position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.8, 12]} />
        <meshStandardMaterial color="#a16207" roughness={0.7} />
      </mesh>
      {/* head sack with crude X */}
      <mesh castShadow position={[0, 2.18, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#7c5a30" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.18, 0.22]} rotation={[0, 0, 0.78]}>
        <boxGeometry args={[0.04, 0.18, 0.005]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 2.18, 0.22]} rotation={[0, 0, -0.78]}>
        <boxGeometry args={[0.04, 0.18, 0.005]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    </group>
  )
}

function WeaponRack({ position, accent = '#cbd5e1' }: { position: [number, number, number]; accent?: string }) {
  return (
    <group position={position}>
      {/* frame */}
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} castShadow position={[x, 0.7, 0]}>
          <boxGeometry args={[0.08, 1.4, 0.08]} />
          <meshStandardMaterial color="#5b3a1f" roughness={0.8} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.35, 0]}>
        <boxGeometry args={[1.0, 0.08, 0.08]} />
        <meshStandardMaterial color="#5b3a1f" roughness={0.8} />
      </mesh>
      {/* spear */}
      <mesh castShadow position={[-0.25, 0.85, 0.06]} rotation={[0, 0, 0.06]}>
        <cylinderGeometry args={[0.025, 0.025, 1.6, 8]} />
        <meshStandardMaterial color="#8b6f3a" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-0.25, 1.7, 0.06]} rotation={[0, 0, 0.06]}>
        <coneGeometry args={[0.05, 0.18, 6]} />
        <meshStandardMaterial color={accent} metalness={0.6} roughness={0.3} emissive={accent} emissiveIntensity={0.2} />
      </mesh>
      {/* sword */}
      <mesh castShadow position={[0.0, 0.9, 0.06]} rotation={[0, 0, -0.04]}>
        <boxGeometry args={[0.08, 0.95, 0.04]} />
        <meshStandardMaterial color={accent} metalness={0.7} roughness={0.25} emissive={accent} emissiveIntensity={0.18} />
      </mesh>
      <mesh castShadow position={[0.0, 0.36, 0.06]}>
        <boxGeometry args={[0.22, 0.07, 0.07]} />
        <meshStandardMaterial color="#3f2a18" roughness={0.7} />
      </mesh>
      {/* shield */}
      <mesh castShadow position={[0.32, 0.85, 0.07]}>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 24]} />
        <meshStandardMaterial color="#1d4ed8" metalness={0.45} roughness={0.4} emissive="#fbbf24" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0.32, 0.85, 0.105]}>
        <torusGeometry args={[0.12, 0.025, 8, 24]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.6} />
      </mesh>
    </group>
  )
}

/* ── Hermes banner (cloth on a pole) ── */
function HermesBanner({
  position,
  rotation = [0, 0, 0],
  color = '#fbbf24',
  cloth = '#7c2d12',
}: {
  position: [number, number, number]
  rotation?: [number, number, number]
  color?: string
  cloth?: string
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3, 8]} />
        <meshStandardMaterial color="#3f2a18" roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 3.05, 0]}>
        <coneGeometry args={[0.12, 0.22, 8]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} emissive={color} emissiveIntensity={0.4} />
      </mesh>
      {/* horizontal arm */}
      <mesh castShadow position={[0.45, 2.85, 0]}>
        <boxGeometry args={[0.9, 0.06, 0.06]} />
        <meshStandardMaterial color="#3f2a18" roughness={0.7} />
      </mesh>
      {/* cloth */}
      <mesh position={[0.45, 1.85, 0]}>
        <planeGeometry args={[0.85, 1.85]} />
        <meshStandardMaterial color={cloth} side={THREE.DoubleSide} roughness={0.7} emissive={color} emissiveIntensity={0.06} />
      </mesh>
      {/* sigil dot */}
      <mesh position={[0.45, 1.95, 0.01]}>
        <circleGeometry args={[0.18, 18]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* wings on sigil */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.45 + s * 0.18, 1.97, 0.012]} rotation={[0, 0, s * 0.5]}>
          <coneGeometry args={[0.07, 0.16, 6]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
        </mesh>
      ))}
    </group>
  )
}

/* ── Brazier (flame on pillar) ── */
function Brazier({ position, color = '#fb923c' }: { position: [number, number, number]; color?: string }) {
  const flameRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!flameRef.current) return
    const t = clock.getElapsedTime()
    const s = 1 + Math.sin(t * 8 + position[0]) * 0.08
    flameRef.current.scale.set(s, 1 + Math.sin(t * 6) * 0.12, s)
  })
  return (
    <group position={position}>
      {/* pillar */}
      <mesh castShadow position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 1.3, 12]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      {/* bowl */}
      <mesh castShadow position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.32, 0.22, 0.18, 16]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* flame */}
      <mesh ref={flameRef} position={[0, 1.7, 0]}>
        <coneGeometry args={[0.25, 0.55, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.2} transparent opacity={0.92} />
      </mesh>
      <pointLight position={[0, 1.7, 0]} color={color} intensity={0.9} distance={5} decay={1.5} />
    </group>
  )
}

/* ── Decor router ── */
function WorldDecor({ world }: { world: WorldDef }) {
  switch (world.pillarType) {
    case 'training': return <TrainingDecor world={world} />
    case 'classical': return <ClassicalPillars world={world} />
    case 'tech': return <TechPillars world={world} />
    case 'forest': return <ForestDecor world={world} />
    case 'temple': return <TempleDecor world={world} />
    case 'arena': return <ArenaDecor world={world} />
  }
}


function NpcAccessories({ role = '', color }: { role?: string; color: string }) {
  const isTrainer = role === 'trainer' || role === 'nike'
  const isBanker = role === 'banker' || role === 'chronos'
  const isRecruiter = role === 'recruiter' || role === 'athena'
  const isTavern = role === 'tavernkeeper' || role === 'apollo'
  const isShop = role === 'shopkeeper' || role === 'iris'
  const isHermes = role === 'hermes'
  const isKnight = isTrainer || isRecruiter || isHermes
  return (
    <group>
      {/* shoulder silhouette */}
      {(isTrainer || isRecruiter || isBanker || isHermes) && (
        <>
          <mesh castShadow position={[-0.36, 0.98, 0]} rotation={[0, 0, 0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={isTrainer || isHermes ? '#94a3b8' : color} metalness={isTrainer || isHermes ? 0.6 : 0.15} roughness={0.42} emissive={color} emissiveIntensity={0.12} /></mesh>
          <mesh castShadow position={[0.36, 0.98, 0]} rotation={[0, 0, -0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={isTrainer || isHermes ? '#94a3b8' : color} metalness={isTrainer || isHermes ? 0.6 : 0.15} roughness={0.42} emissive={color} emissiveIntensity={0.12} /></mesh>
        </>
      )}
      {/* breastplate disc (knights only) */}
      {isKnight && (
        <mesh castShadow position={[0, 0.78, 0.18]}>
          <cylinderGeometry args={[0.18, 0.22, 0.08, 18]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} emissive={color} emissiveIntensity={0.18} />
        </mesh>
      )}
      {/* cape/back panel, visible in orbit and screenshots */}
      {(isRecruiter || isBanker || isTavern || isHermes) && (
        <mesh castShadow position={[0, 0.78, -0.2]} rotation={[0.18, 0, 0]}>
          <planeGeometry args={[0.72, 0.9]} />
          <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.6} emissive={color} emissiveIntensity={isHermes ? 0.18 : 0.08} />
        </mesh>
      )}
      {/* hats/crowns so roles read at distance */}
      {isBanker && <mesh castShadow position={[0, 1.48, 0]}><cylinderGeometry args={[0.2, 0.24, 0.18, 12]} /><meshStandardMaterial color="#fbbf24" metalness={0.45} roughness={0.38} emissive="#fbbf24" emissiveIntensity={0.25} /></mesh>}
      {isShop && <mesh castShadow position={[0, 1.45, 0]} rotation={[0, 0, 0.2]}><coneGeometry args={[0.28, 0.28, 8]} /><meshStandardMaterial color="#38bdf8" roughness={0.55} emissive="#38bdf8" emissiveIntensity={0.1} /></mesh>}
      {isTavern && <mesh castShadow position={[0, 1.44, 0]}><torusGeometry args={[0.19, 0.025, 8, 24]} /><meshStandardMaterial color="#f59e0b" roughness={0.5} emissive="#f59e0b" emissiveIntensity={0.2} /></mesh>}
      {/* helmet for Trainer & Recruiter (knight) */}
      {(isTrainer || isRecruiter) && (
        <>
          <mesh castShadow position={[0, 1.46, 0]}>
            <sphereGeometry args={[0.2, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* plume */}
          <mesh castShadow position={[0, 1.62, -0.04]} rotation={[0.4, 0, 0]}>
            <coneGeometry args={[0.07, 0.32, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
          </mesh>
        </>
      )}
      {/* Hermes-specific winged petasos */}
      {isHermes && (
        <>
          <mesh castShadow position={[0, 1.5, 0]}>
            <coneGeometry args={[0.24, 0.16, 14]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.6} roughness={0.3} emissive="#fbbf24" emissiveIntensity={0.5} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * 0.26, 1.5, 0]} rotation={[0, 0, s * 0.6]}>
              <coneGeometry args={[0.06, 0.32, 6]} />
              <meshStandardMaterial color="#fff5d1" emissive="#fbbf24" emissiveIntensity={0.7} />
            </mesh>
          ))}
        </>
      )}
      {/* sword sheath at hip for knights */}
      {isKnight && (
        <>
          <mesh castShadow position={[0.34, 0.62, 0.04]} rotation={[0, 0, 0.18]}>
            <boxGeometry args={[0.06, 0.5, 0.06]} />
            <meshStandardMaterial color="#3f2a18" roughness={0.8} />
          </mesh>
          <mesh castShadow position={[0.34, 0.92, 0.06]} rotation={[0, 0, 0.18]}>
            <boxGeometry args={[0.08, 0.18, 0.06]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.4} roughness={0.4} />
          </mesh>
        </>
      )}
      {/* weapons/tools (existing) */}
      {isTrainer && <mesh castShadow position={[0.52, 0.82, 0.08]} rotation={[0.1, 0, -0.75]}><boxGeometry args={[0.05, 0.9, 0.05]} /><meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.35} /></mesh>}
      {isShop && <mesh castShadow position={[-0.48, 0.72, 0.08]} rotation={[0, 0, 0.25]}><boxGeometry args={[0.16, 0.38, 0.08]} /><meshStandardMaterial color="#a16207" roughness={0.8} /></mesh>}
      {/* Hermes caduceus staff */}
      {isHermes && (
        <>
          <mesh castShadow position={[-0.5, 0.85, 0.08]} rotation={[0, 0, 0.04]}>
            <cylinderGeometry args={[0.03, 0.03, 1.6, 8]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} emissive="#fbbf24" emissiveIntensity={0.4} />
          </mesh>
          <mesh castShadow position={[-0.5, 1.6, 0.08]}>
            <torusGeometry args={[0.08, 0.02, 8, 14]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.7} />
          </mesh>
        </>
      )}
    </group>
  )
}

/* ── NPC billboard with proximity sensing ── */
// Per-NPC ambient lines (cycles when nobody clicks them).
const NPC_AMBIENT_LINES: Record<string, string[]> = {
  athena: [
    'Welcome, builder. The road begins here.',
    'Hermes carries your prompts — wisely.',
    'Memory turns moments into a story.',
  ],
  iris: [
    'Every doc is a thread to follow.',
    'I keep the archive. Ask, and I’ll fetch.',
  ],
  pan: [
    'Prompts harden into tools at the Forge.',
    'Build small. Ship now. Iterate.',
  ],
  nike: [
    'Strike with intent. Iterate with rigor.',
    'Champions earn the field, then defend it.',
  ],
  shopkeeper: [
    'Starter kit, cheap and proud.',
    'A blade and a cloak. That’s a beginning.',
  ],
  hermes: [
    'Speed is the soul of an agent.',
    'I deliver — between thought and tool.',
  ],
  chronos: [
    'Records outlast the writer.',
    'Time is the only honest critic.',
  ],
  apollo: [
    'A song carries what code cannot.',
  ],
  artemis: [
    'Track the signal. Ignore the noise.',
  ],
  eros: [
    'Connection is the first protocol.',
  ],
  trainer: [
    'Form. Then power. Then speed.',
  ],
  recruiter: [
    'No one builds alone. Find your party.',
  ],
  banker: [
    'Compound the small wins.',
  ],
  tavernkeeper: [
    'Rest. Trade. Listen.',
  ],
}

function NPC({
  position,
  avatar,
  name,
  color = '#a78bfa',
  drift = true,
  highlight = false,
  npcId,
  playerRef,
  onNearChange,
  onClickNpc,
}: {
  position: [number, number, number]
  avatar: string
  name: string
  color?: string
  drift?: boolean
  highlight?: boolean
  npcId?: string
  playerRef?: React.MutableRefObject<THREE.Vector3>
  onNearChange?: (id: string | null) => void
  onClickNpc?: (npcId: string, worldPos: [number, number, number]) => void
}) {
  const ref = useRef<THREE.Group>(null)
  const base = useMemo(() => new THREE.Vector3(...position), [position])
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])
  const glbId = npcId || avatar
  const hasGlb = useGlbAvailable(glbId, isNear || highlight)

  // Ambient speech bubble — cycles every ~12-22s with NPC lore lines.
  const [ambient, setAmbient] = useState<string | null>(null)
  useEffect(() => {
    const lines = (npcId && NPC_AMBIENT_LINES[npcId]) || NPC_AMBIENT_LINES[avatar] || []
    if (lines.length === 0) return
    let stop = false
    const tick = () => {
      if (stop) return
      const line = lines[Math.floor(Math.random() * lines.length)]
      setAmbient(line)
      window.setTimeout(() => { if (!stop) setAmbient(null) }, 6000)
      window.setTimeout(tick, 12000 + Math.random() * 10000)
    }
    // Stagger so all NPCs don't speak in unison.
    const initial = window.setTimeout(tick, 2000 + Math.random() * 8000)
    return () => { stop = true; window.clearTimeout(initial) }
  }, [npcId, avatar])

  const lastNear = useRef(false)
  const [isNear, setIsNear] = useState(false)
  useFrame(({ clock }) => {
    if (!ref.current) return
    if (drift) {
      const t = clock.getElapsedTime() + phase
      ref.current.position.x = base.x + Math.sin(t * 0.4) * 1.2
      ref.current.position.z = base.z + Math.cos(t * 0.3) * 1.2
    }
    if (npcId && playerRef) {
      const dist = Math.hypot(
        playerRef.current.x - ref.current.position.x,
        playerRef.current.z - ref.current.position.z,
      )
      const near = dist < 2.6
      if (near && !lastNear.current) {
        lastNear.current = true
        setIsNear(true)
        onNearChange?.(npcId)
      } else if (!near && lastNear.current) {
        lastNear.current = false
        setIsNear(false)
        onNearChange?.(null)
      }
    }
  })

  return (
    <group ref={ref} position={position} onPointerDown={(e) => {
      if (!npcId || !onClickNpc) return
      e.stopPropagation()
      const p = ref.current?.position
      if (!p) return
      onClickNpc(npcId, [p.x, p.y, p.z])
    }}>
      {/* shadow plate */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 18]} />
        <meshBasicMaterial color="black" transparent opacity={0.4} />
      </mesh>
      {hasGlb ? (
        // GLB body replaces voxel meshes when /avatars-3d/<id>.glb is present.
        <PlaygroundNpcGlb avatar={glbId} />
      ) : (
        <>
          {/* legs */}
          <mesh position={[0.13, 0.22, 0]} castShadow>
            <boxGeometry args={[0.14, 0.44, 0.14]} />
            <meshStandardMaterial color="#1f2a37" roughness={0.6} />
          </mesh>
          <mesh position={[-0.13, 0.22, 0]} castShadow>
            <boxGeometry args={[0.14, 0.44, 0.14]} />
            <meshStandardMaterial color="#1f2a37" roughness={0.6} />
          </mesh>
          {/* feet */}
          <mesh position={[0.13, 0.04, 0]} castShadow>
            <boxGeometry args={[0.18, 0.07, 0.28]} />
            <meshStandardMaterial color="#0f172a" roughness={0.7} />
          </mesh>
          <mesh position={[-0.13, 0.04, 0]} castShadow>
            <boxGeometry args={[0.18, 0.07, 0.28]} />
            <meshStandardMaterial color="#0f172a" roughness={0.7} />
          </mesh>
          {/* torso (robe) — colored per NPC */}
          <mesh position={[0, 0.7, 0]} castShadow>
            <boxGeometry args={[0.5, 0.55, 0.32]} />
            <meshStandardMaterial color={color} roughness={0.55} emissive={color} emissiveIntensity={0.15} />
          </mesh>
          {/* belt accent matching player */}
          <mesh position={[0, 0.46, 0]} castShadow>
            <boxGeometry args={[0.52, 0.05, 0.34]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.4} roughness={0.4} />
          </mesh>
          {/* arms */}
          <mesh position={[0.32, 0.7, 0]} castShadow>
            <boxGeometry args={[0.13, 0.5, 0.13]} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          <mesh position={[-0.32, 0.7, 0]} castShadow>
            <boxGeometry args={[0.13, 0.5, 0.13]} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
          {/* hands */}
          <mesh position={[0.32, 0.43, 0]} castShadow>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial color="#fde68a" roughness={0.5} />
          </mesh>
          <mesh position={[-0.32, 0.43, 0]} castShadow>
            <sphereGeometry args={[0.09, 12, 12]} />
            <meshStandardMaterial color="#fde68a" roughness={0.5} />
          </mesh>
          {/* neck */}
          <mesh position={[0, 1.05, 0]} castShadow>
            <cylinderGeometry args={[0.085, 0.095, 0.1, 12]} />
            <meshStandardMaterial color="#fde68a" roughness={0.55} />
          </mesh>
          {/* head sphere */}
          <mesh position={[0, 1.22, 0]} castShadow>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial color="#fde68a" roughness={0.55} />
          </mesh>
          {/* eyes */}
          <mesh position={[0.085, 1.24, 0.19]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#0b1220" /></mesh>
          <mesh position={[-0.085, 1.24, 0.19]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#0b1220" /></mesh>
          {/* hair cap */}
          <mesh position={[0, 1.34, -0.02]} castShadow>
            <sphereGeometry args={[0.235, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={color} roughness={0.85} emissive={color} emissiveIntensity={0.18} />
          </mesh>
          <NpcAccessories role={npcId || avatar} color={color} />
        </>
      )}
      {/* nameplate w/ portrait chip — replaces floating PNG */}
      <Html position={[0, 1.95, 0]} center distanceFactor={8}>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 8px 2px 2px',background:'rgba(0,0,0,0.78)',color:'white',borderRadius:14,fontSize:11,fontWeight:600,whiteSpace:'nowrap',border:`1px solid ${color}`,boxShadow:`0 0 8px ${color}55`}}>
          <img src={`/avatars/${avatar}.png`} alt="" loading="lazy" decoding="async" style={{width:22,height:22,borderRadius:'50%',background:color,objectFit:'cover',border:`1px solid ${color}`}} />
          <span>{name}</span>
        </div>
      </Html>
      {highlight && (
        <Html position={[0, 2.95, 0]} center distanceFactor={8}>
          <div style={{ color: '#fef08a', fontSize: 24, textShadow: '0 0 18px rgba(250,204,21,0.8)', animation: 'hermes-target-arrow var(--hw-flash-rate, 1.5s) ease-in-out infinite' }}>↓</div>
        </Html>
      )}
      {isNear && (
        <Html position={[0, 2.55, 0]} center distanceFactor={8}>
          <div style={{padding:'4px 10px',background:color,color:'#000',borderRadius:6,fontSize:11,fontWeight:800,whiteSpace:'nowrap',boxShadow:`0 0 12px ${color}`,letterSpacing:'0.1em',textTransform:'uppercase'}}>Press E to talk</div>
        </Html>
      )}
      {ambient && !isNear && (
        <Html position={[0, 2.7, 0]} center distanceFactor={8}>
          <SpeechBubble className="hermes-world-bubble" variant="npc" accent={color} compact>
            {ambient}
          </SpeechBubble>
        </Html>
      )}
    </group>
  )
}

/* ── Portal ── */
function Portal({
  position,
  color,
  label,
  locked = false,
  highlight = false,
  onEnter,
  playerRef,
}: {
  position: [number, number, number]
  color: string
  label: string
  locked?: boolean
  highlight?: boolean
  onEnter: () => void
  playerRef: React.MutableRefObject<THREE.Vector3>
}) {
  const ringRef = useRef<THREE.Mesh>(null)
  const [settings] = useHermesWorldSettings()
  const photosensitiveMode = settings.accessibility.photosensitiveMode
  const unlockedAtRef = useRef<number | null>(locked ? null : Date.now())
  const prevLockedRef = useRef(locked)
  const triggered = useRef(false)
  const center = useMemo(() => new THREE.Vector3(...position), [position])
  useEffect(() => {
    if (prevLockedRef.current && !locked) {
      unlockedAtRef.current = Date.now()
    }
    prevLockedRef.current = locked
  }, [locked])
  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    if (ringRef.current) {
      ringRef.current.rotation.y += dt * (locked ? 0.45 : 0.85)
      const pulse = photosensitiveMode ? 1 : (locked ? 1 + Math.sin(t * 2.1) * 0.05 : 1 + Math.sin(t * 2.6) * 0.03)
      ringRef.current.scale.setScalar(pulse)
    }
    const dist = playerRef.current.distanceTo(center)
    if (dist < 1.5 && !triggered.current && !locked) {
      triggered.current = true
      onEnter()
      window.setTimeout(() => { triggered.current = false }, 1200)
    }
  })
  return (
    <group position={position}>
      <mesh ref={ringRef} position={[0, 1.2, 0]}>
        <torusGeometry args={[1.1, 0.08, 16, 64]} />
        <meshStandardMaterial color={locked ? '#64748b' : color} emissive={locked ? '#334155' : color} emissiveIntensity={locked ? 0.9 : 2.5} />
      </mesh>
      {!locked && <pointLight position={[0, 1.2, 0]} color={color} intensity={4.8} distance={7} />}
      {locked && <pointLight position={[0, 1.2, 0]} color="#64748b" intensity={1.2} distance={5} />}
      {!locked && !photosensitiveMode && <Sparkles count={8} scale={[2.5, 2.5, 2.5]} size={1.7} speed={0.12} color={color} opacity={0.22} />}
      {highlight && (
        <Html position={[0, 3.4, 0]} center distanceFactor={8}>
          <div style={{ color: '#fef08a', fontSize: 26, textShadow: '0 0 18px rgba(250,204,21,0.8)', animation: 'hermes-target-arrow var(--hw-flash-rate, 1.5s) ease-in-out infinite' }}>↓</div>
        </Html>
      )}
      {!photosensitiveMode && !locked && unlockedAtRef.current && Date.now() - unlockedAtRef.current < 2200 && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.8, 2.5, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.42} />
        </mesh>
      )}
      <Html position={[0, 2.7, 0]} center distanceFactor={8}>
        <div style={{padding:'2px 8px',background:'rgba(0,0,0,0.7)',color: locked ? '#cbd5e1' : color,borderRadius:4,fontSize:13,whiteSpace:'nowrap',fontWeight:600}}>{locked ? `${label} · locked` : label}</div>
      </Html>
    </group>
  )
}

/* ── Quest trigger zone ── */
function QuestZone({
  position,
  color,
  label,
  highlight = false,
  onEnter,
  playerRef,
}: {
  position: [number, number, number]
  color: string
  label: string
  highlight?: boolean
  onEnter: () => void
  playerRef: React.MutableRefObject<THREE.Vector3>
}) {
  const ref = useRef<THREE.Mesh>(null)
  const triggered = useRef(false)
  const center = useMemo(() => new THREE.Vector3(...position), [position])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const s = 1 + Math.sin(clock.getElapsedTime() * 2) * 0.05
    ref.current.scale.setScalar(s)
    const dist = playerRef.current.distanceTo(center)
    if (dist < 1.6 && !triggered.current) {
      triggered.current = true
      onEnter()
      window.setTimeout(() => { triggered.current = false }, 2000)
    }
  })
  return (
    <group position={position}>
      <mesh ref={ref} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.5, 32]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} transparent opacity={0.7} />
      </mesh>
      <Html position={[0, 1.8, 0]} center distanceFactor={8}>
        <div style={{padding:'2px 6px',background:'rgba(0,0,0,0.6)',color,borderRadius:4,fontSize:11,whiteSpace:'nowrap'}}>✨ {label}</div>
      </Html>
      {highlight && (
        <Html position={[0, 2.65, 0]} center distanceFactor={8}>
          <div style={{ color: '#fef08a', fontSize: 24, textShadow: '0 0 18px rgba(250,204,21,0.8)', animation: 'hermes-target-arrow var(--hw-flash-rate, 1.5s) ease-in-out infinite' }}>↓</div>
        </Html>
      )}
    </group>
  )
}

/* ── Keyboard hook ── */
function useKeyboard() {
  const keys = useRef<Set<string>>(new Set())
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const k = e.key.toLowerCase()
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift','control',' ','[',']'].includes(k)) {
        keys.current.add(k)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return keys
}

/* ── Walking player + iso follow camera (no physics, simple kinematic) ── */
function PlayerAndCamera({
  avatarId,
  avatarConfig,
  displayName = 'You',
  gearAccent,
  gearCape,
  gearArtifact,
  gearWeapon,
  gearHelmet,
  spawn = [0, 0, 6],
  positionRef,
  moveTargetRef,
  bounds = { x: 28, z: 22 },
  yawOutRef,
}: {
  avatarId?: string
  avatarConfig?: AvatarConfig
  displayName?: string
  gearAccent?: string
  gearCape?: string
  gearArtifact?: string | null
  gearWeapon?: AvatarConfig['weapon']
  gearHelmet?: AvatarConfig['helmet']
  spawn?: [number, number, number]
  positionRef: React.MutableRefObject<THREE.Vector3>
  moveTargetRef?: React.MutableRefObject<THREE.Vector3 | null>
  bounds?: { x: number; z: number }
  yawOutRef?: React.MutableRefObject<number>
}) {
  const storedCfg = useAvatarConfig()
  const cfg = avatarConfig ?? storedCfg
  const portraitId = avatarId || cfg.portrait || 'hermes'
  const groupRef = useRef<THREE.Group>(null)
  const keys = useKeyboard()
  const { camera } = useThree()
  const camIdeal = useMemo(() => new THREE.Vector3(), [])
  const camLook = useMemo(() => new THREE.Vector3(), [])
  const yaw = useRef(0)
  const camYaw = useRef(Math.PI / 4) // 45° isometric default
  const camPitch = useRef(0.85) // ~49° down
  const camDistance = useRef(13)
  const isMoving = useRef(false)
  const bobT = useRef(0)
  const dashUntil = useRef(0)
  const jumpStartedAt = useRef<number | null>(null)
  const lastJumpAt = useRef(0)
  const jumpHeight = useRef(0)
  const mobileCrouch = useRef(false)

  useEffect(() => {
    const tryJump = () => {
      const now = Date.now()
      if (jumpStartedAt.current || now - lastJumpAt.current < 600) return
      lastJumpAt.current = now
      jumpStartedAt.current = now
      try { window.dispatchEvent(new CustomEvent('hermesworld-player-jumped')) } catch {}
    }
    const onDash = () => {
      dashUntil.current = Date.now() + 900
    }
    const onJump = () => tryJump()
    const onCrouch = (event: Event) => {
      mobileCrouch.current = !!(event as CustomEvent<{ active?: boolean }>).detail?.active
    }
    window.addEventListener('hermes-playground-dash', onDash)
    window.addEventListener('hermesworld-mobile-jump', onJump)
    window.addEventListener('hermesworld-mobile-crouch', onCrouch)
    return () => {
      window.removeEventListener('hermes-playground-dash', onDash)
      window.removeEventListener('hermesworld-mobile-jump', onJump)
      window.removeEventListener('hermesworld-mobile-crouch', onCrouch)
    }
  }, [])

  // Mouse-look (yaw + pitch): left-click drag (with movement threshold so NPC clicks still register), right/middle-click drag, plus wheel zoom.
  useEffect(() => {
    let dragging = false
    let lastX = 0
    let lastY = 0
    let startX = 0
    let startY = 0
    let dragArmedLeft = false // armed but not yet active until movement passes threshold
    let dragActive = false
    const DRAG_THRESHOLD = 5 // px — below this we let the click pass to NPCs/UI
    const onContext = (e: MouseEvent) => {
      e.preventDefault()
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // Right/middle: drag immediately. Left: only on the canvas, and only after movement threshold.
      const isCanvas = target?.tagName === 'CANVAS'
      if (e.button === 2 || e.button === 1) {
        dragging = true
        dragActive = true
        dragArmedLeft = false
        lastX = startX = e.clientX
        lastY = startY = e.clientY
        document.body.style.cursor = 'grabbing'
      } else if (e.button === 0 && isCanvas) {
        dragging = true
        dragActive = false // not active until threshold exceeded
        dragArmedLeft = true
        lastX = startX = e.clientX
        lastY = startY = e.clientY
      }
    }
    const onMove = (e: MouseEvent) => {
      if (!dragging) return
      // For left-drag, gate on movement threshold so plain clicks still hit NPCs
      if (dragArmedLeft && !dragActive) {
        const totalDx = e.clientX - startX
        const totalDy = e.clientY - startY
        if (Math.hypot(totalDx, totalDy) < DRAG_THRESHOLD) return
        dragActive = true
        document.body.style.cursor = 'grabbing'
      }
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      // Sensitivity: smaller = slower, larger = faster
      const sens = 0.005
      camYaw.current += dx * sens
      camPitch.current = Math.max(0.25, Math.min(1.4, camPitch.current + dy * sens))
    }
    const onUp = () => {
      if (dragging) {
        dragging = false
        dragActive = false
        dragArmedLeft = false
        document.body.style.cursor = ''
      }
    }
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      // Only zoom when not over a chat/UI panel — check if event is over canvas-y area
      camDistance.current = Math.max(6, Math.min(28, camDistance.current + e.deltaY * 0.01))
    }
    window.addEventListener('contextmenu', onContext)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('contextmenu', onContext)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('wheel', onWheel)
      document.body.style.cursor = ''
    }
  }, [])

  // Initial spawn position — runs ONCE per mount, ignoring spawn-array identity
  // changes from parent re-renders (those caused snap-back to origin).
  const spawnedRef = useRef(false)
  useEffect(() => {
    if (spawnedRef.current) return
    spawnedRef.current = true
    positionRef.current.set(spawn[0], spawn[1], spawn[2])
    if (groupRef.current) groupRef.current.position.copy(positionRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cinematic camera mode — Tab cycles through preset angles useful for filming.
  // ESC returns to default isometric.
  useEffect(() => {
    const presets: Array<{ yaw: number; pitch: number; distance: number; name: string }> = [
      { yaw: Math.PI / 4, pitch: 0.85, distance: 13, name: 'Isometric' },
      { yaw: 0, pitch: 0.55, distance: 9, name: 'Behind-back' },
      { yaw: Math.PI, pitch: 0.6, distance: 9, name: 'Front-face' },
      { yaw: Math.PI / 2, pitch: 1.15, distance: 18, name: 'Top-down' },
      { yaw: -Math.PI / 4, pitch: 0.7, distance: 16, name: 'Cinematic-low' },
      { yaw: Math.PI / 4, pitch: 0.4, distance: 22, name: 'Wide-establish' },
    ]
    let idx = 0
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (event.key === 'Tab') {
        event.preventDefault()
        idx = (idx + 1) % presets.length
        const p = presets[idx]
        camYaw.current = p.yaw
        camPitch.current = p.pitch
        camDistance.current = p.distance
        // Tiny ephemeral toast
        try {
          window.dispatchEvent(new CustomEvent('hermes-playground-camera-preset', { detail: p.name }))
        } catch {}
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useFrame((_, delta) => {
    const k = keys.current
    // ARROW KEYS = camera orbit (yaw + pitch)
    if (k.has('arrowleft')) camYaw.current -= delta * 1.6
    if (k.has('arrowright')) camYaw.current += delta * 1.6
    if (k.has('arrowup')) camPitch.current = Math.max(0.45, camPitch.current - delta * 1.2)
    if (k.has('arrowdown')) camPitch.current = Math.min(1.25, camPitch.current + delta * 1.2)
    if (k.has('[')) camDistance.current = Math.max(7, camDistance.current - delta * 8)
    if (k.has(']')) camDistance.current = Math.min(22, camDistance.current + delta * 8)

    // WASD = walk (relative to camera yaw so feels natural)
    let dx = 0, dz = 0
    if (k.has('w')) dz -= 1
    if (k.has('s')) dz += 1
    if (k.has('a')) dx -= 1
    if (k.has('d')) dx += 1
    const wasdMoving = dx !== 0 || dz !== 0
    if (wasdMoving && moveTargetRef) moveTargetRef.current = null // WASD cancels click-to-walk
    const now = Date.now()
    if (k.has(' ') && !jumpStartedAt.current && now - lastJumpAt.current >= 600) {
      lastJumpAt.current = now
      jumpStartedAt.current = now
      try { window.dispatchEvent(new CustomEvent('hermesworld-player-jumped')) } catch {}
    }
    if (jumpStartedAt.current) {
      const elapsed = now - jumpStartedAt.current
      const t = Math.min(1, elapsed / 520)
      jumpHeight.current = Math.sin(t * Math.PI) * 0.75
      if (t >= 1) {
        jumpStartedAt.current = null
        jumpHeight.current = 0
      }
    }
    const crouching = k.has('control') || mobileCrouch.current
    const dashBoost = dashUntil.current > now ? 1.95 : 1
    const crouchSlow = crouching ? 0.6 : 1
    const speed = (k.has('shift') ? 9 : 5) * dashBoost * crouchSlow * delta

    let mx = 0
    let mz = 0
    if (wasdMoving) {
      const mag = Math.hypot(dx, dz) || 1
      // Rotate input direction by camera yaw so W is always 'into' the scene
      const cy = Math.cos(camYaw.current)
      const sy = Math.sin(camYaw.current)
      const ix = dx / mag
      const iz = dz / mag
      const wx = ix * cy + iz * sy
      const wz = -ix * sy + iz * cy
      mx = wx * speed
      mz = wz * speed
    } else if (moveTargetRef?.current) {
      // Click-to-walk steering toward stored world target
      const tx = moveTargetRef.current.x - positionRef.current.x
      const tz = moveTargetRef.current.z - positionRef.current.z
      const dist = Math.hypot(tx, tz)
      if (dist < 0.18) {
        moveTargetRef.current = null
      } else {
        mx = (tx / dist) * speed
        mz = (tz / dist) * speed
      }
    }
    isMoving.current = mx !== 0 || mz !== 0
    if (isMoving.current) {
      positionRef.current.x = THREE.MathUtils.clamp(positionRef.current.x + mx, -bounds.x, bounds.x)
      positionRef.current.z = THREE.MathUtils.clamp(positionRef.current.z + mz, -bounds.z, bounds.z)
      yaw.current = Math.atan2(mx, mz)
      bobT.current += delta * 8
    } else {
      bobT.current = 0
    }
    if (groupRef.current) {
      groupRef.current.position.x = positionRef.current.x
      groupRef.current.position.z = positionRef.current.z
      groupRef.current.position.y = jumpHeight.current + (isMoving.current ? Math.abs(Math.sin(bobT.current)) * 0.08 : 0)
      groupRef.current.scale.y = THREE.MathUtils.lerp(groupRef.current.scale.y, crouching ? 0.52 : 1, 0.22)
      groupRef.current.rotation.y = yaw.current
    }
    if (yawOutRef) yawOutRef.current = yaw.current
    // Orbital camera around player
    const r = camDistance.current
    const px = positionRef.current.x
    const pz = positionRef.current.z
    const ox = Math.sin(camYaw.current) * Math.sin(camPitch.current) * r
    const oz = Math.cos(camYaw.current) * Math.sin(camPitch.current) * r
    const oy = Math.cos(camPitch.current) * r + (crouching ? 0.85 : 1.5)
    camIdeal.set(px + ox, oy, pz + oz)
    camera.position.lerp(camIdeal, 0.12)
    camLook.set(px, crouching ? 0.35 : 0.6, pz)
    camera.lookAt(camLook)
  })

  // Walk cycle phase oscillator (limbs swing 0..1 sine)
  const swing = Math.sin(bobT.current) // alternates -1..1
  return (
    <group ref={groupRef} position={spawn}>
      {/* shadow plate */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.68, 24]} />
        <meshBasicMaterial color="black" transparent opacity={0.4} />
      </mesh>

      {/* Legs */}
      <mesh
        position={[0.16, 0.28, 0]}
        rotation={[isMoving.current ? swing * 0.6 : 0, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.16, 0.56, 0.18]} />
        <meshStandardMaterial color="#102a3a" roughness={0.58} />
      </mesh>
      <mesh
        position={[-0.16, 0.28, 0]}
        rotation={[isMoving.current ? -swing * 0.6 : 0, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.16, 0.56, 0.18]} />
        <meshStandardMaterial color="#102a3a" roughness={0.58} />
      </mesh>

      {/* Feet */}
      <mesh
        position={[
          0.16,
          0.05,
          isMoving.current ? swing * 0.18 : 0,
        ]}
        castShadow
      >
        <boxGeometry args={[0.24, 0.1, 0.36]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      <mesh
        position={[
          -0.16,
          0.05,
          isMoving.current ? -swing * 0.18 : 0,
        ]}
        castShadow
      >
        <boxGeometry args={[0.24, 0.1, 0.36]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.34, 0.74, 10]} />
        <meshStandardMaterial color={cfg.outfit} roughness={0.48} emissive={cfg.outfit} emissiveIntensity={0.1} />
      </mesh>
      {/* Knight chest plate — muscled cuirass with sigil disc */}
      <mesh position={[0, 0.96, 0.18]} castShadow>
        <boxGeometry args={[0.46, 0.62, 0.08]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0.98, 0.225]}>
        <cylinderGeometry args={[0.12, 0.12, 0.02, 16]} />
        <meshStandardMaterial color={gearAccent || cfg.outfitAccent} metalness={0.7} roughness={0.25} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.55} />
      </mesh>
      {/* Wings on the chest sigil */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.13, 0.99, 0.232]} rotation={[0, 0, s * 0.55]}>
          <coneGeometry args={[0.04, 0.12, 6]} />
          <meshStandardMaterial color="#fff5d1" emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.7} />
        </mesh>
      ))}
      {/* Pauldron stud */}
      <mesh position={[0, 1.02, 0.16]} castShadow rotation={[Math.PI / 4, 0, Math.PI / 4]}>
        <boxGeometry args={[0.16, 0.16, 0.16]} />
        <meshStandardMaterial color={gearAccent || cfg.outfitAccent} metalness={0.42} roughness={0.28} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.28} />
      </mesh>
      {/* Pelvis */}
      <mesh position={[0, 0.56, 0]} castShadow>
        <boxGeometry args={[0.38, 0.12, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.72} />
      </mesh>
      {/* Tasset (skirt of armor strips) */}
      {[-0.18, -0.06, 0.06, 0.18].map((x) => (
        <mesh key={x} castShadow position={[x, 0.42, 0.16]} rotation={[0.05, 0, 0]}>
          <boxGeometry args={[0.1, 0.22, 0.05]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.12} />
        </mesh>
      ))}

      {/* Belt accent */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.5, 0.07, 0.32]} />
        <meshStandardMaterial color={gearAccent || cfg.outfitAccent} roughness={0.4} metalness={0.4} />
      </mesh>

      {/* Arms */}
      <mesh
        position={[0.39, 0.92, 0]}
        rotation={[isMoving.current ? -swing * 0.7 : 0, 0, 0.05]}
        castShadow
      >
        <boxGeometry args={[0.14, 0.58, 0.14]} />
        <meshStandardMaterial color={cfg.outfit} roughness={0.5} />
      </mesh>
      <mesh
        position={[-0.39, 0.92, 0]}
        rotation={[isMoving.current ? swing * 0.7 : 0, 0, -0.05]}
        castShadow
      >
        <boxGeometry args={[0.14, 0.58, 0.14]} />
        <meshStandardMaterial color={cfg.outfit} roughness={0.5} />
      </mesh>

      {/* Hands */}
      <mesh position={[0.39, 0.58, isMoving.current ? -swing * 0.18 : 0]} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.5} />
      </mesh>
      <mesh position={[-0.39, 0.58, isMoving.current ? swing * 0.18 : 0]} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.5} />
      </mesh>
      {/* Gauntlets (forearm armor) */}
      <mesh position={[0.39, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.075, 0.22, 10]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[-0.39, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.075, 0.22, 10]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.18} />
      </mesh>
      {/* Greaves (shin armor) */}
      <mesh position={[0.16, 0.18, 0]} castShadow>
        <boxGeometry args={[0.18, 0.32, 0.2]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.32} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[-0.16, 0.18, 0]} castShadow>
        <boxGeometry args={[0.18, 0.32, 0.2]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.65} roughness={0.32} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.12} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.23, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.6} />
      </mesh>

      {/* Head sphere base */}
      <mesh position={[0, 1.44, 0]} castShadow>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.27, 0.15]} castShadow>
        <boxGeometry args={[0.18, 0.12, 0.08]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.5} />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.09, 1.46, 0.2]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color={cfg.eyes} />
      </mesh>
      <mesh position={[-0.09, 1.46, 0.2]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color={cfg.eyes} />
      </mesh>
      {/* Hair styles */}
      {cfg.hairStyle === 'short' && (
        <mesh position={[0, 1.56, -0.03]} castShadow>
          <sphereGeometry args={[0.255, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      )}
      {cfg.hairStyle === 'cap' && (
        <mesh position={[0, 1.58, -0.03]} castShadow>
          <sphereGeometry args={[0.255, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      )}
      {cfg.hairStyle === 'long' && (<>
        <mesh position={[0, 1.56, -0.03]} castShadow>
          <sphereGeometry args={[0.255, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.28, -0.2]} castShadow>
          <boxGeometry args={[0.44, 0.54, 0.08]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      </>)}
      {cfg.hairStyle === 'mohawk' && (
        <mesh position={[0, 1.64, 0]} castShadow>
          <boxGeometry args={[0.08, 0.22, 0.42]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      )}
      {(gearHelmet || cfg.helmet) === 'circlet' && (
        <mesh position={[0, 1.49, 0]} castShadow>
          <torusGeometry args={[0.245, 0.025, 8, 24]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
        </mesh>
      )}
      {(gearHelmet || cfg.helmet) === 'crown' && (<>
        <mesh position={[0, 1.49, 0]} castShadow>
          <torusGeometry args={[0.245, 0.025, 8, 24]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
        </mesh>
        {[0, Math.PI / 3, -Math.PI / 3, Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.245, 1.56, Math.sin(a) * 0.245]} castShadow>
            <coneGeometry args={[0.025, 0.08, 4]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
          </mesh>
        ))}
      </>)}
      {(gearHelmet || cfg.helmet) === 'cap' && (
        <mesh position={[0, 1.62, -0.03]} castShadow>
          <sphereGeometry args={[0.255, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={cfg.outfit} roughness={0.55} emissive={cfg.outfit} emissiveIntensity={0.15} />
        </mesh>
      )}
      {(gearHelmet || cfg.helmet) === 'winged' && (<>
        <mesh position={[0, 1.49, 0]} castShadow>
          <torusGeometry args={[0.245, 0.025, 8, 24]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
        </mesh>
        <mesh castShadow position={[0.21, 1.55, -0.02]} rotation={[0, 0, 0.6]}>
          <coneGeometry args={[0.06, 0.18, 5]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.35} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[-0.21, 1.55, -0.02]} rotation={[0, 0, -0.6]}>
          <coneGeometry args={[0.06, 0.18, 5]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.35} roughness={0.5} />
        </mesh>
      </>)}
      {/* Shoulder pads */}
      {(gearCape || cfg.cape) !== 'transparent' && (
        <>
          <mesh castShadow position={[-0.4, 1.1, -0.02]} rotation={[0.12, 0, 0.4]}>
            <boxGeometry args={[0.3, 0.16, 0.28]} />
            <meshStandardMaterial color={gearAccent || cfg.outfitAccent} metalness={0.55} roughness={0.4} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.18} />
          </mesh>
          <mesh castShadow position={[0.4, 1.1, -0.02]} rotation={[0.12, 0, -0.4]}>
            <boxGeometry args={[0.3, 0.16, 0.28]} />
            <meshStandardMaterial color={gearAccent || cfg.outfitAccent} metalness={0.55} roughness={0.4} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.18} />
          </mesh>
        </>
      )}
      {/* Cape (optional) */}
      {(gearCape || cfg.cape) !== 'transparent' && (
        <group position={[0, 0.92, -0.24]}>
          <mesh castShadow position={[-0.12, -0.08, 0]} rotation={[0.28, 0.08, 0.06]}>
            <planeGeometry args={[0.48, 1.1]} />
            <meshStandardMaterial color={gearCape || cfg.cape} side={THREE.DoubleSide} roughness={0.55} emissive={gearCape || cfg.cape} emissiveIntensity={0.12} />
          </mesh>
          <mesh castShadow position={[0.12, -0.08, 0]} rotation={[0.28, -0.08, -0.06]}>
            <planeGeometry args={[0.48, 1.1]} />
            <meshStandardMaterial color={gearCape || cfg.cape} side={THREE.DoubleSide} roughness={0.55} emissive={gearCape || cfg.cape} emissiveIntensity={0.12} />
          </mesh>
        </group>
      )}
      {/* Weapon */}
      {(gearWeapon || cfg.weapon) === 'sword' && (<>
        <mesh castShadow position={[0.52, 0.72, 0.02]} rotation={[0.1, 0, -0.22]}>
          <boxGeometry args={[0.05, 0.96, 0.05]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh castShadow position={[0.52, 0.28, 0.02]} rotation={[0.1, 0, -0.22]}>
          <boxGeometry args={[0.18, 0.06, 0.08]} />
          <meshStandardMaterial color="#7c2d12" roughness={0.85} />
        </mesh>
      </>)}
      {(gearWeapon || cfg.weapon) === 'staff' && (
        <mesh castShadow position={[0.5, 0.96, 0.08]} rotation={[0, 0, -0.08]}>
          <cylinderGeometry args={[0.04, 0.04, 1.7, 8]} />
          <meshStandardMaterial color="#7c4a1f" roughness={0.7} emissive={gearAccent || cfg.outfitAccent} emissiveIntensity={0.18} />
        </mesh>
      )}
      {(gearWeapon || cfg.weapon) === 'bow' && (
        <mesh castShadow position={[0.52, 0.88, 0.04]} rotation={[0, 0, -0.32]}>
          <torusGeometry args={[0.45, 0.025, 8, 18, Math.PI]} />
          <meshStandardMaterial color="#7c4a1f" roughness={0.7} />
        </mesh>
      )}
      {gearArtifact && (
        <>
          <mesh position={[0, 0.95, 0.33]} castShadow>
            <octahedronGeometry args={[0.08, 0]} />
            <meshStandardMaterial color={gearArtifact} emissive={gearArtifact} emissiveIntensity={1.3} roughness={0.18} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.95, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.12, 0.012, 8, 24]} />
            <meshStandardMaterial color={gearArtifact} emissive={gearArtifact} emissiveIntensity={1.1} />
          </mesh>
        </>
      )}

      {/* nameplate w/ portrait chip — "You" */}
      <Html position={[0, 2.2, 0]} center distanceFactor={8}>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 8px 2px 2px',background:'rgba(0,0,0,0.78)',color:'#a7f3d0',borderRadius:14,fontSize:11,fontWeight:700,whiteSpace:'nowrap',border:'1px solid #34d39955',boxShadow:'0 0 8px #34d39933'}}>
          <img src={`/avatars/${portraitId}.png`} alt="" loading="lazy" decoding="async" style={{width:22,height:22,borderRadius:'50%',background:gearAccent || cfg.outfitAccent,objectFit:'cover',border:'1px solid #34d399'}} />
          <span>{displayName}</span>
        </div>
      </Html>
      {/* Self chat speech bubble — fades after 5.5s */}
      <SelfChatBubble />
    </group>
  )
}

/** Hermes Summoning skill — a glowing familiar orbits the player for 60s after summon. */
function SummonedFamiliar({ playerRef }: { playerRef: React.MutableRefObject<THREE.Vector3> }) {
  const ref = useRef<THREE.Mesh>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const [active, setActive] = useState<{ untilTs: number; color: string } | null>(null)
  useEffect(() => {
    const onSummon = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { durationMs?: number; color?: string } | undefined
      const dur = detail?.durationMs ?? 60000
      const col = detail?.color ?? '#a78bfa'
      setActive({ untilTs: Date.now() + dur, color: col })
    }
    window.addEventListener('hermes-playground-summon-familiar', onSummon)
    return () => window.removeEventListener('hermes-playground-summon-familiar', onSummon)
  }, [])
  useFrame(({ clock }) => {
    if (!active) return
    if (Date.now() > active.untilTs) {
      setActive(null)
      return
    }
    if (!ref.current) return
    const t = clock.getElapsedTime()
    const r = 1.5
    ref.current.position.x = playerRef.current.x + Math.cos(t * 1.6) * r
    ref.current.position.z = playerRef.current.z + Math.sin(t * 1.6) * r
    ref.current.position.y = 1.7 + Math.sin(t * 3) * 0.15
    ref.current.rotation.y = t * 2
    if (lightRef.current) {
      lightRef.current.position.copy(ref.current.position)
    }
  })
  if (!active) return null
  const remainingMs = Math.max(0, active.untilTs - Date.now())
  const fade = Math.min(1, remainingMs / 5000)
  return (
    <>
      <mesh ref={ref}>
        <octahedronGeometry args={[0.18, 0]} />
        <meshStandardMaterial color={active.color} emissive={active.color} emissiveIntensity={1.4 * fade} transparent opacity={0.9 * fade} />
      </mesh>
      <pointLight ref={lightRef} color={active.color} intensity={1.2 * fade} distance={4} decay={1.5} />
    </>
  )
}

/** Listens for the local player's chat sends and pops a speech bubble over their head. */
function SelfChatBubble() {
  const [bubble, setBubble] = useState<{ text: string; ts: number } | null>(null)
  useEffect(() => {
    const onChat = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as string | undefined
      if (!detail) return
      setBubble({ text: detail, ts: Date.now() })
    }
    window.addEventListener('hermes-playground-self-chat-bubble', onChat)
    return () => window.removeEventListener('hermes-playground-self-chat-bubble', onChat)
  }, [])
  useEffect(() => {
    if (!bubble) return
    const id = window.setTimeout(() => setBubble(null), 5500)
    return () => window.clearTimeout(id)
  }, [bubble])
  if (!bubble) return null
  return (
    <Html position={[0, 2.85, 0]} center distanceFactor={8}>
      <SpeechBubble className="hermes-world-bubble" variant="player" compact>
        {bubble.text}
      </SpeechBubble>
    </Html>
  )
}

/* NPC color palette per persona */
const NPC_COLORS: Record<string, string> = {
  athena: '#a78bfa', // purple, Sage
  apollo: '#f59e0b', // amber, Bard
  iris: '#22d3ee', // cyan, Messenger
  nike: '#fb7185', // rose, Champion
  pan: '#34d399', // emerald, Hacker
  chronos: '#facc15', // yellow, Architect
  hermes: '#2dd4bf', // teal
  artemis: '#9ca3af',
  eros: '#f472b6',
  shopkeeper: '#38bdf8',
  trainer: '#fb7185',
  banker: '#facc15',
  recruiter: '#a78bfa',
  tavernkeeper: '#f59e0b',
  innkeeper: '#86efac',
  apothecary: '#f472b6',
}

/* ── Bot player (waypoint walker with chat bubble) ── */
function BotPlayer({
  bot,
  bubbleText,
}: {
  bot: BotProfile
  bubbleText?: string
}) {
  const ref = useRef<THREE.Group>(null)
  const target = useRef(new THREE.Vector3(...bot.spawn))
  const next = useRef(0)
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])
  const swing = useRef(0)
  const moving = useRef(false)

  useFrame(({ clock }, dt) => {
    if (!ref.current) return
    const now = clock.getElapsedTime()
    if (now > next.current) {
      // Pick a new waypoint within ~10u of spawn
      target.current.set(
        bot.spawn[0] + (Math.random() - 0.5) * 10,
        0,
        bot.spawn[2] + (Math.random() - 0.5) * 10,
      )
      next.current = now + 4 + Math.random() * 4
    }
    const pos = ref.current.position
    const dx = target.current.x - pos.x
    const dz = target.current.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 0.15) {
      const speed = 2 * dt
      pos.x += (dx / dist) * speed
      pos.z += (dz / dist) * speed
      ref.current.rotation.y = Math.atan2(dx, dz)
      moving.current = true
      swing.current += dt * 8
    } else {
      moving.current = false
    }
    pos.y = moving.current ? Math.abs(Math.sin(swing.current)) * 0.07 : 0
  })

  const limbSwing = Math.sin(swing.current)
  return (
    <group ref={ref} position={bot.spawn}>
      {/* shadow */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 18]} />
        <meshBasicMaterial color="black" transparent opacity={0.4} />
      </mesh>
      {/* legs */}
      <mesh position={[0.13, 0.22, 0]} rotation={[moving.current ? limbSwing * 0.5 : 0, 0, 0]} castShadow>
        <boxGeometry args={[0.14, 0.44, 0.14]} />
        <meshStandardMaterial color="#1f2a37" roughness={0.6} />
      </mesh>
      <mesh position={[-0.13, 0.22, 0]} rotation={[moving.current ? -limbSwing * 0.5 : 0, 0, 0]} castShadow>
        <boxGeometry args={[0.14, 0.44, 0.14]} />
        <meshStandardMaterial color="#1f2a37" roughness={0.6} />
      </mesh>
      {/* feet */}
      <mesh position={[0.13, 0.04, moving.current ? limbSwing * 0.16 : 0]} castShadow>
        <boxGeometry args={[0.18, 0.07, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>
      <mesh position={[-0.13, 0.04, moving.current ? -limbSwing * 0.16 : 0]} castShadow>
        <boxGeometry args={[0.18, 0.07, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} />
      </mesh>
      {/* torso */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.5, 0.55, 0.32]} />
        <meshStandardMaterial color={bot.color} roughness={0.55} emissive={bot.color} emissiveIntensity={0.15} />
      </mesh>
      {/* belt */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.52, 0.05, 0.34]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.4} roughness={0.4} />
      </mesh>
      {/* arms */}
      <mesh position={[0.32, 0.7, 0]} rotation={[moving.current ? -limbSwing * 0.6 : 0, 0, 0.05]} castShadow>
        <boxGeometry args={[0.13, 0.5, 0.13]} />
        <meshStandardMaterial color={bot.color} roughness={0.55} />
      </mesh>
      <mesh position={[-0.32, 0.7, 0]} rotation={[moving.current ? limbSwing * 0.6 : 0, 0, -0.05]} castShadow>
        <boxGeometry args={[0.13, 0.5, 0.13]} />
        <meshStandardMaterial color={bot.color} roughness={0.55} />
      </mesh>
      {/* hands */}
      <mesh position={[0.32, 0.43, 0]} castShadow>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#fde68a" roughness={0.5} />
      </mesh>
      <mesh position={[-0.32, 0.43, 0]} castShadow>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshStandardMaterial color="#fde68a" roughness={0.5} />
      </mesh>
      {/* neck */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.095, 0.1, 12]} />
        <meshStandardMaterial color="#fde68a" roughness={0.55} />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.22, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#fde68a" roughness={0.55} />
      </mesh>
      {/* eyes */}
      <mesh position={[0.085, 1.24, 0.19]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#0b1220" /></mesh>
      <mesh position={[-0.085, 1.24, 0.19]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color="#0b1220" /></mesh>
      {/* hair cap (bot) */}
      <mesh position={[0, 1.34, -0.02]} castShadow>
        <sphereGeometry args={[0.235, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={bot.color} roughness={0.85} emissive={bot.color} emissiveIntensity={0.18} />
      </mesh>
      {/* shoulder pads (bot) */}
      <mesh castShadow position={[-0.36, 0.96, 0]} rotation={[0, 0, 0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color="#0e7490" metalness={0.45} roughness={0.45} /></mesh>
      <mesh castShadow position={[0.36, 0.96, 0]} rotation={[0, 0, -0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color="#0e7490" metalness={0.45} roughness={0.45} /></mesh>
      {/* nameplate w/ portrait chip */}
      <Html position={[0, 1.95, 0]} center distanceFactor={8}>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 8px 2px 2px',background:'rgba(0,0,0,0.78)',color:bot.color,borderRadius:14,fontSize:11,fontWeight:700,whiteSpace:'nowrap',border:`1px solid ${bot.color}55`,boxShadow:`0 0 8px ${bot.color}33`}}>
          <img src={`/avatars/${bot.avatar}.png`} alt="" loading="lazy" decoding="async" style={{width:22,height:22,borderRadius:'50%',background:bot.color,objectFit:'cover',border:`1px solid ${bot.color}`}} />
          <span>{bot.name}</span>
        </div>
      </Html>
      {/* chat bubble */}
      {bubbleText && (
        <Html position={[0, 2.6, 0]} center distanceFactor={8}>
          <SpeechBubble className="hermes-world-bubble" variant="party" accent={bot.color} compact>
            {bubbleText}
          </SpeechBubble>
        </Html>
      )}
    </group>
  )
}


type InteriorId = 'tavern' | 'bank' | 'smithy' | 'inn' | 'apothecary' | 'guild'

const INTERIORS: Record<InteriorId, { title: string; accent: string; keeper: string; keeperNpc: string; keeperAvatar: string; keeperColor: string }> = {
  tavern: { title: 'The Signal & Satyr Tavern', accent: '#f59e0b', keeper: 'Selene · Tavern Keeper', keeperNpc: 'tavernkeeper', keeperAvatar: 'apollo', keeperColor: '#f59e0b' },
  bank: { title: 'Midas Memory Bank', accent: '#facc15', keeper: 'Midas · Banker', keeperNpc: 'banker', keeperAvatar: 'chronos', keeperColor: '#facc15' },
  smithy: { title: 'Promptforge Smithy', accent: '#fb7185', keeper: 'Leonidas · Trainer', keeperNpc: 'trainer', keeperAvatar: 'nike', keeperColor: '#fb7185' },
  inn: { title: 'Wayfarer Inn', accent: '#86efac', keeper: 'Hestia · Innkeeper', keeperNpc: 'innkeeper', keeperAvatar: 'athena', keeperColor: '#86efac' },
  apothecary: { title: 'Eros’ Apothecary', accent: '#f472b6', keeper: 'Eros · Apothecary', keeperNpc: 'apothecary', keeperAvatar: 'eros', keeperColor: '#f472b6' },
  guild: { title: 'Builders’ Guild Hall', accent: '#a78bfa', keeper: 'Cassia · Recruiter', keeperNpc: 'recruiter', keeperAvatar: 'athena', keeperColor: '#a78bfa' },
}

function matchesObjectiveTarget(current: string | null, candidate: string) {
  if (!current) return false
  if (current === candidate) return true
  if (current === 'build-demo') return candidate === 'build-demo' || candidate === 'athena' || candidate === 'pan'
  return false
}

function DoorTrigger({
  position,
  label,
  color,
  playerRef,
  onEnter,
}: {
  position: [number, number, number]
  label: string
  color: string
  playerRef: React.MutableRefObject<THREE.Vector3>
  onEnter: () => void
}) {
  const ref = useRef<THREE.Mesh>(null)
  const triggered = useRef(false)
  const center = useMemo(() => new THREE.Vector3(...position), [position])
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.04
      ref.current.scale.setScalar(s)
    }
    const dist = playerRef.current.distanceTo(center)
    if (dist < 1.25 && !triggered.current) {
      triggered.current = true
      onEnter()
      window.setTimeout(() => { triggered.current = false }, 1200)
    }
  })
  return (
    <group position={position}>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.72, 0.95, 28]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.8} />
      </mesh>
      <Html position={[0, 1.5, 0]} center distanceFactor={8}>
        <div style={{padding:'3px 8px',background:'rgba(0,0,0,0.75)',color,borderRadius:6,fontSize:11,fontWeight:800,whiteSpace:'nowrap',border:`1px solid ${color}`}}>Enter {label}</div>
      </Html>
    </group>
  )
}

function InteriorScene({
  id,
  playerRef,
  moveTargetRef,
  onExit,
  onNpcNearChange,
}: {
  id: InteriorId
  playerRef: React.MutableRefObject<THREE.Vector3>
  moveTargetRef: React.MutableRefObject<THREE.Vector3 | null>
  onExit: () => void
  onNpcNearChange: (npcId: string | null) => void
}) {
  const info = INTERIORS[id]
  const [settings] = useHermesWorldSettings()
  const photosensitiveMode = settings.accessibility.photosensitiveMode
  const [pingPos, setPingPos] = useState<[number, number, number] | null>(null)
  return (
    <>
      <color attach="background" args={['#08070b']} />
      <fog attach="fog" args={['#08070b', 18, 38]} />
      <hemisphereLight intensity={0.35} color={'#fff1d0'} groundColor={'#251609'} />
      <ambientLight intensity={0.42} color={'#f4c982'} />
      <directionalLight castShadow position={[6, 10, 8]} intensity={1.1} color={'#ffe4b5'} shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 3, -2]} color={info.accent} intensity={photosensitiveMode ? 0.8 : 2.1} distance={16} />

      {/* click-to-walk interior floor catcher */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 0]} onPointerDown={(e) => {
        e.stopPropagation()
        const x = THREE.MathUtils.clamp(e.point.x, -8, 8)
        const z = THREE.MathUtils.clamp(e.point.z, -7, 7)
        moveTargetRef.current = new THREE.Vector3(x, 0, z)
        setPingPos([x, 0.05, z])
        window.setTimeout(() => setPingPos(null), 700)
      }}>
        <planeGeometry args={[18, 16, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pingPos && !photosensitiveMode && <mesh position={pingPos} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.6, 32]} /><meshBasicMaterial color={info.accent} transparent opacity={0.55} /></mesh>}

      <InteriorRoom id={id} accent={info.accent} />
      <NPC npcId={info.keeperNpc} position={[0, 0, -3.8]} avatar={info.keeperAvatar} name={info.keeper} color={info.keeperColor} drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />
      {id === 'tavern' && (
        <>
          <NPC npcId="apollo" position={[-4.5, 0, 1.5]} avatar="apollo" name="Apollo · Bard" color="#f59e0b" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />
          <NPC npcId="iris" position={[4.5, 0, 1.2]} avatar="iris" name="Iris · Messenger" color="#22d3ee" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />
        </>
      )}
      {id === 'bank' && <NPC npcId="chronos" position={[-4.5, 0, 1.2]} avatar="chronos" name="Chronos · Archivist" color="#facc15" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />}
      {id === 'smithy' && <NPC npcId="pan" position={[4.4, 0, 1.3]} avatar="pan" name="Pan · Toolwright" color="#34d399" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />}
      {id === 'inn' && <NPC npcId="apollo" position={[4.4, 0, 1.5]} avatar="apollo" name="Apollo · Bard at Rest" color="#f59e0b" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />}
      {id === 'apothecary' && <NPC npcId="chronos" position={[-4.4, 0, 1.5]} avatar="chronos" name="Chronos · Lab Notes" color="#facc15" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />}
      {id === 'guild' && <>
        <NPC npcId="nike" position={[-4.4, 0, 1.5]} avatar="nike" name="Nike · Raid Captain" color="#fb7185" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />
        <NPC npcId="hermes" position={[4.4, 0, 1.5]} avatar="hermes" name="Hermes · Guildmaster" color="#2dd4bf" drift={false} playerRef={playerRef} onNearChange={onNpcNearChange} />
      </>}

      <ExitTrigger playerRef={playerRef} onExit={onExit} accent={info.accent} />
      <InteriorExitButton onExit={onExit} accent={info.accent} />
      <Suspense fallback={null}>
        <PlayerAndCamera positionRef={playerRef} spawn={[0, 0, 4.7]} moveTargetRef={moveTargetRef} bounds={{ x: 8, z: 7 }} />
      </Suspense>
      <Html position={[0, 4.2, -6.8]} center distanceFactor={10}>
        <div style={{padding:'6px 12px',background:'rgba(0,0,0,0.78)',color:info.accent,border:`1px solid ${info.accent}`,borderRadius:10,fontSize:14,fontWeight:900,whiteSpace:'nowrap',letterSpacing:'0.08em',textTransform:'uppercase'}}>{info.title}</div>
      </Html>
    </>
  )
}

function ExitTrigger({ playerRef, onExit, accent }: { playerRef: React.MutableRefObject<THREE.Vector3>; onExit: () => void; accent: string }) {
  const triggered = useRef(false)
  const center = useMemo(() => new THREE.Vector3(0, 0, 6.2), [])
  useFrame(() => {
    const dist = playerRef.current.distanceTo(center)
    if (dist < 1.6 && !triggered.current) {
      triggered.current = true
      onExit()
      window.setTimeout(() => { triggered.current = false }, 1200)
    }
  })
  return (
    <group position={[0, 0, 6.2]}>
      {/* Bigger, clickable exit pad — click anywhere on the ring or use it as a portal. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.05, 0]}
        onPointerDown={(e) => { e.stopPropagation(); if (!triggered.current) { triggered.current = true; onExit() } }}
      >
        <ringGeometry args={[0.8, 1.5, 32]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} transparent opacity={0.85} />
      </mesh>
      {/* Glowing pillar so you can see the exit from anywhere in the room. */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 3, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.2} transparent opacity={0.6} />
      </mesh>
      <pointLight position={[0, 1.6, 0]} color={accent} intensity={1.6} distance={8} />
      <Html position={[0, 2.3, 0]} center distanceFactor={8}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (!triggered.current) { triggered.current = true; onExit() } }}
          style={{padding:'4px 12px',background:accent,color:'#000',borderRadius:8,fontSize:11,fontWeight:800,whiteSpace:'nowrap',border:'none',cursor:'pointer',boxShadow:`0 0 14px ${accent}`,letterSpacing:'0.1em',textTransform:'uppercase'}}
        >
          → Exit to Agora
        </button>
      </Html>
    </group>
  )
}

/** Always-visible exit button for interiors — fixed in HUD so the user can leave even if the floor trigger fails. */
function InteriorExitButton({ onExit, accent }: { onExit: () => void; accent: string }) {
  return (
    <Html fullscreen>
      <button
        type="button"
        onClick={onExit}
        style={{
          position: 'fixed',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '8px 16px',
          background: accent,
          color: '#000',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          border: 'none',
          cursor: 'pointer',
          boxShadow: `0 0 18px ${accent}, 0 8px 22px rgba(0,0,0,0.45)`,
          pointerEvents: 'auto',
          zIndex: 100,
        }}
      >
        ← Leave Building
      </button>
    </Html>
  )
}

function InteriorRoom({ id, accent }: { id: InteriorId; accent: string }) {
  const wallColor = id === 'bank' ? '#1f2937' : id === 'smithy' ? '#281512' : '#2b1d12'
  const floorColor = id === 'bank' ? '#5b6470' : id === 'smithy' ? '#51301b' : '#6b4528'
  return (
    <group>
      {/* floor + carpet */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}><planeGeometry args={[18, 16]} /><meshStandardMaterial color={floorColor} roughness={0.92} /></mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}><planeGeometry args={[5.5, 9]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.06} roughness={0.7} transparent opacity={0.55} /></mesh>
      {/* walls */}
      <mesh receiveShadow castShadow position={[0, 2, -8]}><boxGeometry args={[18, 4, 0.35]} /><meshStandardMaterial color={wallColor} roughness={0.78} /></mesh>
      <mesh receiveShadow castShadow position={[-9, 2, 0]}><boxGeometry args={[0.35, 4, 16]} /><meshStandardMaterial color={wallColor} roughness={0.78} /></mesh>
      <mesh receiveShadow castShadow position={[9, 2, 0]}><boxGeometry args={[0.35, 4, 16]} /><meshStandardMaterial color={wallColor} roughness={0.78} /></mesh>
      <mesh receiveShadow castShadow position={[0, 2, 8]}><boxGeometry args={[18, 4, 0.35]} /><meshStandardMaterial color={wallColor} roughness={0.78} /></mesh>
      {/* open door cutout visual */}
      <mesh position={[0, 1, 7.78]}><boxGeometry args={[2.2, 2.1, 0.08]} /><meshStandardMaterial color="#090909" emissive="#000" /></mesh>
      {/* ceiling beams */}
      {[-6, -3, 0, 3, 6].map((x) => <mesh key={x} castShadow position={[x, 3.92, 0]}><boxGeometry args={[0.22, 0.2, 16]} /><meshStandardMaterial color="#3f2511" roughness={0.8} /></mesh>)}

      {id === 'tavern' && <TavernProps accent={accent} />}
      {id === 'bank' && <BankProps accent={accent} />}
      {id === 'smithy' && <SmithyProps accent={accent} />}
      {id === 'inn' && <InnProps accent={accent} />}
      {id === 'apothecary' && <ApothecaryProps accent={accent} />}
      {id === 'guild' && <GuildProps accent={accent} />}
    </group>
  )
}

function TavernProps({ accent }: { accent: string }) {
  return <group>
    <mesh castShadow position={[0, 0.55, -5.8]}><boxGeometry args={[5.6, 1.1, 1]} /><meshStandardMaterial color="#7c4a1f" roughness={0.8} /></mesh>
    {[-6, -3, 3, 6].map((x) => <group key={x} position={[x, 0, 2]}><mesh castShadow position={[0, 0.42, 0]}><boxGeometry args={[1.2, 0.18, 1.2]} /><meshStandardMaterial color="#7c4a1f" /></mesh><mesh castShadow position={[0, 0.22, 0]}><cylinderGeometry args={[0.12, 0.16, 0.44, 8]} /><meshStandardMaterial color="#3f2511" /></mesh><mesh castShadow position={[0.75, 0.42, 0.65]}><boxGeometry args={[0.32, 0.85, 0.32]} /><meshStandardMaterial color="#6b3a18" /></mesh></group>)}
    <mesh castShadow position={[-6.8, 1.2, -6.8]}><boxGeometry args={[2.2, 2.2, 0.35]} /><meshStandardMaterial color="#2b1008" emissive="#ef4444" emissiveIntensity={0.25} /></mesh>
    <pointLight position={[-6.8, 1.4, -6.4]} color="#f97316" intensity={2.2} distance={8} />
    <mesh position={[0, 1.5, -7.7]}><boxGeometry args={[2.4, 0.5, 0.08]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} /></mesh>
  </group>
}

function BankProps({ accent }: { accent: string }) {
  return <group>
    <mesh castShadow position={[0, 0.75, -5.8]}><boxGeometry args={[6.4, 1.5, 1]} /><meshStandardMaterial color="#374151" metalness={0.25} roughness={0.55} /></mesh>
    {[-5.5, -3.5, 3.5, 5.5].map((x) => <mesh key={x} castShadow position={[x, 0.65, 1]}><boxGeometry args={[1, 1.3, 1]} /><meshStandardMaterial color="#111827" metalness={0.45} roughness={0.35} /></mesh>)}
    <mesh castShadow position={[6.9, 1.4, -5.6]}><boxGeometry args={[1.4, 2.4, 0.5]} /><meshStandardMaterial color="#0f172a" metalness={0.55} roughness={0.35} emissive={accent} emissiveIntensity={0.05} /></mesh>
    <mesh position={[6.9, 1.4, -5.28]}><circleGeometry args={[0.35, 24]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} /></mesh>
  </group>
}

function SmithyProps({ accent }: { accent: string }) {
  return <group>
    <mesh castShadow position={[-4.8, 0.55, -4.8]}><boxGeometry args={[2.6, 1.1, 1.4]} /><meshStandardMaterial color="#7c2d12" roughness={0.75} emissive="#f97316" emissiveIntensity={0.18} /></mesh>
    <pointLight position={[-4.8, 1.3, -4.8]} color="#fb923c" intensity={2.2} distance={8} />
    <mesh castShadow position={[0, 0.45, -2.2]}><boxGeometry args={[1.35, 0.45, 0.9]} /><meshStandardMaterial color="#64748b" metalness={0.55} roughness={0.4} /></mesh>
    <mesh castShadow position={[4.7, 0.8, -4.9]}><boxGeometry args={[2.8, 1.6, 0.8]} /><meshStandardMaterial color="#3f2511" roughness={0.85} /></mesh>
    {[0, 1, 2].map((i) => <mesh key={i} castShadow position={[3.8 + i * 0.55, 1.75, -4.48]} rotation={[0, 0, -0.7]}><boxGeometry args={[0.08, 0.85, 0.08]} /><meshStandardMaterial color={accent} metalness={0.55} roughness={0.36} emissive={accent} emissiveIntensity={0.2} /></mesh>)}
  </group>
}

function InnProps({ accent }: { accent: string }) {
  return <group>
    {/* fireplace */}
    <mesh castShadow position={[-7, 1.2, -6.8]}><boxGeometry args={[2.4, 2.4, 0.4]} /><meshStandardMaterial color="#1f2937" emissive="#f97316" emissiveIntensity={0.35} /></mesh>
    <pointLight position={[-7, 1.6, -6.4]} color="#fb923c" intensity={2.4} distance={9} />
    {/* beds */}
    {[-3, 0, 3].map((x) => <group key={x} position={[x, 0, -5]}>
      <mesh castShadow position={[0, 0.3, 0]}><boxGeometry args={[1.6, 0.4, 0.9]} /><meshStandardMaterial color="#3f2511" roughness={0.85} /></mesh>
      <mesh castShadow position={[0, 0.55, -0.05]}><boxGeometry args={[1.5, 0.18, 0.8]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.15} roughness={0.7} /></mesh>
      <mesh castShadow position={[-0.6, 0.7, 0.05]}><boxGeometry args={[0.3, 0.18, 0.5]} /><meshStandardMaterial color="#fff7ed" /></mesh>
    </group>)}
    {/* counter */}
    <mesh castShadow position={[6.4, 0.55, -5]}><boxGeometry args={[3.2, 1.1, 1]} /><meshStandardMaterial color="#7c4a1f" roughness={0.8} /></mesh>
  </group>
}

function ApothecaryProps({ accent }: { accent: string }) {
  return <group>
    {/* shelves of vials */}
    {[-6, -3, 3, 6].map((x) => <group key={x} position={[x, 0, -6]}>
      <mesh castShadow position={[0, 1.1, 0]}><boxGeometry args={[1.4, 2.2, 0.5]} /><meshStandardMaterial color="#3f2511" roughness={0.85} /></mesh>
      {[0.5, 1.05, 1.6].map((y, i) => <mesh key={i} castShadow position={[0, y, 0.28]}><boxGeometry args={[1.3, 0.05, 0.05]} /><meshStandardMaterial color="#7c4a1f" /></mesh>)}
      {[0.6, 1.15, 1.7].map((y, i) => [-0.4, 0, 0.4].map((vx) => <mesh key={`${i}-${vx}`} castShadow position={[vx, y, 0.3]}><cylinderGeometry args={[0.07, 0.05, 0.22, 8]} /><meshStandardMaterial color={[`#86efac`, `#a78bfa`, `#22d3ee`, `#fbbf24`, `#f472b6`, `#fb7185`][(i + Math.abs(Math.floor(vx))) % 6]} emissive={accent} emissiveIntensity={0.45} transparent opacity={0.85} /></mesh>))}
    </group>)}
    {/* counter */}
    <mesh castShadow position={[0, 0.55, -2.5]}><boxGeometry args={[5, 1.1, 0.9]} /><meshStandardMaterial color="#7c4a1f" roughness={0.8} /></mesh>
    {/* hanging lantern */}
    <pointLight position={[0, 3.4, 0]} color={accent} intensity={2.2} distance={9} />
  </group>
}

function GuildProps({ accent }: { accent: string }) {
  return <group>
    {/* mission board */}
    <mesh castShadow position={[0, 1.6, -7.6]}><boxGeometry args={[5, 2.2, 0.18]} /><meshStandardMaterial color="#3f2511" roughness={0.78} /></mesh>
    {[[-2, 1.9], [0, 1.9], [2, 1.9], [-2, 0.9], [0, 0.9], [2, 0.9]].map(([x, y], i) => <mesh key={i} position={[x, y, -7.5]}><planeGeometry args={[1.4, 0.85]} /><meshStandardMaterial color="#fff7ed" emissive={accent} emissiveIntensity={0.18} /></mesh>)}
    {/* raid table */}
    <mesh castShadow position={[0, 0.7, 1]}><cylinderGeometry args={[2, 2, 0.18, 24]} /><meshStandardMaterial color="#7c4a1f" roughness={0.85} /></mesh>
    <mesh position={[0, 0.81, 1]}><circleGeometry args={[1.85, 32]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.25} roughness={0.65} transparent opacity={0.7} /></mesh>
    {/* chairs */}
    {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a, i) => <mesh key={i} castShadow position={[Math.cos(a) * 2.6, 0.45, 1 + Math.sin(a) * 2.6]}><boxGeometry args={[0.7, 0.9, 0.7]} /><meshStandardMaterial color="#3f2511" roughness={0.85} /></mesh>)}
  </group>
}

function RemotePlayer({ remote }: { remote: MpRemotePlayer }) {
  const ref = useRef<THREE.Group>(null)
  const target = useMemo(() => new THREE.Vector3(remote.x, remote.y, remote.z), [])
  const targetYaw = useRef(remote.yaw)
  const [pinged, setPinged] = useState(false)
  useEffect(() => { target.set(remote.x, remote.y, remote.z); targetYaw.current = remote.yaw }, [remote.x, remote.y, remote.z, remote.yaw, target])
  useEffect(() => {
    const onPing = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== remote.id) return
      setPinged(true)
      window.setTimeout(() => setPinged(false), 2000)
    }
    window.addEventListener('hermes-playground-ping-remote', onPing)
    return () => window.removeEventListener('hermes-playground-ping-remote', onPing)
  }, [remote.id])
  useFrame(() => {
    if (!ref.current) return
    ref.current.position.lerp(target, 0.18)
    const cur = ref.current.rotation.y
    let dy = targetYaw.current - cur
    while (dy > Math.PI) dy -= Math.PI * 2
    while (dy < -Math.PI) dy += Math.PI * 2
    ref.current.rotation.y = cur + dy * 0.2
  })
  return (
    <group ref={ref} position={[remote.x, remote.y, remote.z]}>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.5, 18]} /><meshBasicMaterial color="black" transparent opacity={0.4} /></mesh>
      <mesh position={[0.13, 0.22, 0]} castShadow><boxGeometry args={[0.14, 0.44, 0.14]} /><meshStandardMaterial color="#1f2a37" roughness={0.6} /></mesh>
      <mesh position={[-0.13, 0.22, 0]} castShadow><boxGeometry args={[0.14, 0.44, 0.14]} /><meshStandardMaterial color="#1f2a37" roughness={0.6} /></mesh>
      <mesh position={[0, 0.7, 0]} castShadow><boxGeometry args={[0.5, 0.55, 0.32]} /><meshStandardMaterial color={remote.avatar?.outfit || remote.color} roughness={0.55} emissive={remote.avatar?.outfit || remote.color} emissiveIntensity={0.12} /></mesh>
      {/* knight cuirass + sigil */}
      <mesh position={[0, 0.78, 0.18]} castShadow><boxGeometry args={[0.46, 0.5, 0.06]} /><meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} emissive={remote.avatar?.outfitAccent || remote.color} emissiveIntensity={0.18} /></mesh>
      <mesh position={[0, 0.8, 0.215]}><cylinderGeometry args={[0.1, 0.1, 0.018, 16]} /><meshStandardMaterial color={remote.avatar?.outfitAccent || remote.color} metalness={0.7} roughness={0.25} emissive={remote.avatar?.outfitAccent || remote.color} emissiveIntensity={0.55} /></mesh>
      <mesh castShadow position={[-0.36, 0.96, 0]} rotation={[0, 0, 0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={remote.avatar?.outfitAccent || '#0e7490'} metalness={0.45} roughness={0.45} /></mesh>
      <mesh castShadow position={[0.36, 0.96, 0]} rotation={[0, 0, -0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={remote.avatar?.outfitAccent || '#0e7490'} metalness={0.45} roughness={0.45} /></mesh>
      {/* tasset */}
      {[-0.16, -0.05, 0.05, 0.16].map((x) => (
        <mesh key={x} castShadow position={[x, 0.42, 0.14]} rotation={[0.04, 0, 0]}><boxGeometry args={[0.09, 0.18, 0.04]} /><meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} emissive={remote.avatar?.outfitAccent || remote.color} emissiveIntensity={0.1} /></mesh>
      ))}
      {/* gauntlets */}
      <mesh position={[0.36, 0.6, 0]} castShadow><cylinderGeometry args={[0.075, 0.07, 0.18, 10]} /><meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} emissive={remote.avatar?.outfitAccent || remote.color} emissiveIntensity={0.12} /></mesh>
      <mesh position={[-0.36, 0.6, 0]} castShadow><cylinderGeometry args={[0.075, 0.07, 0.18, 10]} /><meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} emissive={remote.avatar?.outfitAccent || remote.color} emissiveIntensity={0.12} /></mesh>
      {/* greaves */}
      <mesh position={[0.13, 0.16, 0]} castShadow><boxGeometry args={[0.16, 0.28, 0.18]} /><meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[-0.13, 0.16, 0]} castShadow><boxGeometry args={[0.16, 0.28, 0.18]} /><meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[0, 1.22, 0]} castShadow><sphereGeometry args={[0.22, 16, 16]} /><meshStandardMaterial color={remote.avatar?.skin || '#fde68a'} roughness={0.55} /></mesh>
      <mesh position={[0.085, 1.24, 0.19]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color={remote.avatar?.eyes || '#0b1220'} /></mesh>
      <mesh position={[-0.085, 1.24, 0.19]}><sphereGeometry args={[0.025, 8, 8]} /><meshStandardMaterial color={remote.avatar?.eyes || '#0b1220'} /></mesh>
      <mesh position={[0, 1.34, -0.02]} castShadow><sphereGeometry args={[0.235, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color={remote.avatar?.hair || remote.color} roughness={0.85} /></mesh>
      {remote.avatar?.cape && remote.avatar.cape !== 'transparent' && (
        <mesh castShadow position={[0, 0.78, -0.22]} rotation={[0.18, 0, 0]}><planeGeometry args={[0.7, 0.9]} /><meshStandardMaterial color={remote.avatar.cape} side={THREE.DoubleSide} roughness={0.6} /></mesh>
      )}
      {(!remote.avatar) && (
        <mesh castShadow position={[0, 0.78, -0.22]} rotation={[0.18, 0, 0]}><planeGeometry args={[0.7, 0.9]} /><meshStandardMaterial color={remote.color} side={THREE.DoubleSide} roughness={0.6} /></mesh>
      )}
      <Html position={[0, 1.95, 0]} center distanceFactor={8}>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 8px 2px 2px',background:'rgba(0,0,0,0.78)',color:'white',borderRadius:14,fontSize:11,fontWeight:700,whiteSpace:'nowrap',border:`1px solid ${remote.color}`,boxShadow:`0 0 8px ${remote.color}55`,transform: pinged ? 'scale(1.08)' : 'scale(1)', transition: 'transform 180ms ease, box-shadow 180ms ease'}}>
          {remote.avatar?.portrait && (
            <img src={`/avatars/${remote.avatar.portrait}.png`} alt="" loading="lazy" decoding="async" style={{width:22,height:22,borderRadius:'50%',background:remote.color,objectFit:'cover',border:`1px solid ${remote.color}`}} />
          )}
          <span>{remote.name}</span>
        </div>
      </Html>
      {remote.lastChat && remote.lastChatAt && Date.now() - remote.lastChatAt < 5500 && (
        <Html position={[0, 2.6, 0]} center distanceFactor={8}>
          <SpeechBubble className="hermes-world-bubble" variant="party" accent={remote.color} compact>
            {remote.lastChat}
          </SpeechBubble>
        </Html>
      )}
    </group>
  )
}

/* ── Scene ── */
function Scene({
  worldId,
  onPortal,
  onQuestZone,
  onNpcNearChange,
  botBubbles,
  playerName,
  playerAvatar,
  playerAccent,
  playerCape,
  playerArtifact,
  playerWeapon,
  playerHelmet,
  portalLabel,
  portalLocked,
  monsterHp,
  monsterHpMax,
  monsterDefeated,
  onMonsterAttack,
  playerPos,
  playerYaw,
  remotePlayers,
  objectiveTargetId,
  objectivePulseKey,
}: {
  worldId: PlaygroundWorldId
  onPortal: () => void
  onQuestZone: (id: string) => void
  onNpcNearChange: (npcId: string | null) => void
  botBubbles: Record<string, string>
  playerName: string
  playerAvatar: AvatarConfig
  playerAccent?: string
  playerCape?: string
  playerArtifact?: string | null
  playerWeapon?: AvatarConfig['weapon']
  playerHelmet?: AvatarConfig['helmet']
  portalLabel: string
  portalLocked?: boolean
  monsterHp: number
  monsterHpMax: number
  monsterDefeated: boolean
  onMonsterAttack: () => void
  playerPos: React.MutableRefObject<THREE.Vector3>
  playerYaw: React.MutableRefObject<number>
  remotePlayers: Record<string, MpRemotePlayer>
  objectiveTargetId: string | null
  objectivePulseKey: number
}) {
  const bots = useMemo(() => botsFor(worldId), [worldId])
  const world = WORLDS_3D[worldId]
  const [settings] = useHermesWorldSettings()
  const photosensitiveMode = settings.accessibility.photosensitiveMode
  const visibleRemotePlayers = useMemo(() => Object.values(remotePlayers).filter((r) => r.world === worldId && (r.interior ?? null) === null), [remotePlayers, worldId])
  const moveTarget = useRef<THREE.Vector3 | null>(null)
  const [pingPos, setPingPos] = useState<[number, number, number] | null>(null)
  const [interior, setInterior] = useState<InteriorId | null>(null)
  const [outsideSpawn, setOutsideSpawn] = useState<[number, number, number]>([0, 0, 6])
  const [showObjectiveArrow, setShowObjectiveArrow] = useState(false)
  const pendingNpc = useRef<string | null>(null)

  useEffect(() => {
    if (!objectiveTargetId) {
      setShowObjectiveArrow(false)
      return
    }
    setShowObjectiveArrow(true)
    const id = window.setTimeout(() => setShowObjectiveArrow(false), 5000)
    return () => window.clearTimeout(id)
  }, [objectivePulseKey, objectiveTargetId])

  const isHighlighted = (target: string) => showObjectiveArrow && matchesObjectiveTarget(objectiveTargetId, target)

  const onClickNpc = (id: string, p: [number, number, number]) => {
    // Walk to ~1.6u in front of NPC then auto-open dialog
    const target = new THREE.Vector3(p[0], 0, p[2] + 1.6)
    moveTarget.current = target
    pendingNpc.current = id
    setPingPos([target.x, 0.05, target.z])
    window.setTimeout(() => setPingPos(null), 700)
  }
  const handleNearChange = (id: string | null) => {
    onNpcNearChange(id)
    if (id && pendingNpc.current === id) {
      pendingNpc.current = null
      try { (window as any).__hermesPlaygroundOpenDialog?.(id) } catch {}
    }
  }

  if (interior) {
    return (
      <InteriorScene
        id={interior}
        playerRef={playerPos}
        moveTargetRef={moveTarget}
        onExit={() => {
          moveTarget.current = null
          setInterior(null)
        }}
        onNpcNearChange={onNpcNearChange}
      />
    )
  }

  return (
    <>
      {/* Invisible ground catcher: click anywhere to walk there (RuneScape-style) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        onPointerDown={(e) => {
          e.stopPropagation()
          const x = THREE.MathUtils.clamp(e.point.x, -28, 28)
          const z = THREE.MathUtils.clamp(e.point.z, -22, 22)
          moveTarget.current = new THREE.Vector3(x, 0, z)
          setPingPos([x, 0.05, z])
          window.setTimeout(() => setPingPos(null), 700)
        }}
      >
        <planeGeometry args={[120, 120, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pingPos && !photosensitiveMode && (
        <mesh position={pingPos} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.6, 32]} />
          <meshBasicMaterial color={world.accent} transparent opacity={0.55} />
        </mesh>
      )}
      <color attach="background" args={[world.skyColor]} />
      <fog attach="fog" args={[world.skyColor, world.fogNear, world.fogFar]} />
      <hemisphereLight intensity={0.68} color={world.id === 'forge' ? '#ffd0a3' : '#fff4d6'} groundColor={world.id === 'agora' ? '#3f6b3a' : world.ambient} />
      <ambientLight intensity={0.28} color={world.ambient} />
      <directionalLight
        castShadow
        position={[14, 20, 8]}
        intensity={2.15}
        color={world.id === 'oracle' ? '#ece7ff' : world.id === 'forge' ? '#ffd3aa' : '#fff1cc'}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />

      <Ground world={world} />
      <WorldDecor world={world} />
      <ScatteredScenery worldId={worldId} />
      {/* Ambient atmosphere particles — light-touch for performance */}
      {!photosensitiveMode && (
        <>
          <Sparkles count={36} scale={[64, 10, 64]} size={2.2} speed={0.08} color={world.accent} opacity={0.28} />
          <Sparkles count={12} scale={[34, 5, 34]} size={1} speed={0.12} color={'#ffffff'} opacity={0.14} />
        </>
      )}

      {/* NPCs per world */}
      {worldId === 'training' && (
        <>
          <NPC npcId="athena" position={[-10.5, 0, 7.2]} avatar="athena" name="Athena · Guide" color={NPC_COLORS.athena} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} highlight={isHighlighted('athena')} />
          <NPC npcId="iris" position={[6.2, 0, 0.4]} avatar="iris" name="Iris · Archivist" color={NPC_COLORS.iris} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} highlight={isHighlighted('archive-podium')} />
          <NPC npcId="pan" position={[11.2, 0, -7.5]} avatar="pan" name="Pan · Forge Guide" color={NPC_COLORS.pan} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} highlight={isHighlighted('build-demo')} />
          <NPC npcId="nike" position={[-4.8, 0, -4.8]} avatar="nike" name="Leonidas · Trainer" color={NPC_COLORS.nike} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="shopkeeper" position={[-14.5, 0, -10.2]} avatar="iris" name="Dorian · Quartermaster" color={NPC_COLORS.shopkeeper} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} highlight={isHighlighted('training-blade') || isHighlighted('novice-cloak') || isHighlighted('hermes-sigil')} />
        </>
      )}
      {worldId === 'agora' && (
        <>
          <NPC npcId="athena" position={[-5, 0, 2]} avatar="athena" name="Athena · Sage" color={NPC_COLORS.athena} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="apollo" position={[5, 0, 3]} avatar="apollo" name="Apollo · Bard" color={NPC_COLORS.apollo} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="iris" position={[-3, 0, -5]} avatar="iris" name="Iris · Messenger" color={NPC_COLORS.iris} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="nike" position={[6, 0, -4]} avatar="nike" name="Nike · Champion" color={NPC_COLORS.nike} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="shopkeeper" position={[-3, 0, 9.5]} avatar="iris" name="Dorian · Quartermaster" color={NPC_COLORS.shopkeeper} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="trainer" position={[-12, 0, 5.7]} avatar="nike" name="Leonidas · Trainer" color={NPC_COLORS.trainer} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="banker" position={[15.3, 0, 7.5]} avatar="chronos" name="Midas · Banker" color={NPC_COLORS.banker} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="recruiter" position={[-1.2, 0, -15.5]} avatar="athena" name="Cassia · Recruiter" color={NPC_COLORS.recruiter} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="tavernkeeper" position={[2, 0, 15.5]} avatar="apollo" name="Selene · Tavern" color={NPC_COLORS.tavernkeeper} drift={false} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <DoorTrigger position={[2, 0, 16.4]} label="Tavern" color="#f59e0b" playerRef={playerPos} onEnter={() => { moveTarget.current = null; setOutsideSpawn([2, 0, 16.7]); setInterior('tavern') }} />
          <DoorTrigger position={[15.7, 0, 8.5]} label="Bank" color="#facc15" playerRef={playerPos} onEnter={() => { moveTarget.current = null; setOutsideSpawn([15.7, 0, 8.8]); setInterior('bank') }} />
          <DoorTrigger position={[-12.7, 0, -13.9]} label="Smithy" color="#fb7185" playerRef={playerPos} onEnter={() => { moveTarget.current = null; setOutsideSpawn([-12.7, 0, -13.5]); setInterior('smithy') }} />
          <DoorTrigger position={[-16.4, 0, 8.5]} label="Inn" color="#86efac" playerRef={playerPos} onEnter={() => { moveTarget.current = null; setOutsideSpawn([-16.4, 0, 8.8]); setInterior('inn') }} />
          <DoorTrigger position={[12.7, 0, -13.9]} label="Apothecary" color="#f472b6" playerRef={playerPos} onEnter={() => { moveTarget.current = null; setOutsideSpawn([12.7, 0, -13.5]); setInterior('apothecary') }} />
          <DoorTrigger position={[-1.2, 0, -19.2]} label="Guild Hall" color="#a78bfa" playerRef={playerPos} onEnter={() => { moveTarget.current = null; setOutsideSpawn([-1.2, 0, -18.7]); setInterior('guild') }} />
        </>
      )}
      {worldId === 'forge' && (
        <>
          <NPC npcId="pan" position={[-4, 0, 0]} avatar="pan" name="Pan · Hacker" color={NPC_COLORS.pan} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="chronos" position={[4, 0, 0]} avatar="chronos" name="Chronos · Architect" color={NPC_COLORS.chronos} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
        </>
      )}
      {worldId === 'grove' && (
        <>
          <NPC npcId="pan" position={[-4, 0, 1]} avatar="pan" name="Pan · Druid" color={NPC_COLORS.pan} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="apollo" position={[4, 0, 0]} avatar="apollo" name="Apollo · Songkeeper" color={NPC_COLORS.apollo} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="artemis" position={[0, 0, -5]} avatar="artemis" name="Artemis · Tracker" color={NPC_COLORS.artemis} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
        </>
      )}
      {worldId === 'oracle' && (
        <>
          <NPC npcId="athena" position={[-3, 0, -2]} avatar="athena" name="Athena · Oracle" color={NPC_COLORS.athena} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="chronos" position={[3, 0, -2]} avatar="chronos" name="Chronos · Archivist" color={NPC_COLORS.chronos} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="eros" position={[0, 0, 4]} avatar="eros" name="Eros · Whisperer" color={NPC_COLORS.eros} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
        </>
      )}
      {worldId === 'arena' && (
        <>
          <NPC npcId="nike" position={[-3, 0, 4]} avatar="nike" name="Nike · Champion" color={NPC_COLORS.nike} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="hermes" position={[3, 0, 4]} avatar="hermes" name="Hermes · Referee" color={NPC_COLORS.hermes} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
          <NPC npcId="chronos" position={[0, 0, -5]} avatar="chronos" name="Chronos · Bookmaker" color={NPC_COLORS.chronos} playerRef={playerPos} onNearChange={handleNearChange} onClickNpc={onClickNpc} />
        </>
      )}

      {/* Portal: routes to next unlocked world */}
      <Portal
        position={worldId === 'training' ? [14, 0, -10] : [10, 0, -2]}
        color={world.accent}
        label={portalLabel}
        locked={portalLocked}
        highlight={isHighlighted('forge-gate')}
        onEnter={onPortal}
        playerRef={playerPos}
      />

      {/* Quest zones per world */}
      {worldId === 'training' && (
        <>
          <QuestZone position={[6, 0, 0]} color="#a78bfa" label="Archive Podium" onEnter={() => onQuestZone('archive-podium')} playerRef={playerPos} highlight={isHighlighted('archive-podium')} />
          <QuestZone position={[14, 0, -10]} color="#22d3ee" label="Forge Gate" onEnter={() => onQuestZone('forge-gate')} playerRef={playerPos} highlight={isHighlighted('forge-gate')} />
          <Monster
            position={[-4.8, 0.95, -4]}
            color="#f472b6"
            hp={monsterHp}
            hpMax={monsterHpMax}
            defeated={monsterDefeated}
            onAttack={onMonsterAttack}
          />
        </>
      )}
      {worldId === 'agora' && (
        <QuestZone position={[-8, 0, -3]} color="#facc15" label="Athena's Scroll" onEnter={() => onQuestZone('awakening-agora')} playerRef={playerPos} />
      )}
      {worldId === 'forge' && (
        <QuestZone position={[0, 0, -7]} color="#22d3ee" label="Forge Shard" onEnter={() => onQuestZone('enter-forge')} playerRef={playerPos} />
      )}
      {worldId === 'grove' && (
        <QuestZone position={[-6, 0, -4]} color="#34d399" label="Song of the Grove" onEnter={() => onQuestZone('grove-ritual')} playerRef={playerPos} />
      )}
      {worldId === 'oracle' && (
        <QuestZone position={[5, 0, -3]} color="#a78bfa" label="Oracle's Riddle" onEnter={() => onQuestZone('oracle-riddle')} playerRef={playerPos} />
      )}
      {worldId === 'arena' && (
        <QuestZone position={[0, 0, 0]} color="#fb7185" label="Enter the Duel" onEnter={() => onQuestZone('arena-duel')} playerRef={playerPos} />
      )}

      <Suspense fallback={null}>
        <PlayerAndCamera
          key={worldId}
          positionRef={playerPos}
          spawn={worldId === 'training' ? [-11, 0, 10.5] : outsideSpawn}
          moveTargetRef={moveTarget}
          yawOutRef={playerYaw}
          avatarConfig={playerAvatar}
          displayName={playerName}
          gearAccent={playerAccent}
          gearCape={playerCape}
          gearArtifact={playerArtifact}
          gearWeapon={playerWeapon}
          gearHelmet={playerHelmet}
        />
      </Suspense>

      {/* Summoned Hermes familiar (orbits the player while active) */}
      <SummonedFamiliar playerRef={playerPos} />

      {/* Real remote players */}
      {visibleRemotePlayers.map((remote) => (
          <Suspense key={remote.id} fallback={null}>
            <RemotePlayer remote={remote} />
          </Suspense>
        ))}

      {/* Online bot players */}
      {bots.map((bot) => (
        <Suspense key={bot.id} fallback={null}>
          <BotPlayer bot={bot} bubbleText={botBubbles[bot.id]} />
        </Suspense>
      ))}
    </>
  )
}


function usePerfDebugEnabled() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setEnabled(new URLSearchParams(window.location.search).get('debug') === 'perf')
  }, [])
  return enabled
}

function DevFpsSampler() {
  const sample = useRef({ last: 0, frames: 0, sum: 0, max: 0, heap: 0 })
  useFrame(({ clock }, delta) => {
    if (typeof import.meta !== 'undefined' && !(import.meta as any).env?.DEV) return
    const now = clock.elapsedTime
    const ms = delta * 1000
    const stats = sample.current
    stats.frames += 1
    stats.sum += ms
    stats.max = Math.max(stats.max, ms)
    if (typeof performance !== 'undefined' && 'memory' in performance) stats.heap = ((performance as any).memory?.usedJSHeapSize || 0) / 1048576
    if (now - stats.last < 10) return
    const avgFrame = stats.sum / Math.max(1, stats.frames)
    console.table([{ scope: 'HermesWorld playground', avgFps: Number((1000 / Math.max(1, avgFrame)).toFixed(1)), avgFrameMs: Number(avgFrame.toFixed(2)), p95FrameMsApprox: Number(stats.max.toFixed(2)), jsHeapMb: stats.heap ? Number(stats.heap.toFixed(1)) : 'n/a', samples: stats.frames }])
    sample.current = { last: now, frames: 0, sum: 0, max: 0, heap: stats.heap }
  })
  return null
}

function PerfDebugOverlay() {
  const enabled = usePerfDebugEnabled()
  const { gl } = useThree()
  const sample = useRef({ last: 0, frames: 0, sum: 0, max: 0 })
  const [stats, setStats] = useState({ fps: 0, frameMs: 0, maxFrameMs: 0, calls: 0, triangles: 0, heap: 'n/a' as string | number })

  useFrame(({ clock }, delta) => {
    if (!enabled) return
    const now = clock.elapsedTime
    const ms = delta * 1000
    const current = sample.current
    current.frames += 1
    current.sum += ms
    current.max = Math.max(current.max, ms)
    if (now - current.last < 0.5) return
    const frameMs = current.sum / Math.max(1, current.frames)
    const heap = typeof performance !== 'undefined' && 'memory' in performance
      ? Number((((performance as any).memory?.usedJSHeapSize || 0) / 1048576).toFixed(1))
      : 'n/a'
    setStats({
      fps: Number((1000 / Math.max(1, frameMs)).toFixed(1)),
      frameMs: Number(frameMs.toFixed(2)),
      maxFrameMs: Number(current.max.toFixed(2)),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      heap,
    })
    sample.current = { last: now, frames: 0, sum: 0, max: 0 }
  })

  if (!enabled) return null
  return (
    <Html fullscreen prepend>
      <div style={{ position: 'fixed', left: 12, top: 12, zIndex: 1000, width: 190, border: '1px solid rgba(94,234,212,.35)', borderRadius: 14, background: 'rgba(2,8,13,.78)', color: '#dffcff', padding: '10px 12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, lineHeight: 1.55, pointerEvents: 'none', boxShadow: '0 14px 40px rgba(0,0,0,.35)', backdropFilter: 'blur(10px)' }}>
        <div style={{ color: '#facc15', fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>Perf debug</div>
        <div>FPS: {stats.fps}</div>
        <div>Frame: {stats.frameMs}ms</div>
        <div>Max: {stats.maxFrameMs}ms</div>
        <div>Draw calls: {stats.calls}</div>
        <div>Triangles: {stats.triangles}</div>
        <div>Heap: {stats.heap} MB</div>
      </div>
    </Html>
  )
}

/* ── Public component ── */
export function PlaygroundWorld3D({
  worldId,
  onPortal,
  onQuestZone,
  onNpcNearChange,
  botBubbles,
  playerName,
  playerAvatar,
  playerAccent,
  playerCape,
  playerArtifact,
  playerWeapon,
  playerHelmet,
  portalLabel,
  portalLocked,
  monsterHp,
  monsterHpMax,
  monsterDefeated,
  onMonsterAttack,
  multiplayerName,
  onIncomingChat,
  onRemotePlayersChange,
  objectiveTargetId,
  objectivePulseKey,
}: {
  worldId: PlaygroundWorldId
  onPortal: () => void
  onQuestZone: (id: string) => void
  onNpcNearChange: (npcId: string | null) => void
  botBubbles: Record<string, string>
  playerName: string
  playerAvatar: AvatarConfig
  playerAccent?: string
  playerCape?: string
  playerArtifact?: string | null
  playerWeapon?: AvatarConfig['weapon']
  playerHelmet?: AvatarConfig['helmet']
  portalLabel: string
  portalLocked?: boolean
  monsterHp: number
  monsterHpMax: number
  monsterDefeated: boolean
  onMonsterAttack: () => void
  multiplayerName?: string
  onIncomingChat?: (msg: IncomingChat) => void
  onRemotePlayersChange?: (players: Record<string, MpRemotePlayer>) => void
  objectiveTargetId?: string | null
  objectivePulseKey?: number
}) {
  const playerPos = useRef(new THREE.Vector3(0, 0, 6))
  const playerYaw = useRef(0)
  const [settings] = useHermesWorldSettings()
  const photosensitiveMode = settings.accessibility.photosensitiveMode
  const fallbackBackground = ZONE_FALLBACK_BACKGROUNDS[worldId]
  const positionForMp = useRef<{ x: number; y: number; z: number } | null>({ x: 0, y: 0, z: 6 })
  // Sync simple position object for multiplayer hook (it doesn't use THREE).
  // Also expose to window so the HUD objective arrow can compute heading.
  useEffect(() => {
    // Sample player position at presence cadence (~5Hz). The hook
    // skip-sends when delta < epsilon, so this is cheap.
    const isMobile = window.matchMedia?.('(pointer: coarse), (max-width: 760px)').matches ?? false
    const id = window.setInterval(() => {
      const p = { x: playerPos.current.x, y: playerPos.current.y, z: playerPos.current.z }
      positionForMp.current = p
      ;(window as any).__hermesPlaygroundPlayerPos = p
    }, isMobile ? Math.ceil(1000 / 30) : Math.ceil(1000 / 60))
    return () => window.clearInterval(id)
  }, [])
  const { remotePlayers, online, transport, serverCount, sendChat, myName, myColor, selfId } = usePlaygroundMultiplayer({
    world: worldId,
    interior: null,
    positionRef: positionForMp,
    yawRef: playerYaw,
    name: multiplayerName,
    onChat: onIncomingChat,
  })
  // Expose sendChat + multiplayer info globally so HUD/chat panel can read it.
  useEffect(() => {
    ;(window as any).__hermesPlaygroundSendChat = (text: string) => sendChat(text)
    ;(window as any).__hermesPlaygroundMpInfo = () => ({
      online,
      transport,
      myName,
      myColor,
      selfId,
      remoteCount: Object.keys(remotePlayers).length,
      serverCount,
    })
    // Push live count for the HUD chip without polling /stats.
    if (serverCount) {
      ;(window as any).__hermesPlaygroundLiveCount = serverCount
      window.dispatchEvent(new CustomEvent('hermes-playground-count', { detail: serverCount }))
    }
    ;(window as any).__hermesPlaygroundLiveTransport = transport
    window.dispatchEvent(new CustomEvent('hermes-playground-transport', { detail: transport }))
    return () => {
      try { delete (window as any).__hermesPlaygroundSendChat } catch {}
      try { delete (window as any).__hermesPlaygroundMpInfo } catch {}
    }
  }, [sendChat, online, transport, myName, myColor, selfId, remotePlayers, serverCount])

  const remotePublishRef = useRef<{ sig: string; ts: number; timer: number | null }>({ sig: '', ts: 0, timer: null })
  useEffect(() => {
    if (!onRemotePlayersChange) return
    const sig = Object.values(remotePlayers).map((player) => `${player.id}:${player.world}:${player.x.toFixed(1)}:${player.z.toFixed(1)}:${player.ts}:${player.lastChatAt ?? 0}`).sort().join('|')
    if (sig === remotePublishRef.current.sig) return
    const isMobile = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse), (max-width: 760px)').matches
    const minDelay = isMobile ? Math.ceil(1000 / 30) : Math.ceil(1000 / 60)
    const elapsed = Date.now() - remotePublishRef.current.ts
    const publish = () => {
      remotePublishRef.current = { sig, ts: Date.now(), timer: null }
      onRemotePlayersChange(remotePlayers)
    }
    if (elapsed >= minDelay) {
      publish()
      return
    }
    if (remotePublishRef.current.timer != null) window.clearTimeout(remotePublishRef.current.timer)
    remotePublishRef.current.timer = window.setTimeout(publish, minDelay - elapsed)
    return () => {
      if (remotePublishRef.current.timer != null) window.clearTimeout(remotePublishRef.current.timer)
      remotePublishRef.current.timer = null
    }
  }, [onRemotePlayersChange, remotePlayers])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: fallbackBackground
          ? `linear-gradient(180deg, rgba(5,11,18,.22), rgba(5,11,18,.6)), url(${fallbackBackground}) center / cover no-repeat, #0b1720`
          : '#0b1720',
      }}
    >
      {fallbackBackground ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 45%, transparent 0%, rgba(5,11,18,.34) 68%, rgba(5,11,18,.78) 100%)',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <style>{`
        @keyframes hermes-target-arrow {
          0%, 100% { transform: translateY(0); opacity: 0.78; }
          50% { transform: translateY(4px); opacity: 0.9; }
        }
        .hermesworld-photosensitive .hermes-target-flash { animation: none !important; opacity: 0.82 !important; }
      `}</style>
      <Canvas
        shadows
        camera={{ position: [10, 12, 10], fov: 45 }}
        // Adaptive DPR: matches device pixel ratio up to 1.5 for crispness on retina,
        // drops to 1 on lower-end devices to keep frame times under 16ms.
        dpr={[1, Math.min(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1, 2)]}
        // Render on demand when no animation needed reduces CPU when idle on title screen.
        // Game loop still runs because useFrame components subscribe.
        frameloop="always"
        performance={{ min: 0.5 }}
        style={{ width: '100%', height: '100%' }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
          stencil: false,
          depth: true,
        }}
      >
        <Suspense fallback={null}>
          <DevFpsSampler />
          <PerfDebugOverlay />
          <EffectComposer enableNormalPass={false}>
            <Bloom mipmapBlur intensity={photosensitiveMode ? 0.18 : 0.78} luminanceThreshold={0.72} luminanceSmoothing={0.35} radius={0.85} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <Vignette eskil={false} offset={0.18} darkness={0.55} />
          </EffectComposer>
          <Scene
            worldId={worldId}
            onPortal={onPortal}
            onQuestZone={onQuestZone}
            onNpcNearChange={onNpcNearChange}
            botBubbles={botBubbles}
            playerName={playerName}
            playerAvatar={playerAvatar}
            playerAccent={playerAccent}
            playerCape={playerCape}
            playerArtifact={playerArtifact}
            playerWeapon={playerWeapon}
            playerHelmet={playerHelmet}
            portalLabel={portalLabel}
            portalLocked={portalLocked}
            monsterHp={monsterHp}
            monsterHpMax={monsterHpMax}
            monsterDefeated={monsterDefeated}
            onMonsterAttack={onMonsterAttack}
            playerPos={playerPos}
            playerYaw={playerYaw}
            remotePlayers={remotePlayers}
            objectiveTargetId={objectiveTargetId ?? null}
            objectivePulseKey={objectivePulseKey ?? 0}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
