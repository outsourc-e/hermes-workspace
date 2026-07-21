import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  loadResearchAtlasSnapshot,
  renderResearchAtlasSite,
  resolveResearchAtlasAsset,
  stageResearchMission,
} from './war-room-research-atlas'

const tempRoots: Array<string> = []

function createFixture() {
  const productPrepRoot = mkdtempSync(path.join(os.tmpdir(), 'research-atlas-source-'))
  tempRoots.push(productPrepRoot)
  const atlasRoot = path.join(productPrepRoot, 'atlas')
  const downloads = path.join(atlasRoot, 'downloads')
  const assets = path.join(productPrepRoot, 'assets', 'products')
  mkdirSync(downloads, { recursive: true })
  mkdirSync(assets, { recursive: true })
  writeFileSync(path.join(downloads, 'ShopOne.xlsx'), 'xlsx-fixture')
  writeFileSync(path.join(assets, 'one.jpg'), 'image-fixture')
  writeFileSync(path.join(atlasRoot, 'QA_REPORT.txt'), 'QA passed\nTruth boundary: visual match is not supplier proof.\n')

  const data = {
    meta: { shops: 3, listings: 436, sales: 1819, reviews: 233, generated: '10.07.2026' },
    shops: [
      {
        key: 'one',
        name: 'ShopOne',
        kind: 'Test category',
        url: 'https://www.etsy.com/shop/ShopOne',
        date: '10.07.2026',
        listings: 100,
        official_sales: 500,
        reviews_count: 40,
        rating: 4.8,
        median_price: 42,
        headline: 'Verified fixture',
        top_share: 61,
        summary: ['Fact one'],
        risks: ['Risk one'],
        products: [{ image: '../assets/products/one.jpg' }],
        supplier: [{ status: 'strong' }, { status: 'candidate_only' }],
        sheet: 'downloads/ShopOne.xlsx',
      },
    ],
  }
  writeFileSync(
    path.join(atlasRoot, 'index.html'),
    `<!doctype html><html><body><script>const DATA=${JSON.stringify(data)};\nconst $=s=>document.querySelector(s);</script></body></html>`,
  )
  return { productPrepRoot, atlasRoot }
}

afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true })
})

describe('War Room Research Atlas source adapter', () => {
  it('loads verified shop metrics and download links from the original hub', () => {
    const fixture = createFixture()
    const snapshot = loadResearchAtlasSnapshot({ ...fixture, nowMs: 123 })

    expect(snapshot.schemaVersion).toBe('war-room-research-atlas-v1')
    expect(snapshot.generatedAtMs).toBe(123)
    expect(snapshot.meta).toMatchObject({ shops: 3, listings: 436, sales: 1819, reviews: 233 })
    expect(snapshot.shops).toHaveLength(1)
    expect(snapshot.shops[0]).toMatchObject({
      name: 'ShopOne',
      officialSales: 500,
      productCount: 1,
      supplierChecks: 2,
      strongSupplierMatches: 1,
    })
    expect(snapshot.downloads[0].url).toContain('/api/war-room/research-atlas?asset=')
    expect(snapshot.qa.truthBoundary).toContain('visual match')
  })

  it('renders the original interactive site with local asset paths proxied safely', () => {
    const fixture = createFixture()
    const html = renderResearchAtlasSite(fixture)

    expect(html).toContain('/api/war-room/research-atlas?asset=')
    expect(html).not.toContain('"../assets/products/one.jpg"')
    expect(html).not.toContain('"downloads/ShopOne.xlsx"')
    expect(html).toContain('<meta name="war-room-integration" content="research-atlas-v1">')
  })

  it('rejects file traversal outside the verified product research root', () => {
    const fixture = createFixture()
    expect(() => resolveResearchAtlasAsset('../outside.txt', fixture)).toThrow(/outside/i)
    expect(resolveResearchAtlasAsset('atlas/downloads/ShopOne.xlsx', fixture)).toBe(path.join(fixture.atlasRoot, 'downloads', 'ShopOne.xlsx'))
  })
})

describe('War Room research mission staging', () => {
  it('creates a reusable local mission packet without starting live research', () => {
    const outputRoot = mkdtempSync(path.join(os.tmpdir(), 'research-missions-'))
    tempRoots.push(outputRoot)
    const result = stageResearchMission({
      targetType: 'shop',
      target: 'https://www.etsy.com/shop/NewShop',
      depth: 'deep',
      modules: ['official-shop', 'catalog', 'supplier-visual', 'risk', 'risk'],
      notes: 'Compare source truth carefully.',
    }, { outputRoot, nowMs: 1_750_000_000_000 })

    expect(result.packet.status).toBe('staged')
    expect(result.packet.owner.agentId).toBe('loki')
    expect(result.packet.depth).toBe('deep')
    expect(result.packet.modules).toEqual(['official-shop', 'catalog', 'supplier-visual', 'risk'])
    expect(result.packet.safety.externalResearchStarted).toBe(false)
    expect(result.packet.steps.length).toBeGreaterThanOrEqual(4)
    expect(existsSync(result.savedPath)).toBe(true)
    expect(JSON.parse(readFileSync(result.savedPath, 'utf8')).missionId).toBe(result.packet.missionId)
  })
})
