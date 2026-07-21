import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { ResearchAtlasSurface } from './ResearchAtlasSurface'
import type { ReactNode } from 'react'
import type { ResearchMissionResponse } from '../../../lib/war-room/living-v3/research-atlas-contract'

import './goblin-analytics-shell.css'

type GoblinAnalyticsProduct = {
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

type GoblinAnalyticsShop = {
  id: string
  shopName: string
  goblinLevel: string
  salesCount: number | null
  reviewCount: number | null
  activeListingCount: number | null
  lastSeenAt: string | null
}

type GoblinAnalyticsEvent = {
  id: string
  eventType: string
  severity: string
  message: string
  createdAt: string
}

type GoblinAnalyticsSupplierMatch = {
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

type GoblinAnalyticsEvidenceAsset = {
  id: string
  clusterId: string | null
  assetType: string
  storageProvider: string
  pathOrUrl: string
  notes: string | null
  createdAt: string
}

type GoblinAnalyticsCaveat = {
  id: string
  clusterId: string | null
  type: string
  severity: string
  isKillSwitch: boolean
  message: string
  createdAt: string
}

type GoblinChartDatum = { name: string; value: number }
type GoblinPriceDatum = { name: string; etsyPriceUsd: number; supplierPriceIls: number }
type GoblinProductFilter = 'all' | 'green' | 'watch' | 'source' | 'weak'
type GoblinEvidencePanel = 'decision' | 'supplier' | 'proof' | 'stops'

type GoblinAnalyticsApiSnapshot = {
  ok: true
  schemaVersion: 'goblin-analytics-v1'
  generatedAtMs: number
  source: 'local-empty-snapshot' | 'supabase-empty-snapshot' | 'supabase-live-snapshot' | 'supabase-blocked-snapshot'
  freshness: {
    state: 'empty' | 'fresh' | 'stale' | 'blocked'
    label: string
    lastUpdatedMs: number | null
    blockedReason?: string
  }
  database: {
    provider: 'none' | 'supabase'
    workspaceFoundation: true
    coreSchema: 'workspace_core'
    moduleSchema: 'goblin_analytics'
    readModel: 'server-rest'
    liveSource: boolean
    futureWorkspaceModules: Array<string>
  }
  counts: {
    confirmedGoblins: number
    goblinCandidates: number
    attackNow: number
    newSignals: number
    caveats: number
    hardBlocks: number
  }
  shops: Array<GoblinAnalyticsShop>
  products: Array<GoblinAnalyticsProduct>
  supplierMatches: Array<GoblinAnalyticsSupplierMatch>
  evidenceAssets: Array<GoblinAnalyticsEvidenceAsset>
  caveats: Array<GoblinAnalyticsCaveat>
  charts: {
    velocityTrend: Array<GoblinChartDatum>
    levelDistribution: Array<GoblinChartDatum>
    sourcePlatformMix: Array<GoblinChartDatum>
    caveatDistribution: Array<GoblinChartDatum>
    verdictDistribution: Array<GoblinChartDatum>
    sourceStatusDistribution: Array<GoblinChartDatum>
    priceProof: Array<GoblinPriceDatum>
    workflowFunnel: Array<GoblinChartDatum>
  }
  changeFeed: Array<GoblinAnalyticsEvent>
  safety: {
    localOnly: boolean
    readOnly: true
    getOnly: true
    noEtsyWrites: true
    noSupplierMessages: true
    noGeneratedProductImages: true
    liveActionsAllowed: false
    externalRequestsAllowed: false
    writebackAllowed: false
  }
}

type GoblinAnalyticsApiState =
  | { status: 'loading'; snapshot?: undefined; error?: undefined }
  | { status: 'ready'; snapshot: GoblinAnalyticsApiSnapshot; error?: undefined }
  | { status: 'failed'; snapshot?: undefined; error: string }

type WorkspaceKernelRun = {
  runId: string
  status: string
  stage: string
  blueprintId: string
  actionSummary: string
  ownerRoomId?: string
  ownerStationId?: string
  updatedAtMs: number
  events?: Array<{ type: string; message: string; createdAtMs: number }>
}

type WorkspaceKernelApiSnapshot = {
  ok: true
  state: {
    runs: Array<WorkspaceKernelRun>
    updatedAtMs?: number
  }
}

type WorkspaceKernelApiState =
  | { status: 'loading'; snapshot?: undefined; error?: undefined }
  | { status: 'ready'; snapshot: WorkspaceKernelApiSnapshot; error?: undefined }
  | { status: 'failed'; snapshot?: undefined; error: string }

type GoblinAnalyticsShellProps = {
  variant?: 'station' | 'primary'
  onClose?: () => void
  navigationSlot?: ReactNode
  onMissionStaged?: (result: ResearchMissionResponse) => void
}

const EMPTY_COUNTS: GoblinAnalyticsApiSnapshot['counts'] = {
  confirmedGoblins: 0,
  goblinCandidates: 0,
  attackNow: 0,
  newSignals: 0,
  caveats: 0,
  hardBlocks: 0,
}

const FILTERS: Array<{ id: GoblinProductFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'green', label: 'Green' },
  { id: 'watch', label: 'Watch' },
  { id: 'source', label: 'Source proof' },
  { id: 'weak', label: 'Weak demand' },
]

const PANELS: Array<{ id: GoblinEvidencePanel; label: string }> = [
  { id: 'decision', label: 'Decision' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'proof', label: 'Proof sheets' },
  { id: 'stops', label: 'Stops' },
]

function isGoblinAnalyticsSnapshot(value: unknown): value is GoblinAnalyticsApiSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const snapshot = value as Partial<GoblinAnalyticsApiSnapshot>
  return snapshot.ok === true
    && snapshot.schemaVersion === 'goblin-analytics-v1'
    && typeof snapshot.generatedAtMs === 'number'
    && Boolean(snapshot.freshness)
    && Boolean(snapshot.counts)
    && Array.isArray(snapshot.shops)
    && Array.isArray(snapshot.products)
    && Array.isArray(snapshot.supplierMatches)
    && Array.isArray(snapshot.evidenceAssets)
    && Array.isArray(snapshot.caveats)
    && Boolean(snapshot.database)
    && snapshot.database?.workspaceFoundation === true
    && snapshot.safety?.readOnly === true
    && snapshot.safety.getOnly === true
}

function isWorkspaceKernelSnapshot(value: unknown): value is WorkspaceKernelApiSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const snapshot = value as Partial<WorkspaceKernelApiSnapshot>
  return snapshot.ok === true
    && Boolean(snapshot.state)
    && Array.isArray(snapshot.state?.runs)
}

function isHardResearchRun(run: WorkspaceKernelRun) {
  const summary = `${run.actionSummary} ${run.blueprintId} ${run.ownerRoomId ?? ''} ${run.ownerStationId ?? ''}`.toLowerCase()
  return run.blueprintId === 'etsy-live-readonly-research-v1'
    || run.blueprintId === 'supplier-proof-v1'
    || run.blueprintId === 'seo-alura-keyword-v1'
    || summary.includes('goblin')
    || summary.includes('research')
    || summary.includes('scout')
    || summary.includes('etsy')
    || summary.includes('aliexpress')
    || summary.includes('alura')
    || summary.includes('supplier')
}

function isActiveRun(run: WorkspaceKernelRun) {
  return run.status === 'queued' || run.status === 'running' || run.status === 'waiting_approval'
}

function latestEventMessage(run: WorkspaceKernelRun | undefined) {
  const event = run?.events?.slice().sort((left, right) => right.createdAtMs - left.createdAtMs)[0]
  return event?.message ?? run?.actionSummary ?? 'No active Hermes research run.'
}

function pickAgentResearchRun(snapshot?: WorkspaceKernelApiSnapshot) {
  const hardResearchRuns = (snapshot?.state.runs ?? []).filter(isHardResearchRun)
  const recent = hardResearchRuns.filter((run) => Date.now() - run.updatedAtMs < 1000 * 60 * 60 * 6)
  const active = recent.filter(isActiveRun)
  const candidates = active.length ? active : recent
  return candidates.sort((left, right) => right.updatedAtMs - left.updatedAtMs)[0]
}

function money(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function ils(value: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(value)
}

function clean(value: string | null | undefined) {
  return value ? value.replace(/_/g, ' ') : '—'
}

function short(value: string | null | undefined, max = 92) {
  if (!value) return 'No note yet.'
  const text = value.replace(/Product-demand correction:\s*/i, '').trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function sourceShopUrl(shopName: string | null | undefined) {
  return shopName ? `https://www.etsy.com/shop/${encodeURIComponent(shopName)}` : null
}

function grossSpread(product: GoblinAnalyticsProduct) {
  const match = product.decisionNotes?.match(/gross spread=\$([0-9]+(?:\.[0-9]+)?)/i)
  return match ? Number(match[1]) : null
}

function spreadLabel(product: GoblinAnalyticsProduct) {
  const spread = grossSpread(product)
  return typeof spread === 'number' && Number.isFinite(spread) ? money(spread) : 'Needs proof'
}

function demandLabel(product: GoblinAnalyticsProduct) {
  if (typeof product.monthlySalesEstimate === 'number' && Number.isFinite(product.monthlySalesEstimate)) {
    return `${Math.round(product.monthlySalesEstimate)}/mo`
  }
  if (typeof product.ehuntEstimatedSalesTotal === 'number' && Number.isFinite(product.ehuntEstimatedSalesTotal)) {
    return `${Math.round(product.ehuntEstimatedSalesTotal)} EHunt est. total`
  }
  return 'No listing estimate'
}

function productDecision(product: GoblinAnalyticsProduct) {
  const demand = product.monthlySalesEstimate ?? 0
  if (product.status === 'green' && demand >= 30) return { label: 'WOW candidate', tone: 'green', reason: 'Demand and source proof are both strong.' }
  if (product.status === 'green') return { label: 'Baseline green', tone: 'green', reason: 'Source proof passed. Demand is useful, not WOW.' }
  if (product.status === 'blocked') return { label: 'Blocked', tone: 'red', reason: 'Do not use until the blocker is cleared.' }
  if (product.status === 'candidate' && (product.ehuntEstimatedSalesTotal ?? 0) > 0) {
    return { label: 'Candidate evidence', tone: 'amber', reason: 'Positive EHunt listing estimate plus source proof; not official Etsy sales and not a monthly-sales claim.' }
  }
  if (product.sourceStatus.includes('exact') || product.sourceStatus.includes('verified') || product.sourceStatus.includes('supplier')) {
    return { label: 'Watch only', tone: 'amber', reason: 'Source match exists, but product demand is too weak.' }
  }
  return { label: 'Needs proof', tone: 'neutral', reason: 'Demand or supplier proof is still missing.' }
}

function productMatchesFilter(product: GoblinAnalyticsProduct, filter: GoblinProductFilter) {
  if (filter === 'all') return true
  if (filter === 'green') return product.status === 'green' || product.status === 'confirmed'
  if (filter === 'watch') return product.status !== 'green' && product.status !== 'blocked'
  if (filter === 'source') return product.sourceStatus.includes('exact') || product.sourceStatus.includes('verified') || product.sourceStatus.includes('supplier')
  return !product.monthlySalesEstimate || product.monthlySalesEstimate < 20
}

function productMatchesQuery(product: GoblinAnalyticsProduct, query: string) {
  if (!query) return true
  return [product.canonicalName, product.etsyShopName, product.productFamily, product.sourceStatus, product.decisionVerdict, product.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function updatedLabel(ms: number | null | undefined) {
  if (!ms) return 'no timestamp'
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
}

function dataSourceLabel(snapshot?: GoblinAnalyticsApiSnapshot) {
  if (!snapshot) return 'Reading database'
  if (snapshot.source === 'supabase-live-snapshot') return 'Supabase live readback'
  if (snapshot.source === 'supabase-blocked-snapshot') return 'Supabase blocked'
  return 'Fallback snapshot'
}

function isCurrentResearchProduct(product: GoblinAnalyticsProduct) {
  return product.decisionNotes?.includes('Product-demand correction')
}

function latestResearchBatch(products: Array<GoblinAnalyticsProduct>) {
  return products
    .filter((product) => product.researchBatch && product.lastSeenAt)
    .sort((left, right) => Date.parse(right.lastSeenAt ?? '') - Date.parse(left.lastSeenAt ?? ''))
    .at(0)?.researchBatch ?? null
}

export function GoblinAnalyticsShell({ variant = 'station', onClose, navigationSlot, onMissionStaged }: GoblinAnalyticsShellProps = {}) {
  const primaryMode = variant === 'primary'
  const [apiState, setApiState] = useState<GoblinAnalyticsApiState>({ status: 'loading' })
  const [kernelState, setKernelState] = useState<WorkspaceKernelApiState>({ status: 'loading' })
  const [workbenchOpen, setWorkbenchOpen] = useState(primaryMode)
  const [primaryView, setPrimaryView] = useState<'radar' | 'research'>('radar')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [productQuery, setProductQuery] = useState('')
  const [productFilter, setProductFilter] = useState<GoblinProductFilter>('all')
  const [panel, setPanel] = useState<GoblinEvidencePanel>('decision')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [readbackStatus, setReadbackStatus] = useState<'loading' | 'refreshing' | 'idle' | 'failed'>('loading')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        if (!cancelled) setReadbackStatus(refreshNonce === 0 ? 'loading' : 'refreshing')
        const response = await fetch('/api/war-room/goblin-analytics', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        })
        const payload = await response.json() as unknown
        if (!response.ok || !isGoblinAnalyticsSnapshot(payload)) {
          throw new Error(`Goblin Analytics API failed (${response.status})`)
        }
        if (!cancelled) {
          setApiState({ status: 'ready', snapshot: payload })
          setReadbackStatus('idle')
        }
        try {
          const kernelResponse = await fetch('/api/war-room/workspace-kernel/state', {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
          })
          const kernelPayload = await kernelResponse.json() as unknown
          if (!kernelResponse.ok || !isWorkspaceKernelSnapshot(kernelPayload)) {
            throw new Error(`Workspace kernel API failed (${kernelResponse.status})`)
          }
          if (!cancelled) setKernelState({ status: 'ready', snapshot: kernelPayload })
        } catch (kernelError) {
          if (!cancelled) setKernelState({ status: 'failed', error: (kernelError as Error).message })
        }
      } catch (error) {
        if (!cancelled) {
          setApiState({ status: 'failed', error: (error as Error).message })
          setReadbackStatus('failed')
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [refreshNonce])

  useEffect(() => {
    const idleRefreshMs = 60000
    const interval = window.setInterval(() => setRefreshNonce((value) => value + 1), idleRefreshMs)
    return () => window.clearInterval(interval)
  }, [])

  const snapshot = apiState.status === 'ready' ? apiState.snapshot : undefined
  const counts = snapshot?.counts ?? EMPTY_COUNTS
  const products = snapshot?.products ?? []
  const shops = snapshot?.shops ?? []
  const supplierMatches = snapshot?.supplierMatches ?? []
  const evidenceAssets = snapshot?.evidenceAssets ?? []
  const caveats = snapshot?.caveats ?? []
  const latestEvent = snapshot?.changeFeed[0]

  const visibleProducts = useMemo(() => {
    const batch = latestResearchBatch(products)
    if (batch) {
      return products
        .filter((product) => product.researchBatch === batch)
        .sort((left, right) => (left.researchRank ?? Number.POSITIVE_INFINITY) - (right.researchRank ?? Number.POSITIVE_INFINITY))
    }
    const current = products.filter(isCurrentResearchProduct)
    return current.length ? current : products
  }, [products])

  const productsByShop = useMemo(() => {
    const shopNames = Array.from(new Set(visibleProducts.map((product) => product.etsyShopName).filter(Boolean))) as Array<string>
    return shopNames.map((shopName) => {
      const shop = shops.find((item) => item.shopName === shopName)
      const shopProducts = visibleProducts.filter((product) => product.etsyShopName === shopName)
      return {
        id: shop?.id ?? shopName,
        shopName,
        shop,
        products: shopProducts,
        green: shopProducts.filter((product) => product.status === 'green').length,
        watch: shopProducts.filter((product) => product.status !== 'green').length,
        sourceProof: shopProducts.filter((product) => product.sourceStatus.includes('exact') || product.sourceStatus.includes('verified') || product.sourceStatus.includes('supplier')).length,
      }
    })
  }, [shops, visibleProducts])

  const normalizedQuery = productQuery.trim().toLowerCase()
  const filteredProducts = useMemo(() => (
    visibleProducts.filter((product) => productMatchesFilter(product, productFilter) && productMatchesQuery(product, normalizedQuery))
  ), [visibleProducts, productFilter, normalizedQuery])

  const selectedProduct = useMemo(() => (
    filteredProducts.find((product) => product.id === selectedProductId)
      ?? visibleProducts.find((product) => product.id === selectedProductId)
      ?? filteredProducts.at(0)
      ?? visibleProducts.at(0)
  ), [filteredProducts, selectedProductId, visibleProducts])

  useEffect(() => {
    const firstProduct = visibleProducts.at(0)
    if (!selectedProductId && firstProduct) setSelectedProductId(firstProduct.id)
  }, [selectedProductId, visibleProducts])

  useEffect(() => {
    if (primaryMode) setWorkbenchOpen(true)
  }, [primaryMode])

  const selectedDecision = selectedProduct ? productDecision(selectedProduct) : null
  const selectedSuppliers = selectedProduct ? supplierMatches.filter((match) => match.clusterId === selectedProduct.id) : []
  const selectedEvidence = selectedProduct ? evidenceAssets.filter((asset) => asset.clusterId === selectedProduct.id) : []
  const selectedCaveats = selectedProduct ? caveats.filter((caveat) => caveat.clusterId === selectedProduct.id) : []
  const selectedShop = selectedProduct?.etsyShopName ? shops.find((shop) => shop.shopName === selectedProduct.etsyShopName) : undefined
  const greenCount = visibleProducts.filter((product) => product.status === 'green' || product.status === 'confirmed').length
  const wowCount = visibleProducts.filter((product) => product.status === 'green' && (product.monthlySalesEstimate ?? 0) >= 30).length
  const watchCount = visibleProducts.filter((product) => product.status !== 'green' && product.status !== 'blocked').length
  const weakDemandCount = visibleProducts.filter((product) => (
    typeof product.monthlySalesEstimate === 'number'
      ? product.monthlySalesEstimate < 20
      : (product.ehuntEstimatedSalesTotal ?? 0) <= 0
  )).length
  const demandCheckedCount = visibleProducts.filter((product) => (
    typeof product.monthlySalesEstimate === 'number' || typeof product.ehuntEstimatedSalesTotal === 'number'
  )).length
  const sourceProofCount = visibleProducts.filter((product) => product.sourceStatus.includes('exact') || product.sourceStatus.includes('verified') || product.sourceStatus.includes('supplier')).length
  const marginCheckedCount = visibleProducts.filter((product) => grossSpread(product) !== null).length
  const liveStages = [
    { id: 'scout', label: 'Scout', value: `${visibleProducts.length} seeds`, tone: visibleProducts.length ? 'done' : 'active' },
    { id: 'demand', label: 'Demand gate', value: `${demandCheckedCount}/${visibleProducts.length}`, tone: demandCheckedCount === visibleProducts.length && visibleProducts.length ? 'done' : 'active' },
    { id: 'source', label: 'Source proof', value: `${sourceProofCount}/${visibleProducts.length}`, tone: sourceProofCount === visibleProducts.length && visibleProducts.length ? 'done' : 'active' },
    { id: 'margin', label: 'Margin', value: `${marginCheckedCount}/${visibleProducts.length}`, tone: marginCheckedCount === visibleProducts.length && visibleProducts.length ? 'done' : 'active' },
    { id: 'decision', label: 'Decision', value: `${greenCount} green · ${watchCount} watch`, tone: wowCount ? 'done' : 'blocked' },
  ]
  const dbRows = products.length + shops.length + supplierMatches.length + evidenceAssets.length + caveats.length
  const freshnessLabel = apiState.status === 'loading' ? 'Loading' : apiState.status === 'failed' ? 'Blocked' : snapshot?.freshness.state ?? 'empty'
  const freshnessDetail = apiState.status === 'failed' ? apiState.error : snapshot?.freshness.label ?? 'Reading GET snapshot'
  const agentResearchRun = pickAgentResearchRun(kernelState.status === 'ready' ? kernelState.snapshot : undefined)
  const agentResearchActive = agentResearchRun ? isActiveRun(agentResearchRun) : false
  const agentResearchLabel = agentResearchRun
    ? agentResearchActive
      ? `Hermes detected: ${clean(agentResearchRun.stage)}`
      : `Last hard research: ${clean(agentResearchRun.status)}`
    : kernelState.status === 'failed'
      ? 'Agent listener blocked'
      : 'Agent listener armed'
  const agentResearchDetail = agentResearchRun
    ? latestEventMessage(agentResearchRun)
    : kernelState.status === 'failed'
      ? kernelState.error
      : 'When Hermes starts hard research, this row should switch to a run card automatically.'

  const primaryViewTabs = primaryMode ? (
    <div className="goblin-workbench__view-tabs" role="tablist" aria-label="Goblin discovery tools" data-goblin-view-tabs="radar-research">
      <button type="button" role="tab" aria-selected={primaryView === 'radar'} className={primaryView === 'radar' ? 'is-active' : undefined} onClick={() => setPrimaryView('radar')}>
        <b>Opportunity Radar</b>
        <span>Products + source shops</span>
      </button>
      <button type="button" role="tab" aria-selected={primaryView === 'research'} className={primaryView === 'research' ? 'is-active' : undefined} data-goblin-open-research-atlas="true" onClick={() => setPrimaryView('research')}>
        <b>Research Atlas</b>
        <span>Reports + market maps</span>
      </button>
    </div>
  ) : null

  const closeWorkbench = () => {
    if (primaryMode) {
      onClose?.()
      return
    }
    setWorkbenchOpen(false)
  }

  const workbenchSurface = snapshot ? (
    <div className={`goblin-workbench ${primaryMode ? 'goblin-workbench--embedded' : ''}`} role="dialog" aria-modal={primaryMode ? 'false' : 'true'} aria-label="Goblin Analytics workbench" data-goblin-workbench-modal={primaryMode ? undefined : 'true'} data-goblin-workbench-primary={primaryMode ? 'true' : undefined}>
      {!primaryMode && <div className="goblin-workbench__backdrop" aria-hidden="true" onClick={closeWorkbench} />}
      <section className="goblin-workbench__panel">
        <header className="goblin-workbench__topbar">
          <div>
            <span className="goblin-eyebrow">Goblin Analytics</span>
            <h2>Goblin Control Table</h2>
            <p>טבלת עבודה: החלטה → חנות מקור → מוצר → ספק → ראיות. בלי פוסטר, בלי גרפים, בלי דיבאג.</p>
          </div>
          <div className="goblin-workbench__top-actions">
            {navigationSlot && <div className="goblin-workbench__nav-slot">{navigationSlot}</div>}
            {primaryViewTabs}
            {!primaryMode && <button type="button" className="goblin-close" onClick={closeWorkbench} aria-label="Close Goblin Analytics workbench">×</button>}
          </div>
        </header>

        <section className="goblin-command" data-goblin-three-second-summary="true" aria-label="Goblin three second summary">
          <article data-tone={wowCount ? 'green' : 'red'}>
            <span>WOW לתקיפה</span>
            <b>{wowCount}</b>
            <small>{wowCount ? 'אפשר לבדוק Draft' : 'אין מוצר WOW כרגע'}</small>
          </article>
          <article data-tone={greenCount ? 'green' : 'amber'}>
            <span>ירוק בסיסי</span>
            <b>{greenCount}</b>
            <small>לא לפרסם בלי אישור</small>
          </article>
          <article data-tone="amber">
            <span>מעקב</span>
            <b>{watchCount}</b>
            <small>{weakDemandCount} עם ביקוש חלש</small>
          </article>
          <article data-tone="neutral">
            <span>מקור מידע</span>
            <b>{snapshot.source === 'supabase-live-snapshot' ? 'Live' : freshnessLabel}</b>
            <small>{updatedLabel(snapshot.freshness.lastUpdatedMs)}</small>
          </article>
        </section>

        <section className="goblin-live-pipeline" data-goblin-live-pipeline="true" data-goblin-readback-state={readbackStatus} aria-label="Live Goblin research pipeline">
          <div className="goblin-live-pipeline__status">
            <span className="goblin-eyebrow">Live pipeline</span>
            <b>{readbackStatus === 'refreshing' ? 'Refreshing readback…' : readbackStatus === 'loading' ? 'Loading readback…' : readbackStatus === 'failed' ? 'Readback blocked' : 'Watching research state'}</b>
            <small>{dataSourceLabel(snapshot)} · idle refresh every 60s · {updatedLabel(snapshot.freshness.lastUpdatedMs)}</small>
          </div>
          <div className="goblin-live-pipeline__agent" data-goblin-agent-aware="true" data-agent-active={agentResearchActive ? 'true' : 'false'}>
            <span className="goblin-eyebrow">Agent auto-detect</span>
            <b>{agentResearchLabel}</b>
            <small>{short(agentResearchDetail, 96)}</small>
          </div>
          <div className="goblin-live-pipeline__steps">
            {liveStages.map((stage) => (
              <article key={stage.id} data-tone={stage.tone}>
                <span>{stage.label}</span>
                <b>{stage.value}</b>
              </article>
            ))}
          </div>
        </section>

        <section className="goblin-shops" data-goblin-source-shops="true" aria-label="Source Etsy shops">
          {productsByShop.map((group) => (
            <button key={group.id} type="button" data-tone={group.green ? 'green' : 'amber'} onClick={() => {
              const first = group.products.at(0)
              if (first) setSelectedProductId(first.id)
            }}>
              <span>חנות מקור</span>
              <b>{group.shopName}</b>
              <small>{group.shop?.salesCount ?? '—'} sales · {group.shop?.reviewCount ?? '—'} reviews</small>
              <strong>{group.products.length} products · {group.green} green · {group.sourceProof} source proof</strong>
            </button>
          ))}
        </section>

        <main className="goblin-board" data-goblin-board="operator-table">
          <aside className="goblin-rail" aria-label="Product clusters">
            <div className="goblin-rail__head">
              <div>
                <span className="goblin-eyebrow">Products</span>
                <b>{filteredProducts.length}/{visibleProducts.length}</b>
              </div>
              <label>
                <span>Search product or source shop</span>
                <input value={productQuery} onChange={(event) => setProductQuery(event.currentTarget.value)} placeholder="shop / bowl / green" />
              </label>
            </div>
            <div className="goblin-filter-row" data-goblin-product-filters="true">
              {FILTERS.map((filter) => (
                <button key={filter.id} type="button" aria-pressed={productFilter === filter.id} onClick={() => setProductFilter(filter.id)}>{filter.label}</button>
              ))}
            </div>
            <div className="goblin-product-list">
              {filteredProducts.length ? filteredProducts.map((product) => {
                const decision = productDecision(product)
                return (
                  <button key={product.id} type="button" className={product.id === selectedProduct?.id ? 'is-active' : undefined} data-tone={decision.tone} onClick={() => setSelectedProductId(product.id)}>
                    {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <div aria-hidden="true" />}
                    <span>{decision.label} · {product.etsyShopName ?? 'unknown shop'}</span>
                    <b>{short(product.canonicalName, 72)}</b>
                    <small>{demandLabel(product)} · spread {spreadLabel(product)}</small>
                  </button>
                )
              }) : (
                <div className="goblin-empty"><b>No matching seed</b><span>Change search/filter. The UI will not invent a card.</span></div>
              )}
            </div>
          </aside>

          {selectedProduct && selectedDecision ? (
            <article className="goblin-dossier" data-goblin-dossier-product={selectedProduct.id} data-goblin-dive-panel={panel}>
              <section className="goblin-dossier__hero" data-tone={selectedDecision.tone}>
                {selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt="" loading="lazy" /> : <div aria-hidden="true" />}
                <div>
                  <span className="goblin-pill" data-tone={selectedDecision.tone}>{selectedDecision.label}</span>
                  <h3>{selectedProduct.canonicalName}</h3>
                  <p>{selectedDecision.reason}</p>
                  <div className="goblin-decision-grid">
                    <Metric label="חנות" value={short(selectedProduct.etsyShopName, 18)} />
                    <Metric label="ביקוש" value={demandLabel(selectedProduct)} />
                    <Metric label="Etsy" value={money(selectedProduct.minPriceUsd)} />
                    <Metric label="Supplier" value={ils(selectedProduct.supplierPriceIls)} />
                    <Metric label="מרווח" value={spreadLabel(selectedProduct)} />
                    <Metric label="מקור" value={short(clean(selectedProduct.sourceStatus), 20)} />
                  </div>
                  <p className="goblin-note">{short(selectedProduct.decisionNotes, 180)}</p>
                  <div className="goblin-link-row">
                    {selectedProduct.etsyShopName && <a href={sourceShopUrl(selectedProduct.etsyShopName) ?? undefined} target="_blank" rel="noreferrer">Open source shop</a>}
                    {selectedProduct.etsyUrl && <a href={selectedProduct.etsyUrl} target="_blank" rel="noreferrer">Open Etsy product</a>}
                    {selectedProduct.supplierUrl && <a href={selectedProduct.supplierUrl} target="_blank" rel="noreferrer">Open AliExpress</a>}
                  </div>
                </div>
              </section>

              <section className="goblin-panel-tabs" data-goblin-dive-tabs="true" aria-label="Selected product evidence tabs">
                {PANELS.map((item) => <button key={item.id} type="button" aria-pressed={panel === item.id} onClick={() => setPanel(item.id)}>{item.label}</button>)}
              </section>

              <section className="goblin-panel-body">
                {panel === 'decision' && (
                  <div className="goblin-clean-cards">
                    <Metric label="Decision" value={selectedDecision.label} note={selectedDecision.reason} />
                    <Metric label="Source shop" value={selectedProduct.etsyShopName ?? '—'} note={selectedShop ? `${selectedShop.salesCount ?? '—'} sales · ${selectedShop.activeListingCount ?? '—'} active listings` : 'shop row missing'} />
                    <Metric label="Alura gate" value={selectedProduct.aluraStatusLabel} note={selectedProduct.aluraRealDataAvailable ? 'real demand row available' : 'no live demand proof'} />
                    <Metric label="Cart signal" value={selectedProduct.etsyCartSignal ?? '—'} note="not a substitute for sales" />
                  </div>
                )}
                {panel === 'supplier' && (
                  <div className="goblin-proof-list">
                    {selectedSuppliers.length ? selectedSuppliers.map((match) => (
                      <a key={match.id} href={match.sourceUrl} target="_blank" rel="noreferrer" className="goblin-proof-row">
                        <b>{clean(match.matchStatus)}</b>
                        <span>{match.sourcePlatform} · {match.orders ?? '—'} orders · {ils(match.supplierPriceIls)}</span>
                        <small>{match.imageMatchNotes ?? 'No image note'}</small>
                      </a>
                    )) : <div className="goblin-empty"><b>No supplier row</b><span>Supplier proof has not been recorded.</span></div>}
                  </div>
                )}
                {panel === 'proof' && (
                  <div className="goblin-proof-list">
                    {selectedEvidence.length ? selectedEvidence.map((asset) => (
                      <a key={asset.id} href={asset.pathOrUrl.startsWith('http') ? asset.pathOrUrl : undefined} target="_blank" rel="noreferrer" className="goblin-proof-row">
                        <b>{clean(asset.assetType)}</b>
                        <span>{asset.notes ?? asset.storageProvider}</span>
                        <small>{asset.pathOrUrl}</small>
                      </a>
                    )) : <div className="goblin-empty"><b>No proof sheet</b><span>No screenshot/proof asset attached to this row.</span></div>}
                  </div>
                )}
                {panel === 'stops' && (
                  <div className="goblin-proof-list">
                    {selectedCaveats.length ? selectedCaveats.map((caveat) => (
                      <div key={caveat.id} className="goblin-proof-row" data-tone={caveat.isKillSwitch ? 'red' : 'amber'}>
                        <b>{clean(caveat.type)}</b>
                        <span>{caveat.severity}{caveat.isKillSwitch ? ' · kill switch' : ''}</span>
                        <small>{caveat.message}</small>
                      </div>
                    )) : <div className="goblin-empty"><b>No hard stop</b><span>No caveat is attached to the selected product.</span></div>}
                  </div>
                )}
              </section>
            </article>
          ) : (
            <article className="goblin-dossier goblin-empty" data-goblin-dossier-empty="true">
              <h3>No product selected</h3>
              <p>{dataSourceLabel(snapshot)} returned {products.length} product rows.</p>
            </article>
          )}
        </main>

        <details className="goblin-debug" data-goblin-technical-details="collapsed">
          <summary>Technical readback / DB</summary>
          <div data-goblin-db-source={snapshot.source} data-goblin-database-foundation="workspace-core">
            <Metric label="Database spine" value={dataSourceLabel(snapshot)} note={`${snapshot.database.coreSchema} → ${snapshot.database.moduleSchema}`} />
            <Metric label="Rows" value={String(dbRows)} note={`${products.length} products · ${shops.length} shops · ${supplierMatches.length} suppliers`} />
            <Metric label="Latest" value={updatedLabel(snapshot.freshness.lastUpdatedMs)} note={snapshot.freshness.label} />
          </div>
        </details>
      </section>
    </div>
  ) : null

  return (
    <section
      className={`goblin-analytics-shell ${primaryMode ? 'goblin-analytics-shell--primary' : ''}`}
      data-goblin-analytics-shell="api-v3-decision-workbench"
      data-professional-workbench="live-operator-table"
      data-room-ownership="goblin-discovery-and-research"
      data-goblin-api-status={apiState.status}
      data-goblin-products-count={products.length}
      data-goblin-live-source={snapshot?.source ?? 'loading'}
      data-goblin-db-provider={snapshot?.database.provider ?? 'pending'}
      data-goblin-workbench-open={primaryMode || workbenchOpen ? 'true' : 'false'}
      data-goblin-workbench-mode={primaryMode ? 'primary' : 'station'}
      data-goblin-primary-view={primaryView}
      data-read-only="true"
      data-no-etsy-writes="true"
      data-no-supplier-messages="true"
      aria-label="Goblin Analytics read-only shell"
    >
      {!primaryMode && (
        <>
          <header className="goblin-station-card">
            <span className="goblin-eyebrow">Goblin Analytics</span>
            <h3>Decision workbench</h3>
            <p>{products.length} seeds · {greenCount} green · {watchCount} watch · {counts.hardBlocks} hard blocks</p>
            <button type="button" onClick={() => setWorkbenchOpen(true)} data-goblin-open-workbench>Open Goblin board</button>
          </header>
          <div className="goblin-safety-row" aria-label="Goblin Analytics safety locks">
            <span>Read-only</span>
            <span>No Etsy writes</span>
            <span>No supplier messages</span>
            <span>Verified GREEN only</span>
          </div>
          {latestEvent && <p className="goblin-latest">Latest: {latestEvent.message}</p>}
        </>
      )}

      {primaryMode && primaryView === 'research' && (
        <div className="goblin-workbench goblin-workbench--embedded goblin-workbench--research" data-goblin-research-workbench="true">
          <section className="goblin-workbench__panel">
            <header className="goblin-workbench__topbar">
              <div>
                <span className="goblin-eyebrow">Goblin Opportunity Room / Research</span>
                <h2>Research Atlas</h2>
                <p>Shop, product, and market studies live here. Etsy receives only reviewed handoff packets.</p>
              </div>
              <div className="goblin-workbench__top-actions">
                {navigationSlot && <div className="goblin-workbench__nav-slot">{navigationSlot}</div>}
                {primaryViewTabs}
              </div>
            </header>
            <ResearchAtlasSurface returnLabel="Back to Opportunity Radar" embedded onReturnToProducts={() => setPrimaryView('radar')} onMissionStaged={onMissionStaged} />
          </section>
        </div>
      )}

      {primaryMode && primaryView === 'radar' && apiState.status === 'loading' && (
        <div className="goblin-state" role="status"><b>Loading Goblin board</b><span>{freshnessDetail}</span></div>
      )}
      {primaryMode && primaryView === 'radar' && apiState.status === 'failed' && (
        <div className="goblin-state is-blocked" role="alert"><b>Goblin board blocked</b><span>{freshnessDetail}</span></div>
      )}
      {primaryMode && primaryView === 'radar' && workbenchSurface}
      {!primaryMode && workbenchOpen && workbenchSurface && typeof document !== 'undefined' && createPortal(workbenchSurface, document.body)}
    </section>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="goblin-metric">
      <span>{label}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  )
}
