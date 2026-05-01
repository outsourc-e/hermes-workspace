import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

export type MemoryIntegrationSource = {
  id: string
  label: string
  path?: string
  present: boolean
  configured: boolean
  details: string
}

export type MemoryIntegrationStatus = {
  id: 'honcho' | 'byterover'
  label: 'Honcho memory' | 'Byterover memory'
  available: boolean
  configured: boolean
  safeToUse: boolean
  mode: 'ready' | 'detected-unconfigured' | 'not-detected'
  summary: string
  sources: Array<MemoryIntegrationSource>
  checkedAt: number
}

type DetectMemoryIntegrationOptions = {
  env?: NodeJS.ProcessEnv
  homeDir?: string
  openClawHome?: string
  claudeHome?: string
  now?: number
}

const HONCHO_ENV_KEYS = [
  'HONCHO_API_KEY',
  'HONCHO_APP_ID',
  'HONCHO_BASE_URL',
  'HONCHO_URL',
  'HONCHO_ENVIRONMENT',
] as const

const HONCHO_CONFIG_KEYS = [
  'enabled',
  'api_key',
  'apiKey',
  'app_id',
  'appId',
  'url',
  'base_url',
  'baseUrl',
] as const

function expandHome(value: string, homeDir: string): string {
  if (value === '~') return homeDir
  if (value.startsWith('~/')) return path.join(homeDir, value.slice(2))
  return value
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function readYaml(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const parsed = YAML.parse(fs.readFileSync(filePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function readEnvFile(filePath: string): Record<string, string> {
  try {
    if (!fs.existsSync(filePath)) return {}
    const env: Record<string, string> = {}
    for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
    return env
  } catch {
    return {}
  }
}

function hasOwnTruthy(
  record: Record<string, unknown> | null | undefined,
  keys: ReadonlyArray<string>,
): boolean {
  if (!record) return false
  return keys.some((key) => {
    const value = record[key]
    return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value)
  })
}

function objectAt(
  record: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function envConfigured(env: Record<string, string | undefined>): boolean {
  return HONCHO_ENV_KEYS.some((key) => Boolean(env[key]?.trim()))
}

function configHasHoncho(record: Record<string, unknown> | null): boolean {
  const honchoConfig = objectAt(record, 'honcho')
  const memoryConfig = objectAt(record, 'memory')
  const integrationsConfig = objectAt(record, 'integrations')
  const integrationsHoncho = objectAt(integrationsConfig, 'honcho')
  const provider = String(memoryConfig?.provider ?? '').toLowerCase()

  return (
    hasOwnTruthy(honchoConfig, HONCHO_CONFIG_KEYS) ||
    (provider.includes('honcho') &&
      hasOwnTruthy(memoryConfig, ['provider', 'honcho'])) ||
    hasOwnTruthy(integrationsHoncho, HONCHO_CONFIG_KEYS)
  )
}

function fileSource(
  id: string,
  label: string,
  filePath: string,
  configured: boolean,
  details: string,
): MemoryIntegrationSource {
  return {
    id,
    label,
    path: filePath,
    present: fs.existsSync(filePath),
    configured,
    details,
  }
}

export type HonchoDetectionSource = MemoryIntegrationSource
export type HonchoIntegrationStatus = MemoryIntegrationStatus & {
  id: 'honcho'
  label: 'Honcho memory'
}
type DetectHonchoOptions = DetectMemoryIntegrationOptions

export function detectHonchoIntegration(
  options: DetectHonchoOptions = {},
): HonchoIntegrationStatus {
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? os.homedir()
  const openClawHome = expandHome(
    options.openClawHome ??
      env.OPENCLAW_HOME ??
      path.join(homeDir, '.openclaw'),
    homeDir,
  )
  const claudeHome = expandHome(
    options.claudeHome ??
      env.HERMES_HOME ??
      env.CLAUDE_HOME ??
      path.join(homeDir, '.hermes'),
    homeDir,
  )

  const processEnvConfigured = envConfigured(env)

  const openClawEnvPath = path.join(openClawHome, '.env')
  const openClawEnvConfigured = envConfigured(readEnvFile(openClawEnvPath))

  const openClawConfigPath = path.join(openClawHome, 'config.yaml')
  const openClawConfigConfigured = configHasHoncho(readYaml(openClawConfigPath))

  const claudeEnvPath = path.join(claudeHome, '.env')
  const claudeEnvConfigured = envConfigured(readEnvFile(claudeEnvPath))
  const claudeConfigPath = path.join(claudeHome, 'config.yaml')
  const claudeConfigConfigured = configHasHoncho(readYaml(claudeConfigPath))

  const localDirs = [
    path.join(homeDir, '.honcho'),
    path.join(homeDir, '.config', 'honcho'),
    path.join(openClawHome, 'honcho'),
    path.join(claudeHome, 'honcho'),
  ]

  const sources: Array<MemoryIntegrationSource> = [
    {
      id: 'process-env',
      label: 'Process environment',
      present: processEnvConfigured,
      configured: processEnvConfigured,
      details: processEnvConfigured
        ? 'Honcho env var present in process environment.'
        : 'No Honcho env var in process environment.',
    },
    fileSource(
      'openclaw-env',
      'OpenClaw .env',
      openClawEnvPath,
      openClawEnvConfigured,
      openClawEnvConfigured
        ? 'Honcho env var present in OpenClaw .env.'
        : 'No Honcho env var in OpenClaw .env.',
    ),
    fileSource(
      'openclaw-config',
      'OpenClaw config.yaml',
      openClawConfigPath,
      openClawConfigConfigured,
      openClawConfigConfigured
        ? 'Honcho keys found in OpenClaw config.'
        : 'No Honcho keys found in OpenClaw config.',
    ),
    fileSource(
      'claude-env',
      'Current .env compatibility',
      claudeEnvPath,
      claudeEnvConfigured,
      claudeEnvConfigured
        ? 'Honcho env var present in current .env.'
        : 'No Honcho env var in current .env.',
    ),
    fileSource(
      'claude-config',
      'Current config.yaml compatibility',
      claudeConfigPath,
      claudeConfigConfigured,
      claudeConfigConfigured
        ? 'Honcho keys found in current config.'
        : 'No Honcho keys found in current config.',
    ),
    ...localDirs.map((dir) => ({
      id: `dir:${dir}`,
      label: path.basename(dir) || dir,
      path: dir,
      present: fs.existsSync(dir),
      configured: false,
      details: fs.existsSync(dir)
        ? 'Local Honcho directory exists; configuration still needs verification.'
        : 'Directory not found.',
    })),
  ]

  const configured = sources.some((source) => source.configured)
  const present = configured || sources.some((source) => source.present)
  const mode: MemoryIntegrationStatus['mode'] = configured
    ? 'ready'
    : present
      ? 'detected-unconfigured'
      : 'not-detected'

  return {
    id: 'honcho',
    label: 'Honcho memory',
    available: present,
    configured,
    safeToUse: configured,
    mode,
    summary: configured
      ? 'Honcho memory configuration detected. Workspace can safely gate Honcho-backed features behind explicit user action.'
      : present
        ? 'Honcho presence detected, but no usable config/token was found. Honcho-backed features remain disabled.'
        : 'Honcho not detected. Optional Honcho-backed memory features remain hidden/disabled.',
    sources,
    checkedAt: options.now ?? Date.now(),
  }
}

const BYTEROVER_ENV_KEYS = [
  'BYTEROVER_API_KEY',
  'BYTEROVER_TOKEN',
  'BYTEROVER_BASE_URL',
  'BYTEROVER_URL',
  'BYTEROVER_PROJECT_ID',
] as const

const BYTEROVER_CONFIG_KEYS = [
  'enabled',
  'api_key',
  'apiKey',
  'token',
  'project_id',
  'projectId',
  'url',
  'base_url',
  'baseUrl',
] as const

type DetectByteroverOptions = DetectMemoryIntegrationOptions
export type ByteroverIntegrationStatus = MemoryIntegrationStatus & {
  id: 'byterover'
  label: 'Byterover memory'
}

function byteroverEnvConfigured(
  env: Record<string, string | undefined>,
): boolean {
  return BYTEROVER_ENV_KEYS.some((key) => Boolean(env[key]?.trim()))
}

function configHasByterover(record: Record<string, unknown> | null): boolean {
  const byteroverConfig = objectAt(record, 'byterover')
  const memoryConfig = objectAt(record, 'memory')
  const integrationsConfig = objectAt(record, 'integrations')
  const integrationsByterover = objectAt(integrationsConfig, 'byterover')
  const provider = String(memoryConfig?.provider ?? '').toLowerCase()

  return (
    hasOwnTruthy(byteroverConfig, BYTEROVER_CONFIG_KEYS) ||
    (provider.includes('byterover') &&
      hasOwnTruthy(memoryConfig, ['provider', 'byterover'])) ||
    hasOwnTruthy(integrationsByterover, BYTEROVER_CONFIG_KEYS)
  )
}

export function detectByteroverIntegration(
  options: DetectByteroverOptions = {},
): ByteroverIntegrationStatus {
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? os.homedir()
  const openClawHome = expandHome(
    options.openClawHome ??
      env.OPENCLAW_HOME ??
      path.join(homeDir, '.openclaw'),
    homeDir,
  )
  const claudeHome = expandHome(
    options.claudeHome ??
      env.HERMES_HOME ??
      env.CLAUDE_HOME ??
      path.join(homeDir, '.hermes'),
    homeDir,
  )

  const processEnvConfigured = byteroverEnvConfigured(env)

  const openClawEnvPath = path.join(openClawHome, '.env')
  const openClawEnvConfigured = byteroverEnvConfigured(
    readEnvFile(openClawEnvPath),
  )

  const openClawConfigPath = path.join(openClawHome, 'config.yaml')
  const openClawConfigConfigured = configHasByterover(
    readYaml(openClawConfigPath),
  )

  const claudeEnvPath = path.join(claudeHome, '.env')
  const claudeEnvConfigured = byteroverEnvConfigured(readEnvFile(claudeEnvPath))
  const claudeConfigPath = path.join(claudeHome, 'config.yaml')
  const claudeConfigConfigured = configHasByterover(readYaml(claudeConfigPath))

  const localDirs = [
    path.join(homeDir, '.byterover'),
    path.join(homeDir, '.config', 'byterover'),
    path.join(openClawHome, 'byterover'),
    path.join(claudeHome, 'byterover'),
  ]

  const sources: Array<MemoryIntegrationSource> = [
    {
      id: 'process-env',
      label: 'Process environment',
      present: processEnvConfigured,
      configured: processEnvConfigured,
      details: processEnvConfigured
        ? 'Byterover env var present in process environment.'
        : 'No Byterover env var in process environment.',
    },
    fileSource(
      'openclaw-env',
      'OpenClaw .env',
      openClawEnvPath,
      openClawEnvConfigured,
      openClawEnvConfigured
        ? 'Byterover env var present in OpenClaw .env.'
        : 'No Byterover env var in OpenClaw .env.',
    ),
    fileSource(
      'openclaw-config',
      'OpenClaw config.yaml',
      openClawConfigPath,
      openClawConfigConfigured,
      openClawConfigConfigured
        ? 'Byterover keys found in OpenClaw config.'
        : 'No Byterover keys found in OpenClaw config.',
    ),
    fileSource(
      'claude-env',
      'Current .env compatibility',
      claudeEnvPath,
      claudeEnvConfigured,
      claudeEnvConfigured
        ? 'Byterover env var present in current .env.'
        : 'No Byterover env var in current .env.',
    ),
    fileSource(
      'claude-config',
      'Current config.yaml compatibility',
      claudeConfigPath,
      claudeConfigConfigured,
      claudeConfigConfigured
        ? 'Byterover keys found in current config.'
        : 'No Byterover keys found in current config.',
    ),
    ...localDirs.map((dir) => ({
      id: `dir:${dir}`,
      label: path.basename(dir) || dir,
      path: dir,
      present: fs.existsSync(dir),
      configured: false,
      details: fs.existsSync(dir)
        ? 'Local Byterover directory exists; configuration still needs verification.'
        : 'Directory not found.',
    })),
  ]

  const configured = sources.some((source) => source.configured)
  const present = configured || sources.some((source) => source.present)
  const mode: MemoryIntegrationStatus['mode'] = configured
    ? 'ready'
    : present
      ? 'detected-unconfigured'
      : 'not-detected'

  return {
    id: 'byterover',
    label: 'Byterover memory',
    available: present,
    configured,
    safeToUse: configured,
    mode,
    summary: configured
      ? 'Byterover memory configuration detected. Workspace can safely gate Byterover-backed features behind explicit user action.'
      : present
        ? 'Byterover presence detected, but no usable config/token was found. Byterover-backed features remain disabled.'
        : 'Byterover not detected. Optional Byterover-backed memory features remain hidden/disabled.',
    sources,
    checkedAt: options.now ?? Date.now(),
  }
}
