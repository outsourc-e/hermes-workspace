import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getOracleLocalAluraSearch } from './oracle-alura-local-search'

let tempDir = ''

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-alura-test-'))
  fs.writeFileSync(path.join(tempDir, 'alura-raw-latest.json'), JSON.stringify({
    keywordResults: [{
      keyword: 'gold initial necklace',
      overview: {
        data: {
          results: {
            keyword_id: 'kw-gold-initial',
            keyword: 'gold initial necklace',
            keyword_score: 91,
            etsy_volume_mo: 12000,
            competing_listings: 38000,
            sales: '420000',
            avg_sales: '154',
            revenue: '1900000.00',
            avg_revenue: '7700.00',
            views: '800000',
            avg_prices: { ILS: 200 },
            competition_level: 'moderate',
          },
        },
      },
    }],
    listingResults: {
      'gold initial necklace': {
        data: {
          results: [{
            listing_id: 'listing-1',
            title: 'Gold Initial Necklace Gift Listing',
            est_sales: 1000,
            revenue_usd: '25000',
            views: 4000,
            price_usd: '39',
          }],
        },
      },
    },
  }))
  fs.writeFileSync(path.join(tempDir, 'alura-ui-nonjewelry-direct-latest.json'), JSON.stringify({ completed: [] }))
  fs.writeFileSync(path.join(tempDir, 'alura-ui-20-keyword-direct-proof.json'), JSON.stringify({ keywords: ['initial necklace'], completed: [] }))
  fs.writeFileSync(path.join(tempDir, 'nonintrusive-alura-20-latest.json'), JSON.stringify({ completed: [] }))
  fs.writeFileSync(path.join(tempDir, 'seo-graph.json'), JSON.stringify({ completed: [{ keyword: 'gold initial necklace seo only' }] }))
  fs.writeFileSync(path.join(tempDir, 'suggested-products.tsv'), [
    'Rank\tProduct Suggestion\tKeyword / Trend\tAlura Stats',
    '1\tCustom initial pendant necklace\tinitial necklace\tScore: -',
  ].join('\n'))
  fs.writeFileSync(path.join(tempDir, 'state.json'), JSON.stringify({ suggested_products: [] }))
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('Oracle local Alura search', () => {
  it('returns only allowlisted local Alura sources by default', () => {
    const result = getOracleLocalAluraSearch({ q: 'gold initial necklace', baseDir: tempDir })

    expect(result.ok).toBe(true)
    expect(result.sourceMode).toBe('alura_only')
    expect(result.sourceFilesUsed).toContain('alura-raw-latest.json')
    expect(result.sourceFilesUsed).not.toContain('seo-graph.json')
    expect(result.keywordResults[0].dataOrigin).toBe('local-alura-cache')
    expect(result.keywordResults[0].rawSourceFile).toBe('alura-raw-latest.json')
    expect(result.keywordResults[0].metrics.keywordScore).toBe(91)
    expect(result.listingResults[0].title).toContain('Gold Initial Necklace')
  })

  it('makes missing fields explicit instead of inventing metrics', () => {
    const result = getOracleLocalAluraSearch({ q: 'initial necklace', baseDir: tempDir })
    const proofOnly = result.keywordResults.find((row) => row.rawSourceFile === 'alura-ui-20-keyword-direct-proof.json')

    expect(proofOnly).toBeDefined()
    expect(proofOnly?.metrics.keywordScore).toBeNull()
    expect(proofOnly?.missingFields).toContain('keywordScore')
    expect(proofOnly?.missingFields).toContain('sales')
  })

  it('includes product-research files only when requested', () => {
    const defaultResult = getOracleLocalAluraSearch({ q: 'custom initial pendant', baseDir: tempDir })
    const productResearchResult = getOracleLocalAluraSearch({
      q: 'custom initial pendant',
      baseDir: tempDir,
      sourceMode: 'alura_plus_product_research',
    })

    expect(defaultResult.sourceFilesUsed).not.toContain('suggested-products.tsv')
    expect(productResearchResult.sourceFilesUsed).toContain('suggested-products.tsv')
    expect(productResearchResult.keywordResults.some((row) => row.dataOrigin === 'local-product-research')).toBe(true)
  })
})
