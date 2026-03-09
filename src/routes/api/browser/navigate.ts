import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { gatewayRpc } from '../../../server/gateway'
import { requireJsonContentType } from '../../../server/rate-limit'

const BROWSER_NAVIGATE_METHODS = [
  'browser',           // Current OpenClaw API — single method with action param
  'browser.navigate',
  'browser_navigate',
  'browser.go',
  'browser_go',
]

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || 'Browser navigate failed'
  if (typeof error === 'string' && error.trim()) return error
  return 'Browser navigate failed'
}

async function callBrowserNavigate(params: { url: string }): Promise<unknown> {
  let lastError: unknown = null
  for (const method of BROWSER_NAVIGATE_METHODS) {
    try {
      const rpcParams = method === 'browser'
        ? { action: 'navigate', ...params }
        : params
      return await gatewayRpc(method, rpcParams)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Gateway browser navigate request failed')
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export const Route = createFileRoute('/api/browser/navigate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const rawUrl = typeof body.url === 'string' ? body.url : ''
        const url = normalizeUrl(rawUrl)

        if (!url) {
          return json({ ok: false, error: 'url is required' }, { status: 400 })
        }

        try {
          const payload = await callBrowserNavigate({ url })
          return json({ ok: true, url, payload })
        } catch (error) {
          return json(
            {
              ok: false,
              error: readErrorMessage(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
