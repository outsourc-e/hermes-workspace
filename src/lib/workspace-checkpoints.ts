import { cn } from '@/lib/utils'

export type CheckpointStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revised'
  | string

export type CheckpointReviewAction =
  | 'approve'
  | 'approve-and-commit'
  | 'approve-and-pr'
  | 'approve-and-merge'
  | 'reject'
  | 'revise'

export type WorkspaceCheckpoint = {
  id: string
  task_run_id: string
  summary: string | null
  diff_stat: string | null
  verification_raw: string | null
  status: CheckpointStatus
  reviewer_notes: string | null
  commit_hash: string | null
  created_at: string
  task_name: string | null
  mission_name: string | null
  project_name: string | null
  agent_name: string | null
}

export type WorkspaceCheckpointRunEvent = {
  id: number
  type: string
  created_at: string
  text: string
  data: Record<string, unknown> | null
}

export type WorkspaceCheckpointDiffFile = {
  path: string
  additions: number | null
  deletions: number | null
  patch: string
}

export type WorkspaceCheckpointVerificationItem = {
  status: 'passed' | 'failed' | 'missing' | 'not_configured'
  label: string
  output: string | null
  checked_at: string | null
}

export type WorkspaceCheckpointVerificationKey = 'tsc' | 'tests' | 'lint' | 'e2e'

export type WorkspaceCheckpointVerificationMap = Record<
  WorkspaceCheckpointVerificationKey,
  WorkspaceCheckpointVerificationItem
>

export type WorkspaceCheckpointRawDiff = {
  diff: string
}

export type WorkspaceCheckpointDetail = WorkspaceCheckpoint & {
  task_id: string | null
  project_id: string | null
  project_path: string | null
  agent_model: string | null
  agent_adapter_type: string | null
  task_run_status: string | null
  task_run_attempt: number | null
  task_run_workspace_path: string | null
  task_run_started_at: string | null
  task_run_completed_at: string | null
  task_run_error: string | null
  task_run_input_tokens: number | null
  task_run_output_tokens: number | null
  task_run_cost_cents: number | null
  run_events: WorkspaceCheckpointRunEvent[]
  diff_files: WorkspaceCheckpointDiffFile[]
  verification: WorkspaceCheckpointVerificationMap
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
    verification_raw:
      typeof record?.verification === 'string' ? record.verification : null,
    status: asString(record?.status) ?? 'pending',
    reviewer_notes:
      typeof record?.reviewer_notes === 'string' ? record.reviewer_notes : null,
    commit_hash:
      typeof record?.commit_hash === 'string' ? record.commit_hash : null,
    created_at: asString(record?.created_at) ?? new Date().toISOString(),
    task_name: asString(record?.task_name) ?? null,
    mission_name: asString(record?.mission_name) ?? null,
    project_name: asString(record?.project_name) ?? null,
    agent_name: asString(record?.agent_name) ?? null,
  }
}

function normalizeRunEvent(value: unknown): WorkspaceCheckpointRunEvent {
  const record = asRecord(value)
  return {
    id:
      typeof record?.id === 'number'
        ? record.id
        : Number.parseInt(asString(record?.id) ?? '0', 10) || 0,
    type: asString(record?.type) ?? 'status',
    created_at: asString(record?.created_at) ?? new Date().toISOString(),
    text: asString(record?.text) ?? '',
    data: asRecord(record?.data),
  }
}

function normalizeVerificationItem(value: unknown): WorkspaceCheckpointVerificationItem {
  const record = asRecord(value)
  const status = asString(record?.status)
  return {
    status:
      status === 'passed' ||
      status === 'failed' ||
      status === 'missing' ||
      status === 'not_configured'
        ? status
        : 'missing',
    label: asString(record?.label) ?? 'Unknown',
    output: typeof record?.output === 'string' ? record.output : null,
    checked_at: asString(record?.checked_at) ?? null,
  }
}

function getDefaultVerificationMap(): WorkspaceCheckpointVerificationMap {
  return {
    tsc: {
      status: 'missing',
      label: 'Not run yet',
      output: null,
      checked_at: null,
    },
    tests: {
      status: 'not_configured',
      label: 'Not configured',
      output: null,
      checked_at: null,
    },
    lint: {
      status: 'not_configured',
      label: 'Not configured',
      output: null,
      checked_at: null,
    },
    e2e: {
      status: 'not_configured',
      label: 'Not configured',
      output: null,
      checked_at: null,
    },
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

export async function getWorkspaceCheckpointDetail(
  id: string,
): Promise<WorkspaceCheckpointDetail> {
  const payload = await workspaceRequestJson(
    `/api/workspace/checkpoints/${encodeURIComponent(id)}`,
  )
  const record = asRecord(payload)
  if (!record) {
    throw new Error('Checkpoint detail response was empty')
  }

  const detailRecord = asRecord(record.checkpoint) ?? record
  const parsedDiffStat = asRecord(record.parsed_diff_stat)
  const verificationRecord = asRecord(record.verification) ?? asRecord(detailRecord.verification)
  const fileDiffs = Array.isArray(record.file_diffs)
    ? record.file_diffs.map((entry) => {
        const item = asRecord(entry)
        return {
          path: asString(item?.path) ?? 'unknown',
          patch:
            typeof item?.diff === 'string'
              ? item.diff
              : asString(item?.patch) ?? '',
        }
      })
    : Array.isArray(detailRecord.diff_files)
      ? detailRecord.diff_files.map((entry) => {
          const item = asRecord(entry)
          return {
            path: asString(item?.path) ?? 'unknown',
            patch: asString(item?.patch) ?? '',
          }
        })
      : []

  const rawDiffStat = typeof parsedDiffStat?.raw === 'string' ? parsedDiffStat.raw : ''
  const checkpoint = normalizeCheckpoint(detailRecord)
  return {
    ...checkpoint,
    task_id: asString(detailRecord.task_id) ?? null,
    project_id: asString(detailRecord.project_id) ?? null,
    project_path: asString(detailRecord.project_path) ?? null,
    agent_model: asString(detailRecord.agent_model) ?? null,
    agent_adapter_type: asString(detailRecord.agent_adapter_type) ?? null,
    task_run_status: asString(detailRecord.task_run_status) ?? null,
    task_run_attempt:
      typeof detailRecord.task_run_attempt === 'number'
        ? detailRecord.task_run_attempt
        : null,
    task_run_workspace_path: asString(detailRecord.task_run_workspace_path) ?? null,
    task_run_started_at: asString(detailRecord.task_run_started_at) ?? null,
    task_run_completed_at: asString(detailRecord.task_run_completed_at) ?? null,
    task_run_error: asString(detailRecord.task_run_error) ?? null,
    task_run_input_tokens:
      typeof detailRecord.task_run_input_tokens === 'number'
        ? detailRecord.task_run_input_tokens
        : null,
    task_run_output_tokens:
      typeof detailRecord.task_run_output_tokens === 'number'
        ? detailRecord.task_run_output_tokens
        : null,
    task_run_cost_cents:
      typeof detailRecord.task_run_cost_cents === 'number'
        ? detailRecord.task_run_cost_cents
        : null,
    run_events: Array.isArray(record.run_events)
      ? record.run_events.map(normalizeRunEvent)
      : Array.isArray(detailRecord.run_events)
        ? detailRecord.run_events.map(normalizeRunEvent)
        : [],
    verification: {
      ...getDefaultVerificationMap(),
      tsc: normalizeVerificationItem(verificationRecord?.tsc),
      tests: normalizeVerificationItem(verificationRecord?.tests),
      lint: normalizeVerificationItem(verificationRecord?.lint),
      e2e: normalizeVerificationItem(verificationRecord?.e2e),
    },
    diff_files: fileDiffs.map((file) => {
      const totals = parseDiffLineTotals(rawDiffStat, file.path)
      return {
        path: file.path,
        additions: totals?.additions ?? null,
        deletions: totals?.deletions ?? null,
        patch: file.patch,
      }
    }),
  }
}

export async function getWorkspaceCheckpointDiff(
  id: string,
): Promise<WorkspaceCheckpointRawDiff> {
  const payload = await workspaceRequestJson(
    `/api/workspace/checkpoints/${encodeURIComponent(id)}/diff`,
  )
  const record = asRecord(payload)
  if (!record) {
    throw new Error('Checkpoint diff response was empty')
  }

  return {
    diff: typeof record.diff === 'string' ? record.diff : '',
  }
}

function parseDiffLineTotals(
  raw: string,
  filePath: string,
): { additions: number; deletions: number } | null {
  const line = raw
    .split('\n')
    .map((entry) => entry.trimEnd())
    .find((entry) => entry.trimStart().startsWith(filePath) || entry.includes(` ${filePath} `))

  if (!line) return null
  const match = line.match(/^(.*?)\s+\|\s+(\d+)\s+([+\-]+)$/)
  if (!match) return null
  const markers = match[3] ?? ''
  return {
    additions: markers.split('').filter((value) => value === '+').length,
    deletions: markers.split('').filter((value) => value === '-').length,
  }
}

export async function runCheckpointTypecheck(id: string): Promise<{
  ok: boolean
  command: string
  cwd: string
  stdout: string
  stderr: string
  exitCode: number | null
}> {
  const payload = await workspaceRequestJson(
    `/api/workspace/checkpoints/${encodeURIComponent(id)}/verify-tsc`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  )

  const record = asRecord(payload)
  if (!record) {
    throw new Error('Verification response was empty')
  }

  return {
    ok: Boolean(record.ok),
    command: asString(record.command) ?? 'npx tsc --noEmit',
    cwd: asString(record.cwd) ?? '',
    stdout: asString(record.stdout) ?? '',
    stderr: asString(record.stderr) ?? '',
    exitCode: typeof record.exitCode === 'number' ? record.exitCode : null,
  }
}

export async function runWorkspaceCheckpointTsc(
  id: string,
): Promise<WorkspaceCheckpointVerificationItem> {
  const payload = await workspaceRequestJson(
    `/api/workspace/checkpoints/${encodeURIComponent(id)}/verify-tsc`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  )
  const record = asRecord(payload)
  if (!record) {
    throw new Error('Verification response was empty')
  }

  const status = asString(record.status)
  return {
    status:
      status === 'passed' ||
      status === 'failed' ||
      status === 'missing' ||
      status === 'not_configured'
        ? status
        : 'missing',
    label: asString(record.label) ?? 'Unknown',
    output: typeof record.output === 'string' ? record.output : null,
    checked_at: asString(record.checked_at) ?? null,
  }
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

/** SQLite timestamps come as "2026-03-10 21:40:00" (no tz) — treat as UTC */
export function parseUtcTimestamp(value: string): Date {
  const normalized = value.includes('T') || value.endsWith('Z')
    ? value
    : value.replace(' ', 'T') + 'Z'
  return new Date(normalized)
}

export function formatCheckpointTimestamp(value: string): string {
  const date = parseUtcTimestamp(value)
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

export function getCheckpointSummary(checkpoint: WorkspaceCheckpoint, maxLength = 200): string {
  const raw = checkpoint.summary?.trim() || 'No checkpoint summary provided.'
  if (raw.length <= maxLength) return raw
  return raw.slice(0, maxLength).trimEnd() + '…'
}

export function getCheckpointFullSummary(checkpoint: WorkspaceCheckpoint): string {
  return checkpoint.summary?.trim() || 'No checkpoint summary provided.'
}

export interface ParsedDiffStat {
  raw: string
  changedFiles: string[]
  filesChanged: number
}

export function getCheckpointDiffStatParsed(checkpoint: WorkspaceCheckpoint): ParsedDiffStat | null {
  if (!checkpoint.diff_stat) return null
  try {
    const parsed = JSON.parse(checkpoint.diff_stat) as Record<string, unknown>
    return {
      raw: typeof parsed.raw === 'string' ? parsed.raw : '',
      changedFiles: Array.isArray(parsed.changed_files) ? (parsed.changed_files as string[]) : [],
      filesChanged: typeof parsed.files_changed === 'number' ? parsed.files_changed : 0,
    }
  } catch {
    return null
  }
}

export function getCheckpointDiffStat(checkpoint: WorkspaceCheckpoint): string {
  const parsed = getCheckpointDiffStatParsed(checkpoint)
  if (parsed && parsed.filesChanged > 0) {
    return `${parsed.filesChanged} file${parsed.filesChanged === 1 ? '' : 's'} changed`
  }
  return checkpoint.diff_stat?.trim() || 'No diff stat reported'
}

export function getCheckpointCommitHashLabel(
  checkpoint: WorkspaceCheckpoint,
): string | null {
  const commitHash = checkpoint.commit_hash?.trim()
  return commitHash ? commitHash.slice(0, 7) : null
}

export function getCheckpointReviewSuccessMessage(
  action: CheckpointReviewAction,
): string {
  if (action === 'approve') return 'Checkpoint approved'
  if (action === 'approve-and-commit') return 'Checkpoint approved and committed'
  if (action === 'approve-and-pr') return 'Checkpoint approved and PR opened'
  if (action === 'approve-and-merge') return 'Checkpoint approved and merged'
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
