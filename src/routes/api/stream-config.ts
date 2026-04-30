import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

const DEFAULT_ACCEPTED_TIMEOUT_MS = 120_000
const DEFAULT_HANDOFF_TIMEOUT_MS = 300_000

function readEnvInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const Route = createFileRoute('/api/stream-config')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          acceptedTimeoutMs: readEnvInt(
            'STREAM_ACCEPTED_TIMEOUT_MS',
            DEFAULT_ACCEPTED_TIMEOUT_MS,
          ),
          handoffTimeoutMs: readEnvInt(
            'STREAM_HANDOFF_TIMEOUT_MS',
            DEFAULT_HANDOFF_TIMEOUT_MS,
          ),
        })
      },
    },
  },
})
