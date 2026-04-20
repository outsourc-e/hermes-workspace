export type FeedEventType =
  | 'mission_started'
  | 'task_created' | 'task_moved' | 'task_completed' | 'task_assigned'
  | 'agent_active' | 'agent_idle' | 'agent_paused' | 'agent_spawned' | 'agent_killed'
  | 'gateway_health' | 'system'

export type FeedEvent = {
  id: string
  type: FeedEventType
  message: string
  agentName?: string
  taskTitle?: string
  timestamp: number
}

type Listener = (event: FeedEvent) => void
const listeners = new Set<Listener>()

export function emitFeedEvent(event: Omit<FeedEvent, 'id' | 'timestamp'> & Partial<Pick<FeedEvent, 'id' | 'timestamp'>>) {
  const payload: FeedEvent = { id: event.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: event.timestamp ?? Date.now(), ...event }
  listeners.forEach((listener) => listener(payload))
}

export function onFeedEvent(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
