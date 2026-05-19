import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (opts: any) => opts,
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: () => true,
}))

vi.mock('../../server/rate-limit', () => ({
  requireJsonContentType: () => null,
}))

let tmpHome = ''
const originalEnv: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in originalEnv)) originalEnv[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function writeRuntime(workerId: string, runtime: Record<string, unknown>) {
  const profilePath = path.join(tmpHome, 'profiles', workerId)
  fs.mkdirSync(profilePath, { recursive: true })
  fs.writeFileSync(path.join(profilePath, 'runtime.json'), JSON.stringify(runtime, null, 2) + '\n', 'utf-8')
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-runtime-reset-'))
  setEnv('HERMES_HOME', tmpHome)
  setEnv('CLAUDE_HOME', undefined)
  vi.resetModules()
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const key of Object.keys(originalEnv)) delete originalEnv[key]
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function loadHandlers() {
  const mod = await import('./swarm-runtime.reset')
  return (mod as any).Route.server.handlers
}

describe('/api/swarm-runtime/reset', () => {
  it('resets the selected semantic worker runtimes', async () => {
    writeRuntime('augur', {
      workerId: 'augur',
      state: 'blocked',
      phase: 'stalled',
      currentTask: 'Need operator input',
      currentMissionId: 'mission-1',
      extraField: 'keep-me',
    })
    writeRuntime('consul', {
      workerId: 'consul',
      state: 'executing',
      phase: 'running',
      currentTask: 'still working',
    })

    const handlers = await loadHandlers()
    const res = await handlers.POST({
      request: new Request('http://localhost/api/swarm-runtime/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workerIds: ['augur'], actor: 'test-suite', reason: 'manual cleanup' }),
      }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.workerIds).toEqual(['augur'])
    expect(body.resetCount).toBe(1)

    const augurRuntime = JSON.parse(fs.readFileSync(path.join(tmpHome, 'profiles', 'augur', 'runtime.json'), 'utf-8'))
    const consulRuntime = JSON.parse(fs.readFileSync(path.join(tmpHome, 'profiles', 'consul', 'runtime.json'), 'utf-8'))

    expect(augurRuntime.state).toBe('idle')
    expect(augurRuntime.phase).toBe('cancelled')
    expect(augurRuntime.currentTask).toBeNull()
    expect(augurRuntime.currentMissionId).toBeNull()
    expect(augurRuntime.extraField).toBe('keep-me')
    expect(augurRuntime.cancelledBy).toBe('test-suite')
    expect(consulRuntime.state).toBe('executing')
  })

  it('resets all worker profiles but skips the synthetic workspace profile', async () => {
    writeRuntime('builder', { workerId: 'builder', state: 'blocked', phase: 'stalled' })
    writeRuntime('reviewer', { workerId: 'reviewer', state: 'executing', phase: 'running' })
    writeRuntime('workspace', { workerId: 'workspace', state: 'blocked', phase: 'stalled' })

    const handlers = await loadHandlers()
    const res = await handlers.POST({
      request: new Request('http://localhost/api/swarm-runtime/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.workerIds).toEqual(['builder', 'reviewer'])

    const builderRuntime = JSON.parse(fs.readFileSync(path.join(tmpHome, 'profiles', 'builder', 'runtime.json'), 'utf-8'))
    const reviewerRuntime = JSON.parse(fs.readFileSync(path.join(tmpHome, 'profiles', 'reviewer', 'runtime.json'), 'utf-8'))
    const workspaceRuntime = JSON.parse(fs.readFileSync(path.join(tmpHome, 'profiles', 'workspace', 'runtime.json'), 'utf-8'))

    expect(builderRuntime.state).toBe('idle')
    expect(reviewerRuntime.state).toBe('idle')
    expect(workspaceRuntime.state).toBe('blocked')
  })

  it('rejects unknown worker ids', async () => {
    writeRuntime('builder', { workerId: 'builder', state: 'blocked', phase: 'stalled' })

    const handlers = await loadHandlers()
    const res = await handlers.POST({
      request: new Request('http://localhost/api/swarm-runtime/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workerIds: ['ghost-worker'] }),
      }),
    })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toContain('unknown worker ids')
  })
})
