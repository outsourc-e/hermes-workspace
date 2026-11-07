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
  getSession,
  listSessions,
  streamChat,
} from '../../server/hermes-api'
import {
  normalizeAttachments,
  buildMultimodalContent,
  getChatMessage,
  normalizePortableHistory,
  normalizeHermesErrorMessage,
  readString,
  getToolName,
  getToolCallId,
  getToolArgs,
  getToolResultPreview,
} from '../../server/send-stream-helpers'
import type {OpenAICompatMessage} from '../../server/openai-compat-api';
// Hermes agent runs can take 5+ minutes with complex tool chains
const SEND_STREAM_RUN_TIMEOUT_MS = 600_000
const SESSION_BOOTSTRAP_KEYS = new Set(['main', 'new'])

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
                  let toolEventCount = 0
                  for await (const chunk of stream) {
                    if (chunk.type === 'reasoning') {
                      thinking += chunk.text
                      sendEvent('thinking', {
                        text: thinking,
                        sessionKey: portableSessionKey,
                        runId,
                      })
                    } else if (chunk.type === 'tool') {
                      toolEventCount += 1
                      sendEvent('tool', {
                        phase: 'start',
                        name: chunk.name,
                        toolCallId: `${runId}:${chunk.name}:${toolEventCount}`,
                        preview: chunk.label,
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
                // 'main' should land in the user's real active chat session,
                // not an older titled thread. Skip cron and Operations sessions,
                // prefer the most recently active session with messages, and
                // only fall back to a titled session when nothing active exists.
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
                    const active = recent.find(
                      (s) =>
                        !isInternal(s.id) &&
                        typeof s.message_count === 'number' &&
                        s.message_count > 0,
                    )
                    const titled = active
                      ? null
                      : recent.find(
                          (s) => !isInternal(s.id) && hasRealTitle(s),
                        )
                    const candidate = active ?? titled
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

              // Session-create vs first-send race: the client may reference a
              // session id before the gateway's POST /api/sessions for it has
              // completed. Observed as gateway 404 session_not_found
              // (2026-11-02, d352cbe8…, access log: stream 1 ms before the
              // 201 create). Ensure the gateway holds the session,
              // re-creating it idempotently when it is still unknown,
              // before streaming.
              if (!SESSION_BOOTSTRAP_KEYS.has(sessionKey)) {
                try {
                  await getSession(sessionKey)
                } catch {
                  try {
                    const ensured = await createSession({ id: sessionKey })
                    sessionKey = ensured.id
                    resolvedFriendlyId = ensured.id
                  } catch {
                    // Let streamChat surface the original gateway error.
                  }
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
