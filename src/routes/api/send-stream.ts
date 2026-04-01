import { createFileRoute } from '@tanstack/react-router'
import { resolveSessionKey } from '../../server/session-utils'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { publishChatEvent } from '../../server/chat-event-bus'
import {
  registerActiveSendRun,
  unregisterActiveSendRun,
} from '../../server/send-run-tracker'
import { getChatMode } from '../../server/gateway-capabilities'
import { openaiChat } from '../../server/openai-compat-api'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  createSession,
  ensureGatewayProbed,
  getGatewayCapabilities,
  streamChat,
} from '../../server/hermes-api'
// Hermes agent runs can take 5+ minutes with complex tool chains
const SEND_STREAM_RUN_TIMEOUT_MS = 600_000
const SESSION_BOOTSTRAP_KEYS = new Set(['main', 'new'])

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

function getChatMessage(
  message: string,
  attachments?: Array<Record<string, unknown>>,
): string {
  if (message.trim().length > 0) return message
  if (attachments && attachments.length > 0) {
    return 'Please review the attached content.'
  }
  return message
}

type PortableHistoryMessage = {
  role: string
  content: string
}

function normalizePortableHistory(
  value: unknown,
): Array<PortableHistoryMessage> {
  if (!Array.isArray(value) || value.length === 0) return []

  const normalized: Array<PortableHistoryMessage> = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const role = readString(record.role)
    const content = readString(record.content)
    if (!role || !content) continue
    if (role !== 'user' && role !== 'assistant' && role !== 'system') continue
    normalized.push({ role, content })
  }

  return normalized
}

function normalizeHermesErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.trim()
  if (!message) return 'Hermes request failed'
  return message.replace(/\bserver\b/gi, 'Hermes')
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined
}

function getToolName(data: Record<string, unknown>): string {
  const toolCall = readRecord(data.tool_call)
  const tool = readRecord(data.tool)
  const toolFunction = readRecord(toolCall?.function)
  return (
    readString(toolCall?.tool_name) ||
    readString(toolCall?.name) ||
    readString(toolFunction?.name) ||
    readString(tool?.name) ||
    readString(data.tool_name) ||
    readString(data.name) ||
    'tool'
  )
}

function getToolCallId(
  data: Record<string, unknown>,
  runId: string | undefined,
  toolName: string,
): string {
  const toolCall = readRecord(data.tool_call)
  const tool = readRecord(data.tool)
  return (
    readString(toolCall?.id) ||
    readString(tool?.id) ||
    readString(data.tool_call_id) ||
    readString(data.call_id) ||
    readString(data.id) ||
    `${runId || 'run'}:${toolName}`
  )
}

function getToolArgs(data: Record<string, unknown>): unknown {
  const toolCall = readRecord(data.tool_call)
  const toolFunction = readRecord(toolCall?.function)
  return toolCall?.arguments ?? toolFunction?.arguments ?? data.args
}

function getToolResultPreview(data: Record<string, unknown>): string {
  return (
    readString(data.result_preview) ||
    readString(data.result) ||
    readString(data.output) ||
    readString(data.message)
  )
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
        await ensureGatewayProbed()

        // Read body manually to handle large payloads (image attachments
        // can push the JSON body above the default ~1MB parse limit).
        let body: Record<string, unknown> = {}
        try {
          const rawBody = await request.text()
          body = JSON.parse(rawBody) as Record<string, unknown>
        } catch {
          // Fall through — body stays empty, will hit 'message required' below
        }

        const rawSessionKey =
          typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
        const requestedFriendlyId =
          typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
        const message = String(body.message ?? '')
        const thinking =
          typeof body.thinking === 'string' ? body.thinking : undefined
        const attachments = normalizeAttachments(body.attachments)
        const history = normalizePortableHistory(body.history)
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
        let resolvedFriendlyId: string
        try {
          const resolved = await resolveSessionKey({
            rawSessionKey,
            friendlyId: requestedFriendlyId,
            defaultKey: 'main',
          })
          sessionKey = resolved.sessionKey
          resolvedFriendlyId = resolved.sessionKey
        } catch (err) {
          const errorMsg = normalizeHermesErrorMessage(err)
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

        const chatMode = getChatMode()

        // Create streaming response using the SHARED server connection
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
              if (chatMode === 'portable') {
                const runId = crypto.randomUUID()
                // In portable mode, keep the original session key so the frontend
                // streaming state map matches what the chat screen is watching.
                // In portable mode there are no server-side sessions — always use
                // 'main' so the store key matches what the UI subscribes to.
                const portableSessionKey = 'main'
                const portableFriendlyId =
                  requestedFriendlyId || rawSessionKey || portableSessionKey
                let accumulated = ''

                activeRunId = runId
                registerActiveSendRun(runId)
                unregisterTimer = setTimeout(() => {
                  if (activeRunId) {
                    unregisterActiveSendRun(activeRunId)
                    activeRunId = null
                  }
                }, SEND_STREAM_RUN_TIMEOUT_MS)

                sendEvent('started', {
                  runId,
                  sessionKey: portableSessionKey,
                  friendlyId: portableFriendlyId,
                })

                try {
                  const portableMessages = [
                    ...history,
                    {
                      role: 'user',
                      content: getChatMessage(message, attachments),
                    },
                  ]
                  const stream = await openaiChat(
                    portableMessages,
                    {
                      model: typeof body.model === 'string' ? body.model : undefined,
                      temperature:
                        typeof body.temperature === 'number'
                          ? body.temperature
                          : undefined,
                      signal: abortController.signal,
                      stream: true,
                    },
                  )

                  let thinking = ''
                  for await (const chunk of stream) {
                    if (chunk.type === 'reasoning') {
                      thinking += chunk.text
                      sendEvent('thinking', {
                        text: thinking,
                        sessionKey: portableSessionKey,
                        runId,
                      })
                    } else {
                      accumulated += chunk.text
                      sendEvent('chunk', {
                        text: accumulated,
                        fullReplace: true,
                        sessionKey: portableSessionKey,
                        runId,
                      })
                    }
                  }

                  sendEvent('done', {
                    state: 'complete',
                    sessionKey: portableSessionKey,
                    runId,
                    message: {
                      role: 'assistant',
                      content: [
                        ...(thinking ? [{ type: 'thinking', thinking }] : []),
                        { type: 'text', text: accumulated },
                      ],
                    },
                  })
                  closeStream()
                } catch (err) {
                  if (!streamClosed) {
                    sendEvent('error', {
                      message: normalizeHermesErrorMessage(err),
                      sessionKey: portableSessionKey,
                      runId,
                    })
                    closeStream()
                  }
                }
                return
              }

              if (!getGatewayCapabilities().sessions) {
                throw new Error(SESSIONS_API_UNAVAILABLE_MESSAGE)
              }

              if (SESSION_BOOTSTRAP_KEYS.has(sessionKey)) {
                const session = await createSession()
                sessionKey = session.id
                resolvedFriendlyId = session.id
              }

              let startedSent = false
              // In enhanced mode, the HTTP stream response delivers all events
              // directly to useStreamingMessage. Skip publishChatEvent to prevent
              // useRealtimeChatHistory from creating duplicate message bubbles.
              const skipPublish = true
              await streamChat(
                sessionKey,
                {
                  message: getChatMessage(message, attachments),
                  model: typeof body.model === 'string' ? body.model : undefined,
                  system_message: thinking,
                  attachments: attachments || undefined,
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
                      sendEvent('started', {
                        runId,
                        sessionKey: sessionKeyFromEvent,
                        friendlyId: sessionKeyFromEvent,
                      })
                    }

                    if (event === 'run.started') {
                      const userMessage =
                        data.user_message && typeof data.user_message === 'object'
                          ? (data.user_message as Record<string, unknown>)
                          : null
                      if (userMessage) {
                        skipPublish || publishChatEvent('user_message', {
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
                      skipPublish || publishChatEvent('message', translated)
                      return
                    }

                    if (event === 'assistant.completed') {
                      // Send full content as a chunk — covers cases where
                      // deltas were missed or response was too short for streaming
                      const content = typeof data.content === 'string' ? data.content : ''
                      if (content) {
                        const translated = {
                          text: content,
                          fullReplace: true,
                          sessionKey: sessionKeyFromEvent,
                          runId,
                        }
                        sendEvent('chunk', translated)
                        skipPublish || publishChatEvent('chunk', translated)
                      }
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
                      skipPublish || publishChatEvent('chunk', translated)
                      return
                    }

                    if (
                      event === 'tool.pending' ||
                      event === 'tool.started' ||
                      event === 'tool.calling' ||
                      event === 'tool.running'
                    ) {
                      const toolName = getToolName(data)
                      const translated = {
                        phase: event === 'tool.pending' || event === 'tool.started'
                          ? 'start'
                          : 'calling',
                        name: toolName,
                        toolCallId: getToolCallId(data, runId, toolName),
                        args: getToolArgs(data),
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'tool.progress') {
                      const delta = readString(data.delta)
                      const toolName = getToolName(data)
                      if (toolName === '_thinking' || toolName === 'tool') {
                        if (!delta) return
                        const translated = {
                          text: delta,
                          sessionKey: sessionKeyFromEvent,
                          runId,
                        }
                        sendEvent('thinking', translated)
                        skipPublish || publishChatEvent('thinking', translated)
                        return
                      }
                      const translated = {
                        phase: 'calling',
                        name: toolName,
                        toolCallId: getToolCallId(data, runId, toolName),
                        args: getToolArgs(data),
                        result: delta || undefined,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'tool.completed') {
                      const toolName = getToolName(data)
                      const resultPreview = getToolResultPreview(data)
                      const translated = {
                        phase: 'complete',
                        name: toolName,
                        toolCallId: getToolCallId(data, runId, toolName),
                        result: resultPreview.slice(0, 200),
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'artifact.created') {
                      const artifact =
                        data.artifact && typeof data.artifact === 'object'
                          ? (data.artifact as Record<string, unknown>)
                          : {}
                      const translated = {
                        phase: 'complete',
                        name: readString(data.tool_name) || 'artifact',
                        toolCallId: readString(data.tool_call_id) || undefined,
                        result:
                          readString(artifact.title) ||
                          readString(artifact.path) ||
                          readString(data.path) ||
                          'Artifact created',
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'memory.updated') {
                      const translated = {
                        phase: 'complete',
                        name: 'memory',
                        toolCallId: readString(data.tool_call_id) || undefined,
                        result:
                          readString(data.message) ||
                          `Updated ${readString(data.target) || 'memory'}`,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'skill.loaded') {
                      const skill =
                        data.skill && typeof data.skill === 'object'
                          ? (data.skill as Record<string, unknown>)
                          : {}
                      const translated = {
                        phase: 'complete',
                        name: 'skill',
                        toolCallId: readString(data.tool_call_id) || undefined,
                        result:
                          readString(skill.name) ||
                          readString(data.skill_name) ||
                          'Skill loaded',
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'tool.failed') {
                      const errorMessage =
                        readString(
                          (data.error as Record<string, unknown> | undefined)?.message,
                        ) || readString(data.message)
                      const toolName = getToolName(data)
                      const translated = {
                        phase: 'error',
                        name: toolName,
                        toolCallId: getToolCallId(data, runId, toolName),
                        result: errorMessage,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'error') {
                      const errorMessage =
                        readString(
                          (data.error as Record<string, unknown> | undefined)?.message,
                        ) || 'Hermes stream error'
                      sendEvent('error', {
                        message: errorMessage,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      })
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
                      skipPublish || publishChatEvent('done', translated)
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
              // Only send error if stream hasn't already completed successfully
              if (!streamClosed) {
                const errorMsg = normalizeHermesErrorMessage(err)
                sendEvent('error', {
                  message: errorMsg,
                  sessionKey,
                })
                closeStream()
              }
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
            'X-Hermes-Session-Key': sessionKey,
            'X-Hermes-Friendly-Id': resolvedFriendlyId,
          },
        })
      },
    },
  },
})
