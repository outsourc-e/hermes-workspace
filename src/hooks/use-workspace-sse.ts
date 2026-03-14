import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'

const DAEMON_URL = ''
const RECONNECT_DELAY_MS = 3_000
const EVENTS_URL = DAEMON_URL ? `${DAEMON_URL}/api/workspace/events` : '/api/workspace/events'

type QueryKey = Array<string>

function invalidateQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: Array<QueryKey>,
) {
  for (const key of keys) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}

function parseSseData(event: MessageEvent<string>): Record<string, unknown> | null {
  if (!event.data) return null

  try {
    const parsed = JSON.parse(event.data) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function useWorkspaceSse() {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimer: number | null = null
    let disposed = false

    function clearReconnectTimer() {
      if (reconnectTimer === null) return
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    function scheduleReconnect() {
      if (disposed || reconnectTimer !== null) return
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        if (!disposed) connect()
      }, RECONNECT_DELAY_MS)
    }

    function connect() {
      clearReconnectTimer()
      eventSource?.close()
      setConnected(false)

      const es = new EventSource(EVENTS_URL)
      eventSource = es

      es.onopen = () => {
        if (disposed) return
        setConnected(true)
      }

      es.addEventListener('task_run.started', () => {
        invalidateQueries(queryClient, [
          ['workspace', 'task-runs'],
          ['workspace', 'missions'],
          ['workspace', 'mission-console'],
          ['workspace', 'projects'],
          ['workspace', 'project-snapshots'],
          ['workspace', 'stats'],
        ])
      })

      es.addEventListener('task_run.updated', () => {
        invalidateQueries(queryClient, [
          ['workspace', 'task-runs'],
          ['workspace', 'mission-console'],
        ])
      })

      es.addEventListener('task_run.completed', (event) => {
        invalidateQueries(queryClient, [
          ['workspace', 'task-runs'],
          ['workspace', 'missions'],
          ['workspace', 'mission-console'],
          ['workspace', 'checkpoints'],
          ['workspace', 'projects'],
          ['workspace', 'project-snapshots'],
          ['workspace', 'layout', 'project-detail'],
          ['workspace', 'stats'],
          ['workspace', 'events'],
        ])

        const payload = parseSseData(event)
        const taskName =
          typeof payload?.task_name === 'string' && payload.task_name.trim().length > 0
            ? payload.task_name.trim()
            : 'Task'
        const status = payload?.status

        if (status === 'completed') {
          toast(`✅ ${taskName} completed — ready for review`, {
            type: 'success',
            icon: '✅',
          })
          return
        }

        if (status === 'failed') {
          toast(`❌ ${taskName} failed`, {
            type: 'error',
            icon: '❌',
          })
        }
      })

      es.addEventListener('checkpoint.created', () => {
        invalidateQueries(queryClient, [
          ['workspace', 'checkpoints'],
          ['workspace', 'projects'],
          ['workspace', 'project-detail'],
          ['workspace', 'layout', 'project-detail'],
        ])
      })

      es.addEventListener('checkpoint.updated', () => {
        invalidateQueries(queryClient, [
          ['workspace', 'checkpoints'],
          ['workspace', 'projects'],
          ['workspace', 'project-detail'],
          ['workspace', 'layout', 'project-detail'],
        ])
      })

      es.addEventListener('mission.updated', () => {
        invalidateQueries(queryClient, [
          ['workspace', 'missions'],
          ['workspace', 'mission-console'],
          ['workspace', 'projects'],
          ['workspace', 'project-snapshots'],
          ['workspace', 'layout', 'project-detail'],
          ['workspace', 'stats'],
        ])
      })

      es.addEventListener('agent.updated', () => {
        invalidateQueries(queryClient, [
          ['workspace', 'agents'],
          ['workspace', 'agents-directory'],
        ])
      })

      es.addEventListener('audit', () => {
        invalidateQueries(queryClient, [['workspace', 'audit-log']])
      })

      es.onerror = () => {
        if (disposed) return
        setConnected(false)
        es.close()
        if (eventSource === es) {
          eventSource = null
        }
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      disposed = true
      clearReconnectTimer()
      eventSource?.close()
      eventSource = null
    }
  }, [queryClient])

  return { connected }
}
