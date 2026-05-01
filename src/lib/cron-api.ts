import type {
  CronJob,
  CronRun,
  CronRunStatus,
} from '@/components/cron-manager/cron-types'

type CronJobsResponse = {
  jobs?: Array<Record<string, unknown>>
}

type CronRunsResponse = {
  runs?: Array<Record<string, unknown>>
}

type ToggleCronPayload = {
  ok?: boolean
  enabled?: boolean
}

type RunCronPayload = {
  ok?: boolean
}

export type UpsertCronJobInput = {
  jobId?: string
  name: string
  schedule: string
  enabled: boolean
  description?: string
  payload?: unknown
  deliveryConfig?: unknown
}

type UpsertCronPayload = {
  ok?: boolean
  jobId?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function readStringCandidate(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function readNumberCandidate(...values: Array<unknown>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function normalizeStatus(value: unknown): CronRunStatus {
  if (typeof value !== 'string') return 'unknown'
  const normalized = value.trim().toLowerCase()
  if (
    normalized.includes('success') ||
    normalized === 'ok' ||
    normalized === 'completed'
  ) {
    return 'success'
  }
  if (normalized.includes('error') || normalized.includes('fail')) {
    return 'error'
  }
  if (normalized.includes('run')) return 'running'
  if (normalized.includes('queue') || normalized.includes('pending'))
    return 'queued'
  return 'unknown'
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000
    return new Date(milliseconds).toISOString()
  }
  return null
}

function normalizeRun(row: Record<string, unknown>, index: number): CronRun {
  const output = row.output
  const outputRecord = asRecord(output)
  const deliveryRecord = asRecord(
    row.delivery ?? row.deliveryResult ?? row.result ?? outputRecord.delivery,
  )
  const contextRecord = asRecord(row.context ?? outputRecord.context)

  return {
    id:
      (typeof row.id === 'string' && row.id) ||
      (typeof row.runId === 'string' && row.runId) ||
      `run-${index}`,
    status: normalizeStatus(row.status ?? row.state ?? row.result),
    startedAt: normalizeTimestamp(
      row.startedAt ?? row.started_at ?? row.createdAt ?? row.timestamp,
    ),
    finishedAt: normalizeTimestamp(
      row.finishedAt ?? row.finished_at ?? row.completedAt,
    ),
    durationMs: readNumberCandidate(
      row.durationMs,
      row.duration,
      outputRecord.durationMs,
      outputRecord.duration,
    ),
    error:
      typeof row.error === 'string'
        ? row.error
        : typeof row.message === 'string'
          ? row.message
          : undefined,
    deliverySummary: readStringCandidate(
      row.deliverySummary,
      row.summary,
      row.deliveryText,
      row.deliveryMessage,
      deliveryRecord.summary,
      deliveryRecord.text,
      deliveryRecord.message,
      outputRecord.deliverySummary,
      outputRecord.summary,
      outputRecord.text,
      outputRecord.message,
    ),
    chatSessionKey: readStringCandidate(
      row.chatSessionKey,
      row.friendlyId,
      row.sessionKey,
      row.sessionId,
      contextRecord.friendlyId,
      contextRecord.sessionKey,
      outputRecord.chatSessionKey,
      outputRecord.friendlyId,
      outputRecord.sessionKey,
      outputRecord.sessionId,
    ),
    output,
  }
}

function normalizeJob(row: Record<string, unknown>, index: number): CronJob {
  const lastRunRow = row.lastRun
  const lastRun =
    lastRunRow && typeof lastRunRow === 'object'
      ? normalizeRun(lastRunRow as Record<string, unknown>, index)
      : normalizeRun(
          {
            id: row.lastRunId,
            status: row.lastRunStatus,
            startedAt: row.lastRunAt,
            finishedAt: row.lastRunCompletedAt,
            durationMs: row.lastRunDurationMs,
            error: row.lastRunError,
          },
          index,
        )

  return {
    id:
      (typeof row.id === 'string' && row.id) ||
      (typeof row.jobId === 'string' && row.jobId) ||
      `job-${index}`,
    name:
      (typeof row.name === 'string' && row.name) ||
      (typeof row.title === 'string' && row.title) ||
      `Cron Job ${index + 1}`,
    schedule:
      (typeof row.schedule === 'string' && row.schedule) ||
      (typeof row.cron === 'string' && row.cron) ||
      '* * * * *',
    enabled: Boolean(row.enabled),
    payload: row.payload,
    deliveryConfig: row.deliveryConfig,
    status: typeof row.status === 'string' ? row.status : undefined,
    description:
      typeof row.description === 'string' ? row.description : undefined,
    lastRun,
  }
}

function friendlyError(raw: string): string {
  if (!raw) return 'Request failed'
  if (raw.includes("require 'croniter'") || raw.includes('croniter')) {
    return "Cron support missing: reinstall hermes-agent with 'pip install \"hermes-agent[cron]\"' (or 'pipx install --force hermes-agent[cron]'), then restart the gateway."
  }
  return raw
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>
    if (typeof payload.error === 'string') return friendlyError(payload.error)
    if (typeof payload.message === 'string') return friendlyError(payload.message)
    return JSON.stringify(payload)
  } catch {
    const text = await response.text().catch(() => '')
    return friendlyError(text || response.statusText || 'Request failed')
  }
}

function readPayloadErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  if ('error' in payload && typeof payload.error === 'string') {
    return payload.error
  }
  if ('message' in payload && typeof payload.message === 'string') {
    return payload.message
  }
  return null
}

function throwIfPayloadNotOk(payload: unknown): void {
  if (!payload || typeof payload !== 'object') return
  if ('ok' in payload && payload.ok === false) {
    throw new Error(readPayloadErrorMessage(payload) ?? 'Request failed')
  }
}

async function readJsonAndCheckOk<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T
  throwIfPayloadNotOk(payload)
  return payload
}

// Claude-Workspace cron API: backed by /api/claude-jobs (FastAPI proxy)
// Each "cron job" is a scheduled task in Claude' job runner. Operations
// names jobs `ops:<agentId>:<slug>` so they bind to a specific profile.

export async function fetchCronJobs(): Promise<Array<CronJob>> {
  const response = await fetch('/api/claude-jobs')
  if (!response.ok) {
    throw new Error(await readError(response))
  }

  const payload = await readJsonAndCheckOk<CronJobsResponse>(response)
  const rows = Array.isArray(payload.jobs) ? payload.jobs : []
  return rows.map(function mapJob(job, index) {
    return normalizeJob(job, index)
  })
}

export async function fetchCronRuns(jobId: string): Promise<Array<CronRun>> {
  const response = await fetch(
    `/api/claude-jobs/${encodeURIComponent(jobId)}?action=runs&limit=20`,
  )
  if (!response.ok) {
    throw new Error(await readError(response))
  }

  const payload = await readJsonAndCheckOk<CronRunsResponse>(response)
  const rows = Array.isArray(payload.runs) ? payload.runs : []
  return rows.map(function mapRun(run, index) {
    return normalizeRun(run, index)
  })
}

export async function runCronJob(jobId: string): Promise<RunCronPayload> {
  const response = await fetch(
    `/api/claude-jobs/${encodeURIComponent(jobId)}?action=run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  )

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return readJsonAndCheckOk<RunCronPayload>(response)
}

export async function runCronJobIfDue(
  jobId: string,
): Promise<RunCronPayload> {
  const response = await fetch(
    `/api/claude-jobs/${encodeURIComponent(jobId)}?action=run-if-due`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
  )

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return readJsonAndCheckOk<RunCronPayload>(response)
}

export async function toggleCronJob(payload: {
  jobId: string
  enabled: boolean
}): Promise<ToggleCronPayload> {
  const response = await fetch(
    `/api/claude-jobs/${encodeURIComponent(payload.jobId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: payload.enabled }),
    },
  )

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return readJsonAndCheckOk<ToggleCronPayload>(response)
}

export async function upsertCronJob(
  payload: UpsertCronJobInput,
): Promise<UpsertCronPayload> {
  const isUpdate = Boolean(payload.jobId)
  const url = isUpdate
    ? `/api/claude-jobs/${encodeURIComponent(payload.jobId as string)}`
    : '/api/claude-jobs'
  const response = await fetch(url, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return readJsonAndCheckOk<UpsertCronPayload>(response)
}

export async function deleteCronJob(jobId: string): Promise<{ ok?: boolean }> {
  const response = await fetch(
    `/api/claude-jobs/${encodeURIComponent(jobId)}`,
    {
      method: 'DELETE',
    },
  )

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return readJsonAndCheckOk<{ ok?: boolean }>(response)
}
