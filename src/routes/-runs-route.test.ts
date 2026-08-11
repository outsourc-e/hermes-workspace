import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Runs top-level route and navigation', () => {
  it('defines a client-only /runs route with a Runs page title and safe search validation', () => {
    const source = read('src/routes/runs.tsx')
    expect(source).toContain("createFileRoute('/runs')")
    expect(source).toContain('ssr: false')
    expect(source).toContain("usePageTitle('Runs')")
    expect(source).toContain('validateSearch')
    expect(source).toContain('Loading runs...')
  })

  it('adds Runs immediately after Operations in desktop and mobile drawer navigation', () => {
    const desktop = read('src/screens/chat/components/chat-sidebar.tsx')
    const mobile = read('src/components/mobile-hamburger-menu.tsx')
    expect(desktop.indexOf("to: '/runs'")).toBeGreaterThan(desktop.indexOf("to: '/operations'"))
    expect(desktop.indexOf("to: '/runs'")).toBeLessThan(desktop.indexOf("to: '/swarm'"))
    expect(mobile.indexOf("to: '/runs'")).toBeGreaterThan(mobile.indexOf("to: '/operations'"))
    expect(mobile.indexOf("to: '/runs'")).toBeLessThan(mobile.indexOf("to: '/swarm'"))
  })

  it('keeps Runs out of the overcrowded mobile pill tab bar', () => {
    const source = read('src/components/mobile-tab-bar.tsx')
    expect(source).not.toContain("id: 'runs'")
    expect(source).not.toContain("to: '/runs'")
  })

  it('recognizes Runs in the workspace shell mobile title and route ordering', () => {
    const source = read('src/components/workspace-shell.tsx')
    expect(source).toContain("pathname.startsWith('/runs')")
    expect(source).toContain("return 'Runs'")
  })
})
