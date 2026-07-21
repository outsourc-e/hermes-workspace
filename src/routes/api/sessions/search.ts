import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  ensureGatewayProbed,
  searchSessions,
} from '../../../server/claude-api'
import { searchLocalSessions } from '../../../server/local-session-store'

type NormalizedSessionSearchResult = {
  id: string
  key: string
  friendlyId: string
  title: string
  snippet: string
  role?: string | null
  source?: string | null
  model?: string | null
  updatedAt?: number | null
}

function getString(record: Record<string, unknown>, keys: Array<string>): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function getNumber(record: Record<string, unknown>, keys: Array<string>): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function normalizeResult(
  value: unknown,
  fallbackIndex: number,
): NormalizedSessionSearchResult | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const key = getString(record, ['session_id', 'sessionId', 'key', 'id'])
  if (!key) return null
  const title = getString(record, ['title', 'derivedTitle', 'label']) || key
  const snippet = getString(record, ['snippet', 'preview', 'content', 'text'])
  return {
    id: `${key}:${fallbackIndex}`,
    key,
    friendlyId: key,
    title,
    snippet: snippet || `Session: ${key}`,
    role: getString(record, ['role']) || null,
    source: getString(record, ['source']) || null,
    model: getString(record, ['model']) || null,
    updatedAt: getNumber(record, ['updatedAt', 'last_active', 'session_started']),
  }
}

export const Route = createFileRoute('/api/sessions/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const query = (url.searchParams.get('q') || '').trim()
        const rawLimit = Number(url.searchParams.get('limit') || '20')
        const limit = Number.isFinite(rawLimit)
          ? Math.min(Math.max(Math.floor(rawLimit), 1), 50)
          : 20

        if (!query) return json({ ok: true, query, results: [] })

        await ensureGatewayProbed()

        const merged: Array<NormalizedSessionSearchResult> = []
        try {
          const remote = await searchSessions(query, limit)
          const remoteResults = Array.isArray(remote.results)
            ? remote.results
            : []
          for (const [index, result] of remoteResults.entries()) {
            const normalized = normalizeResult(result, index)
            if (normalized) merged.push(normalized)
            if (merged.length >= limit) break
          }
        } catch {
          // Some gateway-only deployments do not expose FTS search yet. Keep the
          // endpoint useful by falling back to local portable sessions below.
        }

        if (merged.length < limit) {
          const local = searchLocalSessions(query, limit - merged.length)
          for (const [index, result] of local.entries()) {
            merged.push({
              id: `${result.id}:local:${index}`,
              key: result.id,
              friendlyId: result.id,
              title: result.title || 'Local Chat',
              snippet: result.snippet || `Local session: ${result.id}`,
              source: 'local',
              model: result.model,
              updatedAt: result.updatedAt,
            })
          }
        }

        return json({ ok: true, query, count: merged.length, results: merged })
      },
    },
  },
})
