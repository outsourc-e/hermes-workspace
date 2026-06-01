'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

type AgentOsResponse = {
  dashboard: {
    counts: {
      active_jobs: number
      queued_jobs: number
      failed_jobs: number
      awaiting_approval: number
    }
    last_execution: { created_at: string; message: string; workflow_key: string } | null
    next_execution: { next_run_at: string | null; title: string; workflow_name: string } | null
    recent_tasks: Array<{
      id: string
      title: string
      workflow_name: string
      status: string
      route: string
      priority: string
      updated_at: string
      n8n_execution_id: string | null
    }>
    approvals: Array<{
      id: string
      requested_action: string
      workflow_key: string
      risk: string
      status: string
      created_at: string
    }>
    workflows: Array<{
      key: string
      name: string
      enabled: boolean
      mode: string
      schedule: string | null
      n8n_workflow_id: string | null
      route_default: string
    }>
  }
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'unknown'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  const diff = (Date.now() - t) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

async function fetchAgentOs(): Promise<AgentOsResponse> {
  const res = await fetch('/api/agent-os/')
  if (!res.ok) throw new Error(`Failed to load Agent OS (${res.status})`)
  return res.json()
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  )
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tone ?? 'border-zinc-700 bg-zinc-900 text-zinc-300'}`}>{children}</span>
}

export function AgentOsScreen() {
  const query = useQuery({
    queryKey: ['agent-os'],
    queryFn: fetchAgentOs,
    refetchInterval: 15_000,
  })

  const data = query.data?.dashboard

  const grouped = useMemo(() => {
    const tasks = data?.recent_tasks ?? []
    return {
      running: tasks.filter((task) => ['running', 'retrying', 'routed'].includes(task.status)),
      queued: tasks.filter((task) => task.status === 'queued'),
      failed: tasks.filter((task) => task.status === 'failed'),
    }
  }, [data])

  if (query.isLoading) {
    return <div className="p-6 text-zinc-400">Loading Agent OS…</div>
  }

  if (query.error || !data) {
    return <div className="p-6 text-red-300">{query.error instanceof Error ? query.error.message : 'Failed to load Agent OS'}</div>
  }

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100">Agent OS</h1>
              <p className="mt-1 text-sm text-zinc-400">Central queue, orchestration registry, execution logs, approvals, and workflow status.</p>
            </div>
            <Chip tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">n8n-first orchestration</Chip>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active jobs" value={data.counts.active_jobs} />
          <StatCard label="Queued jobs" value={data.counts.queued_jobs} />
          <StatCard label="Failed jobs" value={data.counts.failed_jobs} />
          <StatCard label="Awaiting approval" value={data.counts.awaiting_approval} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-100">Last execution</h2>
            {data.last_execution ? (
              <div className="mt-3 text-sm text-zinc-300">
                <div>{data.last_execution.workflow_key}</div>
                <div className="mt-1 text-zinc-400">{data.last_execution.message}</div>
                <div className="mt-2 text-xs text-zinc-500">{timeAgo(data.last_execution.created_at)}</div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-500">No executions yet.</div>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-100">Next execution</h2>
            {data.next_execution ? (
              <div className="mt-3 text-sm text-zinc-300">
                <div>{data.next_execution.title}</div>
                <div className="mt-1 text-zinc-400">{data.next_execution.workflow_name}</div>
                <div className="mt-2 text-xs text-zinc-500">{data.next_execution.next_run_at ?? 'not scheduled yet'}</div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-zinc-500">No scheduled executions yet.</div>
            )}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 xl:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-100">Recent tasks</h2>
              <div className="text-xs text-zinc-500">Latest 20</div>
            </div>
            <div className="space-y-2">
              {data.recent_tasks.map((task) => (
                <div key={task.id} className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-zinc-100">{task.title}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">{task.workflow_name}</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Chip>{task.status}</Chip>
                      <Chip>{task.route}</Chip>
                      <Chip>{task.priority}</Chip>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>{timeAgo(task.updated_at)}</span>
                    <span>{task.n8n_execution_id ? `n8n exec ${task.n8n_execution_id}` : 'no n8n execution yet'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-sm font-semibold text-zinc-100">Approval queue</h2>
              <div className="mt-3 space-y-2">
                {data.approvals.length ? data.approvals.map((approval) => (
                  <div key={approval.id} className="rounded border border-red-500/30 bg-red-500/5 p-3 text-sm">
                    <div className="font-medium text-zinc-100">{approval.requested_action}</div>
                    <div className="mt-1 text-xs text-zinc-400">{approval.workflow_key}</div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <Chip tone="border-red-500/40 bg-red-500/10 text-red-300">{approval.risk}</Chip>
                      <span className="text-zinc-500">{timeAgo(approval.created_at)}</span>
                    </div>
                  </div>
                )) : <div className="text-sm text-zinc-500">No pending approvals.</div>}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-sm font-semibold text-zinc-100">Workflow registry</h2>
              <div className="mt-3 space-y-2">
                {data.workflows.map((workflow) => (
                  <div key={workflow.key} className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-zinc-100">{workflow.name}</div>
                      <Chip>{workflow.enabled ? 'enabled' : 'disabled'}</Chip>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{workflow.key}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Chip>{workflow.mode}</Chip>
                      <Chip>{workflow.route_default}</Chip>
                      <Chip>{workflow.schedule ?? 'manual'}</Chip>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">{workflow.n8n_workflow_id ? `n8n workflow ${workflow.n8n_workflow_id}` : 'not bound to n8n yet'}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Running / active</h3>
            <div className="mt-3 text-sm text-zinc-400">{grouped.running.length} task(s)</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Queued</h3>
            <div className="mt-3 text-sm text-zinc-400">{grouped.queued.length} task(s)</div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Failed</h3>
            <div className="mt-3 text-sm text-zinc-400">{grouped.failed.length} task(s)</div>
          </div>
        </section>
      </div>
    </div>
  )
}
