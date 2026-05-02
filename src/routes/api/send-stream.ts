import { createFileRoute } from '@tanstack/react-router'
import { buildResolvedSessionHeaders } from '../../lib/send-stream-session-headers'
import { resolveSessionKey } from '../../server/session-utils'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'
import { publishChatEvent } from '../../server/chat-event-bus'
import {
  registerActiveSendRun,
  unregisterActiveSendRun,
} from '../../server/send-run-tracker'
import {
  appendRunText,
  createPersistedRun,
  markRunStatus,
  setRunThinking,
  upsertRunToolCall,
} from '../../server/run-store'
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
  getMessages as getSessionMessagesFromAgent,
  listSessions,
  streamChat,
} from '../../server/claude-api'
import type {OpenAICompatContentPart, OpenAICompatMessage} from '../../server/openai-compat-api';
// Claude agent runs can take 5+ minutes with complex tool chains
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

function normalizeClaudeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.trim()
  if (!message) return 'Claude request failed'
  return message.replace(/\bserver\b/gi, 'Claude')
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
          const errorMsg = normalizeClaudeErrorMessage(err)
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
        let activeRunSessionKey: string | null = null
        let persistedRunReady: Promise<unknown> | null = null
        let unregisterTimer: ReturnType<typeof setTimeout> | null = null
        let streamTimeoutTimer: ReturnType<typeof setTimeout> | null = null
        let heartbeatTimer: ReturnType<typeof setInterval> | null = null
        const abortController = new AbortController()
        let closeStream = () => {
          streamClosed = true
        }

        const stream = new ReadableStream({
          async start(controller) {
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null
            let lastClientEventAt = Date.now()
            const enqueueRaw = (payload: string) => {
              if (streamClosed) return
              controller.enqueue(encoder.encode(payload))
            }
            const sendEvent = (event: string, data: unknown) => {
              if (streamClosed) return
              lastClientEventAt = Date.now()
              const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
              enqueueRaw(payload)
            }

            // Cloudflare Tunnel/Access can otherwise leave small SSE streams idle
            // long enough that the browser-side fetch is canceled before visible
            // assistant chunks arrive. Send an initial padding comment and a
            // lightweight recognized event periodically so public Workspace chats
            // do not sit at "Thinking…" until the frontend reports failure.
            enqueueRaw(`: ${' '.repeat(2048)}\n\n`)
            heartbeatTimer = setInterval(() => {
              if (streamClosed) return
              if (Date.now() - lastClientEventAt < 10_000) return
              // Heartbeat to keep Cloudflare/Access from culling the SSE stream.
              // Use a dedicated hb_signal event (not 'thinking') so it does not
              // pollute the TUI activity card with fake thinking text. Send a
              // tiny SSE comment as the actual keepalive byte.
              sendEvent('hb_signal', { sessionKey })
              enqueueRaw(': keepalive\n\n')
            }, 10_000)

            closeStream = () => {
              if (streamClosed) return
              streamClosed = true
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
              }
              if (unregisterTimer) {
                clearTimeout(unregisterTimer)
                unregisterTimer = null
              }
              if (streamTimeoutTimer) {
                clearTimeout(streamTimeoutTimer)
                streamTimeoutTimer = null
              }
              if (heartbeatTimer) {
                clearInterval(heartbeatTimer)
                heartbeatTimer = null
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

            // Keep the SSE stream alive during long agent processing (tool calls,
            // slow LLM responses on large contexts). Without this the client-side
            // no-activity timer fires after 2-3 min and aborts the stream.
            heartbeatTimer = setInterval(() => {
              sendEvent('heartbeat', { timestamp: Date.now() })
            }, 30_000)

            const persistRunStarted = (
              runId: string | undefined,
              runSessionKey: string,
              friendlyId: string,
            ) => {
              if (!runId || persistedRunReady) return
              activeRunSessionKey = runSessionKey
              persistedRunReady = createPersistedRun({
                runId,
                sessionKey: runSessionKey,
                friendlyId,
              }).catch(() => null)
            }

            const persistActiveRun = (
              write: (sessionKey: string, runId: string) => Promise<unknown>,
            ) => {
              if (!activeRunId || !activeRunSessionKey) return
              const runId = activeRunId
              const runSessionKey = activeRunSessionKey
              void (persistedRunReady ?? Promise.resolve())
                .then(() => write(runSessionKey, runId))
                .catch(() => null)
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
                persistRunStarted(runId, portableSessionKey, portableFriendlyId)
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
                  let toolEventCount = 0
                  for await (const chunk of stream) {
                    if (chunk.type === 'reasoning') {
                      thinking += chunk.text
                      persistActiveRun((runSessionKey, activeId) =>
                        setRunThinking(runSessionKey, activeId, thinking),
                      )
                      sendEvent('thinking', {
                        text: thinking,
                        sessionKey: portableSessionKey,
                        runId,
                      })
                    } else if (chunk.type === 'tool') {
                      toolEventCount += 1
                      const toolCallId = `${runId}:${chunk.name}:${toolEventCount}`
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: toolCallId,
                          name: chunk.name || 'tool',
                          phase: 'start',
                          preview: chunk.label,
                        }),
                      )
                      sendEvent('tool', {
                        phase: 'start',
                        name: chunk.name,
                        toolCallId,
                        preview: chunk.label,
                        sessionKey: portableSessionKey,
                        runId,
                      })
                    } else {
                      accumulated += chunk.text
                      persistActiveRun((runSessionKey, activeId) =>
                        appendRunText(runSessionKey, activeId, accumulated, {
                          replace: true,
                        }),
                      )
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

                  persistActiveRun((runSessionKey, activeId) =>
                    markRunStatus(runSessionKey, activeId, 'complete'),
                  )
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
                    const errorMessage = normalizeClaudeErrorMessage(err)
                    persistActiveRun((runSessionKey, activeId) =>
                      markRunStatus(runSessionKey, activeId, 'error', errorMessage),
                    )
                    sendEvent('error', {
                      message: errorMessage,
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
                // 'main' should land in the user's existing main chat,
                // not spin up a brand new session every time. Skip cron
                // and Operations per-agent sessions so the orchestrator
                // chat doesn't latch onto them.
                let reused: string | null = null
                if (sessionKey === 'main') {
                  try {
                    const recent = await listSessions(30, 0)
                    const isInternal = (id: string) =>
                      id.startsWith('cron_') ||
                      id.startsWith('cron:') ||
                      id.startsWith('agent:main:ops-')
                    const hasRealTitle = (s: {
                      id: string
                      title?: string | null
                    }) => {
                      const t = (s.title ?? '').trim()
                      return t.length > 0 && t !== s.id
                    }
                    const titled = recent.find(
                      (s) => !isInternal(s.id) && hasRealTitle(s),
                    )
                    const fallback = titled
                      ? null
                      : recent.find(
                          (s) =>
                            !isInternal(s.id) &&
                            typeof s.message_count === 'number' &&
                            s.message_count > 0,
                        )
                    const candidate = titled ?? fallback
                    if (candidate) reused = candidate.id
                  } catch {
                    // fall through to createSession()
                  }
                }
                if (reused) {
                  sessionKey = reused
                  resolvedFriendlyId = reused
                } else {
                  const session = await createSession()
                  sessionKey = session.id
                  resolvedFriendlyId = session.id
                }
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
                  async onEvent({ event, data }) {
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
                      persistRunStarted(
                        runId,
                        sessionKeyFromEvent,
                        sessionKeyFromEvent,
                      )
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
                            source: 'claude',
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
                        persistActiveRun((runSessionKey, activeId) =>
                          appendRunText(runSessionKey, activeId, content, {
                            replace: true,
                          }),
                        )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        appendRunText(runSessionKey, activeId, delta),
                      )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: translated.toolCallId,
                          name: toolName,
                          phase: translated.phase,
                          args: translated.args,
                          preview,
                        }),
                      )
                      sendEvent('tool', translated)
                      skipPublish || publishChatEvent('tool', translated)
                      return
                    }

                    if (event === 'tool.progress') {
                      const delta = readString(data.delta)
                      const toolName = getToolName(data)
                      if (toolName === '_thinking' || toolName === 'tool') {
                        if (!delta) return
                        persistActiveRun((runSessionKey, activeId) =>
                          setRunThinking(runSessionKey, activeId, delta),
                        )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: translated.toolCallId,
                          name: toolName,
                          phase: 'calling',
                          args: translated.args,
                          result: translated.result,
                        }),
                      )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: translated.toolCallId,
                          name: toolName,
                          phase: 'complete',
                          args: translated.args,
                          result: translated.result,
                        }),
                      )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: translated.toolCallId || `${runId || 'run'}:memory`,
                          name: 'memory',
                          phase: 'complete',
                          result: translated.result,
                        }),
                      )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: translated.toolCallId || `${runId || 'run'}:skill`,
                          name: 'skill',
                          phase: 'complete',
                          result: translated.result,
                        }),
                      )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: translated.toolCallId,
                          name: toolName,
                          phase: 'error',
                          result: translated.result,
                        }),
                      )
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
                      persistActiveRun((runSessionKey, activeId) =>
                        markRunStatus(
                          runSessionKey,
                          activeId,
                          'error',
                          errorMessage,
                        ),
                      )
                      sendEvent('error', {
                        message: errorMessage,
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      })
                      closeStream()
                      return
                    }

                    if (event === 'run.completed') {
                      // Backfill tool calls from session history.
                      // Hermes Agent currently does not stream tool.* events
                      // reliably, but it persists tool calls on the assistant
                      // message. Fetch the latest assistant message and emit
                      // synthetic 'tool' events for each tool call so the
                      // Workspace UI can render the Activity card.
                      try {
                        const sid =
                          readString(data.session_id) ||
                          sessionKeyFromEvent ||
                          ''
                        if (sid) {
                          let persistedMessages: Array<
                            Record<string, unknown>
                          > = []
                          try {
                            persistedMessages =
                              (await getSessionMessagesFromAgent(
                                sid,
                              )) as unknown as Array<Record<string, unknown>>
                          } catch {
                            persistedMessages = []
                          }
                          // Walk back to the most recent assistant message in
                          // this run; tool_calls are siblings on it. Also
                          // collect tool_result entries that immediately
                          // follow it so we can pair input/output.
                          const recent = persistedMessages.slice(-12) as Array<
                            Record<string, unknown>
                          >
                          let lastAssistantIndex = -1
                          for (let i = recent.length - 1; i >= 0; i--) {
                            const m = recent[i] as Record<string, unknown>
                            if (m && m.role === 'assistant') {
                              lastAssistantIndex = i
                              break
                            }
                          }
                          if (lastAssistantIndex >= 0) {
                            const lastAssistant = recent[
                              lastAssistantIndex
                            ] as Record<string, unknown>
                            const rawToolCalls = (lastAssistant.tool_calls ??
                              (lastAssistant as any).toolCalls) as
                              | Array<Record<string, unknown>>
                              | undefined
                            const toolCalls =
                              Array.isArray(rawToolCalls) && rawToolCalls.length
                                ? rawToolCalls
                                : []

                            // Build a map of tool_call_id -> result text by
                            // scanning the messages after the last assistant.
                            const resultByCallId = new Map<string, string>()
                            const errorByCallId = new Map<string, boolean>()
                            for (
                              let i = lastAssistantIndex + 1;
                              i < recent.length;
                              i++
                            ) {
                              const m = recent[i] as Record<string, unknown>
                              if (
                                !m ||
                                (m.role !== 'tool' &&
                                  m.role !== 'tool_result')
                              ) {
                                continue
                              }
                              const callId =
                                readString(m.tool_call_id) ||
                                readString((m as any).toolCallId) ||
                                ''
                              if (!callId) continue
                              const content = m.content
                              let text = ''
                              if (typeof content === 'string') {
                                text = content
                              } else if (Array.isArray(content)) {
                                text = content
                                  .map((p: any) =>
                                    typeof p?.text === 'string' ? p.text : '',
                                  )
                                  .filter(Boolean)
                                  .join('\n')
                              }
                              resultByCallId.set(callId, text)
                              const isErr =
                                Boolean((m as any).is_error) ||
                                Boolean((m as any).isError)
                              if (isErr) errorByCallId.set(callId, true)
                            }
                            for (const tc of toolCalls) {
                              const tcRecord = tc as Record<string, unknown>
                              const tcFn = readRecord(tcRecord.function)
                              const id =
                                readString(tcRecord.id) ||
                                readString(tcRecord.tool_call_id) ||
                                `${runId || 'run'}:tool:${Math.random().toString(36).slice(2, 8)}`
                              const name =
                                readString(tcRecord.tool_name) ||
                                readString(tcRecord.name) ||
                                readString(tcFn?.name) ||
                                'tool'
                              const args = parseJsonIfPossible(
                                tcFn?.arguments ?? tcRecord.arguments,
                              )
                              const resultText = resultByCallId.get(id) ?? ''
                              const isErr = errorByCallId.get(id) === true
                              const synthetic = {
                                phase: isErr ? 'error' : 'complete',
                                name,
                                toolCallId: id,
                                args,
                                result: resultText,
                                sessionKey: sessionKeyFromEvent,
                                runId,
                              }
                              persistActiveRun(
                                (runSessionKey, activeId) =>
                                  upsertRunToolCall(
                                    runSessionKey,
                                    activeId,
                                    {
                                      id: synthetic.toolCallId,
                                      name: synthetic.name,
                                      phase: synthetic.phase,
                                      args: synthetic.args,
                                      result: synthetic.result,
                                    },
                                  ),
                              )
                              sendEvent('tool', synthetic)
                              skipPublish ||
                                publishChatEvent('tool', synthetic)
                            }
                          }
                        }
                      } catch (err) {
                        // Backfill is best-effort; don't fail the run.
                        console.warn(
                          '[send-stream] tool backfill failed:',
                          err,
                        )
                      }

                      const translated = {
                        state: 'complete',
                        sessionKey: sessionKeyFromEvent,
                        runId,
                      }
                      persistActiveRun((runSessionKey, activeId) =>
                        markRunStatus(runSessionKey, activeId, 'complete'),
                      )
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
                const errorMsg = normalizeClaudeErrorMessage(err)
                sendEvent('error', {
                  message: errorMsg,
                  sessionKey,
                })
                closeStream()
              }
            }
          },
          cancel() {
            // Browser navigation/unmount cancels the response reader. That
            // must not cancel the Hermes run itself: the chat/conductor should
            // keep thinking server-side so the user can return and recover the
            // answer from session history. Mark this client stream closed so we
            // stop enqueueing SSE chunks, but deliberately leave the upstream
            // abortController alone.
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
              persistActiveRun((runSessionKey, activeId) =>
                markRunStatus(runSessionKey, activeId, 'handoff'),
              )
              unregisterActiveSendRun(activeRunId)
              activeRunId = null
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
            ...buildResolvedSessionHeaders({
              sessionKey,
              friendlyId: resolvedFriendlyId,
            }),
          },
        })
      },
    },
  },
})
