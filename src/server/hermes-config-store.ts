import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

import type { HermesConfigPaths } from './hermes-config-migration'

export type SetDefaultModelPatch = {
  action: 'set-default-model'
  providerId: string
  modelId: string
}

export type SetApiKeyPatch = {
  action: 'set-api-key'
  envKey: string
  value: string
}

export type RemoveApiKeyPatch = {
  action: 'remove-api-key'
  envKey: string
}

export type SetCustomProviderPatch = {
  action: 'set-custom-provider'
  provider: {
    name: string
    baseUrl: string
    apiKeyEnv?: string
    apiMode?: string
  }
}

export type RemoveCustomProviderPatch = {
  action: 'remove-custom-provider'
  name: string
}

export type HermesConfigPatch =
  | SetDefaultModelPatch
  | SetApiKeyPatch
  | RemoveApiKeyPatch
  | SetCustomProviderPatch
  | RemoveCustomProviderPatch

export type HermesConfigPatchResult = {
  ok: boolean
  message?: string
}

export type HermesConfigFiles = {
  config: Record<string, unknown>
  env: Record<string, string>
  authProfiles: Record<string, unknown>
}

export function resolveHermesConfigPaths(): HermesConfigPaths {
  const hermesHome =
    process.env.HERMES_HOME ??
    process.env.CLAUDE_HOME ??
    path.join(os.homedir(), '.hermes')
  return {
    hermesHome,
    configPath: path.join(hermesHome, 'config.yaml'),
    envPath: path.join(hermesHome, '.env'),
    authProfilesPath: path.join(hermesHome, 'auth-profiles.json'),
  }
}

export function parseEnvFile(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx <= 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let value = trimmed.slice(eqIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

function quoteEnvValue(value: string): string {
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error('env values must not contain newlines')
  }
  if (value === '') return ''
  // No quoting needed for plain values
  if (!/[\s#="']/.test(value)) return value
  if (!value.includes('"')) return `"${value}"`
  if (!value.includes("'")) return `'${value}'`
  // Both quote styles present; the file parser strips matching outer quotes
  // but doesn't unescape. Drop the less-disruptive set so the value at least
  // round-trips exactly minus the inner quotes.
  return `"${value.replace(/"/g, '')}"`
}

export function stringifyEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([k, v]) => `${k}=${quoteEnvValue(v)}`)
    .join('\n') + '\n'
}

function readYamlConfig(configPath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed = YAML.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function writeYamlConfig(configPath: string, config: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, YAML.stringify(config), 'utf-8')
}

function readEnv(envPath: string): Record<string, string> {
  try {
    return parseEnvFile(fs.readFileSync(envPath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeEnv(envPath: string, env: Record<string, string>): void {
  fs.mkdirSync(path.dirname(envPath), { recursive: true })
  fs.writeFileSync(envPath, stringifyEnv(env), 'utf-8')
}

function readAuthProfiles(authProfilesPath: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(authProfilesPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function readHermesConfigFiles(paths: HermesConfigPaths): HermesConfigFiles {
  return {
    config: readYamlConfig(paths.configPath),
    env: readEnv(paths.envPath),
    authProfiles: readAuthProfiles(paths.authProfilesPath),
  }
}

function readCustomProvidersList(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const entries = config.custom_providers
  return Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => {
        return Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
      })
    : []
}

function applySetDefaultModel(
  paths: HermesConfigPaths,
  patch: SetDefaultModelPatch,
): HermesConfigPatchResult {
  const config = readYamlConfig(paths.configPath)
  config.provider = patch.providerId

  // Preserve any nested-form extension fields (e.g. temperature, max_tokens)
  // some Hermes deployments stash under `model: { ... }`. Only update the
  // canonical `default`/`provider` keys; otherwise switch to flat form.
  const existing = config.model
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    const next = { ...(existing as Record<string, unknown>) }
    next.default = patch.modelId
    next.provider = patch.providerId
    config.model = next
  } else {
    config.model = patch.modelId
  }

  writeYamlConfig(paths.configPath, config)
  return { ok: true }
}

function applySetApiKey(
  paths: HermesConfigPaths,
  patch: SetApiKeyPatch,
): HermesConfigPatchResult {
  const env = readEnv(paths.envPath)
  env[patch.envKey] = patch.value
  writeEnv(paths.envPath, env)
  return { ok: true }
}

function applyRemoveApiKey(
  paths: HermesConfigPaths,
  patch: RemoveApiKeyPatch,
): HermesConfigPatchResult {
  const env = readEnv(paths.envPath)
  delete env[patch.envKey]
  writeEnv(paths.envPath, env)
  return { ok: true }
}

function applySetCustomProvider(
  paths: HermesConfigPaths,
  patch: SetCustomProviderPatch,
): HermesConfigPatchResult {
  const config = readYamlConfig(paths.configPath)
  const list = readCustomProvidersList(config)
  const next = list.filter((entry) => entry.name !== patch.provider.name)
  const entry: Record<string, unknown> = {
    name: patch.provider.name,
    base_url: patch.provider.baseUrl,
  }
  if (patch.provider.apiKeyEnv) entry.key_env = patch.provider.apiKeyEnv
  if (patch.provider.apiMode) entry.api_mode = patch.provider.apiMode
  next.push(entry)
  config.custom_providers = next
  writeYamlConfig(paths.configPath, config)
  return { ok: true }
}

function applyRemoveCustomProvider(
  paths: HermesConfigPaths,
  patch: RemoveCustomProviderPatch,
): HermesConfigPatchResult {
  const config = readYamlConfig(paths.configPath)
  const list = readCustomProvidersList(config)
  const next = list.filter((entry) => entry.name !== patch.name)
  if (next.length === 0) delete config.custom_providers
  else config.custom_providers = next
  writeYamlConfig(paths.configPath, config)
  return { ok: true }
}

export function applyHermesConfigPatch(
  paths: HermesConfigPaths,
  patch: HermesConfigPatch,
): HermesConfigPatchResult {
  switch (patch.action) {
    case 'set-default-model':
      return applySetDefaultModel(paths, patch)
    case 'set-api-key':
      return applySetApiKey(paths, patch)
    case 'remove-api-key':
      return applyRemoveApiKey(paths, patch)
    case 'set-custom-provider':
      return applySetCustomProvider(paths, patch)
    case 'remove-custom-provider':
      return applyRemoveCustomProvider(paths, patch)
    default: {
      const _exhaustive: never = patch
      void _exhaustive
      return { ok: false, message: 'Unknown action' }
    }
  }
}
