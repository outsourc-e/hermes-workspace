import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listProfiles, readProfile, updateProfileConfig } from './profiles-browser'

describe('listProfiles', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-profiles-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
    delete process.env.HERMES_HOME
    delete process.env.CLAUDE_HOME
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('always includes the default profile even when a named profile is active', () => {
    const hermesRoot = path.join(tempHome, '.hermes')
    const profilesRoot = path.join(hermesRoot, 'profiles')
    const namedProfileRoot = path.join(profilesRoot, 'jarvis')

    fs.mkdirSync(namedProfileRoot, { recursive: true })
    fs.writeFileSync(path.join(hermesRoot, 'active_profile'), 'jarvis\n', 'utf-8')
    fs.writeFileSync(
      path.join(hermesRoot, 'config.yaml'),
      'model: default-model\ndescription: Default operator\n',
      'utf-8',
    )
    fs.writeFileSync(
      path.join(namedProfileRoot, 'config.yaml'),
      'model: named-model\ndescription: Named operator\n',
      'utf-8',
    )

    const profiles = listProfiles()
    const names = profiles.map((profile) => profile.name)

    expect(names).toContain('default')
    expect(names).toContain('jarvis')
    expect(profiles.find((profile) => profile.name === 'default')?.active).toBe(false)
    expect(profiles.find((profile) => profile.name === 'jarvis')?.active).toBe(true)
    expect(profiles.find((profile) => profile.name === 'default')?.description).toBe('Default operator')
    expect(profiles.find((profile) => profile.name === 'jarvis')?.description).toBe('Named operator')
  })

  it('reads and updates profile descriptions from config.yaml', () => {
    const hermesRoot = path.join(tempHome, '.hermes')
    const profileRoot = path.join(hermesRoot, 'profiles', 'builder')

    fs.mkdirSync(profileRoot, { recursive: true })
    fs.writeFileSync(
      path.join(profileRoot, 'config.yaml'),
      'model: named-model\ndescription: Initial description\n',
      'utf-8',
    )

    expect(readProfile('builder').description).toBe('Initial description')

    updateProfileConfig('builder', { description: 'Updated description' })
    expect(readProfile('builder').description).toBe('Updated description')

    updateProfileConfig('builder', { description: null })
    expect(readProfile('builder').description).toBe('')
  })
})
