import {
  readHermesConfigFiles,
  resolveHermesConfigPaths,
} from './hermes-config-store'

export type ConfiguredPrimaryModel = {
  provider: string
  model: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isVirtualOrGenericModel(model: string): boolean {
  const normalized = model.trim().toLowerCase()
  return (
    normalized === '' ||
    normalized === 'default' ||
    normalized === 'hermes-agent'
  )
}

/** Whether this request needs a configured default instead of a real selection. */
export function isConfiguredDefaultModelRequest(
  requestedModel: unknown,
): boolean {
  return isVirtualOrGenericModel(readString(requestedModel))
}

/**
 * The configured default is chosen only while a new conversation is created.
 * Retaining that concrete model per session prevents follow-up messages that
 * carry an omitted/default/virtual value from rereading Hermes config.
 */
const configuredModelBySession = new Map<string, string>()

export function rememberConfiguredSessionModel(
  sessionKey: string,
  model: string | undefined,
): void {
  const key = sessionKey.trim()
  const resolved = readString(model)
  if (!key || isVirtualOrGenericModel(resolved)) return
  configuredModelBySession.set(key, resolved)
}

export function resolveSessionGatewayModel(
  sessionKey: string,
  requestedModel: unknown,
): string | undefined {
  const requested = readString(requestedModel)
  if (!isVirtualOrGenericModel(requested)) return requested
  return configuredModelBySession.get(sessionKey.trim())
}

/** Test-only cache reset; production cache lasts for the Workspace process. */
export function clearConfiguredSessionModelsForTest(): void {
  configuredModelBySession.clear()
}

/**
 * Resolve the configured primary provider/model from Hermes' active config.
 * The Gateway's OpenAI-compatible `hermes-agent` value is a compatibility
 * alias, never a provider model ID, so it is not a usable configured default.
 */
export function resolveConfiguredPrimaryModel(
  config: Record<string, unknown>,
): ConfiguredPrimaryModel | undefined {
  const nested = asRecord(config.model)
  const provider = readString(nested.provider) || readString(config.provider)
  const model = readString(nested.default) || readString(config.model)

  if (!provider || isVirtualOrGenericModel(model)) return undefined
  return { provider, model }
}

/**
 * Resolve the model to send to the Gateway. A real explicit picker selection
 * always wins; unselected, `default`, and the virtual `hermes-agent` alias
 * instead become the active Hermes config default.
 */
export function resolveConfiguredGatewayModel(
  requestedModel: unknown,
  config: Record<string, unknown>,
): string | undefined {
  const requested = readString(requestedModel)
  if (!isVirtualOrGenericModel(requested)) return requested
  return resolveConfiguredPrimaryModel(config)?.model
}

/**
 * Read the current server's Hermes config only when creating a new
 * conversation. Explicit selections return without a config-file read.
 */
export function resolveCurrentGatewayModel(
  requestedModel: unknown,
): string | undefined {
  const requested = readString(requestedModel)
  if (!isVirtualOrGenericModel(requested)) return requested
  const { config } = readHermesConfigFiles(resolveHermesConfigPaths())
  return resolveConfiguredGatewayModel(requested, config)
}
