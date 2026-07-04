export type EtsyEvidenceDataOrigin =
  | 'local-alura-cache'
  | 'local-product-research'
  | 'mixed-local-archive'
  | 'product-intelligence'
  | 'alura-cache'
  | 'seo-db'
  | 'fallback-mock'

export type EtsyEvidenceQuality = 'verified-local' | 'partial-local' | 'missing-evidence' | 'fallback-local-mock'

export type EtsyEvidenceProductRecord = {
  id: string
  title: string
  niche?: string | null
  productType?: string | null
  etsyAngle?: string | null
  variantPlan?: string | null
  status?: string | null
  currentRoom?: string | null
  aluraEvidence?: string | null
  shotlabStatus?: string | null
  sourceFile?: string | null
  supplierLinkCount?: number
  keywords: Array<EtsyEvidenceKeywordRecord>
  supplierLinks: Array<EtsyEvidenceSupplierRecord>
  confidence: number
  matchReason: string
}

export type EtsyEvidenceKeywordRecord = {
  id: string
  keyword: string
  score?: number | null
  searchVolume?: number | null
  competition?: number | null
  avgSales?: number | null
  avgPrice?: number | null
  competitionLevel?: string | null
  currentRoom?: string | null
  signalReason?: string | null
  rawSourceFile?: string | null
  missingFields?: Array<string>
}

export type EtsyEvidenceSupplierRecord = {
  id: string
  productId?: string | null
  platform: 'Etsy' | 'AliExpress' | 'Alibaba' | 'Unknown'
  url?: string | null
  searchQuery?: string | null
  status?: string | null
  riskFlags?: string | null
  proof?: string | null
  rawTitle?: string | null
}

export type EtsyEvidenceSearchResult = {
  ok: boolean
  query: string
  dataOrigin: EtsyEvidenceDataOrigin
  products: Array<EtsyEvidenceProductRecord>
  keywords: Array<EtsyEvidenceKeywordRecord>
  supplierLinks: Array<EtsyEvidenceSupplierRecord>
  evidenceIds: Array<string>
  sourceRecordIds: Array<string>
  keywordIds: Array<string>
  fallbackReason?: string
  warning?: string
}

export type EtsyEvidenceCandidateDraft = {
  title: string
  niche: string
  signal: string
  tags: Array<string>
  estimatedPrice: string
  sourceRecordIds: Array<string>
  keywordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
  confidence: number
  evidenceCount: number
  sourceLabels: Array<string>
  metricRows: Array<EtsyEvidenceMetricRowDraft>
  supplierLeads: Array<EtsyEvidenceSupplierLeadDraft>
}

export type EtsyEvidenceMetricRowDraft = {
  product: string
  niche: string
  aluraSales: string
  price: string
  competition: 'Low' | 'Medium' | 'High' | 'missing evidence'
  keywordScore: number | null
  status: string
  sourceRecordIds: Array<string>
  keywordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
}

export type EtsyEvidenceSupplierLeadDraft = {
  sourceType: 'Etsy' | 'AliExpress' | 'Alibaba'
  title: string
  price: string
  matchScore: number
  risk: string
  sourceRecordIds: Array<string>
  evidenceIds: Array<string>
  evidenceQuality: EtsyEvidenceQuality
  dataOrigin: EtsyEvidenceDataOrigin
}

export type EtsyEvidenceKeywordSignal = {
  keywordId: string
  keyword: string
  score?: number | null
  avgSales?: number | null
  avgPrice?: number | null
  competition?: number | null
  competitionLevel?: string | null
  dataOrigin: EtsyEvidenceDataOrigin
}

const stopWords = new Set(['for', 'the', 'and', 'with', 'from', 'etsy', 'gift', 'gifts'])

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function queryTokens(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 8)
}

function compactIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).slice(0, 8)
}

function scoreToCompetition(value?: number | null, level?: string | null): 'Low' | 'Medium' | 'High' | 'missing evidence' {
  const normalized = (level ?? '').toLowerCase()
  if (normalized.includes('low')) return 'Low'
  if (normalized.includes('moderate') || normalized.includes('medium')) return 'Medium'
  if (normalized.includes('high')) return 'High'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'missing evidence'
  if (n < 20_000) return 'Low'
  if (n < 110_000) return 'Medium'
  return 'High'
}

function priceLabel(value?: number | null, fallback = 'missing evidence') {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return `₪${Math.round(n)}`
}

function salesLabel(value?: number | null) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'missing evidence'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k local avg sales` : `${Math.round(n)} local avg sales`
}

function keywordTags(keywords: Array<EtsyEvidenceKeywordRecord>, query: string) {
  const tags = keywords.map((keyword) => keyword.keyword.toLowerCase()).slice(0, 6)
  return tags.length ? tags : queryTokens(query)
}

function qualityForRecord(record: { sourceRecordIds?: Array<string>; keywordIds?: Array<string>; evidenceIds?: Array<string> }, fallback = false): EtsyEvidenceQuality {
  if (fallback) return 'fallback-local-mock'
  const count = (record.sourceRecordIds?.length ?? 0) + (record.keywordIds?.length ?? 0) + (record.evidenceIds?.length ?? 0)
  if (count >= 4) return 'verified-local'
  if (count > 0) return 'partial-local'
  return 'missing-evidence'
}

export function createFallbackLocalEvidenceResult(query: string, reason = 'fallback local mock — no evidence match'): EtsyEvidenceSearchResult {
  return {
    ok: true,
    query,
    dataOrigin: 'fallback-mock',
    products: [],
    keywords: [],
    supplierLinks: [],
    evidenceIds: [],
    sourceRecordIds: [],
    keywordIds: [],
    fallbackReason: reason,
  }
}

export async function searchLocalProductEvidence(query: string): Promise<EtsyEvidenceSearchResult> {
  const params = new URLSearchParams({ q: query, limit: '8' })
  try {
    const response = await fetch(`/api/war-room/etsy-evidence?${params.toString()}`, { cache: 'no-store' })
    if (!response.ok) return createFallbackLocalEvidenceResult(query, `fallback local mock — evidence endpoint returned ${response.status}`)
    const data = await response.json() as EtsyEvidenceSearchResult
    if (!data.ok) return createFallbackLocalEvidenceResult(query, data.warning ?? 'fallback local mock — evidence endpoint unavailable')
    return data
  } catch (error) {
    return createFallbackLocalEvidenceResult(query, `fallback local mock — ${error instanceof Error ? error.message : 'evidence endpoint failed'}`)
  }
}

export function buildMetricsFromLocalEvidence(candidate: Pick<EtsyEvidenceCandidateDraft, 'title' | 'niche' | 'metricRows' | 'dataOrigin' | 'sourceRecordIds' | 'keywordIds' | 'evidenceIds'>): Array<EtsyEvidenceMetricRowDraft> {
  if (candidate.metricRows.length) return candidate.metricRows
  return [{
    product: candidate.title,
    niche: candidate.niche,
    aluraSales: 'missing evidence',
    price: 'missing evidence',
    competition: 'missing evidence',
    keywordScore: null,
    status: 'missing evidence',
    sourceRecordIds: candidate.sourceRecordIds,
    keywordIds: candidate.keywordIds,
    evidenceIds: candidate.evidenceIds,
    evidenceQuality: qualityForRecord(candidate),
    dataOrigin: candidate.dataOrigin,
  }]
}

export function buildSupplierLeadsFromLocalEvidence(candidate: Pick<EtsyEvidenceCandidateDraft, 'supplierLeads'>): Array<EtsyEvidenceSupplierLeadDraft> {
  return candidate.supplierLeads
}

export function buildKeywordSignalsFromLocalEvidence(candidate: Pick<EtsyEvidenceCandidateDraft, 'keywordIds'>, evidence: EtsyEvidenceSearchResult): Array<EtsyEvidenceKeywordSignal> {
  const ids = new Set(candidate.keywordIds)
  return evidence.keywords
    .filter((keyword) => ids.has(keyword.id))
    .map((keyword) => ({ ...keyword, keywordId: keyword.id, dataOrigin: evidence.dataOrigin }))
}

export function buildCandidatesFromLocalEvidence(query: string, evidence: EtsyEvidenceSearchResult): Array<EtsyEvidenceCandidateDraft> {
  if (evidence.products.length) {
    return evidence.products.slice(0, 5).map((product) => {
      const sourceRecordIds = compactIds([product.id, product.sourceFile])
      const keywordIds = compactIds(product.keywords.map((keyword) => keyword.id))
      const supplierIds = compactIds(product.supplierLinks.map((lead) => lead.id))
      const evidenceIds = compactIds([...sourceRecordIds, ...keywordIds, ...supplierIds])
      const metricRows = buildProductMetricRows(product, sourceRecordIds, keywordIds, evidenceIds, evidence.dataOrigin)
      const supplierLeads = buildSupplierDrafts(product, evidence.dataOrigin)
      return {
        title: product.title,
        niche: product.niche ?? product.productType ?? 'Product Intelligence match',
        signal: product.etsyAngle ?? product.matchReason,
        tags: keywordTags(product.keywords, query),
        estimatedPrice: priceLabel(product.keywords[0]?.avgPrice, 'missing evidence'),
        sourceRecordIds,
        keywordIds,
        evidenceIds,
        evidenceQuality: qualityForRecord({ sourceRecordIds, keywordIds, evidenceIds }),
        dataOrigin: evidence.dataOrigin,
        confidence: product.confidence,
        evidenceCount: evidenceIds.length,
        sourceLabels: compactIds([product.sourceFile, product.currentRoom, product.status]),
        metricRows,
        supplierLeads,
      }
    })
  }

  if (evidence.keywords.length) {
    return evidence.keywords.slice(0, 5).map((keyword) => {
      const sourceRecordIds = compactIds([keyword.rawSourceFile, keyword.currentRoom])
      const keywordIds = [keyword.id]
      const evidenceIds = compactIds([keyword.id, keyword.rawSourceFile, keyword.currentRoom])
      const title = `${titleCase(keyword.keyword)} Product Direction`
      return {
        title,
        niche: 'Keyword-backed opportunity',
        signal: keyword.signalReason ?? 'Local keyword signal found; product evidence still missing.',
        tags: [keyword.keyword, ...queryTokens(query)].slice(0, 6),
        estimatedPrice: priceLabel(keyword.avgPrice, 'missing evidence'),
        sourceRecordIds,
        keywordIds,
        evidenceIds,
        evidenceQuality: qualityForRecord({ sourceRecordIds, keywordIds, evidenceIds }),
        dataOrigin: evidence.dataOrigin,
        confidence: Math.max(42, Math.min(88, Math.round(Number(keyword.score ?? 56)))),
        evidenceCount: evidenceIds.length,
        sourceLabels: compactIds([keyword.currentRoom, keyword.competitionLevel, 'keyword evidence']),
        metricRows: [{
          product: title,
          niche: 'keyword signal',
          aluraSales: salesLabel(keyword.avgSales),
          price: priceLabel(keyword.avgPrice, 'missing evidence'),
          competition: scoreToCompetition(keyword.competition, keyword.competitionLevel),
          keywordScore: Number.isFinite(Number(keyword.score)) ? Number(keyword.score) : null,
          status: keyword.signalReason ?? 'keyword evidence only',
          sourceRecordIds,
          keywordIds,
          evidenceIds,
          evidenceQuality: qualityForRecord({ sourceRecordIds, keywordIds, evidenceIds }),
          dataOrigin: evidence.dataOrigin,
        }],
        supplierLeads: [],
      }
    })
  }

  return []
}

function buildProductMetricRows(
  product: EtsyEvidenceProductRecord,
  sourceRecordIds: Array<string>,
  keywordIds: Array<string>,
  evidenceIds: Array<string>,
  dataOrigin: EtsyEvidenceDataOrigin,
): Array<EtsyEvidenceMetricRowDraft> {
  const keywords = product.keywords.length ? product.keywords.slice(0, 3) : [undefined]
  return keywords.map((keyword, index) => ({
    product: index === 0 ? product.title : `${product.title} / ${keyword?.keyword ?? 'keyword evidence'}`,
    niche: product.niche ?? keyword?.keyword ?? 'Product Intelligence row',
    aluraSales: salesLabel(keyword?.avgSales),
    price: priceLabel(keyword?.avgPrice, 'missing evidence'),
    competition: scoreToCompetition(keyword?.competition, keyword?.competitionLevel),
    keywordScore: Number.isFinite(Number(keyword?.score)) ? Number(keyword?.score) : null,
    status: product.status ?? keyword?.signalReason ?? 'local evidence row',
    sourceRecordIds,
    keywordIds: keyword ? [keyword.id] : keywordIds,
    evidenceIds,
    evidenceQuality: qualityForRecord({ sourceRecordIds, keywordIds, evidenceIds }),
    dataOrigin,
  }))
}

function platformType(platform: EtsyEvidenceSupplierRecord['platform']): 'Etsy' | 'AliExpress' | 'Alibaba' {
  if (platform === 'AliExpress' || platform === 'Alibaba' || platform === 'Etsy') return platform
  return 'Alibaba'
}

function buildSupplierDrafts(product: EtsyEvidenceProductRecord, dataOrigin: EtsyEvidenceDataOrigin): Array<EtsyEvidenceSupplierLeadDraft> {
  return product.supplierLinks.slice(0, 6).map((lead) => {
    const evidenceIds = compactIds([lead.id, product.id, lead.productId])
    const sourceRecordIds = compactIds([lead.id, lead.url, lead.searchQuery])
    return {
      sourceType: platformType(lead.platform),
      title: lead.rawTitle ?? `${product.title} / ${lead.platform} local source lead`,
      price: 'missing evidence',
      matchScore: Math.max(45, Math.min(92, product.confidence - (lead.status === 'needs_review' ? 8 : 0))),
      risk: lead.riskFlags || lead.proof || lead.status || 'needs local source review',
      sourceRecordIds,
      evidenceIds,
      evidenceQuality: qualityForRecord({ sourceRecordIds, evidenceIds }),
      dataOrigin,
    }
  })
}
