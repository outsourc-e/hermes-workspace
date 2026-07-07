import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tempHome: string
let originalHermesHome: string | undefined
let originalClaudeHome: string | undefined

async function loadModule() {
  vi.resetModules()
  vi.doMock('node:os', async () => {
    const actual = await vi.importActual<typeof import('node:os')>('node:os')
    return { ...actual, homedir: () => tempHome }
  })
  return await import('./swarm-memory')
}

describe('swarm-memory module', () => {
  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'swarm-memory-test-'))
    originalHermesHome = process.env.HERMES_HOME
    originalClaudeHome = process.env.CLAUDE_HOME
    process.env.HERMES_HOME = join(tempHome, '.hermes')
    delete process.env.CLAUDE_HOME
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('node:os')
    if (originalHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = originalHermesHome
    if (originalClaudeHome === undefined) delete process.env.CLAUDE_HOME
    else process.env.CLAUDE_HOME = originalClaudeHome
    try { rmSync(tempHome, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('scaffolds worker memory files in canonical Hermes profile path', async () => {
    const mod = await loadModule()
    mod.ensureWorkerMemoryScaffold({ workerId: 'swarmtest1', name: 'Swarm Test 1', role: 'Builder', specialty: 'tests', model: 'GPT-5' })
    const root = mod.swarmWorkerMemoryRoot('swarmtest1')
    expect(root.endsWith('profiles/swarmtest1/memory')).toBe(true)
    expect(root.startsWith(join(tempHome, '.hermes'))).toBe(true)
    expect(readFileSync(join(root, 'IDENTITY.md'), 'utf8')).toMatch(/Worker ID: swarmtest1/)
    expect(readFileSync(join(root, 'MEMORY.md'), 'utf8')).toMatch(/swarmtest1/)
    expect(readFileSync(join(root, 'SOUL.md'), 'utf8')).toMatch(/swarmtest1/)
  })

  it('appends mission and episodic memory events', async () => {
    const mod = await loadModule()
    mod.ensureWorkerMemoryScaffold({ workerId: 'swarmtest1' })
    mod.appendSwarmMemoryEvent({
      workerId: 'swarmtest1',
      missionId: 'mission-test-1',
      type: 'dispatch',
      summary: 'Dispatched test work',
      title: 'Test mission',
    })
    const summaryPath = join(mod.swarmWorkerMissionMemoryRoot('swarmtest1', 'mission-test-1'), 'SUMMARY.md')
    expect(readFileSync(summaryPath, 'utf8')).toMatch(/Test mission/)
    const events = readFileSync(join(mod.swarmWorkerMissionMemoryRoot('swarmtest1', 'mission-test-1'), 'events.jsonl'), 'utf8')
    expect(events).toMatch(/dispatch/)
    const today = new Date().toISOString().slice(0, 10)
    const episodes = readFileSync(join(mod.swarmWorkerEpisodesRoot('swarmtest1'), `${today}.md`), 'utf8')
    expect(episodes).toMatch(/Dispatched test work/)
  })

  it('writes worker handoff and skips shared mirror when requested', async () => {
    const mod = await loadModule()
    mod.ensureWorkerMemoryScaffold({ workerId: 'swarmtest1' })
    const result = mod.writeSwarmHandoff({ workerId: 'swarmtest1', missionId: 'mission-test-1', content: 'Handoff body', mirrorShared: false })
    expect(result.localPath.endsWith('handoffs/mission-test-1.md')).toBe(true)
    expect(result.localPath.startsWith(join(tempHome, '.hermes'))).toBe(true)
    expect(readFileSync(result.localPath, 'utf8')).toMatch(/Handoff body/)
    expect(result.sharedPath).toBeUndefined()
  })

  it('searches worker memory for tokens', async () => {
    const mod = await loadModule()
    mod.ensureWorkerMemoryScaffold({ workerId: 'swarmtest1' })
    mod.appendSwarmMemoryEvent({
      workerId: 'swarmtest1',
      missionId: 'mission-search',
      type: 'note',
      summary: 'Important keyword: rendezvous',
    })
    const results = mod.searchSwarmMemory({ workerId: 'swarmtest1', query: 'rendezvous', scope: 'worker', limit: 5 })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].snippet).toMatch(/rendezvous/)
  })
})
