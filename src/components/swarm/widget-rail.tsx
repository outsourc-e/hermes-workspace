'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Activity01Icon,
  AlertCircleIcon,
  CheckListIcon,
  ComputerTerminal01Icon,
  CpuIcon,
  Flag01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { ReactNode } from 'react'
import type { CrewMember } from '@/hooks/use-crew-status'
import { cn } from '@/lib/utils'
import { getOnlineStatus } from '@/hooks/use-crew-status'

type WidgetRailProps = {
  members: Array<CrewMember>
  roomIds: Array<string>
  selectedId: string | null
  onOpenMission: () => void
  onToggleRoom: (id: string) => void
}

type RuntimeEntry = {
  workerId: string
  pid: number | null
  startedAt: number | null
  lastOutputAt: number | null
  cwd: string | null
  currentTask: string | null
  tmuxSession: string | null
  tmuxAttachable: boolean
  recentLogTail: string | null
  lastSessionStartedAt: number | null
  source?: 'runtime.json' | 'fallback'
}

type HealthData = {
  workspaceModel: string | null
  claudeApiUrl: string | null
  workers: Array<{
    workerId: string
    recentAuthErrors: number
    model: string
    provider: string
  }>
  summary: {
    totalWorkers: number
    wrappersConfigured: number
    totalAuthErrors24h: number
    distinctModels: Array<string>
    distinctProviders: Array<string>
  }
}

async function fetchRuntime(): Promise<{ entries: Array<RuntimeEntry> }> {
  const res = await fetch('/api/swarm-runtime')
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}
async function fetchHealth(): Promise<HealthData> {
  const res = await fetch('/api/swarm-health')
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

function relative(ts: number | null): string {
  if (!ts) return 'never'
  const d = Date.now() - ts
  if (d < 60_000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

function compactText(value: string | null | undefined, max = 42): string {
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export function WidgetRail({
  members,
  roomIds,
  selectedId,
  onOpenMission,
  onToggleRoom,
}: WidgetRailProps) {
  const runtimeQuery = useQuery({
    queryKey: ['swarm', 'runtime'],
    queryFn: fetchRuntime,
    refetchInterval: 30_000,
  })
  const healthQuery = useQuery({
    queryKey: ['swarm', 'health'],
    queryFn: fetchHealth,
    refetchInterval: 60_000,
  })
  const onlineCount = members.filter(
    (m) => getOnlineStatus(m) === 'online',
  ).length
  const offlineCount = Math.max(0, members.length - onlineCount)
  const selectedRuntime =
    runtimeQuery.data?.entries.find((entry) => entry.workerId === selectedId) ??
    null
  const selectedMember = selectedId
    ? members.find((member) => member.id === selectedId)
    : null
  const authErrors = healthQuery.data?.summary.totalAuthErrors24h ?? 0
  const taskTotal = members.reduce((s, m) => s + m.assignedTaskCount, 0)
  const runtimeEntries = runtimeQuery.data?.entries ?? []

  const attentionItems = useMemo(() => {
    const items: Array<{ tone: 'warn' | 'good' | 'neutral'; text: string }> = []
    if (authErrors > 0) {
      items.push({ tone: 'warn', text: `${authErrors} auth errors in 24h` })
    }
    if (offlineCount > 0) {
      items.push({ tone: 'warn', text: `${offlineCount} workers not online` })
    }
    if (roomIds.length === 0) {
      items.push({ tone: 'neutral', text: 'No active room selected' })
    }
    if (runtimeQuery.isError) {
      items.push({ tone: 'warn', text: 'Runtime API unavailable' })
    }
    if (items.length === 0) {
      items.push({ tone: 'good', text: 'No attention items' })
    }
    return items
  }, [authErrors, offlineCount, roomIds.length, runtimeQuery.isError])

  return (
    <aside className="flex w-full flex-col gap-2.5 xl:sticky xl:top-20 xl:self-start">
      <RailPanel
        icon={AlertCircleIcon}
        eyebrow="Attention"
        title={attentionItems[0]?.text ?? 'No attention items'}
        hot={attentionItems.some((item) => item.tone === 'warn')}
      >
        <div className="space-y-1.5">
          {attentionItems.map((item) => (
            <div
              key={item.text}
              className={cn(
                'rounded-xl border px-2.5 py-2 text-xs',
                item.tone === 'warn'
                  ? 'border-amber-400/25 bg-amber-500/10 text-amber-100'
                  : item.tone === 'good'
                    ? 'border-emerald-400/22 bg-emerald-500/10 text-emerald-100'
                    : 'border-emerald-400/12 bg-white/[0.025] text-emerald-100/62',
              )}
            >
              {item.text}
            </div>
          ))}
        </div>
      </RailPanel>

      <RailPanel
        icon={UserGroupIcon}
        eyebrow="Room"
        title={`${roomIds.length}/${members.length} wired`}
        action={
          <button
            type="button"
            onClick={onOpenMission}
            className="rounded-full bg-emerald-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black hover:bg-emerald-300"
          >
            Dispatch
          </button>
        }
      >
        {roomIds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-400/18 px-3 py-3 text-xs text-emerald-100/45">
            Add workers from the topology strip or cards. Room state controls
            router chat and multi-terminal view.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {roomIds.map((id) => {
              const m = members.find((x) => x.id === id)
              if (!m) return null
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-100"
                >
                  {m.displayName || m.id}
                  <button
                    type="button"
                    onClick={() => onToggleRoom(id)}
                    className="text-emerald-200/70 hover:text-white"
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        )}
      </RailPanel>

      <RailPanel
        icon={ComputerTerminal01Icon}
        eyebrow="Selected runtime"
        title={
          selectedId
            ? compactText(
                selectedRuntime?.currentTask ??
                  selectedMember?.lastSessionTitle ??
                  `${selectedId} ready`,
              )
            : 'No worker selected'
        }
      >
        {selectedId ? (
          <div className="space-y-1.5">
            <Stat
              label="Mode"
              value={
                selectedRuntime?.tmuxAttachable
                  ? 'tmux attachable'
                  : 'secondary'
              }
            />
            <Stat
              label="Output"
              value={relative(selectedRuntime?.lastOutputAt ?? null)}
            />
            <Stat
              label="PID"
              value={
                selectedRuntime?.pid != null ? String(selectedRuntime.pid) : '—'
              }
            />
            <Stat label="cwd" value={compactText(selectedRuntime?.cwd, 34)} />
          </div>
        ) : (
          <div className="text-xs text-emerald-100/45">
            Select a card for runtime metadata. Open Runtime only when you need
            a live shell.
          </div>
        )}
      </RailPanel>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat
          icon={Activity01Icon}
          label="Online"
          value={`${onlineCount}/${members.length}`}
        />
        <MiniStat
          icon={CheckListIcon}
          label="Tasks"
          value={String(taskTotal)}
        />
        <MiniStat
          icon={CpuIcon}
          label="Runtime"
          value={String(runtimeEntries.length)}
        />
      </div>

      <RailPanel
        icon={Flag01Icon}
        eyebrow="Latest activity"
        title={compactText(
          members
            .filter((member) => member.lastSessionTitle)
            .sort((a, b) => (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0))[0]
            ?.lastSessionTitle,
          44,
        )}
        quiet
      >
        <ul className="space-y-1.5">
          {members
            .filter((m) => m.lastSessionTitle)
            .sort((a, b) => (b.lastSessionAt ?? 0) - (a.lastSessionAt ?? 0))
            .slice(0, 4)
            .map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate text-emerald-100">{m.id}</div>
                  <div className="truncate text-[10px] text-emerald-200/45">
                    {m.lastSessionTitle}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-emerald-200/45">
                  {relative(m.lastSessionAt ?? null)}
                </span>
              </li>
            ))}
        </ul>
      </RailPanel>
    </aside>
  )
}

function RailPanel({
  icon,
  eyebrow,
  title,
  children,
  action,
  hot = false,
  quiet = false,
}: {
  icon: typeof CpuIcon
  eyebrow: string
  title: ReactNode
  children: ReactNode
  action?: ReactNode
  hot?: boolean
  quiet?: boolean
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border bg-gradient-to-b backdrop-blur transition-colors',
        hot
          ? 'border-amber-400/30 from-amber-500/10 to-[#12100b]/92'
          : quiet
            ? 'border-emerald-400/10 from-[#111712]/70 to-[#0c110e]/75'
            : 'border-emerald-400/14 from-[#151b16]/88 to-[#0d120f]/88',
      )}
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={cn(
              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg border',
              hot
                ? 'border-amber-400/28 bg-amber-500/12 text-amber-200'
                : 'border-emerald-400/20 bg-emerald-500/8 text-emerald-300',
            )}
          >
            <HugeiconsIcon icon={icon} size={12} />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/45">
              {eyebrow}
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs font-semibold text-white/90">
              {title}
            </div>
          </div>
        </div>
        {action}
      </div>
      <div className="border-t border-emerald-400/8 px-3 py-3">{children}</div>
    </section>
  )
}

function MiniStat({
  icon,
  label,
  value,
}: {
  icon: typeof CpuIcon
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-emerald-400/10 bg-white/[0.025] px-2.5 py-2 text-center">
      <HugeiconsIcon
        icon={icon}
        size={12}
        className="mx-auto text-emerald-300/70"
      />
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
      <div className="text-[9px] uppercase tracking-[0.16em] text-emerald-200/38">
        {label}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-100/62">
      <span className="text-emerald-200/45">{label}</span>
      <span className="truncate text-right text-emerald-50/85">{value}</span>
    </div>
  )
}
