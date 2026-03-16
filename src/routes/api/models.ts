import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

type ModelEntry = {
  provider?: string
  id?: string
  name?: string
  [key: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  return {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeHermesModel(entry: unknown): ModelEntry | null {
  if (typeof entry === 'string') {
    const id = entry.trim()
    if (!id) return null
    return { id, name: id, provider: id.includes('/') ? id.split('/')[0] : 'hermes-agent' }
  }
  const record = asRecord(entry)
  const id = readString(record.id) || readString(record.name) || readString(record.model)
  if (!id) return null
  return {
    ...record,
    id,
    name: readString(record.name) || readString(record.display_name) || readString(record.label) || id,
    provider: readString(record.provider) || readString(record.owned_by) || (id.includes('/') ? id.split('/')[0] : 'hermes-agent'),
  }
}

async function fetchHermesModels(): Promise<Array<ModelEntry>> {
  const response = await fetch(`${HERMES_API_URL}/v1/models`)
  if (!response.ok) throw new Error(`Hermes models request failed (${response.status})`)
  const payload = asRecord(await response.json())
  const rawModels = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : []
  return rawModels.map(normalizeHermesModel).filter((e): e is ModelEntry => e !== null)
}

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const models = await fetchHermesModels()
          return json({ ok: true, models })
        } catch (err) {
          return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 })
        }
      },
    },
  },
})
