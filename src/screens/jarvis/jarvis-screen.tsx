import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string
  summary: string
  start: string
  end: string
  location?: string
  description?: string
  category: string
  feed_id: string
  feed_name: string
  feed_color: string
  is_today: boolean
  is_all_day: boolean
}

interface TodayResponse {
  events: Array<CalendarEvent>
  feed_statuses: Record<string, string>
  last_updated: number
}

interface Deadline {
  id: string
  assessment: string
  unit: string
  unit_name: string
  date: string
  type: string
  is_hurdle: boolean
  weight: string
  days_away: number
}

interface DeadlinesResponse {
  deadlines: Array<Deadline>
  semester_name: string
}

interface FeedInfo {
  id: string
  name: string
  category: string
  color: string
  status: string
  last_fetched: number | null
  error?: string
}

interface FeedStatusResponse {
  feeds: Array<FeedInfo>
  summary: { total: number; healthy: number; stale: number; errors: number }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getGreeting(): { greeting: string; subtitle: string } {
  const hour = new Date().getHours()
  if (hour < 6)
    return {
      greeting: 'SYSTEMS ONLINE',
      subtitle: 'Late Night Briefing — All systems nominal',
    }
  if (hour < 12)
    return {
      greeting: 'GOOD MORNING',
      subtitle: 'Morning briefing — Systems operational',
    }
  if (hour < 17)
    return {
      greeting: 'GOOD AFTERNOON',
      subtitle: 'Mid-day status update — Awaiting input',
    }
  if (hour < 21)
    return {
      greeting: 'GOOD EVENING',
      subtitle: 'Evening briefing — Wrap-up mode',
    }
  return {
    greeting: 'SYSTEMS ACTIVE',
    subtitle: 'Night shift — Monitoring active',
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function getUgencyBadge(
  daysAway: number,
  isHurdle: boolean,
): { color: string; label: string } {
  if (daysAway < 0) return { color: 'text-gray-500', label: 'PASSED' }
  if (daysAway === 0)
    return {
      color: isHurdle ? 'text-red-400' : 'text-red-300',
      label: isHurdle ? 'TODAY (HURDLE)' : 'TODAY',
    }
  if (daysAway === 1) return { color: 'text-orange-400', label: '1 DAY' }
  if (daysAway <= 3)
    return { color: 'text-amber-400', label: `${daysAway} DAYS` }
  if (daysAway <= 7)
    return { color: 'text-yellow-500', label: `${daysAway} DAYS` }
  return { color: 'text-cyan-400/60', label: `${daysAway} DAYS` }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 10000) return 'just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return `${Math.floor(diff / 3600000)}h ago`
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// ── Clock ────────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="text-right">
      <div className="text-3xl font-['Orbitron'] font-bold text-[#00e5ff] tabular-nums tracking-widest">
        {time.toLocaleTimeString('en-AU', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}
      </div>
      <div className="text-[10px] font-['Orbitron'] text-[#00e5ff]/50 tracking-wider mt-1">
        {time.toLocaleDateString('en-AU', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </div>
    </div>
  )
}

// ── HUD Panel wrapper ────────────────────────────────────────────────────

function HUDPanel({
  title,
  variant = 'cyan',
  children,
  className = '',
}: {
  title: string
  variant?: 'cyan' | 'purple' | 'amber'
  children: React.ReactNode
  className?: string
}) {
  const colorMap = {
    cyan: {
      border: 'border-[#00e5ff]/30',
      text: 'text-[#00e5ff]',
      bg: 'bg-[#0a192f]/80',
    },
    purple: {
      border: 'border-purple-500/30',
      text: 'text-purple-400',
      bg: 'bg-[#0a192f]/80',
    },
    amber: {
      border: 'border-amber-500/30',
      text: 'text-amber-400',
      bg: 'bg-[#0a192f]/80',
    },
  }
  const c = colorMap[variant]

  return (
    <div className={`rounded-lg relative overflow-hidden ${className}`}>
      {/* Scan beam */}
      <div className="hud-scan-beam" />

      {/* HUD corners */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#00e5ff]/50 pointer-events-none" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#00e5ff]/50 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#00e5ff]/50 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#00e5ff]/50 pointer-events-none" />

      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(0,229,255,0.08) 0%, transparent 70%)',
        }}
      />

      <div
        className={`relative ${c.bg} border ${c.border} backdrop-blur-sm rounded-lg`}
      >
        {/* Header */}
        <div
          className={`flex items-center gap-2 px-4 py-3 border-b ${c.border}`}
        >
          {/* Status dot */}
          <span
            className={`w-2 h-2 rounded-full ${c.text.replace('text-', 'bg-')} hud-pulse`}
          />
          <h3
            className={`${c.text} text-[11px] font-['Orbitron'] font-semibold tracking-[0.2em] uppercase`}
          >
            {title}
          </h3>
          <div className="flex-1" />
          <div
            className={`w-16 h-[1px] ${c.text.replace('text-', 'bg-')} opacity-40`}
          />
        </div>

        {/* Body */}
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// ── Today Events Panel ───────────────────────────────────────────────────

function TodayEventsPanel({ data }: { data: TodayResponse }) {
  if (data.events.length === 0) {
    return (
      <HUDPanel title="TODAY'S EVENTS">
        <div className="text-gray-500 text-sm font-['Rajdhani'] flex items-center justify-center h-32">
          <span className="flex items-center gap-2">
            <span className="text-[#00e5ff]/30 hud-pulse">●</span>
            No events scheduled today
          </span>
        </div>
      </HUDPanel>
    )
  }

  return (
    <HUDPanel title="TODAY'S EVENTS">
      <div className="space-y-3">
        {data.events.map((ev) => (
          <div
            key={ev.id}
            className="border border-[#00e5ff]/10 rounded p-3 bg-[#112240]/50 hover:border-[#00e5ff]/30 transition-colors"
          >
            <div className="flex items-start gap-3">
              {/* Color indicator */}
              <div
                className="w-1 h-full min-h-[30px] rounded-sm mt-0.5 flex-shrink-0"
                style={{ backgroundColor: ev.feed_color || '#00e5ff' }}
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-['Rajdhani'] font-semibold text-gray-100 truncate">
                  {ev.summary}
                </h4>
                <div className="flex items-center gap-3 mt-1 text-xs font-mono">
                  <span className="text-[#00e5ff]/70">
                    {ev.is_all_day ? 'ALL DAY' : formatTime(ev.start)}
                  </span>
                  <span className="text-gray-600">|</span>
                  <span className="text-gray-400">{ev.feed_name}</span>
                  {ev.location && (
                    <>
                      <span className="text-gray-600">|</span>
                      <span className="text-gray-400 truncate">
                        {ev.location}
                      </span>
                    </>
                  )}
                </div>
                {ev.is_all_day && (
                  <span className="inline-block mt-1 text-[10px] font-['Orbitron'] uppercase tracking-wider text-[#00e5ff]/50">
                    All Day Event
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[10px] font-mono text-gray-600">
        Updated {timeAgo(data.last_updated)}
      </div>
    </HUDPanel>
  )
}

// ── Deadlines Panel ──────────────────────────────────────────────────────

function DeadlinesPanel({ data }: { data: DeadlinesResponse }) {
  if (data.deadlines.length === 0) {
    return (
      <HUDPanel title="UPCOMING DEADLINES" variant="amber">
        <div className="text-gray-500 text-sm font-['Rajdhani'] flex items-center justify-center h-32">
          <span className="flex items-center gap-2">
            <span className="text-amber-400/30 hud-pulse">●</span>
            No upcoming deadlines
          </span>
        </div>
      </HUDPanel>
    )
  }

  return (
    <HUDPanel title="UPCOMING DEADLINES" variant="amber">
      <div className="mb-2 text-[10px] font-['Orbitron'] uppercase tracking-wider text-amber-400/50">
        {data.semester_name}
      </div>
      <div className="space-y-2">
        {data.deadlines.map((dl) => {
          const urgency = getUgencyBadge(dl.days_away, dl.is_hurdle)
          return (
            <div
              key={dl.id}
              className={`border rounded p-3 transition-colors ${
                dl.days_away <= 3
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : dl.days_away > 0
                    ? 'border-[#00e5ff]/10 bg-[#112240]/50'
                    : 'border-gray-700/30 bg-gray-800/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-['Rajdhani'] font-semibold text-gray-100 truncate">
                    {dl.unit}: {dl.assessment}
                  </h4>
                  <div className="text-xs font-mono text-gray-400 mt-0.5">
                    {dl.unit_name}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-gray-500">
                    <span>{formatDate(dl.date)}</span>
                    <span className="text-gray-600">|</span>
                    <span>{dl.type}</span>
                    {!dl.is_hurdle && dl.weight !== 'Hurdle' && (
                      <>
                        <span className="text-gray-600">|</span>
                        <span>{dl.weight}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className={`text-right flex-shrink-0`}>
                  <div
                    className={`text-[11px] font-['Orbitron'] font-bold tracking-wider ${urgency.color}`}
                  >
                    {urgency.label}
                  </div>
                  {dl.is_hurdle && (
                    <span className="inline-block mt-1 text-[9px] font-mono uppercase tracking-wider text-red-400/70 bg-red-400/10 border border-red-400/20 rounded px-1.5 py-0.5">
                      Hurdle
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </HUDPanel>
  )
}

// ── Feed Health Panel ────────────────────────────────────────────────────

function FeedHealthPanel({ data }: { data: FeedStatusResponse }) {
  if (data.feeds.length === 0) {
    return (
      <HUDPanel title="FEED HEALTH">
        <div className="flex items-center justify-center h-24">
          <span className="text-gray-500 text-sm font-mono hud-pulse">
            Initializing...
          </span>
        </div>
      </HUDPanel>
    )
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <span className="w-2 h-2 rounded-full bg-green-400" />
      case 'stale':
        return <span className="w-2 h-2 rounded-full bg-amber-400 hud-pulse" />
      case 'error':
        return <span className="w-2 h-2 rounded-full bg-red-400 hud-pulse" />
      default:
        return <span className="w-2 h-2 rounded-full bg-gray-500" />
    }
  }

  return (
    <HUDPanel title="FEED HEALTH" variant="purple">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
        {data.feeds.map((feed) => (
          <div
            key={feed.id}
            className={`border rounded p-2 ${
              feed.status === 'ok'
                ? 'border-green-500/20 bg-green-500/5'
                : feed.status === 'error'
                  ? 'border-red-500/30 bg-red-500/10'
                  : 'border-amber-500/20 bg-amber-500/5'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusIcon(feed.status)}
              <span
                className="text-xs font-['Rajdhani'] text-gray-300 truncate"
                title={feed.name}
              >
                {feed.name}
              </span>
            </div>
            {feed.error && (
              <div
                className="mt-1 text-[10px] font-mono text-red-400/80 truncate"
                title={feed.error}
              >
                {feed.error.substring(0, 50)}
              </div>
            )}
            {feed.last_fetched && (
              <div className="mt-1 text-[9px] font-mono text-gray-600">
                {timeAgo(feed.last_fetched)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <SummaryStat
          label="TOTAL"
          value={data.summary.total}
          color="text-[#00e5ff]"
        />
        <SummaryStat
          label="HEALTHY"
          value={data.summary.healthy}
          color="text-green-400"
        />
        <SummaryStat
          label="STALE"
          value={data.summary.stale}
          color="text-amber-400"
        />
        <SummaryStat
          label="ERRORS"
          value={data.summary.errors}
          color="text-red-400"
        />
      </div>
    </HUDPanel>
  )
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="text-center p-2 border border-[#00e5ff]/10 rounded bg-[#112240]/30">
      <div className={`text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[9px] font-['Orbitron'] uppercase tracking-wider text-gray-500">
        {label}
      </div>
    </div>
  )
}

// ── Quick Stats Row ──────────────────────────────────────────────────────

function QuickStatsRow({
  todayData,
}: {
  todayData: TodayResponse | undefined
}) {
  const totalEvents = todayData?.events.length ?? 0
  const totalAllDay = todayData?.events.filter((e) => e.is_all_day).length ?? 0
  const timedEvents = totalEvents - totalAllDay

  const stats = [
    { label: 'TOTAL EVENTS', value: totalEvents, accent: 'text-[#00e5ff]' },
    { label: 'TIMED EVENTS', value: timedEvents, accent: 'text-purple-400' },
    { label: 'ALL-DAY', value: totalAllDay, accent: 'text-amber-400' },
    { label: 'STATUS', value: 'ONLINE', accent: 'text-green-400' },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="border border-[#00e5ff]/20 rounded p-3 bg-[#0a192f]/60 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[#00e5ff]/40 pointer-events-none" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[#00e5ff]/40 pointer-events-none" />
          <div
            className={`text-2xl font-bold tabular-nums ${s.accent} font-['Rajdhani']`}
          >
            {s.value}
          </div>
          <div className="text-[9px] font-['Orbitron'] text-gray-500 tracking-widest mt-0.5 uppercase">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function JarvisMain() {
  const todayQuery = useQuery<TodayResponse>({
    queryKey: ['calendar', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/today')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    refetchInterval: 1000 * 60,
    staleTime: 30000,
  })

  const deadlinesQuery = useQuery<DeadlinesResponse>({
    queryKey: ['calendar', 'deadlines'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/deadlines')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    refetchInterval: 1000 * 60 * 5,
    staleTime: 1000 * 60 * 2,
  })

  const feedStatusQuery = useQuery<FeedStatusResponse>({
    queryKey: ['calendar', 'feed-status'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/feed-status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    refetchInterval: 1000 * 60 * 2,
    staleTime: 1000 * 60,
  })

  return (
    <div className="flex flex-col gap-3 sm:gap-4 md:gap-5 w-full">
      {/* Quick Stats Row */}
      <QuickStatsRow todayData={todayQuery.data} />

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4 md:gap-5">
        {/* Calendar Events */}
        <div className="xl:col-span-8">
          {todayQuery.isLoading ? (
            <HUDPanel title="TODAY'S EVENTS">
              <div className="flex items-center justify-center min-h-[200px]">
                <span className="text-[#00d9ff]/60 font-mono text-sm hud-pulse">
                  Loading calendar data...
                </span>
              </div>
            </HUDPanel>
          ) : todayQuery.error ? (
            <HUDPanel title="TODAY'S EVENTS">
              <div className="text-red-400/80 text-sm font-mono">
                Error loading calendar: {todayQuery.error.message}
              </div>
            </HUDPanel>
          ) : todayQuery.data ? (
            <TodayEventsPanel data={todayQuery.data} />
          ) : null}
        </div>

        {/* Deadlines */}
        <div className="xl:col-span-4">
          {deadlinesQuery.isLoading ? (
            <HUDPanel title="UPCOMING DEADLINES" variant="amber">
              <div className="flex items-center justify-center min-h-[200px]">
                <span className="text-amber-400/60 font-mono text-sm hud-pulse">
                  Loading deadlines...
                </span>
              </div>
            </HUDPanel>
          ) : deadlinesQuery.error ? (
            <HUDPanel title="UPCOMING DEADLINES" variant="amber">
              <div className="text-red-400/80 text-sm font-mono">
                Error: {deadlinesQuery.error.message}
              </div>
            </HUDPanel>
          ) : deadlinesQuery.data ? (
            <DeadlinesPanel data={deadlinesQuery.data} />
          ) : null}
        </div>
      </div>

      {/* Feed Health - full width bottom */}
      {feedStatusQuery.isLoading ? (
        <HUDPanel title="FEED HEALTH" variant="purple">
          <div className="flex items-center justify-center min-h-[80px]">
            <span className="text-purple-400/60 font-mono text-sm hud-pulse">
              Connecting...
            </span>
          </div>
        </HUDPanel>
      ) : feedStatusQuery.error ? (
        <HUDPanel title="FEED HEALTH" variant="purple">
          <div className="text-red-400/80 text-sm font-mono">
            Error: {feedStatusQuery.error.message}
          </div>
        </HUDPanel>
      ) : feedStatusQuery.data ? (
        <FeedHealthPanel data={feedStatusQuery.data} />
      ) : null}
    </div>
  )
}
