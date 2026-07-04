import { describe, expect, it } from 'vitest'
import {
  createBlockedEtsyLiveResearchRun,
  normalizeEtsyLiveResearchRequest,
  normalizeEtsyLiveResearchRun,
} from './etsy-live-research'

describe('Etsy live read-only research contracts', () => {
  it('normalizes a bounded live research request with locked safety assumptions', () => {
    const request = normalizeEtsyLiveResearchRequest({
      query: ` gold initial necklace gift ${'x'.repeat(900)}`,
      operatorNote: 'run it safely',
      sourceHints: ['https://example.com/source', 'https://example.com/source', '  '],
      maxCandidates: 99,
      mode: 'ignored',
    })

    expect(request.query.length).toBeLessThanOrEqual(800)
    expect(request.operatorNote).toBe('run it safely')
    expect(request.sourceHints).toEqual(['https://example.com/source'])
    expect(request.maxCandidates).toBe(5)
    expect(request.mode).toBe('read-only-live-research')
  })

  it('blocks empty requests', () => {
    expect(() => normalizeEtsyLiveResearchRequest({ query: ' ' })).toThrow('Live scout query is required')
  })

  it('normalizes source-backed candidates without unlocking live actions', () => {
    const request = normalizeEtsyLiveResearchRequest({ query: 'gold initial necklace', maxCandidates: 2 })
    const { run } = normalizeEtsyLiveResearchRun({
      status: 'completed',
      candidates: [
        {
          title: 'Gold Initial Pendant Gift Necklace',
          summary: 'Giftable initial pendant trend.',
          sourceUrls: ['https://example.com/public-trend'],
          evidenceIds: ['example-public-trend'],
          score: 84,
          riskFlags: ['Personalization remains No until variant proof exists.'],
        },
      ],
    }, { request, runId: 'etsy-live-test', startedAtMs: 1_000, completedAtMs: 1_010 })

    expect(run.status).toBe('completed')
    expect(run.candidates[0]).toMatchObject({
      dataOrigin: 'live-readonly-research',
      evidenceQuality: 'partial',
      suggestedNextStep: 'select_product',
    })
    expect(run.safety).toMatchObject({
      localOnly: true,
      usageAllowed: false,
      workerSpawnAllowed: false,
      externalRequestsAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('rejects forbidden live-action claims from worker output', () => {
    const request = normalizeEtsyLiveResearchRequest({ query: 'gold initial necklace' })
    const { run, rejectedClaims } = normalizeEtsyLiveResearchRun({
      status: 'completed',
      liveActionsAllowed: true,
      candidates: [
        {
          title: 'Gold Initial Pendant',
          summary: 'I published the Etsy draft for this product.',
          sourceUrls: ['https://example.com/public-trend'],
        },
      ],
    }, { request, runId: 'etsy-live-unsafe', startedAtMs: 1_000, completedAtMs: 1_010 })

    expect(run.status).toBe('blocked')
    expect(run.candidates).toEqual([])
    expect(rejectedClaims.length).toBeGreaterThan(0)
    expect(run.blockedReason).toContain('forbidden live side effects')
  })

  it('creates explicit blocked runs for missing connectors', () => {
    const request = normalizeEtsyLiveResearchRequest({ query: 'gold initial necklace' })
    const run = createBlockedEtsyLiveResearchRun({
      request,
      reason: 'Live connector unavailable.',
      runId: 'etsy-live-blocked',
      nowMs: 2_000,
    })

    expect(run).toMatchObject({
      runId: 'etsy-live-blocked',
      status: 'blocked',
      blockedReason: 'Live connector unavailable.',
      connectorStatus: 'not_configured',
      liveReadOnlyResearchAttempted: false,
    })
  })
})
