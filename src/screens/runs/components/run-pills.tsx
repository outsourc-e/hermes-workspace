import { ownershipLabel, providerLabel, stateLabel } from '../runs-format'
import type { ReactNode } from 'react'

import type { RuntimeRunCapability, RuntimeRunOwnership, RuntimeRunState } from '@/server/runtime-run-projection'
import { cn } from '@/lib/utils'


const PILL = 'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'

export function Pill({ className, children, title }: { className?: string; children: ReactNode; title?: string }) {
  return <span className={cn(PILL, className)} title={title}>{children}</span>
}

const STATE_STYLES: Record<RuntimeRunState, string> = {
  active: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  idle: 'border-primary-300 bg-primary-100 text-primary-700',
  stopped: 'border-primary-300 bg-primary-50 text-primary-600',
  attention: 'border-amber-300 bg-amber-50 text-amber-800',
}

const STATE_HINTS: Record<RuntimeRunState, string> = {
  active: 'The provider host reports this runtime as running.',
  idle: 'Discovered and resumable; no host process is running.',
  stopped: 'The host process has exited.',
  attention: 'Host or writer-lease state could not be verified.',
}

export function StatePill({ state }: { state: RuntimeRunState }) {
  return (
    <Pill className={STATE_STYLES[state]} title={STATE_HINTS[state]}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', state === 'active' ? 'bg-emerald-500' : state === 'attention' ? 'bg-amber-500' : 'bg-primary-400')} />
      {stateLabel(state)}
    </Pill>
  )
}

export function ProviderPill({ provider }: { provider: string }) {
  return <Pill className="border-primary-200 bg-primary-50 text-primary-700">{providerLabel(provider)}</Pill>
}

export function OwnershipPill({ ownership }: { ownership: RuntimeRunOwnership }) {
  const tone = ownership.state === 'owned'
    ? 'border-sky-300 bg-sky-50 text-sky-800'
    : ownership.state === 'recoverable'
      ? 'border-amber-300 bg-amber-50 text-amber-800'
      : ownership.state === 'unknown'
        ? 'border-primary-300 bg-primary-100 text-primary-700'
        : 'border-primary-200 bg-primary-50 text-primary-600'
  return (
    <Pill className={tone} title={ownership.owner ? `Writer lease held by ${ownership.owner}` : 'No writer lease is held for this runtime'}>
      {ownershipLabel(ownership.state)}
    </Pill>
  )
}

const CAPABILITY_STYLES: Record<string, string> = {
  supported: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  degraded: 'border-amber-300 bg-amber-50 text-amber-800',
  experimental: 'border-sky-300 bg-sky-50 text-sky-800',
  unsupported: 'border-primary-300 bg-primary-100 text-primary-600',
}

export function CapabilityPill({ state }: { state: RuntimeRunCapability['state'] }) {
  return <Pill className={CAPABILITY_STYLES[state] ?? CAPABILITY_STYLES.unsupported}>{state}</Pill>
}

export function KanbanPill({ linked, taskId }: { linked: boolean; taskId: string | null }) {
  return linked && taskId
    ? <Pill className="border-primary-300 bg-primary-100 text-primary-800" title="Kanban remains authoritative; runtime linkage is metadata only.">{taskId}</Pill>
    : <Pill className="border-dashed border-primary-300 bg-transparent text-primary-500">Unlinked</Pill>
}
