import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import type { DashboardOverview } from '@/server/dashboard-aggregator'
import { OpsStrip } from './components/ops-strip'
import { ModelInfoCard } from './components/model-info-card'
import { AchievementsCard } from './components/achievements-card'
import { AnalyticsSummaryCard } from './components/analytics-summary-card'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import type { ClaudeSession } from '@/server/claude-api'
import { getUnavailableReason } from '@/lib/feature-gates'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { cn } from '@/lib/utils'
import { openHamburgerMenu } from '@/components/mobile-hamburger-menu'
import { applyTheme, useSettingsStore } from '@/hooks/use-settings'
import { HugeiconsIcon } from '@hugeicons/react'
import { Moon02Icon, Sun02Icon } from '@hugeicons/core-free-icons'

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

function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

function alpha(color: string, amount: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(amount * 100)))
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

function readDashboardPalette() {
  return {
    accent: themeColor('--theme-accent', '#6366f1'),
    accentSecondary: themeColor('--theme-accent-secondary', '#8b5cf6'),
    success: themeColor('--theme-success', '#22c55e'),
    warning: themeColor('--theme-warning', '#f59e0b'),
    danger: themeColor('--theme-danger', '#ef4444'),
    muted: themeColor('--theme-muted', '#6b7280'),
    border: themeColor('--theme-border', '#333333'),
    card: themeColor('--theme-card', '#1a1a2e'),
    text: themeColor('--theme-text', '#e5e7eb'),
  }
}

function useDashboardPalette() {
  const [palette, setPalette] = useState(readDashboardPalette)

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const refresh = () => setPalette(readDashboardPalette())
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    })
    return () => observer.disconnect()
  }, [])

  return palette
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
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border transition-colors',
        className,
      )}
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {accentColor && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}50, transparent)`,
          }}
        />
      )}
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            {title}
          </h3>
          {titleRight}
        </div>
      )}
      <div className={cn('flex-1', noPadding ? '' : 'px-5 pb-4 pt-3')}>
        {children}
      </div>
    </div>
  )
}

function EnhancedBadge({ label = 'Enhanced API' }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        border: `1px solid ${themeColor('--theme-accent-border', 'rgba(245, 158, 11, 0.28)')}`,
        background: themeColor('--theme-accent-subtle', 'rgba(245, 158, 11, 0.12)'),
        color: themeColor('--theme-accent', '#f59e0b'),
      }}
    >
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
      accentColor={themeColor('--theme-warning', '#f59e0b')}
      className="h-full"
    >
      <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-card2)] px-4 text-center">
        <p className="text-sm text-muted">{description}</p>
      </div>
    </GlassCard>
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
    <GlassCard accentColor={accentColor}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            {label}
          </div>
          <div className="text-2xl font-bold tabular-nums text-ink">
            {value}
          </div>
          {sub && <div className="text-[11px] text-muted">{sub}</div>}
        </div>
        <div
          className="flex size-8 items-center justify-center rounded-lg text-base"
          style={{ background: `${accentColor}15` }}
        >
          {icon}
        </div>
      </div>
    </GlassCard>
  )
}

// ── Activity Chart ───────────────────────────────────────────────

function ActivityChart({
  sessions,
  palette,
}: {
  sessions: Array<ClaudeSession>
  palette: ReturnType<typeof readDashboardPalette>
}) {
  const chartData = useMemo(() => {
    const dayMap = new Map<string, { sessions: number; messages: number }>()
    const now = Date.now() / 1000
    for (let i = 13; i >= 0; i--) {
      const d = new Date((now - i * 86400) * 1000)
      const key = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      dayMap.set(key, { sessions: 0, messages: 0 })
    }
    for (const s of sessions) {
      if (!s.started_at) continue
      const d = new Date(s.started_at * 1000)
      const key = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      const entry = dayMap.get(key)
      if (entry) {
        entry.sessions += 1
        entry.messages += s.message_count ?? 0
      }
    }
    const all = Array.from(dayMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }))
    let firstActive = all.findIndex((d) => d.sessions > 0 || d.messages > 0)
    if (firstActive > 0) firstActive = Math.max(0, firstActive - 1)
    return firstActive > 0 ? all.slice(firstActive) : all
  }, [sessions])

  return (
    <GlassCard
      title="Activity"
      titleRight={<span className="text-[10px] text-muted">14 days</span>}
      accentColor={palette.accent}
      className="h-full"
    >
      <div className="h-[200px] w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 32, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient id="g-sessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.accent} stopOpacity={0.3} />
                <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-messages" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.success} stopOpacity={0.2} />
                <stop offset="100%" stopColor={palette.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={palette.border} opacity={0.45} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: palette.muted }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: palette.success }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: palette.accent }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: palette.card,
                border: `1px solid ${palette.border}`,
                borderRadius: '8px',
                fontSize: '11px',
              }}
              labelStyle={{ color: palette.muted, fontSize: '10px' }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="messages"
              stroke={palette.success}
              fill="url(#g-messages)"
              strokeWidth={1.5}
              dot={false}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="sessions"
              stroke={palette.accent}
              fill="url(#g-sessions)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-5 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: palette.accent }} />
          Sessions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: palette.success }} />
          Messages
        </span>
      </div>
    </GlassCard>
  )
}

// ── Skills Widget ────────────────────────────────────────────────

function SkillsWidget({ palette }: { palette: ReturnType<typeof readDashboardPalette> }) {
  const skillsAvailable = useFeatureAvailable('skills')
  const skillsQuery = useQuery({
    queryKey: ['claude-skills'],
    queryFn: async () => {
      const res = await fetch(
        '/api/skills?tab=installed&limit=8&summary=search',
      )
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
    <GlassCard
      title="Skills"
      titleRight={
        <span className="text-[10px] text-muted">
          {skills.length} installed
        </span>
      }
      accentColor={palette.warning}
    >
      {skills.length === 0 ? (
        <div className="text-xs text-neutral-400 py-4 text-center">
          No skills installed
        </div>
      ) : (
        <div className="space-y-1.5">
          {skills.slice(0, 6).map((skill, i) => (
            <div
              key={String(skill.name ?? i)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--theme-card2)] transition-colors"
            >
              <span className="text-xs">📦</span>
              <span className="text-xs font-medium text-ink truncate flex-1">
                {String(skill.name ?? 'Unnamed')}
              </span>
              {skill.enabled !== false && (
                <span className="size-1.5 rounded-full bg-emerald-500/60" />
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}

// ── Quick Action ─────────────────────────────────────────────────

function QuickAction({
  label,
  icon,
  onClick,
  accentColor,
  disabled,
  badge,
}: {
  label: string
  icon: string
  onClick: () => void
  accentColor: string
  disabled?: boolean
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative overflow-hidden flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
        'border-[var(--theme-border)] bg-[var(--theme-card)] text-left',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'hover:border-[var(--theme-accent-border)] hover:scale-[1.01] active:scale-[0.99]',
      )}
    >
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-sm"
        style={{ background: `${accentColor}18` }}
      >
        {icon}
      </div>
      <span
        className="min-w-0 flex-1 text-xs font-semibold"
        style={{ color: 'var(--theme-text)' }}
      >
        {label}
      </span>
      {badge ? (
        <span className="ml-auto shrink-0 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700">
          {badge}
        </span>
      ) : null}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
        }}
      />
    </button>
  )
}

// ── Session Row (minimal) ────────────────────────────────────────

function SessionRow({
  session,
  maxTokens,
  onClick,
  palette,
}: {
  session: ClaudeSession
  maxTokens: number
  onClick: () => void
  palette: ReturnType<typeof readDashboardPalette>
}) {
  const tokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0)
  const msgs = session.message_count ?? 0
  const tools = session.tool_call_count ?? 0
  const barWidth = maxTokens > 0 ? Math.max(1, (tokens / maxTokens) * 100) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-[var(--theme-card2)] transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-medium text-ink truncate flex-1 group-hover:text-ink">
          {session.title || session.id}
        </span>
        <span className="text-[10px] tabular-nums text-muted shrink-0">
          {session.started_at ? timeAgo(session.started_at) : ''}
        </span>
      </div>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] text-neutral-500">
        {session.model && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[9px] font-medium"
            style={{
              background: alpha(palette.accent, 0.1),
              color: palette.accent,
            }}
          >
            {session.model}
          </span>
        )}
        <span>{msgs} msgs</span>
        {tools > 0 && <span>{tools} tools</span>}
        {tokens > 0 && <span>{formatNumber(tokens)} tok</span>}
      </div>
      <div className="h-[3px] rounded-full w-full bg-[var(--theme-border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${barWidth}%`,
            background: `linear-gradient(90deg, ${palette.accent}, ${palette.accentSecondary})`,
          }}
        />
      </div>
    </button>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────

export function DashboardScreen() {
  const navigate = useNavigate()
  const sessionsAvailable = useFeatureAvailable('sessions')
  const skillsAvailable = useFeatureAvailable('skills')
  const sessionsQuery = useQuery({
    // Use a dedicated query key — NOT chatQueryKeys.sessions — to avoid
    // cache collisions with the chat sidebar which fetches fewer sessions
    // and overwrites the dashboard's larger dataset.
    // Also use the workspace proxy (/api/sessions) rather than the server-side
    // listSessions() — the latter calls the gateway via CLAUDE_API which is
    // only available server-side and returns nothing when called from the client.
    queryKey: ['dashboard', 'sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions?limit=200&offset=0')
      if (!res.ok) return []
      const data = (await res.json()) as {
        sessions?: Array<Record<string, unknown>>
      }
      return (data.sessions ?? []).map((s) => ({
        id: (s.key ?? s.id) as string,
        started_at: s.startedAt ? (s.startedAt as number) / 1000 : undefined,
        message_count: (s.message_count as number | undefined) ?? 0,
        tool_call_count: (s.tool_call_count as number | undefined) ?? 0,
        input_tokens: (s.tokenCount as number | undefined) ?? 0,
        output_tokens: 0,
      })) as Array<ClaudeSession>
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: sessionsAvailable,
  })

  const sessions = (sessionsQuery.data ?? []) as ClaudeSession[]

  const stats = useMemo(() => {
    let totalMessages = 0,
      totalToolCalls = 0,
      totalTokens = 0
    for (const s of sessions) {
      totalMessages += s.message_count ?? 0
      totalToolCalls += s.tool_call_count ?? 0
      totalTokens += (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
    }
    return {
      totalSessions: sessions.length,
      totalMessages,
      totalToolCalls,
      totalTokens,
    }
  }, [sessions])

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0))
        .slice(0, 6),
    [sessions],
  )

  const maxTokens = useMemo(() => {
    let max = 0
    for (const s of recentSessions) {
      const t = (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
      if (t > max) max = t
    }
    return max
  }, [recentSessions])

  // Aggregate dashboard overview — surfaces the data the native
  // Hermes dashboard exposes (status, platforms, cron, achievements,
  // model info, analytics) in a single round trip with per-section
  // graceful fallbacks. Each card renders only when its slice resolves.
  const overviewQuery = useQuery<DashboardOverview>({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/overview')
      if (!res.ok) throw new Error(`overview ${res.status}`)
      return (await res.json()) as DashboardOverview
    },
    staleTime: 5_000,
    refetchInterval: 30_000,
  })
  const overview = overviewQuery.data ?? null

  const palette = useDashboardPalette()

  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return true
    const dt = document.documentElement.getAttribute('data-theme') || ''
    return !dt.endsWith('-light')
  })

  return (
    <div className="min-h-full">
      {/* Floating mobile nav: hamburger left, theme toggle right */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-2 h-12" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <button
          type="button"
          aria-label="Open navigation menu"
          onClick={openHamburgerMenu}
          className="flex items-center justify-center w-11 h-11 rounded-xl active:bg-white/10 transition-colors touch-manipulation"
        >
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none" className="opacity-70" style={{ color: 'var(--color-ink, #111)' }}>
            <path d="M1 1.5H19M1 8H19M1 14.5H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Toggle theme"
          onClick={() => {
            const LIGHT_DARK_PAIRS: Record<string, string> = {
              'claude-nous': 'claude-nous-light',
              'claude-nous-light': 'claude-nous',
              'claude-official': 'claude-official-light',
              'claude-official-light': 'claude-official',
              'claude-classic': 'claude-classic-light',
              'claude-classic-light': 'claude-classic',
              'claude-slate': 'claude-slate-light',
              'claude-slate-light': 'claude-slate',
            }
            const cur = document.documentElement.getAttribute('data-theme') || 'claude-official'
            const nextDataTheme = LIGHT_DARK_PAIRS[cur] || (isDark ? 'claude-official-light' : 'claude-official')
            import('@/lib/theme').then(({ setTheme }) => { setTheme(nextDataTheme as any) })
            const nextMode = nextDataTheme.endsWith('-light') ? 'light' : 'dark'
            applyTheme(nextMode)
            updateSettings({ theme: nextMode })
            setIsDark(nextMode === 'dark')
          }}
          className="flex items-center justify-center w-11 h-11 rounded-xl active:bg-white/10 transition-colors touch-manipulation"
          style={{ color: 'var(--theme-muted)' }}
        >
          <HugeiconsIcon icon={isDark ? Sun02Icon : Moon02Icon} size={20} strokeWidth={1.5} />
        </button>
      </div>
      <div className="px-4 pt-14 md:pt-4 py-4 md:px-8 md:py-6 lg:px-10 space-y-5 pb-28">
      {/* ── Header: Title + inline Quick Actions (no centered hero) ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/claude-avatar.webp"
            alt="Hermes Agent"
            className="size-9 rounded-md border border-[var(--theme-border)]"
            style={{ padding: '2px', background: 'var(--theme-card)' }}
          />
          <div className="flex flex-col">
            <h1
              className="text-base font-semibold tracking-tight"
              style={{ color: 'var(--theme-text)' }}
            >
              Dashboard
            </h1>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.15em]"
              style={{ color: 'var(--theme-muted)' }}
            >
              Hermes Workspace
            </span>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-xl">
          <QuickAction
            label="New Chat"
            icon="💬"
            accentColor={palette.accent}
            onClick={() =>
              navigate({
                to: '/chat/$sessionKey',
                params: { sessionKey: 'new' },
              })
            }
          />
          <QuickAction
            label="Terminal"
            icon="💻"
            accentColor={palette.success}
            onClick={() => navigate({ to: '/terminal' })}
          />
          <QuickAction
            label="Skills"
            icon="🧩"
            accentColor={palette.warning}
            onClick={() => navigate({ to: '/skills' })}
            disabled={!skillsAvailable}
            badge={!skillsAvailable ? 'Enhanced' : undefined}
          />
          <QuickAction
            label="Settings"
            icon="⚙️"
            accentColor={palette.accentSecondary}
            onClick={() => navigate({ to: '/settings', search: {} })}
          />
        </div>
      </div>

      {/* ── Ops strip (gateway + version drift + platforms + cron pulse) ── */}
      <OpsStrip
        status={overview?.status ?? null}
        cron={overview?.cron ?? null}
        platforms={overview?.platforms ?? []}
      />

      {/* ── Metrics Row ── */}
      {sessionsAvailable ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricTile
            label="Sessions"
            value={formatNumber(stats.totalSessions)}
            icon="💬"
            accentColor={palette.accent}
          />
          <MetricTile
            label="Messages"
            value={formatNumber(stats.totalMessages)}
            icon="✉️"
            accentColor={palette.success}
          />
          <MetricTile
            label="Tool Calls"
            value={formatNumber(stats.totalToolCalls)}
            icon="🔧"
            accentColor={palette.warning}
          />
          <MetricTile
            label="Tokens"
            value={formatNumber(stats.totalTokens)}
            sub={
              overview?.analytics?.estimatedCostUsd != null
                ? `$${overview.analytics.estimatedCostUsd.toFixed(2)} · ${overview.analytics.windowDays}d`
                : undefined
            }
            icon="⚡"
            accentColor={palette.accentSecondary}
          />
        </div>
      ) : (
        <UnavailableWidget
          title="Workspace Analytics"
          description={getUnavailableReason('sessions')}
        />
      )}

      {/* ── Primary content: Recent Sessions wide, side rail with Model/Skills/Achievements ── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Activity area */}
        <div className="flex flex-col gap-3 lg:col-span-8">
          {sessionsAvailable ? (
            <ActivityChart sessions={sessions} palette={palette} />
          ) : (
            <UnavailableWidget
              title="Activity"
              description={getUnavailableReason('sessions')}
            />
          )}
          <AnalyticsSummaryCard analytics={overview?.analytics ?? null} />
        </div>
        {/* Side rail */}
        <div className="flex flex-col gap-3 lg:col-span-4">
          <ModelInfoCard
            modelInfo={overview?.modelInfo ?? null}
            palette={palette}
          />
          <SkillsWidget palette={palette} />
          <AchievementsCard achievements={overview?.achievements ?? null} />
        </div>
      </div>

      {/* ── Recent Sessions (minimal) ── */}
      {sessionsAvailable ? (
        <GlassCard
          title="Recent Sessions"
          titleRight={
            <button
              type="button"
              className="text-[10px] text-muted hover:text-neutral-300 transition-colors"
              onClick={() =>
                navigate({
                  to: '/chat/$sessionKey',
                  params: { sessionKey: 'main' },
                })
              }
            >
              View all →
            </button>
          }
          accentColor={palette.accent}
          noPadding
        >
          <div className="py-1">
            {recentSessions.length === 0 ? (
              <div className="text-xs text-neutral-400 py-8 text-center">
                No sessions yet — start a chat!
              </div>
            ) : (
              recentSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  maxTokens={maxTokens}
                  palette={palette}
                  onClick={() =>
                    navigate({
                      to: '/chat/$sessionKey',
                      params: { sessionKey: s.id },
                    })
                  }
                />
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
    </div>
  )
}
