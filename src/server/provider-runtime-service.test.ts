import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import {
  codexThreadIdFromResult,
  createCodexStdioInvoker,
  hydrateRuntimeLeases,
  resolveCliLaunch,
  resolveConfiguredAccountHomes,
  runtimeKindMatchesId,
  validateCodexForkThreadId,
} from './provider-runtime-service'
import type { ProviderRuntimeRecord } from './provider-runtime-control-plane'

describe('runtime dispatch identity', () => {
  it('accepts only exact persisted-kind and runtime-ID-prefix pairs', () => {
    expect(runtimeKindMatchesId({ kind: 'hermes_profile', runtimeId: 'hermes:worker-a' })).toBe(true)
    expect(runtimeKindMatchesId({ kind: 'claude_session', runtimeId: 'claude:cwm4tx:session-1' })).toBe(true)
    expect(runtimeKindMatchesId({ kind: 'codex_thread', runtimeId: 'codex:thread-1' })).toBe(true)
    expect(runtimeKindMatchesId({ kind: 'stale_kind', runtimeId: 'codex:thread-1' } as never)).toBe(false)
    expect(runtimeKindMatchesId({ kind: 'claude_session', runtimeId: 'codex:thread-1' })).toBe(false)
    expect(runtimeKindMatchesId({ kind: 'codex_thread', runtimeId: 'unknown:thread-1' })).toBe(false)
  })
})

describe('authoritative runtime lease projection', () => {
  it('overlays durable leases without mutating registry records', () => {
    const record = {
      runtimeId: 'codex:thread-1', kind: 'codex_thread', routeRef: null, accountAlias: 'openai-codex',
      externalId: 'thread-1', model: null, cwd: null, worktree: null, hostKind: 'stdio', hostStatus: 'idle',
      capabilities: {}, lease: null, parentRuntimeId: null, kanbanTaskId: null, createdAt: 1, updatedAt: 2,
    } as ProviderRuntimeRecord
    const lease = { owner: 'workspace-1', acquiredAt: 3, expiresAt: 4, abandoned: true }
    const getLease = vi.fn(() => lease)

    const hydrated = hydrateRuntimeLeases([record], getLease)

    expect(hydrated[0]).toEqual({ ...record, lease })
    expect(hydrated[0]).not.toBe(record)
    expect(record.lease).toBeNull()
    expect(getLease).toHaveBeenCalledWith('codex:thread-1')
  })
})

describe('Codex lifecycle result normalization', () => {
  it('extracts only a non-empty forked thread identity', () => {
    expect(codexThreadIdFromResult({ thread: { id: 'fork-123' } })).toBe('fork-123')
    expect(codexThreadIdFromResult({ thread: {} })).toBeNull()
    expect(codexThreadIdFromResult(null)).toBeNull()
  })

  it('rejects oversized, self-referential, and colliding fork identities', () => {
    const exists = (runtimeId: string) => runtimeId === 'codex:already-owned'
    expect(() => validateCodexForkThreadId('source', 'source', exists)).toThrow(/source/i)
    expect(() => validateCodexForkThreadId('source', 'x'.repeat(257), exists)).toThrow(/invalid/i)
    expect(() => validateCodexForkThreadId('source', 'bad/thread', exists)).toThrow(/invalid/i)
    expect(() => validateCodexForkThreadId('source', 'already-owned', exists)).toThrow(/already registered/i)
    expect(validateCodexForkThreadId('source', 'new-thread', exists)).toBe('new-thread')
  })
})

describe('Codex stdio app-server transport', () => {
  it('initializes the 0.147 protocol before sending the requested method and closes the child', async () => {
    const stdout = new EventEmitter()
    const stderr = new EventEmitter()
    const writes: Array<Record<string, unknown>> = []
    const child = {
      stdout,
      stderr,
      stdin: {
        write: vi.fn((line: string) => {
          const message = JSON.parse(line) as Record<string, unknown>
          writes.push(message)
          if (message.id === 1) queueMicrotask(() => stdout.emit('data', '{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"codex"}}}\n'))
          if (message.id === 2) queueMicrotask(() => stdout.emit('data', '{"jsonrpc":"2.0","id":2,"result":{"data":[]}}\n'))
          return true
        }),
        end: vi.fn(),
      },
      on: vi.fn(),
      kill: vi.fn(),
    }
    const spawnProcess = vi.fn(() => child)
    const invoke = createCodexStdioInvoker({
      spawnProcess: spawnProcess as never,
      timeoutMs: 1_000,
      codexBin: 'C:/tools/codex.exe',
      codexHome: 'C:/oauth/codex',
      baseEnv: { PATH: 'safe', OPENAI_API_KEY: 'paid', ANTHROPIC_API_KEY: 'paid', CODEX_HOME: 'C:/ambient/wrong' },
    })

    await expect(invoke('thread/list', {})).resolves.toEqual({ ok: true, result: { data: [] } })
    expect(spawnProcess).toHaveBeenCalledWith(
      'C:/tools/codex.exe',
      ['app-server'],
      expect.objectContaining({ shell: false, stdio: ['pipe', 'pipe', 'pipe'] }),
    )
    const childEnv = spawnProcess.mock.calls[0]?.[2]?.env as Record<string, string | undefined>
    expect(childEnv).toMatchObject({ PATH: 'safe', CODEX_HOME: 'C:/oauth/codex' })
    expect(childEnv.OPENAI_API_KEY).toBeUndefined()
    expect(childEnv.ANTHROPIC_API_KEY).toBeUndefined()
    expect(writes).toEqual([
      {
        id: 1, method: 'initialize',
        params: { clientInfo: { name: 'hermes-workspace', version: '2.3.0' }, capabilities: { experimentalApi: true } },
      },
      { method: 'initialized' },
      { id: 2, method: 'thread/list', params: {} },
    ])
    expect(child.stdin.end).toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalled()
  })
})

describe('Claude account-home allowlist resolution', () => {
  it('resolves npm CLI shims to executable launches without enabling a shell on Windows', () => {
    const root = 'C:\\Users\\u\\AppData\\Roaming\\npm'
    const exists = (path: string) => path.endsWith('claude.exe') || path.endsWith('codex.js')
    expect(resolveCliLaunch('claude', [], 'win32', { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, exists, 'C:\\node.exe'))
      .toEqual({ command: `${root}\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`, args: [] })
    expect(resolveCliLaunch('codex', ['app-server'], 'win32', { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }, exists, 'C:\\node.exe'))
      .toEqual({ command: 'C:\\node.exe', args: [`${root}\\node_modules\\@openai\\codex\\bin\\codex.js`, 'app-server'] })
    expect(resolveCliLaunch('D:\\tools\\codex.exe', ['x'], 'win32', {}, () => false, 'C:\\node.exe'))
      .toEqual({ command: 'D:\\tools\\codex.exe', args: ['x'] })
  })

  it('accepts only configured existing homes and conventional Windows homes', () => {
    const exists = vi.fn((path: string) => ['D:\\ClaudeHomes\\cwm4tx', 'E:\\ClaudeGP'].includes(path))
    expect(resolveConfiguredAccountHomes({
      CLAUDE_CWM4TX_HOME: 'D:\\ClaudeHomes\\cwm4tx',
      CLAUDE_GP_HOME: 'E:\\ClaudeGP',
      HERMES_CLAUDE_ACCOUNT_HOMES_JSON: '{"ignored":"Z:\\\\missing","bad":5}',
    }, 'win32', exists, {
      canonicalize: (path) => path,
      isDirectory: () => true,
      isLink: () => false,
    })).toEqual({ cwm4tx: 'D:\\ClaudeHomes\\cwm4tx', gp: 'E:\\ClaudeGP' })
  })

  it('rejects linked and duplicate canonical account homes', () => {
    const env = { CLAUDE_CWM4TX_HOME: 'D:\\ClaudeHomes\\cwm4tx', CLAUDE_GP_HOME: 'D:\\ClaudeHomes\\gp' }
    const base = { isDirectory: () => true, isLink: () => false }
    expect(() => resolveConfiguredAccountHomes(env, 'win32', () => true, {
      ...base,
      canonicalize: () => 'D:\\ClaudeHomes\\shared',
    })).toThrow(/distinct canonical/)
    expect(resolveConfiguredAccountHomes(env, 'win32', () => true, {
      ...base,
      canonicalize: (path) => path,
      isLink: (path) => path.toLowerCase().endsWith('\\gp'),
    })).toEqual({ cwm4tx: 'D:\\ClaudeHomes\\cwm4tx' })
  })
})
