export type HermesProviderKind =
  | 'oauth'
  | 'api_key'
  | 'local'
  | 'custom'
  | 'external'
  | 'sdk'

export type HermesAuthSource =
  | 'env'
  | 'auth-profiles'
  | 'config'
  | 'local-discovery'
  | 'none'

export type HermesConfigPaths = {
  hermesHome: string
  configPath: string
  envPath: string
  authProfilesPath: string
}

export type HermesProviderState = {
  id: string
  name: string
  kind: HermesProviderKind
  configured: boolean
  authenticated: boolean
  available: boolean
  isDefault: boolean
  authSource: HermesAuthSource
  envKeys: Array<string>
  maskedCredentials: Record<string, string>
  models: Array<{ id: string; name: string }>
  warnings: Array<string>
}

export type HermesCustomProviderState = {
  id: string
  name: string
  baseUrl: string
  apiKeyEnv?: string
  apiMode?: string
  configured: boolean
  available: boolean
}

export type HermesConfigState = {
  ok: true
  paths: HermesConfigPaths
  defaultModel: {
    provider: string
    model: string
    source: 'flat' | 'nested'
  } | null
  activeProvider: string
  activeModel: string
  providers: Array<HermesProviderState>
  customProviders: Array<HermesCustomProviderState>
  config: Record<string, unknown>
}

type ProviderDef = {
  id: string
  name: string
  kind: HermesProviderKind
  envKeys: Array<string>
  models: Array<{ id: string; name: string }>
}

type LocalProviderSummary = {
  id: string
  online?: boolean
  modelCount?: number
}

type LocalModelSummary = {
  id: string
  name?: string
  provider: string
}

export type NormalizeHermesConfigInput = {
  paths: HermesConfigPaths
  config: Record<string, unknown>
  env: Record<string, string>
  authProfiles: Record<string, unknown>
  localProviders: Array<LocalProviderSummary>
  localModels: Array<LocalModelSummary>
}

export const HERMES_PROVIDER_CATALOG: Array<ProviderDef> = [
  { id: 'nous', name: 'Nous Portal', kind: 'oauth', envKeys: [], models: [] },
  { id: 'openrouter', name: 'OpenRouter', kind: 'api_key', envKeys: ['OPENROUTER_API_KEY'], models: [] },
  { id: 'novita', name: 'NovitaAI', kind: 'api_key', envKeys: ['NOVITA_API_KEY'], models: [] },
  { id: 'lmstudio', name: 'LM Studio', kind: 'local', envKeys: ['LM_API_KEY'], models: [] },
  { id: 'anthropic', name: 'Anthropic', kind: 'api_key', envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN'], models: [] },
  { id: 'openai-codex', name: 'OpenAI Codex', kind: 'oauth', envKeys: [], models: [] },
  { id: 'openai-api', name: 'OpenAI API', kind: 'api_key', envKeys: ['OPENAI_API_KEY'], models: [] },
  { id: 'alibaba', name: 'Qwen Cloud / DashScope', kind: 'api_key', envKeys: ['DASHSCOPE_API_KEY'], models: [] },
  { id: 'alibaba-coding-plan', name: 'Alibaba Cloud (Coding Plan)', kind: 'api_key', envKeys: ['ALIBABA_CODING_PLAN_API_KEY', 'DASHSCOPE_API_KEY'], models: [] },
  { id: 'xai-oauth', name: 'xAI Grok OAuth', kind: 'oauth', envKeys: [], models: [] },
  { id: 'xiaomi', name: 'Xiaomi MiMo', kind: 'api_key', envKeys: ['XIAOMI_API_KEY'], models: [] },
  { id: 'tencent-tokenhub', name: 'Tencent TokenHub', kind: 'api_key', envKeys: ['TOKENHUB_API_KEY'], models: [] },
  { id: 'nvidia', name: 'NVIDIA NIM', kind: 'api_key', envKeys: ['NVIDIA_API_KEY'], models: [] },
  { id: 'copilot', name: 'GitHub Copilot', kind: 'api_key', envKeys: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'], models: [] },
  { id: 'copilot-acp', name: 'GitHub Copilot ACP', kind: 'external', envKeys: [], models: [] },
  { id: 'huggingface', name: 'Hugging Face', kind: 'api_key', envKeys: ['HF_TOKEN'], models: [] },
  { id: 'gemini', name: 'Google AI Studio', kind: 'api_key', envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'], models: [] },
  { id: 'google-gemini-cli', name: 'Google Gemini (OAuth)', kind: 'oauth', envKeys: [], models: [] },
  { id: 'deepseek', name: 'DeepSeek', kind: 'api_key', envKeys: ['DEEPSEEK_API_KEY'], models: [] },
  { id: 'xai', name: 'xAI', kind: 'api_key', envKeys: ['XAI_API_KEY'], models: [] },
  { id: 'zai', name: 'Z.AI / GLM', kind: 'api_key', envKeys: ['GLM_API_KEY', 'ZAI_API_KEY', 'Z_AI_API_KEY'], models: [] },
  { id: 'kimi-coding', name: 'Kimi / Moonshot', kind: 'api_key', envKeys: ['KIMI_API_KEY', 'KIMI_CODING_API_KEY'], models: [] },
  { id: 'kimi-coding-cn', name: 'Kimi / Moonshot (China)', kind: 'api_key', envKeys: ['KIMI_CN_API_KEY'], models: [] },
  { id: 'stepfun', name: 'StepFun Step Plan', kind: 'api_key', envKeys: ['STEPFUN_API_KEY'], models: [] },
  { id: 'minimax', name: 'MiniMax', kind: 'api_key', envKeys: ['MINIMAX_API_KEY'], models: [] },
  { id: 'minimax-oauth', name: 'MiniMax (OAuth)', kind: 'oauth', envKeys: [], models: [] },
  { id: 'minimax-cn', name: 'MiniMax (China)', kind: 'api_key', envKeys: ['MINIMAX_CN_API_KEY'], models: [] },
  { id: 'ollama-cloud', name: 'Ollama Cloud', kind: 'api_key', envKeys: ['OLLAMA_API_KEY'], models: [] },
  { id: 'arcee', name: 'Arcee AI', kind: 'api_key', envKeys: ['ARCEEAI_API_KEY'], models: [] },
  { id: 'gmi', name: 'GMI Cloud', kind: 'api_key', envKeys: ['GMI_API_KEY'], models: [] },
  { id: 'kilocode', name: 'Kilo Code', kind: 'api_key', envKeys: ['KILOCODE_API_KEY'], models: [] },
  { id: 'opencode-zen', name: 'OpenCode Zen', kind: 'api_key', envKeys: ['OPENCODE_ZEN_API_KEY'], models: [] },
  { id: 'opencode-go', name: 'OpenCode Go', kind: 'api_key', envKeys: ['OPENCODE_GO_API_KEY'], models: [] },
  { id: 'bedrock', name: 'AWS Bedrock', kind: 'sdk', envKeys: [], models: [] },
  { id: 'azure-foundry', name: 'Azure Foundry', kind: 'api_key', envKeys: ['AZURE_FOUNDRY_API_KEY'], models: [] },
  { id: 'qwen-oauth', name: 'Qwen OAuth', kind: 'oauth', envKeys: [], models: [] },
  { id: 'ollama', name: 'Ollama', kind: 'local', envKeys: [], models: [] },
  { id: 'atomic-chat', name: 'Atomic Chat', kind: 'local', envKeys: [], models: [] },
  { id: 'custom', name: 'Custom', kind: 'custom', envKeys: ['CUSTOM_API_KEY'], models: [] },
]

const KNOWN_PROVIDER_IDS = new Set(HERMES_PROVIDER_CATALOG.map((p) => p.id))

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length < 8) return '***'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

function readDefaultModel(config: Record<string, unknown>): HermesConfigState['defaultModel'] {
  const flatModel = readString(config.model)
  const flatProvider = readString(config.provider)
  if (flatModel && flatProvider) {
    return { provider: flatProvider, model: flatModel, source: 'flat' }
  }

  const model = readRecord(config.model)
  const nestedProvider = readString(model.provider) || flatProvider
  const nestedModel = readString(model.default) || flatModel
  if (!nestedProvider || !nestedModel) return null
  return { provider: nestedProvider, model: nestedModel, source: 'nested' }
}

function authProfileToken(authProfiles: Record<string, unknown>, providerId: string): string {
  const profiles = readRecord(authProfiles.profiles)
  for (const [key, value] of Object.entries(profiles)) {
    if (!key.startsWith(`${providerId}:`)) continue
    const profile = readRecord(value)
    const token =
      readString(profile.token) ||
      readString(profile.key) ||
      readString(profile.access) ||
      readString(profile.accessToken)
    if (token) return token
  }
  return ''
}

function readCustomProviderEntries(config: Record<string, unknown>): Array<Record<string, unknown>> {
  const entries = config.custom_providers
  return Array.isArray(entries)
    ? entries.filter((entry): entry is Record<string, unknown> => {
        return Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
      })
    : []
}

function customProviderName(entry: Record<string, unknown>): string {
  return readString(entry.name) || readString(entry.id)
}

function customProviderBaseUrl(entry: Record<string, unknown>): string {
  return readString(entry.base_url) || readString(entry.baseUrl)
}

function customProviderKeyEnv(entry: Record<string, unknown>): string {
  return readString(entry.key_env) || readString(entry.keyEnv) || readString(entry.api_key_env)
}

function customProviderApiMode(entry: Record<string, unknown>): string {
  return readString(entry.api_mode) || readString(entry.apiMode)
}

export function normalizeHermesConfigState(input: NormalizeHermesConfigInput): HermesConfigState {
  const defaultModel = readDefaultModel(input.config)
  const customEntries = readCustomProviderEntries(input.config)
  const customByName = new Map(customEntries.map((entry) => [customProviderName(entry), entry]))
  const localById = new Map(input.localProviders.map((provider) => [provider.id, provider]))

  const providers = HERMES_PROVIDER_CATALOG.map((def): HermesProviderState => {
    const maskedCredentials: Record<string, string> = {}
    let authenticated = false
    let configured = false
    let authSource: HermesAuthSource = 'none'
    let available = false
    let models = def.models

    if (def.kind === 'api_key' || def.kind === 'custom') {
      for (const envKey of def.envKeys) {
        const value = input.env[envKey]
        if (value) {
          authenticated = true
          configured = true
          authSource = 'env'
          maskedCredentials[envKey] = maskSecret(value)
        }
      }
      available = configured
    }

    if (def.kind === 'oauth') {
      const token = authProfileToken(input.authProfiles, def.id)
      if (token) {
        authenticated = true
        configured = true
        authSource = 'auth-profiles'
        maskedCredentials['auth-profiles'] = maskSecret(token)
      }
      available = configured
    }

    if (def.kind === 'local') {
      const customEntry = customByName.get(def.id)
      const local = localById.get(def.id)
      const localModels = input.localModels
        .filter((model) => model.provider === def.id)
        .map((model) => ({ id: model.id, name: model.name || model.id }))
      configured = Boolean(customEntry)
      authenticated = configured
      available = Boolean(local?.online)
      authSource = configured
        ? 'config'
        : available
          ? 'local-discovery'
          : 'none'
      models = localModels
    }

    return {
      id: def.id,
      name: def.name,
      kind: def.kind,
      configured,
      authenticated,
      available,
      isDefault: defaultModel?.provider === def.id,
      authSource,
      envKeys: def.envKeys,
      maskedCredentials,
      models,
      warnings: [],
    }
  })

  const customProviders = customEntries.flatMap((entry): Array<HermesCustomProviderState> => {
    const id = customProviderName(entry)
    if (!id || KNOWN_PROVIDER_IDS.has(id)) return []
    const apiKeyEnv = customProviderKeyEnv(entry)
    const configured = Boolean(customProviderBaseUrl(entry))
    return [
      {
        id,
        name: id,
        baseUrl: customProviderBaseUrl(entry),
        apiKeyEnv: apiKeyEnv || undefined,
        apiMode: customProviderApiMode(entry),
        configured,
        available: configured && (!apiKeyEnv || Boolean(input.env[apiKeyEnv])),
      },
    ]
  })

  return {
    ok: true,
    paths: input.paths,
    defaultModel,
    activeProvider: defaultModel?.provider || '',
    activeModel: defaultModel?.model || '',
    providers,
    customProviders,
    config: input.config,
  }
}
