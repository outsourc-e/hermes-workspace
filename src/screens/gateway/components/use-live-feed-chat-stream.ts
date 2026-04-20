import { useEffect } from 'react'
import type { FeedEvent } from './feed-event-bus'

type PushEvent = (event: FeedEvent) => void

const makeId = () => `system-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const readString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const toRecord = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null)

function buildSystemEvent(message: string, agentName?: string): FeedEvent {
  return { id: makeId(), type: 'system', message, agentName, timestamp: Date.now() }
}

export function useLiveFeedChatStream(pushEvent: PushEvent) {
  useEffect(() => {
    function parseSsePayload(raw: string): Record<string, unknown> | null {
      try {
        return toRecord(JSON.parse(raw))
      } catch {
        return null
      }
    }

    const stream = new EventSource('/api/chat-events')

    stream.addEventListener('tool', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data)
      if (!payload) return
      const phase = readString(payload.phase) || 'update'
      const name = readString(payload.name) || 'tool'
      pushEvent(buildSystemEvent(`Tool ${phase}: ${name}`, readString(payload.sessionKey) || undefined))
    })

    stream.addEventListener('done', (event) => {
      if (!(event instanceof MessageEvent)) return
      const payload = parseSsePayload(event.data)
      if (!payload) return

      const state = readString(payload.state).toLowerCase()
      const error = readString(payload.errorMessage)
      const message =
        state === 'final'
          ? 'Run completed'
          : state === 'error'
            ? `Run failed${error ? `: ${error}` : ''}`
            : state === 'aborted'
              ? 'Run aborted'
              : 'Run update'

      pushEvent(buildSystemEvent(message, readString(payload.sessionKey) || undefined))
    })

    return () => stream.close()
  }, [pushEvent])
}
