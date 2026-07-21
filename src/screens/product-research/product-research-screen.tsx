import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

type ProductRow = {
  'Niche Rank'?: number
  'Store Niche'?: string
  'Suggested Shop Name'?: string
  'Product #'?: number
  Product?: string
  'Supplier Search Query'?: string
  'AliExpress Search URL'?: string
  'Alibaba Search URL'?: string
  'Product Type'?: string
  'Personalization / Our Work'?: string
  'Shoe-box size max'?: string
  'ShotLab Suitability'?: string
  'Variant Plan'?: string
  'Etsy-safe Angle'?: string
  'Why This Niche Works'?: string
  'Copy In Our Own Way'?: string
  'Alura Evidence'?: string
}

type StoreNiche = {
  id: string
  rank: number
  niche: string
  shop_name: string
  alura_evidence: string
  why_winners_work: string
  copy_safely: string
  products: Array<{
    product: string
    supplier_query: string
    product_type: string
    personalization: string
    aliexpress_search_url: string
    alibaba_search_url: string
    shoe_box_size: string
    shotlab: string
    variant_plan: string
    etsy_safe_angle: string
  }>
}

type State = {
  generated_at?: string
  mode?: string
  dashboard?: { title?: string; summary?: string; category_counts?: Record<string, number> }
  alura?: { requested_keyword_searches?: number; successful_keyword_searches?: number; failed_keyword_searches?: number; usage?: number; ui_verified_counter?: string }
  store_niches?: Array<StoreNiche>
  suggested_products?: Array<ProductRow>
  supplier_verified_products?: Array<ProductRow>
  notes?: Array<string>
  error?: string
}

const sheetUrl = 'https://docs.google.com/spreadsheets/d/1JG5bmFBr0pJ0qvB1OOBYFqoBz_QEL-q0LfyA-gZVsGA/edit?gid=0#gid=0'

function fmt(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return value == null || value === '' ? '—' : String(value)
  return n.toLocaleString()
}

function Pill({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'cyan' | 'green' | 'amber' | 'red' | 'slate' }) {
  const tones = {
    cyan: 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
    green: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100',
    amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    red: 'border-red-300/30 bg-red-300/10 text-red-100',
    slate: 'border-white/10 bg-white/5 text-white/70',
  }
  return <span className={cn('rounded-full border px-3 py-1 text-xs font-medium', tones[tone])}>{children}</span>
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
    <div className="text-xs uppercase tracking-[0.22em] text-white/40">{label}</div>
    <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
    {note ? <div className="mt-1 text-xs leading-5 text-white/45">{note}</div> : null}
  </div>
}

export function ProductResearchScreen() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = useQuery<State>({
    queryKey: ['product-research'],
    queryFn: async () => {
      const res = await fetch('/api/product-research', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to load product research: ${res.status}`)
      return res.json()
    },
    refetchInterval: 60_000,
  })
  const data = query.data
  const niches = data?.store_niches ?? []
  const selected = useMemo(() => niches.find((n) => n.id === selectedId) ?? niches[0], [niches, selectedId])
  const rows = data?.supplier_verified_products?.length ? data.supplier_verified_products : (data?.suggested_products ?? [])

  return <div className="min-h-full overflow-y-auto bg-[#070912] text-white">
    <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.18),transparent_32%),radial-gradient(circle_at_85%_5%,rgba(168,85,247,0.14),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(16,185,129,0.10),transparent_38%)]" />
    <main className="relative mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-5 py-6 lg:px-8">
      <header className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/25 lg:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-cyan-200/75">One-time Alura run • New store angles</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight lg:text-6xl">New Store Niche Research</h1>
            <p className="mt-4 max-w-5xl text-sm leading-6 text-white/62">{data?.dashboard?.summary ?? 'Loading the cleaned niche research...'}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Pill tone="green">No jewelry</Pill>
              <Pill tone="green">No female clothing</Pill>
              <Pill tone="green">No bags</Pill>
              <Pill tone="cyan">Shoe-box size max</Pill>
              <Pill tone="amber">Etsy-safe customization angle</Pill>
            </div>
          </div>
          <a href={sheetUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-center text-sm font-semibold text-cyan-50 hover:bg-cyan-300/15">
            Open Google Sheet
            <span className="mt-1 block text-xs font-normal text-cyan-100/60">50 products / 5 niches</span>
          </a>
        </div>
      </header>

      {query.isError || data?.error ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-100">{data?.error ?? (query.error instanceof Error ? query.error.message : 'Unknown loading error')}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Alura UI counter" value={data?.alura?.ui_verified_counter ?? `${fmt(data?.alura?.usage)}/500`} note="Real UI verified in Hermes Chrome" />
        <Stat label="Niches" value={fmt(niches.length)} note="Best store angles selected" />
        <Stat label="Products" value={fmt(rows.length)} note="10 per niche" />
        <Stat label="Keyword rows" value={fmt(data?.alura?.successful_keyword_searches)} note="Successful researched rows" />
        <Stat label="Mode" value="One-time" note="Not a recurring cron job" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/20">
          <div className="mb-3 px-2 text-sm uppercase tracking-[0.25em] text-white/40">5 Store Niches</div>
          <div className="space-y-3">
            {niches.map((niche) => {
              const active = selected?.id === niche.id
              return <button key={niche.id} type="button" onClick={() => setSelectedId(niche.id)} className={cn('w-full rounded-2xl border p-4 text-left transition', active ? 'border-cyan-300/50 bg-cyan-300/12 shadow-lg shadow-cyan-950/30' : 'border-white/10 bg-black/20 hover:border-white/20 hover:bg-white/[0.055]')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-cyan-200">#{niche.rank}</div>
                    <div className="mt-1 font-semibold leading-5">{niche.niche}</div>
                    <div className="mt-2 text-xs text-white/50">Shop idea: <span className="text-white/80">{niche.shop_name}</span></div>
                  </div>
                  <Pill tone={active ? 'cyan' : 'slate'}>{niche.products.length}</Pill>
                </div>
              </button>
            })}
          </div>
        </aside>

        {selected ? <section className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm text-cyan-200">Recommended store #{selected.rank}</div>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight">{selected.niche}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Pill tone="cyan">Shop name idea: {selected.shop_name}</Pill>
                <Pill tone="green">10 ready products</Pill>
                <Pill tone="amber">Trademark/domain check still needed</Pill>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/65 lg:col-span-1"><b className="block text-white">Alura evidence</b>{selected.alura_evidence}</div>
            <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/5 p-4 text-sm leading-6 text-emerald-50/80"><b className="block text-white">Why stores win</b>{selected.why_winners_work}</div>
            <div className="rounded-2xl border border-amber-300/15 bg-amber-300/5 p-4 text-sm leading-6 text-amber-50/80"><b className="block text-white">Copy safely</b>{selected.copy_safely}</div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <div className="grid grid-cols-[52px_1.3fr_1.1fr_1fr_.9fr_1.1fr] gap-3 bg-white/[0.08] px-4 py-3 text-xs uppercase tracking-[0.16em] text-white/45">
              <span>#</span><span>Product</span><span>Supplier query</span><span>Our work</span><span>ShotLab</span><span>Source</span>
            </div>
            <div className="divide-y divide-white/10">
              {selected.products.map((product, index) => <div key={product.product} className="grid grid-cols-[52px_1.3fr_1.1fr_1fr_.9fr_1.1fr] gap-3 px-4 py-4 text-sm leading-5 hover:bg-white/[0.035]">
                <div className="text-cyan-200">{index + 1}</div>
                <div><b className="block text-white">{product.product}</b><span className="mt-1 block text-xs text-white/45">{product.product_type} • {product.variant_plan}</span></div>
                <div className="text-white/65">{product.supplier_query}</div>
                <div className="text-white/65">{product.personalization}</div>
                <div className="text-emerald-100/75">{product.shotlab}</div>
                <div className="flex flex-col gap-2 text-xs">
                  <a className="rounded-full border border-cyan-300/25 px-3 py-1 text-cyan-100 hover:bg-cyan-300/10" href={product.aliexpress_search_url} target="_blank" rel="noreferrer">AliExpress</a>
                  <a className="rounded-full border border-white/10 px-3 py-1 text-white/65 hover:bg-white/10" href={product.alibaba_search_url} target="_blank" rel="noreferrer">Alibaba</a>
                </div>
              </div>)}
            </div>
          </div>
        </section> : <section className="rounded-[2rem] border border-dashed border-white/15 p-10 text-center text-white/45">No niche data loaded yet.</section>}
      </section>
    </main>
  </div>
}
