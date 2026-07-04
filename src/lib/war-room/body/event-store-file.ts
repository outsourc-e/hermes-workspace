import fs from 'node:fs'
import path from 'node:path'
import { createMemoryWarRoomEventStore } from './event-store-memory'
import type { WarRoomEventDraft, WarRoomEventStore } from './domain'

export type FileWarRoomEventStoreOptions = {
  filePath?: string
}

export function createFileWarRoomEventStore(options: FileWarRoomEventStoreOptions = {}): WarRoomEventStore {
  const memory = createMemoryWarRoomEventStore()
  const filePath = options.filePath ?? process.env.WAR_ROOM_EVENT_STORE_FILE ?? path.join(process.cwd(), '.war-room', 'body-events.jsonl')
  let warning: string | undefined

  function persist(event: ReturnType<WarRoomEventStore['appendEvent']>) {
    if (warning) return
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, 'utf8')
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    appendEvent(event: WarRoomEventDraft) {
      const complete = memory.appendEvent(event)
      persist(complete)
      return complete
    },
    listEvents: () => memory.listEvents(),
    listEventsByAgent: (agentId) => memory.listEventsByAgent(agentId),
    listEventsByTask: (taskId) => memory.listEventsByTask(taskId),
    resetForDev() {
      memory.resetForDev()
      if (process.env.NODE_ENV === 'production') {
        throw new Error('War Room Event Store reset is disabled in production.')
      }
      try {
        fs.rmSync(filePath, { force: true })
        warning = undefined
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error)
      }
    },
    getInfo() {
      return { mode: warning ? 'memory' as const : 'file' as const, path: filePath, warning }
    },
  }
}
