import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowRight01Icon, PlayIcon, Rocket01Icon, Search01Icon, Settings01Icon, TaskDone01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { WorkflowHelpModal } from '@/components/workflow-help-modal'
import { Markdown } from '@/components/prompt-kit/markdown'
import { OfficeView } from './components/office-view'
import type { AgentWorkingRow } from './components/agents-working-panel'
import { type GatewaySession } from '@/lib/gateway-api'
import { cn } from '@/lib/utils'
import { type MissionHistoryEntry, type MissionHistoryWorkerDetail, useConductorGateway } from './hooks/use-conductor-gateway'

type ConductorPhase = 'home' | 'preview' | 'active' | 'complete'
type QuickActionId = 'research' | 'build' | 'review' | 'deploy'

type HistoryMessage = {
  role?: string
  content?: string | Array<{ type?: string; text?: string }>
}

type MissionCostWorker = {
  id: string
  label: string
  totalTokens: number
  personaEmoji: string
  personaName: string
}

type AvailableModel = {
  id?: string
  provider?: string
  name?: string
}

type FileBrowserEntry = {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: Array<FileBrowserEntry>
}

const THEME_STYLE: CSSProperties = {
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
  ['--theme-danger-soft-strong' as string]: 'color-mix(in srgb, var(--theme-danger) 18%, transparent)',
  ['--theme-danger-border' as string]: 'color-mix(in srgb, var(--theme-danger) 35%, white)',
  ['--theme-warning' as string]: 'var(--color-amber-600, #d97706)',
  ['--theme-warning-soft' as string]: 'color-mix(in srgb, var(--theme-warning) 12%, transparent)',
  ['--theme-warning-soft-strong' as string]: 'color-mix(in srgb, var(--theme-warning) 18%, transparent)',
  ['--theme-warning-border' as string]: 'color-mix(in srgb, var(--theme-warning) 35%, white)',
}

const QUICK_ACTIONS: Array<{
  id: QuickActionId
  label: string
  icon: typeof Search01Icon
  prompt: string
}> = [
  {
    id: 'research',
    label: 'Research',
    icon: Search01Icon,
    prompt: 'Research the problem space, gather constraints, compare approaches, and propose the most viable plan.',
  },
  {
    id: 'build',
    label: 'Build',
    icon: PlayIcon,
    prompt: 'Build the requested feature end-to-end, including implementation, validation, and a concise delivery summary.',
  },
  {
    id: 'review',
    label: 'Review',
    icon: TaskDone01Icon,
    prompt: 'Review the current implementation for correctness, regressions, missing tests, and release risks.',
  },
  {
    id: 'deploy',
    label: 'Deploy',
    icon: Rocket01Icon,
    prompt: 'Prepare the work for deployment, verify readiness, and summarize any operational follow-ups.',
  },
]

const AGENT_NAMES = ['Nova', 'Pixel', 'Blaze', 'Echo', 'Sage', 'Drift', 'Flux', 'Volt']
const AGENT_EMOJIS = ['🤖', '⚡', '🔥', '🌊', '🌿', '💫', '🔮', '⭐']
const BLENDED_COST_PER_MILLION_TOKENS = 5
const CONDUCTOR_GOAL_DRAFT_STORAGE_KEY = 'conductor:goal-draft'

function loadConductorGoalDraft(): string {
  try {
    return globalThis.localStorage?.getItem(CONDUCTOR_GOAL_DRAFT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistConductorGoalDraft(value: string): void {
  try {
    if (value.trim()) {
      globalThis.localStorage?.setItem(CONDUCTOR_GOAL_DRAFT_STORAGE_KEY, value)
    } else {
      globalThis.localStorage?.removeItem(CONDUCTOR_GOAL_DRAFT_STORAGE_KEY)
    }
  } catch {
    // Ignore storage failures; the in-memory state still works.
  }
}

function getAgentPersona(index: number) {
  return {
    name: AGENT_NAMES[index % AGENT_NAMES.length],
    emoji: AGENT_EMOJIS[index % AGENT_EMOJIS.length],
  }
}

function estimateTokenCost(totalTokens: number): number {
  return (Math.max(0, totalTokens) / 1_000_000) * BLENDED_COST_PER_MILLION_TOKENS
}

function formatUsd(value: number): string {
  return `$${value.toFixed(value >= 0.1 ? 2 : 3)}`
}

function MissionCostSection({ totalTokens, workers, expanded, onToggle }: { totalTokens: number; workers: MissionCostWorker[]; expanded: boolean; onToggle: () => void }) {
  const estimatedCost = estimateTokenCost(totalTokens)

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-start justify-between gap-4 text-left">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Mission Cost</p>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">Approximate at $5 / 1M tokens blended from input/output pricing.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-xs font-medium text-[var(--theme-text)]">
          {expanded ? 'Hide' : 'Show'}
          <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.7} className={cn('transition-transform duration-200', expanded ? 'rotate-180' : 'rotate-0')} />
        </span>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Total Tokens</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">{totalTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Estimated Cost</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">{formatUsd(estimatedCost)}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]">
            <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              <span>Workers</span>
              <span>Cost</span>
            </div>
            {workers.length > 0 ? (
              <div className="divide-y divide-[var(--theme-border)]">
                {workers.map((worker) => (
                  <div key={worker.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="font-medium text-[var(--theme-text)]">
                      {worker.personaEmoji} {worker.personaName}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[var(--theme-muted)]">{worker.label}</span>
                    <span className="text-xs text-[var(--theme-muted)]">{worker.totalTokens.toLocaleString()} tok</span>
                    <span className="min-w-[4.5rem] text-right font-medium text-[var(--theme-text)]">{formatUsd(estimateTokenCost(worker.totalTokens))}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm text-[var(--theme-muted)]">Per-worker token details were not captured for this mission.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

const PLANNING_STEPS = ['Planning the mission…', 'Analyzing requirements…', 'Preparing agents…', 'Writing the spec…']
const WORKING_STEPS = [
  '📋 Reviewing the brief…',
  '🔍 Scanning existing patterns…',
  '✏️ Drafting the implementation…',
  '☕ Grabbing a coffee…',
  '🧠 Thinking through edge cases…',
  '🎨 Polishing the design…',
  '🔧 Wiring up components…',
  '📐 Checking the layout…',
  '🚀 Almost there…',
]

function CyclingStatus({ steps, intervalMs = 3000, isPaused = false }: { steps: string[]; intervalMs?: number; isPaused?: boolean }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (isPaused) return
    const timer = window.setInterval(() => setStep((current) => (current + 1) % steps.length), intervalMs)
    return () => window.clearInterval(timer)
  }, [isPaused, steps.length, intervalMs])

  if (isPaused) {
    return (
      <div className="flex items-center gap-3 py-3">
        <div className="flex size-3.5 items-center justify-center rounded-full border border-amber-400/60 bg-amber-500/10 text-[9px] text-amber-300">||</div>
        <p className="text-sm text-[var(--theme-muted)]">Paused</p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="size-3.5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
      <p className="text-sm text-[var(--theme-muted)] transition-opacity duration-500">{steps[step]}</p>
    </div>
  )
}

function PlanningIndicator() {
  return <CyclingStatus steps={PLANNING_STEPS} intervalMs={2500} />
}

function getOutputDisplayName(projectPath: string | null | undefined): string {
  if (!projectPath) return 'Output ready'
  return projectPath.split('/').pop() || 'index.html'
}

function formatMissionTimestamp(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function buildProjectPathCandidates(workers: Array<{ label: string }>, missionStartedAt: string | null | undefined): string[] {
  const timestamp = formatMissionTimestamp(missionStartedAt)
  const candidates = new Set<string>()

  for (const worker of workers) {
    const label = worker.label ?? ''
    const slug = label.replace(/^worker-/, '').trim()
    if (!slug) continue

    candidates.add(`/tmp/dispatch-${slug}`)
    candidates.add(`/tmp/dispatch-${slug}-page`)

    if (timestamp) {
      candidates.add(`/tmp/dispatch-${slug}-${timestamp}`)
      candidates.add(`/tmp/dispatch-${slug}-${timestamp}-page`)
    }
  }

  return [...candidates]
}

function formatElapsedTime(startIso: string | null | undefined, now: number): string {
  if (!startIso) return '0s'
  const startMs = new Date(startIso).getTime()
  if (!Number.isFinite(startMs)) return '0s'
  return formatElapsedMilliseconds(now - startMs)
}

function formatElapsedMilliseconds(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function formatDurationRange(startIso: string | null | undefined, endIso: string | null | undefined, now: number): string {
  const endMs = endIso ? new Date(endIso).getTime() : now
  if (!Number.isFinite(endMs)) return formatElapsedTime(startIso, now)
  return formatElapsedTime(startIso, endMs)
}

function formatRelativeTime(value: string | null | undefined, now: number): string {
  if (!value) return 'just now'
  const ms = new Date(value).getTime()
  if (!Number.isFinite(ms)) return 'just now'
  const diffSeconds = Math.max(0, Math.floor((now - ms) / 1000))
  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  return `${diffHours}h ago`
}

function truncateContinuationText(text: string, limit = 500): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

function getWorkerDot(status: 'running' | 'complete' | 'stale' | 'idle') {
  if (status === 'complete') return { dotClass: 'bg-emerald-400', label: 'Complete' }
  if (status === 'running') return { dotClass: 'bg-sky-400 animate-pulse', label: 'Running' }
  if (status === 'idle') return { dotClass: 'bg-amber-400', label: 'Idle' }
  return { dotClass: 'bg-red-400', label: 'Stale' }
}

function getWorkerBorderClass(status: 'running' | 'complete' | 'stale' | 'idle') {
  if (status === 'complete') return 'border-l-emerald-400'
  if (status === 'running') return 'border-l-sky-400'
  if (status === 'idle') return 'border-l-amber-400'
  return 'border-l-red-400'
}

function WorkerCard({
  worker,
  index,
  conductor,
  now,
}: {
  worker: ReturnType<typeof useConductorGateway>['workers'][number]
  index: number
  conductor: Pick<ReturnType<typeof useConductorGateway>, 'workerOutputs' | 'isPaused' | 'pausedAtMs' | 'missionStartedAt'>
  now: number
}) {
  const dot = getWorkerDot(worker.status)
  const persona = getAgentPersona(index)
  const workerOutput = conductor.workerOutputs[worker.key] ?? getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)
  const workerStartedAt = typeof worker.raw.createdAt === 'string' ? worker.raw.createdAt : typeof worker.raw.startedAt === 'string' ? worker.raw.startedAt : conductor.missionStartedAt
  const workerEndTime =
    worker.status === 'complete' || worker.status === 'stale' ? new Date(worker.updatedAt ?? new Date().toISOString()).getTime() : conductor.isPaused ? (conductor.pausedAtMs ?? now) : now

  return (
    <div key={worker.key} className={cn('overflow-hidden rounded-2xl border border-[var(--theme-border)] border-l-4 bg-[var(--theme-card)] px-4 py-3', getWorkerBorderClass(worker.status))}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('size-2.5 rounded-full', dot.dotClass)} />
            <p className="truncate text-sm font-medium text-[var(--theme-text)]">
              {persona.emoji} {persona.name} <span className="text-[var(--theme-muted)]">·</span> {worker.label}
            </p>
          </div>
          <p className="mt-1 text-xs text-[var(--theme-muted-2)]">{worker.displayName}</p>
        </div>
        <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
          {dot.label}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
          <p className="text-[var(--theme-muted)]">Model</p>
          <p className="mt-1 truncate text-[var(--theme-text)]">{getShortModelName(worker.model)}</p>
        </div>
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
          <p className="text-[var(--theme-muted)]">Tokens</p>
          <p className="mt-1 text-[var(--theme-text)]">{worker.tokenUsageLabel}</p>
        </div>
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
          <p className="text-[var(--theme-muted)]">Elapsed</p>
          <p className="mt-1 text-[var(--theme-text)]">{formatElapsedTime(workerStartedAt, workerEndTime)}</p>
        </div>
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
          <p className="text-[var(--theme-muted)]">Last update</p>
          <p className="mt-1 text-[var(--theme-text)]">{formatRelativeTime(worker.updatedAt, now)}</p>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4">
        {workerOutput ? (
          <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{workerOutput}</Markdown>
        ) : (
          <CyclingStatus steps={WORKING_STEPS} intervalMs={3500} isPaused={conductor.isPaused} />
        )}
      </div>
    </div>
  )
}

function usePreviewAvailability(previewUrl: string | null, enabled: boolean) {
  const [failedProbes, setFailedProbes] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const lastProbeRef = useRef(0)

  useEffect(() => {
    setFailedProbes(0)
    setTimedOut(false)
    lastProbeRef.current = 0
  }, [enabled, previewUrl])

  useEffect(() => {
    if (!enabled || !previewUrl) return
    const timer = window.setTimeout(() => setTimedOut(true), 6_000)
    return () => window.clearTimeout(timer)
  }, [enabled, previewUrl])

  const exhausted = enabled && !!previewUrl && (failedProbes >= 4 || timedOut)

  const probeQuery = useQuery({
    queryKey: ['conductor', 'preview-probe', previewUrl],
    queryFn: async () => {
      if (!previewUrl) return false
      try {
        const res = await fetch(previewUrl)
        if (!res.ok) return false
        const text = await res.text()
        return text.length > 20 && (text.includes('<') || text.includes('html'))
      } catch {
        return false
      }
    },
    enabled: enabled && !!previewUrl && !exhausted,
    retry: false,
    refetchInterval: (query) => (query.state.data === true || exhausted ? false : 1_500),
    staleTime: 5_000,
  })

  useEffect(() => {
    if (!enabled || !previewUrl || probeQuery.data === true || probeQuery.dataUpdatedAt === 0) return
    if (lastProbeRef.current === probeQuery.dataUpdatedAt) return
    lastProbeRef.current = probeQuery.dataUpdatedAt
    setFailedProbes((current) => current + 1)
  }, [enabled, previewUrl, probeQuery.data, probeQuery.dataUpdatedAt])

  return {
    ready: probeQuery.data === true,
    loading: enabled && !!previewUrl && !exhausted && probeQuery.data !== true,
    unavailable: enabled && !!previewUrl && exhausted && probeQuery.data !== true,
  }
}

function getShortModelName(model: string | null | undefined): string {
  if (!model) return 'Unknown'
  const parts = model.split('/')
  return parts[parts.length - 1] || model
}

function getModelDisplayName(model: AvailableModel | undefined, modelId: string | null | undefined): string {
  if (!modelId) return 'Default (auto)'
  return model?.name?.trim() || model?.id?.trim() || modelId
}

function getProviderLabel(provider: string | null | undefined): string {
  const raw = provider?.trim()
  if (!raw) return 'Unknown'
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function groupModelsByProvider(models: AvailableModel[]) {
  const groups = new Map<string, AvailableModel[]>()

  for (const model of models) {
    const provider = getProviderLabel(model.provider)
    const existing = groups.get(provider)
    if (existing) {
      existing.push(model)
    } else {
      groups.set(provider, [model])
    }
  }

  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([provider, providerModels]) => ({
      provider,
      models: [...providerModels].sort((a, b) => getModelDisplayName(a, a.id).localeCompare(getModelDisplayName(b, b.id))),
    }))
}

function getDirectoryPathSegments(pathValue: string): string[] {
  const normalized = pathValue.trim()
  if (!normalized) return ['~']
  if (normalized === '~') return ['~']
  if (normalized.startsWith('~/')) {
    return ['~', ...normalized.slice(2).split('/').filter(Boolean)]
  }
  if (normalized === '/') return ['/']
  if (normalized.startsWith('/')) {
    return ['/', ...normalized.slice(1).split('/').filter(Boolean)]
  }
  return normalized.split('/').filter(Boolean)
}

function buildDirectoryPathFromSegments(segments: string[]): string {
  if (segments.length === 0) return '~'
  if (segments[0] === '~') {
    return segments.length === 1 ? '~' : `~/${segments.slice(1).join('/')}`
  }
  if (segments[0] === '/') {
    return segments.length === 1 ? '/' : `/${segments.slice(1).join('/')}`
  }
  return segments.join('/')
}

function getParentDirectory(pathValue: string): string {
  const segments = getDirectoryPathSegments(pathValue)
  if (segments.length <= 1) return pathValue.startsWith('/') ? '/' : '~'
  return buildDirectoryPathFromSegments(segments.slice(0, -1))
}

function getDirectorySuggestions() {
  return ['~/conductor-projects', '~/Projects', '/tmp', '~/Desktop']
}

function ModelSelectorDropdown({
  label,
  value,
  onChange,
  models,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (nextValue: string) => void
  models: AvailableModel[]
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (containerRef.current.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const selectedModel = models.find((model) => (model.id ?? '') === value)
  const groupedModels = useMemo(() => groupModelsByProvider(models), [models])

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-[var(--theme-text)]">{label}</span>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => {
            if (disabled) return
            setOpen((current) => !current)
          }}
          className={cn(
            'inline-flex min-h-[3rem] w-full items-center justify-between gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-left text-sm text-[var(--theme-text)] shadow-[0_8px_24px_color-mix(in_srgb,var(--theme-shadow)_18%,transparent)] transition-colors',
            disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-[var(--theme-accent)] focus:border-[var(--theme-accent)]',
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1 text-xs font-medium text-[var(--theme-text)]">
              <span className={cn('size-2 rounded-full', value ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border2)]')} />
              <span className="truncate">{getModelDisplayName(selectedModel, value)}</span>
            </span>
          </span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={16} strokeWidth={1.8} className={cn('shrink-0 text-[var(--theme-muted)] transition-transform', open && 'rotate-180')} />
        </button>

        {open ? (
          <div className="absolute left-0 top-[calc(100%+0.5rem)] z-[80] w-full overflow-hidden rounded-2xl border border-[var(--theme-border2)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)]">
            <div className="max-h-80 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                  !value ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-text)]' : 'text-[var(--theme-text)] hover:bg-[var(--theme-bg)]',
                )}
                role="option"
                aria-selected={!value}
              >
                <span className={cn('size-2 rounded-full', !value ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border2)]')} />
                <span className="min-w-0 flex-1 truncate">Default (auto)</span>
                <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">Auto</span>
              </button>

              {groupedModels.map((group) => (
                <div key={group.provider} className="mt-2 first:mt-3">
                  <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">{group.provider}</div>
                  <div className="space-y-1">
                    {group.models.map((model) => {
                      const modelId = model.id ?? ''
                      const active = modelId === value
                      return (
                        <button
                          key={`${group.provider}-${modelId}`}
                          type="button"
                          onClick={() => {
                            onChange(modelId)
                            setOpen(false)
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                            active ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-text)]' : 'text-[var(--theme-text)] hover:bg-[var(--theme-bg)]',
                          )}
                          role="option"
                          aria-selected={active}
                        >
                          <span className={cn('size-2 rounded-full', active ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-border2)]')} />
                          <span className="min-w-0 flex-1 truncate">{getModelDisplayName(model, modelId)}</span>
                          <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--theme-muted)]">
                            {group.provider}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function extractMessageText(message: HistoryMessage | undefined): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function getLastAssistantMessage(messages: HistoryMessage[] | undefined): string {
  if (!Array.isArray(messages)) return ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'assistant') continue
    const text = extractMessageText(message)
    if (text.trim()) return text.trim()
  }
  return ''
}

function extractProjectPath(text: string): string | null {
  const structuredPatterns = [
    /\b(?:Created|Output|Wrote|Saved to|Built|Generated|Written to)\s+(\/tmp\/dispatch-[^\s"')`\]>]+)/gi,
    /\b(?:Created|Output|Wrote|Saved to|Built|Generated|Written to)\s*:\s*(\/tmp\/dispatch-[^\s"')`\]>]+)/gi,
  ]

  for (const pattern of structuredPatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1]
      if (!raw) continue
      const cleaned = raw.replace(/[.,;:!?`]+$/, '')
      const normalized = cleaned.replace(/\/(index\.html|dist|build)\/?$/i, '')
      if (normalized.startsWith('/tmp/dispatch-')) return normalized
    }
  }

  const matches = text.match(/\/tmp\/dispatch-[^\s"')`\]>]+/g) ?? []
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,;:!?\-`]+$/, '')
    const normalized = cleaned.replace(/\/(index\.html|dist|build)\/?$/i, '')
    if (normalized.startsWith('/tmp/dispatch-')) return normalized
  }

  const tmpMatches = text.match(/\/tmp\/[a-zA-Z0-9][^\s"')`\]>]+/g) ?? []
  for (const raw of tmpMatches) {
    const cleaned = raw.replace(/[.,;:!?\-`]+$/, '')
    const normalized = cleaned.replace(/\/(index\.html|dist|build)\/?$/i, '')
    if (normalized.length > 5) return normalized
  }

  return null
}

function deriveSessionStatus(session: GatewaySession): 'running' | 'completed' | 'failed' {
  const updatedMs = new Date(session.updatedAt as string).getTime()
  const staleness = Number.isFinite(updatedMs) ? Date.now() - updatedMs : 0
  const tokens = typeof session.totalTokens === 'number' ? session.totalTokens : 0
  const statusText = `${session.status ?? ''} ${session.state ?? ''}`.toLowerCase()

  if (statusText.includes('error') || statusText.includes('failed')) return 'failed'
  if (tokens > 0 && staleness > 30_000) return 'completed'
  if (staleness > 120_000 && tokens === 0) return 'failed'
  return 'running'
}

export function Conductor() {
  const conductor = useConductorGateway()
  const [goalDraft, setGoalDraft] = useState(() => loadConductorGoalDraft())
  const [missionModalOpen, setMissionModalOpen] = useState(false)
  const [continueDraft, setContinueDraft] = useState('')
  const [continueModalOpen, setContinueModalOpen] = useState(false)
  const [selectedAction, setSelectedAction] = useState<QuickActionId>('build')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activityFilter, setActivityFilter] = useState<'all' | 'completed' | 'failed'>('all')
  const [activityPage, setActivityPage] = useState(0)
  const [completeCostExpanded, setCompleteCostExpanded] = useState(true)
  const [historyCostExpanded, setHistoryCostExpanded] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [directoryBrowserOpen, setDirectoryBrowserOpen] = useState(false)
  const [directoryBrowserPath, setDirectoryBrowserPath] = useState('~')
  const [directoryBrowserEntries, setDirectoryBrowserEntries] = useState<FileBrowserEntry[]>([])
  const [directoryBrowserLoading, setDirectoryBrowserLoading] = useState(false)
  const [directoryBrowserError, setDirectoryBrowserError] = useState<string | null>(null)
  const modelsQuery = useQuery({
    queryKey: ['conductor', 'models'],
    queryFn: async () => {
      const res = await fetch('/api/models')
      const data = (await res.json()) as {
        ok?: boolean
        models?: Array<{ id?: string; provider?: string; name?: string }>
      }
      return data.models ?? []
    },
    enabled: settingsOpen,
    staleTime: 60_000,
  })
  const availableModels = modelsQuery.data ?? []

  useEffect(() => {
    if (!directoryBrowserOpen) return

    let cancelled = false

    const loadDirectory = async () => {
      setDirectoryBrowserLoading(true)
      setDirectoryBrowserError(null)

      try {
        const res = await fetch(`/api/files?path=${encodeURIComponent(directoryBrowserPath)}`)
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
          root?: string
          entries?: Array<FileBrowserEntry>
        }

        if (!res.ok) {
          throw new Error(data.error || 'Failed to load directory')
        }

        if (cancelled) return
        setDirectoryBrowserPath(typeof data.root === 'string' && data.root.trim() ? data.root : directoryBrowserPath)
        setDirectoryBrowserEntries(Array.isArray(data.entries) ? data.entries.filter((entry) => entry?.type === 'folder') : [])
      } catch (error) {
        if (cancelled) return
        setDirectoryBrowserEntries([])
        setDirectoryBrowserError(error instanceof Error ? error.message : 'Failed to load directory')
      } finally {
        if (!cancelled) {
          setDirectoryBrowserLoading(false)
        }
      }
    }

    void loadDirectory()

    return () => {
      cancelled = true
    }
  }, [directoryBrowserOpen, directoryBrowserPath])

  useEffect(() => {
    if (conductor.phase === 'idle' || conductor.phase === 'complete' || conductor.isPaused) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [conductor.isPaused, conductor.phase])

  useEffect(() => {
    persistConductorGoalDraft(goalDraft)
  }, [goalDraft])

  useEffect(() => {
    if (!conductor.isPaused) return
    setNow(conductor.pausedAtMs ?? Date.now())
  }, [conductor.isPaused, conductor.pausedAtMs])

  // Set body background to match Conductor theme so no gray shows behind keyboard/tab bar
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = 'var(--color-surface)'
    return () => {
      document.body.style.backgroundColor = prev
    }
  }, [])

  const phase: ConductorPhase = useMemo(() => {
    if (conductor.phase === 'idle') return 'home'
    if (conductor.phase === 'decomposing') return 'preview'
    if (conductor.phase === 'running') return 'active'
    return 'complete'
  }, [conductor.phase])

  const handleNewMission = () => {
    conductor.resetMission()
    setGoalDraft('')
    persistConductorGoalDraft('')
    setMissionModalOpen(false)
    setContinueDraft('')
    setContinueModalOpen(false)
    setSelectedTaskId(null)
  }

  const handleSubmit = async () => {
    const trimmed = goalDraft.trim()
    if (!trimmed) return
    setMissionModalOpen(false)
    setContinueDraft('')
    await conductor.sendMission(trimmed)
    persistConductorGoalDraft('')
    setGoalDraft('')
  }

  const handleQuickActionSelect = (action: (typeof QUICK_ACTIONS)[number]) => {
    setSelectedAction(action.id)
    setGoalDraft((current) => {
      const trimmed = current.trim()
      if (!trimmed) return `${action.label}: `
      if (trimmed.toLowerCase().startsWith(`${action.label.toLowerCase()}:`)) return current
      return `${action.label}: ${trimmed}`
    })
  }

  const handleContinueMission = async () => {
    const trimmedInstructions = continueDraft.trim()
    if (!trimmedInstructions) return

    const continuationSummarySource =
      completeSummary ??
      Object.values(conductor.workerOutputs).find((output) => output.trim()) ??
      conductor.workers.map((worker) => getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)).find((output) => output.trim()) ??
      conductor.streamText

    const combinedPrompt = [
      'CONTINUATION OF PREVIOUS MISSION',
      `Original goal: ${conductor.goal}`,
      `Previous output summary: ${truncateContinuationText(continuationSummarySource ?? '')}`,
      `New instructions: ${trimmedInstructions}`,
      '',
      'Please continue building on the previous work.',
    ].join('\n')

    setContinueDraft('')
    setContinueModalOpen(false)
    await conductor.sendMission(combinedPrompt)
  }

  const updateSettings = (patch: Partial<typeof conductor.conductorSettings>) => {
    conductor.setConductorSettings({ ...conductor.conductorSettings, ...patch })
  }

  const openDirectoryBrowser = () => {
    setDirectoryBrowserPath(conductor.conductorSettings.projectsDir.trim() || '~')
    setDirectoryBrowserEntries([])
    setDirectoryBrowserError(null)
    setDirectoryBrowserOpen(true)
  }

  const closeDirectoryBrowser = () => {
    setDirectoryBrowserOpen(false)
    setDirectoryBrowserLoading(false)
    setDirectoryBrowserError(null)
  }

  const directoryBreadcrumbs = useMemo(() => {
    const segments = getDirectoryPathSegments(directoryBrowserPath)
    return segments.map((segment, index) => ({
      label: segment === '/' ? 'Root' : segment,
      path: buildDirectoryPathFromSegments(segments.slice(0, index + 1)),
    }))
  }, [directoryBrowserPath])

  const totalWorkers = conductor.workers.length
  const completedWorkers = conductor.workers.filter((worker) => worker.status === 'complete').length
  const activeWorkerCount = conductor.activeWorkers.length
  const missionProgress = totalWorkers > 0 ? Math.round((completedWorkers / totalWorkers) * 100) : 0
  const totalTokens = conductor.workers.reduce((sum, worker) => sum + worker.totalTokens, 0)
  const selectedHistoryEntry = conductor.selectedHistoryEntry
  const completeMissionCostWorkers = useMemo<MissionCostWorker[]>(
    () =>
      conductor.workers.map((worker, index) => {
        const persona = getAgentPersona(index)
        return {
          id: worker.key,
          label: worker.label,
          totalTokens: worker.totalTokens,
          personaEmoji: persona.emoji,
          personaName: persona.name,
        }
      }),
    [conductor.workers],
  )
  const historyMissionCostWorkers = useMemo<MissionCostWorker[]>(
    () =>
      (selectedHistoryEntry?.workerDetails ?? []).map((worker, index) => ({
        id: `${selectedHistoryEntry?.id ?? 'history'}-${index}`,
        label: worker.label,
        totalTokens: worker.totalTokens,
        personaEmoji: worker.personaEmoji,
        personaName: worker.personaName,
      })),
    [selectedHistoryEntry],
  )
  const OFFICE_NAMES = ['Nova', 'Pixel', 'Blaze', 'Echo', 'Sage', 'Drift']
  const homeOfficeRows = useMemo<AgentWorkingRow[]>(() => {
    const sessions = conductor.recentSessions
    if (sessions.length === 0) {
      return OFFICE_NAMES.slice(0, 3).map((name, i) => ({
        id: `placeholder-${i}`,
        name,
        modelId: 'auto',
        status: 'idle' as const,
        lastLine: 'Waiting for work…',
        taskCount: 0,
        roleDescription: 'Worker',
      }))
    }
    return sessions.slice(0, 6).map((session, i) => {
      const s = session as GatewaySession
      const updatedAt = typeof s.updatedAt === 'string' ? new Date(s.updatedAt).getTime() : typeof s.updatedAt === 'number' ? s.updatedAt : 0
      const statusText = `${s.status ?? ''} ${s.kind ?? ''}`.toLowerCase()
      const status = /error|failed/.test(statusText) ? ('error' as const) : /pause/.test(statusText) ? ('paused' as const) : Date.now() - updatedAt < 120_000 ? ('active' as const) : ('idle' as const)
      return {
        id: s.key ?? `session-${i}`,
        name: OFFICE_NAMES[i % OFFICE_NAMES.length],
        modelId: s.model ?? 'auto',
        status,
        lastLine: s.task ?? s.label ?? s.title ?? s.derivedTitle ?? 'Working…',
        lastAt: updatedAt || undefined,
        taskCount: 0,
        roleDescription: s.label ?? 'Worker',
        sessionKey: s.key ?? undefined,
      }
    })
  }, [conductor.recentSessions])

  const officeAgentRows = useMemo<AgentWorkingRow[]>(() => {
    if (conductor.workers.length > 0) {
      return conductor.workers.map((worker, index) => {
        const persona = getAgentPersona(index)
        const currentTask = conductor.tasks.find((task) => task.workerKey === worker.key && task.status === 'running')?.title
        const lastLine = conductor.workerOutputs[worker.key] ?? getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)
        const isWorkerPaused = conductor.isPaused && (worker.status === 'running' || worker.status === 'idle')

        return {
          id: worker.key,
          name: persona.name,
          modelId: worker.model || 'auto',
          roleDescription: worker.displayName,
          status: isWorkerPaused ? 'paused' : worker.status === 'complete' ? 'idle' : worker.status === 'stale' ? 'error' : 'active',
          lastLine: isWorkerPaused ? 'Paused' : lastLine,
          lastAt: worker.updatedAt ? new Date(worker.updatedAt).getTime() : undefined,
          taskCount: conductor.tasks.filter((task) => task.workerKey === worker.key).length,
          currentTask: isWorkerPaused ? 'Paused' : currentTask,
          sessionKey: worker.key,
        }
      })
    }

    return [
      {
        id: 'conductor-placeholder-agent',
        name: 'Nova',
        modelId: conductor.conductorSettings.workerModel || 'auto',
        roleDescription: 'Waiting for workers',
        status: 'spawning',
        lastLine: conductor.goal || 'Preparing the office…',
        taskCount: 0,
        currentTask: conductor.goal || 'Preparing the office…',
        sessionKey: 'conductor-placeholder-agent',
      },
    ]
  }, [conductor.conductorSettings.workerModel, conductor.goal, conductor.isPaused, conductor.tasks, conductor.workerOutputs, conductor.workers])

  const completePhaseProjectPath = useMemo(() => {
    const workerOutputTexts = [...Object.values(conductor.workerOutputs), ...conductor.workers.map((worker) => getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined))].filter(
      Boolean,
    )

    for (const text of workerOutputTexts) {
      const extractedPath = extractProjectPath(text)
      if (extractedPath) return extractedPath
    }

    for (const task of conductor.tasks) {
      if (!task.output) continue
      const extractedPath = extractProjectPath(task.output)
      if (extractedPath) return extractedPath
    }

    const streamPath = extractProjectPath(conductor.streamText)
    if (streamPath) return streamPath

    const candidates = buildProjectPathCandidates(conductor.workers, conductor.missionStartedAt)
    return candidates[0] ?? null
  }, [conductor.tasks, conductor.streamText, conductor.workerOutputs, conductor.workers, conductor.missionStartedAt])
  const completePhaseOutputLabel = useMemo(() => getOutputDisplayName(completePhaseProjectPath), [completePhaseProjectPath])

  const previewUrl = completePhaseProjectPath ? `/api/preview-file?path=${encodeURIComponent(`${completePhaseProjectPath}/index.html`)}` : null

  const selectedHistoryOutputPath = useMemo(() => {
    const entry = conductor.selectedHistoryEntry
    if (!entry) return null
    if (entry.outputPath) return entry.outputPath
    if (entry.projectPath) return entry.projectPath
    const extractedOutputPath = extractProjectPath(entry.outputText ?? '') ?? extractProjectPath(entry.streamText ?? '')
    if (extractedOutputPath) return extractedOutputPath
    const candidates = buildProjectPathCandidates(
      (entry.workerDetails ?? []).map((worker) => ({ label: worker.label })),
      entry.startedAt,
    )
    return candidates[0] ?? null
  }, [conductor.selectedHistoryEntry])
  const selectedHistoryOutputLabel = useMemo(() => getOutputDisplayName(selectedHistoryOutputPath), [selectedHistoryOutputPath])
  const selectedHistoryPreviewUrl = selectedHistoryOutputPath ? `/api/preview-file?path=${encodeURIComponent(`${selectedHistoryOutputPath}/index.html`)}` : null

  // Skip preview probe for history entries — /tmp files are ephemeral and won't exist later.
  // Only probe if the mission just completed (still in complete phase with matching output path).
  const isLiveCompletePreview = phase === 'complete' && !!completePhaseProjectPath && selectedHistoryOutputPath === completePhaseProjectPath
  const selectedHistoryPreview = usePreviewAvailability(selectedHistoryPreviewUrl, !!conductor.selectedHistoryEntry && isLiveCompletePreview)
  const previewState = usePreviewAvailability(previewUrl, phase === 'complete')

  const completedTaskOutputs = useMemo(() => {
    return conductor.tasks
      .filter((task) => task.output)
      .map((task) => ({
        ...task,
        extractedPath: extractProjectPath(task.output ?? ''),
        previewUrl: (() => {
          const extractedPath = extractProjectPath(task.output ?? '')
          return extractedPath ? `/api/preview-file?path=${encodeURIComponent(`${extractedPath}/index.html`)}` : null
        })(),
        previewText: (task.output ?? '').trim().slice(0, 200),
      }))
  }, [conductor.tasks])

  const completeSummary = useMemo(() => {
    if (phase !== 'complete') return null
    const isFailed = !!conductor.streamError
    const lines = [
      isFailed ? `❌ ${conductor.streamError}` : '✅ Mission completed successfully',
      '',
      `**Goal:** ${conductor.goal}`,
      `**Duration:** ${formatElapsedTime(conductor.missionStartedAt, conductor.completedAt ? new Date(conductor.completedAt).getTime() : now)}`,
    ]
    if (totalWorkers > 0) {
      lines.push(`**Workers:** ${totalWorkers} ran · ${totalTokens.toLocaleString()} tokens`)
    }
    if (completePhaseProjectPath) {
      lines.push(`**Output:** ${completePhaseOutputLabel}`)
    }
    return lines.join('\n')
  }, [phase, completePhaseProjectPath, completePhaseOutputLabel, totalWorkers, conductor.goal, totalTokens, conductor.missionStartedAt, now])
  const continuationPreview = useMemo(() => {
    const summarySource =
      completeSummary ??
      Object.values(conductor.workerOutputs).find((output) => output.trim()) ??
      conductor.workers.map((worker) => getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)).find((output) => output.trim()) ??
      conductor.streamText
    return truncateContinuationText(summarySource ?? '')
  }, [completeSummary, conductor.streamText, conductor.workerOutputs, conductor.workers])
  const continuationModalPreview = useMemo(() => truncateContinuationText(continuationPreview, 200), [continuationPreview])
  const hasMissionHistory = conductor.missionHistory.length > 0
  const canResetSavedState = hasMissionHistory || conductor.hasPersistedMission
  const filteredHistory = (() => {
    const history = conductor.missionHistory
    if (activityFilter === 'all') return history
    return history.filter((entry) => entry.status === activityFilter)
  })()
  const filteredSessions = (() => {
    const sessions = conductor.recentSessions
    if (activityFilter === 'all') return sessions
    return sessions.filter((session) => ((session.label as string) ?? '').startsWith('worker-')).filter((session) => deriveSessionStatus(session as GatewaySession) === activityFilter)
  })()
  const activityItems: Array<MissionHistoryEntry | GatewaySession> = hasMissionHistory ? filteredHistory : filteredSessions
  const ACTIVITY_PAGE_SIZE = 3
  const activityTotalPages = Math.max(1, Math.ceil(activityItems.length / ACTIVITY_PAGE_SIZE))
  const safeActivityPage = Math.min(activityPage, activityTotalPages - 1)
  const visibleActivityItems = activityItems.slice(safeActivityPage * ACTIVITY_PAGE_SIZE, (safeActivityPage + 1) * ACTIVITY_PAGE_SIZE)

  useEffect(() => {
    if (!selectedTaskId) return
    if (conductor.tasks.some((task) => task.id === selectedTaskId)) return
    setSelectedTaskId(null)
  }, [conductor.tasks, selectedTaskId])

  useEffect(() => {
    if (phase !== 'complete') return
    setCompleteCostExpanded(true)
  }, [phase, conductor.completedAt])

  useEffect(() => {
    if (!selectedHistoryEntry) return
    setHistoryCostExpanded(false)
  }, [selectedHistoryEntry])

  if (phase === 'home') {
    if (selectedHistoryEntry) {
      const historyWorkerDetails = selectedHistoryEntry.workerDetails ?? []
      const historySummary = selectedHistoryEntry.completeSummary ?? selectedHistoryEntry.streamText
      const historyOutputText = selectedHistoryEntry.outputText?.trim() || selectedHistoryEntry.streamText?.trim() || ''
      const showHistoryOutputFallback = !!historyOutputText && (!selectedHistoryOutputPath || selectedHistoryPreview.unavailable)
      const historyStatusLabel = selectedHistoryEntry.status === 'completed' ? 'Complete' : 'Stopped'
      const historyStatusClasses =
        selectedHistoryEntry.status === 'completed' ? 'border border-emerald-400/35 bg-emerald-500/10 text-emerald-300' : 'border border-red-400/35 bg-red-500/10 text-red-300'

      return (
        <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
          <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-4 py-4 pb-4 md:pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => conductor.setSelectedHistoryEntry(null)}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-border2)] hover:text-[var(--theme-text)]"
              >
                <span aria-hidden="true">←</span> Back
              </button>

              <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={cn('text-xs font-semibold uppercase tracking-[0.24em]', selectedHistoryEntry.status === 'completed' ? 'text-[var(--theme-accent)]' : 'text-red-400')}>
                      {selectedHistoryEntry.status === 'completed' ? 'Mission Complete' : 'Mission Stopped'}
                    </p>
                    <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--theme-text)] sm:text-2xl">{selectedHistoryEntry.goal}</h1>
                    <p className="mt-2 text-xs text-[var(--theme-muted-2)]">
                      {selectedHistoryEntry.workerCount}/{Math.max(selectedHistoryEntry.workerCount, 1)} workers finished ·{' '}
                      {formatDurationRange(selectedHistoryEntry.startedAt, selectedHistoryEntry.completedAt, now)} total elapsed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        conductor.setSelectedHistoryEntry(null)
                        handleNewMission()
                      }}
                      className="rounded-xl bg-[var(--theme-accent)] px-5 text-white hover:bg-[var(--theme-accent-strong)]"
                    >
                      New Mission
                    </Button>
                  </div>
                </div>
              </div>

              {selectedHistoryOutputPath && selectedHistoryPreview.ready ? (
                <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Output Preview</p>
                      <p className="mt-1 text-xs text-[var(--theme-muted-2)]">{selectedHistoryOutputLabel}</p>
                    </div>
                    <a
                      href={selectedHistoryPreviewUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
                    >
                      Open in new tab ↗
                    </a>
                  </div>
                  <div className="mt-4 overflow-auto rounded-2xl border border-[var(--theme-border)] bg-white">
                    <iframe src={selectedHistoryPreviewUrl!} className="h-[clamp(280px,55vh,520px)] w-full" sandbox="allow-scripts allow-same-origin" title="Mission history output preview" />
                  </div>
                </section>
              ) : selectedHistoryOutputPath && selectedHistoryPreview.loading ? (
                <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                  <div className="flex items-center gap-3 text-sm text-[var(--theme-muted)]">
                    <div className="size-4 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)]" />
                    Loading output preview…
                  </div>
                </section>
              ) : selectedHistoryOutputPath && selectedHistoryPreview.unavailable ? (
                showHistoryOutputFallback ? null : (
                  <p className="px-1 text-sm text-[var(--theme-muted)]">No preview available.</p>
                )
              ) : null}

              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Agent Summary</p>
                  </div>
                  <span className={cn('rounded-full px-3 py-1 text-xs font-medium', historyStatusClasses)}>{historyStatusLabel}</span>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                  {historySummary ? (
                    <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{historySummary}</Markdown>
                  ) : (
                    <p className="text-sm text-[var(--theme-muted)]">No summary captured.</p>
                  )}
                </div>
                {historyWorkerDetails.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {historyWorkerDetails.map((worker: MissionHistoryWorkerDetail, index) => (
                      <div key={`${selectedHistoryEntry.id}-worker-${index}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                        <span className={cn('size-2 rounded-full', selectedHistoryEntry.status === 'completed' ? 'bg-emerald-400' : 'bg-red-400')} />
                        <span className="font-medium text-[var(--theme-text)]">
                          {worker.personaEmoji} {worker.personaName}
                        </span>
                        <span className="text-[var(--theme-muted)]">{worker.label}</span>
                        <span className="ml-auto text-xs text-[var(--theme-muted)]">
                          {getShortModelName(worker.model)} · {worker.totalTokens.toLocaleString()} tok
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {(selectedHistoryEntry.totalTokens > 0 || historyMissionCostWorkers.length > 0) && (
                  <div className="mt-4">
                    <MissionCostSection
                      totalTokens={selectedHistoryEntry.totalTokens}
                      workers={historyMissionCostWorkers}
                      expanded={historyCostExpanded}
                      onToggle={() => setHistoryCostExpanded((current) => !current)}
                    />
                  </div>
                )}
                {selectedHistoryEntry.streamText && selectedHistoryEntry.completeSummary && (
                  <details className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                    <summary className="cursor-pointer text-xs font-medium text-[var(--theme-muted)]">Raw Agent Output</summary>
                    <div className="mt-4 border-t border-[var(--theme-border)] pt-4">
                      <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{selectedHistoryEntry.streamText}</Markdown>
                    </div>
                  </details>
                )}
              </section>

              {showHistoryOutputFallback ? (
                <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Output</p>
                      <p className="mt-1 text-xs text-[var(--theme-muted-2)]">
                        Preview unavailable
                        {selectedHistoryOutputPath ? ` for ${selectedHistoryOutputLabel}` : ''}.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                    <Markdown className="max-h-[600px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{historyOutputText}</Markdown>
                  </div>
                </section>
              ) : historyOutputText ? (
                <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Worker Output</p>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                    <Markdown className="max-h-[600px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{historyOutputText}</Markdown>
                  </div>
                </section>
              ) : null}

              {!historySummary && historyWorkerDetails.length === 0 && !selectedHistoryOutputPath && !selectedHistoryEntry.workerSummary?.length && !historyOutputText && (
                <section className="overflow-hidden rounded-3xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
                  <p className="text-center text-sm text-[var(--theme-muted)]">
                    No detailed output was captured for this mission.
                    <br />
                    <span className="text-xs text-[var(--theme-muted-2)]">Missions run after this update will save full agent summaries and output previews.</span>
                  </p>
                </section>
              )}
            </div>
          </main>
        </div>
      )
    }

    return (
      <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col items-stretch justify-start px-4 py-4 pb-4 md:pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-6">
          <div className="w-full space-y-6">
            <div className="space-y-2 md:text-center">
              <div className="flex items-center gap-2">
                <div className="hidden md:block flex-1" />
                <div className="hidden md:inline-flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
                  <span>Conductor</span>
                  <span className="size-2.5 shrink-0 rounded-full bg-emerald-400" />
                </div>
                <div className="flex md:flex-1 items-center justify-end gap-2 ml-auto md:ml-0">
                  <WorkflowHelpModal
                    compact
                    eyebrow="Conductor"
                    title="How Conductor works"
                    sections={[
                      {
                        title: 'What Conductor is for',
                        bullets: [
                          'Conductor is the mission-level orchestration surface for coordinated agent execution.',
                          'Use it when one goal should be planned, assigned, and tracked end to end.',
                        ],
                      },
                      {
                        title: 'Typical flow',
                        bullets: [
                          'Start a mission, watch worker progress, and intervene only when something is blocked or clearly off-course.',
                          'Use the mission views to understand what happened before retrying or launching the next mission.',
                        ],
                      },
                      {
                        title: 'FAQ',
                        bullets: [
                          'If Conductor says upstream is unavailable, the underlying runtime capability is not ready yet.',
                          'Conductor is for orchestration, not first-time setup. Fix setup issues in Operations first.',
                        ],
                      },
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() => setMissionModalOpen(true)}
                    className="inline-flex items-center justify-center rounded-xl bg-[var(--theme-accent)] p-2 text-white shadow-sm transition-colors hover:bg-[var(--theme-accent-strong)]"
                    aria-label="New Mission"
                  >
                    <HugeiconsIcon icon={Rocket01Icon} size={18} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="inline-flex items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-2 text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    aria-label="Open conductor settings"
                  >
                    <HugeiconsIcon icon={Settings01Icon} size={18} strokeWidth={1.7} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-[var(--theme-muted-2)]">Launch a mission and watch your agent team build it live.</p>
            </div>

            <section className="h-[280px] overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)] md:h-[520px]">
              <OfficeView
                agentRows={homeOfficeRows}
                missionRunning={homeOfficeRows.some((a) => a.status === 'active')}
                onViewOutput={() => {}}
                processType="parallel"
                companyName=""
                containerHeight={520}
                hideHeader
              />
            </section>

            {hasMissionHistory || conductor.recentSessions.length > 0 ? (
              <section className="mt-6 w-full space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Recent Missions</h2>
                  {activityTotalPages > 1 && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--theme-muted-2)]">
                        {safeActivityPage + 1}/{activityTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={safeActivityPage === 0}
                        onClick={() => setActivityPage((p) => Math.max(0, p - 1))}
                        className="inline-flex size-6 items-center justify-center rounded-lg border border-[var(--theme-border)] text-xs text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] disabled:opacity-30"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        disabled={safeActivityPage >= activityTotalPages - 1}
                        onClick={() => setActivityPage((p) => Math.min(activityTotalPages - 1, p + 1))}
                        className="inline-flex size-6 items-center justify-center rounded-lg border border-[var(--theme-border)] text-xs text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] disabled:opacity-30"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {(['all', 'completed', 'failed'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => {
                        setActivityFilter(filter)
                        setActivityPage(0)
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1 text-[11px] font-medium capitalize transition-colors',
                        activityFilter === filter
                          ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                          : 'border-[var(--theme-border)] text-[var(--theme-muted-2)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]',
                      )}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                {visibleActivityItems.length > 0 ? (
                  <div className="min-h-[140px] space-y-1.5">
                    {hasMissionHistory
                      ? visibleActivityItems.map((item) => {
                          const entry = item as MissionHistoryEntry
                          return (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => conductor.setSelectedHistoryEntry(entry)}
                              className="flex w-full items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-left text-sm transition-colors hover:border-[var(--theme-accent)] sm:gap-3"
                            >
                              <span className="min-w-0 flex-1 truncate font-medium text-[var(--theme-text)]">{entry.goal}</span>
                              <span
                                className={cn(
                                  'w-[72px] shrink-0 rounded-full border px-2 py-0.5 text-center text-[10px] font-medium uppercase tracking-[0.12em]',
                                  entry.status === 'completed' ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300' : 'border-red-400/35 bg-red-500/10 text-red-300',
                                )}
                              >
                                {entry.status === 'completed' ? 'Complete' : 'Failed'}
                              </span>
                              <span className="w-[48px] shrink-0 text-right text-xs text-[var(--theme-muted-2)]">{formatRelativeTime(entry.completedAt, now)}</span>
                              <span className="hidden shrink-0 text-right text-xs text-[var(--theme-muted)] sm:inline">{entry.totalTokens.toLocaleString()} tok</span>
                            </button>
                          )
                        })
                      : visibleActivityItems.map((item) => {
                          const recentSession = item as GatewaySession
                          const label = recentSession.label ?? recentSession.key ?? ''
                          const displayName = label.replace(/^worker-/, '').replace(/[-_]+/g, ' ')
                          const tokens = typeof recentSession.totalTokens === 'number' ? recentSession.totalTokens : 0
                          const model = getShortModelName(recentSession.model)
                          const updatedAt =
                            typeof recentSession.updatedAt === 'string'
                              ? recentSession.updatedAt
                              : typeof recentSession.startedAt === 'string'
                                ? recentSession.startedAt
                                : typeof recentSession.createdAt === 'string'
                                  ? recentSession.createdAt
                                  : null
                          const sessionStatus = deriveSessionStatus(recentSession)
                          const dotClass = sessionStatus === 'completed' ? 'bg-emerald-400' : sessionStatus === 'failed' ? 'bg-red-400' : 'bg-sky-400 animate-pulse'

                          return (
                            <div key={recentSession.key} className="flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm sm:gap-3">
                              <span className="min-w-0 flex-1 truncate font-medium capitalize text-[var(--theme-text)]">{displayName}</span>
                              <span
                                className={cn(
                                  'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]',
                                  sessionStatus === 'completed'
                                    ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300'
                                    : sessionStatus === 'failed'
                                      ? 'border-red-400/35 bg-red-500/10 text-red-300'
                                      : 'border-sky-400/35 bg-sky-500/10 text-sky-300',
                                )}
                              >
                                <span className={cn('mr-1 inline-block size-1.5 rounded-full align-middle', dotClass)} />
                                {sessionStatus}
                              </span>
                              <span className="shrink-0 text-xs text-[var(--theme-muted-2)]">{formatRelativeTime(updatedAt, now)}</span>
                              <span className="hidden shrink-0 text-xs text-[var(--theme-muted)] sm:inline">{tokens.toLocaleString()} tok</span>
                              <span className="hidden shrink-0 text-xs text-[var(--theme-muted)] sm:inline">{model}</span>
                            </div>
                          )
                        })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-6 text-center text-sm text-[var(--theme-muted)]">
                    No {activityFilter === 'all' ? '' : `${activityFilter} `}
                    {hasMissionHistory ? 'missions' : 'sessions'} found
                  </div>
                )}
              </section>
            ) : (
              <section className="mt-6 w-full">
                <div className="rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-8 text-center">
                  <p className="text-sm text-[var(--theme-muted)]">No missions yet.</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Launch your first mission and it will appear here.</p>
                </div>
              </section>
            )}
          </div>

          {missionModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_48%,transparent)] px-4 py-6 backdrop-blur-md"
              onClick={() => setMissionModalOpen(false)}
            >
              <div
                className="w-full max-w-2xl rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)] sm:p-6"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-[var(--theme-text)]">New Mission</h2>
                    <p className="mt-1 text-sm text-[var(--theme-muted-2)]">Describe the mission, constraints, and desired outcome.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMissionModalOpen(false)}
                    className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-lg text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    aria-label="Close new mission dialog"
                  >
                    ×
                  </button>
                </div>

                <form
                  className="mt-5 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleSubmit()
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => handleQuickActionSelect(action)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                          selectedAction === action.id
                            ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]'
                            : 'border-[var(--theme-border)] bg-transparent text-[var(--theme-muted)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]',
                        )}
                      >
                        <HugeiconsIcon icon={action.icon} size={14} strokeWidth={1.7} />
                        {action.label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={goalDraft}
                    onChange={(event) => setGoalDraft(event.target.value)}
                    placeholder={`${QUICK_ACTIONS.find((action) => action.id === selectedAction)?.label ?? 'Build'}: describe the mission, constraints, and desired outcome.`}
                    disabled={conductor.isSending}
                    rows={8}
                    className="min-h-[220px] w-full rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-bg)] px-4 py-4 text-sm text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted-2)] focus:border-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-60 md:text-base"
                  />

                  <div className="flex justify-end">
                    <Button type="submit" disabled={!goalDraft.trim() || conductor.isSending} className="rounded-full bg-[var(--theme-accent)] px-5 text-white hover:bg-[var(--theme-accent-strong)]">
                      {conductor.isSending ? 'Launching...' : 'Launch Mission'}
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.7} />
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {settingsOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_55%,transparent)] px-4 py-6 backdrop-blur-md"
              onClick={() => setSettingsOpen(false)}
            >
              <div
                className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)] sm:p-6"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Mission Defaults</p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--theme-text)]">Conductor settings</h2>
                    <p className="mt-2 text-sm text-[var(--theme-muted-2)]">Set the models and defaults every new mission should inherit.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-lg text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    aria-label="Close settings"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  <ModelSelectorDropdown
                    label="Orchestrator Model"
                    value={conductor.conductorSettings.orchestratorModel}
                    onChange={(nextValue) => updateSettings({ orchestratorModel: nextValue })}
                    models={availableModels}
                  />

                  <ModelSelectorDropdown
                    label="Worker Model"
                    value={conductor.conductorSettings.workerModel}
                    onChange={(nextValue) => updateSettings({ workerModel: nextValue })}
                    models={availableModels}
                  />

                  <div className="space-y-2">
                    <span className="text-sm font-medium text-[var(--theme-text)]">Project Directory</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={conductor.conductorSettings.projectsDir}
                        onChange={(event) => updateSettings({ projectsDir: event.target.value })}
                        placeholder="~/conductor-projects"
                        className="min-w-0 flex-1 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted-2)] focus:border-[var(--theme-accent)]"
                      />
                      <button
                        type="button"
                        onClick={openDirectoryBrowser}
                        className="shrink-0 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-4 py-3 text-sm font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="text-xs text-[var(--theme-muted-2)]">Type a path directly or choose a directory from the browser.</p>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--theme-text)]">Max Parallel Workers</span>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={conductor.conductorSettings.maxParallel}
                      onChange={(event) =>
                        updateSettings({
                          maxParallel: Math.min(5, Math.max(1, Number(event.target.value) || 1)),
                        })
                      }
                      className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors focus:border-[var(--theme-accent)]"
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4">
                    <input
                      type="checkbox"
                      checked={conductor.conductorSettings.supervised}
                      onChange={(event) => updateSettings({ supervised: event.target.checked })}
                      className="mt-1 size-4 rounded border-[var(--theme-border2)] accent-[var(--theme-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--theme-text)]">Supervised Mode</span>
                      <span className="mt-1 block text-sm text-[var(--theme-muted-2)]">Require approval before each task</span>
                    </span>
                  </label>

                  {canResetSavedState ? (
                    <div className="flex items-center justify-between rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--theme-text)]">Reset saved state</p>
                        <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Clear mission history and any persisted Conductor mission state.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsOpen(false)
                          conductor.resetSavedState()
                          setGoalDraft('')
                          setContinueDraft('')
                          setSelectedTaskId(null)
                        }}
                        className="text-xs text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-accent)]"
                      >
                        Reset
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {directoryBrowserOpen ? (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_55%,transparent)] px-4 py-6 backdrop-blur-md" onClick={closeDirectoryBrowser}>
              <div
                className="w-full max-w-2xl rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)] sm:p-6"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Directory Browser</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-[var(--theme-text)]">Choose project directory</h3>
                    <p className="mt-2 text-sm text-[var(--theme-muted-2)]">Select the folder where Conductor should create project output.</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDirectoryBrowser}
                    className="inline-flex size-10 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-lg text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    aria-label="Close directory browser"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDirectoryBrowserPath(getParentDirectory(directoryBrowserPath))}
                      disabled={directoryBrowserLoading || getParentDirectory(directoryBrowserPath) === directoryBrowserPath}
                      className={cn(
                        'rounded-xl border px-3 py-2 text-sm font-medium transition-colors',
                        directoryBrowserLoading || getParentDirectory(directoryBrowserPath) === directoryBrowserPath
                          ? 'cursor-not-allowed border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] opacity-60'
                          : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]',
                      )}
                    >
                      Up
                    </button>
                    <div className="min-w-0 flex-1 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1 text-sm">
                        {directoryBreadcrumbs.map((crumb, index) => (
                          <div key={crumb.path} className="flex items-center gap-1">
                            {index > 0 ? <span className="text-[var(--theme-muted-2)]">/</span> : null}
                            <button
                              type="button"
                              onClick={() => setDirectoryBrowserPath(crumb.path)}
                              className={cn(
                                'rounded-md px-1.5 py-0.5 transition-colors',
                                crumb.path === directoryBrowserPath ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)]' : 'text-[var(--theme-text)] hover:bg-[var(--theme-card2)]',
                              )}
                            >
                              {crumb.label}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Current path</span>
                      <span className="truncate text-sm text-[var(--theme-text)]">{directoryBrowserPath}</span>
                    </div>
                  </div>

                  {directoryBrowserError ? (
                    <div className="rounded-2xl border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] px-4 py-3 text-sm text-[var(--theme-warning)]">{directoryBrowserError}</div>
                  ) : null}

                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)]">
                    <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Folders</span>
                      {directoryBrowserLoading ? (
                        <span className="text-xs text-[var(--theme-muted-2)]">Loading…</span>
                      ) : (
                        <span className="text-xs text-[var(--theme-muted-2)]">{directoryBrowserEntries.length} visible</span>
                      )}
                    </div>
                    <div className="max-h-[22rem] overflow-y-auto p-2">
                      {directoryBrowserLoading ? (
                        <div className="flex items-center justify-center gap-3 px-4 py-10 text-sm text-[var(--theme-muted)]">
                          <div className="size-4 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)]" />
                          <span>Loading folders…</span>
                        </div>
                      ) : directoryBrowserEntries.length > 0 ? (
                        <div className="space-y-1">
                          {directoryBrowserEntries.map((entry) => (
                            <button
                              key={entry.path}
                              type="button"
                              onClick={() => setDirectoryBrowserPath(entry.path)}
                              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]"
                            >
                              <span className="inline-flex size-2 rounded-full bg-[var(--theme-accent)]" />
                              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                              <span className="text-xs text-[var(--theme-muted)]">Open</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-10 text-center text-sm text-[var(--theme-muted)]">No folders found in this location.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">Quick paths</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {getDirectorySuggestions().map((pathOption) => (
                        <button
                          key={pathOption}
                          type="button"
                          onClick={() => setDirectoryBrowserPath(pathOption)}
                          className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                        >
                          {pathOption}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeDirectoryBrowser}
                      className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateSettings({ projectsDir: directoryBrowserPath })
                        closeDirectoryBrowser()
                      }}
                      className="rounded-xl bg-[var(--theme-accent)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--theme-accent-strong)]"
                    >
                      Select This Directory
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    )
  }

  if (phase === 'preview') {
    return (
      <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-4 py-4 pb-4 md:pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-accent)]">Mission Decomposition</p>
              <h1 className="text-2xl font-semibold tracking-tight">{conductor.goal}</h1>
              <p className="text-sm text-[var(--theme-muted-2)]">The agent is breaking the mission into workers. Once they spawn, this view flips into the active board.</p>
            </div>

            <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--theme-border)] pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Mission Planning</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Analyzing your request and preparing agents</p>
                </div>
                <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300 animate-pulse">Working</span>
              </div>
              <div className="mt-4 min-h-[200px] overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                {conductor.planText ? (
                  <div className="space-y-4">
                    <Markdown className="max-h-[500px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{conductor.planText.replace(/(.{20,}?)\1+/g, '$1')}</Markdown>
                    <PlanningIndicator />
                  </div>
                ) : (
                  <PlanningIndicator />
                )}
              </div>
              {conductor.streamError && <div className="mt-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">{conductor.streamError}</div>}
              {conductor.timeoutWarning && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-5 py-3">
                  <p className="text-sm text-amber-700">⚠️ Planning is taking longer than expected...</p>
                  <Button
                    type="button"
                    onClick={handleNewMission}
                    className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                  >
                    Cancel
                  </Button>
                </div>
              )}
              {conductor.tasks.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Identified Tasks ({conductor.tasks.length})</p>
                  {conductor.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-sm">
                      <span className="size-2 rounded-full bg-zinc-500" />
                      <span className="text-[var(--theme-text)]">{task.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    )
  }

  if (phase === 'complete') {
    return (
      <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
        <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-4 py-4 pb-4 md:pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
                Conductor
                <span className="size-2 rounded-full bg-emerald-400" />
              </div>
            </div>
            {conductor.streamError && (
              <div className="rounded-2xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-5 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 text-[var(--theme-danger)]">❌</span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--theme-danger)]">Mission failed</p>
                      <p className="mt-1 text-sm text-[var(--theme-danger)]/90">{conductor.streamError}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <WorkflowHelpModal
                      compact
                      eyebrow="Conductor"
                      title="How Conductor works"
                      sections={[
                        {
                          title: 'What Conductor is for',
                          bullets: [
                            'Conductor is the mission-level orchestration surface for coordinated agent execution.',
                            'Use it when one goal should be planned, assigned, and tracked end to end.',
                          ],
                        },
                        {
                          title: 'Typical flow',
                          bullets: [
                            'Start a mission, watch worker progress, and intervene only when something is blocked or clearly off-course.',
                            'Use the mission views to understand what happened before retrying or launching the next mission.',
                          ],
                        },
                        {
                          title: 'FAQ',
                          bullets: [
                            'If Conductor says upstream is unavailable, the underlying runtime capability is not ready yet.',
                            'Conductor is for orchestration, not first-time setup. Fix setup issues in Operations first.',
                          ],
                        },
                      ]}
                    />
                    <Button
                      type="button"
                      onClick={() => void conductor.retryMission()}
                      className="rounded-xl border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-4 text-[var(--theme-danger)] hover:bg-[var(--theme-danger-soft-strong)]"
                    >
                      Retry Mission
                    </Button>
                    <Button type="button" onClick={handleNewMission} className="rounded-xl bg-[var(--theme-accent)] px-4 text-white hover:bg-[var(--theme-accent-strong)]">
                      New Mission
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className={cn('text-xs font-semibold uppercase tracking-[0.24em]', conductor.streamError ? 'text-red-400' : 'text-[var(--theme-accent)]')}>
                    {conductor.streamError ? 'Mission Stopped' : 'Mission Complete'}
                  </p>
                  <h1 className="mt-2 text-xl font-semibold tracking-tight text-[var(--theme-text)] sm:text-2xl">{conductor.goal}</h1>
                  <p className="mt-2 text-xs text-[var(--theme-muted-2)]">
                    {completedWorkers}/{Math.max(totalWorkers, completedWorkers)} workers finished ·{' '}
                    {formatElapsedTime(conductor.missionStartedAt, conductor.completedAt ? new Date(conductor.completedAt).getTime() : now)} total elapsed
                  </p>
                </div>
                <div className="flex gap-2">
                  {!completePhaseProjectPath || !previewState.ready ? (
                    <Button
                      type="button"
                      onClick={() => setContinueModalOpen(true)}
                      className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-4 text-[var(--theme-text)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    >
                      Continue
                    </Button>
                  ) : null}
                  <Button type="button" onClick={handleNewMission} className="rounded-xl bg-[var(--theme-accent)] px-5 text-white hover:bg-[var(--theme-accent-strong)]">
                    New Mission
                  </Button>
                </div>
              </div>
            </div>

            {completePhaseProjectPath && previewState.ready ? (
              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Output Preview</p>
                    <p className="mt-1 text-xs text-[var(--theme-muted-2)]">{completePhaseProjectPath.split('/').pop() || 'index.html'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={previewUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
                    >
                      Open in new tab ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => setContinueModalOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
                    >
                      Continue
                    </button>
                  </div>
                </div>
                <div className="mt-4 overflow-auto rounded-2xl border border-[var(--theme-border)] bg-white">
                  <iframe src={previewUrl!} className="h-[clamp(280px,55vh,520px)] w-full" sandbox="allow-scripts allow-same-origin" title="Mission output preview" />
                </div>
              </section>
            ) : completePhaseProjectPath && previewState.loading && !conductor.streamError ? (
              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center gap-3 text-sm text-[var(--theme-muted)]">
                  <div className="size-4 animate-spin rounded-full border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)]" />
                  Loading output preview…
                </div>
              </section>
            ) : null}

            {/* Worker output fallback — show when no iframe preview is available */}
            {(!completePhaseProjectPath || previewState.unavailable) &&
              (() => {
                const outputSections = conductor.workers
                  .map((worker, index) => {
                    const output = (conductor.workerOutputs[worker.key] ?? getLastAssistantMessage(worker.raw.messages as HistoryMessage[] | undefined)).trim()
                    if (!output) return null
                    const persona = getAgentPersona(index)
                    return {
                      key: worker.key,
                      persona,
                      label: worker.label,
                      output,
                    }
                  })
                  .filter((section): section is NonNullable<typeof section> => section !== null)

                const fallbackText =
                  outputSections.length > 0 ? outputSections.map((s) => `### ${s.persona.emoji} ${s.persona.name} · ${s.label}\n\n${s.output}`).join('\n\n---\n\n') : conductor.streamText.trim()

                if (!fallbackText) return null

                return (
                  <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Output</p>
                        <p className="mt-1 text-xs text-[var(--theme-muted-2)]">{completePhaseProjectPath ? `Preview unavailable for ${completePhaseOutputLabel}` : 'Agent work output'}</p>
                      </div>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                      <Markdown className="max-h-[600px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{fallbackText}</Markdown>
                    </div>
                  </section>
                )
              })()}

            {conductor.tasks.length > 1 && completedTaskOutputs.length > 0 && (
              <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Task Outputs</p>
                    <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Per-task output snapshots from completed workers.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {completedTaskOutputs.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-emerald-400" />
                            <p className="truncate text-sm font-medium text-[var(--theme-text)]">{task.title}</p>
                          </div>
                        </div>
                        {task.previewUrl && (
                          <a
                            href={task.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent)]"
                          >
                            Preview
                          </a>
                        )}
                      </div>
                      <p className="mt-3 text-sm text-[var(--theme-muted)]">
                        {task.previewText}
                        {(task.output ?? '').trim().length > 200 ? '…' : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-[0_24px_80px_var(--theme-shadow)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Agent Summary</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium',
                    conductor.streamError ? 'border border-red-400/35 bg-red-500/10 text-red-300' : 'border border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
                  )}
                >
                  {conductor.streamError ? 'Stopped' : 'Complete'}
                </span>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                {completeSummary ? (
                  <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{completeSummary}</Markdown>
                ) : conductor.streamText ? (
                  <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{conductor.streamText}</Markdown>
                ) : (
                  <p className="text-sm text-[var(--theme-muted)]">No summary captured.</p>
                )}
              </div>
              {conductor.workers.length > 0 && (
                <div className="mt-4 space-y-2">
                  {conductor.workers.map((worker, index) => {
                    const persona = getAgentPersona(index)
                    const shortModelName = getShortModelName(worker.model)
                    return (
                      <div key={worker.key} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
                        <span className="size-2 rounded-full bg-emerald-400" />
                        <span className="font-medium text-[var(--theme-text)]">
                          {persona.emoji} {persona.name}
                        </span>
                        <span className="text-[var(--theme-muted)]">{worker.label}</span>
                        <span className="ml-auto text-xs text-[var(--theme-muted)]">
                          {shortModelName} · {worker.totalTokens.toLocaleString()} tok
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {(totalTokens > 0 || completeMissionCostWorkers.length > 0) && (
                <div className="mt-4">
                  <MissionCostSection totalTokens={totalTokens} workers={completeMissionCostWorkers} expanded={completeCostExpanded} onToggle={() => setCompleteCostExpanded((current) => !current)} />
                </div>
              )}
              {conductor.streamText && completeSummary && (
                <details className="mt-4 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-5 py-4">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--theme-muted)]">Raw Agent Output</summary>
                  <div className="mt-4 border-t border-[var(--theme-border)] pt-4">
                    <Markdown className="max-h-[400px] max-w-none overflow-auto text-sm text-[var(--theme-text)]">{conductor.streamText}</Markdown>
                  </div>
                </details>
              )}
            </section>
          </div>

          {continueModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-bg)_48%,transparent)] px-4 py-6 backdrop-blur-md"
              onClick={() => setContinueModalOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)] sm:p-6"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-[var(--theme-text)]">Continue Mission</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setContinueModalOpen(false)}
                    className="inline-flex size-9 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-lg text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)] hover:text-[var(--theme-accent-strong)]"
                    aria-label="Close continue mission dialog"
                  >
                    ×
                  </button>
                </div>

                {continuationModalPreview ? (
                  <div className="mt-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--theme-muted)]">Previous output summary</p>
                    <p className="mt-2 text-sm text-[var(--theme-text)]">{continuationModalPreview}</p>
                  </div>
                ) : null}

                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleContinueMission()
                  }}
                >
                  <input
                    type="text"
                    value={continueDraft}
                    onChange={(event) => setContinueDraft(event.target.value)}
                    placeholder="Continue with additional instructions..."
                    disabled={conductor.isSending}
                    className="w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-muted-2)] focus:border-[var(--theme-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!continueDraft.trim() || conductor.isSending}
                      className={cn(
                        'inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium transition-colors sm:min-w-[96px]',
                        !continueDraft.trim() || conductor.isSending
                          ? 'cursor-not-allowed border border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] opacity-60'
                          : 'border border-[var(--theme-border)] bg-[var(--theme-accent-soft)] text-[var(--theme-text)] hover:border-[var(--theme-accent)] hover:bg-[var(--theme-accent-soft-strong)]',
                      )}
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.8} />
                      {conductor.isSending ? 'Sending' : 'Send'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ) : null}
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
      <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col px-4 py-4 pb-4 md:pb-[calc(var(--tabbar-h,80px)+1rem)] md:px-6 md:py-8">
        <div className="flex w-full flex-col gap-6">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
              Conductor
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
          <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-5 shadow-[0_24px_80px_var(--theme-shadow)]">
            <div className="text-center">
              <h1 className="line-clamp-2 text-xl font-semibold tracking-tight text-[var(--theme-text)] sm:text-2xl">{conductor.goal}</h1>
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[var(--theme-muted)]">
                <span>{formatElapsedMilliseconds(conductor.isPaused ? conductor.pausedElapsedMs : conductor.missionElapsedMs)}</span>
                <span className="text-[var(--theme-border)]">·</span>
                <span>
                  {completedWorkers}/{Math.max(totalWorkers, 1)} complete
                </span>
                <span className="text-[var(--theme-border)]">·</span>
                <span>{activeWorkerCount} active</span>
              </div>
              {conductor.isPaused ? (
                <div className="mt-3 flex justify-center">
                  <span className="rounded-full border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--theme-accent-strong)] animate-pulse">
                    Paused
                  </span>
                </div>
              ) : null}
            </div>
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[var(--theme-border)]">
              <div className="h-full rounded-full bg-[var(--theme-accent)] transition-[width] duration-500 ease-out" style={{ width: `${missionProgress}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void conductor.stopMission()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--theme-danger-border, color-mix(in srgb, var(--theme-danger) 35%, white))] bg-[var(--theme-danger-soft, color-mix(in srgb, var(--theme-danger) 12%, transparent))] px-3 py-1.5 text-xs font-medium text-[var(--theme-danger)] transition-colors hover:bg-[var(--theme-danger-soft-strong, color-mix(in srgb, var(--theme-danger) 18%, transparent))]"
              >
                <span>■</span> Stop Mission
              </button>
              <button
                type="button"
                disabled={!conductor.orchestratorSessionKey || conductor.isPausing}
                onClick={async () => {
                  if (!conductor.orchestratorSessionKey) return
                  try {
                    await conductor.pauseAgent(conductor.orchestratorSessionKey, !conductor.isPaused)
                  } catch {
                    // best effort
                  }
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  !conductor.orchestratorSessionKey || conductor.isPausing
                    ? 'cursor-not-allowed border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] opacity-50'
                    : conductor.isPaused
                      ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-strong)] hover:bg-[var(--theme-accent-soft-strong)]'
                      : 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)] hover:border-[var(--theme-accent)] hover:text-[var(--theme-text)]',
                )}
              >
                <span>{conductor.isPaused ? '▶' : '⏸'}</span> {conductor.isPausing ? '...' : conductor.isPaused ? 'Resume' : 'Pause'}
              </button>
            </div>
          </section>
          {conductor.timeoutWarning && (
            <section className="rounded-2xl border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] px-5 py-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--theme-warning)]">⏳ Mission appears stalled — no activity for 60 seconds</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted)]">Sometimes the workers are still alive, but the stream went quiet. Your call.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    onClick={conductor.dismissTimeoutWarning}
                    className="rounded-xl border border-[var(--theme-warning-border)] bg-[var(--theme-card)] px-4 text-[var(--theme-text)] hover:bg-[var(--theme-card2)]"
                  >
                    Keep Waiting
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void conductor.stopMission()}
                    className="rounded-xl border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] px-4 text-[var(--theme-warning)] hover:bg-[var(--theme-warning-soft-strong)]"
                  >
                    Stop Mission
                  </Button>
                </div>
              </div>
            </section>
          )}
          <section className="max-h-[clamp(200px,40vh,360px)] overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-[0_24px_80px_var(--theme-shadow)]">
            <OfficeView agentRows={officeAgentRows} missionRunning onViewOutput={() => {}} processType="parallel" companyName="Conductor Office" containerHeight={360} hideHeader />
          </section>

          {conductor.tasks.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-2">
                <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
                  Tasks ({conductor.tasks.filter((task) => task.status === 'complete').length}/{conductor.tasks.length})
                </h2>
                {conductor.tasks.map((task) => {
                  const isSelected = selectedTaskId === task.id
                  const statusDot = task.status === 'complete' ? 'bg-emerald-400' : task.status === 'running' ? 'bg-sky-400 animate-pulse' : task.status === 'failed' ? 'bg-red-400' : 'bg-zinc-500'
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors',
                        isSelected ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)]' : 'border-[var(--theme-border)] bg-[var(--theme-card)] hover:border-[var(--theme-accent)]',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2 shrink-0 rounded-full', statusDot)} />
                        <span className="min-w-0 truncate font-medium text-[var(--theme-text)]">{task.title}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-3">
                {selectedTaskId ? (
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Task Output</h2>
                  </div>
                ) : null}
                {(() => {
                  const selectedTask = selectedTaskId ? conductor.tasks.find((task) => task.id === selectedTaskId) : null
                  const displayWorkers = selectedTask?.workerKey ? conductor.workers.filter((worker) => worker.key === selectedTask.workerKey) : conductor.workers
                  return (
                    <div className="grid gap-3 md:grid-cols-2">
                      {displayWorkers.map((worker, index) => {
                        return <WorkerCard key={worker.key} worker={worker} index={index} conductor={conductor} now={now} />
                      })}
                      {displayWorkers.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-8 text-center text-sm text-[var(--theme-muted)] md:col-span-2">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center justify-center gap-3">
                              <div className="size-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                              <span>Spawning workers...</span>
                            </div>
                            {conductor.planText ? <p className="max-w-xl text-xs text-[var(--theme-muted-2)]">{conductor.planText}</p> : null}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                {conductor.workers.map((worker, index) => {
                  return <WorkerCard key={worker.key} worker={worker} index={index} conductor={conductor} now={now} />
                })}
                {conductor.workers.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-8 text-center text-sm text-[var(--theme-muted)] md:col-span-2">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center justify-center gap-3">
                        <div className="size-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
                        <span>Spawning workers...</span>
                      </div>
                      {conductor.planText ? <p className="max-w-xl text-xs text-[var(--theme-muted-2)]">{conductor.planText}</p> : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
