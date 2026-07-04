import fs from 'node:fs'
import path from 'node:path'
import { appendWarRoomEvent } from './event-store'
import { DEFAULT_SAFETY_LOCKS } from './safety'
import type { SafetyLock, WarRoomEventSource, WarRoomRunId } from './domain'

export type AgentConnectionMode = 'frozen' | 'local_only' | 'armed_manual' | 'connected'

export type AgentConnectionUpdatedBy = WarRoomEventSource | 'system'

export type AgentConnectionState = {
  mode: AgentConnectionMode
  frozen: boolean
  usageAllowed: boolean
  workerSpawnAllowed: false
  reason: string
  updatedAtMs: number
  updatedBy: AgentConnectionUpdatedBy
  activeRunIds: Array<WarRoomRunId>
  safetyLocks: SafetyLock
  warning?: string
}

export type AgentConnectionStoreInfo = {
  mode: 'memory' | 'file'
  path?: string
  warning?: string
}

export type AgentConnectionStore = {
  read: () => AgentConnectionState
  write: (state: AgentConnectionState) => AgentConnectionState
  resetForDev: (nowMs?: number) => AgentConnectionState
  getInfo: () => AgentConnectionStoreInfo
}

export type AgentConnectionUpdateInput = {
  reason?: string
  updatedBy?: AgentConnectionUpdatedBy
  runId?: WarRoomRunId
}

export const DEFAULT_AGENT_CONNECTION_STATE_FILE = path.join(process.cwd(), '.war-room', 'agent-connection-state.json')

const MODE_EVENT_TYPE: Record<Exclude<AgentConnectionMode, 'connected'>, 'agent.connection.frozen' | 'agent.connection.local_only' | 'agent.connection.armed'> = {
  frozen: 'agent.connection.frozen',
  local_only: 'agent.connection.local_only',
  armed_manual: 'agent.connection.armed',
}

function cloneSafetyLocks(): SafetyLock {
  return { ...DEFAULT_SAFETY_LOCKS }
}

export function createFrozenAgentConnectionState(
  reason = 'Agents are frozen by default.',
  nowMs = Date.now(),
  updatedBy: AgentConnectionUpdatedBy = 'system',
  warning?: string,
): AgentConnectionState {
  return {
    mode: 'frozen',
    frozen: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    reason,
    updatedAtMs: nowMs,
    updatedBy,
    activeRunIds: [],
    safetyLocks: cloneSafetyLocks(),
    warning,
  }
}

function normalizeAgentConnectionState(value: unknown, warning?: string): AgentConnectionState {
  if (!value || typeof value !== 'object') {
    return createFrozenAgentConnectionState('Invalid agent connection state; frozen fail-closed.', Date.now(), 'system', warning)
  }
  const candidate = value as Partial<AgentConnectionState>
  if (!['frozen', 'local_only', 'armed_manual', 'connected'].includes(String(candidate.mode))) {
    return createFrozenAgentConnectionState('Invalid agent connection mode; frozen fail-closed.', Date.now(), 'system', warning)
  }

  const mode = candidate.mode as AgentConnectionMode
  const frozen = mode === 'frozen' ? true : Boolean(candidate.frozen)
  const usageAllowed = false
  return {
    mode,
    frozen,
    usageAllowed,
    workerSpawnAllowed: false,
    reason: typeof candidate.reason === 'string' && candidate.reason.trim() ? candidate.reason : 'Agent connection state loaded.',
    updatedAtMs: typeof candidate.updatedAtMs === 'number' ? candidate.updatedAtMs : Date.now(),
    updatedBy: ['ui', 'hermes', 'dispatcher', 'test', 'system'].includes(String(candidate.updatedBy))
      ? candidate.updatedBy as AgentConnectionUpdatedBy
      : 'system',
    activeRunIds: Array.isArray(candidate.activeRunIds)
      ? candidate.activeRunIds.filter((runId): runId is string => typeof runId === 'string' && runId.trim().length > 0)
      : [],
    safetyLocks: cloneSafetyLocks(),
    warning: warning ?? candidate.warning,
  }
}

function makeAgentConnectionState(
  mode: Exclude<AgentConnectionMode, 'connected'>,
  input: AgentConnectionUpdateInput = {},
  nowMs = Date.now(),
): AgentConnectionState {
  const isFrozen = mode === 'frozen'
  return {
    mode,
    frozen: isFrozen,
    usageAllowed: false,
    workerSpawnAllowed: false,
    reason: input.reason ?? (
      mode === 'local_only'
        ? 'Local body connection is prepared; worker usage remains blocked.'
        : mode === 'armed_manual'
          ? 'Manual arming recorded; worker usage remains blocked until a future explicit connector is added.'
          : 'Agents frozen; no worker usage can run.'
    ),
    updatedAtMs: nowMs,
    updatedBy: input.updatedBy ?? 'system',
    activeRunIds: isFrozen ? [] : input.runId ? [input.runId] : [],
    safetyLocks: cloneSafetyLocks(),
  }
}

function emitAgentConnectionEvent(
  type: 'agent.connection.frozen' | 'agent.connection.local_only' | 'agent.connection.armed' | 'agent.connection.disconnected',
  state: AgentConnectionState,
) {
  appendWarRoomEvent({
    type,
    createdAtMs: state.updatedAtMs,
    source: state.updatedBy === 'system' ? 'dispatcher' : state.updatedBy,
    status: 'completed',
    runId: state.activeRunIds[0],
    payload: {
      mode: state.mode,
      frozen: state.frozen,
      usageAllowed: state.usageAllowed,
      workerSpawnAllowed: state.workerSpawnAllowed,
      reason: state.reason,
      warning: state.warning,
    },
  })
}

function emitControlEvent(
  type: 'control.local_only' | 'control.frozen',
  state: AgentConnectionState,
) {
  appendWarRoomEvent({
    type,
    createdAtMs: state.updatedAtMs,
    source: state.updatedBy === 'system' ? 'dispatcher' : state.updatedBy,
    status: 'completed',
    runId: state.activeRunIds[0],
    payload: {
      mode: state.mode,
      frozen: state.frozen,
      usageAllowed: state.usageAllowed,
      workerSpawnAllowed: state.workerSpawnAllowed,
      reason: state.reason,
      warning: state.warning,
    },
  })
}

export function createMemoryAgentConnectionStore(initialState?: AgentConnectionState): AgentConnectionStore {
  let state = initialState ?? createFrozenAgentConnectionState()
  return {
    read: () => state,
    write(nextState) {
      state = normalizeAgentConnectionState(nextState)
      return state
    },
    resetForDev(nowMs = Date.now()) {
      state = createFrozenAgentConnectionState('Agent connection reset for dev; frozen fail-closed.', nowMs)
      return state
    },
    getInfo: () => ({ mode: 'memory' }),
  }
}

export function createFileAgentConnectionStore(filePath = process.env.WAR_ROOM_AGENT_CONTROL_FILE ?? DEFAULT_AGENT_CONNECTION_STATE_FILE): AgentConnectionStore {
  let warning: string | undefined

  function readFileState(): AgentConnectionState {
    try {
      if (!fs.existsSync(filePath)) {
        warning = 'Agent connection state file is missing; frozen fail-closed.'
        return createFrozenAgentConnectionState('Agent connection state file is missing; frozen fail-closed.', Date.now(), 'system', warning)
      }
      const raw = fs.readFileSync(filePath, 'utf8')
      warning = undefined
      return normalizeAgentConnectionState(JSON.parse(raw))
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error)
      return createFrozenAgentConnectionState('Could not read agent connection state; frozen fail-closed.', Date.now(), 'system', warning)
    }
  }

  function writeFileState(nextState: AgentConnectionState): AgentConnectionState {
    const normalized = normalizeAgentConnectionState(nextState)
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
      warning = undefined
      return normalized
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error)
      return createFrozenAgentConnectionState('Could not persist agent connection state; frozen fail-closed.', Date.now(), normalized.updatedBy, warning)
    }
  }

  return {
    read: readFileState,
    write: writeFileState,
    resetForDev(nowMs = Date.now()) {
      if (process.env.NODE_ENV === 'production') {
        return createFrozenAgentConnectionState('Agent connection reset is disabled in production; frozen fail-closed.', nowMs, 'system')
      }
      try {
        fs.rmSync(filePath, { force: true })
        warning = undefined
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error)
      }
      return createFrozenAgentConnectionState('Agent connection reset for dev; frozen fail-closed.', nowMs, 'system', warning)
    },
    getInfo: () => ({ mode: warning ? 'memory' : 'file', path: filePath, warning }),
  }
}

const activeAgentConnectionStore = process.env.WAR_ROOM_AGENT_CONTROL_STORE === 'file'
  ? createFileAgentConnectionStore()
  : createMemoryAgentConnectionStore()

export function getAgentConnectionState() {
  return activeAgentConnectionStore.read()
}

export function setAgentConnectionMode(
  mode: Exclude<AgentConnectionMode, 'connected'>,
  input: AgentConnectionUpdateInput = {},
  nowMs = Date.now(),
) {
  const nextState = activeAgentConnectionStore.write(makeAgentConnectionState(mode, input, nowMs))
  emitAgentConnectionEvent(MODE_EVENT_TYPE[nextState.mode === 'connected' ? 'frozen' : nextState.mode], nextState)
  if (nextState.mode === 'local_only') emitControlEvent('control.local_only', nextState)
  if (nextState.mode === 'frozen') emitControlEvent('control.frozen', nextState)
  return nextState
}

export function freezeWarRoomAgents(input: AgentConnectionUpdateInput = {}, nowMs = Date.now()) {
  return setAgentConnectionMode('frozen', input, nowMs)
}

export function setWarRoomAgentsLocalOnly(input: AgentConnectionUpdateInput = {}, nowMs = Date.now()) {
  return setAgentConnectionMode('local_only', input, nowMs)
}

export function armWarRoomAgentsManually(input: AgentConnectionUpdateInput = {}, nowMs = Date.now()) {
  return setAgentConnectionMode('armed_manual', input, nowMs)
}

export function disconnectWarRoomAgents(input: AgentConnectionUpdateInput = {}, nowMs = Date.now()) {
  const state = activeAgentConnectionStore.write(makeAgentConnectionState('frozen', {
    ...input,
    reason: input.reason ?? 'Agents disconnected; frozen fail-closed.',
  }, nowMs))
  emitAgentConnectionEvent('agent.connection.disconnected', state)
  emitControlEvent('control.frozen', state)
  return state
}

export function resetAgentConnectionControlForDev(nowMs = Date.now()) {
  return activeAgentConnectionStore.resetForDev(nowMs)
}

export function getAgentConnectionStoreInfo() {
  return activeAgentConnectionStore.getInfo()
}
