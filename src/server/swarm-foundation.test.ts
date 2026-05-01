import { describe, expect, it } from 'vitest'
import {
  buildSwarmDispatchMetadata,
  buildSwarmSessionMetadata,
  classifySwarmPluginBoundary,
  deriveSwarmBoundary,
  normalizeSwarmRuntime,
  parseSwarmPluginManifest,
} from './swarm-foundation'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

describe('normalizeSwarmRuntime', () => {
  it('fills legacy or sparse runtime.json values with stable defaults', () => {
    const runtime = normalizeSwarmRuntime(
      'swarm7',
      {
        currentTask: 'Implement registry contract',
        cwd: '/tmp/project-a',
        needsHuman: true,
        assignedTaskCount: 2,
      },
      { workspaceRoot: '/tmp' },
    )

    expect(runtime.workerId).toBe('swarm7')
    expect(runtime.role).toBe('swarm-worker')
    expect(runtime.state).toBe('idle')
    expect(runtime.phase).toBe('unknown')
    expect(runtime.currentTask).toBe('Implement registry contract')
    expect(runtime.needsHuman).toBe(true)
    expect(runtime.boundary.owner).toBe('workspace')
    expect(runtime.boundary.relativeCwd).toBe('project-a')
    expect(runtime.tasks).toEqual([])
    expect(runtime.artifacts).toEqual([])
    expect(runtime.previews).toEqual([])
  })
})

describe('classifySwarmPluginBoundary', () => {
  it('treats read-only runtime plugins differently from control plugins', () => {
    expect(classifySwarmPluginBoundary({ runtimeScopes: ['worker-runtime:read'] })).toBe('runtime-readonly')
    expect(classifySwarmPluginBoundary({ runtimeScopes: ['worker-dispatch:send'] })).toBe('runtime-control')
    expect(
      classifySwarmPluginBoundary({
        runtimeScopes: ['worker-dispatch:send'],
        workspaceScopes: ['workspace-ui:register'],
      }),
    ).toBe('hybrid')
    expect(classifySwarmPluginBoundary({ workspaceScopes: ['workspace-ui:register'] })).toBe('workspace-only')
  })
})

describe('deriveSwarmBoundary', () => {
  it('marks external cwd values as outside the workspace boundary', () => {
    const boundary = deriveSwarmBoundary('/opt/other-project', '/Users/aurora/claude-workspace')
    expect(boundary.insideWorkspace).toBe(false)
    expect(boundary.owner).toBe('external')
    expect(boundary.relativeCwd).toBeNull()
  })
})

describe('buildSwarmSessionMetadata', () => {
  it('infers history and transport from the persistent worker profile surface', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-session-'))
    fs.writeFileSync(path.join(tempDir, 'state.db'), '', 'utf8')

    try {
      const runtime = normalizeSwarmRuntime('swarm2', {}, { workspaceRoot: '/tmp' })
      const session = buildSwarmSessionMetadata({
        workerId: 'swarm2',
        profilePath: tempDir,
        runtime,
        tmuxSession: 'swarm-swarm2',
        terminalKind: 'tmux',
        recentLogTail: 'latest output',
        lastSessionStartedAt: 123,
        logPath: path.join(tempDir, 'logs', 'agent.log'),
      })

      expect(session.sessionId).toBe('swarm-swarm2')
      expect(session.sessionTitle).toBe('Claude worker swarm2')
      expect(session.historySource).toBe('state.db')
      expect(session.transport).toBe('tmux')
      expect(session.terminalKind).toBe('tmux')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe('buildSwarmDispatchMetadata', () => {
  it('prefers live tmux delivery when the worker has a live session', () => {
    const runtime = normalizeSwarmRuntime(
      'swarm3',
      {
        lastDispatchAt: 42,
        lastDispatchMode: 'tmux',
        lastDispatchResult: 'delivered',
      },
      { workspaceRoot: '/tmp' },
    )

    expect(
      buildSwarmDispatchMetadata({
        runtime,
        tmuxAttachable: true,
        wrapperExists: true,
      }),
    ).toEqual({
      preferredDelivery: 'tmux',
      supportsLiveDispatch: true,
      supportsOneShotDispatch: true,
      lastDispatchAt: 42,
      lastDispatchMode: 'tmux',
      lastDispatchResult: 'delivered',
    })
  })
})

describe('parseSwarmPluginManifest', () => {
  it('parses plugin boundary and scopes from manifest yaml', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-plugin-'))
    const pluginDir = path.join(tempDir, 'sample-plugin')
    fs.mkdirSync(pluginDir, { recursive: true })
    const manifestPath = path.join(pluginDir, 'plugin.yaml')
    fs.writeFileSync(
      manifestPath,
      [
        'name: sample-plugin',
        'version: 0.1.0',
        'description: Sample swarm runtime plugin',
        'runtimeScopes:',
        '  - worker-runtime:read',
        '  - worker-dispatch:send',
        'workspaceScopes:',
        '  - workspace-ui:register',
        'workerScopes:',
        '  - swarm2',
      ].join('\n'),
      'utf8',
    )

    try {
      const parsed = parseSwarmPluginManifest({ manifestPath, source: 'project' })
      expect(parsed.name).toBe('sample-plugin')
      expect(parsed.boundary).toBe('hybrid')
      expect(parsed.runtimeScopes).toContain('worker-dispatch:send')
      expect(parsed.workspaceScopes).toContain('workspace-ui:register')
      expect(parsed.workerScopes).toEqual(['swarm2'])
      expect(parsed.validationErrors).toEqual([])
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
