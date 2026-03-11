export type WorkspaceRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'stopped'
  | string

export type WorkspaceTaskRun = {
  id: string
  task_id: string
  agent_id: string | null
  session_id: string | null
  session_label?: string | null
  status: WorkspaceRunStatus
  attempt: number
  workspace_path: string | null
  started_at: string | null
  completed_at: string | null
  error: string | null
  input_tokens: number
  output_tokens: number
  cost_cents: number
  task_name: string
  mission_id: string
  mission_name: string
  project_id: string
  project_name: string
  agent_name: string | null
}

export type WorkspaceRunEvent = {
  id: number
  task_run_id: string
  type: string
  data: Record<string, unknown> | null
  created_at: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseRunEventData(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return asRecord(parsed)
    } catch {
      return value.trim() ? { message: value } : null
    }
  }
  return asRecord(value)
}

export function normalizeTaskRun(value: unknown): WorkspaceTaskRun {
  const record = asRecord(value)
  return {
    id: asString(record?.id) ?? crypto.randomUUID(),
    task_id: asString(record?.task_id) ?? '',
    agent_id: asString(record?.agent_id),
    session_id: asString(record?.session_id),
    session_label: asString(record?.session_label),
    status: asString(record?.status) ?? 'pending',
    attempt: asNumber(record?.attempt) || 1,
    workspace_path: asString(record?.workspace_path),
    started_at: asString(record?.started_at),
    completed_at: asString(record?.completed_at),
    error: asString(record?.error),
    input_tokens: asNumber(record?.input_tokens),
    output_tokens: asNumber(record?.output_tokens),
    cost_cents: asNumber(record?.cost_cents),
    task_name: asString(record?.task_name) ?? 'Untitled task',
    mission_id: asString(record?.mission_id) ?? '',
    mission_name: asString(record?.mission_name) ?? 'Unknown mission',
    project_id: asString(record?.project_id) ?? '',
    project_name: asString(record?.project_name) ?? 'Unknown project',
    agent_name: asString(record?.agent_name),
  }
}

export function normalizeRunEvent(value: unknown): WorkspaceRunEvent {
  const record = asRecord(value)
  return {
    id: asNumber(record?.id),
    task_run_id: asString(record?.task_run_id) ?? '',
    type: asString(record?.type) ?? 'status',
    data: parseRunEventData(record?.data),
    created_at: asString(record?.created_at) ?? new Date().toISOString(),
  }
}

export function extractTaskRuns(payload: unknown): Array<WorkspaceTaskRun> {
  if (Array.isArray(payload)) return payload.map(normalizeTaskRun)

  const record = asRecord(payload)
  const candidates = [record?.runs, record?.data, record?.items]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeTaskRun)
    }
  }
  return []
}

export function extractRunEvents(payload: unknown): Array<WorkspaceRunEvent> {
  if (Array.isArray(payload)) return payload.map(normalizeRunEvent)

  const record = asRecord(payload)
  const candidates = [record?.events, record?.data, record?.items]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(normalizeRunEvent)
    }
  }
  return []
}
