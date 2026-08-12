'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { HumanGateChoice } from '../lib/human-gate-options'

export type OrchestratorCheckpoint = {
  worker_id: string
  state: string
  result: string
  files_changed: string
  commands_run: string
  blocker: string
  next_action: string
  review_outcome?: string | null
  raw: string
}

export type OrchestratorClassification = {
  worker_id: string
  verdict: string
  blocker_type: string
  blocker_summary: string
  reasoning: string
  review_outcome: string
}

export type PendingAssignment = {
  worker_id: string
  task: string
  reason: string
}

export type OrchestratorState = {
  mission_id: string
  mission_goal: string
  langgraph_needs_human?: boolean
  all_done?: boolean
  pending_human_assignments?: Array<PendingAssignment>
  classifications?: Array<OrchestratorClassification>
  checkpoints?: Array<OrchestratorCheckpoint>
  langgraph_decision?: {
    analysis?: string
    assignments?: Array<PendingAssignment>
    human_approval_required?: boolean
    metadata?: { classifications?: Array<{ worker_id: string; verdict: string; blocker_type: string }> }
  } | null
  iteration?: number
  max_iterations?: number
  log_entries?: Array<string>
}

export type HumanGate = {
  missionId: string
  missionGoal: string
  workerId: string
  verdict: string
  blockerType: string
  blockerSummary: string
  reasoning: string
  checkpoint: OrchestratorCheckpoint | null
  pendingAssignments: Array<PendingAssignment>
  analysis: string
  iteration: number
  maxIterations: number
  logEntries: Array<string>
}

async function fetchOrchestratorState(missionId: string): Promise<OrchestratorState | null> {
  const res = await fetch(`/api/orchestrator-state?missionId=${encodeURIComponent(missionId)}`)
  if (!res.ok) {
    if (res.status === 404) return null
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  const data = (await res.json()) as { ok: boolean; state?: OrchestratorState | null }
  return data.state ?? null
}

async function fetchActiveGates(): Promise<Array<OrchestratorState>> {
  const res = await fetch('/api/orchestrator-active-gates')
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  const data = (await res.json()) as { ok: boolean; gates?: Array<OrchestratorState> }
  return data.gates ?? []
}

export type HumanGateResumeRequest = {
  action: 'approved' | 'abort'
  choice?: HumanGateChoice
  humanNote?: string
  targetWorkerId?: string
  continueWaitMinutes?: number
  mock?: boolean
}

async function postResume({
  missionId,
  action,
  choice,
  humanNote,
  targetWorkerId,
  mock,
}: {
  missionId: string
  action: 'approved' | 'abort'
  choice?: HumanGateChoice
  humanNote?: string
  targetWorkerId?: string
  mock: boolean
}): Promise<{ ok: boolean; completed?: boolean }> {
  const res = await fetch(`/api/swarm-langgraph/resume${mock ? '?mock=1' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      missionId,
      action,
      ...(action === 'approved'
        ? {
            choice: choice ?? 'primary',
            humanNote: humanNote ?? '',
            targetWorkerId: targetWorkerId ?? '',
          }
        : {}),
    }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; completed?: boolean }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return { ok: Boolean(data.ok), completed: data.completed }
}

function deriveGate(state: OrchestratorState | null | undefined): HumanGate | null {
  if (!state) return null
  const needsHuman = state.langgraph_needs_human === true
  const pending = state.pending_human_assignments ?? []
  if (!needsHuman && pending.length === 0) return null

  const classification = state.classifications?.[0]
  const checkpoint = state.checkpoints?.[0] ?? null
  const workerId = classification?.worker_id ?? pending[0]?.worker_id ?? 'unknown'
  const analysis = state.langgraph_decision?.analysis ?? ''

  return {
    missionId: state.mission_id,
    missionGoal: state.mission_goal,
    workerId,
    verdict: classification?.verdict ?? 'BLOCKED',
    blockerType: classification?.blocker_type ?? '',
    blockerSummary: classification?.blocker_summary ?? checkpoint?.blocker ?? '',
    reasoning: classification?.reasoning ?? '',
    checkpoint,
    pendingAssignments: pending,
    analysis,
    iteration: state.iteration ?? 0,
    maxIterations: state.max_iterations ?? 5,
    logEntries: state.log_entries ?? [],
  }
}

export function useHumanGate(missionId?: string | null | undefined) {
  const queryClient = useQueryClient()
  const queryKey = missionId
    ? ['orchestrator', 'state', missionId]
    : ['orchestrator', 'active-gates']

  const stateQuery = useQuery({
    queryKey,
    queryFn: () =>
      missionId ? fetchOrchestratorState(missionId) : fetchActiveGates().then((gates) => gates[0] ?? null),
    enabled: true,
    refetchInterval: 3_000,
    staleTime: 2_000,
  })

  const gate = useMemo(() => deriveGate(stateQuery.data), [stateQuery.data])

  const resumeMutation = useMutation({
    mutationFn: postResume,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['orchestrator', 'active-gates'] })
      await queryClient.invalidateQueries({ queryKey: ['orchestrator', 'state'] })
    },
  })

  const resume = useCallback(
    (request: HumanGateResumeRequest) => {
      const id = missionId ?? gate?.missionId
      if (!id) return
      resumeMutation.mutate({
        missionId: id,
        action: request.action,
        choice: request.choice,
        humanNote: request.humanNote,
        targetWorkerId: request.targetWorkerId,
        mock: request.mock ?? false,
      })
    },
    [missionId, gate?.missionId, resumeMutation],
  )

  return {
    state: stateQuery.data,
    gate,
    isLoading: stateQuery.isLoading,
    isError: stateQuery.isError,
    error: stateQuery.error,
    refetch: stateQuery.refetch,
    resume,
    isResuming: resumeMutation.isPending,
    resumeError: resumeMutation.error,
  }
}
