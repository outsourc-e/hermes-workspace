/**
 * Singleton event bus for chat SSE events.
 *
 * Architecture: ONE gateway listener → processes/deduplicates → broadcasts to N SSE clients.
 * Previously each SSE connection registered its own onGatewayEvent listener,
 * causing 1 gateway event × N listeners = N duplicate emissions.
 *
 * Now: 1 gateway event → 1 listener → 1 processed event → broadcast to N clients.
 */
import {
  onGatewayEvent,
  gatewayConnectCheck,
  hasActiveSendRun,
} from './gateway'
import type { GatewayFrame } from './gateway'

export interface ChatSSEEvent {
  event: string
  data: Record<string, unknown>
}

type ChatSSESubscriber = (event: ChatSSEEvent) => void

// ─── Singleton state (survives Vite HMR via globalThis) ─────────────────

const BUS_KEY = '__clawsuite_chat_event_bus__' as const

interface BusState {
  subscribers: Set<ChatSSESubscriber>
  cleanupListener: (() => void) | null
  started: boolean
  completedRunIds: Map<string, number> // runId → timestamp
  chunkSourceByRun: Map<string, 'agent' | 'chat'>
}

function getBus(): BusState {
  if (!(globalThis as any)[BUS_KEY]) {
    ;(globalThis as any)[BUS_KEY] = {
      subscribers: new Set<ChatSSESubscriber>(),
      cleanupListener: null,
      started: false,
      completedRunIds: new Map<string, number>(),
      chunkSourceByRun: new Map<string, 'agent' | 'chat'>(),
    }
  }
  return (globalThis as any)[BUS_KEY]
}

// ─── Helpers ────────────────────────────────────────────────────────────

function extractTextFromMessage(message: any): string {
  if (!message?.content) return ''
  if (Array.isArray(message.content)) {
    return message.content
      .filter((block: any) => block?.type === 'text' && block?.text)
      .map((block: any) => block.text)
      .join('')
  }
  if (typeof message.content === 'string') return message.content
  return ''
}

function isSystemMessage(text: string): boolean {
  return (
    text.includes('Pre-compaction memory flush') ||
    text.includes('Store durable memories now') ||
    text.includes('APPEND new content only and do not overwrite') ||
    text.startsWith('A subagent task') ||
    text.startsWith('[Queued announce messages') ||
    text.includes('Summarize this naturally for the user') ||
    (text.includes('Stats: runtime') && text.includes('sessionKey agent:'))
  )
}

function extractMessageText(rawPayload: any): string {
  const message = rawPayload?.message
  if (!message) return ''

  // Strategy 1: content array
  if (Array.isArray(message.content)) {
    const text = message.content
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text ?? '')
      .join('')
    if (text) return text
  }
  // Strategy 2: content string
  if (typeof message.content === 'string') return message.content
  // Strategy 3: top-level fields
  for (const key of ['text', 'body', 'message'] as const) {
    const val = (message as any)[key]
    if (typeof val === 'string' && val.trim().length > 0) return val.trim()
  }
  return ''
}

// ─── Run dedup ──────────────────────────────────────────────────────────

const COMPLETED_RUN_MAX = 200
const COMPLETED_RUN_EXPIRY = 120_000

function markRunCompleted(runId: string | undefined): boolean {
  if (!runId) return true // no runId = allow (can't dedup)
  const bus = getBus()
  if (bus.completedRunIds.has(runId)) return false // duplicate
  bus.completedRunIds.set(runId, Date.now())
  // Expire old entries
  if (bus.completedRunIds.size > COMPLETED_RUN_MAX) {
    const now = Date.now()
    for (const [id, ts] of bus.completedRunIds) {
      if (now - ts > COMPLETED_RUN_EXPIRY) bus.completedRunIds.delete(id)
    }
  }
  return true
}

function claimChunkSource(runId: unknown, source: 'agent' | 'chat'): boolean {
  if (typeof runId !== 'string' || runId.length === 0) return true
  const bus = getBus()
  const existing = bus.chunkSourceByRun.get(runId)
  if (existing && existing !== source) return false
  bus.chunkSourceByRun.set(runId, source)
  return true
}

function clearChunkSource(runId: unknown): void {
  if (typeof runId !== 'string' || runId.length === 0) return
  getBus().chunkSourceByRun.delete(runId)
}

// ─── Broadcast ──────────────────────────────────────────────────────────

function broadcast(event: string, data: Record<string, unknown>): void {
  const bus = getBus()
  const subscriberCount = bus.subscribers.size
  if (event === 'done' || event === 'chunk' || event === 'message' || event === 'user_message') {
    console.log(`[chat-bus] broadcast: event=${event} runId=${data.runId ?? 'none'} subscribers=${subscriberCount} sessionKey=${data.sessionKey}`)
  }
  const evt: ChatSSEEvent = { event, data }
  for (const sub of bus.subscribers) {
    try {
      sub(evt)
    } catch {
      // subscriber error — don't crash the bus
    }
  }
}

// ─── Gateway listener (singleton) ───────────────────────────────────────

function processGatewayFrame(frame: GatewayFrame): void {
  if (frame.type !== 'event' && frame.type !== 'evt') return

  const eventName = (frame as any).event
  // Debug: log all gateway events to find what's being received
  const debugPayload = (frame as any).payload
  if (eventName === 'chat') {
    console.log(`[chat-bus] gateway chat event: state=${debugPayload?.state} runId=${debugPayload?.runId} role=${debugPayload?.message?.role}`)
  }
  const rawPayload =
    (frame as any).payload ??
    ((frame as any).payloadJSON
      ? (() => {
          try { return JSON.parse((frame as any).payloadJSON) } catch { return null }
        })()
      : null)
  if (!rawPayload) return

  const activeRunId = typeof rawPayload?.runId === 'string' ? rawPayload.runId : undefined
  if (hasActiveSendRun(activeRunId)) return

  const eventSessionKey = rawPayload?.sessionKey || rawPayload?.context?.sessionKey
  const targetSessionKey = eventSessionKey || 'main'

  // ── Agent events ──
  if (eventName === 'agent') {
    const stream = rawPayload?.stream
    const data = rawPayload?.data
    const runId = rawPayload?.runId

    if (stream === 'assistant' && data?.text) {
      if (!claimChunkSource(runId, 'agent')) return
      broadcast('chunk', { text: data.text, runId, sessionKey: targetSessionKey })
    } else if (stream === 'thinking' && data?.text) {
      broadcast('thinking', { text: data.text, runId, sessionKey: targetSessionKey })
    } else if (stream === 'tool') {
      broadcast('tool', {
        phase: data?.phase ?? 'calling',
        name: data?.name,
        toolCallId: data?.toolCallId,
        args: data?.args,
        result: data?.result ?? data?.partialResult ?? undefined,
        runId,
        sessionKey: targetSessionKey,
      })
    } else if (stream === 'fallback' || stream === 'lifecycle') {
      const phase = data?.phase as string | undefined
      if (stream === 'fallback' || phase === 'fallback' || phase === 'fallback_cleared') {
        broadcast('fallback', {
          phase: stream === 'fallback' ? (phase ?? 'fallback') : phase,
          selectedModel: data?.selectedModel,
          activeModel: data?.activeModel,
          previousModel: data?.previousModel,
          reason: data?.reasonSummary ?? data?.reason,
          attempts: data?.attemptSummaries ?? data?.attempts,
          sessionKey: targetSessionKey,
        })
      }
    } else if (stream === 'compaction') {
      broadcast('compaction', { phase: data?.phase, sessionKey: targetSessionKey })
    }
    return
  }

  // ── Chat events ──
  if (eventName === 'chat') {
    // Filter system messages
    const msgText = extractMessageText(rawPayload)
    if (isSystemMessage(msgText)) return

    const state = rawPayload?.state
    const message = rawPayload?.message
    const runId = activeRunId

    if (state === 'delta' && message) {
      if (!claimChunkSource(runId, 'chat')) return
      const text = extractTextFromMessage(message)
      if (text) broadcast('chunk', { text, runId, sessionKey: targetSessionKey, fullReplace: true })
      return
    }
    if (state === 'final') {
      clearChunkSource(runId)
      if (!markRunCompleted(runId)) return
      broadcast('done', { state: 'final', runId, sessionKey: targetSessionKey, message })
      return
    }
    if (state === 'error') {
      clearChunkSource(runId)
      if (!markRunCompleted(runId)) return
      broadcast('done', { state: 'error', errorMessage: rawPayload?.errorMessage, runId, sessionKey: targetSessionKey })
      return
    }
    if (state === 'aborted') {
      clearChunkSource(runId)
      if (!markRunCompleted(runId)) return
      broadcast('done', { state: 'aborted', runId, sessionKey: targetSessionKey })
      return
    }
    if (message?.role === 'user') {
      broadcast('user_message', { message, sessionKey: targetSessionKey, source: rawPayload?.source || rawPayload?.channel || 'external' })
      return
    }
    // Skip bare assistant messages — 'done' with state='final' is authoritative
    if (message?.role === 'assistant' && !state) return

    if (state === 'started' || state === 'thinking') {
      broadcast('state', { state, runId, sessionKey: targetSessionKey })
    }
    return
  }

  // ── Exec approval ──
  if (eventName === 'exec.approval.requested') {
    broadcast('approval_request', { ...rawPayload, sessionKey: targetSessionKey })
    return
  }
  if (eventName === 'exec.approval.resolved') {
    broadcast('approval_resolved', { ...rawPayload, sessionKey: targetSessionKey })
    return
  }

  // ── Update available ──
  if (eventName === 'update.available') {
    broadcast('update_available', { ...rawPayload })
    return
  }

  // ── Legacy message events ──
  if (eventName === 'message.received' || eventName === 'chat.message' || eventName === 'channel.message') {
    const message = rawPayload?.message || rawPayload
    if (message?.role === 'user') {
      const altMsgText =
        extractTextFromMessage(message) ||
        (typeof message?.text === 'string' ? message.text : '') ||
        (typeof message?.body === 'string' ? message.body : '')
      if (isSystemMessage(altMsgText)) return
      broadcast('user_message', { message, sessionKey: targetSessionKey, source: rawPayload?.source || rawPayload?.channel || eventName })
    }
    // Skip assistant messages from legacy events — 'done' is authoritative
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Ensure the singleton gateway listener is running.
 * Safe to call multiple times — only starts once.
 */
export async function ensureBusStarted(): Promise<void> {
  const bus = getBus()
  if (bus.started) return
  bus.started = true

  await gatewayConnectCheck()

  // Clean up any previous listener (from a prior Vite SSR reload)
  if (bus.cleanupListener) {
    bus.cleanupListener()
    bus.cleanupListener = null
  }

  bus.cleanupListener = onGatewayEvent(processGatewayFrame)
  console.log(`[chat-bus] singleton gateway listener started`)
}

/**
 * Subscribe to processed chat events. Returns unsubscribe function.
 * Events are already deduplicated — subscribers just need to serialize to SSE.
 */
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
        subscriber(event)
      }
    : subscriber

  bus.subscribers.add(wrappedSubscriber)
  return () => {
    bus.subscribers.delete(wrappedSubscriber)
  }
}
