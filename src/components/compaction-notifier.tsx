'use client'

/**
 * CompactionNotifier — gateway-driven compaction detection.
 *
 * Listens to the /api/chat-events SSE stream for gateway `compaction` events
 * (stream="compaction", phase="start"|"end") — the exact same signal the
 * Hermes control UI uses. No polling, no heuristics.
 *
 * Shows a toast on any screen:
 *   - phase "start"  → amber "Compacting context…" (dismissible)
 *   - phase "end"    → green "Context compacted" (auto-dismisses)
 */

import { useEffect, useRef } from 'react'
import { toast } from '@/components/ui/toast'

export function CompactionNotifier() {
  const startToastIdRef = useRef<boolean>(false)

  useEffect(() => {
    let es: EventSource | null = null
    let active = true

    function connect() {
      if (!active) return
      es = new EventSource('/api/chat-events')

      es.addEventListener('compaction', (e: MessageEvent) => {
        if (!active) return
        try {
          const data = JSON.parse(e.data) as { phase?: string; sessionKey?: string }

          if (data.phase === 'start') {
            startToastIdRef.current = true
            toast('🗜️ Compacting context… older messages will be summarized', {
              type: 'info',
              duration: 30_000,
            })
          } else if (data.phase === 'end') {
            startToastIdRef.current = false
            toast('✅ Context compacted — session history summarized', {
              type: 'success',
              duration: 5_000, // matches gateway's Wp=5000 auto-clear
            })
          }
        } catch {
          /* ignore malformed event */
        }
      })

      es.addEventListener('error', () => {
        // SSE error — the main chat-events connection handles reconnect;
        // just close this instance and let it reconnect naturally.
        es?.close()
        es = null
      })
    }

    connect()

    return () => {
      active = false
      es?.close()
      es = null
    }
  }, [])

  return null
}
