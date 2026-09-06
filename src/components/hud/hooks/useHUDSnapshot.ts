import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { HUDSnapshot, WidgetSnapshot } from '../../../server/hud/types'

/**
 * Primary HUD data source. Layered transport:
 *   1. useQuery against /api/hud/snapshot — primes the cache on mount,
 *      keeps a 60s polling fallback so the dashboard still updates if the
 *      SSE connection drops and never comes back.
 *   2. EventSource against /api/hud/stream — pushes the full snapshot on
 *      connect, then per-widget delta updates as sources change. Merges
 *      directly into the React Query cache via setQueryData.
 *
 * EventSource auto-reconnects on transient disconnect; we only surface
 * the live-vs-fallback distinction in the returned `live` flag so the UI
 * can render a quiet indicator if desired.
 */
export function useHUDSnapshot() {
  const queryClient = useQueryClient()
  const [live, setLive] = useState(false)

  const query = useQuery<HUDSnapshot>({
    queryKey: ['hud', 'snapshot'],
    queryFn: async () => {
      const res = await fetch('/api/hud/snapshot')
      if (!res.ok) throw new Error('snapshot fetch ' + res.status)
      return res.json()
    },
    // Long polling interval — SSE handles the live updates. The poll is a
    // backstop so the dashboard still refreshes if SSE is blocked by a
    // proxy / network condition.
    refetchInterval: 60_000,
    staleTime: 55_000,
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined')
      return

    const es = new EventSource('/api/hud/stream')

    es.addEventListener('snapshot', (ev) => {
      try {
        const snap = JSON.parse(ev.data) as HUDSnapshot
        queryClient.setQueryData(['hud', 'snapshot'], snap)
        setLive(true)
      } catch {
        // ignore malformed event
      }
    })

    es.addEventListener('widget', (ev) => {
      try {
        const payload = JSON.parse(ev.data) as {
          id: string
          snapshot: WidgetSnapshot
        }
        queryClient.setQueryData<HUDSnapshot | undefined>(
          ['hud', 'snapshot'],
          (prev) => {
            if (!prev) return prev
            return {
              ...prev,
              generatedAt: Date.now(),
              widgets: { ...prev.widgets, [payload.id]: payload.snapshot },
            }
          },
        )
      } catch {
        // ignore malformed event
      }
    })

    es.addEventListener('error', () => {
      // EventSource will auto-reconnect; if it fails persistently the
      // useQuery polling above keeps the dashboard alive.
      setLive(false)
    })

    return () => {
      es.close()
      setLive(false)
    }
  }, [queryClient])

  return Object.assign(query, { live })
}
