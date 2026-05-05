import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

class GlbErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError?.()
  }
  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

const probeCache = new Map<string, 'unknown' | 'present' | 'missing'>()

export function useGlbProbe(url: string): 'unknown' | 'present' | 'missing' {
  const [state, setState] = useState<'unknown' | 'present' | 'missing'>(
    () => probeCache.get(url) || 'unknown',
  )

  useEffect(() => {
    if (probeCache.get(url) === 'present' || probeCache.get(url) === 'missing') {
      setState(probeCache.get(url)!)
      return
    }
    let cancelled = false
    fetch(url, { method: 'HEAD' })
      .then((r) => {
        if (cancelled) return
        const ct = r.headers.get('content-type') || ''
        const isReal =
          r.ok &&
          !ct.includes('text/html') &&
          (ct.includes('octet-stream') ||
            ct.includes('gltf') ||
            ct.includes('binary') ||
            ct === '' ||
            ct.includes('application/'))
        const v = isReal ? 'present' : 'missing'
        probeCache.set(url, v)
        setState(v)
      })
      .catch(() => {
        if (cancelled) return
        probeCache.set(url, 'missing')
        setState('missing')
      })
    return () => {
      cancelled = true
    }
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
        obj.raycast = () => {}
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

export function OptionalGlbBody({
  url,
  scale = 1,
  yOffset = 0,
}: {
  url: string
  scale?: number
  yOffset?: number
}) {
  const status = useGlbProbe(url)
  const [hardFailed, setHardFailed] = useState(false)
  if (status !== 'present' || hardFailed) return null
  return (
    <GlbErrorBoundary
      onError={() => {
        probeCache.set(url, 'missing')
        setHardFailed(true)
      }}
    >
      <Suspense fallback={null}>
        <GlbInner url={url} scale={scale} yOffset={yOffset} />
      </Suspense>
    </GlbErrorBoundary>
  )
}
