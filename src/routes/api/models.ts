import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getConfiguredModelIds,
  getConfiguredProviderNames,
  getConfiguredModelsFromConfig,
} from '../../server/providers'

type ModelEntry = {
  provider?: string
  id?: string
  name?: string
  [key: string]: unknown
}

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeHermesModel(entry: unknown): ModelEntry | null {
  if (typeof entry === 'string') {
    const id = entry.trim()
    if (!id) return null
    const provider = id.includes('/') ? id.split('/')[0] : 'hermes-agent'
    return { id, name: id, provider }
  }

  const record = asRecord(entry)
  const id =
    readString(record.id) ||
    readString(record.name) ||
    readString(record.model)
  if (!id) return null

  const provider =
    readString(record.provider) ||
    readString(record.owned_by) ||
    (id.includes('/') ? id.split('/')[0] : 'hermes-agent')

  return {
    ...record,
    id,
    name:
      readString(record.name) ||
      readString(record.display_name) ||
      readString(record.label) ||
      id,
    provider,
  }
}

async function fetchHermesModels(): Promise<Array<ModelEntry>> {
  const response = await fetch(`${HERMES_API_URL}/v1/models`)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(body || `Hermes models request failed (${response.status})`)
  }

  const payload = (await response.json()) as unknown
  const root = asRecord(payload)
  const rawModels = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : Array.isArray(payload)
        ? payload
        : []

  return rawModels
    .map((entry) => normalizeHermesModel(entry))
    .filter((entry): entry is ModelEntry => entry !== null)
}

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const allModels = await fetchHermesModels()

          // Filter to only configured providers AND configured model IDs
          const configuredProviders = getConfiguredProviderNames()
          const configuredModelIds = getConfiguredModelIds()
          const providerSet = new Set(configuredProviders)

          const filteredModels = allModels.filter((model) => {
            const entry = model as ModelEntry

            // Must be from a configured provider
            if (!entry.provider || !providerSet.has(entry.provider)) {
              return false
            }

            // Must be a configured model ID
            if (!entry.id || !configuredModelIds.has(entry.id)) {
              return false
            }

            return true
          })

          // Merge in any models from config that the gateway didn't auto-discover
          const discoveredIds = new Set(filteredModels.map((m) => m.id))
          const configModels = getConfiguredModelsFromConfig()
          for (const cm of configModels) {
            if (!discoveredIds.has(cm.id)) {
              filteredModels.push(cm)
            }
          }

          return json({
            ok: true,
            models: filteredModels,
            configuredProviders,
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
