import { createFileWarRoomEventStore } from './event-store-file'
import { createMemoryWarRoomEventStore } from './event-store-memory'
import type { WarRoomAgentId, WarRoomEventDraft, WarRoomTaskId } from './domain'

const activeWarRoomEventStore = process.env.WAR_ROOM_EVENT_STORE === 'file'
  ? createFileWarRoomEventStore()
  : createMemoryWarRoomEventStore()

export function appendWarRoomEvent(event: WarRoomEventDraft) {
  return activeWarRoomEventStore.appendEvent(event)
}

export function listWarRoomEvents() {
  return activeWarRoomEventStore.listEvents()
}

export function listWarRoomEventsByAgent(agentId: WarRoomAgentId) {
  return activeWarRoomEventStore.listEventsByAgent(agentId)
}

export function listWarRoomEventsByTask(taskId: WarRoomTaskId) {
  return activeWarRoomEventStore.listEventsByTask(taskId)
}

export function resetWarRoomEventStoreForDev() {
  activeWarRoomEventStore.resetForDev()
}

export function getWarRoomEventStoreInfo() {
  return activeWarRoomEventStore.getInfo()
}
