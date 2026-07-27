import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import {
  fetchCompleteSessionCardHistory,
  fetchSessionCards,
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

type PersistedMission = {
  missionId: string | null
  missionJobId: string | null
  goal: string
  phase: MissionPhase
  missionStartedAt: string | null
  isPaused: boolean
  pausedElapsedMs: number
  accumulatedPausedMs: number
  pauseStartedAt: string | null
  workerKeys: Array<string>
  workerLabels: Array<string>
  workerOutputs: Record<string, string>
  streamText: string
  planText: string
  completedAt: string | null
  tasks: Array<ConductorTask>
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
  canonicalSegmentKey?: string
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

export type ConductorCardActivity = {
  key: string
  cardId: string
  canonicalSegmentKey: string
  parentCardId?: string
  title: string
  label: string
  kind: 'root' | 'orphan' | 'branch' | 'child'
  status?: 'idle' | 'running' | 'complete' | 'error'
  updatedAt: number
  identityAliases: Array<string>
  parentTitle?: string
}

export type ConductorTask = {
  id: string
  title: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  workerKey: string | null
  output: string | null
}

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
          workerKey: null,
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

function normalizeMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getSessionSearchText(session: ConductorCardActivity): string {
  return [
    readString(session.label),
    readString(session.title),
    readString(session.parentTitle),
    readString(session.kind),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
}

function buildMissionNeedles(goal: string): Array<string> {
  const words = normalizeMatchText(goal).split(' ').filter(Boolean)
  const prefixes = [5, 8, 12]
    .map((count) => words.slice(0, count).join(' ').trim())
    .filter(Boolean)
  return [...new Set(prefixes)]
}

function sessionMatchesMissionContext(
  session: ConductorCardActivity,
  missionStartMs: number,
  missionNeedles: Array<string>,
): boolean {
  const createdAt = toIso(session.updatedAt)
  if (!createdAt) return false

  const createdMs = new Date(createdAt).getTime()
  if (!Number.isFinite(createdMs) || createdMs < missionStartMs) return false

  const text = normalizeMatchText(getSessionSearchText(session))
  if (!text) return false
  if (text.includes('mission orchestrator')) return true
  if (text.includes('dashboard-backed conductor')) return true
  if (text.includes('conductor mission')) return true

  return missionNeedles.some((needle) => text.includes(needle))
}

function loadPersistedMission(): PersistedMission | null {
  try {
    const raw = globalThis.localStorage.getItem(ACTIVE_MISSION_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const missionId = readString(parsed.missionId)
    const missionJobId = readString(parsed.missionJobId)
    const goal = typeof parsed.goal === 'string' ? parsed.goal : null
    const phase = parsed.phase
    const streamText =
      typeof parsed.streamText === 'string' ? parsed.streamText : null
    const planText =
      typeof parsed.planText === 'string' ? parsed.planText : null
    const workerKeys = Array.isArray(parsed.workerKeys)
      ? parsed.workerKeys.filter(
          (value): value is string => typeof value === 'string',
        )
      : null
    const workerLabels = Array.isArray(parsed.workerLabels)
      ? parsed.workerLabels.filter(
          (value): value is string => typeof value === 'string',
        )
      : null
    const workerOutputs =
      parsed.workerOutputs &&
      typeof parsed.workerOutputs === 'object' &&
      !Array.isArray(parsed.workerOutputs)
        ? Object.fromEntries(
            Object.entries(
              parsed.workerOutputs as Record<string, unknown>,
            ).filter(
              (entry): entry is [string, string] =>
                typeof entry[0] === 'string' && typeof entry[1] === 'string',
            ),
          )
        : {}
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
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks
          .map((task): ConductorTask | null => {
            const record = readRecord(task)
            if (!record) return null
            const id = readString(record.id)
            const title = readString(record.title)
            const status = record.status
            if (
              !id ||
              !title ||
              (status !== 'pending' &&
                status !== 'running' &&
                status !== 'complete' &&
                status !== 'failed')
            ) {
              return null
            }

            return {
              id,
              title,
              status,
              workerKey:
                record.workerKey === null || record.workerKey === undefined
                  ? null
                  : readString(record.workerKey),
              output:
                record.output === null || record.output === undefined
                  ? null
                  : readString(record.output),
            }
          })
          .filter((task): task is ConductorTask => task !== null)
      : []

    if (
      !goal ||
      (phase !== 'idle' &&
        phase !== 'decomposing' &&
        phase !== 'running' &&
        phase !== 'complete') ||
      streamText === null ||
      planText === null ||
      !workerKeys ||
      !workerLabels
    ) {
      return null
    }

    // Completed/stopped missions are already represented in mission history.
    // Restoring them as the active mission causes stale terminal records to be
    // re-queried on page load and can surface an old failure as if Conductor is
    // currently broken.
    if (!shouldPersistActiveConductorMission(phase)) {
      clearPersistedMission()
      return null
    }

    return {
      missionId,
      missionJobId,
      goal,
      phase,
      missionStartedAt,
      isPaused,
      pausedElapsedMs,
      accumulatedPausedMs,
      pauseStartedAt,
      workerKeys,
      workerLabels,
      workerOutputs,
      streamText,
      planText,
      completedAt,
      tasks,
    }
  } catch {
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

function loadMissionHistory(): Array<MissionHistoryEntry> {
  try {
    const raw = globalThis.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seen = new Set<string>()
    return parsed
      .filter((entry: unknown): entry is MissionHistoryEntry => {
        if (!entry || typeof entry !== 'object') return false
        const e = entry as Record<string, unknown>
        if (
          typeof e.id !== 'string' ||
          typeof e.goal !== 'string' ||
          typeof e.startedAt !== 'string'
        )
          return false
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      })
      .map((entry) => {
        const projectPath =
          (typeof entry.projectPath === 'string' && entry.projectPath.trim()) ||
          extractProjectPath(
            typeof entry.projectPath === 'string' ? entry.projectPath : '',
          ) ||
          null
        const outputText =
          typeof entry.outputText === 'string' ? entry.outputText : undefined
        const streamText =
          typeof entry.streamText === 'string' ? entry.streamText : undefined
        const outputPath =
          (typeof entry.outputPath === 'string' && entry.outputPath.trim()) ||
          extractProjectPath(
            typeof entry.outputPath === 'string' ? entry.outputPath : '',
          ) ||
          projectPath ||
          extractProjectPath(outputText ?? '') ||
          extractProjectPath(streamText ?? '') ||
          null
        return {
          ...entry,
          projectPath,
          outputPath,
          outputText,
          streamText,
        }
      })
      .slice(0, MAX_HISTORY_ENTRIES)
  } catch {
    return []
  }
}

function appendMissionHistory(entry: MissionHistoryEntry): void {
  try {
    const current = loadMissionHistory()
    // Deduplicate by id before appending
    const filtered = current.filter((e) => e.id !== entry.id)
    const updated = [entry, ...filtered].slice(0, MAX_HISTORY_ENTRIES)
    globalThis.localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(updated),
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

function projectSessionCardActivities(
  response: SessionCardListWire | undefined,
): Array<ConductorCardActivity> {
  const complete = retainCompleteSessionCardProjections(response)
  if (!complete) return []
  return complete.cards.flatMap((card) => {
    const root: ConductorCardActivity = {
      key: card.cardId,
      cardId: card.cardId,
      canonicalSegmentKey: card.canonicalSegmentKey,
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
    const children = card.childNodes.map(
      (child): ConductorCardActivity => ({
        key: child.cardId,
        cardId: child.cardId,
        canonicalSegmentKey: child.sessionKey,
        parentCardId: card.cardId,
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
        parentTitle: card.title,
      }),
    )
    return [root, ...children]
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

function activityMatchesMissionWorker(
  activity: ConductorCardActivity,
  workerKeys: ReadonlySet<string>,
): boolean {
  for (const workerKey of workerKeys) {
    const normalized = workerKey.trim()
    if (!normalized) continue
    if (normalized.startsWith('remote:') || normalized.startsWith('local:')) {
      if (activity.identityAliases.includes(normalized)) return true
      continue
    }
    // Dashboard Conductor returns upstream gateway keys. Compare those only to
    // the authoritative remote-qualified Card aliases; local identities must
    // already arrive qualified so same-key local/remote Cards cannot collide.
    if (activity.identityAliases.includes(`remote:${normalized}`)) return true
  }
  return false
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
    canonicalSegmentKey: session.canonicalSegmentKey,
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
    .filter((line) => line.trim().length > 0)
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
}): Promise<string> {
  const history = await fetchCompleteSessionCardHistory({
    cardId: worker.cardId,
    canonicalSegmentKey: worker.canonicalSegmentKey,
    ...(worker.parentCardId ? { parentCardId: worker.parentCardId } : {}),
  })
  return getLastAssistantMessage(history.messages as Array<HistoryMessage>)
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
  const [missionId, setMissionId] = useState<string | null>(
    () => initialMission?.missionId ?? null,
  )
  const [missionJobId, setMissionJobId] = useState<string | null>(
    () => initialMission?.missionJobId ?? null,
  )
  const [phase, setPhase] = useState<MissionPhase>(
    () => initialMission?.phase ?? 'idle',
  )
  const [goal, setGoal] = useState(() => initialMission?.goal ?? '')
  const [orchestratorSessionKey, setOrchestratorSessionKey] = useState<
    string | null
  >(() => initialMission?.workerKeys[0] ?? null)
  const [streamText, setStreamText] = useState(
    () => initialMission?.streamText ?? '',
  )
  const [planText, setPlanText] = useState(() => initialMission?.planText ?? '')
  const [streamEvents, setStreamEvents] = useState<Array<StreamEvent>>([])
  const [missionStartedAt, setMissionStartedAt] = useState<string | null>(
    () => initialMission?.missionStartedAt ?? null,
  )
  const [isPaused, setIsPaused] = useState(
    () => initialMission?.isPaused ?? false,
  )
  const [pausedElapsedMs, setPausedElapsedMs] = useState(
    () => initialMission?.pausedElapsedMs ?? 0,
  )
  const [accumulatedPausedMs, setAccumulatedPausedMs] = useState(
    () => initialMission?.accumulatedPausedMs ?? 0,
  )
  const [pauseStartedAt, setPauseStartedAt] = useState<string | null>(
    () => initialMission?.pauseStartedAt ?? null,
  )
  const [completedAt, setCompletedAt] = useState<string | null>(
    () => initialMission?.completedAt ?? null,
  )
  const [streamError, setStreamError] = useState<string | null>(null)
  const [timeoutWarning, setTimeoutWarning] = useState(false)
  const [missionWorkerKeys, setMissionWorkerKeys] = useState<Set<string>>(
    () => new Set(initialMission?.workerKeys ?? []),
  )
  const [missionWorkerLabels, setMissionWorkerLabels] = useState<Set<string>>(
    () => new Set(initialMission?.workerLabels ?? []),
  )
  const [workerOutputs, setWorkerOutputs] = useState<Record<string, string>>(
    () => initialMission?.workerOutputs ?? {},
  )
  const [tasks, setTasks] = useState<Array<ConductorTask>>(
    () => initialMission?.tasks ?? [],
  )
  const [missionHistory, setMissionHistory] = useState<
    Array<MissionHistoryEntry>
  >(() => loadMissionHistory())
  const [selectedHistoryEntry, setSelectedHistoryEntry] =
    useState<MissionHistoryEntry | null>(null)
  const [conductorSettings, setConductorSettings] = useState<ConductorSettings>(
    () => loadConductorSettings(),
  )
  const doneRef = useRef(initialMission?.phase === 'complete')
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
  const recentSessions = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60_000
    return cardActivities
      .filter((activity) => activity.updatedAt >= cutoff)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 20)
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
    const missionStartMs = missionStartedAt
      ? new Date(missionStartedAt).getTime()
      : 0
    const missionNeedles = buildMissionNeedles(goal)
    return cardActivities
      .filter(
        (activity) =>
          activityMatchesMissionWorker(activity, missionWorkerKeys) ||
          (missionStartMs > 0 &&
            sessionMatchesMissionContext(
              activity,
              missionStartMs,
              missionNeedles,
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
  }, [cardActivities, goal, missionStartedAt, missionWorkerKeys, phase])

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
      const workerId = assignment.workerId
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
        key: workerId,
        label: workerId,
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
  const hasPersistedMission = initialMission !== null

  useEffect(() => {
    const mission = missionStatusQuery.data
    if (!mission) return

    const status = readString(mission.status)?.toLowerCase() ?? null
    const realSessionKey = extractSessionIdFromMission(mission)
    const lines = readMissionLines(mission)
    const missionLog = formatMissionLog(lines)

    if (realSessionKey) {
      setOrchestratorSessionKey(realSessionKey)
      setMissionWorkerKeys((current) => {
        if (current.has(realSessionKey)) return current
        const next = new Set(current)
        next.add(realSessionKey)
        return next
      })
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
        if (!worker.cardId || !worker.canonicalSegmentKey) continue
        try {
          const output = await fetchWorkerOutput({
            cardId: worker.cardId,
            canonicalSegmentKey: worker.canonicalSegmentKey,
            ...(worker.parentCardId
              ? { parentCardId: worker.parentCardId }
              : {}),
          })
          if (cancelled || !output) continue
          setWorkerOutputs((current) => {
            if (current[worker.key] === output) return current
            return { ...current, [worker.key]: output }
          })
        } catch {
          // Ignore transient history fetch errors and retry on the next poll.
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
  }, [phase, workers])

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
          task.workerKey === worker.key &&
          task.status === newStatus &&
          task.output === workerOutput
        )
          return task
        return {
          ...task,
          workerKey: worker.key,
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

    persistMission({
      missionId,
      missionJobId,
      goal,
      phase,
      missionStartedAt,
      isPaused,
      pausedElapsedMs,
      accumulatedPausedMs,
      pauseStartedAt,
      workerKeys: [...missionWorkerKeys],
      workerLabels: [...missionWorkerLabels],
      workerOutputs,
      streamText: streamText.slice(0, 10_000),
      planText: planText.slice(0, 10_000),
      completedAt,
      tasks,
    })
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
    missionWorkerKeys,
    missionWorkerLabels,
    workerOutputs,
    streamText,
    planText,
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
    setOrchestratorSessionKey(null)
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
    setMissionWorkerKeys(new Set())
    setMissionWorkerLabels(new Set())
    setWorkerOutputs({})
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
      setOrchestratorSessionKey(null)
      setStreamText('')
      setPlanText('')
      setStreamEvents([])
      setStreamError(null)
      setCompletedAt(null)
      setIsPaused(false)
      setPausedElapsedMs(0)
      setAccumulatedPausedMs(0)
      setPauseStartedAt(null)
      setMissionWorkerKeys(new Set())
      setMissionWorkerLabels(new Set())
      setWorkerOutputs({})
      setTasks([])
      setSelectedHistoryEntry(null)
      seenToolCallRef.current = false
      historySavedRef.current = false
      const startedAt = new Date().toISOString()
      setMissionStartedAt(startedAt)
      setPhase('decomposing')
      persistMission({
        missionId: null,
        missionJobId: null,
        goal: trimmed,
        phase: 'decomposing',
        missionStartedAt: startedAt,
        isPaused: false,
        pausedElapsedMs: 0,
        accumulatedPausedMs: 0,
        pauseStartedAt: null,
        workerKeys: [],
        workerLabels: [],
        workerOutputs: {},
        streamText: '',
        planText: '',
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
        setOrchestratorSessionKey(portableSessionKey)
        setMissionWorkerKeys((current) => {
          if (current.has(portableSessionKey)) return current
          const next = new Set(current)
          next.add(portableSessionKey)
          return next
        })
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
              setOrchestratorSessionKey(resolvedSessionKey)
              setMissionWorkerKeys((current) => {
                if (current.has(resolvedSessionKey)) return current
                const next = new Set(current)
                next.add(resolvedSessionKey)
                return next
              })
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
        setMissionId(spawnedMissionId)
        setMissionJobId(result.jobId ?? null)
        setOrchestratorSessionKey(spawnedMissionId)
        if (spawnedMissionId) {
          setMissionWorkerKeys((current) => {
            if (current.has(spawnedMissionId)) return current
            const next = new Set(current)
            next.add(spawnedMissionId)
            return next
          })
        }
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
        setOrchestratorSessionKey(orchestratorKey)
        setMissionWorkerKeys((current) => {
          if (current.has(orchestratorKey)) return current
          const next = new Set(current)
          next.add(orchestratorKey)
          return next
        })
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
                setOrchestratorSessionKey(matchedKey)
                setMissionWorkerKeys((current) => {
                  const next = new Set(current)
                  if (orchestratorKey) next.delete(orchestratorKey)
                  next.add(matchedKey)
                  return next
                })
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
      sessionKey,
      pause,
    }: {
      sessionKey: string
      pause: boolean
    }) => {
      const response = await fetch('/api/agent-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: sessionKey.trim(), pause }),
      })

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
    portableStreamAbortRef.current?.abort()
    portableStreamAbortRef.current = null
    const sessionKeys = [...missionWorkerKeys]
    const missionIds = missionId ? [missionId] : []

    try {
      await fetch('/api/conductor-stop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKeys, missionIds }),
      })
    } catch {
      // Best effort cleanup.
    }

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
    orchestratorSessionKey,
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
    missionWorkerKeys,
    workerOutputs,
    conductorSettings,
    setConductorSettings,
    sendMission: (nextGoal: string) =>
      sendMission.mutateAsync({ nextGoal, settings: conductorSettings }),
    pauseAgent: (sessionKey: string, pause: boolean) =>
      pauseAgent.mutateAsync({ sessionKey, pause }),
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
