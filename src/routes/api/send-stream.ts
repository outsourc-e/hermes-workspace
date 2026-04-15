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
import { ensureLocalSession, appendLocalMessage, getLocalMessages, touchLocalSession } from '../../server/local-session-store'
import { getLocalProviderDef, getDiscoveredModels } from '../../server/local-provider-discovery'
import {
  
  
  openaiChat
} from '../../server/openai-compat-api'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  createSession,
  ensureGatewayProbed,
  getGatewayCapabilities,
  streamChat,
} from '../../server/hermes-api'
import type {OpenAICompatContentPart, OpenAICompatMessage} from '../../server/openai-compat-api';
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

/**
 * Build OpenAI-compatible multimodal content for portable mode.
 * If there are image attachments, returns an array of content parts;
 * otherwise returns a plain string.
 */
function buildMultimodalContent(
  message: string,
  attachments?: Array<Record<string, unknown>>,
): string | Array<OpenAICompatContentPart> {
  const imageParts: Array<OpenAICompatContentPart> = []

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      const mime = (att.contentType ||
        att.mimeType ||
        att.mediaType ||
        '') as string
      if (!mime.toLowerCase().startsWith('image/')) continue

      let b64 = (att.base64 || att.content || att.data || '') as string
      if (!b64) {
        const dataUrl = (att.dataUrl || '') as string
        if (dataUrl.startsWith('data:') && dataUrl.includes(',')) {
          b64 = dataUrl.split(',')[1]
        }
      }
      if (!b64) continue

      imageParts.push({
        type: 'image_url',
        image_url: { url: `data:${mime};base64,${b64}` },
      })
    }
  }

  if (imageParts.length === 0) {
    return getChatMessage(message, attachments)
  }

  const parts: Array<OpenAICompatContentPart> = []
  const text = message.trim() || 'Please review the attached content.'
  parts.push({ type: 'text', text })
  parts.push(...imageParts)
  return parts
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

function parseJsonIfPossible(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

function getToolArgs(data: Record<string, unknown>): unknown {
  const toolCall = readRecord(data.tool_call)
  const toolFunction = readRecord(toolCall?.function)
  return parseJsonIfPossible(
    toolCall?.arguments ?? toolFunction?.arguments ?? data.args,
  )
}

function getToolResultPreview(data: Record<string, unknown>): string {
  const raw = data.result_preview ?? data.result ?? data.output ?? data.message
  if (typeof raw === 'string') return raw
  if (raw === undefined || raw === null) return ''
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
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

        // Check if the selected model is a local provider model — force portable + direct routing
        let chatMode = getChatMode()
        let localBaseUrl: string | undefined
        const requestModel = typeof body.model === 'string' ? body.model : ''
        const bareModel = requestModel.includes('/') ? requestModel.split('/').slice(1).join('/') : requestModel
        if (requestModel) {
          const discoveredModels = getDiscoveredModels()
          const localMatch = discoveredModels.find((m) => m.id === requestModel || m.id === bareModel)
          if (localMatch) {
            const providerDef = getLocalProviderDef(localMatch.provider)
            if (providerDef) {
              chatMode = 'portable'
              localBaseUrl = providerDef.baseUrl
            }
          }
        }
        if (chatMode === 'portable' && sessionKey === 'new') {
          sessionKey = crypto.randomUUID()
          resolvedFriendlyId = sessionKey
        }

        // Create streaming response using the SHARED server connection
        const encoder = new TextEncoder()
        let streamClosed = false
        let activeRunId: string | null = null
        let unregisterTimer: ReturnType<typeof setTimeout> | null = null
        let streamTimeoutTimer: ReturnType<typeof setTimeout> | null = null
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
              if (streamTimeoutTimer) {
                clearTimeout(streamTimeoutTimer)
                streamTimeoutTimer = null
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
                const portableSessionKey = sessionKey

                // Ensure session exists (user message appended after building history)
                ensureLocalSession(portableSessionKey, typeof body.model === 'string' ? body.model : undefined)
                const portableFriendlyId =
                  resolvedFriendlyId ||
                  requestedFriendlyId ||
                  rawSessionKey ||
                  portableSessionKey
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
                  const userContent = buildMultimodalContent(
                    message,
                    attachments,
                  )
                  // Inject locale preference so the agent responds in the user's language
                  const locale = typeof body.locale === 'string' ? body.locale.trim() : ''
                  const localeSystemMsg: Array<OpenAICompatMessage> = locale && locale !== 'en'
                    ? [{ role: 'system', content: `Respond in ${locale === 'es' ? 'Spanish' : locale === 'fr' ? 'French' : locale === 'zh' ? 'Chinese' : locale === 'de' ? 'German' : locale === 'ja' ? 'Japanese' : locale === 'ko' ? 'Korean' : locale === 'pt' ? 'Portuguese' : locale === 'ru' ? 'Russian' : locale === 'ar' ? 'Arabic' : 'English'}. The user's interface is set to this language.` }]
                    : []
                  // Load persisted history for this session, then append user message
                  const persistedMessages = getLocalMessages(portableSessionKey)
                  const persistedHistory = persistedMessages.map(m => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content,
                  }))
                  // Persist user message AFTER reading history to avoid duplication
                  appendLocalMessage(portableSessionKey, {
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: typeof body.message === 'string' ? body.message : '',
                    timestamp: Date.now(),
                  })
                  // Use persisted history if available, otherwise fall back to client-sent history
                  const effectiveHistory = persistedHistory.length > 0 ? persistedHistory : history
                  const portableMessages: Array<OpenAICompatMessage> = [
                    ...localeSystemMsg,
                    ...effectiveHistory,
                    {
                      role: 'user',
                      content: userContent,
                    },
                  ]
                  const stream = await openaiChat(portableMessages, {
                    model: localBaseUrl ? bareModel : (typeof body.model === 'string' ? body.model : undefined),
                    temperature:
                      typeof body.temperature === 'number'
                        ? body.temperature
                        : undefined,
                    signal: abortController.signal,
                    stream: true,
                    sessionId: portableSessionKey,
                    baseUrl: localBaseUrl,
                  })

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

                  // Persist assistant response to local session store
                  appendLocalMessage(portableSessionKey, {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: accumulated,
                    timestamp: Date.now(),
                  })
                  touchLocalSession(portableSessionKey)

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
                  model:
                    typeof body.model === 'string' ? body.model : undefined,
                  system_message: thinking,
                  attachments: attachments || undefined,
                },
                {
                  signal: abortController.signal,
                  onEvent({ event, data }) {
                    const sessionKeyFromEvent =
                      typeof data.session_id === 'string' &&
                      data.session_id.trim()
                        ? data.session_id
                        : sessionKey
                    const runId =
                      typeof data.run_id === 'string' && data.run_id.trim()
                        ? data.run_id
                        : (activeRunId ?? undefined)

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
                        data.user_message &&
                        typeof data.user_message === 'object'
                          ? (data.user_message as Record<string, unknown>)
                          : null
                      if (userMessage) {
                        skipPublish ||
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
                      skipPublish || publishChatEvent('message', translated)
                      return
                    }

                    if (event === 'assistant.completed') {
                      // Send full content as a chunk — covers cases where
                      // deltas were missed or response was too short for streaming
                      const content =
                        typeof data.content === 'string' ? data.content : ''
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
                      const delta =
                        typeof data.delta === 'string' ? data.delta : ''
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
                      const preview =
                        typeof data.preview === 'string'
                          ? data.preview
                          : undefined
                      const translated = {
                        phase:
                          event === 'tool.pending' || event === 'tool.started'
                            ? 'start'
                            : 'calling',
                        name: toolName,
                        toolCallId: getToolCallId(data, runId, toolName),
                        args: getToolArgs(data),
                        preview,
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
                        args: getToolArgs(data),
                        result: resultPreview.slice(0, 4000),
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
                        name: readString(data.tool_name) || 'artifact',
                        title:
                          readString(artifact.title) ||
                          readString(data.title) ||
                          'Artifact created',
                        kind:
                          readString(artifact.kind) ||
                          readString(data.kind) ||
                          'artifact',
                        path:
                          readString(artifact.path) || readString(data.path) || '',
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      sendEvent('artifact', translated)
                      skipPublish || publishChatEvent('artifact', translated)
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
                          (data.error as Record<string, unknown> | undefined)
                            ?.message,
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
                          (data.error as Record<string, unknown> | undefined)
                            ?.message,
                        ) ||
                        readString(data.message) ||
                        'Hermes stream error'
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
              streamTimeoutTimer = setTimeout(() => {
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
            'Content-Type': 'text/event-stream; charset=utf-8',
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
