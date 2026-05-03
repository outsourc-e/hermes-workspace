/**
 * Playground 3D World — real R3F scene with iso camera, walking player,
 * NPCs, and clickable portal. Hackathon base for Hermes Playground.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import * as THREE from 'three'
import type { PlaygroundWorldId } from '../lib/playground-rpg'
import { botsFor, type BotProfile } from '../lib/playground-bots'
import { ScatteredScenery } from './playground-environment'

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
}: {
  position: [number, number, number]
  avatar: string
  name: string
  color?: string
  drift?: boolean
  npcId?: string
  playerRef?: React.MutableRefObject<THREE.Vector3>
  onNearChange?: (id: string | null) => void
}) {
  const ref = useRef<THREE.Group>(null)
  const base = useMemo(() => new THREE.Vector3(...position), [position])
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])
  const texture = useTexture(`/avatars/${avatar}.png`)

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
    <group ref={ref} position={position}>
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
      <NpcAccessories role={npcId || avatar} color={color} />
      {/* portrait billboard slightly above head */}
      <Billboard position={[0, 1.55, 0]}>
        <mesh>
          <planeGeometry args={[0.7, 0.7]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </Billboard>
      <Html position={[0, 2.05, 0]} center distanceFactor={8}>
        <div style={{padding:'2px 8px',background:'rgba(0,0,0,0.7)',color:'white',borderRadius:4,fontSize:11,fontWeight:600,whiteSpace:'nowrap',border:`1px solid ${color}`}}>{name}</div>
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
  avatarId = 'hermes',
  spawn = [0, 0, 6],
  positionRef,
}: {
  avatarId?: string
  spawn?: [number, number, number]
  positionRef: React.MutableRefObject<THREE.Vector3>
}) {
  const groupRef = useRef<THREE.Group>(null)
  const texture = useTexture(`/avatars/${avatarId}.png`)
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

  // Initial spawn position
  useEffect(() => {
    positionRef.current.set(spawn[0], spawn[1], spawn[2])
    if (groupRef.current) groupRef.current.position.copy(positionRef.current)
  }, [spawn, positionRef])

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
    isMoving.current = dx !== 0 || dz !== 0
    const speed = (k.has('shift') ? 9 : 5) * delta
    if (isMoving.current) {
      const mag = Math.hypot(dx, dz) || 1
      // Rotate input direction by camera yaw so W is always 'into' the scene
      const cy = Math.cos(camYaw.current)
      const sy = Math.sin(camYaw.current)
      const ix = dx / mag
      const iz = dz / mag
      const wx = ix * cy + iz * sy
      const wz = -ix * sy + iz * cy
      const mx = wx * speed
      const mz = wz * speed
      positionRef.current.x = THREE.MathUtils.clamp(positionRef.current.x + mx, -28, 28)
      positionRef.current.z = THREE.MathUtils.clamp(positionRef.current.z + mz, -22, 22)
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
        <meshStandardMaterial color="#2dd4bf" roughness={0.5} />
      </mesh>

      {/* Belt accent */}
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.52, 0.06, 0.36]} />
        <meshStandardMaterial color="#facc15" roughness={0.4} metalness={0.4} />
      </mesh>

      {/* Arms */}
      <mesh
        position={[0.34, 0.7, 0]}
        rotation={[isMoving.current ? -swing * 0.7 : 0, 0, 0.05]}
        castShadow
      >
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color="#2dd4bf" roughness={0.5} />
      </mesh>
      <mesh
        position={[-0.34, 0.7, 0]}
        rotation={[isMoving.current ? swing * 0.7 : 0, 0, -0.05]}
        castShadow
      >
        <boxGeometry args={[0.14, 0.5, 0.14]} />
        <meshStandardMaterial color="#2dd4bf" roughness={0.5} />
      </mesh>

      {/* Hands */}
      <mesh position={[0.34, 0.43, isMoving.current ? -swing * 0.18 : 0]} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.5} />
      </mesh>
      <mesh position={[-0.34, 0.43, isMoving.current ? swing * 0.18 : 0]} castShadow>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.5} />
      </mesh>

      {/* Neck */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.1, 0.1, 12]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.6} />
      </mesh>

      {/* Head sphere base */}
      <mesh position={[0, 1.22, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#fcd34d" roughness={0.55} />
      </mesh>

      {/* Avatar portrait billboard slightly above head */}
      <Billboard position={[0, 1.55, 0]}>
        <mesh>
          <planeGeometry args={[0.7, 0.7]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </Billboard>

      <Html position={[0, 2.05, 0]} center distanceFactor={8}>
        <div
          style={{
            padding: '2px 6px',
            background: 'rgba(0,0,0,0.6)',
            color: '#a7f3d0',
            borderRadius: 4,
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          You
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
  const texture = useTexture(`/avatars/${bot.avatar}.png`)
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
      {/* portrait */}
      <Billboard position={[0, 1.55, 0]}>
        <mesh>
          <planeGeometry args={[0.7, 0.7]} />
          <meshBasicMaterial map={texture} transparent toneMapped={false} />
        </mesh>
      </Billboard>
      {/* nameplate (player-style, no NPC border style) */}
      <Html position={[0, 2.05, 0]} center distanceFactor={8}>
        <div style={{padding:'2px 8px',background:'rgba(0,0,0,0.7)',color:bot.color,borderRadius:4,fontSize:11,fontWeight:700,whiteSpace:'nowrap'}}>{bot.name}</div>
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

/* ── Scene ── */
function Scene({
  worldId,
  onPortal,
  onQuestZone,
  onNpcNearChange,
  botBubbles,
}: {
  worldId: PlaygroundWorldId
  onPortal: () => void
  onQuestZone: (id: string) => void
  onNpcNearChange: (npcId: string | null) => void
  botBubbles: Record<string, string>
}) {
  const bots = botsFor(worldId)
  const world = WORLDS_3D[worldId]
  const playerPos = useRef(new THREE.Vector3(0, 0, 6))

  return (
    <>
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

      {/* NPCs per world */}
      {worldId === 'agora' && (
        <>
          <NPC npcId="athena" position={[-5, 0, 2]} avatar="athena" name="Athena · Sage" color={NPC_COLORS.athena} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="apollo" position={[5, 0, 3]} avatar="apollo" name="Apollo · Bard" color={NPC_COLORS.apollo} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="iris" position={[-3, 0, -5]} avatar="iris" name="Iris · Messenger" color={NPC_COLORS.iris} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="nike" position={[6, 0, -4]} avatar="nike" name="Nike · Champion" color={NPC_COLORS.nike} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="shopkeeper" position={[-3, 0, 9.5]} avatar="iris" name="Dorian · Quartermaster" color={NPC_COLORS.shopkeeper} drift={false} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="trainer" position={[-12, 0, 5.7]} avatar="nike" name="Leonidas · Trainer" color={NPC_COLORS.trainer} drift={false} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="banker" position={[15.3, 0, 7.5]} avatar="chronos" name="Midas · Banker" color={NPC_COLORS.banker} drift={false} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="recruiter" position={[-1.2, 0, -15.5]} avatar="athena" name="Cassia · Recruiter" color={NPC_COLORS.recruiter} drift={false} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="tavernkeeper" position={[2, 0, 15.5]} avatar="apollo" name="Selene · Tavern" color={NPC_COLORS.tavernkeeper} drift={false} playerRef={playerPos} onNearChange={onNpcNearChange} />
        </>
      )}
      {worldId === 'forge' && (
        <>
          <NPC npcId="pan" position={[-4, 0, 0]} avatar="pan" name="Pan · Hacker" color={NPC_COLORS.pan} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="chronos" position={[4, 0, 0]} avatar="chronos" name="Chronos · Architect" color={NPC_COLORS.chronos} playerRef={playerPos} onNearChange={onNpcNearChange} />
        </>
      )}
      {worldId === 'grove' && (
        <>
          <NPC npcId="pan" position={[-4, 0, 1]} avatar="pan" name="Pan · Druid" color={NPC_COLORS.pan} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="apollo" position={[4, 0, 0]} avatar="apollo" name="Apollo · Songkeeper" color={NPC_COLORS.apollo} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="artemis" position={[0, 0, -5]} avatar="artemis" name="Artemis · Tracker" color={NPC_COLORS.artemis} playerRef={playerPos} onNearChange={onNpcNearChange} />
        </>
      )}
      {worldId === 'oracle' && (
        <>
          <NPC npcId="athena" position={[-3, 0, -2]} avatar="athena" name="Athena · Oracle" color={NPC_COLORS.athena} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="chronos" position={[3, 0, -2]} avatar="chronos" name="Chronos · Archivist" color={NPC_COLORS.chronos} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="eros" position={[0, 0, 4]} avatar="eros" name="Eros · Whisperer" color={NPC_COLORS.eros} playerRef={playerPos} onNearChange={onNpcNearChange} />
        </>
      )}
      {worldId === 'arena' && (
        <>
          <NPC npcId="nike" position={[-3, 0, 4]} avatar="nike" name="Nike · Champion" color={NPC_COLORS.nike} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="hermes" position={[3, 0, 4]} avatar="hermes" name="Hermes · Referee" color={NPC_COLORS.hermes} playerRef={playerPos} onNearChange={onNpcNearChange} />
          <NPC npcId="chronos" position={[0, 0, -5]} avatar="chronos" name="Chronos · Bookmaker" color={NPC_COLORS.chronos} playerRef={playerPos} onNearChange={onNpcNearChange} />
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
        <PlayerAndCamera positionRef={playerPos} spawn={[0, 0, 6]} />
      </Suspense>

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
}) {
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
        gl={{ antialias: true, alpha: false, powerPreference: 'default' }}
      >
        <Suspense fallback={null}>
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
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
