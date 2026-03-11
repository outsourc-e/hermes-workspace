import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const DAEMON_URL = 'http://localhost:3099'
const RECONNECT_DELAY_MS = 3_000

type QueryKey = Array<string>

function invalidateQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  keys: Array<QueryKey>,
) {
  for (const key of keys) {
    void queryClient.invalidateQueries({ queryKey: key })
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

      const es = new EventSource(`${DAEMON_URL}/api/events`)
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

      es.addEventListener('task_run.completed', () => {
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
