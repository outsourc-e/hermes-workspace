import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProfilesDir } from '../../server/claude-paths'
import { readWorkerMessages, type SwarmChatMessage } from '../../server/swarm-chat-reader'

type ChatResponse = {
  workerId: string
  sessionId: string | null
  sessionTitle: string | null
  messages: Array<SwarmChatMessage>
  source: 'state.db' | 'unavailable'
  fetchedAt: number
  error?: string
}

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 30

function isValidWorkerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

export const Route = createFileRoute('/api/swarm-chat')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const workerIdRaw = (url.searchParams.get('workerId') ?? '').trim()
        if (!workerIdRaw || !isValidWorkerId(workerIdRaw)) {
          return json({ error: 'workerId required' }, { status: 400 })
        }
        const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
        const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT))
        const profilePath = join(getProfilesDir(), workerIdRaw)
        const result = readWorkerMessages(profilePath, limit)
        const response: ChatResponse = {
          workerId: workerIdRaw,
          sessionId: result.sessionId,
          sessionTitle: result.sessionTitle,
          messages: result.messages,
          source: result.ok ? 'state.db' : 'unavailable',
          fetchedAt: Date.now(),
          ...(result.error ? { error: result.error } : {}),
        }
        return json(response)
      },
    },
  },
})
