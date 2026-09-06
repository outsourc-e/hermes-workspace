/**
 * SwarmStatusWidget — shows health and state of all swarm workers
 */
import { useEffect, useState } from 'react'

type WorkerState = {
  id: string
  status: 'idle' | 'running' | 'error' | 'unknown'
  lastSeen: number | null
}

const WORKERS = [
  'orchestrator',
  'km-agent',
  'builder',
  'reviewer',
  'qa',
  'researcher',
  'ops-watch',
  'maintainer',
  'strategist',
  'inbox-triage',
  'swarm5',
]

function statusColor(s: string) {
  switch (s) {
    case 'running':
      return 'bg-emerald-500'
    case 'idle':
      return 'bg-blue-400'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-[var(--theme-muted)]'
  }
}

export function SwarmStatusWidget() {
  const [workers, setWorkers] = useState<Array<WorkerState>>([])

  useEffect(() => {
    const load = async () => {
      const results = await Promise.allSettled(
        WORKERS.map(async (id) => {
          try {
            const r = await fetch(`/api/swarm-project?workerId=${id}`)
            const d = await r.json()
            return {
              id,
              status: d.error ? ('error' as const) : ('idle' as const),
              lastSeen: Date.now(),
            }
          } catch {
            return { id, status: 'unknown' as const, lastSeen: null }
          }
        }),
      )
      setWorkers(
        results.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : { id: WORKERS[i], status: 'unknown' as const, lastSeen: null },
        ),
      )
    }
    load()
    const iv = setInterval(load, 60000)
    return () => clearInterval(iv)
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--theme-muted)] uppercase tracking-wider">
          Swarm
        </span>
        <span className="text-[10px] text-[var(--theme-muted)]">
          {
            workers.filter((w) => w.status === 'idle' || w.status === 'running')
              .length
          }
          /{WORKERS.length}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {workers.map((w) => (
          <div key={w.id} className="flex flex-col items-center gap-0.5">
            <div className={`w-2 h-2 rounded-full ${statusColor(w.status)}`} />
            <span className="text-[9px] text-[var(--theme-muted)] truncate w-full text-center">
              {w.id}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
