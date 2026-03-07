/**
 * Singleton EventSource for /api/chat-events.
 *
 * Problem: Multiple React components each create their own EventSource
 * to /api/chat-events. Each connection creates a server-side subscriber,
 * and each subscriber receives every event. Components that all feed
 * into the same zustand store cause N×duplicated messages.
 *
 * Fix: One shared EventSource. Components subscribe to typed events
 * via addListener/removeListener. The EventSource reconnects automatically.
 */

type EventCallback = (data: any) => void

interface SharedEventSourceState {
  eventSource: EventSource | null
  listeners: Map<string, Set<EventCallback>>
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempts: number
  connecting: boolean
}

const STATE_KEY = '__clawsuite_shared_eventsource__' as const

function getState(): SharedEventSourceState {
  if (!(window as any)[STATE_KEY]) {
    ;(window as any)[STATE_KEY] = {
      eventSource: null,
      listeners: new Map<string, Set<EventCallback>>(),
      reconnectTimer: null,
      reconnectAttempts: 0,
      connecting: false,
    } satisfies SharedEventSourceState
  }
  return (window as any)[STATE_KEY]
}

const KNOWN_EVENTS = [
  'connected',
  'disconnected',
  'chunk',
  'thinking',
  'tool',
  'done',
  'message',
  'user_message',
  'state',
  'fallback',
  'compaction',
  'approval_request',
  'approval_resolved',
  'update_available',
  'heartbeat',
  'error',
] as const

function emit(eventType: string, data: any): void {
  const state = getState()
  const listeners = state.listeners.get(eventType)
  if (!listeners) return
  for (const cb of listeners) {
    try {
      cb(data)
    } catch {
      // listener error
    }
  }
}

function scheduleReconnect(): void {
  const state = getState()
  if (state.reconnectTimer) return
  const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000)
  state.reconnectAttempts++
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    connect()
  }, delay)
}

function connect(): void {
  const state = getState()
  if (state.connecting) return
  state.connecting = true

  // Close existing
  if (state.eventSource) {
    try { state.eventSource.close() } catch { /* */ }
    state.eventSource = null
  }

  const es = new EventSource('/api/chat-events')
  state.eventSource = es

  es.onopen = () => {
    state.reconnectAttempts = 0
    state.connecting = false
  }

  es.onerror = () => {
    state.connecting = false
    emit('error', { message: 'SSE connection error' })
    // EventSource auto-reconnects, but if it's in CLOSED state, we need manual reconnect
    if (es.readyState === EventSource.CLOSED) {
      state.eventSource = null
      scheduleReconnect()
    }
  }

  // Register all known event types
  for (const eventType of KNOWN_EVENTS) {
    es.addEventListener(eventType, (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        emit(eventType, data)
      } catch {
        // parse error
      }
    })
  }
}

/**
 * Ensure the shared EventSource is connected.
 * Safe to call multiple times.
 */
export function ensureConnected(): void {
  const state = getState()
  if (state.eventSource && state.eventSource.readyState !== EventSource.CLOSED) return
  connect()
}

/**
 * Add a listener for a specific SSE event type.
 * Automatically ensures the EventSource is connected.
 * Returns an unsubscribe function.
 */
export function addSharedEventListener(
  eventType: string,
  callback: EventCallback,
): () => void {
  const state = getState()
  if (!state.listeners.has(eventType)) {
    state.listeners.set(eventType, new Set())
  }
  state.listeners.get(eventType)!.add(callback)
  ensureConnected()

  return () => {
    const listeners = state.listeners.get(eventType)
    if (listeners) {
      listeners.delete(callback)
    }
  }
}

/**
 * Force reconnect the shared EventSource.
 */
export function reconnectShared(): void {
  const state = getState()
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }
  state.reconnectAttempts = 0
  connect()
}

/**
 * Get the current connection state.
 */
export function getConnectionState(): 'connecting' | 'connected' | 'disconnected' {
  const state = getState()
  if (!state.eventSource) return 'disconnected'
  switch (state.eventSource.readyState) {
    case EventSource.CONNECTING: return 'connecting'
    case EventSource.OPEN: return 'connected'
    default: return 'disconnected'
  }
}
