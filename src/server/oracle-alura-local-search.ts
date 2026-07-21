import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  OracleAluraDataOrigin,
  OracleAluraKeywordResult,
  OracleAluraListingResult,
  OracleAluraMetrics,
  OracleAluraSearchResult,
  OracleAluraSourceMode,
} from '../lib/war-room/living-v3/oracle-alura'

const PRODUCT_RESEARCH_DIR = path.join(os.homedir(), '.hermes', 'product-research')

export const ORACLE_ALURA_SOURCE_FILES = [
  'alura-raw-latest.json',
  'alura-ui-nonjewelry-direct-latest.json',
  'alura-ui-20-keyword-direct-proof.json',
  'nonintrusive-alura-20-latest.json',
] as const

const PRODUCT_RESEARCH_SOURCE_FILES = [
  'state.json',
  'suggested-products.tsv',
] as const

type OracleAluraSourceFile = typeof ORACLE_ALURA_SOURCE_FILES[number]
type ProductResearchSourceFile = typeof PRODUCT_RESEARCH_SOURCE_FILES[number]
type OracleSearchSourceFile = OracleAluraSourceFile | ProductResearchSourceFile

const metricFieldNames = [
  'keywordScore',
  'searchVolume',
  'competition',
  'sales',
  'avgSales',
  'revenue',
  'avgRevenue',
  'views',
  'avgPrice',
  'competitionLevel',
] as const

type RawKeywordRecord = {
  keyword: string
  rawSourceFile: string
  dataOrigin: OracleAluraDataOrigin
  sourceMode: OracleAluraSourceMode
  sourceLabel: string
  metrics: OracleAluraMetrics
  evidenceIds: Array<string>
  text: string
}

type RawListingRecord = {
  keyword: string
  title: string
  rawSourceFile: string
  dataOrigin: OracleAluraDataOrigin
  sales: number | null
  revenue: number | null
  views: number | null
  price: number | null
  evidenceIds: Array<string>
  text: string
}

type CacheEntry = {
  mtimes: Record<string, number>
  keywordRecords: Array<RawKeywordRecord>
  listingRecords: Array<RawListingRecord>
  sourceFilesUsed: Array<string>
  warning?: string
}

const cache = new Map<string, CacheEntry>()
const stopWords = new Set(['for', 'the', 'and', 'with', 'from', 'etsy', 'gift', 'gifts', 'local'])

function clampLimit(value: unknown, fallback = 8) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(20, Math.floor(n)))
}

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function queryTokens(value: string) {
  const tokens = normalizeQuery(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2 && !stopWords.has(token))
  return tokens.length ? tokens.slice(0, 8) : [value.toLowerCase()].filter(Boolean)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const clean = value.replace(/[,$₪€£%]/g, '').trim()
    if (!clean || clean === '-') return null
    const parsed = Number(clean)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function uniq(values: Array<string | null | undefined>, limit = 80) {
  const out: Array<string> = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

function missingFields(metrics: OracleAluraMetrics) {
  return metricFieldNames.filter((field) => metrics[field] === null)
}

function baseMetrics(keyword: string, source: Record<string, unknown>): OracleAluraMetrics {
  const avgPrices = source.avg_prices && typeof source.avg_prices === 'object'
    ? source.avg_prices as Record<string, unknown>
    : {}
  return {
    keyword,
    keywordScore: asNumber(source.keyword_score ?? source.keywordScore ?? source.score),
    searchVolume: asNumber(source.etsy_volume_mo ?? source.search_volume ?? source.google_volume_mo),
    competition: asNumber(source.competing_listings ?? source.competition),
    sales: asNumber(source.sales),
    avgSales: asNumber(source.avg_sales ?? source.avgSales),
    revenue: asNumber(source.revenue),
    avgRevenue: asNumber(source.avg_revenue ?? source.avgRevenue),
    views: asNumber(source.views),
    avgPrice: asNumber(source.avg_price_usd ?? source.avg_price ?? source.avgPrice ?? avgPrices.ILS ?? avgPrices.USD),
    competitionLevel: asString(source.competition_level ?? source.competitionLevel),
  }
}

function confidenceFor(tokens: Array<string>, text: string, metrics: OracleAluraMetrics) {
  const haystack = text.toLowerCase()
  const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
  const metricScore = metricFieldNames.reduce((score, field) => score + (metrics[field] !== null ? 3 : 0), 0)
  return Math.max(35, Math.min(98, 36 + tokenScore * 12 + metricScore))
}

function scoreRecord(tokens: Array<string>, text: string) {
  const haystack = text.toLowerCase()
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0)
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
}

function aluraFilePath(baseDir: string, fileName: string) {
  return path.join(baseDir, fileName)
}

function extractKeywordResultsFromJson(data: unknown, rawSourceFile: string, sourceMode: OracleAluraSourceMode, dataOrigin: OracleAluraDataOrigin): Array<RawKeywordRecord> {
  if (!data || typeof data !== 'object') return []
  const record = data as Record<string, unknown>
  const output: Array<RawKeywordRecord> = []

  const keywordResults = Array.isArray(record.keywordResults) ? record.keywordResults : []
  keywordResults.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const row = item as Record<string, unknown>
    const overview = row.overview && typeof row.overview === 'object' ? row.overview as Record<string, unknown> : {}
    const overviewData = overview.data && typeof overview.data === 'object' ? overview.data as Record<string, unknown> : {}
    const results = overviewData.results && typeof overviewData.results === 'object' ? overviewData.results as Record<string, unknown> : {}
    const keyword = asString(row.keyword) ?? asString(results.keyword)
    if (!keyword) return
    const metrics = baseMetrics(keyword, results)
    output.push({
      keyword,
      rawSourceFile,
      dataOrigin,
      sourceMode,
      sourceLabel: `${rawSourceFile} / keywordResults`,
      metrics,
      evidenceIds: uniq([
        `${rawSourceFile}:keyword:${results.keyword_id ?? keyword}`,
        `${rawSourceFile}:keywordResults:${index}`,
      ]),
      text: `${keyword} ${JSON.stringify(results).slice(0, 1800)}`,
    })
  })

  const completed = Array.isArray(record.completed) ? record.completed : []
  completed.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const row = item as Record<string, unknown>
    const keyword = asString(row.keyword)
    if (!keyword) return
    const metrics = baseMetrics(keyword, row)
    const proofText = Array.isArray(row.proof_lines) ? row.proof_lines.join(' ') : asString(row.body_sample) ?? ''
    output.push({
      keyword,
      rawSourceFile,
      dataOrigin,
      sourceMode,
      sourceLabel: `${rawSourceFile} / completed`,
      metrics,
      evidenceIds: uniq([
        `${rawSourceFile}:completed:${index}`,
        typeof row.url === 'string' ? row.url : undefined,
      ]),
      text: `${keyword} ${proofText}`,
    })
  })

  const keywords = Array.isArray(record.keywords) ? record.keywords : []
  keywords.forEach((item, index) => {
    const keyword = asString(item)
    if (!keyword) return
    const metrics = baseMetrics(keyword, {})
    output.push({
      keyword,
      rawSourceFile,
      dataOrigin,
      sourceMode,
      sourceLabel: `${rawSourceFile} / keywords`,
      metrics,
      evidenceIds: [`${rawSourceFile}:keywords:${index}`],
      text: keyword,
    })
  })

  return output
}

function extractListingResultsFromJson(data: unknown, rawSourceFile: string, dataOrigin: OracleAluraDataOrigin): Array<RawListingRecord> {
  if (!data || typeof data !== 'object') return []
  const record = data as Record<string, unknown>
  const listingResults = record.listingResults && typeof record.listingResults === 'object'
    ? record.listingResults as Record<string, unknown>
    : {}
  const output: Array<RawListingRecord> = []
  Object.entries(listingResults).forEach(([keyword, value]) => {
    if (!value || typeof value !== 'object') return
    const wrapper = value as Record<string, unknown>
    const dataNode = wrapper.data && typeof wrapper.data === 'object' ? wrapper.data as Record<string, unknown> : {}
    const results = Array.isArray(dataNode.results) ? dataNode.results.slice(0, 8) : []
    results.forEach((item, index) => {
      if (!item || typeof item !== 'object') return
      const row = item as Record<string, unknown>
      const title = asString(row.title)
      if (!title) return
      output.push({
        keyword,
        title,
        rawSourceFile,
        dataOrigin,
        sales: asNumber(row.est_sales ?? row.avg_monthly_sales),
        revenue: asNumber(row.revenue_usd ?? row.avg_monthly_revenue),
        views: asNumber(row.views),
        price: asNumber(row.price_usd),
        evidenceIds: uniq([
          `${rawSourceFile}:listing:${row.listing_id ?? row.id ?? index}`,
          `${rawSourceFile}:listingResults:${keyword}:${index}`,
        ]),
        text: `${keyword} ${title} ${Array.isArray(row.tags) ? row.tags.join(' ') : ''}`,
      })
    })
  })
  return output
}

function parseSuggestedProducts(filePath: string, rawSourceFile: string, sourceMode: OracleAluraSourceMode): Array<RawKeywordRecord> {
  if (!fs.existsSync(filePath)) return []
  const [headerLine, ...rows] = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean)
  const headers = headerLine.split('\t')
  const output: Array<RawKeywordRecord> = []
  rows.forEach((line, index) => {
    const cols = line.split('\t')
    const values = Object.fromEntries(headers.map((header, colIndex) => [header, cols[colIndex] ?? '']))
    const keyword = values['Keyword / Trend'] || values['Product Suggestion']
    if (!keyword) return
    const metrics = baseMetrics(keyword, {})
    output.push({
      keyword,
      rawSourceFile,
      dataOrigin: 'local-product-research' as const,
      sourceMode,
      sourceLabel: `${rawSourceFile} / suggested products`,
      metrics,
      evidenceIds: [`${rawSourceFile}:row:${index + 1}`],
      text: Object.values(values).join(' '),
    })
  })
  return output
}

function isOracleAluraSourceFile(fileName: OracleSearchSourceFile): fileName is OracleAluraSourceFile {
  return (ORACLE_ALURA_SOURCE_FILES as ReadonlyArray<string>).includes(fileName)
}

function filesForMode(sourceMode: OracleAluraSourceMode): Array<OracleSearchSourceFile> {
  const files: Array<OracleSearchSourceFile> = [...ORACLE_ALURA_SOURCE_FILES]
  if (sourceMode === 'alura_plus_product_research' || sourceMode === 'seo_graph_optional') {
    files.push(...PRODUCT_RESEARCH_SOURCE_FILES)
  }
  return files
}

function loadCache(baseDir: string, sourceMode: OracleAluraSourceMode): CacheEntry {
  const files = filesForMode(sourceMode)
  const key = `${baseDir}:${sourceMode}`
  const mtimes = Object.fromEntries(files.map((file) => {
    const filePath = aluraFilePath(baseDir, file)
    return [file, fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : 0]
  }))
  const cached = cache.get(key)
  if (cached && JSON.stringify(cached.mtimes) === JSON.stringify(mtimes)) return cached

  const keywordRecords: Array<RawKeywordRecord> = []
  const listingRecords: Array<RawListingRecord> = []
  const sourceFilesUsed: Array<string> = []
  const warnings: Array<string> = []

  for (const fileName of files) {
    const filePath = aluraFilePath(baseDir, fileName)
    if (!fs.existsSync(filePath)) {
      warnings.push(`${fileName} missing`)
      continue
    }
    try {
      if (fileName.endsWith('.json')) {
        const data = readJson(filePath)
        const dataOrigin: OracleAluraDataOrigin = isOracleAluraSourceFile(fileName)
          ? 'local-alura-cache'
          : 'local-product-research'
        keywordRecords.push(...extractKeywordResultsFromJson(data, fileName, sourceMode, dataOrigin))
        listingRecords.push(...extractListingResultsFromJson(data, fileName, dataOrigin))
        sourceFilesUsed.push(fileName)
      } else if (fileName === 'suggested-products.tsv') {
        keywordRecords.push(...parseSuggestedProducts(filePath, fileName, sourceMode))
        sourceFilesUsed.push(fileName)
      }
    } catch (error) {
      warnings.push(`${fileName}: ${error instanceof Error ? error.message : 'read failed'}`)
    }
  }

  const entry: CacheEntry = {
    mtimes,
    keywordRecords,
    listingRecords,
    sourceFilesUsed,
    warning: warnings.length ? warnings.join('; ') : undefined,
  }
  cache.set(key, entry)
  return entry
}

export function getOracleLocalAluraSearch(options: {
  q?: string | null
  limit?: number
  sourceMode?: OracleAluraSourceMode
  baseDir?: string
}): OracleAluraSearchResult {
  const query = normalizeQuery(options.q ?? '')
  const limit = clampLimit(options.limit)
  const sourceMode = options.sourceMode ?? 'alura_only'
  const baseDir = options.baseDir ?? PRODUCT_RESEARCH_DIR

  const cacheEntry = loadCache(baseDir, sourceMode)
  const tokens = queryTokens(query)
  if (!query) {
    return {
      ok: true,
      query,
      sourceMode,
      sourceFilesUsed: cacheEntry.sourceFilesUsed,
      runCount: cacheEntry.sourceFilesUsed.length,
      keywordResults: [],
      listingResults: [],
      metrics: [],
      missingFields: [],
      evidenceIds: [],
      dataOrigin: 'local-alura-cache',
      warning: cacheEntry.warning,
    }
  }

  const keywordMatches = cacheEntry.keywordRecords
    .map((record) => ({ record, score: scoreRecord(tokens, record.text) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) =>
      b.score - a.score
      || (b.record.metrics.keywordScore ?? -1) - (a.record.metrics.keywordScore ?? -1)
      || a.record.keyword.localeCompare(b.record.keyword),
    )
    .slice(0, limit)

  const keywordResults: Array<OracleAluraKeywordResult> = keywordMatches.map(({ record, score }, index) => ({
    id: `${record.rawSourceFile.replace(/[^a-z0-9]+/gi, '-')}-${index}-${record.keyword.replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase(),
    keyword: record.keyword,
    sourceMode,
    rawSourceFile: record.rawSourceFile,
    dataOrigin: record.dataOrigin,
    metrics: record.metrics,
    missingFields: missingFields(record.metrics),
    evidenceIds: record.evidenceIds,
    confidence: confidenceFor(tokens, record.text, record.metrics) + score,
    sourceLabel: record.sourceLabel,
  }))

  const listingMatches = cacheEntry.listingRecords
    .map((record) => ({ record, score: scoreRecord(tokens, record.text) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (b.record.sales ?? -1) - (a.record.sales ?? -1))
    .slice(0, Math.min(limit, 8))

  const listingResults: Array<OracleAluraListingResult> = listingMatches.map(({ record }, index) => ({
    id: `${record.rawSourceFile.replace(/[^a-z0-9]+/gi, '-')}-listing-${index}-${record.keyword.replace(/[^a-z0-9]+/gi, '-')}`.toLowerCase(),
    keyword: record.keyword,
    title: record.title,
    rawSourceFile: record.rawSourceFile,
    dataOrigin: record.dataOrigin,
    sales: record.sales,
    revenue: record.revenue,
    views: record.views,
    price: record.price,
    evidenceIds: record.evidenceIds,
    missingFields: ['sales', 'revenue', 'views', 'price'].filter((field) => record[field as 'sales' | 'revenue' | 'views' | 'price'] === null),
  }))

  const evidenceIds = uniq([
    ...keywordResults.flatMap((result) => result.evidenceIds),
    ...listingResults.flatMap((result) => result.evidenceIds),
  ])
  const allMissingFields = uniq(keywordResults.flatMap((result) => result.missingFields), 20)

  return {
    ok: true,
    query,
    sourceMode,
    sourceFilesUsed: cacheEntry.sourceFilesUsed,
    runCount: cacheEntry.sourceFilesUsed.length,
    keywordResults,
    listingResults,
    metrics: keywordResults.map((result) => result.metrics),
    missingFields: allMissingFields,
    evidenceIds,
    rawSourceFile: keywordResults[0]?.rawSourceFile ?? listingResults[0]?.rawSourceFile,
    dataOrigin: 'local-alura-cache',
    warning: sourceMode === 'seo_graph_optional'
      ? 'seo_graph_optional accepted, but Oracle keeps mixed SQLite data out of default Alura truth.'
      : cacheEntry.warning,
  }
}
