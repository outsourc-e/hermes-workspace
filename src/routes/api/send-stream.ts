import { createFileRoute } from '@tanstack/react-router'
import { buildResolvedSessionHeaders } from '../../lib/send-stream-session-headers'
import { buildWorkspaceScopedTextMessage } from '../../lib/workspace-message-scope'
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
  createRunTextPersistenceBuffer,
  markRunStatus,
  migratePersistedRun,
  setRunThinking,
  upsertRunToolCall,
} from '../../server/run-store'
import { getChatMode } from '../../server/gateway-capabilities'
import { sessionCardService } from '../../server/session-card-service'
import {
  appendLocalMessage,
  ensureLocalSession,
  getLocalMessages,
  touchLocalSession,
} from '../../server/local-session-store'
import {
  getDiscoveredModels,
  getLocalProviderDef,
} from '../../server/local-provider-discovery'
import { openaiChat } from '../../server/openai-compat-api'
import { streamResponses } from '../../server/responses-api'
import { selectPortableConversationHistory } from '../../server/portable-history'
import {
  SESSIONS_API_UNAVAILABLE_MESSAGE,
  createSession,
  ensureGatewayProbed,
  getGatewayCapabilities,
  getLatestDescendant,
  getSession,
  getMessages as getSessionMessagesFromAgent,
  listSessions,
  streamChat,
} from '../../server/claude-api'
import { loadWorkspaceCatalog } from './workspace'
import {
  collectSyntheticLiveToolEvents,
  createSyntheticLiveToolTracker,
} from './-send-stream-live-tools'
import { createSseHeartbeatLifecycle } from './-send-stream-heartbeat'
import {
  createRunTerminalTransitionCoordinator,
  finalizeRunTerminalStream,
} from './-send-stream-terminal'
import {
  createStreamEventProvenanceTracker,
  hasNonParentStreamFacts,
  resolveAuthoritativeBootstrapHandoff,
  resolveAuthoritativeCardStreamHandoff,
  resolveAuthoritativeSessionSource,
  resolveAuthoritativeStreamHandoff,
} from './-send-stream-session-handoff'
import type {
  OpenAICompatContentPart,
  OpenAICompatMessage,
} from '../../server/openai-compat-api'
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
          b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
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
        // Establish the route lifetime before any await. Request aborts during
        // gateway probing, body parsing, or session/workspace resolution must
        // prevent the SSE stream (and all of its timers/work) from starting.
        let streamClosed = false
        let activeRunId: string | null = null
        let persistedRunId: string | null = null
        let activeRunSessionKey: string | null = null
        let persistedRunReady: Promise<unknown> | null = null
        let runTextBuffer: ReturnType<
          typeof createRunTextPersistenceBuffer
        > | null = null
        let unregisterTimer: ReturnType<typeof setTimeout> | null = null
        let streamTimeoutTimer: ReturnType<typeof setTimeout> | null = null
        let stopLivePolling: () => void = () => undefined
        const abortController = new AbortController()
        const streamTimeoutError = new Error('Stream timeout')
        const streamAbortError = new Error('Stream aborted')
        let rejectStreamLifetime: ((reason: Error) => void) | null = null
        let streamLifetimeSettled = false
        const streamLifetime = new Promise<never>((_resolve, reject) => {
          rejectStreamLifetime = reject
        })
        // The lifetime signal is also rejected on ordinary terminal closure, when
        // no route-owned await may still be racing it.
        void streamLifetime.catch(() => undefined)
        const settleStreamLifetime = (reason: Error) => {
          if (streamLifetimeSettled) return
          streamLifetimeSettled = true
          rejectStreamLifetime?.(reason)
          rejectStreamLifetime = null
        }
        const streamTransportUnavailable = () =>
          streamClosed || abortController.signal.aborted
        const ensureStreamTransportAvailable = () => {
          if (streamTransportUnavailable()) throw streamAbortError
        }
        const waitWithinStreamLifetime = <T>(pending: Promise<T>): Promise<T> =>
          Promise.race([pending, streamLifetime])
        const streamTimeoutResponse = () =>
          new Response(
            JSON.stringify({ ok: false, error: streamTimeoutError.message }),
            {
              status: 504,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        // Close out the SSE stream — stop enqueueing, clear timers, and
        // abort the upstream Hermes gateway request so the agent stops
        // processing. Does not touch persisted run status.
        let closeStream = () => {
          if (streamClosed) return
          streamClosed = true
          stopLivePolling()
          if (unregisterTimer) {
            clearTimeout(unregisterTimer)
            unregisterTimer = null
          }
          if (streamTimeoutTimer) {
            clearTimeout(streamTimeoutTimer)
            streamTimeoutTimer = null
          }
          settleStreamLifetime(streamAbortError)
          abortController.abort()
        }
        let handleStreamDeadline = () => {
          settleStreamLifetime(streamTimeoutError)
          closeStream()
        }
        const finishPreStreamResponse = (response: Response) => {
          closeStream()
          return response
        }
        let handleObservedRequestAbort = () => closeStream()
        const observeRequestAbort = () => handleObservedRequestAbort()
        request.signal.addEventListener('abort', observeRequestAbort, {
          once: true,
        })
        const abortedResponse = () => new Response(null, { status: 499 })
        if (request.signal.aborted) {
          observeRequestAbort()
          return abortedResponse()
        }

        // Auth check
        if (!isAuthenticated(request)) {
          return new Response(
            JSON.stringify({ ok: false, error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        // One absolute deadline owns the complete route lifetime. Start it
        // before the first preflight await so gateway/body/session/workspace
        // stalls consume the same budget as production and terminal writes.
        streamTimeoutTimer = setTimeout(
          () => handleStreamDeadline(),
          SEND_STREAM_RUN_TIMEOUT_MS,
        )
        try {
          await waitWithinStreamLifetime(ensureGatewayProbed())
          ensureStreamTransportAvailable()
        } catch (error) {
          if (error === streamTimeoutError) {
            return finishPreStreamResponse(streamTimeoutResponse())
          }
          if (error === streamAbortError || streamTransportUnavailable()) {
            return finishPreStreamResponse(abortedResponse())
          }
          closeStream()
          throw error
        }

        // Read body manually to handle large payloads (image attachments
        // can push the JSON body above the default ~1MB parse limit).
        let body: Record<string, unknown> = {}
        try {
          const rawBody = await waitWithinStreamLifetime(request.text())
          ensureStreamTransportAvailable()
          body = JSON.parse(rawBody) as Record<string, unknown>
        } catch (error) {
          if (error === streamTimeoutError) {
            return finishPreStreamResponse(streamTimeoutResponse())
          }
          if (error === streamAbortError || streamTransportUnavailable()) {
            return finishPreStreamResponse(abortedResponse())
          }
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
          return finishPreStreamResponse(
            new Response(
              JSON.stringify({ ok: false, error: 'message required' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          )
        }

        // Resolve session key
        let sessionKey: string
        let resolvedFriendlyId: string
        try {
          const resolved = await waitWithinStreamLifetime(
            resolveSessionKey({
              rawSessionKey,
              friendlyId: requestedFriendlyId,
              defaultKey: 'main',
            }),
          )
          ensureStreamTransportAvailable()
          sessionKey = resolved.sessionKey
          resolvedFriendlyId = resolved.sessionKey
        } catch (err) {
          if (err === streamTimeoutError) {
            return finishPreStreamResponse(streamTimeoutResponse())
          }
          if (err === streamAbortError || streamTransportUnavailable()) {
            return finishPreStreamResponse(abortedResponse())
          }
          const errorMsg = normalizeClaudeErrorMessage(err)
          if (errorMsg === 'session not found') {
            return finishPreStreamResponse(
              new Response(
                JSON.stringify({ ok: false, error: 'session not found' }),
                {
                  status: 404,
                  headers: { 'Content-Type': 'application/json' },
                },
              ),
            )
          }
          return finishPreStreamResponse(
            new Response(JSON.stringify({ ok: false, error: errorMsg }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }),
          )
        }

        // Check if the selected model is a local provider model — force portable + direct routing
        let chatMode = getChatMode()
        let localBaseUrl: string | undefined
        const requestModel = typeof body.model === 'string' ? body.model : ''
        const bareModel = requestModel.includes('/')
          ? requestModel.split('/').slice(1).join('/')
          : requestModel
        if (requestModel) {
          const discoveredModels = getDiscoveredModels()
          const localMatch = discoveredModels.find(
            (m) => m.id === requestModel || m.id === bareModel,
          )
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

        let workspaceScope: Awaited<
          ReturnType<typeof loadWorkspaceCatalog>
        > | null = null
        try {
          workspaceScope = await waitWithinStreamLifetime(
            loadWorkspaceCatalog(),
          )
          ensureStreamTransportAvailable()
        } catch (error) {
          if (error === streamTimeoutError) {
            return finishPreStreamResponse(streamTimeoutResponse())
          }
          if (error === streamAbortError || streamTransportUnavailable()) {
            return finishPreStreamResponse(abortedResponse())
          }
        }
        const scopedMessage = buildWorkspaceScopedTextMessage(
          getChatMessage(message, attachments),
          workspaceScope,
        )

        // Create streaming response using the SHARED server connection
        const encoder = new TextEncoder()

        const terminalRunTransition = createRunTerminalTransitionCoordinator({
          sealTranscript: async () => {
            await runTextBuffer?.seal()
          },
          persist: async (status, errorMessage) => {
            const runId = persistedRunId
            if (!runId) return
            await (persistedRunReady ?? Promise.resolve())
            const runSessionKey = activeRunSessionKey
            if (!runSessionKey) return
            await markRunStatus(runSessionKey, runId, status, errorMessage)
          },
        })

        // When the client hits Stop / navigates away / closes the tab, the
        // request.signal fires abort. Stop the upstream agent immediately, then
        // observe terminal persistence without allowing seal rejection to leak.
        function handleAbort() {
          if (!streamClosed) {
            const terminalPersistence = persistedRunId
              ? persistTerminalRun('handoff')
              : Promise.resolve()
            if (activeRunId) {
              unregisterActiveSendRun(activeRunId)
              activeRunId = null
            }
            void finalizeTerminalPersistence(
              terminalPersistence,
              undefined,
              true,
            )
          }
        }
        handleObservedRequestAbort = handleAbort

        const persistRunStarted = (
          runId: string | undefined,
          runSessionKey: string,
          friendlyId: string,
        ) => {
          if (!runId || persistedRunReady) return
          persistedRunId = runId
          activeRunSessionKey = runSessionKey
          persistedRunReady = createPersistedRun({
            runId,
            sessionKey: runSessionKey,
            friendlyId,
          }).catch(() => null)
          runTextBuffer = createRunTextPersistenceBuffer(
            async (text, options) => {
              await (persistedRunReady ?? Promise.resolve())
              const targetRunSessionKey = activeRunSessionKey
              if (!targetRunSessionKey) return null
              return appendRunText(targetRunSessionKey, runId, text, options)
            },
          )
        }

        const migrateActivePersistedRun = async (
          fromSessionKey: string,
          toSessionKey: string,
          friendlyId: string,
        ) => {
          const runId = persistedRunId
          if (
            !runId ||
            !persistedRunReady ||
            fromSessionKey === toSessionKey ||
            streamTransportUnavailable()
          ) {
            return
          }

          try {
            await waitWithinStreamLifetime(
              runTextBuffer?.flush() ?? Promise.resolve(),
            )
            if (streamTransportUnavailable()) return

            const priorRunReady = persistedRunReady
            const migrationReady = (async () => {
              await waitWithinStreamLifetime(priorRunReady)
              if (streamTransportUnavailable()) return

              const migration = migratePersistedRun(
                fromSessionKey,
                toSessionKey,
                runId,
                friendlyId,
              )
              // The underlying file operation is not cancellable. Observe a late
              // rejection, while the shared lifetime race prevents it from keeping
              // this route or a successor run alive after transport closure.
              void migration.catch(() => undefined)
              const migratedRun = await waitWithinStreamLifetime(migration)
              if (streamTransportUnavailable()) return
              if (
                migratedRun?.sessionKey === toSessionKey &&
                migratedRun.runId === runId
              ) {
                activeRunSessionKey = toSessionKey
              }
            })().catch(() => undefined)
            // Publish the serialization barrier synchronously so polling writes
            // cannot slip between the prior queue and the migration.
            persistedRunReady = migrationReady
            await waitWithinStreamLifetime(migrationReady)
            if (streamTransportUnavailable()) return
          } catch (error) {
            if (
              error === streamTimeoutError ||
              error === streamAbortError ||
              streamTransportUnavailable()
            ) {
              return
            }
            // Persisted-run migration is best effort. Keep subsequent writes on
            // the last authoritative durable owner when migration fails.
          }
        }

        const persistActiveRun = (
          write: (sessionKey: string, runId: string) => Promise<unknown>,
        ) => {
          if (terminalRunTransition.isSealed()) return
          if (!activeRunId || !activeRunSessionKey) return
          const runId = activeRunId
          const runSessionKey = activeRunSessionKey
          persistedRunReady = (persistedRunReady ?? Promise.resolve())
            .then(() => write(runSessionKey, runId))
            .catch(() => null)
        }

        const persistRunText = (text: string, replace = false) => {
          if (terminalRunTransition.isSealed()) return
          if (replace) runTextBuffer?.replace(text)
          else runTextBuffer?.append(text)
        }

        async function persistTerminalRun(
          status: 'handoff' | 'complete' | 'error',
          errorMessage?: string,
        ): Promise<void> {
          await terminalRunTransition.transition(status, errorMessage)
        }

        async function finalizeTerminalPersistence(
          terminalPersistence: Promise<void>,
          onPersisted?: () => void,
          closeBeforePersistence = false,
        ): Promise<void> {
          await finalizeRunTerminalStream({
            terminalPersistence,
            onPersisted,
            closeStream,
            closeBeforePersistence,
          })
        }

        const stream = new ReadableStream({
          async start(controller) {
            // Track the last human-readable activity so the heartbeat can
            // forward it to the UI. Without this the ThinkingBubble shows a
            // static "Thinking…" for minutes when the agent is reasoning
            // without tool calls, making it look hung.
            let lastActivity: string | null = null
            let heartbeatLifecycle: ReturnType<
              typeof createSseHeartbeatLifecycle
            > | null = null
            const enqueueRaw = (payload: string) => {
              if (streamClosed) return
              controller.enqueue(encoder.encode(payload))
            }
            const sendEvent = (event: string, data: unknown) => {
              if (streamClosed) return
              heartbeatLifecycle?.noteClientEvent()
              const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
              enqueueRaw(payload)
            }

            heartbeatLifecycle = createSseHeartbeatLifecycle({
              intervalMs: 10_000,
              getActivity: () => lastActivity,
              sendActivityHeartbeat: (payload) => {
                sendEvent('heartbeat', payload)
              },
              sendProxyKeepalive: () => {
                // Use a dedicated hb_signal event (not 'thinking') so it does
                // not pollute the activity card. The tiny comment is the
                // actual keepalive byte for Cloudflare Tunnel/Access.
                sendEvent('hb_signal', { sessionKey })
                enqueueRaw(': keepalive\n\n')
              },
            })

            // Cloudflare Tunnel/Access can otherwise leave small SSE streams idle
            // long enough that the browser-side fetch is canceled before visible
            // assistant chunks arrive. Send initial padding immediately, then use
            // one timer for both proxy keepalive bytes and meaningful UI activity.
            enqueueRaw(`: ${' '.repeat(2048)}\n\n`)
            heartbeatLifecycle.start()

            closeStream = () => {
              if (streamClosed) return
              streamClosed = true
              heartbeatLifecycle?.stop()
              heartbeatLifecycle = null
              stopLivePolling()
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
              settleStreamLifetime(streamAbortError)
              abortController.abort()
              try {
                controller.close()
              } catch {
                // ignore
              }
            }

            handleStreamDeadline = () => {
              if (streamClosed) return
              const terminalPersistence = persistedRunId
                ? persistTerminalRun('error', streamTimeoutError.message)
                : Promise.resolve()
              void terminalPersistence.catch(() => undefined)
              sendEvent('error', {
                message: streamTimeoutError.message,
                sessionKey,
              })
              settleStreamLifetime(streamTimeoutError)
              closeStream()
            }

            try {
              if (chatMode === 'portable') {
                const runId = crypto.randomUUID()
                const portableSessionKey = sessionKey

                // Ensure session exists (user message appended after building history)
                ensureLocalSession(
                  portableSessionKey,
                  typeof body.model === 'string' ? body.model : undefined,
                )
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
                lastActivity = 'Processing your message...'

                try {
                  const userContent = buildMultimodalContent(
                    scopedMessage,
                    attachments,
                  )
                  // Inject locale preference so the agent responds in the user's language
                  const locale =
                    typeof body.locale === 'string' ? body.locale.trim() : ''
                  const localeSystemMsg: Array<OpenAICompatMessage> =
                    locale && locale !== 'en'
                      ? [
                          {
                            role: 'system',
                            content: `Respond in ${locale === 'es' ? 'Spanish' : locale === 'fr' ? 'French' : locale === 'zh' ? 'Chinese' : locale === 'de' ? 'German' : locale === 'ja' ? 'Japanese' : locale === 'ko' ? 'Korean' : locale === 'pt' ? 'Portuguese' : locale === 'ru' ? 'Russian' : locale === 'ar' ? 'Arabic' : 'English'}. The user's interface is set to this language.`,
                          },
                        ]
                      : []
                  // Load persisted history for this session, then append user message.
                  // When the gateway can bind portable chat to a server-side session
                  // via X-Hermes-Session-Id, replaying the entire local transcript on
                  // every turn duplicates prompt context and can trip model limits
                  // on otherwise simple tasks (#405).
                  const persistedMessages = getLocalMessages(portableSessionKey)
                  const persistedHistory = persistedMessages.map((m) => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content,
                  }))
                  // Persist user message AFTER reading history to avoid duplication
                  appendLocalMessage(portableSessionKey, {
                    id: crypto.randomUUID(),
                    role: 'user',
                    content:
                      typeof body.message === 'string' ? body.message : '',
                    timestamp: Date.now(),
                  })
                  const effectiveHistory = selectPortableConversationHistory(
                    persistedHistory,
                    history,
                    { localBaseUrl },
                  )
                  const portableMessages: Array<OpenAICompatMessage> = [
                    ...localeSystemMsg,
                    ...effectiveHistory,
                    {
                      role: 'user',
                      content: userContent,
                    },
                  ]
                  // Vanilla Hermes Agent (>=v0.12.x) ships a structured
                  // Responses-API streaming surface at POST /v1/responses
                  // that carries full tool args + results, unlike the
                  // /v1/chat/completions surface which only emits a thin
                  // hermes.tool.progress lifecycle event. When the user
                  // opts into the Responses path AND we're talking to the
                  // local Hermes gateway (no localBaseUrl override), use
                  // it so the TUI tool card can render INPUT JSON and
                  // tool output text live during the run. Falls back
                  // automatically on any error to the existing
                  // openaiChat path.
                  const useResponsesApi =
                    process.env.HERMES_USE_RESPONSES === '1' && !localBaseUrl
                  if (useResponsesApi) {
                    // Track tool calls by callId so a `tool.completed`
                    // followed by `tool.output` can carry the full
                    // arguments forward without losing them.
                    const toolStateByCallId = new Map<
                      string,
                      {
                        name: string
                        args: Record<string, unknown> | string | null
                      }
                    >()
                    try {
                      const responsesStream = streamResponses({
                        input: scopedMessage,
                        conversationHistory: effectiveHistory,
                        model:
                          typeof body.model === 'string'
                            ? body.model
                            : undefined,
                        sessionId: portableSessionKey,
                        signal: abortController.signal,
                      })
                      for await (const ev of responsesStream) {
                        if (ev.kind === 'text.delta') {
                          accumulated += ev.delta
                          persistRunText(accumulated, true)
                          sendEvent('chunk', {
                            text: accumulated,
                            fullReplace: true,
                            sessionKey: portableSessionKey,
                            runId,
                          })
                          continue
                        }
                        if (ev.kind === 'tool.started') {
                          toolStateByCallId.set(ev.callId, {
                            name: ev.name,
                            args: ev.args,
                          })
                          const argsForCard =
                            ev.args && typeof ev.args === 'object'
                              ? ev.args
                              : undefined
                          persistActiveRun((runSessionKey, activeId) =>
                            upsertRunToolCall(runSessionKey, activeId, {
                              id: ev.callId,
                              name: ev.name,
                              phase: 'calling',
                              args: argsForCard,
                            }),
                          )
                          sendEvent('tool', {
                            phase: 'calling',
                            name: ev.name,
                            toolCallId: ev.callId,
                            args: argsForCard,
                            sessionKey: portableSessionKey,
                            runId,
                          })
                          lastActivity = `Running: ${ev.name.replace(/_/g, ' ')}`
                          continue
                        }
                        if (ev.kind === 'tool.completed') {
                          // Mark as complete but keep the args+result we
                          // accumulated so the card stays expandable.
                          // Vanilla emits tool.completed BEFORE the
                          // matching function_call_output, so we
                          // intentionally do not flip phase to 'complete'
                          // until the output arrives. Otherwise the card
                          // briefly flashes "done" with no result text.
                          continue
                        }
                        if (ev.kind === 'tool.output') {
                          const state = toolStateByCallId.get(ev.callId)
                          const argsForCard =
                            state?.args && typeof state.args === 'object'
                              ? state.args
                              : undefined
                          const name = state?.name || 'tool'
                          persistActiveRun((runSessionKey, activeId) =>
                            upsertRunToolCall(runSessionKey, activeId, {
                              id: ev.callId,
                              name,
                              phase: 'complete',
                              args: argsForCard,
                              result: ev.output,
                            }),
                          )
                          sendEvent('tool', {
                            phase: 'complete',
                            name,
                            toolCallId: ev.callId,
                            args: argsForCard,
                            result: ev.output,
                            sessionKey: portableSessionKey,
                            runId,
                          })
                          lastActivity = `Completed: ${name.replace(/_/g, ' ')}`
                          continue
                        }
                        if (ev.kind === 'completed') {
                          // Final terminal event — fall through to the
                          // shared 'done' emit below.
                          break
                        }
                        throw new Error(ev.error)
                      }
                      appendLocalMessage(portableSessionKey, {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: accumulated,
                        timestamp: Date.now(),
                      })
                      touchLocalSession(portableSessionKey)
                      await finalizeTerminalPersistence(
                        persistTerminalRun('complete'),
                        () => {
                          sendEvent('done', {
                            state: 'complete',
                            sessionKey: portableSessionKey,
                            runId,
                            message: {
                              role: 'assistant',
                              content: [{ type: 'text', text: accumulated }],
                            },
                          })
                        },
                      )
                      return
                    } catch (err) {
                      // Log and fall through to the openaiChat path so a
                      // misconfigured /v1/responses surface (older agent,
                      // CORS issue, network blip) doesn't break the chat.
                      console.warn(
                        '[send-stream] /v1/responses path failed, falling back to /v1/chat/completions:',
                        err,
                      )
                      // Reset accumulated so the fallback starts clean.
                      accumulated = ''
                    }
                  }

                  const stream = await openaiChat(portableMessages, {
                    model: localBaseUrl
                      ? bareModel
                      : typeof body.model === 'string'
                        ? body.model
                        : undefined,
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
                      // Prefer the gateway's stable tool_call_id so 'running'
                      // and 'completed' events for the same call collapse to
                      // one card row. Fall back to a synthetic id only when
                      // the upstream payload lacks one (older Hermes builds).
                      toolEventCount += 1
                      const toolCallId =
                        chunk.toolCallId ||
                        `${runId}:${chunk.name}:${toolEventCount}`
                      // Map upstream status -> internal phase. 'running'
                      // arrives at tool start; 'completed' at finish.
                      // Missing status (back-compat path) is treated as a
                      // one-shot 'calling' to mirror the previous behavior.
                      const phase =
                        chunk.status === 'completed'
                          ? 'complete'
                          : chunk.status === 'running'
                            ? 'calling'
                            : 'start'
                      persistActiveRun((runSessionKey, activeId) =>
                        upsertRunToolCall(runSessionKey, activeId, {
                          id: toolCallId,
                          name: chunk.name || 'tool',
                          phase,
                          preview: chunk.label,
                        }),
                      )
                      sendEvent('tool', {
                        phase,
                        name: chunk.name,
                        toolCallId,
                        preview: chunk.label,
                        sessionKey: portableSessionKey,
                        runId,
                      })
                    } else {
                      accumulated += chunk.text
                      persistRunText(accumulated, true)
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

                  await finalizeTerminalPersistence(
                    persistTerminalRun('complete'),
                    () => {
                      sendEvent('done', {
                        state: 'complete',
                        sessionKey: portableSessionKey,
                        runId,
                        message: {
                          role: 'assistant',
                          content: [
                            ...(thinking
                              ? [{ type: 'thinking', thinking }]
                              : []),
                            { type: 'text', text: accumulated },
                          ],
                        },
                      })
                    },
                  )
                } catch (err) {
                  if (!streamClosed) {
                    const errorMessage = normalizeClaudeErrorMessage(err)
                    await finalizeTerminalPersistence(
                      persistTerminalRun('error', errorMessage),
                      () => {
                        sendEvent('error', {
                          message: errorMessage,
                          sessionKey: portableSessionKey,
                          runId,
                        })
                      },
                    )
                  }
                }
                return
              }

              if (!getGatewayCapabilities().sessions) {
                throw new Error(SESSIONS_API_UNAVAILABLE_MESSAGE)
              }

              const requestedPreStreamSessionKey = sessionKey
              if (SESSION_BOOTSTRAP_KEYS.has(sessionKey)) {
                // 'main' should land in the user's existing main chat,
                // not spin up a brand new session every time. Skip cron
                // and Operations per-agent sessions so the orchestrator
                // chat doesn't latch onto them.
                let reused: string | null = null
                if (sessionKey === 'main') {
                  try {
                    const recent = await waitWithinStreamLifetime(
                      listSessions(30, 0),
                    )
                    ensureStreamTransportAvailable()
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
                  } catch (error) {
                    if (
                      error === streamTimeoutError ||
                      error === streamAbortError ||
                      streamTransportUnavailable()
                    ) {
                      throw error
                    }
                    // fall through to createSession()
                  }
                }
                if (reused) {
                  sessionKey = reused
                  resolvedFriendlyId = reused
                } else {
                  const session =
                    await waitWithinStreamLifetime(createSession())
                  ensureStreamTransportAvailable()
                  sessionKey = session.id
                  resolvedFriendlyId = session.id
                }
              }

              ensureStreamTransportAvailable()

              const bootstrapHandoff = resolveAuthoritativeBootstrapHandoff(
                requestedPreStreamSessionKey,
                sessionKey,
              )
              if (bootstrapHandoff) {
                sendEvent('session_handoff', {
                  ...bootstrapHandoff,
                  friendlyId: bootstrapHandoff.sessionKey,
                  runId: activeRunId,
                })
              }

              let startedSent = false
              // In enhanced mode, the HTTP stream response delivers all events
              // directly to useStreamingMessage. Do not call publishChatEvent here,
              // because useRealtimeChatHistory would create duplicate bubbles.

              // Mid-run tool polling: vanilla Hermes Agent currently does not
              // emit tool.* SSE events live (callback signature drift). Until
              // upstream fixes that, we synthesize live tool events by polling
              // the agent's session messages every ~1.5s during the run and
              // emitting any new tool calls as event: tool with phase complete
              // as soon as their tool_result message lands. The Workspace
              // chat-store dedupes by tool_call_id so this is safe alongside
              // any real live events that might arrive.
              const syntheticLiveToolTracker = createSyntheticLiveToolTracker()
              const liveRunState: { active: boolean } = { active: true }
              let livePollDelayTimer: ReturnType<typeof setTimeout> | null =
                null
              let finishLivePollDelay: (() => void) | null = null
              const waitForLivePoll = (delayMs: number): Promise<void> =>
                new Promise((resolve) => {
                  if (!liveRunState.active) {
                    resolve()
                    return
                  }
                  finishLivePollDelay = () => {
                    if (livePollDelayTimer) clearTimeout(livePollDelayTimer)
                    livePollDelayTimer = null
                    finishLivePollDelay = null
                    resolve()
                  }
                  livePollDelayTimer = setTimeout(
                    () => finishLivePollDelay?.(),
                    delayMs,
                  )
                })
              stopLivePolling = () => {
                liveRunState.active = false
                finishLivePollDelay?.()
              }
              const livePollingStopped = () => !liveRunState.active
              const streamEventProvenance = createStreamEventProvenanceTracker()
              const activeParentSource = await waitWithinStreamLifetime(
                getSession(sessionKey)
                  .then((parentSession) =>
                    resolveAuthoritativeSessionSource(
                      sessionKey,
                      parentSession,
                    ),
                  )
                  .catch(() => null),
              )
              ensureStreamTransportAvailable()
              const livePollIntervalMs = 800
              // Snapshot the session message count at run-start so the poller
              // and the post-run backfill only consider messages persisted by
              // THIS run. Without this, "the most recent assistant with
              // tool_calls" can resolve to the previous turn, surfacing stale
              // tool cards (off-by-one-turn bug).
              let liveBaselineCount = 0
              let liveBaselineSessionKey = sessionKey
              try {
                const baseline = (await waitWithinStreamLifetime(
                  getSessionMessagesFromAgent(sessionKey),
                )) as unknown as Array<Record<string, unknown>>
                ensureStreamTransportAvailable()
                if (Array.isArray(baseline)) liveBaselineCount = baseline.length
              } catch (error) {
                if (
                  error === streamTimeoutError ||
                  error === streamAbortError ||
                  streamTransportUnavailable()
                ) {
                  throw error
                }
                liveBaselineCount = 0
              }
              const livePollerPromise = (async () => {
                // Initial small delay so the agent has time to ingest the
                // user message before we start asking for session state.
                await waitForLivePoll(600)
                if (streamTransportUnavailable()) return
                while (liveRunState.active) {
                  if (streamClosed) break
                  try {
                    const polledSessionKey = sessionKey
                    const polledBaselineCount =
                      polledSessionKey === liveBaselineSessionKey
                        ? liveBaselineCount
                        : 0
                    const allMsgs = (await waitWithinStreamLifetime(
                      getSessionMessagesFromAgent(polledSessionKey),
                    )) as unknown as Array<Record<string, unknown>>
                    if (livePollingStopped() || streamTransportUnavailable()) {
                      break
                    }
                    if (polledSessionKey !== sessionKey) continue
                    if (!Array.isArray(allMsgs) || allMsgs.length === 0) {
                      await waitForLivePoll(livePollIntervalMs)
                      continue
                    }
                    // Only inspect messages added on or after this run started.
                    const msgs = allMsgs.slice(polledBaselineCount)
                    if (msgs.length === 0) {
                      await waitForLivePoll(livePollIntervalMs)
                      continue
                    }
                    const syntheticEvents = collectSyntheticLiveToolEvents({
                      messages: msgs,
                      tracker: syntheticLiveToolTracker,
                      sessionKey: polledSessionKey,
                      runId: activeRunId ?? undefined,
                    })
                    if (syntheticEvents.length === 0) {
                      await waitForLivePoll(livePollIntervalMs)
                      continue
                    }
                    for (const synthetic of syntheticEvents) {
                      sendEvent('tool', synthetic)
                    }
                  } catch {
                    if (streamTransportUnavailable()) break
                    // Best-effort polling; ignore transient errors.
                  }
                  await waitForLivePoll(livePollIntervalMs)
                }
              })()

              try {
                const upstreamStream = streamChat(
                  sessionKey,
                  {
                    message: scopedMessage,
                    model:
                      typeof body.model === 'string' ? body.model : undefined,
                    system_message: thinking,
                    attachments: attachments || undefined,
                  },
                  {
                    signal: abortController.signal,
                    async onEvent({ event, data }) {
                      if (streamTransportUnavailable()) return
                      const upstreamRunId = readString(data.run_id)
                      const runId = upstreamRunId || activeRunId || undefined
                      const upstreamSessionKey = readString(data.session_id)
                      const hasExplicitNonParentFacts = hasNonParentStreamFacts(
                        data,
                        activeParentSource,
                      )
                      let parentLifecycleEligible = false

                      if (hasExplicitNonParentFacts) {
                        // Every explicit conflict is sticky for metadata-poor
                        // tails. The active parent ID itself is never globally
                        // rejected, so later explicit parent events still work.
                        streamEventProvenance.quarantine({
                          sessionKey: upstreamSessionKey,
                          runId: upstreamRunId,
                          sourceIsExplicitlyNonParent:
                            upstreamSessionKey !== sessionKey,
                        })
                      } else if (upstreamSessionKey === sessionKey) {
                        // Explicit current-parent ownership applies to this event
                        // even when another source aliases the same run ID.
                        parentLifecycleEligible = true
                      } else if (upstreamSessionKey) {
                        const mayVerifyContinuation =
                          !SESSION_BOOTSTRAP_KEYS.has(upstreamSessionKey) &&
                          !streamEventProvenance.isExplicitlyRejectedSession(
                            upstreamSessionKey,
                          )
                        const [
                          continuationVerification,
                          targetSessionSource,
                          currentCardResolution,
                          successorCardResolution,
                        ] = mayVerifyContinuation
                          ? await waitWithinStreamLifetime(
                              Promise.all([
                                getLatestDescendant(sessionKey),
                                getSession(upstreamSessionKey)
                                  .then((targetSession) =>
                                    resolveAuthoritativeSessionSource(
                                      upstreamSessionKey,
                                      targetSession,
                                    ),
                                  )
                                  .catch(() => null),
                                sessionCardService
                                  .resolveCard(sessionKey)
                                  .catch(() => null),
                                sessionCardService
                                  .resolveCard(upstreamSessionKey)
                                  .catch(() => null),
                              ]),
                            )
                          : [null, null, null, null]
                        if (streamTransportUnavailable()) return
                        const toVerifiedCard = (
                          resolved: Awaited<
                            ReturnType<typeof sessionCardService.resolveCard>
                          > | null,
                        ) =>
                          resolved
                            ? {
                                cardId: resolved.card.cardId,
                                canonicalSegmentKey:
                                  resolved.card.canonicalSegmentKey,
                                continuationSegmentKeys:
                                  resolved.card.continuationSegmentKeys,
                                relationshipKind:
                                  resolved.card.relationshipKind,
                                ...(resolved.card.parentCardId
                                  ? {
                                      parentCardId: resolved.card.parentCardId,
                                    }
                                  : {}),
                                collectionCompleteness:
                                  resolved.collection.completeness,
                              }
                            : null
                        const cardHandoff =
                          resolveAuthoritativeCardStreamHandoff(
                            sessionKey,
                            data,
                            toVerifiedCard(currentCardResolution),
                            toVerifiedCard(successorCardResolution),
                          )
                        const sessionHandoff = cardHandoff
                          ? null
                          : resolveAuthoritativeStreamHandoff(
                              sessionKey,
                              data,
                              continuationVerification,
                              activeParentSource,
                              targetSessionSource,
                            )
                        if (cardHandoff || sessionHandoff) {
                          const fromSessionKey = cardHandoff
                            ? cardHandoff.fromSegmentKey
                            : sessionHandoff!.fromSessionKey
                          const successorSessionKey = cardHandoff
                            ? cardHandoff.canonicalSegmentKey
                            : sessionHandoff!.sessionKey
                          await migrateActivePersistedRun(
                            fromSessionKey,
                            successorSessionKey,
                            successorSessionKey,
                          )
                          if (streamTransportUnavailable()) {
                            return
                          }
                          sessionKey = successorSessionKey
                          liveBaselineSessionKey = successorSessionKey
                          liveBaselineCount = 0
                          resolvedFriendlyId = successorSessionKey
                          if (cardHandoff) {
                            sendEvent('card_handoff', {
                              ...cardHandoff,
                              runId,
                            })
                          } else {
                            sendEvent('session_handoff', {
                              ...sessionHandoff,
                              friendlyId: successorSessionKey,
                              runId,
                            })
                          }
                          parentLifecycleEligible = true
                        } else {
                          streamEventProvenance.quarantine({
                            sessionKey: upstreamSessionKey,
                            runId: upstreamRunId,
                            sourceIsExplicitlyNonParent: false,
                          })
                        }
                      } else {
                        parentLifecycleEligible =
                          streamEventProvenance.isImplicitParentEligible(
                            upstreamRunId,
                            activeRunId,
                          )
                        if (!parentLifecycleEligible) {
                          streamEventProvenance.quarantine({
                            runId: upstreamRunId,
                            sourceIsExplicitlyNonParent: false,
                          })
                        }
                      }

                      // Rejected provenance is server-local. It must never emit
                      // an event carrying the parent session key or mutate any
                      // parent lifecycle/activity/persistence state.
                      if (!parentLifecycleEligible) return
                      streamEventProvenance.recordParentRun(upstreamRunId)
                      const sessionKeyFromEvent = sessionKey

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
                        lastActivity = 'Processing your message...'
                      }

                      if (event === 'run.started') {
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
                        return
                      }

                      if (event === 'assistant.completed') {
                        // Send full content as a chunk — covers cases where
                        // deltas were missed or response was too short for streaming
                        const content =
                          typeof data.content === 'string' ? data.content : ''
                        if (content) {
                          persistRunText(content, true)
                          const translated = {
                            text: content,
                            fullReplace: true,
                            sessionKey: sessionKeyFromEvent,
                            runId,
                          }
                          sendEvent('chunk', translated)
                        }
                        return
                      }

                      if (event === 'assistant.delta') {
                        const delta =
                          typeof data.delta === 'string' ? data.delta : ''
                        if (!delta) return
                        persistRunText(delta)
                        const translated = {
                          text: delta,
                          sessionKey: sessionKeyFromEvent,
                          runId,
                        }
                        sendEvent('chunk', translated)
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
                        lastActivity = `Running: ${toolName.replace(/_/g, ' ')}`
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
                          lastActivity =
                            delta.length > 60
                              ? delta.slice(0, 60) + '...'
                              : delta
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
                        lastActivity = `Completed: ${toolName.replace(/_/g, ' ')}`
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
                            readString(artifact.path) ||
                            readString(data.path) ||
                            '',
                          sessionKey: sessionKeyFromEvent,
                          runId,
                        }
                        sendEvent('artifact', translated)
                        return
                      }

                      if (event === 'memory.updated') {
                        const translated = {
                          phase: 'complete',
                          name: 'memory',
                          toolCallId:
                            readString(data.tool_call_id) || undefined,
                          result:
                            readString(data.message) ||
                            `Updated ${readString(data.target) || 'memory'}`,
                          sessionKey: sessionKeyFromEvent,
                          runId,
                        }
                        persistActiveRun((runSessionKey, activeId) =>
                          upsertRunToolCall(runSessionKey, activeId, {
                            id:
                              translated.toolCallId ||
                              `${runId || 'run'}:memory`,
                            name: 'memory',
                            phase: 'complete',
                            result: translated.result,
                          }),
                        )
                        sendEvent('tool', translated)
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
                          toolCallId:
                            readString(data.tool_call_id) || undefined,
                          result:
                            readString(skill.name) ||
                            readString(data.skill_name) ||
                            'Skill loaded',
                          sessionKey: sessionKeyFromEvent,
                          runId,
                        }
                        persistActiveRun((runSessionKey, activeId) =>
                          upsertRunToolCall(runSessionKey, activeId, {
                            id:
                              translated.toolCallId ||
                              `${runId || 'run'}:skill`,
                            name: 'skill',
                            phase: 'complete',
                            result: translated.result,
                          }),
                        )
                        sendEvent('tool', translated)
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
                        await finalizeTerminalPersistence(
                          persistTerminalRun('error', errorMessage),
                          () => {
                            sendEvent('error', {
                              message: errorMessage,
                              sessionKey: sessionKeyFromEvent,
                              runId,
                            })
                          },
                        )
                        return
                      }

                      if (event === 'run.completed') {
                        // The terminal history read below is the authoritative
                        // final tool refresh. Stop scheduling live polls before
                        // it starts; an origin poll already in flight is still
                        // discarded by the session-key check above.
                        stopLivePolling()
                        // Claim completion before any asynchronous backfill so
                        // a later abort cannot overwrite the observed winner.
                        const terminalPersistence =
                          persistTerminalRun('complete')
                        // Backfill can outlive bounded sealing retries; attach a
                        // handler now, then re-observe any failure below.
                        void terminalPersistence.catch(() => undefined)

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
                                (await waitWithinStreamLifetime(
                                  getSessionMessagesFromAgent(sid),
                                )) as unknown as Array<Record<string, unknown>>
                              if (streamTransportUnavailable()) return
                            } catch (error) {
                              if (
                                error === streamTimeoutError ||
                                error === streamAbortError ||
                                streamTransportUnavailable()
                              ) {
                                return
                              }
                              persistedMessages = []
                            }
                            // Walk back to the most recent assistant message in
                            // this run; tool_calls are siblings on it. Also
                            // collect tool_result entries that immediately
                            // follow it so we can pair input/output.
                            // Use the rebased per-run baseline so we never read
                            // tool calls from a previous turn. A session handoff
                            // resets this count before any successor event is
                            // translated.
                            const sliceFrom = Math.max(
                              0,
                              Math.min(
                                liveBaselineCount,
                                Math.max(0, persistedMessages.length - 1),
                              ),
                            )
                            const recent = persistedMessages.slice(sliceFrom)
                            let lastAssistantIndex = -1
                            for (let i = recent.length - 1; i >= 0; i--) {
                              const m = recent.at(i)
                              if (m && m.role === 'assistant') {
                                lastAssistantIndex = i
                                break
                              }
                            }
                            if (lastAssistantIndex >= 0) {
                              const lastAssistant =
                                recent.at(lastAssistantIndex)
                              const rawToolCalls = (lastAssistant?.tool_calls ??
                                (lastAssistant as any)?.toolCalls) as
                                | Array<Record<string, unknown>>
                                | undefined
                              const toolCalls =
                                Array.isArray(rawToolCalls) &&
                                rawToolCalls.length
                                  ? rawToolCalls
                                  : []

                              const syntheticEvents =
                                collectSyntheticLiveToolEvents({
                                  messages: recent,
                                  tracker: syntheticLiveToolTracker,
                                  sessionKey: sessionKeyFromEvent,
                                  runId,
                                })
                              for (const synthetic of syntheticEvents) {
                                persistActiveRun((runSessionKey, activeId) =>
                                  upsertRunToolCall(runSessionKey, activeId, {
                                    id: synthetic.toolCallId,
                                    name: synthetic.name,
                                    phase: synthetic.phase,
                                    args: synthetic.args,
                                    result: synthetic.result,
                                  }),
                                )
                                sendEvent('tool', synthetic)
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
                        await finalizeTerminalPersistence(
                          terminalPersistence,
                          () => sendEvent('done', translated),
                        )
                      }
                    },
                  },
                )
                // A producer may ignore abort and remain pending forever. Keep
                // its eventual rejection observed, but let the bounded race own
                // this HTTP stream's lifetime.
                void upstreamStream.catch(() => undefined)
                await waitWithinStreamLifetime(upstreamStream)
                // A producer that resolves without a terminal event still owns
                // no authority to leave this SSE response open indefinitely.
                if (!streamTransportUnavailable()) await streamLifetime
              } finally {
                stopLivePolling()
                // Do not clear the shared deadline here: a producer rejection still
                // has to finish terminal persistence in the outer catch. closeStream
                // clears it after persistence or when the absolute deadline wins.
                // History providers may ignore route closure. The detached poller
                // still exits through the shared lifetime race and closed guards.
                void livePollerPromise.catch(() => undefined)
              }
            } catch (err) {
              // Only send error if stream hasn't already completed successfully.
              // Finalization consumes a sealing failure so this catch cannot loop
              // by requesting the already-rejected terminal transition again.
              if (!streamClosed) {
                const errorMsg = normalizeClaudeErrorMessage(err)
                await finalizeTerminalPersistence(
                  persistTerminalRun('error', errorMsg),
                  () => {
                    sendEvent('error', {
                      message: errorMsg,
                      sessionKey,
                    })
                  },
                )
              }
            }
          },
          async cancel() {
            // User clicked Stop, navigated away, or browser closed the tab.
            // Stop transport work immediately, then observe bounded sealing
            // without allowing exhaustion to reject stream cancellation.
            const terminalPersistence =
              persistedRunId && !streamClosed
                ? persistTerminalRun('handoff')
                : Promise.resolve()
            await finalizeTerminalPersistence(
              terminalPersistence,
              undefined,
              true,
            )
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
