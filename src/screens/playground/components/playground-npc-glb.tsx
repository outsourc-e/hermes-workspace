/**
 * Optional GLB-based NPC body.
 *
 * If `/avatars-3d/<id>.glb` exists, render it instead of the voxel body.
 * Otherwise the parent renders nothing extra and the voxel mesh shows.
 *
 * Generation pipeline (manual, one-time):
 *   1. Visit https://www.meshy.ai/ (or Tripo3D).
 *   2. Prompt per Greek god, e.g. "Greek goddess Athena, helmet, robe,
 *      stylized low-poly, T-pose, full body, suitable for game character".
 *   3. Download GLB, drop into `public/avatars-3d/athena.glb`.
 *   4. Reload — character now has a real 3D body.
 *
 * Optimization notes:
 *   - useGLTF caches across instances (drei).
 *   - We freeze materials and disable raycasting on geometry to avoid
 *     pointer hit cost when the parent already handles clicks.
 */
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

class GlbErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError?.() }
  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

type Props = {
  /** NPC id; will look for `/avatars-3d/<id>.glb`. */
  npcId: string
  /** Scale relative to voxel body (voxel body is ~1.6u tall). */
  scale?: number
  /** Y offset to align feet to ground. */
  yOffset?: number
}

/**
 * Module-level cache of probed URLs so we don't 404-spam on repeated
 * mounts. Maps url -> 'unknown' | 'present' | 'missing'.
 */
const probeCache = new Map<string, 'unknown' | 'present' | 'missing'>()

function useGlbProbe(url: string): 'unknown' | 'present' | 'missing' {
  const [state, setState] = useState<'unknown' | 'present' | 'missing'>(
    () => probeCache.get(url) || 'unknown',
  )
  useEffect(() => {
    if (probeCache.get(url) === 'present' || probeCache.get(url) === 'missing') {
      setState(probeCache.get(url)!)
      return
    }
    let cancelled = false
    // Important: TanStack Start's catch-all returns 200 + text/html for
    // missing static files. We must inspect Content-Type to know if a
    // real GLB exists, otherwise useGLTF will try to parse HTML and crash.
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (cancelled) return
        const ct = r.headers.get('content-type') || ''
        const isReal = r.ok
          && !ct.includes('text/html')
          && (ct.includes('octet-stream') || ct.includes('gltf') || ct.includes('binary') || ct === '' || ct.includes('application/'))
        const v = isReal ? 'present' : 'missing'
        probeCache.set(url, v)
        setState(v)
      })
      .catch(() => {
        if (cancelled) return
        probeCache.set(url, 'missing')
        setState('missing')
      })
    return () => { cancelled = true }
  }, [url])
  return state
}

function GlbInner({ url, scale, yOffset }: { url: string; scale: number; yOffset: number }) {
  const { scene } = useGLTF(url) as any
  const ref = useRef<THREE.Group>(null)
  const cloned = useMemo(() => {
    const s = (scene as THREE.Object3D).clone(true)
    s.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = false
        obj.raycast = () => {} // parent handles click
        if (obj.material && obj.material.map) {
          obj.material.map.anisotropy = 4
        }
      }
    })
    return s
  }, [scene])
  return (
    <group ref={ref} position={[0, yOffset, 0]} scale={scale}>
      <primitive object={cloned} />
    </group>
  )
}

/**
 * Renders <PlaygroundNpcGlb> only when the GLB is actually present.
 * Returns null otherwise so the parent's voxel body shows.
 */
export function PlaygroundNpcGlb({ npcId, scale = 1, yOffset = 0 }: Props) {
  const url = `/avatars-3d/${npcId}.glb`
  const status = useGlbProbe(url)
  const [hardFailed, setHardFailed] = useState(false)
  if (status !== 'present' || hardFailed) return null
  return (
    <GlbErrorBoundary onError={() => {
      probeCache.set(url, 'missing')
      setHardFailed(true)
    }}>
      <Suspense fallback={null}>
        <GlbInner url={url} scale={scale} yOffset={yOffset} />
      </Suspense>
    </GlbErrorBoundary>
  )
}
