import { useQuery } from '@tanstack/react-query'
import type {
  NovaSessionBridge,
  SessionBridgeSourceState,
} from '../../../server/nova-session-bridge'
import { STATUS_TONE } from '../lib/status-meta'

async function readBridge(): Promise<NovaSessionBridge> {
  const response = await fetch('/api/nova-session-bridge')
  if (!response.ok) throw new Error(`Session bridge read failed: ${response.status}`)
  return (await response.json()) as NovaSessionBridge
}

// 3-line adapter: SessionBridgeSourceState → STATUS_TONE's status
// literal, then strip the border-color class since this label is
// plain inline text (no pill/border in the markup below).
function sourceToneText(state: SessionBridgeSourceState): string {
  const status = state === 'ok' ? 'operational' : state === 'degraded' ? 'degraded' : 'not-wired'
  return STATUS_TONE(status).tone.replace(/border-\S+\s*/, '').trim()
}

function formatTime(value: string | null): string {
  if (!value) return '—'
  const ts = Date.parse(value)
  if (!Number.isFinite(ts)) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold text-[var(--theme-text)]">
        {value}
      </div>
    </div>
  )
}

export function NovaSessionBridgeCard() {
  const query = useQuery({
    queryKey: ['nova-session-bridge'],
    queryFn: readBridge,
    refetchInterval: 20_000,
    staleTime: 10_000,
  })
  const bridge = query.data ?? null

  return (
    <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
            Session Bridge
          </div>
          <div className="mt-1 text-sm font-semibold text-[var(--theme-text)]">
            What Nova is doing right now
          </div>
        </div>
        {bridge && bridge.needsTaylor && bridge.needsTaylor.pending > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--theme-warning)_45%,var(--theme-border))] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--theme-warning)]">
            <span className="size-1.5 rounded-full bg-[var(--theme-warning)]" />
            {bridge.needsTaylor.pending} need Taylor
          </span>
        ) : null}
      </div>

      {query.isLoading ? (
        <p className="mt-3 text-[11px] text-[var(--theme-muted)]">
          Reading gateway, runs, and receipts…
        </p>
      ) : null}
      {query.isError ? (
        <p className="mt-3 text-[11px] text-[var(--theme-danger)]">
          Bridge endpoint unreachable.
        </p>
      ) : null}

      {bridge ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Fact
              label="Route"
              value={
                bridge.route.provider || bridge.route.model
                  ? `${bridge.route.provider ?? '?'} / ${bridge.route.model ?? '?'}`
                  : 'unknown'
              }
            />
            <Fact
              label="Session"
              value={
                bridge.session
                  ? `${bridge.session.title ?? bridge.session.key} · ${formatTime(bridge.session.lastActiveAt)}`
                  : 'none read'
              }
            />
            <Fact
              label="Active task"
              value={
                bridge.activeTask
                  ? `${bridge.activeTask.status} · ${bridge.activeTask.lastTool ?? 'no tool yet'}`
                  : 'idle'
              }
            />
            <Fact
              label="Background"
              value={
                bridge.backgroundJobs
                  ? `${bridge.backgroundJobs.total} jobs · ${bridge.backgroundJobs.failed} failed`
                  : 'not read'
              }
            />
          </div>

          {bridge.blockers.length > 0 ? (
            <div className="mt-3 rounded-lg border border-[var(--theme-warning)]/35 bg-[color-mix(in_srgb,var(--theme-warning)_8%,transparent)] p-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-warning)]">
                Blockers
              </div>
              <ul className="mt-1 space-y-0.5">
                {bridge.blockers.slice(0, 3).map((blocker) => (
                  <li key={blocker} className="text-[11px] text-[var(--theme-muted)]">
                    {blocker}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--theme-muted)]">
              Latest receipts
            </div>
            {bridge.receipts.length === 0 ? (
              <p className="mt-1 text-[11px] text-[var(--theme-muted)]">
                No receipts yet — run /api/nova-work-scan after real work lands.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {bridge.receipts.map((receipt) => (
                  <li
                    key={`${receipt.title}-${receipt.at}`}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="truncate text-[var(--theme-text)]">
                      {receipt.verified ? '✓ ' : '· '}
                      {receipt.title}
                    </span>
                    <span className="shrink-0 font-mono text-[9px] text-[var(--theme-muted)]">
                      {formatTime(receipt.at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--theme-border)] pt-2">
            {bridge.sources.map((source) => (
              <span
                key={source.label}
                className={`font-mono text-[9px] uppercase tracking-[0.1em] ${sourceToneText(source.state)}`}
                title={source.detail}
              >
                {source.label}: {source.state}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
