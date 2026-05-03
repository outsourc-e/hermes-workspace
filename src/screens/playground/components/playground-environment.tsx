/**
 * Reusable scenery primitives for Hermes Playground worlds.
 * All Three.js primitives — no external assets. Looks intentional + low-poly.
 */
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Deterministic pseudo-random based on seed so layout is stable per render
function rng(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
}

/* ── Tree variations ── */
export function PineTree({ position, scale = 1, color = '#1f8b4f', glow = '#86efac' }: { position: [number, number, number]; scale?: number; color?: string; glow?: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.16, 0.22, 1.1, 8]} />
        <meshStandardMaterial color="#5b3a1f" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 1.5, 0]}>
        <coneGeometry args={[0.85, 1.4, 8]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 2.15, 0]}>
        <coneGeometry args={[0.6, 1, 8]} />
        <meshStandardMaterial color={glow} roughness={0.7} emissive={glow} emissiveIntensity={0.08} />
      </mesh>
    </group>
  )
}

export function BroadleafTree({ position, scale = 1, color = '#2bbf6f' }: { position: [number, number, number]; scale?: number; color?: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh castShadow position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.18, 0.25, 1.2, 8]} />
        <meshStandardMaterial color="#4b2f17" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.85, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[-0.4, 1.55, 0.2]}>
        <sphereGeometry args={[0.55, 10, 10]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.45, 1.6, -0.1]}>
        <sphereGeometry args={[0.6, 10, 10]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  )
}

/* ── Bushes / grass tufts ── */
export function GrassTuft({ position, color = '#3aa86a', variant = 'cluster' }: { position: [number, number, number]; color?: string; variant?: 'cluster' | 'spike' | 'fern' }) {
  if (variant === 'spike') {
    // Skinny tufts of grass blades
    return (
      <group position={position}>
        {[0, 0.5, -0.5, 0.25, -0.25].map((angle, i) => (
          <mesh key={i} castShadow position={[Math.sin(angle) * 0.08, 0.2, Math.cos(angle) * 0.08]} rotation={[0, angle, 0]}>
            <coneGeometry args={[0.05, 0.42, 4]} />
            <meshStandardMaterial color={color} roughness={0.95} />
          </mesh>
        ))}
      </group>
    )
  }
  if (variant === 'fern') {
    return (
      <group position={position}>
        <mesh castShadow position={[0, 0.18, 0]}>
          <coneGeometry args={[0.32, 0.45, 5]} />
          <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        <mesh castShadow position={[0.18, 0.14, 0.1]} rotation={[0.3, 0.4, 0]}>
          <coneGeometry args={[0.18, 0.32, 5]} />
          <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
        <mesh castShadow position={[-0.16, 0.13, -0.05]} rotation={[0.3, -0.4, 0]}>
          <coneGeometry args={[0.18, 0.3, 5]} />
          <meshStandardMaterial color={color} roughness={0.9} flatShading />
        </mesh>
      </group>
    )
  }
  // cluster default — 3 stacked rough orbs with flat shading for low-poly look
  return (
    <group position={position}>
      {[0, 0.12, -0.12].map((dx, i) => (
        <mesh key={i} castShadow position={[dx, 0.18, dx * 0.5]}>
          <dodecahedronGeometry args={[0.18 + i * 0.04, 0]} />
          <meshStandardMaterial color={color} roughness={0.85} flatShading />
        </mesh>
      ))}
    </group>
  )
}

/* ── Soft contact shadow disc (use under characters/props that float) ── */
export function ContactShadow({ position, radius = 0.55, opacity = 0.45 }: { position: [number, number, number]; radius?: number; opacity?: number }) {
  return (
    <mesh position={[position[0], position[1] + 0.011, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 16]} />
      <meshBasicMaterial color="#000000" transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

/* ── Rocks ── */
export function Rock({ position, scale = 1, color = '#6b7280' }: { position: [number, number, number]; scale?: number; color?: string }) {
  return (
    <mesh castShadow position={[position[0], position[1] + 0.18 * scale, position[2]]} scale={scale}>
      <dodecahedronGeometry args={[0.4, 0]} />
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  )
}

/* ── Stone arch (waypoint marker) ── */
export function StoneArch({ position, color = '#d7c7a4' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh castShadow position={[-0.7, 1.1, 0]}>
        <boxGeometry args={[0.24, 2.2, 0.4]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.7, 1.1, 0]}>
        <boxGeometry args={[0.24, 2.2, 0.4]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0, 2.2, 0]}>
        <boxGeometry args={[1.7, 0.28, 0.4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  )
}

/* ── Static townsfolk silhouette (decoration, not interactive) ── */
export function Townsfolk({ position, color = '#7c3aed', skin = '#f3d3a3', rotation = 0 }: { position: [number, number, number]; color?: string; skin?: string; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Body */}
      <mesh castShadow position={[0, 0.55, 0]}>
        <boxGeometry args={[0.5, 0.7, 0.32]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh castShadow position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color={skin} roughness={0.7} />
      </mesh>
      {/* Hair cap */}
      <mesh castShadow position={[0, 1.22, -0.04]}>
        <sphereGeometry args={[0.23, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3f2511" roughness={0.9} />
      </mesh>
      {/* Arms */}
      <mesh castShadow position={[-0.35, 0.6, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.55, 6]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh castShadow position={[0.35, 0.6, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.55, 6]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Legs */}
      <mesh castShadow position={[-0.13, 0.12, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.4, 6]} />
        <meshStandardMaterial color="#1f2937" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0.13, 0.12, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.4, 6]} />
        <meshStandardMaterial color="#1f2937" roughness={0.85} />
      </mesh>
    </group>
  )
}

/* ── Market stall ── */
export function MarketStall({ position, color = '#b45309', awningColor = '#dc2626' }: { position: [number, number, number]; color?: string; awningColor?: string }) {
  return (
    <group position={position}>
      {/* Counter */}
      <mesh castShadow position={[0, 0.5, 0]}>
        <boxGeometry args={[1.6, 0.7, 0.7]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Top counter */}
      <mesh castShadow position={[0, 0.92, 0]}>
        <boxGeometry args={[1.7, 0.08, 0.8]} />
        <meshStandardMaterial color="#7c2d12" roughness={0.6} />
      </mesh>
      {/* Awning posts */}
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} castShadow position={[x, 1.4, 0]}>
          <boxGeometry args={[0.07, 0.95, 0.07]} />
          <meshStandardMaterial color="#3f2511" />
        </mesh>
      ))}
      {/* Awning */}
      <mesh castShadow position={[0, 1.95, 0.05]} rotation={[Math.PI / 8, 0, 0]}>
        <boxGeometry args={[1.85, 0.06, 1]} />
        <meshStandardMaterial color={awningColor} roughness={0.6} emissive={awningColor} emissiveIntensity={0.08} />
      </mesh>
      {/* Tiny goods */}
      <mesh position={[-0.4, 1, 0]} castShadow>
        <sphereGeometry args={[0.13, 10, 10]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.4, 1, 0]} castShadow>
        <octahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

/* ── Building (2-story shrine/villa) ── */
export function Building({ position, color = '#e8d4a8', roofColor = '#b91c1c', accent = '#fbbf24', sign }: { position: [number, number, number]; color?: string; roofColor?: string; accent?: string; sign?: string }) {
  return (
    <group position={position}>
      {/* Foundation */}
      <mesh castShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[3.4, 0.6, 2.2]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.85} />
      </mesh>
      {/* Walls */}
      <mesh castShadow position={[0, 1.4, 0]}>
        <boxGeometry args={[3, 1.6, 1.8]} />
        <meshStandardMaterial color={color} roughness={0.65} />
      </mesh>
      {/* Wall trim (timber framing) */}
      <mesh position={[0, 2.18, 0]}>
        <boxGeometry args={[3.05, 0.1, 1.85]} />
        <meshStandardMaterial color="#3f2511" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[3.05, 0.08, 1.85]} />
        <meshStandardMaterial color="#3f2511" roughness={0.7} />
      </mesh>
      {/* Roof */}
      <mesh castShadow position={[0, 2.55, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[2, 0.9, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.6} />
      </mesh>
      {/* Roof eaves (overhang ring) */}
      <mesh position={[0, 2.18, 0]}>
        <boxGeometry args={[3.4, 0.06, 2.05]} />
        <meshStandardMaterial color={roofColor} roughness={0.7} />
      </mesh>
      {/* Chimney */}
      <mesh castShadow position={[0.9, 3, -0.4]}>
        <boxGeometry args={[0.3, 0.9, 0.3]} />
        <meshStandardMaterial color="#7c2d12" roughness={0.9} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 1, 0.91]}>
        <boxGeometry args={[0.5, 0.9, 0.05]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      {/* Door frame */}
      <mesh position={[0, 1.45, 0.92]}>
        <boxGeometry args={[0.62, 0.04, 0.02]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      {/* Window glow */}
      <mesh position={[-1.05, 1.5, 0.91]}>
        <boxGeometry args={[0.42, 0.42, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
      </mesh>
      {/* Window cross */}
      <mesh position={[-1.05, 1.5, 0.94]}>
        <boxGeometry args={[0.42, 0.04, 0.01]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      <mesh position={[-1.05, 1.5, 0.94]}>
        <boxGeometry args={[0.04, 0.42, 0.01]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      <mesh position={[1.05, 1.5, 0.91]}>
        <boxGeometry args={[0.42, 0.42, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[1.05, 1.5, 0.94]}>
        <boxGeometry args={[0.42, 0.04, 0.01]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      <mesh position={[1.05, 1.5, 0.94]}>
        <boxGeometry args={[0.04, 0.42, 0.01]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      {/* Optional shop sign */}
      {sign && (
        <group position={[0, 2.05, 1.2]}>
          <mesh castShadow rotation={[0.05, 0, 0]}>
            <boxGeometry args={[1.4, 0.32, 0.06]} />
            <meshStandardMaterial color="#3f2511" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0, 0.04]} rotation={[0.05, 0, 0]}>
            <planeGeometry args={[1.34, 0.26]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.4} />
          </mesh>
        </group>
      )}
    </group>
  )
}

/* ── Lantern / torch ── */
export function Lantern({ position, color = '#fbbf24' }: { position: [number, number, number]; color?: string }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.getElapsedTime()
    const m = ref.current.material as THREE.MeshStandardMaterial
    if (m && 'emissiveIntensity' in m) m.emissiveIntensity = 1.6 + Math.sin(t * 5) * 0.3
  })
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[0.08, 1.2, 0.08]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      <mesh ref={ref} position={[0, 1.3, 0]}>
        <octahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
      </mesh>
      <pointLight position={[0, 1.3, 0]} color={color} intensity={1.2} distance={4} />
    </group>
  )
}

/* ── Banner pole ── */
export function Banner({ position, color = '#9333ea' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0.32, 1.6, 0]}>
        <planeGeometry args={[0.5, 0.9]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.5} emissive={color} emissiveIntensity={0.18} />
      </mesh>
    </group>
  )
}

/* ── Flower ── */
export function Flower({ position, color = '#fde68a' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      <mesh castShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.24, 5]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
      <mesh castShadow position={[0, 0.27, 0]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.6} />
      </mesh>
    </group>
  )
}

/* ── Cluster of small flowers in random positions inside a tile ── */
export function FlowerPatch({ position, count = 6, palette = ['#fde68a', '#fda4af', '#c4b5fd', '#fef3c7'], seed = 1 }: { position: [number, number, number]; count?: number; palette?: string[]; seed?: number }) {
  const items = useMemo(() => {
    const r = rng(seed * 17 + Math.floor(position[0] * 13) + Math.floor(position[2] * 7))
    const out: { pos: [number, number, number]; color: string }[] = []
    for (let i = 0; i < count; i++) {
      const dx = (r() - 0.5) * 1.2
      const dz = (r() - 0.5) * 1.2
      out.push({ pos: [dx, 0, dz], color: palette[Math.floor(r() * palette.length)] })
    }
    return out
  }, [count, palette, seed, position])
  return (
    <group position={position}>
      {items.map((f, i) => (
        <Flower key={i} position={f.pos} color={f.color} />
      ))}
    </group>
  )
}

/* ── Log pile (small landscape filler) ── */
export function LogPile({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.13, 0.13, 0.9, 10]} />
        <meshStandardMaterial color="#7c4a1f" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0.04, 0.36, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.85, 10]} />
        <meshStandardMaterial color="#6b3a18" roughness={0.85} />
      </mesh>
      <mesh castShadow position={[0.02, 0.58, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.7, 10]} />
        <meshStandardMaterial color="#7c4a1f" roughness={0.85} />
      </mesh>
    </group>
  )
}

/* ── Fountain (Agora centerpiece) ── */
export function Fountain({ position, accent = '#7dd3fc' }: { position: [number, number, number]; accent?: string }) {
  const splashRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!splashRef.current) return
    const t = clock.getElapsedTime()
    splashRef.current.scale.y = 1 + Math.sin(t * 3) * 0.08
    splashRef.current.position.y = 1.55 + Math.sin(t * 2) * 0.04
  })
  return (
    <group position={position}>
      {/* Outer basin */}
      <mesh receiveShadow castShadow position={[0, 0.18, 0]}>
        <cylinderGeometry args={[1.7, 1.85, 0.36, 24]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
      </mesh>
      {/* Water surface */}
      <mesh position={[0, 0.37, 0]}>
        <cylinderGeometry args={[1.55, 1.55, 0.06, 24]} />
        <meshStandardMaterial color={accent} transparent opacity={0.78} emissive={accent} emissiveIntensity={0.35} roughness={0.15} metalness={0.3} />
      </mesh>
      {/* Mid pillar */}
      <mesh castShadow position={[0, 0.78, 0]}>
        <cylinderGeometry args={[0.45, 0.6, 0.9, 16]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 1.28, 0]}>
        <cylinderGeometry args={[0.85, 0.95, 0.18, 24]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>
      <mesh castShadow position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.22, 0.32, 0.5, 12]} />
        <meshStandardMaterial color="#e5e7eb" roughness={0.55} />
      </mesh>
      {/* Splash plume (animated) */}
      <mesh ref={splashRef} position={[0, 1.55, 0]}>
        <coneGeometry args={[0.18, 0.55, 12, 1, true]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0, 1.4, 0]} color={accent} intensity={1.4} distance={6} />
    </group>
  )
}

/* ── Path tile (dirt strip for roads) ── */
export function PathStrip({ from, to, width = 1.4, color = '#8a6a3d' }: { from: [number, number]; to: [number, number]; width?: number; color?: string }) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.sqrt(dx * dx + dz * dz)
  const angle = Math.atan2(dz, dx)
  const cx = (from[0] + to[0]) / 2
  const cz = (from[1] + to[1]) / 2
  return (
    <mesh receiveShadow position={[cx, 0.015, cz]} rotation={[-Math.PI / 2, 0, -angle]}>
      <planeGeometry args={[len, width, 1, 1]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  )
}

/* ── Round plaza tile (paved center) ── */
export function PlazaDisc({ position, radius = 6, color = '#a98a5e' }: { position: [number, number, number]; radius?: number; color?: string }) {
  return (
    <group position={position}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <circleGeometry args={[radius, 48]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]}>
        <ringGeometry args={[radius - 0.6, radius - 0.4, 64]} />
        <meshStandardMaterial color="#5a4424" roughness={1} />
      </mesh>
    </group>
  )
}

/* ── Scattered scenery cluster (auto-fills a world) ── */
export function ScatteredScenery({
  worldId,
  seed = 1,
}: {
  worldId: 'agora' | 'forge' | 'grove' | 'oracle' | 'arena'
  seed?: number
}) {
  const items = useMemo(() => {
    const r = rng(seed * 100 + worldId.length)
    const out: { type: string; pos: [number, number, number]; color?: string; scale?: number }[] = []

    function maybeOnEdge(): [number, number, number] {
      // Place on ring 14-22 from center
      const ang = r() * Math.PI * 2
      const rad = 14 + r() * 8
      return [Math.cos(ang) * rad, 0, Math.sin(ang) * rad]
    }

    function farEdge(): [number, number, number] {
      const ang = r() * Math.PI * 2
      const rad = 18 + r() * 8
      return [Math.cos(ang) * rad, 0, Math.sin(ang) * rad]
    }

    // Common scenery
    for (let i = 0; i < 20; i++) {
      out.push({ type: 'rock', pos: farEdge(), scale: 0.5 + r() * 0.8, color: '#6b7280' })
    }
    for (let i = 0; i < 30; i++) {
      out.push({ type: 'grass', pos: maybeOnEdge(), color: worldId === 'forge' ? '#0ea5e9' : worldId === 'oracle' ? '#a78bfa' : '#3aa86a' })
    }

    if (worldId === 'agora') {
      // Centerpiece fountain + paved plaza
      out.push({ type: 'plaza', pos: [0, 0, 0], radius: 8, color: '#b89668' } as any)
      out.push({ type: 'fountain', pos: [0, 0, 0], color: '#7dd3fc' })

      // Dirt paths radiating to NPC zones / portal / arch
      const pathTargets: [number, number][] = [
        [12, -6], [-12, -6], [12, 6], [-12, 6], [0, 14], [0, -14],
      ]
      for (const t of pathTargets) {
        out.push({ type: 'path', from: [0, 0], to: t, width: 1.6, color: '#9d7a4a' } as any)
      }

      // Buildings around the plaza like a small town
      out.push({ type: 'building', pos: [-13, 0, -15], color: '#e8d4a8', roofColor: '#b91c1c' })
      out.push({ type: 'building', pos: [13, 0, -15], color: '#f5deb3', roofColor: '#1d4ed8' })
      out.push({ type: 'building', pos: [-17, 0, 9], color: '#deb887', roofColor: '#92400e' })
      out.push({ type: 'building', pos: [17, 0, 9], color: '#e8d4a8', roofColor: '#b91c1c' })
      out.push({ type: 'building', pos: [-2, 0, -19], color: '#f3e1bb', roofColor: '#1d4ed8' })
      out.push({ type: 'building', pos: [2, 0, 18], color: '#f3e1bb', roofColor: '#b91c1c' })

      // Market street: stalls + merchants behind them
      const stallSetup: { stall: [number, number, number]; merchant: [number, number, number]; mColor: string; mRot: number; awning: string }[] = [
        { stall: [-3, 0, 11], merchant: [-3, 0, 11.7], mColor: '#7c3aed', mRot: Math.PI, awning: '#dc2626' },
        { stall: [3, 0, 11], merchant: [3, 0, 11.7], mColor: '#0891b2', mRot: Math.PI, awning: '#1d4ed8' },
        { stall: [-5, 0, 13.5], merchant: [-5, 0, 14.2], mColor: '#16a34a', mRot: Math.PI, awning: '#16a34a' },
        { stall: [5, 0, 13.5], merchant: [5, 0, 14.2], mColor: '#dc2626', mRot: Math.PI, awning: '#7c2d12' },
        { stall: [-9, 0, -2], merchant: [-9, 0, -1.3], mColor: '#7c2d12', mRot: 0, awning: '#dc2626' },
        { stall: [9, 0, -2], merchant: [9, 0, -1.3], mColor: '#9333ea', mRot: 0, awning: '#22d3ee' },
      ]
      for (const s of stallSetup) {
        out.push({ type: 'stall', pos: s.stall, awningColor: s.awning } as any)
        out.push({ type: 'townsfolk', pos: s.merchant, color: s.mColor, rotation: s.mRot } as any)
      }

      // A couple of strolling townsfolk near the fountain for life
      out.push({ type: 'townsfolk', pos: [-4.5, 0, 4.5], color: '#0ea5e9', rotation: 1.2 } as any)
      out.push({ type: 'townsfolk', pos: [4.5, 0, -4], color: '#facc15', rotation: -2.1 } as any)
      out.push({ type: 'townsfolk', pos: [3, 0, 6], color: '#a21caf', rotation: -0.8 } as any)

      // Lanterns ringing the fountain (ornamental)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + Math.PI / 8
        out.push({ type: 'lantern', pos: [Math.cos(ang) * 5.5, 0, Math.sin(ang) * 5.5], color: '#fbbf24' })
      }

      // Trees on the outer ring (green band that separates plaza from fog)
      for (let i = 0; i < 26; i++) {
        const ang = r() * Math.PI * 2
        const rad = 18 + r() * 6
        out.push({ type: r() < 0.5 ? 'pine' : 'broadleaf', pos: [Math.cos(ang) * rad, 0, Math.sin(ang) * rad], scale: 0.8 + r() * 0.6, color: r() < 0.5 ? '#1f8b4f' : '#2bbf6f', glow: '#86efac' })
      }
      // Flowers and grass tufts in the green band, off the paths
      for (let i = 0; i < 28; i++) {
        const ang = r() * Math.PI * 2
        const rad = 9.5 + r() * 7.5
        out.push({ type: 'grass', pos: [Math.cos(ang) * rad, 0, Math.sin(ang) * rad], color: '#3aa86a' })
      }
      for (let i = 0; i < 16; i++) {
        const ang = r() * Math.PI * 2
        const rad = 10 + r() * 7
        out.push({ type: 'flowerpatch', pos: [Math.cos(ang) * rad, 0, Math.sin(ang) * rad], count: 6 + Math.floor(r() * 5) } as any)
      }

      // A few rocks and a log pile for prop variety
      out.push({ type: 'logs', pos: [-7, 0, -8], rotation: 0.3 } as any)
      out.push({ type: 'logs', pos: [8, 0, 7], rotation: -0.5 } as any)
      out.push({ type: 'rock', pos: [-9, 0, 9], scale: 0.9, color: '#6b7280' })
      out.push({ type: 'rock', pos: [10, 0, -9], scale: 1.1, color: '#5b6470' })

      // Shop signs above some buildings (lightweight indicator of role)
      out.push({ type: 'building', pos: [-13, 0, -15], color: '#e8d4a8', roofColor: '#b91c1c', sign: 'Smithy' } as any)
      out.push({ type: 'building', pos: [13, 0, -15], color: '#f5deb3', roofColor: '#1d4ed8', sign: 'Apothecary' } as any)
      out.push({ type: 'building', pos: [-17, 0, 9], color: '#deb887', roofColor: '#92400e', sign: 'Inn' } as any)
      out.push({ type: 'building', pos: [17, 0, 9], color: '#e8d4a8', roofColor: '#b91c1c', sign: 'Bank' } as any)
      // (the earlier 4 blank buildings remain so we have 6 total)

      // Original arch + banners
      out.push({ type: 'arch', pos: [0, 0, 18], color: '#d7c7a4' })
      out.push({ type: 'banner', pos: [-11, 0, 0], color: '#a78bfa' })
      out.push({ type: 'banner', pos: [11, 0, 0], color: '#22d3ee' })
    }

    if (worldId === 'forge') {
      // Tech buildings + glowing crates + cyber lanterns
      out.push({ type: 'building', pos: [-14, 0, -10], color: '#1f2937', roofColor: '#22d3ee' })
      out.push({ type: 'building', pos: [14, 0, -10], color: '#1f2937', roofColor: '#22d3ee' })
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2
        out.push({ type: 'lantern', pos: [Math.cos(ang) * 5, 0, Math.sin(ang) * 5], color: '#22d3ee' })
      }
    }

    if (worldId === 'grove') {
      for (let i = 0; i < 38; i++) out.push({ type: 'pine', pos: maybeOnEdge(), scale: 0.7 + r() * 0.7, color: '#1f8b4f', glow: '#86efac' })
      for (let i = 0; i < 16; i++) out.push({ type: 'broadleaf', pos: maybeOnEdge(), scale: 0.8 + r() * 0.5, color: '#2bbf6f' })
      for (let i = 0; i < 18; i++) {
        const ang = r() * Math.PI * 2
        const rad = 8 + r() * 8
        out.push({ type: 'flowerpatch', pos: [Math.cos(ang) * rad, 0, Math.sin(ang) * rad], count: 5 + Math.floor(r() * 4), palette: ['#86efac', '#fde68a', '#a7f3d0', '#fef3c7'] } as any)
      }
      out.push({ type: 'logs', pos: [-5, 0, -3], rotation: 0.2 } as any)
      out.push({ type: 'logs', pos: [4, 0, 5], rotation: -0.6 } as any)
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2
        out.push({ type: 'lantern', pos: [Math.cos(ang) * 6, 0, Math.sin(ang) * 6], color: '#86efac' })
      }
    }

    if (worldId === 'oracle') {
      out.push({ type: 'arch', pos: [0, 0, -10], color: '#c4b5fd' })
      out.push({ type: 'arch', pos: [0, 0, 10], color: '#c4b5fd' })
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2
        out.push({ type: 'lantern', pos: [Math.cos(ang) * 9, 0, Math.sin(ang) * 9], color: '#a78bfa' })
      }
      for (let i = 0; i < 12; i++) out.push({ type: 'broadleaf', pos: farEdge(), scale: 0.6 + r() * 0.5, color: '#5b21b6' })
    }

    if (worldId === 'arena') {
      // Banners + braziers + war stalls
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2
        out.push({ type: 'banner', pos: [Math.cos(ang) * 11, 0, Math.sin(ang) * 11], color: '#fb7185' })
      }
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + Math.PI / 6
        out.push({ type: 'lantern', pos: [Math.cos(ang) * 6, 0, Math.sin(ang) * 6], color: '#fb7185' })
      }
    }

    return out
  }, [worldId, seed])

  return (
    <>
      {items.map((it: any, i) => {
        switch (it.type) {
          case 'pine':
            return <PineTree key={i} position={it.pos} scale={it.scale} color={it.color} />
          case 'broadleaf':
            return <BroadleafTree key={i} position={it.pos} scale={it.scale} color={it.color} />
          case 'rock':
            return <Rock key={i} position={it.pos} scale={it.scale} color={it.color} />
          case 'grass':
            return <GrassTuft key={i} position={it.pos} color={it.color} />
          case 'stall':
            return <MarketStall key={i} position={it.pos} awningColor={it.awningColor} />
          case 'townsfolk':
            return <Townsfolk key={i} position={it.pos} color={it.color} rotation={it.rotation || 0} />
          case 'building':
            return <Building key={i} position={it.pos} color={it.color} roofColor={it.roofColor} sign={it.sign} />
          case 'lantern':
            return <Lantern key={i} position={it.pos} color={it.color} />
          case 'arch':
            return <StoneArch key={i} position={it.pos} color={it.color} />
          case 'banner':
            return <Banner key={i} position={it.pos} color={it.color} />
          case 'fountain':
            return <Fountain key={i} position={it.pos} accent={it.color} />
          case 'flowerpatch':
            return <FlowerPatch key={i} position={it.pos} count={it.count} palette={it.palette} seed={i} />
          case 'logs':
            return <LogPile key={i} position={it.pos} rotation={it.rotation || 0} />
          case 'plaza':
            return <PlazaDisc key={i} position={it.pos} radius={it.radius} color={it.color} />
          case 'path':
            return <PathStrip key={i} from={it.from} to={it.to} width={it.width} color={it.color} />
          default:
            return null
        }
      })}
    </>
  )
}
