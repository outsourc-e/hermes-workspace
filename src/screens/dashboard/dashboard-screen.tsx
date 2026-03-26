import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { listSessions, getConfig } from '@/server/hermes-api'
import { chatQueryKeys } from '@/screens/chat/chat-queries'
import { getCapabilities } from '@/server/gateway-capabilities'
import type { HermesSession } from '@/server/hermes-api'
import { cn } from '@/lib/utils'

// ── Helpers ──────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ── Glass Card (ClawSuite-style) ─────────────────────────────────

function GlassCard({
  title,
  titleRight,
  accentColor = '#6366f1',
  className,
  children,
}: {
  title?: string
  titleRight?: ReactNode
  accentColor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-colors',
        'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900',
        'hover:border-neutral-300 dark:hover:border-neutral-600',
        className,
      )}
    >
      {/* Top accent gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}80, transparent)` }}
      />
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {title}
          </h3>
          {titleRight}
        </div>
      )}
      <div className="flex-1 px-5 pb-4 pt-2">{children}</div>
    </div>
  )
}

// ── Metric Tile ──────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
  icon,
  accentColor,
}: {
  label: string
  value: string
  sub?: string
  icon: string
  accentColor: string
}) {
  return (
    <GlassCard accentColor={accentColor} className="min-h-[110px]">
      <div className="flex items-start justify-between h-full">
        <div className="flex flex-col justify-between h-full gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            {label}
          </div>
          <div>
            <div className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
              {value}
            </div>
            {sub && (
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">{sub}</div>
            )}
          </div>
        </div>
        <div
          className="flex size-10 items-center justify-center rounded-lg text-xl"
          style={{ background: `${accentColor}15` }}
        >
          {icon}
        </div>
      </div>
    </GlassCard>
  )
}

// ── Activity Chart ───────────────────────────────────────────────

function ActivityChart({ sessions }: { sessions: HermesSession[] }) {
  const chartData = useMemo(() => {
    const dayMap = new Map<string, { sessions: number; messages: number; tokens: number }>()
    const now = Date.now() / 1000
    for (let i = 13; i >= 0; i--) {
      const d = new Date((now - i * 86400) * 1000)
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      dayMap.set(key, { sessions: 0, messages: 0, tokens: 0 })
    }
    for (const s of sessions) {
      if (!s.started_at) continue
      const d = new Date(s.started_at * 1000)
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const entry = dayMap.get(key)
      if (entry) {
        entry.sessions += 1
        entry.messages += s.message_count ?? 0
        entry.tokens += (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
      }
    }
    return Array.from(dayMap.entries()).map(([date, data]) => ({ date, ...data }))
  }, [sessions])

  return (
    <GlassCard title="Activity" titleRight={<span className="text-[10px] text-neutral-400">Last 14 days</span>} accentColor="#6366f1" className="h-full">
      <div className="h-[200px] w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-sessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-messages" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.06} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: 'var(--theme-surface, #1a1a2e)',
                border: '1px solid var(--theme-border, #333)',
                borderRadius: '8px',
                fontSize: '11px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
              labelStyle={{ color: '#9ca3af', fontSize: '10px', marginBottom: '4px' }}
            />
            <Area type="monotone" dataKey="messages" stroke="#22c55e" fill="url(#grad-messages)" strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="sessions" stroke="#6366f1" fill="url(#grad-sessions)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-5 mt-3 text-[10px] text-neutral-400">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#6366f1]" />Sessions</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#22c55e]" />Messages</span>
      </div>
    </GlassCard>
  )
}

// ── Model Status Card ────────────────────────────────────────────

function ModelStatusCard() {
  const configQuery = useQuery({
    queryKey: ['hermes-config'],
    queryFn: getConfig,
    staleTime: 30_000,
  })

  const caps = getCapabilities()
  const config = configQuery.data as Record<string, unknown> | undefined
  const modelBlock = config?.model as Record<string, unknown> | undefined
  const modelName = (modelBlock?.default ?? config?.model ?? 'unknown') as string
  const provider = (modelBlock?.provider ?? config?.provider ?? '—') as string
  const baseUrl = (modelBlock?.base_url ?? config?.base_url ?? '') as string
  const connected = caps?.sessions === true

  const fallbackBlock = config?.fallback_model as Record<string, unknown> | undefined
  const fallbackModel = fallbackBlock?.model as string | undefined
  const fallbackProvider = (fallbackBlock?.provider as string) ?? ''

  return (
    <GlassCard
      title="Model & Connection"
      titleRight={
        <span className={cn(
          'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full',
          connected
            ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
            : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10',
        )}>
          <span className={cn('size-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-red-500')} />
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      }
      accentColor={connected ? '#22c55e' : '#ef4444'}
      className="h-full"
    >
      <div className="space-y-3">
        {/* Primary model */}
        <div className="flex items-center gap-3 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/50">
          <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-lg">🤖</div>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">Primary Model</div>
            <div className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100 truncate">{typeof modelName === 'string' ? modelName : '—'}</div>
            <div className="text-[10px] text-neutral-400 font-mono truncate">{provider}{baseUrl ? ` · ${baseUrl}` : ''}</div>
          </div>
        </div>
        {/* Fallback model */}
        {fallbackModel && (
          <div className="flex items-center gap-3 rounded-lg p-3 bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700/50">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10 text-lg">🔄</div>
            <div className="min-w-0 flex-1">
              <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-400">Fallback</div>
              <div className="font-mono text-sm text-neutral-900 dark:text-neutral-100 truncate">{fallbackModel}</div>
              <div className="text-[10px] text-neutral-400 font-mono truncate">{fallbackProvider}</div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

// ── Session Row ──────────────────────────────────────────────────

function SessionRow({
  session,
  maxTokens,
  onClick,
}: {
  session: HermesSession
  maxTokens: number
  onClick: () => void
}) {
  const tokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0)
  const msgs = session.message_count ?? 0
  const tools = session.tool_call_count ?? 0
  const barWidth = maxTokens > 0 ? Math.max(2, (tokens / maxTokens) * 100) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 rounded-lg transition-all',
        'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
        'border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700',
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate flex-1">
          {session.title || session.id}
        </span>
        <span className="text-[10px] tabular-nums text-neutral-400 shrink-0">
          {session.started_at ? timeAgo(session.started_at) : ''}
        </span>
      </div>
      <div className="flex items-center gap-2.5 text-[10px] mb-2">
        {session.model && (
          <span className="font-mono px-1.5 py-0.5 rounded text-[9px] bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 font-medium">
            {session.model}
          </span>
        )}
        <span className="text-neutral-400">{msgs} msgs</span>
        {tools > 0 && <span className="text-neutral-400">{tools} tools</span>}
        <span className="text-neutral-400">{formatNumber(tokens)} tok</span>
      </div>
      <div className="h-1 rounded-full w-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${barWidth}%`,
            background: 'linear-gradient(90deg, #6366f1, #a855f7)',
          }}
        />
      </div>
    </button>
  )
}

// ── Quick Action ─────────────────────────────────────────────────

function QuickAction({ label, icon, onClick, accentColor }: { label: string; icon: string; onClick: () => void; accentColor: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative overflow-hidden flex items-center gap-3 rounded-xl border px-5 py-4 text-sm font-medium transition-all',
        'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900',
        'hover:border-neutral-300 dark:hover:border-neutral-600',
        'hover:scale-[1.01] active:scale-[0.99]',
      )}
    >
      <div
        className="flex size-8 items-center justify-center rounded-lg text-base"
        style={{ background: `${accentColor}15` }}
      >
        {icon}
      </div>
      <span className="text-neutral-900 dark:text-neutral-100">{label}</span>
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
    </button>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────

export function DashboardScreen() {
  const navigate = useNavigate()
  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: () => listSessions(50, 0),
    staleTime: 10_000,
  })

  const sessions = (sessionsQuery.data ?? []) as HermesSession[]

  const stats = useMemo(() => {
    let totalMessages = 0
    let totalToolCalls = 0
    let totalTokens = 0
    for (const s of sessions) {
      totalMessages += s.message_count ?? 0
      totalToolCalls += s.tool_call_count ?? 0
      totalTokens += (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
    }
    return { totalSessions: sessions.length, totalMessages, totalToolCalls, totalTokens }
  }, [sessions])

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0))
      .slice(0, 8)
  }, [sessions])

  const maxTokens = useMemo(() => {
    let max = 0
    for (const s of recentSessions) {
      const t = (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
      if (t > max) max = t
    }
    return max
  }, [recentSessions])

  const costEstimate = ((stats.totalTokens / 1_000_000) * 5).toFixed(2)

  return (
    <div className="min-h-full px-6 py-6 md:px-10 md:py-8 lg:px-12 lg:py-8 space-y-8 pb-28">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-neutral-100">
            Dashboard
          </h1>
          <p className="text-xs text-neutral-400 mt-1 tracking-wide">Hermes Workspace</p>
        </div>
        <div className="text-[11px] text-neutral-400 tabular-nums hidden md:block">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Sessions" value={formatNumber(stats.totalSessions)} icon="💬" accentColor="#6366f1" />
        <MetricTile label="Messages" value={formatNumber(stats.totalMessages)} icon="✉️" accentColor="#22c55e" />
        <MetricTile label="Tool Calls" value={formatNumber(stats.totalToolCalls)} icon="🔧" accentColor="#f59e0b" />
        <MetricTile label="Tokens" value={formatNumber(stats.totalTokens)} sub={`~$${costEstimate} est.`} icon="⚡" accentColor="#a855f7" />
      </div>

      {/* Activity Chart + Model Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ActivityChart sessions={sessions} />
        </div>
        <div className="lg:col-span-2">
          <ModelStatusCard />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction label="New Chat" icon="💬" accentColor="#6366f1" onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })} />
          <QuickAction label="Terminal" icon="💻" accentColor="#22c55e" onClick={() => navigate({ to: '/terminal' })} />
          <QuickAction label="Skills" icon="🧩" accentColor="#f59e0b" onClick={() => navigate({ to: '/skills' })} />
          <QuickAction label="Settings" icon="⚙️" accentColor="#a855f7" onClick={() => navigate({ to: '/settings' })} />
        </div>
      </div>

      {/* Recent Sessions */}
      <GlassCard
        title="Recent Sessions"
        titleRight={
          <button
            type="button"
            className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'main' } })}
          >
            View all →
          </button>
        }
        accentColor="#6366f1"
      >
        <div className="space-y-1 -mx-1">
          {recentSessions.length === 0 && (
            <div className="text-sm text-neutral-400 py-12 text-center">
              No sessions yet — start a chat!
            </div>
          )}
          {recentSessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              maxTokens={maxTokens}
              onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: session.id } })}
            />
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
