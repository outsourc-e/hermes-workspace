import { useMemo, useState } from 'react'
import { ArrowLeft01Icon, ArrowRight01Icon, Clock01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/lib/utils'

export type CalendarViewProps = {
  cronJobs: Array<{ id: string; name: string; schedule: string; nextRunAt: number; enabled: boolean }>
  missionRuns: Array<{ id: string; title: string; startedAt: number; completedAt?: number; status: 'running' | 'complete' | 'failed' }>
  onSelectEvent?: (event: { type: 'cron' | 'mission'; id: string }) => void
}

type CalendarMode = 'month' | 'week' | 'day'

type ParsedCronSchedule = {
  kind: 'daily' | 'weekly' | 'monthly'
  hour: number
  minute: number
  weekdays: number[]
  monthDay: number
}

type CalendarEvent = {
  key: string
  type: 'cron' | 'mission'
  id: string
  title: string
  date: Date
  status?: 'running' | 'complete' | 'failed'
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfWeek(date: Date): Date {
  const base = startOfDay(date)
  return addDays(base, -base.getDay())
}

function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseHourMinute(schedule: string, fallbackDate: Date): { hour: number; minute: number } {
  const text = schedule.toLowerCase()
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/)
  if (match) {
    let hour = Number(match[1])
    const minute = Number(match[2] ?? '0')
    const meridiem = match[3]
    if (meridiem === 'pm' && hour < 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    return { hour: Math.max(0, Math.min(23, hour)), minute: Math.max(0, Math.min(59, minute)) }
  }

  return { hour: fallbackDate.getHours(), minute: fallbackDate.getMinutes() }
}

function parseCronWeekdays(value: string): number[] {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean)
  const weekdays = new Set<number>()

  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      const num = Number(part)
      if (num >= 0 && num <= 7) weekdays.add(num === 7 ? 0 : num)
      continue
    }

    const lowered = part.toLowerCase().slice(0, 3)
    const map: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    }
    if (lowered in map) weekdays.add(map[lowered])
  }

  return [...weekdays]
}

function parseSchedule(schedule: string, fallbackDate: Date): ParsedCronSchedule {
  const text = schedule.toLowerCase().trim()
  const fallbackTime = parseHourMinute(schedule, fallbackDate)

  const parts = schedule.trim().split(/\s+/)
  if (parts.length >= 5) {
    const minute = /^\d+$/.test(parts[0]) ? Number(parts[0]) : fallbackTime.minute
    const hour = /^\d+$/.test(parts[1]) ? Number(parts[1]) : fallbackTime.hour
    const dayOfMonth = parts[2]
    const dayOfWeek = parts[4]

    if (dayOfWeek !== '*' && dayOfWeek !== '?') {
      const weekdays = parseCronWeekdays(dayOfWeek)
      return {
        kind: 'weekly',
        hour,
        minute,
        weekdays: weekdays.length ? weekdays : [fallbackDate.getDay()],
        monthDay: fallbackDate.getDate(),
      }
    }

    if (dayOfMonth !== '*' && dayOfMonth !== '?' && /^\d+$/.test(dayOfMonth)) {
      return {
        kind: 'monthly',
        hour,
        minute,
        weekdays: [],
        monthDay: Number(dayOfMonth),
      }
    }

    return {
      kind: 'daily',
      hour,
      minute,
      weekdays: [],
      monthDay: fallbackDate.getDate(),
    }
  }

  const namedWeekdays: Array<[string, number]> = [
    ['sunday', 0],
    ['monday', 1],
    ['tuesday', 2],
    ['wednesday', 3],
    ['thursday', 4],
    ['friday', 5],
    ['saturday', 6],
    ['sun', 0],
    ['mon', 1],
    ['tue', 2],
    ['wed', 3],
    ['thu', 4],
    ['fri', 5],
    ['sat', 6],
  ]

  const weekdays = namedWeekdays.filter(([name]) => text.includes(name)).map(([, day]) => day)
  if (weekdays.length || text.includes('weekly') || text.includes('every week')) {
    return {
      kind: 'weekly',
      hour: fallbackTime.hour,
      minute: fallbackTime.minute,
      weekdays: weekdays.length ? Array.from(new Set(weekdays)) : [fallbackDate.getDay()],
      monthDay: fallbackDate.getDate(),
    }
  }

  if (text.includes('monthly') || text.includes('every month')) {
    const dayMatch = text.match(/\b([12]?\d|3[01])(?:st|nd|rd|th)?\b/)
    return {
      kind: 'monthly',
      hour: fallbackTime.hour,
      minute: fallbackTime.minute,
      weekdays: [],
      monthDay: dayMatch ? Number(dayMatch[1]) : fallbackDate.getDate(),
    }
  }

  return {
    kind: 'daily',
    hour: fallbackTime.hour,
    minute: fallbackTime.minute,
    weekdays: [],
    monthDay: fallbackDate.getDate(),
  }
}

function getMonthGrid(referenceDate: Date): { gridStart: Date; gridEnd: Date; days: Date[] } {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0)
  const gridStart = startOfWeek(monthStart)
  const fullDays = Math.ceil((monthEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1
  const visibleDays = fullDays <= 35 ? 35 : 42
  const days = Array.from({ length: visibleDays }, (_, i) => addDays(gridStart, i))
  return { gridStart, gridEnd: addDays(gridStart, visibleDays - 1), days }
}

function statusPillClass(status: 'running' | 'complete' | 'failed'): string {
  if (status === 'complete') return 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
  if (status === 'failed') return 'border border-red-500/30 bg-red-500/15 text-red-300'
  return 'border border-amber-500/30 bg-amber-500/15 text-amber-300'
}

export function CalendarView({ cronJobs, missionRuns, onSelectEvent }: CalendarViewProps) {
  const [mode, setMode] = useState<CalendarMode>('month')
  const [cursorDate, setCursorDate] = useState(() => startOfDay(new Date()))

  const today = startOfDay(new Date())

  const monthGrid = useMemo(() => getMonthGrid(cursorDate), [cursorDate])
  const monthRange = useMemo(
    () => ({ start: monthGrid.gridStart, end: monthGrid.gridEnd, days: monthGrid.days }),
    [monthGrid.days, monthGrid.gridEnd, monthGrid.gridStart],
  )

  const weekRange = useMemo(() => {
    const start = startOfWeek(cursorDate)
    return { start, end: endOfWeek(cursorDate), days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) }
  }, [cursorDate])

  const dayRange = useMemo(() => ({ start: startOfDay(cursorDate), end: startOfDay(cursorDate), days: [startOfDay(cursorDate)] }), [cursorDate])

  const activeRange = mode === 'month' ? monthRange : mode === 'week' ? weekRange : dayRange

  const events = useMemo(() => {
    const rangeStart = startOfDay(activeRange.start)
    const rangeEnd = addDays(startOfDay(activeRange.end), 1)

    const output: CalendarEvent[] = []

    for (const job of cronJobs) {
      if (!job.enabled) continue
      const fallbackDate = new Date(job.nextRunAt)
      const parsed = parseSchedule(job.schedule, fallbackDate)

      for (let day = new Date(rangeStart); day < rangeEnd; day = addDays(day, 1)) {
        let include = false
        if (parsed.kind === 'daily') include = true
        if (parsed.kind === 'weekly') include = parsed.weekdays.includes(day.getDay())
        if (parsed.kind === 'monthly') include = day.getDate() === parsed.monthDay
        if (!include) continue

        const eventDate = new Date(day)
        eventDate.setHours(parsed.hour, parsed.minute, 0, 0)

        output.push({
          key: `cron-${job.id}-${getDayKey(day)}`,
          type: 'cron',
          id: job.id,
          title: job.name,
          date: eventDate,
        })
      }
    }

    for (const run of missionRuns) {
      const eventDate = new Date(run.startedAt)
      if (eventDate >= rangeStart && eventDate < rangeEnd) {
        output.push({
          key: `mission-${run.id}`,
          type: 'mission',
          id: run.id,
          title: run.title,
          date: eventDate,
          status: run.status,
        })
      }
    }

    output.sort((a, b) => a.date.getTime() - b.date.getTime())
    return output
  }, [activeRange.end, activeRange.start, cronJobs, missionRuns])

  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = getDayKey(event.date)
      const list = grouped.get(key)
      if (list) list.push(event)
      else grouped.set(key, [event])
    }
    return grouped
  }, [events])

  function stepCursor(direction: -1 | 1): void {
    if (mode === 'month') {
      setCursorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, 1))
      return
    }

    if (mode === 'week') {
      setCursorDate((prev) => addDays(prev, direction * 7))
      return
    }

    setCursorDate((prev) => addDays(prev, direction))
  }

  const title = useMemo(() => {
    if (mode === 'month') {
      return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(cursorDate)
    }

    if (mode === 'week') {
      const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      return `${formatter.format(weekRange.start)} - ${formatter.format(weekRange.end)}`
    }

    return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(cursorDate)
  }, [cursorDate, mode, weekRange.end, weekRange.start])

  return (
    <section className="rounded-xl border border-primary-800 bg-primary-950 p-3 sm:p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => stepCursor(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-800 text-primary-200 transition-colors hover:bg-primary-900"
            aria-label="Previous"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.7} />
          </button>
          <h3 className="text-sm font-semibold text-primary-100">{title}</h3>
          <button
            type="button"
            onClick={() => stepCursor(1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary-800 text-primary-200 transition-colors hover:bg-primary-900"
            aria-label="Next"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.7} />
          </button>
        </div>

        <div className="inline-flex rounded-md border border-primary-800 bg-primary-900/60 p-0.5">
          {(['month', 'week', 'day'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setMode(view)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                mode === view ? 'bg-accent-500 text-primary-950' : 'text-primary-300 hover:bg-primary-800 hover:text-primary-100',
              )}
            >
              {view}
            </button>
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        {mode === 'month' ? (
          <motion.div
            key="month"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="space-y-2"
          >
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAY_LABELS.map((day) => (
                <div key={day} className="px-1 py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-primary-400">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {monthGrid.days.map((day) => {
                const key = getDayKey(day)
                const dayEvents = eventsByDay.get(key) ?? []
                const isToday = isSameDay(day, today)
                const isOutsideMonth = day.getMonth() !== cursorDate.getMonth()
                const visibleEvents = dayEvents.slice(0, 3)

                return (
                  <div
                    key={key}
                    className={cn(
                      'min-h-[96px] rounded-lg border p-2',
                      isToday ? 'border-accent-500 bg-primary-900/80' : 'border-primary-800 bg-primary-900/40',
                      isOutsideMonth && 'opacity-55',
                    )}
                  >
                    <div className="mb-1.5 text-xs font-semibold text-primary-200">{day.getDate()}</div>
                    <div className="space-y-1">
                      {visibleEvents.map((event) => (
                        <button
                          key={event.key}
                          type="button"
                          onClick={() => onSelectEvent?.({ type: event.type, id: event.id })}
                          className={cn(
                            'flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs',
                            event.type === 'cron'
                              ? 'border border-sky-500/30 bg-sky-500/15 text-sky-200'
                              : statusPillClass(event.status ?? 'running'),
                          )}
                        >
                          <HugeiconsIcon icon={event.type === 'cron' ? RefreshIcon : Clock01Icon} size={12} strokeWidth={1.9} />
                          <span className="truncate">{event.title}</span>
                        </button>
                      ))}
                      {dayEvents.length > 3 ? (
                        <div className="px-1.5 text-[11px] font-medium text-primary-400">+{dayEvents.length - 3} more</div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        ) : null}

        {mode === 'week' ? (
          <motion.div
            key="week"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="overflow-x-auto"
          >
            <div className="min-w-[760px] rounded-lg border border-primary-800">
              <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-primary-800 bg-primary-900/50">
                <div className="border-r border-primary-800 p-2 text-[11px] font-semibold uppercase tracking-wide text-primary-400">Time</div>
                {weekRange.days.map((day) => (
                  <div key={getDayKey(day)} className={cn('border-r border-primary-800 p-2 text-center text-xs font-semibold last:border-r-0', isSameDay(day, today) ? 'text-accent-300' : 'text-primary-200')}>
                    {WEEKDAY_LABELS[day.getDay()]} {day.getDate()}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
                {HOUR_LABELS.map((label, hour) => (
                  <>
                    <div key={`time-${label}`} className="border-r border-t border-primary-800 px-2 py-1.5 text-[10px] text-primary-400">
                      {label}
                    </div>
                    {weekRange.days.map((day) => {
                      const dayEvents = (eventsByDay.get(getDayKey(day)) ?? []).filter((event) => event.date.getHours() === hour)
                      return (
                        <div key={`${getDayKey(day)}-${hour}`} className="min-h-[44px] border-r border-t border-primary-800 p-1 last:border-r-0">
                          <div className="space-y-1">
                            {dayEvents.slice(0, 2).map((event) => (
                              <button
                                key={event.key}
                                type="button"
                                onClick={() => onSelectEvent?.({ type: event.type, id: event.id })}
                                className={cn(
                                  'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]',
                                  event.type === 'cron'
                                    ? 'border border-sky-500/30 bg-sky-500/15 text-sky-200'
                                    : statusPillClass(event.status ?? 'running'),
                                )}
                              >
                                {event.title}
                              </button>
                            ))}
                            {dayEvents.length > 2 ? <div className="text-[10px] text-primary-400">+{dayEvents.length - 2} more</div> : null}
                          </div>
                        </div>
                      )
                    })}
                  </>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}

        {mode === 'day' ? (
          <motion.div
            key="day"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="rounded-lg border border-primary-800"
          >
            <div className="grid grid-cols-[72px_minmax(0,1fr)]">
              {HOUR_LABELS.map((label, hour) => {
                const dayEvents = (eventsByDay.get(getDayKey(cursorDate)) ?? []).filter((event) => event.date.getHours() === hour)
                return (
                  <>
                    <div key={`day-time-${label}`} className="border-r border-t border-primary-800 px-2 py-2 text-[10px] text-primary-400 first:border-t-0">
                      {label}
                    </div>
                    <div key={`day-cell-${hour}`} className="border-t border-primary-800 p-2 first:border-t-0">
                      <div className="space-y-1.5">
                        {dayEvents.map((event) => (
                          <button
                            key={event.key}
                            type="button"
                            onClick={() => onSelectEvent?.({ type: event.type, id: event.id })}
                            className={cn(
                              'w-full rounded-md border p-2 text-left',
                              event.type === 'cron'
                                ? 'border-sky-500/30 bg-sky-500/10 text-sky-100'
                                : statusPillClass(event.status ?? 'running'),
                            )}
                          >
                            <div className="flex items-center gap-1.5 text-xs font-semibold">
                              <HugeiconsIcon icon={event.type === 'cron' ? RefreshIcon : Clock01Icon} size={13} strokeWidth={1.8} />
                              <span className="truncate">{event.title}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-primary-300">
                              {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(event.date)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
