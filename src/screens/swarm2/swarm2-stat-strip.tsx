'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertCircleIcon,
  CheckListIcon,
  CpuIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export type Swarm2StatStripProps = {
  activeRuntimeCount: number
  roomCount: number
  authErrors: number
  taskTotal: number
  focusLabel?: string | null
  workspaceModel?: string | null
  latestActivity: string | null
}

type StatTone = 'neutral' | 'good' | 'warn'

function tone(value: number, kind: 'errors' | 'wired'): StatTone {
  if (kind === 'errors') return value > 0 ? 'warn' : 'neutral'
  if (kind === 'wired') return value > 0 ? 'good' : 'neutral'
  return 'neutral'
}

function StatChip({
  icon,
  label,
  value,
  variant = 'neutral',
}: {
  icon: typeof CpuIcon
  label: string
  value: string
  variant?: StatTone
}) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-[12px]',
        variant === 'warn'
          ? 'border-[var(--theme-warning-border)] bg-[var(--theme-warning-soft)] text-[var(--theme-text)]'
          : variant === 'good'
            ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] text-[var(--theme-text)]'
            : 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)]',
      )}
    >
      <HugeiconsIcon icon={icon} size={12} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">
        {label}
      </span>
      <span className="font-medium text-[var(--theme-text)]">{value}</span>
    </div>
  )
}

export function Swarm2StatStrip({
  activeRuntimeCount,
  roomCount,
  authErrors,
  taskTotal,
  focusLabel,
  workspaceModel,
  latestActivity,
}: Swarm2StatStripProps) {
  return (
    <section className="flex flex-1 flex-wrap items-center gap-2 px-1 py-1">
      <StatChip
        icon={CpuIcon}
        label="Runtime"
        value={`${activeRuntimeCount} active`}
        variant={activeRuntimeCount > 0 ? 'good' : 'neutral'}
      />
      {roomCount > 0 ? (
        <StatChip
          icon={UserGroupIcon}
          label="Wired"
          value={`${roomCount}`}
          variant={tone(roomCount, 'wired')}
        />
      ) : null}
      {authErrors > 0 ? (
        <StatChip
          icon={AlertCircleIcon}
          label="Auth"
          value={`${authErrors} errors`}
          variant={tone(authErrors, 'errors')}
        />
      ) : null}
      {taskTotal > 0 ? (
        <StatChip
          icon={CheckListIcon}
          label="Tasks"
          value={`${taskTotal}`}
        />
      ) : null}
      {workspaceModel && workspaceModel !== 'unknown' ? (
        <StatChip
          icon={CpuIcon}
          label="Model"
          value={workspaceModel}
        />
      ) : null}
    </section>
  )
}
