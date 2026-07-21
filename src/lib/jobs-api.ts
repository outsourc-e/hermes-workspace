/**
 * Jobs API client — talks to Hermes Agent FastAPI /api/jobs endpoints.
 */

const CLAUDE_API = '/api/claude-jobs'

export type JobProfileOption = {
  name: string
  active?: boolean
}

export type ClaudeJob = {
  id: string
  name: string
  prompt: string
  schedule: Record<string, unknown>
  schedule_display?: string
  enabled: boolean
  state: string
  next_run_at?: string | null
  last_run_at?: string | null
  last_run_success?: boolean | null
  last_run_error?: string | null
  error?: string | null
  created_at?: string
  updated_at?: string
  deliver?: Array<string>
  skills?: Array<string>
  repeat?: { times?: number; completed?: number }
  run_count?: number
  profile?: string
  profile_name?: string
  jobId?: string
}

export type HermesJob = ClaudeJob

export type JobOutput = {
  filename: string
  timestamp: string
  content: string
  size: number
}

export function normalizeJobsResponse(data: unknown): Array<ClaudeJob> {
  if (Array.isArray(data)) return data as Array<ClaudeJob>
  if (
    typeof data === 'object' &&
    data !== null &&
    'jobs' in data &&
    Array.isArray((data as { jobs?: unknown }).jobs)
  ) {
    return (data as { jobs: Array<ClaudeJob> }).jobs
  }
  return []
}

export function findJobById(
  jobs: Array<ClaudeJob>,
  jobId: string | null | undefined,
): ClaudeJob | null {
  if (!jobId) return null
  return jobs.find((job) => job.id === jobId) ?? null
}

export function normalizeJobState(state: unknown): string | null {
  return typeof state === 'string' && state.trim()
    ? state.trim().toLowerCase()
    : null
}

export function isFailedJobState(state: unknown): boolean {
  const normalized = normalizeJobState(state)
  return (
    normalized === 'failed' ||
    normalized === 'error' ||
    normalized === 'errored' ||
    normalized === 'cancelled' ||
    normalized === 'canceled' ||
    normalized === 'aborted'
  )
}

export function isTerminalJobState(state: unknown): boolean {
  const normalized = normalizeJobState(state)
  return (
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'succeeded' ||
    normalized === 'success' ||
    normalized === 'finished' ||
    normalized === 'done' ||
    isFailedJobState(normalized)
  )
}

export function getLatestJobOutputText(outputs: Array<JobOutput>): string {
  let latestContent = ''
  let latestTimestamp = Number.NEGATIVE_INFINITY

  for (const output of outputs) {
    const content =
      typeof output.content === 'string' ? output.content.trim() : ''
    if (!content) continue

    const timestamp = new Date(output.timestamp).getTime()
    if (!Number.isFinite(timestamp) || timestamp < latestTimestamp) continue

    latestTimestamp = timestamp
    latestContent = content
  }

  return latestContent
}

export function getJobErrorText(
  job: ClaudeJob | null | undefined,
): string | null {
  if (!job) return null

  const candidates = [job.last_run_error, job.error]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  return null
}

export async function fetchJobs(): Promise<Array<ClaudeJob>> {
  const res = await fetch(`${CLAUDE_API}?include_disabled=true&profiles=all`)
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`)
  const data = await res.json()
  return normalizeJobsResponse(data)
}

/**
 * Coerce an arbitrary error payload (string | object | array) into a single
 * human-readable message. Without this, FastAPI/Pydantic responses that
 * include a structured `detail` (e.g. an array of validation errors) end up
 * rendered as the literal string "[object Object]" by Error.message, which
 * is what users were seeing in the Create Job dialog. See #304.
 */
function errorMessageFromBody(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((item) => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const msg =
              (item as { msg?: unknown; message?: unknown }).msg ??
              (item as { message?: unknown }).message
            if (typeof msg === 'string') return msg
          }
          return JSON.stringify(item)
        })
        .join('; ')
    }
    if (detail !== undefined) {
      try {
        return JSON.stringify(detail)
      } catch {
        // Fall through to message/error/fallback below.
      }
    }
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) return error
  }
  return fallback
}

type JobMutationInput = {
  schedule: string
  prompt: string
  name?: string
  deliver?: string | Array<string>
  skills?: Array<string>
  repeat?: number
  profile?: string
}

function serializeDeliveryTargets(deliver?: string | Array<string>): string | undefined {
  if (typeof deliver === 'string') {
    const normalized = deliver.trim()
    return normalized || undefined
  }
  if (!Array.isArray(deliver)) return undefined
  const normalized = deliver.map((value) => value.trim()).filter(Boolean)
  return normalized.length > 0 ? normalized.join(',') : undefined
}

export function buildJobMutationPayload(
  input: JobMutationInput,
): JobMutationInput & { input: string; deliver?: string } {
  const prompt = typeof input.prompt === 'string' ? input.prompt : ''
  const deliver = serializeDeliveryTargets(input.deliver)
  return {
    ...input,
    prompt,
    input: prompt,
    deliver,
  }
}

export async function createJob(input: JobMutationInput): Promise<ClaudeJob> {
  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildJobMutationPayload(input)),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      errorMessageFromBody(body, `Failed to create job: ${res.status}`),
    )
  }
  return (await res.json()).job
}

export async function updateJob(
  jobId: string,
  updates: Record<string, unknown>,
): Promise<ClaudeJob> {
  const payload = {
    ...updates,
    ...(typeof updates.prompt === 'string' ? { input: updates.prompt } : {}),
    ...(Object.prototype.hasOwnProperty.call(updates, 'deliver')
      ? {
          deliver: serializeDeliveryTargets(
            (updates as { deliver?: string | Array<string> }).deliver,
          ),
        }
      : {}),
  }
  const res = await fetch(`${CLAUDE_API}/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      errorMessageFromBody(body, `Failed to update job: ${res.status}`),
    )
  }
  return (await res.json()).job
}

export async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${CLAUDE_API}/${jobId}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      errorMessageFromBody(body, `Failed to delete job: ${res.status}`),
    )
  }
}

export async function pauseJob(jobId: string): Promise<ClaudeJob> {
  const res = await fetch(`${CLAUDE_API}/${jobId}?action=pause`, {
    method: 'POST',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      errorMessageFromBody(body, `Failed to pause job: ${res.status}`),
    )
  }
  return (await res.json()).job
}

export async function resumeJob(jobId: string): Promise<ClaudeJob> {
  const res = await fetch(`${CLAUDE_API}/${jobId}?action=resume`, {
    method: 'POST',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      errorMessageFromBody(body, `Failed to resume job: ${res.status}`),
    )
  }
  return (await res.json()).job
}

export async function triggerJob(jobId: string): Promise<ClaudeJob> {
  const res = await fetch(`${CLAUDE_API}/${jobId}?action=run`, {
    method: 'POST',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(
      errorMessageFromBody(body, `Failed to trigger job: ${res.status}`),
    )
  }
  return (await res.json()).job
}

export async function fetchJobProfiles(): Promise<Array<JobProfileOption>> {
  const res = await fetch('/api/profiles/list')
  if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`)
  const cronProfileNamePattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
  const data = (await res.json()) as {
    profiles?: Array<{ name?: unknown; active?: unknown; exists?: unknown }>
  }
  return Array.isArray(data.profiles)
    ? data.profiles
        .map((profile) => ({
          name: typeof profile.name === 'string' ? profile.name : '',
          active: profile.active === true,
          exists: profile.exists !== false,
        }))
        .filter(
          (profile) =>
            profile.exists && cronProfileNamePattern.test(profile.name),
        )
        .map(({ name, active }) => ({ name, active }))
    : []
}

export async function fetchJobOutput(
  jobId: string,
  limit = 10,
): Promise<Array<JobOutput>> {
  const res = await fetch(`${CLAUDE_API}/${jobId}?action=output&limit=${limit}`)
  if (!res.ok) throw new Error(`Failed to fetch output: ${res.status}`)
  return (await res.json()).outputs ?? []
}
