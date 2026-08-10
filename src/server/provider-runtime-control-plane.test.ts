import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ClaudeRuntimeAdapter,
  CodexRuntimeAdapter,
  DurableRuntimeLeases,
  ProviderRuntimeRegistry,
  capabilityMatrix,
  importClaudeAgents,
  importCodexThreads,
  normalizeClaudeAgents,
  normalizeCodexThreads,
  normalizeCodexRuntimeSelection,
  providerRuntimeRequest,
  type ProviderRuntimeRecord,
} from './provider-runtime-control-plane'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'provider-runtime-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const record: ProviderRuntimeRecord = {
  runtimeId: 'claude:session-1', kind: 'claude_session', routeRef: 'claude-cwm4tx/opus-5',
  accountAlias: 'Claude Max CWM', externalId: 'session-1', model: null, cwd: 'C:/repo', worktree: 'C:/repo',
  hostKind: 'native', hostStatus: 'running', capabilities: capabilityMatrix('claude_session', 'win32'),
  lease: null, parentRuntimeId: null, kanbanTaskId: 'task-1', createdAt: 1, updatedAt: 2,
}

describe('provider runtime durable registry', () => {
  it('persists only the safe metadata schema atomically', () => {
    const registry = new ProviderRuntimeRegistry(join(dir, 'runtimes.json'))
    registry.replace([record])
    expect(registry.list()).toEqual([record])
    registry.upsert({ ...record, hostStatus: 'idle', updatedAt: 3 })
    expect(registry.get(record.runtimeId)).toMatchObject({ hostStatus: 'idle', updatedAt: 3 })
    const text = readFileSync(join(dir, 'runtimes.json'), 'utf8')
    for (const forbidden of ['prompt', 'transcript', 'argv', 'token', 'credential']) expect(text.toLowerCase()).not.toContain(`"${forbidden}`)
  })

  it('inserts a new runtime without overwriting an existing identity', () => {
    const registry = new ProviderRuntimeRegistry(join(dir, 'runtimes.json'))
    expect(registry.insertIfAbsent(record)).toBe(true)
    expect(registry.insertIfAbsent({ ...record, accountAlias: 'collision', updatedAt: 99 })).toBe(false)
    expect(registry.get(record.runtimeId)).toMatchObject({ accountAlias: record.accountAlias, updatedAt: 2 })
  })

  it('normalizes partial Claude and Codex discovery records with provenance', () => {
    const claude = normalizeClaudeAgents([{ id: 'abc', cwd: 'C:/repo', status: 'active' }], { accountAlias: 'Claude Max GP', routeRef: 'claude-gp/opus-5', platform: 'win32', now: 5 })
    expect(claude[0]).toMatchObject({ runtimeId: 'claude:Claude Max GP:abc', externalId: 'abc', accountAlias: 'Claude Max GP', hostStatus: 'running' })
    expect(claude[0].capabilities.crossSessionMessage.state).toBe('unsupported')
    expect(claude[0].capabilities.discoverPeers.state).toBe('unsupported')
    const codex = normalizeCodexThreads([{ id: 'thread-1', cwd: 'C:/work' }], { accountAlias: 'OpenAI Codex', routeRef: 'openai-codex/gpt-5.6-sol', now: 6 })
    expect(codex[0]).toMatchObject({ runtimeId: 'codex:thread-1', externalId: 'thread-1', kind: 'codex_thread' })
  })

  it('imports discovery through injectable fixture-only seams', async () => {
    const registry = new ProviderRuntimeRegistry(join(dir, 'runtimes.json'))
    const claudeRun = vi.fn(async () => ({ ok: true, stdout: JSON.stringify([{ id: 'c1' }]), stderr: '' }))
    await importClaudeAgents({ run: claudeRun, registry, accountAlias: 'Claude Max CWM', routeRef: 'claude-cwm4tx/opus-5', home: 'C:/home', platform: 'win32' })
    expect(claudeRun.mock.calls[0][0]).toMatchObject({ args: ['agents', '--json', '--all'] })
    const codexInvoke = vi.fn(async () => ({ ok: true, result: { data: [{ id: 't1' }] } }))
    await importCodexThreads({ invoke: codexInvoke, registry, accountAlias: 'OpenAI Codex', routeRef: 'openai-codex/gpt-5.6-sol' })
    expect(codexInvoke).toHaveBeenCalledWith('thread/list', { limit: 20 })
    expect(registry.list().map((entry) => entry.runtimeId)).toEqual(['claude:Claude Max CWM:c1', 'codex:t1'])
  })
})

describe('durable one-writer leases', () => {
  it('acquires, renews, releases, rejects foreign tokens, and refuses uncertain stale takeover', () => {
    let now = 100
    const leases = new DurableRuntimeLeases(join(dir, 'leases'), () => now)
    expect(leases.acquire('codex:thread-1', 'owner-a', 10)).toMatchObject({ ok: true })
    expect(leases.acquire('codex:thread-1', 'owner-b', 10)).toMatchObject({ ok: false })
    expect(leases.renew('codex:thread-1', 'owner-b', 10)).toMatchObject({ ok: false })
    expect(leases.release('codex:thread-1', 'owner-b')).toBe(false)
    expect(leases.renew('codex:thread-1', 'owner-a', 20)).toMatchObject({ ok: true, lease: { expiresAt: 120 } })
    now = 121
    expect(leases.acquire('codex:thread-1', 'owner-b', 10)).toMatchObject({ ok: false })
    expect(leases.recoverExpired('codex:thread-1')).toMatchObject({ ok: false, error: expect.stringContaining('live Workspace owner') })
    expect(leases.abandon('codex:thread-1', 'owner-a', 10)).toBe(true)
    now = 132
    expect(leases.recoverExpired('codex:thread-1')).toMatchObject({ ok: true })
    expect(leases.get('codex:thread-1')).toBeNull()
    expect(leases.acquire('codex:thread-1', 'owner-a', 10)).toMatchObject({ ok: true })
    expect(leases.release('codex:thread-1', 'owner-a')).toBe(true)
  })
})

describe('capabilities and explicit Codex runtime selection', () => {
  it('marks direct messaging deferred and preserves unknown legacy selection safely', () => {
    expect(capabilityMatrix('codex_thread', 'win32').crossSessionMessage).toMatchObject({ state: 'unsupported', deferred: true })
    expect(normalizeCodexRuntimeSelection(undefined)).toEqual({ configured: 'hermes_default', effective: 'hermes_default', known: true })
    expect(normalizeCodexRuntimeSelection('future_runtime')).toEqual({ configured: 'future_runtime', effective: 'hermes_default', known: false })
  })
})

describe('provider lifecycle adapters', () => {
  it('enables bounded one-shot Codex thread lifecycle while keeping active-turn controls disabled', async () => {
    const leases = new DurableRuntimeLeases(join(dir, 'leases'), () => 10)
    const invoke = vi.fn(async () => ({ ok: true, result: { thread: { id: 'thread-fork' } } }))
    const adapter = new CodexRuntimeAdapter({ invoke, leases, ownerToken: 'server' })
    expect(await adapter.status('thread-1')).toMatchObject({ ok: true })
    expect(invoke).toHaveBeenLastCalledWith('thread/read', { threadId: 'thread-1', includeTurns: false })
    expect(await adapter.mutate('codex:thread-1', 'resume', { providerModel: 'gpt-5.6-sol' })).toMatchObject({ ok: true })
    let forkRegisteredWhileLeased = false
    expect(await adapter.mutate('codex:thread-1', 'fork', {
      providerModel: 'gpt-5.6-sol',
      onForkCreated: () => { forkRegisteredWhileLeased = leases.get('codex:thread-1') !== null },
    })).toMatchObject({ ok: true })
    expect(forkRegisteredWhileLeased).toBe(true)
    expect(await adapter.mutate('codex:thread-1', 'archive', {})).toMatchObject({ ok: true })
    expect(invoke).toHaveBeenNthCalledWith(2, 'thread/resume', { threadId: 'thread-1', model: 'gpt-5.6-sol' })
    expect(invoke).toHaveBeenNthCalledWith(3, 'thread/fork', { threadId: 'thread-1', model: 'gpt-5.6-sol' })
    expect(invoke).toHaveBeenNthCalledWith(4, 'thread/archive', { threadId: 'thread-1' })
    expect(await adapter.mutate('codex:thread-1', 'steer', { text: 'bounded', turnId: 'turn-7' })).toMatchObject({ ok: false })
    expect(await adapter.mutate('codex:thread-1', 'interrupt', { turnId: 'turn-7' })).toMatchObject({ ok: false })
    expect(invoke).toHaveBeenCalledTimes(4)
    expect(leases.get('codex:thread-1')).toBeNull()
  })

  it('retains an abandoned Codex lease when fork registration is ambiguous', async () => {
    const leases = new DurableRuntimeLeases(join(dir, 'leases'), () => 10)
    const adapter = new CodexRuntimeAdapter({ invoke: vi.fn(async () => ({ ok: true, result: {} })), leases, ownerToken: 'server' })
    expect(await adapter.mutate('codex:thread-2', 'fork', { onForkCreated: () => { throw new Error('registry unavailable') } })).toMatchObject({ ok: false })
    expect(leases.get('codex:thread-2')).toMatchObject({ abandoned: true })
  })

  it('passes Claude prompts via stdin with official UUID resume/fork flags and strips API credentials', async () => {
    const run = vi.fn(async () => ({ ok: true, stdout: '{"session_id":"11111111-1111-4111-8111-111111111111"}', stderr: '' }))
    const claudeLeases = new DurableRuntimeLeases(join(dir, 'leases'))
    const adapter = new ClaudeRuntimeAdapter({
      run, leases: claudeLeases, ownerToken: 'server',
      accountHomes: { cwm4tx: 'C:/claude-cwm' }, uuid: () => '11111111-1111-4111-8111-111111111111',
      baseEnv: { ANTHROPIC_API_KEY: 'x', ANTHROPIC_AUTH_TOKEN: 'y', CLAUDE_CODE_OAUTH_TOKEN: 'z', SAFE: '1' },
    })
    expect((await adapter.create({ accountAlias: 'not-allowed', cwd: 'C:/repo', prompt: 'secret', model: 'opus' })).ok).toBe(false)
    expect(run).not.toHaveBeenCalled()
    let registeredWhileLeased = false
    expect((await adapter.create({
      accountAlias: 'cwm4tx', cwd: 'C:/repo', prompt: 'secret',
      model: 'opus',
      onCreated: (_sessionId, runtimeId) => { registeredWhileLeased = claudeLeases.get(runtimeId) !== null },
    })).ok).toBe(true)
    expect(registeredWhileLeased).toBe(true)
    const created = run.mock.calls[0][0]
    expect(created.args).toEqual(['-p', '--session-id', '11111111-1111-4111-8111-111111111111', '--model', 'opus', '--output-format', 'json'])
    expect(created.args).not.toContain('secret')
    expect(created.stdin).toBe('secret')
    expect(created.env).toMatchObject({ HOME: 'C:/claude-cwm', USERPROFILE: 'C:/claude-cwm' })
    expect(created.env.SAFE).toBeUndefined()
    expect(created.env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(created.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(created.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()

    await adapter.mutate('claude:cwm4tx:22222222-2222-4222-8222-222222222222', 'resume', { accountAlias: 'cwm4tx', cwd: 'C:/repo', prompt: 'continue', model: 'opus' })
    expect(run.mock.calls[1][0]).toMatchObject({
      args: ['-p', '--resume', '22222222-2222-4222-8222-222222222222', '--model', 'opus', '--output-format', 'json'],
      stdin: 'continue',
    })
    expect((await adapter.mutate('claude:cwm4tx:22222222-2222-4222-8222-222222222222', 'fork', { accountAlias: 'cwm4tx', cwd: 'C:/repo', prompt: 'branch', model: 'opus' })).ok).toBe(false)
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('guarded provider runtime API seam', () => {
  it('denies every mutation before JSON parsing or side effects', async () => {
    const parse = vi.fn(async () => ({ action: 'steer' }))
    const mutate = vi.fn()
    const response = await providerRuntimeRequest({ method: 'POST', authorized: false, parseJson: parse, list: () => [], mutate })
    expect(response.status).toBe(401)
    expect(parse).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('bounds mutating input before invoking an adapter', async () => {
    const mutate = vi.fn(async () => ({ ok: true }))
    const response = await providerRuntimeRequest({
      method: 'POST', authorized: true, list: () => [], mutate,
      parseJson: async () => ({ runtimeId: 'codex:thread-1', action: 'steer', text: 'x'.repeat(40_000) }),
    })
    expect(response.status).toBe(400)
    expect(mutate).not.toHaveBeenCalled()
  })
})
