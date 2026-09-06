import { useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useHUDSnapshot } from '../components/hud/hooks/useHUDSnapshot'
import {
  useHUDConfig,
  useHUDConfigPatch,
} from '../components/hud/hooks/useHUDConfig'
import { WhoopWidget } from '../screens/dashboard/widgets/whoop-widget'
import { ClinitrackWidget } from '../screens/dashboard/widgets/clinitrack-widget'
import { SpotifyWidget } from '../screens/dashboard/widgets/spotify-widget'
import { SwarmStatusWidget } from '../screens/dashboard/widgets/swarm-status-widget'
import { UptimeWidget } from '../screens/dashboard/widgets/uptime-widget'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
  ssr: false,
})

// ── Types ─────────────────────────────────────────────────────────────────

type WidgetMap = Record<string, { data?: unknown; state?: string }>

interface CalendarEventLite {
  id: string
  summary: string
  start: string
  end: string
  location?: string
  description?: string
  feed_name: string
  category: string
  is_all_day: boolean
}

interface TodayResponse {
  events: Array<CalendarEventLite>
}
interface WeekResponse {
  events: Array<CalendarEventLite>
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

interface RecoveryData {
  label?: string
  title?: string
  sub?: string
  details?: {
    recovery_pct: number
    hrv_ms: number
    resting_hr_bpm: number
    sleep_hours: number
    sleep_performance_pct: number
    day_strain: number
  }
  recommendation?: { activity: string; reason: string }
}

interface InboxItemData {
  id: string
  severity: 'urgent' | 'warn' | 'ok' | 'info' | 'dim'
  tag: string
  body: string
  when: string
  href?: string
}

interface SimpleWidget {
  value?: string
  sub?: string
  tone?: 'ok' | 'warn' | 'err' | 'info'
}

// ── Theme ─────────────────────────────────────────────────────────────────

const ACCENT = '#7A5CFF'
const ACCENT_LIGHT = '#B191FF'
const FONT_STACK =
  "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
const MONO_STACK = "'JetBrains Mono', ui-monospace, monospace"

const TZ = 'Australia/Adelaide'

// ── Time helpers ──────────────────────────────────────────────────────────

function getGreeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ,
      hour: '2-digit',
      hour12: false,
    }).format(now),
  )
  if (hour < 5) return 'Late night'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 21) return 'Good evening'
  return 'Night shift'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatClock(now: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

function formatDateLong(now: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)
}

function localDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function isTodayLocal(iso: string, now: Date): boolean {
  return localDateKey(new Date(iso)) === localDateKey(now)
}

function isTomorrow(iso: string, now: Date): boolean {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return localDateKey(new Date(iso)) === localDateKey(tomorrow)
}

// Open Google Calendar at the event's local date. We can't construct a true
// event deep-link from just the raw id (Google needs base64(event_id+cal_id))
// — day view is the next best and always works.
function googleCalendarDayUrl(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(iso))
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026'
  const m = parts.find((p) => p.type === 'month')?.value ?? '1'
  const d = parts.find((p) => p.type === 'day')?.value ?? '1'
  return `https://calendar.google.com/calendar/u/0/r/day/${y}/${m}/${d}`
}

function formatCountdown(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'NOW'
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'STARTING'
  if (diffMin < 60) return `IN ${diffMin} MIN`
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  if (hours < 6 && mins > 0) return `IN ${hours}H ${mins}M`
  return `IN ${hours}H`
}

function firstActionFromBrief(briefText: string | undefined): string | null {
  if (!briefText) return null
  const lines = briefText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const firstAction = lines.findIndex((l) => /^\*?\*?first action/i.test(l))
  if (firstAction >= 0 && firstAction + 1 < lines.length) {
    return lines[firstAction + 1]
      .replace(/^[-*]\s+/, '')
      .replace(/[*_`]/g, '')
      .trim()
  }
  return null
}

function categoryGlyph(category: string): { letter: string; full: string } {
  const c = category.toLowerCase()
  if (c === 'uni' || c === 'university' || c === 'study')
    return { letter: 'U', full: 'University' }
  if (c === 'clinic' || c === 'tadc' || c === 'hcc')
    return { letter: 'C', full: 'Clinic' }
  if (c === 'family') return { letter: 'F', full: 'Family' }
  if (c === 'work' || c === 'project' || c === 'projects' || c === 'praxentis')
    return { letter: 'W', full: 'Work' }
  return { letter: 'L', full: 'Life' }
}

// ── Day timeline strip ────────────────────────────────────────────────────
// 06:00 → 21:00 axis. Events plotted at their start time. Current time as a
// soft purple vertical line. Past events dim, the next event glows. Click a
// glyph to open in Google Calendar.

const TIMELINE_START_H = 6
const TIMELINE_END_H = 21
const TIMELINE_TOTAL_MIN = (TIMELINE_END_H - TIMELINE_START_H) * 60

function minutesIntoTimeline(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return (h - TIMELINE_START_H) * 60 + m
}

function minutesNowInTimeline(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return (h - TIMELINE_START_H) * 60 + m
}

function pctFromHour(h: number): number {
  return ((h - TIMELINE_START_H) / (TIMELINE_END_H - TIMELINE_START_H)) * 100
}

function DayTimeline({
  events,
  now,
  nextEventId,
}: {
  events: Array<CalendarEventLite>
  now: Date
  nextEventId: string | null
}) {
  const nowMin = minutesNowInTimeline(now)
  const nowPct = (nowMin / TIMELINE_TOTAL_MIN) * 100
  const nowOnAxis = nowMin >= 0 && nowMin <= TIMELINE_TOTAL_MIN

  const placeable = events
    .filter((e) => !e.is_all_day)
    .map((e) => ({ ev: e, min: minutesIntoTimeline(e.start) }))
    .filter((p) => p.min >= 0 && p.min <= TIMELINE_TOTAL_MIN)

  const outOfRange = events
    .filter((e) => !e.is_all_day)
    .map((e) => ({ ev: e, min: minutesIntoTimeline(e.start) }))
    .filter((p) => p.min < 0 || p.min > TIMELINE_TOTAL_MIN)

  const allDay = events.filter((e) => e.is_all_day)

  const ticks = [6, 9, 12, 15, 18, 21]

  return (
    <div className="space-y-3">
      {(allDay.length > 0 || outOfRange.length > 0) && (
        <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
          {allDay.map((e) => (
            <span
              key={e.id}
              className="px-2 py-0.5 rounded-md bg-slate-900/60 border border-slate-800/80"
            >
              <span className="text-slate-600 mr-1">ALL DAY</span>
              {e.summary}
            </span>
          ))}
          {outOfRange.map(({ ev }) => (
            <span
              key={ev.id}
              className="px-2 py-0.5 rounded-md bg-slate-900/60 border border-slate-800/80"
            >
              <span
                className="text-slate-600 mr-1 tabular-nums"
                style={{ fontFamily: MONO_STACK }}
              >
                {formatTime(ev.start)}
              </span>
              {ev.summary}
            </span>
          ))}
        </div>
      )}

      <div
        className="relative h-16 select-none"
        aria-label="Today's events timeline"
      >
        {/* axis */}
        <div className="absolute inset-x-0 top-9 h-px bg-slate-800/80" />

        {/* tick marks */}
        {ticks.map((h) => (
          <div
            key={`t-${h}`}
            className="absolute top-9 h-1.5 w-px bg-slate-700/70 -translate-x-1/2"
            style={{ left: `${pctFromHour(h)}%` }}
          />
        ))}

        {/* tick labels */}
        {ticks.map((h) => (
          <div
            key={`l-${h}`}
            className="absolute top-11 -translate-x-1/2 text-[10px] tabular-nums text-slate-600 font-medium"
            style={{ left: `${pctFromHour(h)}%`, fontFamily: MONO_STACK }}
          >
            {String(h).padStart(2, '0')}
          </div>
        ))}

        {/* events */}
        {placeable.map(({ ev, min }) => {
          const pct = (min / TIMELINE_TOTAL_MIN) * 100
          const past = min < nowMin
          const isNext = ev.id === nextEventId
          const g = categoryGlyph(ev.category)
          const tooltip = `${formatTime(ev.start)} · ${ev.summary}${
            ev.location ? ' · ' + ev.location : ''
          }`
          return (
            <a
              key={ev.id}
              href={googleCalendarDayUrl(ev.start)}
              target="_blank"
              rel="noopener noreferrer"
              title={tooltip}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center group"
              style={{ left: `${pct}%` }}
            >
              <span
                className={
                  past
                    ? 'inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold bg-slate-900/60 border border-slate-800 text-slate-600 transition-colors'
                    : isNext
                      ? 'inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold text-slate-50 border transition-colors'
                      : 'inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold bg-slate-800/80 border border-slate-700/80 text-slate-200 group-hover:text-slate-50 group-hover:border-slate-600 transition-colors'
                }
                style={
                  isNext
                    ? {
                        backgroundColor: 'rgba(122,92,255,0.22)',
                        borderColor: ACCENT,
                        boxShadow: `0 0 14px rgba(122,92,255,0.55)`,
                      }
                    : undefined
                }
              >
                {g.letter}
              </span>
              <span
                className={`w-px mt-0 ${past ? 'bg-slate-800/60' : 'bg-slate-700/80'}`}
                style={{ height: '12px' }}
              />
            </a>
          )
        })}

        {/* now line */}
        {nowOnAxis && (
          <>
            <div
              className="absolute top-0"
              style={{
                left: `${nowPct}%`,
                bottom: '0.5rem',
                width: '1px',
                backgroundColor: ACCENT,
                boxShadow: `0 0 10px rgba(122,92,255,0.7), 0 0 22px rgba(122,92,255,0.32)`,
                transform: 'translateX(-0.5px)',
              }}
              aria-hidden="true"
            />
            <div
              className="absolute -translate-x-1/2 text-[9px] uppercase tracking-[0.22em] font-bold"
              style={{
                top: '-12px',
                left: `${nowPct}%`,
                color: ACCENT_LIGHT,
                fontFamily: MONO_STACK,
              }}
            >
              Now
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Section primitive ─────────────────────────────────────────────────────
// Heading + content, NO card chrome. Replaces the old <Card>.

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-[10px] uppercase tracking-[0.24em] font-semibold text-slate-400">
          {title}
        </h2>
        {action}
      </header>
      <div>{children}</div>
    </section>
  )
}

// ── Next up ───────────────────────────────────────────────────────────────

function NextUp({
  next,
  now,
}: {
  next: { kind: 'today' | 'tomorrow'; ev: CalendarEventLite } | null
  now: Date
}) {
  if (!next) {
    return (
      <div className="py-1">
        <div className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-500 mb-2">
          Up next
        </div>
        <p className="text-xl text-slate-400 font-medium">Day clear.</p>
      </div>
    )
  }

  const target = new Date(next.ev.start)
  const meta =
    next.kind === 'today'
      ? formatCountdown(target, now)
      : `TOMORROW · ${formatTime(next.ev.start)}`
  const g = categoryGlyph(next.ev.category)

  return (
    <div className="py-1">
      <div
        className="text-[10px] uppercase tracking-[0.28em] font-bold tabular-nums mb-2"
        style={{ color: ACCENT_LIGHT, fontFamily: MONO_STACK }}
      >
        {meta}
      </div>
      <a
        href={googleCalendarDayUrl(next.ev.start)}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
        title="Open in Google Calendar"
      >
        <h3 className="text-2xl md:text-[28px] font-semibold tracking-tight text-slate-50 leading-tight group-hover:text-white">
          {next.ev.summary}
        </h3>
        <div className="mt-2 text-sm text-slate-400 flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-slate-800/80 border border-slate-700 text-slate-300">
            {g.letter}
          </span>
          <span className="tabular-nums" style={{ fontFamily: MONO_STACK }}>
            {next.kind === 'today'
              ? `${formatTime(next.ev.start)}–${formatTime(next.ev.end)}`
              : formatTime(next.ev.start)}
          </span>
          {next.ev.location && (
            <span className="text-slate-500 truncate">
              · {next.ev.location}
            </span>
          )}
        </div>
      </a>
    </div>
  )
}

// ── First action hero ─────────────────────────────────────────────────────
// The one drenched panel on the page. Composes First action + Body says.

function Hero({
  firstAction,
  rec,
}: {
  firstAction: string | null
  rec?: { activity: string; reason: string }
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl px-7 py-6 md:px-8 md:py-7 border"
      style={{
        background:
          'linear-gradient(135deg, rgba(122,92,255,0.16) 0%, rgba(122,92,255,0.04) 60%, rgba(10,15,29,0.5) 100%)',
        borderColor: 'rgba(122,92,255,0.32)',
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-10 items-start">
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-[0.28em] font-bold mb-3"
            style={{ color: ACCENT_LIGHT }}
          >
            First action
          </div>
          {firstAction ? (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(firstAction).catch(() => {})
              }}
              className="text-left cursor-pointer block group w-full"
              title="Copy to clipboard"
            >
              <p className="text-2xl md:text-[30px] leading-[1.2] text-slate-50 font-medium tracking-tight group-hover:text-white">
                {firstAction}
              </p>
              <span className="text-[10px] uppercase tracking-[0.22em] text-slate-600 mt-3 inline-block opacity-0 group-hover:opacity-100 transition-opacity">
                Tap to copy
              </span>
            </button>
          ) : (
            <p className="text-base text-slate-500 italic">
              No brief yet. Regen the morning brief to set today&apos;s lead
              action.
            </p>
          )}
        </div>

        {rec && (
          <div className="md:max-w-[220px] md:text-right border-t md:border-t-0 md:border-l border-slate-700/40 pt-4 md:pt-0 md:pl-6">
            <div className="text-[10px] uppercase tracking-[0.24em] font-semibold text-slate-400 mb-2">
              Body says
            </div>
            <div className="text-base font-semibold text-slate-100">
              {rec.activity}
            </div>
            <div className="text-[11px] text-slate-500 mt-1 leading-snug">
              {rec.reason}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Body / Whoop status tiles ─────────────────────────────────────────────
// Three clearly labelled, separated tiles. Lighter chrome than the hero so
// they don't re-establish a card grid with the rest of the page.

function StatusTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const valueColor =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-rose-300'
          : 'text-slate-100'
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/30 px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold">
        {label}
      </div>
      <div
        className={`mt-2 text-3xl font-semibold tabular-nums leading-none ${valueColor}`}
        style={{ fontFamily: MONO_STACK }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11px] text-slate-500 mt-2 leading-snug">
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Telemetry tile (System / Work / Calendar feeds) ──────────────────────
// Smaller than Body tiles. Each tile carries an `id` so anchor links land
// on it (e.g. /dashboard#system, /dashboard#work, /dashboard#calendar).

function TelemetryTile({
  id,
  label,
  value,
  sub,
  tone = 'neutral',
  href,
}: {
  id: string
  label: string
  value?: string
  sub?: string
  tone?: 'ok' | 'warn' | 'err' | 'info' | 'neutral'
  href?: string
}) {
  const toneClass =
    tone === 'err'
      ? 'text-rose-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'ok'
          ? 'text-emerald-300'
          : 'text-slate-100'
  const borderClass =
    tone === 'err'
      ? 'border-rose-500/40'
      : tone === 'warn'
        ? 'border-amber-500/30'
        : 'border-slate-800/80'
  const content = (
    <>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400 font-semibold">
        {label}
      </div>
      <div
        className={`mt-2 text-xl font-semibold tabular-nums leading-none ${toneClass}`}
        style={{ fontFamily: MONO_STACK }}
      >
        {value ?? '—'}
      </div>
      {sub && (
        <div className="text-[11px] text-slate-500 mt-1.5 leading-snug">
          {sub}
        </div>
      )}
    </>
  )
  const className = `rounded-xl border bg-slate-900/30 px-4 py-3 scroll-mt-16 transition-colors ${borderClass}`
  if (href) {
    const isExternal = href.startsWith('http')
    return (
      <a
        id={id}
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        className={`${className} hover:bg-slate-900/50 block group/tile`}
        title={`Open ${label.toLowerCase()}`}
      >
        {content}
      </a>
    )
  }
  return (
    <div id={id} className={className}>
      {content}
    </div>
  )
}

function Telemetry({
  vm,
  cliniko,
  feeds,
}: {
  vm: SimpleWidget | undefined
  cliniko: SimpleWidget | undefined
  feeds: SimpleWidget | undefined
}) {
  // Always render so #system / #work / #calendar anchors exist as soon
  // as the dashboard mounts — even if data is still loading.
  return (
    <Section title="Telemetry">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TelemetryTile
          id="system"
          label="VM health"
          value={vm?.value}
          sub={vm?.sub}
          tone={vm?.tone === 'info' ? 'ok' : (vm?.tone ?? 'neutral')}
        />
        <TelemetryTile
          id="work"
          label="Work today"
          value={cliniko?.value}
          sub={
            cliniko?.value
              ? `${cliniko.value === '1' ? 'appointment' : 'appointments'} on Cliniko`
              : 'No data'
          }
          tone="neutral"
        />
        <TelemetryTile
          id="calendar"
          label="Calendar feeds"
          value={feeds?.value}
          sub={feeds?.sub}
          tone={feeds?.tone === 'info' ? 'ok' : (feeds?.tone ?? 'neutral')}
        />
      </div>
    </Section>
  )
}

// Card chrome for richer widgets (Whoop/Clinitrack/Spotify/Swarm/Uptime)
// that ship their own label inside. The widgets render their own header,
// so VitalsTile only supplies the panel frame + hover state — no extra label.
function VitalsTile({
  children,
  label,
}: {
  children: React.ReactNode
  label?: string
}) {
  return (
    <div
      className="rounded-lg border border-slate-900/80 bg-slate-950/40 p-3 transition-colors hover:border-slate-800"
      style={{ minHeight: '88px' }}
      aria-label={label}
    >
      {children}
    </div>
  )
}

function BodyStatus({ recovery }: { recovery: RecoveryData }) {
  const d = recovery.details
  if (!d) return null
  const recoveryTone: 'good' | 'warn' | 'bad' =
    d.recovery_pct >= 67 ? 'good' : d.recovery_pct >= 34 ? 'warn' : 'bad'
  return (
    <Section title="Body">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatusTile
          label="Recovery"
          value={`${Math.round(d.recovery_pct)}%`}
          sub={`HRV ${Math.round(d.hrv_ms)} ms · RHR ${Math.round(d.resting_hr_bpm)} bpm`}
          tone={recoveryTone}
        />
        <StatusTile
          label="Day strain"
          value={d.day_strain.toFixed(1)}
          sub="Yesterday"
        />
        <StatusTile
          label="Sleep"
          value={`${d.sleep_hours.toFixed(1)}h`}
          sub={`${Math.round(d.sleep_performance_pct)}% performance`}
        />
      </div>
    </Section>
  )
}

// ── Tomorrow row (typographic, no card) ───────────────────────────────────

function TomorrowRow({ ev }: { ev: CalendarEventLite }) {
  const g = categoryGlyph(ev.category)
  return (
    <li>
      <a
        href={googleCalendarDayUrl(ev.start)}
        target="_blank"
        rel="noopener noreferrer"
        title={ev.location ? `${ev.summary} · ${ev.location}` : ev.summary}
        className="flex items-center gap-4 py-2 group hover:bg-slate-900/40 rounded-md -mx-2 px-2 transition-colors"
      >
        <span
          className="w-12 text-right text-sm font-semibold tabular-nums text-slate-300"
          style={{ fontFamily: MONO_STACK }}
        >
          {ev.is_all_day ? 'ALL' : formatTime(ev.start)}
        </span>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-slate-800/80 border border-slate-700 text-slate-300">
          {g.letter}
        </span>
        <span className="text-sm text-slate-100 truncate flex-1 min-w-0">
          {ev.summary}
          {ev.location && (
            <span className="text-slate-500 ml-2 text-[11px]">
              {ev.location}
            </span>
          )}
        </span>
      </a>
    </li>
  )
}

// ── Deadline row ──────────────────────────────────────────────────────────

function DeadlineRow({
  d,
  onConfirm,
}: {
  d: Deadline
  onConfirm?: (id: string, status: string) => void
}) {
  let pillClass: string
  let pillText: string
  const isPast = d.days_away < 0
  if (d.days_away === 0) {
    pillClass = 'text-rose-200 border-rose-500/50 bg-rose-500/15'
    pillText = 'TODAY'
  } else if (d.days_away === 1) {
    pillClass = 'text-amber-200 border-amber-500/50 bg-amber-500/15'
    pillText = 'TOMORROW'
  } else if (d.days_away <= 7) {
    pillClass = 'text-amber-200 border-amber-500/30 bg-amber-500/10'
    pillText = `${d.days_away} DAYS`
  } else if (isPast) {
    pillClass = 'text-slate-500 border-slate-700/50 bg-slate-800/30'
    pillText = 'PAST'
  } else {
    pillClass = 'text-slate-300 border-slate-700/40 bg-slate-800/30'
    pillText = `${d.days_away} DAYS`
  }

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-slate-100 truncate">
          <span
            className="font-semibold mr-1.5"
            style={{ color: ACCENT_LIGHT }}
          >
            {d.unit}
          </span>
          {d.assessment}
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {d.type}
          {d.is_hurdle && <span className="ml-2 text-rose-300">· Hurdle</span>}
          {!d.is_hurdle && d.weight && (
            <span className="ml-2">· {d.weight}</span>
          )}
        </div>
        {isPast && onConfirm && (
          <div className="flex items-center gap-1.5 mt-1.5">
            {(['passed', 'failed', 'postponed'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onConfirm(d.id, s)}
                className="text-[10px] px-2 py-0.5 rounded border border-slate-700/50 bg-slate-800/40 text-slate-500 hover:text-emerald-300 hover:border-emerald-500/40 transition-colors capitalize"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <span
        className={`flex-shrink-0 text-[11px] font-bold tracking-[0.12em] px-2 py-1 rounded border uppercase ${pillClass}`}
      >
        {pillText}
      </span>
    </li>
  )
}

// ── Mission Objective row (full-row tint, NO side-stripe) ─────────────────

function MissionObjectiveRow({
  item,
  onDismiss,
  dismissPending,
}: {
  item: InboxItemData
  onDismiss: (id: string) => void
  dismissPending: boolean
}) {
  const fill =
    item.severity === 'urgent'
      ? 'bg-rose-500/10 hover:bg-rose-500/15'
      : item.severity === 'warn'
        ? 'bg-amber-500/[0.07] hover:bg-amber-500/10'
        : item.severity === 'info'
          ? 'bg-[#7A5CFF]/[0.08] hover:bg-[#7A5CFF]/[0.12]'
          : 'bg-slate-900/40 hover:bg-slate-900/60'
  const dotColor =
    item.severity === 'urgent'
      ? '#FB7185'
      : item.severity === 'warn'
        ? '#FBBF24'
        : item.severity === 'info'
          ? ACCENT_LIGHT
          : '#475569'

  const isExternal = item.href?.startsWith('http')
  const bodyContent = (
    <>
      <span
        aria-hidden="true"
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: dotColor,
          boxShadow: `0 0 6px ${dotColor}88`,
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-0.5 font-semibold">
          {item.tag}
        </div>
        <div className="text-sm text-slate-100 group-hover/link:text-white transition-colors">
          {item.body}
        </div>
      </div>
      <div className="text-[10px] text-slate-500 whitespace-nowrap">
        {item.when}
      </div>
    </>
  )

  const clickableBody = item.href ? (
    <a
      href={item.href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group/link"
      title={`Open ${item.tag.toLowerCase()}`}
    >
      {bodyContent}
    </a>
  ) : (
    <div className="flex items-center gap-3 min-w-0 flex-1">{bodyContent}</div>
  )

  return (
    <li
      className={`group flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${fill}`}
    >
      {clickableBody}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDismiss(item.id)
        }}
        disabled={dismissPending}
        className="ml-1 opacity-40 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-emerald-300 disabled:cursor-not-allowed px-2 py-1 rounded hover:bg-emerald-500/10 flex-shrink-0"
        aria-label={`Mark "${item.body}" as done`}
        title="Mark done"
      >
        ✓
      </button>
    </li>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function DashboardPage() {
  const { data: snapshot } = useHUDSnapshot()
  const { data: cfg } = useHUDConfig()
  const patchConfig = useHUDConfigPatch()

  const todayQuery = useQuery<TodayResponse>({
    queryKey: ['calendar', 'today'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/today')
      if (!res.ok) throw new Error('today fetch failed')
      return res.json()
    },
    refetchInterval: 60_000,
    staleTime: 55_000,
  })
  const weekQuery = useQuery<WeekResponse>({
    queryKey: ['calendar', 'week'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/week')
      if (!res.ok) throw new Error('week fetch failed')
      return res.json()
    },
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  })
  const deadlinesQuery = useQuery<DeadlinesResponse>({
    queryKey: ['calendar', 'deadlines'],
    queryFn: async () => {
      const res = await fetch('/api/calendar/deadlines')
      if (!res.ok) throw new Error('deadlines fetch failed')
      return res.json()
    },
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  })

  const widgets = (snapshot?.widgets ?? {}) as WidgetMap
  const recovery = widgets['recovery'].data as RecoveryData | undefined
  const inboxItems = (widgets['inbox'].data ?? []) as Array<InboxItemData>
  const briefText = (widgets['brief'].data as { text?: string } | undefined)
    ?.text
  const vm = widgets['vm-health'].data as SimpleWidget | undefined
  const cliniko = widgets['cliniko'].data as SimpleWidget | undefined
  const feeds = widgets['calendar-feeds'].data as SimpleWidget | undefined

  // Tick once every 30s so the now-line and countdown stay current.
  const [now, setNow] = useState<Date>(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // SSR is off, so the browser's native hash-scroll fires before the
  // anchor elements exist. Replay it once on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash) return
    const id = window.location.hash.slice(1)
    requestAnimationFrame(() => {
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  const greeting = getGreeting(now)
  const dateLong = formatDateLong(now)
  const clockStr = formatClock(now)
  const firstAction = useMemo(
    () => firstActionFromBrief(briefText),
    [briefText],
  )

  // Defensive: /api/calendar/today has historically returned multi-day events.
  // Filter to actual today (Adelaide local) so the timeline can't be polluted.
  const todayEvents = useMemo(() => {
    const evs = todayQuery.data?.events ?? []
    return [...evs]
      .filter((e) => isTodayLocal(e.start, now))
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [todayQuery.data, now])

  const tomorrowEvents = useMemo(() => {
    const evs = weekQuery.data?.events ?? []
    return evs
      .filter((e) => isTomorrow(e.start, now))
      .sort((a, b) => a.start.localeCompare(b.start))
  }, [weekQuery.data, now])

  const deadlines = useMemo(
    () => (deadlinesQuery.data?.deadlines ?? []).slice(0, 5),
    [deadlinesQuery.data],
  )

  const nextUp = useMemo<{
    kind: 'today' | 'tomorrow'
    ev: CalendarEventLite
  } | null>(() => {
    const future = todayEvents.filter(
      (e) => !e.is_all_day && new Date(e.start) > now,
    )
    if (future.length > 0) return { kind: 'today', ev: future[0] }
    if (tomorrowEvents.length > 0)
      return { kind: 'tomorrow', ev: tomorrowEvents[0] }
    return null
  }, [todayEvents, tomorrowEvents, now])

  const nextEventId = nextUp?.kind === 'today' ? nextUp.ev.id : null

  const rec = recovery?.recommendation

  const handleDismiss = (id: string) => {
    const next = {
      ...(cfg?.dismissed_inbox_items ?? {}),
      [id]: Date.now() + ONE_DAY_MS,
    }
    patchConfig.mutate({ dismissed_inbox_items: next })
  }
  const handleDeadlineConfirm = (id: string, status: string) => {
    const next = {
      ...(cfg?.deadline_attendance ?? {}),
      [id]: { status, updated_at: Date.now() },
    }
    patchConfig.mutate({ deadline_attendance: next })
  }

  const TOMORROW_CAP = 4
  const tomorrowVisible = tomorrowEvents.slice(0, TOMORROW_CAP)
  const tomorrowOverflow = Math.max(0, tomorrowEvents.length - TOMORROW_CAP)

  return (
    <div
      className="min-h-screen text-slate-100"
      style={{ fontFamily: FONT_STACK, background: '#050810' }}
    >
      {/* Soft top wash — single static decorative element. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(122,92,255,0.10) 0%, transparent 60%)',
        }}
      />

      <main className="relative max-w-5xl mx-auto px-6 md:px-10 pt-10 pb-16 space-y-10">
        {/* Header: tiny greeting (left) + anchored clock+date (right) */}
        <header className="flex items-start justify-between gap-6">
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500 font-semibold pt-3">
            {greeting}, Nick
          </div>
          <div className="text-right">
            <div
              className="text-3xl md:text-[40px] font-semibold tabular-nums leading-none tracking-tight text-slate-50"
              style={{ fontFamily: MONO_STACK }}
            >
              {clockStr}
            </div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500 font-medium mt-2">
              {dateLong}
            </div>
          </div>
        </header>

        {/* Day timeline strip — spatial view of today */}
        <DayTimeline events={todayEvents} now={now} nextEventId={nextEventId} />

        {/* First action hero — drenched panel, composes Body says */}
        <Hero firstAction={firstAction} rec={rec} />

        {/* Next up — the imminent thing */}
        <NextUp next={nextUp} now={now} />

        {/* Body — WHOOP readiness (richer than HUD-served BodyStatus tiles) */}
        <Section title="Body">
          <WhoopWidget />
        </Section>

        {/* System Vitals — CliniTrack, Spotify, Swarm, Workspace uptime */}
        <Section
          title="System vitals"
          action={
            <span className="text-[10px] text-slate-500">live · 30s</span>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <VitalsTile label="Workspace">
              <UptimeWidget />
            </VitalsTile>
            <VitalsTile label="CliniTrack">
              <ClinitrackWidget />
            </VitalsTile>
            <VitalsTile label="Swarm">
              <SwarmStatusWidget />
            </VitalsTile>
            <VitalsTile label="Spotify">
              <SpotifyWidget />
            </VitalsTile>
          </div>
        </Section>

        {/* Telemetry — VM, Cliniko, Calendar feed health */}
        <Telemetry vm={vm} cliniko={cliniko} feeds={feeds} />

        {/* Tomorrow */}
        <Section
          title="Tomorrow"
          action={
            <span
              className="text-[10px] text-slate-500 tabular-nums"
              style={{ fontFamily: MONO_STACK }}
            >
              {tomorrowEvents.length} event
              {tomorrowEvents.length === 1 ? '' : 's'}
            </span>
          }
        >
          {weekQuery.isLoading && (
            <div className="text-sm text-slate-500">Loading…</div>
          )}
          {!weekQuery.isLoading && tomorrowVisible.length === 0 && (
            <div className="text-sm text-slate-500">Nothing scheduled.</div>
          )}
          <ul>
            {tomorrowVisible.map((ev) => (
              <TomorrowRow key={ev.id} ev={ev} />
            ))}
          </ul>
          {tomorrowOverflow > 0 && (
            <div className="text-[11px] text-slate-600 mt-1 pl-14">
              + {tomorrowOverflow} more
            </div>
          )}
        </Section>

        {/* Deadlines */}
        {deadlines.length > 0 && (
          <Section
            title="Deadlines"
            action={
              <span className="text-[10px] text-slate-500">
                {deadlinesQuery.data?.semester_name}
              </span>
            }
          >
            <ul className="divide-y divide-slate-900/70">
              {deadlines.map((d) => (
                <DeadlineRow
                  key={d.id}
                  d={d}
                  onConfirm={handleDeadlineConfirm}
                />
              ))}
            </ul>
          </Section>
        )}

        {/* Mission Objectives */}
        {inboxItems.length > 0 && (
          <Section
            title="Mission Objectives"
            action={
              <span className="text-[10px] text-slate-500">
                {inboxItems.length} active
                {patchConfig.isPending && (
                  <span className="ml-2 text-slate-400">· saving…</span>
                )}
              </span>
            }
          >
            <ul className="space-y-1.5">
              {inboxItems.map((item) => (
                <MissionObjectiveRow
                  key={item.id}
                  item={item}
                  onDismiss={handleDismiss}
                  dismissPending={patchConfig.isPending}
                />
              ))}
            </ul>
          </Section>
        )}

        {/* Quick Access — typographic inline row, no emoji cards */}
        <nav
          className="pt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.22em] text-slate-500 font-medium border-t border-slate-900/80"
          aria-label="Quick access"
        >
          {[
            { href: '/chat', label: 'Chat' },
            { href: '/files', label: 'Files' },
            { href: '/uni/obsidian', label: 'Obsidian' },
            { href: '/uni/calendar', label: 'Calendar' },
          ].map((q, i, arr) => (
            <span key={q.href} className="flex items-center gap-x-5">
              <Link
                to={q.href}
                className="hover:text-slate-200 hover:underline underline-offset-4 transition-colors"
              >
                {q.label}
              </Link>
              {i < arr.length - 1 && <span className="text-slate-800">·</span>}
            </span>
          ))}
        </nav>
      </main>
    </div>
  )
}
