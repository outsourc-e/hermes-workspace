import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
} from '../../server/hermes-api'
import { BEARER_TOKEN, HERMES_API } from '../../server/gateway-capabilities'
import {
  ensureDiscovery,
  getDiscoveredModels,
  ensureProviderInConfig,
} from '../../server/local-provider-discovery'

type ModelEntry = {
  provider?: string
  id?: string
  name?: string
  [key: string]: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>
  return {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeModel(entry: unknown): ModelEntry | null {
  if (typeof entry === 'string') {
    const id = entry.trim()
    if (!id) return null
    return {
      id,
      name: id,
      provider: id.includes('/') ? id.split('/')[0] : 'unknown',
    }
  }
  const record = asRecord(entry)
  const id =
    readString(record.id) || readString(record.name) || readString(record.model)
  if (!id) return null
  return {
    ...record,
    id,
    name:
      readString(record.name) ||
      readString(record.display_name) ||
      readString(record.label) ||
      id,
    provider:
      readString(record.provider) ||
      readString(record.owned_by) ||
      (id.includes('/') ? id.split('/')[0] : 'unknown'),
  }
}

/**
 * Fetch models from OCPlatform gateway HTTP API (Clawsuite).
 * This is the authoritative model list — same as what Clawsuite shows.
 * Default port 3000; override via OCPLATFORM_UI_URL env var.
 */
async function fetchOpenClawModels(): Promise<{
  models: Array<ModelEntry>
  configuredProviders: Array<string>
} | null> {
  const baseUrl =
    process.env.OCPLATFORM_UI_URL?.trim() || 'http://127.0.0.1:3000'
  try {
    const res = await fetch(`${baseUrl}/api/models`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const data = asRecord(await res.json())
    if (!data.ok) return null
    const rawModels = Array.isArray(data.models) ? data.models : []
    const models = rawModels
      .map(normalizeModel)
      .filter((e): e is ModelEntry => e !== null)
    const configuredProviders = Array.isArray(data.configuredProviders)
      ? (data.configuredProviders as Array<string>)
      : []
    return { models, configuredProviders }
  } catch {
    return null
  }
}

/**
 * Fallback: fetch models from the hermes-agent /v1/models endpoint.
 * Returns a minimal list (usually just "hermes-agent").
 */
async function fetchHermesModels(): Promise<Array<ModelEntry>> {
  const headers: Record<string, string> = {}
  if (BEARER_TOKEN) headers['Authorization'] = `Bearer ${BEARER_TOKEN}`
  const response = await fetch(`${HERMES_API}/v1/models`, { headers })
  if (!response.ok)
    throw new Error(`Hermes models request failed (${response.status})`)
  const payload = asRecord(await response.json())
  const rawModels = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.models)
      ? payload.models
      : []
  return rawModels
    .map(normalizeModel)
    .filter((e): e is ModelEntry => e !== null)
}

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()

        try {
          // Primary: fetch from OCPlatform gateway (same list as Clawsuite)
          const ocpResult = await fetchOpenClawModels()
          if (ocpResult && ocpResult.models.length > 0) {
            // Merge in auto-discovered local models
            await ensureDiscovery()
            const localModels = getDiscoveredModels()
            const existingIds = new Set(ocpResult.models.map((m) => m.id))
            for (const m of localModels) {
              if (!existingIds.has(m.id)) {
                ocpResult.models.push(m)
                existingIds.add(m.id)
                ensureProviderInConfig(m.provider)
              }
            }
            const configuredProviders = Array.from(
              new Set([
                ...ocpResult.configuredProviders,
                ...localModels.map((m) => m.provider),
              ].filter(Boolean)),
            )
            return json({
              ok: true,
              object: 'list',
              data: ocpResult.models,
              models: ocpResult.models,
              configuredProviders,
              source: 'openclaw',
            })
          }

          // Fallback: hermes-agent /v1/models
          if (!getGatewayCapabilities().models) {
            return json({
              ok: true,
              object: 'list',
              data: [],
              models: [],
              configuredProviders: [],
              source: 'unavailable',
            })
          }

          const models = await fetchHermesModels()

          // Merge local models
          await ensureDiscovery()
          const localModels = getDiscoveredModels()
          const existingIds = new Set(models.map((m) => m.id))
          for (const m of localModels) {
            if (!existingIds.has(m.id)) {
              models.push(m)
              existingIds.add(m.id)
              ensureProviderInConfig(m.provider)
            }
          }

          const configuredProviders = Array.from(
            new Set(
              models
                .map((model) =>
                  typeof model.provider === 'string' ? model.provider : '',
                )
                .filter(Boolean),
            ),
          )
          return json({
            ok: true,
            object: 'list',
            data: models,
            models,
            configuredProviders,
            source: 'hermes-agent',
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
