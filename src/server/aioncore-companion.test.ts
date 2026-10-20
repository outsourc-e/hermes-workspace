import { describe, expect, it } from 'vitest'
import { normalizeExternalAgentRuntime } from './aioncore-companion'

describe('normalizeExternalAgentRuntime', () => {
  it('maps the public runtime fields and excludes unknown payload data', () => {
    const runtime = normalizeExternalAgentRuntime({
      id: '55f3ed1c',
      name: 'Hermes',
      backend: 'hermes',
      agent_type: 'acp',
      agent_source: 'builtin',
      enabled: true,
      installed: true,
      command: 'hermes',
      args: ['acp'],
      team_capable: true,
      status: 'online',
      last_check_status: 'online',
      last_check_latency_ms: 14248,
    })

    expect(runtime).toMatchObject({
      id: '55f3ed1c',
      name: 'Hermes',
      backend: 'hermes',
      agentType: 'acp',
      source: 'builtin',
      installed: true,
      command: 'hermes',
      args: ['acp'],
      teamCapable: true,
      status: 'online',
      lastCheckStatus: 'online',
      lastCheckLatencyMs: 14248,
    })
  })

  it('rejects rows without stable identity fields', () => {
    expect(normalizeExternalAgentRuntime({ name: 'No id' })).toBeNull()
    expect(normalizeExternalAgentRuntime({ id: 'no-name' })).toBeNull()
  })

  it('normalizes unexpected statuses safely', () => {
    expect(
      normalizeExternalAgentRuntime({
        id: 'custom',
        name: 'Custom',
        status: 'surprising',
      })?.status,
    ).toBe('unknown')
  })

  it('uses the latest connection check instead of the installed state', () => {
    expect(
      normalizeExternalAgentRuntime({
        id: 'aion',
        name: 'Aion CLI',
        status: 'online',
        last_check_status: 'offline',
      })?.status,
    ).toBe('offline')
  })
})
