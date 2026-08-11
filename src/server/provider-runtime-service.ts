import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, posix, win32 } from 'node:path'

import { getStateDir } from './workspace-state-dir'
import { buildSafeChildEnv, getWorkerProcessHost } from './worker-process-host'
import {
  ClaudeRuntimeAdapter,
  CodexRuntimeAdapter,
  DurableRuntimeLeases,
  ProviderRuntimeRegistry,
  capabilityMatrix,
  importClaudeAgents,
  importCodexThreads,
} from './provider-runtime-control-plane'
import type { ClaudeRun, CodexInvoke, ProviderRuntimeRecord } from './provider-runtime-control-plane'

const MAX_DIAGNOSTIC = 2_000
const MAX_STDIO = 2 * 1024 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function codexThreadIdFromResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null
  const thread = (result as { thread?: unknown }).thread
  if (!thread || typeof thread !== 'object') return null
  const id = (thread as { id?: unknown }).id
  return typeof id === 'string' && id.trim() ? id.trim() : null
}

export function validateCodexForkThreadId(
  sourceThreadId: string,
  candidateThreadId: string,
  runtimeExists: (runtimeId: string) => boolean,
): string {
  if (!candidateThreadId || candidateThreadId.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(candidateThreadId)) {
    throw new Error('Invalid Codex fork thread identity')
  }
  if (candidateThreadId === sourceThreadId) throw new Error('Codex fork returned the source thread identity')
  if (runtimeExists(`codex:${candidateThreadId}`)) throw new Error('Codex fork thread is already registered')
  return candidateThreadId
}

function verifiedWorktree(path: string): string | null {
  try {
    const canonical = realpathSync(path)
    const top = String(execFileSync('git', ['-C', canonical, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true })).trim()
    return realpathSync(top) === canonical ? canonical : null
  } catch { return null }
}

type RuntimeService = {
  list: () => Array<ProviderRuntimeRecord>
  refresh: () => Promise<Array<{ source: string; ok: boolean; count: number; error?: string }>>
  mutate: (body: Record<string, unknown>) => Promise<unknown>
  recoverLease: (runtimeId: string) => { ok: boolean; error?: string }
}

export function resolveCliLaunch(
  command: string,
  args: Array<string>,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  pathExists: (path: string) => boolean = existsSync,
  nodeBin: string = process.execPath,
): { command: string; args: Array<string> } {
  if (platform !== 'win32' || /[\\/]/.test(command) || /\.(?:exe)$/i.test(command)) return { command, args }
  const appData = env.APPDATA?.trim()
  if (!appData) return { command, args }
  const npmRoot = win32.join(appData, 'npm', 'node_modules')
  if (command === 'claude') {
    const binary = win32.join(npmRoot, '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    if (pathExists(binary)) return { command: binary, args }
  }
  if (command === 'codex') {
    const script = win32.join(npmRoot, '@openai', 'codex', 'bin', 'codex.js')
    if (pathExists(script)) return { command: nodeBin, args: [script, ...args] }
  }
  return { command, args }
}

export function resolveConfiguredAccountHomes(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  pathExists: (path: string) => boolean = existsSync,
  validation: {
    canonicalize?: (path: string) => string
    isDirectory?: (path: string) => boolean
    isLink?: (path: string) => boolean
  } = {},
): Record<string, string> {
  const candidates: Record<string, string> = {}
  try {
    const parsed = JSON.parse(env.HERMES_CLAUDE_ACCOUNT_HOMES_JSON ?? '{}') as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const alias of ['cwm4tx', 'gp']) {
        const value = (parsed as Record<string, unknown>)[alias]
        if (typeof value === 'string') candidates[alias] = value.trim()
      }
    }
  } catch { /* malformed optional JSON contributes no homes */ }
  if (env.CLAUDE_CWM4TX_HOME?.trim()) candidates.cwm4tx = env.CLAUDE_CWM4TX_HOME.trim()
  if (env.CLAUDE_GP_HOME?.trim()) candidates.gp = env.CLAUDE_GP_HOME.trim()
  if (platform === 'win32') {
    candidates.cwm4tx ||= 'D:\\ClaudeHomes\\cwm4tx'
    candidates.gp ||= 'D:\\ClaudeHomes\\gp'
  }
  const pathApi = platform === 'win32' ? win32 : posix
  const canonicalize = validation.canonicalize ?? ((path: string) => realpathSync.native(path))
  const isDirectory = validation.isDirectory ?? ((path: string) => statSync(path).isDirectory())
  const isLink = validation.isLink ?? ((path: string) => lstatSync(path).isSymbolicLink())
  const resolved: Record<string, string> = {}
  const identities = new Set<string>()
  for (const [alias, home] of Object.entries(candidates)) {
    if (!home || home.length > 1024 || !pathApi.isAbsolute(home) || !pathExists(home) || !isDirectory(home)) continue
    const absolute = pathApi.resolve(home)
    const root = pathApi.parse(absolute).root
    let current = root
    let linked = false
    for (const segment of absolute.slice(root.length).split(pathApi.sep).filter(Boolean)) {
      current = pathApi.join(current, segment)
      if (isLink(current)) { linked = true; break }
    }
    if (linked) continue
    const canonical = canonicalize(absolute)
    const identity = platform === 'win32' ? canonical.toLowerCase() : canonical
    if (identities.has(identity)) throw new Error('Claude account homes must resolve to distinct canonical directories')
    identities.add(identity)
    resolved[alias] = canonical
  }
  return resolved
}

function claudeRunner(): ClaudeRun {
  return (input) => new Promise((resolve) => {
    const launch = resolveCliLaunch(input.command, input.args)
    const child = spawn(launch.command, launch.args, { cwd: input.cwd, env: buildSafeChildEnv(input.env), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''; let stderr = ''; let done = false
    const finish = (result: { ok: boolean; stdout: string; stderr: string }) => { if (!done) { done = true; resolve(result) } }
    child.stdout.on('data', (chunk) => { if (stdout.length < MAX_STDIO) stdout += String(chunk).slice(0, MAX_STDIO - stdout.length) })
    child.stderr.on('data', (chunk) => { if (stderr.length < MAX_DIAGNOSTIC) stderr += String(chunk).slice(0, MAX_DIAGNOSTIC - stderr.length) })
    child.on('error', () => finish({ ok: false, stdout: '', stderr: 'Claude process failed to start' }))
    child.on('exit', (code) => finish({ ok: code === 0, stdout, stderr }))
    if (input.stdin !== undefined) child.stdin.end(input.stdin); else child.stdin.end()
  })
}

type SpawnProcess = typeof spawn

export function createCodexStdioInvoker(input: {
  spawnProcess?: SpawnProcess
  timeoutMs?: number
  codexBin?: string
  baseEnv?: Record<string, string | undefined>
  codexHome?: string
} = {}): CodexInvoke {
  const spawnProcess = input.spawnProcess ?? spawn
  return (method, params) => new Promise((resolve) => {
    const launch = resolveCliLaunch(input.codexBin ?? process.env.CODEX_CLI_BIN ?? 'codex', ['app-server'])
    const child = spawnProcess(launch.command, launch.args, {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildSafeChildEnv(input.baseEnv ?? process.env, {
        HOME: homedir(), USERPROFILE: homedir(), CODEX_HOME: input.codexHome ?? join(homedir(), '.codex'),
      }),
    })
    let buffer = ''
    let stderr = ''
    let done = false
    let initialized = false
    const finish = (result: { ok: boolean; result?: unknown; error?: string }) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.stdin.end()
      child.kill()
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'Codex app-server timed out' }), input.timeoutMs ?? 30_000)
    child.stdout.on('data', (chunk) => {
      if (buffer.length >= MAX_STDIO) return finish({ ok: false, error: 'Codex app-server response exceeded the limit' })
      buffer += String(chunk).slice(0, MAX_STDIO - buffer.length)
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        let message: { id?: unknown; result?: unknown; error?: { message?: unknown } }
        try { message = JSON.parse(line) as typeof message } catch { continue }
        if (message.id === 1 && !initialized) {
          if (message.error) return finish({ ok: false, error: 'Codex app-server initialization failed' })
          initialized = true
          child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`)
          child.stdin.write(`${JSON.stringify({ id: 2, method, params })}\n`)
        } else if (message.id === 2) {
          if (message.error) finish({ ok: false, error: typeof message.error.message === 'string' ? message.error.message.slice(0, MAX_DIAGNOSTIC) : 'Codex app-server error' })
          else finish({ ok: true, result: message.result })
        }
      }
    })
    child.stderr.on('data', (chunk) => { if (stderr.length < MAX_DIAGNOSTIC) stderr += String(chunk).slice(0, MAX_DIAGNOSTIC - stderr.length) })
    child.on('error', () => finish({ ok: false, error: 'Codex app-server failed to start' }))
    child.on('exit', () => { if (!done) finish({ ok: false, error: stderr || 'Codex app-server closed before replying' }) })
    child.stdin.write(`${JSON.stringify({
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'hermes-workspace', version: '2.3.0' }, capabilities: { experimentalApi: true } },
    })}\n`)
  })
}

export function hydrateRuntimeLeases(
  records: Array<ProviderRuntimeRecord>,
  getLease: (runtimeId: string) => ProviderRuntimeRecord['lease'],
): Array<ProviderRuntimeRecord> {
  return records.map((record) => ({ ...record, lease: getLease(record.runtimeId) }))
}

export function runtimeKindMatchesId(record: Pick<ProviderRuntimeRecord, 'kind' | 'runtimeId'>): boolean {
  const prefixes: Record<string, string> = {
    hermes_profile: 'hermes',
    claude_session: 'claude',
    codex_thread: 'codex',
  }
  const prefix = prefixes[String(record.kind)]
  return typeof prefix === 'string' && record.runtimeId.startsWith(`${prefix}:`)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

let singleton: RuntimeService | null = null

export function getProviderRuntimeService(): RuntimeService {
  if (singleton) return singleton
  const state = getStateDir()
  const registry = new ProviderRuntimeRegistry(join(state, 'provider-runtimes.json'))
  const leases = new DurableRuntimeLeases(join(state, 'provider-runtime-leases'))
  const ownerToken = `workspace-${process.pid}-${randomUUID()}`
  const invokeCodex = createCodexStdioInvoker()
  const runClaude = claudeRunner()
  const accountHomes = resolveConfiguredAccountHomes()
  const codex = new CodexRuntimeAdapter({ invoke: invokeCodex, leases, ownerToken })
  const claude = new ClaudeRuntimeAdapter({ run: runClaude, leases, ownerToken, accountHomes })
  singleton = {
    list: () => hydrateRuntimeLeases(registry.list(), (runtimeId) => leases.get(runtimeId)),
    recoverLease: (runtimeId) => leases.recoverExpired(runtimeId),
    async refresh() {
      const workerRecords = await getWorkerProcessHost().list()
      for (const worker of workerRecords) registry.merge([{
        runtimeId: `hermes:${worker.workerId}`,
        kind: 'hermes_profile', routeRef: null, accountAlias: 'hermes', externalId: worker.workerId,
        cwd: worker.cwd, worktree: worker.cwd, hostKind: worker.hostKind,
        hostStatus: worker.status,
        capabilities: capabilityMatrix('hermes_profile'), lease: null,
        parentRuntimeId: null, kanbanTaskId: null,
        createdAt: worker.startedAt, updatedAt: worker.updatedAt,
      }])
      const claudeImports = Object.entries(accountHomes).map(async ([accountAlias, home]) => ({
        source: `claude:${accountAlias}`,
        ...(await importClaudeAgents({ run: runClaude, registry, accountAlias, routeRef: null, home })),
      }))
      const codexImport = importCodexThreads({
        invoke: invokeCodex,
        registry,
        accountAlias: 'openai-codex',
        routeRef: null,
      }).then((result) => ({ source: 'codex:openai-codex', ...result }))
      return Promise.all([{ source: 'hermes:worker-host', ok: true, count: workerRecords.length }, ...claudeImports, codexImport])
    },
    async mutate(body) {
      const runtimeId = typeof body.runtimeId === 'string' ? body.runtimeId : ''
      const action = typeof body.action === 'string' ? body.action : ''
      if (action === 'background') return { ok: false, error: 'Background Claude launch is disabled until durable writer ownership can be tracked' }
      const routeRef = typeof body.routeRef === 'string' ? body.routeRef : ''
      const accountAlias = typeof body.accountAlias === 'string' ? body.accountAlias : ''
      const providerModel = typeof body.providerModel === 'string' ? body.providerModel.trim() : ''
      const existing = runtimeId ? registry.get(runtimeId) : null
      if (runtimeId && !existing) return { ok: false, error: 'Runtime must be imported or created before lifecycle mutation' }
      if (action === 'link_kanban' && existing) {
        const taskId = typeof body.kanbanTaskId === 'string' ? body.kanbanTaskId.trim() : ''
        if (taskId.length > 200) return { ok: false, error: 'Invalid Kanban task ID' }
        registry.merge([{ ...existing, kanbanTaskId: taskId || null, updatedAt: Date.now() }])
        return { ok: true, runtimeId, kanbanTaskId: taskId || null }
      }
      if (existing && !runtimeKindMatchesId(existing)) return { ok: false, error: 'Runtime kind and identity do not match' }
      if (existing?.routeRef && existing.routeRef !== routeRef) return { ok: false, error: 'Runtime routeRef does not match the requested route' }
      if (existing?.kind === 'claude_session' && existing.accountAlias !== accountAlias) return { ok: false, error: 'Runtime account identity does not match' }
      if (!providerModel || providerModel.length > 200) return { ok: false, error: 'A validated provider model is required' }

      const requestedCwd = typeof body.cwd === 'string' ? body.cwd : ''
      const requestedWorktree = typeof body.worktree === 'string' ? body.worktree : ''
      const cwd = requestedCwd || existing?.cwd || ''
      const worktree = requestedWorktree || existing?.worktree || ''
      if (['create', 'background', 'resume', 'fork'].includes(action)) {
        const verified = verifiedWorktree(worktree)
        if (!verified || verifiedWorktree(cwd) !== verified) return { ok: false, error: 'Lifecycle mutation requires cwd and worktree to resolve to the same Git worktree root' }
      }

      if (runtimeId.startsWith('codex:') && ['resume', 'fork', 'steer', 'interrupt', 'archive'].includes(action)) {
        let forkRuntimeId: string | null = null
        const result = await codex.mutate(runtimeId, action as 'resume' | 'fork' | 'steer' | 'interrupt' | 'archive', {
          providerModel,
          ...(typeof body.text === 'string' ? { text: body.text } : {}),
          ...(typeof body.turnId === 'string' ? { turnId: body.turnId } : {}),
          ...(action === 'fork' && existing ? { onForkCreated: (providerResult: unknown) => {
            const returnedForkId = codexThreadIdFromResult(providerResult)
            if (!returnedForkId) throw new Error('Codex fork response did not include a thread identity')
            const forkId = validateCodexForkThreadId(existing.externalId, returnedForkId, (id) => registry.get(id) !== null)
            const now = Date.now()
            forkRuntimeId = `codex:${forkId}`
            const inserted = registry.insertIfAbsent({
              ...existing, runtimeId: forkRuntimeId, externalId: forkId, routeRef, model: providerModel,
              cwd: cwd || existing.cwd, worktree: worktree || existing.worktree, hostStatus: 'idle',
              parentRuntimeId: existing.runtimeId, createdAt: now, updatedAt: now,
            })
            if (!inserted) throw new Error('Codex fork thread is already registered')
          } } : {}),
        })
        if (result.ok && existing) {
          if (action === 'fork') {
            if (!isNonEmptyString(forkRuntimeId)) return { ok: false, error: 'Codex fork registration was not confirmed' }
            return { ...result, runtimeId: forkRuntimeId }
          }
          registry.merge([{
            ...existing,
            routeRef: action === 'archive' ? existing.routeRef : routeRef,
            model: action === 'archive' ? existing.model : providerModel,
            cwd: cwd || existing.cwd,
            worktree: worktree || existing.worktree,
            hostStatus: action === 'archive' ? 'stopped' : existing.hostStatus,
            updatedAt: Date.now(),
          }])
        }
        return result
      }
      const prompt = typeof body.prompt === 'string' ? body.prompt : (typeof body.text === 'string' ? body.text : '')
      if (action === 'create' || action === 'background') {
        const requestId = typeof body.requestId === 'string' ? body.requestId : ''
        if (!UUID.test(requestId)) return { ok: false, error: 'Create requires a UUID requestId for durable idempotency' }
        const expectedRuntimeId = `claude:${accountAlias}:${requestId}`
        const prior = registry.get(expectedRuntimeId)
        if (prior) return { ok: true, runtimeId: prior.runtimeId, sessionId: prior.externalId, replayed: true }
        const result = await claude.create({
          accountAlias,
          cwd,
          prompt,
          model: providerModel,
          background: action === 'background',
          sessionId: requestId,
          onCreated: (sessionId, createdRuntimeId) => {
            const now = Date.now()
            registry.merge([{
              runtimeId: createdRuntimeId,
              kind: 'claude_session',
              routeRef,
              accountAlias,
              externalId: sessionId,
              model: providerModel,
              cwd,
              worktree,
              hostKind: 'external',
              hostStatus: 'idle',
              capabilities: capabilityMatrix('claude_session'),
              lease: null,
              parentRuntimeId: null,
              kanbanTaskId: typeof body.kanbanTaskId === 'string' ? body.kanbanTaskId : null,
              createdAt: now,
              updatedAt: now,
            }])
          },
        })
        return result
      }
      if (runtimeId.startsWith('claude:') && ['resume', 'fork', 'attach'].includes(action)) {
        const result = await claude.mutate(runtimeId, action as 'resume' | 'fork' | 'attach', { accountAlias, cwd, prompt, model: providerModel })
        if (result.ok && existing) registry.merge([{ ...existing, routeRef, model: providerModel, cwd, worktree, updatedAt: Date.now() }])
        return result
      }
      return { ok: false, error: 'Unsupported runtime lifecycle action' }
    },
  }
  return singleton
}

export function setProviderRuntimeServiceForTests(service: RuntimeService | null): void { singleton = service }
