import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const RAW_LOG_SENTINEL = 'RAW_AGENT_LOG_ACTIVITY_MUST_NOT_LEAVE_API'
const RAW_TITLE_SENTINEL = 'RAW_STATE_DB_TITLE_MUST_NOT_LEAVE_API'

let hermesHome = ''
let originalHermesHome: string | undefined
let originalClaudeHome: string | undefined

beforeEach(() => {
  originalHermesHome = process.env.HERMES_HOME
  originalClaudeHome = process.env.CLAUDE_HOME
  hermesHome = mkdtempSync(join(tmpdir(), 'swarm-runtime-activity-cutover-'))
  process.env.HERMES_HOME = hermesHome
  delete process.env.CLAUDE_HOME

  const profile = join(hermesHome, 'profiles', 'builder')
  mkdirSync(join(profile, 'logs'), { recursive: true })
  writeFileSync(join(profile, 'logs', 'agent.log'), RAW_LOG_SENTINEL, 'utf8')
  writeFileSync(join(profile, 'state.db'), RAW_TITLE_SENTINEL, 'utf8')
  writeFileSync(
    join(profile, 'runtime.json'),
    JSON.stringify({
      workerId: 'builder',
      currentTask: 'Safe worker status',
      sessionTitle: RAW_TITLE_SENTINEL,
      historySource: 'state.db',
      state: 'executing',
      phase: 'running',
    }),
    'utf8',
  )
  vi.resetModules()
})

afterEach(() => {
  if (originalHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = originalHermesHome
  if (originalClaudeHome === undefined) delete process.env.CLAUDE_HOME
  else process.env.CLAUDE_HOME = originalClaudeHome
  rmSync(hermesHome, { recursive: true, force: true })
})

describe('/api/swarm-runtime activity boundary', () => {
  it('omits raw log and state-backed session activity while retaining controls and status', async () => {
    const { getSwarmRuntime } = await import('./swarm-runtime')
    const response = await getSwarmRuntime(
      new Request('http://localhost/api/swarm-runtime'),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      entries: Array<Record<string, unknown>>
    }
    const builder = body.entries.find((entry) => entry.workerId === 'builder')

    expect(builder).toMatchObject({
      workerId: 'builder',
      currentTask: 'Safe worker status',
      state: 'executing',
      phase: 'running',
    })
    const serialized = JSON.stringify(builder)
    expect(serialized).not.toContain(RAW_LOG_SENTINEL)
    expect(serialized).not.toContain(RAW_TITLE_SENTINEL)
    expect(serialized).not.toContain('agent.log')
    expect(serialized).not.toContain('state.db')
    expect(builder).not.toHaveProperty('recentLogTail')
    expect(builder).not.toHaveProperty('lastSessionStartedAt')
    expect(builder).not.toHaveProperty('logPath')
    expect(builder).not.toHaveProperty('session')
    expect(builder).toHaveProperty('tmuxAttachable')
    expect(builder).toHaveProperty('terminalKind')
  })
})
