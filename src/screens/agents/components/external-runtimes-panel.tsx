import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

type RuntimeStatus =
  | 'online'
  | 'offline'
  | 'unchecked'
  | 'missing'
  | 'disabled'
  | 'unknown'

type ExternalRuntime = {
  id: string
  name: string
  description: string
  backend: string
  agentType: string
  source: string
  enabled: boolean
  installed: boolean
  command: string
  args: Array<string>
  teamCapable: boolean
  status: RuntimeStatus
  lastCheckStatus: string
  lastCheckErrorMessage: string
  lastCheckGuidance: string
  lastCheckLatencyMs: number | null
}

type ExternalAgentsResponse = {
  ok?: boolean
  error?: string
  companion?: {
    online: boolean
    version: string
    runtimes: Array<ExternalRuntime>
    error?: string
  }
}

const RUNTIME_EMOJI: Record<string, string> = {
  aionrs: '◈',
  codex: '⌘',
  grok: '𝕏',
  hermes: '☿',
  openclaw: '🦞',
  'openclaw-gateway': '🦞',
}

const STATUS_STYLE: Record<RuntimeStatus, string> = {
  online:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  offline: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  unchecked:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  missing: 'border-primary-300 bg-primary-100 text-primary-600',
  disabled: 'border-primary-300 bg-primary-100 text-primary-600',
  unknown: 'border-primary-300 bg-primary-100 text-primary-600',
}

function statusLabel(runtime: ExternalRuntime): string {
  if (runtime.status === 'online') return 'Ready'
  if (runtime.status === 'offline') return 'Needs attention'
  if (runtime.status === 'unchecked') return 'Installed'
  if (runtime.status === 'disabled') return 'Disabled'
  if (runtime.status === 'missing') return 'Missing'
  return 'Unknown'
}

async function readExternalAgents(): Promise<ExternalAgentsResponse> {
  const response = await fetch('/api/external-agents')
  const payload = (await response
    .json()
    .catch(() => ({}))) as ExternalAgentsResponse
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`)
  }
  return payload
}

async function testExternalAgent(runtimeId: string): Promise<ExternalRuntime> {
  const response = await fetch('/api/external-agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runtimeId }),
  })
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    runtime?: ExternalRuntime
  }
  if (!response.ok || payload.ok === false || !payload.runtime) {
    throw new Error(payload.error || 'Runtime health check failed')
  }
  return payload.runtime
}

export function ExternalRuntimesPanel() {
  const queryClient = useQueryClient()
  const runtimesQuery = useQuery({
    queryKey: ['external-agent-runtimes'],
    queryFn: readExternalAgents,
    refetchInterval: 15_000,
    retry: false,
  })
  const healthMutation = useMutation({
    mutationFn: testExternalAgent,
    onSuccess: (runtime) => {
      toast(
        `${runtime.name} ${runtime.status === 'online' ? 'is ready' : 'needs attention'}`,
        {
          type: runtime.status === 'online' ? 'success' : 'warning',
        },
      )
      void queryClient.invalidateQueries({
        queryKey: ['external-agent-runtimes'],
      })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Runtime test failed', {
        type: 'error',
      })
    },
  })

  const companion = runtimesQuery.data?.companion
  const runtimes = companion?.runtimes ?? []
  const readyCount = runtimes.filter(
    (runtime) => runtime.status === 'online',
  ).length

  return (
    <section className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-[0_24px_80px_var(--theme-shadow)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--theme-text)]">
              Harness Hub
            </h2>
            <span
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                companion?.online
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              {companion?.online
                ? `AionCore ${companion.version}`
                : 'Companion offline'}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--theme-muted-2)]">
            Hermes, Codex, Grok, OpenClaw, and more through one ACP bridge
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--theme-muted)]">
          <span>{readyCount} ready</span>
          <span aria-hidden>·</span>
          <span>{runtimes.length} installed</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void runtimesQuery.refetch()}
            disabled={runtimesQuery.isFetching}
          >
            {runtimesQuery.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {runtimesQuery.isLoading ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-6 text-sm text-[var(--theme-muted)]">
          Discovering local agent runtimes…
        </div>
      ) : runtimesQuery.isError || !companion?.online ? (
        <div className="mt-4 rounded-2xl border border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] px-4 py-4 text-sm text-[var(--theme-text)]">
          {runtimesQuery.error instanceof Error
            ? runtimesQuery.error.message
            : companion?.error || 'The AionCore companion is not running.'}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {runtimes.map((runtime) => {
            const testing =
              healthMutation.isPending &&
              healthMutation.variables === runtime.id
            const diagnostic =
              runtime.lastCheckErrorMessage || runtime.lastCheckGuidance

            return (
              <article
                key={runtime.id}
                className="flex min-h-52 flex-col rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] text-lg font-semibold text-[var(--theme-accent)]">
                      {RUNTIME_EMOJI[runtime.backend] ?? '◇'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-[var(--theme-text)]">
                        {runtime.name}
                      </h3>
                      <p className="truncate text-xs text-[var(--theme-muted-2)]">
                        {runtime.backend} · {runtime.agentType.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${STATUS_STYLE[runtime.status]}`}
                  >
                    {statusLabel(runtime)}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {runtime.teamCapable ? (
                    <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[10px] text-[var(--theme-muted)]">
                      Team capable
                    </span>
                  ) : null}
                  <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[10px] text-[var(--theme-muted)]">
                    {runtime.source}
                  </span>
                  {runtime.lastCheckLatencyMs !== null ? (
                    <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[10px] text-[var(--theme-muted)]">
                      {runtime.lastCheckLatencyMs} ms
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 line-clamp-3 flex-1 text-xs leading-5 text-[var(--theme-muted-2)]">
                  {diagnostic ||
                    runtime.description ||
                    'Installed and waiting for a connection test.'}
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[10px] text-[var(--theme-muted)]">
                    {runtime.command || runtime.backend}
                    {runtime.args.length ? ` ${runtime.args.join(' ')}` : ''}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => healthMutation.mutate(runtime.id)}
                    disabled={healthMutation.isPending}
                  >
                    {testing ? 'Testing…' : 'Test'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-accent-soft)] px-4 py-3 text-xs text-[var(--theme-muted)]">
        Runtime discovery and app-managed startup are live. Unified ACP
        conversations, approvals, and remote Tailscale hosts are the next
        integration layer.
      </div>
    </section>
  )
}
