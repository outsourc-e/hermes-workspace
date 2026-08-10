import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildSafeChildEnv, createWorkerProcessHost } from './worker-process-host'

let stateDir: string

function registryFile(): string {
  return join(stateDir, 'worker-process-hosts.json')
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'hermes-process-host-'))
})

afterEach(() => {
  rmSync(stateDir, { recursive: true, force: true })
})

function startSpec(workerId = 'builder') {
  return { workerId, command: 'hermes', args: ['chat', '--tui'], cwd: stateDir }
}

function spawnMock(pid = 4242) {
  return () => ({ pid, stdin: { writable: true, write: () => true }, on: () => {} })
}

describe('WorkerProcessHost durable registry', () => {
  it('persists a started worker so a fresh host instance still owns it', async () => {
    const spawned: Array<{ command: string; args: Array<string> }> = []
    const host = createWorkerProcessHost({
      platform: 'win32', registryFile: registryFile(), hasTmux: () => false,
      spawn: (command, args) => {
        spawned.push({ command, args })
        return { pid: 4242, stdin: { writable: true, write: () => true }, on: () => {} }
      },
    })
    expect((await host.start(startSpec())).ok).toBe(true)
    expect(spawned).toHaveLength(1)

    const fresh = createWorkerProcessHost({
      platform: 'win32', registryFile: registryFile(), hasTmux: () => false,
      spawn: () => { throw new Error('fresh instance must not spawn to read state') },
    })
    expect(await fresh.status('builder')).toMatchObject({ status: 'running', pid: 4242, hostKind: 'native' })
  })

  it('recovers stale native and tmux records after a server restart', async () => {
    writeFileSync(registryFile(), JSON.stringify({ version: 1, workers: {
      native: { workerId: 'native', hostKind: 'native', pid: 111, sessionName: null, cwd: stateDir, status: 'running', startedAt: 1, updatedAt: 1, lastError: null },
      tmux: { workerId: 'tmux', hostKind: 'tmux', pid: null, sessionName: 'swarm-tmux', cwd: stateDir, status: 'running', startedAt: 1, updatedAt: 1, lastError: null },
    }}))
    const host = createWorkerProcessHost({
      registryFile: registryFile(), hasTmux: () => true, isPidAlive: () => false,
      runCommand: async (_command, args) => ({ ok: args[0] === 'has-session', stdout: '', stderr: '' }),
      now: () => 9,
    })
    const recovered = await host.recover()
    expect(recovered.find((record) => record.workerId === 'native')).toMatchObject({ status: 'stopped', pid: null, updatedAt: 9 })
    expect(recovered.find((record) => record.workerId === 'tmux')).toMatchObject({ status: 'running' })
  })

  it('prevents duplicate starts from fresh host instances', async () => {
    let spawns = 0
    const deps = {
      platform: 'win32' as const, registryFile: registryFile(), hasTmux: () => false,
      spawn: () => { spawns += 1; return { pid: 4200 + spawns, on: () => {} } },
    }
    expect((await createWorkerProcessHost(deps).start(startSpec())).ok).toBe(true)
    const duplicate = await createWorkerProcessHost(deps).start(startSpec())
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toContain('already')
    expect(spawns).toBe(1)
  })

  it('sends to a native child and captures bounded tmux output', async () => {
    const writes: Array<string> = []
    const native = createWorkerProcessHost({
      platform: 'win32', registryFile: registryFile(), hasTmux: () => false,
      spawn: () => ({ pid: 77, stdin: { writable: true, write: (text, callback) => { writes.push(text); callback?.(); return true } }, on: () => {} }),
    })
    await native.start(startSpec('native'))
    expect((await native.send('native', 'hello')).ok).toBe(true)
    expect(writes).toEqual(['hello\n'])

    writeFileSync(registryFile(), JSON.stringify({ version: 1, workers: {
      tmux: { workerId: 'tmux', hostKind: 'tmux', pid: null, sessionName: 'swarm-tmux', cwd: stateDir, status: 'running', startedAt: 1, updatedAt: 1, lastError: null },
    }}))
    const calls: Array<Array<string>> = []
    const tmux = createWorkerProcessHost({
      registryFile: registryFile(), hasTmux: () => true,
      runCommand: async (_command, args) => { calls.push(args); return { ok: true, stdout: 'pane output', stderr: '' } },
    })
    expect(await tmux.capture('tmux', { lines: 99_999 })).toMatchObject({ ok: true, output: 'pane output' })
    expect(calls.at(-1)).toContain('-5000')
  })

  it('uses native hosting on Windows even when a tmux executable is present', () => {
    const host = createWorkerProcessHost({ platform: 'win32', registryFile: registryFile(), hasTmux: () => true })
    expect(host.hostKind).toBe('native')
  })

  it('launches tmux with the existing profile-aware command path', async () => {
    const calls: Array<Array<string>> = []
    const host = createWorkerProcessHost({
      platform: 'linux', registryFile: registryFile(), hasTmux: () => true, tmuxBin: 'tmux',
      runCommand: async (_command, args) => { calls.push(args); return { ok: args[0] !== 'has-session', stdout: '', stderr: '' } },
    })
    const result = await host.start({ ...startSpec(), env: { HERMES_HOME: '/profiles/builder', HERMES_CLI_BIN: '/bin/hermes' } })
    expect(result.ok).toBe(true)
    expect(calls[1]).toEqual(['new-session', '-d', '-s', 'swarm-builder', '-c', stateDir])
    expect(calls[2]?.join(' ')).toContain("HERMES_HOME='/profiles/builder'")
    expect(calls[2]?.join(' ')).toContain("'/bin/hermes' chat --tui")
  })

  it('constructs a minimal child environment and strips paid-provider credentials', () => {
    expect(buildSafeChildEnv(
      { PATH: 'safe', ANTHROPIC_API_KEY: 'paid', OPENAI_API_KEY: 'paid', RANDOM_SECRET: 'drop' },
      { HERMES_HOME: 'profile', CLAUDE_CODE_OAUTH_TOKEN: 'drop' },
    )).toEqual({ PATH: 'safe', HERMES_HOME: 'profile' })
  })

  it('never persists command arguments or environment secrets', async () => {
    const host = createWorkerProcessHost({
      platform: 'win32', registryFile: registryFile(), spawn: spawnMock() as never, isPidAlive: () => true,
    })
    await host.start({ ...startSpec(), args: ['--prompt', 'do-not-store'], env: { ANTHROPIC_AUTH_TOKEN: 'fake' } })
    const persisted = readFileSync(registryFile(), 'utf8')
    expect(persisted).not.toContain('--prompt')
    expect(persisted).not.toContain('do-not-store')
  })

  it('fails closed when the durable registry is corrupt', async () => {
    writeFileSync(registryFile(), '{not-json', 'utf8')
    const host = createWorkerProcessHost({ platform: 'win32', registryFile: registryFile(), spawn: spawnMock() as never })
    await expect(host.list()).rejects.toThrow()
    await expect(host.start(startSpec())).rejects.toThrow()
  })

  it('serializes registry writes across host instances without losing workers', async () => {
    const first = createWorkerProcessHost({ platform: 'win32', registryFile: registryFile(), spawn: spawnMock(4101) as never, isPidAlive: () => true })
    const second = createWorkerProcessHost({ platform: 'win32', registryFile: registryFile(), spawn: spawnMock(4102) as never, isPidAlive: () => true })
    const [one, two] = await Promise.all([
      first.start({ ...startSpec(), workerId: 'builder-a' }),
      second.start({ ...startSpec(), workerId: 'builder-b' }),
    ])
    expect(one.ok).toBe(true)
    expect(two.ok).toBe(true)
    expect((await first.list()).map((record) => record.workerId).sort()).toEqual(['builder-a', 'builder-b'])
  })
})
