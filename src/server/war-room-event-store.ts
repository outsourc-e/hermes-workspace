import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WarRoomEvent, WarRoomEventCreateInput, WarRoomEventListOptions, WarRoomEventListResponse, WarRoomRoomId, WarRoomRoomSnapshot } from './war-room-event-types'

const MAX_EVENT_LINES = 2_000
const DEFAULT_EVENT_LIMIT = 80
const MAX_EVENT_LIMIT = 300

export const WAR_ROOM_EVENT_DATA_DIR = join(process.cwd(), 'data', 'war-room')
export const WAR_ROOM_EVENTS_JSONL_PATH = join(WAR_ROOM_EVENT_DATA_DIR, 'events.jsonl')

function ensureEventStoreDir() {
  mkdirSync(dirname(WAR_ROOM_EVENTS_JSONL_PATH), { recursive: true })
}

function safeEventId(input: WarRoomEventCreateInput, timestamp: number): string {
  const source = input.source.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const room = input.roomId.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const type = input.eventType.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  return `${timestamp}-${source}-${room}-${type}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeCreateInput(input: WarRoomEventCreateInput): WarRoomEvent {
  const timestamp = Date.now()
  return {
    id: safeEventId(input, timestamp),
    timestamp,
    source: input.source,
    sourceRef: input.sourceRef ?? null,
    roomId: input.roomId,
    agentId: input.agentId ?? null,
    eventType: input.eventType,
    title: input.title.trim().slice(0, 160),
    summary: input.summary.trim().slice(0, 800),
    state: input.state ?? 'info',
    riskLevel: input.riskLevel ?? 'none',
    payload: input.payload ?? {},
  }
}

function readJsonlEvents(): Array<WarRoomEvent> {
  if (!existsSync(WAR_ROOM_EVENTS_JSONL_PATH)) return []
  const raw = readFileSync(WAR_ROOM_EVENTS_JSONL_PATH, 'utf8').trim()
  if (!raw) return []
  return raw
    .split('\n')
    .slice(-MAX_EVENT_LINES)
    .map((line) => {
      try {
        return JSON.parse(line) as WarRoomEvent
      } catch {
        return null
      }
    })
    .filter((event): event is WarRoomEvent => Boolean(event?.id && event.timestamp && event.roomId))
}

export function appendWarRoomEvent(input: WarRoomEventCreateInput): WarRoomEvent {
  ensureEventStoreDir()
  const event = normalizeCreateInput(input)
  appendFileSync(WAR_ROOM_EVENTS_JSONL_PATH, `${JSON.stringify(event)}\n`, 'utf8')
  return event
}

function eventMatchesOptions(event: WarRoomEvent, options: WarRoomEventListOptions): boolean {
  if (options.roomId && event.roomId !== options.roomId) return false
  if (options.agentId && event.agentId !== options.agentId) return false
  if (options.source && event.source !== options.source) return false
  if (options.eventType && event.eventType !== options.eventType) return false
  if (options.since && event.timestamp < options.since) return false
  return true
}

function snapshotState(events: Array<WarRoomEvent>): Array<WarRoomRoomSnapshot> {
  const byRoom = new Map<WarRoomRoomId, Array<WarRoomEvent>>()
  for (const event of events) {
    const roomEvents = byRoom.get(event.roomId) ?? []
    roomEvents.push(event)
    byRoom.set(event.roomId, roomEvents)
  }

  return [...byRoom.entries()].map(([roomId, roomEvents]) => {
    const latest = [...roomEvents].sort((a, b) => b.timestamp - a.timestamp)[0]
    const activeAgents = new Set(roomEvents.filter((event) => event.agentId && ['running', 'review'].includes(event.state)).map((event) => event.agentId as string))
    const pendingActionCount = roomEvents.filter((event) => ['queued', 'review'].includes(event.state)).length
    const blockedCount = roomEvents.filter((event) => event.state === 'blocked' || event.riskLevel === 'blocked').length

    return {
      roomId,
      updatedAt: latest?.timestamp ?? Date.now(),
      status: latest?.state ?? 'info',
      activeAgentCount: activeAgents.size,
      pendingActionCount,
      blockedCount,
      lastSignal: latest?.title ?? 'No events yet',
      snapshot: {
        eventCount: roomEvents.length,
        latestEventId: latest?.id ?? null,
        latestSource: latest?.source ?? null,
        latestEventType: latest?.eventType ?? null,
      },
    }
  })
}

export function listWarRoomEvents(options: WarRoomEventListOptions = {}): WarRoomEventListResponse {
  const limit = Math.max(1, Math.min(MAX_EVENT_LIMIT, Number(options.limit ?? DEFAULT_EVENT_LIMIT)))
  const allEvents = readJsonlEvents()
  const filtered = allEvents
    .filter((event) => eventMatchesOptions(event, options))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)

  return {
    ok: true,
    mode: 'local-jsonl',
    readOnly: true,
    fetchedAt: Date.now(),
    storagePath: WAR_ROOM_EVENTS_JSONL_PATH,
    count: filtered.length,
    events: filtered,
    roomSnapshots: snapshotState(allEvents),
  }
}

export function seedWarRoomEventStoreIfEmpty(): Array<WarRoomEvent> {
  if (readJsonlEvents().length > 0) return []

  return [
    appendWarRoomEvent({
      source: 'system',
      sourceRef: 'phase-c1-seed',
      roomId: 'olympus',
      agentId: 'hermes',
      eventType: 'plan_created',
      title: 'War Room local event store initialized',
      summary: 'Local JSONL event store created so Discord/Hermes/Codex actions can become visible in living cells before any cloud DB is selected.',
      state: 'completed',
      riskLevel: 'none',
      payload: { adapter: 'local-jsonl', cloudAdapter: 'supabase-later', firestore: 'not-selected' },
    }),
    appendWarRoomEvent({
      source: 'hermes',
      sourceRef: 'dlv-correction-living-cells',
      roomId: 'council',
      agentId: 'hermes',
      eventType: 'message',
      title: 'DLV corrected War Room direction to living cells',
      summary: 'Main screen should be living cells with gods/agents working; click opens full-screen room cockpit; every relevant Discord/Hermes action must appear in the War Room.',
      state: 'review',
      riskLevel: 'low',
      payload: { approvedNext: 'DB/event contract first, no ComfyUI yet' },
    }),
  ]
}
