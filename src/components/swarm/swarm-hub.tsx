'use client'

import { useMemo } from 'react'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  CpuIcon,
  FlashIcon,
  Remove01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { getOnlineStatus, type CrewMember } from '@/hooks/use-crew-status'

type SwarmHubProps = {
  members: CrewMember[]
  selectedId: string | null
  roomIds: string[]
  onSelect: (id: string) => void
  onToggleRoom: (id: string) => void
}

type NodePos = { x: number; y: number }

function computeNodePositions(count: number): NodePos[] {
  const top = [
    { x: 14, y: 22 }, { x: 30, y: 14 }, { x: 50, y: 10 }, { x: 70, y: 14 }, { x: 86, y: 22 },
  ]
  const bottom = [
    { x: 10, y: 64 }, { x: 24, y: 80 }, { x: 40, y: 86 }, { x: 60, y: 86 }, { x: 76, y: 80 }, { x: 90, y: 64 },
  ]
  const fallback = Array.from({ length: Math.max(0, count - 11) }, (_, i) => ({ x: 50, y: 46 - i * 4 }))
  return [...top, ...bottom, ...fallback].slice(0, count)
}

function shortLabel(member: CrewMember): string {
  const raw = member.displayName || member.id
  return raw.length > 13 ? `${raw.slice(0, 12)}…` : raw
}

function roleLabel(member: CrewMember): string {
  const m = member.id.match(/(\d+)/)
  const n = m ? m[1] : ''
  switch (n) {
    case '1': return 'PR / Issues'
    case '2': return 'Qwen / PC1'
    case '3': return 'BenchLoop'
    case '4': return 'Research'
    case '5': return 'Builder'
    case '6': return 'Reviewer'
    case '7': return 'Docs'
    case '8': return 'Ops'
    default:  return member.role || 'Worker'
  }
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function StatPill({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'green' | 'amber' }) {
  return (
    <div className={cn(
      'rounded-2xl border px-4 py-3 text-center backdrop-blur',
      tone === 'green' ? 'border-emerald-400/40 bg-emerald-500/10' :
      tone === 'amber' ? 'border-amber-400/40 bg-amber-500/10' :
      'border-emerald-400/15 bg-black/30',
    )}>
      <div className={cn(
        'text-2xl font-extrabold tracking-tight',
        tone === 'green' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : 'text-emerald-50',
      )}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-emerald-100/55">{label}</div>
    </div>
  )
}

export function SwarmHub({ members, selectedId, roomIds, onSelect, onToggleRoom }: SwarmHubProps) {
  const positions = useMemo(() => computeNodePositions(members.length), [members.length])
  const onlineCount = members.filter((m) => getOnlineStatus(m) === 'online').length
  const totalTokens = members.reduce((sum, m) => sum + m.totalTokens, 0)
  const totalSessions = members.reduce((sum, m) => sum + m.sessionCount, 0)

  return (
    <section
      className="relative isolate overflow-hidden rounded-[2rem] border border-emerald-400/25 shadow-[0_28px_120px_rgba(0,0,0,0.5)]"
      style={{
        background: 'radial-gradient(circle at top, rgba(34,197,94,0.10), transparent 30%), linear-gradient(180deg, #090c0a 0%, #0c110d 100%)',
      }}
    >
      {/* grid */}
      <div className="absolute inset-0 opacity-[0.16] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
      }} />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />

      {/* header */}
      <div className="relative px-6 pt-6 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200">
              <HugeiconsIcon icon={FlashIcon} size={12} />
              Project Workspace · Swarm OS
            </div>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl"
                style={{ background: 'linear-gradient(135deg, #7ef0a7 0%, #22c55e 45%, #86efac 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Persistent agent clones, wired like compute nodes
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-emerald-50/70">
              Each node is its own Claude profile with cloned context, memory, skills, sessions, and tools. Add to room, dispatch in parallel, steer per-agent.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatPill label="Workers" value={String(members.length)} tone="amber" />
            <StatPill label="Online"  value={`${onlineCount}/${members.length}`} tone="green" />
            <StatPill label="Sessions" value={compact(totalSessions)} />
            <StatPill label="Tokens"   value={compact(totalTokens)} />
          </div>
        </div>
      </div>

      {/* topology */}
      <div className="relative h-[640px] px-3 pb-6 sm:h-[700px]">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none">
          <defs>
            <filter id="glow-green">
              <feGaussianBlur stdDeviation="0.7" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {positions.map((pos, idx) => {
            const m = members[idx]
            if (!m) return null
            const status = getOnlineStatus(m)
            const inRoom = roomIds.includes(m.id)
            const isActive = inRoom || status === 'online'
            const stroke = inRoom
              ? 'rgba(34, 197, 94, 0.95)'
              : status === 'online'
                ? 'rgba(234, 179, 8, 0.65)'
                : 'rgba(92, 111, 98, 0.45)'
            const strokeWidth = inRoom ? 0.5 : 0.32
            const dasharray = isActive ? '1.8 1.4' : '1.5 1.5'
            const cx = `${pos.x}%`
            const cy = `${pos.y}%`
            const path = `M 50 47 Q 50 ${(47 + pos.y) / 2}, ${pos.x} ${pos.y}`
            return (
              <g key={m.id} filter={isActive ? 'url(#glow-green)' : undefined}>
                <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dasharray} opacity={isActive ? 0.92 : 0.45}>
                  {isActive ? <animate attributeName="stroke-dashoffset" from="0" to="-12" dur="1.4s" repeatCount="indefinite" /> : null}
                </path>
                {inRoom ? (
                  <circle r="0.55" fill="#34d399">
                    <animateMotion dur="2.2s" repeatCount="indefinite" path={path} />
                  </circle>
                ) : null}
                <circle cx={cx as unknown as number} cy={cy as unknown as number} r="0" />
              </g>
            )
          })}
        </svg>

        {/* center */}
        <div className="absolute left-1/2 top-[47%] z-20 -translate-x-1/2 -translate-y-1/2">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div className="absolute inset-0 -m-10 rounded-full bg-emerald-500/15 blur-3xl animate-pulse" />
            <div className="relative w-[260px] rounded-[28px] border border-emerald-400/50 bg-black/55 p-5 text-center shadow-[0_0_60px_rgba(34,197,94,0.25)] backdrop-blur-xl">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
                <HugeiconsIcon icon={CpuIcon} size={26} />
              </div>
              <div className="mt-3 text-[10px] uppercase tracking-[0.22em] text-emerald-300">Main orchestrator</div>
              <div className="mt-1 text-xl font-semibold text-white">Aurora</div>
              <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                {roomIds.length} workers wired
              </div>
              <div className="mt-3 text-[11px] leading-5 text-emerald-50/55">
                Decompose, route, review, steer. Workers keep their own context.
              </div>
            </div>
          </motion.div>
        </div>

        {/* nodes */}
        {positions.map((pos, idx) => {
          const m = members[idx]
          if (!m) return null
          const status = getOnlineStatus(m)
          const sel = m.id === selectedId
          const inRoom = roomIds.includes(m.id)
          const borderTone =
            sel ? 'border-emerald-400 shadow-[0_0_0_2px_rgba(34,197,94,0.25),0_0_36px_rgba(34,197,94,0.28)]' :
            inRoom ? 'border-emerald-400/70 shadow-[0_0_28px_rgba(34,197,94,0.18)]' :
            status === 'online' ? 'border-amber-400/40' :
            status === 'offline' ? 'border-red-500/40 opacity-70' :
            'border-emerald-400/15'
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.03 }}
              className="absolute z-30"
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <button
                type="button"
                onClick={() => onSelect(m.id)}
                className={cn(
                  'relative w-[160px] rounded-2xl border p-3 text-left backdrop-blur-xl transition-all',
                  'bg-gradient-to-b from-[rgba(24,32,27,0.95)] to-[rgba(16,22,18,0.95)] hover:-translate-y-[2px]',
                  borderTone,
                )}
              >
                {/* device chip */}
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'inline-block size-2 rounded-full',
                      status === 'online' && 'bg-emerald-400 shadow-[0_0_10px_rgba(34,197,94,0.7)]',
                      status === 'offline' && 'bg-red-400',
                      status === 'unknown' && 'bg-slate-500',
                    )} />
                    <div className="truncate text-sm font-bold text-white">{shortLabel(m)}</div>
                  </div>
                  {inRoom ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      In room
                    </span>
                  ) : null}
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-300/80">{roleLabel(m)}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-emerald-100/65">
                  <div className="rounded-md bg-white/[0.04] px-1.5 py-1"><span className="text-white">{m.sessionCount}</span> sess</div>
                  <div className="rounded-md bg-white/[0.04] px-1.5 py-1"><span className="text-white">{compact(m.totalTokens)}</span> tok</div>
                </div>
                <div className="mt-1.5 truncate text-[10px] text-emerald-100/45">{m.model}</div>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleRoom(m.id) }}
                className={cn(
                  'absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border shadow-lg transition-all',
                  inRoom ? 'border-emerald-200 bg-emerald-400 text-black hover:bg-emerald-300' : 'border-emerald-400/40 bg-black/80 text-emerald-300 hover:bg-emerald-500 hover:text-black',
                )}
                aria-label={inRoom ? 'Remove from room' : 'Add to room'}
              >
                <HugeiconsIcon icon={inRoom ? CheckmarkCircle02Icon : Add01Icon} size={13} />
              </button>
            </motion.div>
          )
        })}
      </div>

      {/* room strip */}
      <div className="relative border-t border-emerald-400/15 bg-black/30 px-5 py-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-50/70">
          <HugeiconsIcon icon={UserGroupIcon} size={14} className="text-emerald-300" />
          <span className="font-medium text-emerald-100">Active dispatch room</span>
          {roomIds.length === 0 ? (
            <span className="italic text-emerald-100/45">No agents selected. Hit + on worker nodes.</span>
          ) : (
            roomIds.map((id) => {
              const m = members.find((x) => x.id === id)
              if (!m) return null
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/12 px-2.5 py-1 text-emerald-200">
                  {m.displayName || m.id}
                  <button type="button" onClick={() => onToggleRoom(id)} className="text-emerald-100/80 hover:text-white" aria-label="Remove">
                    <HugeiconsIcon icon={Remove01Icon} size={11} />
                  </button>
                </span>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}
