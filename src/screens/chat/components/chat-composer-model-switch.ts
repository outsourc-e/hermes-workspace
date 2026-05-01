export const MODEL_SWITCH_BLOCKED_TOAST =
  'Model switching requires the enhanced runtime. Set a default via `claude config set model <id>` — the displayed model reflects your config.'

export type ZeroForkModelInfoFlags = {
  vanillaAgent: boolean
  supportsRuntimeSwitching: boolean
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function getZeroForkModelInfoFlags(
  payload: unknown,
): ZeroForkModelInfoFlags {
  const record = readRecord(payload)
  const capabilities = readRecord(record?.capabilities)

  const supportsRuntimeSwitching =
    readBoolean(record?.supportsRuntimeSwitching) ??
    readBoolean(record?.supports_runtime_switching) ??
    readBoolean(capabilities?.supportsRuntimeSwitching) ??
    readBoolean(capabilities?.supports_runtime_switching) ??
    false

  const runtime =
    readString(record?.runtime) ||
    readString(record?.agentRuntime) ||
    readString(record?.agent_runtime) ||
    readString(record?.agentType) ||
    readString(record?.agent_type) ||
    readString(record?.backend)

  const vanillaAgent = runtime
    ? /vanilla|upstream|dashboard|claude-agent/i.test(runtime)
    : !supportsRuntimeSwitching

  return {
    vanillaAgent,
    supportsRuntimeSwitching,
  }
}

export function shouldBlockZeroForkModelSwitch(
  mode: string | null | undefined,
  flags: ZeroForkModelInfoFlags,
): boolean {
  return (
    mode === 'zero-fork' &&
    flags.vanillaAgent &&
    !flags.supportsRuntimeSwitching
  )
}
