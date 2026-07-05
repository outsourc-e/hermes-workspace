import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { aggregateReceipts, buildDailyOpsReviewContract, loadReceiptsFromDir } from './agent-work-receipts.ts'

const sampleDir = path.resolve(process.cwd(), 'scripts/ops/sample-receipts')
const generatedAt = '2026-07-04T12:00:00.000Z'

describe('Agent Work Receipts ops aggregation', () => {
  it('loads and validates all synthetic sample receipts', async () => {
    const receipts = await loadReceiptsFromDir(sampleDir)
    expect(receipts).toHaveLength(5)
    expect(receipts.map((receipt) => receipt.status).sort()).toEqual(['blocked', 'building', 'needs_tom', 'stale', 'verified'])
    expect(receipts.every((receipt) => receipt.sample)).toBe(true)
  })

  it('emits deterministic normalized ops-state sections', async () => {
    const receipts = await loadReceiptsFromDir(sampleDir)
    const state = aggregateReceipts(receipts, { receiptsDir: sampleDir, generatedAt })

    expect(state.schema_version).toBe('normalized-ops-state/v1')
    expect(state.generated_at).toBe(generatedAt)
    expect(Object.keys(state.sections)).toEqual(['NOW', 'NEEDS_TOM', 'BUILDING', 'WAITING_OR_BLOCKED', 'CHANGED', 'STALE_OR_UNVERIFIED'])
    expect(state.source).toMatchObject({ receipt_count: 5, sample_only: true })
    expect(state.sections.NEEDS_TOM.map((item) => item.receipt_id)).toEqual(['sample-needs-tom-packaging', 'sample-blocked-ads-access'])
    expect(state.sections.BUILDING.map((item) => item.receipt_id)).toEqual(['sample-building-ven-88'])
    expect(state.sections.WAITING_OR_BLOCKED.map((item) => item.receipt_id)).toEqual([
      'sample-needs-tom-packaging',
      'sample-blocked-ads-access',
      'sample-stale-self-reported',
    ])
    expect(state.sections.STALE_OR_UNVERIFIED.map((item) => item.receipt_id)).toEqual([
      'sample-blocked-ads-access',
      'sample-building-ven-88',
      'sample-stale-self-reported',
    ])
  })

  it('builds Tom-native Daily Ops Review contract without Dream branding', async () => {
    const receipts = await loadReceiptsFromDir(sampleDir)
    const state = aggregateReceipts(receipts, { receiptsDir: sampleDir, generatedAt })
    const contract = buildDailyOpsReviewContract(state.sections)

    expect(contract.categories).toEqual(['NEEDS_TOM', 'BUILDING', 'BLOCKED', 'STALE_OR_DRIFTING', 'SHIP_READY'])
    expect(JSON.stringify(contract)).not.toMatch(/Dream/i)
    expect(contract.top_actions[0]).toMatchObject({ category: 'NEEDS_TOM', receipt_id: 'sample-needs-tom-packaging' })
    expect(contract.top_actions.some((action) => action.category === 'SHIP_READY' && action.receipt_id === 'sample-done-verified')).toBe(true)
  })
})
