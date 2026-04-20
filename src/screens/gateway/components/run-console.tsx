import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckmarkCircle02Icon, Copy01Icon, Rocket01Icon, ViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { fetchSessionHistory } from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import { RunLearnings, type RunLearningsProps } from './run-learnings'
import { MissionEventLog } from './mission-event-log'
import type { MissionEvent } from '@/screens/gateway/lib/mission-events'
import { onFeedEvent, type FeedEvent } from './feed-event-bus'

type RunArtifact = {
  id: string
  type: 'file' | 'output' | 'commit'
  name: string
  content?: string
  path?: string
  timestamp: number
}

type RunReport = {
  summary: string
  keyFindings: string[]
  duration: string
  totalTokens: number
  totalCost: number
  agentSummaries: Array<{ name: string; tasks: number; tokens: number }>
}

type RunConsoleProps = {
  runId: string
  runTitle: string
  runStatus: 'running' | 'needs_input' | 'complete' | 'failed'
  agents: Array<{ id: string; name: string; modelId?: string; status?: string }>
  pendingApprovals?: Array<{ id: string; tool: string; args?: string; agentName?: string }>
  startedAt?: number
  duration?: string
  tokenCount?: number
  costEstimate?: number
  onClose?: () => void
  onStopMission?: () => void
  isStopping?: boolean
  onKillAgent?: (agentId: string) => void
  onSteerAgent?: (agentId: string, message: string) => void
  onApprove?: (approvalId: string) => void
  onDeny?: (approvalId: string) => void
  sessionKeys?: string[]
  agentNameMap?: Record<string, string>
  artifacts?: RunArtifact[]
  report?: RunReport
  missionEvents?: MissionEvent[]
  learnings?: RunLearningsProps['learnings']
  onAddLearning?: RunLearningsProps['onAddLearning']
  tabs?: ConsoleTab[]
  minimalChrome?: boolean
}

type ConsoleTab = 'stream' | 'timeline' | 'artifacts' | 'report' | 'events' | 'learnings'
type StreamView = 'combined' | 'lanes'

type LiveStreamEvent = {
  id: string
  timestamp: string
  agentName: string
  eventType: 'status' | 'output' | 'tool' | 'error'
  message: string
  toolName?: string
}

const TAB_OPTIONS: Array<{ id: ConsoleTab; label: string }> = [
  { id: 'stream', label: 'Stream' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'report', label: 'Report' },
  { id: 'events', label: 'Events' },
  { id: 'learnings', label: 'Learnings' },
]

const STATUS_STYLES: Record<RunConsoleProps['runStatus'], string> = {
  running: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  needs_input: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  complete: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  failed: 'border-red-500/40 bg-red-500/15 text-red-300',
}

const EVENT_STYLES: Record<LiveStreamEvent['eventType'], string> = {
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

function roleToEventType(role?: string): LiveStreamEvent['eventType'] {
  if (role === 'assistant') return 'output'
  if (role === 'tool') return 'tool'
  if (role === 'system') return 'status'
  return 'status'
}

function formatTs(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function extractContent(msg: { content?: string | Array<{ type?: string; text?: string }>; text?: string }): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) return msg.content.map(p => p.text ?? '').join('')
  if (typeof msg.text === 'string') return msg.text
  return ''
}

function sanitizeArgsPreview(args?: string): string {
  if (!args) return 'No arguments'
  const cleaned = args
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'No arguments'
  if (cleaned.length <= 200) return cleaned
  return `${cleaned.slice(0, 200)}...`
}

function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(Number)
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return 0
  const [hours, minutes, seconds] = parts
  return (hours * 3600) + (minutes * 60) + seconds
}

function getElapsedLabel(firstSeconds: number, currentSeconds: number): string {
  let elapsed = currentSeconds - firstSeconds
  if (elapsed < 0) elapsed += 24 * 3600
  const hours = Math.floor(elapsed / 3600)
  const minutes = Math.floor((elapsed % 3600) / 60)
  const seconds = elapsed % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function getEventDotClass(eventType: LiveStreamEvent['eventType']): string {
  if (eventType === 'error') return 'bg-red-400'
  if (eventType === 'tool') return 'bg-amber-400'
  if (eventType === 'output') return 'bg-sky-400'
  return 'bg-emerald-400'
}

function getEventPillLabel(event: LiveStreamEvent): string {
  if (event.eventType === 'tool' && event.toolName) return `TOOL: ${event.toolName}`
  return event.eventType.toUpperCase()
}

function mapFeedEventType(event: FeedEvent): LiveStreamEvent['eventType'] {
  if (event.type !== 'system') return 'status'
  const lower = event.message.toLowerCase()
  if (lower.includes('failed') || lower.includes('error') || lower.includes('aborted') || lower.includes('disconnected')) {
    return 'error'
  }
  return 'status'
}

export function RunConsole({
  runId,
  runTitle,
  runStatus,
  agents,
  pendingApprovals,
  startedAt,
  duration,
  tokenCount,
  costEstimate,
  onClose,
  onStopMission,
  isStopping = false,
  onKillAgent,
  onSteerAgent,
  onApprove,
  onDeny,
  sessionKeys,
  agentNameMap,
  artifacts,
  report,
  missionEvents,
  learnings,
  onAddLearning,
  tabs,
  minimalChrome = false,
}: RunConsoleProps) {
  const [activeTab, setActiveTab] = useState<ConsoleTab>('stream')
  // Default learnings state when no external learnings store is wired
  const [localLearnings, setLocalLearnings] = useState<RunLearningsProps['learnings']>([])
  const [streamView, setStreamView] = useState<StreamView>('combined')
  const [steerTarget, setSteerTarget] = useState<string | null>(null)
  const [steerInput, setSteerInput] = useState('')
  const [historyEvents, setHistoryEvents] = useState<LiveStreamEvent[]>([])
  const [feedEvents, setFeedEvents] = useState<LiveStreamEvent[]>([])
  const [isAutoScroll, setIsAutoScroll] = useState(true)
  const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null)
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(null)
  const streamEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const allowedTabs = useMemo<ConsoleTab[]>(
    () => (tabs && tabs.length > 0 ? tabs : TAB_OPTIONS.map((tab) => tab.id)),
    [tabs],
  )

  // Fetch session history for all session keys
  const fetchAllHistory = useCallback(async () => {
    if (!sessionKeys?.length) return
    const allEvents: LiveStreamEvent[] = []
    for (const key of sessionKeys) {
      try {
        const res = await fetchSessionHistory(key)
        const msgs = res?.messages ?? []
        const agentName = agentNameMap?.[key] ?? 'Agent'
        for (const msg of msgs) {
          const content = extractContent(msg)
          const toolName = msg.toolName
          if (!content.trim() && !toolName) continue
          const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now()
          allEvents.push({
            id: `${key}-${ts}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: formatTs(ts),
            agentName,
            eventType: roleToEventType(msg.role),
            message: content || `[${toolName ?? 'tool call'}]`,
            toolName,
          })
        }
      } catch { /* skip failed fetches */ }
    }
    allEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    setHistoryEvents(allEvents)
  }, [sessionKeys, agentNameMap])

  // Initial fetch + polling when running
  useEffect(() => {
    void fetchAllHistory()
    if (runStatus !== 'running') return
    const interval = setInterval(() => void fetchAllHistory(), 5000)
    return () => clearInterval(interval)
  }, [fetchAllHistory, runStatus])

  useEffect(() => {
    setFeedEvents([])
    const unsubscribe = onFeedEvent((event) => {
      setFeedEvents((current) => {
        if (current.some((entry) => entry.id === event.id)) return current
        return [
          ...current,
          {
            id: event.id,
            timestamp: formatTs(event.timestamp),
            agentName: event.agentName || 'System',
            eventType: mapFeedEventType(event),
            message: event.message,
          },
        ].slice(-200)
      })
    })
    return unsubscribe
  }, [runId])

  useEffect(() => {
    if (allowedTabs.includes(activeTab)) return
    setActiveTab(allowedTabs[0] ?? 'stream')
  }, [activeTab, allowedTabs])

  // Auto-scroll
  useEffect(() => {
    if (isAutoScroll && streamEndRef.current) {
      streamEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [feedEvents, historyEvents, isAutoScroll])

  const handleStreamScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setIsAutoScroll(atBottom)
  }, [])

  const resolvedDuration = duration || formatDuration(startedAt) || '0s'
  const resolvedTokens = typeof tokenCount === 'number' ? tokenCount.toLocaleString() : '0'
  const statusLabel = formatRunStatus(runStatus)

  const displayEvents: Array<{ id: string; timestamp: string; agentName: string; eventType: 'status' | 'output' | 'tool' | 'error'; message: string }> = useMemo(() => {
    const merged = new Map<string, LiveStreamEvent>()
    historyEvents.forEach((event) => merged.set(event.id, event))
    feedEvents.forEach((event) => merged.set(event.id, event))
    return Array.from(merged.values()).sort((a, b) => parseTimestampToSeconds(a.timestamp) - parseTimestampToSeconds(b.timestamp))
  }, [feedEvents, historyEvents])

  const timelineBuckets = useMemo(() => {
    if (displayEvents.length === 0) return []
    const firstSeconds = parseTimestampToSeconds(displayEvents[0].timestamp)
    const ordered = [...displayEvents].sort((a, b) => parseTimestampToSeconds(a.timestamp) - parseTimestampToSeconds(b.timestamp))
    const buckets = new Map<string, { id: string; minuteLabel: string; elapsed: string; events: typeof displayEvents }>()
    for (const event of ordered) {
      const minuteLabel = event.timestamp.split(':').slice(0, 2).join(':')
      const existing = buckets.get(minuteLabel)
      if (existing) {
        existing.events.push(event)
      } else {
        buckets.set(minuteLabel, {
          id: `${runId}-bucket-${minuteLabel}`,
          minuteLabel,
          elapsed: getElapsedLabel(firstSeconds, parseTimestampToSeconds(event.timestamp)),
          events: [event],
        })
      }
    }
    return Array.from(buckets.values())
  }, [displayEvents, runId])

  const eventsByAgent = useMemo(() => {
    const grouped = new Map<string, typeof displayEvents>()
    for (const event of displayEvents) {
      const existing = grouped.get(event.agentName)
      if (existing) {
        existing.push(event)
      } else {
        grouped.set(event.agentName, [event])
      }
    }
    return Array.from(grouped.entries()).map(([agentName, events]) => ({ agentName, events }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayEvents])

  const copyArtifactContent = useCallback(async (artifact: RunArtifact) => {
    const textToCopy = artifact.content || artifact.path || artifact.name
    if (!textToCopy || !navigator?.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopiedArtifactId(artifact.id)
      setTimeout(() => setCopiedArtifactId((current) => (current === artifact.id ? null : current)), 1500)
    } catch {
      /* ignore clipboard errors */
    }
  }, [])

  return (
    <section className={cn(
      'flex h-full flex-col overflow-hidden',
      minimalChrome
        ? 'bg-transparent text-[var(--theme-text)]'
        : 'bg-[var(--theme-bg,#0b0e14)] text-primary-100 dark:bg-slate-900',
    )}>
      {!minimalChrome ? (
        <header className="border-b border-primary-800/80 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="max-w-[300px] truncate text-sm font-semibold text-primary-100 sm:max-w-[500px] sm:text-base">
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
          <div className="flex items-center gap-2">
            {runStatus === 'running' && onStopMission ? (
              <button
                type="button"
                onClick={onStopMission}
                disabled={isStopping}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-red-500/40 bg-red-500/15 px-3 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isStopping ? 'Stopping...' : '■ Stop'}
              </button>
            ) : null}
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
        </div>
        </header>
      ) : null}

      <nav className={cn(
        'px-4 py-3 sm:px-5',
        minimalChrome ? 'border-b border-[var(--theme-border)] bg-[var(--theme-card)]/50' : 'border-b border-primary-800/70',
      )}>
        <div className="flex flex-wrap gap-2">
          {TAB_OPTIONS.filter((tab) => allowedTabs.includes(tab.id)).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                activeTab === tab.id
                  ? minimalChrome
                    ? 'bg-[var(--theme-card2)] text-[var(--theme-text)]'
                    : 'bg-primary-800 text-primary-100 underline underline-offset-4'
                  : minimalChrome
                    ? 'bg-[var(--theme-card)] text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]'
                    : 'bg-primary-900/60 text-primary-300 hover:bg-primary-800/80 hover:text-primary-100',
              )}
            >
              {tab.label}
              {tab.id === 'stream' && displayEvents.length > 0 && (
                <span className={cn(
                  'ml-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none',
                  minimalChrome ? 'bg-[var(--theme-border)] text-[var(--theme-text)]' : 'bg-primary-700 text-primary-200',
                )}>
                  {displayEvents.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Agent control bar */}
      {!minimalChrome && (runStatus === 'running' || runStatus === 'needs_input') && agents.length > 0 ? (
        <div className="border-b border-primary-800/60 px-4 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            {agents.map((agent) => (
              <div key={agent.id} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-700/80 bg-primary-900/50 px-2 py-1">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    agent.status === 'active' || agent.status === 'running'
                      ? 'bg-emerald-400 animate-pulse'
                      : agent.status === 'dispatching'
                        ? 'bg-amber-400'
                        : agent.status === 'error'
                          ? 'bg-red-400'
                          : agent.status === 'waiting_for_input'
                            ? 'bg-amber-400'
                            : 'bg-primary-500',
                  )}
                />
                <span className="text-[11px] font-medium text-primary-200">{agent.name}</span>
                {onSteerAgent ? (
                  <button
                    type="button"
                    onClick={() => setSteerTarget(steerTarget === agent.id ? null : agent.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-primary-400 transition-colors hover:bg-primary-800 hover:text-primary-200"
                  >
                    Steer
                  </button>
                ) : null}
                {onKillAgent ? (
                  <button
                    type="button"
                    onClick={() => onKillAgent(agent.id)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-500/15 hover:text-red-300"
                  >
                    Kill
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {steerTarget && onSteerAgent ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-primary-400">→ {agents.find(a => a.id === steerTarget)?.name}:</span>
              <input
                type="text"
                value={steerInput}
                onChange={(e) => setSteerInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && steerInput.trim()) {
                    onSteerAgent(steerTarget, steerInput.trim())
                    setSteerInput('')
                    setSteerTarget(null)
                  }
                }}
                placeholder="Send directive..."
                className="flex-1 rounded-md border border-primary-700 bg-primary-950 px-2 py-1 text-xs text-primary-100 placeholder:text-primary-500 focus:border-accent-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (steerInput.trim()) {
                    onSteerAgent(steerTarget, steerInput.trim())
                    setSteerInput('')
                    setSteerTarget(null)
                  }
                }}
                className="rounded-md bg-accent-500/20 px-2 py-1 text-[11px] font-medium text-accent-300 transition-colors hover:bg-accent-500/30"
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => { setSteerTarget(null); setSteerInput('') }}
                className="text-[11px] text-primary-500 hover:text-primary-300"
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        onScroll={handleStreamScroll}
        className={cn('flex-1 overflow-auto px-4 py-4 sm:px-5', minimalChrome && 'bg-transparent')}
      >
        {activeTab === 'stream' ? (
          <div className="space-y-3 font-mono text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={cn('text-sm font-medium', minimalChrome ? 'text-[var(--theme-muted)]' : 'text-primary-200')}>
                {displayEvents.length > 0 ? `${displayEvents.length} events` : 'Waiting for live agent output'}
              </p>
              <div className={cn(
                'inline-flex items-center rounded-md p-0.5 text-xs',
                minimalChrome
                  ? 'border border-[var(--theme-border)] bg-[var(--theme-card)]'
                  : 'border border-primary-700 bg-primary-900/60',
              )}>
                <button
                  type="button"
                  onClick={() => setStreamView('combined')}
                  className={cn(
                    'rounded px-2 py-1 text-xs transition-colors',
                    streamView === 'combined'
                      ? minimalChrome
                        ? 'bg-[var(--theme-card2)] text-[var(--theme-text)]'
                        : 'bg-primary-800 text-primary-100'
                      : minimalChrome
                        ? 'bg-transparent text-[var(--theme-muted)] hover:text-[var(--theme-text)]'
                        : 'bg-primary-900/60 text-primary-300 hover:text-primary-100',
                  )}
                >
                  Combined
                </button>
                <button
                  type="button"
                  onClick={() => setStreamView('lanes')}
                  className={cn(
                    'rounded px-2 py-1 text-xs transition-colors',
                    streamView === 'lanes'
                      ? minimalChrome
                        ? 'bg-[var(--theme-card2)] text-[var(--theme-text)]'
                        : 'bg-primary-800 text-primary-100'
                      : minimalChrome
                        ? 'bg-transparent text-[var(--theme-muted)] hover:text-[var(--theme-text)]'
                        : 'bg-primary-900/60 text-primary-300 hover:text-primary-100',
                  )}
                >
                  Lanes
                </button>
              </div>
            </div>

            {pendingApprovals && pendingApprovals.length > 0 ? (
              <section className="sticky top-0 z-10 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 shadow-lg backdrop-blur">
                <h3 className="text-sm font-semibold text-amber-200">⚠️ Approval Required</h3>
                <ol className="mt-2 space-y-2">
                  {pendingApprovals.map((approval) => (
                    <li
                      key={approval.id}
                      className="rounded-md border border-amber-500/30 bg-primary-950/60 p-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-xs text-amber-100">
                            Tool: <span className="font-semibold">{approval.tool}</span>
                          </p>
                          <p className="text-xs text-primary-200">
                            Agent: <span className="font-medium">{approval.agentName || 'Unknown agent'}</span>
                          </p>
                          <p className="text-xs text-primary-300 break-all">
                            Args: {sanitizeArgsPreview(approval.args)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onApprove?.(approval.id)}
                            disabled={!onApprove}
                            className="rounded-md border border-amber-500/50 bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/30"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeny?.(approval.id)}
                            disabled={!onDeny}
                            className="rounded-md border border-primary-700 bg-primary-900/80 px-2.5 py-1 text-xs font-medium text-primary-200 transition-colors hover:bg-primary-800"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {runStatus === 'needs_input' && (!pendingApprovals || pendingApprovals.length === 0) ? (
              <div className="rounded-lg border border-primary-700/80 bg-primary-900/60 px-3 py-2 text-xs text-primary-300">
                Mission is waiting for input — check the approval queue
              </div>
            ) : null}

            {displayEvents.length === 0 ? (
              <div className={cn(
                'flex min-h-[28rem] flex-col items-center justify-center rounded-[28px] border border-dashed px-8 text-center',
                minimalChrome
                  ? 'border-[var(--theme-border)] bg-[var(--theme-card)]/35'
                  : 'border-primary-800/80 bg-primary-950/40',
              )}>
                <div className={cn(
                  'mb-4 flex size-14 items-center justify-center rounded-2xl border',
                  minimalChrome
                    ? 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-accent)]'
                    : 'border-primary-700 bg-primary-900/70 text-primary-200',
                )}>
                  <HugeiconsIcon icon={Rocket01Icon} size={22} strokeWidth={1.8} />
                </div>
                <p className={cn('text-base font-semibold', minimalChrome ? 'text-[var(--theme-text)]' : 'text-primary-100')}>
                  Stream is ready
                </p>
                <p className={cn(
                  'mt-2 max-w-md text-sm leading-6',
                  minimalChrome ? 'text-[var(--theme-muted)]' : 'text-primary-300',
                )}>
                  Agent output, approvals, and system events will appear here as work begins. Use timeline or artifacts to inspect the run once activity starts.
                </p>
              </div>
            ) : null}

            {streamView === 'combined' && displayEvents.length > 0 ? (
              <ol className="space-y-2">
                {displayEvents.map((event) => (
                  <li
                    key={event.id}
                    className={cn(
                      'rounded-lg border px-3 py-2',
                      minimalChrome
                        ? 'border-[var(--theme-border)] bg-[var(--theme-card)]'
                        : 'border-primary-800/80 bg-primary-950/60',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn(minimalChrome ? 'text-[var(--theme-muted)]' : 'text-primary-400')}>[{event.timestamp}]</span>
                      <span className={cn(minimalChrome ? 'text-[var(--theme-text)]' : 'text-primary-200')}>{event.agentName}</span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                          minimalChrome
                            ? 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)]'
                            : EVENT_STYLES[event.eventType],
                        )}
                      >
                        {getEventPillLabel(event)}
                      </span>
                    </div>
                    <p className={cn(
                      'mt-1 whitespace-pre-wrap break-words line-clamp-3',
                      minimalChrome ? 'text-[var(--theme-text)]/80' : 'text-primary-300',
                    )}>
                      {event.message}
                    </p>
                  </li>
                ))}
              </ol>
            ) : null}

            {streamView === 'lanes' && displayEvents.length > 0 ? (
              eventsByAgent.length >= 3 ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {eventsByAgent.map((lane) => {
                    const latestEvent = lane.events[lane.events.length - 1]
                    const laneDotClass =
                      latestEvent?.eventType === 'error'
                        ? 'bg-red-400'
                        : latestEvent?.eventType === 'tool'
                          ? 'bg-amber-400'
                          : latestEvent?.eventType === 'output'
                            ? 'bg-sky-400'
                            : 'bg-emerald-400'
                    return (
                      <section
                        key={lane.agentName}
                        className="min-w-[240px] shrink-0 rounded-lg border border-primary-800/80 bg-primary-950/60 p-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', laneDotClass)} />
                          <h3 className="text-xs font-semibold text-primary-100">{lane.agentName}</h3>
                        </div>
                        <ol className="space-y-2">
                          {lane.events.map((event) => (
                            <li
                              key={event.id}
                              className="rounded-md border border-primary-800/80 bg-primary-900/60 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-primary-400">[{event.timestamp}]</span>
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                                    EVENT_STYLES[event.eventType],
                                  )}
                                >
                                  {getEventPillLabel(event)}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap break-words text-primary-300 line-clamp-3">{event.message}</p>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )
                  })}
                </div>
              ) : (
                <div
                  className={cn(
                    'grid gap-3',
                    eventsByAgent.length === 2 ? 'grid-cols-2' : 'grid-cols-1',
                  )}
                >
                  {eventsByAgent.map((lane) => {
                    const latestEvent = lane.events[lane.events.length - 1]
                    const laneDotClass =
                      latestEvent?.eventType === 'error'
                        ? 'bg-red-400'
                        : latestEvent?.eventType === 'tool'
                          ? 'bg-amber-400'
                          : latestEvent?.eventType === 'output'
                            ? 'bg-sky-400'
                            : 'bg-emerald-400'
                    return (
                      <section
                        key={lane.agentName}
                        className="rounded-lg border border-primary-800/80 bg-primary-950/60 p-3"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full', laneDotClass)} />
                          <h3 className="text-xs font-semibold text-primary-100">{lane.agentName}</h3>
                        </div>
                        <ol className="space-y-2">
                          {lane.events.map((event) => (
                            <li
                              key={event.id}
                              className="rounded-md border border-primary-800/80 bg-primary-900/60 px-2 py-1.5"
                            >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-primary-400">[{event.timestamp}]</span>
                                <span
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                                    EVENT_STYLES[event.eventType],
                                  )}
                                >
                                  {getEventPillLabel(event)}
                                </span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap break-words text-primary-300 line-clamp-3">{event.message}</p>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )
                  })}
                </div>
              )
            ) : null}
            <div ref={streamEndRef} />
            {!isAutoScroll && displayEvents.length > 5 && (
              <button
                type="button"
                onClick={() => {
                  streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
                  setIsAutoScroll(true)
                }}
                className="sticky bottom-2 mx-auto flex items-center gap-1 rounded-full border border-primary-700 bg-primary-900/90 px-3 py-1.5 text-[11px] font-medium text-primary-200 shadow-lg backdrop-blur transition-colors hover:bg-primary-800"
              >
                ↓ Jump to latest
              </button>
            )}
          </div>
        ) : null}

        {activeTab === 'timeline' ? (
          <div className="rounded-xl border border-primary-800/80 bg-primary-950/50 p-4 sm:p-5">
            {timelineBuckets.length === 0 ? (
              <p className="text-sm text-primary-300">No timeline events yet</p>
            ) : (
              <ol className="space-y-4">
                {timelineBuckets.map((bucket) => (
                  <li key={bucket.id} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3">
                    <div className="space-y-1 pt-0.5 text-right">
                      <p className="text-[11px] font-semibold text-primary-200">{bucket.elapsed}</p>
                      <p className="text-[10px] text-primary-400">{bucket.minuteLabel}</p>
                    </div>
                    <div className="relative border-l-2 border-primary-700/80 pl-5">
                      <ol className="space-y-2">
                        {bucket.events.map((event) => (
                          <li key={event.id} className="relative rounded-lg border border-primary-800/80 bg-primary-900/60 px-3 py-2">
                            <span
                              className={cn(
                                'absolute -left-[22px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-primary-950',
                                getEventDotClass(event.eventType),
                              )}
                            />
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <span className="text-primary-400">[{event.timestamp}]</span>
                              <span className="text-primary-200">{event.agentName}</span>
                              <span
                                className={cn(
                                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                                  EVENT_STYLES[event.eventType],
                                )}
                              >
                                {getEventPillLabel(event)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-primary-300">{event.message}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}

        {activeTab === 'artifacts' ? (
          <div className="rounded-xl border border-primary-800/80 bg-primary-950/50 p-4 sm:p-5">
            {!artifacts || artifacts.length === 0 ? (
              <p className="text-sm text-primary-300">No artifacts collected yet</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {artifacts
                  .slice()
                  .sort((a, b) => b.timestamp - a.timestamp)
                  .map((artifact) => {
                    const isExpanded = expandedArtifactId === artifact.id
                    const commitHash = artifact.name.split(' ')[0] || artifact.name
                    const commitMessage = artifact.content || artifact.name.slice(commitHash.length).trim() || 'No commit message'
                    return (
                      <article key={artifact.id} className="rounded-lg border border-primary-800/80 bg-primary-900/60 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold uppercase tracking-wide text-primary-300">{artifact.type}</p>
                            <p className="truncate text-sm font-medium text-primary-100">{artifact.name}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void copyArtifactContent(artifact)}
                            className="inline-flex items-center gap-1 rounded-md border border-primary-700 bg-primary-900/80 px-2 py-1 text-[11px] text-primary-200 transition-colors hover:bg-primary-800"
                          >
                            <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.8} />
                            {copiedArtifactId === artifact.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>

                        {artifact.type === 'file' ? (
                          <div className="space-y-2 text-xs text-primary-300">
                            <p className="truncate text-primary-200">Path: {artifact.path || 'Unknown path'}</p>
                            <button
                              type="button"
                              onClick={() => setExpandedArtifactId(isExpanded ? null : artifact.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-primary-700 bg-primary-900/80 px-2 py-1 text-[11px] font-medium text-primary-200 transition-colors hover:bg-primary-800"
                            >
                              <HugeiconsIcon icon={ViewIcon} size={12} strokeWidth={1.8} />
                              View
                            </button>
                            {isExpanded ? (
                              <pre className="max-h-32 overflow-auto rounded-md border border-primary-800 bg-primary-950/80 p-2 text-[11px] text-primary-200">
                                {artifact.content || artifact.path || 'No file preview available'}
                              </pre>
                            ) : null}
                          </div>
                        ) : null}

                        {artifact.type === 'output' ? (
                          <pre className="max-h-32 overflow-auto rounded-md border border-primary-800 bg-primary-950/80 p-2 text-[11px] text-primary-200">
                            {(artifact.content || 'No output content').slice(0, 200)}
                            {(artifact.content || '').length > 200 ? '...' : ''}
                          </pre>
                        ) : null}

                        {artifact.type === 'commit' ? (
                          <div className="space-y-1.5 text-xs text-primary-300">
                            <p className="font-mono text-primary-200">Hash: {commitHash}</p>
                            <p className="line-clamp-3 break-words">{commitMessage}</p>
                          </div>
                        ) : null}
                      </article>
                    )
                  })}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === 'events' ? (
          <div className="min-h-[200px]">
            {!missionEvents || missionEvents.length === 0 ? (
              <p className="text-sm text-primary-300">No mission events recorded for this run yet.</p>
            ) : (
              <MissionEventLog
                events={missionEvents}
                agentNames={Object.fromEntries(agents.map((a) => [a.id, a.name]))}
              />
            )}
          </div>
        ) : null}

        {activeTab === 'learnings' ? (
          <div className="min-h-[200px]">
            <RunLearnings
              runId={runId}
              runTitle={runTitle}
              learnings={learnings ?? localLearnings}
              onAddLearning={onAddLearning ?? ((learning) => {
                setLocalLearnings((prev) => [
                  ...prev,
                  { ...learning, id: `learning-${Date.now()}`, createdAt: Date.now() },
                ])
              })}
              onClose={() => setActiveTab('stream')}
            />
          </div>
        ) : null}

        {activeTab === 'report' ? (
          <div className="rounded-xl border border-primary-800/80 bg-primary-950/50 p-4 sm:p-5">
            {!report ? (
              <p className="text-sm text-primary-300">Report will be generated when the mission completes</p>
            ) : (
              <div className="space-y-4">
                <section className="rounded-lg border border-primary-800/80 bg-primary-900/50 p-3">
                  <h3 className="text-sm font-semibold text-primary-100">Summary</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-300">{report.summary}</p>
                </section>

                <section className="rounded-lg border border-primary-800/80 bg-primary-900/50 p-3">
                  <h3 className="text-sm font-semibold text-primary-100">Key Findings</h3>
                  {report.keyFindings.length > 0 ? (
                    <ul className="mt-2 space-y-2">
                      {report.keyFindings.map((finding, index) => (
                        <li key={`${finding}-${index}`} className="flex items-start gap-2 text-sm text-primary-300">
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={1.9} className="mt-0.5 text-emerald-300" />
                          <span>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-primary-400">No key findings available</p>
                  )}
                </section>

                <section className="grid gap-2 rounded-lg border border-primary-800/80 bg-primary-900/50 p-3 text-xs sm:grid-cols-3">
                  <div className="rounded-md border border-primary-800 bg-primary-950/70 px-2 py-1.5">
                    <p className="text-primary-400">Duration</p>
                    <p className="mt-0.5 text-sm font-semibold text-primary-100">{report.duration}</p>
                  </div>
                  <div className="rounded-md border border-primary-800 bg-primary-950/70 px-2 py-1.5">
                    <p className="text-primary-400">Total Tokens</p>
                    <p className="mt-0.5 text-sm font-semibold text-primary-100">{report.totalTokens.toLocaleString()}</p>
                  </div>
                  <div className="rounded-md border border-primary-800 bg-primary-950/70 px-2 py-1.5">
                    <p className="text-primary-400">Total Cost</p>
                    <p className="mt-0.5 text-sm font-semibold text-primary-100">${report.totalCost.toFixed(2)}</p>
                  </div>
                </section>

                <section className="overflow-hidden rounded-lg border border-primary-800/80 bg-primary-900/50">
                  <h3 className="border-b border-primary-800/80 px-3 py-2 text-sm font-semibold text-primary-100">Agent Breakdown</h3>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-primary-950/70 text-primary-300">
                      <tr>
                        <th className="px-3 py-2 font-medium">Agent</th>
                        <th className="px-3 py-2 font-medium">Tasks Completed</th>
                        <th className="px-3 py-2 font-medium">Tokens Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.agentSummaries.map((agent, index) => (
                        <tr key={`${agent.name}-${index}`} className="border-t border-primary-800/70 text-primary-200">
                          <td className="px-3 py-2">{agent.name}</td>
                          <td className="px-3 py-2">{agent.tasks}</td>
                          <td className="px-3 py-2">{agent.tokens.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
