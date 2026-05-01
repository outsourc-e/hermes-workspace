import { describe, expect, it } from 'vitest'
import { createRemoteStatus, remoteUrlMatchesExpectedRepo } from './claude-update'

describe('claude update repo gating', () => {
  it('matches Claude workspace repo aliases', () => {
    expect(remoteUrlMatchesExpectedRepo('https://github.com/example/claude-workspace.git', ['claude-workspace'])).toBe(true)
    expect(remoteUrlMatchesExpectedRepo('git@github.com:outsourc-e/claude-workspace.git', ['outsourc-e/claude-workspace'])).toBe(true)
  })

  it('blocks update availability for wrong remote repos even when heads differ', () => {
    const status = createRemoteStatus({
      name: 'origin',
      label: 'Claude Workspace',
      expectedRepo: 'claude-workspace',
      aliases: ['claude-workspace'],
      url: 'https://github.com/example/not-workspace.git',
      currentHead: 'local',
      remoteHead: 'remote',
    })

    expect(status.repoMatches).toBe(false)
    expect(status.updateAvailable).toBe(false)
    expect(status.error).toContain('expected claude-workspace')
  })

  it('allows update availability only for the expected repo with a newer remote head', () => {
    const status = createRemoteStatus({
      name: 'upstream',
      label: 'Claude Agent',
      expectedRepo: 'claude-agent',
      aliases: ['claude-agent'],
      url: 'https://github.com/NousResearch/claude-agent.git',
      currentHead: 'local',
      remoteHead: 'remote',
    })

    expect(status.repoMatches).toBe(true)
    expect(status.updateAvailable).toBe(true)
    expect(status.error).toBeNull()
  })
})
