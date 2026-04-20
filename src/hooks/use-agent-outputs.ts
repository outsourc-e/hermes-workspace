// use-agent-outputs.ts
//
// Hermes-Workspace stub for the Operations "Outputs" tab.
// ControlSuite ships a richer implementation backed by the Codex agent
// activity feed. Hermes does not have that surface yet, so this returns
// an empty list and a no-op refresher. Replace with a real hook when we
// wire up an outputs feed.

import { useCallback, useState } from 'react'

export type AgentOutputStatus = 'ok' | 'error' | 'running' | 'unknown'
export type AgentOutputFailureKind =
  | 'delivery'
  | 'config'
  | 'approval'
  | 'runtime'
  | undefined

export type AgentOutput = {
  id: string
  agentId: string
  agentName: string
  agentEmoji?: string
  jobId?: string
  jobName?: string
  timestamp: number
  durationMs?: number
  status: AgentOutputStatus
  statusLabel?: string
  failureKind?: AgentOutputFailureKind
  summary: string
  fullOutput: string
  model?: string
  sessionKey?: string
  chatSessionKey?: string
  error?: string
}

export type AgentOutputFilter = 'all' | 'ok' | 'error' | 'running'

export type AgentOutputFilterOption = {
  id: AgentOutputFilter
  label: string
  emoji?: string
}

const DEFAULT_FILTERS: AgentOutputFilterOption[] = [
  { id: 'all', label: 'All', emoji: '📋' },
  { id: 'ok', label: 'Success', emoji: '✅' },
  { id: 'error', label: 'Errors', emoji: '❌' },
  { id: 'running', label: 'Running', emoji: '⏳' },
]

export function useAgentOutputs(_filter: AgentOutputFilter) {
  const [loading] = useState(false)
  const refresh = useCallback(() => {
    // no-op; real implementation will refetch from gateway
  }, [])
  return {
    outputs: [] as AgentOutput[],
    availableFilters: DEFAULT_FILTERS,
    loading,
    error: null as string | null,
    refresh,
  }
}
