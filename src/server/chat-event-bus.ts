import { hasActiveSendRun } from './send-run-tracker'

export interface ChatSSEEvent {
  event: string
  data: Record<string, unknown>
}

type ChatSSESubscriber = (event: ChatSSEEvent) => void

// ─── Singleton state (survives Vite HMR via globalThis) ─────────────────

const BUS_KEY = '__claude_chat_event_bus__' as const

interface BusState {
  subscribers: Set<ChatSSESubscriber>
  started: boolean
}

function getBus(): BusState {
  if (!(globalThis as any)[BUS_KEY]) {
    ;(globalThis as any)[BUS_KEY] = {
      subscribers: new Set<ChatSSESubscriber>(),
      started: false,
    }
  }
  return (globalThis as any)[BUS_KEY]
}

function broadcast(event: string, data: Record<string, unknown>): void {
  const bus = getBus()
  const evt: ChatSSEEvent = { event, data }
  for (const sub of bus.subscribers) {
    try {
      sub(evt)
    } catch {
      // subscriber error — don't crash the bus
    }
  }
}

function getEventRunId(data: Record<string, unknown>): string | undefined {
  return typeof data.runId === 'string'
    ? data.runId
    : typeof data.run_id === 'string'
      ? data.run_id
      : undefined
}

export function publishChatEvent(
  event: string,
  data: Record<string, unknown>,
): void {
  const runId = getEventRunId(data)
  if (hasActiveSendRun(runId)) return
  broadcast(event, data)
}

export async function ensureBusStarted(): Promise<void> {
  const bus = getBus()
  if (bus.started) return
  bus.started = true
}

export function subscribeToChatEvents(
  subscriber: ChatSSESubscriber,
  sessionKeyFilter?: string,
): () => void {
  const bus = getBus()

  // Wrap subscriber with session key filter if provided
  const wrappedSubscriber: ChatSSESubscriber = sessionKeyFilter
    ? (event) => {
        const eventSessionKey = event.data.sessionKey as string | undefined
        if (eventSessionKey && eventSessionKey !== sessionKeyFilter) return
        const runId = getEventRunId(event.data)
        if (hasActiveSendRun(runId)) return
        subscriber(event)
      }
    : (event) => {
        const runId = getEventRunId(event.data)
        if (hasActiveSendRun(runId)) return
        subscriber(event)
      }

  bus.subscribers.add(wrappedSubscriber)
  return () => {
    bus.subscribers.delete(wrappedSubscriber)
  }
}
