'use client'

import type { CrewMember } from '@/hooks/use-crew-status'
import { cn } from '@/lib/utils'
import { SwarmTerminal } from '@/components/swarm/swarm-terminal'

export type StandaloneRuntimeEntry = {
  workerId: string
  currentTask: string | null
  recentLogTail?: string | null
  pid: number | null
  startedAt: number | null
  lastOutputAt: number | null
  cwd: string | null
  tmuxSession: string | null
  tmuxAttachable: boolean
  source?: 'runtime.json' | 'fallback'
}

function shellCommandForRuntime(
  runtime: StandaloneRuntimeEntry | undefined,
): Array<string> {
  if (runtime?.tmuxAttachable && runtime.tmuxSession) {
    return ['tmux', 'attach', '-t', runtime.tmuxSession]
  }
  const cwd = runtime?.cwd?.replace(/"/g, '\\"')
  return ['zsh', '-lc', cwd ? `cd "${cwd}" && exec zsh -l` : 'exec zsh -l']
}

function relative(ts: number | null | undefined): string {
  if (!ts) return 'never'
  const d = Date.now() - ts
  if (d < 60_000) return `${Math.max(1, Math.floor(d / 1000))}s ago`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

function TuiPill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'live' | 'warn'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
        tone === 'live'
          ? 'border-emerald-300/35 bg-emerald-400/12 text-emerald-100'
          : tone === 'warn'
            ? 'border-amber-300/35 bg-amber-400/12 text-amber-100'
            : 'border-white/10 bg-white/[0.04] text-emerald-100/65',
      )}
    >
      {children}
    </span>
  )
}

export function StandaloneRuntimePane({
  visible,
  selectedId,
  roomIds,
  runtimeByWorker,
  terminalTargets,
  onSelect,
}: {
  visible: boolean
  selectedId: string | null
  roomIds: Array<string>
  runtimeByWorker: Map<string, StandaloneRuntimeEntry>
  terminalTargets: Array<CrewMember>
  onSelect: (workerId: string) => void
}) {
  return (
    <div className={cn('relative z-10', visible ? 'block' : 'hidden')}>
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[1.75rem] border border-emerald-300/15 bg-[#07100c]/92 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <TuiPill tone="live">Live TUI</TuiPill>
                <TuiPill>{terminalTargets.length} terminal{terminalTargets.length === 1 ? '' : 's'}</TuiPill>
                {roomIds.length > 0 ? <TuiPill tone="warn">room {roomIds.join(', ')}</TuiPill> : null}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                Swarm tmux control
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-emerald-50/55">
                Native Swarm2 TUI cards attached directly to the worker tmux sessions. Click a terminal to focus and type.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <TuiPill>Auto</TuiPill>
              <TuiPill>Chat</TuiPill>
              <TuiPill>Logs</TuiPill>
            </div>
          </div>
        </div>

        {terminalTargets.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-emerald-400/16 bg-emerald-500/5 px-4 py-12 text-center text-sm text-emerald-100/55">
            Select a worker or add workers to the room to open tmux terminals here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {terminalTargets.map((member) => {
              const runtime = runtimeByWorker.get(member.id)
              const attached = Boolean(runtime?.tmuxAttachable && runtime.tmuxSession)
              const sessionLabel = attached
                ? `tmux:${runtime?.tmuxSession}`
                : 'shell:fallback'
              return (
                <article
                  key={member.id}
                  className={cn(
                    'overflow-hidden rounded-[1.75rem] border bg-[#080d0b]/95 shadow-[0_22px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl',
                    member.id === selectedId
                      ? 'border-amber-300/45 ring-1 ring-amber-200/20'
                      : attached
                        ? 'border-emerald-300/18'
                        : 'border-amber-300/22',
                  )}
                >
                  <div className="border-b border-white/8 bg-gradient-to-r from-emerald-400/10 via-white/[0.025] to-transparent px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <TuiPill tone={attached ? 'live' : 'warn'}>
                            {attached ? 'tmux' : 'fallback'}
                          </TuiPill>
                          <span className="truncate rounded-full border border-white/10 bg-black/35 px-2.5 py-1 font-mono text-[11px] text-emerald-50/70">
                            {sessionLabel}
                          </span>
                          <span className="text-[11px] text-emerald-100/42">
                            output {relative(runtime?.lastOutputAt)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-baseline gap-2">
                          <h3 className="text-lg font-semibold text-white">{member.id}</h3>
                          <span className="text-xs text-emerald-100/45">
                            {member.displayName || member.role || 'Swarm worker'}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-emerald-50/62">
                          {runtime?.currentTask ?? member.lastSessionTitle ?? 'Idle live worker session'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelect(member.id)}
                        className={cn(
                          'rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors',
                          member.id === selectedId
                            ? 'border-amber-300/45 bg-amber-300/12 text-amber-100'
                            : 'border-emerald-300/16 bg-white/[0.025] text-emerald-100/65 hover:border-emerald-200/35 hover:text-white',
                        )}
                      >
                        {member.id === selectedId ? 'Focused' : 'Focus TUI'}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-2 border-b border-white/8 bg-black/20 px-4 py-2 text-[11px] text-emerald-100/55 sm:grid-cols-3">
                    <div className="truncate">PID {runtime?.pid != null ? runtime.pid : '—'}</div>
                    <div className="truncate">started {relative(runtime?.startedAt)}</div>
                    <div className="truncate font-mono">{runtime?.cwd ?? 'no cwd'}</div>
                  </div>

                  <div className="bg-[#050806] p-3">
                    <SwarmTerminal
                      workerId={member.id}
                      command={shellCommandForRuntime(runtime)}
                      cwd={runtime?.cwd ?? undefined}
                      height={430}
                      active={visible && member.id === selectedId}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
