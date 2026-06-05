import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import YAML from 'yaml'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  ensureGatewayProbed,
  getGatewayCapabilities,
} from '../../server/claude-api'
import { BEARER_TOKEN, CLAUDE_API } from '../../server/gateway-capabilities'
import {
  ensureDiscovery,
  ensureProviderInConfig,
  getDiscoveredModels,
} from '../../server/local-provider-discovery'

const CLAUDE_HOME = process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? path.join(os.homedir(), '.hermes')
const MODELS_PATH = path.join(CLAUDE_HOME, 'models.json')
const CONFIG_PATH = path.join(CLAUDE_HOME, 'config.yaml')

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

export function mergeModelEntries(...sources: Array<Array<ModelEntry>>): Array<ModelEntry> {
  const merged: Array<ModelEntry> = []
  const seen = new Set<string>()

  for (const source of sources) {
    for (const model of source) {
      const normalized = normalizeModel(model)
      if (!normalized || seen.has(normalized.id)) continue
      merged.push(normalized)
      seen.add(normalized.id)
    }
  }

  return merged
}

/**
 * Read user-configured models from active profile's models.json.
 */
function readClaudeModelsJson(): Array<ModelEntry> {
  try {
    if (!fs.existsSync(MODELS_PATH)) return []
    const raw = fs.readFileSync(MODELS_PATH, 'utf-8')
    const entries = JSON.parse(raw)
    if (!Array.isArray(entries)) return []
    return entries
      .map((entry: unknown): ModelEntry | null => {
        const record = asRecord(entry)
        // models.json uses "model" field for the model ID
        const modelId = readString(record.model) || readString(record.id)
        if (!modelId) return null
        return {
          id: modelId,
          name: readString(record.name) || modelId,
          provider: readString(record.provider) || 'unknown',
        }
      })
      .filter((entry): entry is ModelEntry => entry !== null)
  } catch {
    return []
  }
}

const DEFAULT_ACCEPTED_TIMEOUT_S = 120
const DEFAULT_HANDOFF_TIMEOUT_S = 300
const LIVE_MODEL_CACHE_TTL_MS = 60_000

type LiveModelEndpoint = {
  provider: string
  baseUrl: string
  apiKey?: string
}

type LiveModelCacheEntry = {
  expiresAt: number
  models: Array<ModelEntry>
}

const liveModelCache = new Map<string, LiveModelCacheEntry>()

function readStreamTimeouts(): { streamAcceptedTimeoutMs: number; streamHandoffTimeoutMs: number } {
  let acceptedS = DEFAULT_ACCEPTED_TIMEOUT_S
  let handoffS = DEFAULT_HANDOFF_TIMEOUT_S
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const parsed = YAML.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      const ws =
        parsed && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).workspace === 'object'
          ? ((parsed as Record<string, unknown>).workspace as Record<string, unknown>)
          : {}
      if (typeof ws.stream_accepted_timeout === 'number' && ws.stream_accepted_timeout > 0)
        acceptedS = ws.stream_accepted_timeout
      if (typeof ws.stream_handoff_timeout === 'number' && ws.stream_handoff_timeout > 0)
        handoffS = ws.stream_handoff_timeout
    }
  } catch {
    // fall through to defaults
  }
  const envAccepted = parseInt(process.env.STREAM_ACCEPTED_TIMEOUT_MS ?? '', 10)
  const envHandoff = parseInt(process.env.STREAM_HANDOFF_TIMEOUT_MS ?? '', 10)
  return {
    streamAcceptedTimeoutMs: Number.isFinite(envAccepted) && envAccepted > 0 ? envAccepted : acceptedS * 1000,
    streamHandoffTimeoutMs: Number.isFinite(envHandoff) && envHandoff > 0 ? envHandoff : handoffS * 1000,
  }
}

/**
 * Read the default model from active profile's config.yaml using a proper YAML parser.
 */
function readClaudeDefaultModel(): ModelEntry | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = YAML.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const config = parsed as Record<string, unknown>
    let modelId = ''
    let provider = ''
    const modelField = config.model
    if (typeof modelField === 'string') {
      modelId = modelField
      provider = (config.provider as string) || 'unknown'
    } else if (modelField && typeof modelField === 'object') {
      const modelObj = modelField as Record<string, unknown>
      modelId = (modelObj.default as string) || ''
      provider =
        (modelObj.provider as string) ||
        (config.provider as string) ||
        'unknown'
    }
    if (!modelId) return null
    return { id: modelId, name: modelId, provider }
  } catch {
    return null
  }
}

/**
 * Read providers.*.models (+ provider default model) and model_aliases
 * from ~/.hermes/config.yaml so the picker reflects the user's full Hermes
 * catalog, not just /v1/models + models.json + local discovery. Fix for #569.
 */
function resolveConfiguredSecret(value: unknown): string {
  const raw = readString(value)
  if (!raw) return ''
  const envMatch = raw.match(/^\$\{?([A-Z0-9_]+)\}?$/i)
  if (envMatch) return process.env[envMatch[1]] ?? ''
  return raw
}

function normalizeConfiguredBaseUrl(value: unknown): string {
  const raw = readString(value)
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function modelsUrlForBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/v1') ? `${trimmed}/models` : `${trimmed}/v1/models`
}

function readConfiguredLiveModelEndpoints(): Array<LiveModelEndpoint> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return []
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = YAML.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []
    const config = parsed as Record<string, unknown>
    const endpoints: Array<LiveModelEndpoint> = []
    const seen = new Set<string>()

    const pushEndpoint = (provider: string, block: Record<string, unknown>) => {
      const baseUrl =
        normalizeConfiguredBaseUrl(block.base_url) ||
        normalizeConfiguredBaseUrl(block.baseUrl) ||
        normalizeConfiguredBaseUrl(block.api_base) ||
        normalizeConfiguredBaseUrl(block.apiBase)
      if (!baseUrl) return
      const apiKey =
        resolveConfiguredSecret(block.api_key) ||
        resolveConfiguredSecret(block.apiKey) ||
        resolveConfiguredSecret(block.token) ||
        resolveConfiguredSecret(block.api_key_env ? process.env[readString(block.api_key_env)] : '')
      const key = `${provider}\u0000${baseUrl}`
      if (seen.has(key)) return
      seen.add(key)
      endpoints.push({ provider, baseUrl, apiKey: apiKey || undefined })
    }

    const modelBlock = asRecord(config.model)
    pushEndpoint(readString(modelBlock.provider) || readString(config.provider) || 'configured', modelBlock)

    const providers = asRecord(config.providers)
    for (const [providerId, value] of Object.entries(providers)) {
      pushEndpoint(providerId, asRecord(value))
    }

    return endpoints
  } catch {
    return []
  }
}

async function fetchConfiguredLiveModels(): Promise<Array<ModelEntry>> {
  const endpoints = readConfiguredLiveModelEndpoints()
  if (endpoints.length === 0) return []

  const all: Array<ModelEntry> = []
  for (const endpoint of endpoints) {
    const cacheKey = `${endpoint.provider}\u0000${endpoint.baseUrl}`
    const cached = liveModelCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      all.push(...cached.models)
      continue
    }

    let models: Array<ModelEntry> = []
    try {
      const headers: Record<string, string> = { accept: 'application/json' }
      if (endpoint.apiKey) headers.authorization = `Bearer ${endpoint.apiKey}`
      const response = await fetch(modelsUrlForBase(endpoint.baseUrl), {
        headers,
        signal: AbortSignal.timeout(3_000),
      })
      const contentType = response.headers.get('content-type') ?? ''
      if (response.ok && contentType.toLowerCase().includes('application/json')) {
        const payload = asRecord(await response.json())
        const rawModels = Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.models)
            ? payload.models
            : []
        models = rawModels
          .map(normalizeModel)
          .filter((entry): entry is ModelEntry => entry !== null)
          .map((entry) => ({
            ...entry,
            provider: readString(entry.provider) || endpoint.provider,
            source: 'live-proxy',
          }))
      }
    } catch {
      models = []
    }

    liveModelCache.set(cacheKey, {
      expiresAt: Date.now() + LIVE_MODEL_CACHE_TTL_MS,
      models,
    })
    all.push(...models)
  }

  return all
}

function readClaudeConfigCatalog(): Array<ModelEntry> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return []
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = YAML.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []
    const config = parsed as Record<string, unknown>
    const out: Array<ModelEntry> = []
    const seen = new Set<string>()

    const pushEntry = (entry: ModelEntry) => {
      if (!entry.id || seen.has(entry.id)) return
      out.push(entry)
      seen.add(entry.id)
    }

    const providers = asRecord(config.providers)
    for (const [providerId, value] of Object.entries(providers)) {
      const providerBlock = asRecord(value)
      const providerModels = providerBlock.models
      if (Array.isArray(providerModels)) {
        for (const modelEntry of providerModels) {
          if (typeof modelEntry === 'string') {
            const id = modelEntry.trim()
            if (!id) continue
            pushEntry({ id, name: id, provider: providerId })
          } else {
            const record = asRecord(modelEntry)
            const id =
              readString(record.id) ||
              readString(record.model) ||
              readString(record.name)
            if (!id) continue
            pushEntry({
              id,
              name: readString(record.name) || id,
              provider: readString(record.provider) || providerId,
            })
          }
        }
      }
      const providerDefault =
        readString(providerBlock.model) || readString(providerBlock.default)
      if (providerDefault) {
        pushEntry({
          id: providerDefault,
          name: providerDefault,
          provider: providerId,
        })
      }
    }

    const aliases = asRecord(config.model_aliases)
    for (const [alias, target] of Object.entries(aliases)) {
      const aliasId = alias.trim()
      if (!aliasId) continue
      const targetStr = typeof target === 'string' ? target.trim() : ''
      const provider =
        targetStr && targetStr.includes('/')
          ? targetStr.split('/')[0]
          : 'alias'
      pushEntry({
        id: aliasId,
        name: targetStr ? `${aliasId} → ${targetStr}` : aliasId,
        provider,
        alias: true,
        target: targetStr || undefined,
      })
    }

    return out
  } catch {
    return []
  }
}

/**
 * Fallback: fetch models from the hermes-agent /v1/models endpoint.
 */
async function fetchClaudeModels(): Promise<Array<ModelEntry>> {
  const headers: Record<string, string> = {}
  if (BEARER_TOKEN) headers['Authorization'] = `Bearer ${BEARER_TOKEN}`
  const response = await fetch(`${CLAUDE_API}/v1/models`, { headers })
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
          // Primary: read user-configured models from ~/.hermes/models.json
          let models = readClaudeModelsJson()
          let source = 'models.json'

          // Ensure the default model from config.yaml is always first
          const defaultModel = readClaudeDefaultModel()
          if (defaultModel) {
            models = models.filter((m) => m.id !== defaultModel.id)
            models.unshift(defaultModel)
          }

          // Merge providers.*.models + provider defaults + model_aliases
          // from ~/.hermes/config.yaml so the picker reflects the user's full
          // Hermes catalog, not just /v1/models + models.json + local discovery.
          // Fix for #569.
          const configModels = readClaudeConfigCatalog()
          if (configModels.length > 0) {
            models = mergeModelEntries(models, configModels)
            source =
              source === 'models.json'
                ? 'models.json+config.yaml'
                : `${source}+config.yaml`
          }

          // Merge the authoritative Hermes model catalog whenever it is
          // available. Previously, a non-empty models.json stopped here, so the
          // Operations picker only showed the local Workspace subset and drifted
          // from the CLI/backend model universe.
          if (getGatewayCapabilities().models) {
            const hermesModels = await fetchClaudeModels()
            models = mergeModelEntries(models, hermesModels)
            source = source === 'models.json' ? 'models.json+hermes-agent' : 'hermes-agent'
          }

          // Merge live OpenAI-compatible catalogs from base_url entries that
          // already exist in config.yaml. This keeps API keys and proxy URLs on
          // the server while restoring dynamic model discovery for configured
          // upstream proxies. Fix for #473.
          const liveProxyModels = await fetchConfiguredLiveModels()
          if (liveProxyModels.length > 0) {
            models = mergeModelEntries(models, liveProxyModels)
            source = `${source}+live-proxy`
          }

          // Merge auto-discovered local models (Ollama, Atomic Chat, etc.)
          await ensureDiscovery()
          const localModels = getDiscoveredModels()
          models = mergeModelEntries(models, localModels)
          for (const m of localModels) {
            ensureProviderInConfig(m.provider)
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

          const streamTimeouts = readStreamTimeouts()

          return json({
            ok: true,
            object: 'list',
            data: models,
            models,
            configuredProviders,
            source,
            ...streamTimeouts,
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
