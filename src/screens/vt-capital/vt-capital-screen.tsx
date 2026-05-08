import { useEffect, useMemo, useState } from 'react'

type VtWorker = {
  workerId: string
  state?: string
  currentTask?: string | null
  lastSummary?: string | null
  memoryExists?: boolean
  identityExists?: boolean
  runtimeExists?: boolean
}

type VtNote = { title: string; path: string; mtimeMs: number; size: number }

type GuardianPayload = {
  requireOrderScope: boolean
  executionMode: string
  liveBlocked: boolean
  executionEnabled: boolean
  lastRiskCheck: Record<string, unknown> | null
  lastOrderProposed: Record<string, unknown> | null
  lastOrderExecuted: Record<string, unknown> | null
  demoState: {
    openOrders: number
    trackedOrders: number
    lastOrder: Record<string, unknown> | null
  }
  recentBlocks: Array<Record<string, unknown>>
}

type VtPayload = {
  ok: boolean
  checkedAt: number
  plugin: {
    name: string
    version: string
    mode: string
    executionEnabled: boolean
  }
  paths: Record<string, string>
  marketBias: {
    fileExists: boolean
    updatedAt: number | null
    sizeBytes: number
    latest: Record<string, unknown> | null
    recent: Array<Record<string, unknown>>
  }
  council: {
    fileExists: boolean
    updatedAt: number | null
    sizeBytes: number
    recent: Array<Record<string, unknown>>
  }
  workers: Array<VtWorker>
  guardian?: GuardianPayload
  notes: Array<VtNote>
}

function formatTime(value: number | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function compactJson(value: unknown): string {
  if (value == null) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function stateClass(state: string | undefined): string {
  if (state === 'idle')
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  if (state === 'executing' || state === 'thinking' || state === 'writing')
    return 'bg-amber-500/15 text-amber-200 border-amber-500/30'
  if (state === 'blocked' || state === 'offline')
    return 'bg-red-500/15 text-red-200 border-red-500/30'
  return 'bg-primary-500/15 text-primary-200 border-primary-500/30'
}

function modeLabel(mode: string): string {
  if (mode === 'observe_only') return 'Modalità osservazione'
  return mode.replaceAll('_', ' ')
}

function executionLabel(enabled: boolean): string {
  return enabled ? 'Esecuzione attiva' : 'Esecuzione disattivata'
}

function decisionLabel(entry: Record<string, unknown>): string {
  if (typeof entry.decision === 'string') return entry.decision
  const precheck = entry.council_precheck
  if (precheck && typeof precheck === 'object') {
    const decision = (precheck as Record<string, unknown>).decision
    if (typeof decision === 'string') return decision
  }
  return 'precheck'
}

function entryTitle(entry: Record<string, unknown>, fallback: string): string {
  return String(entry.asset ?? entry.symbol ?? fallback)
}

function fieldValue(entry: Record<string, unknown> | null | undefined, field: string): string {
  if (!entry) return '—'
  const value = entry[field]
  if (value == null || value === '') return '—'
  return String(value)
}

function scopeLine(entry: Record<string, unknown> | null | undefined): string {
  if (!entry) return '—'
  return [
    fieldValue(entry, 'symbol'),
    fieldValue(entry, 'book'),
    fieldValue(entry, 'strategy_id'),
    fieldValue(entry, 'intent'),
    fieldValue(entry, 'position_horizon'),
  ]
    .filter((value) => value !== '—')
    .join(' · ')
}

function MiniEvent({
  label,
  event,
}: {
  label: string
  event: Record<string, unknown> | null | undefined
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ background: 'var(--theme-card2)', borderColor: 'var(--theme-border)' }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-ink">{scopeLine(event)}</div>
      <div className="mt-1 text-xs text-muted">
        approval {fieldValue(event, 'approval_id')} · stato{' '}
        {fieldValue(event, 'status') !== '—'
          ? fieldValue(event, 'status')
          : fieldValue(event, 'decision')}
      </div>
    </div>
  )
}

function Card({
  title,
  children,
  right,
  accent = 'var(--theme-accent)',
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
  accent?: string
}) {
  return (
    <section
      className="relative overflow-hidden rounded-xl border p-4 transition-colors"
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 45%, transparent), transparent)`,
        }}
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: React.ReactNode
  tone?: 'neutral' | 'good' | 'warn'
}) {
  const accent =
    tone === 'good'
      ? 'var(--theme-success)'
      : tone === 'warn'
        ? 'var(--theme-warning)'
        : 'var(--theme-accent)'
  return (
    <div
      className="relative overflow-hidden rounded-xl border p-3"
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
      />
      <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-bold tabular-nums leading-tight"
        style={{ color: accent }}
      >
        {value}
      </div>
    </div>
  )
}

export function VtCapitalScreen() {
  const [data, setData] = useState<VtPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setError(null)
    try {
      const res = await fetch('/api/vt-capital', { cache: 'no-store' })
      const payload = (await res.json()) as VtPayload | { error?: string }
      if (!res.ok || !('ok' in payload) || !payload.ok)
        throw new Error(
          'error' in payload && payload.error
            ? payload.error
            : 'API VT Capital non disponibile',
        )
      setData(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const activeWorkers = useMemo(
    () =>
      data?.workers.filter(
        (w) => w.state && w.state !== 'unknown' && w.runtimeExists,
      ).length ?? 0,
    [data],
  )
  const latestCandidates = useMemo(() => {
    const candidates = data?.marketBias.latest?.candidates
    return Array.isArray(candidates) ? candidates : []
  }, [data])

  if (loading)
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Carico VT Capital…
      </div>
    )
  if (error)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <h1
          className="text-xl font-semibold"
          style={{ color: 'var(--theme-danger)' }}
        >
          VT Capital non caricato
        </h1>
        <p className="max-w-xl text-sm text-muted">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:scale-[1.02]"
          style={{
            background: 'var(--theme-accent)',
            color: 'var(--theme-on-accent, white)',
          }}
        >
          Riprova
        </button>
      </div>
    )
  if (!data) return null

  return (
    <div
      data-plugin-surface="vt-capital"
      className="min-h-full p-4 pb-28 pt-14 md:p-6 md:pb-28 lg:p-10 lg:pb-28"
      style={{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:gap-5">
        <header
          className="relative overflow-hidden rounded-xl border p-5"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--theme-card) 96%, var(--theme-accent)), var(--theme-card))',
            borderColor: 'var(--theme-border)',
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
            style={{
              background:
                'linear-gradient(90deg, var(--theme-accent), var(--theme-accent-secondary), transparent)',
            }}
          />
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border text-xl"
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--theme-accent) 35%, var(--theme-border))',
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--theme-accent) 14%, var(--theme-card)), var(--theme-card))',
                  boxShadow:
                    '0 0 0 4px color-mix(in srgb, var(--theme-accent) 6%, transparent)',
                }}
              >
                ◈
              </span>
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Plugin VT Capital
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  VT Capital Cockpit
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-muted">
                  Bias crypto, council/precheck, worker Swarm e note vault in
                  una superficie isolata dal resto della dashboard.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className="rounded-full border px-3 py-1 font-medium"
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--theme-success) 40%, var(--theme-border))',
                  background:
                    'color-mix(in srgb, var(--theme-success) 10%, transparent)',
                  color: 'var(--theme-success)',
                }}
              >
                {modeLabel(data.plugin.mode)}
              </span>
              <span
                className="rounded-full border px-3 py-1 font-medium"
                style={{
                  borderColor: data.plugin.executionEnabled
                    ? 'color-mix(in srgb, var(--theme-warning) 45%, var(--theme-border))'
                    : 'color-mix(in srgb, var(--theme-danger) 40%, var(--theme-border))',
                  background: data.plugin.executionEnabled
                    ? 'color-mix(in srgb, var(--theme-warning) 10%, transparent)'
                    : 'color-mix(in srgb, var(--theme-danger) 10%, transparent)',
                  color: data.plugin.executionEnabled
                    ? 'var(--theme-warning)'
                    : 'var(--theme-danger)',
                }}
              >
                {executionLabel(data.plugin.executionEnabled)}
              </span>
              <span
                className="rounded-full border px-3 py-1 text-muted"
                style={{
                  borderColor: 'var(--theme-border)',
                  background: 'var(--theme-card2)',
                }}
              >
                Scope: solo plugin
              </span>
              <span
                className="rounded-full border px-3 py-1 text-muted"
                style={{
                  borderColor: 'var(--theme-border)',
                  background: 'var(--theme-card2)',
                }}
              >
                v{data.plugin.version}
              </span>
            </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric
            label="Market bias file"
            value={data.marketBias.fileExists ? 'online' : 'missing'}
            tone={data.marketBias.fileExists ? 'good' : 'warn'}
          />
          <Metric
            label="Council precheck"
            value={
              data.council.fileExists
                ? `${data.council.recent.length} record`
                : 'missing'
            }
            tone={data.council.fileExists ? 'good' : 'warn'}
          />
          <Metric
            label="Worker runtime"
            value={`${activeWorkers}/${data.workers.length}`}
            tone={activeWorkers > 0 ? 'good' : 'warn'}
          />
          <Metric label="Ultimo refresh" value={formatTime(data.checkedAt)} />
        </div>

        {data.guardian ? (
          <Card
            title="Guardian / OMS"
            accent="var(--theme-danger)"
            right={
              <span className="text-xs text-muted">
                {data.guardian.requireOrderScope
                  ? 'require_order_scope attivo'
                  : 'scope legacy'}
              </span>
            }
          >
            <div className="grid gap-3 lg:grid-cols-4">
              <Metric
                label="Modalità executor"
                value={data.guardian.executionMode.replaceAll('_', ' ')}
                tone={data.guardian.executionEnabled ? 'warn' : 'good'}
              />
              <Metric
                label="Live trading"
                value={data.guardian.liveBlocked ? 'bloccato' : 'aperto'}
                tone={data.guardian.liveBlocked ? 'good' : 'warn'}
              />
              <Metric
                label="Ordini aperti demo"
                value={data.guardian.demoState.openOrders}
                tone={data.guardian.demoState.openOrders > 0 ? 'warn' : 'good'}
              />
              <Metric
                label="Ordini tracciati"
                value={data.guardian.demoState.trackedOrders}
              />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <MiniEvent label="Ultimo risk.check" event={data.guardian.lastRiskCheck} />
              <MiniEvent
                label="Ultimo order.proposed"
                event={data.guardian.lastOrderProposed}
              />
              <MiniEvent
                label="Ultimo order.executed"
                event={data.guardian.lastOrderExecuted}
              />
            </div>
            {data.guardian.recentBlocks.length > 0 ? (
              <div className="mt-4 rounded-lg border p-3"
                style={{
                  background: 'var(--theme-card2)',
                  borderColor: 'var(--theme-border)',
                }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Blocchi recenti
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {data.guardian.recentBlocks.map((block, index) => (
                    <span
                      key={index}
                      className="rounded-full border px-2 py-1"
                      style={{
                        borderColor:
                          'color-mix(in srgb, var(--theme-danger) 35%, var(--theme-border))',
                        background:
                          'color-mix(in srgb, var(--theme-danger) 10%, transparent)',
                        color: 'var(--theme-danger)',
                      }}
                    >
                      {String(block.reason_code ?? block.reason ?? 'BLOCKED')}
                      {block.symbol ? ` · ${String(block.symbol)}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Card
            title="Market Bias BTC/ETH/SOL"
            right={
              <span className="text-xs text-muted">
                aggiornato {formatTime(data.marketBias.updatedAt)}
              </span>
            }
          >
            {latestCandidates.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-3">
                {latestCandidates.slice(0, 6).map((candidate, index) => {
                  const item = candidate as Record<string, unknown>
                  return (
                    <div
                      key={index}
                      className="rounded-lg border p-3 transition-colors hover:bg-[var(--theme-card2)]"
                      style={{
                        background: 'var(--theme-card2)',
                        borderColor: 'var(--theme-border)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-ink">
                          {String(
                            item.asset ??
                              item.symbol ??
                              `Candidate ${index + 1}`,
                          )}
                        </div>
                        <div
                          className="rounded-full border px-2 py-0.5 text-xs"
                          style={{
                            borderColor: 'var(--theme-accent-border)',
                            color: 'var(--theme-accent)',
                            background: 'var(--theme-accent-subtle)',
                          }}
                        >
                          {String(item.candidate_bias ?? item.bias ?? '—')}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted">
                        confidence{' '}
                        {String(
                          item.confidence ?? item.confidence_final ?? '—',
                        )}
                      </div>
                      <div
                        className="mt-2 line-clamp-3 text-xs"
                        style={{
                          color:
                            'color-mix(in srgb, var(--theme-text) 72%, var(--theme-muted))',
                        }}
                      >
                        {Array.isArray(item.reasons)
                          ? item.reasons.join(' · ')
                          : String(item.summary ?? item.reason ?? '')}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <pre
                className="max-h-96 overflow-auto rounded-lg border p-3 text-xs text-muted"
                style={{
                  background: 'var(--theme-card2)',
                  borderColor: 'var(--theme-border)',
                }}
              >
                {compactJson(
                  data.marketBias.latest?.raw ??
                    data.marketBias.recent.at(-1) ??
                    'Nessun candidato recente',
                )}
              </pre>
            )}
          </Card>

          <Card
            title="Risk / Council Journal"
            right={
              <span className="text-xs text-muted">
                {data.council.recent.length} ultimi
              </span>
            }
            accent="var(--theme-warning)"
          >
            <div className="flex max-h-[420px] flex-col gap-2 overflow-auto pr-1">
              {data.council.recent.length === 0 ? (
                <p className="text-sm text-muted">
                  Nessun precheck council trovato.
                </p>
              ) : (
                data.council.recent
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <details
                      key={index}
                      className="rounded-lg border p-3"
                      style={{
                        background: 'var(--theme-card2)',
                        borderColor: 'var(--theme-border)',
                      }}
                    >
                      <summary className="cursor-pointer text-sm font-medium text-ink">
                        {entryTitle(entry, `Record ${index + 1}`)} ·{' '}
                        {decisionLabel(entry)}
                      </summary>
                      <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-muted">
                        {compactJson(entry)}
                      </pre>
                    </details>
                  ))
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <Card title="Swarm Trading Workers" accent="var(--theme-success)">
            <div className="grid gap-3 md:grid-cols-2">
              {data.workers.map((worker) => (
                <div
                  key={worker.workerId}
                  className="rounded-lg border p-3"
                  style={{
                    background: 'var(--theme-card2)',
                    borderColor: 'var(--theme-border)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-ink">
                      {worker.workerId}
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${stateClass(worker.state)}`}
                    >
                      {worker.state ?? 'unknown'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    memory {worker.memoryExists ? 'ok' : 'missing'} · identity{' '}
                    {worker.identityExists ? 'ok' : 'missing'}
                  </div>
                  {worker.currentTask ? (
                    <div className="mt-2 text-xs text-ink">
                      Task: {worker.currentTask}
                    </div>
                  ) : null}
                  {worker.lastSummary ? (
                    <div className="mt-2 line-clamp-2 text-xs text-muted">
                      {worker.lastSummary}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="Vault / Report recenti"
            accent="var(--theme-accent-secondary)"
          >
            <div className="flex flex-col gap-2">
              {data.notes.length === 0 ? (
                <p className="text-sm text-muted">
                  Nessuna nota VT Capital/crypto trovata.
                </p>
              ) : (
                data.notes.map((note) => (
                  <div
                    key={note.path}
                    className="rounded-lg border p-3"
                    style={{
                      background: 'var(--theme-card2)',
                      borderColor: 'var(--theme-border)',
                    }}
                  >
                    <div className="font-medium text-ink">{note.title}</div>
                    <div className="mt-1 text-xs text-muted">
                      {formatTime(note.mtimeMs)} ·{' '}
                      {Math.round(note.size / 1024)} KB
                    </div>
                    <div
                      className="mt-1 truncate text-xs"
                      style={{
                        color:
                          'color-mix(in srgb, var(--theme-muted) 70%, transparent)',
                      }}
                    >
                      {note.path}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
