import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import {
  createCodexStdioInvoker,
  resolveCliLaunch,
  resolveConfiguredAccountHomes,
} from './provider-runtime-service'

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
    }, 'win32', exists)).toEqual({ cwm4tx: 'D:\\ClaudeHomes\\cwm4tx', gp: 'E:\\ClaudeGP' })
  })
})
