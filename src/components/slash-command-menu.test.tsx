import { describe, expect, it } from 'vitest'

import { DEFAULT_SLASH_COMMANDS } from './slash-command-menu'

describe('DEFAULT_SLASH_COMMANDS', () => {
  it('includes /plugins in the slash autocomplete list', () => {
    const plugin = DEFAULT_SLASH_COMMANDS.find((item) => item.command === '/plugins')

    expect(plugin).toBeTruthy()
    expect(plugin?.description).toBe('List installed plugins and their status')
  })
})
