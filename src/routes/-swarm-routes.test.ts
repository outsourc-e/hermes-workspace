import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('canonical Agents route', () => {
  it('keeps /swarm client-only and renders the single Agents surface', () => {
    const source = readFileSync('src/routes/swarm.tsx', 'utf8')
    expect(source).toContain("createFileRoute('/swarm')")
    expect(source).toContain('ssr: false')
    expect(source).toContain('Swarm2Screen')
  })

  it('redirects the legacy /swarm2 alias to /swarm', () => {
    const source = readFileSync('src/routes/swarm2.tsx', 'utf8')
    expect(source).toContain("createFileRoute('/swarm2')")
    expect(source).toContain('redirectToCanonicalAgentsRoute')
    expect(source).toContain("to: '/swarm'")
    expect(source).toContain('replace: true')
    expect(source).not.toContain('Swarm2Screen')
  })
})
