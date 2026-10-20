import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type RemoteHermesHarnessConfig = {
  id: string
  type: 'hermes'
  name: string
  description: string
  baseUrl: string
  model: string
}

export type RemoteOpenClawHarnessConfig = {
  id: string
  type: 'openclaw'
  name: string
  description: string
  gatewayUrl: string
  sessionKey: string
  model: string
}

export type RemoteHarnessConfig =
  | RemoteHermesHarnessConfig
  | RemoteOpenClawHarnessConfig

type RemoteHarnessConfigFile = {
  harnesses?: Array<Record<string, unknown>>
}

function configPath(): string {
  const override = process.env.HERMES_WORKSPACE_REMOTE_HARNESSES?.trim()
  if (override) return override
  if (process.platform === 'darwin') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'hermes-workspace',
      'remote-harnesses.json',
    )
  }
  if (process.platform === 'win32') {
    return join(
      process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
      'hermes-workspace',
      'remote-harnesses.json',
    )
  }
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'hermes-workspace',
    'remote-harnesses.json',
  )
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function safeUrl(value: unknown, protocols: Array<string>): string {
  const raw = stringValue(value)
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return protocols.includes(parsed.protocol)
      ? parsed.toString().replace(/\/$/, '')
      : ''
  } catch {
    return ''
  }
}

function normalizeHarness(row: Record<string, unknown>): RemoteHarnessConfig | null {
  const id = stringValue(row.id)
  const type = stringValue(row.type)
  const name = stringValue(row.name)
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !name) return null

  if (type === 'hermes') {
    const baseUrl = safeUrl(row.baseUrl, ['http:', 'https:'])
    if (!baseUrl) return null
    return {
      id,
      type,
      name,
      description:
        stringValue(row.description) || 'Remote Hermes Agent session',
      baseUrl,
      model: stringValue(row.model) || 'hermes-agent',
    }
  }

  if (type === 'openclaw') {
    const gatewayUrl = safeUrl(row.gatewayUrl, ['ws:', 'wss:'])
    const sessionKey = stringValue(row.sessionKey)
    if (!gatewayUrl || !sessionKey || sessionKey.length > 200) return null
    return {
      id,
      type,
      name,
      description:
        stringValue(row.description) || 'Remote OpenClaw agent session',
      gatewayUrl,
      sessionKey,
      model: stringValue(row.model) || 'default',
    }
  }

  return null
}

export async function loadRemoteHarnesses(): Promise<
  Array<RemoteHarnessConfig>
> {
  try {
    const raw = await readFile(configPath(), 'utf8')
    const payload = JSON.parse(raw) as RemoteHarnessConfigFile
    return (Array.isArray(payload.harnesses) ? payload.harnesses : [])
      .map(normalizeHarness)
      .filter(
        (harness): harness is RemoteHarnessConfig => harness !== null,
      )
  } catch {
    return []
  }
}
