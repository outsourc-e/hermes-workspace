/**
 * Convert raw model identifiers to human-friendly names.
 *
 * Examples:
 *   "anthropic/claude-sonnet-4-5" → "Claude Sonnet 4.5"
 *   "openai-codex/gpt-5.4" → "Codex (GPT-5.4)"
 *   "ollama-pc1/pc1-coder:latest" → "Local: pc1-coder"
 */

const MODEL_MAP: Record<string, string> = {
  'claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-5': 'Claude Opus 4.5',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku': 'Claude 3.5 Haiku',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.3-codex': 'Codex (GPT-5.3)',
  o1: 'o1',
  'o1-mini': 'o1 Mini',
  'o1-pro': 'o1 Pro',
  o3: 'o3',
  'o3-mini': 'o3 Mini',
  'o3-pro': 'o3 Pro',
  'o4-mini': 'o4 Mini',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'MiniMax-M2.7': 'MiniMax M2.7',
  'MiniMax-M2.7-Lightning': 'MiniMax M2.7 Lightning',
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  'anthropic-oauth': 'Anthropic',
  openai: 'OpenAI',
  'openai-codex': 'Codex',
  google: 'Google',
  minimax: 'MiniMax',
}

export function formatModelName(raw: string | undefined | null): string {
  if (!raw) return 'Unknown'

  // Direct match on full string
  if (MODEL_MAP[raw]) return MODEL_MAP[raw]

  // Split provider/model
  const slashIdx = raw.indexOf('/')
  if (slashIdx === -1) {
    // No provider prefix — check model map
    return MODEL_MAP[raw] || titleCase(raw)
  }

  const provider = raw.slice(0, slashIdx)
  const model = raw.slice(slashIdx + 1)

  // Check model map first
  if (MODEL_MAP[model]) {
    // Special case: codex provider
    if (provider === 'openai-codex' && !MODEL_MAP[model].startsWith('Codex')) {
      return `Codex (${MODEL_MAP[model]})`
    }
    return MODEL_MAP[model]
  }

  // Local models (ollama, lmstudio)
  if (provider.startsWith('ollama-') || provider.startsWith('lmstudio-')) {
    const cleanModel = model.replace(/:latest$/, '').replace(/^hf\.co\//, '')
    return `Local: ${cleanModel}`
  }

  // Codex provider with unknown model
  if (provider === 'openai-codex') {
    return `Codex (${titleCase(model)})`
  }

  // Generic: strip provider, clean up model name
  return titleCase(model)
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/:latest$/, '')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/**
 * Get the provider display name from a raw model string.
 */
export function formatProviderName(raw: string | undefined | null): string {
  if (!raw) return 'Unknown'
  const slashIdx = raw.indexOf('/')
  if (slashIdx === -1) return 'Unknown'
  const provider = raw.slice(0, slashIdx)
  return PROVIDER_LABELS[provider] || titleCase(provider)
}
