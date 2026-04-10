import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Takes a raw streaming text string that updates in chunks (full replacement)
 * and returns a smoothly animated version that reveals characters progressively
 * using requestAnimationFrame — exactly like the Telegram/Discord streaming feel.
 */
export function useSmoothStreamingText(
  targetText: string,
  enabled = true,
): string {
  const [renderedText, setRenderedText] = useState('')
  const renderedRef = useRef('')
  const targetRef = useRef(targetText)
  const frameRef = useRef<number | null>(null)

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopFrame()
  }, [stopFrame])

  useEffect(() => {
    if (!enabled) {
      renderedRef.current = targetText
      setRenderedText(targetText)
      stopFrame()
      return
    }

    targetRef.current = targetText

    // If target shrank or changed non-additively (e.g. error reset), snap
    if (
      renderedRef.current.length > targetText.length ||
      !targetText.startsWith(renderedRef.current)
    ) {
      renderedRef.current = ''
      setRenderedText('')
    }

    // Already caught up
    if (renderedRef.current === targetText) {
      stopFrame()
      return
    }

    // Already ticking
    if (frameRef.current !== null) return

    const tick = () => {
      const current = renderedRef.current
      const next = targetRef.current

      if (current === next) {
        frameRef.current = null
        return
      }

      // Adaptive step: bigger jumps when far behind, 1-char when close
      const remaining = next.length - current.length
      const step =
        remaining > 60 ? Math.ceil(remaining / 8) : remaining > 20 ? 3 : 1
      const nextLength = Math.min(next.length, current.length + step)
      const nextText = next.slice(0, nextLength)

      renderedRef.current = nextText
      setRenderedText(nextText)

      frameRef.current = window.requestAnimationFrame(tick)
    }

    frameRef.current = window.requestAnimationFrame(tick)
  }, [targetText, enabled, stopFrame])

  return enabled ? renderedText : targetText
}
