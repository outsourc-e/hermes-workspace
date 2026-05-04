import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  CLAUDE_UPGRADE_INSTRUCTIONS,
  dashboardFetch,
  ensureGatewayProbed,
} from '../../../server/gateway-capabilities'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'

/**
 * SSE proxy for per-server MCP logs. The agent serves
 * `/api/mcp/<name>/logs` as a streaming response; we forward chunks 1:1 to
 * the browser as `text/event-stream`. Auth-gated; capability-off → 503.
 */
export const Route = createFileRoute('/api/mcp/$name/logs')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const name = (params as { name?: string }).name?.trim() || ''
        if (!name) {
          return json({ ok: false, error: 'Missing server name' }, { status: 400 })
        }
        const capabilities = await ensureGatewayProbed()
        if (capabilities.mcpFallback && !capabilities.mcp) {
          return json(
            {
              ok: false,
              error:
                'Live test/discover requires hermes-agent /api/mcp runtime endpoint, not yet available on this dashboard.',
            },
            { status: 503 },
          )
        }
        if (!capabilities.mcp) {
          return json(
            createCapabilityUnavailablePayload('mcp', {
              error: `Gateway does not support /api/mcp. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
            }),
            { status: 503 },
          )
        }

        const upstreamController = new AbortController()
        const onClientAbort = () => upstreamController.abort()
        request.signal.addEventListener('abort', onClientAbort, { once: true })

        let upstream: Response
        try {
          upstream = await dashboardFetch(`/api/mcp/${encodeURIComponent(name)}/logs`, {
            method: 'GET',
            signal: upstreamController.signal,
          })
        } catch (err) {
          request.signal.removeEventListener('abort', onClientAbort)
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 502 },
          )
        }

        if (!upstream.ok || !upstream.body) {
          request.signal.removeEventListener('abort', onClientAbort)
          return json(
            { ok: false, error: `Upstream logs failed (${upstream.status})` },
            { status: upstream.status || 502 },
          )
        }

        const reader = upstream.body.getReader()
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()
        let closed = false

        const stream = new ReadableStream({
          async start(controller) {
            const close = () => {
              if (closed) return
              closed = true
              try {
                reader.cancel().catch(() => {})
              } catch {
                /* ignore */
              }
              try {
                controller.close()
              } catch {
                /* ignore */
              }
              request.signal.removeEventListener('abort', onClientAbort)
            }

            try {
              // Greet the client so EventSource fires `onopen` even if upstream
              // is silent for a while.
              controller.enqueue(
                encoder.encode(`event: connected\ndata: ${JSON.stringify({ name })}\n\n`),
              )
              while (!closed) {
                const { done, value } = await reader.read()
                if (done) break
                const text = decoder.decode(value, { stream: true })
                // Re-emit raw upstream chunk(s) as SSE `log` events, splitting
                // on newlines so multi-line payloads stay readable.
                for (const line of text.split(/\r?\n/)) {
                  if (!line) continue
                  controller.enqueue(
                    encoder.encode(`event: log\ndata: ${JSON.stringify({ line })}\n\n`),
                  )
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              try {
                controller.enqueue(
                  encoder.encode(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`),
                )
              } catch {
                /* ignore */
              }
            } finally {
              close()
            }
          },
          cancel() {
            closed = true
            try {
              reader.cancel().catch(() => {})
            } catch {
              /* ignore */
            }
            upstreamController.abort()
            request.signal.removeEventListener('abort', onClientAbort)
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
