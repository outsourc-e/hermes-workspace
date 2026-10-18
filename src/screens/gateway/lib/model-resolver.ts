const MODEL_PRESET_MAP: Record<string, string> = {
  auto: '',
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  codex: 'openai/gpt-5.3-codex',
  flash: 'google/gemini-2.5-flash',
  minimax: 'minimax/MiniMax-M2.5',
}

export function resolveGatewayModelId(modelId: string): string {
  if (Object.prototype.hasOwnProperty.call(MODEL_PRESET_MAP, modelId)) {
    return MODEL_PRESET_MAP[modelId] ?? ''
  }
  return modelId
}
