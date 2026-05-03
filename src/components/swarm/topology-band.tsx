'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  CpuIcon,
  DashboardSquare03Icon,
} from '@hugeicons/core-free-icons'
import type { CrewMember } from '@/hooks/use-crew-status'
import { cn } from '@/lib/utils'
import { getOnlineStatus } from '@/hooks/use-crew-status'

type Props = {
  members: Array<CrewMember>
  selectedId: string | null
  roomIds: Array<string>
  onSelect: (id: string) => void
  onToggleRoom: (id: string) => void
}

function workerRole(id: string): string {
  const m = id.match(/(\d+)/)
  const n = m ? m[1] : ''
  switch (n) {
    case '1':
    case '12':
      return 'PR'
    case '2':
      return 'Qwen'
    case '3':
      return 'Bench'
    case '4':
      return 'Research'
    case '5':
    case '10':
      return 'Build'
    case '6':
    case '11':
      return 'Review'
    case '7':
      return 'Docs'
    case '8':
      return 'Ops'
    case '9':
      return 'Hack'
    default:
      return 'Worker'
  }
}

export function TopologyBand({
  members,
  selectedId,
  roomIds,
  onSelect,
  onToggleRoom,
}: Props) {
  const selected = selectedId
    ? members.find((member) => member.id === selectedId)
    : null
  const onlineCount = members.filter(
    (member) => getOnlineStatus(member) === 'online',
  ).length

  return (
    <section className="rounded-[1.35rem] border border-emerald-400/12 bg-black/35 px-3 py-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-2 lg:w-[260px]">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/10 text-emerald-300">
            <HugeiconsIcon icon={DashboardSquare03Icon} size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/45">
              Compact topology
            </div>
            <div className="truncate text-sm font-semibold text-white">
              {selected
                ? `Focused: ${selected.displayName || selected.id}`
                : 'Select a worker'}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-400/18 bg-emerald-500/8 px-3 py-1.5 text-xs text-emerald-100/75">
            <HugeiconsIcon icon={CpuIcon} size={13} />
            Agent
            <span className="text-emerald-200/45">→</span>
          </div>
          {members.length === 0 ? (
            <div className="rounded-full border border-dashed border-emerald-400/20 px-3 py-1.5 text-xs text-emerald-100/45">
              No swarm workers discovered from crew status.
            </div>
          ) : (
            members.map((member) => {
              const status = getOnlineStatus(member)
              const inRoom = roomIds.includes(member.id)
              const isSelected = member.id === selectedId
              return (
                <div key={member.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelect(member.id)}
                    className={cn(
                      'group flex min-w-[132px] items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-left transition-colors',
                      isSelected
                        ? 'border-amber-300/65 bg-amber-400/10 shadow-[0_0_0_1px_rgba(251,191,36,0.16)]'
                        : inRoom
                          ? 'border-emerald-300/55 bg-emerald-500/12'
                          : 'border-emerald-400/12 bg-white/[0.025] hover:border-emerald-400/32',
                    )}
                  >
                    <span
                      className={cn(
                        'size-2.5 shrink-0 rounded-full',
                        status === 'online' &&
                          'bg-emerald-400 shadow-[0_0_8px_rgba(34,197,94,0.65)]',
                        status === 'offline' && 'bg-red-400',
                        status === 'unknown' && 'bg-slate-500',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white">
                        {member.displayName || member.id}
                      </span>
                      <span className="block truncate text-[10px] text-emerald-100/45">
                        {workerRole(member.id)} · {status}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleRoom(member.id)
                    }}
                    className={cn(
                      'absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border transition-colors',
                      inRoom
                        ? 'border-emerald-200 bg-emerald-400 text-black'
                        : 'border-emerald-400/35 bg-black text-emerald-300 hover:bg-emerald-500 hover:text-black',
                    )}
                    aria-label={
                      inRoom
                        ? `Remove ${member.id} from room`
                        : `Add ${member.id} to room`
                    }
                  >
                    <HugeiconsIcon
                      icon={inRoom ? CheckmarkCircle02Icon : Add01Icon}
                      size={10}
                    />
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 text-[11px] text-emerald-100/55 lg:justify-end">
          <span className="rounded-full border border-emerald-400/14 bg-white/[0.025] px-2.5 py-1">
            {onlineCount}/{members.length} online
          </span>
          <span
            className={cn(
              'rounded-full border px-2.5 py-1',
              roomIds.length > 0
                ? 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100'
                : 'border-emerald-400/14 bg-white/[0.025]',
            )}
          >
            {roomIds.length} in room
          </span>
        </div>
      </div>
    </section>
  )
}
