import { createFileRoute } from '@tanstack/react-router'
// Active run tracking (replaces gateway.ts imports)
const _activeSendRuns = new Set<string>()
function registerActiveSendRun(runId: string): void { if (runId) _activeSendRuns.add(runId) }
function unregisterActiveSendRun(runId: string): void { if (runId) _activeSendRuns.delete(runId) }
import { resolveSessionKey } from '../../server/session-utils'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { publishChatEvent } from '../../server/chat-event-bus'
import { streamChat } from '../../server/hermes-api'

const SEND_STREAM_RUN_TIMEOUT_MS = 180_000

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function stripDataUrlPrefix(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const commaIndex = trimmed.indexOf(',')
  if (trimmed.toLowerCase().startsWith('data:') && commaIndex >= 0) {
    return trimmed.slice(commaIndex + 1).trim()
  }
  return trimmed
}

function normalizeAttachments(
  attachments: unknown,
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return undefined
  }

  const normalized: Array<Record<string, unknown>> = []
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== 'object') continue
    const source = attachment as Record<string, unknown>

    const id = readString(source.id)
    const name = readString(source.name) || readString(source.fileName)
    const mimeType =
      readString(source.contentType) ||
      readString(source.mimeType) ||
      readString(source.mediaType)
    const size = readNumber(source.size)

    const base64Raw =
      readString(source.content) ||
      readString(source.data) ||
      readString(source.base64) ||
      readString(source.dataUrl)
    const content = stripDataUrlPrefix(base64Raw)
    if (!content) continue

    const type =
      readString(source.type) ||
      (mimeType.toLowerCase().startsWith('image/') ? 'image' : 'file')

    const dataUrl =
      readString(source.dataUrl) ||
      (mimeType ? `data:${mimeType};base64,${content}` : '')

    normalized.push({
      id: id || undefined,
      name: name || undefined,
      fileName: name || undefined,
      type,
      contentType: mimeType || undefined,
      mimeType: mimeType || undefined,
      mediaType: mimeType || undefined,
      content,
      data: content,
      base64: content,
      dataUrl: dataUrl || undefined,
      size,
    })
  }

  return normalized.length > 0 ? normalized : undefined
}

function getGatewayMessage(
  message: string,
  attachments?: Array<Record<string, unknown>>,
): string {
  if (message.trim().length > 0) return message
  if (attachments && attachments.length > 0) {
    return 'Please review the attached content.'
  }
  return message
}

export const Route = createFileRoute('/api/send-stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth check
        if (!isAuthenticated(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >

        const rawSessionKey =
          typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
        const friendlyId =
          typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
        const message = String(body.message ?? '')
        const thinking =
          typeof body.thinking === 'string' ? body.thinking : undefined
        const fastMode = body.fastMode === true
        const attachments = normalizeAttachments(body.attachments)
        if (!message.trim() && (!attachments || attachments.length === 0)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'message required' }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        // Resolve session key
        let sessionKey: string
        try {
          const resolved = await resolveSessionKey({
            rawSessionKey,
            friendlyId,
            defaultKey: 'main',
          })
          sessionKey = resolved.sessionKey
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          if (errorMsg === 'session not found') {
            return new Response(
              JSON.stringify({ ok: false, error: 'session not found' }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
          return new Response(JSON.stringify({ ok: false, error: errorMsg }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Create streaming response using the SHARED gateway connection
        const encoder = new TextEncoder()
        let streamClosed = false
        let activeRunId: string | null = null
        let unregisterTimer: ReturnType<typeof setTimeout> | null = null
        const abortController = new AbortController()
        let closeStream = () => {
          streamClosed = true
        }

        const stream = new ReadableStream({
          async start(controller) {
            const sendEvent = (event: string, data: unknown) => {
              if (streamClosed) return
              const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
              controller.enqueue(encoder.encode(payload))
            }

            closeStream = () => {
              if (streamClosed) return
              streamClosed = true
              if (unregisterTimer) {
                clearTimeout(unregisterTimer)
                unregisterTimer = null
              }
              if (activeRunId) {
                unregisterActiveSendRun(activeRunId)
                activeRunId = null
              }
              abortController.abort()
              try {
                controller.close()
              } catch {
                // ignore
              }
            }

            try {
              let startedSent = false
              await streamChat(
                sessionKey,
                {
                  message: getGatewayMessage(message, attachments),
                  model: fastMode ? undefined : undefined,
                  system_message: thinking,
                },
                {
                  signal: abortController.signal,
                  onEvent({ event, data }) {
                    const sessionKeyFromEvent =
                      typeof data.session_id === 'string' && data.session_id.trim()
                        ? data.session_id
                        : sessionKey
                    const runId =
                      typeof data.run_id === 'string' && data.run_id.trim()
                        ? data.run_id
                        : activeRunId ?? undefined

                    if (runId && !activeRunId) {
                      activeRunId = runId
                      registerActiveSendRun(runId)
                      unregisterTimer = setTimeout(() => {
                        if (activeRunId) {
                          unregisterActiveSendRun(activeRunId)
                          activeRunId = null
                        }
                      }, SEND_STREAM_RUN_TIMEOUT_MS)
                    }

                    if (!startedSent && runId) {
                      startedSent = true
                      sendEvent('started', { runId, sessionKey: sessionKeyFromEvent })
                    }

                    if (event === 'run.started') {
                      const userMessage =
                        data.user_message && typeof data.user_message === 'object'
                          ? (data.user_message as Record<string, unknown>)
                          : null
                      if (userMessage) {
                        publishChatEvent('user_message', {
                          message: {
                            id: userMessage.id,
                            role: userMessage.role ?? 'user',
                            content: [
                              {
                                type: 'text',
                                text:
                                  typeof userMessage.content === 'string'
                                    ? userMessage.content
                                    : '',
                              },
                            ],
                          },
                          sessionKey: sessionKeyFromEvent,
                          source: 'hermes',
                          runId,
                        })
                      }
                      return
                    }

                    if (event === 'message.started') {
                      const message =
                        data.message && typeof data.message === 'object'
                          ? (data.message as Record<string, unknown>)
                          : {}
                      const translated = {
                        message: {
                          id: message.id,
                          role: 'assistant',
                          content: [],
                        },
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('message', translated)
                      publishChatEvent('message', translated)
                      return
                    }

                    if (event === 'assistant.delta') {
                      const delta = typeof data.delta === 'string' ? data.delta : ''
                      if (!delta) return
                      const translated = {
                        text: delta,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('chunk', translated)
                      publishChatEvent('chunk', translated)
                      return
                    }

                    if (event === 'tool.pending' || event === 'tool.started') {
                      const translated = {
                        phase: 'start',
                        name:
                          readString((data.tool_call as Record<string, unknown> | undefined)?.tool_name) ||
                          readString(data.tool_name) ||
                          'tool',
                        toolCallId:
                          readString((data.tool_call as Record<string, unknown> | undefined)?.id) ||
                          readString(data.tool_call_id) ||
                          undefined,
                        args:
                          ((data.tool_call as Record<string, unknown> | undefined)?.arguments as unknown) ??
                          data.args,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'tool.progress') {
                      const delta = readString(data.delta)
                      if (!delta) return
                      const toolName = readString(data.tool_name)
                      if (toolName === '_thinking' || !toolName) {
                        const translated = {
                          text: delta,
                          sessionKey: sessionKeyFromEvent,
                          runId,
                        }
                        sendEvent('thinking', translated)
                        publishChatEvent('thinking', translated)
                        return
                      }
                      return
                    }

                    if (event === 'tool.completed') {
                      const translated = {
                        phase: 'complete',
                        name: readString(data.tool_name) || 'tool',
                        toolCallId: readString(data.tool_call_id) || undefined,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'tool.failed') {
                      const translated = {
                        phase: 'error',
                        name: readString(data.tool_name) || 'tool',
                        toolCallId: readString(data.tool_call_id) || undefined,
                        args: undefined,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'error') {
                      const errorMessage =
                        readString(
                          (data.error as Record<string, unknown> | undefined)?.message,
                        ) || 'Hermes stream error'
                      const translated = {
                        state: 'error',
                        errorMessage,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('done', translated)
                      publishChatEvent('done', translated)
                      closeStream()
                      return
                    }

                    if (event === 'run.completed') {
                      const translated = {
                        state: 'complete',
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('done', translated)
                      publishChatEvent('done', translated)
                      closeStream()
                    }
                  },
                },
              )

              // Set a timeout to close the stream if no completion event
              setTimeout(() => {
                if (!streamClosed) {
                  sendEvent('error', { message: 'Stream timeout' })
                  closeStream()
                }
              }, SEND_STREAM_RUN_TIMEOUT_MS)
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err)
              sendEvent('error', { message: errorMsg })
              closeStream()
            }
          },
          cancel() {
            closeStream()
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
