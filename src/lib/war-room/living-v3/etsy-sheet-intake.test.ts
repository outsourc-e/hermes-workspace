import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  runEtsySheetIntake,
  validateEtsySheetIntakeLocalPath,
} from '../../../server/etsy-sheet-intake'
import {
  buildSheetIntakeDossierMarkdown,
  filterSheetIntakeProducts,
  normalizeSheetIntakeRows,
  parseSheetIntakeText,
} from './etsy-sheet-intake'

const source = {
  type: 'pasted_text' as const,
  label: 'Unit test paste',
  sourceRef: 'operator-paste',
}

describe('Etsy Sheet Intake V1', () => {
  it('parses CSV/TSV/JSON rows and normalizes products with QA warnings', () => {
    const csv = [
      'title,image_url,source_url,price,search_volume,variants,notes',
      'Gold Moon Necklace,/local/moon.png,https://example.com/source,29,1200,"gold; silver",proof note',
      'Gold Moon Necklace,,https://example.com/source,29,1200,gold,duplicate row',
      'Replica Designer Charm,,,"",,"red;blue;green;black;white;pink;purple;orange;yellow;teal;brown;gray;clear",lookalike branded',
      ',/local/missing-title.png,https://example.com/source,12,40,,',
    ].join('\n')
    const parsed = parseSheetIntakeText(csv)
    const normalized = normalizeSheetIntakeRows(parsed.rows, source)

    expect(parsed.detectedFormat).toBe('csv')
    expect(normalized.products).toHaveLength(3)
    expect(normalized.rejectedRows).toHaveLength(1)
    expect(normalized.products[0]).toMatchObject({
      title: 'Gold Moon Necklace',
      score: expect.any(Number),
      shotLabReadiness: 'ready',
    })
    expect(normalized.products[1].duplicateOf).toBe(normalized.products[0].productId)
    expect(normalized.products[2].warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining([
      'missing_image',
      'missing_source_url',
      'weak_evidence',
      'too_many_variants',
      'unsafe_handoff',
    ]))
    expect(normalized.qa).toMatchObject({
      totalRows: 4,
      validProducts: 3,
      rejectedRows: 1,
      duplicates: 1,
      missingImages: 2,
      unsafeHandoff: 1,
    })

    const ready = filterSheetIntakeProducts(normalized.products, 'shotlab-ready')
    expect(ready.map((product) => product.title)).toEqual(['Gold Moon Necklace'])
  })

  it('parses JSON product arrays and writes required dossier sections', () => {
    const parsed = parseSheetIntakeText(JSON.stringify([
      {
        title: 'Silver Star Pendant',
        image: '/images/star.png',
        supplier_url: 'https://example.com/supplier',
        cost: '8.25',
        demand: 'gift trend',
      },
    ]))
    const normalized = normalizeSheetIntakeRows(parsed.rows, source)
    const dossier = buildSheetIntakeDossierMarkdown(normalized.products[0])

    expect(parsed.detectedFormat).toBe('json')
    expect(dossier).toContain('# Silver Star Pendant')
    expect(dossier).toContain('Source row id')
    expect(dossier).toContain('## ShotLab Readiness')
    expect(dossier).toContain('## SEO Readiness')
    expect(dossier).toContain('## Approval Notes')
  })

  it('writes manifest and markdown dossiers under the run artifact folder', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'etsy-sheet-intake-'))
    try {
      const result = await runEtsySheetIntake({
        sourceType: 'pasted_text',
        pastedText: 'title,image_url,source_url,price\nGold Bow Necklace,/bow.png,https://example.com/source,22\n',
      }, { workspaceRoot, nowMs: 10_000 })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      const manifestPath = path.join(workspaceRoot, result.run.artifactRoot, 'manifest.json')
      const dossierPath = path.join(workspaceRoot, result.run.products[0].dossierPath!)
      expect(existsSync(manifestPath)).toBe(true)
      expect(existsSync(dossierPath)).toBe(true)
      expect(readFileSync(dossierPath, 'utf8')).toContain('# Gold Bow Necklace')
      expect(JSON.parse(readFileSync(manifestPath, 'utf8')).runId).toBe(result.run.runId)
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('allows local file reads only from the safe import folder', async () => {
      const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'etsy-sheet-local-'))
    try {
      const safeDir = path.join(workspaceRoot, 'data', 'etsy-market-lab', 'imports')
      const safePath = path.join(safeDir, 'products.csv')
      mkdirSync(safeDir, { recursive: true })
      writeFileSync(safePath, 'title\nGold Hamsa Necklace\n', 'utf8')

      expect(validateEtsySheetIntakeLocalPath(safePath, workspaceRoot).ok).toBe(true)
      expect(validateEtsySheetIntakeLocalPath(path.join(workspaceRoot, 'outside.csv'), workspaceRoot).ok).toBe(false)

      const result = await runEtsySheetIntake({ sourceType: 'local_file', localPath: safePath }, { workspaceRoot, nowMs: 11_000 })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.run.products[0].title).toBe('Gold Hamsa Necklace')
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })

  it('rejects blocked public URLs and Google links that are not public CSV exports', async () => {
    const blocked = await runEtsySheetIntake({ sourceType: 'public_csv_url', publicCsvUrl: 'https://www.etsy.com/listing/123' }, { nowMs: 12_000 })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toContain('Marketplace/live-service')

    const google = await runEtsySheetIntake({ sourceType: 'public_csv_url', publicCsvUrl: 'https://docs.google.com/spreadsheets/d/private/edit' }, { nowMs: 12_001 })
    expect(google.ok).toBe(false)
    if (!google.ok) {
      expect(google.error).toBe('Google auth not connected.')
      expect(google.googleAuthRequired).toBe(true)
    }
  })
})
