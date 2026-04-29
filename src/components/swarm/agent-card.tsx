'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  ComputerTerminal01Icon,
} from '@hugeicons/core-free-icons'
import type { CrewMember } from '@/hooks/use-crew-status'
import { cn } from '@/lib/utils'
import { getOnlineStatus } from '@/hooks/use-crew-status'
import { SwarmNodeChat } from '@/components/swarm/swarm-node-chat'

export type AgentState =
  | 'idle'
  | 'executing'
  | 'thinking'
  | 'writing'
  | 'waiting'
  | 'blocked'
  | 'syncing'
  | 'reviewing'
  | 'offline'

const STATE_TONE: Record<AgentState, string> = {
  executing: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  thinking: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200',
  writing: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  waiting: 'border-orange-400/40 bg-orange-500/15 text-orange-200',
  blocked: 'border-red-500/40 bg-red-500/15 text-red-200',
  idle: 'border-emerald-400/20 bg-emerald-500/5 text-emerald-200/70',
  syncing: 'border-blue-400/40 bg-blue-500/15 text-blue-200',
  reviewing: 'border-violet-400/40 bg-violet-500/15 text-violet-200',
  offline: 'border-red-500/30 bg-red-500/10 text-red-200',
}

function roleFromId(id: string): string {
  const m = id.match(/(\d+)/)
  const n = m ? m[1] : ''
  switch (n) {
    case '1':
      return 'PR / Issues'
    case '2':
      return 'Qwen PC1'
    case '3':
      return 'BenchLoop'
    case '4':
      return 'Research'
    case '5':
      return 'Builder'
    case '6':
      return 'Reviewer'
    case '7':
      return 'Docs'
    case '8':
      return 'Ops'
    case '9':
      return 'Hackathon'
    case '10':
      return 'Builder'
    case '11':
      return 'Reviewer'
    case '12':
      return 'PR / Issues'
    default:
      return 'Worker'
  }
}

function roleAccent(role: string): string {
  if (role.includes('PR')) return 'from-amber-500/18 via-[#17150f] to-[#0f120f]'
  if (role.includes('Qwen'))
    return 'from-violet-500/18 via-[#12101a] to-[#0f1114]'
  if (role.includes('BenchLoop'))
    return 'from-cyan-500/18 via-[#0d1719] to-[#0d1112]'
  if (role.includes('Research'))
    return 'from-sky-500/16 via-[#0c1418] to-[#0e1112]'
  if (role.includes('Builder'))
    return 'from-emerald-500/18 via-[#101913] to-[#0d110e]'
  if (role.includes('Reviewer'))
    return 'from-fuchsia-500/16 via-[#171118] to-[#110f12]'
  if (role.includes('Docs'))
    return 'from-orange-500/18 via-[#1a140f] to-[#110f0d]'
  if (role.includes('Ops')) return 'from-lime-500/16 via-[#12180f] to-[#0e110d]'
  if (role.includes('Hackathon'))
    return 'from-pink-500/18 via-[#1a1117] to-[#110d10]'
  return 'from-emerald-500/14 via-[#151d17] to-[#101713]'
}

function deriveAgentState(
  member: CrewMember,
  currentTask: string | null,
): AgentState {
  const status = getOnlineStatus(member)
  if (status === 'offline') return 'offline'
  if (currentTask) {
    const lc = currentTask.toLowerCase()
    if (lc.includes('review')) return 'reviewing'
    if (
      lc.includes('refactor') ||
      lc.includes('implement') ||
      lc.includes('build') ||
      lc.includes('fix')
    )
      return 'executing'
    if (
      lc.includes('research') ||
      lc.includes('thinking') ||
      lc.includes('plan') ||
      lc.includes('experiment')
    )
      return 'thinking'
    if (lc.includes('writ') || lc.includes('doc') || lc.includes('spec'))
      return 'writing'
    if (lc.includes('wait') || lc.includes('approval')) return 'waiting'
    if (lc.includes('block') || lc.includes('error')) return 'blocked'
    if (lc.includes('sync') || lc.includes('deploy')) return 'syncing'
    return 'executing'
  }
  return 'idle'
}

type AgentCardProps = {
  member: CrewMember
  currentTask?: string | null
  recentLines?: Array<string>
  inRoom: boolean
  selected: boolean
  onSelect: () => void
  onToggleRoom: () => void
  onOpenTui: () => void
  onOpenTasks: () => void
  className?: string
  compactSignalOnly?: boolean
}

export function AgentCard({
  member,
  currentTask = null,
  recentLines = [],
  inRoom,
  selected,
  onSelect,
  onToggleRoom,
  onOpenTui,
  onOpenTasks,
  className,
  compactSignalOnly = false,
}: AgentCardProps) {
  const state = deriveAgentState(member, currentTask)
  const role = roleFromId(member.id)
  const status = getOnlineStatus(member)
  const isGenerating =
    state === 'executing' ||
    state === 'thinking' ||
    state === 'writing' ||
    state === 'syncing' ||
    state === 'reviewing'

  return (
    <article
      onClick={onSelect}
      className={cn(
        'group relative flex min-h-[24rem] flex-col gap-3 overflow-hidden rounded-[1.45rem] border bg-gradient-to-b p-3.5 backdrop-blur-xl transition-all',
        'cursor-pointer hover:-translate-y-[1px] hover:shadow-[0_18px_30px_rgba(0,0,0,0.32)]',
        roleAccent(role),
        selected
          ? 'border-emerald-300/75 shadow-[0_0_0_1px_rgba(52,211,153,0.32),0_0_34px_rgba(34,197,94,0.22)]'
          : inRoom
            ? 'border-emerald-400/55 shadow-[0_0_22px_rgba(34,197,94,0.18)]'
            : 'border-emerald-400/12 hover:border-emerald-400/35',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent opacity-60" />

      <div className="flex items-start gap-3">
        <div className="relative">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-black/35 shadow-inner shadow-black/35">
            <span className="text-base">🤖</span>
          </div>
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-[#101713]',
              status === 'online' && 'bg-emerald-400',
              status === 'offline' && 'bg-red-400',
              status === 'unknown' && 'bg-slate-500',
              isGenerating &&
                'animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.7)]',
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-base font-bold text-white">
              {member.displayName || member.id}
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/75">
              {role}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em]',
                STATE_TONE[state],
              )}
            >
              {isGenerating ? (
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-current" />
              ) : null}
              {state}
            </span>
            {inRoom ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-200">
                wired
              </span>
            ) : null}
            {selected ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                selected
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/8 bg-black/22 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/50">
            Now
          </div>
          {member.assignedTaskCount > 0 || member.cronJobCount > 0 ? (
            <div className="text-[10px] text-emerald-100/45">
              {member.assignedTaskCount} tasks · {member.cronJobCount} cron
            </div>
          ) : null}
        </div>
        <div className="mt-1 line-clamp-2 text-emerald-50/90">
          {currentTask ?? 'Ready for orchestration'}
        </div>
        {recentLines.length > 0 ? (
          <div className="mt-1.5 truncate text-[11px] text-emerald-100/45">
            {recentLines[recentLines.length - 1]}
          </div>
        ) : null}
      </div>

      {compactSignalOnly ? (
        <div className="min-h-[12rem] flex-1 rounded-2xl border border-emerald-400/10 bg-black/18 p-3 text-[11px] text-emerald-100/55">
          <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-emerald-200/45">
            <span>Signal</span>
            <span>{selected ? 'focused' : 'click card to focus'}</span>
          </div>
          {recentLines.length > 0 ? (
            <div className="space-y-1">
              {recentLines.slice(-3).map((line, index) => (
                <div key={`${member.id}-line-${index}`} className="truncate">
                  {line}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-emerald-100/40">
              No runtime tail yet. Use Router for orchestration or Terminal for live tmux.
            </div>
          )}
        </div>
      ) : (
        <div
          className="min-h-[12rem] flex-1"
          onClick={(event) => event.stopPropagation()}
        >
          <SwarmNodeChat
            workerId={member.id}
            className="h-full min-h-[12rem] border-white/10 bg-black/22"
          />
        </div>
      )}

      <div
        className="flex items-center justify-between gap-2 border-t border-white/8 pt-2 text-[11px]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onToggleRoom}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors',
            inRoom
              ? 'bg-emerald-400 text-black hover:bg-emerald-300'
              : 'border border-emerald-400/20 text-emerald-200/80 hover:bg-emerald-500/10 hover:text-white',
          )}
        >
          <HugeiconsIcon
            icon={inRoom ? CheckmarkCircle02Icon : Add01Icon}
            size={11}
          />
          {inRoom ? 'Room' : '+ Room'}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTasks}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/15 bg-transparent px-2.5 py-1 text-emerald-200/70 hover:text-white"
          >
            <HugeiconsIcon icon={CheckListIcon} size={11} />
            Tasks
          </button>
          <button
            type="button"
            onClick={onOpenTui}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-400/15 bg-transparent px-2.5 py-1 text-emerald-200/70 hover:text-white"
          >
            <HugeiconsIcon icon={ComputerTerminal01Icon} size={11} />
            Terminal
          </button>
        </div>
      </div>
    </article>
  )
}
