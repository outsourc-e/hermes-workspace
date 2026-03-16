import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

// Reads OpenClaw gateway config for Hermes Workspace provider/model discovery.

type GatewayConfig = {
  auth?: {
    profiles?: Record<string, { provider?: string }>
  }
  models?: {
    providers?: Record<string, { models?: Array<{ id?: string; name?: string; reasoning?: boolean; input?: string[]; contextWindow?: number; cost?: Record<string, number> }> }>
  }
  agents?: {
    defaults?: {
      model?: {
        primary?: string
        fallbacks?: Array<string>
      }
      models?: Record<string, unknown>
    }
  }
}

let cachedProviderNames: Array<string> | null = null
let cachedModelIds: Set<string> | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 30_000 // 30 seconds — auto-refresh model list

function isCacheStale(): boolean {
  return Date.now() - cacheTimestamp > CACHE_TTL_MS
}

export function invalidateCache(): void {
  cachedProviderNames = null
  cachedModelIds = null
  cacheTimestamp = 0
}

/**
 * Strip JS-style comments and trailing commas from a JSON-ish string (JSONC).
 */
function stripJsonc(raw: string): string {
  // Strip comments while respecting quoted strings.
  // Walk character-by-character to avoid stripping // inside "https://..." etc.
  let result = ''
  let i = 0
  const len = raw.length
  while (i < len) {
    const ch = raw[i]
    // Skip over strings — preserve contents verbatim
    if (ch === '"') {
      let j = i + 1
      while (j < len) {
        if (raw[j] === '\\') { j += 2; continue }
        if (raw[j] === '"') { j++; break }
        j++
      }
      result += raw.slice(i, j)
      i = j
      continue
    }
    // Block comment /* ... */
    if (ch === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2)
      i = end === -1 ? len : end + 2
      continue
    }
    // Line comment // ...
    if (ch === '/' && raw[i + 1] === '/') {
      const end = raw.indexOf('\n', i + 2)
      i = end === -1 ? len : end
      continue
    }
    result += ch
    i++
  }
  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, '$1')
  return result
}

/**
 * Read and parse the Gateway config file, supporting JSON, JSONC, YAML, and YML.
 * Resolution order:
 *   1. OPENCLAW_CONFIG_PATH env var (if set)
 *   2. ~/.openclaw/openclaw.json
 *   3. ~/.openclaw/openclaw.yaml
 *   4. ~/.openclaw/openclaw.yml
 * Returns null if no config file is found or parsing fails.
 */
function readGatewayConfig(): GatewayConfig | null {
  const dir = path.join(os.homedir(), '.openclaw')

  // Candidates in priority order
  const candidates: string[] = []

  const envPath = process.env['OPENCLAW_CONFIG_PATH']
  if (envPath) {
    candidates.push(envPath)
  }

  candidates.push(
    path.join(dir, 'openclaw.json'),
    path.join(dir, 'openclaw.yaml'),
    path.join(dir, 'openclaw.yml'),
  )

  for (const filePath of candidates) {
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf8')
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT') continue // try next candidate
      // Unexpected I/O error — surface in dev
      if (import.meta.env.DEV) console.error(`Failed to read config at ${filePath}:`, err)
      continue
    }

    const ext = path.extname(filePath).toLowerCase()
    try {
      if (ext === '.yaml' || ext === '.yml') {
        return parseYaml(raw) as GatewayConfig
      } else {
        // .json or unknown — treat as JSONC (strip comments + trailing commas)
        return JSON.parse(stripJsonc(raw)) as GatewayConfig
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error(`Failed to parse config at ${filePath}:`, err)
      continue
    }
  }

  return null
}

/**
 * Extract provider name from auth profile key.
 * Example: "anthropic:default" -> "anthropic"
 */
function providerNameFromProfileKey(profileKey: string): string | null {
  const raw = profileKey.split(':')[0]?.trim().toLowerCase() ?? ''
  if (raw.length === 0) return null
  return raw
}

/**
 * Convert provider/model key to model id.
 * Example: "openai-codex/gpt-5.2-codex" -> "gpt-5.2-codex"
 */
function modelIdFromScopedKey(scoped: string): string | null {
  const raw = scoped.trim()
  if (!raw) return null

  const slashIndex = raw.indexOf('/')
  if (slashIndex < 0) return raw

  const modelId = raw.slice(slashIndex + 1).trim()
  return modelId.length > 0 ? modelId : null
}

/**
 * Read configured provider names from auth.profiles keys in the OpenClaw config.
 * Returns only provider names (e.g., ["anthropic", "openrouter"]), never secrets.
 */
export function getConfiguredProviderNames(): Array<string> {
  if (cachedProviderNames && !isCacheStale()) return cachedProviderNames

  try {
    const config = readGatewayConfig()
    if (!config) return []

    const providerNames = new Set<string>()

    if (config.auth?.profiles) {
      for (const profileKey of Object.keys(config.auth.profiles)) {
        const providerName = providerNameFromProfileKey(profileKey)
        if (providerName) providerNames.add(providerName)
      }
    }

    // Also include providers from models.providers keys — catches auth-free
    // providers like ollama-pc1 that have no auth.profiles entry.
    if (config.models?.providers) {
      for (const providerName of Object.keys(config.models.providers)) {
        if (providerName.trim()) providerNames.add(providerName.trim())
      }
    }

    cachedProviderNames = Array.from(providerNames).sort()
    cacheTimestamp = Date.now()
    return cachedProviderNames
  } catch (error) {
    if (import.meta.env.DEV)
      console.error('Failed to read Gateway config for provider names:', error)
    return []
  }
}

/**
 * Backward-compatible alias.
 */
export function getConfiguredProviders(): Array<string> {
  return getConfiguredProviderNames()
}

/**
 * Read configured model IDs from the Gateway config file.
 * Supports both legacy models.providers.*.models[] and newer agents.defaults.models keys.
 */
export function getConfiguredModelIds(): Set<string> {
  if (cachedModelIds && !isCacheStale()) return cachedModelIds

  try {
    const config = readGatewayConfig()
    if (!config) return new Set()

    const modelIds = new Set<string>()

    if (config.models?.providers) {
      for (const providerConfig of Object.values(config.models.providers)) {
        if (providerConfig.models) {
          for (const model of providerConfig.models) {
            if (model.id) {
              modelIds.add(model.id)
            }
          }
        }
      }
    }

    // Current schema: agents.defaults.models["provider/model-id"]
    const defaults = config.agents?.defaults
    if (defaults?.models) {
      for (const scopedKey of Object.keys(defaults.models)) {
        const modelId = modelIdFromScopedKey(scopedKey)
        if (modelId) modelIds.add(modelId)
      }
    }

    // Include primary + fallback models as an additional source of configured IDs.
    if (defaults?.model?.primary) {
      const modelId = modelIdFromScopedKey(defaults.model.primary)
      if (modelId) modelIds.add(modelId)
    }
    if (Array.isArray(defaults?.model?.fallbacks)) {
      for (const fallback of defaults.model.fallbacks) {
        const modelId = modelIdFromScopedKey(fallback)
        if (modelId) modelIds.add(modelId)
      }
    }

    cachedModelIds = modelIds
    cacheTimestamp = Date.now()
    return cachedModelIds
  } catch (error) {
    if (import.meta.env.DEV)
      console.error('Failed to read Gateway config for model IDs:', error)
    return new Set()
  }
}

type ConfigModelEntry = {
  id: string
  name?: string
  provider?: string
  reasoning?: boolean
  input?: string[]
  contextWindow?: number
}

/**
 * Read model entries directly from the config file (models.providers.*.models[]).
 * These are models the user explicitly configured — they should always appear
 * in the model switcher even if the gateway's auto-discovery doesn't return them.
 */
export function getConfiguredModelsFromConfig(): ConfigModelEntry[] {
  try {
    const config = readGatewayConfig()
    if (!config) return []

    const results: ConfigModelEntry[] = []

    if (config.models?.providers) {
      for (const [providerName, providerConfig] of Object.entries(config.models.providers)) {
        if (providerConfig.models) {
          for (const model of providerConfig.models) {
            if (model.id) {
              results.push({
                id: model.id,
                name: model.name || model.id,
                provider: providerName,
                reasoning: model.reasoning,
                input: model.input,
                contextWindow: model.contextWindow,
              })
            }
          }
        }
      }
    }

    return results
  } catch {
    return []
  }
}
