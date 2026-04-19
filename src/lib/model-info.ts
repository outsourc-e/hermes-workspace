export type NormalizedModelInfo = {
  supportsRuntimeSwitching: boolean | null
  vanillaAgent: boolean | null
  mode: string | null
  raw: Record<string, unknown> | null
}

export type GatewayModelInfoFallbackCapabilities = {
  enhancedChat?: boolean
  config?: boolean
  sessions?: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'enhanced', 'supported'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'vanilla', 'unsupported'].includes(normalized)) {
    return false
  }
  return null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function deriveFallbackModelInfoFromGateway(
  gatewayMode: string | null | undefined,
  capabilities: GatewayModelInfoFallbackCapabilities | null | undefined,
): NormalizedModelInfo {
  const hasEnhancedRuntime = Boolean(
    capabilities?.enhancedChat || capabilities?.config || capabilities?.sessions,
  )

  if (hasEnhancedRuntime || gatewayMode === 'enhanced-fork') {
    return {
      supportsRuntimeSwitching: true,
      vanillaAgent: false,
      mode: 'enhanced',
      raw: null,
    }
  }

  return {
    supportsRuntimeSwitching: null,
    vanillaAgent: null,
    mode: null,
    raw: null,
  }
}

export function normalizeModelInfoResponse(value: unknown): NormalizedModelInfo {
  const record = asRecord(value)
  if (!record) {
    return {
      supportsRuntimeSwitching: null,
      vanillaAgent: null,
      mode: null,
      raw: null,
    }
  }

  const mode =
    readString(record.mode) ??
    readString(record.agent_mode) ??
    readString(record.agentMode) ??
    readString(record.runtime_mode) ??
    readString(record.runtimeMode)

  const supportsRuntimeSwitching =
    readBoolean(record.supportsRuntimeSwitching) ??
    readBoolean(record.supports_runtime_switching) ??
    readBoolean(record.canSwitchModels) ??
    readBoolean(record.can_switch_models) ??
    readBoolean(record.runtimeSwitching) ??
    readBoolean(record.runtime_switching) ??
    (mode === 'enhanced' ? true : mode === 'vanilla' ? false : null)

  const vanillaFlag =
    readBoolean(record.vanillaAgent) ??
    readBoolean(record.vanilla_agent) ??
    readBoolean(record.usesVanillaAgent) ??
    readBoolean(record.uses_vanilla_agent)
  const enhancedFlag =
    readBoolean(record.enhancedFork) ?? readBoolean(record.enhanced_fork)

  const vanillaAgent =
    vanillaFlag ??
    (enhancedFlag === true
      ? false
      : mode === 'vanilla'
        ? true
        : mode === 'enhanced'
          ? false
          : supportsRuntimeSwitching === false
            ? true
            : null)

  return {
    supportsRuntimeSwitching,
    vanillaAgent,
    mode,
    raw: record,
  }
}
