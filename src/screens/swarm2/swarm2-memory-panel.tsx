'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type SwarmMemoryFile = {
  name: string
  path: string
  content: string
}

type SwarmMemoryReadResponse = {
  ok: boolean
  workerId: string
  kind: string
  root: string
  files: Array<SwarmMemoryFile>
}

type Swarm2MemoryPanelProps = {
  workerId: string
  className?: string
}

async function fetchProfileMemory(workerId: string): Promise<SwarmMemoryReadResponse> {
  const res = await fetch(`/api/swarm-memory?workerId=${encodeURIComponent(workerId)}&kind=profile`)
  if (!res.ok) throw new Error(`swarm-memory HTTP ${res.status}`)
  return (await res.json()) as SwarmMemoryReadResponse
}

async function fetchEpisodicMemory(workerId: string): Promise<SwarmMemoryReadResponse> {
  const res = await fetch(`/api/swarm-memory?workerId=${encodeURIComponent(workerId)}&kind=episodic`)
  if (!res.ok) throw new Error(`swarm-memory HTTP ${res.status}`)
  return (await res.json()) as SwarmMemoryReadResponse
}

function tail(content: string, max = 1200): string {
  if (!content) return ''
  if (content.length <= max) return content
  return `… ${content.slice(content.length - max)}`
}

export function Swarm2MemoryPanel({ workerId, className }: Swarm2MemoryPanelProps) {
  const profileQuery = useQuery({
    queryKey: ['swarm-memory', 'profile', workerId],
    queryFn: () => fetchProfileMemory(workerId),
    enabled: Boolean(workerId),
    staleTime: 30_000,
  })
  const episodicQuery = useQuery({
    queryKey: ['swarm-memory', 'episodic', workerId],
    queryFn: () => fetchEpisodicMemory(workerId),
    enabled: Boolean(workerId),
    staleTime: 15_000,
  })

  const memory = useMemo(() => profileQuery.data?.files.find((f) => f.name === 'MEMORY.md')?.content ?? '', [profileQuery.data])
  const identity = useMemo(() => profileQuery.data?.files.find((f) => f.name === 'IDENTITY.md')?.content ?? '', [profileQuery.data])

  const latestEpisode = useMemo(() => {
    const files = episodicQuery.data?.files ?? []
    if (!files.length) return null
    const sorted = [...files].sort((a, b) => b.name.localeCompare(a.name))
    return sorted[0]
  }, [episodicQuery.data])

  if (!profileQuery.data && profileQuery.isPending) {
    return (
      <section className={cn('rounded-[1.25rem] border border-[var(--theme-border)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2', className)}>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)]/80">Memory</div>
        <div className="mt-1 text-[11px] text-[var(--theme-muted)]">Loading…</div>
      </section>
    )
  }

  return (
    <section className={cn('rounded-[1.25rem] border border-[var(--theme-border)] bg-[color:rgba(255,255,255,0.02)] px-3 py-2', className)}>
      <header className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-[var(--theme-muted)]/85">
        <span>Memory</span>
        <span className="text-[9px] normal-case tracking-normal text-[var(--theme-muted)]/70">
          {profileQuery.data?.root?.replace('/Users/aurora', '~') ?? '—'}
        </span>
      </header>

      {identity ? (
        <details className="mb-1.5 text-[11px] text-[var(--theme-muted-2)]" open>
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]/85">Identity</summary>
          <pre className="mt-1 max-h-[6rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-snug">
            {tail(identity, 600)}
          </pre>
        </details>
      ) : null}

      {memory ? (
        <details className="mb-1.5 text-[11px] text-[var(--theme-muted-2)]">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]/85">MEMORY.md</summary>
          <pre className="mt-1 max-h-[10rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-snug">
            {tail(memory, 1200)}
          </pre>
        </details>
      ) : (
        <div className="text-[11px] text-[var(--theme-muted)]">No durable memory yet for {workerId}.</div>
      )}

      {latestEpisode ? (
        <details className="text-[11px] text-[var(--theme-muted-2)]">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]/85">Latest episodes — {latestEpisode.name}</summary>
          <pre className="mt-1 max-h-[10rem] overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-snug">
            {tail(latestEpisode.content, 1400)}
          </pre>
        </details>
      ) : null}
    </section>
  )
}
