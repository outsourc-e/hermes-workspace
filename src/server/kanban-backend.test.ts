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
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.hermes/profiles/swarm2')
    const sqliteCalls: Array<{ command: string; args?: string[] }> = []
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.hermes/kanban.db' || target === '/Users/aurora/.hermes/kanban',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'hermes') return '/Users/aurora/.local/bin/hermes\n'
        if (command === '/Users/aurora/.local/bin/hermes' && args[0] === '--version') return 'hermes 1.0.0\n'
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
      id: 'hermes',
      detected: true,
      writable: true,
      path: '/Users/aurora/.hermes/kanban.db',
    })

    const cards = mod.listKanbanCards()
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: 't_12345678',
      title: 'Hermes task',
      status: 'running',
      assignedWorker: 'swarm2',
      createdBy: 'hermes-kanban',
    })
    expect(sqliteCalls[0]?.args?.[0]).toBe('/Users/aurora/.hermes/kanban.db')
  })

  it('auto-detect uses Hermes storage directly when the CLI is unavailable', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.hermes/profiles/swarm2')
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.hermes/kanban.db',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'hermes') throw new Error('not found')
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
      id: 'hermes',
      detected: true,
      writable: true,
      path: '/Users/aurora/.hermes/kanban.db',
    })
    expect(mod.getKanbanBackendMeta().details).toContain('direct local storage access')
    expect(mod.listKanbanCards()[0]).toMatchObject({ id: 't_direct', status: 'ready' })
  })

  it('resolves canonical Kanban paths from legacy profile-home env fallback too', async () => {
    vi.stubEnv('CLAUDE_HOME', '/Users/aurora/.hermes/profiles/swarm5/home')
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.hermes/kanban.db',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'hermes') throw new Error('not found')
        if (command === 'sqlite3') return '[]'
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    expect(mod.getKanbanBackendMeta()).toMatchObject({
      id: 'hermes',
      detected: true,
      path: '/Users/aurora/.hermes/kanban.db',
    })
  })

  it('auto-detect falls back to local when canonical Hermes storage is missing', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.hermes/profiles/swarm2')
    const mod = await loadKanbanBackend({
      existsSync: () => false,
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'hermes') return '/Users/aurora/.local/bin/hermes\n'
        if (command === '/Users/aurora/.local/bin/hermes' && args[0] === '--version') return 'hermes 1.0.0\n'
        throw new Error(`Unexpected command: ${command} ${args.join(' ')}`)
      },
    })

    expect(mod.getKanbanBackendMeta()).toMatchObject({
      id: 'local',
      detected: true,
      writable: true,
      path: '/tmp/swarm2-kanban.json',
    })
    expect(mod.listKanbanCards()[0]?.id).toBe('local-1')
  })

  it('creates and updates Hermes tasks through canonical kanban.db path', async () => {
    vi.stubEnv('HERMES_HOME', '/Users/aurora/.hermes/profiles/swarm2')
    const sqliteCalls: string[] = []
    let readCount = 0
    const mod = await loadKanbanBackend({
      existsSync: (target) => target === '/Users/aurora/.hermes/kanban.db' || target === '/Users/aurora/.hermes/kanban',
      execFileSync: (command, args = []) => {
        if (command === 'which' && args[0] === 'hermes') return '/Users/aurora/.local/bin/hermes\n'
        if (command === '/Users/aurora/.local/bin/hermes' && args[0] === '--version') return 'hermes 1.0.0\n'
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

    const created = mod.createKanbanCard({ title: 'Created Hermes task', spec: 'Task body', assignedWorker: 'swarm6', status: 'backlog' })
    const updated = mod.updateKanbanCard('t_deadbeef', { title: 'Updated Hermes task', status: 'done', assignedWorker: 'swarm6' })

    expect(created).toMatchObject({ id: 't_deadbeef', title: 'Created Hermes task', status: 'backlog', assignedWorker: 'swarm6', createdBy: 'hermes-kanban' })
    expect(updated).toMatchObject({ id: 't_deadbeef', title: 'Updated Hermes task', status: 'done', assignedWorker: 'swarm6' })
    expect(sqliteCalls.every((call) => call.startsWith('/Users/aurora/.hermes/kanban.db '))).toBe(true)
    expect(sqliteCalls.some((call) => call.includes('insert into tasks'))).toBe(true)
    expect(sqliteCalls.some((call) => call.includes('update tasks set'))).toBe(true)
  })
})
