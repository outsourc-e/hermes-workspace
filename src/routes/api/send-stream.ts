import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import {
  gatewayRpc,
  onGatewayEvent,
  gatewayConnectCheck,
  registerActiveSendRun,
  unregisterActiveSendRun,
} from '../../server/gateway'
import type { GatewayFrame } from '../../server/gateway'
import { resolveSessionKey } from '../../server/session-utils'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

const SEND_STREAM_RUN_TIMEOUT_MS = 180_000

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function extractStepPayload(
  value: unknown,
): {
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  contextPercent?: number
  model?: string
} | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>

  const inputTokens = readNumber(
    source.tokens_in ?? source.tokensIn ?? source.inputTokens,
  )
  const outputTokens = readNumber(
    source.tokens_out ?? source.tokensOut ?? source.outputTokens,
  )
  const cacheRead = readNumber(source.cache_read ?? source.cacheRead)
  const cacheWrite = readNumber(source.cache_write ?? source.cacheWrite)
  const contextPercent = readNumber(
    source.context_percent ?? source.contextPercent,
  )
  const model = readString(source.model) || undefined

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cacheRead === undefined &&
    cacheWrite === undefined &&
    contextPercent === undefined &&
    !model
  ) {
    return null
  }

  return {
    inputTokens,
    outputTokens,
    cacheRead,
    cacheWrite,
    contextPercent,
    model,
  }
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
        const idempotencyKey =
          typeof body.idempotencyKey === 'string'
            ? body.idempotencyKey
            : randomUUID()

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
        let cleanupListener: (() => void) | null = null
        let activeRunId: string | null = null
        let unregisterTimer: ReturnType<typeof setTimeout> | null = null
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
              if (cleanupListener) {
                cleanupListener()
                cleanupListener = null
              }
              try {
                controller.close()
              } catch {
                // ignore
              }
            }

            try {
              // Ensure shared gateway connection is active
              await gatewayConnectCheck()

              // Listen for events on the shared connection
              cleanupListener = onGatewayEvent((frame: GatewayFrame) => {
                if (frame.type !== 'evt' && frame.type !== 'event') return
                const eventName = (frame as any).event as string
                const payload = parsePayload(frame)

                if (eventName === 'agent') {
                  const agentPayload = payload as any
                  if (
                    activeRunId &&
                    agentPayload?.runId &&
                    agentPayload.runId !== activeRunId
                  ) {
                    return
                  }
                  const stream = agentPayload?.stream
                  const data = agentPayload?.data

                  if (stream === 'assistant' && data?.text) {
                    sendEvent('assistant', {
                      text: data.text,
                      runId: agentPayload?.runId,
                    })
                  } else if (stream === 'tool') {
                    sendEvent('tool', {
                      phase: data?.phase,
                      name: data?.name,
                      toolCallId: data?.toolCallId,
                      args: data?.args,
                      runId: agentPayload?.runId,
                    })
                  } else if (stream === 'thinking' && data?.text) {
                    sendEvent('thinking', {
                      text: data.text,
                      runId: agentPayload?.runId,
                    })
                  } else if (
                    stream === 'step' ||
                    stream === 'step_finish' ||
                    stream === 'step_cost'
                  ) {
                    const stepPayload = extractStepPayload(data)
                    if (!stepPayload) return
                    sendEvent('step', {
                      ...stepPayload,
                      runId: agentPayload?.runId,
                    })
                  }
                } else if (eventName === 'chat') {
                  const chatPayload = payload as any
                  if (
                    activeRunId &&
                    chatPayload?.runId &&
                    chatPayload.runId !== activeRunId
                  ) {
                    return
                  }
                  const state = chatPayload?.state
                  if (
                    state === 'final' ||
                    state === 'aborted' ||
                    state === 'error'
                  ) {
                    sendEvent('done', {
                      state,
                      errorMessage: chatPayload?.errorMessage,
                      runId: chatPayload?.runId,
                    })
                    closeStream()
                  }
                }
              })

              // Send the chat message via shared RPC
              const sendResult = await gatewayRpc<{ runId?: string }>(
                'chat.send',
                {
                  sessionKey,
                  message: getGatewayMessage(message, attachments),
                  thinking,
                  fast: fastMode || undefined,
                  attachments,
                  deliver: false,
                  timeoutMs: 120_000,
                  idempotencyKey,
                },
              )

              // Send initial event with runId
              if (typeof sendResult.runId === 'string' && sendResult.runId.trim()) {
                activeRunId = sendResult.runId
                registerActiveSendRun(activeRunId)
                unregisterTimer = setTimeout(() => {
                  if (activeRunId) {
                    unregisterActiveSendRun(activeRunId)
                    activeRunId = null
                  }
                }, SEND_STREAM_RUN_TIMEOUT_MS)
              }

              sendEvent('started', {
                runId: sendResult.runId,
                sessionKey,
              })

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

function parsePayload(frame: any): unknown {
  if (frame.payload !== undefined) return frame.payload
  if (typeof frame.payloadJSON === 'string') {
    try { return JSON.parse(frame.payloadJSON) } catch { return null }
  }
  return null
}
