import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'

export type RuntimeKind = 'hermes_profile' | 'claude_session' | 'codex_thread'
export type CapabilityState = 'supported' | 'degraded' | 'experimental' | 'unsupported'
export type RuntimeOperation = 'create' | 'resume' | 'fork' | 'send' | 'steer' | 'interrupt' | 'status' | 'list' | 'archive' | 'attach' | 'discoverPeers' | 'crossSessionMessage'
export type RuntimeCapability = { state: CapabilityState; explanation: string; deferred?: boolean }
export type RuntimeCapabilities = Record<RuntimeOperation, RuntimeCapability>
export type RuntimeLeaseMetadata = {
  owner: string
  expiresAt: number
  acquiredAt: number
  processId?: number
  abandoned?: boolean
}

export type ProviderRuntimeRecord = {
  runtimeId: string
  kind: RuntimeKind
  routeRef: string | null
  accountAlias: string
  externalId: string
  model?: string | null
  cwd: string | null
  worktree: string | null
  hostKind: 'native' | 'tmux' | 'stdio' | 'external' | 'unknown'
  hostStatus: 'running' | 'stopped' | 'idle' | 'unknown'
  capabilities: RuntimeCapabilities
  lease: RuntimeLeaseMetadata | null
  parentRuntimeId: string | null
  kanbanTaskId: string | null
  createdAt: number
  updatedAt: number
}

const operations: Array<RuntimeOperation> = ['create', 'resume', 'fork', 'send', 'steer', 'interrupt', 'status', 'list', 'archive', 'attach', 'discoverPeers', 'crossSessionMessage']
const unsupportedMessaging: RuntimeCapability = { state: 'unsupported', explanation: 'Deferred until provider-native stability is proven.', deferred: true }
const PROVIDER_CHILD_ENV_KEYS = new Set(['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'NO_COLOR'])

export function capabilityMatrix(kind: RuntimeKind, platform: NodeJS.Platform = process.platform): RuntimeCapabilities {
  const result = Object.fromEntries(operations.map((operation) => [operation, { state: 'unsupported', explanation: 'Not exposed by this runtime adapter.' }])) as RuntimeCapabilities
  result.status = { state: 'supported', explanation: 'Read-only metadata status is available.' }
  result.list = { state: 'supported', explanation: 'Read-only inventory is available.' }
  result.crossSessionMessage = unsupportedMessaging
  if (kind === 'hermes_profile') {
    for (const operation of ['create', 'resume', 'send', 'interrupt', 'attach'] as const) result[operation] = { state: 'supported', explanation: 'Owned by the Hermes worker process host.' }
    result.fork = { state: 'degraded', explanation: 'Forking uses a new Hermes profile rather than provider-native state.' }
  } else if (kind === 'codex_thread') {
    for (const operation of ['resume', 'fork', 'archive'] as const) result[operation] = { state: 'experimental', explanation: 'Schema-verified through a bounded local app-server request; prompts and remote transport are not used.' }
    for (const operation of ['steer', 'interrupt'] as const) result[operation] = { state: 'unsupported', explanation: 'Disabled until Workspace owns one persistent app-server connection for the active turn.' }
    result.create = { state: 'unsupported', explanation: 'Select model.openai_runtime=codex_app_server for the next Hermes profile restart.' }
    result.attach = { state: 'degraded', explanation: 'Attach exposes metadata; Hermes does not take over the provider tool loop.' }
  } else {
    for (const operation of ['create', 'resume', 'attach'] as const) result[operation] = { state: 'experimental', explanation: 'Available through an isolated Claude CLI process.' }
    result.fork = { state: 'unsupported', explanation: 'Disabled until the new fork UUID can be captured and registered distinctly.' }
    result.interrupt = { state: 'unsupported', explanation: 'No verified graceful interrupt channel is owned by Workspace.' }
    result.send = { state: 'degraded', explanation: 'Input is available only while Workspace owns the child stdin.' }
    result.archive = { state: 'degraded', explanation: 'Archive is represented as stopped metadata.' }
    result.discoverPeers = platform === 'win32'
      ? { state: 'unsupported', explanation: 'Claude ListAgents is not claimed on Windows.' }
      : { state: 'experimental', explanation: 'Discovery is read-only and fixture-tested.' }
  }
  return result
}

function atomicWrite(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, path)
}

function safeRecord(value: ProviderRuntimeRecord): ProviderRuntimeRecord {
  return {
    runtimeId: value.runtimeId, kind: value.kind, routeRef: value.routeRef, accountAlias: value.accountAlias,
    externalId: value.externalId, model: value.model ?? null, cwd: value.cwd, worktree: value.worktree, hostKind: value.hostKind,
    hostStatus: value.hostStatus, capabilities: value.capabilities, lease: value.lease,
    parentRuntimeId: value.parentRuntimeId, kanbanTaskId: value.kanbanTaskId,
    createdAt: value.createdAt, updatedAt: value.updatedAt,
  }
}

export class ProviderRuntimeRegistry {
  constructor(private readonly file: string) {}
  list(): Array<ProviderRuntimeRecord> {
    if (!existsSync(this.file)) return []
    const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { version?: unknown; runtimes?: unknown }
    if (parsed.version !== 1 || !Array.isArray(parsed.runtimes)) throw new Error('Provider runtime registry is corrupt or unsupported')
    return (parsed.runtimes as Array<ProviderRuntimeRecord>).map(safeRecord).sort((a, b) => a.runtimeId.localeCompare(b.runtimeId))
  }
  get(runtimeId: string): ProviderRuntimeRecord | null { return this.list().find((entry) => entry.runtimeId === runtimeId) ?? null }
  private locked<T>(operation: () => T): T {
    mkdirSync(dirname(this.file), { recursive: true })
    const lock = `${this.file}.lock`
    let fd: number
    try { fd = openSync(lock, 'wx') } catch { throw new Error('Provider runtime registry is busy; refusing an unlocked write') }
    try { return operation() } finally { closeSync(fd); try { unlinkSync(lock) } catch { /* leftover lock fails closed */ } }
  }
  replace(records: Array<ProviderRuntimeRecord>): void {
    this.locked(() => atomicWrite(this.file, { version: 1, runtimes: records.map(safeRecord) }))
  }
  upsert(record: ProviderRuntimeRecord): void { this.merge([record]) }
  insertIfAbsent(record: ProviderRuntimeRecord): boolean {
    return this.locked(() => {
      const current = this.list()
      if (current.some((entry) => entry.runtimeId === record.runtimeId)) return false
      atomicWrite(this.file, { version: 1, runtimes: [...current, safeRecord(record)] })
      return true
    })
  }
  merge(records: Array<ProviderRuntimeRecord>): void {
    this.locked(() => {
      const byId = new Map(this.list().map((entry) => [entry.runtimeId, entry]))
      for (const record of records) byId.set(record.runtimeId, safeRecord(record))
      atomicWrite(this.file, { version: 1, runtimes: [...byId.values()].map(safeRecord) })
    })
  }
}

function leaseFile(root: string, identity: string): string {
  const encoded = Buffer.from(identity, 'utf8').toString('base64url')
  if (!identity || encoded.length > 180) throw new Error('Invalid runtime identity')
  return join(root, `${encoded}.lease.json`)
}

export class DurableRuntimeLeases {
  constructor(private readonly root: string, private readonly now: () => number = () => Date.now()) {}
  get(identity: string): RuntimeLeaseMetadata | null {
    try { return JSON.parse(readFileSync(leaseFile(this.root, identity), 'utf8')) as RuntimeLeaseMetadata } catch { return null }
  }
  acquire(identity: string, owner: string, ttlMs: number): { ok: boolean; lease?: RuntimeLeaseMetadata; staleTakeover?: boolean; error?: string } {
    if (!owner || !Number.isFinite(ttlMs) || ttlMs <= 0) return { ok: false, error: 'Invalid lease request' }
    mkdirSync(this.root, { recursive: true })
    const file = leaseFile(this.root, identity)
    const current = this.get(identity)
    if (current) {
      if (current.expiresAt > this.now()) return { ok: false, lease: current, error: 'Runtime already has a writer' }
      return { ok: false, lease: current, error: 'Expired lease requires explicit operator recovery; automatic takeover is disabled' }
    }
    const lease = { owner, acquiredAt: this.now(), expiresAt: this.now() + ttlMs, processId: process.pid }
    try {
      const fd = openSync(file, 'wx')
      try { writeFileSync(fd, `${JSON.stringify(lease)}\n`, 'utf8') } finally { closeSync(fd) }
      return { ok: true, lease, staleTakeover: false }
    } catch { return { ok: false, error: 'Runtime already has a writer' } }
  }
  renew(identity: string, owner: string, ttlMs: number): { ok: boolean; lease?: RuntimeLeaseMetadata; error?: string } {
    const releaseLock = this.lockIdentity(identity)
    try {
      const current = this.get(identity)
      if (!current || current.owner !== owner) return { ok: false, error: 'Foreign lease' }
      const lease = { ...current, expiresAt: this.now() + ttlMs }
      atomicWrite(leaseFile(this.root, identity), lease)
      return { ok: true, lease }
    } finally { releaseLock() }
  }
  release(identity: string, owner: string): boolean {
    const releaseLock = this.lockIdentity(identity)
    try {
      const current = this.get(identity)
      if (!current || current.owner !== owner) return false
      try { unlinkSync(leaseFile(this.root, identity)); return true } catch { return false }
    } finally { releaseLock() }
  }
  recoverExpired(identity: string): { ok: boolean; error?: string } {
    const releaseLock = this.lockIdentity(identity)
    try {
      const current = this.get(identity)
      if (!current) return { ok: true }
      if (current.expiresAt > this.now()) return { ok: false, error: 'Active lease cannot be recovered' }
      if (current.processId && isProcessAlive(current.processId)) return { ok: false, error: 'Expired timestamp belongs to a live Workspace owner; recovery refused' }
      try { unlinkSync(leaseFile(this.root, identity)); return { ok: true } } catch { return { ok: false, error: 'Expired lease recovery failed' } }
    } finally { releaseLock() }
  }
  abandon(identity: string, owner: string, ttlMs = 30_000): boolean {
    const releaseLock = this.lockIdentity(identity)
    try {
      const current = this.get(identity)
      if (!current || current.owner !== owner) return false
      atomicWrite(leaseFile(this.root, identity), { ...current, abandoned: true, processId: undefined, expiresAt: this.now() + ttlMs })
      return true
    } finally { releaseLock() }
  }
  private lockIdentity(identity: string): () => void {
    mkdirSync(this.root, { recursive: true })
    const path = `${leaseFile(this.root, identity)}.lock`
    let fd: number
    try { fd = openSync(path, 'wx') } catch { throw new Error('Runtime lease is busy') }
    return () => { closeSync(fd); try { unlinkSync(path) } catch { /* fail closed on the next mutation */ } }
  }
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

type NormalizeOptions = { accountAlias: string; routeRef: string | null; now?: number; platform?: NodeJS.Platform }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function status(value: unknown): ProviderRuntimeRecord['hostStatus'] { return value === 'active' || value === 'running' ? 'running' : value === 'stopped' ? 'stopped' : value === 'idle' ? 'idle' : 'unknown' }

export function normalizeClaudeAgents(input: unknown, options: NormalizeOptions): Array<ProviderRuntimeRecord> {
  if (!Array.isArray(input)) return []
  const now = options.now ?? Date.now()
  return input.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>; const id = text(raw.id) ?? text(raw.session_id) ?? text(raw.sessionId)
    if (!id) return []
    return [{ runtimeId: `claude:${options.accountAlias}:${id}`, kind: 'claude_session' as const, routeRef: options.routeRef, accountAlias: options.accountAlias,
      externalId: id, model: text(raw.model), cwd: text(raw.cwd), worktree: text(raw.worktree) ?? text(raw.cwd), hostKind: 'external' as const,
      hostStatus: status(raw.status), capabilities: capabilityMatrix('claude_session', options.platform), lease: null,
      parentRuntimeId: text(raw.parentRuntimeId), kanbanTaskId: text(raw.kanbanTaskId), createdAt: Number(raw.createdAt) || now, updatedAt: now }]
  })
}

export function normalizeCodexThreads(input: unknown, options: NormalizeOptions): Array<ProviderRuntimeRecord> {
  const rows = Array.isArray(input) ? input : (input && typeof input === 'object' && Array.isArray((input as { data?: unknown }).data) ? (input as { data: Array<unknown> }).data : [])
  const now = options.now ?? Date.now()
  return rows.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const raw = item as Record<string, unknown>; const id = text(raw.id) ?? text(raw.threadId)
    if (!id) return []
    return [{ runtimeId: `codex:${id}`, kind: 'codex_thread' as const, routeRef: options.routeRef, accountAlias: options.accountAlias,
      externalId: id, model: text(raw.model), cwd: text(raw.cwd), worktree: text(raw.worktree) ?? text(raw.cwd), hostKind: 'stdio' as const,
      hostStatus: status(raw.status), capabilities: capabilityMatrix('codex_thread'), lease: null,
      parentRuntimeId: text(raw.parentRuntimeId), kanbanTaskId: text(raw.kanbanTaskId), createdAt: Number(raw.createdAt) || now, updatedAt: now }]
  })
}

export type CodexRuntimeSelection = 'hermes_default' | 'codex_app_server'
export function normalizeCodexRuntimeSelection(value: unknown): { configured: string; effective: CodexRuntimeSelection; known: boolean } {
  if (value === undefined || value === null || value === '') return { configured: 'hermes_default', effective: 'hermes_default', known: true }
  if (value === 'hermes_default' || value === 'codex_app_server') return { configured: value, effective: value, known: true }
  return { configured: String(value), effective: 'hermes_default', known: false }
}

export type CodexInvoke = (method: string, params: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error?: string }>

export async function importClaudeAgents(input: {
  run: ClaudeRun
  registry: ProviderRuntimeRegistry
  accountAlias: string
  routeRef: string | null
  home: string
  platform?: NodeJS.Platform
}): Promise<{ ok: boolean; count: number; error?: string }> {
  const env: Record<string, string | undefined> = { ...process.env, HOME: input.home, USERPROFILE: input.home }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  const result = await input.run({ command: 'claude', args: ['agents', '--json', '--all'], cwd: input.home, env })
  if (!result.ok) return { ok: false, count: 0, error: result.stderr.slice(0, 2_000) }
  try {
    const records = normalizeClaudeAgents(JSON.parse(result.stdout), input)
    input.registry.merge(records)
    return { ok: true, count: records.length }
  } catch { return { ok: false, count: 0, error: 'Claude discovery returned invalid JSON' } }
}

export async function importCodexThreads(input: {
  invoke: CodexInvoke
  registry: ProviderRuntimeRegistry
  accountAlias: string
  routeRef: string | null
}): Promise<{ ok: boolean; count: number; error?: string }> {
  const result = await input.invoke('thread/list', { limit: 20 })
  if (!result.ok) return { ok: false, count: 0, error: result.error?.slice(0, 2_000) }
  const records = normalizeCodexThreads(result.result, input)
  input.registry.merge(records)
  return { ok: true, count: records.length }
}

export class CodexRuntimeAdapter {
  constructor(private readonly deps: { invoke: CodexInvoke; leases: DurableRuntimeLeases; ownerToken: string; ttlMs?: number }) {}
  list() { return this.deps.invoke('thread/list', {}) }
  status(threadId: string) { return this.deps.invoke('thread/read', { threadId, includeTurns: false }) }
  async mutate(runtimeId: string, action: 'resume' | 'fork' | 'steer' | 'interrupt' | 'archive', input: Record<string, unknown>) {
    if (capabilityMatrix('codex_thread')[action].state === 'unsupported') return { ok: false, error: capabilityMatrix('codex_thread')[action].explanation }
    const threadId = runtimeId.startsWith('codex:') ? runtimeId.slice(6) : ''
    if (!threadId || threadId.length > 256) return { ok: false, error: 'Invalid Codex runtime ID' }
    let method: string
    let params: Record<string, unknown>
    if (action === 'steer') {
      const turnId = text(input.turnId)
      const message = text(input.text)
      if (!turnId || !message || message.length > 32_000) return { ok: false, error: 'Codex steer requires a bounded active turn and text' }
      method = 'turn/steer'
      params = { threadId, expectedTurnId: turnId, input: [{ type: 'text', text: message, text_elements: [] }] }
    } else if (action === 'interrupt') {
      const turnId = text(input.turnId)
      if (!turnId) return { ok: false, error: 'Codex interrupt requires an active turn ID' }
      method = 'turn/interrupt'
      params = { threadId, turnId }
    } else {
      method = { resume: 'thread/resume', fork: 'thread/fork', archive: 'thread/archive' }[action]
      const model = text(input.providerModel)
      params = action === 'archive' || !model ? { threadId } : { threadId, model }
    }
    const acquired = this.deps.leases.acquire(runtimeId, this.deps.ownerToken, this.deps.ttlMs ?? 30_000)
    if (!acquired.ok) return acquired
    let releaseLease = true
    try {
      const result = await this.deps.invoke(method, params)
      if (result.ok && action === 'fork' && typeof input.onForkCreated === 'function') {
        try { await (input.onForkCreated as (result: unknown) => unknown)(result.result) } catch {
          releaseLease = false
          this.deps.leases.abandon(runtimeId, this.deps.ownerToken)
          return { ok: false, error: 'Codex fork succeeded but durable registration failed; lease retained for explicit recovery' }
        }
      }
      return result
    } finally {
      if (releaseLease) this.deps.leases.release(runtimeId, this.deps.ownerToken)
    }
  }
}

export type ClaudeRun = (input: { command: string; args: Array<string>; cwd: string; env: Record<string, string | undefined>; stdin?: string }) => Promise<{ ok: boolean; stdout: string; stderr: string }>
export class ClaudeRuntimeAdapter {
  constructor(private readonly deps: { run: ClaudeRun; leases: DurableRuntimeLeases; ownerToken: string; accountHomes: Record<string, string>; baseEnv?: Record<string, string | undefined>; claudeBin?: string; uuid?: () => string }) {}
  private env(alias: string) {
    const home = this.deps.accountHomes[alias]
    if (!home) return null
    const source = this.deps.baseEnv ?? process.env
    const env: Record<string, string | undefined> = { HOME: home, USERPROFILE: home }
    for (const [key, value] of Object.entries(source)) if (PROVIDER_CHILD_ENV_KEYS.has(key)) env[key] = value
    return env
  }
  async list(accountAlias: string) {
    const env = this.env(accountAlias); if (!env) return { ok: false, error: 'Account alias is not allowlisted' }
    return this.deps.run({ command: this.deps.claudeBin ?? 'claude', args: ['agents', '--json', '--all'], cwd: env.HOME ?? '.', env })
  }
  async create(input: { accountAlias: string; cwd: string; prompt: string; model: string; background?: boolean; sessionId?: string; onCreated?: (sessionId: string, runtimeId: string) => void }) {
    if (input.background) return { ok: false, error: 'Background launch requires durable process ownership and is not enabled' }
    const env = this.env(input.accountAlias); if (!env) return { ok: false, error: 'Account alias is not allowlisted' }
    if (!input.cwd || input.cwd.length > 1024 || !input.prompt || input.prompt.length > 32_000 || !input.model || input.model.length > 200) return { ok: false, error: 'Invalid Claude request' }
    const sessionId = input.sessionId ?? (this.deps.uuid ?? randomUUID)()
    const identity = `claude:${input.accountAlias}:${sessionId}`
    const acquired = this.deps.leases.acquire(identity, this.deps.ownerToken, 30_000); if (!acquired.ok) return acquired
    let releaseLease = true
    const heartbeat = setInterval(() => { try { this.deps.leases.renew(identity, this.deps.ownerToken, 30_000) } catch { /* live owner PID keeps stale recovery fail-closed */ } }, 10_000)
    heartbeat.unref?.()
    try {
      const args = ['-p', '--session-id', sessionId, '--model', input.model, '--output-format', 'json']
      const result = await this.deps.run({ command: this.deps.claudeBin ?? 'claude', args, cwd: input.cwd, env, stdin: input.prompt })
      if (!result.ok) return { ok: false, error: result.stderr.slice(0, 2_000) }
      try { input.onCreated?.(sessionId, identity) } catch {
        releaseLease = false
        this.deps.leases.abandon(identity, this.deps.ownerToken)
        return { ok: false, error: 'Claude session was created but durable registration failed; lease retained for explicit recovery' }
      }
      return { ok: true, runtimeId: identity, sessionId, result: result.stdout }
    } finally {
      clearInterval(heartbeat)
      if (releaseLease) this.deps.leases.release(identity, this.deps.ownerToken)
    }
  }
  async mutate(runtimeId: string, action: 'resume' | 'fork' | 'attach', input: { accountAlias: string; cwd: string; prompt?: string; model: string }) {
    if (capabilityMatrix('claude_session')[action].state === 'unsupported') return { ok: false, error: capabilityMatrix('claude_session')[action].explanation }
    const env = this.env(input.accountAlias); if (!env) return { ok: false, error: 'Account alias is not allowlisted' }
    const externalId = runtimeId.split(':').at(-1) ?? ''
    if (!externalId || externalId.length > 256 || (input.prompt?.length ?? 0) > 32_000 || !input.model || input.model.length > 200) return { ok: false, error: 'Invalid Claude runtime request' }
    const acquired = this.deps.leases.acquire(runtimeId, this.deps.ownerToken, 30_000); if (!acquired.ok) return acquired
    if (action === 'attach') {
      this.deps.leases.release(runtimeId, this.deps.ownerToken)
      return { ok: true, attach: { command: this.deps.claudeBin ?? 'claude', args: ['--resume', externalId, '--model', input.model], cwd: input.cwd } }
    }
    const args = ['-p', '--resume', externalId, '--model', input.model]
    if (action === 'fork') args.push('--fork-session')
    args.push('--output-format', 'json')
    const heartbeat = setInterval(() => { try { this.deps.leases.renew(runtimeId, this.deps.ownerToken, 30_000) } catch { /* live owner PID keeps stale recovery fail-closed */ } }, 10_000)
    heartbeat.unref?.()
    try {
      const result = await this.deps.run({ command: this.deps.claudeBin ?? 'claude', args, cwd: input.cwd, env, stdin: input.prompt })
      return result.ok ? { ok: true, result: result.stdout } : { ok: false, error: result.stderr.slice(0, 2_000) }
    } finally { clearInterval(heartbeat); this.deps.leases.release(runtimeId, this.deps.ownerToken) }
  }
}

type ApiResult = { status: number; body: Record<string, unknown> }
export async function providerRuntimeRequest(input: {
  method: string; authorized: boolean; parseJson?: () => Promise<unknown>; list: () => Array<ProviderRuntimeRecord>;
  mutate: (body: Record<string, unknown>) => Promise<unknown>
}): Promise<ApiResult> {
  if (!input.authorized) return { status: 401, body: { ok: false, error: 'Unauthorized' } }
  if (input.method === 'GET') return { status: 200, body: { ok: true, runtimes: input.list(), directProviderMessaging: { enabled: false, state: 'deferred', explanation: unsupportedMessaging.explanation }, codexRuntimeChoices: [
    { value: 'hermes_default', label: 'Hermes default', explanation: 'Hermes owns tools and the worker lifecycle.' },
    { value: 'codex_app_server', label: 'Codex app server', explanation: 'Codex owns its provider-native thread and tool loop through local stdio.' },
  ] } }
  let body: unknown
  try { body = await input.parseJson?.() } catch { return { status: 400, body: { ok: false, error: 'Invalid JSON body' } } }
  if (!body || typeof body !== 'object') return { status: 400, body: { ok: false, error: 'Invalid request' } }
  const raw = body as Record<string, unknown>
  const createsClaudeRuntime = raw.action === 'create' || raw.action === 'background'
  if ((typeof raw.runtimeId !== 'string' && !createsClaudeRuntime) || (typeof raw.runtimeId === 'string' && raw.runtimeId.length > 300) || typeof raw.action !== 'string' || raw.action.length > 32 || (typeof raw.text === 'string' && raw.text.length > 32_000)) return { status: 400, body: { ok: false, error: 'Invalid or oversized request' } }
  const result = await input.mutate(raw)
  return { status: 200, body: { ok: true, result } }
}
