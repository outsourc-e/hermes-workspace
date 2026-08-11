import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Operations runtime information hierarchy', () => {
  it('keeps the persistent agent roster above the bounded runtime-health summary', () => {
    const source = readFileSync('src/screens/agents/operations-screen.tsx', 'utf8')
    const bus = source.indexOf('<AgentBusPanel />')
    const roster = source.indexOf('agents.map((agent, index)')
    const health = source.indexOf('<RuntimeHealthCard />')
    const activity = source.indexOf('Recent Activity')
    expect(bus).toBeGreaterThan(-1)
    expect(roster).toBeGreaterThan(bus)
    expect(health).toBeGreaterThan(roster)
    expect(activity).toBeGreaterThan(health)
    expect(source).not.toContain('<ProviderRuntimePanel />')
  })
})
