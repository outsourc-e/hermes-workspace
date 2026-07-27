import {
  link,
  lstat,
  mkdir,
  open,
  opendir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'

import { getHermesRoot } from './claude-paths'
import { assertSafeRunId, isSafeRunId } from './run-id'

export type PersistedRunToolCall = {
  id: string
  name: string
  phase: string
  args?: unknown
  preview?: string
  result?: string
}

export type PersistedRunLifecycleEvent = {
  text: string
  emoji: string
  timestamp: number
  isError: boolean
}

export type PersistedRunState = {
  runId: string
  providerRunId?: string
  sessionKey: string
  friendlyId: string
  cardId?: string
  canonicalSegmentKey?: string
  status: 'accepted' | 'active' | 'handoff' | 'stalled' | 'complete' | 'error'
  createdAt: number
  updatedAt: number
  lastEventAt: number
  assistantText: string
  thinkingText: string
  toolCalls: Array<PersistedRunToolCall>
  lifecycleEvents: Array<PersistedRunLifecycleEvent>
  errorMessage?: string
}

export type PersistedRunOwnerProjection = {
  runId: string
  sessionKey: string
  friendlyId: string
  cardId?: string
  canonicalSegmentKey?: string
}

/**
 * Persisted runs are accepted only through an exact owner projection. Card
 * ownership is all-or-nothing: legacy records without Card metadata remain
 * usable through legacy session recovery, but cannot be claimed by a Card
 * handoff after the fact.
 */
export function persistedRunMatchesOwner(
  run: PersistedRunState | null | undefined,
  owner: PersistedRunOwnerProjection,
): run is PersistedRunState {
  if (
    !run ||
    !isSafeRunId(run.runId) ||
    !isSafeRunId(owner.runId) ||
    run.runId !== owner.runId ||
    run.sessionKey !== owner.sessionKey ||
    run.friendlyId !== owner.friendlyId
  ) {
    return false
  }

  const ownerHasCardIdentity =
    owner.cardId !== undefined || owner.canonicalSegmentKey !== undefined
  if (!ownerHasCardIdentity) {
    return run.cardId === undefined && run.canonicalSegmentKey === undefined
  }
  return (
    owner.cardId !== undefined &&
    owner.canonicalSegmentKey !== undefined &&
    run.cardId === owner.cardId &&
    run.canonicalSegmentKey === owner.canonicalSegmentKey
  )
}

const RUNS_ROOT = path.resolve(getHermesRoot(), 'webui-mvp', 'runs')
const runUpdateQueues = new Map<string, Promise<void>>()

const RUN_LOCK_WAIT_MS = 10_000
const RUN_LOCK_POLL_MS = 5
const RUN_LOCK_LEASE_MS = 60_000
const TERMINAL_RUN_STATUSES = new Set<PersistedRunState['status']>([
  'complete',
  'error',
  'handoff',
])

export const MAX_PERSISTED_RUN_TOOL_CALLS = 128
export const PERSISTED_TOOL_ID_MAX_BYTES = 256
export const PERSISTED_TOOL_NAME_MAX_BYTES = 128
export const PERSISTED_TOOL_PHASE_MAX_BYTES = 32
export const PERSISTED_TOOL_ARGS_MAX_BYTES = 16 * 1024
export const PERSISTED_TOOL_PREVIEW_MAX_BYTES = 2 * 1024
export const PERSISTED_TOOL_RESULT_MAX_BYTES = 16 * 1024
export const PERSISTED_TOOL_CALLS_MAX_BYTES = 256 * 1024
export const MAX_PERSISTED_RUN_FILE_BYTES = 1024 * 1024
export const PERSISTED_ASSISTANT_TEXT_MAX_BYTES = 512 * 1024
export const PERSISTED_THINKING_TEXT_MAX_BYTES = 128 * 1024
export const MAX_PERSISTED_RUN_LIFECYCLE_EVENTS = 40
export const PERSISTED_LIFECYCLE_TEXT_MAX_BYTES = 2 * 1024
export const PERSISTED_LIFECYCLE_EMOJI_MAX_BYTES = 64
export const PERSISTED_ERROR_MESSAGE_MAX_BYTES = 4 * 1024
// Recovery uses one shared budget across a tree. Every encountered entry counts,
// including malformed or irrelevant names, so hostile filler cannot force an
// unbounded scan before validation. Exceeding any budget makes recovery fail
// closed rather than base Card ownership on an arbitrary partial tree.
export const MAX_PERSISTED_RUN_DIRECTORY_ENTRIES = 256
export const MAX_PERSISTED_RUN_FILE_ENTRIES = 1024
export const MAX_PERSISTED_RUN_TREE_BYTES = 16 * 1024 * 1024
export const MAX_PERSISTED_RUN_RESULTS = 512
const PERSISTED_OWNER_FIELD_MAX_BYTES = 2 * 1024
const REDACTED = '[REDACTED]'

const SENSITIVE_KEY_PATTERN =
  /^(?:(?:access|id|refresh)[_-]?token|api[_-]?key|access[_-]?key|authorization|auth|bearer|client[_-]?secret|cookie|credential|password|passwd|private[_-]?key|secret|token|x[_-]?api[_-]?key)$/iu
const SENSITIVE_ASSIGNMENT_PATTERN =
  /((?:"|'|\b)(?:(?:access|id|refresh)[_-]?token|api[_-]?key|access[_-]?key|authorization|auth|bearer|client[_-]?secret|cookie|credential|password|passwd|private[_-]?key|secret|token|x[_-]?api[_-]?key)(?:"|'|\b)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\r\n,;]+)/giu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

function redactSensitiveString(value: string): string {
  return value
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/giu,
      REDACTED,
    )
    .replace(
      /\b(Bearer|Basic)\s+[^\s,;"']+/giu,
      (_match, scheme: string) => `${scheme} ${REDACTED}`,
    )
    .replace(
      /\b(?:github_pat|gh[opurs]|sk|xox[baprs])[-_][A-Za-z0-9_-]{8,}\b/giu,
      REDACTED,
    )
    .replace(
      SENSITIVE_ASSIGNMENT_PATTERN,
      (_match, prefix: string, secret: string) => {
        const quote = secret.startsWith('"')
          ? '"'
          : secret.startsWith("'")
            ? "'"
            : ''
        return `${prefix}${quote}${REDACTED}${quote}`
      },
    )
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+@/giu, `$1${REDACTED}@`)
}

function redactStructuredValue(value: unknown, depth = 0): unknown {
  if (depth > 20) {
    return { omitted: 'Nested tool data exceeded the persistence limit.' }
  }
  if (typeof value === 'string') return redactSensitiveString(value)
  if (Array.isArray(value)) {
    return value.map((entry) => redactStructuredValue(entry, depth + 1))
  }
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactStructuredValue(entry, depth + 1),
    ]),
  )
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  let result = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8')
    if (bytes + characterBytes > maxBytes) break
    result += character
    bytes += characterBytes
  }
  return result
}

function truncateJsonString(value: string, maxBytes: number): string {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') - 2 <= maxBytes) {
    return value
  }
  let result = ''
  let bytes = 0
  for (const character of value) {
    const characterBytes =
      Buffer.byteLength(JSON.stringify(character), 'utf8') - 2
    if (bytes + characterBytes > maxBytes) break
    result += character
    bytes += characterBytes
  }
  return result
}

function sanitizePersistedText(value: string, maxBytes: number): string {
  return truncateJsonString(redactSensitiveString(value), maxBytes)
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code <= 31 || code === 127) return true
  }
  return false
}

function boundedExactIdentifier(
  value: unknown,
  maxBytes: number,
): string | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return null
  }
  if (containsControlCharacter(value)) return null
  return Buffer.byteLength(value, 'utf8') <= maxBytes ? value : null
}

function sanitizeToolArgs(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    const serialized = JSON.stringify(value)
    if (Buffer.byteLength(serialized, 'utf8') > PERSISTED_TOOL_ARGS_MAX_BYTES) {
      return { omitted: 'Tool arguments exceeded the persistence limit.' }
    }
    return redactStructuredValue(JSON.parse(serialized) as unknown)
  } catch {
    return { omitted: 'Tool arguments could not be serialized safely.' }
  }
}

function sanitizePersistedToolCall(
  input: unknown,
): PersistedRunToolCall | null {
  if (!isRecord(input)) return null
  const id = boundedExactIdentifier(input.id, PERSISTED_TOOL_ID_MAX_BYTES)
  if (!id) return null
  const exactName = boundedExactIdentifier(
    input.name,
    PERSISTED_TOOL_NAME_MAX_BYTES,
  )
  const phase = boundedExactIdentifier(
    input.phase,
    PERSISTED_TOOL_PHASE_MAX_BYTES,
  )
  if (!phase) return null
  const args = sanitizeToolArgs(input.args)
  const preview =
    typeof input.preview === 'string'
      ? truncateUtf8(
          redactSensitiveString(input.preview),
          PERSISTED_TOOL_PREVIEW_MAX_BYTES,
        )
      : undefined
  const result =
    input.phase === 'error'
      ? 'Tool failed.'
      : typeof input.result === 'string'
        ? truncateUtf8(
            redactSensitiveString(input.result),
            PERSISTED_TOOL_RESULT_MAX_BYTES,
          )
        : undefined
  return {
    id,
    name: exactName ?? 'tool',
    phase,
    ...(args === undefined ? {} : { args }),
    ...(preview === undefined ? {} : { preview }),
    ...(result === undefined ? {} : { result }),
  }
}

function boundPersistedToolCalls(
  input: Array<unknown>,
  protectedToolId?: string,
): Array<PersistedRunToolCall> {
  const bounded: Array<PersistedRunToolCall> = []
  const seen = new Set<string>()
  for (const entry of input) {
    const sanitized = sanitizePersistedToolCall(entry)
    if (!sanitized || seen.has(sanitized.id)) continue
    bounded.push(sanitized)
    seen.add(sanitized.id)
    if (bounded.length >= MAX_PERSISTED_RUN_TOOL_CALLS) break
  }
  if (serializedBytes(bounded) <= PERSISTED_TOOL_CALLS_MAX_BYTES) return bounded

  for (let index = bounded.length - 1; index >= 0; index -= 1) {
    const entry = bounded[index]
    if (!entry) continue
    bounded[index] = {
      id: entry.id,
      name: entry.name,
      phase: entry.phase,
      ...(entry.id === protectedToolId && entry.phase === 'error'
        ? { result: 'Tool failed.' }
        : {}),
    }
    if (serializedBytes(bounded) <= PERSISTED_TOOL_CALLS_MAX_BYTES)
      return bounded
  }
  return bounded.map((entry) => ({
    id: entry.id,
    name: 'tool',
    phase: entry.phase,
  }))
}

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function sanitizeLifecycleEvents(
  value: unknown,
): Array<PersistedRunLifecycleEvent> | null {
  if (!Array.isArray(value)) return null
  const events: Array<PersistedRunLifecycleEvent> = []
  for (const input of value.slice(-MAX_PERSISTED_RUN_LIFECYCLE_EVENTS)) {
    if (!isRecord(input)) continue
    const timestamp = normalizeTimestamp(input.timestamp)
    if (
      typeof input.text !== 'string' ||
      typeof input.emoji !== 'string' ||
      typeof input.isError !== 'boolean' ||
      timestamp === null
    ) {
      continue
    }
    events.push({
      text: truncateJsonString(
        redactSensitiveString(input.text),
        PERSISTED_LIFECYCLE_TEXT_MAX_BYTES,
      ),
      emoji: truncateJsonString(
        input.emoji,
        PERSISTED_LIFECYCLE_EMOJI_MAX_BYTES,
      ),
      timestamp,
      isError: input.isError,
    })
  }
  return events
}

const PERSISTED_RUN_STATUSES = new Set<PersistedRunState['status']>([
  'accepted',
  'active',
  'handoff',
  'stalled',
  'complete',
  'error',
])

function normalizePersistedRun(
  value: unknown,
  expected?: { runId: string; sessionKey: string },
): PersistedRunState | null {
  if (!isRecord(value)) return null
  const runId = boundedExactIdentifier(value.runId, 128)
  const providerRunId =
    value.providerRunId === undefined
      ? undefined
      : boundedExactIdentifier(value.providerRunId, 128)
  const sessionKey = boundedExactIdentifier(
    value.sessionKey,
    PERSISTED_OWNER_FIELD_MAX_BYTES,
  )
  const friendlyId = boundedExactIdentifier(
    value.friendlyId,
    PERSISTED_OWNER_FIELD_MAX_BYTES,
  )
  const cardId =
    value.cardId === undefined
      ? undefined
      : boundedExactIdentifier(value.cardId, PERSISTED_OWNER_FIELD_MAX_BYTES)
  const canonicalSegmentKey =
    value.canonicalSegmentKey === undefined
      ? undefined
      : boundedExactIdentifier(
          value.canonicalSegmentKey,
          PERSISTED_OWNER_FIELD_MAX_BYTES,
        )
  const createdAt = normalizeTimestamp(value.createdAt)
  const updatedAt = normalizeTimestamp(value.updatedAt)
  const lastEventAt = normalizeTimestamp(value.lastEventAt)
  const toolCalls = Array.isArray(value.toolCalls)
    ? boundPersistedToolCalls(value.toolCalls)
    : null
  const lifecycleEvents = sanitizeLifecycleEvents(value.lifecycleEvents)
  if (
    !runId ||
    !isSafeRunId(runId) ||
    providerRunId === null ||
    (providerRunId !== undefined && !isSafeRunId(providerRunId)) ||
    !sessionKey ||
    !friendlyId ||
    (expected &&
      (runId !== expected.runId || sessionKey !== expected.sessionKey)) ||
    cardId === null ||
    canonicalSegmentKey === null ||
    (cardId === undefined) !== (canonicalSegmentKey === undefined) ||
    typeof value.status !== 'string' ||
    !PERSISTED_RUN_STATUSES.has(value.status as PersistedRunState['status']) ||
    createdAt === null ||
    updatedAt === null ||
    lastEventAt === null ||
    typeof value.assistantText !== 'string' ||
    typeof value.thinkingText !== 'string' ||
    toolCalls === null ||
    lifecycleEvents === null ||
    (value.errorMessage !== undefined && typeof value.errorMessage !== 'string')
  ) {
    return null
  }

  const status = value.status as PersistedRunState['status']
  return {
    runId,
    ...(providerRunId === undefined ? {} : { providerRunId }),
    sessionKey,
    friendlyId,
    ...(cardId === undefined ? {} : { cardId }),
    ...(canonicalSegmentKey === undefined ? {} : { canonicalSegmentKey }),
    status,
    createdAt,
    updatedAt,
    lastEventAt,
    assistantText: sanitizePersistedText(
      value.assistantText,
      PERSISTED_ASSISTANT_TEXT_MAX_BYTES,
    ),
    thinkingText: sanitizePersistedText(
      value.thinkingText,
      PERSISTED_THINKING_TEXT_MAX_BYTES,
    ),
    toolCalls,
    lifecycleEvents,
    ...(status === 'error' && typeof value.errorMessage === 'string'
      ? {
          errorMessage: truncateJsonString(
            redactSensitiveString(value.errorMessage),
            PERSISTED_ERROR_MESSAGE_MAX_BYTES,
          ),
        }
      : {}),
  }
}

function serializePersistedRun(run: PersistedRunState): string {
  const serialized = `${JSON.stringify(run, null, 2)}\n`
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PERSISTED_RUN_FILE_BYTES) {
    throw Object.assign(
      new Error('Persisted run state exceeds the file limit'),
      {
        code: 'EFBIG',
      },
    )
  }
  return serialized
}

type RunTreeReadBudget = {
  directoryEntries: number
  fileEntries: number
  bytesRead: number
  results: number
  exceeded: boolean
}

function createRunTreeReadBudget(): RunTreeReadBudget {
  return {
    directoryEntries: 0,
    fileEntries: 0,
    bytesRead: 0,
    results: 0,
    exceeded: false,
  }
}

function runTreeBudgetExceeded(budget: RunTreeReadBudget): boolean {
  return budget.exceeded
}

function runTreeLimitError(message: string): Error {
  return Object.assign(new Error(message), { code: 'EFBIG' })
}

async function readBoundedUtf8File(
  filePath: string,
  maxBytes: number,
  treeBudget?: RunTreeReadBudget,
): Promise<string> {
  const handle = await open(filePath, 'r')
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size > maxBytes) {
      throw Object.assign(
        new Error('Persisted run file is invalid or oversized'),
        {
          code: 'EFBIG',
        },
      )
    }
    if (
      treeBudget &&
      metadata.size > MAX_PERSISTED_RUN_TREE_BYTES - treeBudget.bytesRead
    ) {
      treeBudget.exceeded = true
      throw runTreeLimitError('Persisted run tree exceeds the aggregate limit')
    }

    const chunks: Array<Buffer> = []
    let totalBytes = 0
    for (;;) {
      const chunk = Buffer.allocUnsafe(
        Math.min(64 * 1024, maxBytes + 1 - totalBytes),
      )
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      totalBytes += bytesRead
      if (
        treeBudget &&
        bytesRead > MAX_PERSISTED_RUN_TREE_BYTES - treeBudget.bytesRead
      ) {
        treeBudget.exceeded = true
        throw runTreeLimitError(
          'Persisted run tree exceeds the aggregate limit',
        )
      }
      if (treeBudget) treeBudget.bytesRead += bytesRead
      if (totalBytes > maxBytes) {
        throw Object.assign(new Error('Persisted run file is oversized'), {
          code: 'EFBIG',
        })
      }
      chunks.push(chunk.subarray(0, bytesRead))
    }
    return Buffer.concat(chunks, totalBytes).toString('utf8')
  } finally {
    await handle.close()
  }
}

function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey || 'main')
}

function resolveDescendant(root: string, ...segments: Array<string>): string {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, ...segments)
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Resolved path must stay beneath the runs root')
  }
  return resolvedPath
}

function sessionDir(sessionKey: string): string {
  return resolveDescendant(RUNS_ROOT, encodeSessionKey(sessionKey))
}

function runPath(sessionKey: string, runId: string): string {
  assertSafeRunId(runId)
  return resolveDescendant(sessionDir(sessionKey), `${runId}.json`)
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

type RunLockIdentity = { sessionKey: string; runId: string }

function runLockPath(identity: RunLockIdentity): string {
  return `${runPath(identity.sessionKey, identity.runId)}.lock`
}

type AcquiredRunLock = { path: string; token: string }
type RunPublicationFence = () => Promise<void>

type RunLockOwner = {
  token: string
  pid: number
  processIdentity?: string
  leaseUntil?: number
}

function parseRunLockOwner(value: string): RunLockOwner | null {
  try {
    const parsed = JSON.parse(value) as Partial<RunLockOwner>
    if (
      typeof parsed.token !== 'string' ||
      !/^[a-f0-9-]{36}$/u.test(parsed.token) ||
      !Number.isSafeInteger(parsed.pid) ||
      (parsed.pid ?? 0) <= 0 ||
      (parsed.pid ?? 0) > 2_147_483_647 ||
      (parsed.processIdentity !== undefined &&
        (typeof parsed.processIdentity !== 'string' ||
          parsed.processIdentity.length > 256)) ||
      (parsed.leaseUntil !== undefined &&
        (!Number.isSafeInteger(parsed.leaseUntil) || parsed.leaseUntil < 0))
    ) {
      return null
    }
    return {
      token: parsed.token,
      pid: parsed.pid!,
      ...(parsed.processIdentity === undefined
        ? {}
        : { processIdentity: parsed.processIdentity }),
      ...(parsed.leaseUntil === undefined
        ? {}
        : { leaseUntil: parsed.leaseUntil }),
    }
  } catch {
    return null
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

type ProcessCreationLookup = (pid: number) => Promise<string | null>

async function readLinuxProcessStartTime(pid: number): Promise<string | null> {
  try {
    const raw = await readFile(`/proc/${pid}/stat`, 'utf8')
    const closingParenthesis = raw.lastIndexOf(') ')
    if (closingParenthesis < 0) return null
    const fieldsAfterCommand = raw
      .slice(closingParenthesis + 2)
      .trim()
      .split(/\s+/u)
    const startTime = fieldsAfterCommand[19]
    return startTime && /^\d+$/u.test(startTime) ? startTime : null
  } catch {
    return null
  }
}

async function readWindowsProcessCreationTime(
  pid: number,
): Promise<string | null> {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$processInfo = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId = ${pid}'`,
    'if ($null -ne $processInfo) { [Console]::Out.Write($processInfo.CreationDate.ToUniversalTime().Ticks) }',
  ].join('; ')
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 2_000,
        maxBuffer: 1024,
      },
      (error, stdout) => {
        if (error) {
          resolve(null)
          return
        }
        const creationTime = stdout.trim()
        resolve(/^\d+$/u.test(creationTime) ? creationTime : null)
      },
    )
  })
}

/** Platform seam for process-creation identity. Windows uses CIM rather than
 * lease age so a reused PID can be distinguished without evicting a paused,
 * demonstrably live owner. Unsupported or failed lookups safely return null. */
export async function resolveProcessIdentity(
  pid: number,
  platform: NodeJS.Platform,
  linuxStartTimeLookup: ProcessCreationLookup = readLinuxProcessStartTime,
  windowsCreationTimeLookup: ProcessCreationLookup = readWindowsProcessCreationTime,
): Promise<string | null> {
  const lookup =
    platform === 'linux'
      ? linuxStartTimeLookup
      : platform === 'win32'
        ? windowsCreationTimeLookup
        : null
  if (!lookup) return null
  const creationIdentity = await lookup(pid)
  return creationIdentity && /^\d+$/u.test(creationIdentity)
    ? `${platform === 'win32' ? 'windows' : 'linux'}:${creationIdentity}`
    : null
}

async function getProcessIdentity(pid: number): Promise<string | null> {
  return resolveProcessIdentity(pid, process.platform)
}

async function lockOwnerIsRecoverable(
  owner: RunLockOwner | null,
): Promise<boolean> {
  if (!owner) return true
  if (!processIsAlive(owner.pid)) return true

  if (owner.processIdentity) {
    const currentIdentity = await getProcessIdentity(owner.pid)
    if (currentIdentity === owner.processIdentity) return false
    if (currentIdentity !== null) return true
  }

  // A lease cannot fence a paused writer. If the PID is confirmed live but its
  // creation identity is unavailable, waiting for process death is the only
  // safe cross-platform fallback.
  return false
}

async function recoverDeadRunLock(lockPath: string): Promise<boolean> {
  let observed
  try {
    observed = await lstat(lockPath)
    if (!observed.isFile() || observed.isSymbolicLink()) {
      throw new Error('Persisted run update lock is invalid')
    }
    let owner: RunLockOwner | null = null
    if (observed.size <= 1024) {
      try {
        owner = parseRunLockOwner(await readBoundedUtf8File(lockPath, 1024))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
        if ((error as NodeJS.ErrnoException).code !== 'EFBIG') throw error
      }
    }
    if (!(await lockOwnerIsRecoverable(owner))) return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }

  const claimPath = `${lockPath}.claim.${process.pid}.${crypto.randomUUID()}`
  try {
    await link(lockPath, claimPath)
    const [current, claim] = await Promise.all([
      lstat(lockPath),
      lstat(claimPath),
    ])
    if (
      current.dev === claim.dev &&
      current.ino === claim.ino &&
      observed.dev === claim.dev &&
      observed.ino === claim.ino
    ) {
      await unlink(lockPath)
      return true
    }
    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  } finally {
    await unlink(claimPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function acquireRunLock(
  identity: RunLockIdentity,
): Promise<AcquiredRunLock> {
  await ensureDir(sessionDir(identity.sessionKey))
  const lockPath = runLockPath(identity)
  const token = crypto.randomUUID()
  const candidatePath = `${lockPath}.owner.${process.pid}.${token}`
  const startedAt = Date.now()
  const processIdentity = await getProcessIdentity(process.pid)
  const owner: RunLockOwner = {
    token,
    pid: process.pid,
    ...(processIdentity ? { processIdentity } : {}),
    leaseUntil: startedAt + RUN_LOCK_LEASE_MS,
  }
  await writeFile(candidatePath, `${JSON.stringify(owner)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  try {
    for (;;) {
      try {
        // Publish a fully-written owner record atomically. Writing directly with
        // `flag: 'wx'` makes the empty inode visible before writeFile fills it,
        // so a competing process can misclassify a live lock as invalid.
        await link(candidatePath, lockPath)
        return { path: lockPath, token }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        if (await recoverDeadRunLock(lockPath)) continue
        if (Date.now() - startedAt >= RUN_LOCK_WAIT_MS) {
          throw Object.assign(
            new Error(
              `Timed out waiting for persisted run ${identity.runId} update lock`,
            ),
            { code: 'EBUSY' },
          )
        }
        await new Promise((resolve) => setTimeout(resolve, RUN_LOCK_POLL_MS))
      }
    }
  } finally {
    await unlink(candidatePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function releaseRunLock(lock: AcquiredRunLock): Promise<void> {
  try {
    const owner = parseRunLockOwner(await readBoundedUtf8File(lock.path, 1024))
    if (owner?.token !== lock.token) {
      throw new Error('Persisted run update lock ownership changed')
    }
    await unlink(lock.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function assertRunLockOwned(lock: AcquiredRunLock): Promise<void> {
  let owner: RunLockOwner | null = null
  try {
    owner = parseRunLockOwner(await readBoundedUtf8File(lock.path, 1024))
  } catch (error) {
    throw new Error('Persisted run update lock ownership changed', {
      cause: error,
    })
  }
  if (owner?.token !== lock.token) {
    throw new Error('Persisted run update lock ownership changed')
  }
}

async function withRunLocks<T>(
  identities: Array<RunLockIdentity>,
  work: (assertLocksOwned: RunPublicationFence) => Promise<T>,
): Promise<T> {
  const unique = new Map(
    identities.map((identity) => [runLockPath(identity), identity] as const),
  )
  const ordered = [...unique.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )
  const acquired: Array<AcquiredRunLock> = []
  try {
    for (const [, identity] of ordered) {
      acquired.push(await acquireRunLock(identity))
    }
    return await work(async () => {
      for (const lock of acquired) await assertRunLockOwned(lock)
    })
  } finally {
    for (const lock of acquired.reverse()) await releaseRunLock(lock)
  }
}

function assertSameRunOwner(
  current: PersistedRunState,
  next: PersistedRunState,
): void {
  if (
    next.runId !== current.runId ||
    next.providerRunId !== current.providerRunId ||
    next.sessionKey !== current.sessionKey ||
    next.friendlyId !== current.friendlyId ||
    next.cardId !== current.cardId ||
    next.canonicalSegmentKey !== current.canonicalSegmentKey ||
    next.createdAt !== current.createdAt
  ) {
    throw new Error(
      `Persisted run ${current.runId} owner cannot change during update`,
    )
  }
}

async function writeRun(
  run: PersistedRunState,
  assertPublicationAllowed?: RunPublicationFence,
): Promise<void> {
  assertSafeRunId(run.runId)
  const normalized = normalizePersistedRun(run)
  if (!normalized) throw new Error('Persisted run state is invalid')
  const dir = sessionDir(normalized.sessionKey)
  await ensureDir(dir)
  const targetPath = runPath(normalized.sessionKey, normalized.runId)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`
  try {
    await writeFile(tempPath, serializePersistedRun(normalized), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await assertPublicationAllowed?.()
    await rename(tempPath, targetPath)
  } finally {
    await unlink(tempPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function writeRunExclusive(
  run: PersistedRunState,
  assertPublicationAllowed?: RunPublicationFence,
): Promise<void> {
  assertSafeRunId(run.runId)
  const normalized = normalizePersistedRun(run)
  if (!normalized) throw new Error('Persisted run state is invalid')
  const dir = sessionDir(normalized.sessionKey)
  await ensureDir(dir)
  const targetPath = runPath(normalized.sessionKey, normalized.runId)
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`
  await writeFile(tempPath, serializePersistedRun(normalized), {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  })
  try {
    // A hard link publishes the fully-written temp inode only when the target
    // does not exist. Unlike rename(), this cannot replace another owner that
    // won a destination race after our preflight check.
    await assertPublicationAllowed?.()
    await link(tempPath, targetPath)
  } finally {
    await unlink(tempPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function enqueueRunUpdate<T>(
  sessionKey: string,
  runId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${encodeSessionKey(sessionKey)}:${runId}`
  const previous = runUpdateQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(work)
  const marker = current.then(
    () => undefined,
    () => undefined,
  )
  runUpdateQueues.set(key, marker)
  try {
    return await current
  } finally {
    if (runUpdateQueues.get(key) === marker) {
      runUpdateQueues.delete(key)
    }
  }
}

export async function createPersistedRun(input: {
  runId: string
  providerRunId?: string
  sessionKey: string
  friendlyId?: string
  cardId?: string
  canonicalSegmentKey?: string
}): Promise<PersistedRunState> {
  assertSafeRunId(input.runId)
  if (input.providerRunId !== undefined) assertSafeRunId(input.providerRunId)
  const now = Date.now()
  const run: PersistedRunState = {
    runId: input.runId,
    ...(input.providerRunId ? { providerRunId: input.providerRunId } : {}),
    sessionKey: input.sessionKey,
    friendlyId: input.friendlyId || input.sessionKey,
    ...(input.cardId?.trim() ? { cardId: input.cardId.trim() } : {}),
    ...(input.canonicalSegmentKey?.trim()
      ? { canonicalSegmentKey: input.canonicalSegmentKey.trim() }
      : {}),
    status: 'accepted',
    createdAt: now,
    updatedAt: now,
    lastEventAt: now,
    assistantText: '',
    thinkingText: '',
    toolCalls: [],
    lifecycleEvents: [],
  }
  await writeRunExclusive(run)
  return run
}

export async function getPersistedRun(
  sessionKey: string,
  runId: string,
): Promise<PersistedRunState | null> {
  try {
    const raw = await readBoundedUtf8File(
      runPath(sessionKey, runId),
      MAX_PERSISTED_RUN_FILE_BYTES,
    )
    return normalizePersistedRun(JSON.parse(raw) as unknown, {
      runId,
      sessionKey,
    })
  } catch {
    return null
  }
}

export async function migratePersistedRun(
  fromSessionKey: string,
  toSessionKey: string,
  runId: string,
  friendlyId?: string,
  cardIdentity?: { cardId: string; canonicalSegmentKey: string },
): Promise<PersistedRunState | null> {
  const normalizedFrom = fromSessionKey.trim()
  const normalizedTo = toSessionKey.trim()
  if (!normalizedFrom || !normalizedTo || !isSafeRunId(runId)) return null
  const normalizedRunId = runId
  const normalizedFriendlyId = friendlyId?.trim() || normalizedTo
  const normalizedCardId = cardIdentity?.cardId.trim()
  const normalizedCanonicalSegmentKey = cardIdentity?.canonicalSegmentKey.trim()
  const isCardMigration = cardIdentity !== undefined
  if (
    isCardMigration &&
    (!normalizedCardId ||
      !normalizedCanonicalSegmentKey ||
      normalizedCanonicalSegmentKey !== normalizedTo ||
      normalizedFriendlyId !== normalizedCardId)
  ) {
    throw new Error(
      `Persisted run ${normalizedRunId} source owner does not match the requested Card migration`,
    )
  }

  const targetOwner: PersistedRunOwnerProjection = {
    runId: normalizedRunId,
    sessionKey: normalizedTo,
    friendlyId: normalizedFriendlyId,
    ...(isCardMigration
      ? {
          cardId: normalizedCardId,
          canonicalSegmentKey: normalizedCanonicalSegmentKey,
        }
      : {}),
  }

  if (normalizedFrom === normalizedTo) {
    const existing = await getPersistedRun(normalizedTo, normalizedRunId)
    if (!existing) return null
    if (!persistedRunMatchesOwner(existing, targetOwner)) {
      throw new Error(
        `Persisted run ${normalizedRunId} source owner does not match the requested migration`,
      )
    }
    return existing
  }

  return enqueueRunUpdate(normalizedFrom, normalizedRunId, async () =>
    withRunLocks(
      [
        { sessionKey: normalizedFrom, runId: normalizedRunId },
        { sessionKey: normalizedTo, runId: normalizedRunId },
      ],
      async (assertLocksOwned) => {
        const current = await getPersistedRun(normalizedFrom, normalizedRunId)
        const destination = await getPersistedRun(normalizedTo, normalizedRunId)
        if (!current) {
          if (!destination) return null
          if (!persistedRunMatchesOwner(destination, targetOwner)) {
            throw new Error(
              `Persisted run ${normalizedRunId} destination owner does not match the requested migration`,
            )
          }
          return destination
        }

        const sourceOwner: PersistedRunOwnerProjection = {
          runId: normalizedRunId,
          sessionKey: normalizedFrom,
          friendlyId: isCardMigration
            ? normalizedFriendlyId
            : current.friendlyId,
          ...(isCardMigration
            ? {
                cardId: normalizedCardId,
                canonicalSegmentKey: normalizedFrom,
              }
            : {}),
        }
        if (!persistedRunMatchesOwner(current, sourceOwner)) {
          throw new Error(
            `Persisted run ${normalizedRunId} source owner does not match the requested migration`,
          )
        }
        if (destination) {
          const detail = persistedRunMatchesOwner(destination, targetOwner)
            ? 'already exists'
            : 'does not match'
          throw new Error(
            `Persisted run ${normalizedRunId} destination owner ${detail} for the requested migration`,
          )
        }

        const migrated: PersistedRunState = {
          ...current,
          sessionKey: normalizedTo,
          friendlyId:
            normalizedFriendlyId || current.friendlyId || normalizedTo,
          ...(isCardMigration
            ? {
                cardId: normalizedCardId,
                canonicalSegmentKey: normalizedCanonicalSegmentKey,
              }
            : {}),
          updatedAt: Date.now(),
        }
        try {
          await writeRunExclusive(migrated, assertLocksOwned)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new Error(
              `Persisted run ${normalizedRunId} destination owner changed during migration`,
              { cause: error },
            )
          }
          throw error
        }
        try {
          await unlink(runPath(normalizedFrom, normalizedRunId))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            return migrated

          try {
            await unlink(runPath(normalizedTo, normalizedRunId))
          } catch (rollbackError) {
            if ((rollbackError as NodeJS.ErrnoException).code !== 'ENOENT') {
              const now = Date.now()
              try {
                await writeRun(
                  {
                    ...migrated,
                    status: 'error',
                    updatedAt: now,
                    lastEventAt: now,
                    errorMessage:
                      'Run migration failed; recover from the original session.',
                  },
                  assertLocksOwned,
                )
              } catch (terminalizationError) {
                throw new AggregateError(
                  [error, rollbackError, terminalizationError],
                  `Failed to remove persisted run ${normalizedRunId} from ${normalizedFrom}, roll back ${normalizedTo}, or terminalize the successor`,
                )
              }
              throw new AggregateError(
                [error, rollbackError],
                `Failed to remove persisted run ${normalizedRunId} from ${normalizedFrom} and roll back ${normalizedTo}`,
              )
            }
          }
          throw error
        }
        return migrated
      },
    ),
  )
}

export async function updatePersistedRun(
  sessionKey: string,
  runId: string,
  updater: (run: PersistedRunState) => PersistedRunState,
): Promise<PersistedRunState | null> {
  if (!isSafeRunId(runId)) return null
  return enqueueRunUpdate(sessionKey, runId, async () =>
    withRunLocks([{ sessionKey, runId }], async (assertLocksOwned) => {
      const current = await getPersistedRun(sessionKey, runId)
      if (!current) return null
      if (TERMINAL_RUN_STATUSES.has(current.status)) return current
      const next = updater(current)
      assertSameRunOwner(current, next)
      const stored = normalizePersistedRun({ ...next, updatedAt: Date.now() })
      if (!stored) throw new Error('Persisted run update is invalid')
      await writeRun(stored, assertLocksOwned)
      return stored
    }),
  )
}

export async function appendRunText(
  sessionKey: string,
  runId: string,
  text: string,
  options?: { replace?: boolean },
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    assistantText: options?.replace ? text : `${run.assistantText}${text}`,
  }))
}

type RunTextWriter = (
  text: string,
  options: { replace: boolean },
) => Promise<unknown>

export type RunTextPersistenceBuffer = {
  append: (text: string) => void
  replace: (text: string) => void
  flush: () => Promise<void>
  seal: () => Promise<void>
}

const RUN_TEXT_PERSIST_INTERVAL_MS = 500
const RUN_TEXT_SEAL_MAX_ATTEMPTS = 3
const RUN_TEXT_SEAL_RETRY_BASE_DELAY_MS = 25

type PendingRunTextBatch = { text: string; replace: boolean }

export function createRunTextPersistenceBuffer(
  write: RunTextWriter,
  intervalMs = RUN_TEXT_PERSIST_INTERVAL_MS,
): RunTextPersistenceBuffer {
  let pending: PendingRunTextBatch | null = null
  const queuedBatches: Array<PendingRunTextBatch> = []
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let writeQueue: Promise<void> | null = null
  let sealPromise: Promise<void> | null = null
  let sealed = false

  const clearFlushTimer = () => {
    if (!flushTimer) return
    clearTimeout(flushTimer)
    flushTimer = null
  }

  const queuePendingBatch = () => {
    if (!pending) return
    queuedBatches.push(pending)
    pending = null
  }

  const drainQueuedBatches = async (): Promise<void> => {
    try {
      while (queuedBatches.length > 0) {
        const batch = queuedBatches[0]
        if (!batch) break
        await write(batch.text, { replace: batch.replace })
        queuedBatches.shift()
      }
    } finally {
      writeQueue = null
    }
  }

  const flush = async (): Promise<void> => {
    clearFlushTimer()
    queuePendingBatch()
    if (!writeQueue && queuedBatches.length > 0) {
      writeQueue = drainQueuedBatches()
    }
    await writeQueue
  }

  const scheduleFlush = () => {
    if (flushTimer || sealed) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush().catch(() => undefined)
    }, intervalMs)
  }

  const append = (text: string) => {
    if (sealed) return
    if (pending) pending.text += text
    else pending = { text, replace: false }
    scheduleFlush()
  }

  const replace = (text: string) => {
    if (sealed) return
    pending = { text, replace: true }
    scheduleFlush()
  }

  const seal = (): Promise<void> => {
    sealed = true
    if (sealPromise) return sealPromise

    sealPromise = (async () => {
      for (let attempt = 1; attempt <= RUN_TEXT_SEAL_MAX_ATTEMPTS; attempt++) {
        try {
          await flush()
          return
        } catch (error) {
          if (attempt === RUN_TEXT_SEAL_MAX_ATTEMPTS) throw error
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              RUN_TEXT_SEAL_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
            ),
          )
        }
      }
    })()
    return sealPromise
  }

  return { append, replace, flush, seal }
}

export async function setRunThinking(
  sessionKey: string,
  runId: string,
  thinkingText: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status: 'active',
    lastEventAt: Date.now(),
    thinkingText,
  }))
}

export async function upsertRunToolCall(
  sessionKey: string,
  runId: string,
  toolCall: PersistedRunToolCall,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => {
    const incomingId = boundedExactIdentifier(
      toolCall.id,
      PERSISTED_TOOL_ID_MAX_BYTES,
    )
    const existingCalls = boundPersistedToolCalls(run.toolCalls)
    if (!incomingId) return { ...run, toolCalls: existingCalls }

    const existingIndex = existingCalls.findIndex(
      (existing) => existing.id === incomingId,
    )
    if (
      existingIndex < 0 &&
      existingCalls.length >= MAX_PERSISTED_RUN_TOOL_CALLS
    ) {
      return { ...run, toolCalls: existingCalls }
    }

    const candidate = sanitizePersistedToolCall({
      ...(existingIndex >= 0 ? existingCalls[existingIndex] : {}),
      ...toolCall,
      id: incomingId,
    } as PersistedRunToolCall)
    if (!candidate) return { ...run, toolCalls: existingCalls }

    const nextTools = [...existingCalls]
    if (existingIndex >= 0) nextTools[existingIndex] = candidate
    else nextTools.push(candidate)
    const toolCalls = boundPersistedToolCalls(nextTools, incomingId)
    return {
      ...run,
      status: 'active',
      lastEventAt: Date.now(),
      toolCalls,
    }
  })
}

export async function addRunLifecycleEvent(
  sessionKey: string,
  runId: string,
  event: PersistedRunLifecycleEvent,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    lastEventAt: Date.now(),
    lifecycleEvents: [...run.lifecycleEvents, event].slice(
      -MAX_PERSISTED_RUN_LIFECYCLE_EVENTS,
    ),
  }))
}

export async function markRunStatus(
  sessionKey: string,
  runId: string,
  status: PersistedRunState['status'],
  errorMessage?: string,
): Promise<PersistedRunState | null> {
  return updatePersistedRun(sessionKey, runId, (run) => ({
    ...run,
    status,
    lastEventAt: Date.now(),
    ...(errorMessage ? { errorMessage } : {}),
  }))
}

// A run that hasn't been touched in this long is considered orphaned (e.g.
// the agent process crashed, the network dropped silently, or the user
// navigated away during a `handoff` that never resolved). Treating these as
// "active" makes every chat re-open show a phantom "Thinking…" indicator
// until the 120s client-side failsafe clears it.
const STALE_RUN_THRESHOLD_MS = 5 * 60 * 1000

function decodeSessionDirectory(name: string): string | null {
  try {
    const decoded = decodeURIComponent(name)
    return encodeSessionKey(decoded) === name ? decoded : null
  } catch {
    return null
  }
}

type PersistedRunSessionDirectory = { path: string; sessionKey: string }

async function readSessionDirectories(
  budget: RunTreeReadBudget,
): Promise<Array<PersistedRunSessionDirectory>> {
  const sessionDirectories: Array<PersistedRunSessionDirectory> = []
  const directory = await opendir(RUNS_ROOT)
  for await (const entry of directory) {
    budget.directoryEntries += 1
    if (budget.directoryEntries > MAX_PERSISTED_RUN_DIRECTORY_ENTRIES) {
      budget.exceeded = true
      break
    }
    if (!entry.isDirectory()) continue
    const sessionKey = decodeSessionDirectory(entry.name)
    if (sessionKey === null) continue
    sessionDirectories.push({
      path: path.join(RUNS_ROOT, entry.name),
      sessionKey,
    })
  }
  sessionDirectories.sort((left, right) => left.path.localeCompare(right.path))
  return sessionDirectories
}

async function readRunsInDir(
  dir: string,
  expectedSessionKey: string,
  budget: RunTreeReadBudget,
): Promise<Array<PersistedRunState>> {
  const files: Array<string> = []
  const directory = await opendir(dir)
  for await (const entry of directory) {
    budget.fileEntries += 1
    if (budget.fileEntries > MAX_PERSISTED_RUN_FILE_ENTRIES) {
      budget.exceeded = true
      break
    }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    if (!isSafeRunId(entry.name.slice(0, -'.json'.length))) continue
    files.push(entry.name)
  }
  if (budget.exceeded || files.length === 0) return []
  files.sort()

  const runs: Array<PersistedRunState> = []
  for (const name of files) {
    try {
      const fileRunId = name.slice(0, -'.json'.length)
      const raw = await readBoundedUtf8File(
        path.join(dir, name),
        MAX_PERSISTED_RUN_FILE_BYTES,
        budget,
      )
      const run = normalizePersistedRun(JSON.parse(raw) as unknown, {
        runId: fileRunId,
        sessionKey: expectedSessionKey,
      })
      if (!run) continue
      // Completed/error records remain bounded by the directory, file, and byte
      // budgets above, but do not consume the active-recovery result budget.
      // Otherwise ordinary terminal history eventually disables every Card.
      if (run.status === 'complete' || run.status === 'error') continue
      budget.results += 1
      if (budget.results > MAX_PERSISTED_RUN_RESULTS) {
        budget.exceeded = true
        break
      }
      runs.push(run)
    } catch {
      if (budget.exceeded) break
    }
  }
  return runs
}

export async function getActiveRunForSession(
  sessionKey: string,
): Promise<PersistedRunState | null> {
  try {
    const budget = createRunTreeReadBudget()
    const runs = await readRunsInDir(sessionDir(sessionKey), sessionKey, budget)
    if (budget.exceeded) return null
    const now = Date.now()
    const candidates = runs
      .filter((run) => !['complete', 'error'].includes(run.status))
      .filter((run) => now - run.updatedAt < STALE_RUN_THRESHOLD_MS)
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt ||
          b.createdAt - a.createdAt ||
          a.runId.localeCompare(b.runId),
      )
    return candidates[0] ?? null
  } catch {
    return null
  }
}

export type CardScopedActiveRun = PersistedRunState & {
  recoverySourceCanonicalSegmentKey?: string
}

export async function getActiveRunForCard(
  cardId: string,
  canonicalSegmentKey: string,
): Promise<CardScopedActiveRun | null> {
  const normalizedCardId = cardId.trim()
  const normalizedCanonicalSegmentKey = canonicalSegmentKey.trim()
  if (!normalizedCardId || !normalizedCanonicalSegmentKey) return null
  try {
    const budget = createRunTreeReadBudget()
    const sessionDirectories = await readSessionDirectories(budget)
    if (budget.exceeded) return null
    const runs: Array<PersistedRunState> = []
    for (const session of sessionDirectories) {
      runs.push(
        ...(await readRunsInDir(session.path, session.sessionKey, budget)),
      )
      if (runTreeBudgetExceeded(budget)) return null
    }
    const now = Date.now()
    const candidates = runs
      .filter(
        (run) =>
          run.runId.length > 0 &&
          run.runId.trim() === run.runId &&
          run.sessionKey.length > 0 &&
          run.sessionKey.trim() === run.sessionKey &&
          run.canonicalSegmentKey?.length &&
          run.canonicalSegmentKey.trim() === run.canonicalSegmentKey &&
          persistedRunMatchesOwner(run, {
            runId: run.runId,
            sessionKey: run.sessionKey,
            friendlyId: normalizedCardId,
            cardId: normalizedCardId,
            canonicalSegmentKey: run.canonicalSegmentKey,
          }),
      )
      .filter((run) => !['complete', 'error'].includes(run.status))
      .filter((run) => now - run.updatedAt < STALE_RUN_THRESHOLD_MS)
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt ||
          b.createdAt - a.createdAt ||
          a.runId.localeCompare(b.runId),
      )

    const currentCanonicalRun = candidates.find(
      (run) => run.canonicalSegmentKey === normalizedCanonicalSegmentKey,
    )
    if (currentCanonicalRun) return currentCanonicalRun

    // A failed migration deliberately rolls back the successor clone, leaving
    // the source as the sole durable owner. The Card projection can already
    // have advanced by the time the browser reloads, so expose that one
    // unambiguous owner through the requested canonical identity while keeping
    // its physical sessionKey intact for subsequent recovery operations.
    if (candidates.length !== 1) return null
    const recoveryRun = candidates[0]
    const recoverySourceCanonicalSegmentKey =
      recoveryRun?.canonicalSegmentKey?.trim()
    if (
      !recoveryRun ||
      !recoverySourceCanonicalSegmentKey ||
      recoverySourceCanonicalSegmentKey === normalizedCanonicalSegmentKey
    ) {
      return null
    }
    return {
      ...recoveryRun,
      canonicalSegmentKey: normalizedCanonicalSegmentKey,
      recoverySourceCanonicalSegmentKey,
    }
  } catch {
    return null
  }
}

// Lists every non-complete/error run across all sessions, regardless of
// staleness. Powers the "Background runs" panel so users can inspect and
// abandon orphans that the staleness filter hides from the chat UI.
export async function listAllActiveRuns(): Promise<Array<PersistedRunState>> {
  try {
    const budget = createRunTreeReadBudget()
    const sessionDirectories = await readSessionDirectories(budget)
    if (budget.exceeded) return []
    const runs: Array<PersistedRunState> = []
    for (const session of sessionDirectories) {
      runs.push(
        ...(await readRunsInDir(session.path, session.sessionKey, budget)),
      )
      if (runTreeBudgetExceeded(budget)) return []
    }
    return runs
      .filter((run) => !['complete', 'error'].includes(run.status))
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt ||
          b.createdAt - a.createdAt ||
          a.sessionKey.localeCompare(b.sessionKey) ||
          a.runId.localeCompare(b.runId),
      )
  } catch {
    return []
  }
}
