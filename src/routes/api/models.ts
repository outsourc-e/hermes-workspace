import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
} from '../../server/hermes-api'

const HERMES_API_URL = process.env.HERMES_API_URL || 'http://127.0.0.1:8642'

// Well-known models for providers available via auth store
const AUTH_STORE_MODELS: Record<string, ModelEntry[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  ],
  xai: [
    { id: 'grok-3', name: 'Grok 3', provider: 'xai' },
  ],
}

function getAuthStoreModels(): ModelEntry[] {
  const extra: ModelEntry[] = []
  for (const storePath of [
    path.join(os.homedir(), '.hermes', 'auth-profiles.json'),
    path.join(os.homedir(), '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json'),
  ]) {
    try {
      if (!fs.existsSync(storePath)) continue
      const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'))
      const profiles = store?.profiles || {}
      const seen = new Set<string>()
      for (const key of Object.keys(profiles)) {
        const providerId = key.split(':')[0]
        if (seen.has(providerId)) continue
        const p = profiles[key]
        const token = String(p?.token || p?.key || p?.access || '').trim()
        if (!token) continue
        seen.add(providerId)
        const models = AUTH_STORE_MODELS[providerId]
        if (models) extra.push(...models)
      }
      if (extra.length > 0) break // Use first store that has data
    } catch {}
  }
  return extra
}

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
        await ensureGatewayProbed()
        if (!getGatewayCapabilities().models) {
          return json({
            ok: true,
            object: 'list',
            data: [],
            models: [],
            configuredProviders: [],
            source: 'unavailable',
            message: 'Gateway does not support /v1/models',
          })
        }
        try {
          const models = await fetchHermesModels()
          // Add models from auth store providers (Anthropic, OpenAI, etc.)
          const authModels = getAuthStoreModels()
          const existingIds = new Set(models.map((m) => m.id))
          for (const m of authModels) {
            if (!existingIds.has(m.id)) {
              models.push(m)
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
          })
        } catch (err) {
          return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 503 })
        }
      },
    },
  },
})
