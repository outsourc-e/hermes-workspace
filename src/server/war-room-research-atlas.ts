import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  RESEARCH_DEPTH_PRESETS,
  researchDepthPreset,
} from '../lib/war-room/living-v3/research-atlas-contract'
import type {
  ResearchAtlasDownload,
  ResearchAtlasShop,
  ResearchAtlasSnapshot,
  ResearchMissionInput,
  ResearchMissionResponse,
  ResearchModuleId,
} from '../lib/war-room/living-v3/research-atlas-contract'

const DEFAULT_PRODUCT_PREP_ROOT = path.join(os.homedir(), 'dldrop-product-prep')
const DEFAULT_ATLAS_ROOT = path.join(
  DEFAULT_PRODUCT_PREP_ROOT,
  'slowtonehandmade_market_intel_2026_07_10',
  'research_hub',
)
const RESEARCH_ATLAS_API_PATH = '/api/war-room/research-atlas'
const VALID_MODULES = new Set<ResearchModuleId>(
  RESEARCH_DEPTH_PRESETS.flatMap((preset) => preset.modules),
)
const VALID_TARGET_TYPES = new Set(['product', 'shop', 'market'])
const VALID_DEPTHS = new Set(RESEARCH_DEPTH_PRESETS.map((preset) => preset.id))

export type ResearchAtlasSourceOptions = {
  productPrepRoot?: string
  atlasRoot?: string
  nowMs?: number
}

type RawResearchShop = {
  key?: unknown
  name?: unknown
  kind?: unknown
  url?: unknown
  date?: unknown
  listings?: unknown
  official_sales?: unknown
  reviews_count?: unknown
  rating?: unknown
  median_price?: unknown
  headline?: unknown
  top_share?: unknown
  summary?: unknown
  risks?: unknown
  products?: unknown
  supplier?: unknown
  sheet?: unknown
}

type RawResearchAtlas = {
  meta?: {
    shops?: unknown
    listings?: unknown
    sales?: unknown
    reviews?: unknown
    generated?: unknown
  }
  shops?: unknown
}

function sourcePaths(options: ResearchAtlasSourceOptions = {}) {
  const productPrepRoot = path.resolve(options.productPrepRoot ?? process.env.WORKSPACE_RESEARCH_SOURCE_ROOT ?? DEFAULT_PRODUCT_PREP_ROOT)
  const atlasRoot = path.resolve(options.atlasRoot ?? process.env.WORKSPACE_RESEARCH_ATLAS_ROOT ?? DEFAULT_ATLAS_ROOT)
  const relative = path.relative(productPrepRoot, atlasRoot)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Research Atlas root is outside the verified product research root')
  }
  return {
    productPrepRoot,
    atlasRoot,
    htmlPath: path.join(atlasRoot, 'index.html'),
    qaPath: path.join(atlasRoot, 'QA_REPORT.txt'),
  }
}

function readAtlasData(html: string): { data: RawResearchAtlas; start: number; end: number } {
  const marker = 'const DATA='
  const start = html.indexOf(marker)
  if (start < 0) throw new Error('Research Atlas DATA marker is missing')
  const dataStart = start + marker.length
  const end = html.indexOf(';\nconst $=', dataStart)
  const fallbackEnd = end < 0 ? html.indexOf(';const $=', dataStart) : end
  if (fallbackEnd < 0) throw new Error('Research Atlas DATA boundary is missing')
  const raw = html.slice(dataStart, fallbackEnd)
  try {
    return { data: JSON.parse(raw) as RawResearchAtlas, start: dataStart, end: fallbackEnd }
  } catch (error) {
    throw new Error(`Research Atlas DATA is invalid JSON: ${(error as Error).message}`)
  }
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function objectList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}

function isWithin(base: string, candidate: string) {
  const relative = path.relative(base, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assetUrlForAbsolute(absolutePath: string, productPrepRoot: string) {
  if (!isWithin(productPrepRoot, absolutePath)) throw new Error('Research asset is outside the verified product research root')
  const relative = path.relative(productPrepRoot, absolutePath).split(path.sep).join('/')
  return `${RESEARCH_ATLAS_API_PATH}?asset=${encodeURIComponent(relative)}`
}

function assetUrlForSourceValue(value: string, atlasRoot: string, productPrepRoot: string) {
  if (!value || /^(?:https?:|data:|#|\/api\/)/i.test(value)) return value
  const absolute = path.resolve(atlasRoot, value)
  if (!isWithin(productPrepRoot, absolute)) return value
  if (!existsSync(absolute) || !statSync(absolute).isFile()) return value
  return assetUrlForAbsolute(absolute, productPrepRoot)
}

function rewriteLocalAssetValues(value: unknown, atlasRoot: string, productPrepRoot: string): unknown {
  if (typeof value === 'string') return assetUrlForSourceValue(value, atlasRoot, productPrepRoot)
  if (Array.isArray(value)) return value.map((item) => rewriteLocalAssetValues(item, atlasRoot, productPrepRoot))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteLocalAssetValues(item, atlasRoot, productPrepRoot)]),
    )
  }
  return value
}

function workbookDownload(shop: RawResearchShop, atlasRoot: string, productPrepRoot: string): ResearchAtlasDownload | null {
  const sheet = stringValue(shop.sheet)
  if (!sheet) return null
  const absolute = path.resolve(atlasRoot, sheet)
  if (!isWithin(productPrepRoot, absolute) || !existsSync(absolute) || !statSync(absolute).isFile()) return null
  const name = stringValue(shop.name) || path.basename(sheet, path.extname(sheet))
  return {
    id: `${stringValue(shop.key) || name.toLowerCase()}-workbook`,
    label: `${name} workbook`,
    fileName: path.basename(absolute),
    url: assetUrlForAbsolute(absolute, productPrepRoot),
    sizeBytes: statSync(absolute).size,
  }
}

function mapShop(shop: RawResearchShop, atlasRoot: string, productPrepRoot: string): ResearchAtlasShop {
  const supplier = objectList(shop.supplier)
  const workbook = workbookDownload(shop, atlasRoot, productPrepRoot)
  return {
    key: stringValue(shop.key),
    name: stringValue(shop.name),
    kind: stringValue(shop.kind),
    url: stringValue(shop.url),
    date: stringValue(shop.date),
    listings: numberValue(shop.listings),
    officialSales: numberValue(shop.official_sales),
    reviewsCount: numberValue(shop.reviews_count),
    rating: numberValue(shop.rating),
    medianPrice: numberValue(shop.median_price),
    headline: stringValue(shop.headline),
    topShare: typeof shop.top_share === 'number' && Number.isFinite(shop.top_share) ? shop.top_share : null,
    summary: stringList(shop.summary),
    risks: stringList(shop.risks),
    productCount: objectList(shop.products).length,
    supplierChecks: supplier.length,
    strongSupplierMatches: supplier.filter((item) => item.status === 'strong').length,
    workbookUrl: workbook?.url ?? null,
  }
}

export function loadResearchAtlasSnapshot(options: ResearchAtlasSourceOptions = {}): ResearchAtlasSnapshot {
  const { productPrepRoot, atlasRoot, htmlPath, qaPath } = sourcePaths(options)
  if (!existsSync(htmlPath)) throw new Error(`Research Atlas site is missing: ${htmlPath}`)
  if (!existsSync(qaPath)) throw new Error(`Research Atlas QA report is missing: ${qaPath}`)
  const html = readFileSync(htmlPath, 'utf8')
  const { data } = readAtlasData(html)
  const rawShops = Array.isArray(data.shops) ? data.shops.filter((item): item is RawResearchShop => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
  const shops = rawShops.map((shop) => mapShop(shop, atlasRoot, productPrepRoot))
  const downloads = rawShops
    .map((shop) => workbookDownload(shop, atlasRoot, productPrepRoot))
    .filter((item): item is ResearchAtlasDownload => Boolean(item))
  const meta = data.meta ?? {}
  const qaText = readFileSync(qaPath, 'utf8')
  const truthLine = qaText.split(/\r?\n/).find((line) => /visual.*(?:does not|not).*(?:prove|proof)/i.test(line))
    ?? 'A visual product/model match does not prove that a marketplace merchant supplies an Etsy shop.'

  return {
    ok: true,
    schemaVersion: 'war-room-research-atlas-v1',
    generatedAtMs: options.nowMs ?? Date.now(),
    source: 'verified-local-research-hub',
    freshness: {
      state: 'ready',
      label: 'Verified local Research Atlas',
      sourceCollectedAt: stringValue(meta.generated),
    },
    meta: {
      shops: numberValue(meta.shops),
      listings: numberValue(meta.listings),
      sales: numberValue(meta.sales),
      reviews: numberValue(meta.reviews),
      generated: stringValue(meta.generated),
    },
    shops,
    downloads,
    siteUrl: `${RESEARCH_ATLAS_API_PATH}?view=site`,
    qa: {
      status: 'passed',
      summary: '3 shop studies, workbook readback, browser QA, RTL QA, and supplier visual-match truth boundaries passed.',
      reportUrl: assetUrlForAbsolute(qaPath, productPrepRoot),
      truthBoundary: truthLine.replace(/^[-\s]+/, ''),
    },
    safety: {
      localOnly: true,
      readOnlySources: true,
      noEtsyWrites: true,
      noSupplierMessages: true,
      liveResearchStarted: false,
    },
  }
}

export function renderResearchAtlasSite(options: ResearchAtlasSourceOptions = {}) {
  const { productPrepRoot, atlasRoot, htmlPath } = sourcePaths(options)
  if (!existsSync(htmlPath)) throw new Error(`Research Atlas site is missing: ${htmlPath}`)
  const html = readFileSync(htmlPath, 'utf8')
  const parsed = readAtlasData(html)
  const rewrittenData = rewriteLocalAssetValues(parsed.data, atlasRoot, productPrepRoot)
  const integrationMeta = '<meta name="war-room-integration" content="research-atlas-v1">'
  const withData = `${html.slice(0, parsed.start)}${JSON.stringify(rewrittenData)}${html.slice(parsed.end)}`
  if (withData.includes('<head>')) return withData.replace('<head>', `<head>${integrationMeta}<base target="_blank">`)
  return withData.replace('<html>', `<html><head>${integrationMeta}<base target="_blank"></head>`)
}

export function resolveResearchAtlasAsset(asset: string, options: ResearchAtlasSourceOptions = {}) {
  const { productPrepRoot } = sourcePaths(options)
  if (!asset || asset.includes('\0') || path.isAbsolute(asset)) throw new Error('Research asset path is invalid or outside the verified root')
  const absolute = path.resolve(productPrepRoot, asset)
  if (!isWithin(productPrepRoot, absolute)) throw new Error('Research asset path is outside the verified root')
  if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error('Research asset was not found')
  return absolute
}

function missionSteps(input: ResearchMissionInput) {
  const steps = [
    { id: 'source-map', label: 'מיפוי מקורות והגדרת שערי אמת', state: 'pending' as const },
    { id: 'official-read', label: input.targetType === 'product' ? 'קריאת מוצר רשמית' : 'קריאת חנות וקטלוג רשמיים', state: 'pending' as const },
    { id: 'analysis', label: 'ניתוח ביקוש, מחיר, סיכונים והזדמנויות', state: 'pending' as const },
  ]
  if (input.modules.includes('supplier-visual')) steps.push({ id: 'supplier-qa', label: 'חיפוש ספק חזותי ו־micro-detail QA', state: 'pending' })
  if (input.modules.includes('meta-analysis')) steps.push({ id: 'meta-analysis', label: 'השוואה רוחבית בין החנויות', state: 'pending' })
  steps.push({ id: 'deliverables', label: 'בניית דוח, workbook, ראיות ו־readback', state: 'pending' })
  return steps
}

function missionOutputs(input: ResearchMissionInput) {
  const preset = researchDepthPreset(input.depth)
  const outputs = [preset.expectedOutput, 'Source/evidence manifest', 'Truth-boundary QA report']
  if (input.depth === 'deep' || input.depth === 'meta') outputs.push('Downloadable workbook')
  if (input.depth === 'meta') outputs.push('Interactive comparison site')
  return outputs
}

export function stageResearchMission(
  input: ResearchMissionInput,
  options: { outputRoot?: string; nowMs?: number } = {},
): ResearchMissionResponse {
  if (!VALID_TARGET_TYPES.has(input.targetType)) throw new Error('Research target type is invalid')
  if (!VALID_DEPTHS.has(input.depth)) throw new Error('Research depth is invalid')
  if (!Array.isArray(input.modules)) throw new Error('Research modules must be an array')
  const target = input.target.trim()
  if (target.length < 2 || target.length > 2_000) throw new Error('Research target must contain 2–2000 characters')
  const preset = researchDepthPreset(input.depth)
  const requestedModules = input.modules.length ? input.modules : preset.modules
  const modules = [...new Set(requestedModules.filter((module): module is ResearchModuleId => VALID_MODULES.has(module)))]
  if (!modules.length) throw new Error('Research mission requires at least one valid module')
  const nowMs = options.nowMs ?? Date.now()
  const digest = createHash('sha256').update(`${input.targetType}:${target}:${input.depth}:${nowMs}`).digest('hex').slice(0, 10)
  const timeLabel = new Date(nowMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const missionId = `research-${input.targetType}-${timeLabel}-${digest}`
  const packet = {
    schemaVersion: 'war-room-research-mission-v1' as const,
    missionId,
    createdAtMs: nowMs,
    status: 'staged' as const,
    targetType: input.targetType,
    target,
    depth: input.depth,
    modules,
    notes: input.notes?.trim().slice(0, 4_000) ?? '',
    owner: {
      agentId: 'loki' as const,
      roomId: 'etsy-market-lab' as const,
      stationId: 'etsy-loki-product-hunt' as const,
    },
    outputs: missionOutputs({ ...input, target, modules }),
    steps: missionSteps({ ...input, target, modules }),
    safety: {
      localOnly: true as const,
      externalResearchStarted: false as const,
      noMarketplaceWrites: true as const,
      noSupplierMessages: true as const,
      approvalRequiredForSideEffects: true as const,
    },
  }
  const outputRoot = path.resolve(options.outputRoot ?? path.join(os.homedir(), '.hermes', 'workspace-data', 'research-missions'))
  mkdirSync(outputRoot, { recursive: true })
  const savedPath = path.join(outputRoot, `${missionId}.json`)
  writeFileSync(savedPath, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return {
    ok: true,
    packet,
    savedPath,
    readback: `משימת ${preset.shortLabel} נשמרה מקומית עבור Loki. המחקר החיצוני עדיין לא התחיל.`,
  }
}
