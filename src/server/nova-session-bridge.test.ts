import { describe, expect, it } from 'vitest'
import { buildNovaSessionBridge } from './nova-session-bridge'
import type { NovaSessionBridgeInput } from './nova-session-bridge'

const NOW = '2026-07-09T12:00:00.000Z'

function baseInput(
  partial: Partial<NovaSessionBridgeInput> = {},
): NovaSessionBridgeInput {
  return {
    now: NOW,
    gatewayReachable: false,
    config: null,
    sessions: null,
    activeRuns: null,
    cron: null,
    approvals: null,
    recentEvents: null,
    ...partial,
  }
}

describe('buildNovaSessionBridge', () => {
  it('reports an unreachable gateway as a blocker with honest unavailable sources', () => {
    const bridge = buildNovaSessionBridge(baseInput())
    expect(bridge.blockers.some((entry) => /gateway/i.test(entry))).toBe(true)
    expect(bridge.route.provider).toBeNull()
    expect(bridge.session).toBeNull()
    expect(bridge.activeTask).toBeNull()
    expect(
      bridge.sources.every((source) => source.state !== 'ok'),
    ).toBe(true)
  })

  it('surfaces the live route from the gateway config', () => {
    const bridge = buildNovaSessionBridge(
      baseInput({
        gatewayReachable: true,
        config: { model: 'gpt-5.5', provider: 'openai-codex' },
      }),
    )
    expect(bridge.route.provider).toBe('openai-codex')
    expect(bridge.route.model).toBe('gpt-5.5')
    expect(bridge.blockers.some((entry) => /gateway/i.test(entry))).toBe(false)
  })

  it('picks the most recently active session and converts epoch seconds', () => {
    const bridge = buildNovaSessionBridge(
      baseInput({
        gatewayReachable: true,
        sessions: [
          {
            id: 'old',
            title: 'Old chat',
            model: 'gpt-5.5',
            started_at: 1780000000,
            last_active: 1780000100,
            message_count: 4,
            input_tokens: 10,
            output_tokens: 20,
          },
          {
            id: 'fresh',
            title: 'Morning ops',
            model: 'gpt-5.5',
            started_at: 1780050000,
            last_active: 1780050400,
            message_count: 12,
            input_tokens: 100,
            output_tokens: 200,
          },
        ],
      }),
    )
    expect(bridge.session?.key).toBe('fresh')
    expect(bridge.session?.title).toBe('Morning ops')
    expect(bridge.session?.lastActiveAt).toBe(
      new Date(1780050400 * 1000).toISOString(),
    )
  })

  it('surfaces the newest active run with its last tool signal', () => {
    const bridge = buildNovaSessionBridge(
      baseInput({
        gatewayReachable: true,
        activeRuns: [
          {
            runId: 'run-1',
            sessionKey: 'main',
            friendlyId: 'run-1',
            status: 'active',
            updatedAt: Date.parse(NOW) - 60_000,
            toolCalls: [
              { id: 't1', name: 'nova_memory_search', phase: 'done' },
              { id: 't2', name: 'web_fetch', phase: 'running' },
            ],
          },
        ],
      }),
    )
    expect(bridge.activeTask?.status).toBe('active')
    expect(bridge.activeTask?.lastTool).toBe('web_fetch')
    expect(bridge.activeTask?.sessionKey).toBe('main')
  })

  it('flags a stalled run as a blocker', () => {
    const bridge = buildNovaSessionBridge(
      baseInput({
        gatewayReachable: true,
        activeRuns: [
          {
            runId: 'run-9',
            sessionKey: 'main',
            friendlyId: 'run-9',
            status: 'stalled',
            updatedAt: Date.parse(NOW) - 600_000,
            toolCalls: [],
          },
        ],
      }),
    )
    expect(bridge.blockers.some((entry) => /stalled/i.test(entry))).toBe(true)
  })

  it('carries needs-Taylor state and failed cron jobs into blockers', () => {
    const bridge = buildNovaSessionBridge(
      baseInput({
        gatewayReachable: true,
        cron: { total: 5, failed: 2, paused: 0, nextRunAt: null },
        approvals: { pending: 3, actionable: 2, degraded: false },
      }),
    )
    expect(bridge.needsTaylor?.pending).toBe(3)
    expect(bridge.blockers.some((entry) => /cron/i.test(entry))).toBe(true)
    // pending approvals are surfaced in needsTaylor, not as an outage blocker
    expect(bridge.blockers.some((entry) => /approval/i.test(entry))).toBe(false)
  })

  it('returns the newest verified receipts first, capped at five', () => {
    const events = Array.from({ length: 8 }, (_, index) => ({
      title: `Receipt ${index}`,
      eventKind: 'work-receipt' as const,
      createdAt: new Date(Date.parse(NOW) - index * 60_000).toISOString(),
      verificationState: index % 2 === 0 ? 'tool-verified' : 'unverified',
    }))
    const bridge = buildNovaSessionBridge(
      baseInput({ gatewayReachable: true, recentEvents: events }),
    )
    expect(bridge.receipts).toHaveLength(5)
    expect(bridge.receipts[0].title).toBe('Receipt 0')
    expect(bridge.receipts[0].verified).toBe(true)
    expect(bridge.receipts[1].verified).toBe(false)
  })

  it('ignores continuity chatter when collecting receipts', () => {
    const bridge = buildNovaSessionBridge(
      baseInput({
        gatewayReachable: true,
        recentEvents: [
          {
            title: 'Just vibes',
            eventKind: 'continuity',
            createdAt: NOW,
            verificationState: 'unverified',
          },
        ],
      }),
    )
    expect(bridge.receipts).toHaveLength(0)
  })
})
