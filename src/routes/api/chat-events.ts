import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureBusStarted,
  subscribeToChatEvents,
} from '../../server/chat-event-bus'

/**
 * SSE endpoint for chat events.
 *
 * Claude does not expose a global browser-facing event stream, so the server
 * keeps a local singleton bus of translated chat events and fans that out to
 * any browser SSE subscribers.
 */
export const Route = createFileRoute('/api/chat-events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const url = new URL(request.url)
        const sessionKeyParam =
          url.searchParams.get('sessionKey')?.trim() || undefined

        const encoder = new TextEncoder()
        let streamClosed = false
        let unsubscribe: (() => void) | null = null
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null

        const stream = new ReadableStream({
          async start(controller) {
            const sendEvent = (event: string, data: unknown) => {
              if (streamClosed) return
              try {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(payload))
              } catch {
                /* stream closed */
              }
            }

            const closeStream = () => {
              if (streamClosed) return
              streamClosed = true
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
              }
              if (unsubscribe) {
                unsubscribe()
                unsubscribe = null
              }
              try {
                controller.close()
              } catch {
                /* ignore */
              }
            }

            try {
              // Start the singleton bus if not already running
              await ensureBusStarted()

              sendEvent('connected', {
                timestamp: Date.now(),
                sessionKey: sessionKeyParam || 'all',
              })

              // Subscribe to the deduplicated event stream
              unsubscribe = subscribeToChatEvents((evt) => {
                if (streamClosed) return
                sendEvent(evt.event, evt.data)
              }, sessionKeyParam)

              // Heartbeat to keep SSE alive
              heartbeatTimer = setInterval(() => {
                sendEvent('heartbeat', { timestamp: Date.now() })
              }, 30_000)
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err)
              sendEvent('error', { message: errorMsg })
              closeStream()
            }
          },
          cancel() {
            streamClosed = true
            if (heartbeatTimer) {
              clearInterval(heartbeatTimer)
              heartbeatTimer = null
            }
            if (unsubscribe) {
              unsubscribe()
              unsubscribe = null
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        })
      },
    },
  },
})
