import { execFile, execFileSync, spawn as nodeSpawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  buildSwarmTmuxLaunchCommand,
  buildTmuxBufferLoad,
  buildTmuxNewSessionArgs,
  buildTmuxSendKeysArgs,
  resolveSwarmTmuxBin,
} from './swarm-tmux-launch'
import { getStateDir } from './workspace-state-dir'

/**
 * Single server-side owner of Workspace worker processes.
 *
 * Before this module, three overlapping owners existed: the in-memory child
 * map in `swarm-lifecycle`, the tmux session started by `/api/swarm-tmux-start`,
 * and per-route ad hoc spawns. The in-memory map could not survive a server
 * restart, so a worker started before a reload became invisible and
 * unstoppable. The durable JSON registry below is the authority; live child
 * handles are only a best-effort cache used to write stdin.
 */

export type ProcessHostKind = 'native' | 'tmux'

export type WorkerProcessStatus = 'running' | 'stopped' | 'unknown'

export type WorkerProcessRecord = {
  workerId: string
  hostKind: ProcessHostKind
  pid: number | null
  sessionName: string | null
  cwd: string
  status: WorkerProcessStatus
  startedAt: number
  updatedAt: number
  lastError: string | null
}

export type WorkerProcessResult = {
  ok: boolean
  error?: string
  record?: WorkerProcessRecord
}

export type WorkerStartSpec = {
  workerId: string
  /** Executable path or name. Never a shell string. */
  command: string
  /** Argument vector. Never interpolated into a shell. */
  args: Array<string>
  cwd: string
  env?: Record<string, string>
}

type SpawnedChild = {
  pid?: number
  stdin?: { writable?: boolean; write: (chunk: string, cb?: (err?: Error | null) => void) => unknown } | null
  on?: (event: string, listener: (...values: Array<unknown>) => void) => unknown
  kill?: (signal?: string) => unknown
}

export type SpawnLike = (
  command: string,
  args: Array<string>,
  options: { cwd: string; env: Record<string, string | undefined>; detached: boolean; windowsHide: boolean; stdio: Array<string> },
) => SpawnedChild

export type CommandRunner = (
  command: string,
  args: Array<string>,
  options?: { stdin?: string; timeoutMs?: number },
) => Promise<{ ok: boolean; stdout: string; stderr: string }>

export type WorkerProcessHostDeps = {
  platform?: NodeJS.Platform
  registryFile?: string
  spawn?: SpawnLike
  runCommand?: CommandRunner
  hasTmux?: () => boolean
  tmuxBin?: string
  isPidAlive?: (pid: number) => boolean
  now?: () => number
}

type RegistryFile = {
  version: number
  workers: Record<string, WorkerProcessRecord>
}

const REGISTRY_VERSION = 1
const SAFE_ENV_KEYS = new Set(['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'TERM', 'COLORTERM', 'LANG', 'LC_ALL', 'NO_COLOR'])

export function buildSafeChildEnv(base: NodeJS.ProcessEnv, overrides: Record<string, string> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(base)) if (SAFE_ENV_KEYS.has(key)) env[key] = value
  for (const [key, value] of Object.entries(overrides)) {
    if (/(?:API_KEY|AUTH_TOKEN|OAUTH_TOKEN|OPENROUTER)/i.test(key)) continue
    env[key] = value
  }
  return env
}

export function defaultProcessRegistryFile(): string {
  return join(getStateDir(), 'worker-process-hosts.json')
}

function emptyRegistry(): RegistryFile {
  return { version: REGISTRY_VERSION, workers: {} }
}

function readRegistry(file: string): RegistryFile {
  if (!existsSync(file)) return emptyRegistry()
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RegistryFile>
  if (!parsed || typeof parsed !== 'object' || parsed.version !== REGISTRY_VERSION || typeof parsed.workers !== 'object' || parsed.workers === null || Array.isArray(parsed.workers)) {
    throw new Error('Worker process registry is corrupt or has an unsupported version')
  }
  const workers: Record<string, WorkerProcessRecord> = {}
  for (const [workerId, value] of Object.entries(parsed.workers)) {
    const record = normalizeRecord(workerId, value)
    if (!record) throw new Error(`Worker process registry contains an invalid record: ${workerId}`)
    workers[workerId] = record
  }
  return { version: REGISTRY_VERSION, workers }
}

function normalizeRecord(workerId: string, value: unknown): WorkerProcessRecord | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.workerId !== workerId || (raw.hostKind !== 'native' && raw.hostKind !== 'tmux') || (raw.status !== 'running' && raw.status !== 'stopped' && raw.status !== 'unknown')) return null
  if (raw.pid !== null && (typeof raw.pid !== 'number' || !Number.isInteger(raw.pid) || raw.pid <= 0)) return null
  if (raw.sessionName !== null && typeof raw.sessionName !== 'string') return null
  if (typeof raw.cwd !== 'string' || typeof raw.startedAt !== 'number' || !Number.isFinite(raw.startedAt) || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return null
  if (raw.lastError !== null && typeof raw.lastError !== 'string') return null
  return {
    workerId,
    hostKind: raw.hostKind,
    pid: raw.pid,
    sessionName: raw.sessionName,
    cwd: raw.cwd,
    status: raw.status,
    startedAt: raw.startedAt,
    updatedAt: raw.updatedAt,
    lastError: raw.lastError,
  }
}

function writeRegistry(file: string, registry: RegistryFile): void {
  const dir = dirname(file)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const lock = `${file}.lock`
  const deadline = Date.now() + 5_000
  let lockFd: number | null = null
  while (lockFd === null) {
    try { lockFd = openSync(lock, 'wx') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= deadline) throw new Error('Worker process registry is locked by another Workspace process')
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  try {
    const current = readRegistry(file)
    const workers = { ...current.workers }
    for (const [workerId, incoming] of Object.entries(registry.workers)) {
      const prior = workers[workerId]
      if (!prior || incoming.updatedAt >= prior.updatedAt) workers[workerId] = incoming
    }
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`
    writeFileSync(temp, `${JSON.stringify({ version: REGISTRY_VERSION, workers }, null, 2)}\n`, 'utf8')
    renameSync(temp, file)
  } finally {
    closeSync(lockFd)
    try { unlinkSync(lock) } catch { /* best effort */ }
  }
}

function defaultRunCommand(): CommandRunner {
  return (command, args, options) =>
    new Promise((resolve) => {
      const child = execFile(
        command,
        args,
        { timeout: options?.timeoutMs ?? 8_000 },
        (error, stdout, stderr) => {
          resolve({
            ok: !error,
            stdout: stdout?.toString() ?? '',
            stderr: stderr?.toString() ?? (error ? error.message : ''),
          })
        },
      )
      child.on('error', (error) => {
        resolve({ ok: false, stdout: '', stderr: error.message })
      })
      if (options?.stdin !== undefined) child.stdin?.end(options.stdin)
    })
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but is owned by another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function tmuxSessionNameForWorker(workerId: string): string {
  return `swarm-${workerId}`
}

export interface WorkerProcessHost {
  readonly hostKind: ProcessHostKind
  start(spec: WorkerStartSpec): Promise<WorkerProcessResult>
  stop(workerId: string): Promise<WorkerProcessResult>
  send(workerId: string, text: string): Promise<WorkerProcessResult>
  capture(workerId: string, options?: { lines?: number }): Promise<{ ok: boolean; output: string; error?: string }>
  status(workerId: string): Promise<WorkerProcessRecord>
  list(): Promise<Array<WorkerProcessRecord>>
  recover(): Promise<Array<WorkerProcessRecord>>
}

// Live child handles for the current server process only. Keyed by
// `${registryFile}::${workerId}` so parallel tests with distinct registries do
// not collide.
const liveChildren = new Map<string, SpawnedChild>()

export function createWorkerProcessHost(deps: WorkerProcessHostDeps = {}): WorkerProcessHost {
  const platform = deps.platform ?? process.platform
  const registryFile = deps.registryFile ?? defaultProcessRegistryFile()
  const now = deps.now ?? (() => Date.now())
  const runCommand = deps.runCommand ?? defaultRunCommand()
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive
  const spawnProcess: SpawnLike =
    deps.spawn ?? ((command, args, options) => nodeSpawn(command, args, options as never) as SpawnedChild)

  const hasTmux =
    deps.hasTmux ??
    (() => {
      try {
        execFileSync(tmuxBin(), ['-V'], { stdio: 'ignore' })
        return true
      } catch {
        // `list-sessions` exits non-zero when tmux is installed but idle; treat
        // "command missing" (ENOENT) as the only real negative.
        return false
      }
    })

  function tmuxBin(): string {
    return deps.tmuxBin ?? resolveSwarmTmuxBin({ platform })
  }

  // Preserve the existing lifecycle policy: native child processes are the
  // only supported Windows host. On Unix, prefer tmux when available.
  const hostKind: ProcessHostKind = platform !== 'win32' && hasTmux() ? 'tmux' : 'native'

  function childKey(workerId: string): string {
    return `${registryFile}::${workerId}`
  }

  function readAll(): RegistryFile {
    return readRegistry(registryFile)
  }

  function persist(record: WorkerProcessRecord): WorkerProcessRecord {
    const registry = readAll()
    registry.workers[record.workerId] = record
    writeRegistry(registryFile, registry)
    return record
  }

  function unknownRecord(workerId: string): WorkerProcessRecord {
    return {
      workerId,
      hostKind,
      pid: null,
      sessionName: null,
      cwd: '',
      status: 'unknown',
      startedAt: 0,
      updatedAt: 0,
      lastError: null,
    }
  }

  async function startNative(spec: WorkerStartSpec): Promise<WorkerProcessResult> {
    const child = spawnProcess(spec.command, spec.args, {
      cwd: spec.cwd,
      env: buildSafeChildEnv(process.env, spec.env),
      detached: platform === 'win32',
      windowsHide: platform === 'win32',
      stdio: ['pipe', 'ignore', 'ignore'],
    })
    if (!child.pid) {
      return { ok: false, error: `Failed to spawn worker process for ${spec.workerId}` }
    }
    liveChildren.set(childKey(spec.workerId), child)
    child.on?.('exit', () => {
      if (liveChildren.get(childKey(spec.workerId)) === child) liveChildren.delete(childKey(spec.workerId))
      markExited(spec.workerId, child.pid!)
    })
    const timestamp = now()
    const record = persist({
      workerId: spec.workerId,
      hostKind: 'native',
      pid: child.pid,
      sessionName: null,
      cwd: spec.cwd,
      status: 'running',
      startedAt: timestamp,
      updatedAt: timestamp,
      lastError: null,
    })
    return { ok: true, record }
  }

  function markExited(workerId: string, expectedPid: number): void {
    try {
      const registry = readAll()
      const existing = registry.workers[workerId]
      if (!existing || existing.pid !== expectedPid) return
      registry.workers[workerId] = { ...existing, status: 'stopped', pid: null, updatedAt: now() }
      writeRegistry(registryFile, registry)
    } catch {
      // Registry writes are best-effort on process teardown.
    }
  }

  async function startTmux(spec: WorkerStartSpec): Promise<WorkerProcessResult> {
    const sessionName = tmuxSessionNameForWorker(spec.workerId)
    const bin = tmuxBin()
    const existing = await runCommand(bin, ['has-session', '-t', sessionName])
    if (!existing.ok) {
      const created = await runCommand(
        bin,
        buildTmuxNewSessionArgs({ sessionName, cwd: spec.cwd, platform }),
      )
      if (!created.ok) {
        return { ok: false, error: created.stderr.trim() || 'tmux new-session failed' }
      }
      const launchCommand = buildSwarmTmuxLaunchCommand({
        profilePath: spec.env?.HERMES_HOME ?? spec.cwd,
        cwd: spec.cwd,
        hermesBin: spec.env?.HERMES_CLI_BIN ?? spec.command,
        platform,
        keepShellAlive: true,
      })
      const launched = await runCommand(
        bin,
        buildTmuxSendKeysArgs(sessionName, launchCommand),
      )
      if (!launched.ok) {
        await runCommand(bin, ['kill-session', '-t', sessionName])
        return { ok: false, error: launched.stderr.trim() || 'tmux worker launch failed' }
      }
    }
    const timestamp = now()
    const record = persist({
      workerId: spec.workerId,
      hostKind: 'tmux',
      pid: null,
      sessionName,
      cwd: spec.cwd,
      status: 'running',
      startedAt: timestamp,
      updatedAt: timestamp,
      lastError: null,
    })
    return { ok: true, record }
  }

  return {
    hostKind,

    async start(spec) {
      const lockFile = `${registryFile}.${Buffer.from(spec.workerId).toString('base64url')}.start.lock`
      let lockFd: number
      try { lockFd = openSync(lockFile, 'wx') } catch {
        return { ok: false, error: `Worker ${spec.workerId} start is already owned by another Workspace process` }
      }
      try {
        const current = readAll().workers[spec.workerId]
        if (current?.status === 'running' || current?.status === 'unknown') {
          return { ok: false, error: `Worker ${spec.workerId} already has an active process`, record: current }
        }
        return hostKind === 'tmux' ? await startTmux(spec) : await startNative(spec)
      } finally {
        closeSync(lockFd)
        try { unlinkSync(lockFile) } catch { /* a leftover lock fails closed */ }
      }
    },

    async stop(workerId) {
      const record = readAll().workers[workerId]
      if (!record) return { ok: false, error: `Worker ${workerId} is not registered` }
      if (record.hostKind === 'tmux') {
        const killed = await runCommand(tmuxBin(), ['kill-session', '-t', record.sessionName ?? tmuxSessionNameForWorker(workerId)])
        if (!killed.ok) return { ok: false, error: killed.stderr.trim() || 'tmux kill-session failed', record }
        const stopped = persist({ ...record, status: 'stopped', pid: null, updatedAt: now() })
        return { ok: true, record: stopped }
      }
      const child = liveChildren.get(childKey(workerId))
      if (!child) {
        if (record.pid && isPidAlive(record.pid)) return { ok: false, error: 'Recovered native PID ownership cannot be verified; refusing possible PID reuse', record }
        return { ok: true, record: persist({ ...record, status: 'stopped', pid: null, updatedAt: now() }) }
      }
      if (platform === 'win32' && record.pid) {
        const tree = await runCommand('taskkill.exe', ['/PID', String(record.pid), '/T', '/F'])
        if (!tree.ok) return { ok: false, error: 'Windows worker process tree termination failed', record }
      } else {
        const signalled = child.kill?.('SIGTERM')
        if (signalled === false) return { ok: false, error: 'Native worker rejected termination', record }
      }
      for (let attempt = 0; attempt < 40 && record.pid && isPidAlive(record.pid); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50))
      if (record.pid && isPidAlive(record.pid)) return { ok: false, error: 'Worker process tree did not exit; restart refused', record }
      liveChildren.delete(childKey(workerId))
      return { ok: true, record: persist({ ...record, status: 'stopped', pid: null, updatedAt: now(), lastError: null }) }
    },

    async send(workerId, text) {
      const record = readAll().workers[workerId]
      if (!record || record.status !== 'running') {
        return { ok: false, error: `Worker ${workerId} is not running` }
      }
      if (record.hostKind === 'tmux') {
        const bin = tmuxBin()
        const sessionName = record.sessionName ?? tmuxSessionNameForWorker(workerId)
        const bufferName = `worker-host-${workerId}`
        const buffer = buildTmuxBufferLoad({ bufferName, content: text, platform })
        const loaded = await runCommand(bin, buffer.args, { stdin: buffer.stdin })
        if (!loaded.ok) return { ok: false, error: loaded.stderr.trim() || 'tmux buffer load failed' }
        const pasted = await runCommand(bin, ['paste-buffer', '-d', '-b', bufferName, '-t', sessionName])
        if (!pasted.ok) return { ok: false, error: pasted.stderr.trim() || 'tmux paste-buffer failed' }
        const entered = await runCommand(bin, ['send-keys', '-t', sessionName, 'Enter'])
        if (!entered.ok) return { ok: false, error: entered.stderr.trim() || 'tmux send-keys failed' }
        return { ok: true, record }
      }
      const child = liveChildren.get(childKey(workerId))
      if (!child?.stdin?.writable) {
        return {
          ok: false,
          error: `Worker ${workerId} has no writable stdin in this server process; restart the worker to reattach`,
        }
      }
      return new Promise<WorkerProcessResult>((resolve) => {
        child.stdin?.write(`${text}\n`, (error) => {
          if (error) resolve({ ok: false, error: error.message })
          else resolve({ ok: true, record })
        })
      })
    },

    async capture(workerId, options) {
      const record = readAll().workers[workerId]
      if (!record) return { ok: false, output: '', error: `Worker ${workerId} is not registered` }
      if (record.hostKind !== 'tmux') {
        return { ok: false, output: '', error: 'capture requires a tmux-hosted worker' }
      }
      const lines = Math.min(Math.max(options?.lines ?? 200, 1), 5_000)
      const result = await runCommand(tmuxBin(), [
        'capture-pane',
        '-p',
        '-t',
        record.sessionName ?? tmuxSessionNameForWorker(workerId),
        '-S',
        `-${lines}`,
      ])
      if (!result.ok) return { ok: false, output: '', error: result.stderr.trim() || 'tmux capture-pane failed' }
      return { ok: true, output: result.stdout }
    },

    async status(workerId) {
      return readAll().workers[workerId] ?? unknownRecord(workerId)
    },

    async list() {
      return Object.values(readAll().workers).sort((a, b) => a.workerId.localeCompare(b.workerId))
    },

    async recover() {
      const registry = readAll()
      const reconciled: Array<WorkerProcessRecord> = []
      for (const record of Object.values(registry.workers)) {
        if (record.status !== 'running') {
          reconciled.push(record)
          continue
        }
        let alive: boolean
        if (record.hostKind === 'tmux') {
          const probe = await runCommand(tmuxBin(), [
            'has-session',
            '-t',
            record.sessionName ?? tmuxSessionNameForWorker(record.workerId),
          ])
          alive = probe.ok
        } else {
          alive = record.pid !== null && isPidAlive(record.pid)
        }
        const next: WorkerProcessRecord = alive
          ? (record.hostKind === 'native' ? { ...record, status: 'unknown', updatedAt: now(), lastError: 'Recovered PID ownership is unverified; manual reconciliation required' } : record)
          : { ...record, status: 'stopped', pid: null, updatedAt: now(), lastError: 'process not found during recovery' }
        registry.workers[record.workerId] = next
        reconciled.push(next)
      }
      writeRegistry(registryFile, registry)
      return reconciled.sort((a, b) => a.workerId.localeCompare(b.workerId))
    },
  }
}

let singletonHost: WorkerProcessHost | null = null

/** Process-wide host. Routes and lifecycle helpers must share this authority. */
export function getWorkerProcessHost(): WorkerProcessHost {
  singletonHost ??= createWorkerProcessHost()
  return singletonHost
}

/** Test-only seam for integration tests; production callers should not replace it. */
export function setWorkerProcessHostForTests(host: WorkerProcessHost | null): void {
  singletonHost = host
}
