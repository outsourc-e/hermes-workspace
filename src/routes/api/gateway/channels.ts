import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '@/server/gateway'
import { isAuthenticated } from '@/server/auth-middleware'

function gatewayRpcWithTimeout<TPayload>(
  method: string,
  params?: unknown,
  timeoutMs = 10_000,
): Promise<TPayload> {
  return Promise.race([
    gatewayRpc<TPayload>(method, params),
    new Promise<TPayload>((_, reject) => {
      setTimeout(() => reject(new Error('Gateway RPC timed out')), timeoutMs)
    }),
  ])
}

export const Route = createFileRoute('/api/gateway/channels')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const probe =
            url.searchParams.get('probe') === '1' ||
            url.searchParams.get('probe') === 'true'
          const timeoutParam = Number(url.searchParams.get('timeoutMs'))
          const timeoutMs =
            Number.isFinite(timeoutParam) && timeoutParam > 0
              ? Math.min(timeoutParam, 30_000)
              : undefined

          const status = await gatewayRpcWithTimeout<Record<string, unknown>>(
            'channels.status',
            {
              ...(probe ? { probe: true } : {}),
              ...(timeoutMs ? { timeoutMs } : {}),
            },
            probe ? Math.max(timeoutMs ?? 20_000, 20_000) : 10_000,
          )
          return json({ ok: true, data: status })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
