import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDown01Icon,
  ArrowExpand01Icon,
  ArrowRight01Icon,
  BotIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react'
import { AgentCard } from './agent-card'
import { useAgentSpawn } from './hooks/use-agent-spawn'
import type {
  AgentNode,
  AgentNodeStatus,
  AgentStatusBubble,
} from './agent-card'
import type { ActiveAgent } from '@/hooks/use-agent-view'
import { AgentChatModal } from '@/components/agent-chat/AgentChatModal'
import { AgentCard as MiniAgentCard, type AgentCardStatus } from '@/components/agent-card'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from '@/components/ui/scroll-area'
import { formatCost, useAgentView } from '@/hooks/use-agent-view'
import { useCliAgents } from '@/hooks/use-cli-agents'
import { useSounds } from '@/hooks/use-sounds'
import { OrchestratorAvatar } from '@/components/orchestrator-avatar'
import { useOrchestratorState } from '@/hooks/use-orchestrator-state'
import { useChatActivityStore } from '@/stores/chat-activity-store'
import { cn } from '@/lib/utils'

function getLastUserMessageBubbleElement(): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(
    '[data-chat-message-role="user"] [data-chat-message-bubble="true"]',
  )
  return nodes.item(nodes.length - 1)
}

function summarizeTask(raw: string): string {
  if (!raw) return ''
  // Strip "exec " prefix and clean up codex command noise
  let t = raw
    .replace(/^exec\s+/i, '')
    .replace(/^codex\s+exec\s+--full-auto\s+/i, '')
  // Remove quotes wrapping the whole thing
  t = t.replace(/^['"]|['"]$/g, '')
  // Take first sentence or first 60 chars
  const firstLine = t.split(/[.\n]/)[0] || t
  return firstLine.slice(0, 60).trim() + (firstLine.length > 60 ? '…' : '')
}

function normalizeAgentTask(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase()
  if (!normalized || normalized === 'no task description') return ''
  return normalized
}

function formatRuntimeLabel(runtimeSeconds: number): string {
  const clampedSeconds = Math.max(0, Math.floor(runtimeSeconds))
  const hours = Math.floor(clampedSeconds / 3600)
  const minutes = Math.floor((clampedSeconds % 3600) / 60)
  const seconds = clampedSeconds % 60

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':')
}

function getMiniAgentCardStatus(status: string): AgentCardStatus {
  if (status === 'complete' || status === 'finished') return 'completed'
  if (status === 'failed') return 'failed'
  return 'running'
}

const AGENT_NAME_KEY = 'clawsuite-agent-name'

function getStoredAgentName(): string {
  try {
    const v = localStorage.getItem(AGENT_NAME_KEY)
    if (v && v.trim()) return v.trim()
  } catch {
    /* noop */
  }
  return ''
}

const STATE_GLOW: Record<string, string> = {
  idle: 'border-primary-300/70',
  reading: 'border-blue-400/50 shadow-[0_0_8px_rgba(59,130,246,0.15)]',
  thinking: 'border-yellow-400/50 shadow-[0_0_8px_rgba(234,179,8,0.15)]',
  responding: 'border-emerald-400/50 shadow-[0_0_8px_rgba(34,197,94,0.2)]',
  'tool-use': 'border-violet-400/50 shadow-[0_0_8px_rgba(139,92,246,0.15)]',
  orchestrating: 'border-accent-400/50 shadow-[0_0_8px_rgba(249,115,22,0.2)]',
}

// ── Usage helpers (inline in OrchestratorCard) ─────────────────────────────

const USAGE_POLL_MS = 30_000
const PREFERRED_PROVIDER_KEY_OC = 'clawsuite-preferred-provider'

type OcUsageLine = {
  type: 'progress' | 'text' | 'badge'
  label: string
  used?: number
  limit?: number
  format?: 'percent' | 'dollars' | 'tokens'
  value?: string
  color?: string
  resetsAt?: string
}

type OcProviderEntry = {
  provider: string
  displayName: string
  status: 'ok' | 'missing_credentials' | 'auth_expired' | 'error'
  plan?: string
  lines: Array<OcUsageLine>
}

type OcUsageRow = { label: string; pct: number; resetHint: string | null }

function ocFormatResetHint(resetsAt?: string): string | null {
  if (!resetsAt) return null
  const now = Date.now()
  const diff = new Date(resetsAt).getTime() - now
  if (diff <= 0) return null
  const hours = diff / 3_600_000
  if (hours >= 24) {
    const days = Math.ceil(hours / 24)
    return `~${days}d`
  }
  return `~${Math.ceil(hours)}h`
}

function ocBarColor(pct: number): string {
  if (pct >= 100) return 'bg-amber-400'  // full = amber (resets soon, not an error)
  if (pct >= 80) return 'bg-red-400'
  if (pct >= 60) return 'bg-amber-400'
  return 'bg-emerald-500'
}
function ocTextColor(pct: number): string {
  if (pct >= 100) return 'text-amber-500'
  if (pct >= 80) return 'text-red-400'
  if (pct >= 60) return 'text-amber-500'
  return 'text-emerald-600'
}

function ocReadNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const p = Number(value)
    if (Number.isFinite(p)) return p
  }
  return 0
}

function ocReadPercent(value: unknown): number {
  const n = ocReadNumber(value)
  if (n <= 1 && n > 0) return n * 100
  return n
}

function ocParseContextPct(payload: unknown): number {
  const root = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const usage =
    (root.today as Record<string, unknown> | undefined) ??
    (root.usage as Record<string, unknown> | undefined) ??
    (root.summary as Record<string, unknown> | undefined) ??
    (root.totals as Record<string, unknown> | undefined) ??
    root
  return ocReadPercent(
    (usage as Record<string, unknown>)?.contextPercent ??
      (usage as Record<string, unknown>)?.context_percent ??
      (usage as Record<string, unknown>)?.context ??
      root?.contextPercent ??
      root?.context_percent,
  )
}

// ── OrchestratorCard ────────────────────────────────────────────────────────

function OrchestratorCard({
  compact = false,
  cardRef,
}: {
  compact?: boolean
  cardRef?: (element: HTMLElement | null) => void
}) {
  const { state, label } = useOrchestratorState()
  const glowClass = STATE_GLOW[state] ?? STATE_GLOW.idle

  const [agentName, setAgentName] = useState(getStoredAgentName)
  const [sessionName, setSessionName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch model from gateway
  const [model, setModel] = useState('')

  // Usage state
  const [contextPct, setContextPct] = useState<number | null>(null)
  const [usageRows, setUsageRows] = useState<OcUsageRow[]>([])
  const [providerLabel, setProviderLabel] = useState<string | null>(null)
  const [usageExpanded, setUsageExpanded] = useState(true)
  const [preferredProvider, setPreferredProvider] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try { return window.localStorage.getItem(PREFERRED_PROVIDER_KEY_OC) } catch { return null }
  })
  const [allOcProviders, setAllOcProviders] = useState<OcProviderEntry[]>([])
  const [providerFlash, setProviderFlash] = useState(false)
  const flashTimerRefOc = useRef<ReturnType<typeof setTimeout> | null>(null)

  function getPrimaryProvider(all: OcProviderEntry[], preferred: string | null) {
    if (preferred) {
      const m = all.find((p) => p.provider === preferred && p.status === 'ok' && p.lines.length > 0)
      if (m) return m
    }
    return all.find((p) => p.status === 'ok' && p.lines.length > 0) ?? null
  }

  function updateUsageRowsFromProviders(providers: OcProviderEntry[], preferred: string | null) {
    const primary = getPrimaryProvider(providers, preferred)
    if (!primary) return
    const rows: OcUsageRow[] = primary.lines
      .filter((l) => l.type === 'progress' && l.used !== undefined)
      .slice(0, 2)
      .map((l) => ({ label: l.label.replace(/\s*\([^)]*\)\s*$/, '').trim(), pct: Math.min(100, Math.round(l.used as number)), resetHint: ocFormatResetHint(l.resetsAt) }))
    setUsageRows(rows)
    const name = primary.displayName.split(' ')[0]
    const lbl = primary.plan ? `${name} ${primary.plan}` : name
    setProviderLabel(lbl.length > 14 ? name : lbl)
  }

  function cycleOcProvider() {
    const okProviders = allOcProviders.filter((p) => p.status === 'ok' && p.lines.length > 0)
    if (okProviders.length < 2) return
    const currentIdx = okProviders.findIndex((p) => p.provider === preferredProvider)
    const next = okProviders[(currentIdx + 1) % okProviders.length]
    if (!next) return
    setPreferredProvider(next.provider)
    try { localStorage.setItem(PREFERRED_PROVIDER_KEY_OC, next.provider) } catch { /* noop */ }
    updateUsageRowsFromProviders(allOcProviders, next.provider)
    if (flashTimerRefOc.current) clearTimeout(flashTimerRefOc.current)
    setProviderFlash(true)
    flashTimerRefOc.current = setTimeout(() => setProviderFlash(false), 300)
  }

  useEffect(() => {
    let cancelled = false
    async function fetchAll() {
      try {
        // session-status: model + context pct
        const res = await fetch('/api/session-status')
        if (!res.ok) return
        const data = await res.json()
        const payload = data.payload ?? data
        const m = payload.model ?? payload.currentModel ?? ''
        if (!cancelled && m) setModel(String(m))
        const sn = String(payload.sessionLabel ?? payload.sessionName ?? payload.name ?? payload.label ?? '')
        if (!cancelled && sn) setSessionName(sn)
        const pct = ocParseContextPct(payload)
        if (!cancelled) setContextPct(Math.min(100, Math.round(pct)))
      } catch { /* noop */ }

      try {
        // provider-usage: all bars
        const res2 = await fetch('/api/provider-usage')
        if (!res2.ok || cancelled) return
        const data2 = await res2.json().catch(() => null) as {
          ok?: boolean
          providers?: Array<OcProviderEntry>
        } | null
        if (!data2?.providers || cancelled) return

        if (!cancelled) {
          setAllOcProviders(data2.providers)
          updateUsageRowsFromProviders(data2.providers, preferredProvider)
        }
      } catch { /* noop */ }
    }

    void fetchAll()
    const timer = setInterval(fetchAll, USAGE_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
      if (flashTimerRefOc.current) clearTimeout(flashTimerRefOc.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredProvider])

  const displayName = agentName || sessionName || 'Agent'

  function startEdit() {
    setEditValue(agentName)
    setIsEditing(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function commitEdit() {
    const trimmed = editValue.trim()
    setAgentName(trimmed)
    setIsEditing(false)
    try { localStorage.setItem(AGENT_NAME_KEY, trimmed) } catch { /* noop */ }
  }

  // Build usage rows: provider rows if available, else synthetic context row
  const ctxRow: OcUsageRow = { label: 'Ctx', pct: contextPct ?? 0, resetHint: null }
  const displayRows: OcUsageRow[] = usageRows.length > 0 ? usageRows : (contextPct !== null ? [ctxRow] : [])
  const usageHeader = providerLabel ?? 'Usage'

  // Provider logo URLs (Simple Icons CDN)
  const PROVIDER_LOGO_URLS: Record<string, string> = {
    'anthropic': 'https://cdn.simpleicons.org/anthropic',
    'claude':    'https://cdn.simpleicons.org/anthropic',
    'openai':    'https://cdn.simpleicons.org/openai',
    'gemini':    'https://cdn.simpleicons.org/googlegemini',
    'google':    'https://cdn.simpleicons.org/google',
    'mistral':   'https://cdn.simpleicons.org/mistral',
    'groq':      'https://cdn.simpleicons.org/groq',
    'ollama':    'https://cdn.simpleicons.org/ollama',
    'deepseek':  'https://cdn.simpleicons.org/deepseek',
    'minimax':   'https://cdn.simpleicons.org/minimax',
    'cohere':    'https://cdn.simpleicons.org/cohere',
    'meta':      'https://cdn.simpleicons.org/meta',
    'nvidia':    'https://cdn.simpleicons.org/nvidia',
  }
  function getProviderLogoUrl(label: string | null): string | null {
    if (!label) return null
    const key = label.toLowerCase()
    for (const [k, v] of Object.entries(PROVIDER_LOGO_URLS)) {
      if (key.includes(k)) return v
    }
    return null
  }
  const providerLogoUrl = getProviderLogoUrl(providerLabel)
  const canCycleOc = allOcProviders.filter((p) => p.status === 'ok' && p.lines.length > 0).length > 1

  return (
    <div
      ref={cardRef}
      className={cn(
        'relative rounded-2xl border bg-gradient-to-br from-primary-100/80 via-primary-100/60 to-primary-200/40 transition-all duration-500',
        compact ? 'p-2' : 'p-3',
        glowClass,
      )}
    >
      {state !== 'idle' && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded-2xl bg-gradient-to-br from-accent-500/[0.03] to-transparent" />
      )}

      <div
        className={cn(
          'relative flex items-center',
          compact ? 'gap-2' : 'flex-col text-center gap-2',
        )}
      >
        <div className="flex flex-col items-center gap-0.5">
          <OrchestratorAvatar size={compact ? 32 : 52} />
          {!compact ? (
            <span className="rounded bg-accent-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent-700">
              Main Agent
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'flex items-center gap-1.5',
              !compact && 'justify-center',
            )}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                placeholder="Agent name..."
                className="w-24 rounded border border-primary-300/70 bg-primary-50 px-1.5 py-0.5 text-xs font-semibold text-primary-900 outline-none focus:border-accent-400"
                maxLength={20}
              />
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className={cn(
                  'font-semibold text-primary-900 transition-colors hover:text-accent-600',
                  compact ? 'text-sm' : 'text-base',
                )}
                title="Click to rename"
              >
                {displayName}
              </button>
            )}
          </div>
          {/* State indicator — dot + label */}
          <div className={cn('flex items-center gap-1.5 mt-0.5', !compact && 'justify-center')}>
            <span className={cn(
              'inline-block h-1.5 w-1.5 rounded-full shrink-0',
              state === 'idle' ? 'bg-primary-400' :
              state === 'thinking' ? 'bg-yellow-400 animate-pulse' :
              state === 'tool-use' ? 'bg-violet-400 animate-pulse' :
              state === 'responding' ? 'bg-emerald-400 animate-pulse' :
              state === 'reading' ? 'bg-blue-400 animate-pulse' :
              'bg-accent-400 animate-pulse'
            )} />
            <p className={cn(
              'text-primary-600',
              compact ? 'text-[9px]' : 'text-[10px]',
              state !== 'idle' && 'font-medium text-primary-700',
            )}>
              {label}
            </p>
          </div>
          {!compact && model ? (
            <p className="mt-0.5 truncate text-[9px] font-mono text-primary-400 text-center">
              {model}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Usage section ── */}
      {displayRows.length > 0 && (
        <div className={cn('border-t border-primary-300/40 pt-2 space-y-1.5', compact ? 'mt-1.5 px-2' : 'mt-2 px-3')}>
          {/* Provider header row — centered */}
          <div className="flex w-full items-center justify-between">
            <div className="flex-1" />
            <button
              type="button"
              onClick={canCycleOc ? cycleOcProvider : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold tracking-wide transition-colors',
                canCycleOc
                  ? 'cursor-pointer text-primary-500 hover:bg-primary-200/60 hover:text-primary-700'
                  : 'cursor-default text-primary-400',
                providerFlash && 'text-emerald-500',
              )}
              title={canCycleOc ? 'Click to switch provider' : undefined}
            >
              {providerLogoUrl ? (
                <img
                  src={providerLogoUrl}
                  alt={usageHeader}
                  className="h-3 w-3 object-contain opacity-70"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <span className="h-3 w-3 rounded-full bg-primary-300/60 inline-block" />
              )}
              <span className="capitalize">{usageHeader}</span>
              {canCycleOc && <span className="text-[9px] opacity-50">↻</span>}
            </button>
            <div className="flex-1 flex justify-end">
              <button
                type="button"
                onClick={() => setUsageExpanded((v) => !v)}
                className="rounded p-0.5 text-[9px] text-primary-300 hover:text-primary-500 transition-colors cursor-pointer"
                aria-expanded={usageExpanded}
              >
                {usageExpanded ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {usageExpanded && (
            <div className="space-y-1.5">
              {displayRows.filter(row => !(row.label === 'Ctx' && row.pct === 0) && row.pct > 0).map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-medium text-primary-500 leading-none">{row.label}</span>
                    <span className={cn('text-[9px] tabular-nums font-semibold', ocTextColor(row.pct))}>
                      {row.pct}%
                    </span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-primary-200/70">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', ocBarColor(row.pct))}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                  {row.resetHint && (
                    <p className="text-[8px] text-primary-400/70 text-right leading-none">
                      {row.resetHint}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


function getStatusLabel(status: AgentNodeStatus): string {
  if (status === 'failed') return 'failed'
  if (status === 'thinking') return 'thinking'
  if (status === 'complete') return 'complete'
  if (status === 'queued') return 'queued'
  return 'running'
}

function getAgentStatus(agent: ActiveAgent): AgentNodeStatus {
  const status = agent.status.toLowerCase()
  if (status === 'thinking') return 'thinking'
  if (['failed', 'error', 'cancelled', 'canceled', 'killed'].includes(status)) {
    return 'failed'
  }
  if (
    ['complete', 'completed', 'success', 'succeeded', 'done'].includes(
      status,
    ) ||
    agent.progress >= 99
  ) {
    return 'complete'
  }
  return 'running'
}

function getStatusBubble(
  status: AgentNodeStatus,
  progress: number,
): AgentStatusBubble {
  if (status === 'thinking') {
    return { type: 'thinking', text: 'Reasoning through next step' }
  }
  if (status === 'failed') {
    return { type: 'error', text: 'Execution failed, awaiting retry' }
  }
  if (status === 'complete') {
    return { type: 'checkpoint', text: 'Checkpoint complete' }
  }
  if (status === 'queued') {
    return { type: 'question', text: 'Queued for dispatch' }
  }
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)))
  return { type: 'checkpoint', text: `${clampedProgress}% complete` }
}

export function AgentViewPanel() {
  // Sound notifications for agent events
  useSounds({ autoPlay: true })

  // Start gateway polling for orchestrator state (detects activity from Telegram/other channels)
  const startGatewayPoll = useChatActivityStore((s) => s.startGatewayPoll)
  const stopGatewayPoll = useChatActivityStore((s) => s.stopGatewayPoll)
  useEffect(() => {
    startGatewayPoll()
    return () => stopGatewayPoll()
  }, [startGatewayPoll, stopGatewayPoll])

  const {
    isOpen,
    isDesktop,
    panelVisible,
    showFloatingToggle,
    panelWidth,
    nowMs,
    lastRefreshedMs: _lastRefreshedMs,
    activeAgents,
    missionActiveAgents,
    nonMissionActiveAgents,
    queuedAgents,
    historyAgents,
    historyOpen,
    activeMissionName,
    activeMissionState,
    isLoading,
    isLiveConnected,
    errorMessage,
    setOpen,
    setHistoryOpen,
    killAgent,
    cancelQueueTask,
    activeCount,
  } = useAgentView()
  const navigate = useNavigate()

  // Transcript modal removed — View button now navigates to /agent-swarm
  const [selectedAgentChat, setSelectedAgentChat] = useState<{
    sessionKey: string
    agentName: string
    statusLabel: string
  } | null>(null)
  const [cliAgentsExpanded, setCliAgentsExpanded] = useState(true)
  const cliAgentsQuery = useCliAgents()
  const cliAgents = cliAgentsQuery.data ?? []
  // Auto: expanded avatar when idle, compact when agents are working
  const viewMode = 'expanded'

  // Auto-expand history only when first entry arrives
  const prevHistoryCount = useRef(0)
  useEffect(() => {
    if (historyAgents.length > 0 && prevHistoryCount.current === 0) {
      setHistoryOpen(true)
    }
    prevHistoryCount.current = historyAgents.length
  }, [historyAgents.length, setHistoryOpen])

  const totalCost = useMemo(
    function getTotalCost() {
      return activeAgents.reduce(function sumCost(total, agent) {
        return total + agent.estimatedCost
      }, 0)
    },
    [activeAgents],
  )
  const representedTaskFingerprints = useMemo(() => {
    const fingerprints = new Set<string>()
    activeAgents.forEach((agent) => {
      const task = normalizeAgentTask(agent.task)
      if (task) fingerprints.add(task)
    })
    queuedAgents.forEach((agent) => {
      const task = normalizeAgentTask(agent.description)
      if (task) fingerprints.add(task)
    })
    historyAgents.forEach((agent) => {
      const task = normalizeAgentTask(agent.description)
      if (task) fingerprints.add(task)
    })
    return fingerprints
  }, [activeAgents, historyAgents, queuedAgents])
  const visibleCliAgents = useMemo(
    () =>
      cliAgents.filter((agent) => {
        const task = normalizeAgentTask(agent.task)
        return !task || !representedTaskFingerprints.has(task)
      }),
    [cliAgents, representedTaskFingerprints],
  )
  const missionSessionIds = useMemo(
    () => new Set(missionActiveAgents.map((agent) => agent.id)),
    [missionActiveAgents],
  )

  const activeNodes = useMemo(
    function buildActiveNodes() {
      return activeAgents
        .map(function mapAgentToNode(agent) {
          const runtimeSeconds = Math.max(
            1,
            Math.floor((nowMs - agent.startedAtMs) / 1000),
          )
          const status = getAgentStatus(agent)

          return {
            id: agent.id,
            name: agent.name,
            task: agent.task,
            model: agent.model,
            progress: agent.progress,
            runtimeSeconds,
            tokenCount: agent.tokenCount,
            cost: agent.estimatedCost,
            status,
            isLive: agent.isLive,
            statusBubble: getStatusBubble(status, agent.progress),
            sessionKey: agent.id, // Use agent id as session key
          } satisfies AgentNode
        })
        .sort(function sortByProgressDesc(left, right) {
          const leftMissionRank = missionSessionIds.has(left.id) ? 0 : 1
          const rightMissionRank = missionSessionIds.has(right.id) ? 0 : 1
          if (leftMissionRank !== rightMissionRank) {
            return leftMissionRank - rightMissionRank
          }
          if (right.progress !== left.progress) {
            return right.progress - left.progress
          }
          return left.name.localeCompare(right.name)
        })
    },
    [activeAgents, missionSessionIds, nowMs],
  )
  const missionStateLabel = activeMissionState
    ? activeMissionState.charAt(0).toUpperCase() + activeMissionState.slice(1)
    : ''

  const queuedNodes = useMemo(
    function buildQueuedNodes() {
      return queuedAgents.map(function mapQueuedAgent(task, index) {
        return {
          id: task.id,
          name: task.name,
          task: task.description,
          model: 'queued',
          progress: 5 + index * 7,
          runtimeSeconds: 0,
          tokenCount: 0,
          cost: 0,
          status: 'queued',
          statusBubble: getStatusBubble('queued', 0),
        } satisfies AgentNode
      })
    },
    [queuedAgents],
  )

  // Swarm node stats removed — OrchestratorCard now serves as the main agent representation

  const activeNodeIds = useMemo(
    () => activeNodes.map((node) => node.id),
    // Stabilize: only recompute when the sorted id string changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeNodes.map((n) => n.id).join(',')],
  )
  const agentSpawn = useAgentSpawn(activeNodeIds)
  const shouldReduceMotion = useReducedMotion()
  const networkLayerRef = useRef<HTMLDivElement | null>(null)
  const [sourceBubbleRect, setSourceBubbleRect] = useState<DOMRect | null>(null)

  const visibleActiveNodes = useMemo(
    function getVisibleActiveNodes() {
      return activeNodes.filter(function keepRenderedNode(node) {
        return agentSpawn.shouldRenderCard(node.id)
      })
    },
    [activeNodes, agentSpawn],
  )

  const spawningNodes = useMemo(
    function getSpawningNodes() {
      return activeNodes.filter(function keepSpawningNode(node) {
        return agentSpawn.isSpawning(node.id)
      })
    },
    [activeNodes, agentSpawn],
  )

  const updateSourceBubbleRect = useCallback(function updateSourceBubbleRect() {
    if (typeof document === 'undefined') return
    const element = getLastUserMessageBubbleElement()
    if (!element) {
      setSourceBubbleRect(null)
      return
    }
    setSourceBubbleRect(element.getBoundingClientRect())
  }, [])

  useEffect(
    function syncSourceBubbleRect() {
      if (!panelVisible) return
      updateSourceBubbleRect()
      window.addEventListener('resize', updateSourceBubbleRect)
      window.addEventListener('scroll', updateSourceBubbleRect, true)
      return function cleanupSourceBubbleTracking() {
        window.removeEventListener('resize', updateSourceBubbleRect)
        window.removeEventListener('scroll', updateSourceBubbleRect, true)
      }
    },
    [panelVisible, updateSourceBubbleRect],
  )

  const statusCounts = useMemo(
    function getStatusCounts() {
      return visibleActiveNodes.reduce(
        function summarizeCounts(counts, item) {
          if (item.status === 'thinking') {
            return { ...counts, thinking: counts.thinking + 1 }
          }
          if (item.status === 'failed') {
            return { ...counts, failed: counts.failed + 1 }
          }
          if (item.status === 'complete') {
            return { ...counts, complete: counts.complete + 1 }
          }
          return { ...counts, running: counts.running + 1 }
        },
        { running: 0, thinking: 0, failed: 0, complete: 0 },
      )
    },
    [visibleActiveNodes],
  )

  // View functionality is now handled inline within AgentCard via useInlineDetail

  function handleChatByNodeId(nodeId: string) {
    const activeNode = activeNodes.find(function matchActiveNode(node) {
      return node.id === nodeId
    })
    if (activeNode) {
      setSelectedAgentChat({
        sessionKey: activeNode.id,
        agentName: activeNode.name,
        statusLabel: getStatusLabel(activeNode.status),
      })
      return
    }

    const queuedNode = queuedNodes.find(function matchQueuedNode(node) {
      return node.id === nodeId
    })
    if (!queuedNode) return

    setSelectedAgentChat({
      sessionKey: queuedNode.id,
      agentName: queuedNode.name,
      statusLabel: getStatusLabel(queuedNode.status),
    })
  }

  return (
    <>
      {isDesktop ? (
        <motion.aside
          initial={false}
          animate={{ x: panelVisible ? 0 : panelWidth }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className={cn(
            'fixed right-0 bottom-0 top-[var(--titlebar-h,0px)] z-40 w-72 border-l border-primary-300/70 bg-primary-100/92 backdrop-blur-xl',
            panelVisible ? 'pointer-events-auto' : 'pointer-events-none',
          )}
        >
          <div className="border-b border-primary-300/70 px-3 py-2">
            {/* Row 1: Count left | Title center | Actions right */}
            <div className="flex items-center justify-between">
              {/* Left — active agent count + live indicator */}
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums cursor-default',
                    activeCount > 0
                      ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700'
                      : 'border-primary-300/70 bg-primary-200/50 text-primary-700',
                  )}
                  title={`${activeCount} agent${activeCount !== 1 ? 's' : ''} running · ${historyAgents.length} in history · ${queuedAgents.length} queued`}
                >
                  {isLiveConnected ? (
                    <motion.span
                      animate={
                        activeCount > 0
                          ? { opacity: [0.4, 1, 0.4], scale: [1, 1.2, 1] }
                          : { opacity: [0.4, 1, 0.4] }
                      }
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                      className={cn(
                        'size-1.5 rounded-full',
                        activeCount > 0 ? 'bg-emerald-400' : 'bg-emerald-400',
                      )}
                    />
                  ) : (
                    <span className="size-1.5 rounded-full bg-primary-400/50" />
                  )}
                  {activeCount}
                </span>
              </div>

              {/* Center — title */}
              <h2 className="text-sm font-semibold text-primary-900">
                Agent View
              </h2>

              {/* Right — expand + close */}
              <div className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={function handleExpandHub() {
                    navigate({ to: '/conductor' })
                    setTimeout(() => {
                      setOpen(false)
                    }, 0)
                  }}
                  aria-label="Open Conductor"
                  title="Open Conductor"
                >
                  <HugeiconsIcon
                    icon={ArrowExpand01Icon}
                    size={16}
                    strokeWidth={1.5}
                  />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={function handleClosePanel() {
                    setOpen(false)
                  }}
                  aria-label="Hide Agent View"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={18}
                    strokeWidth={1.5}
                  />
                </Button>
              </div>
            </div>
            {/* Row 2: Stats */}
            {activeCount > 0 || queuedAgents.length > 0 ? (
              <p className="mt-1 text-[10px] text-primary-600 tabular-nums">
                {activeCount} active · {queuedAgents.length} queued ·{' '}
                {formatCost(totalCost)}
              </p>
            ) : null}
          </div>

          <ScrollAreaRoot className="h-[calc(100vh-3.25rem)]">
            <ScrollAreaViewport>
              <div className="space-y-3 p-3">
                {/* Main Agent Card (includes usage section) */}
                <OrchestratorCard compact={false} />

                {/* Agents — agent cards — only show when there's something */}
                {(activeCount > 0 || queuedAgents.length > 0 || historyAgents.length > 0) && <section className="rounded-2xl border border-primary-300/70 bg-primary-200/35 p-1">
                  {/* Centered Agents pill */}
                  <div className="mb-1 flex justify-center">
                    <span className="rounded-full border border-primary-300/70 bg-primary-100/80 px-3 py-0.5 text-[10px] font-medium text-primary-600 shadow-sm">
                      Agents
                    </span>
                  </div>

                  <div className="mb-1 flex items-center justify-between">
                    <div>
                      {activeMissionName ? (
                        <p className="mb-0.5 text-[10px] font-medium text-accent-400 tabular-nums">
                          Mission: {activeMissionName} · {missionStateLabel}
                        </p>
                      ) : null}
                      <p className="text-[10px] text-primary-600 tabular-nums">
                        {isLoading
                          ? 'syncing...'
                          : statusCounts.running === 0 &&
                              statusCounts.thinking === 0 &&
                              statusCounts.failed === 0 &&
                              statusCounts.complete === 0
                            ? ''
                            : [
                                statusCounts.running > 0 &&
                                  `${statusCounts.running} running`,
                                statusCounts.thinking > 0 &&
                                  `${statusCounts.thinking} thinking`,
                                statusCounts.failed > 0 &&
                                  `${statusCounts.failed} failed`,
                                statusCounts.complete > 0 &&
                                  `${statusCounts.complete} complete`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                      </p>
                      {errorMessage ? (
                        <p className="line-clamp-1 text-[10px] text-red-300 tabular-nums">
                          {errorMessage}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-[10px] text-primary-500 tabular-nums">
                      <p>
                        {isLoading
                          ? ''
                          : ''}
                      </p>
                    </div>
                  </div>

                  <LayoutGroup id="agent-swarm-grid">
                    {activeNodes.length > 0 ||
                    spawningNodes.length > 0 ||
                    queuedNodes.length > 0 ? (
                      <motion.div
                        ref={networkLayerRef}
                        layout
                        transition={{
                          layout: {
                            type: 'spring',
                            stiffness: 320,
                            damping: 30,
                          },
                        }}
                        className="relative rounded-xl border border-primary-300/70 bg-linear-to-b from-primary-100 via-primary-100 to-primary-200/40 p-1"
                      >
                        <AnimatePresence initial={false}>
                          {spawningNodes.map(
                            function renderSpawningGhost(node, index) {
                              const fallbackLeft = 24 + index * 14
                              const fallbackTop = 128 + index * 10
                              const width = sourceBubbleRect
                                ? Math.min(sourceBubbleRect.width, 152)
                                : 124
                              const height = sourceBubbleRect
                                ? Math.min(sourceBubbleRect.height, 44)
                                : 32
                              const top = sourceBubbleRect
                                ? sourceBubbleRect.top
                                : fallbackTop
                              const left = sourceBubbleRect
                                ? sourceBubbleRect.left +
                                  sourceBubbleRect.width -
                                  width
                                : fallbackLeft

                              return (
                                <motion.div
                                  key={`spawn-ghost-${node.id}`}
                                  layoutId={agentSpawn.getSharedLayoutId(
                                    node.id,
                                  )}
                                  initial={
                                    shouldReduceMotion
                                      ? { opacity: 0, scale: 0.96 }
                                      : { opacity: 0, scale: 0.9 }
                                  }
                                  animate={
                                    shouldReduceMotion
                                      ? { opacity: 0.65, scale: 1 }
                                      : {
                                          opacity: [0.5, 0.85, 0.5],
                                          scale: [0.94, 1, 0.94],
                                        }
                                  }
                                  exit={{ opacity: 0, scale: 0.94 }}
                                  transition={
                                    shouldReduceMotion
                                      ? { duration: 0.12, ease: 'easeOut' }
                                      : { duration: 0.42, ease: 'easeInOut' }
                                  }
                                  className="pointer-events-none fixed z-30 rounded-full border border-accent-500/40 bg-accent-500/20 shadow-sm backdrop-blur-sm"
                                  style={{ top, left, width, height }}
                                />
                              )
                            },
                          )}
                        </AnimatePresence>

                        {activeNodes.length > 0 || spawningNodes.length > 0 ? (
                          <motion.div
                            layout
                            transition={{
                              layout: {
                                type: 'spring',
                                stiffness: 360,
                                damping: 34,
                              },
                            }}
                            className={cn(
                              'grid gap-1.5 items-start',
                              'grid-cols-1',
                            )}
                          >
                            <AnimatePresence mode="popLayout" initial={false}>
                              {visibleActiveNodes.map(
                                function renderActiveNode(node) {
                                  return (
                                    <motion.div
                                      key={node.id}
                                      layout="position"
                                      initial={{
                                        y: -18,
                                        opacity: 0,
                                        scale: 0.96,
                                      }}
                                      animate={{ y: 0, opacity: 1, scale: 1 }}
                                      exit={{ y: 10, opacity: 0, scale: 0.88 }}
                                      transition={{
                                        type: 'spring',
                                        stiffness: 300,
                                        damping: 25,
                                      }}
                                      className="w-full"
                                    >
                                      <AgentCard
                                        node={node}
                                        layoutId={agentSpawn.getSharedLayoutId(
                                          node.id,
                                        )}
                                        viewMode={viewMode}
                                        onChat={handleChatByNodeId}
                                        onKill={killAgent}
                                        useInlineDetail
                                        className={cn(
                                          agentSpawn.isSpawning(node.id)
                                            ? 'ring-2 ring-accent-500/35'
                                            : '',
                                        )}
                                      />
                                    </motion.div>
                                  )
                                },
                              )}
                            </AnimatePresence>
                          </motion.div>
                        ) : null}

                        {queuedNodes.length > 0 ? (
                          <motion.div layout className="mt-1.5 space-y-1">
                            <p className="text-[10px] text-primary-600 tabular-nums">
                              Queue
                            </p>
                            <motion.div
                              layout
                              className={cn(
                                'grid gap-1.5 items-start',
                                'grid-cols-1',
                              )}
                            >
                              {queuedNodes.map(function renderQueuedNode(node) {
                                return (
                                  <div key={node.id} className="w-full">
                                    <AgentCard
                                      node={node}
                                      layoutId={agentSpawn.getCardLayoutId(
                                        node.id,
                                      )}
                                      viewMode={viewMode}
                                      onChat={handleChatByNodeId}
                                      onCancel={cancelQueueTask}
                                      useInlineDetail
                                    />
                                  </div>
                                )
                              })}
                            </motion.div>
                          </motion.div>
                        ) : null}
                      </motion.div>
                    ) : cliAgents.length > 0 ? null : (
                      <p
                        ref={
                          networkLayerRef as React.RefObject<HTMLParagraphElement>
                        }
                        className="text-[11px] text-pretty text-primary-600 py-1"
                      >


                      </p>
                    )}
                  </LayoutGroup>
                </section>}

                {(cliAgentsQuery.isLoading || visibleCliAgents.length > 0) ? (
                  <section className="rounded-2xl border border-primary-300/70 bg-primary-200/35 p-2">
                    <Collapsible
                      open={cliAgentsExpanded}
                      onOpenChange={setCliAgentsExpanded}
                    >
                      <div className="flex items-center justify-between">
                        <CollapsibleTrigger className="h-7 px-0 text-xs font-medium hover:bg-transparent">
                          <HugeiconsIcon
                            icon={
                              cliAgentsExpanded
                                ? ArrowDown01Icon
                                : ArrowRight01Icon
                            }
                            size={20}
                            strokeWidth={1.5}
                          />
                          ⚡ Active Agents
                        </CollapsibleTrigger>
                        <span className="rounded-full bg-primary-300/70 px-2 py-0.5 text-[11px] text-primary-800 tabular-nums">
                          {visibleCliAgents.length}
                        </span>
                      </div>
                      <CollapsiblePanel contentClassName="pt-1">
                        <div className="space-y-0.5">
                          {cliAgentsQuery.isLoading ? (
                            <p className="px-2 py-1 text-[11px] text-primary-500 tabular-nums">
                              Scanning...
                            </p>
                          ) : null}
                          {visibleCliAgents.map(function renderCliAgent(agent) {
                            const progressPct =
                              agent.status === 'finished'
                                ? 100
                                : Math.min(
                                    95,
                                    Math.round(
                                      (agent.runtimeSeconds / 600) * 100,
                                    ),
                                  )
                            return (
                              <div
                                key={agent.pid}
                                className="rounded-lg px-2 py-1.5 hover:bg-primary-200/50"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={cn(
                                      'size-1.5 shrink-0 rounded-full',
                                      agent.status === 'running'
                                        ? 'bg-emerald-500'
                                        : 'bg-gray-400',
                                    )}
                                  />
                                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-primary-800">
                                    {agent.name}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-primary-500 tabular-nums">
                                    {formatRuntimeLabel(agent.runtimeSeconds)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await fetch(`/api/cli-agents/${agent.pid}/kill`, { method: 'POST' })
                                        cliAgentsQuery.refetch()
                                      } catch { /* noop */ }
                                    }}
                                    className="shrink-0 rounded px-1 py-0.5 text-[9px] text-primary-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                                    title="Kill agent"
                                  >
                                    ✕
                                  </button>
                                </div>
                                {agent.task ? (
                                  <p className="mt-0.5 truncate pl-3 text-[10px] text-primary-500">
                                    {summarizeTask(agent.task)}
                                  </p>
                                ) : (
                                  <p className="mt-0.5 pl-3 text-[10px] text-primary-400 italic">
                                    {agent.runtimeSeconds > 7200 ? '⚠ stale — no task' : 'no task description'}
                                  </p>
                                )}
                                <div className="mt-1 ml-3 h-1 overflow-hidden rounded-full bg-primary-200">
                                  <div
                                    className={cn(
                                      'h-full rounded-full transition-all duration-500',
                                      agent.status === 'finished'
                                        ? 'bg-primary-400'
                                        : 'bg-emerald-400',
                                    )}
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </CollapsiblePanel>
                    </Collapsible>
                  </section>
                ) : null}

              </div>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar>
              <ScrollAreaThumb />
            </ScrollAreaScrollbar>
            <ScrollAreaCorner />
          </ScrollAreaRoot>
        </motion.aside>
      ) : (
        /* Mobile: slide-up sheet */
        <AnimatePresence>
          {isOpen ? (
            <>
              <motion.div
                key="agent-sheet-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
                onClick={() => setOpen(false)}
              />
              <motion.div
                key="agent-sheet"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-[81] max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-primary-300/70 bg-primary-100/95 backdrop-blur-xl"
              >
                {/* Drag handle */}
                <div className="sticky top-0 z-10 flex justify-center bg-primary-100/95 pt-2 pb-1 backdrop-blur-xl">
                  <div className="h-1 w-10 rounded-full bg-primary-400/50" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-primary-300/70 px-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums',
                        activeCount > 0
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700'
                          : 'border-primary-300/70 bg-primary-200/50 text-primary-700',
                      )}
                    >
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          activeCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-primary-400/50',
                        )}
                      />
                      {activeCount}
                    </span>
                  </div>
                  <h2 className="text-sm font-semibold text-primary-900">Agent View</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-200"
                    aria-label="Close"
                  >
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                {/* Content — same as desktop sidebar */}
                <div className="space-y-3 p-3">
                  <OrchestratorCard compact={false} />

                  <section className="rounded-2xl border border-primary-300/70 bg-primary-200/35 p-1">
                    <div className="mb-1 flex justify-center">
                      <span className="rounded-full border border-primary-300/70 bg-primary-100/80 px-3 py-0.5 text-[10px] font-medium text-primary-600 shadow-sm">
                        Agents
                      </span>
                    </div>
                    <div className="mb-1 flex items-center justify-between px-1">
                      <p className="text-[10px] text-primary-600 tabular-nums">
                        {isLoading
                          ? 'syncing...'
                          : activeNodes.length === 0 && queuedNodes.length === 0
                            ? ''
                            : `${activeNodes.length} active · ${queuedNodes.length} queued`}
                      </p>
                    </div>
                    {activeNodes.length > 0 ? (
                      <div className="space-y-1.5 p-1">
                        {missionActiveAgents.length > 0 ? (
                          <p className="px-1 text-[10px] font-medium uppercase tracking-[0.16em] text-accent-400">
                            {activeMissionName || 'Mission'} · {missionActiveAgents.length} session{missionActiveAgents.length === 1 ? '' : 's'}
                          </p>
                        ) : null}
                        {activeNodes.map((node) => (
                          <MiniAgentCard
                            key={node.id}
                            sessionLabel={node.name}
                            model={node.task || 'unknown'}
                            status={getMiniAgentCardStatus(node.statusBubble.text)}
                            runtimeSeconds={node.runtimeSeconds}
                            footer={
                              <div className="flex items-center justify-between">
                                {missionSessionIds.has(node.id) ? (
                                  <span className="text-[10px] text-accent-400">Active mission</span>
                                ) : nonMissionActiveAgents.length > 0 ? (
                                  <span className="text-[10px] text-primary-500">Outside mission</span>
                                ) : <span />}
                                <button
                                  type="button"
                                  onClick={() => killAgent(node.id)}
                                  className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                                >
                                  Kill
                                </button>
                              </div>
                            }
                          />
                        ))}
                      </div>
                    ) : null}
                  </section>
                  {historyAgents.length > 0 ? (
                    <section className="rounded-2xl border border-primary-300/70 bg-primary-200/35 p-2">
                      <button
                        type="button"
                        onClick={() => setHistoryOpen(!historyOpen)}
                        className="flex w-full items-center justify-between text-[11px] font-medium text-primary-700"
                      >
                        <span>History ({historyAgents.length})</span>
                        <span>{historyOpen ? '▾' : '▸'}</span>
                      </button>
                      {historyOpen ? (
                        <div className="mt-1.5 space-y-1">
                          {historyAgents.map((agent) => (
                            <MiniAgentCard
                              key={agent.id}
                              sessionLabel={agent.name}
                              model={agent.status || 'unknown'}
                              status={getMiniAgentCardStatus(agent.status)}
                              footer={
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAgentChat({ sessionKey: agent.id, agentName: agent.name, statusLabel: agent.status })}
                                    className="text-[10px] text-accent-600 hover:text-accent-800 font-medium"
                                  >
                                    View
                                  </button>
                                </div>
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      )}

      <AnimatePresence>
        {showFloatingToggle ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={function handleOpenPanel() {
              setOpen(true)
            }}
            className="fixed right-4 bottom-4 z-30 inline-flex size-12 items-center justify-center rounded-full bg-linear-to-br from-accent-500 to-accent-600 text-primary-50 shadow-lg"
            aria-label="Open Agent View"
          >
            <motion.span
              animate={
                activeCount > 0
                  ? {
                      scale: [1, 1.05, 1],
                      opacity: [0.95, 1, 0.95],
                    }
                  : { scale: 1, opacity: 1 }
              }
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="inline-flex"
            >
              <HugeiconsIcon icon={BotIcon} size={20} strokeWidth={1.5} />
            </motion.span>
            <span className="absolute -top-1 -right-1 inline-flex size-5 items-center justify-center rounded-full bg-primary-950 text-[11px] font-medium text-primary-50 tabular-nums">
              {activeCount}
            </span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AgentChatModal
        open={selectedAgentChat !== null}
        sessionKey={selectedAgentChat?.sessionKey ?? ''}
        agentName={selectedAgentChat?.agentName ?? 'Agent'}
        statusLabel={selectedAgentChat?.statusLabel ?? 'running'}
        onOpenChange={function handleAgentChatOpenChange(nextOpen) {
          if (!nextOpen) {
            setSelectedAgentChat(null)
          }
        }}
      />
    </>
  )
}
