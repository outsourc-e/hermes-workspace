import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import {
  fetchCompleteSessionCardHistory,
  fetchSessionCards,
  isAuthoritativeCompleteSessionCardHistory,
  retainCompleteSessionCardProjections,
  sessionCardQueryKeys,
} from '@/screens/chat/chat-queries'

type HistoryMessagePart = {
  type?: string
  text?: string
}

type HistoryMessage = {
  role?: string
  content?: string | Array<HistoryMessagePart>
}

type ConductorMissionRecord = {
  id?: string
  name?: string
  status?: string
  error?: string
  session_id?: string | null
  lines?: unknown
  exit_code?: number | null
  // Native-swarm fields returned by the conductor-spawn GET handler
  nativeSwarm?: boolean
  cardOwners?: unknown
  updatedAt?: number
  assignments?: Array<{
    id?: string
    workerId: string
    task?: string
    state?: string
    checkpoint?: {
      stateLabel?: string
      result?: string
      nextAction?: string
    } | null
  }>
}

type ConductorMissionResponse = {
  ok?: boolean
  mission?: ConductorMissionRecord
  error?: string
}

type MissionPhase = 'idle' | 'decomposing' | 'running' | 'complete'

export type ConductorSettings = {
  orchestratorModel: string
  workerModel: string
  projectsDir: string
  maxParallel: number
  supervised: boolean
}

const ACTIVE_MISSION_STORAGE_KEY = 'conductor:active-mission'
const ACTIVE_MISSION_STORAGE_VERSION = 3
const CONDUCTOR_HISTORY_STORAGE_VERSION = 2
const CONDUCTOR_SETTINGS_STORAGE_KEY = 'conductor-settings'
const DEFAULT_CONDUCTOR_SETTINGS: ConductorSettings = {
  orchestratorModel: '',
  workerModel: '',
  projectsDir: '',
  maxParallel: 1,
  supervised: false,
}

export function shouldPersistActiveConductorMission(
  phase: MissionPhase,
): boolean {
  return phase === 'decomposing' || phase === 'running'
}

type PersistedConductorCardOwner = {
  cardId: string
  parentCardId?: string
}

type PersistedConductorTask = Omit<ConductorTask, 'output'>

type PersistedMission = {
  version: typeof ACTIVE_MISSION_STORAGE_VERSION
  missionId: string | null
  missionJobId: string | null
  goal: string
  phase: MissionPhase
  missionStartedAt: string | null
  isPaused: boolean
  pausedElapsedMs: number
  accumulatedPausedMs: number
  pauseStartedAt: string | null
  orchestratorCardId: string | null
  workerCards: Array<PersistedConductorCardOwner>
  completedAt: string | null
  tasks: Array<PersistedConductorTask>
}

type StreamEvent =
  | { type: 'assistant'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool'
      name?: string
      phase?: string
      data?: Record<string, unknown>
    }
  | { type: 'done'; state?: string; message?: string }
  | { type: 'error'; message: string }
  | { type: 'started'; runId?: string; sessionKey?: string }

type ConductorSpawnResponse = {
  ok?: boolean
  mode?: 'dashboard' | 'portable' | 'native-swarm'
  prompt?: string | null
  missionId?: string | null
  sessionKey?: string | null
  sessionKeyPrefix?: string | null
  jobId?: string | null
  jobName?: string | null
  runId?: string | null
  assignments?: Array<{ workerId: string; task: string; rationale: string }>
  cardOwners?: unknown
  error?: string
}

type PortableStreamResult = {
  runId: string | null
  sessionKey: string | null
  text: string
}

export type ConductorWorker = {
  key: string
  cardId?: string
  parentCardId?: string
  relationshipKind?: ConductorCardActivity['kind']
  label: string
  model: string | null
  status: 'running' | 'complete' | 'stale' | 'idle'
  updatedAt: string | null
  displayName: string
  totalTokens: number
  contextTokens: number
  tokenUsageLabel: string
}

type ConductorCardActivity = {
  key: string
  cardId: string
  canonicalSegmentKey: string
  canonicalSource: 'local' | 'remote'
  canonicalTransport: 'tmux' | 'gateway'
  parentCardId?: string
  title: string
  label: string
  kind: 'root' | 'orphan' | 'branch' | 'child'
  status?: 'idle' | 'running' | 'complete' | 'error'
  updatedAt: number
  identityAliases: Array<string>
  parentTitle?: string
}

export type ConductorCardSummary = Pick<
  ConductorCardActivity,
  'cardId' | 'title' | 'kind' | 'status' | 'updatedAt'
>

export type ConductorTask = {
  id: string
  title: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  workerCardId: string | null
  output: string | null
}

export type ConductorWorkerOutputStatus = 'loading' | 'ready' | 'unavailable'

export type MissionHistoryWorkerDetail = {
  label: string
  model: string
  totalTokens: number
  personaEmoji: string
  personaName: string
}

export type MissionHistoryEntry = {
  id: string
  goal: string
  startedAt: string
  completedAt: string
  workerCount: number
  totalTokens: number
  status: 'completed' | 'failed'
  projectPath: string | null
  outputPath?: string | null
  workerSummary?: Array<string>
  outputText?: string
  streamText?: string
  completeSummary?: string
  workerDetails?: Array<MissionHistoryWorkerDetail>
  error?: string | null
}

type PersistedMissionHistoryEntry = Pick<
  MissionHistoryEntry,
  | 'id'
  | 'goal'
  | 'startedAt'
  | 'completedAt'
  | 'workerCount'
  | 'totalTokens'
  | 'status'
  | 'projectPath'
  | 'outputPath'
  | 'workerDetails'
>

type PersistedMissionHistory = {
  version: typeof CONDUCTOR_HISTORY_STORAGE_VERSION
  entries: Array<PersistedMissionHistoryEntry>
}

const HISTORY_STORAGE_KEY = 'conductor:history'
const MAX_HISTORY_ENTRIES = 50

const AGENT_NAMES = [
  'Nova',
  'Pixel',
  'Blaze',
  'Echo',
  'Sage',
  'Drift',
  'Flux',
  'Volt',
]
const AGENT_EMOJIS = ['🤖', '⚡', '🔥', '🌊', '🌿', '💫', '🔮', '⭐']

function getAgentPersona(index: number) {
  return {
    name: AGENT_NAMES[index % AGENT_NAMES.length] ?? `Agent ${index + 1}`,
    emoji: AGENT_EMOJIS[index % AGENT_EMOJIS.length] ?? '🤖',
  }
}

function extractTasksFromPlan(planText: string): Array<ConductorTask> {
  const tasks: Array<ConductorTask> = []
  const patterns = [
    /^\s*(\d+)\.\s+(.+)$/gm,
    /^\s*#{1,3}\s+(?:Step\s+)?(\d+)[.:]\s*(.+)$/gm,
    /^\s*-\s+\*\*(?:Task\s+)?(\d+)[.:]\s*\*\*\s*(.+)$/gm,
  ]

  const seen = new Set<string>()
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(planText)) !== null) {
      const num = match.at(1)
      const rawTitle = match.at(2)
      if (!num || !rawTitle) continue
      const title = rawTitle.replace(/\*\*/g, '').trim()
      const id = `task-${num}`
      if (!seen.has(id) && title.length > 3 && title.length < 200) {
        seen.add(id)
        tasks.push({
          id,
          title,
          status: 'pending',
          workerCardId: null,
          output: null,
        })
      }
    }
  }

  tasks.sort((a, b) => {
    const numA = parseInt(a.id.replace('task-', ''), 10)
    const numB = parseInt(b.id.replace('task-', ''), 10)
    return numA - numB
  })

  return tasks
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null
}

export function normalizeConductorCardOwners(
  value: unknown,
): Array<PersistedConductorCardOwner> {
  if (!Array.isArray(value)) return []
  const owners = new Map<string, PersistedConductorCardOwner>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue
    const record = candidate as Record<string, unknown>
    const cardId = readString(record.cardId)
    if (!cardId) continue
    const parentCardId = readString(record.parentCardId)
    const owner = parentCardId ? { cardId, parentCardId } : { cardId }
    owners.set(`${owner.cardId}\u0000${owner.parentCardId ?? ''}`, owner)
  }
  return [...owners.values()]
}

function readCardId(value: unknown): string | null {
  const cardId = readString(value)
  if (!cardId) return null
  return cardId.startsWith('remote:') || cardId.startsWith('local:')
    ? cardId
    : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function toIso(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  return null
}

const RETIRED_CONDUCTOR_PERSISTENCE_FIELDS = new Set([
  'workerKey',
  'workerKeys',
  'workerLabels',
  'workerOutputs',
  'agentSessionMap',
  'agentSessions',
  'agentSessionModelMap',
  'sessionKey',
  'canonicalSegmentKey',
  'streamText',
  'planText',
  'output',
])

function containsRetiredConductorPersistence(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(containsRetiredConductorPersistence)
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).some((key) =>
      RETIRED_CONDUCTOR_PERSISTENCE_FIELDS.has(key),
    )
  ) {
    return true
  }
  return Object.values(record).some(containsRetiredConductorPersistence)
}

function loadPersistedMission(): PersistedMission | null {
  try {
    const raw = globalThis.localStorage.getItem(ACTIVE_MISSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (
      parsed.version !== ACTIVE_MISSION_STORAGE_VERSION ||
      containsRetiredConductorPersistence(parsed)
    ) {
      clearPersistedMission()
      return null
    }

    const missionId = readString(parsed.missionId)
    const missionJobId = readString(parsed.missionJobId)
    const goal = typeof parsed.goal === 'string' ? parsed.goal : null
    const phase = parsed.phase
    const orchestratorCardId =
      parsed.orchestratorCardId === null ||
      parsed.orchestratorCardId === undefined
        ? null
        : readCardId(parsed.orchestratorCardId)
    const missionStartedAt =
      parsed.missionStartedAt === null || parsed.missionStartedAt === undefined
        ? null
        : toIso(parsed.missionStartedAt)
    const isPaused = parsed.isPaused === true
    const pausedElapsedMs =
      typeof parsed.pausedElapsedMs === 'number' &&
      Number.isFinite(parsed.pausedElapsedMs)
        ? Math.max(0, parsed.pausedElapsedMs)
        : 0
    const accumulatedPausedMs =
      typeof parsed.accumulatedPausedMs === 'number' &&
      Number.isFinite(parsed.accumulatedPausedMs)
        ? Math.max(0, parsed.accumulatedPausedMs)
        : 0
    const pauseStartedAt =
      parsed.pauseStartedAt === null || parsed.pauseStartedAt === undefined
        ? null
        : toIso(parsed.pauseStartedAt)
    const completedAt =
      parsed.completedAt === null || parsed.completedAt === undefined
        ? null
        : toIso(parsed.completedAt)

    if (!Array.isArray(parsed.workerCards) || !Array.isArray(parsed.tasks)) {
      clearPersistedMission()
      return null
    }

    const workerCards: Array<PersistedConductorCardOwner> = []
    const seenCardIds = new Set<string>()
    for (const value of parsed.workerCards) {
      const record = readRecord(value)
      const cardId = readCardId(record?.cardId)
      const parentCardId =
        record?.parentCardId === undefined
          ? null
          : readCardId(record.parentCardId)
      if (
        !record ||
        !cardId ||
        seenCardIds.has(cardId) ||
        (record.parentCardId !== undefined && !parentCardId) ||
        parentCardId === cardId
      ) {
        clearPersistedMission()
        return null
      }
      seenCardIds.add(cardId)
      workerCards.push(parentCardId ? { cardId, parentCardId } : { cardId })
    }

    const tasks: Array<PersistedConductorTask> = []
    for (const task of parsed.tasks) {
      const record = readRecord(task)
      const id = readString(record?.id)
      const title = readString(record?.title)
      const status = record?.status
      const workerCardId =
        record?.workerCardId === null || record?.workerCardId === undefined
          ? null
          : readCardId(record.workerCardId)
      if (
        !record ||
        !id ||
        !title ||
        (status !== 'pending' &&
          status !== 'running' &&
          status !== 'complete' &&
          status !== 'failed') ||
        (record.workerCardId != null && !workerCardId) ||
        (workerCardId !== null &&
          workerCardId !== orchestratorCardId &&
          !seenCardIds.has(workerCardId))
      ) {
        clearPersistedMission()
        return null
      }
      tasks.push({ id, title, status, workerCardId })
    }

    if (
      !goal ||
      (phase !== 'idle' &&
        phase !== 'decomposing' &&
        phase !== 'running' &&
        phase !== 'complete') ||
      (parsed.orchestratorCardId != null && !orchestratorCardId)
    ) {
      clearPersistedMission()
      return null
    }

    // Completed/stopped missions are already represented in mission history.
    if (!shouldPersistActiveConductorMission(phase)) {
      clearPersistedMission()
      return null
    }

    const candidate: PersistedMission = {
      version: ACTIVE_MISSION_STORAGE_VERSION,
      missionId,
      missionJobId,
      goal,
      phase,
      missionStartedAt,
      isPaused,
      pausedElapsedMs,
      accumulatedPausedMs,
      pauseStartedAt,
      orchestratorCardId,
      workerCards,
      completedAt,
      tasks,
    }
    // Quarantine Card-looking fields in memory. Never retain the durable copy
    // until a complete authoritative Card projection validates exact owners.
    clearPersistedMission()
    return candidate
  } catch {
    clearPersistedMission()
    return null
  }
}

function loadConductorSettings(): ConductorSettings {
  try {
    const raw = globalThis.localStorage.getItem(CONDUCTOR_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_CONDUCTOR_SETTINGS
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      orchestratorModel:
        typeof parsed.orchestratorModel === 'string'
          ? parsed.orchestratorModel
          : DEFAULT_CONDUCTOR_SETTINGS.orchestratorModel,
      workerModel:
        typeof parsed.workerModel === 'string'
          ? parsed.workerModel
          : DEFAULT_CONDUCTOR_SETTINGS.workerModel,
      projectsDir:
        typeof parsed.projectsDir === 'string'
          ? parsed.projectsDir
          : DEFAULT_CONDUCTOR_SETTINGS.projectsDir,
      maxParallel: Math.min(
        5,
        Math.max(
          1,
          typeof parsed.maxParallel === 'number' &&
            Number.isFinite(parsed.maxParallel)
            ? Math.round(parsed.maxParallel)
            : DEFAULT_CONDUCTOR_SETTINGS.maxParallel,
        ),
      ),
      supervised:
        typeof parsed.supervised === 'boolean'
          ? parsed.supervised
          : DEFAULT_CONDUCTOR_SETTINGS.supervised,
    }
  } catch {
    return DEFAULT_CONDUCTOR_SETTINGS
  }
}

function persistConductorSettings(settings: ConductorSettings): void {
  try {
    globalThis.localStorage.setItem(
      CONDUCTOR_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    )
  } catch {
    // Ignore persistence failures.
  }
}

function parsePersistedMissionHistoryEntry(
  value: unknown,
): PersistedMissionHistoryEntry | null {
  const entry = readRecord(value)
  if (!entry) return null
  const id = readString(entry.id)
  const startedAt = toIso(entry.startedAt)
  const completedAt = toIso(entry.completedAt)
  if (
    !id ||
    typeof entry.goal !== 'string' ||
    !startedAt ||
    !completedAt ||
    typeof entry.workerCount !== 'number' ||
    !Number.isFinite(entry.workerCount) ||
    typeof entry.totalTokens !== 'number' ||
    !Number.isFinite(entry.totalTokens) ||
    (entry.status !== 'completed' && entry.status !== 'failed') ||
    (entry.projectPath !== null && typeof entry.projectPath !== 'string') ||
    (entry.outputPath !== undefined &&
      entry.outputPath !== null &&
      typeof entry.outputPath !== 'string') ||
    'outputText' in entry ||
    'streamText' in entry ||
    'workerSummary' in entry ||
    'completeSummary' in entry ||
    'error' in entry
  ) {
    return null
  }

  let workerDetails: Array<MissionHistoryWorkerDetail> | undefined
  if (entry.workerDetails !== undefined) {
    if (!Array.isArray(entry.workerDetails)) return null
    workerDetails = []
    for (const detailValue of entry.workerDetails) {
      const detail = readRecord(detailValue)
      if (
        !detail ||
        typeof detail.label !== 'string' ||
        typeof detail.model !== 'string' ||
        typeof detail.totalTokens !== 'number' ||
        !Number.isFinite(detail.totalTokens) ||
        typeof detail.personaEmoji !== 'string' ||
        typeof detail.personaName !== 'string'
      ) {
        return null
      }
      workerDetails.push({
        label: detail.label,
        model: detail.model,
        totalTokens: detail.totalTokens,
        personaEmoji: detail.personaEmoji,
        personaName: detail.personaName,
      })
    }
  }

  return {
    id,
    goal: entry.goal,
    startedAt,
    completedAt,
    workerCount: Math.max(0, entry.workerCount),
    totalTokens: Math.max(0, entry.totalTokens),
    status: entry.status,
    projectPath: entry.projectPath,
    ...(entry.outputPath !== undefined ? { outputPath: entry.outputPath } : {}),
    ...(workerDetails ? { workerDetails } : {}),
  }
}

function toPersistedMissionHistoryEntry(
  entry: MissionHistoryEntry,
): PersistedMissionHistoryEntry | null {
  return parsePersistedMissionHistoryEntry({
    id: entry.id,
    goal: entry.goal,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    workerCount: entry.workerCount,
    totalTokens: entry.totalTokens,
    status: entry.status,
    projectPath: entry.projectPath,
    ...(entry.outputPath !== undefined ? { outputPath: entry.outputPath } : {}),
    ...(entry.workerDetails ? { workerDetails: entry.workerDetails } : {}),
  })
}

function loadMissionHistory(): Array<MissionHistoryEntry> {
  try {
    const raw = globalThis.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (
      parsed.version !== CONDUCTOR_HISTORY_STORAGE_VERSION ||
      !Array.isArray(parsed.entries)
    ) {
      clearMissionHistoryStorage()
      return []
    }
    const entries = parsed.entries.map(parsePersistedMissionHistoryEntry)
    if (entries.some((entry) => entry === null)) {
      clearMissionHistoryStorage()
      return []
    }
    const seen = new Set<string>()
    return (entries as Array<PersistedMissionHistoryEntry>)
      .filter((entry) => {
        if (seen.has(entry.id)) return false
        seen.add(entry.id)
        return true
      })
      .slice(0, MAX_HISTORY_ENTRIES)
  } catch {
    clearMissionHistoryStorage()
    return []
  }
}

function appendMissionHistory(entry: MissionHistoryEntry): void {
  const safeEntry = toPersistedMissionHistoryEntry(entry)
  if (!safeEntry) return
  try {
    const current = loadMissionHistory()
      .map(toPersistedMissionHistoryEntry)
      .filter((value): value is PersistedMissionHistoryEntry => Boolean(value))
    const entries = [
      safeEntry,
      ...current.filter((candidate) => candidate.id !== safeEntry.id),
    ].slice(0, MAX_HISTORY_ENTRIES)
    const persisted: PersistedMissionHistory = {
      version: CONDUCTOR_HISTORY_STORAGE_VERSION,
      entries,
    }
    globalThis.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(persisted),
    )
  } catch {
    // Ignore persistence failures.
  }
}

function persistMission(state: PersistedMission): void {
  try {
    globalThis.localStorage.setItem(
      ACTIVE_MISSION_STORAGE_KEY,
      JSON.stringify(state),
    )
  } catch {
    // Ignore persistence failures.
  }
}

function clearPersistedMission(): void {
  try {
    globalThis.localStorage.removeItem(ACTIVE_MISSION_STORAGE_KEY)
  } catch {
    // Ignore persistence failures.
  }
}

function clearMissionHistoryStorage(): void {
  try {
    globalThis.localStorage.removeItem(HISTORY_STORAGE_KEY)
  } catch {
    // Ignore persistence failures.
  }
}

function workersLookComplete(
  workers: Array<ConductorWorker>,
  _staleAfterMs: number,
): boolean {
  if (workers.length === 0) return false

  return workers.every(
    (worker) =>
      worker.relationshipKind === 'root' ||
      worker.relationshipKind === 'orphan' ||
      worker.status === 'complete' ||
      worker.status === 'stale',
  )
}

function projectChildSessionCardActivities(
  children: SessionCardListWire['cards'][number]['childNodes'],
  parentCardId: string,
  parentTitle: string,
  canonicalSource: 'local' | 'remote',
): Array<ConductorCardActivity> {
  return children.flatMap((child) => {
    const activity: ConductorCardActivity = {
      key: child.cardId,
      cardId: child.cardId,
      canonicalSegmentKey: child.sessionKey,
      canonicalSource,
      canonicalTransport: canonicalSource === 'remote' ? 'gateway' : 'tmux',
      parentCardId,
      title: child.title,
      label: child.title,
      kind: child.relationshipKind,
      status: child.status,
      updatedAt: child.updatedAt,
      identityAliases: [
        child.cardId,
        child.sessionKey,
        ...child.continuationSegmentKeys,
      ],
      parentTitle,
    }
    return [
      activity,
      ...projectChildSessionCardActivities(
        child.childNodes ?? [],
        child.cardId,
        child.title,
        canonicalSource,
      ),
    ]
  })
}

function projectSessionCardActivities(
  response: SessionCardListWire | undefined,
): Array<ConductorCardActivity> {
  const complete = retainCompleteSessionCardProjections(response)
  if (!complete) return []
  return complete.cards.flatMap((card) => {
    if (card.canonicalSource !== 'local' && card.canonicalSource !== 'remote') {
      return []
    }
    const canonicalSource = card.canonicalSource
    const root: ConductorCardActivity = {
      key: card.cardId,
      cardId: card.cardId,
      canonicalSegmentKey: card.canonicalSegmentKey,
      canonicalSource,
      canonicalTransport: canonicalSource === 'remote' ? 'gateway' : 'tmux',
      title: card.title,
      label: card.title,
      kind: card.relationshipKind,
      updatedAt: card.updatedAt,
      identityAliases: [
        card.cardId,
        card.canonicalSegmentKey,
        ...card.continuationSegmentKeys,
      ],
    }
    return [
      root,
      ...projectChildSessionCardActivities(
        card.childNodes,
        card.cardId,
        card.title,
        canonicalSource,
      ),
    ]
  })
}

function remoteControlKeyForPrefix(
  response: SessionCardListWire | undefined,
  prefix: string,
): string | null {
  const normalizedPrefix = prefix.trim()
  if (!normalizedPrefix) return null
  const qualifiedPrefix = `remote:${normalizedPrefix}`
  const matches = projectSessionCardActivities(response)
    .filter((activity) =>
      activity.identityAliases.some((identity) =>
        identity.startsWith(qualifiedPrefix),
      ),
    )
    .map((activity) => activity.canonicalSegmentKey)
    .filter((identity) => identity.startsWith('remote:'))
  const uniqueMatches = [...new Set(matches)]
  if (uniqueMatches.length === 0) return null
  const shortestLength = Math.min(...uniqueMatches.map((key) => key.length))
  const shortestMatches = uniqueMatches.filter(
    (key) => key.length === shortestLength,
  )
  if (shortestMatches.length !== 1) return null
  return shortestMatches[0]!.slice('remote:'.length) || null
}

function activityMatchesCardOwner(
  activity: ConductorCardActivity,
  owners: ReadonlyArray<PersistedConductorCardOwner>,
): boolean {
  return owners.some(
    (owner) =>
      owner.cardId === activity.cardId &&
      owner.parentCardId === activity.parentCardId,
  )
}

export function buildConductorStopCardBindings(
  response: SessionCardListWire | undefined,
  owners: ReadonlyArray<PersistedConductorCardOwner>,
) {
  return projectSessionCardActivities(response)
    .filter((activity) => activityMatchesCardOwner(activity, owners))
    .map((activity) => ({
      kind: 'session-card-owner' as const,
      cardId: activity.cardId,
      parentCardId: activity.parentCardId ?? null,
      canonicalSource: activity.canonicalSource,
      canonicalSegmentKey: activity.canonicalSegmentKey,
      canonicalTransport: activity.canonicalTransport,
    }))
}

export function retainConductorOwnersAfterStopFailure(
  owners: ReadonlyArray<PersistedConductorCardOwner>,
  bindings: ReadonlyArray<
    ReturnType<typeof buildConductorStopCardBindings>[number]
  >,
  failures: ReadonlyArray<{ operation?: string; id?: string }>,
): Array<PersistedConductorCardOwner> {
  const retainedCardIds = new Set<string>()
  for (const failure of failures) {
    if (failure.operation === 'stop-mission' || !failure.operation) {
      return [...owners]
    }
    let cardId: string | undefined
    if (failure.operation === 'delete-session') {
      cardId = failure.id
    } else if (failure.operation === 'reset-worker' && failure.id) {
      cardId = bindings.find(
        (binding) =>
          binding.canonicalSource === 'local' &&
          binding.canonicalSegmentKey === `local:${failure.id}`,
      )?.cardId
    } else {
      // Unknown cleanup categories are unresolved authority, not proof that any
      // Card owner can be discarded.
      return [...owners]
    }
    if (!cardId || !owners.some((owner) => owner.cardId === cardId)) {
      return [...owners]
    }
    retainedCardIds.add(cardId)
  }
  return owners.filter((owner) => retainedCardIds.has(owner.cardId))
}

function projectUniqueActivityForIdentity(
  activities: ReadonlyArray<ConductorCardActivity>,
  identity: string,
): ConductorCardActivity | null {
  const normalized = identity.trim()
  if (!normalized) return null
  const qualified =
    normalized.startsWith('remote:') || normalized.startsWith('local:')
      ? normalized
      : `remote:${normalized}`
  const matches = activities.filter((activity) =>
    activity.identityAliases.includes(qualified),
  )
  return matches.length === 1 ? matches[0]! : null
}

/**
 * A stream event can suggest a successor transport, but only the mission-bound
 * identity returned by the spawn/status API is an ownership anchor. The
 * candidate is trusted only when a complete Card projection proves both
 * identities are aliases of the same exact Card owner.
 */
export function resolveAuthoritativeConductorCardOwner(
  response: SessionCardListWire | undefined,
  missionIdentity: string,
  candidateIdentity: string,
): (PersistedConductorCardOwner & { sessionKey: string }) | null {
  const activities = projectSessionCardActivities(response)
  const anchor = projectUniqueActivityForIdentity(activities, missionIdentity)
  const candidate = projectUniqueActivityForIdentity(
    activities,
    candidateIdentity,
  )
  if (
    !anchor ||
    !candidate ||
    anchor.cardId !== candidate.cardId ||
    anchor.parentCardId !== candidate.parentCardId
  ) {
    return null
  }
  const sessionKey = remoteControlKey(candidate)
  if (!sessionKey) return null
  return {
    cardId: candidate.cardId,
    ...(candidate.parentCardId ? { parentCardId: candidate.parentCardId } : {}),
    sessionKey,
  }
}

function validatePersistedMissionCardOwnership(
  mission: PersistedMission,
  activities: ReadonlyArray<ConductorCardActivity>,
): PersistedMission | null {
  const ownerKey = (cardId: string, parentCardId?: string) =>
    `${parentCardId ?? ''}\u0000${cardId}`
  const byExactOwner = new Map(
    activities.map((activity) => [
      ownerKey(activity.cardId, activity.parentCardId),
      activity,
    ]),
  )

  const workerCards: Array<PersistedConductorCardOwner> = []
  for (const persistedOwner of mission.workerCards) {
    const activity = byExactOwner.get(
      ownerKey(persistedOwner.cardId, persistedOwner.parentCardId),
    )
    if (!activity) return null
    workerCards.push({
      cardId: activity.cardId,
      ...(activity.parentCardId ? { parentCardId: activity.parentCardId } : {}),
    })
  }

  let orchestratorCardId: string | null = null
  if (mission.orchestratorCardId) {
    const activity = activities.find(
      (candidate) =>
        candidate.cardId === mission.orchestratorCardId &&
        candidate.parentCardId === undefined,
    )
    if (!activity) return null
    orchestratorCardId = activity.cardId
  }

  const trustedCardIds = new Set([
    ...workerCards.map((owner) => owner.cardId),
    ...(orchestratorCardId ? [orchestratorCardId] : []),
  ])
  const tasks: Array<PersistedConductorTask> = []
  for (const task of mission.tasks) {
    if (task.workerCardId && !trustedCardIds.has(task.workerCardId)) return null
    tasks.push(task)
  }

  return {
    ...mission,
    orchestratorCardId,
    workerCards,
    tasks,
  }
}

function remoteControlKey(activity: ConductorCardActivity): string | null {
  return activity.canonicalSegmentKey.startsWith('remote:')
    ? activity.canonicalSegmentKey.slice('remote:'.length) || null
    : null
}

function activityStatus(
  status: ConductorCardActivity['status'],
): ConductorWorker['status'] {
  if (status === 'complete') return 'complete'
  if (status === 'error') return 'stale'
  if (status === 'idle') return 'idle'
  return 'running'
}

function toWorker(session: ConductorCardActivity): ConductorWorker {
  return {
    key: session.cardId,
    cardId: session.cardId,
    ...(session.parentCardId ? { parentCardId: session.parentCardId } : {}),
    relationshipKind: session.kind,
    label: session.title,
    model: null,
    status: activityStatus(session.status),
    updatedAt: toIso(session.updatedAt),
    displayName: session.title,
    totalTokens: 0,
    contextTokens: 0,
    tokenUsageLabel: 'Unavailable in Card projection',
  }
}

function extractHistoryMessageText(
  message: HistoryMessage | undefined,
): string {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function getLastAssistantMessage(
  messages: Array<HistoryMessage> | undefined,
): string {
  if (!Array.isArray(messages)) return ''
  // Return the longest assistant message so we prefer the substantive work output.
  let best = ''
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages.at(index)
    if (message?.role !== 'assistant') continue
    const text = extractHistoryMessageText(message).trim()
    if (text.length > best.length) best = text
  }
  return best
}

function readMissionLines(
  mission: ConductorMissionRecord | null | undefined,
): Array<string> {
  if (!Array.isArray(mission?.lines)) return []
  return mission.lines.filter(
    (line): line is string => typeof line === 'string',
  )
}

function extractSessionIdFromMission(
  mission: ConductorMissionRecord | null | undefined,
): string | null {
  const direct = readString(mission?.session_id)
  if (direct) return direct

  const lines = readMissionLines(mission)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines.at(index)
    if (!line) continue
    const match = line.match(/\bsession_id:\s*([A-Za-z0-9_.:-]+)/)
    if (match?.[1]) return match[1]
  }
  return null
}

function formatMissionLog(lines: Array<string>): string {
  return lines
    .map((line) => line.trimEnd())
    .filter(
      (line) =>
        line.trim().length > 0 &&
        !/\b(?:session_id|sessionKey|session_key|workerKey|worker_key)\s*:/i.test(
          line,
        ),
    )
    .join('\n')
    .slice(-10_000)
}

function isFailedMissionStatus(status: string | null): boolean {
  return (
    status === 'failed' ||
    status === 'error' ||
    status === 'errored' ||
    status === 'cancelled' ||
    status === 'canceled'
  )
}

function isCompletedMissionStatus(status: string | null): boolean {
  return (
    status === 'completed' ||
    status === 'complete' ||
    status === 'done' ||
    status === 'success'
  )
}

async function fetchConductorMission(
  missionId: string,
): Promise<ConductorMissionRecord> {
  const response = await fetch(
    `/api/conductor-spawn?missionId=${encodeURIComponent(missionId)}&lines=400`,
  )
  const payload = (await response
    .json()
    .catch(() => ({}))) as ConductorMissionResponse
  if (!response.ok || !payload.ok || !payload.mission) {
    throw new Error(
      payload.error || `Failed to load conductor mission ${missionId}`,
    )
  }
  return payload.mission
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

function buildMissionOutputPath(
  workers: Array<ConductorWorker>,
  workerOutputs: Record<string, string>,
  tasks: Array<ConductorTask>,
  streamText: string,
): string | null {
  const workerOutputTexts = Object.values(workerOutputs).filter(Boolean)

  for (const text of workerOutputTexts) {
    const extractedPath = extractProjectPath(text)
    if (extractedPath) return extractedPath
  }

  for (const task of tasks) {
    if (!task.output) continue
    const extractedPath = extractProjectPath(task.output)
    if (extractedPath) return extractedPath
  }

  const streamPath = extractProjectPath(streamText)
  if (streamPath) return streamPath

  return null
}

function summarizeWorkers(
  workers: Array<ConductorWorker>,
  workerOutputs: Record<string, string>,
): Array<string> {
  return workers.map((worker) => {
    const output = workerOutputs[worker.key] ?? ''
    const firstLine = output
      .split(/\n+/)
      .map((line) => line.trim())
      .find(Boolean)
    const statusLabel = worker.status === 'stale' ? 'failed' : worker.status
    return `${worker.displayName}: ${firstLine ?? statusLabel}`
  })
}

function buildCompleteSummary(params: {
  goal: string
  streamError: string | null
  missionStartedAt: string
  completedAt: string
  totalWorkers: number
  totalTokens: number
  outputPath: string | null
}): string {
  const {
    goal,
    streamError,
    missionStartedAt,
    completedAt,
    totalWorkers,
    totalTokens,
    outputPath,
  } = params
  const durationMs = Math.max(
    0,
    new Date(completedAt).getTime() - new Date(missionStartedAt).getTime(),
  )
  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const duration =
    hours > 0
      ? `${hours}h ${minutes}m ${seconds}s`
      : minutes > 0
        ? `${minutes}m ${seconds}s`
        : `${seconds}s`

  const lines = [
    streamError ? `❌ ${streamError}` : '✅ Mission completed successfully',
    '',
    `**Goal:** ${goal}`,
    `**Duration:** ${duration}`,
  ]

  if (totalWorkers > 0) {
    lines.push(
      `**Workers:** ${totalWorkers} ran · ${totalTokens.toLocaleString()} tokens`,
    )
  }

  if (outputPath) {
    lines.push(`**Output:** ${outputPath.split('/').pop() || 'Output ready'}`)
  }

  return lines.join('\n')
}

function buildMissionOutputText(
  workers: Array<ConductorWorker>,
  workerOutputs: Record<string, string>,
  streamText: string,
): string {
  const workerSections = workers
    .map((worker) => {
      const output = (workerOutputs[worker.key] ?? '').trim()
      if (!output) return null
      return `### ${worker.displayName}\n\n${output}`
    })
    .filter((section): section is string => section !== null)

  if (workerSections.length > 0) {
    return workerSections.join('\n\n---\n\n').slice(0, 5000)
  }

  return streamText.trim().slice(0, 5000)
}

async function fetchWorkerOutput(worker: {
  cardId: string
  canonicalSegmentKey: string
  parentCardId?: string
}): Promise<{
  status: Exclude<ConductorWorkerOutputStatus, 'loading'>
  output: string
}> {
  const history = await fetchCompleteSessionCardHistory({
    cardId: worker.cardId,
    canonicalSegmentKey: worker.canonicalSegmentKey,
    ...(worker.parentCardId ? { parentCardId: worker.parentCardId } : {}),
  })
  if (!isAuthoritativeCompleteSessionCardHistory(history)) {
    return { status: 'unavailable', output: '' }
  }
  return {
    status: 'ready',
    output: getLastAssistantMessage(history.messages as Array<HistoryMessage>),
  }
}

function appendStreamEvent(
  update: Dispatch<SetStateAction<Array<StreamEvent>>>,
  event: StreamEvent,
): void {
  update((current) => [...current.slice(-99), event])
}

function readStreamText(
  event: string,
  payload: Record<string, unknown>,
  currentText: string,
): string | null {
  if (event !== 'chunk' && event !== 'assistant') return null
  const text =
    readString(payload.delta) ??
    readString(payload.text) ??
    readString(payload.content) ??
    readString(payload.chunk)
  if (!text) return null
  return payload.fullReplace === true || event === 'assistant'
    ? text
    : currentText + text
}

function readDoneMessageText(payload: Record<string, unknown>): string {
  const message = readRecord(payload.message)
  return extractHistoryMessageText(message as HistoryMessage | undefined).trim()
}

async function streamPortableConductorMission(params: {
  sessionKey: string
  friendlyId: string
  prompt: string
  model?: string
  signal: AbortSignal
  onSessionResolved: (sessionKey: string, runId: string | null) => void
  onText: (text: string) => void
  onStreamEvent: (event: StreamEvent) => void
}): Promise<PortableStreamResult> {
  const response = await fetch('/api/send-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionKey: params.sessionKey,
      friendlyId: params.friendlyId,
      message: params.prompt,
      history: [],
      idempotencyKey: crypto.randomUUID(),
      model: params.model || undefined,
      locale:
        typeof window !== 'undefined'
          ? localStorage.getItem('hermes-workspace-locale') || 'en'
          : 'en',
    }),
    signal: params.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Conductor stream failed (${response.status})`)
  }

  let sessionKey =
    response.headers.get('x-hermes-session-key')?.trim() || params.sessionKey
  let runId: string | null = null
  let accumulated = ''
  let sawDone = false

  params.onSessionResolved(sessionKey, runId)

  const reader = response.body?.getReader()
  if (!reader)
    throw new Error('Conductor stream did not include a response body')

  const decoder = new TextDecoder()
  let buffer = ''

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- reader.read() exits when done is true
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      if (!block.trim()) continue
      const lines = block.split('\n')
      let event = ''
      let data = ''

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          event = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          data += line.slice(6)
        } else if (line.startsWith('data:')) {
          data += line.slice(5)
        }
      }

      if (!event || !data) continue

      let payload: Record<string, unknown>
      try {
        payload = readRecord(JSON.parse(data)) ?? {}
      } catch {
        continue
      }

      if (event === 'started') {
        runId = readString(payload.runId) ?? runId
        sessionKey = readString(payload.sessionKey) ?? sessionKey
        params.onSessionResolved(sessionKey, runId)
        params.onStreamEvent({
          type: 'started',
          runId: runId ?? undefined,
          sessionKey,
        })
        continue
      }

      const nextText = readStreamText(event, payload, accumulated)
      if (nextText !== null) {
        accumulated = nextText
        params.onText(accumulated)
        continue
      }

      if (event === 'thinking') {
        const text = readString(payload.text) ?? readString(payload.thinking)
        if (text) params.onStreamEvent({ type: 'thinking', text })
        continue
      }

      if (event === 'tool') {
        const name = readString(payload.name) ?? undefined
        const phase = readString(payload.phase) ?? undefined
        params.onStreamEvent({ type: 'tool', name, phase, data: payload })
        continue
      }

      if (event === 'done' || event === 'complete') {
        sawDone = true
        const state = readString(payload.state) ?? undefined
        const message =
          readString(payload.errorMessage) ??
          readString(payload.message) ??
          undefined
        const finalText = readDoneMessageText(payload)
        if (!accumulated && finalText) {
          accumulated = finalText
          params.onText(accumulated)
        }
        params.onStreamEvent({ type: 'done', state, message })
        if (state === 'error' && message) throw new Error(message)
        continue
      }

      if (event === 'error') {
        const message = readString(payload.message) ?? 'Conductor stream error'
        params.onStreamEvent({ type: 'error', message })
        throw new Error(message)
      }
    }
  }

  if (!sawDone && !accumulated) {
    throw new Error('Conductor stream closed without output')
  }

  return { runId, sessionKey, text: accumulated }
}

export function useConductorGateway() {
  const [initialMission] = useState<PersistedMission | null>(() =>
    loadPersistedMission(),
  )
  const [persistedMissionValidated, setPersistedMissionValidated] = useState(
    initialMission === null,
  )
  const [missionId, setMissionId] = useState<string | null>(null)
  const [missionJobId, setMissionJobId] = useState<string | null>(null)
  const [phase, setPhase] = useState<MissionPhase>('idle')
  const [goal, setGoal] = useState('')
  // A stream/header candidate remains pending and is never persisted or used for
  // control until the exact mission-bound Card projection authorizes it.
  const [pendingOrchestratorSessionKey, setPendingOrchestratorSessionKey] =
    useState<string | null>(null)
  const [orchestratorMissionIdentity, setOrchestratorMissionIdentity] =
    useState<string | null>(null)
  const [orchestratorCardId, setOrchestratorCardId] = useState<string | null>(
    null,
  )
  const [streamText, setStreamText] = useState('')
  const [planText, setPlanText] = useState('')
  const [streamEvents, setStreamEvents] = useState<Array<StreamEvent>>([])
  const [missionStartedAt, setMissionStartedAt] = useState<string | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const [pausedElapsedMs, setPausedElapsedMs] = useState(0)
  const [accumulatedPausedMs, setAccumulatedPausedMs] = useState(0)
  const [pauseStartedAt, setPauseStartedAt] = useState<string | null>(null)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [timeoutWarning, setTimeoutWarning] = useState(false)
  const [missionCardOwners, setMissionCardOwners] = useState<
    Array<PersistedConductorCardOwner>
  >([])
  const [workerOutputs, setWorkerOutputs] = useState<Record<string, string>>(
    // Persisted text is not proof that the currently mounted Card history is
    // still complete. Revalidate every transcript before rendering or reuse.
    {},
  )
  const [workerOutputStatuses, setWorkerOutputStatuses] = useState<
    Record<string, ConductorWorkerOutputStatus>
  >({})
  const [tasks, setTasks] = useState<Array<ConductorTask>>([])
  const [missionHistory, setMissionHistory] = useState<
    Array<MissionHistoryEntry>
  >(() => loadMissionHistory())
  const [selectedHistoryEntry, setSelectedHistoryEntry] =
    useState<MissionHistoryEntry | null>(null)
  const [conductorSettings, setConductorSettings] = useState<ConductorSettings>(
    () => loadConductorSettings(),
  )
  const doneRef = useRef(false)
  const seenToolCallRef = useRef(false)
  const historySavedRef = useRef(false)
  const lastActivityAtRef = useRef<number>(Date.now())
  const lastWorkerSnapshotRef = useRef('')
  const portableStreamAbortRef = useRef<AbortController | null>(null)

  const sessionCardsQuery = useQuery({
    queryKey: sessionCardQueryKeys.list(false),
    queryFn: () => fetchSessionCards(),
    refetchInterval:
      phase === 'decomposing' ||
      phase === 'running' ||
      (phase === 'complete' && Object.keys(workerOutputs).length === 0)
        ? 3_000
        : false,
  })

  const cardActivities = useMemo(
    () => projectSessionCardActivities(sessionCardsQuery.data),
    [sessionCardsQuery.data],
  )

  useEffect(() => {
    if (
      !initialMission ||
      persistedMissionValidated ||
      sessionCardsQuery.data === undefined
    ) {
      return
    }
    const validated = validatePersistedMissionCardOwnership(
      initialMission,
      cardActivities,
    )
    setPersistedMissionValidated(true)
    if (!validated) return

    setMissionId(validated.missionId)
    setMissionJobId(validated.missionJobId)
    setGoal(validated.goal)
    setPhase(validated.phase)
    setMissionStartedAt(validated.missionStartedAt)
    setIsPaused(validated.isPaused)
    setPausedElapsedMs(validated.pausedElapsedMs)
    setAccumulatedPausedMs(validated.accumulatedPausedMs)
    setPauseStartedAt(validated.pauseStartedAt)
    setOrchestratorCardId(validated.orchestratorCardId)
    setMissionCardOwners(validated.workerCards)
    setCompletedAt(validated.completedAt)
    setTasks(validated.tasks.map((task) => ({ ...task, output: null })))
    doneRef.current = validated.phase === 'complete'
  }, [
    cardActivities,
    initialMission,
    persistedMissionValidated,
    sessionCardsQuery.data,
  ])

  const recentSessions = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60_000
    return cardActivities
      .filter((activity) => activity.updatedAt >= cutoff)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 20)
      .map(({ cardId, title, kind, status, updatedAt }) => ({
        cardId,
        title,
        kind,
        status,
        updatedAt,
      }))
  }, [cardActivities])

  const missionStatusQuery = useQuery({
    queryKey: ['conductor', 'mission-status', missionId],
    queryFn: async () => {
      if (!missionId) return null
      return fetchConductorMission(missionId)
    },
    enabled: Boolean(missionId) && shouldPersistActiveConductorMission(phase),
    refetchInterval:
      phase === 'decomposing' || phase === 'running' ? 2_500 : false,
    retry: Infinity,
    retryDelay: (attemptIndex: number) =>
      Math.min(2000 * 2 ** attemptIndex, 10_000),
  })

  const sessionWorkers = useMemo<Array<ConductorWorker>>(() => {
    if (phase === 'idle') return []
    return cardActivities
      .filter(
        (activity) =>
          activityMatchesCardOwner(activity, missionCardOwners) ||
          (Boolean(activity.parentCardId) &&
            missionCardOwners.some(
              (owner) => owner.cardId === activity.parentCardId,
            )),
      )
      .map(toWorker)
      .sort((left, right) => {
        const statusRank = { running: 0, idle: 1, complete: 2, stale: 3 }
        const rankDiff = statusRank[left.status] - statusRank[right.status]
        if (rankDiff !== 0) return rankDiff
        return (
          new Date(right.updatedAt ?? 0).getTime() -
          new Date(left.updatedAt ?? 0).getTime()
        )
      })
  }, [cardActivities, missionCardOwners, phase])

  useEffect(() => {
    if (sessionWorkers.length === 0) return

    setMissionCardOwners((current) => {
      const byCardId = new Map(current.map((owner) => [owner.cardId, owner]))
      for (const worker of sessionWorkers) {
        if (!worker.cardId) continue
        byCardId.set(
          worker.cardId,
          worker.parentCardId
            ? { cardId: worker.cardId, parentCardId: worker.parentCardId }
            : { cardId: worker.cardId },
        )
      }
      const next = [...byCardId.values()]
      return JSON.stringify(next) === JSON.stringify(current) ? current : next
    })
  }, [sessionWorkers])

  useEffect(() => {
    if (!orchestratorMissionIdentity || !pendingOrchestratorSessionKey) return
    const owner = resolveAuthoritativeConductorCardOwner(
      sessionCardsQuery.data,
      orchestratorMissionIdentity,
      pendingOrchestratorSessionKey,
    )
    if (!owner) return

    setOrchestratorCardId(owner.cardId)
    setMissionCardOwners((current) => {
      const exactOwner = owner.parentCardId
        ? { cardId: owner.cardId, parentCardId: owner.parentCardId }
        : { cardId: owner.cardId }
      if (
        current.some(
          (candidate) =>
            candidate.cardId === exactOwner.cardId &&
            candidate.parentCardId === exactOwner.parentCardId,
        )
      ) {
        return current
      }
      return [
        ...current.filter((candidate) => candidate.cardId !== owner.cardId),
        exactOwner,
      ]
    })
  }, [
    orchestratorMissionIdentity,
    pendingOrchestratorSessionKey,
    sessionCardsQuery.data,
  ])

  // For native-swarm missions, build virtual worker cards from the mission
  // assignments so the UI shows progress instead of "Spawning workers..." forever.
  const swarmAssignments = missionStatusQuery.data?.assignments
  const isNativeSwarm = missionStatusQuery.data?.nativeSwarm === true
  const virtualWorkers = useMemo<Array<ConductorWorker>>(() => {
    if (!isNativeSwarm || !swarmAssignments || swarmAssignments.length === 0)
      return []
    const missionUpdatedAt = new Date(
      missionStatusQuery.data?.updatedAt ?? Date.now(),
    ).toISOString()
    return swarmAssignments.map((assignment, index) => {
      const state = assignment.state ?? 'dispatched'
      const checkpoint = assignment.checkpoint
      const isComplete =
        state === 'checkpointed' || state === 'done' || state === 'cancelled'
      const isBlocked = state === 'blocked' || state === 'needs_input'
      const personaNames = [
        'Nova',
        'Pixel',
        'Blaze',
        'Echo',
        'Sage',
        'Drift',
        'Flux',
        'Volt',
      ]
      const persona = personaNames[index % personaNames.length]
      return {
        key: `native-assignment-${index}`,
        label: `Agent ${index + 1}`,
        model: 'native-swarm',
        status: isComplete ? 'complete' : isBlocked ? 'stale' : 'running',
        updatedAt: missionUpdatedAt,
        displayName: `${persona} · ${state}`,
        totalTokens: 0,
        contextTokens: 0,
        tokenUsageLabel: state,
      }
    })
  }, [isNativeSwarm, swarmAssignments])

  const workers = useMemo(() => {
    if (sessionWorkers.length > 0) return sessionWorkers
    return virtualWorkers
  }, [sessionWorkers, virtualWorkers])
  const activeWorkers = useMemo(
    () =>
      workers.filter(
        (worker) => worker.status === 'running' || worker.status === 'idle',
      ),
    [workers],
  )
  const hasPersistedMission =
    initialMission !== null && persistedMissionValidated && phase !== 'idle'

  const applyWorkerOutputResult = useCallback(
    (
      workerKey: string,
      result: {
        status: Exclude<ConductorWorkerOutputStatus, 'loading'>
        output: string
      },
    ) => {
      setWorkerOutputs((current) => {
        if (result.status === 'ready' && result.output) {
          if (current[workerKey] === result.output) return current
          return { ...current, [workerKey]: result.output }
        }
        if (!(workerKey in current)) return current
        const next = { ...current }
        delete next[workerKey]
        return next
      })
      setWorkerOutputStatuses((current) =>
        current[workerKey] === result.status
          ? current
          : { ...current, [workerKey]: result.status },
      )
    },
    [],
  )

  const retryWorkerOutput = useCallback(
    async (worker: ConductorWorker) => {
      if (!worker.cardId) return
      const activity = cardActivities.find(
        (candidate) =>
          candidate.cardId === worker.cardId &&
          candidate.parentCardId === worker.parentCardId,
      )
      if (!activity) return
      setWorkerOutputStatuses((current) => ({
        ...current,
        [worker.key]: 'loading',
      }))
      try {
        const result = await fetchWorkerOutput({
          cardId: activity.cardId,
          canonicalSegmentKey: activity.canonicalSegmentKey,
          ...(activity.parentCardId
            ? { parentCardId: activity.parentCardId }
            : {}),
        })
        applyWorkerOutputResult(worker.key, result)
      } catch {
        applyWorkerOutputResult(worker.key, {
          status: 'unavailable',
          output: '',
        })
      }
    },
    [applyWorkerOutputResult, cardActivities],
  )

  useEffect(() => {
    const mission = missionStatusQuery.data
    if (!mission) return

    const status = readString(mission.status)?.toLowerCase() ?? null
    const realSessionKey = extractSessionIdFromMission(mission)
    const lines = readMissionLines(mission)
    const missionLog = formatMissionLog(lines)

    if (realSessionKey) {
      setOrchestratorMissionIdentity((current) => current ?? realSessionKey)
      setPendingOrchestratorSessionKey(realSessionKey)
      setPlanText((current) =>
        current && !current.startsWith('Conductor mission')
          ? current
          : 'Orchestrator session attached. Tracking worker activity...',
      )
      lastActivityAtRef.current = Date.now()
      setTimeoutWarning(false)
    } else if (phase === 'decomposing' || phase === 'running') {
      setPlanText(
        (current) =>
          current ||
          `Conductor mission ${status ?? 'running'}. Waiting for Hermes to report the session...`,
      )
    }

    if (missionLog) {
      setStreamText((current) =>
        current === missionLog ? current : missionLog,
      )
      lastActivityAtRef.current = Date.now()
      setTimeoutWarning(false)
    }

    if (mission.nativeSwarm === true) {
      const nativeOwners = normalizeConductorCardOwners(mission.cardOwners)
      if (nativeOwners.length > 0) setMissionCardOwners(nativeOwners)
    }

    if (isCompletedMissionStatus(status)) {
      doneRef.current = true
      setCompletedAt((value) => value ?? new Date().toISOString())
      setPhase('complete')
      return
    }

    if (isFailedMissionStatus(status)) {
      doneRef.current = true
      setStreamError(mission.error || 'Conductor mission failed')
      setCompletedAt((value) => value ?? new Date().toISOString())
      setPhase('complete')
    }
  }, [missionStatusQuery.data, phase])

  const getMissionElapsedMs = (referenceTime = Date.now()) => {
    if (!missionStartedAt) return 0
    const startedMs = new Date(missionStartedAt).getTime()
    if (!Number.isFinite(startedMs)) return 0
    const pauseStartedMs = pauseStartedAt
      ? new Date(pauseStartedAt).getTime()
      : NaN
    const inFlightPausedMs =
      isPaused && Number.isFinite(pauseStartedMs)
        ? Math.max(0, referenceTime - pauseStartedMs)
        : 0
    return Math.max(
      0,
      referenceTime - startedMs - accumulatedPausedMs - inFlightPausedMs,
    )
  }

  useEffect(() => {
    if (phase !== 'decomposing') return

    if (workers.length > 0) {
      setPhase('running')
      return
    }

    const timer = setTimeout(() => setPhase('running'), 15_000)

    return () => clearTimeout(timer)
  }, [phase, workers.length])

  useEffect(() => {
    if (phase !== 'running' && phase !== 'decomposing') {
      setTimeoutWarning(false)
      lastActivityAtRef.current = Date.now()
      lastWorkerSnapshotRef.current = ''
      return
    }

    lastActivityAtRef.current = Date.now()
    setTimeoutWarning(false)
  }, [phase])

  useEffect(() => {
    if (phase !== 'running' && phase !== 'decomposing') return

    const workerSnapshot = workers
      .map(
        (worker) =>
          `${worker.key}:${worker.updatedAt ?? ''}:${worker.totalTokens}:${worker.status}`,
      )
      .join('|')

    if (workerSnapshot && workerSnapshot !== lastWorkerSnapshotRef.current) {
      lastWorkerSnapshotRef.current = workerSnapshot
      lastActivityAtRef.current = Date.now()
      setTimeoutWarning(false)
    }
  }, [phase, workers])

  useEffect(() => {
    if (phase !== 'running' && phase !== 'decomposing') return

    lastActivityAtRef.current = Date.now()
    setTimeoutWarning(false)
  }, [phase, streamText, planText, streamEvents.length])

  useEffect(() => {
    if (phase !== 'running' && phase !== 'decomposing') return

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityAtRef.current >= 60_000) {
        setTimeoutWarning(true)
      }
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'running') return

    const shouldCompleteImmediately =
      doneRef.current && workersLookComplete(workers, 8_000)
    if (shouldCompleteImmediately) {
      setPhase('complete')
      setCompletedAt((value) => value ?? new Date().toISOString())
      return
    }

    if (activeWorkers.length > 0) return
    if (workers.length === 0 && !doneRef.current) return
    setPhase('complete')
    setCompletedAt((value) => value ?? new Date().toISOString())
  }, [activeWorkers.length, phase, workers])

  useEffect(() => {
    if (workers.length === 0) return

    let cancelled = false

    const fetchAll = async () => {
      for (const worker of workers) {
        if (!worker.cardId) continue
        const activity = cardActivities.find(
          (candidate) =>
            candidate.cardId === worker.cardId &&
            candidate.parentCardId === worker.parentCardId,
        )
        if (!activity) continue
        try {
          const result = await fetchWorkerOutput({
            cardId: activity.cardId,
            canonicalSegmentKey: activity.canonicalSegmentKey,
            ...(activity.parentCardId
              ? { parentCardId: activity.parentCardId }
              : {}),
          })
          if (cancelled) continue
          applyWorkerOutputResult(worker.key, result)
        } catch {
          if (cancelled) continue
          applyWorkerOutputResult(worker.key, {
            status: 'unavailable',
            output: '',
          })
        }
      }
    }

    void fetchAll()

    // Keep polling while workers are running, OR while we're missing outputs for complete workers
    const hasRunningWorkers = workers.some(
      (worker) => worker.status === 'running' || worker.status === 'idle',
    )
    const hasMissingOutputs = workers.some(
      (worker) => worker.status === 'complete' && !workerOutputs[worker.key],
    )
    if (!hasRunningWorkers && !hasMissingOutputs) {
      return () => {
        cancelled = true
      }
    }

    const timer = window.setInterval(
      () => {
        void fetchAll()
      },
      hasRunningWorkers ? 5_000 : 2_000,
    )

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [applyWorkerOutputResult, cardActivities, phase, workers])

  useEffect(() => {
    if (!planText) return
    const extracted = extractTasksFromPlan(planText)
    if (extracted.length === 0) return
    setTasks((current) => {
      if (current.length >= extracted.length) return current
      return extracted.map((task) => {
        const existing = current.find((item) => item.id === task.id)
        return existing ?? task
      })
    })
  }, [planText])

  useEffect(() => {
    if (tasks.length === 0 || workers.length === 0) return
    setTasks((current) => {
      const updated = current.map((task, index) => {
        const worker = workers.at(index)
        if (!worker) return task
        const workerOutput = workerOutputs[worker.key] ?? null
        const newStatus: ConductorTask['status'] =
          worker.status === 'complete'
            ? 'complete'
            : worker.status === 'stale'
              ? 'failed'
              : worker.status === 'running'
                ? 'running'
                : task.status
        if (
          task.workerCardId === worker.cardId &&
          task.status === newStatus &&
          task.output === workerOutput
        )
          return task
        return {
          ...task,
          workerCardId: worker.cardId ?? null,
          status: newStatus,
          output: workerOutput,
        }
      })
      const changed = updated.some((task, index) => task !== current[index])
      return changed ? updated : current
    })
  }, [workers, workerOutputs, tasks.length])

  // Save/update history entry on complete — re-runs when workerOutputs arrive
  // so the entry gets enriched with actual worker content instead of empty text.
  const historySaveCountRef = useRef(0)
  useEffect(() => {
    if (phase !== 'complete' || !goal || !completedAt || !missionStartedAt)
      return

    const missionHistoryId = `mission-${new Date(missionStartedAt).getTime()}`
    const outputPath = buildMissionOutputPath(
      workers,
      workerOutputs,
      tasks,
      streamText,
    )
    const workerSummary = summarizeWorkers(workers, workerOutputs)
    const outputText = buildMissionOutputText(
      workers,
      workerOutputs,
      streamText,
    )
    const totalTokens = workers.reduce(
      (sum, worker) => sum + worker.totalTokens,
      0,
    )
    const completeSummary = buildCompleteSummary({
      goal,
      streamError,
      missionStartedAt,
      completedAt,
      totalWorkers: workers.length,
      totalTokens,
      outputPath,
    })
    const workerDetails = workers.map((worker, index) => {
      const persona = getAgentPersona(index)
      return {
        label: worker.label,
        model: worker.model ?? '',
        totalTokens: worker.totalTokens,
        personaEmoji: persona.emoji,
        personaName: persona.name,
      }
    })
    const entry: MissionHistoryEntry = {
      id: missionHistoryId,
      goal,
      startedAt: missionStartedAt,
      completedAt,
      workerCount: workers.length,
      totalTokens,
      status: streamError ? 'failed' : 'completed',
      projectPath: outputPath,
      outputPath,
      workerSummary: workerSummary.length > 0 ? workerSummary : undefined,
      outputText: outputText || undefined,
      streamText: streamText ? streamText.slice(0, 5000) : undefined,
      completeSummary,
      workerDetails: workerDetails.length > 0 ? workerDetails : undefined,
      error: streamError ?? undefined,
    }

    // Always update localStorage (appendMissionHistory deduplicates by id)
    appendMissionHistory(entry)

    // Update in-memory state: first save adds, subsequent saves update in-place
    if (historySaveCountRef.current === 0) {
      historySavedRef.current = true
      setMissionHistory((current) => {
        if (current.some((e) => e.id === missionHistoryId)) return current
        return [entry, ...current].slice(0, MAX_HISTORY_ENTRIES)
      })
    } else {
      setMissionHistory((current) =>
        current.map((e) => (e.id === missionHistoryId ? entry : e)),
      )
    }
    historySaveCountRef.current += 1
  }, [
    phase,
    goal,
    completedAt,
    missionStartedAt,
    workers,
    streamError,
    workerOutputs,
    tasks,
    streamText,
  ])

  useEffect(() => {
    persistConductorSettings(conductorSettings)
  }, [conductorSettings])

  useEffect(() => {
    if (!shouldPersistActiveConductorMission(phase)) {
      try {
        localStorage.removeItem(ACTIVE_MISSION_STORAGE_KEY)
      } catch {}
      return
    }

    const ownedCardIds = new Set(missionCardOwners.map((owner) => owner.cardId))
    if (orchestratorCardId) ownedCardIds.add(orchestratorCardId)
    const candidate: PersistedMission = {
      version: ACTIVE_MISSION_STORAGE_VERSION,
      missionId,
      missionJobId,
      goal,
      phase,
      missionStartedAt,
      isPaused,
      pausedElapsedMs,
      accumulatedPausedMs,
      pauseStartedAt,
      orchestratorCardId,
      workerCards: missionCardOwners,
      completedAt,
      tasks: tasks.map(({ output: _runtimeOutput, ...task }) => ({
        ...task,
        workerCardId:
          task.workerCardId && ownedCardIds.has(task.workerCardId)
            ? task.workerCardId
            : null,
      })),
    }
    const validated = validatePersistedMissionCardOwnership(
      candidate,
      cardActivities,
    )
    if (validated) persistMission(validated)
    else clearPersistedMission()
  }, [
    missionId,
    missionJobId,
    phase,
    goal,
    missionStartedAt,
    isPaused,
    pausedElapsedMs,
    accumulatedPausedMs,
    pauseStartedAt,
    completedAt,
    orchestratorCardId,
    missionCardOwners,
    cardActivities,
    tasks,
  ])

  const dismissTimeoutWarning = () => {
    lastActivityAtRef.current = Date.now()
    setTimeoutWarning(false)
  }

  const clearMissionState = () => {
    doneRef.current = false
    portableStreamAbortRef.current?.abort()
    portableStreamAbortRef.current = null
    clearPersistedMission()
    setMissionId(null)
    setMissionJobId(null)
    setPhase('idle')
    setGoal('')
    setPendingOrchestratorSessionKey(null)
    setOrchestratorMissionIdentity(null)
    setOrchestratorCardId(null)
    setStreamText('')
    setPlanText('')
    setStreamEvents([])
    setStreamError(null)
    setTimeoutWarning(false)
    lastActivityAtRef.current = Date.now()
    lastWorkerSnapshotRef.current = ''
    setMissionStartedAt(null)
    setIsPaused(false)
    setPausedElapsedMs(0)
    setAccumulatedPausedMs(0)
    setPauseStartedAt(null)
    setCompletedAt(null)
    setMissionCardOwners([])
    setWorkerOutputs({})
    setWorkerOutputStatuses({})
    setTasks([])
    setSelectedHistoryEntry(null)
    seenToolCallRef.current = false
    historySavedRef.current = false
  }

  const sendMission = useMutation({
    mutationFn: async ({
      nextGoal,
      settings,
    }: {
      nextGoal: string
      settings: ConductorSettings
    }) => {
      const trimmed = nextGoal.trim()
      if (!trimmed) throw new Error('Mission goal required')
      doneRef.current = false
      lastActivityAtRef.current = Date.now()
      lastWorkerSnapshotRef.current = ''
      setTimeoutWarning(false)
      setGoal(trimmed)
      setMissionId(null)
      setMissionJobId(null)
      setPendingOrchestratorSessionKey(null)
      setOrchestratorMissionIdentity(null)
      setOrchestratorCardId(null)
      setStreamText('')
      setPlanText('')
      setStreamEvents([])
      setStreamError(null)
      setCompletedAt(null)
      setIsPaused(false)
      setPausedElapsedMs(0)
      setAccumulatedPausedMs(0)
      setPauseStartedAt(null)
      setMissionCardOwners([])
      setWorkerOutputs({})
      setTasks([])
      setSelectedHistoryEntry(null)
      seenToolCallRef.current = false
      historySavedRef.current = false
      const startedAt = new Date().toISOString()
      setMissionStartedAt(startedAt)
      setPhase('decomposing')
      persistMission({
        version: ACTIVE_MISSION_STORAGE_VERSION,
        missionId: null,
        missionJobId: null,
        goal: trimmed,
        phase: 'decomposing',
        missionStartedAt: startedAt,
        isPaused: false,
        pausedElapsedMs: 0,
        accumulatedPausedMs: 0,
        pauseStartedAt: null,
        orchestratorCardId: null,
        workerCards: [],
        completedAt: null,
        tasks: [],
      })

      // Spawn a Conductor mission via the server.
      const response = await fetch('/api/conductor-spawn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal: trimmed, ...settings }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Spawn failed (${response.status})`)
      }

      const result = (await response.json()) as ConductorSpawnResponse
      if (!result.ok) {
        throw new Error(result.error ?? 'Failed to spawn orchestrator')
      }

      if (result.mode === 'portable' || result.prompt) {
        const prompt = typeof result.prompt === 'string' ? result.prompt : ''
        if (!prompt.trim())
          throw new Error(
            'Portable conductor response did not include a prompt',
          )

        const portableSessionKey =
          result.sessionKey?.trim() ||
          result.jobName?.trim() ||
          `conductor-${Date.now()}`
        const portableFriendlyId = result.jobName?.trim() || portableSessionKey
        setMissionId(null)
        setMissionJobId(null)
        setOrchestratorMissionIdentity(portableSessionKey)
        setPendingOrchestratorSessionKey(portableSessionKey)
        setPlanText(
          'Conductor portable mission launched. Streaming orchestrator output...',
        )
        setPhase('running')

        const abortController = new AbortController()
        portableStreamAbortRef.current = abortController

        try {
          const streamResult = await streamPortableConductorMission({
            sessionKey: portableSessionKey,
            friendlyId: portableFriendlyId,
            prompt,
            model: settings.orchestratorModel || undefined,
            signal: abortController.signal,
            onSessionResolved: (resolvedSessionKey) => {
              setPendingOrchestratorSessionKey(resolvedSessionKey)
              lastActivityAtRef.current = Date.now()
              setTimeoutWarning(false)
            },
            onText: (text) => {
              setStreamText(text)
              setPlanText(text)
              lastActivityAtRef.current = Date.now()
              setTimeoutWarning(false)
            },
            onStreamEvent: (event) => {
              appendStreamEvent(setStreamEvents, event)
              lastActivityAtRef.current = Date.now()
              setTimeoutWarning(false)
            },
          })

          if (streamResult.text.trim()) {
            setStreamText(streamResult.text)
            setPlanText(streamResult.text)
          }
          doneRef.current = true
          setCompletedAt((value) => value ?? new Date().toISOString())
          setPhase('complete')
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return
          throw error
        } finally {
          if (portableStreamAbortRef.current === abortController) {
            portableStreamAbortRef.current = null
          }
        }
        return
      }

      // native-swarm mode: local swarm workers handle the mission, no orchestrator session
      if (result.mode === 'native-swarm') {
        const spawnedMissionId = result.missionId ?? null
        const nativeOwners = normalizeConductorCardOwners(result.cardOwners)
        if (nativeOwners.length === 0) {
          throw new Error(
            'Native swarm mission did not provide authoritative Card owners',
          )
        }
        setMissionId(spawnedMissionId)
        setMissionJobId(result.jobId ?? null)
        setMissionCardOwners(nativeOwners)
        setOrchestratorCardId(nativeOwners[0]?.cardId ?? null)
        setPendingOrchestratorSessionKey(null)
        setPlanText(
          result.assignments?.length
            ? `Native swarm mission launched with ${result.assignments.length} workers. Watching for swarm activity...`
            : 'Native swarm mission launched. Decomposing and spawning workers...',
        )
        setPhase('running')
        return
      }

      if (
        !result.sessionKey &&
        !result.sessionKeyPrefix &&
        !result.missionId &&
        !result.jobId
      ) {
        throw new Error(result.error ?? 'Failed to spawn orchestrator')
      }

      const nextMissionId = result.missionId ?? null
      setMissionId(nextMissionId)
      setMissionJobId(result.jobId ?? null)

      const orchestratorKey = result.sessionKey ?? null
      const prefix = result.sessionKeyPrefix
      if (orchestratorKey) {
        setOrchestratorMissionIdentity(orchestratorKey)
        setPendingOrchestratorSessionKey(orchestratorKey)
      }

      if (prefix) {
        // Async: resolve the placeholder to the real session key once it exists.
        const resolveOrchestrator = async () => {
          for (let attempt = 0; attempt < 30; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500))
            try {
              const cards = await fetchSessionCards()
              const matchedKey = remoteControlKeyForPrefix(cards, prefix)
              if (matchedKey) {
                setOrchestratorMissionIdentity(matchedKey)
                setPendingOrchestratorSessionKey(matchedKey)
                return
              }
            } catch {
              // ignore; try again
            }
          }
        }
        void resolveOrchestrator()
      }

      // Transition to running — the orchestrator is alive, workers will appear via polling
      setPlanText(
        nextMissionId
          ? 'Conductor mission launched. Waiting for Hermes session and worker activity...'
          : 'Orchestrator spawned. Decomposing mission and spawning workers...',
      )
      setPhase('running')
    },
    onError: (error) => {
      doneRef.current = true
      setStreamError(error instanceof Error ? error.message : String(error))
      setPhase('complete')
      setCompletedAt(new Date().toISOString())
    },
  })

  const resetMission = () => {
    clearMissionState()
  }

  const resetSavedState = () => {
    clearMissionState()
    clearMissionHistoryStorage()
    setMissionHistory([])
  }

  const pauseAgent = useMutation({
    mutationFn: async ({
      cardId,
      pause,
    }: {
      cardId: string
      pause: boolean
    }) => {
      const activity = cardActivities.find(
        (candidate) => candidate.cardId === cardId,
      )
      if (!activity) throw new Error('Card activity cannot be controlled')
      const response = await fetch(
        `/api/session-cards/${encodeURIComponent(activity.cardId)}/pause`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pause,
            parentCardId: activity.parentCardId,
          }),
        },
      )

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Pause request failed (${response.status})`)
      }

      const now = Date.now()
      if (pause) {
        setPausedElapsedMs(getMissionElapsedMs(now))
        setPauseStartedAt(new Date(now).toISOString())
        setIsPaused(true)
        return
      }

      const pauseStartedMs = pauseStartedAt
        ? new Date(pauseStartedAt).getTime()
        : NaN
      const additionalPausedMs = Number.isFinite(pauseStartedMs)
        ? Math.max(0, now - pauseStartedMs)
        : 0
      setAccumulatedPausedMs((current) => current + additionalPausedMs)
      setPauseStartedAt(null)
      setIsPaused(false)
      setPausedElapsedMs(0)
    },
  })

  const stopMission = async () => {
    const cardBindings = buildConductorStopCardBindings(
      sessionCardsQuery.data,
      missionCardOwners,
    )
    const missionIds = missionId ? [missionId] : []

    if (cardBindings.length === 0) {
      setStreamError(
        'Mission stop incomplete; retry Stop. No authoritative mission ownership is available yet.',
      )
      return
    }

    try {
      const response = await fetch('/api/conductor-stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cardBindings,
          missionIds,
          ...(missionIds.length > 0
            ? { missionCardId: orchestratorCardId ?? cardBindings[0]!.cardId }
            : {}),
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        failures?: Array<{ operation?: string; id?: string; error?: string }>
      }
      if (!response.ok || payload.ok !== true) {
        const failures = payload.failures ?? []
        if (failures.length > 0) {
          const retainedOwners = retainConductorOwnersAfterStopFailure(
            missionCardOwners,
            cardBindings,
            failures,
          )
          setMissionCardOwners(retainedOwners)
          setOrchestratorCardId((current) =>
            current && retainedOwners.some((owner) => owner.cardId === current)
              ? current
              : null,
          )
        }
        const detail =
          failures.length > 0
            ? failures
                .map((failure) =>
                  [failure.operation, failure.id, failure.error]
                    .filter(Boolean)
                    .join(' '),
                )
                .join('; ')
            : payload.error || `Stop request failed (${response.status})`
        setStreamError(`Mission stop incomplete; retry Stop. ${detail}`)
        return
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setStreamError(`Mission stop incomplete; retry Stop. ${detail}`)
      return
    }

    portableStreamAbortRef.current?.abort()
    portableStreamAbortRef.current = null
    // Transition to complete with error instead of clearing — so it shows as failed in activity
    setStreamError('Mission stopped by user')
    setIsPaused(false)
    setPauseStartedAt(null)
    setCompletedAt(new Date().toISOString())
    setPhase('complete')
  }

  const retryMission = async () => {
    if (!goal) return
    const currentGoal = goal
    resetMission()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await sendMission.mutateAsync({
      nextGoal: currentGoal,
      settings: conductorSettings,
    })
  }

  return {
    phase,
    goal,
    orchestratorCardId,
    streamText,
    planText,
    streamEvents,
    streamError,
    timeoutWarning,
    dismissTimeoutWarning,
    missionStartedAt,
    isPaused,
    pausedElapsedMs,
    pausedAtMs: pauseStartedAt ? new Date(pauseStartedAt).getTime() : null,
    missionElapsedMs: getMissionElapsedMs(),
    completedAt,
    tasks,
    workers,
    activeWorkers,
    missionHistory,
    hasPersistedMission,
    selectedHistoryEntry,
    setSelectedHistoryEntry,
    recentSessions,
    workerOutputs,
    workerOutputStatuses,
    retryWorkerOutput,
    conductorSettings,
    setConductorSettings,
    sendMission: (nextGoal: string) =>
      sendMission.mutateAsync({ nextGoal, settings: conductorSettings }),
    pauseAgent: (cardId: string, pause: boolean) =>
      pauseAgent.mutateAsync({ cardId, pause }),
    isSending: sendMission.isPending,
    isPausing: pauseAgent.isPending,
    resetMission,
    resetSavedState,
    stopMission,
    retryMission,
    refreshWorkers: sessionCardsQuery.refetch,
    isRefreshingWorkers: sessionCardsQuery.isFetching,
  }
}
