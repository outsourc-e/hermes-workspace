export type ProviderAuthType = 'api-key' | 'oauth' | 'local' | 'cli-token'

export type ProviderInfo = {
  id: string
  name: string
  description: string
  authTypes: Array<ProviderAuthType>
  docsUrl: string
  configExample: string
}

export const HERMES_CONFIG_PATH = '~/.hermes/config.yaml'

export const PROVIDER_CATALOG: Array<ProviderInfo> = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models — Haiku, Sonnet, and Opus.',
    authTypes: ['api-key', 'cli-token'],
    docsUrl: 'https://console.anthropic.com/settings/keys',
    configExample: JSON.stringify(
      {
        auth: {
          profiles: {
            'anthropic:default': {
              provider: 'anthropic',
              apiKey: 'sk-your-key-here',
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT and reasoning models for chat and tools.',
    authTypes: ['api-key'],
    docsUrl: 'https://platform.openai.com/api-keys',
    configExample: JSON.stringify(
      {
        auth: {
          profiles: {
            'openai:default': {
              provider: 'openai',
              apiKey: 'sk-your-key-here',
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Gemini models with API key or OAuth.',
    authTypes: ['api-key', 'oauth'],
    docsUrl: 'https://aistudio.google.com/app/apikey',
    configExample: JSON.stringify(
      {
        auth: {
          profiles: {
            'google:default': {
              provider: 'google',
              apiKey: 'sk-your-key-here',
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Unified access to many providers through one API.',
    authTypes: ['api-key'],
    docsUrl: 'https://openrouter.ai/keys',
    configExample: JSON.stringify(
      {
        auth: {
          profiles: {
            'openrouter:default': {
              provider: 'openrouter',
              apiKey: 'sk-your-key-here',
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'MiniMax foundation models and multimodal APIs.',
    authTypes: ['api-key'],
    docsUrl: 'https://www.minimax.io/platform',
    configExample: JSON.stringify(
      {
        auth: {
          profiles: {
            'minimax:default': {
              provider: 'minimax',
              apiKey: 'sk-your-key-here',
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local models running on your machine via Ollama.',
    authTypes: ['local'],
    docsUrl: 'https://ollama.com/download',
    configExample: JSON.stringify(
      {
        auth: {
          profiles: {
            'ollama:local': {
              provider: 'ollama',
            },
          },
        },
      },
      null,
      2,
    ),
  },
  {
    id: 'atomic-chat',
    name: 'Atomic Chat',
    description: 'Local LLMs via Atomic Chat — run Llama, Gemma, Qwen and more on your machine.',
    authTypes: ['local'],
    docsUrl: 'https://atomic.chat',
    configExample: JSON.stringify(
      {
        auth: {
          profiles: {
            'atomic-chat:local': {
              provider: 'atomic-chat',
            },
          },
        },
      },
      null,
      2,
    ),
  },
]

export function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase()
}

export function getProviderInfo(providerId: string): ProviderInfo | null {
  const normalized = normalizeProviderId(providerId)
  for (const provider of PROVIDER_CATALOG) {
    if (provider.id === normalized) return provider
  }
  return null
}

export function getProviderDisplayName(providerId: string): string {
  const provider = getProviderInfo(providerId)
  if (provider) return provider.name

  const normalized = normalizeProviderId(providerId)
  if (!normalized) return 'Unknown Provider'

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(function mapChunk(chunk) {
      return chunk.slice(0, 1).toUpperCase() + chunk.slice(1)
    })
    .join(' ')
}

export function getAuthTypeLabel(authType: ProviderAuthType): string {
  if (authType === 'api-key') return 'API Key'
  if (authType === 'oauth') return 'OAuth'
  if (authType === 'cli-token') return 'CLI Token'
  return 'Local'
}

export function buildConfigExample(
  provider: ProviderInfo,
  authType: ProviderAuthType,
): string {
  const profileKey =
    authType === 'local' ? `${provider.id}:local` : `${provider.id}:default`

  if (authType === 'oauth') {
    return JSON.stringify(
      {
        auth: {
          profiles: {
            [profileKey]: {
              provider: provider.id,
              oauth: {
                enabled: true,
              },
            },
          },
        },
      },
      null,
      2,
    )
  }

  if (authType === 'local') {
    return JSON.stringify(
      {
        auth: {
          profiles: {
            [profileKey]: {
              provider: provider.id,
            },
          },
        },
      },
      null,
      2,
    )
  }

  return provider.configExample
}

// ── UI provider directory ────────────────────────────────────────────────
// Core identity (name/logo/auth/env key) shared by the settings dialog and
// onboarding provider lists, which previously duplicated these fields and
// drifted. Surface-specific data (model lists, descriptions) stays local.

export type ProviderDirectoryEntry = {
  id: string
  name: string
  logo: string
  authType: 'oauth' | 'api_key' | 'none'
  envKey?: string
}

export const PROVIDER_DIRECTORY: Array<ProviderDirectoryEntry> = [
  // Local providers first — zero setup
  { id: 'ollama', name: 'Ollama', logo: '/providers/ollama.png', authType: 'none' },
  { id: 'atomic-chat', name: 'Atomic Chat', logo: '/providers/atomic-chat.png', authType: 'none' },
  // Cloud providers
  { id: 'anthropic', name: 'Anthropic', logo: '/providers/anthropic.png', authType: 'api_key', envKey: 'ANTHROPIC_API_KEY' },
  { id: 'nous', name: 'Nous Portal', logo: '/providers/nous.png', authType: 'oauth' },
  { id: 'openai-codex', name: 'OpenAI Codex', logo: '/providers/openai.png', authType: 'oauth' },
  { id: 'openrouter', name: 'OpenRouter', logo: '/providers/openrouter.png', authType: 'api_key', envKey: 'OPENROUTER_API_KEY' },
  { id: 'zai', name: 'Z.AI / GLM', logo: '/providers/zhipu.png', authType: 'api_key', envKey: 'GLM_API_KEY' },
  { id: 'kimi-coding', name: 'Kimi', logo: '/providers/kimi.png', authType: 'api_key', envKey: 'KIMI_API_KEY' },
  { id: 'minimax', name: 'MiniMax', logo: '/providers/minimax.png', authType: 'api_key', envKey: 'MINIMAX_API_KEY' },
  { id: 'xiaomi', name: 'Xiaomi', logo: '/providers/xiaomi.png', authType: 'api_key', envKey: 'XIAOMI_API_KEY' },
  { id: 'custom', name: 'Custom', logo: '', authType: 'api_key' },
]
