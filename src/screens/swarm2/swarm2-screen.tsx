'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlarmClockIcon,
  CpuIcon,
  MessageMultiple01Icon,
} from '@hugeicons/core-free-icons'
import type { CrewMember } from '@/hooks/use-crew-status'
import { getOnlineStatus, useCrewStatus } from '@/hooks/use-crew-status'
import { OperationalWorkerCard } from './operational-worker-card'
import { Swarm2OrchestratorCard } from './swarm2-orchestrator-card'
import { Swarm2Wires } from './swarm2-wires'
import { Swarm2ActivityFeed } from './swarm2-activity-feed'
import { Swarm2KanbanBoard } from './swarm2-kanban-board'
import { Swarm2ReportsView, buildSwarm2InboxLanes, type Swarm2InboxItem } from './swarm2-reports-view'
import { RouterChat } from '@/components/swarm/router-chat'
import { SwarmTerminal } from '@/components/swarm/swarm-terminal'
import { cn } from '@/lib/utils'

const SWARM2_ROOM_STORAGE_KEY = 'hermes-swarm2-room-v1'

const SWARM2_OPERATION_THEME: CSSProperties = {
  ['--theme-bg' as string]: 'var(--color-surface)',
  ['--theme-card' as string]: 'var(--color-primary-50)',
  ['--theme-card2' as string]: 'var(--color-primary-100)',
  ['--theme-border' as string]: 'var(--color-primary-200)',
  ['--theme-border2' as string]: 'var(--color-primary-400)',
  ['--theme-text' as string]: 'var(--color-ink)',
  ['--theme-muted' as string]: 'var(--color-primary-700)',
  ['--theme-muted-2' as string]: 'var(--color-primary-600)',
  ['--theme-accent' as string]: 'var(--color-accent-500)',
  ['--theme-accent-strong' as string]: 'var(--color-accent-600)',
  ['--theme-accent-soft' as string]: 'color-mix(in srgb, var(--color-accent-500) 12%, transparent)',
  ['--theme-accent-soft-strong' as string]: 'color-mix(in srgb, var(--color-accent-500) 18%, transparent)',
  ['--theme-shadow' as string]: 'color-mix(in srgb, var(--color-primary-950) 14%, transparent)',
  ['--theme-danger' as string]: 'var(--color-red-600, #dc2626)',
  ['--theme-danger-soft' as string]: 'color-mix(in srgb, var(--theme-danger) 12%, transparent)',
  ['--theme-danger-border' as string]: 'color-mix(in srgb, var(--theme-danger) 35%, white)',
  ['--theme-warning' as string]: 'var(--color-amber-600, #d97706)',
  ['--theme-warning-soft' as string]: 'color-mix(in srgb, var(--theme-warning) 12%, transparent)',
  ['--theme-warning-border' as string]: 'color-mix(in srgb, var(--theme-warning) 35%, white)',
}

export const SWARM2_INFORMATION_HIERARCHY = [
  'Status header: online workers, active room, refresh state, view switch.',
  'Aurora/orchestrator hub card: top-center primary routing hub with aggregate state and router affordance.',
  'Visible routing wires: subdued connection lines from Aurora to every worker, highlighted for selected and wired room nodes.',
  'Operations-style worker node cards: role, state, current task, last useful signal, direct inline chat/action affordances.',
  'Minimal attention rail: only auth, worker availability, room count, selected runtime metadata.',
  'Central bottom router chat: orchestration brain for auto/manual/broadcast dispatch.',
  'Kanban view: manual planning lanes for backlog, ready, running, review, blocked, and done.',
  'Runtime view: side-by-side tmux terminals for selected room workers or the focused worker.',
] as const

export const SWARM2_SURFACE_CONTRACT = {
  route: '/swarm2',
  keepsLegacySwarmRoute: true,
  primarySurface: 'orchestrator-card-topology',
  workerSurface: 'operations-card-patterns',
  connectionLayer: 'visible-routing-wires',
  alternateSurface: 'runtime-tmux',
  routerPlacement: 'bottom-center',
  cardInlineChat: true,
  routerDefaultOpen: false,
  heartbeatOrchestration: 'main-session loop processes checkpoints and prompts review/continue decisions',
} as const

export const SWARM2_OPERATIONS_REUSE = [
  'centered-card-header-with-status-dot',
  'agent-progress-avatar-stack',
  'compact-operational-metadata-panel',
  'inline-direct-chat-panel',
  'bottom-card-action-row',
] as const

export const SWARM2_CARD_DENSITY_CONTRACT = {
  defaultView: 'cards',
  runtimeView: 'separate-mode',
  workerCardMinHeightRem: 30,
  laptopGridColumns: 2,
  duplicateEmptyStates: false,
} as const

export const SWARM2_REAL_API_ENDPOINTS = [
  '/api/crew-status',
  '/api/swarm-environment',
  '/api/swarm-runtime',
  '/api/swarm-missions',
  '/api/swarm-roster',
  '/api/integrations',
  '/api/swarm-health',
  '/api/swarm-decompose',
  '/api/swarm-dispatch',
  '/api/swarm-tmux-start',
  '/api/swarm-tmux-stop',
  '/api/swarm-tmux-scroll',
  '/api/terminal-stream',
  '/api/terminal-input',
  '/api/terminal-resize',
  '/api/terminal-close',
] as const

type TerminalKind = 'tmux' | 'log-tail' | 'shell' | 'none'

type RuntimeArtifact = {
  id: string
  kind: 'file' | 'diff' | 'patch' | 'build' | 'log' | 'report' | 'preview'
  label: string
  path?: string | null
  workerId?: string
  updatedAt?: number | null
  source?: 'runtime' | 'workspace' | 'plugin' | 'inferred'
  sizeBytes?: number | null
  contentType?: string | null
}

type RuntimePreview = {
  id: string
  label: string
  url: string
  source?: 'detected-port' | 'plugin' | 'runtime'
  status?: 'ready' | 'unknown' | 'down'
  workerId?: string
  updatedAt?: number | null
}

type RuntimeEntry = {
  workerId: string
  displayName?: string | null
  role?: string | null
  currentTask: string | null
  recentLogTail: string | null
  pid: number | null
  startedAt: number | null
  lastOutputAt: number | null
  cwd: string | null
  phase?: string | null
  lastSummary?: string | null
  lastResult?: string | null
  blockedReason?: string | null
  checkpointStatus?: string | null
  needsHuman?: boolean | null
  assignedTaskCount?: number | null
  cronJobCount?: number | null
  tmuxSession: string | null
  tmuxAttachable: boolean
  logPath?: string | null
  terminalKind?: TerminalKind
  lastSessionStartedAt?: number | null
  source?: 'runtime.json' | 'fallback'
  artifacts?: Array<RuntimeArtifact>
  previews?: Array<RuntimePreview>
}

type HealthData = {
  workspaceModel: string | null
  summary: {
    totalWorkers: number
    totalAuthErrors24h: number
    distinctProviders: Array<string>
  }
}


type SwarmRosterWorker = {
  id: string
  name: string
  role: string
  specialty?: string
  model?: string
  mission?: string
  skills?: Array<string>
  capabilities?: Array<string>
  defaultCwd?: string
  preferredTaskTypes?: Array<string>
  maxConcurrentTasks?: number
  acceptsBroadcast?: boolean
  reviewRequired?: boolean
}

type SwarmRosterResponse = {
  ok?: boolean
  roster?: { workers?: Array<SwarmRosterWorker> }
}

type SwarmMissionSummary = {
  id: string
  title: string
  state: string
  assignments?: Array<{
    id?: string
    state: string
    task?: string
    workerId?: string
    reviewRequired?: boolean
    completedAt?: number | null
    dispatchedAt?: number | null
    checkpoint?: {
      stateLabel?: string | null
      checkpointStatus?: string | null
      runtimeState?: string | null
      filesChanged?: string | null
      commandsRun?: string | null
      result?: string | null
      blocker?: string | null
      nextAction?: string | null
    } | null
  }>
  updatedAt: number
}

type SwarmMissionsResponse = {
  ok?: boolean
  missions?: Array<SwarmMissionSummary>
}

type ViewMode = 'cards' | 'kanban' | 'runtime' | 'reports'

type RolePreset = {
  role: string
  specialty: string
  mission: string
  systemPrompt: string
  skills: Array<string>
  defaultModel?: string
}

const ROLE_PRESETS: ReadonlyArray<RolePreset> = [
  {
    role: 'Orchestrator',
    specialty: 'control-plane state, dispatch, drift detection, escalation',
    mission: 'Run the swarm. Read /swarm-specs/ at start. Dispatch workers per their standing missions. Detect drift, re-prompt, escalate to main agent when stuck.',
    systemPrompt: 'You are the Project Agent orchestrator for the swarm. Read /swarm-specs/SWARM_SPEC.md and /swarm-specs/projects/swarmN.md for every worker before dispatching. Apply the swarm-orchestrator skill: assign work, request proof-bearing checkpoints, detect drift, re-prompt with stronger framing, escalate when blocked. Never make irreversible external actions without main-agent ack.',
    skills: ['swarm-orchestrator', 'swarm-worker-core', 'swarm-review-learning-loop', 'self-improvement'],
    defaultModel: 'GPT-5.4',
  },
  {
    role: 'Builder',
    specialty: 'full-stack implementation, fast ship cycles',
    mission: 'Implement features per dispatched briefs. Smallest landed artifact first. Tests + build + smoke before checkpoint.',
    systemPrompt: 'You are a senior builder. Ship working code. Always read the brief, plan smallest landed artifact, implement, run tests + build + smoke, commit (not push), checkpoint with proof.',
    skills: ['swarm-worker-core', 'byte-verified-code-review'],
    defaultModel: 'GPT-5.5',
  },
  {
    role: 'Reviewer',
    specialty: 'byte-verified code review, naming + tests + build gate',
    mission: 'No PR ships without you. Verify diff, byte-check naming, run tests/build/smoke, verdict APPROVED/CHANGES_REQUESTED/BLOCKED.',
    systemPrompt: 'You are the merge gate. For every PR: pull branch, read diff, xxd byte-check naming-sensitive areas, run tests, run build, smoke test. Verdict APPROVED routes to main agent for merge ack. Never merge yourself.',
    skills: ['swarm-worker-core', 'byte-verified-code-review', 'swarm-review-learning-loop'],
    defaultModel: 'GPT-5.4',
  },
  {
    role: 'Triage',
    specialty: 'autonomous PR/issues processor',
    mission: 'Score open issues every 4h, repro top-1, fix branch + tests + PR, request review. Never merge or close.',
    systemPrompt: 'You are the issues/PRs autopilot. Every 4h: gh issue list per repo, score by Impact x Tractability x (1 + locally-tested), pick top-1 unassigned, repro, fix branch, push, gh pr create, request reviewer. Never merge, never close, always escalate to main agent for greenlight.',
    skills: ['swarm-worker-core', 'byte-verified-code-review', 'swarm-review-learning-loop'],
    defaultModel: 'GPT-5.5',
  },
  {
    role: 'Lab',
    specialty: 'local-model R&D, spec-dec, benchmarking',
    mission: 'Run autonomous lab loop. Test new model pulls. Wire spec-dec/DFlash/TurboQuant. Push tk/s + quality. Document every experiment.',
    systemPrompt: 'You are the local-model lab. Read /swarm-specs/projects/lane-c-lab.md. Iterate experiments from open hypothesis space. Log to lab-loop-runs.jsonl. Escalate breakthroughs (>=10% tk/s) and install requests to main agent.',
    skills: ['swarm-worker-core', 'pc1-ollama-gguf-bench', 'swarm-bench-worker'],
    defaultModel: 'GPT-5.4',
  },
  {
    role: 'Sage',
    specialty: 'research + scripts + X content + creative briefs',
    mission: 'Research what matters. Draft scripts, X content, briefs. Cite sources. Never post externally without ack.',
    systemPrompt: 'You are the research/content scout. Find angles, write scripts and drafts, always cite sources. Never post X/Discord/blog without main-agent ack — always draft + escalate.',
    skills: ['swarm-worker-core', 'last30days', 'pdf-and-paper-deep-reading'],
    defaultModel: 'GPT-5.5',
  },
  {
    role: 'Scribe',
    specialty: 'docs, skills hygiene, memory curation',
    mission: 'Keep docs current. Hygiene the skills folder. Curate memory. Write submission/release copy.',
    systemPrompt: 'You are the source-of-truth keeper. Audit /skills/ every 12h, flag stale/unused/poorly-documented. Maintain SWARM_SPEC and worker specs as system evolves. Draft READMEs and changelogs.',
    skills: ['swarm-worker-core', 'last30days', 'creative-writing'],
    defaultModel: 'GPT-5.5',
  },
  {
    role: 'Foundation',
    specialty: 'infra, repair playbook, autopilot wiring',
    mission: 'Keep the swarm running. Apply repair playbook. Wire autopilot. Maintain loop infra.',
    systemPrompt: 'You are infrastructure. Maintain /swarm-specs/playbooks/auto-repair.yaml. Health-check tmux sessions, autopilot tick, dev server. Apply known fixes; escalate novel failures.',
    skills: ['swarm-worker-core'],
    defaultModel: 'GPT-5.4',
  },
  {
    role: 'QA',
    specialty: 'regression QA, render verification',
    mission: 'Run regression suite on every commit + render. Block bad ships.',
    systemPrompt: 'You are QA. On commit: full test suite. On render: ffprobe + tone consistency + pacing. Verdict PASS/FAIL/FLAKY with evidence.',
    skills: ['swarm-worker-core', 'byte-verified-code-review'],
    defaultModel: 'GPT-5.4',
  },
  {
    role: 'Mirror Integrations',
    specialty: 'asset packs, upstream sync',
    mission: 'Generate assets. Watch upstream. Pack integrations.',
    systemPrompt: 'You produce assets and watch upstream. Generate art/audio per Lane A. Every 12h diff upstream Project Agent main, surface portable items. Never cross-org PR without ack.',
    skills: ['swarm-worker-core', 'claude-promo', 'songwriting-and-ai-music'],
    defaultModel: 'GPT-5.4',
  },
  {
    role: 'Custom',
    specialty: '',
    mission: '',
    systemPrompt: '',
    skills: [],
  },
] as const

const ROLE_NAMES = ROLE_PRESETS.map((p) => p.role)

async function fetchAvailableModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
  try {
    const res = await fetch('/api/models')
    if (!res.ok) return []
    const data = await res.json()
    if (!data?.ok || !Array.isArray(data?.data)) return []
    return data.data
  } catch {
    return []
  }
}

type RuntimeResponse = {
  entries: Array<RuntimeEntry>
  tmuxAvailable?: boolean
  checkedAt?: number
}

async function fetchRuntime(): Promise<RuntimeResponse> {
  const res = await fetch('/api/swarm-runtime')
  if (!res.ok) throw new Error(`Runtime request failed: ${res.status}`)
  return res.json()
}

async function fetchHealth(): Promise<HealthData> {
  const res = await fetch('/api/swarm-health')
  if (!res.ok) throw new Error(`Health request failed: ${res.status}`)
  return res.json()
}

async function fetchRoster(): Promise<Array<SwarmRosterWorker>> {
  const res = await fetch('/api/swarm-roster')
  if (!res.ok) throw new Error(`Roster request failed: ${res.status}`)
  const data = (await res.json()) as SwarmRosterResponse
  return Array.isArray(data.roster?.workers) ? data.roster!.workers! : []
}

async function fetchMissions(): Promise<Array<SwarmMissionSummary>> {
  const res = await fetch('/api/swarm-missions?limit=50')
  if (!res.ok) throw new Error(`Missions request failed: ${res.status}`)
  const data = (await res.json()) as SwarmMissionsResponse
  return Array.isArray(data.missions) ? data.missions : []
}

function useUpdatedAgo(fetchedAt: number | null): string {
  const [label, setLabel] = useState('')

  useEffect(() => {
    function update() {
      if (!fetchedAt) {
        setLabel('')
        return
      }
      const diff = Math.floor((Date.now() - fetchedAt) / 1000)
      if (diff < 5) setLabel('just now')
      else if (diff < 60) setLabel(`${diff}s ago`)
      else setLabel(`${Math.floor(diff / 60)}m ago`)
    }

    update()
    const id = setInterval(update, 5_000)
    return () => clearInterval(id)
  }, [fetchedAt])

  return label
}

export type RuntimeCommand = {
  command: Array<string>
  kind: TerminalKind
  label: string
}

export type RuntimeCommandMode = 'auto' | 'logs' | 'shell'

// Pick the live command for a worker pane.
//
// Priority for `mode='auto'` (the default):
//   1. tmux attach when an attachable session exists (interactive TUI, ideal)
//   2. shell at worker cwd (real PTY, chat-able, no extra deps)
//   3. tail -F on agent.log (read-only stream, only when no shell context)
//
// `mode='logs'` forces tail -F (when a logPath exists).
// `mode='shell'` forces a workspace shell even if tmux is available.
export function commandForRuntime(
  runtime: RuntimeEntry | undefined,
  mode: RuntimeCommandMode = 'auto',
): RuntimeCommand {
  const cwd = runtime?.cwd?.replace(/"/g, '\\"')
  const shellCommand = (): RuntimeCommand => ({
    command: ['zsh', '-lc', cwd ? `cd "${cwd}" && exec zsh -l` : 'exec zsh -l'],
    kind: 'shell',
    label: cwd ? 'shell @ cwd' : 'shell',
  })
  const logCommand = (): RuntimeCommand | null =>
    runtime?.logPath
      ? {
          command: ['tail', '-n', '200', '-F', runtime.logPath],
          kind: 'log-tail',
          label: 'tail -F agent.log',
        }
      : null

  if (mode === 'logs') {
    return logCommand() ?? shellCommand()
  }
  if (mode === 'shell') {
    return shellCommand()
  }
  // auto
  if (runtime?.tmuxAttachable && runtime.tmuxSession) {
    return {
      command: ['tmux', 'attach', '-t', runtime.tmuxSession],
      kind: 'tmux',
      label: `tmux:${runtime.tmuxSession}`,
    }
  }
  if (runtime?.cwd) {
    return shellCommand()
  }
  return logCommand() ?? shellCommand()
}

function recentLines(entry: RuntimeEntry | undefined): Array<string> {
  return (entry?.recentLogTail ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
}

function rankMember(roomIds: Array<string>) {
  return (member: CrewMember) => {
    if (roomIds.includes(member.id)) return 0
    const status = getOnlineStatus(member)
    if (status === 'online') return 1
    if (status === 'offline') return 2
    return 3
  }
}

function sortSwarmMembers(members: Array<CrewMember>, roomIds: Array<string>) {
  const rank = rankMember(roomIds)
  return [...members]
    .filter((member) => /^swarm\d+$/i.test(member.id))
    .sort((a, b) => {
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0
      const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0
      return numA - numB
    })
}

function compactText(value: string | null | undefined, max = 38): string {
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function isRuntimeActive(entry: RuntimeEntry | undefined): boolean {
  if (!entry) return false
  if (entry.tmuxAttachable) return true
  if (entry.currentTask?.trim()) return true
  const last = entry.lastOutputAt ?? entry.lastSessionStartedAt
  return typeof last === 'number' && Date.now() - last < 12 * 60 * 60 * 1000
}

function scrollNodeToTop(node: HTMLElement | null) {
  if (!node) return
  node.scrollTop = 0
  node.scrollLeft = 0
}

function withInstantScroll<T>(anchor: HTMLElement | null, fn: () => T): T {
  if (typeof window === 'undefined') return fn()

  const targets: HTMLElement[] = []
  if (document.documentElement instanceof HTMLElement) targets.push(document.documentElement)
  if (document.body instanceof HTMLElement) targets.push(document.body)

  let current: HTMLElement | null = anchor
  while (current) {
    targets.push(current)
    current = current.parentElement
  }

  for (const selector of ['main', '[data-slot="content"]', '[data-slot="main"]', '[data-scroll-container]']) {
    const node = document.querySelector(selector)
    if (node instanceof HTMLElement) targets.push(node)
  }

  const deduped = [...new Set(targets)].filter((node) => !node.closest('.xterm'))
  const previous = deduped.map((node) => [node, node.style.scrollBehavior] as const)
  for (const [node] of previous) node.style.scrollBehavior = 'auto'
  try {
    return fn()
  } finally {
    for (const [node, value] of previous) node.style.scrollBehavior = value
  }
}

function scrollContextToTop(anchor: HTMLElement | null) {
  if (typeof window === 'undefined') return

  withInstantScroll(anchor, () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0

    let current: HTMLElement | null = anchor
    while (current) {
      scrollNodeToTop(current)
      current = current.parentElement
    }

    const candidates = [
      document.querySelector('main'),
      document.querySelector('[data-slot="content"]'),
      document.querySelector('[data-slot="main"]'),
      document.querySelector('[data-scroll-container]'),
    ]

    for (const node of candidates) {
      if (node instanceof HTMLElement && !node.closest('.xterm')) scrollNodeToTop(node)
    }

    if (anchor) {
      anchor.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
  })
}

function scheduleScrollContextToTop(anchor: HTMLElement | null) {
  if (typeof window === 'undefined') return () => {}

  let cancelled = false
  const timers: number[] = []
  const frames: number[] = []

  const run = () => {
    if (cancelled) return
    scrollContextToTop(anchor)
  }

  run()
  frames.push(window.requestAnimationFrame(run))
  frames.push(window.requestAnimationFrame(() => window.requestAnimationFrame(run)))
  timers.push(window.setTimeout(run, 0))
  timers.push(window.setTimeout(run, 50))
  timers.push(window.setTimeout(run, 150))
  timers.push(window.setTimeout(run, 300))

  return () => {
    cancelled = true
    for (const id of timers) window.clearTimeout(id)
    for (const id of frames) window.cancelAnimationFrame(id)
  }
}

function relativeTime(ts: number | null | undefined): string {
  if (!ts) return 'never'
  const diff = Date.now() - ts
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function progressForRuntime(runtime: RuntimeEntry | undefined): number {
  if (!runtime) return 0
  if (runtime.checkpointStatus === 'done' || runtime.checkpointStatus === 'handoff') return 100
  if (runtime.checkpointStatus === 'blocked' || runtime.checkpointStatus === 'needs_input') return 100
  if (!runtime.currentTask?.trim()) return 0
  const text = `${runtime.phase ?? ''} ${runtime.currentTask ?? ''}`.toLowerCase()
  if (text.includes('review')) return 72
  if (text.includes('test') || text.includes('qa')) return 78
  if (text.includes('implement') || text.includes('build') || text.includes('patch')) return 64
  if (text.includes('plan') || text.includes('research') || text.includes('design')) return 48
  return 58
}

function cleanSwarmLabel(rawValue: string, fallback = 'Ready for task', maxLength = 64): string {
  const raw = rawValue.trim()
  if (!raw) return fallback
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean)
  const goalLine = lines.find((line) => /^goal\s*:/i.test(line))
  const selected = goalLine
    ? goalLine.replace(/^goal\s*:\s*/i, '')
    : lines.find((line) => !/^you are\b/i.test(line) && !/^context\b/i.test(line) && !/^constraints\b/i.test(line)) || lines[0]
  const cleaned = selected
    .replace(/^[A-Z][A-Z0-9_ -]{2,}TASK\s*:\s*/i, '')
    .replace(/^DESIGN_ADDENDUM\s*:\s*/i, '')
    .replace(/^CONTROL_PLANE_REPROMPT\s*:\s*/i, '')
    .replace(/^EXPERIMENT_PLANNING_TASK\s*:\s*/i, '')
    .replace(/^UPDATE\s*:\s*/i, '')
    .replace(/^You are\s+[^.]{1,80}\.\s*/i, '')
    .replace(/^[-*]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return compactText(cleaned || raw, maxLength)
}

function displayTaskTitle(runtime: RuntimeEntry | undefined, fallback: string): string {
  const realSummary = runtime?.lastRealSummary ?? null
  const realResult = runtime?.lastRealResult ?? null
  return cleanSwarmLabel(runtime?.blockedReason || runtime?.currentTask || realSummary || runtime?.lastSummary || realResult || runtime?.lastResult || fallback || '', 'Ready for task', 64)
}


function formatAssignedModel(model?: string | null, provider?: string | null): string {
  const value = `${model || ''} ${provider || ''}`.toLowerCase()
  if (value.includes('claude-opus-4-7') || value.includes('opus-4-7')) return 'Opus 4.7'
  if (value.includes('claude-opus-4-6') || value.includes('opus-4-6')) return 'Opus 4.6'
  if (value.includes('gpt-5.5')) return 'GPT-5.5'
  if (value.includes('gpt-5.4')) return 'GPT-5.4'
  if (value.includes('gpt-5.3')) return 'GPT-5.3'
  if (model && model !== 'unknown') return model
  if (provider && provider !== 'unknown') return provider.replace(/^custom:/, '').replace(/[-_]/g, ' ')
  return 'Worker'
}

type ControlPlaneStageProps = {
  members: Array<CrewMember>
  selectedId: string | null
  roomIds: Array<string>
  activeRuntimeCount: number
  authErrors: number
  selectedLabel: string
  workspaceModel: string | null
  lanes: Array<{ role: string; count: number; active: number }>
  activeAgents: Array<{ workerId: string; workerName: string; role: string; task: string; progress: number; state: 'working' | 'reviewing' | 'blocked' | 'ready'; age: string }>
  recentUpdates: Array<{ workerId: string; workerName: string; text: string; age: string; tone: 'idle' | 'active' | 'warning' }>
  latestMission: { id: string; title: string; state: string; assignmentCount: number; checkpointedCount: number } | null
  missions: Array<SwarmMissionSummary>
  runtimeEntries: Array<RuntimeEntry>
  inboxCounts: { needsReview: number; blocked: number; ready: number }
  routerSeed: { key: number; prompt: string; mode: 'auto' | 'manual' | 'broadcast' } | null
  onOpenInboxItem: (item: Swarm2InboxItem) => void
  onRouteToReviewer: (item: Swarm2InboxItem) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onOpenRouter: () => void
  onRouterResults: () => void
  onSelect: (workerId: string) => void
  onToggleRoom: (workerId: string) => void
  onOpenTui: (workerId: string) => void
  onOpenTasks: (workerId: string) => void
  runtimeByWorker: Map<string, RuntimeEntry>
  terminalTargets: Array<CrewMember>
  tmuxAvailable: boolean
  pendingTmux: Set<string>
  focusedRuntimeWorkerId: string | null
  onToggleFocusedRuntimeWorker: (workerId: string) => void
  onClearFocusedRuntimeWorker: () => void
  onStartAgentSession: (workerId: string) => void
  onScrollTmuxSession: (workerId: string, direction: 'up' | 'down', session?: string | null) => void
}

function ControlPlaneStage({
  members,
  selectedId,
  roomIds,
  activeRuntimeCount,
  authErrors,
  selectedLabel,
  workspaceModel,
  lanes,
  activeAgents,
  recentUpdates,
  latestMission,
  missions,
  runtimeEntries,
  inboxCounts,
  routerSeed,
  onOpenInboxItem,
  onRouteToReviewer,
  viewMode,
  onViewModeChange,
  onOpenRouter,
  onRouterResults,
  onSelect,
  onToggleRoom,
  onOpenTui,
  onOpenTasks,
  runtimeByWorker,
  terminalTargets,
  tmuxAvailable,
  pendingTmux,
  focusedRuntimeWorkerId,
  onToggleFocusedRuntimeWorker,
  onClearFocusedRuntimeWorker,
  onStartAgentSession,
  onScrollTmuxSession,
}: ControlPlaneStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const workerRefsMap = useRef<Map<string, HTMLElement>>(new Map())
  const cardSetters = useRef<
    Map<string, (node: HTMLElement | null) => void>
  >(new Map())
  const [refsVersion, setRefsVersion] = useState(0)
  const bumpRefsVersion = useCallback(() => {
    setRefsVersion((value) => value + 1)
  }, [])

  const setAnchor = useCallback((node: HTMLDivElement | null) => {
    if (anchorRef.current === node) return
    anchorRef.current = node
    bumpRefsVersion()
  }, [bumpRefsVersion])

  const setWorkerRef = useCallback(
    (workerId: string) => {
      const existing = cardSetters.current.get(workerId)
      if (existing) return existing
      const setter = (node: HTMLElement | null) => {
        const map = workerRefsMap.current
        const prior = map.get(workerId) ?? null
        if (node === prior) return
        if (node) map.set(workerId, node)
        else map.delete(workerId)
        bumpRefsVersion()
      }
      cardSetters.current.set(workerId, setter)
      return setter
    },
    [bumpRefsVersion],
  )

  // Drop stale setters for workers that left the roster.
  useEffect(() => {
    const liveIds = new Set(members.map((member) => member.id))
    let mutated = false
    for (const id of cardSetters.current.keys()) {
      if (!liveIds.has(id)) {
        cardSetters.current.delete(id)
        workerRefsMap.current.delete(id)
        mutated = true
      }
    }
    if (mutated) bumpRefsVersion()
  }, [members, bumpRefsVersion])

  const wireTargets = useMemo(
    () =>
      members.map((member) => ({
        id: member.id,
        selected: member.id === selectedId,
        inRoom: roomIds.includes(member.id),
      })),
    [members, selectedId, roomIds],
  )

  return (
    <section
      ref={stageRef}
      className="relative overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 shadow-[0_24px_80px_var(--theme-shadow)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,var(--theme-accent-soft),transparent_42%)]" />
      <Swarm2Wires
        containerRef={stageRef}
        anchorRef={anchorRef}
        workerRefs={workerRefsMap.current}
        workers={wireTargets}
        version={refsVersion}
      />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <Swarm2OrchestratorCard
          totalWorkers={members.length}
          activeRuntimeCount={activeRuntimeCount}
          roomCount={roomIds.length}
          authErrors={authErrors}
          selectedLabel={selectedLabel}
          workspaceModel={workspaceModel}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          lanes={lanes}
          activeAgents={activeAgents}
          recentUpdates={recentUpdates}
          latestMission={latestMission}
          inboxCounts={inboxCounts}
          members={members}
          roomIds={roomIds}
          selectedId={selectedId}
          routerSeed={routerSeed}
          onOpenRouter={onOpenRouter}
          onRouterResults={() => {
            void onRouterResults()
          }}
          onAnchorRef={setAnchor}
          className="w-full max-w-5xl"
        />
        <div className="relative w-full pt-3">
          <div className={cn('relative z-10', viewMode === 'cards' ? 'block' : 'hidden')}>
            <div className="mb-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-xs text-[var(--theme-muted-2)]">
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 min-[1680px]:grid-cols-3">
              {members.length === 0 ? (
                <div className="col-span-full rounded-[1.5rem] border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] p-8 text-sm text-[var(--theme-muted)]">
                  No swarm workers discovered from crew status yet.
                </div>
              ) : (
                members.map((member) => {
                  const runtime = runtimeByWorker.get(member.id)
                  return (
                    <OperationalWorkerCard
                      key={member.id}
                      cardRef={setWorkerRef(member.id)}
                      member={member}
                      currentTask={runtime?.currentTask ?? null}
                      recentLines={recentLines(runtime)}
                      recentOutputAt={runtime?.lastOutputAt ?? runtime?.lastSessionStartedAt ?? null}
                      recentSummary={runtime?.lastRealSummary ?? runtime?.lastRealResult ?? runtime?.lastSummary ?? runtime?.lastResult ?? runtime?.blockedReason ?? null}
                      artifacts={runtime?.artifacts ?? []}
                      previews={runtime?.previews ?? []}
                      inRoom={roomIds.includes(member.id)}
                      selected={member.id === selectedId}
                      onSelect={() => onSelect(member.id)}
                      onToggleRoom={() => onToggleRoom(member.id)}
                      onOpenTui={() => onOpenTui(member.id)}
                      onOpenTasks={() => onOpenTasks(member.id)}
                    />
                  )
                })
              )}
            </div>
          </div>

          <div className={cn('relative z-10 flex flex-col gap-3', viewMode === 'runtime' ? 'block' : 'hidden')}>
            {!tmuxAvailable ? (
              <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs text-[var(--theme-muted)]">
                tmux not installed — each worker still gets a live shell PTY at its workspace. Install tmux only if you want to attach to TUI sessions running outside the UI.
              </div>
            ) : null}
            {focusedRuntimeWorkerId ? (
              <div className="flex items-center justify-between rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs text-[var(--theme-muted)]">
                <span>
                  Focus mode on{' '}
                  <span className="font-semibold text-[var(--theme-text)]">
                    {members.find((member) => member.id === focusedRuntimeWorkerId)?.displayName || focusedRuntimeWorkerId}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={onClearFocusedRuntimeWorker}
                  className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[var(--theme-muted)] transition-colors hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]"
                >
                  Exit focus
                </button>
              </div>
            ) : null}
            <div className={cn('grid grid-cols-1 gap-3', focusedRuntimeWorkerId ? '' : '2xl:grid-cols-2')}>
              {terminalTargets.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] p-8 text-sm text-[var(--theme-muted)]">
                  No active workers detected. Select a worker or wire it into the room to mount its terminal.
                </div>
              ) : (
                terminalTargets.map((member) => {
                  const runtime = runtimeByWorker.get(member.id)
                  const cmd = commandForRuntime(runtime, 'auto')
                  const kindBadgeClass =
                    cmd.kind === 'tmux'
                      ? 'border-[var(--theme-accent)]/40 bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                      : cmd.kind === 'log-tail'
                        ? 'border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] text-[var(--theme-warning)]'
                        : 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)]'
                  const titleLabel = member.displayName || member.id
                  const modelLabel = formatAssignedModel(member.model, member.provider)
                  return (
                    <div key={member.id} className="overflow-hidden rounded-[1.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-[0_20px_60px_color-mix(in_srgb,var(--theme-shadow)_14%,transparent)]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--theme-border)] px-3 py-2 text-[11px] text-[var(--theme-muted)]">
                        <span className="inline-flex items-center gap-2 font-semibold text-[var(--theme-text)]">
                          <HugeiconsIcon icon={CpuIcon} size={13} />
                          <span>{titleLabel}</span>
                          <span className="text-[10px] font-medium text-[var(--theme-muted)]">· {modelLabel}</span>
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          {runtime?.tmuxAttachable ? (
                            <>
                              <button type="button" onClick={() => onScrollTmuxSession(member.id, 'up', runtime.tmuxSession)} className="rounded-full border border-transparent px-1.5 py-0.5 text-[12px] text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-border)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]" title={`Scroll up in ${runtime.tmuxSession ?? `swarm-${member.id}`}`}>↑</button>
                              <button type="button" onClick={() => onScrollTmuxSession(member.id, 'down', runtime.tmuxSession)} className="rounded-full border border-transparent px-1.5 py-0.5 text-[12px] text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-border)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]" title={`Scroll down in ${runtime.tmuxSession ?? `swarm-${member.id}`}`}>↓</button>
                              <button type="button" onClick={() => onToggleFocusedRuntimeWorker(member.id)} className="rounded-full border border-transparent px-1.5 py-0.5 text-[12px] text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-border)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]" title={focusedRuntimeWorkerId === member.id ? `Exit focus for swarm-${member.id}` : `Focus swarm-${member.id}`}>
                                {focusedRuntimeWorkerId === member.id ? '⛶' : '⤢'}
                              </button>
                            </>
                          ) : (
                            <button type="button" disabled={pendingTmux.has(member.id) || !tmuxAvailable} onClick={() => onStartAgentSession(member.id)} className={cn('rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] transition-colors', 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)] hover:opacity-90', (pendingTmux.has(member.id) || !tmuxAvailable) && 'cursor-not-allowed opacity-50')} title={tmuxAvailable ? `Start a live agent session in tmux (swarm-${member.id})` : 'tmux is not installed on this host'}>
                              {pendingTmux.has(member.id) ? 'Starting…' : 'Start agent'}
                            </button>
                          )}
                        </div>
                        <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]', kindBadgeClass)} title={cmd.command.join(' ')}>
                          {cmd.kind === 'tmux' ? 'tmux' : cmd.kind === 'log-tail' ? 'logs' : 'shell'}
                        </span>
                      </div>
                      <SwarmTerminal workerId={member.id} command={cmd.command} cwd={runtime?.cwd ?? undefined} height={420} active={viewMode === 'runtime'} />
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className={cn('relative z-10', viewMode === 'kanban' ? 'block' : 'hidden')}>
            <Swarm2KanbanBoard
              workers={members}
              latestMission={latestMission}
              selectedWorkerId={selectedId}
              onSelectWorker={onSelect}
              onOpenRouter={onOpenRouter}
            />
          </div>

          <div className={cn('relative z-10', viewMode === 'reports' ? 'block' : 'hidden')}>
            <Swarm2ReportsView
              missions={missions}
              runtimes={runtimeEntries}
              onSelectWorker={(workerId) => {
                onSelect(workerId)
                onViewModeChange('cards')
              }}
              onOpenItem={onOpenInboxItem}
              onRouteToReviewer={onRouteToReviewer}
            />
          </div>
        </div>
      </div>
    </section>
  )
}



export const __runtimeTabInternals = {
  commandForRuntime,
  isRuntimeActive,
}

export function Swarm2Screen() {
  const { crew, lastUpdated } = useCrewStatus()
  useUpdatedAgo(lastUpdated)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [roomIds, setRoomIds] = useState<Array<string>>(() => {
    if (typeof window === 'undefined') return []
    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(SWARM2_ROOM_STORAGE_KEY) ?? '[]',
      )
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : []
    } catch {
      return []
    }
  })
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [routerOpen, setRouterOpen] = useState(false)
  const [routerSeed, setRouterSeed] = useState<{ key: number; prompt: string; mode: 'auto' | 'manual' | 'broadcast' } | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [addSwarmOpen, setAddSwarmOpen] = useState(false)
  const [addSwarmSaving, setAddSwarmSaving] = useState(false)
  const [addSwarmError, setAddSwarmError] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; provider: string }>>([])

  useEffect(() => {
    if (!addSwarmOpen) return
    let cancelled = false
    void fetchAvailableModels().then((models) => {
      if (!cancelled) setAvailableModels(models)
    })
    return () => {
      cancelled = true
    }
  }, [addSwarmOpen])
  const [newWorkerId, setNewWorkerId] = useState('')
  const [newWorkerName, setNewWorkerName] = useState('')
  const [newWorkerRole, setNewWorkerRole] = useState('Builder')
  const [newWorkerSpecialty, setNewWorkerSpecialty] = useState('')
  const [newWorkerModel, setNewWorkerModel] = useState('GPT-5.5')
  const [newWorkerMission, setNewWorkerMission] = useState('')
  // Worker IDs whose tmux session is currently being started/stopped via API.
  const [pendingTmux, setPendingTmux] = useState<Set<string>>(new Set())
  const [focusedRuntimeWorkerId, setFocusedRuntimeWorkerId] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)

  const runtimeQuery = useQuery({
    queryKey: ['swarm2', 'runtime'],
    queryFn: fetchRuntime,
    refetchInterval: 30_000,
  })
  const healthQuery = useQuery({
    queryKey: ['swarm2', 'health'],
    queryFn: fetchHealth,
    refetchInterval: 60_000,
  })
  const rosterQuery = useQuery({
    queryKey: ['swarm2', 'roster'],
    queryFn: fetchRoster,
    refetchInterval: 60_000,
  })
  const missionsQuery = useQuery({
    queryKey: ['swarm2', 'missions'],
    queryFn: fetchMissions,
    refetchInterval: 30_000,
  })

  const startAgentSession = useCallback(
    async (workerId: string) => {
      setPendingTmux((prev) => new Set(prev).add(workerId))
      try {
        const res = await fetch('/api/swarm-tmux-start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerId }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          // eslint-disable-next-line no-console
          console.error('[swarm2] start session failed:', res.status, text)
        }
      } finally {
        setPendingTmux((prev) => {
          const next = new Set(prev)
          next.delete(workerId)
          return next
        })
        void runtimeQuery.refetch()
      }
    },
    [runtimeQuery],
  )

  const stopAgentSession = useCallback(
    async (workerId: string) => {
      setPendingTmux((prev) => new Set(prev).add(workerId))
      try {
        const res = await fetch('/api/swarm-tmux-stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerId }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          // eslint-disable-next-line no-console
          console.error('[swarm2] stop session failed:', res.status, text)
        }
      } finally {
        setPendingTmux((prev) => {
          const next = new Set(prev)
          next.delete(workerId)
          return next
        })
        void runtimeQuery.refetch()
      }
    },
    [runtimeQuery],
  )

  const scrollTmuxSession = useCallback(
    async (workerId: string, direction: 'up' | 'down', session?: string | null) => {
      try {
        const res = await fetch('/api/swarm-tmux-scroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerId, session, direction, lines: 8 }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          // eslint-disable-next-line no-console
          console.error('[swarm2] tmux scroll failed:', res.status, text)
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[swarm2] tmux scroll exception:', error)
      }
    },
    [],
  )

  const toggleFocusedRuntimeWorker = useCallback((workerId: string) => {
    setFocusedRuntimeWorkerId((current) => (current === workerId ? null : workerId))
  }, [])

  const runtimeByWorker = useMemo(() => {
    const map = new Map<string, RuntimeEntry>()
    for (const entry of runtimeQuery.data?.entries ?? [])
      map.set(entry.workerId, entry)
    return map
  }, [runtimeQuery.data])
  const members = useMemo(() => {
    const merged = sortSwarmMembers(crew, roomIds).map((member) => {
      const runtime = runtimeByWorker.get(member.id)
      const roster = rosterQuery.data?.find((worker) => worker.id === member.id)
      return {
        ...member,
        displayName: runtime?.displayName || roster?.name || member.displayName,
        role: roster?.role || runtime?.role || member.role,
        specialty: roster?.specialty,
        mission: roster?.mission,
        skills: roster?.skills ?? [],
        capabilities: roster?.capabilities ?? [],
        model: roster?.model || member.model,
      }
    })
    const seen = new Set(merged.map((member) => member.id))
    const extras = (rosterQuery.data ?? [])
      .filter((worker) => !seen.has(worker.id))
      .map((worker) => ({
        id: worker.id,
        displayName: worker.name || worker.id,
        role: worker.role || 'Worker',
        profileFound: false,
        gatewayState: 'unknown',
        processAlive: false,
        platforms: {},
        model: worker.model || 'unknown',
        provider: 'roster-only',
        specialty: worker.specialty,
        mission: worker.mission,
        skills: worker.skills ?? [],
        capabilities: worker.capabilities ?? [],
        lastSessionTitle: worker.mission || null,
        lastSessionAt: null,
        sessionCount: 0,
        messageCount: 0,
        toolCallCount: 0,
        totalTokens: 0,
        estimatedCostUsd: null,
        cronJobCount: 0,
        assignedTaskCount: 0,
      }))
    return sortSwarmMembers([...merged, ...extras], roomIds)
  }, [crew, roomIds, runtimeByWorker, rosterQuery.data])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        SWARM2_ROOM_STORAGE_KEY,
        JSON.stringify(roomIds),
      )
    } catch {
      /* noop */
    }
  }, [roomIds])

  useEffect(() => {
    if (members.length === 0) {
      setSelectedId(null)
      setFocusedRuntimeWorkerId(null)
      return
    }
    if (!selectedId || !members.some((member) => member.id === selectedId)) {
      setSelectedId(members[0]?.id ?? null)
    }
    if (
      focusedRuntimeWorkerId &&
      !members.some((member) => member.id === focusedRuntimeWorkerId)
    ) {
      setFocusedRuntimeWorkerId(null)
    }
  }, [members, selectedId, focusedRuntimeWorkerId])

  useLayoutEffect(() => {
    return scheduleScrollContextToTop(topRef.current)
  }, [])


  const activeRuntimeCount = members.filter((member) =>
    isRuntimeActive(runtimeByWorker.get(member.id)),
  ).length
  const selectedMember = selectedId
    ? members.find((member) => member.id === selectedId)
    : null
  const selectedLabel = selectedMember?.displayName || selectedId || 'none'
  const tmuxAvailable = runtimeQuery.data?.tmuxAvailable ?? true

  // Runtime tab auto-mount priority:
  // 1. Wired room workers (explicit user pick)
  // 2. All workers with an attachable tmux session OR an active runtime signal
  // 3. Single selected worker as last resort
  const autoMountTargets = useMemo(() => {
    if (roomIds.length) {
      return members.filter((member) => roomIds.includes(member.id))
    }
    const active = members.filter((member) => {
      const runtime = runtimeByWorker.get(member.id)
      if (runtime?.tmuxAttachable) return true
      return isRuntimeActive(runtime)
    })
    if (active.length > 0) return active
    return selectedId
      ? members.filter((member) => member.id === selectedId)
      : []
  }, [members, roomIds, runtimeByWorker, selectedId])
  const terminalTargets = focusedRuntimeWorkerId
    ? autoMountTargets.filter((member) => member.id === focusedRuntimeWorkerId)
    : autoMountTargets
  const rosterLanes = useMemo(() => {
    const map = new Map<string, { role: string; count: number; active: number }>()
    for (const member of members) {
      const role = member.role || 'Worker'
      const existing = map.get(role) ?? { role, count: 0, active: 0 }
      existing.count += 1
      if (isRuntimeActive(runtimeByWorker.get(member.id))) existing.active += 1
      map.set(role, existing)
    }
    return [...map.values()].sort((a, b) => b.active - a.active || b.count - a.count || a.role.localeCompare(b.role))
  }, [members, runtimeByWorker])
  const latestMission = useMemo(() => {
    const mission = missionsQuery.data?.[0]
    if (!mission) return null
    const assignments = mission.assignments ?? []
    const genericTitle = /^\d+\s+assigned tasks?$/i.test(mission.title.trim()) || /assigned tasks/i.test(mission.title)
    const firstTask = assignments.find((assignment) => assignment.task?.trim())?.task ?? ''
    return {
      id: mission.id,
      title: cleanSwarmLabel(genericTitle ? firstTask : mission.title, 'Swarm mission', 72),
      state: mission.state,
      assignmentCount: assignments.length,
      checkpointedCount: assignments.filter((assignment) => ['checkpointed', 'done'].includes(assignment.state)).length,
    }
  }, [missionsQuery.data])

  const activeAgents = useMemo(() => {
    return members
      .map((member) => {
        const runtime = runtimeByWorker.get(member.id)
        const currentTask = runtime?.currentTask?.trim()
        const blocked = Boolean(runtime?.blockedReason || runtime?.needsHuman || runtime?.checkpointStatus === 'blocked' || runtime?.checkpointStatus === 'needs_input')
        const done = runtime?.checkpointStatus === 'done' || runtime?.checkpointStatus === 'handoff'
        if (!currentTask && !blocked) return null
        const state: 'working' | 'reviewing' | 'blocked' | 'ready' = blocked
          ? 'blocked'
          : done
            ? 'ready'
            : `${runtime?.phase ?? ''} ${currentTask ?? ''}`.toLowerCase().includes('review')
              ? 'reviewing'
              : 'working'
        const ts = runtime?.lastOutputAt ?? runtime?.lastSessionStartedAt ?? member.lastSessionAt ?? null
        return {
          workerId: member.id,
          workerName: member.displayName || member.id,
          role: member.role || runtime?.role || 'Worker',
          task: displayTaskTitle(runtime, 'Awaiting checkpoint'),
          progress: progressForRuntime(runtime),
          state,
          age: relativeTime(ts),
          ts: ts ?? 0,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const priority = { blocked: 0, reviewing: 1, working: 2, ready: 3 }
        return priority[a.state] - priority[b.state] || b.ts - a.ts || a.workerId.localeCompare(b.workerId)
      })
      .map((item) => ({
        workerId: item.workerId,
        workerName: item.workerName,
        role: item.role,
        task: item.task,
        progress: item.progress,
        state: item.state,
        age: item.age,
      }))
  }, [members, runtimeByWorker])

  const inboxLanes = useMemo(
    () => buildSwarm2InboxLanes({ missions: missionsQuery.data ?? [], runtimes: runtimeQuery.data?.entries ?? [] }),
    [missionsQuery.data, runtimeQuery.data?.entries],
  )

  const openInboxItem = useCallback((item: Swarm2InboxItem) => {
    if (item.workerId) {
      setSelectedId(item.workerId)
      setFocusedRuntimeWorkerId(item.workerId)
    }
    setViewMode('reports')
    setNotificationsOpen(false)
  }, [])

  const routeInboxItemToReviewer = useCallback((item: Swarm2InboxItem) => {
    setSelectedId('swarm6')
    setRouterSeed({
      key: Date.now(),
      mode: 'manual',
      prompt: [
        `Review ${item.workerId}'s Swarm control-plane output for mission ${item.missionId ?? 'unknown mission'}. Do not broaden scope. Return the required checkpoint format.`,
        '',
        `Task: ${item.title}`,
        `Summary: ${item.summary}`,
        `Checkpoint: ${item.checkpointStatus ?? item.stateLabel}`,
        `Blocker: ${item.blocker ?? 'none'}`,
        `Next action: ${item.nextAction ?? 'none'}`,
      ].join('\n'),
    })
    setRouterOpen(true)
    setViewMode('reports')
  }, [])

  const swarmNotifications = useMemo(() => {
    const laneItems = [
      ...inboxLanes.needs_review.map((item) => ({
        id: `review-${item.id}`,
        workerId: item.workerId,
        title: `${item.workerName} · Needs review`,
        body: item.summary,
        age: relativeTime(item.updatedAt),
        actionable: true,
      })),
      ...inboxLanes.blocked.map((item) => ({
        id: `blocked-${item.id}`,
        workerId: item.workerId,
        title: `${item.workerName} · Needs input`,
        body: item.blocker ?? item.summary,
        age: relativeTime(item.updatedAt),
        actionable: true,
      })),
      ...inboxLanes.ready.map((item) => ({
        id: `ready-${item.id}`,
        workerId: item.workerId,
        title: `${item.workerName} · Ready`,
        body: item.summary,
        age: relativeTime(item.updatedAt),
        actionable: true,
      })),
    ]
    if (latestMission) {
      laneItems.unshift({
        id: `mission-${latestMission.id}`,
        workerId: '',
        title: `Mission ${latestMission.state}`,
        body: `${latestMission.checkpointedCount}/${latestMission.assignmentCount} checkpointed · ${latestMission.title}`,
        age: latestMission.id,
        actionable: latestMission.checkpointedCount < latestMission.assignmentCount,
      })
    }
    return laneItems.slice(0, 8)
  }, [inboxLanes, latestMission])
  const actionableNotificationCount = swarmNotifications.filter((item) => item.actionable).length

  const recentUpdates = useMemo(() => {
    return members
      .map((member) => {
        const runtime = runtimeByWorker.get(member.id)
        const ts = runtime?.lastOutputAt ?? runtime?.lastSessionStartedAt ?? member.lastSessionAt ?? null
        const rawText = runtime?.lastRealSummary ?? runtime?.lastRealResult ?? runtime?.lastSummary ?? runtime?.lastResult ?? runtime?.blockedReason ?? runtime?.currentTask ?? member.lastSessionTitle ?? `Ready in ${member.role || 'worker'} lane`
        const state = (runtime?.phase || runtime?.currentTask || '').toLowerCase()
        const tone: 'idle' | 'active' | 'warning' = runtime?.blockedReason
          ? 'warning'
          : (state.includes('review') || state.includes('write') || state.includes('build') || state.includes('implement') || state.includes('active'))
            ? 'active'
            : 'idle'
        return {
          workerId: member.id,
          workerName: member.displayName || member.id,
          text: compactText(rawText, 72),
          age: relativeTime(ts),
          ts: ts ?? 0,
          tone,
        }
      })
      .sort((a, b) => b.ts - a.ts || a.workerId.localeCompare(b.workerId))
      .slice(0, 3)
      .map(({ workerId, workerName, text, age, tone }) => ({ workerId, workerName, text, age, tone }))
  }, [members, runtimeByWorker])

  function toggleRoom(id: string) {
    setRoomIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    )
  }

  function openAddSwarm() {
    const existingIds = new Set((rosterQuery.data ?? []).map((worker) => worker.id))
    let next = 13
    while (existingIds.has(`swarm${next}`)) next += 1
    setNewWorkerId(`swarm${next}`)
    setNewWorkerName(`Swarm${next}`)
    setNewWorkerRole('Builder')
    setNewWorkerSpecialty('')
    setNewWorkerModel('GPT-5.5')
    setNewWorkerMission('')
    setAddSwarmError(null)
    setAddSwarmOpen(true)
  }

  async function saveAddSwarm() {
    setAddSwarmSaving(true)
    setAddSwarmError(null)
    try {
      const preset = ROLE_PRESETS.find((p) => p.role === newWorkerRole)
      const res = await fetch('/api/swarm-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newWorkerId.trim(),
          name: newWorkerName.trim(),
          role: newWorkerRole.trim(),
          specialty: newWorkerSpecialty.trim() || preset?.specialty || '',
          model: newWorkerModel.trim(),
          mission: newWorkerMission.trim() || preset?.mission || 'Awaiting orchestrator dispatch.',
          systemPrompt: preset?.systemPrompt ?? null,
          skills: preset?.skills ?? [],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || `HTTP ${res.status}`)
      }
      await rosterQuery.refetch()
      setAddSwarmOpen(false)
    } catch (error) {
      setAddSwarmError(error instanceof Error ? error.message : 'Failed to save swarm agent')
    } finally {
      setAddSwarmSaving(false)
    }
  }


  return (
    <div ref={topRef} className="min-h-full bg-surface text-primary-900" style={SWARM2_OPERATION_THEME}>
      <div
        className={cn(
          'mx-auto flex min-h-full max-w-[1680px] flex-col gap-3 px-3 pt-3 sm:px-4 lg:px-5',
          routerOpen ? 'pb-[30rem]' : 'pb-24',
        )}
      >
        <header className="rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-accent)] shadow-sm">
                <HugeiconsIcon icon={CpuIcon} size={22} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-primary-900">
                  Swarm
                </h1>
                <p className="truncate text-xs text-[var(--theme-muted-2)]">
                  12-agent Hermes control plane for planning, routing, reports, and reviewer-gated execution.
                </p>
              </div>
            </div>

            <div className="relative flex shrink-0 items-center gap-2 text-sm text-[var(--theme-muted)]">
              <button
                type="button"
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] text-base shadow-sm hover:bg-[var(--theme-card2)]"
                aria-label="Swarm notifications"
                title="Swarm notifications"
              >
                <HugeiconsIcon icon={AlarmClockIcon} size={17} strokeWidth={1.8} />
                {actionableNotificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {actionableNotificationCount}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <div className="absolute right-0 top-12 z-40 w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 text-left shadow-[0_24px_80px_var(--theme-shadow)]">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Swarm updates</div>
                      <div className="text-xs text-[var(--theme-muted-2)]">Actionable state from canonical mission checkpoints and durable report lanes.</div>
                    </div>
                    <button type="button" onClick={() => setNotificationsOpen(false)} className="rounded-lg px-2 py-1 text-xs hover:bg-[var(--theme-card2)]">Close</button>
                  </div>
                  <div className="max-h-80 space-y-2 overflow-y-auto">
                    {swarmNotifications.length ? swarmNotifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (item.workerId) {
                            setViewMode('reports')
                            setSelectedId(item.workerId)
                            setFocusedRuntimeWorkerId(item.workerId)
                          }
                          setNotificationsOpen(false)
                        }}
                        className="block w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-left hover:border-[var(--theme-accent)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-medium text-[var(--theme-text)]">{item.title}</span>
                          <span className="shrink-0 text-[10px] text-[var(--theme-muted)]">{item.age}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-[var(--theme-muted-2)]">{item.body}</div>
                      </button>
                    )) : (
                      <div className="rounded-xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-3 text-xs text-[var(--theme-muted)]">No active swarm updates.</div>
                    )}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={openAddSwarm}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm font-medium text-primary-950 shadow-sm hover:bg-[var(--theme-accent-strong)]"
              >
                <HugeiconsIcon icon={MessageMultiple01Icon} size={13} />
                Add Swarm
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 grid-cols-1 gap-3">
          <ControlPlaneStage
            members={members}
            selectedId={selectedId}
            roomIds={roomIds}
            activeRuntimeCount={activeRuntimeCount}
            authErrors={healthQuery.data?.summary.totalAuthErrors24h ?? 0}
            selectedLabel={selectedLabel}
            workspaceModel={healthQuery.data?.workspaceModel ?? null}
            lanes={rosterLanes}
            activeAgents={activeAgents}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onOpenRouter={() => setRouterOpen(true)}
            onRouterResults={() => {
              void runtimeQuery.refetch()
              void missionsQuery.refetch()
            }}
            onSelect={(workerId) => setSelectedId(workerId)}
            onToggleRoom={(workerId) => toggleRoom(workerId)}
            onOpenTui={(workerId) => {
              setSelectedId(workerId)
              setViewMode('runtime')
            }}
            onOpenTasks={(workerId) => {
              setSelectedId(workerId)
              setRouterOpen(true)
            }}
            runtimeByWorker={runtimeByWorker}
            recentUpdates={recentUpdates}
            latestMission={latestMission}
            missions={missionsQuery.data ?? []}
            runtimeEntries={runtimeQuery.data?.entries ?? []}
            inboxCounts={{
              needsReview: inboxLanes.needs_review.length,
              blocked: inboxLanes.blocked.length,
              ready: inboxLanes.ready.length,
            }}
            routerSeed={routerSeed}
            onOpenInboxItem={openInboxItem}
            onRouteToReviewer={routeInboxItemToReviewer}
            terminalTargets={terminalTargets}
            tmuxAvailable={tmuxAvailable}
            pendingTmux={pendingTmux}
            focusedRuntimeWorkerId={focusedRuntimeWorkerId}
            onToggleFocusedRuntimeWorker={toggleFocusedRuntimeWorker}
            onClearFocusedRuntimeWorker={() => setFocusedRuntimeWorkerId(null)}
            onStartAgentSession={(workerId) => { void startAgentSession(workerId) }}
            onScrollTmuxSession={(workerId, direction, session) => { void scrollTmuxSession(workerId, direction, session) }}
          />
        </div>

        {viewMode === 'cards' && members.length > 0 ? (
          <Swarm2ActivityFeed
            members={members}
            runtimeByWorker={runtimeByWorker}
            selectedId={selectedId}
            onSelect={(workerId) => setSelectedId(workerId)}
          />
        ) : null}
      </div>


      {addSwarmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-6 shadow-[0_30px_100px_var(--theme-shadow)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-[var(--theme-text)]">Add Swarm Agent</h2>
                <p className="mt-1 text-sm text-[var(--theme-muted-2)]">Create a new swarm roster entry and configure its identity.</p>
              </div>
              <button
                type="button"
                onClick={() => setAddSwarmOpen(false)}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
              >
                Close
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block text-[var(--theme-muted)]">Role preset</span>
                <select
                  value={newWorkerRole}
                  onChange={(e) => {
                    const role = e.target.value
                    setNewWorkerRole(role)
                    const preset = ROLE_PRESETS.find((p) => p.role === role)
                    if (preset && role !== 'Custom') {
                      if (!newWorkerSpecialty.trim()) setNewWorkerSpecialty(preset.specialty)
                      if (!newWorkerMission.trim()) setNewWorkerMission(preset.mission)
                      if (preset.defaultModel && !newWorkerModel.trim()) setNewWorkerModel(preset.defaultModel)
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-[var(--theme-text)] outline-none"
                >
                  {ROLE_NAMES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--theme-muted-2)]">
                  Presets auto-fill specialty, mission, system prompt, and skill stack. Pick “Custom” for a blank slate.
                </p>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--theme-muted)]">Worker ID</span>
                <input value={newWorkerId} onChange={(e) => setNewWorkerId(e.target.value)} className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-[var(--theme-text)] outline-none" placeholder="swarmN" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--theme-muted)]">Display name</span>
                <input value={newWorkerName} onChange={(e) => setNewWorkerName(e.target.value)} className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-[var(--theme-text)] outline-none" placeholder="e.g. Mirror, Builder" />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 flex items-center justify-between text-[var(--theme-muted)]">
                  <span>Model</span>
                  <span className="text-[10px] text-[var(--theme-muted-2)]">{availableModels.length > 0 ? `${availableModels.length} available` : 'loading…'}</span>
                </span>
                <select
                  value={newWorkerModel}
                  onChange={(e) => setNewWorkerModel(e.target.value)}
                  className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-[var(--theme-text)] outline-none"
                >
                  {availableModels.length === 0 ? (
                    <option value={newWorkerModel}>{newWorkerModel || 'Loading models…'}</option>
                  ) : (
                    <>
                      {/* Always include the current value if it's not in the available list (handles legacy / custom names) */}
                      {!availableModels.some((m) => m.name === newWorkerModel || m.id === newWorkerModel) && newWorkerModel ? (
                        <option value={newWorkerModel}>{newWorkerModel} (current)</option>
                      ) : null}
                      {/* Group by provider for readability */}
                      {Array.from(
                        availableModels.reduce((acc, m) => {
                          const k = m.provider || 'other'
                          if (!acc.has(k)) acc.set(k, [])
                          acc.get(k)!.push(m)
                          return acc
                        }, new Map<string, Array<{ id: string; name: string; provider: string }>>()).entries(),
                      ).map(([provider, models]) => (
                        <optgroup key={provider} label={provider}>
                          {models.map((m) => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </>
                  )}
                </select>
                <p className="mt-1 text-xs text-[var(--theme-muted-2)]">
                  Auto-detected from your Hermes config (/api/models). Includes Codex, Anthropic, OpenRouter, OLLAMA, LM Studio, and any custom providers you have configured.
                </p>
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block text-[var(--theme-muted)]">Specialty</span>
                <input value={newWorkerSpecialty} onChange={(e) => setNewWorkerSpecialty(e.target.value)} className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-[var(--theme-text)] outline-none" placeholder={ROLE_PRESETS.find((p) => p.role === newWorkerRole)?.specialty || 'short focus area'} />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block text-[var(--theme-muted)]">Mission</span>
                <textarea value={newWorkerMission} onChange={(e) => setNewWorkerMission(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-[var(--theme-text)] outline-none" placeholder={ROLE_PRESETS.find((p) => p.role === newWorkerRole)?.mission || 'standing mission for this worker'} />
              </label>
              {ROLE_PRESETS.find((p) => p.role === newWorkerRole)?.systemPrompt ? (
                <div className="md:col-span-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-xs text-[var(--theme-muted-2)]">
                  <div className="mb-1 font-semibold text-[var(--theme-muted)]">System prompt (embedded with role)</div>
                  <div className="whitespace-pre-wrap leading-relaxed">{ROLE_PRESETS.find((p) => p.role === newWorkerRole)?.systemPrompt}</div>
                  <div className="mt-2 font-semibold text-[var(--theme-muted)]">Skills loaded</div>
                  <div className="font-mono">{(ROLE_PRESETS.find((p) => p.role === newWorkerRole)?.skills ?? []).join(', ') || '—'}</div>
                </div>
              ) : null}
            </div>
            {addSwarmError ? <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{addSwarmError}</div> : null}
            <div className="mt-4 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setAddSwarmOpen(false)} className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-sm text-[var(--theme-muted)] hover:text-[var(--theme-text)]">Cancel</button>
              <button type="button" disabled={addSwarmSaving || !newWorkerId.trim() || !newWorkerName.trim()} onClick={() => void saveAddSwarm()} className="rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm font-medium text-primary-950 disabled:opacity-50">{addSwarmSaving ? 'Saving…' : 'Save swarm agent'}</button>
            </div>
          </div>
        </div>
      ) : null}

      <RouterChat
        members={members}
        roomIds={roomIds}
        selectedId={selectedId}
        open={routerOpen}
        showClosedDock={false}
        seedPrompt={routerSeed?.prompt ?? null}
        seedMode={routerSeed?.mode}
        seedKey={routerSeed?.key ?? null}
        onOpen={() => setRouterOpen(true)}
        onClose={() => setRouterOpen(false)}
        onResults={() => {
          void runtimeQuery.refetch()
          void missionsQuery.refetch()
        }}
      />
    </div>
  )
}
