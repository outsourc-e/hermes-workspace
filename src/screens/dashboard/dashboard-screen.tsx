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
import { getUnavailableReason, isFeatureAvailable } from '@/lib/feature-gates'
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

// ── Glass Card ───────────────────────────────────────────────────

function GlassCard({
  title,
  titleRight,
  accentColor,
  noPadding,
  className,
  children,
}: {
  title?: string
  titleRight?: ReactNode
  accentColor?: string
  noPadding?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn(
      'relative flex flex-col overflow-hidden rounded-xl border transition-colors',
      className,
    )} style={{ background: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
      {accentColor && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}50, transparent)` }}
        />
      )}
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">{title}</h3>
          {titleRight}
        </div>
      )}
      <div className={cn('flex-1', noPadding ? '' : 'px-5 pb-4 pt-3')}>{children}</div>
    </div>
  )
}

function EnhancedBadge({ label = 'Enhanced API' }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
      {label}
    </span>
  )
}

function UnavailableWidget({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <GlassCard
      title={title}
      titleRight={<EnhancedBadge />}
      accentColor="#f59e0b"
      className="h-full"
    >
      <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-card2)] px-4 text-center">
        <p className="text-sm text-muted">{description}</p>
      </div>
    </GlassCard>
  )
}

// ── System Glance (ClawSuite-style status bar) ───────────────────

function SystemGlance({ sessions, connected, model, provider, tokens, cost }: {
  sessions: number; connected: boolean; model: string; provider: string; tokens: string; cost: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-2.5 backdrop-blur-sm">
      <span className={cn('size-2 shrink-0 rounded-full', connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500')} />
      <div className="flex flex-1 items-center gap-x-4 overflow-x-auto">
        <span className="text-xs font-medium text-ink">{model}</span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span className="text-xs text-neutral-500">{provider}</span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span className="text-xs text-neutral-500">{sessions} sessions</span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span className="text-xs font-bold tabular-nums text-ink">{tokens} tokens</span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span className="text-xs text-neutral-400">{cost}</span>
      </div>
    </div>
  )
}

// ── Metric Tile ──────────────────────────────────────────────────

function MetricTile({ label, value, sub, icon, accentColor }: {
  label: string; value: string; sub?: string; icon: string; accentColor: string
}) {
  return (
    <GlassCard accentColor={accentColor}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">{label}</div>
          <div className="text-2xl font-bold tabular-nums text-ink">{value}</div>
          {sub && <div className="text-[11px] text-muted">{sub}</div>}
        </div>
        <div className="flex size-8 items-center justify-center rounded-lg text-base" style={{ background: `${accentColor}15` }}>{icon}</div>
      </div>
    </GlassCard>
  )
}

// ── Activity Chart ───────────────────────────────────────────────

function ActivityChart({ sessions }: { sessions: HermesSession[] }) {
  const chartData = useMemo(() => {
    const dayMap = new Map<string, { sessions: number; messages: number }>()
    const now = Date.now() / 1000
    for (let i = 13; i >= 0; i--) {
      const d = new Date((now - i * 86400) * 1000)
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      dayMap.set(key, { sessions: 0, messages: 0 })
    }
    for (const s of sessions) {
      if (!s.started_at) continue
      const d = new Date(s.started_at * 1000)
      const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const entry = dayMap.get(key)
      if (entry) {
        entry.sessions += 1
        entry.messages += s.message_count ?? 0
      }
    }
    return Array.from(dayMap.entries()).map(([date, data]) => ({ date, ...data }))
  }, [sessions])

  return (
    <GlassCard title="Activity" titleRight={<span className="text-[10px] text-neutral-600">14 days</span>} accentColor="#6366f1" className="h-full">
      <div className="h-[200px] w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="g-sessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-messages" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#666' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#666' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px', fontSize: '11px' }} labelStyle={{ color: '#888', fontSize: '10px' }} />
            <Area type="monotone" dataKey="messages" stroke="#22c55e" fill="url(#g-messages)" strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="sessions" stroke="#6366f1" fill="url(#g-sessions)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-5 mt-2 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#6366f1]" />Sessions</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#22c55e]" />Messages</span>
      </div>
    </GlassCard>
  )
}

// ── Model Card ───────────────────────────────────────────────────

function ModelCard() {
  const configAvailable = isFeatureAvailable('config')
  const configQuery = useQuery({
    queryKey: ['hermes-config'],
    queryFn: getConfig,
    staleTime: 30_000,
    enabled: configAvailable,
  })
  const caps = getCapabilities()
  const config = configQuery.data as Record<string, unknown> | undefined
  const modelBlock = config?.model as Record<string, unknown> | undefined
  const modelName = (modelBlock?.default ?? config?.model ?? '—') as string
  const provider = (modelBlock?.provider ?? config?.provider ?? '—') as string
  const baseUrl = (modelBlock?.base_url ?? config?.base_url ?? '') as string
  const connected = caps?.sessions === true
  const fallbackBlock = config?.fallback_model as Record<string, unknown> | undefined
  const fallbackModel = fallbackBlock?.model as string | undefined

  if (!configAvailable) {
    return (
      <UnavailableWidget
        title="Model"
        description={getUnavailableReason('config')}
      />
    )
  }

  return (
    <GlassCard
      title="Model"
      titleRight={
        <span className={cn(
          'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full',
          connected ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10',
        )}>
          <span className={cn('size-1.5 rounded-full', connected ? 'bg-emerald-500' : 'bg-red-500')} />
          {connected ? 'Online' : 'Offline'}
        </span>
      }
      accentColor={connected ? '#22c55e' : '#ef4444'}
      className="h-full"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-lg p-2.5 bg-[var(--theme-card2)] border border-[var(--theme-border)]">
          <div className="flex size-7 items-center justify-center rounded-md bg-indigo-500/10 text-sm">🤖</div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[13px] font-bold text-ink truncate">{typeof modelName === 'string' ? modelName : '—'}</div>
            <div className="text-[10px] text-muted font-mono truncate">{provider}{baseUrl ? ` · ${baseUrl}` : ''}</div>
          </div>
        </div>
        {fallbackModel && (
          <div className="flex items-center gap-3 rounded-lg p-2.5 bg-[var(--theme-card2)] border border-[var(--theme-border)]">
            <div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-sm">🔄</div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[13px] text-ink truncate">{fallbackModel}</div>
              <div className="text-[10px] text-muted font-mono truncate">{(fallbackBlock?.provider as string) ?? ''}</div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

// ── Skills Widget ────────────────────────────────────────────────

function SkillsWidget() {
  const skillsAvailable = isFeatureAvailable('skills')
  const skillsQuery = useQuery({
    queryKey: ['hermes-skills'],
    queryFn: async () => {
      const res = await fetch('/api/skills?tab=installed&limit=8&summary=search')
      if (!res.ok) return []
      const data = await res.json()
      return (data?.skills ?? []) as Array<Record<string, unknown>>
    },
    staleTime: 30_000,
    enabled: skillsAvailable,
  })

  const skills = skillsQuery.data ?? []

  if (!skillsAvailable) {
    return (
      <UnavailableWidget
        title="Skills"
        description={getUnavailableReason('skills')}
      />
    )
  }

  return (
    <GlassCard title="Skills" titleRight={<span className="text-[10px] text-neutral-600">{skills.length} installed</span>} accentColor="#f59e0b">
      {skills.length === 0 ? (
        <div className="text-xs text-neutral-400 py-4 text-center">No skills installed</div>
      ) : (
        <div className="space-y-1.5">
          {skills.slice(0, 6).map((skill, i) => (
            <div key={String(skill.name ?? i)} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
              <span className="text-xs">📦</span>
              <span className="text-xs font-medium text-ink truncate flex-1">{String(skill.name ?? 'Unnamed')}</span>
              {skill.enabled !== false && <span className="size-1.5 rounded-full bg-emerald-500/60" />}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}

// ── Quick Action ─────────────────────────────────────────────────

function QuickAction({ label, icon, onClick, accentColor, disabled, badge }: {
  label: string; icon: string; onClick: () => void; accentColor: string; disabled?: boolean; badge?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(
      'relative overflow-hidden flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
      'border-[var(--theme-border)] bg-[var(--theme-card)]',
      disabled
        ? 'cursor-not-allowed opacity-60'
        : 'hover:border-neutral-300 dark:hover:border-neutral-700 hover:scale-[1.01] active:scale-[0.99]',
    )}>
      <div className="flex size-7 items-center justify-center rounded-md text-sm" style={{ background: `${accentColor}18` }}>{icon}</div>
      <span className="text-neutral-700 dark:text-neutral-200 text-xs font-medium">{label}</span>
      {badge ? (
        <span className="ml-auto rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700">
          {badge}
        </span>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />
    </button>
  )
}

// ── Session Row (minimal) ────────────────────────────────────────

function SessionRow({ session, maxTokens, onClick }: {
  session: HermesSession; maxTokens: number; onClick: () => void
}) {
  const tokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0)
  const msgs = session.message_count ?? 0
  const tools = session.tool_call_count ?? 0
  const barWidth = maxTokens > 0 ? Math.max(1, (tokens / maxTokens) * 100) : 0

  return (
    <button type="button" onClick={onClick} className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-[var(--theme-card2)] transition-colors group">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-medium text-ink truncate flex-1 group-hover:text-neutral-900 dark:group-hover:text-neutral-100">
          {session.title || session.id}
        </span>
        <span className="text-[10px] tabular-nums text-neutral-600 shrink-0">
          {session.started_at ? timeAgo(session.started_at) : ''}
        </span>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-neutral-500 mb-1.5">
        {session.model && (
          <span className="font-mono px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/10 text-indigo-400 font-medium">{session.model}</span>
        )}
        <span>{msgs} msgs</span>
        {tools > 0 && <span>{tools} tools</span>}
        {tokens > 0 && <span>{formatNumber(tokens)} tok</span>}
      </div>
      <div className="h-[3px] rounded-full w-full bg-[var(--theme-border)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barWidth}%`, background: 'linear-gradient(90deg, #6366f1, #a855f7)' }} />
      </div>
    </button>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────

export function DashboardScreen() {
  const navigate = useNavigate()
  const sessionsAvailable = isFeatureAvailable('sessions')
  const skillsAvailable = isFeatureAvailable('skills')
  const sessionsQuery = useQuery({
    queryKey: chatQueryKeys.sessions,
    queryFn: () => listSessions(50, 0),
    staleTime: 10_000,
    enabled: sessionsAvailable,
  })

  const sessions = (sessionsQuery.data ?? []) as HermesSession[]
  const caps = getCapabilities()

  const stats = useMemo(() => {
    let totalMessages = 0, totalToolCalls = 0, totalTokens = 0
    for (const s of sessions) {
      totalMessages += s.message_count ?? 0
      totalToolCalls += s.tool_call_count ?? 0
      totalTokens += (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
    }
    return { totalSessions: sessions.length, totalMessages, totalToolCalls, totalTokens }
  }, [sessions])

  const recentSessions = useMemo(() =>
    [...sessions].sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0)).slice(0, 6),
  [sessions])

  const maxTokens = useMemo(() => {
    let max = 0
    for (const s of recentSessions) { const t = (s.input_tokens ?? 0) + (s.output_tokens ?? 0); if (t > max) max = t }
    return max
  }, [recentSessions])

  const costEstimate = `~$${((stats.totalTokens / 1_000_000) * 5).toFixed(2)}`

  return (
    <div className="min-h-full px-4 py-4 md:px-8 md:py-6 lg:px-10 space-y-5 pb-28">
      {/* ── Header: Hermes Logo + Quick Actions ── */}
      <div className="flex flex-col items-center gap-3 py-3">
        <img
          src="/hermes-avatar.webp"
          alt="Hermes"
          className="size-12 md:size-14 rounded-xl shadow-md shadow-indigo-500/10 border border-[var(--theme-border)]"
        />
        <h1 className="text-sm font-semibold text-ink tracking-wide">Hermes Workspace</h1>
        <div className="flex items-center gap-2 mt-1">
          <QuickAction label="New Chat" icon="💬" accentColor="#6366f1" onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })} />
          <QuickAction label="Terminal" icon="💻" accentColor="#22c55e" onClick={() => navigate({ to: '/terminal' })} />
          <QuickAction
            label="Skills"
            icon="🧩"
            accentColor="#f59e0b"
            onClick={() => navigate({ to: '/skills' })}
            disabled={!skillsAvailable}
            badge={!skillsAvailable ? 'Enhanced' : undefined}
          />
          <QuickAction label="Settings" icon="⚙️" accentColor="#a855f7" onClick={() => navigate({ to: '/settings' })} />
        </div>
      </div>

      {/* ── Metrics Row ── */}
      {sessionsAvailable ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricTile label="Sessions" value={formatNumber(stats.totalSessions)} icon="💬" accentColor="#6366f1" />
          <MetricTile label="Messages" value={formatNumber(stats.totalMessages)} icon="✉️" accentColor="#22c55e" />
          <MetricTile label="Tool Calls" value={formatNumber(stats.totalToolCalls)} icon="🔧" accentColor="#f59e0b" />
          <MetricTile label="Tokens" value={formatNumber(stats.totalTokens)} sub={costEstimate} icon="⚡" accentColor="#a855f7" />
        </div>
      ) : (
        <UnavailableWidget
          title="Workspace Analytics"
          description={getUnavailableReason('sessions')}
        />
      )}

      {/* ── Charts + Model + Skills ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5">
          {sessionsAvailable ? (
            <ActivityChart sessions={sessions} />
          ) : (
            <UnavailableWidget
              title="Activity"
              description={getUnavailableReason('sessions')}
            />
          )}
        </div>
        <div className="lg:col-span-4">
          <ModelCard />
        </div>
        <div className="lg:col-span-3">
          <SkillsWidget />
        </div>
      </div>

      {/* ── Recent Sessions (minimal) ── */}
      {sessionsAvailable ? (
        <GlassCard
          title="Recent Sessions"
          titleRight={
            <button type="button" className="text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
              onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'main' } })}>
              View all →
            </button>
          }
          accentColor="#6366f1"
          noPadding
        >
          <div className="py-1">
            {recentSessions.length === 0 ? (
              <div className="text-xs text-neutral-400 py-8 text-center">No sessions yet — start a chat!</div>
            ) : (
              recentSessions.map((s) => (
                <SessionRow key={s.id} session={s} maxTokens={maxTokens}
                  onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: s.id } })} />
              ))
            )}
          </div>
        </GlassCard>
      ) : (
        <UnavailableWidget
          title="Recent Sessions"
          description={getUnavailableReason('sessions')}
        />
      )}
    </div>
  )
}
