import type { CronJob, CronRun, CronRunStatus, CronSortKey } from './cron-types'

export type CronScheduleDetails = {
  kind: 'cron' | 'every' | 'at'
  kindLabel: 'Cron' | 'Every' | 'At'
  humanLabel: string
}

function normalizeTimestampToMs(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function formatTwoDigits(value: number): string {
  return value.toString().padStart(2, '0')
}

function formatDayValue(value: string): string {
  const mapping: Record<string, string> = {
    '0': 'Sunday',
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
  }
  return mapping[value] ?? value
}

export function formatCronHuman(expression: string): string {
  const parts = expression.trim().split(/\s+/)
  if (parts.length < 5) return expression

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  if (
    minute === '*' &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return 'Every minute'
  }

  if (
    minute.startsWith('*/') &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const interval = Number(minute.slice(2))
    if (Number.isFinite(interval) && interval > 0) {
      return `Every ${interval} minutes`
    }
  }

  if (
    /^\d+$/.test(minute) &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return `At minute ${minute} past every hour`
  }

  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    return `Every day at ${formatTwoDigits(Number(hour))}:${formatTwoDigits(Number(minute))}`
  }

  if (
    /^\d+$/.test(minute) &&
    /^\d+$/.test(hour) &&
    dayOfMonth === '*' &&
    month === '*' &&
    /^\d$/.test(dayOfWeek)
  ) {
    return `Every ${formatDayValue(dayOfWeek)} at ${formatTwoDigits(Number(hour))}:${formatTwoDigits(Number(minute))}`
  }

  return expression
}

export function getScheduleDetails(schedule: string): CronScheduleDetails {
  const trimmed = schedule.trim()
  const everyMatch = trimmed.match(
    /^every\s+(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)?$/i,
  )
  if (everyMatch?.[1]) {
    const amount = Number(everyMatch[1])
    const unitToken = (everyMatch[2] ?? 'minutes').toLowerCase()
    const unit =
      unitToken.startsWith('h')
        ? amount === 1
          ? 'hour'
          : 'hours'
        : unitToken.startsWith('d')
          ? amount === 1
            ? 'day'
            : 'days'
          : amount === 1
            ? 'minute'
            : 'minutes'

    return {
      kind: 'every',
      kindLabel: 'Every',
      humanLabel: `Every ${amount} ${unit}`,
    }
  }

  if (trimmed.startsWith('at ')) {
    const value = trimmed.slice(3).trim()
    return {
      kind: 'at',
      kindLabel: 'At',
      humanLabel: value ? `At ${formatDateTime(value)}` : 'At',
    }
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return {
      kind: 'at',
      kindLabel: 'At',
      humanLabel: `At ${formatDateTime(trimmed)}`,
    }
  }

  return {
    kind: 'cron',
    kindLabel: 'Cron',
    humanLabel: formatCronHuman(trimmed),
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Never'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(parsed))
}

export function formatDuration(valueMs?: number): string {
  if (!valueMs || valueMs <= 0) return 'n/a'
  if (valueMs < 1000) return `${Math.round(valueMs)}ms`
  if (valueMs < 60_000) return `${(valueMs / 1000).toFixed(1)}s`
  return `${(valueMs / 60_000).toFixed(1)}m`
}

export function statusLabel(status: CronRunStatus): string {
  if (status === 'success') return 'OK'
  if (status === 'error') return 'Error'
  if (status === 'running') return 'Running'
  if (status === 'queued') return 'Queued'
  return 'Unknown'
}

export function sortCronJobs(
  jobs: Array<CronJob>,
  sortKey: CronSortKey,
): Array<CronJob> {
  return [...jobs].sort(function sortJobs(a, b) {
    if (sortKey === 'name') {
      return a.name.localeCompare(b.name)
    }
    if (sortKey === 'schedule') {
      return a.schedule.localeCompare(b.schedule)
    }

    const aLastRun = normalizeTimestampToMs(a.lastRun?.startedAt)
    const bLastRun = normalizeTimestampToMs(b.lastRun?.startedAt)
    return bLastRun - aLastRun
  })
}

export function getLatestRun(
  job: CronJob,
  runs: Array<CronRun>,
): CronRun | undefined {
  if (runs.length > 0) return runs[0]
  return job.lastRun
}

export function statusBadgeClass(status: CronRunStatus): string {
  if (status === 'success') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
  }
  if (status === 'error') {
    return 'border-red-500/40 bg-red-500/10 text-red-700'
  }
  if (status === 'running') {
    return 'border-blue-500/40 bg-blue-500/10 text-blue-700'
  }
  if (status === 'queued') {
    return 'border-primary-300 bg-primary-100 text-primary-700'
  }
  return 'border-primary-300 bg-primary-100 text-primary-700'
}
