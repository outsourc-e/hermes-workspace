import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
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

function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Stat Card ────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  emoji,
  gradient,
}: {
  label: string
  value: string
  sub?: string
  emoji: string
  gradient: string
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border p-4 flex flex-col gap-1" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card, var(--theme-surface))' }}>
      <div className="absolute top-0 right-0 w-20 h-20 opacity-[0.07] text-5xl flex items-center justify-center pointer-events-none select-none">{emoji}</div>
      <div className="text-[10px] uppercase tracking-widest opacity-40 font-medium">{label}</div>
      <div className="text-3xl font-bold text-ink tabular-nums">{value}</div>
      {sub && <div className="text-[11px] opacity-40">{sub}</div>}
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ background: gradient }} />
    </div>
  )
}

// ── Activity Chart ───────────────────────────────────────────────

function ActivityChart({ sessions }: { sessions: HermesSession[] }) {
  const chartData = useMemo(() => {
    const dayMap = new Map<string, { sessions: number; messages: number; tokens: number }>()
    const now = Date.now() / 1000
    // Last 14 days
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
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card, var(--theme-surface))' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-ink">Activity</div>
          <div className="text-[11px] opacity-40">Last 14 days</div>
        </div>
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="sessionGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="messageGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--theme-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--theme-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Area type="monotone" dataKey="sessions" stroke="#6366f1" fill="url(#sessionGradient)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="messages" stroke="#22c55e" fill="url(#messageGradient)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-2 text-[10px] opacity-50">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#6366f1]" />Sessions</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#22c55e]" />Messages</span>
      </div>
    </div>
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

  return (
    <div className="rounded-xl border p-4 flex flex-col gap-3" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card, var(--theme-surface))' }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-ink">Model & Connection</div>
        <div className={cn(
          'flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
          connected ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
        )}>
          <span className={cn('size-2 rounded-full', connected ? 'bg-green-500' : 'bg-red-500')} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <div className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: 'color-mix(in srgb, var(--theme-accent, #6366f1) 8%, transparent)' }}>
          <span className="text-xl">🤖</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest opacity-40">Primary Model</div>
            <div className="font-mono text-sm font-semibold text-ink truncate">{typeof modelName === 'string' ? modelName : '—'}</div>
            <div className="text-[10px] opacity-40 font-mono truncate">{provider}{baseUrl ? ` · ${baseUrl}` : ''}</div>
          </div>
        </div>
        {fallbackModel && (
          <div className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: 'color-mix(in srgb, var(--theme-warning, #f59e0b) 8%, transparent)' }}>
            <span className="text-xl">🔄</span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest opacity-40">Fallback Model</div>
              <div className="font-mono text-sm text-ink truncate">{fallbackModel}</div>
              <div className="text-[10px] opacity-40 font-mono truncate">{(fallbackBlock?.provider as string) ?? ''}</div>
            </div>
          </div>
        )}
      </div>
    </div>
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
      className="w-full text-left px-4 py-3 rounded-xl hover:opacity-80 transition-all flex flex-col gap-2 border"
      style={{
        background: 'var(--theme-card, var(--theme-surface))',
        borderColor: 'color-mix(in srgb, var(--theme-border) 50%, transparent)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink truncate flex-1">
          {session.title || session.id}
        </span>
        <span className="text-[10px] tabular-nums opacity-40 shrink-0">
          {session.started_at ? timeAgo(session.started_at) : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        {session.model && (
          <span className="font-mono px-1.5 py-0.5 rounded text-[9px]" style={{ background: 'color-mix(in srgb, var(--theme-accent) 12%, transparent)', color: 'var(--theme-accent)' }}>
            {session.model}
          </span>
        )}
        <span className="opacity-50">{msgs} msgs</span>
        {tools > 0 && <span className="opacity-50">{tools} tools</span>}
        <span className="opacity-50">{formatNumber(tokens)} tok</span>
      </div>
      {/* Token bar */}
      <div className="h-1 rounded-full w-full overflow-hidden" style={{ background: 'var(--theme-border)' }}>
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

// ── Quick Action Button ──────────────────────────────────────────

function QuickAction({ label, emoji, onClick, gradient }: { label: string; emoji: string; onClick: () => void; gradient?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium hover:scale-[1.02] active:scale-[0.98] transition-all"
      style={{
        borderColor: 'var(--theme-border)',
        background: 'var(--theme-card, var(--theme-surface))',
        color: 'var(--theme-ink, inherit)',
      }}
    >
      <span className="text-lg">{emoji}</span>
      <span>{label}</span>
      {gradient && <div className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ background: gradient }} />}
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
    <div className="min-h-full p-4 md:p-8 max-w-5xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-ink">Dashboard</h1>
          <p className="text-sm opacity-40 mt-0.5">Hermes Workspace</p>
        </div>
        <div className="text-[11px] opacity-30 tabular-nums">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Sessions"
          value={formatNumber(stats.totalSessions)}
          emoji="💬"
          gradient="linear-gradient(90deg, #6366f1, #818cf8)"
        />
        <StatCard
          label="Messages"
          value={formatNumber(stats.totalMessages)}
          emoji="✉️"
          gradient="linear-gradient(90deg, #22c55e, #4ade80)"
        />
        <StatCard
          label="Tool Calls"
          value={formatNumber(stats.totalToolCalls)}
          emoji="🔧"
          gradient="linear-gradient(90deg, #f59e0b, #fbbf24)"
        />
        <StatCard
          label="Tokens"
          value={formatNumber(stats.totalTokens)}
          sub={`~$${costEstimate} est.`}
          emoji="⚡"
          gradient="linear-gradient(90deg, #a855f7, #c084fc)"
        />
      </div>

      {/* Activity Chart + Model Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3">
          <ActivityChart sessions={sessions} />
        </div>
        <div className="lg:col-span-2">
          <ModelStatusCard />
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <div className="text-[10px] uppercase tracking-widest opacity-40 font-medium mb-3">Quick Actions</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <QuickAction
            label="New Chat"
            emoji="💬"
            gradient="linear-gradient(90deg, #6366f1, #818cf8)"
            onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })}
          />
          <QuickAction
            label="Terminal"
            emoji="💻"
            gradient="linear-gradient(90deg, #22c55e, #4ade80)"
            onClick={() => navigate({ to: '/terminal' })}
          />
          <QuickAction
            label="Skills"
            emoji="🧩"
            gradient="linear-gradient(90deg, #f59e0b, #fbbf24)"
            onClick={() => navigate({ to: '/skills' })}
          />
          <QuickAction
            label="Settings"
            emoji="⚙️"
            gradient="linear-gradient(90deg, #a855f7, #c084fc)"
            onClick={() => navigate({ to: '/settings' })}
          />
        </div>
      </div>

      {/* Recent Sessions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] uppercase tracking-widest opacity-40 font-medium">Recent Sessions</div>
          <button
            type="button"
            className="text-[11px] opacity-40 hover:opacity-70 transition-opacity"
            onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'main' } })}
          >
            View all →
          </button>
        </div>
        <div className="space-y-2">
          {recentSessions.length === 0 && (
            <div className="text-sm opacity-30 py-12 text-center rounded-xl border" style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-card, var(--theme-surface))' }}>
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
      </div>
    </div>
  )
}
