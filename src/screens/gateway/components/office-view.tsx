import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { AgentWorkingRow, AgentWorkingStatus } from './agents-working-panel'
import type { ModelPresetId } from './team-panel'
import { AGENT_ACCENT_COLORS, AgentAvatar } from './agent-avatar'

export type RemoteSession = {
  sessionKey: string
  label: string
  model?: string
  status: 'active' | 'idle' | 'done'
  startedAt: number
  kind: string
  lastMessage?: string
  tokenCount?: number
}

export type OfficeViewProps = {
  agentRows: AgentWorkingRow[]
  missionRunning: boolean
  onViewOutput: (agentId: string) => void
  onNewMission?: () => void
  selectedOutputAgentId?: string
  activeTemplateName?: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
  companyName?: string
  agentTasks?: Record<string, string>
  remoteSessions?: RemoteSession[]
  onViewRemoteOutput?: (sessionKey: string, label: string) => void
  /** Fixed pixel height for the office container (compact mode) */
  containerHeight?: number
}

export const OFFICE_MODEL_BADGE: Record<ModelPresetId, string> = {
  auto: 'rounded-full border border-neutral-200 bg-neutral-100 text-neutral-600',
  opus: 'border border-orange-200 bg-orange-50 text-orange-700',
  sonnet: 'border border-blue-200 bg-blue-50 text-blue-700',
  codex: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  flash: 'border border-violet-200 bg-violet-50 text-violet-700',
  minimax: 'border border-amber-200 bg-amber-50 text-amber-700',
  'pc1-coder': 'border border-cyan-200 bg-cyan-50 text-cyan-700',
  'pc1-planner': 'border border-indigo-200 bg-indigo-50 text-indigo-700',
  'pc1-critic': 'border border-purple-200 bg-purple-50 text-purple-700',
}

export const OFFICE_MODEL_LABEL: Record<ModelPresetId, string> = {
  auto: 'Auto',
  opus: 'Opus',
  sonnet: 'Sonnet',
  codex: 'Codex',
  flash: 'Flash',
  minimax: 'MiniMax',
  'pc1-coder': 'PC1 Coder',
  'pc1-planner': 'PC1 Planner',
  'pc1-critic': 'PC1 Critic',
}

const DEFAULT_OFFICE_MODEL_BADGE = 'border border-neutral-200 bg-neutral-50 text-neutral-700'
type OfficeLayoutTemplate = 'grid' | 'roundtable' | 'warroom'
type SocialSpotType = 'coffee' | 'water' | 'plant' | 'snack'
type SocialSpot = { x: number; y: number; type: SocialSpotType }

export function getOfficeModelBadge(modelId: string): string {
  return OFFICE_MODEL_BADGE[modelId as ModelPresetId] ?? DEFAULT_OFFICE_MODEL_BADGE
}

export function getOfficeModelLabel(modelId: string): string {
  if (!modelId) return 'Unknown'
  return OFFICE_MODEL_LABEL[modelId as ModelPresetId] ?? modelId.split('/')[1] ?? modelId
}

export function getAgentStatusMeta(status: AgentWorkingStatus): {
  label: string
  className: string
  dotClassName: string
  pulse?: boolean
} {
  switch (status) {
    case 'active': return { label: 'Active', className: 'text-emerald-600', dotClassName: 'bg-emerald-500', pulse: true }
    case 'ready':
    case 'idle': return { label: 'Idle', className: 'text-neutral-600', dotClassName: 'bg-neutral-400' }
    case 'error': return { label: 'Error', className: 'text-red-600', dotClassName: 'bg-red-500' }
    case 'none': return { label: 'Offline', className: 'text-neutral-400', dotClassName: 'bg-neutral-400' }
    case 'spawning': return { label: 'Starting', className: 'text-blue-600', dotClassName: 'bg-blue-500', pulse: true }
    case 'paused': return { label: 'Paused', className: 'text-amber-700', dotClassName: 'bg-amber-500' }
    default: return { label: String(status), className: 'text-neutral-600', dotClassName: 'bg-neutral-400' }
  }
}

const GRID_DESK_POSITIONS = [
  { x: 120, y: 180 }, { x: 310, y: 180 }, { x: 500, y: 180 }, { x: 690, y: 180 },
  { x: 120, y: 320 }, { x: 310, y: 320 }, { x: 500, y: 320 }, { x: 690, y: 320 },
  { x: 215, y: 460 }, { x: 405, y: 460 }, { x: 595, y: 460 }, { x: 785, y: 460 },
]

const ROUNDTABLE_DESK_POSITIONS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * 30 - 90) * Math.PI / 180
  const cx = 450
  const cy = 320
  const r = 240
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  }
})

const WARROOM_DESK_POSITIONS = [
  { x: 90, y: 200 }, { x: 228, y: 200 }, { x: 366, y: 200 },
  { x: 504, y: 200 }, { x: 642, y: 200 }, { x: 780, y: 200 },
  { x: 90, y: 420 }, { x: 228, y: 420 }, { x: 366, y: 420 },
  { x: 504, y: 420 }, { x: 642, y: 420 }, { x: 780, y: 420 },
]

const GRID_SOCIAL_SPOTS: SocialSpot[] = [
  { x: 880, y: 140, type: 'coffee' as const },
  { x: 880, y: 300, type: 'water' as const },
  { x: 60, y: 440, type: 'plant' as const },
  { x: 880, y: 460, type: 'snack' as const },
]

const ROUNDTABLE_SOCIAL_SPOTS: SocialSpot[] = [
  { x: 450, y: 320, type: 'plant' },
  { x: 510, y: 320, type: 'snack' },
  { x: 870, y: 120, type: 'coffee' },
  { x: 870, y: 480, type: 'water' },
]

const WARROOM_SOCIAL_SPOTS: SocialSpot[] = [
  { x: 56, y: 300, type: 'coffee' },
  { x: 56, y: 350, type: 'water' },
  { x: 904, y: 300, type: 'snack' },
  { x: 904, y: 350, type: 'plant' },
]

const DESK_POSITIONS_BY_TEMPLATE: Record<OfficeLayoutTemplate, Array<{ x: number; y: number }>> = {
  grid: GRID_DESK_POSITIONS,
  roundtable: ROUNDTABLE_DESK_POSITIONS,
  warroom: WARROOM_DESK_POSITIONS,
}

const SOCIAL_SPOTS_BY_TEMPLATE: Record<OfficeLayoutTemplate, SocialSpot[]> = {
  grid: GRID_SOCIAL_SPOTS,
  roundtable: ROUNDTABLE_SOCIAL_SPOTS,
  warroom: WARROOM_SOCIAL_SPOTS,
}

const LAYOUT_TEMPLATE_OPTIONS: Array<{ key: OfficeLayoutTemplate; label: string }> = [
  { key: 'grid', label: '⊞ Grid' },
  { key: 'roundtable', label: '○ Roundtable' },
  { key: 'warroom', label: '▬▬ War Room' },
]

function truncateSpeech(text: string, max = 64): string {
  const n = text.replace(/\s+/g, ' ').trim()
  if (!n) return ''
  return n.length <= max ? n : `${n.slice(0, max - 1).trimEnd()}…`
}

function getSpeechLine(agent: AgentWorkingRow, phase: number): string {
  if (agent.status === 'active' && agent.lastLine) return truncateSpeech(agent.lastLine, 60)
  if (agent.currentTask) return `Working on ${truncateSpeech(agent.currentTask, 48)}`
  if (agent.status === 'spawning') return 'Booting up...'
  if (agent.status === 'paused') return 'On break ☕'
  if (agent.status === 'error') return 'Need help!'
  // Idle agents cycle through social activities
  const socialLines = ['Grabbing coffee ☕', 'Checking messages 📱', 'Stretching 🙆', 'Chatting with team 💬', 'Reading docs 📖', 'Getting water 💧']
  if (agent.status === 'idle' || agent.status === 'ready') {
    return socialLines[Math.floor(phase / 4) % socialLines.length]
  }
  return ''
}

function getStatusDotClass(status: AgentWorkingStatus): string {
  switch (status) {
    case 'active': return 'bg-emerald-500'
    case 'idle': case 'ready': case 'none': return 'bg-neutral-400'
    case 'spawning': return 'bg-blue-500'
    case 'paused': return 'bg-amber-500'
    case 'error': return 'bg-red-500'
    default: return 'bg-neutral-400'
  }
}

function getAgentStatusGlowClass(status: AgentWorkingStatus): string {
  switch (status) {
    case 'active':
      return 'office-status-glow-active'
    case 'spawning':
      return 'office-status-glow-starting'
    case 'paused':
      return 'office-status-glow-paused'
    case 'error':
      return 'office-status-glow-error'
    default:
      return 'office-status-glow-idle'
  }
}

function getAgentStatusGlowColor(status: AgentWorkingStatus): string {
  switch (status) {
    case 'active':
      return '#10b981'
    case 'spawning':
      return '#3b82f6'
    case 'paused':
      return '#f59e0b'
    case 'error':
      return '#ef4444'
    default:
      return '#94a3b8'
  }
}

function truncateMonitorText(text: string, max = 30): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`
}

function getDeskMonitorText(agent: AgentWorkingRow, agentTaskTitle?: string): string {
  const taskTitle = agentTaskTitle?.trim()
  if (taskTitle) return truncateMonitorText(taskTitle, 30)
  if (agent.status === 'idle' || agent.status === 'ready') return 'Ready'
  return getAgentStatusMeta(agent.status).label
}

function getAgentEmoji(agent: AgentWorkingRow): string | null {
  const row = agent as AgentWorkingRow & { emoji?: string; avatarEmoji?: string }
  const emoji = row.emoji?.trim() || row.avatarEmoji?.trim()
  return emoji || null
}

// ── SVG Office Furniture ──

function DeskSVG({
  x,
  y,
  occupied,
  accent,
  monitorText,
  monitorGlow,
}: {
  x: number
  y: number
  occupied: boolean
  accent?: string
  monitorText?: string
  monitorGlow?: string
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* Desk surface */}
      <rect x="-40" y="-8" width="80" height="40" rx="4" fill={occupied ? '#f8fafc' : '#f1f5f9'} fillOpacity={occupied ? 0.78 : 0.7} stroke={occupied ? '#dbe4ee' : '#e6edf5'} strokeWidth="1" />
      {/* Desk legs */}
      <rect x="-36" y="32" width="4" height="16" rx="1" fill="#a7b4c6" />
      <rect x="32" y="32" width="4" height="16" rx="1" fill="#a7b4c6" />
      {/* Monitor */}
      {occupied ? (
        <>
          <rect x="-20" y="-30" width="40" height="24" rx="3" fill={monitorGlow || '#3b82f6'} opacity="0.2" />
          <rect x="-18" y="-28" width="36" height="22" rx="3" fill="#0f172a" />
          <rect x="-15" y="-25" width="30" height="16" rx="1.5" fill="#111827" stroke={monitorGlow || accent || '#3b82f6'} strokeWidth="0.9" />
          {monitorText ? (
            <text
              x="0"
              y="-14.8"
              fontSize="4.2"
              fill="#e2e8f0"
              textAnchor="middle"
              fontWeight="600"
            >
              {monitorText}
            </text>
          ) : null}
          <rect x="-3" y="-6" width="6" height="6" rx="1" fill="#64748b" />
        </>
      ) : (
        <>
          <rect x="-18" y="-28" width="36" height="22" rx="3" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1" />
          <rect x="-3" y="-6" width="6" height="6" rx="1" fill="#cbd5e1" />
        </>
      )}
      {/* Chair */}
      <ellipse cx="0" cy="56" rx="14" ry="6" fill={occupied ? (accent ? `${accent}22` : '#dbeafe') : '#f1f5f9'} />
      <rect x="-10" y="48" width="20" height="10" rx="4" fill={occupied ? '#475569' : '#cbd5e1'} />
    </g>
  )
}

function CoffeeMachineSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-20" y="-30" width="40" height="50" rx="5" fill="#78716c" />
      <rect x="-14" y="-24" width="28" height="20" rx="3" fill="#292524" />
      <circle cx="0" cy="-14" r="6" fill="#dc2626" opacity="0.8" />
      <text x="0" y="-11" fontSize="6" fill="white" textAnchor="middle">☕</text>
      <rect x="-16" y="20" width="32" height="6" rx="2" fill="#a8a29e" />
      <text x="0" y="38" fontSize="8" fill="#78716c" textAnchor="middle">Coffee</text>
    </g>
  )
}

function WaterCoolerSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-14" y="-20" width="28" height="40" rx="4" fill="#e2e8f0" stroke="#cbd5e1" />
      <circle cx="0" cy="-26" r="10" fill="#bfdbfe" stroke="#93c5fd" strokeWidth="1.5" />
      <circle cx="-5" cy="0" r="2" fill="#0ea5e9" />
      <circle cx="5" cy="0" r="2" fill="#ef4444" />
      <text x="0" y="32" fontSize="8" fill="#64748b" textAnchor="middle">Water</text>
    </g>
  )
}

function SnackBarSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-24" y="-16" width="48" height="28" rx="4" fill="#fef3c7" stroke="#fbbf24" strokeWidth="1" />
      <text x="0" y="2" fontSize="14" textAnchor="middle">🍪</text>
      <text x="0" y="24" fontSize="8" fill="#92400e" textAnchor="middle">Snacks</text>
    </g>
  )
}

function PlantSVG({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-10" y="6" width="20" height="14" rx="3" fill="#92400e" />
      <circle cx="0" cy="-4" r="14" fill="#16a34a" opacity="0.9" />
      <circle cx="-8" cy="0" r="8" fill="#22c55e" opacity="0.8" />
      <circle cx="8" cy="2" r="7" fill="#15803d" opacity="0.8" />
    </g>
  )
}

function formatRuntime(startedAt: number, tokenCount?: number): string {
  const diffMs = Date.now() - startedAt
  let time: string
  if (diffMs < 60_000) {
    time = `${Math.floor(diffMs / 1000)}s`
  } else {
    const mins = Math.floor(diffMs / 60_000)
    time = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`
  }
  const tokens = typeof tokenCount === 'number' ? tokenCount : 0
  return `${time} · ${tokens}t`
}

function kindLabel(kind: string): string {
  if (kind === 'subagent' || kind === 'sub-agent') return 'Sub-Agent'
  if (kind === 'main') return 'Main'
  if (kind === 'chat') return 'Chat'
  return kind.charAt(0).toUpperCase() + kind.slice(1)
}

function RemoteSessionCard({ session, onClick }: { session: RemoteSession; onClick: () => void }) {
  const statusColor = session.status === 'active'
    ? 'bg-emerald-400 animate-pulse'
    : session.status === 'done'
      ? 'bg-neutral-300 dark:bg-neutral-600'
      : 'bg-amber-400'

  const badgeColorClass = session.kind === 'main'
    ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400 border-violet-200 dark:border-violet-800'
    : session.kind === 'subagent' || session.kind === 'sub-agent'
      ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
      : 'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200 dark:border-blue-800'

  const modelDisplay = session.model
    ? session.model.split('/').pop()?.replace(/:latest$/, '') ?? null
    : null

  const lastMessageSnippet = session.lastMessage
    ? session.lastMessage.length > 60
      ? `${session.lastMessage.slice(0, 60)}…`
      : session.lastMessage
    : null

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-11 flex-col items-center gap-1.5 rounded-xl border border-neutral-200 bg-white p-3 text-center transition-all hover:border-accent-500 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-800"
    >
      <div className="relative">
        <div className="h-8 w-8 rounded-full bg-neutral-100 dark:bg-neutral-700 flex items-center justify-center text-lg">
          🤖
        </div>
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-neutral-800', statusColor)} />
      </div>
      <span className="w-full truncate text-sm font-semibold text-neutral-800 dark:text-neutral-200">
        {session.label}
      </span>
      {modelDisplay ? (
        <span className="w-full truncate text-xs text-neutral-400">
          {modelDisplay}
        </span>
      ) : null}
      {lastMessageSnippet ? (
        <span className="w-full truncate text-xs italic text-neutral-500 dark:text-neutral-400">
          {lastMessageSnippet}
        </span>
      ) : null}
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest', badgeColorClass)}>
          {kindLabel(session.kind)}
        </span>
        {session.startedAt ? (
          <span className="text-xs text-neutral-400 tabular-nums">
            {formatRuntime(session.startedAt, session.tokenCount)}
          </span>
        ) : null}
      </div>
    </button>
  )
}

export function OfficeView({
  agentRows,
  missionRunning,
  onViewOutput,
  onNewMission,
  selectedOutputAgentId,
  activeTemplateName: _activeTemplateName,
  companyName = 'Mission Control',
  agentTasks = {},
  remoteSessions = [],
  onViewRemoteOutput,
  containerHeight,
}: OfficeViewProps) {
  // When containerHeight is set, we use compact mode: header only (no footer), SVG fills remaining space
  const compact = Boolean(containerHeight)
  const [tick, setTick] = useState(0)
  const [layoutPickerOpen, setLayoutPickerOpen] = useState(false)
  const [remoteCollapsed, setRemoteCollapsed] = useState(true)
  const [layoutTemplate, setLayoutTemplate] = useState<OfficeLayoutTemplate>(() => {
    if (typeof window === 'undefined') return 'grid'
    const saved = window.localStorage.getItem('clawsuite:office-layout')
    return saved === 'roundtable' || saved === 'warroom' || saved === 'grid' ? saved : 'grid'
  })

  const deskPositions = DESK_POSITIONS_BY_TEMPLATE[layoutTemplate]
  const socialSpots = SOCIAL_SPOTS_BY_TEMPLATE[layoutTemplate]
  const socialLabelPosition = layoutTemplate === 'roundtable'
    ? { x: 450, y: 108, text: 'Collaboration Ring' }
    : layoutTemplate === 'warroom'
      ? { x: 480, y: 112, text: 'Briefing Lounge' }
      : { x: 880, y: 110, text: 'Break Area' }

  const changeLayout = (nextTemplate: OfficeLayoutTemplate) => {
    setLayoutTemplate(nextTemplate)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('clawsuite:office-layout', nextTemplate)
    }
  }

  // Close layout picker on outside click
  useEffect(() => {
    if (!layoutPickerOpen) return
    function onDown(e: MouseEvent) {
      const target = e.target as Element
      if (!target.closest('[data-layout-picker]')) {
        setLayoutPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [layoutPickerOpen])

  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 200)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (remoteSessions.length > 0) {
      setRemoteCollapsed(false)
    }
  }, [remoteSessions.length])

  if (agentRows.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', compact ? 'h-full' : 'min-h-[320px]')}>
        <div className="text-center">
          <p className="mb-3 text-4xl">🏢</p>
          <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">Empty office</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Add agents in Configure to fill the office.</p>
        </div>
      </div>
    )
  }

  const sceneW = 960
  const sceneH = 560
  const activeCount = agentRows.filter((r) => r.status === 'active').length
  const sessionCount = agentRows.filter((r) => Boolean(r.sessionKey)).length
  const phase = tick * 0.2

  // Assign agents to desks, idle agents wander to social spots
  const agentPositions = agentRows.map((agent, index) => {
    const desk = deskPositions[index % deskPositions.length]
    const isIdle = agent.status === 'idle' || agent.status === 'ready'
    const isPaused = agent.status === 'paused'

    // Idle/paused agents wander between desk and social spots
    if (isIdle || isPaused) {
      const wanderCycle = Math.floor((tick + index * 17) / 25) % 4 // 0=desk, 1=walking, 2=social, 3=walking back
      const socialSpot = socialSpots[(index + Math.floor(tick / 60)) % socialSpots.length]
      const t = ((tick + index * 17) % 25) / 25

      if (wanderCycle === 0) {
        // At desk
        return { x: desk.x, y: desk.y - 20, atDesk: true, stationary: true }
      } else if (wanderCycle === 1) {
        // Walking to social spot
        return {
          x: desk.x + (socialSpot.x - desk.x) * t,
          y: desk.y - 20 + (socialSpot.y - desk.y + 10) * t,
          atDesk: false,
          stationary: false,
        }
      } else if (wanderCycle === 2) {
        // At social spot
        const bob = Math.sin(phase + index) * 2
        return { x: socialSpot.x + (index % 2 === 0 ? -20 : 20), y: socialSpot.y + bob, atDesk: false, stationary: true }
      } else {
        // Walking back
        const socialSpotBack = socialSpots[(index + Math.floor(tick / 60)) % socialSpots.length]
        return {
          x: socialSpotBack.x + (desk.x - socialSpotBack.x) * t,
          y: socialSpotBack.y + (desk.y - 20 - socialSpotBack.y) * t,
          atDesk: false,
          stationary: false,
        }
      }
    }

    // Active/spawning agents stay at desk
    return { x: desk.x, y: desk.y - 20, atDesk: true, stationary: true }
  })

  return (
    <div className={cn('flex flex-col bg-gradient-to-b from-slate-50 to-neutral-100 dark:from-slate-900 dark:to-slate-800', compact ? 'h-full' : 'min-h-[480px]')}>
      {/* Header bar */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-neutral-200 bg-white/80 px-5 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base font-bold text-neutral-900 dark:text-white">ClawSuite Office</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:text-neutral-400 tabular-nums">{agentRows.length} agents</span>
            <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">{activeCount} working</span>
            <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400 tabular-nums">{sessionCount} sessions</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {missionRunning ? (
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Mission Live
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onNewMission?.()}
            className="min-h-11 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600 sm:px-4 sm:py-2 sm:text-sm"
          >
            + New Mission
          </button>
        </div>
      </div>

      {/* Mobile: compact list instead of desk grid */}
      <div className="flex-1 overflow-y-auto p-3 md:hidden">
        <div className="space-y-2">
          {agentRows.map((agent, index) => {
            const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
            const statusMeta = getAgentStatusMeta(agent.status)
            const emoji = getAgentEmoji(agent)
            return (
              <button
                key={`${agent.id}-mobile`}
                type="button"
                onClick={() => onViewOutput(agent.id)}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900/70"
              >
                <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', accent.avatar)}>
                  {emoji ? (
                    <span className="text-base leading-none" aria-hidden>{emoji}</span>
                  ) : (
                    <AgentAvatar index={index % 10} color={accent.hex} size={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{agent.name}</p>
                  <p className="truncate text-xs text-neutral-500 dark:text-slate-400">{getOfficeModelLabel(agent.modelId)}</p>
                </div>
                <span className={cn('shrink-0 text-xs font-semibold', statusMeta.className)}>{statusMeta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop office canvas — layout picker (pencil icon) */}
      <div className="hidden shrink-0 justify-end px-3 pb-1 pt-2 md:flex">
        <div className="relative" data-layout-picker>
          <button
            type="button"
            onClick={() => setLayoutPickerOpen((v) => !v)}
            className="inline-flex min-h-11 items-center rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-neutral-300 dark:hover:bg-slate-700 sm:px-4 sm:py-2 sm:text-sm"
            title="Change office layout"
          >
            <span>✏️</span>
          </button>
          {layoutPickerOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
              {LAYOUT_TEMPLATE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { changeLayout(opt.key); setLayoutPickerOpen(false) }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-neutral-50 dark:hover:bg-slate-800',
                    layoutTemplate === opt.key
                      ? 'font-medium text-accent-600'
                      : 'text-neutral-700 dark:text-slate-300',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={cn('relative hidden flex-1 md:flex', !compact && 'min-h-[440px]')}>
        <style>{`
          @keyframes office-idle-float {
            0%, 100% { transform: translateY(-3px); }
            50% { transform: translateY(3px); }
          }
          @keyframes office-status-glow-green {
            0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.38), 0 0 14px 2px rgba(16, 185, 129, 0.3); }
            50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0), 0 0 22px 6px rgba(16, 185, 129, 0.38); }
          }
          @keyframes office-status-glow-amber {
            0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.32), 0 0 12px 2px rgba(245, 158, 11, 0.26); }
            50% { box-shadow: 0 0 0 7px rgba(245, 158, 11, 0), 0 0 18px 4px rgba(245, 158, 11, 0.34); }
          }
          @keyframes office-status-glow-blue {
            0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3), 0 0 12px 2px rgba(59, 130, 246, 0.25); }
            50% { box-shadow: 0 0 0 7px rgba(59, 130, 246, 0), 0 0 18px 4px rgba(59, 130, 246, 0.32); }
          }
          @keyframes office-status-glow-neutral {
            0%, 100% { box-shadow: 0 0 0 0 rgba(115, 115, 115, 0.18), 0 0 10px 2px rgba(115, 115, 115, 0.2); }
            50% { box-shadow: 0 0 0 6px rgba(115, 115, 115, 0), 0 0 14px 3px rgba(115, 115, 115, 0.24); }
          }
          @keyframes office-status-glow-red {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.34), 0 0 12px 2px rgba(239, 68, 68, 0.3); }
            50% { box-shadow: 0 0 0 7px rgba(239, 68, 68, 0), 0 0 19px 5px rgba(239, 68, 68, 0.36); }
          }
          .office-agent-stationary {
            animation: office-idle-float 3s ease-in-out infinite;
          }
          .office-status-glow-active {
            animation: office-status-glow-green 2.2s ease-in-out infinite;
          }
          .office-status-glow-idle {
            animation: office-status-glow-neutral 2.6s ease-in-out infinite;
          }
          .office-status-glow-starting {
            animation: office-status-glow-blue 2.4s ease-in-out infinite;
          }
          .office-status-glow-paused {
            animation: office-status-glow-amber 2.6s ease-in-out infinite;
          }
          .office-status-glow-error {
            animation: office-status-glow-red 2.2s ease-in-out infinite;
          }
        `}</style>

        {/* Floor pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,0.35) 1px, transparent 0)',
            backgroundSize: '26px 26px',
          }}
        />

        <svg
          viewBox={`0 0 ${sceneW} ${sceneH}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          {/* Floor zones */}
          <rect x="80" y="140" width="680" height="420" rx="16" fill="#f8fafc" fillOpacity="0.34" stroke="#e4ecf4" strokeWidth="0.8" className="dark:fill-slate-800/20 dark:stroke-slate-700/60" />

          {/* Social zone labels */}
          <text x={socialLabelPosition.x} y={socialLabelPosition.y} fontSize="9" fill="#94a3b8" textAnchor="middle" fontWeight="600" className="uppercase">{socialLabelPosition.text}</text>

          {/* Furniture */}
          {socialSpots.map((spot, i) => (
            spot.type === 'coffee' ? <CoffeeMachineSVG key={i} x={spot.x} y={spot.y} /> :
            spot.type === 'water' ? <WaterCoolerSVG key={i} x={spot.x} y={spot.y} /> :
            spot.type === 'snack' ? <SnackBarSVG key={i} x={spot.x} y={spot.y} /> :
            <PlantSVG key={i} x={spot.x} y={spot.y} />
          ))}

          {/* Extra plants */}
          <PlantSVG x={60} y={160} />
          <PlantSVG x={60} y={560} />

          {/* All desks (empty ones too) */}
          {deskPositions.map((desk, i) => {
            const occupied = i < agentRows.length
            const accent = occupied ? AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length] : undefined
            const agent = occupied ? agentRows[i] : undefined
            const monitorText = agent ? getDeskMonitorText(agent, agentTasks[agent.id]) : undefined
            const monitorGlow = agent ? getAgentStatusGlowColor(agent.status) : undefined
            return (
              <g
                key={`desk-${i}`}
                className="transition-all duration-500"
                style={{
                  transform: `translate(${desk.x}px, ${desk.y}px)`,
                  transition: 'transform 0.5s ease-in-out',
                }}
              >
                <DeskSVG
                  x={0}
                  y={0}
                  occupied={occupied}
                  accent={accent?.hex}
                  monitorText={monitorText}
                  monitorGlow={monitorGlow}
                />
              </g>
            )
          })}
        </svg>

        {/* Office whiteboard */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <div className="rounded-md border border-neutral-300/90 bg-[#fdfdf8] px-4 py-2 shadow-[0_2px_8px_rgba(15,23,42,0.15)]">
            <span className="block whitespace-nowrap text-center text-sm font-bold tracking-wide text-neutral-800 [font-family:'Bradley_Hand','Marker_Felt','Comic_Sans_MS',cursive]">
              {companyName}
            </span>
          </div>
        </div>

        {/* Agent avatars (HTML overlay for interactivity) */}
        {agentRows.map((agent, index) => {
          const accent = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
          const pos = agentPositions[index]
          const emoji = getAgentEmoji(agent)
          const isSelected = agent.id === selectedOutputAgentId
          const isActive = agent.status === 'active'
          const isIdle = agent.status === 'idle' || agent.status === 'ready'
          const statusMeta = getAgentStatusMeta(agent.status)
          const speechLine = getSpeechLine(agent, tick + index * 7)
          const showSpeech = Boolean(speechLine) && ((tick + index * 3) % 8 < 6)
          const movementTransform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`

          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onViewOutput(agent.id)}
              className={cn(
                'group absolute z-10 flex flex-col items-center rounded-xl bg-transparent px-1.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
                isSelected && 'ring-2 ring-accent-300/80',
              )}
              style={{
                left: 0,
                top: 0,
                transform: movementTransform,
                transition: 'transform 0.8s ease-in-out',
              }}
              title={`${agent.name} · ${statusMeta.label}`}
            >
              {/* Speech bubble */}
              {showSpeech ? (
                <span className="pointer-events-none relative mb-2 max-w-[180px] rounded-lg bg-white px-3 py-1.5 text-xs leading-snug text-neutral-700 shadow-lg dark:bg-slate-800 dark:text-slate-200">
                  <span className="block truncate">{speechLine}</span>
                  <span className="absolute left-1/2 top-full h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-white dark:bg-slate-800" />
                </span>
              ) : null}

              {/* Avatar */}
              <div
                className={cn(
                  'relative rounded-full transition-transform duration-300 group-hover:scale-105',
                  getAgentStatusGlowClass(agent.status),
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center rounded-full bg-transparent',
                    pos.stationary && 'office-agent-stationary',
                  )}
                  style={{ width: isActive ? 46 : 40, height: isActive ? 46 : 40 }}
                >
                  {emoji ? (
                    <span className="select-none leading-none" style={{ fontSize: isActive ? 30 : 26 }} aria-hidden>
                      {emoji}
                    </span>
                  ) : (
                    <AgentAvatar
                      index={index % 10}
                      color={accent.hex}
                      size={isActive ? 44 : 38}
                    />
                  )}
                </div>
                {/* Status dot */}
                <span className={cn(
                  'absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-white dark:border-slate-800',
                  getStatusDotClass(agent.status),
                  statusMeta.pulse && 'animate-pulse',
                )} />
              </div>

              {/* Activity indicator */}
              {isActive ? (
                <span className="mt-1 flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  <span className="size-1 animate-pulse rounded-full bg-emerald-500" />
                  <span className="size-1 animate-pulse rounded-full bg-emerald-500 [animation-delay:120ms]" />
                  <span className="size-1 animate-pulse rounded-full bg-emerald-500 [animation-delay:240ms]" />
                  <span className="ml-0.5">Working</span>
                </span>
              ) : isIdle && !pos.atDesk ? (
                <span className="mt-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                  On break
                </span>
              ) : null}

              {/* Name + model */}
              <span className="mt-1 max-w-full truncate text-[10px] font-semibold text-neutral-800 dark:text-white">{agent.name}</span>
              <span className="max-w-full truncate text-xs text-neutral-500 dark:text-slate-400">{getOfficeModelLabel(agent.modelId)}</span>
            </button>
          )
        })}
      </div>

      {remoteSessions.length > 0 ? (
        <div className="border-t border-neutral-200 dark:border-neutral-700 p-3">
          <button
            type="button"
            onClick={() => setRemoteCollapsed((prev) => !prev)}
            className="mb-2 flex w-full items-center justify-between px-1 text-left"
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Remote Sessions
            </p>
            <span className="text-[10px] text-neutral-400">{remoteCollapsed ? 'Show' : 'Hide'}</span>
          </button>
          {!remoteCollapsed ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {remoteSessions.map((session) => (
                <RemoteSessionCard
                  key={session.sessionKey}
                  session={session}
                  onClick={() => onViewRemoteOutput?.(session.sessionKey, session.label)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Footer — hidden in compact mode */}
      {!compact ? (
        <div className="hidden items-center justify-between border-t border-neutral-200 bg-white/80 px-4 py-2 text-xs text-neutral-500 backdrop-blur dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400 md:flex">
          <span>{agentRows.length}/{deskPositions.length} desks occupied</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Working</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-neutral-400" /> Idle</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" /> Error</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-neutral-400" /> Empty</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
