import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

async function loadKanbanBackend(options?: {
  existsSync?: (path: string) => boolean
  execFileSync?: (command: string, args?: string[]) => string
}) {
  vi.doMock('./swarm-kanban-store', () => ({
    SWARM_KANBAN_FILE: '/tmp/swarm2-kanban.json',
    createSwarmKanbanCard: vi.fn((input) => ({
      id: 'local-1',
      title: input.title,
      spec: input.spec ?? '',
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      assignedWorker: input.assignedWorker ?? null,
      reviewer: input.reviewer ?? null,
      status: input.status ?? 'backlog',
      missionId: input.missionId ?? null,
      reportPath: input.reportPath ?? null,
      createdBy: input.createdBy ?? 'swarm2-kanban',
      createdAt: 1,
      updatedAt: 1,
    })),
    listSwarmKanbanCards: vi.fn(() => [{
      id: 'local-1',
      title: 'Local task',
      spec: '',
      acceptanceCriteria: [],
      assignedWorker: null,
      reviewer: null,
      status: 'backlog',
      missionId: null,
      reportPath: null,
      createdBy: 'local',
      createdAt: 1,
      updatedAt: 1,
    }]),
    updateSwarmKanbanCard: vi.fn((cardId, updates) => ({
      id: cardId,
      title: updates.title ?? 'Local task',
      spec: updates.spec ?? '',
      acceptanceCriteria: [],
      assignedWorker: updates.assignedWorker ?? null,
      reviewer: null,
      status: updates.status ?? 'backlog',
      missionId: null,
      reportPath: null,
      createdBy: 'local',
      createdAt: 1,
      updatedAt: 2,
    })),
  }))

  vi.doMock('node:fs', () => ({
    existsSync: vi.fn((path: string) => options?.existsSync?.(path) ?? false),
  }))

  vi.doMock('node:child_process', () => ({
    execFileSync: vi.fn((command: string, args?: string[]) => options?.execFileSync?.(command, args) ?? ''),
  }))

  return import('./kanban-backend')
}

describe('kanban-backend', () => {
  it('auto-detect prefers Hermes backend when Hermes CLI and canonical storage are present', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.claude/profiles/swarm2')
    const sqliteCalls: Array<{ command: string; args?: string[] }> = []
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.claude/kanban.db' || target === '/Users/aurora/.claude/kanban',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'claude') return '/Users/aurora/.local/bin/claude\n'
        if (command === '/Users/aurora/.local/bin/claude' && args[0] === '--version') return 'claude 1.0.0\n'
        if (command === 'sqlite3') {
          sqliteCalls.push({ command, args })
          return JSON.stringify([
            {
              id: 't_12345678',
              title: 'Hermes task',
              body: 'Backed by sqlite',
              status: 'running',
              assignee: 'swarm2',
              created_at: 1777527540,
              updated_at: 1777527644,
            },
          ])
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    expect(mod.getKanbanBackendMeta()).toMatchObject({
      id: 'claude',
      detected: true,
      writable: true,
      path: '/Users/aurora/.claude/kanban.db',
    })

    const cards = await mod.listKanbanCards()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 't_12345678',
      title: 'Hermes task',
      status: 'running',
      assignedWorker: 'swarm2',
      createdBy: 'claude-kanban',
    })
    expect(sqliteCalls[0]?.args?.[0]).toBe('/Users/aurora/.claude/kanban.db')
  })

  it('auto-detect uses Hermes storage directly when the CLI is unavailable', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.claude/profiles/swarm2')
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.claude/kanban.db',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'claude') throw new Error('not found')
        if (command === 'sqlite3') {
          return JSON.stringify([
            {
              id: 't_direct',
              title: 'Direct Hermes task',
              body: '',
              status: 'ready',
              assignee: null,
              created_at: 1777527540,
              updated_at: 1777527644,
            },
          ])
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    expect(mod.getKanbanBackendMeta()).toMatchObject({
      id: 'claude',
      detected: true,
      writable: true,
      path: '/Users/aurora/.claude/kanban.db',
    })
    expect(mod.getKanbanBackendMeta().details).toContain('direct local storage access')
    expect((await mod.listKanbanCards())[0]).toMatchObject({ id: 't_direct', status: 'ready' })
  })

  it('resolves canonical Kanban paths from legacy profile-home env fallback too', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.claude/profiles/swarm5/home')
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.claude/profiles/swarm5/home')
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.claude/kanban.db',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'claude') throw new Error('not found')
        if (command === 'sqlite3') return '[]'
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    expect(mod.getKanbanBackendMeta()).toMatchObject({
      id: 'claude',
      detected: true,
      path: '/Users/aurora/.claude/kanban.db',
    })
  })

  it('auto-detect falls back to local when canonical Hermes storage is missing', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.claude/profiles/swarm2')
    const mod = await loadKanbanBackend({
      existsSync: () => false,
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'claude') return '/Users/aurora/.local/bin/claude\n'
        if (command === '/Users/aurora/.local/bin/claude' && args[0] === '--version') return 'claude 1.0.0\n'
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    expect(mod.getKanbanBackendMeta()).toMatchObject({
      id: 'local',
      detected: true,
      writable: true,
      path: '/tmp/swarm2-kanban.json',
    })
    expect((await mod.listKanbanCards())[0]?.id).toBe('local-1')
  })

  it('creates and updates Hermes tasks through canonical kanban.db path', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.claude/profiles/swarm2')
    const sqliteCalls: string[] = []
    let readCount = 0
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.claude/kanban.db' || target === '/Users/aurora/.claude/kanban',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'claude') return '/Users/aurora/.local/bin/claude\n'
        if (command === '/Users/aurora/.local/bin/claude' && args[0] === '--version') return 'claude 1.0.0\n'
        if (command === 'sqlite3') {
          sqliteCalls.push(args.join(' '))
          const sql = args[2] ?? ''
          if (sql.includes('where id =')) {
            readCount += 1
            return JSON.stringify([
              {
                id: 't_deadbeef',
                title: readCount === 1 ? 'Created Hermes task' : 'Updated Hermes task',
                body: 'Task body',
                status: readCount === 1 ? 'queued' : 'done',
                assignee: 'swarm6',
                created_at: 1777527540,
                updated_at: 1777527644,
              },
            ])
          }
          return '[]'
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    const created = await mod.createKanbanCard({ title: 'Created Hermes task', spec: 'Task body', assignedWorker: 'swarm6', status: 'backlog' })
    const updated = await mod.updateKanbanCard('t_deadbeef', { title: 'Updated Hermes task', status: 'done', assignedWorker: 'swarm6' })

    expect(created).toMatchObject({ id: 't_deadbeef', title: 'Created Hermes task', status: 'backlog', assignedWorker: 'swarm6', createdBy: 'claude-kanban' })
    expect(updated).toMatchObject({ id: 't_deadbeef', title: 'Updated Hermes task', status: 'done', assignedWorker: 'swarm6' })
    expect(sqliteCalls.every((call) => call.startsWith('/Users/aurora/.claude/kanban.db '))).toBe(true)
    expect(sqliteCalls.some((call) => call.includes('insert into tasks'))).toBe(true)
    expect(sqliteCalls.some((call) => call.includes('update tasks set'))).toBe(true)
  })

  it('projects native Kanban tasks without collapsing statuses or dependency/run metadata', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_KANBAN_BACKEND', 'claude')
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.claude/kanban.db',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'claude') throw new Error('not found')
        if (command === 'sqlite3') {
          return JSON.stringify([
            {
              id: 't_child',
              title: 'Native child task',
              body: 'Use native board state',
              status: 'todo',
              assignee: 'temujin',
              created_at: 1777527540,
              updated_at: 1777527644,
              parents_json: '["t_parent"]',
              children_json: '["t_leaf"]',
              latest_run_summary: 'patched adapter',
            },
          ])
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    const [card] = await mod.listKanbanCards()

    expect(card).toMatchObject({
      id: 't_child',
      status: 'todo',
      parents: ['t_parent'],
      children: ['t_leaf'],
      latestRun: { summary: 'patched adapter' },
      source: 'native-kanban',
    })
  })

  it('creates native Kanban tasks with parent links and idempotency without using Workspace board files', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.claude/profiles/swarm2')
    vi.stubEnv('CLAUDE_KANBAN_BACKEND', 'claude')
    const sqliteCalls: string[] = []
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.claude/kanban.db',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'claude') throw new Error('not found')
        if (command === 'sqlite3') {
          sqliteCalls.push(args.join(' '))
          const sql = args[2] ?? ''
          if (sql.includes('where idempotency_key =')) return '[]'
          if (sql.includes('where id in')) return JSON.stringify([{ id: 't_parent', status: 'done' }])
          if (sql.includes('where id =')) {
            return JSON.stringify([
              {
                id: 't_created',
                title: 'Native dispatch',
                body: 'Dispatch body',
                status: 'ready',
                assignee: 'temujin',
                created_at: 1777527540,
                updated_at: 1777527540,
                parents_json: '["t_parent"]',
                children_json: '[]',
              },
            ])
          }
          return '[]'
        }
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    const created = await mod.createKanbanCard({
      title: 'Native dispatch',
      spec: 'Dispatch body',
      assignedWorker: 'temujin',
      status: 'ready',
      parents: ['t_parent'],
      idempotencyKey: 'native-dispatch-1',
    } as any)

    expect(created).toMatchObject({
      id: 't_created',
      status: 'ready',
      parents: ['t_parent'],
      source: 'native-kanban',
    })
    expect(sqliteCalls.some((call) => call.includes('begin immediate') && call.includes('commit'))).toBe(true)
    expect(sqliteCalls.some((call) => call.includes('task_links') && call.includes('t_parent'))).toBe(true)
    expect(sqliteCalls.some((call) => call.includes('idempotency_key') && call.includes('native-dispatch-1'))).toBe(true)
    expect(sqliteCalls.every((call) => !call.includes('swarm2-kanban.json'))).toBe(true)
  })
})
