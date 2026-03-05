import { createFileRoute } from '@tanstack/react-router'
import { onGatewayEvent, gatewayConnectCheck } from '../../server/gateway'
import type { GatewayFrame } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'

/**
 * Extract text content from a gateway message.
 */
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

/**
 * SSE endpoint that streams chat events from the MAIN gateway connection.
 * Uses onGatewayEvent to listen on the shared GatewayClient —
 * no second WebSocket, no device ID conflict.
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
        const sessionKeyParam = url.searchParams.get('sessionKey')?.trim()

        const encoder = new TextEncoder()
        let streamClosed = false
        let cleanupListener: (() => void) | null = null
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null

        const stream = new ReadableStream({
          async start(controller) {
            const sendEvent = (event: string, data: unknown) => {
              if (streamClosed) return
              try {
                const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(payload))
              } catch { /* stream closed */ }
            }

            const closeStream = () => {
              if (streamClosed) return
              streamClosed = true
              if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
              if (cleanupListener) { cleanupListener(); cleanupListener = null }
              try { controller.close() } catch { /* ignore */ }
            }

            try {
              // Ensure gateway is connected
              await gatewayConnectCheck()

              sendEvent('connected', {
                timestamp: Date.now(),
                sessionKey: sessionKeyParam || 'all',
              })

              // Listen on the MAIN gateway client's event stream
              cleanupListener = onGatewayEvent((frame: GatewayFrame) => {
                if (streamClosed) return
                if (frame.type !== 'event' && frame.type !== 'evt') return

                const eventName = (frame as any).event
                const rawPayload = (frame as any).payload ?? ((frame as any).payloadJSON ? (() => { try { return JSON.parse((frame as any).payloadJSON) } catch { return null } })() : null)
                if (!rawPayload) return

                const eventSessionKey = rawPayload?.sessionKey || rawPayload?.context?.sessionKey
                if (sessionKeyParam && eventSessionKey && eventSessionKey !== sessionKeyParam) return

                const targetSessionKey = eventSessionKey || sessionKeyParam || 'main'

                // Agent events (streaming chunks, thinking, tool calls)
                if (eventName === 'agent') {
                  const stream = rawPayload?.stream
                  const data = rawPayload?.data
                  const runId = rawPayload?.runId

                  if (stream === 'assistant' && data?.text) {
                    sendEvent('chunk', { text: data.text, runId, sessionKey: targetSessionKey })
                  } else if (stream === 'thinking' && data?.text) {
                    sendEvent('thinking', { text: data.text, runId, sessionKey: targetSessionKey })
                  } else if (stream === 'tool') {
                    sendEvent('tool', {
                      phase: data?.phase ?? 'calling',
                      name: data?.name, toolCallId: data?.toolCallId,
                      args: data?.args,
                      // P2: forward partial/final tool output so live pills can show results
                      result: data?.result ?? data?.partialResult ?? undefined,
                      runId, sessionKey: targetSessionKey,
                    })
                  } else if (stream === 'fallback' || stream === 'lifecycle') {
                    // P1: model fallback notification — gateway switches primary→fallback model
                    const phase = data?.phase as string | undefined
                    if (stream === 'fallback' || phase === 'fallback' || phase === 'fallback_cleared') {
                      sendEvent('fallback', {
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
                    // Gateway emits phase:"start" when auto-compaction begins,
                    // phase:"end" when it completes. Forward both so the UI can
                    // show the exact same indicator as the OpenClaw control UI.
                    sendEvent('compaction', { phase: data?.phase, sessionKey: targetSessionKey })
                  }
                  return
                }

                // Filter internal gateway system messages at SSE boundary —
                // never forward pre-compaction flushes, heartbeat prompts, etc.
                if (eventName === 'chat') {
                  // Extract text using multiple strategies — some gateways
                  // send the message with a top-level `text` field instead of
                  // the content array, which the old extraction missed.
                  let msgText: string =
                    typeof rawPayload?.message?.content === 'string'
                      ? rawPayload.message.content
                      : Array.isArray(rawPayload?.message?.content)
                        ? (rawPayload.message.content as any[])
                            .filter((b: any) => b?.type === 'text')
                            .map((b: any) => b.text ?? '')
                            .join('')
                        : typeof rawPayload?.message === 'string'
                          ? rawPayload.message
                          : ''
                  // Fallback: check top-level text/body/message fields on the
                  // message object (legacy format / some channel adapters).
                  if (!msgText && rawPayload?.message && typeof rawPayload.message === 'object') {
                    for (const key of ['text', 'body', 'message'] as const) {
                      const val = (rawPayload.message as any)[key]
                      if (typeof val === 'string' && val.trim().length > 0) {
                        msgText = val.trim()
                        break
                      }
                    }
                  }
                  if (
                    msgText.includes('Pre-compaction memory flush') ||
                    msgText.includes('Store durable memories now') ||
                    msgText.includes('APPEND new content only and do not overwrite') ||
                    msgText.startsWith('A subagent task') ||
                    msgText.startsWith('[Queued announce messages') ||
                    msgText.includes('Summarize this naturally for the user') ||
                    (msgText.includes('Stats: runtime') && msgText.includes('sessionKey agent:'))
                  ) {
                    return
                  }
                }

                // Chat events (messages, state changes)
                if (eventName === 'chat') {
                  const state = rawPayload?.state
                  const message = rawPayload?.message
                  const runId = rawPayload?.runId

                  if (state === 'delta' && message) {
                    const text = extractTextFromMessage(message)
                    if (text) sendEvent('chunk', { text, runId, sessionKey: targetSessionKey, fullReplace: true })
                    return
                  }
                  if (state === 'final') {
                    sendEvent('done', { state: 'final', runId, sessionKey: targetSessionKey, message })
                    return
                  }
                  if (state === 'error') {
                    sendEvent('done', { state: 'error', errorMessage: rawPayload?.errorMessage, runId, sessionKey: targetSessionKey })
                    return
                  }
                  if (state === 'aborted') {
                    sendEvent('done', { state: 'aborted', runId, sessionKey: targetSessionKey })
                    return
                  }
                  if (message?.role === 'user') {
                    sendEvent('user_message', { message, sessionKey: targetSessionKey, source: rawPayload?.source || rawPayload?.channel || 'external' })
                    return
                  }
                  if (message?.role === 'assistant' && !state) {
                    // DEDUP FIX: Don't emit a separate 'message' event for
                    // assistant messages. The gateway fires TWO chat events for
                    // the same response: one with no `state` (bare assistant
                    // message) and one with state='final' (authoritative done).
                    // Emitting both causes the store to insert the message
                    // twice — the 'message' handler adds it first, then 'done'
                    // adds it again if signatures differ even slightly.
                    // The 'done' event already carries the full message payload,
                    // so this bare 'message' event is redundant.
                    // sendEvent('message', { message, sessionKey: targetSessionKey })
                    return
                  }
                  if (state === 'started' || state === 'thinking') {
                    sendEvent('state', { state, runId, sessionKey: targetSessionKey })
                  }
                  return
                }

                // P8: Exec approval events — forward so ExecApprovalToast can be event-driven
                if (eventName === 'exec.approval.requested') {
                  sendEvent('approval_request', { ...rawPayload, sessionKey: targetSessionKey })
                  return
                }
                if (eventName === 'exec.approval.resolved') {
                  sendEvent('approval_resolved', { ...rawPayload, sessionKey: targetSessionKey })
                  return
                }

                // P9: Update available notification
                if (eventName === 'update.available') {
                  sendEvent('update_available', { ...rawPayload })
                  return
                }

                // Other message events
                if (eventName === 'message.received' || eventName === 'chat.message' || eventName === 'channel.message') {
                  const message = rawPayload?.message || rawPayload
                  // Apply the same system-message filter as the `chat` event handler
                  if (message?.role === 'user') {
                    const altMsgText = extractTextFromMessage(message)
                      || (typeof message?.text === 'string' ? message.text : '')
                      || (typeof message?.body === 'string' ? message.body : '')
                    if (
                      altMsgText.includes('Pre-compaction memory flush') ||
                      altMsgText.includes('Store durable memories now') ||
                      altMsgText.includes('APPEND new content only and do not overwrite') ||
                      altMsgText.startsWith('A subagent task') ||
                      altMsgText.startsWith('[Queued announce messages') ||
                      altMsgText.includes('Summarize this naturally for the user') ||
                      (altMsgText.includes('Stats: runtime') && altMsgText.includes('sessionKey agent:'))
                    ) {
                      return
                    }
                    sendEvent('user_message', { message, sessionKey: targetSessionKey, source: rawPayload?.source || rawPayload?.channel || eventName })
                  } else if (message?.role === 'assistant') {
                    // DEDUP FIX: same as above — don't re-emit assistant
                    // messages from legacy event names. The 'chat' event with
                    // state='final' is the authoritative source.
                    // sendEvent('message', { message, sessionKey: targetSessionKey })
                  }
                }
              })

              // Heartbeat to keep SSE alive
              heartbeatTimer = setInterval(() => {
                sendEvent('heartbeat', { timestamp: Date.now() })
              }, 30000)

            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err)
              sendEvent('error', { message: errorMsg })
              closeStream()
            }
          },
          cancel() {
            streamClosed = true
            if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
            if (cleanupListener) { cleanupListener(); cleanupListener = null }
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
