import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { getHermesRoot, getProfilesDir } from './claude-paths'

const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const JOB_ID_RE = /^[A-Fa-f0-9]{8,64}$/

type RawCronJob = Record<string, unknown>

type CronJobsFile = {
  jobs?: Array<RawCronJob>
}

export type ProfileCronJob = RawCronJob & {
  id: string
  jobId: string
  profile: string
  profile_name: string
  name: string
  prompt: string
  enabled: boolean
  state: string
  schedule_display: string
  next_run_at: string | null
  last_run_at: string | null
  last_run_success: boolean | null
  last_run_error: string | null
  deliver: Array<string>
}

export type ParsedProfileJobId = {
  profile: string | null
  jobId: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeDeliver(value: unknown): Array<string> {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is string =>
        typeof entry === 'string' && entry.trim().length > 0,
    )
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()]
  return []
}

function lastRunSuccess(job: RawCronJob): boolean | null {
  const status = readString(job.last_status, job.lastRunStatus, job.status)
  if (!status) return null
  const normalized = status.toLowerCase()
  if (
    ['ok', 'success', 'succeeded', 'completed', 'complete', 'done'].includes(
      normalized,
    )
  )
    return true
  if (
    ['error', 'failed', 'fail', 'failure', 'cancelled', 'canceled'].includes(
      normalized,
    )
  )
    return false
  return null
}

function profileHome(profile: string): string {
  if (profile === 'default') return getHermesRoot()
  return join(getProfilesDir(), profile)
}

function outputDir(profile: string, jobId: string): string {
  return join(profileHome(profile), 'cron', 'output', jobId)
}

function readJobsFile(path: string): Array<RawCronJob> {
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as
      | CronJobsFile
      | Array<RawCronJob>
    if (Array.isArray(parsed)) return parsed
    return Array.isArray(parsed.jobs) ? parsed.jobs : []
  } catch {
    return []
  }
}

export function listCronProfiles(): Array<{ profile: string; home: string }> {
  const entries = [{ profile: 'default', home: getHermesRoot() }]
  const profilesDir = getProfilesDir()
  if (!existsSync(profilesDir)) return entries
  for (const name of readdirSync(profilesDir).sort()) {
    if (!PROFILE_NAME_RE.test(name)) continue
    const home = join(profilesDir, name)
    try {
      if (statSync(home).isDirectory()) entries.push({ profile: name, home })
    } catch {
      // Ignore profiles that disappear while scanning.
    }
  }
  return entries
}

export function listProfileCronJobs(): Array<ProfileCronJob> {
  const rows: Array<ProfileCronJob> = []
  for (const entry of listCronProfiles()) {
    const jobs = readJobsFile(join(entry.home, 'cron', 'jobs.json'))
    for (const job of jobs) {
      const rawId = readString(job.id, job.jobId)
      if (!rawId) continue
      const schedule = asRecord(job.schedule)
      const display =
        readString(
          job.schedule_display,
          schedule.display,
          schedule.expr,
          job.cron,
        ) ?? '* * * * *'
      const state =
        readString(job.state, job.status) ??
        (readBoolean(job.enabled, true) ? 'scheduled' : 'paused')
      rows.push({
        ...job,
        id: `${entry.profile}:${rawId}`,
        jobId: rawId,
        profile: entry.profile,
        profile_name: entry.profile,
        name: readString(job.name, job.title) ?? rawId,
        prompt: readString(job.prompt, job.input, job.description) ?? '',
        enabled: readBoolean(job.enabled, state !== 'paused'),
        state,
        schedule_display: display,
        next_run_at: readString(job.next_run_at, job.nextRunAt),
        last_run_at: readString(job.last_run_at, job.lastRunAt),
        last_run_success: lastRunSuccess(job),
        last_run_error: readString(job.last_error, job.lastRunError),
        deliver: normalizeDeliver(job.deliver),
      })
    }
  }
  return rows.sort(
    (a, b) =>
      a.profile.localeCompare(b.profile) || a.name.localeCompare(b.name),
  )
}

export function parseProfileJobId(value: string): ParsedProfileJobId {
  const index = value.indexOf(':')
  if (index <= 0) return { profile: null, jobId: value }
  const profile = value.slice(0, index)
  const jobId = value.slice(index + 1)
  if (!PROFILE_NAME_RE.test(profile) || !JOB_ID_RE.test(jobId))
    return { profile: null, jobId: value }
  return { profile, jobId }
}

function validateProfileAndMaybeJob(profile: string, jobId?: string): void {
  if (
    !PROFILE_NAME_RE.test(profile) ||
    (jobId !== undefined && !JOB_ID_RE.test(jobId))
  ) {
    throw new Error('Invalid profile or job id')
  }
  if (!listCronProfiles().some((entry) => entry.profile === profile)) {
    throw new Error(`Unknown Hermes profile: ${profile}`)
  }
}

function normalizeCreateArgs(
  profile: string,
  input: Record<string, unknown>,
): Array<string> {
  validateProfileAndMaybeJob(profile)
  const schedule = readString(input.schedule)
  const prompt = readString(input.prompt, input.input) ?? ''
  if (!schedule) throw new Error('Schedule is required')
  const args = ['--profile', profile, 'cron', 'create']
  const name = readString(input.name)
  if (name) args.push('--name', name)
  const deliver = Array.isArray(input.deliver)
    ? input.deliver
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    : []
  if (deliver.length > 0) args.push('--deliver', deliver.join(','))
  const skills = Array.isArray(input.skills)
    ? input.skills
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    : []
  for (const skill of skills) args.push('--skill', skill)
  const repeat =
    typeof input.repeat === 'number' && Number.isFinite(input.repeat)
      ? String(input.repeat)
      : null
  if (repeat) args.push('--repeat', repeat)
  args.push(schedule, prompt)
  return args
}

function parseCreatedJobId(output: string): string | null {
  return output.match(/Created job:\s*([A-Fa-f0-9]{8,64})/)?.[1] ?? null
}

export function createProfileCronJob(
  profile: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const output = execFileSync('hermes', normalizeCreateArgs(profile, input), {
    encoding: 'utf8',
    timeout: 30_000,
  })
  const createdId = parseCreatedJobId(output)
  const job = createdId
    ? (listProfileCronJobs().find(
        (entry) => entry.profile === profile && entry.jobId === createdId,
      ) ?? null)
    : null
  return {
    ok: true,
    output,
    job,
    jobId: createdId ? `${profile}:${createdId}` : undefined,
  }
}

export function runProfileCronAction(
  profile: string,
  jobId: string,
  action: 'pause' | 'resume' | 'run' | 'remove',
): Record<string, unknown> {
  validateProfileAndMaybeJob(profile, jobId)
  const cliAction = action === 'remove' ? 'remove' : action
  const output = execFileSync(
    'hermes',
    ['--profile', profile, 'cron', cliAction, jobId],
    {
      encoding: 'utf8',
      timeout: 30_000,
    },
  )
  const job =
    listProfileCronJobs().find(
      (entry) => entry.profile === profile && entry.jobId === jobId,
    ) ?? null
  return { ok: true, output, job }
}

export function updateProfileCronJob(
  profile: string,
  jobId: string,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  validateProfileAndMaybeJob(profile, jobId)
  const args = ['--profile', profile, 'cron', 'edit', jobId]
  const name = readString(updates.name)
  const schedule = readString(updates.schedule)
  const prompt = readString(updates.prompt, updates.input)
  const deliver = Array.isArray(updates.deliver)
    ? updates.deliver
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    : []
  if (name) args.push('--name', name)
  if (schedule) args.push('--schedule', schedule)
  if (prompt !== null) args.push('--prompt', prompt)
  if (deliver.length > 0) args.push('--deliver', deliver.join(','))
  const repeat =
    typeof updates.repeat === 'number' && Number.isFinite(updates.repeat)
      ? String(updates.repeat)
      : null
  if (repeat) args.push('--repeat', repeat)
  const output = execFileSync('hermes', args, {
    encoding: 'utf8',
    timeout: 30_000,
  })
  const job =
    listProfileCronJobs().find(
      (entry) => entry.profile === profile && entry.jobId === jobId,
    ) ?? null
  return { ok: true, output, job }
}

export function readProfileCronOutputs(
  profile: string,
  jobId: string,
  limit: number,
): Array<{
  filename: string
  timestamp: string
  content: string
  size: number
}> {
  if (!PROFILE_NAME_RE.test(profile) || !JOB_ID_RE.test(jobId)) return []
  const dir = outputDir(profile, jobId)
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((name) => !name.startsWith('.'))
      .sort()
      .reverse()
      .slice(0, Math.max(1, Math.min(limit, 50)))
      .map((name) => {
        const path = join(dir, name)
        const stat = statSync(path)
        return {
          filename: basename(name),
          timestamp: stat.mtime.toISOString(),
          content: readFileSync(path, 'utf8'),
          size: stat.size,
        }
      })
  } catch {
    return []
  }
}
