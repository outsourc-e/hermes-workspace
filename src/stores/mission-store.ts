import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AgentSessionStatusEntry,
  TeamMember,
} from '@/screens/gateway/components/team-panel'
import type {
  HubTask,
  TaskStatus,
} from '@/screens/gateway/components/task-board'
import type { SessionCardListWire } from '@/screens/chat/chat-queries'
import type { MissionCheckpoint } from '@/screens/gateway/lib/mission-checkpoint'
import {
  MISSION_CHECKPOINT_VERSION,
  archiveMissionToHistory,
  loadMissionHistory,
  parseMissionCheckpoint,
  validateMissionCheckpointCardOwnership,
} from '@/screens/gateway/lib/mission-checkpoint'

export type MissionProcessType = 'sequential' | 'hierarchical' | 'parallel'
export type MissionLifecycleState =
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'aborted'

export type MissionArtifact = {
  id: string
  agentId: string
  agentName: string
  type: 'html' | 'markdown' | 'code' | 'text'
  title: string
  content: string
  timestamp: number
}

export type ActiveMission = {
  id: string
  goal: string
  name: string
  plan?: Array<{
    title: string
    description: string
    agent?: string
    enabled: boolean
  }>
  state: MissionLifecycleState
  team: Array<TeamMember>
  tasks: Array<HubTask>
  agentCardIdMap: Record<string, string>
  agentParentCardIdMap: Record<string, string>
  agentCardTitleMap: Record<string, string>
  agentCardModelMap: Record<string, string>
  agentCardStatus: Record<string, AgentSessionStatusEntry>
  processType: MissionProcessType
  budgetLimit: string
  startedAt: number
  artifacts: Array<MissionArtifact>
}

export type MissionHistory = {
  reports: Array<MissionCheckpoint>
}

type Updater<T> = T | ((previous: T) => T)

type StartMissionInput = Omit<
  ActiveMission,
  | 'state'
  | 'agentCardIdMap'
  | 'agentParentCardIdMap'
  | 'agentCardTitleMap'
  | 'agentCardModelMap'
  | 'agentCardStatus'
  | 'artifacts'
> & {
  artifacts?: Array<MissionArtifact>
}

export type MissionCardOwner = {
  cardId: string
  parentCardId?: string
  title: string
  model?: string
}

type MissionStore = {
  activeMission: ActiveMission | null
  missionActive: boolean
  missionGoal: string
  activeMissionName: string
  activeMissionGoal: string
  missionState: 'running' | 'paused' | 'stopped'
  missionTasks: Array<HubTask>
  boardTasks: Array<HubTask>
  dispatchedTaskIdsByAgent: Record<string, Array<string>>
  agentCardIdMap: Record<string, string>
  agentParentCardIdMap: Record<string, string>
  agentCardTitleMap: Record<string, string>
  agentCardModelMap: Record<string, string>
  agentCardStatus: Record<string, AgentSessionStatusEntry>
  artifacts: Array<MissionArtifact>
  restoreCheckpoint: MissionCheckpoint | null
  cardOwnershipValidated: boolean
  missionHistory: MissionHistory
  beforeUnloadRegistered: boolean
  startMission: (mission: StartMissionInput) => void
  completeMission: () => void
  abortMission: () => void
  resetMission: () => void
  updateTaskStatus: (taskId: string, status: TaskStatus) => void
  updateAgentStatus: (
    agentId: string,
    entry: AgentSessionStatusEntry | null,
  ) => void
  setAgentCardOwner: (
    agentId: string,
    owner: MissionCardOwner | null,
    cardProjection?: SessionCardListWire,
  ) => boolean
  addArtifact: (artifact: MissionArtifact | Array<MissionArtifact>) => void
  setMissionState: (state: Updater<MissionStore['missionState']>) => void
  restoreMission: (
    checkpoint: MissionCheckpoint,
    cardProjection: SessionCardListWire,
  ) => void
  setMissionGoal: (goal: string) => void
  setRestoreCheckpoint: (checkpoint: MissionCheckpoint | null) => void
  setBoardTasks: (tasks: Updater<Array<HubTask>>) => void
  setDispatchedTaskIdsByAgent: (
    value: Updater<Record<string, Array<string>>>,
  ) => void
  setMissionTasks: (tasks: Updater<Array<HubTask>>) => void
  setAgentCardStatus: (
    value: Updater<Record<string, AgentSessionStatusEntry>>,
  ) => void
  setArtifacts: (value: Updater<Array<MissionArtifact>>) => void
  setActiveMissionMeta: (value: { name?: string; goal?: string }) => void
  saveCheckpoint: () => void
  markBeforeUnloadRegistered: (registered: boolean) => void
}

const MAX_HISTORY = 20
const MISSION_STORE_STORAGE_KEY = 'clawsuite:mission-store'
const RETIRED_PERSISTED_IDENTITY_FIELDS = new Set([
  'agentSessionMap',
  'agentSessions',
  'agentSessionModelMap',
  'agentSessionStatus',
  'workerKey',
  'workerKeys',
  'workerLabels',
  'workerOutputs',
  'sessionKey',
  'canonicalSegmentKey',
  'report',
])

function applyUpdater<T>(previous: T, next: Updater<T>): T {
  return typeof next === 'function' ? (next as (value: T) => T)(previous) : next
}

function isCardId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('remote:') || value.startsWith('local:'))
  )
}

function isCardIdMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(
    ([agentId, cardId]) => agentId.trim().length > 0 && isCardId(cardId),
  )
}

function containsRetiredPersistedIdentity(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRetiredPersistedIdentity)
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (
    Object.keys(record).some((key) =>
      RETIRED_PERSISTED_IDENTITY_FIELDS.has(key),
    )
  ) {
    return true
  }
  return Object.values(record).some(containsRetiredPersistedIdentity)
}

function isStringMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(
    ([key, entry]) => key.trim().length > 0 && typeof entry === 'string',
  )
}

function hasSafeCardOwnershipMaps(record: Record<string, unknown>): boolean {
  const cardIds = record.agentCardIdMap
  const parentIds = record.agentParentCardIdMap
  const titles = record.agentCardTitleMap
  const models = record.agentCardModelMap
  if (
    !isCardIdMap(cardIds) ||
    !isCardIdMap(parentIds) ||
    !isStringMap(titles) ||
    !isStringMap(models)
  ) {
    return false
  }
  const ownerKeys = new Set(Object.keys(cardIds))
  if (
    [
      ...Object.keys(parentIds),
      ...Object.keys(titles),
      ...Object.keys(models),
    ].some((agentId) => !ownerKeys.has(agentId))
  ) {
    return false
  }
  return Object.entries(parentIds).every(
    ([agentId, parentCardId]) => parentCardId !== cardIds[agentId],
  )
}

function discardPersistedMissionStore(): void {
  try {
    globalThis.localStorage.removeItem(MISSION_STORE_STORAGE_KEY)
  } catch {}
}

function isSafePersistedMissionState(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (containsRetiredPersistedIdentity(value)) return false
  const record = value as Record<string, unknown>
  if (!hasSafeCardOwnershipMaps(record)) return false
  if (
    'missionHistory' in record ||
    'boardTasks' in record ||
    'dispatchedTaskIdsByAgent' in record ||
    ('agentCardStatus' in record &&
      Object.keys(readObject(record.agentCardStatus)).length > 0) ||
    ('artifacts' in record && readArray(record.artifacts).length > 0)
  ) {
    return false
  }
  const activeMission = record.activeMission
  if (activeMission === null || activeMission === undefined) return true
  if (typeof activeMission !== 'object' || Array.isArray(activeMission))
    return false
  const activeRecord = activeMission as Record<string, unknown>
  return (
    hasSafeCardOwnershipMaps(activeRecord) &&
    Object.keys(readObject(activeRecord.agentCardStatus)).length === 0 &&
    readArray(activeRecord.artifacts).length === 0
  )
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readArray(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : []
}

function clampHistory(
  reports: Array<MissionCheckpoint>,
): Array<MissionCheckpoint> {
  return reports.slice(0, MAX_HISTORY)
}

function buildCheckpoint(state: MissionStore): MissionCheckpoint | null {
  const mission = state.activeMission
  if (!mission) return null

  return {
    version: MISSION_CHECKPOINT_VERSION,
    id: mission.id,
    label: mission.name || mission.goal || 'Untitled mission',
    name: mission.name,
    goal: mission.goal,
    processType: mission.processType,
    team: mission.team.map((member) => ({
      id: member.id,
      name: member.name,
      modelId: member.modelId,
      roleDescription: member.roleDescription,
      goal: member.goal,
      backstory: member.backstory,
    })),
    tasks: mission.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      assignedTo: task.agentId,
    })),
    agentCardIdMap: { ...mission.agentCardIdMap },
    agentParentCardIdMap: { ...mission.agentParentCardIdMap },
    agentCardTitleMap: { ...mission.agentCardTitleMap },
    agentCardModelMap: { ...mission.agentCardModelMap },
    status:
      mission.state === 'idle'
        ? 'paused'
        : mission.state === 'completed'
          ? 'completed'
          : mission.state === 'aborted'
            ? 'aborted'
            : mission.state,
    startedAt: mission.startedAt,
    updatedAt: Date.now(),
    budgetLimit: mission.budgetLimit,
  }
}

function syncActiveMission(state: MissionStore): Partial<MissionStore> {
  if (!state.activeMission) {
    return {
      missionActive: false,
      activeMissionName: '',
      activeMissionGoal: '',
      missionTasks: [],
      agentCardIdMap: {},
      agentParentCardIdMap: {},
      agentCardTitleMap: {},
      agentCardModelMap: {},
      agentCardStatus: {},
      artifacts: [],
    }
  }

  return {
    missionActive:
      state.activeMission.state === 'running' ||
      state.activeMission.state === 'paused',
    activeMissionName: state.activeMission.name,
    activeMissionGoal: state.activeMission.goal,
    missionTasks: state.activeMission.tasks,
    agentCardIdMap: state.activeMission.agentCardIdMap,
    agentParentCardIdMap: state.activeMission.agentParentCardIdMap,
    agentCardTitleMap: state.activeMission.agentCardTitleMap,
    agentCardModelMap: state.activeMission.agentCardModelMap,
    agentCardStatus: state.activeMission.agentCardStatus,
    artifacts: state.activeMission.artifacts,
  }
}

function updateCheckpointSnapshot(state: MissionStore): Partial<MissionStore> {
  const checkpoint = buildCheckpoint(state)
  return {
    restoreCheckpoint:
      checkpoint &&
      (state.missionState === 'running' || state.missionState === 'paused')
        ? checkpoint
        : null,
  }
}

function persistedActiveMission(
  mission: ActiveMission | null,
): ActiveMission | null {
  if (!mission) return null
  return {
    ...mission,
    plan: mission.plan?.map((task) => ({ ...task })),
    team: mission.team.map((member) => ({ ...member })),
    tasks: mission.tasks.map((task) => ({ ...task })),
    agentCardIdMap: { ...mission.agentCardIdMap },
    agentParentCardIdMap: { ...mission.agentParentCardIdMap },
    agentCardTitleMap: { ...mission.agentCardTitleMap },
    agentCardModelMap: { ...mission.agentCardModelMap },
    agentCardStatus: {},
    artifacts: [],
  }
}

function persistedCheckpoint(
  checkpoint: MissionCheckpoint | null,
): MissionCheckpoint | null {
  if (!checkpoint) return null
  const { report: _runtimeReport, ...withoutRuntimeReport } = checkpoint
  return parseMissionCheckpoint(withoutRuntimeReport)
}

const initialHistory = clampHistory(loadMissionHistory())

export const useMissionStore = create<MissionStore>()(
  persist(
    (set, get) => ({
      activeMission: null,
      missionActive: false,
      missionGoal: '',
      activeMissionName: '',
      activeMissionGoal: '',
      missionState: 'stopped',
      missionTasks: [],
      boardTasks: [],
      dispatchedTaskIdsByAgent: {},
      agentCardIdMap: {},
      agentParentCardIdMap: {},
      agentCardTitleMap: {},
      agentCardModelMap: {},
      agentCardStatus: {},
      artifacts: [],
      restoreCheckpoint: null,
      cardOwnershipValidated: true,
      missionHistory: { reports: initialHistory },
      beforeUnloadRegistered: false,

      startMission: (mission) => {
        const activeMission: ActiveMission = {
          ...mission,
          plan: mission.plan?.map((task) => ({ ...task })),
          state: 'running',
          agentCardIdMap: {},
          agentParentCardIdMap: {},
          agentCardTitleMap: {},
          agentCardModelMap: {},
          agentCardStatus: {},
          artifacts: [...(mission.artifacts ?? [])],
          tasks: [...mission.tasks],
          team: mission.team.map((member) => ({ ...member })),
        }

        set((state) => {
          const nextState: MissionStore = {
            ...state,
            activeMission,
            missionActive: true,
            missionGoal: mission.goal,
            activeMissionName: mission.name,
            activeMissionGoal: mission.goal,
            missionState: 'running',
            missionTasks: activeMission.tasks,
            agentCardIdMap: activeMission.agentCardIdMap,
            agentParentCardIdMap: activeMission.agentParentCardIdMap,
            agentCardTitleMap: activeMission.agentCardTitleMap,
            agentCardModelMap: activeMission.agentCardModelMap,
            agentCardStatus: activeMission.agentCardStatus,
            artifacts: activeMission.artifacts,
            dispatchedTaskIdsByAgent: {},
            restoreCheckpoint: null,
            cardOwnershipValidated: true,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        })
      },

      completeMission: () => {
        const state = get()
        if (!state.activeMission) return
        const completedMission: ActiveMission = {
          ...state.activeMission,
          state: 'completed',
        }
        const checkpoint = buildCheckpoint({
          ...state,
          activeMission: completedMission,
        })
        const reports = checkpoint
          ? clampHistory([
              checkpoint,
              ...state.missionHistory.reports.filter(
                (entry) => entry.id !== checkpoint.id,
              ),
            ])
          : state.missionHistory.reports
        if (checkpoint) {
          archiveMissionToHistory(checkpoint)
        }
        set({
          activeMission: completedMission,
          missionActive: false,
          missionState: 'stopped',
          missionTasks: [],
          dispatchedTaskIdsByAgent: {},
          restoreCheckpoint: null,
          missionHistory: { reports },
        })
      },

      abortMission: () => {
        const state = get()
        if (!state.activeMission) return
        const abortedMission: ActiveMission = {
          ...state.activeMission,
          state: 'aborted',
        }
        const checkpoint = buildCheckpoint({
          ...state,
          activeMission: abortedMission,
        })
        const reports = checkpoint
          ? clampHistory([
              checkpoint,
              ...state.missionHistory.reports.filter(
                (entry) => entry.id !== checkpoint.id,
              ),
            ])
          : state.missionHistory.reports
        if (checkpoint) {
          archiveMissionToHistory(checkpoint)
        }
        set({
          activeMission: abortedMission,
          missionActive: false,
          missionState: 'stopped',
          missionTasks: [],
          dispatchedTaskIdsByAgent: {},
          restoreCheckpoint: null,
          missionHistory: { reports },
        })
      },

      resetMission: () => {
        set({
          activeMission: null,
          missionActive: false,
          missionGoal: '',
          activeMissionName: '',
          activeMissionGoal: '',
          missionState: 'stopped',
          missionTasks: [],
          boardTasks: [],
          dispatchedTaskIdsByAgent: {},
          agentCardIdMap: {},
          agentParentCardIdMap: {},
          agentCardTitleMap: {},
          agentCardModelMap: {},
          agentCardStatus: {},
          artifacts: [],
          restoreCheckpoint: null,
        })
      },

      updateTaskStatus: (taskId, status) => {
        set((state) => {
          if (!state.activeMission) return state
          const tasks = state.activeMission.tasks.map((task) =>
            task.id === taskId && task.status !== status
              ? { ...task, status, updatedAt: Date.now() }
              : task,
          )
          const activeMission = {
            ...state.activeMission,
            tasks,
          }
          const nextState: MissionStore = {
            ...state,
            activeMission,
            missionTasks: tasks,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        })
      },

      updateAgentStatus: (agentId, entry) => {
        set((state) => {
          if (!state.activeMission) return state
          const agentCardStatus = {
            ...state.activeMission.agentCardStatus,
          }
          if (entry) {
            agentCardStatus[agentId] = entry
          } else {
            delete agentCardStatus[agentId]
          }

          const activeMission = {
            ...state.activeMission,
            agentCardStatus,
          }
          const nextState: MissionStore = {
            ...state,
            activeMission,
            agentCardStatus,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        })
      },

      setAgentCardOwner: (agentId, owner, cardProjection) => {
        let accepted = false
        set((state) => {
          if (!state.activeMission) return state

          const agentCardIdMap = { ...state.activeMission.agentCardIdMap }
          const agentParentCardIdMap = {
            ...state.activeMission.agentParentCardIdMap,
          }
          let agentCardTitleMap = {
            ...state.activeMission.agentCardTitleMap,
          }
          const agentCardModelMap = {
            ...state.activeMission.agentCardModelMap,
          }

          if (!owner) {
            delete agentCardIdMap[agentId]
            delete agentParentCardIdMap[agentId]
            delete agentCardTitleMap[agentId]
            delete agentCardModelMap[agentId]
          } else {
            if (
              !isCardId(owner.cardId) ||
              (owner.parentCardId !== undefined &&
                (!isCardId(owner.parentCardId) ||
                  owner.parentCardId === owner.cardId)) ||
              !owner.title.trim()
            ) {
              return state
            }
            agentCardIdMap[agentId] = owner.cardId
            if (owner.parentCardId) {
              agentParentCardIdMap[agentId] = owner.parentCardId
            } else {
              delete agentParentCardIdMap[agentId]
            }
            agentCardTitleMap[agentId] = owner.title.trim()
            if (owner.model?.trim()) {
              agentCardModelMap[agentId] = owner.model.trim()
            } else {
              delete agentCardModelMap[agentId]
            }
          }

          let activeMission = {
            ...state.activeMission,
            agentCardIdMap,
            agentParentCardIdMap,
            agentCardTitleMap,
            agentCardModelMap,
          }
          const nextState: MissionStore = {
            ...state,
            activeMission,
            agentCardIdMap,
            agentParentCardIdMap,
            agentCardTitleMap,
            agentCardModelMap,
          }
          if (owner) {
            const checkpoint = buildCheckpoint(nextState)
            const validated =
              checkpoint && cardProjection
                ? validateMissionCheckpointCardOwnership(
                    checkpoint,
                    cardProjection,
                  )
                : null
            if (!validated) return state
            agentCardTitleMap = validated.agentCardTitleMap
            activeMission = { ...activeMission, agentCardTitleMap }
            nextState.activeMission = activeMission
            nextState.agentCardTitleMap = agentCardTitleMap
            nextState.cardOwnershipValidated = true
          }
          accepted = true
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        })
        return accepted
      },

      addArtifact: (artifact) => {
        const additions = Array.isArray(artifact) ? artifact : [artifact]
        set((state) => {
          if (!state.activeMission || additions.length === 0) return state
          const artifacts = [...state.activeMission.artifacts, ...additions]
          const activeMission = {
            ...state.activeMission,
            artifacts,
          }
          const nextState: MissionStore = {
            ...state,
            activeMission,
            artifacts,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        })
      },

      setMissionState: (missionStateValue) => {
        set((state) => {
          const missionState = applyUpdater(
            state.missionState,
            missionStateValue,
          )
          const activeMission = state.activeMission
            ? {
                ...state.activeMission,
                state:
                  missionState === 'stopped'
                    ? state.activeMission.state === 'aborted' ||
                      state.activeMission.state === 'completed'
                      ? state.activeMission.state
                      : 'paused'
                    : missionState,
              }
            : null
          const nextState: MissionStore = {
            ...state,
            activeMission,
            missionState,
          }
          return {
            ...nextState,
            ...syncActiveMission(nextState),
            ...updateCheckpointSnapshot(nextState),
          }
        })
      },

      restoreMission: (checkpoint, cardProjection) => {
        const validatedCheckpoint = validateMissionCheckpointCardOwnership(
          checkpoint,
          cardProjection,
        )
        if (!validatedCheckpoint) {
          discardPersistedMissionStore()
          set({
            activeMission: null,
            missionActive: false,
            missionGoal: '',
            activeMissionName: '',
            activeMissionGoal: '',
            missionState: 'stopped',
            missionTasks: [],
            dispatchedTaskIdsByAgent: {},
            agentCardIdMap: {},
            agentParentCardIdMap: {},
            agentCardTitleMap: {},
            agentCardModelMap: {},
            agentCardStatus: {},
            artifacts: [],
            restoreCheckpoint: null,
            cardOwnershipValidated: false,
          })
          return
        }

        const restoredTasks: Array<HubTask> = validatedCheckpoint.tasks.map(
          (task) => ({
            id: task.id,
            title: task.title,
            description: '',
            priority: 'normal',
            status: task.status as TaskStatus,
            agentId: task.assignedTo,
            missionId: validatedCheckpoint.id,
            createdAt: validatedCheckpoint.startedAt,
            updatedAt: validatedCheckpoint.updatedAt,
          }),
        )
        const activeMission: ActiveMission = {
          id: validatedCheckpoint.id,
          goal: validatedCheckpoint.goal,
          name: validatedCheckpoint.name || validatedCheckpoint.label,
          state: validatedCheckpoint.status === 'paused' ? 'paused' : 'running',
          team: validatedCheckpoint.team.map((member) => ({
            ...member,
            status: 'available',
          })),
          tasks: restoredTasks,
          agentCardIdMap: { ...validatedCheckpoint.agentCardIdMap },
          agentParentCardIdMap: {
            ...validatedCheckpoint.agentParentCardIdMap,
          },
          agentCardTitleMap: { ...validatedCheckpoint.agentCardTitleMap },
          agentCardModelMap: { ...validatedCheckpoint.agentCardModelMap },
          agentCardStatus: {},
          processType: validatedCheckpoint.processType,
          budgetLimit: validatedCheckpoint.budgetLimit || '',
          startedAt: validatedCheckpoint.startedAt,
          artifacts: [],
        }
        const nextState: MissionStore = {
          ...get(),
          activeMission,
          missionActive: true,
          missionGoal: validatedCheckpoint.goal,
          activeMissionName: activeMission.name,
          activeMissionGoal: activeMission.goal,
          missionState:
            validatedCheckpoint.status === 'paused' ? 'paused' : 'running',
          missionTasks: restoredTasks,
          agentCardIdMap: activeMission.agentCardIdMap,
          agentParentCardIdMap: activeMission.agentParentCardIdMap,
          agentCardTitleMap: activeMission.agentCardTitleMap,
          agentCardModelMap: activeMission.agentCardModelMap,
          agentCardStatus: {},
          artifacts: [],
          restoreCheckpoint: null,
          cardOwnershipValidated: true,
        }
        set({
          ...nextState,
          ...updateCheckpointSnapshot(nextState),
        })
      },

      setMissionGoal: (missionGoal) => set({ missionGoal }),
      setRestoreCheckpoint: (restoreCheckpoint) => set({ restoreCheckpoint }),
      setBoardTasks: (tasks) =>
        set((state) => ({ boardTasks: applyUpdater(state.boardTasks, tasks) })),
      setDispatchedTaskIdsByAgent: (value) =>
        set((state) => ({
          dispatchedTaskIdsByAgent: applyUpdater(
            state.dispatchedTaskIdsByAgent,
            value,
          ),
        })),
      setMissionTasks: (tasks) =>
        set((state) => {
          const missionTasks = applyUpdater(state.missionTasks, tasks)
          const activeMission = state.activeMission
            ? {
                ...state.activeMission,
                tasks: missionTasks,
              }
            : null
          const nextState: MissionStore = {
            ...state,
            activeMission,
            missionTasks,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        }),
      setAgentCardStatus: (value) =>
        set((state) => {
          const agentCardStatus = applyUpdater(state.agentCardStatus, value)
          const activeMission = state.activeMission
            ? {
                ...state.activeMission,
                agentCardStatus,
              }
            : null
          const nextState: MissionStore = {
            ...state,
            activeMission,
            agentCardStatus,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        }),
      setArtifacts: (value) =>
        set((state) => {
          const artifacts = applyUpdater(state.artifacts, value)
          const activeMission = state.activeMission
            ? {
                ...state.activeMission,
                artifacts,
              }
            : null
          const nextState: MissionStore = {
            ...state,
            activeMission,
            artifacts,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        }),
      setActiveMissionMeta: (value) =>
        set((state) => {
          if (!state.activeMission) {
            return {
              activeMissionName: value.name ?? state.activeMissionName,
              activeMissionGoal: value.goal ?? state.activeMissionGoal,
            }
          }
          const activeMission = {
            ...state.activeMission,
            name: value.name ?? state.activeMission.name,
            goal: value.goal ?? state.activeMission.goal,
          }
          const nextState: MissionStore = {
            ...state,
            activeMission,
            activeMissionName: activeMission.name,
            activeMissionGoal: activeMission.goal,
          }
          return {
            ...nextState,
            ...updateCheckpointSnapshot(nextState),
          }
        }),
      saveCheckpoint: () => {
        const state = get()
        const checkpoint = buildCheckpoint(state)
        if (!checkpoint) return
        set({ restoreCheckpoint: checkpoint })
      },
      markBeforeUnloadRegistered: (beforeUnloadRegistered) =>
        set({ beforeUnloadRegistered }),
    }),
    {
      name: MISSION_STORE_STORAGE_KEY,
      version: MISSION_CHECKPOINT_VERSION,
      migrate: (persistedState, persistedVersion) => {
        if (
          persistedVersion !== MISSION_CHECKPOINT_VERSION ||
          !isSafePersistedMissionState(persistedState)
        ) {
          discardPersistedMissionStore()
          return {}
        }
        return persistedState
      },
      merge: (persistedState, currentState) => {
        if (!isSafePersistedMissionState(persistedState)) {
          discardPersistedMissionStore()
          return currentState
        }
        const persistedRecord = persistedState as Record<string, unknown>
        const restoreCheckpoint = parseMissionCheckpoint(
          persistedRecord.restoreCheckpoint,
        )
        // Persisted Card-looking strings are only restore candidates. Remove
        // the durable payload immediately and keep the candidate in memory
        // until restoreMission validates it against a complete Card projection.
        discardPersistedMissionStore()
        return {
          ...currentState,
          restoreCheckpoint,
          cardOwnershipValidated: false,
        }
      },
      partialize: (state) => ({
        activeMission: persistedActiveMission(state.activeMission),
        missionActive: state.missionActive,
        missionGoal: state.missionGoal,
        activeMissionName: state.activeMissionName,
        activeMissionGoal: state.activeMissionGoal,
        missionState: state.missionState,
        missionTasks: state.missionTasks.map((task) => ({ ...task })),
        agentCardIdMap: { ...state.agentCardIdMap },
        agentParentCardIdMap: { ...state.agentParentCardIdMap },
        agentCardTitleMap: { ...state.agentCardTitleMap },
        agentCardModelMap: { ...state.agentCardModelMap },
        agentCardStatus: {},
        artifacts: [],
        restoreCheckpoint: state.cardOwnershipValidated
          ? persistedCheckpoint(state.restoreCheckpoint)
          : null,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (state.activeMission && !state.restoreCheckpoint) {
          const checkpoint = buildCheckpoint(state)
          if (
            checkpoint &&
            (state.missionState === 'running' ||
              state.missionState === 'paused')
          ) {
            state.restoreCheckpoint = checkpoint
          }
        }
        const persistedHistory = (state as Partial<MissionStore>).missionHistory
        state.missionHistory = {
          reports: clampHistory(persistedHistory?.reports ?? initialHistory),
        }
      },
    },
  ),
)

export function saveMissionStoreBeforeUnload(): void {
  const state = useMissionStore.getState()
  if (state.missionState !== 'running') return
  state.saveCheckpoint()
}
