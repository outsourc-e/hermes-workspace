/**
 * Local Provider Auto-Discovery
 *
 * Probes well-known local ports for OpenAI-compatible backends (Ollama, Atomic Chat, etc.)
 * and exposes their models to the workspace model picker.
 *
 * - Probes on first request + re-probes every 30s
 * - Merges discovered models into /api/models response
 * - Auto-writes custom_providers to ~/.hermes/config.yaml if not already configured
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// -------------------------------------------------------------------
// Well-known local providers
// -------------------------------------------------------------------

export type LocalProviderDef = {
  id: string
  name: string
  port: number
  /** Path appended to http://127.0.0.1:{port} for the models endpoint */
  modelsPath: string
  /** Base URL for the provider (written to custom_providers) */
  baseUrl: string
  apiKey: string
  apiMode: string
}

const LOCAL_PROVIDERS: LocalProviderDef[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    port: 11434,
    modelsPath: '/v1/models',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'ollama',
    apiMode: 'chat_completions',
  },
  {
    id: 'atomic-chat',
    name: 'Atomic Chat',
    port: 1337,
    modelsPath: '/v1/models',
    baseUrl: 'http://127.0.0.1:1337/v1',
    apiKey: 'atomic-chat',
    apiMode: 'chat_completions',
  },
]

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

export type DiscoveredModel = {
  id: string
  name: string
  provider: string
  source: 'local-discovery'
  size?: number | null
}

export type DiscoveredProvider = {
  def: LocalProviderDef
  online: boolean
  models: DiscoveredModel[]
  lastProbe: number
}

// -------------------------------------------------------------------
// State
// -------------------------------------------------------------------

const PROBE_TTL_MS = 30_000 // re-probe every 30s
const PROBE_TIMEOUT_MS = 800 // 800ms timeout per probe — local servers respond fast

let discoveryState: Map<string, DiscoveredProvider> = new Map()
let lastProbeAll = 0
let probePromise: Promise<void> | null = null

// -------------------------------------------------------------------
// Probe logic
// -------------------------------------------------------------------

function cleanModelName(id: string): string {
  // Ollama models often have :latest suffix, keep it for ID but clean for display
  return id.replace(/:latest$/, '')
}

async function probeProvider(
  def: LocalProviderDef,
): Promise<DiscoveredProvider> {
  const url = `http://127.0.0.1:${def.port}${def.modelsPath}`
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      return { def, online: false, models: [], lastProbe: Date.now() }
    }
    const payload = (await response.json()) as Record<string, unknown>
    const rawModels = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : []

    const models: DiscoveredModel[] = rawModels
      .flatMap((entry: Record<string, unknown>) => {
        const id =
          typeof entry.id === 'string'
            ? entry.id
            : typeof entry.name === 'string'
              ? entry.name
              : ''
        if (!id) return []
        return [{
          id,
          name: cleanModelName(id),
          provider: def.id,
          source: 'local-discovery' as const,
          size:
            typeof entry.size === 'number'
              ? Math.round(entry.size / 1024 / 1024 / 1024)
              : null,
        }]
      })

    return { def, online: true, models, lastProbe: Date.now() }
  } catch {
    return { def, online: false, models: [], lastProbe: Date.now() }
  }
}

async function probeAll(): Promise<void> {
  const results = await Promise.allSettled(
    LOCAL_PROVIDERS.map((def) => probeProvider(def)),
  )
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const prev = discoveryState.get(result.value.def.id)
      discoveryState.set(result.value.def.id, result.value)

      // Log state changes
      if (result.value.online && !prev?.online) {
        console.log(
          `[local-discovery] ${result.value.def.name} detected on :${result.value.def.port} — ${result.value.models.length} model(s)`,
        )
      } else if (!result.value.online && prev?.online) {
        console.log(
          `[local-discovery] ${result.value.def.name} went offline on :${result.value.def.port}`,
        )
      }
    }
  }
  lastProbeAll = Date.now()
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Ensure discovery has run recently. Call before reading results.
 * Deduplicates concurrent probes.
 */
export async function ensureDiscovery(): Promise<void> {
  if (Date.now() - lastProbeAll < PROBE_TTL_MS) return
  if (probePromise) return probePromise
  probePromise = probeAll().finally(() => {
    probePromise = null
  })
  return probePromise
}

/**
 * Force a re-probe immediately (e.g. after config change).
 */
export async function forceDiscovery(): Promise<void> {
  lastProbeAll = 0
  return ensureDiscovery()
}

/**
 * Get all discovered models across all local providers.
 */
export function getDiscoveredModels(): DiscoveredModel[] {
  const models: DiscoveredModel[] = []
  for (const provider of discoveryState.values()) {
    if (provider.online) {
      models.push(...provider.models)
    }
  }
  return models
}

/**
 * Get discovery status for all known local providers.
 */
export function getDiscoveryStatus(): Array<{
  id: string
  name: string
  online: boolean
  modelCount: number
  port: number
  lastProbe: number
}> {
  return LOCAL_PROVIDERS.map((def) => {
    const state = discoveryState.get(def.id)
    return {
      id: def.id,
      name: def.name,
      online: state?.online ?? false,
      modelCount: state?.models.length ?? 0,
      port: def.port,
      lastProbe: state?.lastProbe ?? 0,
    }
  })
}

/**
 * Get the provider definition for a given ID.
 */
export function getLocalProviderDef(
  id: string,
): LocalProviderDef | undefined {
  return LOCAL_PROVIDERS.find((def) => def.id === id)
}

/**
 * List of all well-known local provider IDs.
 */
export const LOCAL_PROVIDER_IDS = LOCAL_PROVIDERS.map((p) => p.id)

// Kick off first probe immediately at import time
void ensureDiscovery()

// -------------------------------------------------------------------
// Config auto-writer
// -------------------------------------------------------------------

const CONFIG_PATH = path.join(os.homedir(), '.hermes', 'config.yaml')

/**
 * Check if a provider is already in custom_providers config.
 * Returns true if the provider already has a config entry.
 */
export function isProviderConfigured(providerId: string): boolean {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    // Simple check — look for the provider name in custom_providers
    // Full YAML parsing would be better but this avoids adding a dep
    const cpMatch = raw.match(
      /custom_providers:\s*\n((?:\s+-[\s\S]*?)*)(?=\n\S|\n*$)/,
    )
    if (!cpMatch) return false
    return cpMatch[0].includes(`name: ${providerId}`)
  } catch {
    return false
  }
}

/**
 * Ensure a discovered provider has a custom_providers entry in config.yaml.
 * Returns true if config was modified (gateway restart needed).
 *
 * NOTE: This does NOT auto-write anymore to avoid corrupting config.yaml.
 * The config should be managed through the gateway's /api/config endpoint
 * or manually by the user. This function only returns whether a write
 * would be needed.
 */
export function ensureProviderInConfig(providerId: string): boolean {
  if (isProviderConfigured(providerId)) return false
  const def = LOCAL_PROVIDERS.find((p) => p.id === providerId)
  if (!def) return false
  // Don't auto-write — just signal that config is needed
  console.log(
    `[local-discovery] ${def.name} detected but not in custom_providers. Gateway restart needed after adding it.`,
  )
  return false
}
