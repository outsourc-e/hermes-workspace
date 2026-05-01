import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'

export type HonchoDetectionSource = {
  id: string
  label: string
  path?: string
  present: boolean
  configured: boolean
  details: string
}

export type HonchoIntegrationStatus = {
  id: 'honcho'
  label: 'Honcho memory'
  available: boolean
  configured: boolean
  safeToUse: boolean
  mode: 'ready' | 'detected-unconfigured' | 'not-detected'
  summary: string
  sources: Array<HonchoDetectionSource>
  checkedAt: number
}

type DetectHonchoOptions = {
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
      ? parsed as Record<string, unknown>
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
      ? parsed as Record<string, unknown>
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key] = value
    }
    return env
  } catch {
    return {}
  }
}

function hasOwnTruthy(record: Record<string, unknown> | null | undefined, keys: ReadonlyArray<string>): boolean {
  if (!record) return false
  return keys.some((key) => {
    const value = record[key]
    return typeof value === 'string' ? Boolean(value.trim()) : Boolean(value)
  })
}

function objectAt(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
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
    (provider.includes('honcho') && hasOwnTruthy(memoryConfig, ['provider', 'honcho'])) ||
    hasOwnTruthy(integrationsHoncho, HONCHO_CONFIG_KEYS)
  )
}

function fileSource(id: string, label: string, filePath: string, configured: boolean, details: string): HonchoDetectionSource {
  return {
    id,
    label,
    path: filePath,
    present: fs.existsSync(filePath),
    configured,
    details,
  }
}

export function detectHonchoIntegration(options: DetectHonchoOptions = {}): HonchoIntegrationStatus {
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? os.homedir()
  const openClawHome = expandHome(options.openClawHome ?? env.OPENCLAW_HOME ?? path.join(homeDir, '.openclaw'), homeDir)
  const claudeHome = expandHome(options.claudeHome ?? env.CLAUDE_HOME ?? path.join(homeDir, '.claude'), homeDir)

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

  const sources: Array<HonchoDetectionSource> = [
    {
      id: 'process-env',
      label: 'Process environment',
      present: processEnvConfigured,
      configured: processEnvConfigured,
      details: processEnvConfigured ? 'Honcho env var present in process environment.' : 'No Honcho env var in process environment.',
    },
    fileSource(
      'openclaw-env',
      'OpenClaw .env',
      openClawEnvPath,
      openClawEnvConfigured,
      openClawEnvConfigured ? 'Honcho env var present in OpenClaw .env.' : 'No Honcho env var in OpenClaw .env.',
    ),
    fileSource(
      'openclaw-config',
      'OpenClaw config.yaml',
      openClawConfigPath,
      openClawConfigConfigured,
      openClawConfigConfigured ? 'Honcho keys found in OpenClaw config.' : 'No Honcho keys found in OpenClaw config.',
    ),
    fileSource(
      'claude-env',
      'Current .env compatibility',
      claudeEnvPath,
      claudeEnvConfigured,
      claudeEnvConfigured ? 'Honcho env var present in current .env.' : 'No Honcho env var in current .env.',
    ),
    fileSource(
      'claude-config',
      'Current config.yaml compatibility',
      claudeConfigPath,
      claudeConfigConfigured,
      claudeConfigConfigured ? 'Honcho keys found in current config.' : 'No Honcho keys found in current config.'
    ),
    ...localDirs.map((dir) => ({
      id: `dir:${dir}`,
      label: path.basename(dir) || dir,
      path: dir,
      present: fs.existsSync(dir),
      configured: false,
      details: fs.existsSync(dir) ? 'Local Honcho directory exists; configuration still needs verification.' : 'Directory not found.',
    })),
  ]

  const configured = sources.some((source) => source.configured)
  const present = configured || sources.some((source) => source.present)
  const mode: HonchoIntegrationStatus['mode'] = configured
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
