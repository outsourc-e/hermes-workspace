import { describe, expect, it } from 'vitest'
import {
  buildScoreboard,
  tierNeedsEscalationFrom,
  type SwarmOutcomeRecord,
} from './swarm-outcomes'

function rec(over: Partial<SwarmOutcomeRecord>): SwarmOutcomeRecord {
  return {
    at: 1_750_000_000_000,
    workerId: 'swarm5',
    task: 'do a thing',
    tier: 'standard',
    model: 'ollama-cloud/deepseek-v4-flash',
    mode: 'tmux',
    ok: true,
    blocked: false,
    blockReason: null,
    checkpointStatus: 'checkpointed',
    durationMs: 5_000,
    ...over,
  }
}

describe('buildScoreboard', () => {
  it('aggregates success rate, blocks and per-tier stats per worker', () => {
    const board = buildScoreboard([
      rec({}),
      rec({ ok: false, blocked: true, blockReason: 'exit 1' }),
      rec({ tier: 'heavy', durationMs: 15_000 }),
      rec({ workerId: 'swarm2', tier: 'light' }),
    ])

    expect(board.totalRecords).toBe(4)
    const w5 = board.workers.find((w) => w.workerId === 'swarm5')
    expect(w5?.attempts).toBe(3)
    expect(w5?.ok).toBe(2)
    expect(w5?.blocked).toBe(1)
    expect(w5?.successRate).toBeCloseTo(2 / 3)
    expect(w5?.lastBlockReason).toBe('exit 1')
    expect(w5?.byTier.standard?.attempts).toBe(2)
    expect(w5?.byTier.heavy?.attempts).toBe(1)

    const w2 = board.workers.find((w) => w.workerId === 'swarm2')
    expect(w2?.successRate).toBe(1)
  })

  it('handles empty input', () => {
    const board = buildScoreboard([])
    expect(board.workers).toEqual([])
    expect(board.totalRecords).toBe(0)
  })
})

describe('tierNeedsEscalationFrom', () => {
  it('requires at least 3 recent attempts before judging', () => {
    const records = [
      rec({ ok: false, blocked: true }),
      rec({ ok: false, blocked: true }),
    ]
    expect(tierNeedsEscalationFrom(records, 'swarm5', 'standard')).toBe(false)
  })

  it('escalates when recent success rate at the tier is under 40%', () => {
    const records = [
      rec({ ok: false, blocked: true }),
      rec({ ok: false, blocked: true }),
      rec({ ok: true }),
      rec({ ok: false, blocked: true }),
    ]
    expect(tierNeedsEscalationFrom(records, 'swarm5', 'standard')).toBe(true)
    // Other worker / other tier untouched
    expect(tierNeedsEscalationFrom(records, 'swarm2', 'standard')).toBe(false)
    expect(tierNeedsEscalationFrom(records, 'swarm5', 'heavy')).toBe(false)
  })

  it('does not escalate a healthy tier', () => {
    const records = [rec({}), rec({}), rec({}), rec({ ok: false, blocked: true })]
    expect(tierNeedsEscalationFrom(records, 'swarm5', 'standard')).toBe(false)
  })
})

describe('tierCanDemoteFrom', () => {
  const rec = (tier: string, ok: boolean) =>
    ({
      at: Date.now(),
      workerId: 'qa',
      task: 't',
      mode: 'oneshot',
      tier,
      model: 'm',
      ok,
      blocked: false,
      blockReason: null,
      durationMs: 1000,
    }) as never

  it('demotes only with a deep strong record at the lower tier', async () => {
    const { tierCanDemoteFrom } = await import('./swarm-outcomes')
    const strong = Array.from({ length: 6 }, () => rec('light', true))
    expect(tierCanDemoteFrom(strong, 'qa', 'light')).toBe(true)
    const thin = Array.from({ length: 4 }, () => rec('light', true))
    expect(tierCanDemoteFrom(thin, 'qa', 'light')).toBe(false)
    const weak = [
      ...Array.from({ length: 4 }, () => rec('light', true)),
      ...Array.from({ length: 3 }, () => rec('light', false)),
    ]
    expect(tierCanDemoteFrom(weak, 'qa', 'light')).toBe(false)
  })
})
