import fs from 'node:fs/promises'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

export const READONLY_WORKER_STATUS_FILE = '/root/.hermes/runtime/readonly-worker-status.json'
const STALE_AFTER_SECONDS = 10 * 60

type ReadonlyWorkerStatusFs = {
  lstat: (path: string) => Promise<{
    isSymbolicLink: () => boolean
    isFile: () => boolean
  }>
  readFile: (path: string, encoding: 'utf8') => Promise<string>
}

type ReadonlyWorkerStatusDto = {
  ok: boolean
  status: string
  generatedAt: string | null
  workerDecision: string | null
  reportComplete: boolean | null
  mountReadOnly: boolean | null
  targetInspected: boolean | null
  contentsRead: boolean | null
  filesWritten: number | null
  queueMetadataUpdated: boolean | null
  externalMessagesSent: boolean | null
  dispatcherStarted: boolean | null
  swarmStarted: boolean | null
  lockClean: boolean | null
  redactionApplied: boolean | null
  stalenessSeconds: number | null
  isStale: boolean
  message: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readBool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function firstString(source: Record<string, unknown>, keys: Array<string>): string | null {
  for (const key of keys) {
    const value = readString(source[key])
    if (value !== null) return value
  }
  return null
}

function firstBool(source: Record<string, unknown>, keys: Array<string>): boolean | null {
  for (const key of keys) {
    const value = readBool(source[key])
    if (value !== null) return value
  }
  return null
}

function firstNumber(source: Record<string, unknown>, keys: Array<string>): number | null {
  for (const key of keys) {
    const value = readNumber(source[key])
    if (value !== null) return value
  }
  return null
}

function ageSeconds(generatedAt: string | null): number | null {
  if (!generatedAt) return null
  const generatedMs = Date.parse(generatedAt)
  if (!Number.isFinite(generatedMs)) return null
  return Math.max(0, Math.floor((Date.now() - generatedMs) / 1000))
}

function lockCleanFrom(source: Record<string, unknown>): boolean | null {
  const direct = firstBool(source, ['lockClean', 'lock_clean'])
  if (direct !== null) return direct

  const acquired = firstBool(source, ['lock_acquired', 'lockAcquired'])
  const released = firstBool(source, ['lock_released', 'lockReleased'])
  const releaseStatus = firstString(source, ['lock_release_status', 'lockReleaseStatus'])
  if (acquired === null && released === null && releaseStatus === null) return null
  return acquired === true && released === true && releaseStatus === 'released_own_lock'
}

function statusFrom(unsafe: boolean, isStale: boolean): string {
  if (unsafe) return 'error'
  if (isStale) return 'warning'
  return 'ok'
}

function messageFrom(status: string): string {
  if (status === 'ok') return 'readonly worker status ok'
  if (status === 'warning') return 'readonly worker status warning'
  if (status === 'error') return 'readonly worker status error'
  return 'readonly worker status unavailable'
}

function buildDto(source: Record<string, unknown>): ReadonlyWorkerStatusDto {
  const generatedAt = firstString(source, [
    'generatedAt',
    'generated_at',
    'updatedAt',
    'updated_at',
    'run_finished_at',
    'runFinishedAt',
  ])
  const stalenessSeconds = ageSeconds(generatedAt)
  const isStale = stalenessSeconds === null || stalenessSeconds > STALE_AFTER_SECONDS
  const workerDecision = firstString(source, ['workerDecision', 'worker_decision'])
  const reportComplete = firstBool(source, ['reportComplete', 'report_complete'])
  const contentsRead = firstBool(source, ['contentsRead', 'contents_read'])
  const filesWritten = firstNumber(source, ['filesWritten', 'files_written'])
  const queueMetadataUpdated = firstBool(source, [
    'queueMetadataUpdated',
    'queue_metadata_updated',
  ])
  const externalMessagesSent = firstBool(source, [
    'externalMessagesSent',
    'external_messages_sent',
  ])
  const dispatcherStarted = firstBool(source, ['dispatcherStarted', 'dispatcher_started'])
  const swarmStarted = firstBool(source, ['swarmStarted', 'swarm_started'])

  const unsafe =
    contentsRead === true ||
    (filesWritten !== null && filesWritten > 0) ||
    queueMetadataUpdated === true ||
    externalMessagesSent === true ||
    dispatcherStarted === true ||
    swarmStarted === true

  const status = statusFrom(unsafe, isStale)

  return {
    ok: true,
    status,
    generatedAt,
    workerDecision,
    reportComplete,
    mountReadOnly: firstBool(source, ['mountReadOnly', 'mount_read_only']),
    targetInspected: firstBool(source, ['targetInspected', 'target_inspected']),
    contentsRead,
    filesWritten,
    queueMetadataUpdated,
    externalMessagesSent,
    dispatcherStarted,
    swarmStarted,
    lockClean: lockCleanFrom(source),
    redactionApplied: firstBool(source, ['redactionApplied', 'redaction_applied']),
    stalenessSeconds,
    isStale,
    message: messageFrom(status),
  }
}

function errorDto(status = 'unavailable'): ReadonlyWorkerStatusDto {
  const safeStatus = status === 'error' ? 'error' : 'unavailable'
  return {
    ok: false,
    status: safeStatus,
    generatedAt: null,
    workerDecision: null,
    reportComplete: null,
    mountReadOnly: null,
    targetInspected: null,
    contentsRead: null,
    filesWritten: null,
    queueMetadataUpdated: null,
    externalMessagesSent: null,
    dispatcherStarted: null,
    swarmStarted: null,
    lockClean: null,
    redactionApplied: null,
    stalenessSeconds: null,
    isStale: true,
    message: messageFrom(safeStatus),
  }
}

export async function handleReadonlyWorkerStatusGet(
  request: Request,
  statusFs: ReadonlyWorkerStatusFs = fs,
): Promise<Response> {
  if (!isAuthenticated(request)) {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const linkStats = await statusFs.lstat(READONLY_WORKER_STATUS_FILE)
    if (linkStats.isSymbolicLink()) {
      return json(errorDto('error'), { status: 409 })
    }
    if (!linkStats.isFile()) {
      return json(errorDto(), { status: 404 })
    }

    const raw = await statusFs.readFile(READONLY_WORKER_STATUS_FILE, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return json(buildDto(asRecord(parsed)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return json(errorDto(), { status: 404 })
    }
    if (error instanceof SyntaxError) {
      return json(errorDto('error'), { status: 422 })
    }
    return json(errorDto('error'), { status: 500 })
  }
}

export const Route = createFileRoute('/api/readonly-worker-status')({
  server: {
    handlers: {
      GET: async ({ request }) => handleReadonlyWorkerStatusGet(request),
    },
  },
})
