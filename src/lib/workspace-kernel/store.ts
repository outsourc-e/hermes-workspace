import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  WORKSPACE_KERNEL_SAFETY




} from './contracts'
import type {WorkspaceEvent, WorkspaceKernelPersistedState, WorkspaceKernelTelemetrySnapshot, WorkspaceRun} from './contracts';

export const WORKSPACE_KERNEL_STORE_SCHEMA_VERSION = 'workspace-kernel-v2'
export const WORKSPACE_KERNEL_STORE_DIR = path.join(process.cwd(), 'data', 'workspace-kernel')
export const WORKSPACE_KERNEL_STATE_FILE = 'state.json'
export const WORKSPACE_KERNEL_EVENTS_FILE = 'events.jsonl'
export const WORKSPACE_KERNEL_MAX_RUNS = 80
export const WORKSPACE_KERNEL_MAX_EVENTS = 500

export type WorkspaceKernelStoreOptions = {
  rootDir?: string
  nowMs?: number
}

function storeDir(options?: WorkspaceKernelStoreOptions) {
  return options?.rootDir ?? process.env.WORKSPACE_KERNEL_STORE_DIR ?? WORKSPACE_KERNEL_STORE_DIR
}

function statePath(options?: WorkspaceKernelStoreOptions) {
  return path.join(storeDir(options), WORKSPACE_KERNEL_STATE_FILE)
}

function eventsPath(options?: WorkspaceKernelStoreOptions) {
  return path.join(storeDir(options), WORKSPACE_KERNEL_EVENTS_FILE)
}

function nowVersion(nowMs: number) {
  return `${WORKSPACE_KERNEL_STORE_SCHEMA_VERSION}:${nowMs}`
}

export function createEmptyWorkspaceKernelPersistedState(nowMs = Date.now()): WorkspaceKernelPersistedState {
  return {
    schemaVersion: WORKSPACE_KERNEL_STORE_SCHEMA_VERSION,
    stateVersion: nowVersion(nowMs),
    updatedAtMs: nowMs,
    runs: [],
    events: [],
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function eventTime(event: WorkspaceEvent) {
  return Number.isFinite(event.createdAtMs) ? event.createdAtMs : 0
}

export function collectWorkspaceKernelEvents(runs: Array<WorkspaceRun>, extraEvents: Array<WorkspaceEvent> = []) {
  const eventsById = new Map<string, WorkspaceEvent>()
  for (const event of [...runs.flatMap((run) => run.events), ...extraEvents]) {
    if (!event?.eventId || !event.runId || !event.type) continue
    eventsById.set(event.eventId, event)
  }
  return [...eventsById.values()]
    .sort((left, right) => eventTime(left) - eventTime(right))
    .slice(-WORKSPACE_KERNEL_MAX_EVENTS)
}

function mergeById<T>(items: Array<T>, idFor: (item: T) => string | undefined, max = Number.POSITIVE_INFINITY) {
  const merged = new Map<string, T>()
  for (const item of items) {
    const id = idFor(item)
    if (id) merged.set(id, item)
  }
  return [...merged.values()].slice(-max)
}

export function mergeWorkspaceKernelRuns(existingRuns: Array<WorkspaceRun>, incomingRuns: Array<WorkspaceRun>) {
  const runsById = new Map<string, WorkspaceRun>()
  for (const run of existingRuns) runsById.set(run.runId, run)
  for (const incoming of incomingRuns) {
    const existing = runsById.get(incoming.runId)
    if (!existing) {
      runsById.set(incoming.runId, incoming)
      continue
    }
    const events = collectWorkspaceKernelEvents([
      { ...existing, events: existing.events },
      { ...incoming, events: incoming.events },
    ])
    runsById.set(incoming.runId, {
      ...existing,
      ...incoming,
      events,
      artifacts: mergeById([...existing.artifacts, ...incoming.artifacts], (artifact) => artifact.artifactId),
      approvals: mergeById([...existing.approvals, ...incoming.approvals], (approval) => approval.approvalId),
      updatedAtMs: Math.max(existing.updatedAtMs, incoming.updatedAtMs),
      safety: WORKSPACE_KERNEL_SAFETY,
    })
  }
  return [...runsById.values()]
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    .slice(0, WORKSPACE_KERNEL_MAX_RUNS)
}

export function prepareWorkspaceKernelPersistedState(
  input: {
    runs?: Array<WorkspaceRun>
    events?: Array<WorkspaceEvent>
    telemetry?: WorkspaceKernelTelemetrySnapshot
    previous?: WorkspaceKernelPersistedState
  },
  nowMs = Date.now(),
): WorkspaceKernelPersistedState {
  const previousRuns = input.previous?.runs ?? []
  const incomingRuns = input.runs ?? []
  const runs = mergeWorkspaceKernelRuns(previousRuns, incomingRuns)
  const events = collectWorkspaceKernelEvents(runs, [
    ...(input.previous?.events ?? []),
    ...(input.events ?? []),
  ])
  return {
    schemaVersion: WORKSPACE_KERNEL_STORE_SCHEMA_VERSION,
    stateVersion: nowVersion(nowMs),
    updatedAtMs: nowMs,
    runs,
    events,
    telemetry: input.telemetry ?? input.previous?.telemetry,
  }
}

function normalizeLoadedState(raw: unknown, nowMs = Date.now()): WorkspaceKernelPersistedState {
  if (!isObject(raw)) return createEmptyWorkspaceKernelPersistedState(nowMs)
  const rawRuns = Array.isArray(raw.runs) ? raw.runs : []
  const rawEvents = Array.isArray(raw.events) ? raw.events : []
  const runs = rawRuns.filter((run): run is WorkspaceRun => isObject(run) && typeof run.runId === 'string' && Array.isArray(run.events))
  const events = rawEvents.filter((event): event is WorkspaceEvent => isObject(event) && typeof event.eventId === 'string' && typeof event.runId === 'string')
  const updatedAtMs = typeof raw.updatedAtMs === 'number' && Number.isFinite(raw.updatedAtMs) ? raw.updatedAtMs : nowMs
  const stateVersion = typeof raw.stateVersion === 'string' ? raw.stateVersion : nowVersion(updatedAtMs)
  const telemetry = isObject(raw.telemetry) && typeof raw.telemetry.runId === 'string'
    ? raw.telemetry as WorkspaceKernelTelemetrySnapshot
    : undefined
  return {
    schemaVersion: WORKSPACE_KERNEL_STORE_SCHEMA_VERSION,
    stateVersion,
    updatedAtMs,
    runs: mergeWorkspaceKernelRuns([], runs),
    events: collectWorkspaceKernelEvents(runs, events),
    telemetry,
  }
}

export async function loadWorkspaceKernelState(options?: WorkspaceKernelStoreOptions): Promise<WorkspaceKernelPersistedState> {
  const nowMs = options?.nowMs ?? Date.now()
  try {
    const text = await readFile(statePath(options), 'utf8')
    return normalizeLoadedState(JSON.parse(text), nowMs)
  } catch {
    return createEmptyWorkspaceKernelPersistedState(nowMs)
  }
}

async function atomicWriteJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmpPath, filePath)
}

async function atomicWriteText(filePath: string, value: string) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${randomUUID()}.tmp`
  await writeFile(tmpPath, value, 'utf8')
  await rename(tmpPath, filePath)
}

export async function saveWorkspaceKernelState(
  state: WorkspaceKernelPersistedState,
  options?: WorkspaceKernelStoreOptions,
): Promise<WorkspaceKernelPersistedState> {
  const nowMs = options?.nowMs ?? Date.now()
  const normalized = prepareWorkspaceKernelPersistedState({
    runs: state.runs,
    events: state.events,
    telemetry: state.telemetry,
  }, nowMs)
  await atomicWriteJson(statePath(options), normalized)
  await atomicWriteText(eventsPath(options), `${normalized.events.map((event) => JSON.stringify(event)).join('\n')}${normalized.events.length ? '\n' : ''}`)
  return normalized
}

export async function persistWorkspaceKernelRuns(
  runs: Array<WorkspaceRun>,
  telemetry?: WorkspaceKernelTelemetrySnapshot,
  options?: WorkspaceKernelStoreOptions,
): Promise<WorkspaceKernelPersistedState> {
  const previous = await loadWorkspaceKernelState(options)
  return saveWorkspaceKernelState(prepareWorkspaceKernelPersistedState({
    previous,
    runs,
    telemetry,
  }, options?.nowMs ?? Date.now()), options)
}

export async function resetWorkspaceKernelStore(options?: WorkspaceKernelStoreOptions) {
  return saveWorkspaceKernelState(createEmptyWorkspaceKernelPersistedState(options?.nowMs ?? Date.now()), options)
}
