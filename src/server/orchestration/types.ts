export type ExecutionProof = {
  pid?: number | null
  executor?: string
  adapterId?: string
  startedAt?: number
  lastActivityAt?: number
  finishedAt?: number
  exitCode?: number
  providerCalls?: number
  provider?: string
  model?: string
  usageKnown?: boolean
  inputTokens?: number
  outputTokens?: number
  command?: string | null
  outputHash?: string
}

export type ExecutionResultInput = {
  state: string
  checkpointRaw?: string
  checkpointFresh?: boolean
  proof?: ExecutionProof | null
  summary?: string | null
  error?: string | null
}
