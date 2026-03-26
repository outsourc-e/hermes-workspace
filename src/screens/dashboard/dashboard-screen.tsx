import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { listSessions, getConfig } from '@/server/hermes-api'
import { chatQueryKeys } from '@/screens/chat/chat-queries'
import { getCapabilities } from '@/server/gateway-capabilities'
import type { HermesSession } from '@/server/hermes-api'

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

// ── Stat Card ────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-1"
      style={{
        borderColor: 'var(--theme-border)',
        background: 'var(--theme-card, var(--theme-surface))',
      }}
    >
      <div className="text-[11px] uppercase tracking-widest opacity-50">{label}</div>
      <div className="text-2xl font-bold text-ink">{value}</div>
      {sub && <div className="text-[11px] opacity-40">{sub}</div>}
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
  const connected = caps?.sessions === true

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3"
      style={{
        borderColor: 'var(--theme-border)',
        background: 'var(--theme-card, var(--theme-surface))',
      }}
    >
      <div className="text-[11px] uppercase tracking-widest opacity-50">Model & Connection</div>
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full shrink-0"
          style={{ background: connected ? '#22c55e' : '#ef4444' }}
        />
        <span className="text-sm font-semibold text-ink">
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <div className="opacity-40 text-[10px] uppercase">Model</div>
          <div className="font-mono text-ink truncate">{typeof modelName === 'string' ? modelName : '—'}</div>
        </div>
        <div>
          <div className="opacity-40 text-[10px] uppercase">Provider</div>
          <div className="font-mono text-ink truncate">{provider}</div>
        </div>
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
  const barWidth = maxTokens > 0 ? Math.max(2, (tokens / maxTokens) * 100) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:opacity-80 transition-opacity flex flex-col gap-1.5"
      style={{ background: 'var(--theme-card, var(--theme-surface))' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-ink truncate flex-1">
          {session.title || session.id}
        </span>
        <span className="text-[10px] tabular-nums opacity-40 shrink-0">
          {session.started_at ? timeAgo(session.started_at) : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 text-[10px] opacity-50">
        {session.model && <span className="font-mono truncate max-w-[120px]">{session.model}</span>}
        <span>{session.message_count ?? 0} msgs</span>
        <span>{formatNumber(tokens)} tokens</span>
      </div>
      {/* Token bar */}
      <div className="h-1 rounded-full w-full" style={{ background: 'var(--theme-border)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${barWidth}%`,
            background: 'var(--theme-accent, #6366f1)',
          }}
        />
      </div>
    </button>
  )
}

// ── Quick Action Button ──────────────────────────────────────────

function QuickAction({ label, emoji, onClick }: { label: string; emoji: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity"
      style={{
        borderColor: 'var(--theme-border)',
        background: 'var(--theme-card, var(--theme-surface))',
        color: 'var(--theme-ink, inherit)',
      }}
    >
      <span>{emoji}</span>
      <span>{label}</span>
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
      .slice(0, 10)
  }, [sessions])

  const maxTokens = useMemo(() => {
    let max = 0
    for (const s of recentSessions) {
      const t = (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
      if (t > max) max = t
    }
    return max
  }, [recentSessions])

  return (
    <div className="min-h-full p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-ink">Dashboard</h1>
        <p className="text-sm opacity-50 mt-1">Hermes Workspace overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Sessions" value={formatNumber(stats.totalSessions)} />
        <StatCard label="Messages" value={formatNumber(stats.totalMessages)} />
        <StatCard label="Tool Calls" value={formatNumber(stats.totalToolCalls)} />
        <StatCard
          label="Tokens"
          value={formatNumber(stats.totalTokens)}
          sub={`~$${((stats.totalTokens / 1_000_000) * 5).toFixed(2)} est.`}
        />
      </div>

      {/* Model Status + Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ModelStatusCard />
        <div
          className="rounded-xl border p-4 flex flex-col gap-3"
          style={{
            borderColor: 'var(--theme-border)',
            background: 'var(--theme-card, var(--theme-surface))',
          }}
        >
          <div className="text-[11px] uppercase tracking-widest opacity-50">Quick Actions</div>
          <div className="grid grid-cols-2 gap-2">
            <QuickAction
              label="New Chat"
              emoji="💬"
              onClick={() => navigate({ to: '/chat/$sessionKey', params: { sessionKey: 'new' } })}
            />
            <QuickAction
              label="Settings"
              emoji="⚙️"
              onClick={() => navigate({ to: '/settings' })}
            />
            <QuickAction
              label="Skills"
              emoji="🧩"
              onClick={() => navigate({ to: '/skills' })}
            />
            <QuickAction
              label="Memory"
              emoji="🧠"
              onClick={() => navigate({ to: '/memory' })}
            />
          </div>
        </div>
      </div>

      {/* Recent Sessions */}
      <div>
        <div className="text-[11px] uppercase tracking-widest opacity-50 mb-3">Recent Sessions</div>
        <div className="space-y-1.5">
          {recentSessions.length === 0 && (
            <div className="text-sm opacity-40 py-8 text-center">No sessions yet. Start a chat!</div>
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
