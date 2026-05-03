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
export function GrassTuft({ position, color = '#3aa86a' }: { position: [number, number, number]; color?: string }) {
  return (
    <group position={position}>
      {[0, 0.12, -0.12].map((dx, i) => (
        <mesh key={i} castShadow position={[dx, 0.18, dx * 0.5]}>
          <sphereGeometry args={[0.18 + i * 0.04, 6, 6]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      ))}
    </group>
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
export function Building({ position, color = '#e8d4a8', roofColor = '#b91c1c', accent = '#fbbf24' }: { position: [number, number, number]; color?: string; roofColor?: string; accent?: string }) {
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
      {/* Roof */}
      <mesh castShadow position={[0, 2.55, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[2, 0.9, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.6} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 1, 0.91]}>
        <boxGeometry args={[0.5, 0.9, 0.05]} />
        <meshStandardMaterial color="#3f2511" />
      </mesh>
      {/* Window glow */}
      <mesh position={[-1.05, 1.5, 0.91]}>
        <boxGeometry args={[0.4, 0.4, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
      </mesh>
      <mesh position={[1.05, 1.5, 0.91]}>
        <boxGeometry args={[0.4, 0.4, 0.05]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.5} />
      </mesh>
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
      // Marketplace + buildings + lanterns
      out.push({ type: 'building', pos: [-12, 0, -16], color: '#e8d4a8' })
      out.push({ type: 'building', pos: [12, 0, -16], color: '#f5deb3' })
      out.push({ type: 'building', pos: [-16, 0, 8], color: '#deb887' })
      out.push({ type: 'building', pos: [16, 0, 8], color: '#e8d4a8' })
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2
        out.push({ type: 'stall', pos: [Math.cos(ang) * 7, 0, Math.sin(ang) * 7] })
      }
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + Math.PI / 8
        out.push({ type: 'lantern', pos: [Math.cos(ang) * 4.5, 0, Math.sin(ang) * 4.5], color: '#fbbf24' })
      }
      out.push({ type: 'arch', pos: [0, 0, 18], color: '#d7c7a4' })
      out.push({ type: 'banner', pos: [-10, 0, 0], color: '#a78bfa' })
      out.push({ type: 'banner', pos: [10, 0, 0], color: '#22d3ee' })
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
      for (let i = 0; i < 35; i++) out.push({ type: 'pine', pos: maybeOnEdge(), scale: 0.7 + r() * 0.7, color: '#1f8b4f', glow: '#86efac' })
      for (let i = 0; i < 12; i++) out.push({ type: 'broadleaf', pos: maybeOnEdge(), scale: 0.8 + r() * 0.5, color: '#2bbf6f' })
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
      {items.map((it, i) => {
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
            return <MarketStall key={i} position={it.pos} />
          case 'building':
            return <Building key={i} position={it.pos} color={it.color} roofColor={(it as any).roofColor} />
          case 'lantern':
            return <Lantern key={i} position={it.pos} color={it.color} />
          case 'arch':
            return <StoneArch key={i} position={it.pos} color={it.color} />
          case 'banner':
            return <Banner key={i} position={it.pos} color={it.color} />
          default:
            return null
        }
      })}
    </>
  )
}
