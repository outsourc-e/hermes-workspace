/**
 * Permission (approvals) mode controls for swarm workers.
 *
 * Mirrors Claude Code's permission modes: ask / smart / auto / yolo (bypass).
 * Backed by /api/swarm-permissions which patches `approvals.mode` in each
 * worker's Hermes profile config.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

export type SwarmPermissionMode = 'ask' | 'smart' | 'auto' | 'yolo'

export const PERMISSION_MODE_OPTIONS: Array<{
  value: SwarmPermissionMode
  label: string
}> = [
  { value: 'ask', label: 'Ask' },
  { value: 'smart', label: 'Smart' },
  { value: 'auto', label: 'Auto' },
  { value: 'yolo', label: 'Bypass' },
]

const MODE_BADGE_CLASSES: Record<SwarmPermissionMode, string> = {
  ask: 'border-sky-400/40 bg-sky-500/10 text-sky-200',
  smart: 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)]',
  auto: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  yolo: 'border-red-400/40 bg-red-500/10 text-red-300',
}

function isPermissionMode(value: unknown): value is SwarmPermissionMode {
  return (
    value === 'ask' || value === 'smart' || value === 'auto' || value === 'yolo'
  )
}

async function fetchPermissionModes(): Promise<
  Record<string, SwarmPermissionMode>
> {
  const res = await fetch('/api/swarm-permissions')
  if (!res.ok) return {}
  const data = (await res.json()) as {
    modes?: Record<string, unknown>
  }
  const modes: Record<string, SwarmPermissionMode> = {}
  for (const [workerId, mode] of Object.entries(data.modes ?? {})) {
    if (isPermissionMode(mode)) modes[workerId] = mode
  }
  return modes
}

function usePermissionModes() {
  return useQuery({
    queryKey: ['swarm2', 'permission-modes'],
    queryFn: fetchPermissionModes,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

function useSetPermissionMode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      workerId?: string
      mode: SwarmPermissionMode
      all?: boolean
    }) => {
      const res = await fetch('/api/swarm-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(data?.error || `Request failed (${res.status})`)
      }
      return res.json() as Promise<unknown>
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['swarm2', 'permission-modes'],
      })
    },
  })
}

/**
 * Compact per-worker permission mode selector rendered as a colored badge.
 * Mount inside the worker card header badge cluster.
 */
export function WorkerPermissionModeBadge({
  workerId,
  className,
}: {
  workerId: string
  className?: string
}) {
  const modesQuery = usePermissionModes()
  const setMode = useSetPermissionMode()
  const mode = modesQuery.data?.[workerId] ?? 'smart'

  return (
    <select
      value={mode}
      aria-label={`Permission mode for ${workerId}`}
      title={`Permission mode: ${mode}`}
      disabled={setMode.isPending}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const next = event.target.value
        if (!isPermissionMode(next) || next === mode) return
        if (
          next === 'yolo' &&
          !window.confirm(
            `Set ${workerId} to Bypass (yolo)? It will skip ALL approval prompts.`,
          )
        ) {
          return
        }
        setMode.mutate({ workerId, mode: next })
      }}
      className={cn(
        'cursor-pointer appearance-none rounded-full border px-1.5 py-0.5 text-[10px] font-semibold outline-none transition-colors disabled:opacity-60',
        MODE_BADGE_CLASSES[mode],
        className,
      )}
    >
      {PERMISSION_MODE_OPTIONS.map((option) => (
        <option
          key={option.value}
          value={option.value}
          className="bg-[var(--theme-card)] text-[var(--theme-text)]"
        >
          {option.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Global "All workers" permission mode control for the top of the swarm
 * screen. Applies the chosen mode to every roster worker at once, with a
 * confirm() gate before enabling bypass (yolo).
 */
export function GlobalPermissionModeControl({
  className,
}: {
  className?: string
}) {
  const modesQuery = usePermissionModes()
  const setMode = useSetPermissionMode()
  const modes = Object.values(modesQuery.data ?? {})
  const uniform =
    modes.length > 0 && modes.every((mode) => mode === modes[0])
      ? modes[0]
      : null

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1.5 text-[11px] text-[var(--theme-muted)]',
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="font-semibold uppercase tracking-[0.14em]">
        Permissions
      </span>
      <span
        className={cn(
          'rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
          uniform
            ? MODE_BADGE_CLASSES[uniform]
            : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)]',
        )}
      >
        {uniform
          ? (PERMISSION_MODE_OPTIONS.find((o) => o.value === uniform)?.label ??
            uniform)
          : 'Mixed'}
      </span>
      <label className="flex items-center gap-1.5">
        <span>All workers:</span>
        <select
          value=""
          disabled={setMode.isPending}
          aria-label="Set permission mode for all workers"
          onChange={(event) => {
            const next = event.target.value
            event.target.value = ''
            if (!isPermissionMode(next)) return
            if (
              next === 'yolo' &&
              !window.confirm(
                'Set EVERY worker to Bypass (yolo)? All workers will skip ALL approval prompts.',
              )
            ) {
              return
            }
            setMode.mutate({ mode: next, all: true })
          }}
          className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-1.5 py-0.5 text-[11px] text-[var(--theme-text)] outline-none disabled:opacity-60"
        >
          <option value="" disabled>
            {setMode.isPending ? 'Applying…' : 'Set…'}
          </option>
          {PERMISSION_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {setMode.isError ? (
        <span className="text-red-300">
          {setMode.error instanceof Error
            ? setMode.error.message
            : 'Failed to set mode'}
        </span>
      ) : null}
    </div>
  )
}
