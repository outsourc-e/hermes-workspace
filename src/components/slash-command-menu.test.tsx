import { describe, expect, it } from 'vitest'

import { DEFAULT_SLASH_COMMANDS } from './slash-command-menu'

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
