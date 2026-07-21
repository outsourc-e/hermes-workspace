import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getWorkspaceNavigationItems,
  getWorkspaceRoute,
} from '@/lib/workspace-navigation'

const DIRECT_MCP_SURFACES = [
  'src/components/dashboard-overflow-panel.tsx',
  'src/components/command-palette.tsx',
  'src/components/inspector/inspector-panel.tsx',
  'src/components/slash-command-menu.tsx',
  'src/components/search/search-modal.tsx',
] as const

function sourceOf(relPath: string) {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

describe('MCP navigation registration', () => {
  it('registers MCP once in the canonical Advanced navigation contract', () => {
    expect(getWorkspaceRoute('mcp')).toMatchObject({
      to: '/mcp',
      section: 'advanced',
      owner: 'system',
      visibility: 'advanced',
    })
    expect(getWorkspaceNavigationItems('desktop').map((route) => route.id)).toContain(
      'mcp',
    )
    expect(
      getWorkspaceNavigationItems('mobile-menu').map((route) => route.id),
    ).toContain('mcp')
    expect(
      getWorkspaceNavigationItems('mobile-tabs').map((route) => route.id),
    ).not.toContain('mcp')
  })

  for (const relPath of DIRECT_MCP_SURFACES) {
    it(`${relPath} keeps its direct MCP entry`, () => {
      const source = sourceOf(relPath)
      const matchesRoute = /['"`]\/mcp['"`]/.test(source)
      const matchesTabId =
        relPath.endsWith('inspector-panel.tsx') &&
        /id:\s*['"`]mcp['"`]/.test(source)
      expect(matchesRoute || matchesTabId).toBe(true)
    })
  }

  it('derives mobile navigation from the central registry', () => {
    for (const relPath of [
      'src/components/mobile-hamburger-menu.tsx',
      'src/components/mobile-tab-bar.tsx',
    ]) {
      expect(sourceOf(relPath)).toContain('getWorkspaceNavigationItems')
    }
  })

  it('mounts the centralized mobile navigation models in WorkspaceShell', () => {
    const source = sourceOf('src/components/workspace-shell.tsx')
    expect(source).toContain('MOBILE_NAV_TABS')
    expect(source).toContain('<MobileHamburgerMenu')
  })
})
