import { cn } from '@/lib/utils'
import type {
  WorkspaceRunEvent,
  WorkspaceRunStatus,
  WorkspaceTaskRun,
} from './runs-types'

export type RunTimeRange = 'last_hour' | 'today' | 'all'
export type RunAgentTone = 'codex' | 'claude' | 'ollama' | 'default'

export function formatRunStatus(status: WorkspaceRunStatus): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function getRunStatusClass(status: WorkspaceRunStatus): string {
  if (status === 'running') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (status === 'completed') return 'border-green-500/30 bg-green-500/10 text-green-300'
  if (status === 'awaiting_review') return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
  if (status === 'paused') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (status === 'failed' || status === 'stopped') {
    return 'border-red-500/30 bg-red-500/10 text-red-300'
  }
  return 'border-primary-200 bg-primary-50 text-primary-900'
}

export function formatRunDuration(run: WorkspaceTaskRun): string {
  const startMs = run.started_at ? new Date(run.started_at).getTime() : NaN
  const endMs = run.completed_at ? new Date(run.completed_at).getTime() : Date.now()
  if (!Number.isFinite(startMs)) return '0s'

  const elapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000))
  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function formatRunTokens(run: WorkspaceTaskRun): string {
  return (run.input_tokens + run.output_tokens).toLocaleString()
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1000) return String(Math.round(n))
  return `${(n / 1000).toFixed(1)}k`
}

export function formatRunCost(costCents: number): string {
  return `$${(costCents / 100).toFixed(2)}`
}

export function formatRunInputTokens(run: WorkspaceTaskRun): string {
  return `${formatTokenCount(run.input_tokens)} tok`
}

export function formatRunTimestamp(value: string | null): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function matchesTimeRange(run: WorkspaceTaskRun, range: RunTimeRange): boolean {
  if (range === 'all') return true

  const timestamp = run.started_at ?? run.completed_at
  if (!timestamp) return false
  const time = new Date(timestamp)
  if (Number.isNaN(time.getTime())) return false

  const now = new Date()
  if (range === 'last_hour') {
    return now.getTime() - time.getTime() <= 3_600_000
  }

  return time.toDateString() === now.toDateString()
}

export function getRunEventMessage(event: WorkspaceRunEvent): string {
  const message = event.data?.message
  if (typeof message === 'string' && message.trim()) {
    return message.trim()
  }

  const summary = event.data?.summary
  if (typeof summary === 'string' && summary.trim()) {
    return summary.trim()
  }

  const status = event.data?.status
  if (typeof status === 'string' && status.trim()) {
    return `Status: ${formatRunStatus(status)}`
  }

  if (event.type === 'started') return 'Run started'
  if (event.type === 'completed') return 'Run completed'
  if (event.type === 'failed' || event.type === 'error') return 'Run failed'
  if (event.type === 'tool_use') return 'Tool invoked'
  if (event.type === 'checkpoint') return 'Checkpoint created'
  return formatRunStatus(event.type)
}

export function getRunEventLineClass(event: WorkspaceRunEvent): string {
  if (event.type === 'failed' || event.type === 'error') return 'text-red-300'
  if (event.type === 'tool_use' || event.type === 'checkpoint') {
    return 'text-amber-300'
  }
  if (event.type === 'completed') return 'text-green-300'
  if (event.type === 'started' || event.type === 'status') {
    return 'text-emerald-300'
  }
  return 'text-primary-500'
}

export function getRunProgress(
  run: WorkspaceTaskRun,
  events: Array<WorkspaceRunEvent>,
): number {
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'stopped') {
    return 100
  }
  if (run.status === 'paused') return 52
  if (run.status !== 'running') return 12

  const weightedEvents = events.reduce((score, event) => {
    if (event.type === 'output') return score + 8
    if (event.type === 'tool_use') return score + 14
    if (event.type === 'checkpoint') return score + 20
    if (event.type === 'status') return score + 6
    return score + 2
  }, 10)

  return Math.max(14, Math.min(92, weightedEvents))
}

export function getRunProgressLabel(
  run: WorkspaceTaskRun,
  events: Array<WorkspaceRunEvent>,
): string {
  if (run.status === 'running' && events.length === 0) return 'running'
  return `${getRunProgress(run, events)}%`
}

function extractFilePaths(value: unknown): string[] {
  if (typeof value === 'string') {
    return /\.[A-Za-z0-9]+$/.test(value) || value.includes('/')
      ? [value]
      : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractFilePaths(entry))
  }
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  return Object.entries(record).flatMap(([key, entry]) => {
    if (
      key === 'path' ||
      key === 'file' ||
      key === 'filePath' ||
      key === 'file_path' ||
      key === 'target_file'
    ) {
      return extractFilePaths(entry)
    }
    if (key === 'changed_files') {
      return extractFilePaths(entry)
    }
    return []
  })
}

export function getRunFilesWritten(events: Array<WorkspaceRunEvent>): number | null {
  const files = new Set<string>()
  let fileChangeRequests = 0

  for (const event of events) {
    const method = typeof event.data?.method === 'string' ? event.data.method : null
    if (method === 'item/fileChange/requestApproval') {
      fileChangeRequests += 1
    }

    for (const path of extractFilePaths(event.data)) {
      files.add(path)
    }

    const message = typeof event.data?.message === 'string' ? event.data.message : ''
    const messagePaths = Array.from(
      message.matchAll(/([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g),
      (match) => match[1],
    )
    for (const path of messagePaths) {
      files.add(path)
    }
  }

  const count = Math.max(files.size, fileChangeRequests)
  return count > 0 ? count : null
}

export function isRunningRun(run: WorkspaceTaskRun): boolean {
  return run.status === 'running'
}

export function sortRunsNewestFirst(a: WorkspaceTaskRun, b: WorkspaceTaskRun): number {
  const aTime = new Date(a.completed_at ?? a.started_at ?? 0).getTime()
  const bTime = new Date(b.completed_at ?? b.started_at ?? 0).getTime()
  return bTime - aTime
}

export function getConsoleLineClass(event: WorkspaceRunEvent): string {
  return cn('whitespace-pre-wrap break-words', getRunEventLineClass(event))
}

export function getRunAgentTone(agentName: string | null): RunAgentTone {
  const normalized = agentName?.toLowerCase() ?? ''
  if (normalized.includes('codex')) return 'codex'
  if (normalized.includes('claude')) return 'claude'
  if (
    normalized.includes('ollama') ||
    normalized.includes('openclaw') ||
    normalized.includes('pc1')
  ) {
    return 'ollama'
  }
  return 'default'
}

export function getRunRetryNarrative(run: WorkspaceTaskRun): string | null {
  if (run.status === 'completed' && run.attempt > 1 && run.error?.trim()) {
    return `❌ ${run.error.trim()} — auto-retried → passed on retry`
  }
  return null
}
