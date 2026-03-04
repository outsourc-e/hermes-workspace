type MissionEventBase<TType extends string, TPayload> = {
  id: string
  type: TType
  timestamp: number
  payload: TPayload
}

export type AgentSpawnedEvent = MissionEventBase<
  'agent.spawned',
  {
    agentId: string
    sessionKey: string
    model: string
  }
>

export type AgentStartedEvent = MissionEventBase<
  'agent.started',
  {
    agentId: string
    firstChunk: string
  }
>

export type AgentThinkingEvent = MissionEventBase<
  'agent.thinking',
  {
    agentId: string
  }
>

export type AgentOutputEvent = MissionEventBase<
  'agent.output',
  {
    agentId: string
    text: string
    isStreaming: boolean
  }
>

export type AgentCompletedEvent = MissionEventBase<
  'agent.completed',
  {
    agentId: string
    finalOutput: string
    tokenCount: number
  }
>

export type AgentFailedEvent = MissionEventBase<
  'agent.failed',
  {
    agentId: string
    error: string
    willRetry: boolean
  }
>

export type AgentRetryingEvent = MissionEventBase<
  'agent.retrying',
  {
    agentId: string
    retryCount: number
    newSessionKey: string
  }
>

export type MissionStartedEvent = MissionEventBase<
  'mission.started',
  {
    missionId: string
    goal: string
    team: string[]
  }
>

export type MissionCompletedEvent = MissionEventBase<
  'mission.completed',
  {
    missionId: string
    report: string
  }
>

export type MissionAbortedEvent = MissionEventBase<
  'mission.aborted',
  {
    missionId: string
    reason: string
  }
>

export type TaskAssignedEvent = MissionEventBase<
  'task.assigned',
  {
    taskId: string
    agentId: string
  }
>

export type TaskCompletedEvent = MissionEventBase<
  'task.completed',
  {
    taskId: string
    result: string
  }
>

export type TaskFailedEvent = MissionEventBase<
  'task.failed',
  {
    taskId: string
    error: string
  }
>

export type MissionEvent =
  | AgentSpawnedEvent
  | AgentStartedEvent
  | AgentThinkingEvent
  | AgentOutputEvent
  | AgentCompletedEvent
  | AgentFailedEvent
  | AgentRetryingEvent
  | MissionStartedEvent
  | MissionCompletedEvent
  | MissionAbortedEvent
  | TaskAssignedEvent
  | TaskCompletedEvent
  | TaskFailedEvent

export type MissionEventType = MissionEvent['type']

export type MissionEventInput = Omit<MissionEvent, 'id' | 'timestamp'> &
  Partial<Pick<MissionEvent, 'id' | 'timestamp'>>

export type MissionEventFilter = {
  type?: MissionEventType | MissionEventType[]
  agentId?: string
  fromTimestamp?: number
  toTimestamp?: number
}

function createEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeEvent(event: MissionEventInput): MissionEvent {
  return {
    ...event,
    id: event.id ?? createEventId(),
    timestamp: event.timestamp ?? Date.now(),
  } as MissionEvent
}

function hasAgentId(event: MissionEvent): event is Extract<
  MissionEvent,
  { payload: { agentId: string } }
> {
  return 'agentId' in event.payload
}

function matchesFilter(event: MissionEvent, filter?: MissionEventFilter): boolean {
  if (!filter) return true

  if (filter.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type]
    if (!types.includes(event.type)) return false
  }

  if (filter.agentId) {
    if (!hasAgentId(event) || event.payload.agentId !== filter.agentId) return false
  }

  if (typeof filter.fromTimestamp === 'number' && event.timestamp < filter.fromTimestamp) {
    return false
  }

  if (typeof filter.toTimestamp === 'number' && event.timestamp > filter.toTimestamp) {
    return false
  }

  return true
}

export class MissionEventLog {
  private events: MissionEvent[]

  constructor(initialEvents: MissionEventInput[] = []) {
    this.events = initialEvents.map(normalizeEvent)
  }

  addEvent(event: MissionEventInput): MissionEvent {
    const nextEvent = normalizeEvent(event)
    this.events.push(nextEvent)
    return nextEvent
  }

  getEvents(filter?: MissionEventFilter): MissionEvent[] {
    return this.events.filter((event) => matchesFilter(event, filter))
  }

  getAgentTimeline(agentId: string): MissionEvent[] {
    return this.getEvents({ agentId })
  }

  clear(): void {
    this.events = []
  }

  toJSON(): { events: MissionEvent[] } {
    return {
      events: [...this.events],
    }
  }
}

