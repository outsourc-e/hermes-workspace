import { describe, expect, it } from 'vitest'
import { buildAgentLaneRegistry } from './agent-lane-registry'
import type { AgentLaneRegistryInput } from './agent-lane-registry'

const NOW = '2026-07-09T12:00:00.000Z'

function minutesAgo(minutes: number): string {
  return new Date(Date.parse(NOW) - minutes * 60_000).toISOString()
}

function baseInput(
  partial: Partial<AgentLaneRegistryInput> = {},
): AgentLaneRegistryInput {
  return {
    now: NOW,
    hermes: null,
    claude: null,
    codex: null,
    cursor: null,
    subagents: null,
    handoff: null,
    ...partial,
  }
}

function lane(input: AgentLaneRegistryInput, id: string) {
  const registry = buildAgentLaneRegistry(input)
  return registry.lanes.find((entry) => entry.id === id)
}

describe('buildAgentLaneRegistry', () => {
  it('always returns the control tower plus the four worker lanes', () => {
    const registry = buildAgentLaneRegistry(baseInput())
    expect(registry.lanes.map((entry) => entry.id)).toEqual([
      'nova-hermes',
      'claude-code',
      'codex',
      'cursor-grok',
      'hermes-subagents',
    ])
    expect(registry.lanes[0].role).toBe('control-tower')
    expect(registry.lanes.slice(1).every((entry) => entry.role === 'worker')).toBe(
      true,
    )
  })

  it('reports hermes offline with a blocker when the gateway is down', () => {
    const tower = lane(baseInput({ hermes: { reachable: false, model: null, provider: null, activeRuns: 0, lastHeartbeatAt: null } }), 'nova-hermes')
    expect(tower?.status).toBe('offline')
    expect(tower?.blocker).toMatch(/gateway/i)
  })

  it('reports hermes active with its live route while runs execute', () => {
    const tower = lane(
      baseInput({
        hermes: {
          reachable: true,
          model: 'gpt-5.5',
          provider: 'openai-codex',
          activeRuns: 2,
          lastHeartbeatAt: minutesAgo(1),
        },
      }),
      'nova-hermes',
    )
    expect(tower?.status).toBe('active')
    expect(tower?.model).toBe('gpt-5.5')
    expect(tower?.blocker).toBeNull()
  })

  it('marks claude active on a fresh session file plus a live process', () => {
    const claude = lane(
      baseInput({
        claude: {
          homeExists: true,
          newestSessionAt: minutesAgo(5),
          newestSessionProject: 'C--Projects-nova-cockpit',
          processCount: 1,
        },
      }),
      'claude-code',
    )
    expect(claude?.status).toBe('active')
    expect(claude?.workspace).toContain('nova-cockpit')
    expect(claude?.heartbeatAt).toBe(minutesAgo(5))
  })

  it('downgrades claude to idle when the evidence is stale but the app runs', () => {
    const claude = lane(
      baseInput({
        claude: {
          homeExists: true,
          newestSessionAt: minutesAgo(240),
          newestSessionProject: 'C--Projects-nova-cockpit',
          processCount: 1,
        },
      }),
      'claude-code',
    )
    expect(claude?.status).toBe('idle')
  })

  it('shows cursor as setup-needed when not installed and never invents a model', () => {
    const cursor = lane(baseInput({ cursor: { installed: false, processCount: 0 } }), 'cursor-grok')
    expect(cursor?.status).toBe('setup-needed')
    expect(cursor?.model).toBeNull()
    expect(cursor?.detail).toMatch(/not installed/i)
  })

  it('shows cursor offline when installed but not running', () => {
    const cursor = lane(baseInput({ cursor: { installed: true, processCount: 0 } }), 'cursor-grok')
    expect(cursor?.status).toBe('offline')
  })

  it('feeds codex from handoff bus evidence', () => {
    const codex = lane(
      baseInput({
        codex: { homeExists: true, newestSessionAt: minutesAgo(10), processCount: 0 },
        handoff: {
          latestDir: 'nova-project-2026-07-06',
          latestReadmeAt: minutesAgo(600),
        },
      }),
      'codex',
    )
    expect(codex?.status).toBe('active')
    expect(codex?.activeTask).toContain('nova-project-2026-07-06')
  })

  it('reports subagent lane from real mission counts', () => {
    const subs = lane(
      baseInput({
        subagents: { missions: 3, activeAssignments: 2, blocked: 1, newestUpdateAt: minutesAgo(3) },
      }),
      'hermes-subagents',
    )
    expect(subs?.status).toBe('active')
    expect(subs?.blocker).toMatch(/1 blocked/i)
  })

  it('reports unknown lanes honestly when no evidence source is readable', () => {
    const registry = buildAgentLaneRegistry(baseInput())
    const claude = registry.lanes.find((entry) => entry.id === 'claude-code')
    expect(claude?.status).toBe('unknown')
    expect(claude?.detail).toMatch(/no evidence/i)
  })

  it('never claims a lastPrompt without evidence and gates every lane on approval policy', () => {
    const registry = buildAgentLaneRegistry(baseInput())
    expect(registry.lanes.every((entry) => entry.lastPrompt === null)).toBe(true)
    expect(
      registry.lanes.every((entry) => entry.approvalState.length > 0),
    ).toBe(true)
  })
})
