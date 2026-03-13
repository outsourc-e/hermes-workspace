import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { gatewayRpc } from '../../server/gateway'
import { isAuthenticated } from '../../server/auth-middleware'
import { requireJsonContentType } from '../../server/rate-limit'

function buildPatchObject(path: string, value: unknown): Record<string, unknown> {
  const segments = path
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    throw new Error('config patch path is required')
  }

  const root: Record<string, unknown> = {}
  let current: Record<string, unknown> = root

  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      current[segment] = value
      continue
    }

    const next: Record<string, unknown> = {}
    current[segment] = next
    current = next
  }

  return root
}

export const Route = createFileRoute('/api/config-patch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth check
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const raw = typeof body.raw === 'string' ? body.raw : ''
          const path = typeof body.path === 'string' ? body.path.trim() : ''
          const hasValue = Object.prototype.hasOwnProperty.call(body, 'value')

          if (!raw.trim() && !path) {
            return json(
              { ok: false, error: 'raw config patch or path is required' },
              { status: 400 },
            )
          }

          // Get current config hash for optimistic concurrency
          const configResult = await gatewayRpc<{ hash?: string }>('config.get')
          const baseHash = (configResult as any)?.hash

          const params: Record<string, unknown> = {
            raw: raw.trim()
              ? raw
              : JSON.stringify(buildPatchObject(path, hasValue ? body.value : null), null, 2),
          }
          if (baseHash) {
            params.baseHash = baseHash
          }

          const result = await gatewayRpc<{ ok: boolean; error?: string }>(
            'config.patch',
            params,
          )

          return json({ ...result, ok: true })
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
