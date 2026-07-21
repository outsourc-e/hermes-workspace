import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type Counts = {
  sources?: number
  research_runs?: number
  products?: number
  keywords?: number
  product_keywords?: number
  keyword_edges?: number
  supplier_links?: number
  workflow_events?: number
  stores?: number
}

type RoomCount = {
  room: string
  count: number
}

type ProductRow = {
  id: string
  title: string
  niche?: string | null
  product_type?: string | null
  etsy_angle?: string | null
  variant_plan?: string | null
  status?: string | null
  current_room?: string | null
  assigned_agent?: string | null
  alura_evidence?: string | null
  shotlab_status?: string | null
  source_file?: string | null
  supplier_link_count?: number
  keywords?: string | null
  opportunity_score?: number | null
  next_action?: string | null
  priority?: 'high' | 'medium' | 'low' | string | null
}

type KeywordRow = {
  keyword: string
  score?: number | null
  search_volume?: number | null
  competition?: number | null
  conversion_rate?: number | null
  sales?: number | null
  avg_sales?: number | null
  revenue?: number | null
  avg_revenue?: number | null
  views?: number | null
  avg_views?: number | null
  competition_level?: string | null
  avg_price?: number | null
  current_room?: string | null
  signal_score?: number | null
  signal_reason?: string | null
}

type SourceRow = {
  source_name: string
  source_kind?: string | null
  source_size?: number | null
  imported_at?: string | null
}

type KeywordEdgeRow = {
  from_keyword: string
  to_keyword: string
  relation?: string | null
  source?: string | null
  discovered_at?: string | null
}

type RelatedHubRow = {
  keyword: string
  edge_count: number
}

type ActionQueueRow = {
  next_action: string
  count: number
}

type WorkflowFunnelRow = {
  room: string
  status: string
  count: number
}

type KeywordOpportunityRow = {
  keyword: string
  score?: number | null
  avg_sales?: number | null
  competition?: number | null
  competition_level?: string | null
  conversion_rate?: number | null
  avg_price?: number | null
  signal_score?: number | null
  next_action?: string | null
}

export type ProductIntelligenceState = {
  ok: boolean
  error?: string
  query?: string
  limit?: number
  counts?: Counts
  room_counts?: Array<RoomCount>
  keyword_room_counts?: Array<RoomCount>
  sources?: Array<SourceRow>
  products?: Array<ProductRow>
  keywords?: Array<KeywordRow>
  keyword_edges?: Array<KeywordEdgeRow>
  related_hubs?: Array<RelatedHubRow>
  opportunities?: Array<ProductRow>
  keyword_opportunities?: Array<KeywordOpportunityRow>
  action_queue?: Array<ActionQueueRow>
  workflow_funnel?: Array<WorkflowFunnelRow>
  phase_b?: {
    enabled?: boolean
    read_only_recommendations?: boolean
    description?: string
  }
  filters?: {
    room?: string
    status?: string
    min_score?: number
  }
  safety?: {
    read_only_api?: boolean
    source_modified?: boolean
    etsy_actions?: boolean
    supplier_messages?: boolean
    purchases?: boolean
    browser_used?: boolean
  }
  db_path?: string
  source_dir_read_only?: string
}

function fmt(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value == null || value === '' ? '—' : String(value)
  return n.toLocaleString()
}

function pct(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'cyan' | 'green' | 'amber' | 'red' | 'violet' | 'slate' }) {
  const tones = {
    cyan: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
    green: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
    amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    red: 'border-red-300/30 bg-red-300/10 text-red-100',
    violet: 'border-violet-300/30 bg-violet-300/10 text-violet-100',
    slate: 'border-white/10 bg-white/5 text-white/68',
  }
  return <span className={cn('rounded-full border px-3 py-1 text-xs font-medium', tones[tone])}>{children}</span>
}

function priorityTone(priority?: string | null): 'cyan' | 'green' | 'amber' | 'red' | 'violet' | 'slate' {
  if (priority === 'high') return 'green'
  if (priority === 'medium') return 'amber'
  if (priority === 'low') return 'slate'
  return 'cyan'
}

function scoreLabel(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(0)
}

function Stat({ label, value, note, tone = 'cyan' }: { label: string; value: string; note?: string; tone?: 'cyan' | 'green' | 'amber' | 'violet' }) {
  const tones = {
    cyan: 'from-cyan-300/12 to-transparent text-cyan-100',
    green: 'from-emerald-300/12 to-transparent text-emerald-100',
    amber: 'from-amber-300/12 to-transparent text-amber-100',
    violet: 'from-violet-300/12 to-transparent text-violet-100',
  }
  return <div className={cn('rounded-2xl border border-white/10 bg-gradient-to-br p-4 shadow-xl shadow-black/20', tones[tone])}>
    <div className="text-xs uppercase tracking-[0.22em] text-white/42">{label}</div>
    <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
    {note ? <div className="mt-1 text-xs leading-5 text-white/48">{note}</div> : null}
  </div>
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center text-sm text-white/45">{text}</div>
}

const roomLabels: Record<string, string> = {
  agora: 'Agora of Opportunity',
  oracle: 'Oracle of Signals',
  atlantis: 'Atlantis Vault',
  forge: 'Forge of Hephaestus',
  harbor: 'Merchant Harbor',
}

export function ProductIntelligenceScreen() {
  const [draftSearch, setDraftSearch] = useState('')
  const [search, setSearch] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  const query = useQuery<ProductIntelligenceState>({
    queryKey: ['product-intelligence', search, roomFilter, minScore],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '60' })
      if (search.trim()) params.set('q', search.trim())
      if (roomFilter) params.set('room', roomFilter)
      if (minScore > 0) params.set('min_score', String(minScore))
      const res = await fetch(`/api/product-intelligence?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load Product Intelligence DB: ${res.status}`)
      return res.json()
    },
    refetchInterval: 60_000,
  })

  const data = query.data
  const products = data?.products ?? []
  const keywords = data?.keywords ?? []
  const sources = data?.sources ?? []
  const keywordEdges = data?.keyword_edges ?? []
  const relatedHubs = data?.related_hubs ?? []
  const opportunities = data?.opportunities ?? []
  const keywordOpportunities = data?.keyword_opportunities ?? []
  const actionQueue = data?.action_queue ?? []
  const workflowFunnel = data?.workflow_funnel ?? []
  const counts = data?.counts ?? {}
  const selectedProduct = useMemo(() => products.find((product) => product.id === selectedProductId) ?? products[0], [products, selectedProductId])

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(draftSearch.trim())
    setSelectedProductId(null)
  }

  return <div className="min-h-full overflow-y-auto bg-[#050816] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_80%_12%,rgba(14,165,233,0.10),transparent_28%),radial-gradient(circle_at_45%_100%,rgba(20,184,166,0.10),transparent_34%)]" />
    <main className="relative mx-auto flex w-full max-w-[1540px] flex-col gap-6 px-5 py-6 lg:px-8">
      <header className="rounded-[2rem] border border-cyan-200/15 bg-white/[0.055] p-6 shadow-2xl shadow-black/30 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-200/75">Atlantis Vault • Read-only database room</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight lg:text-6xl">Product Intelligence DB</h1>
            <p className="mt-4 max-w-5xl text-sm leading-6 text-white/62">
              Workspace copy of the Alura / Etsy product-research database. Phase B turns the raw rows into read-only opportunity scoring, next-action queues, keyword signal candidates, and workflow routing — without browser use or marketplace side effects.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill tone="green">Read-only API</Pill>
              <Pill tone="cyan">Workspace DB copy</Pill>
              <Pill tone="violet">Atlantis Vault owner</Pill>
            <Pill tone="amber">No Etsy / supplier side effects</Pill>
              <Pill tone="green">Phase B recommendations enabled</Pill>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/60 xl:max-w-md">
            <b className="block text-white">Storage rule</b>
            Technical home: <span className="text-cyan-100">data/product-intelligence/product_intelligence.db</span><br />
            UI room: <span className="text-cyan-100">Atlantis Vault / Library</span>
          </div>
        </div>
      </header>

      {query.isError || data?.ok === false ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">{data?.error ?? (query.error instanceof Error ? query.error.message : 'Unknown loading error')}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Stat label="Products" value={fmt(counts.products)} note="Normalized product ideas" tone="cyan" />
        <Stat label="Keywords / tags" value={fmt(counts.keywords)} note="SEO DB + Alura/search signal rows" tone="green" />
        <Stat label="Keyword edges" value={fmt(counts.keyword_edges)} note="Related-tag graph links" tone="violet" />
        <Stat label="Supplier links" value={fmt(counts.supplier_links)} note="Search links, not messages" tone="amber" />
        <Stat label="Runs / sources" value={`${fmt(counts.research_runs)} / ${fmt(counts.sources)}`} note="Imported evidence" tone="violet" />
        <Stat label="Stores" value={fmt(counts.stores)} note="Current shop scope" tone="cyan" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <form onSubmit={submitSearch} className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/20">
          <label className="text-xs uppercase tracking-[0.25em] text-white/42" htmlFor="product-intelligence-search">Search the DB</label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="product-intelligence-search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="bracelet, locket, huggie, supplier, keyword…"
              className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-cyan-300/50"
            />
            <button type="submit" className="rounded-2xl border border-cyan-300/30 bg-cyan-300/12 px-5 py-3 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/18">Search</button>
            {search ? <button type="button" onClick={() => { setDraftSearch(''); setSearch(''); setSelectedProductId(null) }} className="rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-3 text-sm text-white/68 transition hover:bg-white/10">Clear</button> : null}
          </div>
          <div className="mt-3 text-xs text-white/42">{search ? `Showing live results for “${search}”.` : 'Showing latest imported rows.'}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs uppercase tracking-[0.2em] text-white/42">
              Room filter
              <select
                value={roomFilter}
                onChange={(event) => { setRoomFilter(event.target.value); setSelectedProductId(null) }}
                className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#07111f] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-300/50"
              >
                <option value="">All rooms</option>
                {(data?.room_counts ?? []).map((room) => <option key={room.room} value={room.room}>{roomLabels[room.room] ?? room.room}</option>)}
              </select>
            </label>
            <label className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs uppercase tracking-[0.2em] text-white/42">
              Minimum opportunity score: <span className="text-cyan-100">{minScore}</span>
              <input
                type="range"
                min="0"
                max="90"
                step="5"
                value={minScore}
                onChange={(event) => { setMinScore(Number(event.target.value)); setSelectedProductId(null) }}
                className="mt-3 w-full accent-cyan-300"
              />
            </label>
          </div>
        </form>

        <div className="rounded-[1.6rem] border border-emerald-300/15 bg-emerald-300/[0.045] p-4">
          <div className="text-xs uppercase tracking-[0.25em] text-emerald-100/50">Safety locks</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Pill tone={data?.safety?.read_only_api ? 'green' : 'red'}>API read-only: {String(Boolean(data?.safety?.read_only_api))}</Pill>
            <Pill tone={!data?.safety?.source_modified ? 'green' : 'red'}>Source modified: {String(Boolean(data?.safety?.source_modified))}</Pill>
            <Pill tone={!data?.safety?.etsy_actions ? 'green' : 'red'}>Etsy actions: {String(Boolean(data?.safety?.etsy_actions))}</Pill>
            <Pill tone={!data?.safety?.supplier_messages ? 'green' : 'red'}>Supplier messages: {String(Boolean(data?.safety?.supplier_messages))}</Pill>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-[2rem] border border-cyan-300/15 bg-cyan-300/[0.045] p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm uppercase tracking-[0.25em] text-cyan-100/55">Phase B action queue</div>
              <p className="mt-2 text-sm leading-6 text-white/58">Read-only recommendations: what should happen next before anything reaches a DLV approval gate.</p>
            </div>
            <Pill tone="green">No browser / no Etsy actions</Pill>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {actionQueue.length ? actionQueue.map((item) => <div key={item.next_action} className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <div className="text-sm font-semibold text-white/82">{item.next_action}</div>
              <div className="mt-2 text-xs text-white/45">{fmt(item.count)} product rows waiting here</div>
            </div>) : <EmptyCard text="Action queue has no rows yet." />}
          </div>
        </div>

        <div className="rounded-[2rem] border border-amber-300/15 bg-amber-300/[0.04] p-5 shadow-2xl shadow-black/20">
          <div className="text-sm uppercase tracking-[0.25em] text-amber-100/55">Workflow funnel</div>
          <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto pr-1">
            {workflowFunnel.length ? workflowFunnel.map((row, index) => <div key={`${row.room}-${row.status}-${index}`} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-white/72">{roomLabels[row.room] ?? row.room}</span>
                <Pill tone="amber">{fmt(row.count)}</Pill>
              </div>
              <div className="mt-1 text-xs leading-5 text-white/42">{row.status}</div>
            </div>) : <EmptyCard text="No funnel rows loaded." />}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
            <div className="mb-3 px-2 text-sm uppercase tracking-[0.25em] text-white/40">Room routing</div>
            <div className="space-y-2">
              {(data?.room_counts ?? []).map((room) => <div key={room.room} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm">
                <span className="text-white/75">{roomLabels[room.room] ?? room.room}</span>
                <Pill tone="cyan">{fmt(room.count)}</Pill>
              </div>)}
              {(data?.keyword_room_counts ?? []).map((room) => <div key={`keyword-${room.room}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm">
                <span className="text-white/55">Keywords → {roomLabels[room.room] ?? room.room}</span>
                <Pill tone="green">{fmt(room.count)}</Pill>
              </div>)}
            </div>
          </div>

          <div className="rounded-[2rem] border border-emerald-300/15 bg-emerald-300/[0.045] p-4 shadow-2xl shadow-black/20">
            <div className="mb-3 px-2 text-sm uppercase tracking-[0.25em] text-emerald-100/50">Top product opportunities</div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {opportunities.length ? opportunities.map((product) => <button
                key={`opp-${product.id}`}
                type="button"
                onClick={() => { setSelectedProductId(product.id); if (product.title) { setDraftSearch(''); setSearch('') } }}
                className="w-full rounded-2xl border border-white/10 bg-black/25 p-3 text-left transition hover:border-emerald-200/35 hover:bg-emerald-300/8"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold leading-5 text-white/82">{product.title}</span>
                  <Pill tone={priorityTone(product.priority)}>Score {scoreLabel(product.opportunity_score)}</Pill>
                </div>
                <div className="mt-2 text-xs leading-5 text-white/45">{product.next_action}</div>
              </button>) : <EmptyCard text="No opportunities passed the current filters." />}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
            <div className="mb-3 px-2 text-sm uppercase tracking-[0.25em] text-white/40">Keyword hubs</div>
            <div className="flex max-h-[280px] flex-wrap gap-2 overflow-y-auto pr-1">
              {relatedHubs.length ? relatedHubs.map((hub) => <button
                key={hub.keyword}
                type="button"
                onClick={() => { setDraftSearch(hub.keyword); setSearch(hub.keyword); setSelectedProductId(null) }}
                className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-2 text-left text-xs text-cyan-50 transition hover:border-cyan-200/40 hover:bg-cyan-300/14"
                aria-label={`Search keyword hub ${hub.keyword}`}
              >
                <span className="font-semibold">{hub.keyword}</span>
                <span className="ml-2 text-cyan-100/45">{fmt(hub.edge_count)}</span>
              </button>) : <EmptyCard text="No keyword hubs loaded yet." />}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
            <div className="mb-3 px-2 text-sm uppercase tracking-[0.25em] text-white/40">Import sources</div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {sources.length ? sources.map((source) => <div key={`${source.source_name}-${source.imported_at}`} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm">
                <div className="font-medium text-white/82">{source.source_name}</div>
                <div className="mt-1 text-xs text-white/42">{source.source_kind ?? 'source'} • {fmt(source.source_size)} bytes</div>
              </div>) : <EmptyCard text="No source records loaded yet." />}
            </div>
          </div>
        </aside>

        <section className="grid gap-6 2xl:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20 lg:p-5">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <div className="text-sm uppercase tracking-[0.25em] text-white/40">Products</div>
                <div className="mt-1 text-xs text-white/42">Click a row to inspect its evidence and workflow state.</div>
              </div>
              <Pill tone="cyan">{fmt(products.length)} shown</Pill>
            </div>
            <div className="mt-4 space-y-3">
              {products.length ? products.map((product) => {
                const active = selectedProduct?.id === product.id
                return <button key={product.id} type="button" onClick={() => setSelectedProductId(product.id)} className={cn('w-full rounded-2xl border p-4 text-left transition', active ? 'border-cyan-300/45 bg-cyan-300/10 shadow-lg shadow-cyan-950/25' : 'border-white/10 bg-black/22 hover:border-white/20 hover:bg-white/[0.055]')}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="font-semibold leading-5 text-white">{product.title}</div>
                      <div className="mt-2 text-xs leading-5 text-white/50">{product.etsy_angle ?? 'No angle recorded yet.'}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                      <Pill tone={priorityTone(product.priority)}>Score {scoreLabel(product.opportunity_score)}</Pill>
                      <Pill tone="green">{product.current_room ?? 'room?'}</Pill>
                      <Pill tone="slate">{fmt(product.supplier_link_count)} links</Pill>
                    </div>
                  </div>
                </button>
              }) : <EmptyCard text="No products matched this search." />}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
              <div className="text-sm uppercase tracking-[0.25em] text-white/40">Selected product</div>
              {selectedProduct ? <div className="mt-4 space-y-4">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{selectedProduct.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill tone="cyan">{selectedProduct.assigned_agent ?? 'Unassigned'}</Pill>
                    <Pill tone="amber">{selectedProduct.status ?? 'No status'}</Pill>
                    <Pill tone={priorityTone(selectedProduct.priority)}>Opportunity {scoreLabel(selectedProduct.opportunity_score)}</Pill>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 text-sm leading-6 text-emerald-50/75"><b className="block text-emerald-50">Recommended next action</b>{selectedProduct.next_action ?? '—'}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/65"><b className="block text-white">Variant plan</b>{selectedProduct.variant_plan ?? '—'}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/65"><b className="block text-white">Alura evidence</b>{selectedProduct.alura_evidence ?? '—'}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/65"><b className="block text-white">ShotLab / Forge status</b>{selectedProduct.shotlab_status ?? '—'}</div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/65"><b className="block text-white">Keywords</b>{selectedProduct.keywords ?? '—'}</div>
              </div> : <EmptyCard text="Select a product to inspect it." />}
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-white/40">Keyword graph</div>
                  <div className="mt-1 text-xs text-white/42">Temporary CSS list for tag relationships. Asset graph later.</div>
                </div>
                <Pill tone="violet">{fmt(keywordEdges.length)} edges</Pill>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {keywordEdges.length ? keywordEdges.map((edge, index) => <div key={`${edge.from_keyword}-${edge.to_keyword}-${index}`} className="rounded-2xl border border-violet-300/12 bg-violet-300/[0.045] p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-white/78">
                    <button type="button" onClick={() => { setDraftSearch(edge.from_keyword); setSearch(edge.from_keyword); setSelectedProductId(null) }} className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-cyan-100 hover:border-cyan-200/35">{edge.from_keyword}</button>
                    <span className="text-violet-100/55">→</span>
                    <button type="button" onClick={() => { setDraftSearch(edge.to_keyword); setSearch(edge.to_keyword); setSelectedProductId(null) }} className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-emerald-100 hover:border-emerald-200/35">{edge.to_keyword}</button>
                  </div>
                  <div className="mt-2 text-xs text-white/38">{edge.relation ?? 'related'} • {edge.source ?? 'local'}{edge.discovered_at ? ` • ${edge.discovered_at}` : ''}</div>
                </div>) : <EmptyCard text="Search a keyword to see related tag edges." />}
              </div>
            </div>

            <div className="rounded-[2rem] border border-green-300/15 bg-green-300/[0.04] p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-green-100/55">Keyword opportunities</div>
                  <div className="mt-1 text-xs text-white/42">Best SEO signals to attach to products or explore next.</div>
                </div>
                <Pill tone="green">{fmt(keywordOpportunities.length)} ranked</Pill>
              </div>
              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {keywordOpportunities.length ? keywordOpportunities.map((keyword) => <button
                  key={`kw-opp-${keyword.keyword}`}
                  type="button"
                  onClick={() => { setDraftSearch(keyword.keyword); setSearch(keyword.keyword); setSelectedProductId(null) }}
                  className="w-full rounded-2xl border border-white/10 bg-black/25 p-3 text-left text-sm transition hover:border-green-200/35 hover:bg-green-300/8"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white/88">{keyword.keyword}</div>
                      <div className="mt-1 text-xs text-white/45">{keyword.next_action}</div>
                    </div>
                    <Pill tone="green">Signal {scoreLabel(keyword.signal_score)}</Pill>
                  </div>
                </button>) : <EmptyCard text="No ranked keyword opportunities yet." />}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm uppercase tracking-[0.25em] text-white/40">Keywords</div>
                  <div className="mt-1 text-xs text-white/42">Oracle signal rows from the DB.</div>
                </div>
                <Pill tone="green">{fmt(keywords.length)} shown</Pill>
              </div>
              <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {keywords.length ? keywords.map((keyword) => <div key={keyword.keyword} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-white/88">{keyword.keyword}</div>
                      <div className="mt-1 text-xs text-white/45">Competition {fmt(keyword.competition)} • Avg sales {fmt(keyword.avg_sales)} • Conv. {pct(keyword.conversion_rate)}</div>
                    </div>
                    <Pill tone="green">Score {fmt(keyword.score)}</Pill>
                  </div>
                </div>) : <EmptyCard text="No keywords matched this search." />}
              </div>
            </div>
          </div>
        </section>
      </section>

      <footer className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs leading-5 text-white/42">
        Source read-only directory: <span className="text-white/68">{data?.source_dir_read_only ?? '/Users/mac/.hermes/product-research'}</span> · Workspace DB: <span className="text-white/68">{data?.db_path ?? 'data/product-intelligence/product_intelligence.db'}</span>
      </footer>
    </main>
  </div>
}
