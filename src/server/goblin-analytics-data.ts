import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export type GoblinAnalyticsFreshnessState = 'empty' | 'fresh' | 'stale' | 'blocked'

type JsonRecord = Record<string, unknown>

export type GoblinAnalyticsSafety = {
  localOnly: boolean
  readOnly: true
  getOnly: true
  noEtsyWrites: true
  noSupplierMessages: true
  noGeneratedProductImages: true
  liveActionsAllowed: false
  externalRequestsAllowed: false
  writebackAllowed: false
  lockedActions: Array<string>
}

export type GoblinAnalyticsKpiCounts = {
  confirmedGoblins: number
  goblinCandidates: number
  attackNow: number
  newSignals: number
  caveats: number
  hardBlocks: number
}

export type GoblinAnalyticsDatabaseReadback = {
  provider: 'none' | 'supabase'
  workspaceFoundation: true
  coreSchema: 'workspace_core'
  moduleSchema: 'goblin_analytics'
  readModel: 'server-rest'
  liveSource: boolean
  futureWorkspaceModules: Array<string>
}

export type GoblinAnalyticsShop = {
  id: string
  shopName: string
  goblinLevel: string
  salesCount: number | null
  reviewCount: number | null
  activeListingCount: number | null
  lastSeenAt: string | null
}

export type GoblinAnalyticsProduct = {
  id: string
  canonicalName: string
  productFamily: string | null
  imageUrl: string | null
  status: string
  decisionVerdict: string | null
  priceGateStatus: string
  sourceStatus: string
  goblinSignalStatus: string
  minPriceUsd: number | null
  maxPriceUsd: number | null
  monthlySalesEstimate: number | null
  ehuntEstimatedSalesTotal: number | null
  ehuntFavorites: number | null
  decisionNotes: string | null
  lastSeenAt: string | null
  etsyUrl: string | null
  etsyShopName: string | null
  etsyCartSignal: string | null
  etsyViews24: Array<string>
  shipsFromChinaSignal: boolean
  aluraRealDataAvailable: boolean
  aluraStatusLabel: string
  supplierUrl: string | null
  supplierSold: string | null
  supplierPriceIls: number | null
  contactSheetPath: string | null
  researchBatch: string | null
  researchRank: number | null
}

export type GoblinAnalyticsSupplierMatch = {
  id: string
  clusterId: string
  sourcePlatform: string
  sourceUrl: string
  sourceItemId: string | null
  matchStatus: string
  coverageStatus: string
  supplierPriceUsd: number | null
  supplierPriceIls: number | null
  orders: number | null
  imageMatchNotes: string | null
  qaStatus: string
  createdAt: string
}

export type GoblinAnalyticsEvidenceAsset = {
  id: string
  clusterId: string | null
  assetType: string
  storageProvider: string
  pathOrUrl: string
  notes: string | null
  createdAt: string
}

export type GoblinAnalyticsCaveat = {
  id: string
  clusterId: string | null
  type: string
  severity: string
  isKillSwitch: boolean
  message: string
  createdAt: string
}

export type GoblinAnalyticsChartDatum = {
  name: string
  value: number
}

export type GoblinAnalyticsPriceDatum = {
  name: string
  etsyPriceUsd: number
  supplierPriceIls: number
}

export type GoblinAnalyticsChangeEvent = {
  id: string
  eventType: string
  severity: string
  message: string
  createdAt: string
}

export type GoblinAnalyticsSnapshotSource =
  | 'local-empty-snapshot'
  | 'supabase-empty-snapshot'
  | 'supabase-live-snapshot'
  | 'supabase-blocked-snapshot'

export type GoblinAnalyticsSnapshot = {
  ok: true
  schemaVersion: 'goblin-analytics-v1'
  generatedAtMs: number
  source: GoblinAnalyticsSnapshotSource
  freshness: {
    state: GoblinAnalyticsFreshnessState
    label: string
    lastUpdatedMs: number | null
    blockedReason?: string
  }
  database: GoblinAnalyticsDatabaseReadback
  counts: GoblinAnalyticsKpiCounts
  shops: Array<GoblinAnalyticsShop>
  products: Array<GoblinAnalyticsProduct>
  supplierMatches: Array<GoblinAnalyticsSupplierMatch>
  evidenceAssets: Array<GoblinAnalyticsEvidenceAsset>
  caveats: Array<GoblinAnalyticsCaveat>
  charts: {
    velocityTrend: Array<GoblinAnalyticsChartDatum>
    levelDistribution: Array<GoblinAnalyticsChartDatum>
    sourcePlatformMix: Array<GoblinAnalyticsChartDatum>
    caveatDistribution: Array<GoblinAnalyticsChartDatum>
    verdictDistribution: Array<GoblinAnalyticsChartDatum>
    sourceStatusDistribution: Array<GoblinAnalyticsChartDatum>
    priceProof: Array<GoblinAnalyticsPriceDatum>
    workflowFunnel: Array<GoblinAnalyticsChartDatum>
  }
  changeFeed: Array<GoblinAnalyticsChangeEvent>
  safety: GoblinAnalyticsSafety
}

type SupabaseConfig = {
  url: string
  apiKey: string
}

type SupabaseHealthRow = {
  workspace_count: number
  room_count: number
  goblin_cluster_count: number
  goblin_shop_count: number
  goblin_search_run_count: number
  has_goblin_evidence_bucket: boolean
  checked_at: string
}

type SupabaseProductClusterRow = {
  id: string
  canonical_name: string
  product_family: string | null
  canonical_image_url: string | null
  status: string
  price_gate_status: string
  source_status: string
  goblin_signal_status: string
  min_price_usd: number | null
  max_price_usd: number | null
  monthly_sales_estimate: number | null
  decision_notes: string | null
  metadata: JsonRecord | null
  last_seen_at: string | null
}

type SupabaseShopRow = {
  id: string
  shop_name: string
  goblin_level: string
  sales_count: number | null
  review_count: number | null
  active_listing_count: number | null
  last_seen_at: string | null
}

type SupabaseSupplierMatchRow = {
  id: string
  cluster_id: string
  source_platform: string
  source_url: string
  source_item_id: string | null
  match_status: string
  coverage_status: string
  supplier_price_estimate_usd: number | null
  orders: number | null
  variant_coverage: JsonRecord | null
  image_match_notes: string | null
  qa_status: string
  metadata: JsonRecord | null
  created_at: string
}

type SupabaseEvidenceAssetRow = {
  id: string
  entity_id: string | null
  asset_type: string
  storage_provider: string
  path_or_url: string
  notes: string | null
  created_at: string
}

type SupabaseEventRow = {
  id: string
  event_type: string
  severity: string
  message: string
  created_at: string
}

type SupabaseCaveatRow = {
  id: string
  cluster_id: string | null
  type: string
  severity: string
  is_kill_switch: boolean
  message: string
  resolved_at: string | null
  metadata: JsonRecord | null
  created_at: string
}

type SupabaseHardBlockRow = {
  id: string
  resolved_at: string | null
}

const LOCAL_EMPTY_LABEL = 'No local Goblin Analytics snapshot yet'
const SUPABASE_EMPTY_LABEL = 'Supabase connected; no Goblin records yet'

export const GOBLIN_ANALYTICS_LOCKED_ACTIONS = [
  'No Etsy writes',
  'No supplier messages',
  'No generated product images',
  'No live external marketplace requests',
  'No POST API in v1 read-only stage',
] as const

export function getGoblinAnalyticsSnapshot(options: { nowMs?: number } = {}): GoblinAnalyticsSnapshot {
  return createGoblinAnalyticsSnapshot({
    nowMs: options.nowMs,
    source: 'local-empty-snapshot',
    freshness: {
      state: 'empty',
      label: LOCAL_EMPTY_LABEL,
      lastUpdatedMs: null,
    },
    localOnly: true,
  })
}

export async function getGoblinAnalyticsSnapshotForApi(
  options: { nowMs?: number } = {},
): Promise<GoblinAnalyticsSnapshot> {
  const config = getSupabaseConfig()
  if (!config) return getGoblinAnalyticsSnapshot(options)

  try {
    return await getSupabaseGoblinAnalyticsSnapshot(config, options)
  } catch (error) {
    return createGoblinAnalyticsSnapshot({
      nowMs: options.nowMs,
      source: 'supabase-blocked-snapshot',
      freshness: {
        state: 'blocked',
        label: 'Supabase snapshot blocked',
        lastUpdatedMs: null,
        blockedReason: toSafeErrorMessage(error),
      },
      localOnly: false,
    })
  }
}

async function getSupabaseGoblinAnalyticsSnapshot(
  config: SupabaseConfig,
  options: { nowMs?: number },
): Promise<GoblinAnalyticsSnapshot> {
  // Keep the read-only snapshot stable in local Vite/macOS development. Bursting all
  // Supabase REST reads in parallel intermittently exhausts the local fetch/TLS pool
  // and turns a healthy dataset into a misleading blocked snapshot.
  const healthRows = await fetchSupabaseRows<SupabaseHealthRow>(
    config,
    'workspace_core',
    'workspace_foundation_health?select=*',
  )
  const productRows = await fetchSupabaseRows<SupabaseProductClusterRow>(
    config,
    'goblin_analytics',
    'product_clusters?select=id,canonical_name,product_family,canonical_image_url,status,price_gate_status,source_status,goblin_signal_status,min_price_usd,max_price_usd,monthly_sales_estimate,decision_notes,metadata,last_seen_at&order=last_seen_at.desc&limit=200',
  )
  const shopRows = await fetchSupabaseRows<SupabaseShopRow>(
    config,
    'goblin_analytics',
    'shops?select=id,shop_name,goblin_level,sales_count,review_count,active_listing_count,last_seen_at&order=last_seen_at.desc&limit=80',
  )
  const supplierRows = await fetchSupabaseRows<SupabaseSupplierMatchRow>(
    config,
    'goblin_analytics',
    'supplier_matches?select=id,cluster_id,source_platform,source_url,source_item_id,match_status,coverage_status,supplier_price_estimate_usd,orders,variant_coverage,image_match_notes,qa_status,metadata,created_at&order=created_at.desc&limit=400',
  )
  const evidenceRows = await fetchSupabaseRows<SupabaseEvidenceAssetRow>(
    config,
    'workspace_core',
    'evidence_assets?select=id,entity_id,asset_type,storage_provider,path_or_url,notes,created_at&entity_schema=eq.goblin_analytics&entity_table=eq.product_clusters&order=created_at.desc&limit=400',
  )
  const eventRows = await fetchSupabaseRows<SupabaseEventRow>(
    config,
    'goblin_analytics',
    'events?select=id,event_type,severity,message,created_at&order=created_at.desc&limit=30',
  )
  const caveatRows = await fetchSupabaseRows<SupabaseCaveatRow>(
    config,
    'goblin_analytics',
    'caveats?select=id,cluster_id,type,severity,is_kill_switch,message,resolved_at,metadata,created_at&resolved_at=is.null&limit=200',
  )
  const hardBlockRows = await fetchSupabaseRows<SupabaseHardBlockRow>(
    config,
    'goblin_analytics',
    'hard_blocks?select=id,resolved_at&resolved_at=is.null&limit=200',
  )

  const health = healthRows[0]
  const products = productRows.map(mapProductRow)
  const shops = shopRows.map(mapShopRow)
  const supplierMatches = supplierRows.map(mapSupplierRow)
  const evidenceAssets = evidenceRows.map(mapEvidenceRow)
  const caveats = caveatRows.filter((row) => !row.resolved_at).map(mapCaveatRow)
  const activeCaveats = caveatRows.filter((row) => !row.resolved_at)
  const activeHardBlocks = hardBlockRows.filter((row) => !row.resolved_at)
  const changeFeed = eventRows.map(mapEventRow)
  const latestUpdatedAt = getLatestTimestamp([
    health?.checked_at,
    ...productRows.map((row) => row.last_seen_at),
    ...shopRows.map((row) => row.last_seen_at),
    ...eventRows.map((row) => row.created_at),
    ...supplierRows.map((row) => row.created_at),
    ...evidenceRows.map((row) => row.created_at),
  ])
  const hasRecords = Boolean(
    products.length
      || shops.length
      || supplierMatches.length
      || evidenceAssets.length
      || changeFeed.length
      || activeCaveats.length
      || activeHardBlocks.length
      || (health && (health.goblin_cluster_count > 0 || health.goblin_shop_count > 0 || health.goblin_search_run_count > 0)),
  )

  return createGoblinAnalyticsSnapshot({
    nowMs: options.nowMs,
    source: hasRecords ? 'supabase-live-snapshot' : 'supabase-empty-snapshot',
    freshness: {
      state: hasRecords ? 'fresh' : 'empty',
      label: hasRecords ? 'Supabase Goblin Analytics snapshot loaded' : SUPABASE_EMPTY_LABEL,
      lastUpdatedMs: latestUpdatedAt,
    },
    counts: {
      confirmedGoblins: products.filter((product) => ['confirmed', 'green'].includes(product.status)).length,
      goblinCandidates: products.filter((product) => ['new', 'candidate', 'watch'].includes(product.status)).length,
      attackNow: products.filter((product) => product.status === 'attack_now' || product.priceGateStatus === 'green').length,
      newSignals: changeFeed.length || health?.goblin_search_run_count || 0,
      caveats: activeCaveats.length,
      hardBlocks: activeHardBlocks.length,
    },
    shops,
    products,
    supplierMatches,
    evidenceAssets,
    caveats,
    charts: buildCharts(products, shops, supplierMatches, caveats),
    changeFeed,
    localOnly: false,
  })
}

function createGoblinAnalyticsSnapshot(input: {
  nowMs?: number
  source: GoblinAnalyticsSnapshotSource
  freshness: GoblinAnalyticsSnapshot['freshness']
  counts?: GoblinAnalyticsKpiCounts
  shops?: Array<GoblinAnalyticsShop>
  products?: Array<GoblinAnalyticsProduct>
  supplierMatches?: Array<GoblinAnalyticsSupplierMatch>
  evidenceAssets?: Array<GoblinAnalyticsEvidenceAsset>
  caveats?: Array<GoblinAnalyticsCaveat>
  charts?: GoblinAnalyticsSnapshot['charts']
  changeFeed?: Array<GoblinAnalyticsChangeEvent>
  localOnly: boolean
}): GoblinAnalyticsSnapshot {
  return {
    ok: true,
    schemaVersion: 'goblin-analytics-v1',
    generatedAtMs: input.nowMs ?? Date.now(),
    source: input.source,
    freshness: input.freshness,
    database: {
      provider: input.localOnly ? 'none' : 'supabase',
      workspaceFoundation: true,
      coreSchema: 'workspace_core',
      moduleSchema: 'goblin_analytics',
      readModel: 'server-rest',
      liveSource: input.source === 'supabase-live-snapshot',
      futureWorkspaceModules: [
        'daily-news',
        'approvals',
        'artifacts',
        'etsy-market-lab',
        'terra-forge',
        'council',
      ],
    },
    counts: input.counts ?? {
      confirmedGoblins: 0,
      goblinCandidates: 0,
      attackNow: 0,
      newSignals: 0,
      caveats: 0,
      hardBlocks: 0,
    },
    shops: input.shops ?? [],
    products: input.products ?? [],
    supplierMatches: input.supplierMatches ?? [],
    evidenceAssets: input.evidenceAssets ?? [],
    caveats: input.caveats ?? [],
    charts: input.charts ?? {
      velocityTrend: [],
      levelDistribution: [],
      sourcePlatformMix: [],
      caveatDistribution: [],
      verdictDistribution: [],
      sourceStatusDistribution: [],
      priceProof: [],
      workflowFunnel: [],
    },
    changeFeed: input.changeFeed ?? [],
    safety: {
      localOnly: input.localOnly,
      readOnly: true,
      getOnly: true,
      noEtsyWrites: true,
      noSupplierMessages: true,
      noGeneratedProductImages: true,
      liveActionsAllowed: false,
      externalRequestsAllowed: false,
      writebackAllowed: false,
      lockedActions: [...GOBLIN_ANALYTICS_LOCKED_ACTIONS],
    },
  }
}

async function fetchSupabaseRows<Row>(
  config: SupabaseConfig,
  schema: 'workspace_core' | 'goblin_analytics',
  pathAndQuery: string,
): Promise<Array<Row>> {
  const response = await fetch(`${config.url}/rest/v1/${pathAndQuery}`, {
    method: 'GET',
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      'accept-profile': schema,
      accept: 'application/json',
      connection: 'close',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Supabase ${schema} read failed (${response.status}): ${redactSecrets(body).slice(0, 240)}`)
  }

  const payload = await response.json() as unknown
  if (!Array.isArray(payload)) {
    throw new Error(`Supabase ${schema} response was not an array`)
  }
  return payload as Array<Row>
}

function getSupabaseConfig(): SupabaseConfig | null {
  if (readEnv('GOBLIN_DB_MODE') !== 'supabase') return null

  const url = readEnv('GOBLIN_SUPABASE_URL')
  const apiKey = readEnv('GOBLIN_SUPABASE_SERVICE_ROLE_KEY')
    ?? readEnv('GOBLIN_SUPABASE_SECRET_KEY')
    ?? readEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !apiKey) return null
  return { url: url.replace(/\/$/, ''), apiKey }
}

function readEnv(key: string): string | undefined {
  const value = process.env[key]
  if (value && value.trim()) return value.trim()
  return readLocalDotEnv()[key]
}

let localDotEnvCache: Record<string, string> | null = null

function readLocalDotEnv(): Record<string, string> {
  if (localDotEnvCache) return localDotEnvCache

  localDotEnvCache = {}
  const envPath = path.join(process.cwd(), '.env')
  if (!existsSync(envPath)) return localDotEnvCache

  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [rawKey, ...rawValueParts] = line.split('=')
    const key = rawKey.trim()
    const rawValue = rawValueParts.join('=').trim()
    localDotEnvCache[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }
  return localDotEnvCache
}

function mapProductRow(row: SupabaseProductClusterRow): GoblinAnalyticsProduct {
  const metadata = row.metadata ?? {}
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    productFamily: row.product_family,
    imageUrl: row.canonical_image_url,
    status: row.status,
    decisionVerdict: stringFromMetadata(metadata, 'verdict'),
    priceGateStatus: row.price_gate_status,
    sourceStatus: row.source_status,
    goblinSignalStatus: row.goblin_signal_status,
    minPriceUsd: row.min_price_usd,
    maxPriceUsd: row.max_price_usd,
    monthlySalesEstimate: row.monthly_sales_estimate,
    ehuntEstimatedSalesTotal: numberFromMetadata(metadata, 'ehunt_estimated_sales_total'),
    ehuntFavorites: numberFromMetadata(metadata, 'ehunt_favorites'),
    decisionNotes: row.decision_notes,
    lastSeenAt: row.last_seen_at,
    etsyUrl: stringFromMetadata(metadata, 'etsy_url'),
    etsyShopName: stringFromMetadata(metadata, 'etsy_shop_name'),
    etsyCartSignal: stringFromMetadata(metadata, 'etsy_cart_signal'),
    etsyViews24: stringArrayFromMetadata(metadata, 'etsy_views24'),
    shipsFromChinaSignal: booleanFromMetadata(metadata, 'ships_from_china_signal'),
    aluraRealDataAvailable: booleanFromMetadata(metadata, 'alura_real_data_available'),
    aluraStatusLabel: booleanFromMetadata(metadata, 'alura_real_data_available') ? 'real demand loaded' : 'blocked / placeholder',
    supplierUrl: stringFromMetadata(metadata, 'supplier_url'),
    supplierSold: stringFromMetadata(metadata, 'supplier_sold_signal'),
    supplierPriceIls: numberFromMetadata(metadata, 'supplier_price_ils'),
    contactSheetPath: stringFromMetadata(metadata, 'contact_sheet_path'),
    researchBatch: stringFromMetadata(metadata, 'research_batch'),
    researchRank: numberFromMetadata(metadata, 'rank'),
  }
}

function mapShopRow(row: SupabaseShopRow): GoblinAnalyticsShop {
  return {
    id: row.id,
    shopName: row.shop_name,
    goblinLevel: row.goblin_level,
    salesCount: row.sales_count,
    reviewCount: row.review_count,
    activeListingCount: row.active_listing_count,
    lastSeenAt: row.last_seen_at,
  }
}

function mapSupplierRow(row: SupabaseSupplierMatchRow): GoblinAnalyticsSupplierMatch {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    sourcePlatform: row.source_platform,
    sourceUrl: row.source_url,
    sourceItemId: row.source_item_id,
    matchStatus: row.match_status,
    coverageStatus: row.coverage_status,
    supplierPriceUsd: row.supplier_price_estimate_usd,
    supplierPriceIls: numberFromMetadata(row.variant_coverage ?? row.metadata ?? {}, 'source_price_ils')
      ?? numberFromMetadata(row.metadata ?? {}, 'supplier_price_ils'),
    orders: row.orders,
    imageMatchNotes: row.image_match_notes,
    qaStatus: row.qa_status,
    createdAt: row.created_at,
  }
}

function mapEvidenceRow(row: SupabaseEvidenceAssetRow): GoblinAnalyticsEvidenceAsset {
  return {
    id: row.id,
    clusterId: row.entity_id,
    assetType: row.asset_type,
    storageProvider: row.storage_provider,
    pathOrUrl: row.path_or_url,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

function mapCaveatRow(row: SupabaseCaveatRow): GoblinAnalyticsCaveat {
  return {
    id: row.id,
    clusterId: row.cluster_id,
    type: row.type,
    severity: row.severity,
    isKillSwitch: row.is_kill_switch,
    message: row.message,
    createdAt: row.created_at,
  }
}

function mapEventRow(row: SupabaseEventRow): GoblinAnalyticsChangeEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    severity: row.severity,
    message: row.message,
    createdAt: row.created_at,
  }
}

function buildCharts(
  products: Array<GoblinAnalyticsProduct>,
  shops: Array<GoblinAnalyticsShop>,
  supplierMatches: Array<GoblinAnalyticsSupplierMatch>,
  caveats: Array<GoblinAnalyticsCaveat>,
): GoblinAnalyticsSnapshot['charts'] {
  const priceProof = products
    .filter((product) => typeof product.minPriceUsd === 'number')
    .map((product) => ({
      name: compactProductName(product.canonicalName),
      etsyPriceUsd: product.minPriceUsd ?? 0,
      supplierPriceIls: product.supplierPriceIls ?? 0,
    }))

  return {
    velocityTrend: [
      { name: 'Etsy scan', value: products.length },
      { name: 'Supplier proof', value: supplierMatches.filter((match) => match.matchStatus !== 'rejected').length },
      { name: 'Alura demand', value: products.filter((product) => product.aluraRealDataAvailable).length },
      { name: 'GREEN', value: products.filter((product) => ['green', 'confirmed'].includes(product.status)).length },
    ],
    levelDistribution: countBy(shops, (shop) => shop.goblinLevel || 'none'),
    sourcePlatformMix: countBy(supplierMatches, (match) => `${match.sourcePlatform}:${match.matchStatus}`),
    caveatDistribution: countBy(caveats, (caveat) => caveat.type || caveat.severity),
    verdictDistribution: countBy(products, (product) => product.decisionVerdict || product.status),
    sourceStatusDistribution: countBy(products, (product) => product.sourceStatus),
    priceProof,
    workflowFunnel: [
      { name: 'Seeds', value: products.length },
      { name: 'Supplier candidates', value: supplierMatches.length },
      { name: 'High-near source', value: supplierMatches.filter((match) => ['high_near', 'exact'].includes(match.matchStatus)).length },
      { name: 'Alura OK', value: products.filter((product) => product.aluraRealDataAvailable).length },
      { name: 'GREEN', value: products.filter((product) => ['green', 'confirmed'].includes(product.status)).length },
    ],
  }
}

function countBy<T>(items: Array<T>, getName: (item: T) => string): Array<GoblinAnalyticsChartDatum> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const name = getName(item) || 'unknown'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value }))
}

function compactProductName(name: string): string {
  if (/lamp/i.test(name)) return 'Lamp'
  if (/mug/i.test(name)) return 'Mug'
  if (/vase/i.test(name)) return 'Vase'
  return name.split(/\s+/).slice(0, 3).join(' ')
}

function stringFromMetadata(metadata: JsonRecord, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function numberFromMetadata(metadata: JsonRecord, key: string): number | null {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function booleanFromMetadata(metadata: JsonRecord, key: string): boolean {
  return metadata[key] === true
}

function stringArrayFromMetadata(metadata: JsonRecord, key: string): Array<string> {
  const value = metadata[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getLatestTimestamp(values: Array<string | null | undefined>): number | null {
  const timestamps = values
    .map((value) => value ? Date.parse(value) : Number.NaN)
    .filter(Number.isFinite)
  if (!timestamps.length) return null
  return Math.max(...timestamps)
}

function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) return redactSecrets(error.message)
  return redactSecrets(String(error))
}

function redactSecrets(value: string): string {
  return value.replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[SUPABASE_KEY_REDACTED]')
}
