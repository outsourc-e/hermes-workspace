/**
 * Playground 3D World — real R3F scene with iso camera, walking player,
 * NPCs, and clickable portal. Hackathon base for Hermes Playground.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Html, useTexture } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import * as THREE from 'three'
import type { PlaygroundWorldId } from '../lib/playground-rpg'

type WorldDef = {
  id: PlaygroundWorldId
  name: string
  accent: string
  groundColor: string
  skyColor: string
  ambient: string
  pillarColor: string
  pillarType: 'classical' | 'tech'
  fogNear: number
  fogFar: number
}

const WORLDS_3D: Record<PlaygroundWorldId, WorldDef> = {
  agora: {
    id: 'agora',
    name: 'The Agora',
    accent: '#d9b35f',
    groundColor: '#3a4a3f',
    skyColor: '#0b1720',
    ambient: '#26404a',
    pillarColor: '#e8d4a8',
    pillarType: 'classical',
    fogNear: 18,
    fogFar: 60,
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
    pillarType: 'classical',
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
    pillarType: 'classical',
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
    pillarType: 'tech',
    fogNear: 14,
    fogFar: 42,
  },
}

/* ── Ground ── */
function Ground({ world }: { world: WorldDef }) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80, 1, 1]} />
        <meshStandardMaterial color={world.groundColor} roughness={0.95} metalness={0.05} />
      </mesh>
      <gridHelper args={[80, 40, world.accent, '#1f2937']} position={[0, 0.01, 0]} />
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

/* ── NPC billboard ── */
function NPC({
  position,
  avatar,
  name,
  color = '#a78bfa',
  drift = true,
}: {
  position: [number, number, number]
  avatar: string
  name: string
  color?: string
  drift?: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const base = useMemo(() => new THREE.Vector3(...position), [position])
  const phase = useMemo(() => Math.random() * Math.PI * 2, [])
  const texture = useTexture(`/avatars/${avatar}.png`)

  useFrame(({ clock }) => {
    if (!ref.current) return
    if (drift) {
      const t = clock.getElapsedTime() + phase
      ref.current.position.x = base.x + Math.sin(t * 0.4) * 1.2
      ref.current.position.z = base.z + Math.cos(t * 0.3) * 1.2
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
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','shift',' '].includes(k)) {
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
  const isMoving = useRef(false)
  const bobT = useRef(0)

  // Initial spawn position
  useEffect(() => {
    positionRef.current.set(spawn[0], spawn[1], spawn[2])
    if (groupRef.current) groupRef.current.position.copy(positionRef.current)
  }, [spawn, positionRef])

  useFrame((_, delta) => {
    const k = keys.current
    let dx = 0, dz = 0
    if (k.has('w') || k.has('arrowup')) dz -= 1
    if (k.has('s') || k.has('arrowdown')) dz += 1
    if (k.has('a') || k.has('arrowleft')) dx -= 1
    if (k.has('d') || k.has('arrowright')) dx += 1
    isMoving.current = dx !== 0 || dz !== 0
    const speed = (k.has('shift') ? 9 : 5) * delta
    if (isMoving.current) {
      const mag = Math.hypot(dx, dz) || 1
      const mx = (dx / mag) * speed
      const mz = (dz / mag) * speed
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
    camIdeal.set(positionRef.current.x + 9, 11, positionRef.current.z + 9)
    camera.position.lerp(camIdeal, 0.12)
    camLook.set(positionRef.current.x, positionRef.current.y + 0.6, positionRef.current.z)
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
}

/* ── Scene ── */
function Scene({
  worldId,
  onPortal,
  onQuestZone,
}: {
  worldId: PlaygroundWorldId
  onPortal: () => void
  onQuestZone: (id: string) => void
}) {
  const world = WORLDS_3D[worldId]
  const playerPos = useRef(new THREE.Vector3(0, 0, 6))

  return (
    <>
      <color attach="background" args={[world.skyColor]} />
      <fog attach="fog" args={[world.skyColor, world.fogNear, world.fogFar]} />
      <ambientLight intensity={0.7} color={world.ambient} />
      <directionalLight castShadow position={[10, 14, 6]} intensity={1.6} shadow-mapSize={[2048, 2048]} />
      <pointLight position={[0, 4, 0]} color={world.accent} intensity={2.5} distance={16} />

      <Ground world={world} />
      {world.pillarType === 'classical' ? <ClassicalPillars world={world} /> : <TechPillars world={world} />}

      {/* NPCs */}
      {worldId === 'agora' && (
        <>
          <NPC position={[-5, 0, 2]} avatar="athena" name="Athena · Sage" color={NPC_COLORS.athena} />
          <NPC position={[5, 0, 3]} avatar="apollo" name="Apollo · Bard" color={NPC_COLORS.apollo} />
          <NPC position={[-3, 0, -5]} avatar="iris" name="Iris · Messenger" color={NPC_COLORS.iris} />
          <NPC position={[6, 0, -4]} avatar="nike" name="Nike · Champion" color={NPC_COLORS.nike} />
        </>
      )}
      {worldId === 'forge' && (
        <>
          <NPC position={[-4, 0, 0]} avatar="pan" name="Pan · Hacker" color={NPC_COLORS.pan} />
          <NPC position={[4, 0, 0]} avatar="chronos" name="Chronos · Architect" color={NPC_COLORS.chronos} />
        </>
      )}

      {/* Portal */}
      <Portal
        position={[10, 0, -2]}
        color={world.accent}
        label={worldId === 'agora' ? 'To The Forge →' : '← Back to Agora'}
        onEnter={onPortal}
        playerRef={playerPos}
      />

      {/* Quest zone */}
      {worldId === 'agora' && (
        <QuestZone
          position={[-8, 0, -3]}
          color="#facc15"
          label="Athena's Scroll"
          onEnter={() => onQuestZone('awakening-agora')}
          playerRef={playerPos}
        />
      )}
      {worldId === 'forge' && (
        <QuestZone
          position={[0, 0, -7]}
          color="#22d3ee"
          label="Forge Shard"
          onEnter={() => onQuestZone('enter-forge')}
          playerRef={playerPos}
        />
      )}

      <Suspense fallback={null}>
        <PlayerAndCamera positionRef={playerPos} spawn={[0, 0, 6]} />
      </Suspense>
    </>
  )
}

/* ── Public component ── */
export function PlaygroundWorld3D({
  worldId,
  onPortal,
  onQuestZone,
}: {
  worldId: PlaygroundWorldId
  onPortal: () => void
  onQuestZone: (id: string) => void
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
          <Scene worldId={worldId} onPortal={onPortal} onQuestZone={onQuestZone} />
        </Suspense>
      </Canvas>
    </div>
  )
}
