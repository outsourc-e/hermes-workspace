import { useCallback, useEffect, useRef, useState } from 'react'
import { emitFeedEvent } from '../components/feed-event-bus'
import { resolveGatewayModelId } from '../components/hub-utils'
import type { HubTask, TaskStatus } from '../components/task-board'
import type {
  AgentSessionStatusEntry,
  TeamMember,
} from '../components/team-panel'
import type {
  SessionCardChildWire,
  SessionCardListWire,
} from '@/screens/chat/chat-queries'
import type { ActiveMission, MissionProcessType } from '@/stores/mission-store'
import { useMissionStore } from '@/stores/mission-store'
import { killAgentSession, toggleAgentPause } from '@/lib/gateway-api'
import {
  fetchSessionCards,
  retainCompleteSessionCardProjections,
} from '@/screens/chat/chat-queries'

type SessionRecord = Record<string, unknown>

type RetryPayload = {
  tasks: Array<HubTask>
  messageText: string
}

type DispatchResponse = {
  ok?: boolean
  error?: string
  message?: string
  sessionKey?: string
  runId?: string | null
}

type AuthoritativeCardOwner = {
  cardId: string
  parentCardId?: string
  title: string
  canonicalSegmentKey: string
}

function qualifyRemoteSessionKey(sessionKey: string): string {
  return sessionKey.startsWith('remote:') || sessionKey.startsWith('local:')
    ? sessionKey
    : `remote:${sessionKey}`
}

function projectAuthoritativeChildOwner(
  children: ReadonlyArray<SessionCardChildWire>,
  parentCardId: string,
  identity: string,
): AuthoritativeCardOwner | null {
  for (const child of children) {
    if (
      [
        child.cardId,
        child.sessionKey,
        ...child.continuationSegmentKeys,
      ].includes(identity)
    ) {
      return {
        cardId: child.cardId,
        parentCardId,
        title: child.title,
        canonicalSegmentKey: child.sessionKey,
      }
    }
    const descendant = projectAuthoritativeChildOwner(
      child.childNodes ?? [],
      child.cardId,
      identity,
    )
    if (descendant) return descendant
  }
  return null
}

function projectAuthoritativeCardOwner(
  response: SessionCardListWire | undefined,
  identity: string,
): AuthoritativeCardOwner | null {
  const projection = retainCompleteSessionCardProjections(response)
  if (!projection) return null
  const qualifiedIdentity = qualifyRemoteSessionKey(identity)

  for (const card of projection.cards) {
    if (
      [
        card.cardId,
        card.canonicalSegmentKey,
        ...card.continuationSegmentKeys,
      ].includes(qualifiedIdentity)
    ) {
      return {
        cardId: card.cardId,
        title: card.title,
        canonicalSegmentKey: card.canonicalSegmentKey,
      }
    }
    const childOwner = projectAuthoritativeChildOwner(
      card.childNodes,
      card.cardId,
      qualifiedIdentity,
    )
    if (childOwner) return childOwner
  }
  return null
}

async function resolveAuthoritativeCardOwner(
  identity: string,
  attempts = 6,
): Promise<AuthoritativeCardOwner | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const owner = projectAuthoritativeCardOwner(
      await fetchSessionCards(),
      identity,
    )
    if (owner) return owner
    if (attempt + 1 < attempts) {
      await new Promise((resolve) => window.setTimeout(resolve, 150))
    }
  }
  return null
}

function remoteSessionKey(owner: AuthoritativeCardOwner): string | null {
  return owner.canonicalSegmentKey.startsWith('remote:')
    ? owner.canonicalSegmentKey.slice('remote:'.length) || null
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getOptionalRecordValue<T>(
  record: Record<string, T>,
  key: string,
): T | undefined {
  return record[key]
}

function readSessionId(session: SessionRecord): string {
  return readString(session.key) || readString(session.friendlyId)
}

function readSessionName(session: SessionRecord): string {
  return (
    readString(session.label) ||
    readString(session.displayName) ||
    readString(session.title) ||
    readString(session.friendlyId) ||
    readString(session.key)
  )
}

function readSessionLastMessage(session: SessionRecord): string {
  const record =
    session.lastMessage &&
    typeof session.lastMessage === 'object' &&
    !Array.isArray(session.lastMessage)
      ? (session.lastMessage as Record<string, unknown>)
      : null
  if (!record) return ''
  const directText = readString(record.text)
  if (directText) return directText
  const parts = Array.isArray(record.content) ? record.content : []
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) return ''
      return readString((part as Record<string, unknown>).text)
    })
    .filter(Boolean)
    .join(' ')
}

function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<Record<string, unknown>>)
      .filter(
        (block) => block.type === 'text' && typeof block.text === 'string',
      )
      .map((block) => block.text as string)
      .join('')
  }
  return ''
}

function classifyAgentTurnEnd(
  text: string | undefined | null,
): 'completed' | 'waiting_for_input' {
  if (!text) return 'completed'

  const trimmed = text.trim()
  if (!trimmed) return 'completed'

  const completionMarkers = [
    '[TASK_COMPLETE]',
    '[DONE]',
    '[MISSION_COMPLETE]',
    '[COMPLETED]',
    'TASK_COMPLETE',
    'MISSION_COMPLETE',
  ]
  const upper = trimmed.toUpperCase()
  for (const marker of completionMarkers) {
    if (upper.includes(marker)) return 'completed'
  }

  const waitingMarkers = [
    '[WAITING_FOR_INPUT]',
    '[NEEDS_INPUT]',
    '[QUESTION]',
    'APPROVAL_REQUIRED:',
  ]
  for (const marker of waitingMarkers) {
    if (upper.includes(marker.toUpperCase())) return 'waiting_for_input'
  }

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const lastLine = lines[lines.length - 1] ?? ''
  if (/\?\s*$/.test(lastLine)) return 'waiting_for_input'
  if (trimmed.length < 60) return 'waiting_for_input'
  return 'completed'
}

function createId(prefix: string): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getAgentContext(member: TeamMember): string {
  return [
    member.roleDescription && `Role: ${member.roleDescription}`,
    member.goal && `Your goal: ${member.goal}`,
    member.backstory && `Background: ${member.backstory}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function buildDispatchMessage(params: {
  agentId: string
  agentTasks: Array<HubTask>
  member?: TeamMember
  missionGoal: string
  mode: MissionProcessType
  leadMember?: TeamMember
  workerMembers?: Array<TeamMember>
}): string {
  const {
    agentId,
    agentTasks,
    member,
    missionGoal,
    mode,
    leadMember,
    workerMembers,
  } = params
  const agentContext = member ? getAgentContext(member) : ''
  const taskList = agentTasks
    .map((task, index) => `${index + 1}. ${task.title}`)
    .join('\n')

  if (mode === 'hierarchical' && member && leadMember?.id === member.id) {
    const teamList = (workerMembers ?? [])
      .map((worker) => `- ${worker.name} (${worker.roleDescription})`)
      .join('\n')
    const leadBriefing = `You are the Lead Agent coordinating this mission.\n\nYour team:\n${teamList}\n\nMission Goal: ${missionGoal}\n\nYour job: Break down the goal into clear subtasks, delegate them to your team members by name, and synthesize the final result. Start by outlining the plan.`
    return [agentContext, leadBriefing].filter(Boolean).join('\n\n')
  }

  const prefix =
    mode === 'hierarchical' &&
    leadMember &&
    member &&
    leadMember.id !== member.id
      ? `Delegated by ${leadMember.name}:\n\n`
      : ''
  const body = `${prefix}Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoal}\n\nPlease work through these tasks sequentially. Report progress on each.`
  return [agentContext, body].filter(Boolean).join('\n\n')
}

export function useMissionOrchestrator() {
  const activeMission = useMissionStore((state) => state.activeMission)
  const missionState = useMissionStore((state) => state.missionState)
  const agentCardIdMap = useMissionStore((state) => state.agentCardIdMap)
  const agentCardStatus = useMissionStore((state) => state.agentCardStatus)
  const setMissionTasks = useMissionStore((state) => state.setMissionTasks)
  const setDispatchedTaskIdsByAgent = useMissionStore(
    (state) => state.setDispatchedTaskIdsByAgent,
  )
  const setAgentCardOwner = useMissionStore((state) => state.setAgentCardOwner)
  const setAgentCardStatus = useMissionStore(
    (state) => state.setAgentCardStatus,
  )
  const setMissionState = useMissionStore((state) => state.setMissionState)
  const completeMission = useMissionStore((state) => state.completeMission)
  const abortMissionInStore = useMissionStore((state) => state.abortMission)

  const [isDispatching, setIsDispatching] = useState(false)

  const missionRef = useRef<ActiveMission | null>(activeMission)
  const transientSessionMapRef = useRef<Record<string, string>>({})
  const streamMapRef = useRef<Map<string, EventSource>>(new Map())
  const lastOutputByAgentRef = useRef<Record<string, string>>({})
  const activityMarkerRef = useRef<Map<string, string>>(new Map())
  const retryPayloadRef = useRef<Partial<Record<string, RetryPayload>>>({})
  const completedSessionKeysRef = useRef<Set<string>>(new Set())
  const dispatchTokenRef = useRef<string | null>(null)

  useEffect(() => {
    missionRef.current = activeMission
  }, [activeMission])

  const closeAllStreams = useCallback(() => {
    streamMapRef.current.forEach((source) => source.close())
    streamMapRef.current.clear()
  }, [])

  const resetOrchestratorState = useCallback(() => {
    closeAllStreams()
    transientSessionMapRef.current = {}
    lastOutputByAgentRef.current = {}
    activityMarkerRef.current = new Map()
    retryPayloadRef.current = {}
    completedSessionKeysRef.current = new Set()
    dispatchTokenRef.current = null
    setIsDispatching(false)
  }, [closeAllStreams])

  const updateTasksForAgent = useCallback(
    (agentId: string, status: TaskStatus) => {
      const changedTasks: Array<HubTask> = []

      setMissionTasks((previous) =>
        previous.map((task) => {
          if (task.agentId !== agentId || task.status === status) return task
          const updatedTask = { ...task, status, updatedAt: Date.now() }
          changedTasks.push(updatedTask)
          return updatedTask
        }),
      )

      if (status === 'done' && changedTasks.length > 0) {
        const agentName =
          missionRef.current?.team.find((member) => member.id === agentId)
            ?.name ?? agentId
        changedTasks.forEach((task) => {
          emitFeedEvent({
            type: 'task_completed',
            message: `${agentName} completed: ${task.title}`,
            agentName,
            taskTitle: task.title,
          })
        })
      }
    },
    [setMissionTasks],
  )

  const maybeCompleteMission = useCallback(() => {
    const mission = missionRef.current
    if (!mission || useMissionStore.getState().missionState !== 'running')
      return

    const tasks = useMissionStore.getState().missionTasks
    if (tasks.length === 0) return
    const allDone = tasks.every((task) => task.status === 'done')
    if (!allDone) return

    emitFeedEvent({
      type: 'mission_started',
      message: '✓ All agents reached terminal state — mission complete',
    })
    completeMission()
    setIsDispatching(false)
  }, [completeMission])

  const setAgentStatus = useCallback(
    (agentId: string, entry: AgentSessionStatusEntry) => {
      setAgentCardStatus((previous) => ({
        ...previous,
        [agentId]: entry,
      }))
    },
    [setAgentCardStatus],
  )

  const persistCardOwner = useCallback(
    (agentId: string, owner: AuthoritativeCardOwner, model?: string) => {
      setAgentCardOwner(agentId, {
        cardId: owner.cardId,
        ...(owner.parentCardId ? { parentCardId: owner.parentCardId } : {}),
        title: owner.title,
        ...(model ? { model } : {}),
      })
    },
    [setAgentCardOwner],
  )

  const attachSessionStream = useCallback(
    (agentId: string, sessionKey: string) => {
      if (typeof window === 'undefined') return
      if (streamMapRef.current.has(sessionKey)) return

      const source = new EventSource(
        `/api/chat-events?sessionKey=${encodeURIComponent(sessionKey)}`,
      )
      streamMapRef.current.set(sessionKey, source)

      source.addEventListener('message', (event) => {
        if (!(event instanceof MessageEvent)) return
        try {
          const payload = JSON.parse(event.data as string) as Record<
            string,
            unknown
          >
          const text =
            readString(payload.text) ||
            readString(payload.content) ||
            extractTextFromMessage(payload.message)
          if (!text) return
          lastOutputByAgentRef.current[agentId] = text
          setAgentStatus(agentId, {
            status: 'active',
            lastSeen: Date.now(),
            lastMessage: text,
          })
        } catch {
          /* ignore malformed SSE chunks */
        }
      })

      source.addEventListener('done', (event) => {
        let finalText = lastOutputByAgentRef.current[agentId] ?? ''
        if (event instanceof MessageEvent) {
          try {
            const payload = JSON.parse(event.data as string) as Record<
              string,
              unknown
            >
            finalText =
              extractTextFromMessage(payload.message) ||
              readString(payload.text) ||
              readString(payload.content) ||
              finalText
          } catch {
            /* ignore malformed done payload */
          }
        }

        const agentName =
          missionRef.current?.team.find((member) => member.id === agentId)
            ?.name ?? agentId
        if (classifyAgentTurnEnd(finalText) === 'waiting_for_input') {
          setAgentStatus(agentId, {
            status: 'waiting_for_input',
            lastSeen: Date.now(),
            lastMessage: finalText,
          })
          emitFeedEvent({
            type: 'agent_active',
            message: `${agentName} is waiting for input`,
            agentName,
          })
          return
        }

        completedSessionKeysRef.current.add(sessionKey)
        setAgentStatus(agentId, {
          status: 'idle',
          lastSeen: Date.now(),
          ...(finalText ? { lastMessage: finalText } : {}),
        })
        updateTasksForAgent(agentId, 'done')
        emitFeedEvent({
          type: 'agent_idle',
          message: `${agentName} completed assigned work`,
          agentName,
        })
        maybeCompleteMission()
      })

      source.addEventListener('error', () => {
        if (source.readyState !== EventSource.CLOSED) return
        if (completedSessionKeysRef.current.has(sessionKey)) return

        const agentName =
          missionRef.current?.team.find((member) => member.id === agentId)
            ?.name ?? agentId
        setAgentStatus(agentId, {
          status: 'error',
          lastSeen: Date.now(),
          lastMessage: 'Live stream disconnected',
        })
        emitFeedEvent({
          type: 'system',
          message: `${agentName} stream disconnected`,
          agentName,
        })
        streamMapRef.current.delete(sessionKey)
      })
    },
    [maybeCompleteMission, setAgentStatus, updateTasksForAgent],
  )

  const spawnAgentSession = useCallback(
    async (
      member: TeamMember,
      options?: { reuseExisting?: boolean; labelSuffix?: string },
    ): Promise<string> => {
      const suffix = Math.random().toString(36).slice(2, 8)
      const baseName = member.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const friendlyId = `conductor-${baseName}-${suffix}`
      const reuseExisting = options?.reuseExisting !== false
      const labelSuffix = options?.labelSuffix
        ? ` (${options.labelSuffix})`
        : ''
      const label = `Mission: ${member.name}${labelSuffix}`
      const model = resolveGatewayModelId(member.modelId)
      setAgentCardOwner(member.id, null)
      setAgentStatus(member.id, {
        status: 'dispatching',
        lastSeen: Date.now(),
        lastMessage: 'Creating session',
      })
      emitFeedEvent({
        type: 'system',
        message: `Dispatching ${member.name}: creating session`,
        agentName: member.name,
      })

      if (reuseExisting) {
        const listResp = await fetch('/api/sessions')
        if (listResp.ok) {
          const listData = (await listResp.json()) as {
            sessions?: Array<Record<string, unknown>>
          }
          const existing = (listData.sessions ?? []).find(
            (session) =>
              typeof session.label === 'string' && session.label === label,
          )
          const existingKey =
            existing && typeof existing.key === 'string'
              ? existing.key.trim()
              : ''
          if (existingKey) {
            transientSessionMapRef.current[member.id] = existingKey
            const owner = await resolveAuthoritativeCardOwner(existingKey)
            if (owner) persistCardOwner(member.id, owner, model)
            setAgentStatus(member.id, {
              status: 'dispatching',
              lastSeen: Date.now(),
              lastMessage: 'Reusing existing session',
            })
            attachSessionStream(member.id, existingKey)
            emitFeedEvent({
              type: 'agent_spawned',
              message: `reusing session for ${member.name}`,
              agentName: member.name,
            })
            return existingKey
          }
        }
      }

      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          friendlyId,
          label,
          ...(model ? { model } : {}),
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as Record<
        string,
        unknown
      >
      const sessionKey = readString(payload.sessionKey)
      if (!response.ok || !sessionKey) {
        const errorMessage =
          readString(payload.error) ||
          readString(payload.message) ||
          `Spawn failed: HTTP ${response.status}`
        setAgentStatus(member.id, {
          status: 'error',
          lastSeen: Date.now(),
          lastMessage: errorMessage,
        })
        emitFeedEvent({
          type: 'system',
          message: `Failed to create session for ${member.name}: ${errorMessage}`,
          agentName: member.name,
        })
        throw new Error(errorMessage)
      }

      transientSessionMapRef.current[member.id] = sessionKey
      setAgentCardStatus((previous) => ({
        ...previous,
        [member.id]: {
          status: 'dispatching',
          lastSeen: Date.now(),
          lastMessage: 'Session created',
        },
      }))
      emitFeedEvent({
        type: 'agent_spawned',
        message: `spawned ${member.name}`,
        agentName: member.name,
      })

      attachSessionStream(member.id, sessionKey)
      const owner = await resolveAuthoritativeCardOwner(sessionKey)
      if (owner) persistCardOwner(member.id, owner, model)
      return sessionKey
    },
    [
      attachSessionStream,
      persistCardOwner,
      setAgentCardOwner,
      setAgentCardStatus,
      setAgentStatus,
    ],
  )

  const dispatchAgentTasks = useCallback(
    async (params: {
      sessionKey: string
      agentId: string
      agentTasks: Array<HubTask>
      messageText: string
      member?: TeamMember
    }) => {
      const { sessionKey, agentId, agentTasks, messageText, member } = params
      const model = member ? resolveGatewayModelId(member.modelId) : ''

      const response = await fetch('/api/agent-dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionKey,
          message: messageText,
          missionId: missionRef.current?.id,
          agentId,
          ...(model ? { model } : {}),
          idempotencyKey: createId('dispatch'),
        }),
      })

      const payload = (await response
        .json()
        .catch(() => ({}))) as DispatchResponse
      if (!response.ok || payload.ok === false) {
        const errorMessage =
          payload.error || payload.message || `HTTP ${response.status}`
        setAgentStatus(agentId, {
          status: 'error',
          lastSeen: Date.now(),
          lastMessage: errorMessage,
        })
        emitFeedEvent({
          type: 'system',
          message: `Failed to dispatch to ${member?.name || agentId}: ${errorMessage}`,
          agentName: member?.name,
        })
        throw new Error(errorMessage)
      }

      const taskIds = agentTasks.map((task) => task.id)
      setDispatchedTaskIdsByAgent((previous) => ({
        ...previous,
        [agentId]: taskIds,
      }))
      setMissionTasks((previous) =>
        previous.map((task) =>
          taskIds.includes(task.id) && task.status !== 'in_progress'
            ? { ...task, status: 'in_progress', updatedAt: Date.now() }
            : task,
        ),
      )
      setAgentStatus(agentId, {
        status: 'active',
        lastSeen: Date.now(),
      })

      agentTasks.forEach((task) => {
        emitFeedEvent({
          type: 'agent_active',
          message: `${member?.name || agentId} started working on: ${task.title}`,
          agentName: member?.name,
          taskTitle: task.title,
        })
      })
    },
    [setAgentStatus, setDispatchedTaskIdsByAgent, setMissionTasks],
  )

  const ensureAgentSessions = useCallback(
    async (team: Array<TeamMember>) => {
      const currentMap = { ...transientSessionMapRef.current }
      for (const member of team) {
        const existingSessionKey = currentMap[member.id]
        if (existingSessionKey) {
          setAgentStatus(member.id, {
            status: 'dispatching',
            lastSeen: Date.now(),
            lastMessage: 'Preparing existing session',
          })
          attachSessionStream(member.id, existingSessionKey)
          continue
        }
        try {
          currentMap[member.id] = await spawnAgentSession(member)
        } catch {
          /* per-agent spawn failures are surfaced through feed events and status state */
        }
      }
      return currentMap
    },
    [attachSessionStream, setAgentStatus, spawnAgentSession],
  )

  const reconnectMission = useCallback(
    async (mission: ActiveMission) => {
      missionRef.current = mission
      transientSessionMapRef.current = {}
      completedSessionKeysRef.current = new Set()

      await Promise.all(
        mission.team.map(async (member) => {
          const cardId = mission.agentCardIdMap[member.id]
          if (!cardId) return
          const owner = await resolveAuthoritativeCardOwner(cardId)
          if (!owner || owner.cardId !== cardId) {
            setAgentCardOwner(member.id, null)
            setAgentStatus(member.id, {
              status: 'stopped',
              lastSeen: Date.now(),
              lastMessage: 'Stored Card owner is no longer available',
            })
            return
          }

          const sessionKey = owner.canonicalSegmentKey
          transientSessionMapRef.current[member.id] = sessionKey
          persistCardOwner(
            member.id,
            owner,
            mission.agentCardModelMap[member.id] ||
              resolveGatewayModelId(member.modelId),
          )
          setAgentStatus(member.id, {
            status: mission.state === 'paused' ? 'idle' : 'dispatching',
            lastSeen: Date.now(),
            lastMessage:
              mission.state === 'paused'
                ? 'Mission restored (paused)'
                : 'Reconnecting Card',
          })
          attachSessionStream(member.id, sessionKey)
        }),
      )
    },
    [attachSessionStream, persistCardOwner, setAgentCardOwner, setAgentStatus],
  )

  const dispatchMission = useCallback(
    async (mission: ActiveMission) => {
      dispatchTokenRef.current = mission.id
      missionRef.current = mission
      completedSessionKeysRef.current = new Set()
      retryPayloadRef.current = {}
      lastOutputByAgentRef.current = {}
      setIsDispatching(true)

      emitFeedEvent({
        type: 'mission_started',
        message: `Mission started: ${mission.goal}`,
      })
      emitFeedEvent({
        type: 'system',
        message: `Dispatching ${mission.team.length} agent session${mission.team.length === 1 ? '' : 's'}`,
      })

      try {
        const sessionMap = await ensureAgentSessions(mission.team)
        if (dispatchTokenRef.current !== mission.id) return

        const tasksByAgent = new Map<string, Array<HubTask>>()
        mission.tasks.forEach((task) => {
          if (!task.agentId) return
          const existing = tasksByAgent.get(task.agentId) ?? []
          existing.push(task)
          tasksByAgent.set(task.agentId, existing)
        })

        if (mission.processType === 'hierarchical') {
          const leadMember = mission.team.at(0)
          const workerMembers = mission.team.slice(1)
          if (leadMember) {
            const leadSessionKey = sessionMap[leadMember.id]
            if (!leadSessionKey) {
              emitFeedEvent({
                type: 'system',
                message: `Skipping ${leadMember.name}: no session available`,
                agentName: leadMember.name,
              })
              return
            }
            const leadTasks = tasksByAgent.get(leadMember.id) ?? [
              {
                id: createId('lead-task'),
                title: `Lead: ${mission.goal}`,
                description: '',
                priority: 'high',
                status: 'assigned',
                agentId: leadMember.id,
                missionId: mission.id,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ]
            const leadMessage = buildDispatchMessage({
              agentId: leadMember.id,
              agentTasks: leadTasks,
              member: leadMember,
              missionGoal: mission.goal,
              mode: mission.processType,
              leadMember,
              workerMembers,
            })
            retryPayloadRef.current[leadMember.id] = {
              tasks: leadTasks.map((task) => ({ ...task })),
              messageText: leadMessage,
            }
            setAgentStatus(leadMember.id, {
              status: 'dispatching',
              lastSeen: Date.now(),
              lastMessage: 'Sending assignment',
            })
            emitFeedEvent({
              type: 'system',
              message: `Dispatching ${leadMember.name}: sending assignment`,
              agentName: leadMember.name,
            })
            try {
              await dispatchAgentTasks({
                sessionKey: leadSessionKey,
                agentId: leadMember.id,
                agentTasks: leadTasks,
                messageText: leadMessage,
                member: leadMember,
              })
            } catch {
              /* feed event + agent status already capture the failure */
            }
          }

          for (const worker of workerMembers) {
            const workerTasks = tasksByAgent.get(worker.id) ?? []
            if (workerTasks.length === 0) continue
            const workerSessionKey = sessionMap[worker.id]
            if (!workerSessionKey) {
              emitFeedEvent({
                type: 'system',
                message: `Skipping ${worker.name}: no session available`,
                agentName: worker.name,
              })
              continue
            }
            const workerMessage = buildDispatchMessage({
              agentId: worker.id,
              agentTasks: workerTasks,
              member: worker,
              missionGoal: mission.goal,
              mode: mission.processType,
              leadMember: mission.team[0],
            })
            retryPayloadRef.current[worker.id] = {
              tasks: workerTasks.map((task) => ({ ...task })),
              messageText: workerMessage,
            }
            setAgentStatus(worker.id, {
              status: 'dispatching',
              lastSeen: Date.now(),
              lastMessage: 'Sending assignment',
            })
            emitFeedEvent({
              type: 'system',
              message: `Dispatching ${worker.name}: sending assignment`,
              agentName: worker.name,
            })
            try {
              await dispatchAgentTasks({
                sessionKey: workerSessionKey,
                agentId: worker.id,
                agentTasks: workerTasks,
                messageText: workerMessage,
                member: worker,
              })
            } catch {
              /* feed event + agent status already capture the failure */
            }
          }
          return
        }

        const entries = Array.from(tasksByAgent.entries())
        for (const [index, [agentId, agentTasks]] of entries.entries()) {
          const member = mission.team.find((entry) => entry.id === agentId)
          const sessionKey = sessionMap[agentId]
          if (!sessionKey) {
            emitFeedEvent({
              type: 'system',
              message: `Skipping ${member?.name || agentId}: no session available`,
              agentName: member?.name,
            })
            continue
          }
          const messageText = buildDispatchMessage({
            agentId,
            agentTasks,
            member,
            missionGoal: mission.goal,
            mode: mission.processType,
          })
          retryPayloadRef.current[agentId] = {
            tasks: agentTasks.map((task) => ({ ...task })),
            messageText,
          }
          setAgentStatus(agentId, {
            status: 'dispatching',
            lastSeen: Date.now(),
            lastMessage: 'Sending assignment',
          })
          emitFeedEvent({
            type: 'system',
            message: `Dispatching ${member?.name || agentId}: sending assignment`,
            agentName: member?.name,
          })
          try {
            await dispatchAgentTasks({
              sessionKey,
              agentId,
              agentTasks,
              messageText,
              member,
            })
          } catch {
            /* feed event + agent status already capture the failure */
          }

          if (
            mission.processType === 'sequential' &&
            index < entries.length - 1
          ) {
            await new Promise<void>((resolve) =>
              window.setTimeout(resolve, 30_000),
            )
          }
        }
      } finally {
        if (dispatchTokenRef.current === mission.id) {
          setIsDispatching(false)
        }
      }
    },
    [dispatchAgentTasks, ensureAgentSessions, setAgentStatus],
  )

  const retryAgent = useCallback(
    async (agentId: string) => {
      const mission = missionRef.current
      if (!mission) return

      const member = mission.team.find((entry) => entry.id === agentId)
      const payload = retryPayloadRef.current[agentId]
      if (!member || !payload) return

      const currentSessionKey = transientSessionMapRef.current[agentId]
      if (currentSessionKey) {
        const existingStream = streamMapRef.current.get(currentSessionKey)
        if (existingStream) {
          existingStream.close()
          streamMapRef.current.delete(currentSessionKey)
        }
        completedSessionKeysRef.current.delete(currentSessionKey)
        try {
          await killAgentSession(currentSessionKey)
        } catch {
          /* ignore stale session kill failures before retry */
        }
      }

      setAgentStatus(agentId, {
        status: 'active',
        lastSeen: Date.now(),
        lastMessage: 'Retrying agent',
      })

      const newSessionKey = await spawnAgentSession(member, {
        reuseExisting: false,
        labelSuffix: 'retry',
      })

      await dispatchAgentTasks({
        sessionKey: newSessionKey,
        agentId,
        agentTasks: payload.tasks,
        messageText: payload.messageText,
        member,
      })
    },
    [dispatchAgentTasks, setAgentStatus, spawnAgentSession],
  )

  const handleSetAgentPaused = useCallback(
    async (agentId: string, pause: boolean) => {
      const sessionKey = transientSessionMapRef.current[agentId]
      if (!sessionKey) {
        throw new Error('No active session to control')
      }

      const member = missionRef.current?.team.find(
        (entry) => entry.id === agentId,
      )
      const agentName = member?.name ?? agentId
      const previousStatus = getOptionalRecordValue(
        useMissionStore.getState().agentCardStatus,
        agentId,
      )

      setAgentStatus(agentId, {
        status: pause ? 'idle' : 'active',
        lastSeen: Date.now(),
        lastMessage: pause ? 'Paused' : 'Resumed',
      })

      try {
        await toggleAgentPause(sessionKey, pause)
        emitFeedEvent({
          type: pause ? 'agent_paused' : 'agent_active',
          message: `${agentName} ${pause ? 'paused' : 'resumed'}`,
          agentName,
        })
      } catch (error) {
        if (previousStatus) {
          setAgentStatus(agentId, previousStatus)
        } else {
          setAgentCardStatus((previous) => {
            const next = { ...previous }
            delete next[agentId]
            return next
          })
        }
        throw error
      }
    },
    [setAgentCardStatus, setAgentStatus],
  )

  const handleMissionPause = useCallback(
    async (pause: boolean) => {
      const mission = missionRef.current
      if (!mission) return

      const previousState = useMissionStore.getState().missionState
      const activeAgentIds = mission.team
        .map((member) => member.id)
        .filter((agentId) => Boolean(transientSessionMapRef.current[agentId]))

      try {
        const results = await Promise.allSettled(
          activeAgentIds.map((agentId) => handleSetAgentPaused(agentId, pause)),
        )
        const failed = results.some((result) => result.status === 'rejected')
        setMissionState(failed ? previousState : pause ? 'paused' : 'running')
      } catch {
        setMissionState(previousState)
      }
    },
    [handleSetAgentPaused, setMissionState],
  )

  const handleKillAgent = useCallback(
    async (agentId: string) => {
      const sessionKey = transientSessionMapRef.current[agentId]
      if (!sessionKey) return

      const existingStream = streamMapRef.current.get(sessionKey)
      if (existingStream) {
        existingStream.close()
        streamMapRef.current.delete(sessionKey)
      }

      completedSessionKeysRef.current.delete(sessionKey)

      const member = missionRef.current?.team.find(
        (entry) => entry.id === agentId,
      )
      const agentName = member?.name ?? agentId

      try {
        await killAgentSession(sessionKey)
      } finally {
        transientSessionMapRef.current = Object.fromEntries(
          Object.entries(transientSessionMapRef.current).filter(
            ([key]) => key !== agentId,
          ),
        )
        setAgentCardOwner(agentId, null)
        setAgentCardStatus((previous) => ({
          ...previous,
          [agentId]: {
            status: 'error',
            lastSeen: Date.now(),
            lastMessage: 'Agent stopped',
          },
        }))
        emitFeedEvent({
          type: 'agent_killed',
          message: `${agentName} session killed`,
          agentName,
        })
      }
    },
    [setAgentCardOwner, setAgentCardStatus],
  )

  const handleSteerAgent = useCallback(
    async (agentId: string, message: string) => {
      const sessionKey = transientSessionMapRef.current[agentId]
      if (!sessionKey) {
        throw new Error('No active session to steer')
      }

      const directive = message.trim()
      if (!directive) return

      const response = await fetch('/api/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey, message: directive }),
      })
      const payload = (await response
        .json()
        .catch(() => ({}))) as DispatchResponse

      if (!response.ok || payload.ok === false) {
        throw new Error(
          payload.error || payload.message || `HTTP ${response.status}`,
        )
      }

      const member = missionRef.current?.team.find(
        (entry) => entry.id === agentId,
      )
      const agentName = member?.name ?? agentId

      completedSessionKeysRef.current.delete(sessionKey)
      setAgentCardStatus((previous) => ({
        ...previous,
        [agentId]: {
          status: 'active',
          lastSeen: Date.now(),
          lastMessage: directive,
        },
      }))
      emitFeedEvent({
        type: 'agent_active',
        message: `Sent message to ${agentName}: "${directive.slice(0, 80)}${directive.length > 80 ? '…' : ''}"`,
        agentName,
      })
    },
    [setAgentCardStatus],
  )

  const abortMission = useCallback(async () => {
    const sessionKeys = Object.values(transientSessionMapRef.current).filter(
      Boolean,
    )
    closeAllStreams()

    await Promise.allSettled(
      sessionKeys.map((sessionKey) => killAgentSession(sessionKey)),
    )

    setIsDispatching(false)
    emitFeedEvent({
      type: 'system',
      message: 'Mission aborted',
    })
    abortMissionInStore()
  }, [abortMissionInStore, closeAllStreams])

  useEffect(() => {
    const hasSessions = Object.keys(agentCardIdMap).length > 0
    if (!activeMission || missionState !== 'running' || !hasSessions) return

    const controller = new AbortController()

    const pollSessions = async () => {
      try {
        const response = await fetch('/api/sessions', {
          signal: controller.signal,
        })
        if (!response.ok || controller.signal.aborted) return

        const payload = (await response.json().catch(() => ({}))) as {
          sessions?: Array<SessionRecord>
        }
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
        const nextStatus: Record<string, AgentSessionStatusEntry> = {}
        const nextActivityMarkers = new Map<string, string>()
        const now = Date.now()

        for (const member of activeMission.team) {
          const sessionKey = transientSessionMapRef.current[member.id]
          if (!sessionKey) continue

          const session = sessions.find(
            (entry) => readSessionId(entry) === sessionKey,
          )
          if (!session) {
            nextStatus[member.id] = {
              status: 'stopped',
              lastSeen: now,
              lastMessage: 'Session not present in gateway roster',
            }
            continue
          }

          const rawUpdatedAt = session.updatedAt
          const updatedAt =
            typeof rawUpdatedAt === 'number'
              ? rawUpdatedAt
              : typeof rawUpdatedAt === 'string'
                ? Date.parse(rawUpdatedAt)
                : 0
          const lastSeen =
            Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now
          const lastMessage = readSessionLastMessage(session)
          const rawStatus = readString(session.status).toLowerCase()
          const existing = getOptionalRecordValue(
            useMissionStore.getState().agentCardStatus,
            member.id,
          )
          const isCompleted = completedSessionKeysRef.current.has(sessionKey)
          const activityMarker = `${String(session.updatedAt ?? '')}|${rawStatus}|${lastMessage}`

          nextActivityMarkers.set(sessionKey, activityMarker)

          if (isCompleted && existing?.status === 'idle') {
            nextStatus[member.id] = existing
            continue
          }
          if (existing?.status === 'waiting_for_input') {
            nextStatus[member.id] = existing
            continue
          }
          if (existing?.status === 'dispatching' && !lastMessage) {
            nextStatus[member.id] = existing
            continue
          }
          if (rawStatus === 'error') {
            nextStatus[member.id] = {
              status: 'error',
              lastSeen,
              ...(lastMessage ? { lastMessage } : {}),
            }
            continue
          }

          const ageMs = now - lastSeen
          const nextMemberStatus = {
            status:
              ageMs < 30_000 ? 'active' : ageMs < 300_000 ? 'idle' : 'stopped',
            lastSeen,
            ...(lastMessage ? { lastMessage } : {}),
          } as const
          nextStatus[member.id] = nextMemberStatus

          const sessionName = readSessionName(session)
          if (lastMessage && nextMemberStatus.status === 'active') {
            lastOutputByAgentRef.current[member.id] = lastMessage
            if (
              sessionName &&
              activityMarkerRef.current.get(sessionKey) !== activityMarker
            ) {
              emitFeedEvent({
                type: 'agent_active',
                message: `${sessionName} update: ${lastMessage.slice(0, 80)}`,
                agentName: member.name,
              })
            }
          }
        }

        activityMarkerRef.current = nextActivityMarkers
        setAgentCardStatus(nextStatus)
      } catch {
        /* ignore polling errors */
      }
    }

    void pollSessions()
    const intervalId = window.setInterval(() => {
      void pollSessions()
    }, 5_000)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [activeMission, agentCardIdMap, missionState, setAgentCardStatus])

  useEffect(() => {
    if (missionState === 'running' || missionState === 'paused') return
    resetOrchestratorState()
  }, [missionState, resetOrchestratorState])

  useEffect(
    () => () => {
      resetOrchestratorState()
    },
    [resetOrchestratorState],
  )

  return {
    dispatchMission,
    reconnectMission,
    agentCardStatus,
    isDispatching,
    retryAgent,
    handleKillAgent,
    handleMissionPause,
    handleSteerAgent,
    abortMission,
    resetOrchestratorState,
  }
}
