import { describe, expect, it } from 'vitest'
import {
  STALE_THRESHOLD_MS,
  WORKER_BOARD_MAX,
  buildWorkerBoardHeading,
  countWorkers,
  deriveAgentFromKey,
  deriveWorkerName,
  findPendingApproval,
  formatAge,
  mapSwarmToMobileRunning,
  mapSwarmToMobileStats,
  mapSwarmToRailRows,
  mapSwarmToWorkerCards,
  swarmStatusToTone,
} from './map-workers'
import type { GatewayApprovalEntry } from '@/lib/gateway-api'
import type { SwarmSession } from '@/stores/agent-swarm-store'
import { conductorWorkerCardFixtures } from '@/components/jarvis/fixtures'

const MINUTE_MS = 60_000
/** A fixed clock, so every age below is arithmetic and not a race. */
const NOW = new Date('2026-08-24T12:00:00Z').getTime()

function session(overrides: Partial<SwarmSession> = {}): SwarmSession {
  return {
    key: 'agent:builder:subagent:06ec90ba4703',
    friendlyId: 'sess-06ec90ba4703',
    kind: 'subagent',
    model: 'claude-opus-5',
    startedAt: NOW - 4 * MINUTE_MS,
    updatedAt: NOW,
    totalTokens: 4200,
    swarmStatus: 'running',
    staleness: 2_000,
    ...overrides,
  }
}

function approval(
  overrides: Partial<GatewayApprovalEntry> = {},
): GatewayApprovalEntry {
  return {
    id: 'appr-1',
    agentName: 'builder',
    action: 'write to Vault/Published/',
    tool: 'Write',
    status: 'pending',
    requestedAt: NOW - 42 * 1000,
    ...overrides,
  }
}

describe('deriveAgentFromKey', () => {
  it('reads the owning agent out of a subagent session key', () => {
    expect(deriveAgentFromKey('agent:builder:subagent:06ec90ba')).toBe('builder')
    expect(deriveAgentFromKey('agent:main:subagent:abc123')).toBe('main')
  })

  it('returns null rather than guessing when the key names no agent', () => {
    expect(deriveAgentFromKey('subagent:abc123')).toBeNull()
    expect(deriveAgentFromKey('agent:main:main')).toBeNull()
    expect(deriveAgentFromKey('')).toBeNull()
  })
})

describe('deriveWorkerName', () => {
  it('prefers a real served name over the key', () => {
    expect(deriveWorkerName(session({ label: 'km-agent' }))).toBe('km-agent')
  })

  it('falls back to the key agent, then to the session id tail', () => {
    expect(deriveWorkerName(session())).toBe('builder')
    expect(
      deriveWorkerName(
        session({ key: 'subagent:zz', friendlyId: 'sess-abcdef' }),
      ),
    ).toBe('worker abcdef')
  })
})

describe('swarmStatusToTone', () => {
  it('maps running and thinking to running', () => {
    expect(swarmStatusToTone('running', false)).toBe('running')
    expect(swarmStatusToTone('thinking', false)).toBe('running')
  })

  it('maps failed and error to failed, complete to complete, idle to idle', () => {
    expect(swarmStatusToTone('failed', false)).toBe('failed')
    expect(swarmStatusToTone('error', false)).toBe('failed')
    expect(swarmStatusToTone('complete', false)).toBe('complete')
    expect(swarmStatusToTone('idle', false)).toBe('idle')
  })

  it('lets blocked win over every session status', () => {
    for (const status of [
      'running',
      'thinking',
      'complete',
      'failed',
      'error',
      'idle',
    ] as const) {
      expect(swarmStatusToTone(status, true)).toBe('blocked')
    }
  })
})

describe('formatAge', () => {
  it('never renders an age more precisely than the source supports', () => {
    expect(formatAge(9_000)).toBe('9s')
    expect(formatAge(14 * MINUTE_MS)).toBe('14m')
    expect(formatAge(2 * 3600_000 + 11 * MINUTE_MS)).toBe('2h 11m')
    expect(formatAge(3 * 3600_000)).toBe('3h')
    expect(formatAge(23 * 86_400_000)).toBe('23d')
    expect(formatAge(-5)).toBe('0s')
  })
})

describe('findPendingApproval — the blocked join', () => {
  it('joins on agentName, case-insensitively', () => {
    expect(
      findPendingApproval(session(), [approval({ agentName: 'Builder' })]),
    ).not.toBeNull()
  })

  it('joins on an exact sessionKey even when agentName is absent', () => {
    const entry = approval({
      agentName: undefined,
      sessionKey: 'agent:builder:subagent:06ec90ba4703',
    })
    expect(findPendingApproval(session(), [entry])).toBe(entry)
  })

  it('does not join on a partial name match', () => {
    const other = session({
      key: 'agent:builder-qa:subagent:99',
      label: 'builder-qa',
    })
    expect(
      findPendingApproval(other, [
        approval({ agentName: 'builder', sessionKey: undefined }),
      ]),
    ).toBeNull()
  })

  it('ignores approvals that are not pending', () => {
    for (const status of ['approved', 'denied', undefined] as const) {
      expect(findPendingApproval(session(), [approval({ status })])).toBeNull()
    }
  })
})

describe('mapSwarmToWorkerCards', () => {
  it('maps a running session to a running card with a live badge', () => {
    const [card] = mapSwarmToWorkerCards([session()], [], NOW)

    expect(card.name).toBe('builder')
    expect(card.tone).toBe('running')
    expect(card.badge).toEqual({ label: 'RUN', tone: 'live' })
    expect(card.detail).toBe('running 4m')
  })

  it('says "thinking" when the store says thinking', () => {
    const [card] = mapSwarmToWorkerCards(
      [session({ swarmStatus: 'thinking' })],
      [],
      NOW,
    )
    expect(card.tone).toBe('running')
    expect(card.detail).toBe('thinking 4m')
  })

  it('maps a joined pending approval to blocked/BLK with the real ask', () => {
    const [card] = mapSwarmToWorkerCards([session()], [approval()], NOW)

    expect(card.tone).toBe('blocked')
    expect(card.badge).toEqual({ label: 'BLK', tone: 'blocked' })
    expect(card.detail).toBe('blocked 42s · needs approval')
    // REAL — §3.2: the approval's own action text, not a narrative.
    expect(card.sub).toBe('write to Vault/Published/')
  })

  it('is not blocked when no approval matches, whatever the session says', () => {
    const [card] = mapSwarmToWorkerCards(
      [session({ status: 'waiting_for_input' })],
      [approval({ agentName: 'someone-else', sessionKey: undefined })],
      NOW,
    )
    expect(card.tone).not.toBe('blocked')
    expect(card.badge).toEqual({ label: 'RUN', tone: 'live' })
  })

  it('gives a live-but-silent session the stale treatment', () => {
    const [card] = mapSwarmToWorkerCards(
      [session({ staleness: STALE_THRESHOLD_MS + MINUTE_MS })],
      [],
      NOW,
    )

    expect(card.badge).toEqual({ label: 'STALE', tone: 'blocked' })
    expect(card.detail).toBe('no update in 11m')
  })

  it('does not badge a finished or idle session STALE for being quiet', () => {
    const quiet = { staleness: STALE_THRESHOLD_MS * 10 }
    const [done] = mapSwarmToWorkerCards(
      [session({ swarmStatus: 'complete', ...quiet })],
      [],
      NOW,
    )
    const [idle] = mapSwarmToWorkerCards(
      [session({ swarmStatus: 'idle', ...quiet })],
      [],
      NOW,
    )

    expect(done.badge).toEqual({ label: 'DONE', tone: 'muted' })
    expect(idle.badge).toBeUndefined()
    expect(idle.detail).toBe('idle 1h 40m')
  })

  it('maps failed and error to an ERR badge carrying the real error text', () => {
    for (const swarmStatus of ['failed', 'error'] as const) {
      const [card] = mapSwarmToWorkerCards(
        [
          session({
            swarmStatus,
            errorMessage: 'certbot renew → exit 1: DNS-01 challenge timeout',
          }),
        ],
        [],
        NOW,
      )

      expect(card.badge).toEqual({ label: 'ERR', tone: 'failed' })
      expect(card.detail).toBe('failed')
      expect(card.sub).toBe('certbot renew → exit 1: DNS-01 challenge…')
      expect(card.subTone).toBe('failed')
    }
  })

  it('omits the sub-line entirely when the gateway sent nothing for it', () => {
    const [card] = mapSwarmToWorkerCards(
      [session({ model: undefined })],
      [],
      NOW,
    )
    expect(card.sub).toBe('')
    expect(card.noSource).toBeUndefined()
  })

  it('hoists blocked workers to the front without claiming a chain', () => {
    const cards = mapSwarmToWorkerCards(
      [
        session({ key: 'agent:orchestrator:subagent:a', friendlyId: 'a' }),
        session({ key: 'agent:km-agent:subagent:b', friendlyId: 'b' }),
      ],
      [approval({ agentName: 'km-agent' })],
      NOW,
    )

    expect(cards.map((card) => card.name)).toEqual([
      'km-agent',
      'orchestrator',
    ])
    expect(cards.every((card) => card.connector === undefined)).toBe(true)
  })

  it('keeps card names unique when two subagents share an agent', () => {
    const cards = mapSwarmToWorkerCards(
      [
        session({ friendlyId: 'sess-1111' }),
        session({ friendlyId: 'sess-2222' }),
      ],
      [],
      NOW,
    )
    expect(new Set(cards.map((card) => card.name)).size).toBe(2)
  })

  it('caps the grid at two rows without silently dropping the count', () => {
    const many = Array.from({ length: 14 }, (_, index) =>
      session({ key: `agent:w${index}:subagent:x`, friendlyId: `s-${index}` }),
    )

    expect(mapSwarmToWorkerCards(many, [], NOW)).toHaveLength(WORKER_BOARD_MAX)
    expect(buildWorkerBoardHeading(14, WORKER_BOARD_MAX).note).toContain(
      '14 live workers · 10 shown',
    )
  })

  it('never produces an action chip, a connector, a noSource mark, or fixture narrative', () => {
    const many = [
      session({ key: 'agent:orchestrator:subagent:a', friendlyId: 'a' }),
      session({ key: 'agent:builder:subagent:b', friendlyId: 'b' }),
      session({
        key: 'agent:maintainer:subagent:c',
        friendlyId: 'c',
        swarmStatus: 'idle',
        staleness: 23 * 86_400_000,
      }),
      session({
        key: 'agent:km-agent:subagent:d',
        friendlyId: 'd',
        swarmStatus: 'error',
      }),
    ]
    const cards = mapSwarmToWorkerCards(
      many,
      [approval({ agentName: 'km-agent', action: 'rm -rf ~/tmp/scratch' })],
      NOW,
    )

    // Every fixture sub-line is narrative the swarm store does not carry, and
    // the launchd diagnostic has no source at all (§3.5 item 12).
    const fixtureNarrative = conductorWorkerCardFixtures.map((card) => card.sub)
    expect(fixtureNarrative).toContain('launchd job not loaded')

    for (const card of cards) {
      expect(card.action).toBeUndefined()
      expect(card.connector).toBeUndefined()
      expect(card.noSource).toBeUndefined()
      expect(fixtureNarrative).not.toContain(card.sub)
    }
  })
})

describe('mapSwarmToRailRows', () => {
  it('counts the whole roster in RUN · BLK · IDLE', () => {
    const sessions = [
      session({ key: 'agent:a:subagent:1', friendlyId: '1' }),
      session({ key: 'agent:b:subagent:2', friendlyId: '2' }),
      session({ key: 'agent:c:subagent:3', friendlyId: '3' }),
      session({
        key: 'agent:d:subagent:4',
        friendlyId: '4',
        swarmStatus: 'idle',
      }),
      session({
        key: 'agent:e:subagent:5',
        friendlyId: '5',
        swarmStatus: 'failed',
      }),
    ]
    const rail = mapSwarmToRailRows(sessions, [approval({ agentName: 'c' })], NOW)

    // 2 running, 1 blocked, and everything else — including the failed one —
    // in IDLE, exactly as the artboard's own count line buckets it.
    expect(rail.counts).toBe('2 RUN · 1 BLK · 2 IDLE')
    expect(rail.workers[0]).toEqual({
      name: 'c',
      status: 'blocked',
      detail: 'BLOCKED 42s',
    })
  })

  it('tallies the full roster even when the row list is capped', () => {
    const many = Array.from({ length: 14 }, (_, index) =>
      session({ key: `agent:w${index}:subagent:x`, friendlyId: `s-${index}` }),
    )
    const rail = mapSwarmToRailRows(many, [], NOW)

    expect(rail.workers).toHaveLength(WORKER_BOARD_MAX)
    expect(rail.counts).toBe('14 RUN · 0 BLK · 0 IDLE')
  })

  it('leaves a blocked row detail undefined when there is no wait to report', () => {
    const rail = mapSwarmToRailRows(
      [session()],
      [approval({ requestedAt: undefined })],
      NOW,
    )
    expect(rail.workers[0].detail).toBeUndefined()
  })

  it('carries only ages, never a fixture detail string', () => {
    const rail = mapSwarmToRailRows(
      [
        session({ swarmStatus: 'idle', staleness: 2 * 3600_000 }),
        session({
          key: 'agent:ops:subagent:x',
          friendlyId: 'x',
          swarmStatus: 'failed',
        }),
      ],
      [],
      NOW,
    )

    expect(rail.workers.map((worker) => worker.detail)).toEqual([
      'idle 2h',
      'failed',
    ])
  })
})

describe('countWorkers', () => {
  it('buckets everything that is not running or blocked as idle', () => {
    expect(
      countWorkers(['running', 'blocked', 'failed', 'stale', 'complete']),
    ).toEqual({ running: 1, blocked: 1, idle: 3 })
  })
})

describe('mobile mappers', () => {
  it('derives the four-number strip, folding stale into idle', () => {
    const sessions = [
      session({ key: 'agent:a:subagent:1', friendlyId: '1' }),
      session({ key: 'agent:b:subagent:2', friendlyId: '2' }),
      session({
        key: 'agent:c:subagent:3',
        friendlyId: '3',
        swarmStatus: 'failed',
      }),
      session({
        key: 'agent:d:subagent:4',
        friendlyId: '4',
        staleness: STALE_THRESHOLD_MS * 2,
      }),
    ]

    expect(
      mapSwarmToMobileStats(sessions, [approval({ agentName: 'a' })]),
    ).toEqual([
      { label: 'RUNNING', value: '1', tone: 'live' },
      { label: 'BLOCKED', value: '1', tone: 'blocked' },
      { label: 'FAILED', value: '1', tone: 'failed' },
      { label: 'IDLE', value: '1', tone: 'idle' },
    ])
  })

  it('shows only the live workers in RUNNING NOW, and none when none run', () => {
    const running = mapSwarmToMobileRunning(
      [
        session({ key: 'agent:a:subagent:1', friendlyId: '1' }),
        session({
          key: 'agent:b:subagent:2',
          friendlyId: '2',
          swarmStatus: 'idle',
        }),
      ],
      [],
      NOW,
    )

    expect(running).toEqual([{ name: 'a', status: 'running', detail: '4m' }])
    expect(
      mapSwarmToMobileRunning([session({ swarmStatus: 'idle' })], [], NOW),
    ).toEqual([])
  })
})

describe('buildWorkerBoardHeading', () => {
  it('reports the live roster and drops the fixture chain claim', () => {
    const heading = buildWorkerBoardHeading(1, 1)

    expect(heading.label).toBe('WORKER BOARD')
    expect(heading.note).toBe(
      '1 live worker · status is heuristic · blocked = pending approval',
    )
    expect(heading.note).not.toContain('chain')
    expect(heading.noteAccent).toBeUndefined()
  })
})
