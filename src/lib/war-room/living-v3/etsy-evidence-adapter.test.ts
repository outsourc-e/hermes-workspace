import { describe, expect, it } from 'vitest'
import {

  buildCandidatesFromLocalEvidence,
  buildMetricsFromLocalEvidence,
  buildSupplierLeadsFromLocalEvidence,
  createFallbackLocalEvidenceResult
} from './etsy-evidence-adapter'
import type {EtsyEvidenceSearchResult} from './etsy-evidence-adapter';

const evidenceFixture: EtsyEvidenceSearchResult = {
  ok: true,
  query: 'gold initial necklace for gifts',
  dataOrigin: 'product-intelligence',
  products: [{
    id: 'prod_initial_necklace',
    title: 'Custom initial pendant necklace / A-Z charm necklace',
    niche: 'personalized jewelry',
    productType: 'necklace',
    etsyAngle: 'Personalized initial necklace gift for her / custom initial pendant.',
    variantPlan: 'Gold A, D, M, S, heart initial.',
    status: 'Suggested - source page verification needed before ShotLab import',
    currentRoom: 'agora',
    aluraEvidence: 'Score: - | Avg sales: - | Competition: - | Avg price ILS: -',
    shotlabStatus: 'Pass',
    sourceFile: 'state.json',
    supplierLinkCount: 1,
    keywords: [{
      id: 'kw_initial_necklace',
      keyword: 'initial necklace',
      score: 94,
      searchVolume: null,
      competition: 129142,
      avgSales: 142,
      avgPrice: 48.08,
      competitionLevel: 'moderate',
      currentRoom: 'oracle',
      signalReason: 'linked product keyword',
    }],
    supplierLinks: [{
      id: 'sup_initial_necklace',
      productId: 'prod_initial_necklace',
      platform: 'Alibaba',
      url: 'https://example.invalid/local-only',
      status: 'needs_review',
      proof: 'local supplier proof text',
      rawTitle: 'Custom initial pendant necklace source lead',
    }],
    confidence: 91,
    matchReason: 'matched Product Intelligence product evidence',
  }],
  keywords: [],
  supplierLinks: [],
  evidenceIds: ['prod_initial_necklace', 'kw_initial_necklace', 'sup_initial_necklace'],
  sourceRecordIds: ['prod_initial_necklace', 'state.json'],
  keywordIds: ['kw_initial_necklace'],
}

describe('Etsy evidence adapter', () => {
  it('returns an explicit fallback result when no local evidence exists', () => {
    const fallback = createFallbackLocalEvidenceResult('no match')

    expect(fallback.dataOrigin).toBe('fallback-mock')
    expect(fallback.fallbackReason).toContain('fallback local mock')
    expect(buildCandidatesFromLocalEvidence('no match', fallback)).toEqual([])
  })

  it('builds candidates, metrics, and supplier leads with evidence metadata', () => {
    const [candidate] = buildCandidatesFromLocalEvidence('gold initial necklace for gifts', evidenceFixture)

    expect(candidate.dataOrigin).toBe('product-intelligence')
    expect(candidate.sourceRecordIds).toContain('prod_initial_necklace')
    expect(candidate.keywordIds).toContain('kw_initial_necklace')
    expect(candidate.evidenceCount).toBeGreaterThan(0)
    expect(candidate.confidence).toBeGreaterThan(80)

    const metrics = buildMetricsFromLocalEvidence(candidate)
    expect(metrics[0].dataOrigin).toBe('product-intelligence')
    expect(metrics[0].keywordScore).toBe(94)
    expect(metrics[0].aluraSales).not.toBe('local mock 1.4k')

    const leads = buildSupplierLeadsFromLocalEvidence(candidate)
    expect(leads[0].dataOrigin).toBe('product-intelligence')
    expect(leads[0].evidenceIds).toContain('sup_initial_necklace')
  })
})
