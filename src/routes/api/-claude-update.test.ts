import { describe, expect, it } from 'vitest'
import {
  createRemoteStatus,
  normalizeUpdateTarget,
  remoteUrlMatchesExpectedRepo,
} from './claude-update'

describe('claude update repo gating', () => {
  it('matches Claude workspace repo aliases', () => {
    expect(
      remoteUrlMatchesExpectedRepo(
        'https://github.com/example/hermes-workspace.git',
        ['hermes-workspace'],
      ),
    ).toBe(true)
    expect(
      remoteUrlMatchesExpectedRepo(
        'git@github.com:outsourc-e/hermes-workspace.git',
        ['outsourc-e/hermes-workspace'],
      ),
    ).toBe(true)
  })

  it('blocks update availability for wrong remote repos even when heads differ', () => {
    const status = createRemoteStatus({
      name: 'origin',
      label: 'Hermes Workspace',
      expectedRepo: 'hermes-workspace',
      aliases: ['hermes-workspace'],
      url: 'https://github.com/example/not-workspace.git',
      currentHead: 'local',
      remoteHead: 'remote',
    })

    expect(status.repoMatches).toBe(false)
    expect(status.updateAvailable).toBe(false)
    expect(status.error).toContain('expected hermes-workspace')
  })

  it('marks upstream changes as manual sync only', () => {
    const status = createRemoteStatus({
      name: 'upstream',
      label: 'Hermes Agent',
      expectedRepo: 'hermes-agent',
      aliases: ['hermes-agent'],
      url: 'https://github.com/NousResearch/hermes-agent.git',
      currentHead: 'local',
      remoteHead: 'remote',
    })

    expect(status.repoMatches).toBe(true)
    expect(status.autoUpdateSupported).toBe(false)
    expect(status.updateAvailable).toBe(false)
    expect(status.error).toContain('manual sync')
  })

  it('normalizes update targets to safe remote names', () => {
    expect(normalizeUpdateTarget('origin')).toBe('origin')
    expect(normalizeUpdateTarget('upstream')).toBe('upstream')
    expect(normalizeUpdateTarget('all')).toBe('all')
    expect(normalizeUpdateTarget('$(rm -rf /)')).toBe('origin')
  })
})
