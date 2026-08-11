import { describe, expect, it } from 'vitest'


import { capabilityMatrix } from './provider-runtime-control-plane'
import {
  filterRuntimeRuns,
  paginateRuntimeRuns,
  projectRuntimeRun,
  projectRuntimeRuns,
  sortRuntimeRuns,
  summarizeRuntimeRuns,
} from './runtime-run-projection'
import type { ProviderRuntimeRecord } from './provider-runtime-control-plane'

function runtime(overrides: Partial<ProviderRuntimeRecord> = {}): ProviderRuntimeRecord {
  return {
    runtimeId: 'codex:thread-1234567890abcdef',
    kind: 'codex_thread',
    routeRef: 'openai-codex/gpt-5.6-sol',
    accountAlias: 'openai-codex',
    externalId: 'thread-1234567890abcdef',
    model: 'gpt-5.6-sol',
    cwd: 'C:/work/Workspace',
    worktree: 'C:/work/Workspace',
    hostKind: 'stdio',
    hostStatus: 'idle',
    capabilities: capabilityMatrix('codex_thread', 'win32'),
    lease: null,
    parentRuntimeId: null,
    kanbanTaskId: null,
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  }
}

describe('provider-neutral runtime run projection', () => {
  it('projects all providers, safe titles, paths, ownership, and current capability policy', () => {
    const codex = projectRuntimeRun(runtime(), 1_000)
    expect(codex).toMatchObject({
      id: 'codex:thread-1234567890abcdef',
      source: 'provider-runtime',
      provider: 'codex',
      runtimeKind: 'codex_thread',
      nativeId: 'thread-1234567890abcdef',
      shortId: 'thread-12345',
      account: 'openai-codex',
      accountKey: 'openai-codex',
      project: 'Workspace',
      worktree: 'C:/work/Workspace',
      cwd: 'C:/work/Workspace',
      state: 'idle',
      linked: false,
      stalenessMs: 800,
      ownership: { state: 'free', owner: null, expiresAt: null, abandoned: false },
    })
    expect(codex.title).toBe('Workspace · Codex thread')
    expect(codex.capabilities.fork).toMatchObject({ state: 'unsupported', invokable: false })
    expect(codex.capabilities.fork.explanation.toLowerCase()).toContain('recovery')
    expect(codex.capabilities.steer.invokable).toBe(false)
    expect(codex.capabilities.attach).toMatchObject({ state: 'unsupported', invokable: false })
    expect(codex.capabilities.resume.invokable).toBe(true)
    expect(codex.capabilities.archive.invokable).toBe(true)

    const claude = projectRuntimeRun(runtime({
      runtimeId: 'claude:cwm4tx:session-1', kind: 'claude_session', accountAlias: 'cwm4tx',
      externalId: 'session-1', routeRef: 'claude-cwm4tx/opus-5', hostKind: 'external', hostStatus: 'running',
      worktree: 'D:\\Design\\Auth', cwd: 'D:\\Design\\Auth', kanbanTaskId: 'AUTH-14',
      capabilities: capabilityMatrix('claude_session', 'linux'),
      lease: { owner: 'workspace-1', acquiredAt: 10, expiresAt: 2_000 },
    }), 1_000)
    expect(claude).toMatchObject({ provider: 'claude', project: 'Auth', state: 'active', linked: true })
    expect(claude.title).toBe('AUTH-14 · Auth')
    expect(claude.ownership).toMatchObject({ state: 'owned', owner: 'workspace-1' })
    expect(claude.capabilities.archive).toMatchObject({ state: 'unsupported', invokable: false })
    expect(claude.capabilities.send).toMatchObject({ state: 'unsupported', invokable: false })
    expect(claude.capabilities.discoverPeers).toMatchObject({ state: 'unsupported', invokable: false })
    expect(claude.capabilities.attach.invokable).toBe(true)

    const hermes = projectRuntimeRun(runtime({
      runtimeId: 'hermes:orchestrator', kind: 'hermes_profile', accountAlias: 'orchestrator', externalId: 'orchestrator',
      routeRef: null, model: null, cwd: '/srv/workspace', worktree: '/srv/workspace', hostKind: 'native', hostStatus: 'unknown',
      capabilities: capabilityMatrix('hermes_profile', 'linux'),
      lease: { owner: 'dead-owner', acquiredAt: 1, expiresAt: 10, abandoned: true },
    }), 1_000)
    expect(hermes).toMatchObject({ provider: 'hermes', project: 'workspace', state: 'attention' })
    expect(hermes.ownership).toMatchObject({ state: 'recoverable', abandoned: true })
    for (const operation of ['create', 'resume', 'fork', 'send', 'steer', 'interrupt', 'archive', 'attach', 'discoverPeers', 'crossSessionMessage'] as const) {
      expect(hermes.capabilities[operation], operation).toMatchObject({ state: 'unsupported', invokable: false })
    }
    expect(hermes.capabilities.status.invokable).toBe(true)
    expect(hermes.capabilities.list.invokable).toBe(true)

    const staleHermesKind = projectRuntimeRun({
      ...runtime({
        runtimeId: 'hermes:worker-a', externalId: 'worker-a', capabilities: capabilityMatrix('hermes_profile', 'win32'),
      }),
      kind: 'stale_kind',
    } as unknown as ProviderRuntimeRecord, 1_000)
    expect(staleHermesKind.provider).toBe('hermes')
    expect(staleHermesKind.capabilities.resume).toMatchObject({ state: 'unsupported', invokable: false })
    expect(staleHermesKind.capabilities.archive).toMatchObject({ state: 'unsupported', invokable: false })

    const staleCodexKind = projectRuntimeRun({
      ...runtime({
        runtimeId: 'codex:thread-future', externalId: 'thread-future', capabilities: capabilityMatrix('codex_thread', 'win32'),
      }),
      kind: 'future_kind',
    } as unknown as ProviderRuntimeRecord, 1_000)
    expect(staleCodexKind.provider).toBe('codex')
    expect(staleCodexKind.capabilities.resume).toMatchObject({ state: 'unsupported', invokable: false })
    expect(staleCodexKind.capabilities.archive).toMatchObject({ state: 'unsupported', invokable: false })

    const abandonedDuringGrace = projectRuntimeRun(runtime({
      runtimeId: 'codex:abandoned-grace', externalId: 'abandoned-grace', hostStatus: 'idle',
      lease: { owner: 'dead-owner', acquiredAt: 1, expiresAt: 2_000, abandoned: true },
    }), 1_000)
    expect(abandonedDuringGrace).toMatchObject({
      state: 'attention',
      ownership: { state: 'unknown', owner: 'dead-owner', expiresAt: 2_000, abandoned: true },
    })

    const expiredButUnverified = projectRuntimeRun(runtime({
      runtimeId: 'codex:expired', externalId: 'expired', hostStatus: 'idle',
      lease: { owner: 'possibly-live', acquiredAt: 1, expiresAt: 10, processId: 4242 },
    }), 1_000)
    expect(expiredButUnverified).toMatchObject({
      state: 'attention',
      ownership: { state: 'unknown', owner: 'possibly-live', expiresAt: 10, abandoned: false },
    })
  })

  it('never projects prompt, transcript, argv, token, or credential fields', () => {
    const unsafe = {
      ...runtime(),
      prompt: 'secret prompt', transcript: 'secret transcript', argv: ['secret'], token: 'secret', credential: 'secret',
    } as ProviderRuntimeRecord
    const projected = JSON.stringify(projectRuntimeRun(unsafe, 1_000)).toLowerCase()
    for (const forbidden of ['secret prompt', 'secret transcript', 'argv', 'token', 'credential']) {
      expect(projected).not.toContain(forbidden)
    }
  })

  it('combines filters, stable sorting, pagination, and honest summaries', () => {
    const runs = [
      projectRuntimeRun(runtime({ runtimeId: 'codex:z', externalId: 'z', updatedAt: 400 }), 1_000),
      projectRuntimeRun(runtime({ runtimeId: 'codex:a', externalId: 'a', updatedAt: 400, kanbanTaskId: 'TASK-1' }), 1_000),
      projectRuntimeRun(runtime({ runtimeId: 'claude:gp:c', kind: 'claude_session', accountAlias: 'gp', externalId: 'c', routeRef: 'claude-gp/opus-5', hostStatus: 'running', capabilities: capabilityMatrix('claude_session', 'win32'), updatedAt: 900 }), 1_000),
      projectRuntimeRun(runtime({ runtimeId: 'hermes:h', kind: 'hermes_profile', accountAlias: 'orchestrator', externalId: 'h', routeRef: null, hostStatus: 'unknown', capabilities: capabilityMatrix('hermes_profile', 'win32'), updatedAt: 100 }), 1_000),
    ]
    expect(filterRuntimeRuns(runs, { provider: ['codex'], linked: 'linked', query: 'task-1' }).map((run) => run.id)).toEqual(['codex:a'])
    expect(filterRuntimeRuns(runs, {
      account: ['openai-codex'], project: ['workspace'], kanbanTaskId: 'TASK-1',
      updatedFrom: 300, updatedTo: 500,
    }).map((run) => run.id)).toEqual(['codex:a'])
    expect(sortRuntimeRuns(runs.slice(0, 2), 'updated', 'desc').map((run) => run.id)).toEqual(['codex:a', 'codex:z'])
    expect(paginateRuntimeRuns(runs, 2, 2)).toMatchObject({ total: 4, page: 2, pageSize: 2, pages: 2, items: [{ id: 'claude:gp:c' }, { id: 'hermes:h' }] })
    expect(summarizeRuntimeRuns(runs, 1_000)).toMatchObject({
      total: 4, active: 1, idleResumable: 2, attention: 1, unlinkedKanban: 3,
      unknownOwnership: 0,
      byProvider: { codex: 2, claude: 1, hermes: 1 },
    })
  })

  it('projects and paginates a bounded 5,000-record inventory without expanding row payloads', () => {
    const records = Array.from({ length: 5_000 }, (_, index) => runtime({
      runtimeId: `codex:thread-${String(index).padStart(4, '0')}`,
      externalId: `thread-${String(index).padStart(4, '0')}`,
      updatedAt: index,
    }))
    const runs = projectRuntimeRuns(records, 6_000, 5_000)
    expect(runs).toHaveLength(5_000)
    const page = paginateRuntimeRuns(sortRuntimeRuns(runs, 'updated', 'desc'), 50, 100)
    expect(page).toMatchObject({ page: 50, pageSize: 100, total: 5_000, pages: 50, hasPrevious: true, hasNext: false })
    expect(page.items).toHaveLength(100)
    expect(Object.hasOwn(page.items[0], 'prompt')).toBe(false)
  })
})
