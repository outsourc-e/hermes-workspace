import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

type RunConsoleProps = {
  runId: string
  runTitle: string
  runStatus: 'running' | 'needs_input' | 'complete' | 'failed'
  agents: Array<{ id: string; name: string; modelId?: string; status?: string }>
  startedAt?: number
  duration?: string
  tokenCount?: number
  costEstimate?: number
  onClose?: () => void
}

type ConsoleTab = 'stream' | 'timeline' | 'artifacts' | 'report'

type MockStreamEvent = {
  id: string
  timestamp: string
  agentName: string
  eventType: 'status' | 'output' | 'tool' | 'error'
  message: string
}

const TAB_OPTIONS: Array<{ id: ConsoleTab; label: string }> = [
  { id: 'stream', label: 'Stream' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'report', label: 'Report' },
]

const STATUS_STYLES: Record<RunConsoleProps['runStatus'], string> = {
  running: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  needs_input: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  complete: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  failed: 'border-red-500/40 bg-red-500/15 text-red-300',
}

const EVENT_STYLES: Record<MockStreamEvent['eventType'], string> = {
  status: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  output: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  tool: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  error: 'border-red-500/40 bg-red-500/10 text-red-300',
}

function formatRunStatus(status: RunConsoleProps['runStatus']): string {
  switch (status) {
    case 'needs_input':
      return 'Needs Input'
    case 'complete':
      return 'Complete'
    case 'failed':
      return 'Failed'
    case 'running':
    default:
      return 'Running'
  }
}

function formatDuration(startedAt?: number): string | null {
  if (!startedAt || Number.isNaN(startedAt)) return null
  const elapsedMs = Math.max(0, Date.now() - startedAt)
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatCost(costEstimate?: number): string {
  if (typeof costEstimate !== 'number' || !Number.isFinite(costEstimate)) return '$0.00'
  return `$${costEstimate.toFixed(2)}`
}

export function RunConsole({
  runId,
  runTitle,
  runStatus,
  agents,
  startedAt,
  duration,
  tokenCount,
  costEstimate,
  onClose,
}: RunConsoleProps) {
  const [activeTab, setActiveTab] = useState<ConsoleTab>('stream')

  const resolvedDuration = duration || formatDuration(startedAt) || '0s'
  const resolvedTokens = typeof tokenCount === 'number' ? tokenCount.toLocaleString() : '0'
  const statusLabel = formatRunStatus(runStatus)

  const mockEvents = useMemo<MockStreamEvent[]>(() => {
    const primaryAgent = agents[0]?.name || 'Mission Control'
    const secondaryAgent = agents[1]?.name || primaryAgent
    const hasFailure = runStatus === 'failed'

    return [
      {
        id: `${runId}-evt-1`,
        timestamp: '00:00:03',
        agentName: primaryAgent,
        eventType: 'status',
        message: 'Session initialized and task context loaded.',
      },
      {
        id: `${runId}-evt-2`,
        timestamp: '00:00:11',
        agentName: secondaryAgent,
        eventType: 'tool',
        message: 'Executed repository scan and identified target files.',
      },
      {
        id: `${runId}-evt-3`,
        timestamp: '00:00:18',
        agentName: primaryAgent,
        eventType: hasFailure ? 'error' : 'output',
        message: hasFailure
          ? 'Encountered runtime exception while applying patch.'
          : 'Generated implementation draft and queued validation pass.',
      },
    ]
  }, [agents, runId, runStatus])

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[var(--theme-bg,#0b0e14)] text-primary-100 dark:bg-slate-900">
      <header className="border-b border-primary-800/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-primary-100 sm:text-base">
                {runTitle}
              </h2>
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                  STATUS_STYLES[runStatus],
                )}
              >
                {statusLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-primary-300">
              <span>Duration: {resolvedDuration}</span>
              <span>Tokens: {resolvedTokens}</span>
              <span>Cost: {formatCost(costEstimate)}</span>
              <span>Agents: {agents.length}</span>
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 items-center rounded-md border border-primary-700 bg-primary-900/70 px-3 text-xs font-medium text-primary-200 transition-colors hover:border-primary-600 hover:bg-primary-800"
            >
              Close
            </button>
          ) : null}
        </div>
      </header>

      <nav className="border-b border-primary-800/70 px-4 py-2 sm:px-5">
        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? 'bg-primary-800 text-primary-100 underline underline-offset-4'
                  : 'bg-primary-900/60 text-primary-300 hover:bg-primary-800/80 hover:text-primary-100',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 overflow-auto px-4 py-4 sm:px-5">
        {activeTab === 'stream' ? (
          <div className="space-y-3 font-mono text-xs">
            <p className="text-sm font-medium text-primary-200">
              Live event stream will appear here
            </p>
            <ol className="space-y-2">
              {mockEvents.map((event) => (
                <li
                  key={event.id}
                  className="rounded-lg border border-primary-800/80 bg-primary-950/60 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-primary-400">[{event.timestamp}]</span>
                    <span className="text-primary-200">{event.agentName}</span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                        EVENT_STYLES[event.eventType],
                      )}
                    >
                      {event.eventType}
                    </span>
                  </div>
                  <p className="mt-1 text-primary-300">{event.message}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {activeTab === 'timeline' ? (
          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-6 text-sm text-primary-300">
            Mission timeline
          </div>
        ) : null}

        {activeTab === 'artifacts' ? (
          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-6 text-sm text-primary-300">
            Artifacts created during this run
          </div>
        ) : null}

        {activeTab === 'report' ? (
          <div className="rounded-xl border border-dashed border-primary-700 bg-primary-950/50 px-4 py-6 text-sm text-primary-300">
            Run report will be generated on completion
          </div>
        ) : null}
      </div>
    </section>
  )
}
