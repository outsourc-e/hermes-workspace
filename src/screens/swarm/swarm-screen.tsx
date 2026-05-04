'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Activity01Icon,
  ChartLineData02Icon,
  ComputerTerminal01Icon,
  FlashIcon,
  RefreshIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { WorkflowHelpModal } from '@/components/workflow-help-modal'
import {
  getOnlineStatus,
  useCrewStatus,
  type CrewMember,
} from '@/hooks/use-crew-status'
import { TopologyBand } from '@/components/swarm/topology-band'
import { AgentCard } from '@/components/swarm/agent-card'
import { WidgetRail } from '@/components/swarm/widget-rail'
import { RouterChat } from '@/components/swarm/router-chat'
import { SwarmTerminal } from '@/components/swarm/swarm-terminal'
import { useQuery } from '@tanstack/react-query'

const SWARM_ROOM_STORAGE_KEY = 'claude-swarm-room-v1'

type WorkerHealth = { workerId: string; recentAuthErrors: number }
type HealthData = { workspaceModel: string | null; workers: WorkerHealth[]; summary: { totalWorkers: number; totalAuthErrors24h: number; distinctProviders: string[] } }
type RuntimeEntry = {
  workerId: string
  currentTask: string | null
  recentLogTail: string | null
  pid: number | null
  startedAt: number | null
  lastOutputAt: number | null
  cwd: string | null
  tmuxSession: string | null
  tmuxAttachable: boolean
  source?: 'runtime.json' | 'fallback'
}

type SwarmViewMode = 'cards' | 'terminals'

async function fetchHealth(): Promise<HealthData> {
  const res = await fetch('/api/swarm-health')
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

async function fetchRuntime(): Promise<{ entries: RuntimeEntry[] }> {
  const res = await fetch('/api/swarm-runtime')
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

function useUpdatedAgo(fetchedAt: number | null): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function update() {
      if (!fetchedAt) return setLabel('')
      const diff = Math.floor((Date.now() - fetchedAt) / 1000)
      if (diff < 5) setLabel('just now')
      else if (diff < 60) setLabel(`${diff}s ago`)
      else setLabel(`${Math.floor(diff / 60)}m ago`)
    }
    update()
    const id = setInterval(update, 5_000)
    return () => clearInterval(id)
  }, [fetchedAt])
  return label
}

function shellCommandForRuntime(runtime: RuntimeEntry | undefined): string[] {
  if (runtime?.tmuxAttachable && runtime.tmuxSession) {
    return ['tmux', 'attach', '-t', runtime.tmuxSession]
  }
  const cwd = runtime?.cwd?.replace(/"/g, '\\"')
  return ['zsh', '-lc', cwd ? `cd "${cwd}" && exec zsh -l` : 'exec zsh -l']
}

function relative(ts: number | null | undefined): string {
  if (!ts) return 'never'
  const d = Date.now() - ts
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

export function SwarmScreen() {
  const navigate = useNavigate()
  const { crew, lastUpdated, isLoading, isFetching, refetch } = useCrewStatus()
  const updatedAgo = useUpdatedAgo(lastUpdated)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [roomIds, setRoomIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(SWARM_ROOM_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : []
    } catch {
      return []
    }
  })
  const [missionOpen, setMissionOpen] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<SwarmViewMode>(() => {
    if (typeof window === 'undefined') return 'cards'
    const params = new URLSearchParams(window.location.search)
    return params.get('view') === 'terminals' ? 'terminals' : 'cards'
  })

  const healthQuery = useQuery({ queryKey: ['swarm', 'health'], queryFn: fetchHealth, refetchInterval: 60_000 })
  const runtimeQuery = useQuery({ queryKey: ['swarm', 'runtime'], queryFn: fetchRuntime, refetchInterval: 30_000 })

  const swarmMembers = useMemo(() => {
    return [...crew]
      .filter((member) => /^swarm\d+$/i.test(member.id))
      .sort((a, b) => {
        const aSwarm = /^swarm\d+$/i.test(a.id)
        const bSwarm = /^swarm\d+$/i.test(b.id)
        if (aSwarm !== bSwarm) return aSwarm ? -1 : 1
        const rank = (member: CrewMember) => {
          if (roomIds.includes(member.id)) return 0
          const status = getOnlineStatus(member)
          if (status === 'online') return 1
          if (status === 'offline') return 2
          return 3
        }
        const r = rank(a) - rank(b)
        if (r !== 0) return r
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0
        return numA - numB
      })
  }, [crew, roomIds])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(SWARM_ROOM_STORAGE_KEY, JSON.stringify(roomIds))
    } catch {
      /* noop */
    }
  }, [roomIds])

  useEffect(() => {
    if (swarmMembers.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !swarmMembers.some((member) => member.id === selectedId)) {
      setSelectedId(swarmMembers[0]?.id ?? null)
    }
  }, [swarmMembers, selectedId])

  const onlineCount = swarmMembers.filter((member) => getOnlineStatus(member) === 'online').length
  const authErrors = healthQuery.data?.summary.totalAuthErrors24h ?? 0
  const workspaceModel = healthQuery.data?.workspaceModel ?? '—'
  const provider = healthQuery.data?.summary.distinctProviders[0] ?? 'anthropic-routing-layer'

  const runtimeByWorker = useMemo(() => {
    const map = new Map<string, RuntimeEntry>()
    for (const entry of runtimeQuery.data?.entries ?? []) map.set(entry.workerId, entry)
    return map
  }, [runtimeQuery.data])

  const selectedRuntime = selectedId ? runtimeByWorker.get(selectedId) : undefined
  const terminalTargets = useMemo(() => {
    if (roomIds.length > 0) {
      return swarmMembers.filter((member) => roomIds.includes(member.id))
    }
    return selectedId ? swarmMembers.filter((member) => member.id === selectedId) : []
  }, [roomIds, selectedId, swarmMembers])

  const toggleRoom = useCallback((id: string) => {
    setRoomIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }, [])

  async function pingSelected() {
    if (!selectedId) return
    setPinging(true)
    setPingResult(null)
    try {
      const res = await fetch('/api/swarm-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workerIds: [selectedId], prompt: `Reply with exactly: ${selectedId.toUpperCase()}_PING_OK`, timeoutSeconds: 60 }),
      })
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
      const data = (await res.json()) as { results?: Array<{ ok: boolean; output: string; error: string | null; durationMs: number }> }
      const r = data.results && data.results[0]
      if (!r) throw new Error('No reply')
      if (!r.ok) setPingResult(`✗ ${selectedId} · ${r.error?.slice(0, 80) ?? 'failure'}`)
      else setPingResult(`✓ ${selectedId} · ${(r.durationMs / 1000).toFixed(1)}s · ${r.output.trim().slice(0, 80)}`)
    } catch (err) {
      setPingResult(`✗ ${err instanceof Error ? err.message : 'failed'}`)
    } finally {
      setPinging(false)
    }
  }

  return (
    <div
      className="relative flex h-full min-h-screen flex-col gap-4 overflow-auto bg-[#0a0d0b] p-4 pb-[420px] text-emerald-50 md:p-6"
      style={{ background: 'radial-gradient(circle at top, rgba(34,197,94,0.10), transparent 28%), linear-gradient(180deg, #0a0d0b 0%, #0c110d 100%)' }}
    >
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-400/20 bg-black/45 px-4 py-2.5 backdrop-blur">
        <div className="inline-flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
            <HugeiconsIcon icon={CpuIcon} size={14} />
          </div>
          <div className="text-sm font-bold tracking-tight text-white">Swarm OS</div>
        </div>
        <Chip icon={ChartLineData02Icon} label="Model" value={workspaceModel} />
        <Chip icon={Activity01Icon} label="Provider" value={provider} />
        <Chip icon={FlashIcon} label="Auth errors 24h" value={String(authErrors)} tone={authErrors === 0 ? 'good' : 'warn'} />
        <Chip icon={ViewIcon} label="Online" value={`${onlineCount}/${swarmMembers.length} agents`} tone="good" />
        {pingResult ? (
          <div className={cn('truncate rounded-full border px-3 py-1 text-[11px]', pingResult.startsWith('✓') ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200')}>
            {pingResult}
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <WorkflowHelpModal
            compact
            eyebrow="Swarm"
            title="How Swarm works"
            sections={[
              {
                title: 'What Swarm is for',
                bullets: [
                  'Swarm is the multi-worker orchestration surface for parallel execution.',
                  'Use it when one goal should be split across several agents with live visibility and routing.',
                ],
              },
              {
                title: 'Typical flow',
                bullets: [
                  'Select workers, dispatch targeted tasks, and monitor progress from the hub and cards.',
                  'Use ping, refresh, and card status to triage stuck or unhealthy workers quickly.',
                ],
              },
              {
                title: 'FAQ',
                bullets: [
                  'If workers look empty or unhealthy, fix setup and runtime issues in Operations first.',
                  'Swarm is best for coordination and throughput, not first-time configuration.',
                ],
              },
            ]}
          />
          <ViewModeToggle mode={viewMode} setMode={setViewMode} />
          {updatedAgo ? <div className="text-[11px] text-emerald-200/55">Updated {updatedAgo}</div> : null}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-emerald-200/70 hover:text-white"
          >
            <HugeiconsIcon icon={RefreshIcon} size={11} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={pingSelected}
            disabled={!selectedId || pinging}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-300 disabled:opacity-50"
          >
            <HugeiconsIcon icon={FlashIcon} size={12} />
            {pinging ? 'Pinging…' : `Ping ${selectedId ?? 'selected'}`}
          </button>
        </div>
      </header>

      <TopologyBand
        members={swarmMembers}
        selectedId={selectedId}
        roomIds={roomIds}
        onSelect={setSelectedId}
        onToggleRoom={toggleRoom}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/65">Agent Workspace</div>
              <h2 className="text-xl font-semibold text-white">
                {viewMode === 'cards' ? 'Active Swarm' : 'Live Agent Terminals'}
              </h2>
              <p className="mt-0.5 text-sm text-emerald-50/55">
                {viewMode === 'cards'
                  ? 'Operations-style cards, visible room wiring, and inline worker chat.'
                  : 'Flip into terminal mode to inspect each worker session directly without leaving Swarm.'}
              </p>
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/55">
              {viewMode === 'cards'
                ? `${swarmMembers.length} workers`
                : `${terminalTargets.length || 0} terminal${terminalTargets.length === 1 ? '' : 's'} visible`}
            </div>
          </div>

          {viewMode === 'cards' ? (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                : swarmMembers.map((member) => {
                    const runtime = runtimeByWorker.get(member.id)
                    const lines = runtime?.recentLogTail
                      ? runtime.recentLogTail
                          .split('\n')
                          .filter(Boolean)
                          .slice(-2)
                          .map((line) => line.replace(/^\d{4}-\d{2}-\d{2} [^ ]+\s+/, ''))
                      : []
                    return (
                      <AgentCard
                        key={member.id}
                        member={member}
                        currentTask={runtime?.currentTask ?? member.lastSessionTitle}
                        recentLines={lines}
                        inRoom={roomIds.includes(member.id)}
                        selected={member.id === selectedId}
                        onSelect={() => setSelectedId(member.id)}
                        onToggleRoom={() => toggleRoom(member.id)}
                        onOpenTui={() => {
                          setSelectedId(member.id)
                          setViewMode('terminals')
                        }}
                        onOpenTasks={() => void navigate({ to: '/tasks', search: { assignee: member.id } })}
                      />
                    )
                  })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-[1.5rem] border border-emerald-400/15 bg-black/35 px-4 py-3 text-sm text-emerald-50/70 backdrop-blur">
                {roomIds.length > 0
                  ? `Showing live terminals for the active room: ${roomIds.join(', ')}.`
                  : selectedId
                    ? `Showing ${selectedId}. Add workers to the room to monitor several at once.`
                    : 'Select a worker or add some to the room to open terminals here.'}
              </div>

              {terminalTargets.length === 0 ? (
                <div className="rounded-[1.5rem] border border-emerald-400/12 bg-emerald-500/5 px-4 py-10 text-center text-sm text-emerald-100/55">
                  No terminal targets yet.
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {terminalTargets.map((member) => {
                    const runtime = runtimeByWorker.get(member.id)
                    return (
                      <div key={member.id} className="overflow-hidden rounded-[1.6rem] border border-emerald-400/18 bg-[#0b0f0c]/80 p-3 backdrop-blur-xl">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/60">{member.id}</div>
                            <div className="text-base font-semibold text-white">{runtime?.currentTask ?? member.lastSessionTitle ?? 'Idle session'}</div>
                            <div className="mt-1 text-xs text-emerald-100/50">
                              {runtime?.tmuxAttachable ? `tmux ${runtime.tmuxSession}` : 'shell fallback'} · last output {relative(runtime?.lastOutputAt)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedId(member.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/15 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-200/70 hover:text-white"
                          >
                            <HugeiconsIcon icon={ComputerTerminal01Icon} size={11} />
                            Focus
                          </button>
                        </div>
                        <SwarmTerminal
                          workerId={member.id}
                          command={shellCommandForRuntime(runtime)}
                          cwd={runtime?.cwd ?? undefined}
                          height={360}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <WidgetRail
          members={swarmMembers}
          roomIds={roomIds}
          selectedId={selectedId}
          onOpenMission={() => setMissionOpen(true)}
          onToggleRoom={toggleRoom}
        />
      </div>

      <RouterChat
        members={swarmMembers}
        roomIds={roomIds}
        selectedId={selectedId}
        open={missionOpen}
        onClose={() => setMissionOpen(false)}
        onResults={() => void refetch()}
      />

      {!missionOpen ? (
        <button
          type="button"
          onClick={() => setMissionOpen(true)}
          className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-black shadow-[0_18px_40px_rgba(34,197,94,0.35)] hover:bg-emerald-300"
        >
          Open Agent Router Chat ↑
        </button>
      ) : null}
    </div>
  )
}

function ViewModeToggle({ mode, setMode }: { mode: SwarmViewMode; setMode: (mode: SwarmViewMode) => void }) {
  return (
    <div className="flex rounded-full border border-emerald-400/20 bg-black/40 p-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200/65">
      <button
        type="button"
        onClick={() => setMode('cards')}
        className={cn('rounded-full px-3 py-1 transition-colors', mode === 'cards' ? 'bg-emerald-400 text-black' : 'hover:text-white')}
      >
        Cards
      </button>
      <button
        type="button"
        onClick={() => setMode('terminals')}
        className={cn('rounded-full px-3 py-1 transition-colors', mode === 'terminals' ? 'bg-emerald-400 text-black' : 'hover:text-white')}
      >
        Terminals
      </button>
    </div>
  )
}

function Chip({ icon, label, value, tone = 'neutral' }: { icon: typeof CpuIcon; label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]',
        tone === 'good'
          ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
          : tone === 'warn'
            ? 'border-amber-400/35 bg-amber-500/10 text-amber-200'
            : 'border-emerald-400/15 bg-black/35 text-emerald-100/75',
      )}
    >
      <HugeiconsIcon icon={icon} size={11} />
      <span className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/55">{label}</span>
      <span className="truncate text-emerald-50">{value}</span>
    </div>
  )
}

function SkeletonCard() {
  return <div className="h-[420px] animate-pulse rounded-2xl border border-emerald-400/10 bg-emerald-500/5" />
}
