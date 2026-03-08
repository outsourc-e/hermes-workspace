import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { SteerModal } from './steer-modal'
import { killAgentSession, toggleAgentPause } from '@/lib/gateway-api'
import { toast } from '@/components/ui/toast'

export type AgentStreamPanelProps = {
  sessionKey: string
  agentName: string
  agentColor: string
  onClose: () => void
}

type Row = Record<string, unknown>

const AGENT_COLOR_DOT_CLASS: Record<string, string> = { orange: 'bg-orange-500', blue: 'bg-blue-500', cyan: 'bg-cyan-500', purple: 'bg-purple-500', violet: 'bg-violet-500' }
const ROLE_BADGE_CLASS: Record<string, string> = {
  user: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200',
  assistant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  system: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  tool: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-200',
}

const toStr = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const toNum = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const parsed = Number(v)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}
const toTs = (v: unknown) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v < 1_000_000_000_000 ? v * 1000 : v
  if (typeof v === 'string') {
    const parsed = Date.parse(v)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}
const asObj = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {})

function normalizeRole(raw: unknown): 'user' | 'assistant' | 'system' | 'tool' {
  const role = toStr(raw).toLowerCase()
  if (role === 'user' || role === 'assistant' || role === 'system') return role
  if (role.includes('tool')) return 'tool'
  return 'assistant'
}

function textFromMessage(message: Row): string {
  const direct = message.content
  if (typeof direct === 'string') return direct
  if (typeof message.text === 'string') return message.text
  if (!Array.isArray(direct)) return ''
  return direct.map((entry) => {
    const block = asObj(entry)
    const type = toStr(block.type).toLowerCase()
    if (type === 'text') return toStr(block.text)
    if (type === 'thinking') return toStr(block.thinking) || toStr(block.text)
    if (type.includes('tool')) {
      const name = toStr(block.name) || toStr(block.toolName)
      const args = block.arguments ?? block.args
      const argsText = typeof args === 'string' ? args : args && typeof args === 'object' ? JSON.stringify(args) : ''
      return [name, argsText].filter(Boolean).join(' ')
    }
    if (Array.isArray(block.content)) {
      return block.content.map((nested) => toStr(asObj(nested).text)).filter(Boolean).join('\n')
    }
    return toStr(block.text)
  }).filter(Boolean).join('\n').trim()
}

const truncate = (value: string, max = 200) => (value.length <= max ? value : `${value.slice(0, max - 3)}...`)
const formatAgo = (ts: number) => {
  if (!ts) return 'just now'
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
const formatRuntime = (ts: number) => {
  if (!ts) return '--'
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}
const formatCost = (v: number) => (v > 0 ? (v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`) : '$0.00')

export function AgentStreamPanel({ sessionKey, agentName, agentColor, onClose }: AgentStreamPanelProps) {
  const navigate = useNavigate()
  const [steerOpen, setSteerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pausePending, setPausePending] = useState(false)
  const [killPending, setKillPending] = useState(false)
  const streamRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  const sessionsQuery = useQuery({
    queryKey: ['agent-stream-panel', 'sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions')
      if (!res.ok) throw new Error('Failed to load sessions')
      const payload = (await res.json()) as { sessions?: Array<Row> }
      return Array.isArray(payload.sessions) ? payload.sessions : []
    },
    refetchInterval: 5000,
    retry: false,
  })

  const historyQuery = useQuery({
    queryKey: ['agent-stream-panel', 'history', sessionKey],
    queryFn: async () => {
      const params = new URLSearchParams({ sessionKey, limit: '20' })
      const res = await fetch(`/api/history?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load history')
      const payload = (await res.json()) as Record<string, unknown>
      return Array.isArray(payload.messages) ? (payload.messages as Array<Row>) : []
    },
    refetchInterval: 5000,
    retry: false,
  })

  const session = useMemo(() => {
    const rows = sessionsQuery.data ?? []
    return rows.find((row) => toStr(row.key) === sessionKey || toStr(row.friendlyId) === sessionKey) ?? null
  }, [sessionKey, sessionsQuery.data])

  const usage = asObj(session?.usage)
  const inputTokens = toNum(session?.inputTokens ?? usage.inputTokens ?? usage.promptTokens)
  const outputTokens = toNum(session?.outputTokens ?? usage.outputTokens ?? usage.completionTokens)
  const totalCost = toNum(session?.cost ?? usage.cost ?? usage.costUsd)
  const runtimeStart = toTs(session?.startedAt) || toTs(session?.createdAt) || toTs(session?.updatedAt)
  const isPaused = toStr(session?.status).toLowerCase().includes('pause') || session?.enabled === false
  const model = toStr(session?.model) || 'unknown model'

  const messages = useMemo(() => (historyQuery.data ?? []).map((row, index) => ({
    id: `${index}-${toTs(row.timestamp) || toTs(row.createdAt) || toTs(row.updatedAt)}`,
    role: normalizeRole(row.role),
    timestamp: toTs(row.timestamp) || toTs(row.createdAt) || toTs(row.updatedAt),
    text: truncate(textFromMessage(row) || '(empty)', 200),
  })), [historyQuery.data])

  useEffect(() => {
    if (!streamRef.current) return
    streamRef.current.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' })
  }, [historyQuery.dataUpdatedAt, messages.length])

  async function onPauseToggle() {
    if (pausePending) return
    setPausePending(true)
    const nextPaused = !isPaused
    try {
      await toggleAgentPause(sessionKey, nextPaused)
      toast(`${agentName} ${nextPaused ? 'paused' : 'resumed'}`, { type: 'success' })
      void sessionsQuery.refetch()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to update pause state', { type: 'error' })
    } finally {
      setPausePending(false)
      setMenuOpen(false)
    }
  }

  async function onKill() {
    if (killPending) return
    setKillPending(true)
    try {
      await killAgentSession(sessionKey)
      toast(`${agentName} terminated`, { type: 'success' })
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to terminate agent', { type: 'error' })
    } finally {
      setKillPending(false)
      setMenuOpen(false)
    }
  }

  return (
    <>
      <button type="button" aria-label="Close live stream panel" className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-x-0 bottom-0 z-50 h-[70vh] rounded-t-2xl border-t border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 md:right-0 md:bottom-0 md:left-auto md:top-[var(--titlebar-h,0px)] md:h-auto md:w-[400px] md:rounded-none md:border-t-0 md:border-l">
        <div className="flex h-full min-h-0 flex-col">
          <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700 md:hidden" />
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${AGENT_COLOR_DOT_CLASS[agentColor] ?? 'bg-neutral-400'}`} />
                  <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{agentName}</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span>
                </div>
                <p className="mt-1 truncate text-xs text-neutral-500 dark:text-neutral-400">{model} · {sessionKey}</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800" aria-label="Close panel">×</button>
            </div>
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800"><span className="text-neutral-500 dark:text-neutral-400">Tokens</span><span className="font-medium text-neutral-800 dark:text-neutral-200">{inputTokens.toLocaleString()} / {outputTokens.toLocaleString()}</span></span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800"><span className="text-neutral-500 dark:text-neutral-400">Cost</span><span className="font-medium text-neutral-800 dark:text-neutral-200">{formatCost(totalCost)}</span></span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800"><span className="text-neutral-500 dark:text-neutral-400">Runtime</span><span className="font-medium text-neutral-800 dark:text-neutral-200">{formatRuntime(runtimeStart)}</span></span>
            </div>
          </div>
          <div ref={streamRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? <p className="text-xs text-neutral-500 dark:text-neutral-400">Waiting for messages...</p> : messages.map((message) => (
              <div key={message.id} className="rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900/40">
                <div className="mb-1 flex items-center justify-between gap-2"><span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${ROLE_BADGE_CLASS[message.role] ?? ROLE_BADGE_CLASS.assistant}`}>{message.role}</span><span className="text-[10px] text-neutral-500 dark:text-neutral-400">{formatAgo(message.timestamp)}</span></div>
                <p className={`whitespace-pre-wrap text-xs text-neutral-800 dark:text-neutral-200 ${message.role === 'tool' ? 'font-mono' : ''}`}>{message.text}</p>
              </div>
            ))}
          </div>
          <div className="sticky bottom-0 border-t border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/95">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setSteerOpen(true)} className="rounded-lg border border-neutral-200 px-2 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">Steer</button>
              <div className="relative">
                {menuOpen ? <div className="absolute bottom-full left-0 mb-2 w-full rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"><button type="button" onClick={() => void onPauseToggle()} disabled={pausePending} className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-60 dark:text-neutral-200 dark:hover:bg-neutral-800">{pausePending ? 'Updating...' : isPaused ? 'Resume' : 'Pause'}</button><button type="button" onClick={() => void onKill()} disabled={killPending} className="flex w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/40">{killPending ? 'Terminating...' : 'Kill'}</button></div> : null}
                <button type="button" onClick={() => setMenuOpen((open) => !open)} className="w-full rounded-lg border border-neutral-200 px-2 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">Pause/Kill</button>
              </div>
              <button type="button" onClick={() => { onClose(); void navigate({ to: '/chat/$sessionKey', params: { sessionKey } }) }} className="rounded-lg bg-accent-500 px-2 py-2 text-xs font-medium text-white hover:bg-accent-600">Open Chat</button>
            </div>
          </div>
        </div>
        <SteerModal open={steerOpen} onOpenChange={setSteerOpen} agentName={agentName} sessionKey={sessionKey} />
      </aside>
    </>
  )
}
