import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthenticated,
  isPasswordProtectionEnabled,
} from '../../server/auth-middleware'
import { ensureGatewayProbed } from '../../server/gateway-capabilities'

/**
 * Probe whether any usable backend is reachable.
 *
 * Priority order:
 *   1. /health (Hermes gateway)
 *   2. /v1/models (OpenAI-compat — Ollama, LiteLLM, vLLM, etc.)
 *   3. / root (Ollama returns "Ollama is running")
 *
 * Returns true if ANY of these indicate a live backend.
 */
async function isBackendReachable(apiUrl: string): Promise<boolean> {
  const timeout = 4_000

  // Fast path: /health (Hermes gateway)
  try {
    const res = await fetch(`${apiUrl}/health`, {
      signal: AbortSignal.timeout(timeout),
    })
    if (res.ok) return true
  } catch { /* continue */ }

  // Fallback: /v1/models (any OpenAI-compat backend including Ollama)
  try {
    const res = await fetch(`${apiUrl}/v1/models`, {
      signal: AbortSignal.timeout(timeout),
    })
    if (res.ok || res.status === 401) return true
  } catch { /* continue */ }

  // Last resort: root endpoint (Ollama responds with 200 "Ollama is running")
  try {
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(timeout),
    })
    if (res.ok) return true
  } catch { /* continue */ }

  return false
}

export const Route = createFileRoute('/api/auth-check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiUrl = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

        try {
          const reachable = await isBackendReachable(apiUrl)
          if (!reachable) {
            return json(
              {
                authenticated: false,
                authRequired: false,
                error: 'hermes_agent_unreachable',
              },
              { status: 503 },
            )
          }
        } catch (error) {
          return json(
            {
              authenticated: false,
              authRequired: false,
              error:
                error instanceof DOMException && error.name === 'AbortError'
                  ? 'hermes_agent_timeout'
                  : 'hermes_agent_unreachable',
            },
            { status: 503 },
          )
        }

        // Backend is reachable — kick off capability detection in background
        void ensureGatewayProbed()

        const authRequired = isPasswordProtectionEnabled()
        const authenticated = isAuthenticated(request)

        return json({
          authenticated,
          authRequired,
        })
      },
    },
  },
})
