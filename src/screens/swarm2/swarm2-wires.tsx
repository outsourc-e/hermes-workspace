'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type WireTarget = {
  id: string
  selected: boolean
  inRoom: boolean
}

type Swarm2WiresProps = {
  /** The container the wires draw inside (positioned `relative`). */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Anchor at the bottom of the orchestrator card. */
  anchorRef: React.RefObject<HTMLDivElement | null> | { current: HTMLDivElement | null }
  /** Each worker card root element keyed by worker id. */
  workerRefs: Map<string, HTMLElement>
  workers: Array<WireTarget>
  version?: number
}

type Geom = {
  width: number
  height: number
  origin: { x: number; y: number } | null
  endpoints: Map<string, { x: number; y: number }>
}

const EMPTY_GEOM: Geom = {
  width: 0,
  height: 0,
  origin: null,
  endpoints: new Map(),
}

function computeGeom(
  container: HTMLElement,
  anchor: HTMLElement | null,
  refs: Map<string, HTMLElement>,
  workers: Array<WireTarget>,
): Geom {
  const containerRect = container.getBoundingClientRect()
  const width = containerRect.width
  const height = containerRect.height
  const origin = anchor
    ? (() => {
        const r = anchor.getBoundingClientRect()
        return {
          x: r.left + r.width / 2 - containerRect.left,
          y: r.top + r.height / 2 - containerRect.top,
        }
      })()
    : null
  const endpoints = new Map<string, { x: number; y: number }>()
  for (const worker of workers) {
    const el = refs.get(worker.id)
    if (!el) continue
    const r = el.getBoundingClientRect()
    endpoints.set(worker.id, {
      x: r.left + r.width / 2 - containerRect.left,
      y: r.top - containerRect.top + 6,
    })
  }
  return { width, height, origin, endpoints }
}

export function Swarm2Wires({
  containerRef,
  anchorRef,
  workerRefs,
  workers,
}: Swarm2WiresProps) {
  const [geom, setGeom] = useState<Geom>(EMPTY_GEOM)
  const rafRef = useRef<number | null>(null)

  const schedule = () => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const c = containerRef.current
      if (!c) {
        setGeom(EMPTY_GEOM)
        return
      }
      setGeom(computeGeom(c, anchorRef.current, workerRefs, workers))
    })
  }

  useLayoutEffect(() => {
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers.length])

  useEffect(() => {
    schedule()
    const c = containerRef.current
    if (!c) return undefined
    const ro = new ResizeObserver(() => schedule())
    ro.observe(c)
    workerRefs.forEach((el) => ro.observe(el))
    if (anchorRef.current) ro.observe(anchorRef.current)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers.length])

  if (geom.width === 0 || !geom.origin) return null

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[2]"
      width={geom.width}
      height={geom.height}
      viewBox={`0 0 ${geom.width} ${geom.height}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="swarm2-wire" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(251,191,36,0.62)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.32)" />
        </linearGradient>
        <linearGradient id="swarm2-hot-wire" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(251,191,36,0.98)" />
          <stop offset="50%" stopColor="rgba(245,158,11,0.82)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.52)" />
        </linearGradient>
        <style>{`
          @keyframes swarm2-flow {
            from { stroke-dashoffset: 0; }
            to { stroke-dashoffset: -24; }
          }
          .swarm2-wire-hot {
            animation: swarm2-flow 1.6s linear infinite;
          }
        `}</style>
      </defs>
      {workers.map((worker) => {
        const end = geom.endpoints.get(worker.id)
        if (!end || !geom.origin) return null
        const isHot = worker.selected || worker.inRoom
        const dx = end.x - geom.origin.x
        const dy = end.y - geom.origin.y
        const cx1 = geom.origin.x + dx * 0.15
        const cy1 = geom.origin.y + Math.max(40, dy * 0.45)
        const cx2 = end.x - dx * 0.15
        const cy2 = end.y - Math.max(30, dy * 0.35)
        const path = `M ${geom.origin.x} ${geom.origin.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${end.x} ${end.y}`
        return (
          <g key={worker.id}>
            <path
              d={path}
              fill="none"
              stroke="url(#swarm2-wire)"
              strokeWidth={isHot ? 2.2 : 1.5}
              strokeLinecap="round"
              strokeDasharray={isHot ? undefined : "5 10"}
              opacity={isHot ? 0.82 : 0.64}
            />
            {isHot ? (
              <path
                d={path}
                fill="none"
                stroke="url(#swarm2-hot-wire)"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeDasharray="6 14"
                className="swarm2-wire-hot"
                opacity={1}
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
