import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const FILES = [
  'src/components/dashboard-overflow-panel.tsx',
  'src/components/command-palette.tsx',
  'src/components/mobile-hamburger-menu.tsx',
  'src/components/mobile-tab-bar.tsx',
  'src/components/inspector/inspector-panel.tsx',
  'src/components/slash-command-menu.tsx',
  'src/components/search/search-modal.tsx',
  'src/components/workspace-shell.tsx',
] as const

describe('MCP nav registration', () => {
  for (const relPath of FILES) {
    it(`${relPath} registers an MCP entry`, () => {
      const source = readFileSync(resolve(process.cwd(), relPath), 'utf8')
      // Most surfaces register the route path "/mcp"; the inspector panel
      // registers an "mcp" tab id rather than a route.
      const matchesRoute = /['"`]\/mcp['"`]/.test(source)
      const matchesTabId =
        relPath.endsWith('inspector-panel.tsx') &&
        /id:\s*['"`]mcp['"`]/.test(source)
      expect(matchesRoute || matchesTabId).toBe(true)
    })
  }
})
