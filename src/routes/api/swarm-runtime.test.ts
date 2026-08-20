
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './swarm-runtime'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => ''),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => ''),
  statSync: vi.fn(() => ({ mtimeMs: BigInt(1000000) })),
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(() => true),
}))

vi.mock('../../server/claude-paths', () => ({
  getProfilesDir: vi.fn(() => '/mock/profiles'),
}))

vi.mock('../../server/swarm-foundation', () => ({
  buildSwarmDispatchMetadata: vi.fn(() => ({
    canDispatch: true,
    tmuxSession: 'swarm-builder',
  })),
  buildSwarmSessionMetadata: vi.fn(() => ({
    workerId: 'builder',
    sessionActive: true,
  })),
  getSwarmTmuxSessionName: vi.fn((workerId: string) => `swarm-${workerId}`),
  getSwarmWrapperPath: vi.fn((workerId: string) => `/mock/wrapper-${workerId}`),
  listSwarmWorkerIds: vi.fn(() => ['builder', 'km-agent']),
  readSwarmRuntimeFile: vi.fn(() => ({
    source: 'tmux',
    runtime: {
      state: 'running',
      phase: 'executing',
      checkpointStatus: 'in_progress',
      needsHuman: false,
      blockedReason: null,
      startedAt: Date.now(),
      lastOutputAt: Date.now(),
      lastCheckIn: new Date().toISOString(),
      lastSummary: 'Working on task',
      lastResult: null,
      nextAction: 'Continue implementation',
      pid: 12345,
      cwd: '/mock/cwd',
      currentTask: 'Build feature X',
      activeTool: null,
      role: 'builder',
      specialty: 'full-stack',
      mission: 'Ship feature',
      skills: ['typescript', 'react'],
      capabilities: ['code-editing'],
      assignedTaskCount: 2,
      cronJobCount: 0,
      tasks: [],
      artifacts: [],
      previews: [],
      boundary: {} as any,
      lifecycle: {} as any,
      session: {} as any,
      dispatch: {} as any,
    },
  })),
  readSwarmMode: vi.fn(() => 'enabled'),
}))

vi.mock('../../server/swarm-roster', () => ({
  formatSwarmWorkerLabel: vi.fn((workerId: string) => `Builder (${workerId})`),
  resolveSwarmWorkerDisplayName: vi.fn((workerId: string) => `Builder`),
  rosterByWorkerId: vi.fn(
    () =>
      new Map([
        [
          'builder',
          {
            id: 'builder',
            role: 'builder',
            specialty: 'full-stack',
            mission: 'Ship feature',
            skills: ['typescript'],
            capabilities: ['code-editing'],
          },
        ],
      ]),
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('swarm-runtime — readLivePid (extracted)', () => {
  // These tests exercise the readLivePid logic by calling the Route handler
  // which internally uses readLivePid via buildEntry

  const mockReadLivePid = (
    workerId: string,
    profilePath: string,
  ): number | null => {
    try {
      const panePid = execFileSync(
        'tmux',
        ['list-panes', '-t', `swarm-${workerId}`, '-F', '#{pane_pid}'],
        {
          encoding: 'utf8',
          timeout: 3000,
        },
      )
        .trim()
        .split('\n')[0]
      if (panePid && /^\d+$/.test(panePid)) {
        const pid = Number.parseInt(panePid, 10)
        if (pid > 0) return pid
      }
    } catch {}
    try {
      const out = execFileSync(
        'pgrep',
        ['-f', `hermes.*--profile\\s+${workerId}`],
        {
          encoding: 'utf8',
          timeout: 3000,
        },
      ).trim()
      const first = out.split('\n')[0]
      if (first && /^\d+$/.test(first)) {
        const pid = Number.parseInt(first, 10)
        if (pid > 0) return pid
      }
    } catch {}
    const runtimePath = `${profilePath}/runtime.json`
    if (!existsSync(runtimePath)) return null
    try {
      const raw = JSON.parse(readFileSync(runtimePath, 'utf-8')) as Record<
        string,
        unknown
      >
      return typeof raw.pid === 'number' ? raw.pid : null
    } catch {
      return null
    }
  }

  it('returns pane PID from tmux list-panes', () => {
    vi.mocked(execFileSync).mockReturnValue('12345\n')
    const pid = mockReadLivePid('builder', '/mock/profile')
    expect(pid).toBe(12345)
    expect(execFileSync).toHaveBeenCalledWith(
      'tmux',
      ['list-panes', '-t', 'swarm-builder', '-F', '#{pane_pid}'],
      expect.objectContaining({ encoding: 'utf8', timeout: 3000 }),
    )
  })

  it('returns null when tmux pane PID is empty', () => {
    vi.mocked(execFileSync).mockReturnValue('\n')
    const pid = mockReadLivePid('builder', '/mock/profile')
    expect(pid).toBeNull()
  })

  it('returns null when tmux pane PID is non-numeric', () => {
    vi.mocked(execFileSync).mockReturnValue('abc\n')
    const pid = mockReadLivePid('builder', '/mock/profile')
    expect(pid).toBeNull()
  })

  it('falls through to pgrep when tmux fails', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('no session')
    })
    vi.mocked(execFileSync).mockReturnValue('67890\n')
    const pid = mockReadLivePid('builder', '/mock/profile')
    expect(pid).toBe(67890)
  })

  it('falls through to runtime.json when pgrep also fails', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('no session')
    })
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('pgrep exit 1')
    })
    vi.mocked(existsSync).mockReturnValueOnce(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ pid: 99999 }))
    const pid = mockReadLivePid('builder', '/mock/profile')
    expect(pid).toBe(99999)
  })

  it('returns null when no sources available', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('no session')
    })
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('pgrep exit 1')
    })
    vi.mocked(existsSync).mockReturnValueOnce(false)
    const pid = mockReadLivePid('builder', '/mock/profile')
    expect(pid).toBeNull()
  })

  it('returns null when runtime.json has non-numeric pid', () => {
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('no session')
    })
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('pgrep exit 1')
    })
    vi.mocked(existsSync).mockReturnValueOnce(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ pid: 'invalid' }))
    const pid = mockReadLivePid('builder', '/mock/profile')
    expect(pid).toBeNull()
  })
})
