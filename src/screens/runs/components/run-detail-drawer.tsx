import {   useCallback, useEffect, useRef, useState } from 'react'
import { EM_DASH, formatAge, formatTimestamp, ownershipLabel, providerLabel, stateLabel } from '../runs-format'
import { CapabilityPill, KanbanPill, OwnershipPill, ProviderPill, StatePill } from './run-pills'
import type {KeyboardEvent, ReactNode} from 'react';

import type { RuntimeRun, RuntimeRunCapability } from '@/server/runtime-run-projection'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'


const TITLE_ID = 'run-detail-title'
const NO_ROUTE = 'No assignable subscription route is recorded for this run, so the control plane cannot address a provider for it.'
const NEEDS_LEASE = 'Only an abandoned writer lease can be recovered.'

/**
 * Operations offered as buttons. Everything else in the capability matrix is
 * reported but not invokable from here — the control plane has no
 * metadata-only channel for it.
 */
const ACTIONS = [
  { operation: 'resume', label: 'Resume', destructive: false },
  { operation: 'fork', label: 'Fork', destructive: false },
  { operation: 'steer', label: 'Steer', destructive: false },
  { operation: 'interrupt', label: 'Interrupt', destructive: true },
  { operation: 'archive', label: 'Archive', destructive: true },
] as const

const CONFIRMS: Partial<Record<string, string>> = {
  interrupt: 'Interrupt the active turn on this runtime?',
  archive: 'Archive this runtime? The provider may drop its resumable identity.',
}

type Props = {
  run: RuntimeRun
  availableRoutes: Array<{ id: string; account: string; model: string; status: string }>
  onClose: () => void
  onAction: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error: string | null }>
}

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-primary-500">{label}</dt>
      <dd className={cn('mt-0.5 break-words text-sm text-primary-900', mono && 'font-mono text-xs')}>{children}</dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-primary-200 px-4 py-3 first:border-t-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-500">{title}</h3>
      {children}
    </section>
  )
}

/** Why an action is unavailable, phrased from what the projection actually knows. */
function blockedReason(run: RuntimeRun, capability: RuntimeRunCapability | undefined, routeRef: string, operation: string, followUp: string): string | null {
  if (!capability || !capability.invokable) return capability?.explanation ?? 'Not exposed by this runtime adapter.'
  if (!routeRef) return NO_ROUTE
  if (run.provider === 'claude' && (operation === 'resume' || operation === 'fork') && !followUp.trim()) return 'Claude resume requires bounded follow-up text.'
  return null
}

export function RunDetailDrawer({ run, availableRoutes, onClose, onAction }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [routeRef, setRouteRef] = useState(run.route ?? '')
  const [followUp, setFollowUp] = useState('')
  const [kanbanTaskId, setKanbanTaskId] = useState(run.kanbanTaskId ?? '')

  useEffect(() => {
    setRouteRef(run.route ?? '')
    setFollowUp('')
    setKanbanTaskId(run.kanbanTaskId ?? '')
  }, [run.id, run.route, run.kanbanTaskId])

  // Focus moves into the drawer on open and returns to whatever opened it.
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => { restoreTo?.focus() }
  }, [])

  // Keyboard focus is not enough for screen-reader browse mode: isolate every
  // background sibling branch up to <body> while keeping the dialog and its
  // clickable, aria-hidden backdrop active. Restore pre-existing states exactly.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const states: Array<{ element: HTMLElement; inert: boolean; inertAttribute: string | null; ariaHidden: string | null }> = []
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      const parent = branch.parentElement
      for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.hasAttribute('data-runs-dialog-backdrop')) continue
        states.push({
          element: sibling,
          inert: sibling.inert,
          inertAttribute: sibling.getAttribute('inert'),
          ariaHidden: sibling.getAttribute('aria-hidden'),
        })
        sibling.inert = true
        sibling.setAttribute('inert', '')
        sibling.setAttribute('aria-hidden', 'true')
      }
      if (parent === document.body) break
      branch = parent
    }
    return () => {
      for (const state of states.reverse()) {
        state.element.inert = state.inert
        if (state.inertAttribute === null) state.element.removeAttribute('inert')
        else state.element.setAttribute('inert', state.inertAttribute)
        if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden')
        else state.element.setAttribute('aria-hidden', state.ariaHidden)
      }
    }
  }, [])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [],
    )
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
  }, [onClose])

  const dispatch = useCallback(async (operation: string, payload: Record<string, unknown>) => {
    const confirmation = CONFIRMS[operation]
    if (confirmation && typeof window !== 'undefined' && !window.confirm(confirmation)) return
    setBusy(operation)
    setActionError(null)
    setActionNotice(null)
    const result = await onAction(payload)
    setBusy(null)
    if (result.ok) setActionNotice(`${operation} accepted by the control plane.`)
    else setActionError(result.error ?? 'Runtime action was rejected.')
  }, [onAction])

  const leaseRecoverable = run.ownership.state === 'recoverable'
  const routeOptions = availableRoutes.filter((route) => (
    route.status === 'available' && route.account === run.accountKey && (!run.route || route.id === run.route)
  ))
  const eligibleRouteRef = routeOptions.some((route) => route.id === routeRef) ? routeRef : ''

  return (
    <>
      <div data-runs-dialog-backdrop className="fixed inset-0 z-40 bg-primary-950/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col overflow-y-auto border-l border-primary-200 bg-primary-50 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-primary-200 bg-primary-50 px-4 py-3">
          <div className="min-w-0">
            <h2 id={TITLE_ID} className="truncate text-base font-semibold text-primary-900">{run.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <ProviderPill provider={run.provider} />
              <StatePill state={run.state} />
              <OwnershipPill ownership={run.ownership} />
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'shrink-0')}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {actionError ? (
          <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
        ) : null}
        {actionNotice ? (
          <p role="status" className="mx-4 mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{actionNotice}</p>
        ) : null}

        <Group title="Identity">
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Runtime ID" mono>{run.id}</Field>
            <Field label="Provider native ID" mono>{run.nativeId || EM_DASH}</Field>
            <Field label="Short ID" mono>{run.shortId || EM_DASH}</Field>
            <Field label="Runtime kind">{run.runtimeKind}</Field>
            <Field label="Provider">{providerLabel(run.provider)}</Field>
            <Field label="Host">{run.hostKind}</Field>
            <Field label="State">{stateLabel(run.state)}</Field>
            <Field label="Source">{run.source}</Field>
            {run.parentRuntimeId ? <Field label="Forked from" mono>{run.parentRuntimeId}</Field> : null}
          </dl>
        </Group>

        <Group title="Model and route">
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Account">{run.account || EM_DASH}</Field>
            <Field label="Model">{run.model || EM_DASH}</Field>
            <Field label="Recorded route" mono>{run.route || EM_DASH}</Field>
          </dl>
          <label className="mt-3 block text-[11px] font-medium uppercase tracking-wide text-primary-500" htmlFor="run-route-ref">Subscription route</label>
          <select id="run-route-ref" className="mt-1 h-9 w-full rounded-lg border border-primary-200 bg-primary-50 px-2.5 text-sm" value={eligibleRouteRef} onChange={(event) => setRouteRef(event.target.value)}>
            <option value="">Select a subscription-included route</option>
            {routeOptions.map((route) => <option key={route.id} value={route.id}>{route.id}</option>)}
          </select>
          {!eligibleRouteRef ? <p className="mt-2 text-xs text-primary-500">{NO_ROUTE}</p> : null}
        </Group>

        <Group title="Workspace">
          <dl className="mt-2 grid gap-3">
            <Field label="Project">{run.project || EM_DASH}</Field>
            <Field label="Worktree" mono>{run.worktree || EM_DASH}</Field>
            <Field label="Working directory" mono>{run.cwd || EM_DASH}</Field>
          </dl>
        </Group>

        <Group title="Kanban">
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <KanbanPill linked={run.linked} taskId={run.kanbanTaskId} />
            <p className="text-xs text-primary-600">Kanban task state stays authoritative; runtime linkage is metadata only.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input aria-label="Kanban task ID" className="h-9 min-w-0 flex-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 text-sm" maxLength={64} value={kanbanTaskId} onChange={(event) => setKanbanTaskId(event.target.value)} placeholder="Task ID" />
            <button type="button" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))} disabled={!kanbanTaskId.trim() || busy !== null} onClick={() => void dispatch('link_kanban', { action: 'link_kanban', runtimeId: run.id, kanbanTaskId: kanbanTaskId.trim() })}>Link Kanban</button>
            {run.linked ? <button type="button" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))} disabled={busy !== null} onClick={() => void dispatch('link_kanban', { action: 'link_kanban', runtimeId: run.id, kanbanTaskId: null })}>Unlink</button> : null}
          </div>
        </Group>

        <Group title="Ownership">
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Writer lease">{ownershipLabel(run.ownership.state)}</Field>
            <Field label="Owner">{run.ownership.owner || EM_DASH}</Field>
            <Field label="Lease expires">{formatTimestamp(run.ownership.expiresAt)}</Field>
            <Field label="Abandoned">{run.ownership.abandoned ? 'Yes' : 'No'}</Field>
            <Field label="Created">{formatTimestamp(run.createdAt)}</Field>
            <Field label="Updated">{`${formatAge(run.stalenessMs)} · ${formatTimestamp(run.updatedAt)}`}</Field>
          </dl>
          <div className="mt-3">
            <button
              type="button"
              className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
              disabled={!leaseRecoverable || busy !== null}
              aria-describedby={leaseRecoverable ? undefined : 'run-action-help-recover-lease'}
              onClick={() => void dispatch('recover-lease', { action: 'recover-lease', runtimeId: run.id })}
            >
              Recover lease
            </button>
            {!leaseRecoverable ? (
              <p id="run-action-help-recover-lease" className="mt-1 text-xs text-primary-500">{NEEDS_LEASE}</p>
            ) : null}
          </div>
        </Group>

        <Group title="Actions">
          <p className="mt-1 text-xs text-primary-500">
            Actions use this run&apos;s recorded identity. Follow-up text is sent only in the action POST body; it is never stored or written to the URL.
          </p>
          {run.provider === 'claude' ? (
            <label className="mt-3 block text-xs font-medium text-primary-700">
              Follow-up text
              <textarea aria-label="Follow-up text" className="mt-1 min-h-20 w-full rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-2 text-sm" maxLength={32_000} value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Required for Claude resume" />
            </label>
          ) : null}
          <ul className="mt-3 space-y-3">
            {ACTIONS.map((action) => {
              const capability = run.capabilities[action.operation]
              const reason = blockedReason(run, capability, eligibleRouteRef, action.operation, followUp)
              const helpId = `run-action-help-${action.operation}`
              return (
                <li key={action.operation} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(buttonVariants({ variant: action.destructive ? 'outline' : 'secondary', size: 'sm' }), 'min-w-[104px]')}
                      disabled={reason !== null || busy !== null}
                      aria-describedby={reason ? helpId : undefined}
                      onClick={() => void dispatch(action.operation, {
                        action: action.operation,
                        runtimeId: run.id,
                        accountAlias: run.accountKey,
                        routeRef: eligibleRouteRef,
                        cwd: run.cwd,
                        worktree: run.worktree,
                        ...(followUp.trim() ? { prompt: followUp.trim() } : {}),
                      })}
                    >{action.label}</button>
                    <CapabilityPill state={capability.state} />
                    {capability.deferred ? <span className="text-xs text-primary-500">deferred</span> : null}
                  </div>
                  {reason ? <p id={helpId} className="text-xs text-primary-500">{reason}</p> : null}
                </li>
              )
            })}
          </ul>
        </Group>

        <Group title="Capability matrix">
          <dl className="mt-2 space-y-2">
            {Object.entries(run.capabilities).map(([operation, capability]) => (
              <div key={operation} className="flex flex-wrap items-baseline gap-2">
                <dt className="text-sm font-medium text-primary-900">{operation}</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <CapabilityPill state={capability.state} />
                  <span className="text-xs text-primary-600">{capability.explanation}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Group>
      </div>
    </>
  )
}
