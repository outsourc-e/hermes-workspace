'use client'

/**
 * Subscribe to /api/swarm-events (SSE) and invalidate react-query caches
 * the moment swarm state changes on disk. Falls back silently to the
 * existing poll intervals when SSE is unavailable; auto-reconnects with
 * backoff when the stream drops.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const KIND_TO_KEYS: Record<string, Array<Array<string>>> = {
  runtime: [['swarm2', 'runtime'], ['swarm2', 'health']],
  queue: [['swarm-queue']],
  goals: [['swarm-goals']],
  pipelines: [['swarm-pipelines']],
  missions: [['swarm2', 'missions']],
  outcomes: [['swarm-scoreboard'], ['swarm-replay-list'], ['swarm-timeline']],
}

export function useSwarmEvents(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    let source: EventSource | null = null
    let retryMs = 2000
    let closed = false

    const connect = () => {
      if (closed) return
      source = new EventSource('/api/swarm-events')
      source.onopen = () => {
        retryMs = 2000
      }
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { changed?: Array<string> }
          for (const kind of payload.changed ?? []) {
            for (const key of KIND_TO_KEYS[kind] ?? []) {
              void queryClient.invalidateQueries({ queryKey: key })
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      }
      source.onerror = () => {
        source?.close()
        if (closed) return
        setTimeout(connect, retryMs)
        retryMs = Math.min(retryMs * 2, 30_000)
      }
    }

    connect()
    return () => {
      closed = true
      source?.close()
    }
  }, [queryClient])
}
