import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  ComputerTerminal01Icon,
  DashboardSquare01Icon,
  PlayIcon,
  Rocket01Icon,
  Settings02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { usePageTitle } from '@/hooks/use-page-title'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────────

type GatewayStatus = {
  capabilities?: Record<string, boolean>
  mode?: string
  gateway?: { available: boolean; url: string }
  dashboard?: { available: boolean; url?: string }
}

type MissionMetrics = {
  ok: boolean
  metrics: {
    total: number
    active: number
    completed: number
    failed: number
    byState: Record<string, number>
  }
}

type MissionListResponse = {
  ok: boolean
  missions?: Array<{
    id: string
    title: string
    version?: number
    nodes?: Array<{ id: string; title: string; state: string; role: string }>
  }>
}

type SwarmHealthResponse = {
  checkedAt?: number
  workers?: Array<{
    workerId: string
    displayName: string
    humanLabel: string
    role: string
    model: string
    provider: string
    profileFound: boolean
    modelAuthStatus: string
    recentAuthErrors: number
  }>
  summary?: {
    totalWorkers: number
    wrappersConfigured: number
    totalAuthErrors24h: number
    degraded: boolean
    warnings: Array<string>
  }
}

type ApprovalsResponse = {
  ok: boolean
  approvals?: Array<{
    id: string
    missionId: string
    actionId: string
    risk: string
    target: string
    status: string
    requestedBy: string
    expiresAt: number
  }>
}

type SessionSummary = {
  key: string
  title?: string
  model?: string
  updatedAt?: number
  status?: string
  message_count?: number
}

type SessionsResponse = {
  sessions?: Array<SessionSummary>
  source?: string
}

// ── API helpers ──────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── UI helpers ───────────────────────────────────────────────────

function timeAgo(ts: number | undefined): string {
  if (!ts) return '—'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function statusColor(status: string): string {
  const s = status.toLowerCase()
  if (['done', 'complete', 'completed', 'success', 'ready'].includes(s))
    return 'text-emerald-600'
  if (['running', 'dispatched', 'leased'].includes(s))
    return 'text-blue-600'
  if (['blocked', 'failed', 'error'].includes(s))
    return 'text-red-600'
  if (['review', 'verifying', 'needs_input'].includes(s))
    return 'text-amber-600'
  return 'text-primary-600'
}

// ── Card wrapper ─────────────────────────────────────────────────

function Card({
  title,
  icon,
  children,
  action,
}: {
  title: string
  icon: typeof DashboardSquare01Icon
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/50 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={icon} className="size-5 text-accent-600" />
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-primary-600">
      <div className="inline-block size-4 animate-spin rounded-full border-2 border-accent-500 border-r-transparent" />
      {label}
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-primary-200 bg-surface px-4 py-3 text-sm text-primary-600">
      {message}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-primary-50 p-3 text-center">
      <strong
        className={cn(
          'block text-xl font-bold tabular-nums',
          accent ? 'text-accent-600' : 'text-ink',
        )}
      >
        {value}
      </strong>
      <span className="text-[11px] text-primary-600">{label}</span>
    </div>
  )
}

// ── Sub-panels ───────────────────────────────────────────────────

function GatewayPanel() {
  const { data, isLoading, error } = useQuery<GatewayStatus>({
    queryKey: ['control-panel', 'gateway-status'],
    queryFn: () => fetchJson<GatewayStatus>('/api/gateway-status'),
    refetchInterval: 10_000,
  })

  if (isLoading) return <LoadingState label="Probing gateway…" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Gateway probe failed'} />

  const caps = data?.capabilities ?? {}
  const capEntries = Object.entries(caps).filter(([, v]) => v === true)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
            data?.gateway?.available
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-red-300 bg-red-50 text-red-700',
          )}
        >
          <span className={cn('size-2 rounded-full', data?.gateway?.available ? 'bg-emerald-500' : 'bg-red-500')} />
          Gateway {data?.gateway?.available ? 'online' : 'offline'}
        </span>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
            data?.dashboard?.available
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-primary-300 bg-primary-50 text-primary-600',
          )}
        >
          <span className={cn('size-2 rounded-full', data?.dashboard?.available ? 'bg-emerald-500' : 'bg-primary-400')} />
          Dashboard {data?.dashboard?.available ? 'online' : 'offline'}
        </span>
        {data?.mode ? (
          <span className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
            {data.mode}
          </span>
        ) : null}
      </div>
      {capEntries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {capEntries.map(([key]) => (
            <span
              key={key}
              className="rounded-md border border-accent-200 bg-accent-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-700"
            >
              {key}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MissionPanel() {
  const { data: metrics, isLoading: ml, error: me } = useQuery<MissionMetrics>({
    queryKey: ['control-panel', 'mission-metrics'],
    queryFn: () => postJson<MissionMetrics>('/api/mission-coordinator', { action: 'metrics' }),
    refetchInterval: 5_000,
  })
  const { data: list, isLoading: ll, error: le } = useQuery<MissionListResponse>({
    queryKey: ['control-panel', 'mission-list'],
    queryFn: () => fetchJson<MissionListResponse>('/api/mission-coordinator'),
    refetchInterval: 5_000,
  })

  if (ml || ll) return <LoadingState label="Loading missions…" />
  if (me || le)
    return <ErrorState message={(me ?? le) instanceof Error ? (me ?? le)!.message : 'Mission API failed'} />

  const m = metrics?.metrics
  const missions = list?.missions ?? []
  const byState = m ? Object.entries(m.byState).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a) : []

  return (
    <div className="space-y-4">
      {m ? (
        <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border-y border-primary-200 bg-primary-200">
          <Stat label="Total" value={m.total} />
          <Stat label="Active" value={m.active} accent />
          <Stat label="Done" value={m.completed} />
          <Stat label="Failed" value={m.failed} />
        </div>
      ) : null}
      {byState.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {byState.map(([state, count]) => (
            <span
              key={state}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-surface px-2 py-1 text-xs"
            >
              <span className={cn('font-medium', statusColor(state))}>{state.replaceAll('_', ' ')}</span>
              <span className="font-bold tabular-nums text-ink">{count}</span>
            </span>
          ))}
        </div>
      ) : null}
      {missions.length > 0 ? (
        <div className="space-y-2">
          {missions.slice(0, 5).map((mission) => {
            const running = mission.nodes?.filter((n) => ['running', 'dispatched', 'leased'].includes(n.state)) ?? []
            return (
              <div
                key={mission.id}
                className="flex items-center justify-between rounded-lg border border-primary-200 bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{mission.title}</p>
                  <p className="text-xs text-primary-600">
                    {mission.nodes?.length ?? 0} nodes{running.length > 0 ? ` · ${running.length} running` : ''}
                  </p>
                </div>
                <span className={cn('shrink-0 text-xs font-medium', statusColor(running[0]?.state ?? 'done'))}>
                  {running.length > 0 ? 'active' : 'idle'}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState message="No missions created yet." />
      )}
    </div>
  )
}

function SwarmPanel() {
  const { data, isLoading, error } = useQuery<SwarmHealthResponse>({
    queryKey: ['control-panel', 'swarm-health'],
    queryFn: () => fetchJson<SwarmHealthResponse>('/api/swarm-health'),
    refetchInterval: 10_000,
  })

  if (isLoading) return <LoadingState label="Checking swarm health…" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Swarm health check failed'} />

  const workers = data?.workers ?? []
  const summary = data?.summary

  return (
    <div className="space-y-4">
      {summary ? (
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border-y border-primary-200 bg-primary-200">
          <Stat label="Workers" value={summary.totalWorkers} />
          <Stat label="Configured" value={summary.wrappersConfigured} accent />
          <Stat label="Auth Errors" value={summary.totalAuthErrors24h} />
        </div>
      ) : null}
      {summary?.degraded ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠ Swarm degraded — {summary.warnings.length} warning(s)
        </div>
      ) : null}
      {workers.length > 0 ? (
        <div className="space-y-2">
          {workers.slice(0, 8).map((w) => (
            <div
              key={w.workerId}
              className="flex items-center justify-between rounded-lg border border-primary-200 bg-surface px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{w.displayName}</p>
                <p className="text-xs text-primary-600">
                  {w.role} · {w.model}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                  w.modelAuthStatus === 'ready'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-amber-300 bg-amber-50 text-amber-700',
                )}
              >
                {w.modelAuthStatus}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No swarm workers configured." />
      )}
    </div>
  )
}

function ApprovalsPanel() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery<ApprovalsResponse>({
    queryKey: ['control-panel', 'approvals'],
    queryFn: () => fetchJson<ApprovalsResponse>('/api/swarm-approvals'),
    refetchInterval: 5_000,
  })

  const decideMutation = useMutation({
    mutationFn: (vars: { approvalId: string; status: 'approved' | 'rejected'; decidedBy: string }) =>
      fetchJson<{ ok: boolean }>(`/api/swarm-approvals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['control-panel', 'approvals'] }),
  })

  if (isLoading) return <LoadingState label="Loading approvals…" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Approvals API failed'} />

  const pending = (data?.approvals ?? []).filter((a) => a.status === 'pending')

  return (
    <div className="space-y-2">
      {pending.length === 0 ? (
        <EmptyState message="No pending approvals." />
      ) : (
        pending.map((a) => (
          <div
            key={a.id}
            className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{a.actionId}</p>
                <p className="text-xs text-primary-600">
                  {a.risk} · {a.target} · expires {timeAgo(a.expiresAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                  disabled={decideMutation.isPending}
                  onClick={() =>
                    decideMutation.mutate({
                      approvalId: a.id,
                      status: 'approved',
                      decidedBy: 'control-panel',
                    })
                  }
                >
                  Approve
                </button>
                <button
                  className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                  disabled={decideMutation.isPending}
                  onClick={() =>
                    decideMutation.mutate({
                      approvalId: a.id,
                      status: 'rejected',
                      decidedBy: 'control-panel',
                    })
                  }
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function SessionsPanel() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery<SessionsResponse>({
    queryKey: ['control-panel', 'sessions'],
    queryFn: () => fetchJson<SessionsResponse>('/api/sessions'),
    refetchInterval: 10_000,
  })

  if (isLoading) return <LoadingState label="Loading sessions…" />
  if (error) return <ErrorState message={error instanceof Error ? error.message : 'Sessions API failed'} />

  const sessions = (data?.sessions ?? []).slice(0, 8)

  return (
    <div className="space-y-2">
      {sessions.length === 0 ? (
        <EmptyState message="No active sessions." />
      ) : (
        sessions.map((s) => (
          <button
            key={s.key}
            className="flex w-full items-center justify-between rounded-lg border border-primary-200 bg-surface px-3 py-2 text-left transition hover:border-accent-400 hover:shadow-sm"
            onClick={() => void navigate({ to: '/chat/$sessionKey', params: { sessionKey: s.key } })}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{s.title || s.key}</p>
              <p className="text-xs text-primary-600">
                {s.model || 'unknown'} · {timeAgo(s.updatedAt)}
              </p>
            </div>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-primary-400" />
          </button>
        ))
      )}
    </div>
  )
}

// ── Quick actions ────────────────────────────────────────────────

const QUICK_ACTIONS: Array<{
  label: string
  icon: typeof Rocket01Icon
  to: string
}> = [
  { label: 'Conductor', icon: Rocket01Icon, to: '/conductor' },
  { label: 'Mission Graph', icon: DashboardSquare01Icon, to: '/mission-graph' },
  { label: 'Operations', icon: Settings02Icon, to: '/operations' },
  { label: 'Swarm', icon: UserGroupIcon, to: '/swarm2' },
  { label: 'Tasks', icon: CheckmarkCircle02Icon, to: '/tasks' },
  { label: 'Jobs', icon: Clock01Icon, to: '/jobs' },
  { label: 'Terminal', icon: ComputerTerminal01Icon, to: '/terminal' },
]

function QuickActions() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_ACTIONS.map((action) => (
        <button
          key={action.to}
          onClick={() => void navigate({ to: action.to })}
          className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:border-accent-400 hover:shadow-sm active:scale-95"
        >
          <HugeiconsIcon icon={action.icon} className="size-4 text-accent-600" />
          {action.label}
        </button>
      ))}
    </div>
  )
}

// ── Main screen ──────────────────────────────────────────────────

export function ControlPanelScreen() {
  usePageTitle('Control Panel')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const handleRefresh = useCallback(() => {
    void Promise.all([
      fetch('/api/gateway-status', { cache: 'no-store' }),
      fetch('/api/mission-coordinator', { cache: 'no-store' }),
      fetch('/api/swarm-health', { cache: 'no-store' }),
    ])
  }, [])

  return (
    <main className="min-h-dvh overflow-x-hidden bg-surface pb-20 text-ink">
      <div className="mx-auto w-full max-w-[1700px] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
        {/* Header */}
        <header className="mb-7 flex flex-col gap-5 border-b border-primary-200/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent-400/30 bg-gradient-to-r from-accent-500/10 to-accent-600/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-700">
              <span className="size-1.5 rounded-full bg-accent-500 shadow-sm shadow-accent-500/50" />
              Agent Control Panel
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              One surface. <br className="sm:hidden" /> Every agent.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-700">
              Unified view of gateway health, mission orchestration, swarm workers,
              greenlight approvals, and active sessions — zero-fork, composing existing APIs.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-primary-600">
            <button
              onClick={handleRefresh}
              className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 font-medium transition hover:border-accent-500 hover:shadow-sm active:scale-95"
            >
              Refresh
            </button>
            <span className="text-primary-400">Updated {timeAgo(now)}</span>
          </div>
        </header>

        {/* Quick actions */}
        <div className="mb-7">
          <QuickActions />
        </div>

        {/* Grid */}
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          <Card title="Gateway Status" icon={DashboardSquare01Icon}>
            <GatewayPanel />
          </Card>

          <Card title="Missions" icon={Rocket01Icon}>
            <MissionPanel />
          </Card>

          <Card title="Swarm Workers" icon={UserGroupIcon}>
            <SwarmPanel />
          </Card>

          <Card title="Greenlight Approvals" icon={CheckmarkCircle02Icon}>
            <ApprovalsPanel />
          </Card>

          <Card title="Active Sessions" icon={PlayIcon}>
            <SessionsPanel />
          </Card>
        </div>
      </div>
    </main>
  )
}
