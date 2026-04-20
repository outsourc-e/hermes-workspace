/**
 * usePullToRefresh — touch-based pull-to-refresh for mobile.
 *
 * Attaches touchstart/touchmove/touchend listeners to the given container ref.
 * When user pulls down ≥ threshold px from scrollTop=0, calls onRefresh().
 *
 * No external libraries. Mobile-only (gated by `enabled` flag).
 */
import { useEffect, useRef, useState } from 'react'

export type PullToRefreshState = {
  isPulling: boolean
  pullDistance: number
  threshold: number
}

const THRESHOLD = 72 // px to trigger refresh

export function usePullToRefresh(
  enabled: boolean,
  onRefresh: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
): PullToRefreshState {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)

  const startYRef = useRef(0)
  const isPullingRef = useRef(false)
  const pullDistanceRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const container = containerRef.current
    if (!container) return

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0]
      if (!touch) return
      // Only start pull if at the top of the scroll
      if (container!.scrollTop === 0) {
        startYRef.current = touch.clientY
        isPullingRef.current = true
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPullingRef.current) return
      const touch = e.touches[0]
      if (!touch) return
      const delta = touch.clientY - startYRef.current
      if (delta > 0) {
        const clamped = Math.min(delta, THRESHOLD * 1.5)
        pullDistanceRef.current = clamped
        setPullDistance(clamped)
        setIsPulling(delta > 10)
      }
    }

    function onTouchEnd() {
      if (!isPullingRef.current) return
      const dist = pullDistanceRef.current
      isPullingRef.current = false
      if (dist >= THRESHOLD) {
        onRefresh()
      }
      setIsPulling(false)
      setPullDistance(0)
      pullDistanceRef.current = 0
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    container.addEventListener('touchend', onTouchEnd)

    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [enabled, onRefresh, containerRef])

  return { isPulling, pullDistance, threshold: THRESHOLD }
}
