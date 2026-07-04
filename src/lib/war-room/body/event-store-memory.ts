import type { WarRoomAgentId, WarRoomEvent, WarRoomEventDraft, WarRoomEventStore, WarRoomTaskId } from './domain'

export function createMemoryWarRoomEventStore(): WarRoomEventStore {
  let events: Array<WarRoomEvent> = []
  let eventCounter = 0

  function nextEventId() {
    eventCounter += 1
    return `war-room-event-${eventCounter}`
  }

  return {
    appendEvent(event: WarRoomEventDraft): WarRoomEvent {
      const complete: WarRoomEvent = {
        ...event,
        eventId: nextEventId(),
        createdAtMs: event.createdAtMs ?? Date.now(),
      }
      events = [...events, complete]
      return complete
    },
    listEvents() {
      return [...events]
    },
    listEventsByAgent(agentId: WarRoomAgentId) {
      return events.filter((event) => event.agentId === agentId)
    },
    listEventsByTask(taskId: WarRoomTaskId) {
      return events.filter((event) => event.taskId === taskId)
    },
    resetForDev() {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('War Room Event Store reset is disabled in production.')
      }
      events = []
      eventCounter = 0
    },
    getInfo() {
      return { mode: 'memory' as const }
    },
  }
}
