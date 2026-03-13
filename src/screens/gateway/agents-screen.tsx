import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  AgentRegistryCard,
  type AgentRegistryCardData,
  type AgentRegistryStatus,
} from '@/components/agent-view/agent-registry-card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatModelName } from '@/lib/format-model-name'
import { fetchCronJobs } from '@/lib/cron-api'
import { toggleAgentPause } from '@/lib/gateway-api'
import { toast } from '@/components/ui/toast'
import { AgentHubLayout } from './agent-hub-layout'
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh'

type AgentGatewayEntry = {
  id?: string
  name?: string
  role?: string
  category?: string
  color?: string
  [key: string]: unknown
}

type AgentsData = {
  defaultId?: string
  mainKey?: string
  scope?: string
  agents?: AgentGatewayEntry[]
  [key: string]: unknown
}

type SessionEntry = {
  key?: string
  friendlyId?: string
  label?: string
  displayName?: string
  title?: string
  derivedTitle?: string
  task?: string
  status?: string
  updatedAt?: number | string
  enabled?: boolean
  [key: string]: unknown
}

type AgentDefinition = {
  id: string
  name: string
  category: string
  role: string
  color: AgentRegistryCardData['color']
  aliases: Array<string>
}

type AgentRuntime = AgentRegistryCardData & {
  matchedSessions: Array<SessionEntry>
}

type AgentConfigToolEntry = {
  id: string
  enabled: boolean
  source: 'allowed' | 'denied' | 'explicit' | 'unknown'
}

type AgentConfigSkillEntry = {
  id: string
  enabled: boolean
}

type AgentConfigChannelEntry = {
  id: string
  enabled: boolean | null
  config: Record<string, unknown>
}

type AgentConfigData = {
  agentId: string
  name: string
  workspacePath: string
  primaryModel: string
  fallbackModels: Array<string>
  modelOverride: string
  tools: Array<AgentConfigToolEntry>
  skills: Array<AgentConfigSkillEntry>
  channels: Array<AgentConfigChannelEntry>
  readOnly: boolean
  supportsPatch: boolean
  sourceMethod?: string
  warning?: string
}

type AgentConfigDraft = {
  modelOverride: string
  tools: Record<string, boolean>
  skills: Record<string, boolean>
  channels: Record<string, { enabled: boolean | null; config: Record<string, unknown> }>
}

type AgentConfigPatchPayload = {
  modelOverride?: string
  tools: Record<string, boolean>
  skills: Record<string, boolean>
  channels: Record<string, Record<string, unknown>>
}

type AgentsScreenVariant = 'mission-control' | 'registry'
type AgentsScreenProps = {
  variant?: AgentsScreenVariant
}

const CATEGORY_ORDER = ['Core', 'Coding', 'System', 'Integrations'] as const

const STATUS_SORT_ORDER: Record<AgentRegistryStatus, number> = {
  active: 0,
  idle: 1,
  available: 2,
  paused: 3,
}

const RUNNING_STATUSES = new Set([
  'running',
  'active',
  'thinking',
  'processing',
  'streaming',
  'in-progress',
  'inprogress',
])

const PAUSED_STATUSES = new Set(['paused', 'pause', 'suspended'])

const ACTIVE_HEARTBEAT_MS = 30_000

// Temporary fallback registry until the gateway exposes a dedicated agent registry schema.
const FALLBACK_AGENT_REGISTRY: Array<AgentDefinition> = [
  {
    id: 'aurora-main',
    name: 'Aurora/Main',
    category: 'Core',
    role: 'Orchestrator',
    color: 'orange',
    aliases: ['aurora-main', 'aurora'],
  },
  {
    id: 'codex',
    name: 'Codex',
    category: 'Coding',
    role: 'Coding specialist',
    color: 'blue',
    aliases: ['codex', 'coding'],
  },
  {
    id: 'memory-consolidator',
    name: 'Memory consolidator',
    category: 'System',
    role: 'Memory service',
    color: 'violet',
    aliases: ['memory-consolidator', 'memory'],
  },
  {
    id: 'telegram-gateway',
    name: 'Telegram gateway',
    category: 'Integrations',
    role: 'Channel bridge',
    color: 'cyan',
    aliases: ['telegram-gateway', 'telegram'],
  },
]

function readString(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return 0
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function deriveFriendlyIdFromKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(':')
  const tail = parts[parts.length - 1]
  return tail && tail.trim().length > 0 ? tail.trim() : trimmed
}

function inferCategoryFromText(text: string): string {
  const normalized = normalizeToken(text)
  if (
    normalized.includes('codex') ||
    normalized.includes('coding') ||
    normalized.includes('developer')
  ) {
    return 'Coding'
  }
  if (
    normalized.includes('memory') ||
    normalized.includes('system') ||
    normalized.includes('ops')
  ) {
    return 'System'
  }
  if (
    normalized.includes('telegram') ||
    normalized.includes('discord') ||
    normalized.includes('slack') ||
    normalized.includes('integration') ||
    normalized.includes('gateway')
  ) {
    return 'Integrations'
  }
  return 'Core'
}

function normalizeCategoryLabel(category: string): string {
  const normalized = normalizeToken(category)
  if (normalized === 'core') return 'Core'
  if (normalized === 'coding') return 'Coding'
  if (normalized === 'system') return 'System'
  if (normalized === 'integrations' || normalized === 'integration') {
    return 'Integrations'
  }
  return category
}

function inferRoleFromCategory(category: string): string {
  if (category === 'Coding') return 'Coding agent'
  if (category === 'System') return 'System agent'
  if (category === 'Integrations') return 'Integration agent'
  return 'Core agent'
}

function inferColorFromCategory(
  category: string,
): AgentRegistryCardData['color'] {
  if (category === 'Coding') return 'blue'
  if (category === 'System') return 'violet'
  if (category === 'Integrations') return 'cyan'
  return 'orange'
}

function dedupe(values: Array<string>): Array<string> {
  const result: Array<string> = []
  const seen = new Set<string>()

  values.forEach((value) => {
    const normalized = normalizeToken(value)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })

  return result
}

function prettyLabel(value: string): string {
  return value
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return ''
  }
}

function buildAgentConfigDraft(config: AgentConfigData): AgentConfigDraft {
  return {
    modelOverride: config.modelOverride,
    tools: Object.fromEntries(
      config.tools.map((entry) => [entry.id, entry.enabled]),
    ),
    skills: Object.fromEntries(
      config.skills.map((entry) => [entry.id, entry.enabled]),
    ),
    channels: Object.fromEntries(
      config.channels.map((entry) => [
        entry.id,
        { enabled: entry.enabled, config: entry.config },
      ]),
    ),
  }
}

function serializeAgentConfigDraft(draft: AgentConfigDraft | null): string {
  return JSON.stringify(draft ?? null)
}

function buildAgentConfigPatchPayload(
  draft: AgentConfigDraft,
): AgentConfigPatchPayload {
  return {
    ...(draft.modelOverride.trim()
      ? { modelOverride: draft.modelOverride.trim() }
      : {}),
    tools: draft.tools,
    skills: draft.skills,
    channels: Object.fromEntries(
      Object.entries(draft.channels).map(([id, value]) => [
        id,
        {
          ...value.config,
          ...(value.enabled === null ? {} : { enabled: value.enabled }),
        },
      ]),
    ),
  }
}

async function fetchAgentConfig(agentId: string): Promise<AgentConfigData> {
  const response = await fetch(
    `/api/gateway/agents?agentId=${encodeURIComponent(agentId)}`,
  )
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    data?: AgentConfigData
  }

  if (!response.ok || payload.ok === false || !payload.data) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }

  return payload.data
}

async function patchAgentConfig(
  agentId: string,
  config: AgentConfigPatchPayload,
): Promise<void> {
  const response = await fetch('/api/gateway/agents', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId, config }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || 'Failed to save agent config')
  }
}

function matchesAgentCronJob(
  job: Awaited<ReturnType<typeof fetchCronJobs>>[number],
  definition: AgentDefinition | null,
  runtimeAgent: AgentRuntime | null,
): boolean {
  if (!runtimeAgent) return false

  const tokens = dedupe([
    runtimeAgent.id,
    runtimeAgent.name,
    ...(definition?.aliases ?? []),
  ])

  const searchBlob = normalizeToken(
    [
      job.id,
      job.name,
      job.description ?? '',
      safeStringify(job.payload),
      safeStringify(job.deliveryConfig),
    ].join(' '),
  )

  return tokens.some((token) => {
    const normalized = normalizeToken(token)
    return normalized.length > 0 && searchBlob.includes(normalized)
  })
}

function toAgentDefinition(
  value: unknown,
  index: number,
): AgentDefinition | null {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null

  if (!record) return null

  const id = readString(record.id || record.key || record.agentId)
  const name = readString(record.name || record.label || record.displayName)

  const fallbackId = normalizeToken(id || name)
  if (!fallbackId) return null

  const categoryRaw = readString(record.category || record.group || record.kind)
  const roleRaw = readString(record.role || record.description)
  const colorRaw = normalizeToken(readString(record.color))

  const category = normalizeCategoryLabel(
    categoryRaw.length > 0
      ? categoryRaw
      : inferCategoryFromText(`${fallbackId} ${name}`),
  )

  let color = inferColorFromCategory(category)
  if (
    colorRaw === 'orange' ||
    colorRaw === 'blue' ||
    colorRaw === 'cyan' ||
    colorRaw === 'purple' ||
    colorRaw === 'violet'
  ) {
    color = colorRaw
  }

  const aliasParts = [
    id,
    name,
    fallbackId,
    readString(record.profile),
    readString(record.handle),
  ]

  const primaryNameToken = normalizeToken(name).split('-')[0] || ''
  if (primaryNameToken) aliasParts.push(primaryNameToken)

  return {
    id: fallbackId || `agent-${index + 1}`,
    name: name || id || `Agent ${index + 1}`,
    category,
    role: roleRaw || inferRoleFromCategory(category),
    color,
    aliases: dedupe(aliasParts),
  }
}

function parseAgentDefinitions(data: AgentsData | undefined): Array<AgentDefinition> | null {
  if (!data || typeof data !== 'object') return null

  const directAgents = Array.isArray(data.agents) ? data.agents : null
  if (directAgents) {
    return directAgents
      .map((entry, index) => toAgentDefinition(entry, index))
      .filter((entry): entry is AgentDefinition => entry !== null)
  }

  const record = data as Record<string, unknown>
  const alternateLists = ['registry', 'agentDefinitions']

  for (const key of alternateLists) {
    const list = record[key]
    if (!Array.isArray(list)) continue

    return list
      .map((entry, index) => toAgentDefinition(entry, index))
      .filter((entry): entry is AgentDefinition => entry !== null)
  }

  const profiles = record.profiles
  if (profiles && typeof profiles === 'object' && !Array.isArray(profiles)) {
    const entries = Object.entries(profiles).map(([profileId, profileValue]) => {
      const profileRecord =
        profileValue &&
        typeof profileValue === 'object' &&
        !Array.isArray(profileValue)
          ? (profileValue as Record<string, unknown>)
          : {}
      return {
        ...profileRecord,
        id: profileId,
        name: readString(profileRecord.name) || profileId,
      }
    })

    return entries
      .map((entry, index) => toAgentDefinition(entry, index))
      .filter((entry): entry is AgentDefinition => entry !== null)
  }

  return null
}

function getSessionSearchBlob(session: SessionEntry): string {
  const values = [
    readString(session.key),
    readString(session.friendlyId),
    readString(session.label),
    readString(session.displayName),
    readString(session.title),
    readString(session.derivedTitle),
    readString(session.task),
    readString(session.agentId),
    readString(session.agent),
    readString(session.profile),
  ]

  return normalizeToken(values.join(' '))
}

function getSessionFriendlyId(session: SessionEntry | undefined): string {
  if (!session) return ''
  const friendlyId = readString(session.friendlyId)
  if (friendlyId) return friendlyId
  return deriveFriendlyIdFromKey(readString(session.key))
}

function getSessionTitle(session: SessionEntry): string {
  return (
    readString(session.label) ||
    readString(session.displayName) ||
    readString(session.title) ||
    readString(session.derivedTitle) ||
    getSessionFriendlyId(session) ||
    readString(session.key) ||
    'Session'
  )
}

function scoreSessionMatch(agent: AgentDefinition, session: SessionEntry): number {
  const sessionKey = normalizeToken(readString(session.key))
  const friendlyId = normalizeToken(readString(session.friendlyId))
  const blob = getSessionSearchBlob(session)

  let best = 0

  for (const alias of agent.aliases) {
    if (!alias) continue

    if (sessionKey === alias || friendlyId === alias) {
      best = Math.max(best, 100)
      continue
    }

    if (
      sessionKey.startsWith(`${alias}-`) ||
      sessionKey.includes(`:${alias}:`) ||
      sessionKey.endsWith(`:${alias}`) ||
      friendlyId.startsWith(`${alias}-`)
    ) {
      best = Math.max(best, 85)
      continue
    }

    if (blob.includes(alias)) {
      best = Math.max(best, 65)
    }
  }

  return best
}

function isPausedSession(session: SessionEntry): boolean {
  const status = normalizeToken(readString(session.status))
  if (PAUSED_STATUSES.has(status)) return true
  if (typeof session.enabled === 'boolean') return session.enabled === false
  return false
}

function deriveAgentStatus(
  session: SessionEntry | undefined,
  pausedOverride: boolean | undefined,
): AgentRegistryStatus {
  if (typeof pausedOverride === 'boolean') {
    if (pausedOverride) return 'paused'
    if (!session) return 'available'
  }

  if (!session) return 'available'

  if (isPausedSession(session)) return 'paused'

  const status = normalizeToken(readString(session.status))
  const updatedAt = readTimestamp(session.updatedAt)
  const staleMs = updatedAt > 0 ? Date.now() - updatedAt : 0
  const runningLike = RUNNING_STATUSES.has(status) || status.length === 0

  if (runningLike && (updatedAt <= 0 || staleMs <= ACTIVE_HEARTBEAT_MS)) {
    return 'active'
  }

  return 'idle'
}

function formatRelativeTime(value: unknown): string {
  const timestamp = readTimestamp(value)
  if (!timestamp) return 'No activity timestamp'

  const diffMs = Math.max(0, Date.now() - timestamp)
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getSessionTokenCount(session: SessionEntry): number {
  const rawValue =
    typeof session.totalTokens === 'number'
      ? session.totalTokens
      : typeof session.tokenCount === 'number'
        ? session.tokenCount
        : 0

  return Number.isFinite(rawValue) ? rawValue : 0
}

function getSessionModelName(session: SessionEntry): string {
  return readString(session.model) || readString(session.agentModel)
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(value)))
}

function getSessionStatusBadgeClasses(session: SessionEntry): string {
  const status = normalizeToken(readString(session.status))
  if (PAUSED_STATUSES.has(status)) {
    return 'border border-primary-700 bg-primary-800 text-primary-200'
  }
  if (RUNNING_STATUSES.has(status) || status.length === 0) {
    return 'border border-accent-500/40 bg-accent-500/15 text-accent-300'
  }
  return 'border border-primary-800 bg-primary-900 text-primary-300'
}

async function readResponseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error
    }
  } catch {
    // no-op
  }

  return response.statusText || `HTTP ${response.status}`
}

export function AgentsScreen({ variant = 'mission-control' }: AgentsScreenProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const missionControlEnabled = variant === 'mission-control'
  const [optimisticPausedByAgentId, setOptimisticPausedByAgentId] = useState<
    Record<string, boolean>
  >({})
  const [optimisticPausedByControlKey, setOptimisticPausedByControlKey] =
    useState<Record<string, boolean>>({})
  const [spawningByAgentId, setSpawningByAgentId] = useState<
    Record<string, boolean>
  >({})
  const [historyAgentId, setHistoryAgentId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState('overview')
  const [agentConfigDraft, setAgentConfigDraft] = useState<AgentConfigDraft | null>(
    null,
  )

  // Mobile detection for pull-to-refresh
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Pull-to-refresh: attach to the scrollable <main> in workspace-shell
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = document.querySelector('main[data-tour="chat-area"]') as HTMLElement | null
    scrollContainerRef.current = el
  }, [])

  // handlePullRefresh defined after queries (see below)

  const agentsQuery = useQuery({
    queryKey: ['gateway', 'agents'],
    queryFn: async () => {
      const res = await fetch('/api/gateway/agents')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Gateway error')
      return json.data as AgentsData
    },
    refetchInterval: 15_000,
    retry: 1,
  })

  const sessionsQuery = useQuery({
    queryKey: ['agent-registry', 'sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions')
      if (!res.ok) return [] as Array<SessionEntry>
      const payload = (await res.json()) as { sessions?: Array<SessionEntry> }
      return Array.isArray(payload.sessions) ? payload.sessions : []
    },
    refetchInterval: 10_000,
    retry: false,
  })

  const cronJobsQuery = useQuery({
    queryKey: ['cron', 'jobs'],
    queryFn: fetchCronJobs,
    staleTime: 30_000,
    retry: 1,
  })

  const handlePullRefresh = useCallback(() => {
    void agentsQuery.refetch()
    void sessionsQuery.refetch()
  }, [agentsQuery, sessionsQuery])

  const { isPulling: agentHubPulling, pullDistance: agentHubPullDistance, threshold: agentHubThreshold } = usePullToRefresh(
    isMobile,
    handlePullRefresh,
    scrollContainerRef,
  )

  useEffect(() => {
    if (!sessionsQuery.isSuccess) return

    setOptimisticPausedByAgentId((previous) => {
      if (Object.keys(previous).length === 0) return previous
      return {}
    })
    setOptimisticPausedByControlKey((previous) => {
      if (Object.keys(previous).length === 0) return previous
      return {}
    })
  }, [sessionsQuery.dataUpdatedAt, sessionsQuery.isSuccess])

  const parsedDefinitions = useMemo(
    () => parseAgentDefinitions(agentsQuery.data),
    [agentsQuery.data],
  )

  const usingFallbackRegistry =
    !agentsQuery.isLoading && parsedDefinitions === null

  const registryDefinitions = useMemo(() => {
    const merged = new Map<string, AgentDefinition>()

    FALLBACK_AGENT_REGISTRY.forEach((definition) => {
      merged.set(definition.id, definition)
    })

    ;(parsedDefinitions ?? []).forEach((definition) => {
      const existing = merged.get(definition.id)
      if (!existing) {
        merged.set(definition.id, definition)
        return
      }

      merged.set(definition.id, {
        ...existing,
        ...definition,
        aliases: dedupe([...existing.aliases, ...definition.aliases]),
      })
    })

    return Array.from(merged.values())
  }, [parsedDefinitions])

  const runtimeAgents = useMemo(() => {
    const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : []

    return registryDefinitions.map((definition) => {
      const matchedSessions = sessions
        .map((session) => {
          const score = scoreSessionMatch(definition, session)
          return {
            session,
            score,
            updatedAt: readTimestamp(session.updatedAt),
          }
        })
        .filter((candidate) => candidate.score > 0)
        .sort((left, right) => {
          if (right.score !== left.score) return right.score - left.score
          return right.updatedAt - left.updatedAt
        })
        .map((candidate) => candidate.session)

      const primarySession = matchedSessions[0]
      const hasOverride = Object.prototype.hasOwnProperty.call(
        optimisticPausedByAgentId,
        definition.id,
      )
      const sessionKey = readString(primarySession?.key)
      const controlKey = sessionKey || definition.id
      const hasControlOverride = Object.prototype.hasOwnProperty.call(
        optimisticPausedByControlKey,
        controlKey,
      )
      const pausedOverride = hasControlOverride
        ? optimisticPausedByControlKey[controlKey]
        : hasOverride
          ? optimisticPausedByAgentId[definition.id]
          : undefined

      const friendlyId = getSessionFriendlyId(primarySession)
      const status = deriveAgentStatus(primarySession, pausedOverride)

      return {
        id: definition.id,
        name: definition.name,
        role: definition.role,
        category: definition.category,
        color: definition.color,
        status,
        sessionKey: sessionKey || undefined,
        friendlyId: friendlyId || undefined,
        controlKey,
        matchedSessions,
      } satisfies AgentRuntime
    })
  }, [
    registryDefinitions,
    sessionsQuery.data,
    optimisticPausedByAgentId,
    optimisticPausedByControlKey,
  ])

  const unmatchedSessions = useMemo(() => {
    const sessions = Array.isArray(sessionsQuery.data) ? sessionsQuery.data : []
    const matchedSessionKeys = new Set<string>()

    runtimeAgents.forEach((agent) => {
      agent.matchedSessions.forEach((session) => {
        const sessionKey = readString(session.key)
        if (sessionKey) matchedSessionKeys.add(sessionKey)
      })
    })

    const cutoff = Date.now() - 10 * 60_000

    return sessions
      .filter((session) => {
        const sessionKey = readString(session.key)
        if (!sessionKey || matchedSessionKeys.has(sessionKey)) return false
        if (!sessionKey.includes('subagent:')) return false
        return readTimestamp(session.updatedAt) >= cutoff
      })
      .sort((left, right) => readTimestamp(right.updatedAt) - readTimestamp(left.updatedAt))
  }, [runtimeAgents, sessionsQuery.data])

  const groupedSections = useMemo(() => {
    const grouped = new Map<string, Array<AgentRuntime>>()

    runtimeAgents.forEach((agent) => {
      const existing = grouped.get(agent.category) ?? []
      existing.push(agent)
      grouped.set(agent.category, existing)
    })

    const orderedCategories = [
      ...CATEGORY_ORDER.filter((category) => grouped.has(category)),
      ...Array.from(grouped.keys())
        .filter((category) => !CATEGORY_ORDER.includes(category as never))
        .sort((left, right) => left.localeCompare(right)),
    ]

    return orderedCategories.map((category) => {
      const agentsInCategory = (grouped.get(category) ?? []).sort((left, right) => {
        const leftPriority = STATUS_SORT_ORDER[left.status] ?? 9
        const rightPriority = STATUS_SORT_ORDER[right.status] ?? 9
        if (leftPriority !== rightPriority) return leftPriority - rightPriority
        return left.name.localeCompare(right.name)
      })

      return {
        category,
        agents: agentsInCategory,
      }
    })
  }, [runtimeAgents])

  const selectedHistoryAgent = useMemo(
    () => runtimeAgents.find((agent) => agent.id === historyAgentId) ?? null,
    [historyAgentId, runtimeAgents],
  )

  const selectedConfigAgent = useMemo(
    () => runtimeAgents.find((agent) => agent.id === selectedAgentId) ?? null,
    [runtimeAgents, selectedAgentId],
  )

  const selectedDefinition = useMemo(
    () => registryDefinitions.find((agent) => agent.id === selectedAgentId) ?? null,
    [registryDefinitions, selectedAgentId],
  )

  const agentConfigQuery = useQuery({
    queryKey: ['gateway', 'agents', 'config', selectedAgentId],
    enabled: Boolean(selectedAgentId),
    queryFn: () => fetchAgentConfig(selectedAgentId as string),
    retry: false,
  })

  useEffect(() => {
    if (!selectedAgentId) {
      setAgentConfigDraft(null)
      return
    }
    if (!agentConfigQuery.data) return
    setAgentConfigDraft(buildAgentConfigDraft(agentConfigQuery.data))
  }, [agentConfigQuery.data, selectedAgentId])

  useEffect(() => {
    setDetailTab('overview')
  }, [selectedAgentId])

  const saveAgentConfigMutation = useMutation({
    mutationFn: async ({
      agentId,
      config,
    }: {
      agentId: string
      config: AgentConfigPatchPayload
    }) => patchAgentConfig(agentId, config),
    onSuccess: async (_, variables) => {
      toast('Agent config saved', { type: 'success' })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['gateway', 'agents', 'config', variables.agentId],
        }),
        queryClient.invalidateQueries({ queryKey: ['gateway', 'agents'] }),
      ])
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to save agent config', {
        type: 'error',
      })
    },
  })

  const selectedCronJobs = useMemo(() => {
    const jobs = Array.isArray(cronJobsQuery.data) ? cronJobsQuery.data : []
    return jobs.filter((job) =>
      matchesAgentCronJob(job, selectedDefinition, selectedConfigAgent),
    )
  }, [cronJobsQuery.data, selectedConfigAgent, selectedDefinition])

  const selectedAgentConfig = agentConfigQuery.data
  const draftSnapshot = serializeAgentConfigDraft(agentConfigDraft)
  const configSnapshot = useMemo(
    () =>
      serializeAgentConfigDraft(
        selectedAgentConfig ? buildAgentConfigDraft(selectedAgentConfig) : null,
      ),
    [selectedAgentConfig],
  )
  const isConfigDirty =
    Boolean(agentConfigDraft && selectedAgentConfig) &&
    draftSnapshot !== configSnapshot

  const modelOverrideOptions = useMemo(() => {
    const values = dedupe([
      selectedAgentConfig?.primaryModel ?? '',
      ...(selectedAgentConfig?.fallbackModels ?? []),
      agentConfigDraft?.modelOverride ?? '',
      selectedConfigAgent?.matchedSessions[0]
        ? getSessionModelName(selectedConfigAgent.matchedSessions[0])
        : '',
    ]).filter((value) => value.length > 0)

    return values
  }, [agentConfigDraft?.modelOverride, selectedAgentConfig, selectedConfigAgent])

  async function spawnSessionForAgent(
    agent: AgentRegistryCardData,
  ): Promise<{ sessionKey: string; friendlyId: string } | null> {
    if (spawningByAgentId[agent.id]) return null

    setSpawningByAgentId((previous) => ({ ...previous, [agent.id]: true }))

    try {
      const baseFriendlyId = normalizeToken(agent.id || agent.name || 'agent')
      const friendlyId = `${baseFriendlyId}-${Math.random().toString(36).slice(2, 8)}`

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          friendlyId,
          label: agent.name,
        }),
      })

      if (!response.ok) {
        throw new Error(await readResponseError(response))
      }

      const payload = (await response.json()) as {
        sessionKey?: string
        friendlyId?: string
      }

      const sessionKey = readString(payload.sessionKey)
      const resolvedFriendlyId =
        readString(payload.friendlyId) || deriveFriendlyIdFromKey(sessionKey)

      if (!sessionKey || !resolvedFriendlyId) {
        throw new Error('Failed to create a session for this agent')
      }

      toast(`${agent.name} session started`, { type: 'success' })
      void sessionsQuery.refetch()

      return { sessionKey, friendlyId: resolvedFriendlyId }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to spawn agent session'
      toast(message, { type: 'error' })
      return null
    } finally {
      setSpawningByAgentId((previous) => {
        const next = { ...previous }
        delete next[agent.id]
        return next
      })
    }
  }

  async function handleChat(agent: AgentRegistryCardData) {
    const existingFriendlyId =
      readString(agent.friendlyId) || deriveFriendlyIdFromKey(readString(agent.sessionKey))

    if (existingFriendlyId) {
      void navigate({
        to: '/chat/$sessionKey',
        params: { sessionKey: existingFriendlyId },
      })
      return
    }

    const spawned = await spawnSessionForAgent(agent)
    if (!spawned) return

    void navigate({
      to: '/chat/$sessionKey',
      params: { sessionKey: spawned.friendlyId },
    })
  }

  async function handleSpawn(agent: AgentRegistryCardData) {
    await spawnSessionForAgent(agent)
  }

  function handleHistory(agent: AgentRegistryCardData) {
    setHistoryAgentId(agent.id)
  }

  async function handlePauseToggle(
    agent: AgentRegistryCardData,
    nextPaused: boolean,
  ) {
    const controlKey = readString(agent.controlKey)
    if (!controlKey) {
      toast('No control key available for this agent', { type: 'warning' })
      return
    }

    const hadPrevious = Object.prototype.hasOwnProperty.call(
      optimisticPausedByAgentId,
      agent.id,
    )
    const previousValue = optimisticPausedByAgentId[agent.id]
    const hadControlPrevious = Object.prototype.hasOwnProperty.call(
      optimisticPausedByControlKey,
      controlKey,
    )
    const previousControlValue = optimisticPausedByControlKey[controlKey]

    setOptimisticPausedByAgentId((previous) => ({
      ...previous,
      [agent.id]: nextPaused,
    }))
    setOptimisticPausedByControlKey((previous) => ({
      ...previous,
      [controlKey]: nextPaused,
    }))

    try {
      const payload = await toggleAgentPause(controlKey, nextPaused)
      const paused =
        typeof payload.paused === 'boolean' ? payload.paused : nextPaused

      setOptimisticPausedByAgentId((previous) => ({
        ...previous,
        [agent.id]: paused,
      }))
      setOptimisticPausedByControlKey((previous) => ({
        ...previous,
        [controlKey]: paused,
      }))

      toast(`${agent.name} ${paused ? 'paused' : 'resumed'}`, {
        type: 'success',
      })
      void sessionsQuery.refetch()
    } catch (error) {
      setOptimisticPausedByAgentId((previous) => {
        const next = { ...previous }
        if (hadPrevious) {
          next[agent.id] = previousValue
        } else {
          delete next[agent.id]
        }
        return next
      })
      setOptimisticPausedByControlKey((previous) => {
        const next = { ...previous }
        if (hadControlPrevious) {
          next[controlKey] = previousControlValue
        } else {
          delete next[controlKey]
        }
        return next
      })

      const message =
        error instanceof Error
          ? error.message
          : `Failed to ${nextPaused ? 'pause' : 'resume'} agent`
      toast(message, { type: 'error' })
    }
  }

  function handleOpenAgentConfig(agent: AgentRegistryCardData) {
    setSelectedAgentId(agent.id)
    setDetailTab('overview')
  }

  function handleCloseAgentConfig() {
    setSelectedAgentId(null)
    setAgentConfigDraft(null)
  }

  function handleReloadAgentConfig() {
    if (!selectedAgentId) return
    void agentConfigQuery.refetch()
  }

  function handleSaveAgentConfig() {
    if (!selectedAgentId || !agentConfigDraft) return
    void saveAgentConfigMutation.mutateAsync({
      agentId: selectedAgentId,
      config: buildAgentConfigPatchPayload(agentConfigDraft),
    })
  }

  function handleToolToggle(toolId: string, enabled: boolean) {
    setAgentConfigDraft((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        tools: {
          ...previous.tools,
          [toolId]: enabled,
        },
      }
    })
  }

  function handleSkillToggle(skillId: string, enabled: boolean) {
    setAgentConfigDraft((previous) => {
      if (!previous) return previous
      return {
        ...previous,
        skills: {
          ...previous.skills,
          [skillId]: enabled,
        },
      }
    })
  }

  function handleChannelToggle(channelId: string, enabled: boolean) {
    setAgentConfigDraft((previous) => {
      if (!previous) return previous
      const current = previous.channels[channelId]
      if (!current) return previous
      return {
        ...previous,
        channels: {
          ...previous.channels,
          [channelId]: {
            ...current,
            enabled,
          },
        },
      }
    })
  }

  function handleKilled(agent: AgentRegistryCardData) {
    setOptimisticPausedByAgentId((previous) => {
      const next = { ...previous }
      delete next[agent.id]
      return next
    })
    setOptimisticPausedByControlKey((previous) => {
      const controlKey = readString(agent.controlKey)
      if (!controlKey) return previous
      const next = { ...previous }
      delete next[controlKey]
      return next
    })
    void sessionsQuery.refetch()
  }

  const lastUpdated = agentsQuery.dataUpdatedAt
    ? new Date(agentsQuery.dataUpdatedAt).toLocaleTimeString()
    : null

  const agentHubPullIndicatorStyle = agentHubPulling
    ? { transform: `translateY(${Math.min(agentHubPullDistance - 8, 48)}px)`, opacity: Math.min(agentHubPullDistance / agentHubThreshold, 1) }
    : undefined

  if (missionControlEnabled) {
    return (
      <div className="relative flex min-h-full flex-col overflow-x-hidden md:h-full md:min-h-0 md:bg-surface">
        {/* Pull-to-refresh indicator (mobile) */}
        {isMobile && agentHubPulling ? (
          <div
            className="pointer-events-none absolute left-1/2 top-2 z-50 -translate-x-1/2 transition-all duration-150"
            style={agentHubPullIndicatorStyle}
            aria-hidden
          >
            <div className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-white/90 px-3 py-1.5 shadow-md backdrop-blur-sm dark:border-neutral-700 dark:bg-neutral-900/90">
              <span
                className={[
                  'size-3 rounded-full border-2 border-accent-500',
                  agentHubPullDistance >= agentHubThreshold ? 'border-t-transparent animate-spin' : 'opacity-50',
                ].join(' ')}
              />
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                {agentHubPullDistance >= agentHubThreshold ? 'Release to refresh' : 'Pull to refresh'}
              </span>
            </div>
          </div>
        ) : null}
        {usingFallbackRegistry ? (
          <div className="border-b border-amber-300/50 bg-amber-50/70 px-6 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
            Gateway registry unavailable. Showing fallback definitions.
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          <AgentHubLayout agents={runtimeAgents} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 dark:text-neutral-100 md:px-6 md:pb-4 md:pt-8">
      <div className="mx-auto w-full max-w-[1200px]">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <div>
            <h1 className="text-lg font-bold text-primary-900 dark:text-neutral-100 md:text-xl">
              Gateway Agents
            </h1>
            <p className="text-xs text-primary-500 dark:text-neutral-400">
              Registered agents and their status
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {agentsQuery.isFetching && !agentsQuery.isLoading ? (
              <span className="text-[10px] text-primary-500 animate-pulse">
                syncing…
              </span>
            ) : null}
            {lastUpdated ? (
              <span className="text-[10px] text-primary-500">
                Updated {lastUpdated}
              </span>
            ) : null}
            <span
              className={`inline-block size-2 rounded-full ${agentsQuery.isError ? 'bg-red-500' : agentsQuery.isSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
          </div>
        </header>

        {usingFallbackRegistry ? (
          <div className="mb-4 rounded-xl border border-amber-300/50 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-900/20 dark:text-amber-200">
            Gateway registry unavailable. Showing fallback definitions.
          </div>
        ) : null}

        <div className="flex-1 overflow-auto">
          {agentsQuery.isLoading && !agentsQuery.data ? (
            <div className="flex h-32 items-center justify-center">
              <div className="flex items-center gap-2 text-primary-500">
                <div className="size-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
                <span className="text-sm">Loading registry...</span>
              </div>
            </div>
          ) : registryDefinitions.length === 0 ? (
            <div className="rounded-2xl border border-white/30 bg-white/60 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/50">
              <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Add your first agent
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
                <li>Create an agent profile</li>
                <li>Connect a gateway</li>
                <li>Spawn your first session</li>
              </ul>
              <button
                type="button"
                onClick={() => {
                  void navigate({ to: '/settings' })
                }}
                className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 sm:px-4 sm:py-2 sm:text-sm"
              >
                Open Settings
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSections.map((section) => (
                <section key={section.category} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                      {section.category}
                    </h2>
                    <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      {section.agents.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {section.agents.map((agent) => (
                      <AgentRegistryCard
                        key={agent.id}
                        agent={agent}
                        isSpawning={Boolean(spawningByAgentId[agent.id])}
                        onTap={handleOpenAgentConfig}
                        onChat={handleChat}
                        onSpawn={handleSpawn}
                        onHistory={handleHistory}
                        onPauseToggle={handlePauseToggle}
                        onKilled={handleKilled}
                      />
                    ))}
                  </div>
                </section>
              ))}

              {unmatchedSessions.length > 0 ? (
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-[10px] font-bold uppercase tracking-widest text-primary-400">
                      Active Sessions
                    </h2>
                    <span className="text-[11px] font-medium text-primary-400">
                      {unmatchedSessions.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {unmatchedSessions.map((session, index) => {
                      const sessionKey = readString(session.key)
                      const sessionTarget = getSessionFriendlyId(session) || sessionKey
                      const sessionModel = getSessionModelName(session)

                      return (
                        <div
                          key={`${sessionKey}-${index}`}
                          className="rounded-2xl border border-primary-800 bg-primary-900 p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-primary-100">
                                {getSessionTitle(session)}
                              </p>
                              <p className="mt-1 truncate text-xs text-primary-400">
                                {sessionKey}
                              </p>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getSessionStatusBadgeClasses(session)}`}
                            >
                              {readString(session.status) || 'active'}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-primary-300">
                            {sessionModel ? (
                              <span className="truncate">
                                {formatModelName(sessionModel)}
                              </span>
                            ) : (
                              <span />
                            )}
                            <span>{formatTokenCount(getSessionTokenCount(session))} tokens</span>
                            <span>{formatRelativeTime(session.updatedAt)}</span>
                          </div>

                          {sessionTarget ? (
                            <a
                              href={`/chat/${encodeURIComponent(sessionTarget)}`}
                              className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-primary-700 px-3 py-1.5 text-xs font-semibold text-accent-300 transition-colors hover:border-accent-500 hover:text-accent-300 sm:px-4 sm:py-2 sm:text-sm"
                            >
                              Open Chat
                            </a>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {selectedConfigAgent ? (
        <div className="fixed inset-0 z-[95]">
          <button
            type="button"
            aria-label="Close agent config"
            className="absolute inset-0 bg-primary-950/25 backdrop-blur-sm"
            onClick={handleCloseAgentConfig}
          />

          <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l border-primary-200 bg-surface shadow-2xl">
            <header className="border-b border-primary-200 bg-primary-50/85 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-500">
                    Agent Config
                  </p>
                  <h2 className="mt-1 truncate text-xl font-semibold text-primary-900">
                    {selectedConfigAgent.name}
                  </h2>
                  <p className="mt-1 text-sm text-primary-600">
                    {selectedAgentConfig?.name && selectedAgentConfig.name !== selectedConfigAgent.name
                      ? `${selectedConfigAgent.role} · ${selectedAgentConfig.name}`
                      : selectedConfigAgent.role}
                  </p>
                  {selectedAgentConfig?.warning ? (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      {selectedAgentConfig.warning}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReloadAgentConfig}
                    disabled={agentConfigQuery.isFetching}
                  >
                    Reload
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveAgentConfig}
                    disabled={
                      !agentConfigDraft ||
                      !selectedAgentConfig ||
                      selectedAgentConfig.readOnly ||
                      !selectedAgentConfig.supportsPatch ||
                      !isConfigDirty ||
                      saveAgentConfigMutation.isPending
                    }
                  >
                    {saveAgentConfigMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleCloseAgentConfig}>
                    Close
                  </Button>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {agentConfigQuery.isLoading && !selectedAgentConfig ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="flex items-center gap-2 text-primary-500">
                    <div className="size-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600" />
                    <span className="text-sm">Loading agent config...</span>
                  </div>
                </div>
              ) : agentConfigQuery.isError && !selectedAgentConfig ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {agentConfigQuery.error instanceof Error
                    ? agentConfigQuery.error.message
                    : 'Failed to load agent config'}
                </div>
              ) : (
                <Tabs value={detailTab} onValueChange={setDetailTab}>
                  <TabsList className="mb-5 flex w-full flex-wrap gap-2 rounded-2xl border border-primary-200 bg-white p-1 text-primary-500 shadow-sm">
                    <TabsTrigger value="overview" className="min-w-[110px] flex-1">
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="tools" className="min-w-[92px] flex-1">
                      Tools
                    </TabsTrigger>
                    <TabsTrigger value="skills" className="min-w-[92px] flex-1">
                      Skills
                    </TabsTrigger>
                    <TabsTrigger value="channels" className="min-w-[102px] flex-1">
                      Channels
                    </TabsTrigger>
                    <TabsTrigger value="cron" className="min-w-[102px] flex-1">
                      Cron Jobs
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                          Agent ID
                        </p>
                        <p className="mt-2 text-sm font-medium text-primary-900">
                          {selectedConfigAgent.id}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                          Name
                        </p>
                        <p className="mt-2 text-sm font-medium text-primary-900">
                          {selectedAgentConfig?.name || selectedConfigAgent.name}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                          Workspace Path
                        </p>
                        <p className="mt-2 break-all text-sm font-medium text-primary-900">
                          {selectedAgentConfig?.workspacePath || 'Unavailable'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                            Primary Model
                          </p>
                          <p className="mt-2 text-sm font-medium text-primary-900">
                            {selectedAgentConfig?.primaryModel
                              ? formatModelName(selectedAgentConfig.primaryModel)
                              : 'Unavailable'}
                          </p>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                            Fallbacks
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(selectedAgentConfig?.fallbackModels ?? []).length > 0 ? (
                              selectedAgentConfig?.fallbackModels.map((fallback) => (
                                <span
                                  key={fallback}
                                  className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700"
                                >
                                  {formatModelName(fallback)}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-primary-500">No fallback models</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <label className="block">
                          <span className="text-xs font-semibold uppercase tracking-wide text-primary-500">
                            Model Override
                          </span>
                          <select
                            value={agentConfigDraft?.modelOverride ?? ''}
                            disabled={
                              !agentConfigDraft ||
                              selectedAgentConfig?.readOnly ||
                              !selectedAgentConfig?.supportsPatch
                            }
                            onChange={(event) => {
                              const nextValue = event.target.value
                              setAgentConfigDraft((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      modelOverride: nextValue,
                                    }
                                  : previous,
                              )
                            }}
                            className="mt-2 h-10 w-full rounded-xl border border-primary-200 bg-primary-50 px-3 text-sm text-primary-900 outline-none transition focus:border-primary-300"
                          >
                            <option value="">Use agent default</option>
                            {modelOverrideOptions.map((option) => (
                              <option key={option} value={option}>
                                {formatModelName(option)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-600">
                          {selectedAgentConfig?.sourceMethod
                            ? `Loaded via ${selectedAgentConfig.sourceMethod}`
                            : selectedAgentConfig?.readOnly
                              ? 'Read-only fallback display'
                              : 'Config ready'}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="tools" className="space-y-3">
                    {(selectedAgentConfig?.tools ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-primary-200 bg-white px-4 py-6 text-sm text-primary-500 shadow-sm">
                        No tool policy was exposed for this agent.
                      </div>
                    ) : (
                      selectedAgentConfig?.tools.map((tool) => (
                        <div
                          key={tool.id}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-primary-200 bg-white px-4 py-3 shadow-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-primary-900">
                              {prettyLabel(tool.id)}
                            </p>
                            <p className="text-xs text-primary-500">
                              {tool.source === 'allowed'
                                ? 'Allowed by policy'
                                : tool.source === 'denied'
                                  ? 'Denied by policy'
                                  : tool.source === 'explicit'
                                    ? 'Explicit per-agent rule'
                                    : 'Policy source unknown'}
                            </p>
                          </div>
                          <Switch
                            checked={agentConfigDraft?.tools[tool.id] ?? tool.enabled}
                            disabled={
                              selectedAgentConfig.readOnly ||
                              !selectedAgentConfig.supportsPatch
                            }
                            onCheckedChange={(checked) =>
                              handleToolToggle(tool.id, Boolean(checked))
                            }
                          />
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="skills" className="space-y-3">
                    {(selectedAgentConfig?.skills ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-primary-200 bg-white px-4 py-6 text-sm text-primary-500 shadow-sm">
                        No active skills were exposed for this agent.
                      </div>
                    ) : (
                      selectedAgentConfig?.skills.map((skill) => (
                        <div
                          key={skill.id}
                          className="flex items-center justify-between gap-4 rounded-2xl border border-primary-200 bg-white px-4 py-3 shadow-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-primary-900">
                              {prettyLabel(skill.id)}
                            </p>
                            <p className="text-xs text-primary-500">{skill.id}</p>
                          </div>
                          <Switch
                            checked={agentConfigDraft?.skills[skill.id] ?? skill.enabled}
                            disabled={
                              selectedAgentConfig.readOnly ||
                              !selectedAgentConfig.supportsPatch
                            }
                            onCheckedChange={(checked) =>
                              handleSkillToggle(skill.id, Boolean(checked))
                            }
                          />
                        </div>
                      ))
                    )}
                  </TabsContent>

                  <TabsContent value="channels" className="space-y-3">
                    {(selectedAgentConfig?.channels ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-primary-200 bg-white px-4 py-6 text-sm text-primary-500 shadow-sm">
                        No per-channel config was exposed for this agent.
                      </div>
                    ) : (
                      selectedAgentConfig?.channels.map((channel) => {
                        const draftChannel = agentConfigDraft?.channels[channel.id]
                        const channelConfig = draftChannel?.config ?? channel.config
                        const channelJson = safeStringify(channelConfig)
                        return (
                          <div
                            key={channel.id}
                            className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-primary-900">
                                  {prettyLabel(channel.id)}
                                </p>
                                <p className="text-xs text-primary-500">
                                  Responds on {channel.id}
                                </p>
                              </div>
                              {channel.enabled !== null ? (
                                <Switch
                                  checked={draftChannel?.enabled ?? channel.enabled}
                                  disabled={
                                    selectedAgentConfig.readOnly ||
                                    !selectedAgentConfig.supportsPatch
                                  }
                                  onCheckedChange={(checked) =>
                                    handleChannelToggle(channel.id, Boolean(checked))
                                  }
                                />
                              ) : (
                                <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-600">
                                  Display only
                                </span>
                              )}
                            </div>

                            <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50/70 p-3">
                              {channelJson ? (
                                <pre className="overflow-x-auto text-xs leading-5 text-primary-700">
                                  {channelJson}
                                </pre>
                              ) : (
                                <p className="text-xs text-primary-500">
                                  No extra channel config provided.
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </TabsContent>

                  <TabsContent value="cron" className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-primary-200 bg-white px-4 py-3 shadow-sm">
                      <div>
                        <p className="text-sm font-medium text-primary-900">
                          Assigned cron jobs
                        </p>
                        <p className="text-xs text-primary-500">
                          Matched against agent id, name, aliases, payload, and delivery config.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void navigate({ to: '/cron' })}
                      >
                        Open Cron Screen
                      </Button>
                    </div>

                    {cronJobsQuery.isLoading ? (
                      <div className="rounded-2xl border border-primary-200 bg-white px-4 py-6 text-sm text-primary-500 shadow-sm">
                        Loading cron jobs...
                      </div>
                    ) : cronJobsQuery.isError ? (
                      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700 shadow-sm">
                        {cronJobsQuery.error instanceof Error
                          ? cronJobsQuery.error.message
                          : 'Failed to load cron jobs'}
                      </div>
                    ) : selectedCronJobs.length === 0 ? (
                      <div className="rounded-2xl border border-primary-200 bg-white px-4 py-6 text-sm text-primary-500 shadow-sm">
                        No cron jobs matched this agent.
                      </div>
                    ) : (
                      selectedCronJobs.map((job) => (
                        <div
                          key={job.id}
                          className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-primary-900">
                                {job.name}
                              </p>
                              <p className="mt-1 text-xs text-primary-500">
                                {job.id}
                              </p>
                            </div>
                            <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700">
                              {job.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 text-sm text-primary-700 md:grid-cols-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-500">
                                Schedule
                              </p>
                              <p className="mt-1">{job.schedule}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-500">
                                Status
                              </p>
                              <p className="mt-1">{job.status || 'Unknown'}</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-500">
                                Last Run
                              </p>
                              <p className="mt-1">
                                {job.lastRun?.startedAt
                                  ? new Date(job.lastRun.startedAt).toLocaleString()
                                  : 'Never'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {selectedHistoryAgent ? (
        <div className="fixed inset-0 z-[90] md:hidden">
          <button
            type="button"
            aria-label="Close history"
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setHistoryAgentId(null)}
          />

          <div className="absolute inset-x-4 top-[12vh] rounded-2xl border border-white/30 bg-white/90 p-4 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-neutral-900/90">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="truncate pr-2 text-base font-bold text-neutral-900 dark:text-neutral-100">
                {selectedHistoryAgent.name} history
              </h3>
              <button
                type="button"
                className="min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 sm:px-4 sm:py-2 sm:text-sm"
                onClick={() => setHistoryAgentId(null)}
              >
                Close
              </button>
            </div>

            {selectedHistoryAgent.matchedSessions.length === 0 ? (
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                No recent sessions for this agent yet.
              </p>
            ) : (
              <div className="max-h-[48vh] space-y-2 overflow-auto">
                {selectedHistoryAgent.matchedSessions.slice(0, 8).map((session, index) => {
                  const friendlyId = getSessionFriendlyId(session)
                  const sessionModel = getSessionModelName(session)
                  return (
                    <div
                      key={`${readString(session.key)}-${readString(session.friendlyId)}-${index}`}
                      className="rounded-xl border border-white/30 bg-white/60 p-2.5 dark:border-white/10 dark:bg-neutral-900/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">
                          {getSessionTitle(session)}
                        </p>
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          {formatRelativeTime(session.updatedAt)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] font-medium text-neutral-600 dark:text-neutral-300">
                          {sessionModel
                            ? `${readString(session.status) || 'unknown'} · ${formatModelName(sessionModel)}`
                            : readString(session.status) || 'unknown'}
                        </span>
                        {friendlyId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setHistoryAgentId(null)
                              void navigate({
                                to: '/chat/$sessionKey',
                                params: { sessionKey: friendlyId },
                              })
                            }}
                            className="min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-accent-700 transition-colors hover:bg-accent-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-accent-300 dark:hover:bg-accent-950/30 sm:px-4 sm:py-2 sm:text-sm"
                          >
                            Open Chat
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
