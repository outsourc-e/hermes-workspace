import { cn } from '@/lib/utils'

export type CheckpointStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revised'
  | string

export type CheckpointReviewAction = 'approve' | 'reject' | 'revise'

export type WorkspaceCheckpoint = {
  id: string
  task_run_id: string
  summary: string | null
  diff_stat: string | null
  status: CheckpointStatus
  reviewer_notes: string | null
  created_at: string
  task_name?: string
  mission_name?: string
  project_name?: string
  agent_name?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

export async function readWorkspacePayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

export async function workspaceRequestJson(
  input: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(input, init)
  const payload = await readWorkspacePayload(response)

  if (!response.ok) {
    const record = asRecord(payload)
    throw new Error(
      asString(record?.error) ??
        asString(record?.message) ??
        `Request failed with status ${response.status}`,
    )
  }

  return payload
}

function normalizeCheckpoint(value: unknown): WorkspaceCheckpoint {
  const record = asRecord(value)

  return {
    id: asString(record?.id) ?? crypto.randomUUID(),
    task_run_id: asString(record?.task_run_id) ?? 'unknown-run',
    summary: typeof record?.summary === 'string' ? record.summary : null,
    diff_stat: typeof record?.diff_stat === 'string' ? record.diff_stat : null,
    status: asString(record?.status) ?? 'pending',
    reviewer_notes:
      typeof record?.reviewer_notes === 'string' ? record.reviewer_notes : null,
    created_at: asString(record?.created_at) ?? new Date().toISOString(),
    task_name: asString(record?.task_name),
    mission_name: asString(record?.mission_name),
    project_name: asString(record?.project_name),
    agent_name: asString(record?.agent_name),
  }
}

export function extractCheckpoints(
  payload: unknown,
): Array<WorkspaceCheckpoint> {
  if (Array.isArray(payload)) return payload.map(normalizeCheckpoint)

  const record = asRecord(payload)
  const candidates = [record?.checkpoints, record?.data, record?.items]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeCheckpoint)
    }
  }

  return []
}

export async function listWorkspaceCheckpoints(
  status?: CheckpointStatus,
): Promise<Array<WorkspaceCheckpoint>> {
  const search = new URLSearchParams()
  if (status && status !== 'all') search.set('status', status)

  const payload = await workspaceRequestJson(
    `/api/workspace/checkpoints${search.size > 0 ? `?${search.toString()}` : ''}`,
  )

  return extractCheckpoints(payload)
}

export async function submitCheckpointReview(
  id: string,
  action: CheckpointReviewAction,
  reviewerNotes?: string,
): Promise<WorkspaceCheckpoint> {
  const payload = await workspaceRequestJson(
    `/api/workspace/checkpoints/${encodeURIComponent(id)}/${action}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        reviewer_notes: reviewerNotes?.trim()
          ? reviewerNotes.trim()
          : undefined,
      }),
    },
  )

  const checkpoint = extractSingleCheckpoint(payload)
  if (!checkpoint) {
    throw new Error('Checkpoint response was empty')
  }
  return checkpoint
}

export function formatCheckpointStatus(status: CheckpointStatus): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function getCheckpointStatusBadgeClass(
  status: CheckpointStatus,
): string {
  if (status === 'approved') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  }
  if (status === 'revised') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }
  if (status === 'rejected') {
    return 'border-red-500/30 bg-red-500/10 text-red-300'
  }
  return 'border-primary-700 bg-primary-800/70 text-primary-300'
}

export function getCheckpointActionButtonClass(
  tone: 'approve' | 'revise' | 'reject',
): string {
  return cn(
    'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    tone === 'approve' &&
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15',
    tone === 'revise' &&
      'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
    tone === 'reject' &&
      'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/15',
  )
}

export function formatCheckpointTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function matchesCheckpointProject(
  checkpoint: WorkspaceCheckpoint,
  projectName?: string,
): boolean {
  if (!projectName) return true
  return checkpoint.project_name === projectName
}

export function getCheckpointSummary(checkpoint: WorkspaceCheckpoint): string {
  return checkpoint.summary?.trim() || 'No checkpoint summary provided.'
}

export function getCheckpointDiffStat(checkpoint: WorkspaceCheckpoint): string {
  return checkpoint.diff_stat?.trim() || 'No diff stat reported'
}

export function getCheckpointReviewSuccessMessage(
  action: CheckpointReviewAction,
): string {
  if (action === 'approve') return 'Checkpoint approved'
  if (action === 'revise') return 'Checkpoint sent back for revision'
  return 'Checkpoint rejected'
}

export function getCheckpointReviewSubmitLabel(
  action: Extract<CheckpointReviewAction, 'revise' | 'reject'>,
): string {
  return action === 'revise' ? 'Send Revision Request' : 'Reject Checkpoint'
}

export function isCheckpointReviewable(
  checkpoint: WorkspaceCheckpoint,
): boolean {
  return checkpoint.status === 'pending'
}

export function firstPendingCheckpoint(
  checkpoints: Array<WorkspaceCheckpoint>,
): WorkspaceCheckpoint | null {
  for (const checkpoint of checkpoints) {
    if (checkpoint.status === 'pending') return checkpoint
  }
  return null
}

export function sortCheckpointsNewestFirst(
  checkpoints: Array<WorkspaceCheckpoint>,
): Array<WorkspaceCheckpoint> {
  return [...checkpoints].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  )
}

export function extractSingleCheckpoint(
  payload: unknown,
): WorkspaceCheckpoint | null {
  const checkpoints = extractCheckpoints(payload)
  if (checkpoints.length > 0) return checkpoints[0]

  const record = asRecord(payload)
  if (!record) return null
  return normalizeCheckpoint(record)
}
