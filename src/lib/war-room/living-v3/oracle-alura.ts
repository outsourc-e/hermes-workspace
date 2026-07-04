export type OracleAluraSourceMode = 'alura_only' | 'alura_plus_product_research' | 'seo_graph_optional'

export type OracleAluraDataOrigin = 'local-alura-cache' | 'local-product-research' | 'mixed-local-archive'

export type OracleAluraMetrics = {
  keyword: string
  keywordScore: number | null
  searchVolume: number | null
  competition: number | null
  sales: number | null
  avgSales: number | null
  revenue: number | null
  avgRevenue: number | null
  views: number | null
  avgPrice: number | null
  competitionLevel: string | null
}

export type OracleAluraKeywordResult = {
  id: string
  keyword: string
  sourceMode: OracleAluraSourceMode
  rawSourceFile: string
  dataOrigin: OracleAluraDataOrigin
  metrics: OracleAluraMetrics
  missingFields: Array<string>
  evidenceIds: Array<string>
  confidence: number
  sourceLabel: string
}

export type OracleAluraListingResult = {
  id: string
  keyword: string
  title: string
  rawSourceFile: string
  dataOrigin: OracleAluraDataOrigin
  sales: number | null
  revenue: number | null
  views: number | null
  price: number | null
  evidenceIds: Array<string>
  missingFields: Array<string>
}

export type OracleAluraSearchResult = {
  ok: boolean
  query: string
  sourceMode: OracleAluraSourceMode
  sourceFilesUsed: Array<string>
  runCount: number
  keywordResults: Array<OracleAluraKeywordResult>
  listingResults: Array<OracleAluraListingResult>
  metrics: Array<OracleAluraMetrics>
  missingFields: Array<string>
  evidenceIds: Array<string>
  rawSourceFile?: string
  dataOrigin: OracleAluraDataOrigin
  warning?: string
  error?: string
}

export type OracleSignalPacket = {
  packetId: string
  selectedKeyword: string
  createdAtMs: number
  sourceMode: OracleAluraSourceMode
  metrics: OracleAluraMetrics
  sourceFile: string
  sourceFilesUsed: Array<string>
  evidenceIds: Array<string>
  missingFields: Array<string>
  dataOrigin: 'local-alura-cache'
  status: 'local_signal_ready'
}

export const oracleAluraSourceModeLabels: Record<OracleAluraSourceMode, string> = {
  alura_only: 'Alura cache only',
  alura_plus_product_research: 'Alura + product research',
  seo_graph_optional: 'Optional mixed archive',
}

export function createOracleSignalPacket(result: OracleAluraSearchResult, keywordResult: OracleAluraKeywordResult, nowMs = Date.now()): OracleSignalPacket {
  return {
    packetId: `oracle-signal-${keywordResult.id}-${nowMs}`,
    selectedKeyword: keywordResult.keyword,
    createdAtMs: nowMs,
    sourceMode: result.sourceMode,
    metrics: keywordResult.metrics,
    sourceFile: keywordResult.rawSourceFile,
    sourceFilesUsed: result.sourceFilesUsed,
    evidenceIds: keywordResult.evidenceIds,
    missingFields: keywordResult.missingFields,
    dataOrigin: 'local-alura-cache',
    status: 'local_signal_ready',
  }
}

export async function searchOracleLocalAlura(query: string, sourceMode: OracleAluraSourceMode = 'alura_only', limit = 8): Promise<OracleAluraSearchResult> {
  const params = new URLSearchParams({
    q: query,
    sourceMode,
    limit: String(limit),
  })
  try {
    const response = await fetch(`/api/war-room/oracle-alura-search?${params.toString()}`, { cache: 'no-store' })
    const data = await response.json() as OracleAluraSearchResult
    if (!response.ok || !data.ok) {
      return {
        ok: false,
        query,
        sourceMode,
        sourceFilesUsed: [],
        runCount: 0,
        keywordResults: [],
        listingResults: [],
        metrics: [],
        missingFields: [],
        evidenceIds: [],
        dataOrigin: 'local-alura-cache',
        error: data.error ?? `Oracle Alura endpoint returned ${response.status}`,
      }
    }
    return data
  } catch (error) {
    return {
      ok: false,
      query,
      sourceMode,
      sourceFilesUsed: [],
      runCount: 0,
      keywordResults: [],
      listingResults: [],
      metrics: [],
      missingFields: [],
      evidenceIds: [],
      dataOrigin: 'local-alura-cache',
      error: error instanceof Error ? error.message : 'Oracle Alura endpoint failed',
    }
  }
}
