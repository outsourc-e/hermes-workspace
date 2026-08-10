import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'

type RuntimeRecord = {
  runtimeId: string
  kind: 'claude_session' | 'codex_thread' | 'hermes_profile'
  routeRef: string | null
  accountAlias: string
  externalId: string
  model?: string | null
  cwd: string | null
  worktree: string | null
  hostStatus: string
  kanbanTaskId: string | null
  capabilities: Record<string, { state: string; explanation: string }>
}

type RuntimeRoute = { id: string; account: string; model: string; status: string }
type Inventory = {
  runtimes: Array<RuntimeRecord>
  availableRoutes: Array<RuntimeRoute>
  refresh: Array<{ source: string; ok: boolean; count: number; error?: string }>
  directProviderMessaging: { enabled: false; state: string; explanation: string }
}

function runtimeAccount(runtime: RuntimeRecord): string {
  return runtime.kind === 'codex_thread' ? 'openai-codex' : runtime.accountAlias
}

export function ProviderRuntimePanel() {
  const [inventory, setInventory] = useState<Inventory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [routeByRuntime, setRouteByRuntime] = useState<Record<string, string>>({})
  const [textByRuntime, setTextByRuntime] = useState<Record<string, string>>({})
  const [turnByRuntime, setTurnByRuntime] = useState<Record<string, string>>({})
  const [kanbanByRuntime, setKanbanByRuntime] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [create, setCreate] = useState(() => ({ accountAlias: 'cwm4tx', routeRef: '', worktree: '', prompt: '', requestId: crypto.randomUUID() }))

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/provider-runtimes')
      const body = await response.json() as Inventory & { error?: string }
      if (!response.ok) throw new Error(body.error || 'Runtime inventory failed')
      setInventory(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Runtime inventory failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  async function refreshFromProviders() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/provider-runtimes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Provider refresh failed')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Provider refresh failed')
      setLoading(false)
    }
  }

  const routesByAccount = useMemo(() => {
    const grouped: Record<string, Array<RuntimeRoute>> = {}
    for (const route of inventory?.availableRoutes ?? []) (grouped[route.account] ||= []).push(route)
    return grouped
  }, [inventory])

  async function mutate(body: Record<string, unknown>, key: string): Promise<boolean> {
    setBusy(key)
    setError(null)
    try {
      const response = await fetch('/api/provider-runtimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json() as { error?: string; result?: { error?: string } }
      if (!response.ok) throw new Error(result.error || result.result?.error || 'Runtime action was rejected')
      await refresh()
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Runtime action failed')
      return false
    } finally {
      setBusy(null)
    }
  }

  async function createClaude(background: boolean) {
    const ok = await mutate({
      action: background ? 'background' : 'create',
      accountAlias: create.accountAlias,
      routeRef: create.routeRef,
      cwd: create.worktree,
      worktree: create.worktree,
      prompt: create.prompt,
      requestId: create.requestId,
    }, background ? 'create-background' : 'create')
    if (ok) setCreate((value) => ({ ...value, prompt: '', requestId: crypto.randomUUID() }))
  }

  return (
    <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--theme-text)]">Provider-native runtimes</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
            Claude UUID sessions and Codex app-server threads. Kanban remains authoritative; direct provider messaging is disabled.
          </p>
        </div>
        <Button variant="secondary" disabled={loading} onClick={() => void refreshFromProviders()}>
          {loading ? 'Refreshing…' : 'Refresh inventory'}
        </Button>
      </div>

      {error ? <p className="mt-3 rounded-xl bg-[var(--theme-danger-soft)] px-3 py-2 text-sm text-[var(--theme-danger)]">{error}</p> : null}

      <div className="mt-4 grid gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 md:grid-cols-4">
        <select className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" value={create.accountAlias} onChange={(event) => setCreate((value) => ({ ...value, accountAlias: event.target.value, routeRef: '' }))}>
          <option value="cwm4tx">Claude Max CWM</option>
          <option value="gp">Claude Max GP</option>
        </select>
        <select className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" value={create.routeRef} onChange={(event) => setCreate((value) => ({ ...value, routeRef: event.target.value }))}>
          <option value="">Select subscription route</option>
          {(routesByAccount[create.accountAlias] ?? []).map((route) => <option key={route.id} value={route.id}>{route.id}</option>)}
        </select>
        <input className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" placeholder="Isolated worktree path" value={create.worktree} onChange={(event) => setCreate((value) => ({ ...value, worktree: event.target.value }))} />
        <input className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" placeholder="Initial prompt (stdin only)" value={create.prompt} onChange={(event) => setCreate((value) => ({ ...value, prompt: event.target.value }))} />
        <div className="flex gap-2 md:col-span-4">
          <Button disabled={busy !== null || !create.routeRef || !create.worktree || !create.prompt} onClick={() => void createClaude(false)}>Create Claude UUID</Button>
          <Button variant="secondary" disabled title="Disabled until durable background writer ownership is implemented">Create background (unavailable)</Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {(inventory?.runtimes ?? []).map((runtime) => {
          const account = runtimeAccount(runtime)
          const routes = routesByAccount[account] ?? []
          const routeRef = routeByRuntime[runtime.runtimeId] || runtime.routeRef || ''
          const text = textByRuntime[runtime.runtimeId] || ''
          const turnId = turnByRuntime[runtime.runtimeId] || ''
          const kanbanTaskId = kanbanByRuntime[runtime.runtimeId] ?? runtime.kanbanTaskId ?? ''
          const allows = (operation: string) => ['supported', 'degraded', 'experimental'].includes(runtime.capabilities[operation]?.state ?? '')
          const common = { runtimeId: runtime.runtimeId, accountAlias: runtime.accountAlias, routeRef, cwd: runtime.cwd, worktree: runtime.worktree }
          return (
            <article key={runtime.runtimeId} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-[var(--theme-text)]">{runtime.kind} · {runtime.externalId.slice(0, 12)}</p>
                  <p className="text-xs text-[var(--theme-muted)]">{runtime.accountAlias} · {runtime.model || runtime.routeRef || 'model unknown'} · {runtime.hostStatus} · {runtime.worktree || 'no worktree'} · Kanban {runtime.kanbanTaskId || 'unlinked'}</p>
                </div>
                <span className="rounded-full border border-[var(--theme-border)] px-2 py-1 text-xs" title="Writer leases are acquired and checked atomically for each mutation">writer lease: enforced</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <select className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" value={routeRef} onChange={(event) => setRouteByRuntime((value) => ({ ...value, [runtime.runtimeId]: event.target.value }))}>
                  <option value="">Select subscription route</option>
                  {routes.map((route) => <option key={route.id} value={route.id}>{route.id}</option>)}
                </select>
                <input className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" placeholder="Follow-up / steering text" value={text} onChange={(event) => setTextByRuntime((value) => ({ ...value, [runtime.runtimeId]: event.target.value }))} />
                {runtime.kind === 'codex_thread' ? <input className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" placeholder="Active turn ID" value={turnId} onChange={(event) => setTurnByRuntime((value) => ({ ...value, [runtime.runtimeId]: event.target.value }))} /> : <div />}
                <input className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm" placeholder="Kanban task ID" value={kanbanTaskId} onChange={(event) => setKanbanByRuntime((value) => ({ ...value, [runtime.runtimeId]: event.target.value }))} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {runtime.kind === 'claude_session' ? <>
                  <Button disabled={busy !== null || !routeRef || !text} onClick={() => void mutate({ ...common, action: 'resume', prompt: text }, `${runtime.runtimeId}:resume`)}>Resume</Button>
                  <Button variant="secondary" disabled={busy !== null || !routeRef || !text || !allows('fork')} title={runtime.capabilities.fork?.explanation} onClick={() => void mutate({ ...common, action: 'fork', prompt: text }, `${runtime.runtimeId}:fork`)}>Fork</Button>
                  <Button variant="secondary" disabled={busy !== null || !routeRef || !allows('attach')} title={runtime.capabilities.attach?.explanation} onClick={() => void mutate({ ...common, action: 'attach' }, `${runtime.runtimeId}:attach`)}>Attach metadata</Button>
                </> : <>
                  <Button disabled={busy !== null || !routeRef || !allows('resume')} onClick={() => void mutate({ ...common, action: 'resume' }, `${runtime.runtimeId}:resume`)}>Resume</Button>
                  <Button variant="secondary" disabled={busy !== null || !routeRef || !allows('fork')} onClick={() => void mutate({ ...common, action: 'fork' }, `${runtime.runtimeId}:fork`)}>Fork</Button>
                  <Button disabled={busy !== null || !routeRef || !text || !turnId || !allows('steer')} title={runtime.capabilities.steer?.explanation} onClick={() => void mutate({ ...common, action: 'steer', text, turnId }, `${runtime.runtimeId}:steer`)}>Steer</Button>
                  <Button variant="secondary" disabled={busy !== null || !routeRef || !turnId || !allows('interrupt')} title={runtime.capabilities.interrupt?.explanation} onClick={() => void mutate({ ...common, action: 'interrupt', turnId }, `${runtime.runtimeId}:interrupt`)}>Interrupt</Button>
                  <Button variant="secondary" disabled={busy !== null || !routeRef || !allows('archive')} title={runtime.capabilities.archive?.explanation} onClick={() => { if (window.confirm('Archive this Codex thread?')) void mutate({ ...common, action: 'archive' }, `${runtime.runtimeId}:archive`) }}>Archive</Button>
                </>}
                <Button variant="secondary" disabled={busy !== null} onClick={() => void mutate({ runtimeId: runtime.runtimeId, action: 'link_kanban', kanbanTaskId }, `${runtime.runtimeId}:link`)}>Link Kanban</Button>
              </div>
            </article>
          )
        })}
        {!loading && (inventory?.runtimes.length ?? 0) === 0 ? <p className="rounded-2xl border border-dashed border-[var(--theme-border)] p-5 text-sm text-[var(--theme-muted)]">No provider-native sessions discovered.</p> : null}
      </div>
    </section>
  )
}
