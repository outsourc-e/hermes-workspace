import { BotIcon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'
import { WidgetShell } from './widget-shell'
import { formatModelName } from '../lib/formatters'
import { cn } from '@/lib/utils'

type SquadStatusWidgetProps = { editMode?: boolean }
type SessionsApiResponse = { sessions?: Array<Record<string, unknown>> }
type AgentStatus = 'active' | 'idle' | 'available' | 'paused'
type SquadAgentRow = { id: string; name: string; status: AgentStatus; taskPreview: string; timeAgo: string; modelShort: string; updatedAt: number; tokens: number }

const STATUS_LABEL: Record<AgentStatus, string> = { active: 'Active', idle: 'Idle', available: 'Available', paused: 'Paused' }
const STATUS_DOT: Record<AgentStatus, string> = { active: 'bg-emerald-500', idle: 'bg-yellow-500', available: 'bg-neutral-400', paused: 'bg-red-500' }

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1_000_000_000_000 ? value : value * 1000
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (Number.isFinite(asNumber)) return asNumber > 1_000_000_000_000 ? asNumber : asNumber * 1000
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}
function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}
function formatRelativeTime(timestamp: number, now: number): string {
  if (!timestamp) return '—'
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}
// formatModelShort uses canonical formatModelName from formatters
function formatModelShort(modelRaw: string): string {
  if (!modelRaw) return '—'
  return formatModelName(modelRaw)
}
function deriveStatus(session: Record<string, unknown>, now: number): AgentStatus {
  const statusText = readString(session.status).toLowerCase()
  if (session.enabled === false || statusText.includes('paused')) return 'paused'
  const updatedAt = readTimestamp(session.updatedAt)
  if (!updatedAt) return 'available'
  return now - updatedAt <= 5 * 60 * 1000 ? 'active' : 'idle'
}
function extractName(session: Record<string, unknown>, index: number): string {
  return readString(session.label) || readString(session.derivedTitle) || readString(session.title) || readString(session.friendlyId) || readString(session.key) || `Agent ${index + 1}`
}
function extractTaskPreview(session: Record<string, unknown>): string {
  const preview = readString(session.lastMessagePreview) || readString(session.task) || readString(session.initialMessage) || readString(session.label)
  return truncateText(preview, 30)
}
function extractModel(session: Record<string, unknown>): string {
  const direct = readString(session.model) || readString(session.currentModel) || readString(session.modelAlias)
  if (direct) return direct
  const lastMessage = session.lastMessage && typeof session.lastMessage === 'object' ? (session.lastMessage as Record<string, unknown>) : null
  const details = lastMessage?.details && typeof lastMessage.details === 'object' ? (lastMessage.details as Record<string, unknown>) : null
  return readString(details?.model) || readString(details?.agentModel)
}
function extractTokens(session: Record<string, unknown>): number {
  const usage = session.usage && typeof session.usage === 'object' ? (session.usage as Record<string, unknown>) : {}
  const total = usage.totalTokens ?? usage.total ?? session.totalTokens
  if (typeof total === 'number' && total > 0) return total
  return 0
}
function formatTokenCompact(n: number): string {
  if (n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function SquadStatusWidget({ editMode }: SquadStatusWidgetProps) {
  const navigate = useNavigate()
  const sessionsQuery = useQuery({
    queryKey: ['dashboard', 'squad-status'],
    queryFn: async () => {
      const res = await fetch('/api/sessions')
      if (!res.ok) return [] as Array<Record<string, unknown>>
      const data = (await res.json()) as SessionsApiResponse
      return Array.isArray(data.sessions) ? data.sessions : []
    },
    refetchInterval: 15_000,
  })
  const agents = useMemo(() => {
    const allSessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : []
    const now = Date.now()
    // Filter out spawned subagent sessions — they clutter the squad view
    const source = allSessions.filter((session) => {
      const key = readString(session.key ?? '')
      const label = readString(session.label ?? '')
      return (
        !key.startsWith('agent:main:subagent:') &&
        !key.includes('subagent') &&
        !label.toLowerCase().includes('subagent')
      )
    })
    return source
      .map((session, index): SquadAgentRow => {
        const updatedAt = readTimestamp(session.updatedAt)
        const status = deriveStatus(session, now)
        return {
          id: readString(session.key) || readString(session.friendlyId) || `squad-agent-${index + 1}`,
          name: extractName(session, index),
          status,
          taskPreview: extractTaskPreview(session),
          timeAgo: formatRelativeTime(updatedAt, now),
          modelShort: formatModelShort(extractModel(session)),
          updatedAt,
          tokens: extractTokens(session),
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessionsQuery.data])
  const visibleAgents = agents.slice(0, 6)

  return (
    <WidgetShell
      size="medium"
      title="Squad Status"
      icon={BotIcon}
      editMode={editMode}
      action={<span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100/80 px-2 py-0.5 text-[11px] font-medium text-neutral-600 tabular-nums dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">{agents.length}</span>}
      className="h-full border border-neutral-200 dark:border-neutral-700 border-l-4 border-l-teal-500 bg-white dark:bg-neutral-900"
    >
      {sessionsQuery.isLoading && agents.length === 0 ? (
        <div className="flex h-[150px] items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-neutral-100/50 dark:border-neutral-800 dark:bg-neutral-900/40">
          <span className="size-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
          <span className="text-sm text-neutral-600 dark:text-neutral-300">Loading squad…</span>
        </div>
      ) : visibleAgents.length === 0 ? (
        <div className="flex h-[150px] flex-col items-center justify-center gap-1 rounded-xl border border-neutral-200 bg-neutral-100/50 text-center dark:border-neutral-800 dark:bg-neutral-900/40">
          <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">No agents yet</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Launch or connect an agent to see live sessions here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {visibleAgents.map((agent) => (
            <div key={agent.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-50 dark:hover:bg-white/10 dark:hover:bg-neutral-800/50">
              <span className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[agent.status])} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{agent.name}</p>
                <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{STATUS_LABEL[agent.status]}</p>
              </div>
              <p className="hidden max-w-[120px] truncate text-[11px] italic text-neutral-500 dark:text-neutral-400 sm:block">{agent.taskPreview || '—'}</p>
              <span className="shrink-0 text-[11px] text-primary-500 dark:text-neutral-400 tabular-nums">{agent.timeAgo}</span>
              {agent.tokens > 0 && (
                <span className="shrink-0 text-[10px] tabular-nums text-primary-500 dark:text-neutral-400">{formatTokenCompact(agent.tokens)}</span>
              )}
              <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{agent.modelShort}</span>
            </div>
          ))}
          {agents.length > 6 ? (
            <button type="button" onClick={() => void navigate({ to: '/agents' })} className="mt-1 inline-flex text-[11px] font-medium text-neutral-500 dark:text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200">
              View all →
            </button>
          ) : null}
        </div>
      )}
    </WidgetShell>
  )
}
