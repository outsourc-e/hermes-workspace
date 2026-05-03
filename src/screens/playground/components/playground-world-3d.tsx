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

type DecorType = 'classical' | 'tech' | 'forest' | 'temple' | 'arena'

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
  agora: {
    id: 'agora',
    name: 'The Agora',
    accent: '#d9b35f',
    groundColor: '#5a8a4f',
    skyColor: '#cfe7f0',
    ambient: '#a8c8d8',
    pillarColor: '#f3dcb0',
    pillarType: 'classical',
    fogNear: 22,
    fogFar: 70,
  },
  forge: {
    id: 'forge',
    name: 'The Forge',
    accent: '#22d3ee',
    groundColor: '#181e2e',
    skyColor: '#060712',
    ambient: '#1a2540',
    pillarColor: '#2dd4bf',
    pillarType: 'tech',
    fogNear: 14,
    fogFar: 48,
  },
  grove: {
    id: 'grove',
    name: 'The Grove',
    accent: '#34d399',
    groundColor: '#1a3a25',
    skyColor: '#06150f',
    ambient: '#1a4030',
    pillarColor: '#86efac',
    pillarType: 'forest',
    fogNear: 16,
    fogFar: 50,
  },
  oracle: {
    id: 'oracle',
    name: 'Oracle Temple',
    accent: '#a78bfa',
    groundColor: '#231b3a',
    skyColor: '#080714',
    ambient: '#251c40',
    pillarColor: '#c4b5fd',
    pillarType: 'temple',
    fogNear: 16,
    fogFar: 50,
  },
  arena: {
    id: 'arena',
    name: 'Benchmark Arena',
    accent: '#fb7185',
    groundColor: '#3a1820',
    skyColor: '#16070a',
    ambient: '#3a1822',
    pillarColor: '#fda4af',
    pillarType: 'arena',
    fogNear: 14,
    fogFar: 42,
  },
}

/* ── Ground ── */
function Ground({ world }: { world: WorldDef }) {
  const isAgora = world.id === 'agora'
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
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[3.5, 4, 64]} />
        <meshStandardMaterial color={world.accent} emissive={world.accent} emissiveIntensity={0.4} />
      </mesh>
    </>
  )
}

function TechPillars({ world }: { world: WorldDef }) {
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
    </>
  )
}

/* ── Temple decor (Oracle) ── */
function TempleDecor({ world }: { world: WorldDef }) {
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
    </>
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
    </>
  )
}

/* ── Decor router ── */
function WorldDecor({ world }: { world: WorldDef }) {
  switch (world.pillarType) {
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
  return (
    <group>
      {/* shoulder silhouette */}
      {(isTrainer || isRecruiter || isBanker) && (
        <>
          <mesh castShadow position={[-0.36, 0.98, 0]} rotation={[0, 0, 0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={isTrainer ? '#94a3b8' : color} metalness={isTrainer ? 0.6 : 0.15} roughness={0.42} emissive={color} emissiveIntensity={0.12} /></mesh>
          <mesh castShadow position={[0.36, 0.98, 0]} rotation={[0, 0, -0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={isTrainer ? '#94a3b8' : color} metalness={isTrainer ? 0.6 : 0.15} roughness={0.42} emissive={color} emissiveIntensity={0.12} /></mesh>
        </>
      )}
      {/* cape/back panel, visible in orbit and screenshots */}
      {(isRecruiter || isBanker || isTavern) && (
        <mesh castShadow position={[0, 0.78, -0.2]} rotation={[0.18, 0, 0]}>
          <planeGeometry args={[0.72, 0.9]} />
          <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.6} emissive={color} emissiveIntensity={0.08} />
        </mesh>
      )}
      {/* hats/crowns so roles read at distance */}
      {isBanker && <mesh castShadow position={[0, 1.48, 0]}><cylinderGeometry args={[0.2, 0.24, 0.18, 12]} /><meshStandardMaterial color="#fbbf24" metalness={0.45} roughness={0.38} emissive="#fbbf24" emissiveIntensity={0.25} /></mesh>}
      {isShop && <mesh castShadow position={[0, 1.45, 0]} rotation={[0, 0, 0.2]}><coneGeometry args={[0.28, 0.28, 8]} /><meshStandardMaterial color="#38bdf8" roughness={0.55} emissive="#38bdf8" emissiveIntensity={0.1} /></mesh>}
      {isTavern && <mesh castShadow position={[0, 1.44, 0]}><torusGeometry args={[0.19, 0.025, 8, 24]} /><meshStandardMaterial color="#f59e0b" roughness={0.5} emissive="#f59e0b" emissiveIntensity={0.2} /></mesh>}
      {/* weapons/tools */}
      {isTrainer && <mesh castShadow position={[0.52, 0.82, 0.08]} rotation={[0.1, 0, -0.75]}><boxGeometry args={[0.05, 0.9, 0.05]} /><meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.35} /></mesh>}
      {isShop && <mesh castShadow position={[-0.48, 0.72, 0.08]} rotation={[0, 0, 0.25]}><boxGeometry args={[0.16, 0.38, 0.08]} /><meshStandardMaterial color="#a16207" roughness={0.8} /></mesh>}
    </group>
  )
}

/* ── NPC billboard with proximity sensing ── */
function NPC({
  position,
  avatar,
  name,
  color = '#a78bfa',
  drift = true,
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
  npcId?: string
  playerRef?: React.MutableRefObject<THREE.Vector3>
  onNearChange?: (id: string | null) => void
  onClickNpc?: (npcId: string, worldPos: [number, number, number]) => void
}) {
  const ref = useRef<THREE.Group>(null)
  const base = useMemo(() => new THREE.Vector3(...position), [position])
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])

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
      {/* nameplate w/ portrait chip — replaces floating PNG */}
      <Html position={[0, 1.95, 0]} center distanceFactor={8}>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 8px 2px 2px',background:'rgba(0,0,0,0.78)',color:'white',borderRadius:14,fontSize:11,fontWeight:600,whiteSpace:'nowrap',border:`1px solid ${color}`,boxShadow:`0 0 8px ${color}55`}}>
          <img src={`/avatars/${avatar}.png`} alt="" style={{width:22,height:22,borderRadius:'50%',background:color,objectFit:'cover',border:`1px solid ${color}`}} />
          <span>{name}</span>
        </div>
      </Html>
      {isNear && (
        <Html position={[0, 2.55, 0]} center distanceFactor={8}>
          <div style={{padding:'4px 10px',background:color,color:'#000',borderRadius:6,fontSize:11,fontWeight:800,whiteSpace:'nowrap',boxShadow:`0 0 12px ${color}`,letterSpacing:'0.1em',textTransform:'uppercase'}}>Press E to talk</div>
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
  onEnter,
  playerRef,
}: {
  position: [number, number, number]
  color: string
  label: string
  onEnter: () => void
  playerRef: React.MutableRefObject<THREE.Vector3>
}) {
  const ringRef = useRef<THREE.Mesh>(null)
  const triggered = useRef(false)
  const center = useMemo(() => new THREE.Vector3(...position), [position])
  useFrame((_, dt) => {
    if (ringRef.current) ringRef.current.rotation.y += dt * 0.6
    const dist = playerRef.current.distanceTo(center)
    if (dist < 1.5 && !triggered.current) {
      triggered.current = true
      onEnter()
      window.setTimeout(() => { triggered.current = false }, 1200)
    }
  })
  return (
    <group position={position}>
      <mesh ref={ringRef} position={[0, 1.2, 0]}>
        <torusGeometry args={[1.1, 0.08, 16, 64]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
      </mesh>
      <pointLight position={[0, 1.2, 0]} color={color} intensity={4} distance={6} />
      <Html position={[0, 2.7, 0]} center distanceFactor={8}>
        <div style={{padding:'2px 8px',background:'rgba(0,0,0,0.7)',color,borderRadius:4,fontSize:13,whiteSpace:'nowrap',fontWeight:600}}>{label}</div>
      </Html>
    </group>
  )
}

/* ── Quest trigger zone ── */
function QuestZone({
  position,
  color,
  label,
  onEnter,
  playerRef,
}: {
  position: [number, number, number]
  color: string
  label: string
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
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift',' ','[',']'].includes(k)) {
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
  spawn = [0, 0, 6],
  positionRef,
  moveTargetRef,
  bounds = { x: 28, z: 22 },
  yawOutRef,
}: {
  avatarId?: string
  spawn?: [number, number, number]
  positionRef: React.MutableRefObject<THREE.Vector3>
  moveTargetRef?: React.MutableRefObject<THREE.Vector3 | null>
  bounds?: { x: number; z: number }
  yawOutRef?: React.MutableRefObject<number>
}) {
  const cfg = useAvatarConfig()
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
    const speed = (k.has('shift') ? 9 : 5) * delta

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
      groupRef.current.position.y = isMoving.current ? Math.abs(Math.sin(bobT.current)) * 0.08 : 0
      groupRef.current.rotation.y = yaw.current
    }
    if (yawOutRef) yawOutRef.current = yaw.current
    // Orbital camera around player
    const r = camDistance.current
    const px = positionRef.current.x
    const pz = positionRef.current.z
    const ox = Math.sin(camYaw.current) * Math.sin(camPitch.current) * r
    const oz = Math.cos(camYaw.current) * Math.sin(camPitch.current) * r
    const oy = Math.cos(camPitch.current) * r + 1.5
    camIdeal.set(px + ox, oy, pz + oz)
    camera.position.lerp(camIdeal, 0.12)
    camLook.set(px, 0.6, pz)
    camera.lookAt(camLook)
  })

  // Walk cycle phase oscillator (limbs swing 0..1 sine)
  const swing = Math.sin(bobT.current) // alternates -1..1
  return (
    <group ref={groupRef} position={spawn}>
      {/* shadow plate */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="black" transparent opacity={0.4} />
      </mesh>

      {/* Legs */}
      <mesh
        position={[0.13, 0.22, 0]}
        rotation={[isMoving.current ? swing * 0.6 : 0, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.16, 0.44, 0.16]} />
        <meshStandardMaterial color="#0f3a3a" roughness={0.6} />
      </mesh>
      <mesh
        position={[-0.13, 0.22, 0]}
        rotation={[isMoving.current ? -swing * 0.6 : 0, 0, 0]}
        castShadow
      >
        <boxGeometry args={[0.16, 0.44, 0.16]} />
        <meshStandardMaterial color="#0f3a3a" roughness={0.6} />
      </mesh>

      {/* Feet */}
      <mesh
        position={[
          0.13,
          0.04,
          isMoving.current ? swing * 0.18 : 0,
        ]}
        castShadow
      >
        <boxGeometry args={[0.2, 0.08, 0.32]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      <mesh
        position={[
          -0.13,
          0.04,
          isMoving.current ? -swing * 0.18 : 0,
        ]}
        castShadow
      >
        <boxGeometry args={[0.2, 0.08, 0.32]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.5, 0.55, 0.34]} />
        <meshStandardMaterial color={cfg.outfit} roughness={0.5} emissive={cfg.outfit} emissiveIntensity={0.08} />
      </mesh>

      {/* Belt accent */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.52, 0.06, 0.36]} />
        <meshStandardMaterial color={cfg.outfitAccent} roughness={0.4} metalness={0.4} />
      </mesh>

      {/* Arms */}
      <mesh
        position={[0.34, 0.7, 0]}
        rotation={[isMoving.current ? -swing * 0.7 : 0, 0, 0.05]}
        castShadow
      >
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color={cfg.outfit} roughness={0.5} />
      </mesh>
      <mesh
        position={[-0.34, 0.7, 0]}
        rotation={[isMoving.current ? swing * 0.7 : 0, 0, -0.05]}
        castShadow
      >
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color={cfg.outfit} roughness={0.5} />
      </mesh>

      {/* Hands */}
      <mesh position={[0.34, 0.43, isMoving.current ? -swing * 0.18 : 0]} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.5} />
      </mesh>
      <mesh position={[-0.34, 0.43, isMoving.current ? swing * 0.18 : 0]} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.5} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.1, 12]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.6} />
      </mesh>

      {/* Head sphere base */}
      <mesh position={[0, 1.22, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={cfg.skin} roughness={0.55} />
      </mesh>

      {/* Eyes */}
      <mesh position={[0.085, 1.24, 0.19]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color={cfg.eyes} />
      </mesh>
      <mesh position={[-0.085, 1.24, 0.19]}>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color={cfg.eyes} />
      </mesh>
      {/* Hair styles */}
      {cfg.hairStyle === 'short' && (
        <mesh position={[0, 1.34, -0.02]} castShadow>
          <sphereGeometry args={[0.235, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      )}
      {cfg.hairStyle === 'cap' && (
        <mesh position={[0, 1.36, -0.02]} castShadow>
          <sphereGeometry args={[0.245, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      )}
      {cfg.hairStyle === 'long' && (<>
        <mesh position={[0, 1.34, -0.02]} castShadow>
          <sphereGeometry args={[0.245, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.0, -0.18]} castShadow>
          <boxGeometry args={[0.4, 0.45, 0.08]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      </>)}
      {cfg.hairStyle === 'mohawk' && (
        <mesh position={[0, 1.42, 0]} castShadow>
          <boxGeometry args={[0.07, 0.18, 0.4]} />
          <meshStandardMaterial color={cfg.hair} roughness={0.85} />
        </mesh>
      )}
      {cfg.helmet === 'circlet' && (
        <mesh position={[0, 1.28, 0]} castShadow>
          <torusGeometry args={[0.225, 0.025, 8, 24]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
        </mesh>
      )}
      {cfg.helmet === 'crown' && (<>
        <mesh position={[0, 1.28, 0]} castShadow>
          <torusGeometry args={[0.225, 0.025, 8, 24]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
        </mesh>
        {[0, Math.PI / 3, -Math.PI / 3, Math.PI * 2 / 3, -Math.PI * 2 / 3, Math.PI].map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * 0.225, 1.34, Math.sin(a) * 0.225]} castShadow>
            <coneGeometry args={[0.025, 0.08, 4]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
          </mesh>
        ))}
      </>)}
      {cfg.helmet === 'cap' && (
        <mesh position={[0, 1.4, -0.02]} castShadow>
          <sphereGeometry args={[0.24, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshStandardMaterial color={cfg.outfit} roughness={0.55} emissive={cfg.outfit} emissiveIntensity={0.15} />
        </mesh>
      )}
      {cfg.helmet === 'winged' && (<>
        <mesh position={[0, 1.28, 0]} castShadow>
          <torusGeometry args={[0.225, 0.025, 8, 24]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.25} emissive="#facc15" emissiveIntensity={0.4} />
        </mesh>
        <mesh castShadow position={[0.18, 1.32, -0.02]} rotation={[0, 0, 0.6]}>
          <coneGeometry args={[0.06, 0.18, 5]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.35} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[-0.18, 1.32, -0.02]} rotation={[0, 0, -0.6]}>
          <coneGeometry args={[0.06, 0.18, 5]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fde68a" emissiveIntensity={0.35} roughness={0.5} />
        </mesh>
      </>)}
      {/* Shoulder pads */}
      <mesh castShadow position={[-0.36, 0.96, 0]} rotation={[0, 0, 0.4]}>
        <boxGeometry args={[0.26, 0.14, 0.22]} />
        <meshStandardMaterial color={cfg.outfitAccent} metalness={0.55} roughness={0.4} emissive={cfg.outfitAccent} emissiveIntensity={0.18} />
      </mesh>
      <mesh castShadow position={[0.36, 0.96, 0]} rotation={[0, 0, -0.4]}>
        <boxGeometry args={[0.26, 0.14, 0.22]} />
        <meshStandardMaterial color={cfg.outfitAccent} metalness={0.55} roughness={0.4} emissive={cfg.outfitAccent} emissiveIntensity={0.18} />
      </mesh>
      {/* Cape (optional) */}
      {cfg.cape !== 'transparent' && (
        <mesh castShadow position={[0, 0.78, -0.22]} rotation={[0.18, 0, 0]}>
          <planeGeometry args={[0.78, 1]} />
          <meshStandardMaterial color={cfg.cape} side={THREE.DoubleSide} roughness={0.55} emissive={cfg.cape} emissiveIntensity={0.12} />
        </mesh>
      )}
      {/* Weapon */}
      {cfg.weapon === 'sword' && (<>
        <mesh castShadow position={[-0.32, 0.5, 0.05]} rotation={[0.05, 0, 1.45]}>
          <boxGeometry args={[0.04, 0.85, 0.04]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.85} roughness={0.2} />
        </mesh>
        <mesh castShadow position={[-0.32, 0.13, 0.05]} rotation={[0, 0, 1.45]}>
          <boxGeometry args={[0.16, 0.05, 0.07]} />
          <meshStandardMaterial color="#7c2d12" roughness={0.85} />
        </mesh>
      </>)}
      {cfg.weapon === 'staff' && (
        <mesh castShadow position={[0.4, 0.85, 0.05]} rotation={[0, 0, -0.1]}>
          <cylinderGeometry args={[0.04, 0.04, 1.7, 8]} />
          <meshStandardMaterial color="#7c4a1f" roughness={0.7} emissive={cfg.outfitAccent} emissiveIntensity={0.18} />
        </mesh>
      )}
      {cfg.weapon === 'bow' && (
        <mesh castShadow position={[0.45, 0.7, 0.05]} rotation={[0, 0, -0.4]}>
          <torusGeometry args={[0.45, 0.025, 8, 18, Math.PI]} />
          <meshStandardMaterial color="#7c4a1f" roughness={0.7} />
        </mesh>
      )}

      {/* nameplate w/ portrait chip — "You" */}
      <Html position={[0, 1.95, 0]} center distanceFactor={8}>
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 8px 2px 2px',background:'rgba(0,0,0,0.78)',color:'#a7f3d0',borderRadius:14,fontSize:11,fontWeight:700,whiteSpace:'nowrap',border:'1px solid #34d39955',boxShadow:'0 0 8px #34d39933'}}>
          <img src={`/avatars/${portraitId}.png`} alt="" style={{width:22,height:22,borderRadius:'50%',background:cfg.outfitAccent,objectFit:'cover',border:'1px solid #34d399'}} />
          <span>You</span>
        </div>
      </Html>
    </group>
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
          <img src={`/avatars/${bot.avatar}.png`} alt="" style={{width:22,height:22,borderRadius:'50%',background:bot.color,objectFit:'cover',border:`1px solid ${bot.color}`}} />
          <span>{bot.name}</span>
        </div>
      </Html>
      {/* chat bubble */}
      {bubbleText && (
        <Html position={[0, 2.6, 0]} center distanceFactor={8}>
          <div style={{padding:'4px 10px',background:'rgba(0,0,0,0.85)',color:'white',borderRadius:8,fontSize:12,maxWidth:200,textAlign:'center',border:`1px solid ${bot.color}`}}>{bubbleText}</div>
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
  const [pingPos, setPingPos] = useState<[number, number, number] | null>(null)
  return (
    <>
      <color attach="background" args={['#08070b']} />
      <fog attach="fog" args={['#08070b', 18, 38]} />
      <hemisphereLight intensity={0.35} color={'#fff1d0'} groundColor={'#251609'} />
      <ambientLight intensity={0.42} color={'#f4c982'} />
      <directionalLight castShadow position={[6, 10, 8]} intensity={1.1} color={'#ffe4b5'} shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 3, -2]} color={info.accent} intensity={2.1} distance={16} />

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
      {pingPos && <mesh position={pingPos} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.6, 32]} /><meshBasicMaterial color={info.accent} transparent opacity={0.85} /></mesh>}

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
    if (dist < 1.05 && !triggered.current) {
      triggered.current = true
      onExit()
      window.setTimeout(() => { triggered.current = false }, 1200)
    }
  })
  return (
    <group position={[0, 0, 6.2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[0.7, 0.92, 32]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} transparent opacity={0.78} />
      </mesh>
      <Html position={[0, 1.25, 0]} center distanceFactor={8}><div style={{padding:'3px 8px',background:'rgba(0,0,0,0.75)',color:accent,borderRadius:6,fontSize:11,fontWeight:800,whiteSpace:'nowrap'}}>Exit to Agora</div></Html>
    </group>
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
  useEffect(() => { target.set(remote.x, remote.y, remote.z); targetYaw.current = remote.yaw }, [remote.x, remote.y, remote.z, remote.yaw, target])
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
      <mesh castShadow position={[-0.36, 0.96, 0]} rotation={[0, 0, 0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={remote.avatar?.outfitAccent || '#0e7490'} metalness={0.45} roughness={0.45} /></mesh>
      <mesh castShadow position={[0.36, 0.96, 0]} rotation={[0, 0, -0.4]}><boxGeometry args={[0.24, 0.12, 0.2]} /><meshStandardMaterial color={remote.avatar?.outfitAccent || '#0e7490'} metalness={0.45} roughness={0.45} /></mesh>
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
        <div style={{display:'flex',alignItems:'center',gap:6,padding:'2px 8px 2px 2px',background:'rgba(0,0,0,0.78)',color:'white',borderRadius:14,fontSize:11,fontWeight:700,whiteSpace:'nowrap',border:`1px solid ${remote.color}`,boxShadow:`0 0 8px ${remote.color}55`}}>
          {remote.avatar?.portrait && (
            <img src={`/avatars/${remote.avatar.portrait}.png`} alt="" style={{width:22,height:22,borderRadius:'50%',background:remote.color,objectFit:'cover',border:`1px solid ${remote.color}`}} />
          )}
          <span>{remote.name}</span>
        </div>
      </Html>
      {remote.lastChat && remote.lastChatAt && Date.now() - remote.lastChatAt < 5500 && (
        <Html position={[0, 2.6, 0]} center distanceFactor={8}>
          <div style={{padding:'4px 10px',background:'rgba(0,0,0,0.85)',color:'white',borderRadius:8,fontSize:12,maxWidth:200,textAlign:'center',border:`1px solid ${remote.color}`}}>{remote.lastChat}</div>
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
  playerPos,
  playerYaw,
  remotePlayers,
}: {
  worldId: PlaygroundWorldId
  onPortal: () => void
  onQuestZone: (id: string) => void
  onNpcNearChange: (npcId: string | null) => void
  botBubbles: Record<string, string>
  playerPos: React.MutableRefObject<THREE.Vector3>
  playerYaw: React.MutableRefObject<number>
  remotePlayers: Record<string, MpRemotePlayer>
}) {
  const bots = botsFor(worldId)
  const world = WORLDS_3D[worldId]
  const moveTarget = useRef<THREE.Vector3 | null>(null)
  const [pingPos, setPingPos] = useState<[number, number, number] | null>(null)
  const [interior, setInterior] = useState<InteriorId | null>(null)
  const [outsideSpawn, setOutsideSpawn] = useState<[number, number, number]>([0, 0, 6])
  const pendingNpc = useRef<string | null>(null)

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
      {pingPos && (
        <mesh position={pingPos} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.6, 32]} />
          <meshBasicMaterial color={world.accent} transparent opacity={0.85} />
        </mesh>
      )}
      <color attach="background" args={[world.skyColor]} />
      <fog attach="fog" args={[world.skyColor, world.fogNear, world.fogFar]} />
      <hemisphereLight intensity={0.55} color={'#fff4d6'} groundColor={world.id === 'agora' ? '#3f6b3a' : world.ambient} />
      <ambientLight intensity={0.35} color={world.ambient} />
      <directionalLight
        castShadow
        position={[14, 18, 8]}
        intensity={1.8}
        color={'#fff1cc'}
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
      <Sparkles count={50} scale={[60, 8, 60]} size={2.5} speed={0.22} color={world.accent} opacity={0.55} />
      <Sparkles count={20} scale={[30, 4, 30]} size={1.2} speed={0.5} color={'#ffffff'} opacity={0.3} />

      {/* NPCs per world */}
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
        position={[10, 0, -2]}
        color={world.accent}
        label="✨ Portal"
        onEnter={onPortal}
        playerRef={playerPos}
      />

      {/* Quest zones per world */}
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
        <PlayerAndCamera positionRef={playerPos} spawn={outsideSpawn} moveTargetRef={moveTarget} yawOutRef={playerYaw} />
      </Suspense>

      {/* Real remote players */}
      {Object.values(remotePlayers)
        .filter((r) => r.world === worldId && (r.interior ?? null) === null)
        .map((remote) => (
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

/* ── Public component ── */
export function PlaygroundWorld3D({
  worldId,
  onPortal,
  onQuestZone,
  onNpcNearChange,
  botBubbles,
  monsterHp,
  monsterHpMax,
  monsterDefeated,
  onMonsterAttack,
  multiplayerName,
  onIncomingChat,
}: {
  worldId: PlaygroundWorldId
  onPortal: () => void
  onQuestZone: (id: string) => void
  onNpcNearChange: (npcId: string | null) => void
  botBubbles: Record<string, string>
  monsterHp: number
  monsterHpMax: number
  monsterDefeated: boolean
  onMonsterAttack: () => void
  multiplayerName?: string
  onIncomingChat?: (msg: IncomingChat) => void
}) {
  const playerPos = useRef(new THREE.Vector3(0, 0, 6))
  const playerYaw = useRef(0)
  const positionForMp = useRef<{ x: number; y: number; z: number } | null>({ x: 0, y: 0, z: 6 })
  // Sync simple position object for multiplayer hook (it doesn't use THREE)
  useEffect(() => {
    // Sample player position at presence cadence (~5Hz). The hook
    // skip-sends when delta < epsilon, so this is cheap.
    const id = window.setInterval(() => {
      positionForMp.current = { x: playerPos.current.x, y: playerPos.current.y, z: playerPos.current.z }
    }, 200)
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

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        background: '#0b1720',
      }}
    >
      <Canvas
        shadows
        camera={{ position: [10, 12, 10], fov: 45 }}
        dpr={[1, 1.5]}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false, powerPreference: 'default', preserveDrawingBuffer: true }}
      >
        <Suspense fallback={null}>
          <EffectComposer enableNormalPass={false}>
            <Bloom mipmapBlur intensity={0.78} luminanceThreshold={0.62} luminanceSmoothing={0.18} radius={0.85} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
            <Vignette eskil={false} offset={0.18} darkness={0.55} />
          </EffectComposer>
          <Scene
            worldId={worldId}
            onPortal={onPortal}
            onQuestZone={onQuestZone}
            onNpcNearChange={onNpcNearChange}
            botBubbles={botBubbles}
            monsterHp={monsterHp}
            monsterHpMax={monsterHpMax}
            monsterDefeated={monsterDefeated}
            onMonsterAttack={onMonsterAttack}
            playerPos={playerPos}
            playerYaw={playerYaw}
            remotePlayers={remotePlayers}
          />
        </Suspense>
      </Canvas>
      {/* Multiplayer status — small chip top-right */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 70, pointerEvents: 'none' }}>
        <div style={{ padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', background: 'rgba(0,0,0,0.55)', color: '#fff', border: `1px solid ${myColor}55`, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: myColor, boxShadow: `0 0 6px ${myColor}` }} />
          {myName} · {Object.values(remotePlayers).filter((r) => r.world === worldId).length}
        </div>
      </div>
    </div>
  )
}
