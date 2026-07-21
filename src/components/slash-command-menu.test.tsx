import { describe, expect, it } from 'vitest'

import { DEFAULT_SLASH_COMMANDS, mergeSlashCommands } from './slash-command-menu'

describe('DEFAULT_SLASH_COMMANDS', () => {
  it('includes /plugins in the slash autocomplete list', () => {
    const plugin = DEFAULT_SLASH_COMMANDS.find(
      (item) => item.command === '/plugins',
    )

    expect(plugin).toBeTruthy()
    expect(plugin?.description).toBe('List installed plugins and their status')
  })

  it('exposes the core slash commands users expect', () => {
    const commands = DEFAULT_SLASH_COMMANDS.map((entry) => entry.command)
    for (const required of [
      '/new',
      '/clear',
      '/model',
      '/save',
      '/skills',
      '/plugins',
      '/skin',
      '/help',
    ]) {
      expect(commands).toContain(required)
    }
  })

  it('defines a non-empty description for every entry', () => {
    for (const entry of DEFAULT_SLASH_COMMANDS) {
      expect(entry.command.startsWith('/')).toBe(true)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })

  it('does not duplicate any command label', () => {
    const seen = new Set<string>()
    for (const entry of DEFAULT_SLASH_COMMANDS) {
      expect(seen.has(entry.command)).toBe(false)
      seen.add(entry.command)
    }
  })
})

describe('mergeSlashCommands', () => {
  it('appends installed skills without replacing built-ins', () => {
    const merged = mergeSlashCommands(DEFAULT_SLASH_COMMANDS, [
      {
        command: '/hermes-agent',
        description: 'Complete guide to using and extending Hermes Agent',
      },
    ])

    expect(merged.map((entry) => entry.command)).toContain('/new')
    expect(merged.map((entry) => entry.command)).toContain('/hermes-agent')
  })

  it('deduplicates by command label and keeps the first definition', () => {
    const merged = mergeSlashCommands(DEFAULT_SLASH_COMMANDS, [
      {
        command: '/skills',
        description: 'Conflicting duplicate that should be ignored',
      },
    ])

    expect(merged.filter((entry) => entry.command === '/skills')).toHaveLength(1)
    expect(
      merged.find((entry) => entry.command === '/skills')?.description,
    ).toBe('Browse and manage skills')
  })
})
