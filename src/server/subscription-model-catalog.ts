import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, posix, win32 } from 'node:path'
import { deflateSync } from 'node:zlib'

import {
  readHermesConfigFiles,
  resolveHermesConfigPaths,
} from './hermes-config-store'
import { getOrchestrationPolicy } from './orchestration-policy'
import { getStateDir } from './workspace-state-dir'

export type ModelAvailability =
  | 'available'
  | 'quota_limited'
  | 'auth_expired'
  | 'unavailable'
  | 'unknown'

export type BillingClass =
  | 'subscription_included'
  | 'subscription_unknown'
  | 'api_billed'

export interface RelayModelInput {
  id: string
  account: string
  status: ModelAvailability
  warning?: string
  resetAt?: string | null
}

export interface OAuthProviderInput {
  provider: string
  authenticated: boolean
  models: Array<string>
  billingClass?: BillingClass
  subscriptionEntitled?: boolean
  warning?: string
}

export interface SubscriptionTransportStatus {
  id: string
  label: string
  authenticated: boolean
  status: string
  warning?: string
}

export type ReasoningEffort =
  | 'provider_default'
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra'

export interface SubscriptionModelCapabilities {
  contextWindow: number | null
  maxInputTokens: number | null
  maxOutputTokens: number | null
  supportsReasoning: boolean
  supportsTools: boolean
  supportsVision: boolean
  supportsOutputTokenLimit: boolean
  reasoningEfforts: Array<ReasoningEffort>
  metadataSource: string
}

export type CapabilityInput = Omit<
  SubscriptionModelCapabilities,
  'reasoningEfforts' | 'supportsOutputTokenLimit'
>

export interface SubscriptionModelEntry {
  id: string
  provider: string
  account: string
  model: string
  transport: string
  billingClass: BillingClass
  status: ModelAvailability
  selectable: boolean
  warning: string
  resetAt: string | null
  capabilities?: SubscriptionModelCapabilities
}

export interface SubscriptionCatalog {
  generatedAt: string
  subscriptionOnly: boolean
  models: Array<SubscriptionModelEntry>
  transports: Array<SubscriptionTransportStatus>
  visibility: {
    showNousModels: boolean
    showApiBilledModels: boolean
  }
}

export interface BuildCatalogInput {
  relayModels: Array<RelayModelInput>
  oauthProviders: Array<OAuthProviderInput>
  transports: Array<SubscriptionTransportStatus>
  allowApiBilledModels: boolean
  showNousModels?: boolean
  capabilities?: Record<string, CapabilityInput>
}

function reasoningEffortsForRoute(
  id: string,
  capability: CapabilityInput,
): Array<ReasoningEffort> {
  if (!capability.supportsReasoning) return ['provider_default']
  if (id.startsWith('claude-') || /\/anthropic\//.test(id)) {
    return ['provider_default', 'low', 'medium', 'high', 'xhigh', 'max']
  }
  if (id.startsWith('openai-codex/')) {
    return [
      'provider_default',
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultra',
    ]
  }
  if (/\/google\/gemini-|^google-antigravity\//.test(id)) {
    return ['provider_default', 'low', 'high']
  }
  return ['provider_default', 'none', 'low', 'medium', 'high']
}

function capabilitiesForRoute(
  id: string,
  input: BuildCatalogInput,
): SubscriptionModelCapabilities | undefined {
  const capability = input.capabilities?.[id]
  if (!capability) return undefined
  return {
    ...capability,
    supportsOutputTokenLimit:
      !id.startsWith('claude-') && !id.startsWith('openai-codex/'),
    reasoningEfforts: reasoningEffortsForRoute(id, capability),
  }
}

export function buildSubscriptionCatalog(
  input: BuildCatalogInput,
): SubscriptionCatalog {
  const relayEntries = input.relayModels.map(
    (entry): SubscriptionModelEntry => {
      const slash = entry.id.indexOf('/')
      return {
        id: entry.id,
        provider: 'claude-max-relay',
        account: entry.account,
        model: slash >= 0 ? entry.id.slice(slash + 1) : entry.id,
        transport: 'claude-cli-oauth',
        billingClass: 'subscription_included',
        status: entry.status,
        selectable: entry.status === 'available',
        warning: entry.warning || '',
        resetAt: entry.resetAt || null,
        capabilities: capabilitiesForRoute(entry.id, input),
      }
    },
  )

  const oauthEntries = input.oauthProviders.flatMap((provider) => {
    const billingClass = provider.billingClass || 'subscription_included'
    if (provider.provider === 'nous' && !input.showNousModels) return []
    if (billingClass === 'api_billed' && !input.allowApiBilledModels) return []
    const entitlementVerified =
      billingClass !== 'subscription_unknown' ||
      provider.subscriptionEntitled === true
    const selectable = provider.authenticated && entitlementVerified
    return provider.models.map(
      (model): SubscriptionModelEntry => ({
        id: `${provider.provider}/${model}`,
        provider: provider.provider,
        account: provider.provider,
        model,
        transport: `${provider.provider}-oauth`,
        billingClass,
        status: selectable
          ? 'available'
          : provider.authenticated
            ? 'unknown'
            : 'unavailable',
        selectable,
        warning: provider.warning || '',
        resetAt: null,
        capabilities: capabilitiesForRoute(
          `${provider.provider}/${model}`,
          input,
        ),
      }),
    )
  })

  const seen = new Set<string>()
  const models = [...relayEntries, ...oauthEntries].filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })

  return {
    generatedAt: new Date().toISOString(),
    subscriptionOnly: !input.allowApiBilledModels,
    models,
    transports: input.transports,
    visibility: {
      showNousModels: input.showNousModels === true,
      showApiBilledModels: input.allowApiBilledModels,
    },
  }
}

export function metadataIdentityForRoute(
  route: Pick<SubscriptionModelEntry, 'id' | 'provider' | 'model'>,
): { provider: string; model: string } | null {
  if (route.provider === 'openai-codex') {
    return { provider: 'openai', model: route.model }
  }
  if (route.provider === 'claude-max-relay') {
    if (/^(?:fable|opus|sonnet)$/.test(route.model)) {
      return { provider: 'anthropic', model: `claude-${route.model}-5` }
    }
    if (/^claude-(?:opus|sonnet|haiku|fable)(?:-|$)/.test(route.model)) {
      return { provider: 'anthropic', model: route.model }
    }
    if (!/^(opus|sonnet|haiku|fable)(?:-|$)/.test(route.model)) return null
    return { provider: 'anthropic', model: `claude-${route.model}` }
  }
  if (route.provider === 'nous') {
    const slash = route.model.indexOf('/')
    if (slash < 1) return null
    const provider = route.model.slice(0, slash).replace(/^~/, '')
    let model = route.model.slice(slash + 1)
    if (provider === 'anthropic') {
      model = model.replace(/(\d)\.(\d)/g, '$1-$2')
    }
    return { provider, model }
  }
  if (
    route.provider === 'gemini' ||
    route.provider === 'google' ||
    route.provider === 'google-antigravity'
  ) {
    return { provider: 'google', model: route.model }
  }
  return { provider: route.provider, model: route.model }
}

function commandOutput(
  command: string,
  args: Array<string>,
  timeout = 30_000,
): string {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const stderr = (error as { stderr?: string | Buffer }).stderr
    return typeof stderr === 'string'
      ? stderr.trim()
      : Buffer.isBuffer(stderr)
        ? stderr.toString('utf8').trim()
        : ''
  }
}

type CommandRunner = (
  command: string,
  args: Array<string>,
  timeout?: number,
) => string

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null
}

export function discoverModelCapabilities(
  routes: Array<Pick<SubscriptionModelEntry, 'id' | 'provider' | 'model'>>,
  runCommand: CommandRunner = commandOutput,
): Record<string, CapabilityInput> {
  const queries = routes.flatMap((route) => {
    const identity = metadataIdentityForRoute(route)
    return identity ? [{ route: route.id, ...identity }] : []
  })
  if (queries.length === 0) return {}

  const script = [
    'import base64, json, sys, zlib',
    'from agent.models_dev import get_model_capabilities, get_model_info',
    'queries = json.loads(zlib.decompress(base64.b64decode(sys.argv[1])))',
    'result = {}',
    'for q in queries:',
    '    try:',
    '        info = get_model_info(q["provider"], q["model"])',
    '        caps = get_model_capabilities(q["provider"], q["model"])',
    '        if info is None and caps is None: continue',
    '        result[q["route"]] = {',
    '            "context_window": getattr(info, "context_window", 0) or getattr(caps, "context_window", 0),',
    '            "max_input_tokens": getattr(info, "max_input", None),',
    '            "max_output_tokens": getattr(info, "max_output", 0) or getattr(caps, "max_output_tokens", 0),',
    '            "supports_reasoning": bool(getattr(info, "reasoning", False) or getattr(caps, "supports_reasoning", False)),',
    '            "supports_tools": bool(getattr(info, "tool_call", False) or getattr(caps, "supports_tools", False)),',
    '            "supports_vision": bool((info and info.supports_vision()) or getattr(caps, "supports_vision", False)),',
    '        }',
    '    except Exception:',
    '        continue',
    'print(json.dumps(result))',
  ].join('\n')
  const encodedQueries = deflateSync(
    Buffer.from(JSON.stringify(queries), 'utf8'),
  ).toString('base64')
  const raw = runCommand(
    resolveHermesPython(),
    ['-c', script, encodedQueries],
    120_000,
  )
  const discovered: Record<string, CapabilityInput> = {}
  try {
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>
    for (const [id, value] of Object.entries(parsed)) {
      discovered[id] = {
        contextWindow: positiveInteger(value.context_window),
        maxInputTokens: positiveInteger(value.max_input_tokens),
        maxOutputTokens: positiveInteger(value.max_output_tokens),
        supportsReasoning: value.supports_reasoning === true,
        supportsTools: value.supports_tools === true,
        supportsVision: value.supports_vision === true,
        metadataSource: 'models.dev',
      }
    }
  } catch {
    // Preserve route visibility when capability discovery is unavailable.
  }
  return discovered
}

function hermesAuthenticated(provider: string): boolean {
  return /logged in/i.test(
    commandOutput('hermes', ['auth', 'status', provider], 15_000),
  )
}

export function createCachedCapabilityResolver(
  discover: typeof discoverModelCapabilities = discoverModelCapabilities,
): typeof discoverModelCapabilities {
  let cachedKey = ''
  let cachedCapabilities: ReturnType<typeof discoverModelCapabilities> = {}

  return (routes, runCommand) => {
    // Injected runners are tests/probes and must always execute. The live path
    // caches only static route identity; allocation health is rebuilt outside
    // this resolver on every catalog request.
    if (runCommand) return discover(routes, runCommand)
    const key = JSON.stringify(
      routes
        .map(({ id, provider, model }) => ({ id, provider, model }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    )
    if (key === cachedKey) return cachedCapabilities
    cachedCapabilities = discover(routes)
    cachedKey = key
    return cachedCapabilities
  }
}

const resolveCachedModelCapabilities = createCachedCapabilityResolver()

export function resolveHermesPython(
  env: Record<string, string | undefined> = process.env,
  fileExists: (candidate: string) => boolean = existsSync,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.HERMES_PYTHON) return env.HERMES_PYTHON
  const pathApi = platform === 'win32' ? win32 : posix
  const executable =
    platform === 'win32'
      ? pathApi.join('venv', 'Scripts', 'python.exe')
      : pathApi.join('venv', 'bin', 'python')
  const roots = [
    env.HERMES_HOME,
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'hermes') : undefined,
    platform === 'win32'
      ? pathApi.join(home, 'AppData', 'Local', 'hermes')
      : pathApi.join(home, '.hermes'),
  ].filter((value): value is string => Boolean(value))
  for (const root of [...new Set(roots)]) {
    const candidate = pathApi.join(root, 'hermes-agent', executable)
    if (fileExists(candidate)) return candidate
  }
  return platform === 'win32' ? 'python' : 'python3'
}

export function createProviderModelResolver(
  runCommand: AuxiliaryCommandRunner = commandOutput,
  now: () => number = Date.now,
  ttlMs = 60_000,
): (provider: string) => Array<string> {
  const cache = new Map<string, { expiresAt: number; models: Array<string> }>()

  return (provider) => {
    const currentTime = now()
    const cached = cache.get(provider)
    if (cached && currentTime < cached.expiresAt) return cached.models

    const script = [
      'import json',
      'from hermes_cli.models import provider_model_ids',
      `print(json.dumps(provider_model_ids(${JSON.stringify(provider)})))`,
    ].join('; ')
    const raw = runCommand(resolveHermesPython(), ['-c', script], 90_000)
    let models: Array<string> = []
    try {
      const parsed = JSON.parse(raw)
      models = Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : []
    } catch {
      models = []
    }
    cache.set(provider, { expiresAt: currentTime + ttlMs, models })
    return models
  }
}

const resolveProviderModels = createProviderModelResolver()

const STATIC_OPENAI_CODEX_MODELS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex-spark',
  'gpt-5.6-sol-pro',
  'gpt-5.6-terra-pro',
  'gpt-5.6-luna-pro',
] as const

export function openAiCodexModelInventory(
  discovered: Array<string>,
): Array<string> {
  const models = [...STATIC_OPENAI_CODEX_MODELS, ...discovered]
    .map((model) => model.trim())
    .filter((model) => /^[a-z0-9][a-z0-9._-]*$/i.test(model))
  return [...new Set(models)]
}

const API_BILLED_PROVIDER_ENV_KEYS: Array<{
  provider: string
  envKeys: Array<string>
}> = [
  { provider: 'anthropic', envKeys: ['ANTHROPIC_API_KEY'] },
  { provider: 'openai', envKeys: ['OPENAI_API_KEY'] },
  { provider: 'google', envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'] },
  { provider: 'zai', envKeys: ['GLM_API_KEY'] },
  { provider: 'kimi-coding', envKeys: ['KIMI_API_KEY'] },
  { provider: 'minimax', envKeys: ['MINIMAX_API_KEY'] },
  { provider: 'minimax-cn', envKeys: ['MINIMAX_CN_API_KEY'] },
  { provider: 'xiaomi', envKeys: ['XIAOMI_API_KEY'] },
]

export function configuredApiBilledProviderInputs(
  env: Record<string, string | undefined>,
  resolveModels: (provider: string) => Array<string> = resolveProviderModels,
): Array<OAuthProviderInput> {
  return API_BILLED_PROVIDER_ENV_KEYS.flatMap((definition) => {
    if (!definition.envKeys.some((key) => Boolean(env[key]?.trim()))) return []
    const models = resolveModels(definition.provider)
    if (models.length === 0) return []
    return [
      {
        provider: definition.provider,
        authenticated: true,
        models,
        billingClass: 'api_billed' as const,
      },
    ]
  })
}

function isConcreteAntigravityModel(model: string): boolean {
  return /^gemini-\d+(?:\.\d+)+(?:-[a-z0-9]+)+$/.test(model)
}

export function parseAntigravityModels(raw: string): Array<string> {
  return raw.split(/\r?\n/).flatMap((line) => {
    const [id] = line.split('\t', 1)
    const model = id.trim()
    return isConcreteAntigravityModel(model) ? [model] : []
  })
}

export function parseAntigravityModelRows(
  rows: Array<{ id?: unknown }>,
): Array<string> {
  return rows.flatMap((row) => {
    if (typeof row.id !== 'string') return []
    const prefix = 'google-antigravity/'
    if (!row.id.startsWith(prefix)) return []
    const model = row.id.slice(prefix.length)
    return isConcreteAntigravityModel(model) ? [model] : []
  })
}

export function sanitizeProviderWarning(raw?: string): string | undefined {
  const warning = raw?.trim()
  if (!warning) return undefined

  if (
    /429|quota|rate.?limit|spend limit|monthly.{0,30}limit|usage limit/i.test(
      warning,
    )
  ) {
    return 'Provider quota is currently limited.'
  }
  if (/entitl|subscription|ineligible|not eligible/i.test(warning)) {
    return 'Provider subscription entitlement is unverified.'
  }
  if (
    /oauth|auth(?:entication)?|log.?in|credential|token.{0,30}expir|expir.{0,30}token/i.test(
      warning,
    )
  ) {
    return 'Provider authentication needs attention.'
  }
  if (
    /timeout|timed out|unavailable|connect|network|relay|\b5\d\d\b/i.test(
      warning,
    )
  ) {
    return 'Provider is temporarily unavailable.'
  }
  return 'Provider reported a status that could not be safely displayed.'
}

function antigravityInventoryPath(): string {
  return join(getStateDir(), 'antigravity-model-inventory.json')
}

function readAntigravityInventory(path: string): Array<string> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      models?: unknown
    }
    return Array.isArray(parsed.models)
      ? parsed.models.filter(
          (model): model is string =>
            typeof model === 'string' && isConcreteAntigravityModel(model),
        )
      : []
  } catch {
    return []
  }
}

function writeAntigravityInventory(path: string, models: Array<string>): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    writeFileSync(
      temp,
      `${JSON.stringify({ models, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    )
    renameSync(temp, path)
  } finally {
    rmSync(temp, { force: true })
  }
}

export function resolveAntigravityProviderInventory(
  discoveredModels: Array<string>,
  inventoryPath = antigravityInventoryPath(),
): OAuthProviderInput {
  const discovered = [
    ...new Set(
      discoveredModels
        .map((model) => model.trim())
        .filter(isConcreteAntigravityModel),
    ),
  ]
  if (discovered.length > 0) {
    writeAntigravityInventory(inventoryPath, discovered)
    return {
      provider: 'google-antigravity',
      authenticated: true,
      models: discovered,
      billingClass: 'subscription_included',
      warning: '',
    }
  }

  const cached = readAntigravityInventory(inventoryPath)
  return {
    provider: 'google-antigravity',
    authenticated: false,
    models: cached,
    billingClass: 'subscription_included',
    warning:
      cached.length > 0
        ? 'Antigravity inventory is temporarily unavailable; showing last-known models as unavailable.'
        : 'Antigravity OAuth is unavailable.',
  }
}

export function resolveAntigravityRelayBaseUrl(raw?: string): string {
  const candidate = (raw || 'http://127.0.0.1:8651').trim().replace(/\/+$/, '')
  try {
    const url = new URL(candidate)
    const host = url.hostname.toLowerCase()
    if (
      url.protocol === 'http:' &&
      !url.username &&
      !url.password &&
      ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)
    ) {
      return candidate
    }
  } catch {
    // The fixed error below intentionally avoids echoing the rejected value.
  }
  throw new Error('ANTIGRAVITY_RELAY_BASE_URL must be an HTTP loopback URL')
}

async function fetchAntigravityProvider(): Promise<OAuthProviderInput> {
  const base = resolveAntigravityRelayBaseUrl(
    process.env.ANTIGRAVITY_RELAY_BASE_URL,
  )
  const modelsUrl = base.endsWith('/v1')
    ? `${base}/models`
    : `${base}/v1/models`
  let models: Array<string> = []
  try {
    const response = await fetch(modelsUrl, {
      signal: AbortSignal.timeout(4_000),
    })
    if (response.ok) {
      const payload = (await response.json()) as {
        data?: Array<{ id?: unknown }>
      }
      models = parseAntigravityModelRows(payload.data || [])
    }
  } catch {
    // The CLI fallback keeps the catalog available while the supervisor is
    // recovering the local relay.
  }
  if (models.length === 0) {
    models = parseAntigravityModels(commandOutput('agy', ['models'], 30_000))
  }
  return resolveAntigravityProviderInventory(models)
}

type RelayAccountHealth = Partial<
  Record<
    string,
    {
      status?: ModelAvailability
      warning?: string
      reset_at?: string | null
    }
  >
>

export function buildRelayModelInputs(
  rows: Array<{ id?: unknown }>,
  accountStatus: RelayAccountHealth,
): Array<RelayModelInput> {
  return rows.flatMap((row) => {
    if (typeof row.id !== 'string') return []
    const accountPart = row.id.split('/')[0] || ''
    const account = accountPart.replace(/^claude-/, '')
    const health = accountStatus[account]
    if (!health?.status) {
      return [
        {
          id: row.id,
          account,
          status: 'unavailable' as const,
          warning: 'Account health could not be verified.',
          resetAt: null,
        },
      ]
    }
    return [
      {
        id: row.id,
        account,
        status: health.status,
        warning: sanitizeProviderWarning(health.warning),
        resetAt: health.reset_at,
      },
    ]
  })
}

async function fetchRelayModels(): Promise<Array<RelayModelInput>> {
  const base = process.env.CLAUDE_RELAY_BASE_URL || 'http://127.0.0.1:8650'
  try {
    const [modelsResponse, healthResponse] = await Promise.all([
      fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(4_000) }),
      fetch(`${base}/health`, { signal: AbortSignal.timeout(4_000) }),
    ])
    if (!modelsResponse.ok) return []
    const modelPayload = (await modelsResponse.json()) as {
      data?: Array<{ id?: unknown }>
    }
    const health = healthResponse.ok
      ? ((await healthResponse.json()) as {
          account_status?: Record<
            string,
            {
              status?: ModelAvailability
              warning?: string
              reset_at?: string | null
            }
          >
        })
      : {}
    return buildRelayModelInputs(
      modelPayload.data || [],
      health.account_status || {},
    )
  } catch {
    return []
  }
}

type AuxiliaryCommandRunner = (
  command: string,
  args: Array<string>,
  timeoutMs: number,
) => string

export function createAuxiliaryTransportResolver(
  runCommand: AuxiliaryCommandRunner = commandOutput,
  now: () => number = Date.now,
  ttlMs = 60_000,
): () => Array<SubscriptionTransportStatus> {
  let cached: Array<SubscriptionTransportStatus> | null = null
  let expiresAt = 0

  return () => {
    const currentTime = now()
    if (cached && currentTime < expiresAt) return cached

    const transports: Array<SubscriptionTransportStatus> = []
    const codexStatus = runCommand('codex', ['login', 'status'], 15_000)
    transports.push({
      id: 'openai-codex',
      label: 'OpenAI Codex OAuth',
      authenticated: /logged in using chatgpt/i.test(codexStatus),
      status: /logged in using chatgpt/i.test(codexStatus)
        ? 'available'
        : 'logged_out',
    })

    const copilotStatus = runCommand('gh', ['copilot', '--', '--help'], 15_000)
    const copilotInstalled =
      !/not installed/i.test(copilotStatus) &&
      /copilot cli/i.test(copilotStatus)
    transports.push({
      id: 'github-copilot-cli',
      label: 'GitHub Copilot CLI',
      authenticated: copilotInstalled,
      status: /not installed/i.test(copilotStatus)
        ? 'not_installed'
        : 'unknown',
      warning: /not installed/i.test(copilotStatus)
        ? 'GitHub is authenticated, but the Copilot CLI transport is not installed.'
        : 'Copilot subscription eligibility has not been verified.',
    })

    cached = transports
    expiresAt = currentTime + ttlMs
    return transports
  }
}

const resolveAuxiliaryTransports = createAuxiliaryTransportResolver()

export async function loadSubscriptionCatalog(): Promise<SubscriptionCatalog> {
  const policy = getOrchestrationPolicy()
  const providerIds = ['openai-codex', 'nous']
  const oauthProviders = providerIds.map((provider): OAuthProviderInput => {
    const authenticated = hermesAuthenticated(provider)
    return {
      provider,
      authenticated,
      models:
        provider === 'openai-codex'
          ? openAiCodexModelInventory(resolveProviderModels(provider))
          : authenticated
            ? resolveProviderModels(provider)
            : [],
      billingClass:
        provider === 'nous' ? 'subscription_unknown' : 'subscription_included',
      warning:
        provider === 'nous'
          ? 'Nous OAuth model subscription entitlement is unverified.'
          : '',
    }
  })
  oauthProviders.splice(1, 0, await fetchAntigravityProvider())
  const configFiles = readHermesConfigFiles(resolveHermesConfigPaths())
  const configuredApiEnv: Record<string, string | undefined> = {
    ...configFiles.env,
  }
  for (const definition of API_BILLED_PROVIDER_ENV_KEYS) {
    for (const key of definition.envKeys) {
      configuredApiEnv[key] ||= process.env[key]
    }
  }
  oauthProviders.push(...configuredApiBilledProviderInputs(configuredApiEnv))

  const relayModels = await fetchRelayModels()
  const transportsById = new Map(
    resolveAuxiliaryTransports().map((transport) => [transport.id, transport]),
  )
  for (const provider of oauthProviders) {
    transportsById.set(provider.provider, {
      id: provider.provider,
      label:
        provider.provider === 'openai-codex'
          ? 'OpenAI Codex OAuth'
          : provider.provider === 'google-antigravity'
            ? 'Antigravity — Gemini OAuth'
            : 'Nous Portal OAuth',
      authenticated: provider.authenticated,
      status: provider.authenticated
        ? 'available'
        : provider.models.length > 0
          ? 'unavailable'
          : 'logged_out',
      ...(provider.warning ? { warning: provider.warning } : {}),
    })
  }
  for (const model of relayModels) {
    const id = `claude-${model.account}`
    if (transportsById.has(id)) continue
    transportsById.set(id, {
      id,
      label:
        model.account === 'cwm4tx'
          ? 'Claude Max — CWM'
          : model.account === 'gp'
            ? 'Claude Max — GP'
            : `Claude Max — ${model.account}`,
      authenticated:
        model.status === 'available' || model.status === 'quota_limited',
      status: model.status,
      ...(model.warning ? { warning: model.warning } : {}),
    })
  }

  const input: BuildCatalogInput = {
    relayModels,
    oauthProviders,
    transports: Array.from(transportsById.values()),
    allowApiBilledModels: policy.billing.allowApiBilledModels,
    showNousModels: policy.billing.showNousModels,
  }
  const baseCatalog = buildSubscriptionCatalog(input)
  return buildSubscriptionCatalog({
    ...input,
    capabilities: resolveCachedModelCapabilities(baseCatalog.models),
  })
}
