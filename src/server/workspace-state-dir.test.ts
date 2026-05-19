import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getStateDir } from './workspace-state-dir'

describe('getStateDir', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clear workspace-specific override for clean tests
    delete process.env.HERMES_WORKSPACE_STATE_DIR
    // Clear hermes home chain too
    delete process.env.HERMES_HOME
    delete process.env.CLAUDE_HOME
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns HERMES_WORKSPACE_STATE_DIR when set', () => {
    process.env.HERMES_WORKSPACE_STATE_DIR = '/custom/state/dir'
    const result = getStateDir()
    expect(result).toBe('/custom/state/dir')
  })

  it('uses HERMES_HOME/workspace when HERMES_WORKSPACE_STATE_DIR is not set', () => {
    process.env.HERMES_HOME = '/custom/hermes'
    const result = getStateDir()
    expect(result).toBe('/custom/hermes/workspace')
  })

  it('falls back to CLAUDE_HOME/workspace when only CLAUDE_HOME is set', () => {
    process.env.CLAUDE_HOME = '/claude/home'
    const result = getStateDir()
    expect(result).toBe('/claude/home/workspace')
  })

  it('prefers HERMES_HOME over CLAUDE_HOME', () => {
    process.env.HERMES_HOME = '/hermes/home'
    process.env.CLAUDE_HOME = '/claude/home'
    const result = getStateDir()
    expect(result).toBe('/hermes/home/workspace')
  })

  it('prefers HERMES_WORKSPACE_STATE_DIR over everything', () => {
    process.env.HERMES_WORKSPACE_STATE_DIR = '/explicit/workspace'
    process.env.HERMES_HOME = '/hermes/home'
    const result = getStateDir()
    expect(result).toBe('/explicit/workspace')
  })

  it('trims whitespace from env values', () => {
    process.env.HERMES_WORKSPACE_STATE_DIR = '  /trimmed/path  '
    const result = getStateDir()
    expect(result).toBe('/trimmed/path')
  })
})
