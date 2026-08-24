/**
 * Worker status line — one row of the WORKERS rail.
 *
 * dot (state) + name (flex-1) + detail (right). The dot's SHAPE carries meaning
 * as well as its colour: blocked is the only square dot, so "waiting on a human"
 * is distinguishable without relying on hue alone.
 *
 * Token discipline: no raw colour, size, or px value in this file.
 */
/*
 * NOTE: these components use `clsx` directly rather than the repo's `cn()`
 * helper. `cn()` runs tailwind-merge, which does not know the `jv-*` scale and
 * classifies `text-jv-3xs` (a font size) into the same conflict group as
 * `text-jv-verified` (a colour) — so the size gets silently dropped whenever a
 * colour appears alongside it. No class set below relies on conflict
 * resolution, so plain `clsx` is both correct and lossless here.
 */
import { clsx } from 'clsx'
import type { WorkerStatus, WorkerStatusLineProps } from './types'

interface StatusTokens {
  /** Dot fill + shape. Blocked is square; everything else is round. */
  dot: string
  /** Row tint — only the states that need your attention get one. */
  row: string
  name: string
  detail: string
  /** Detail text shown when the caller supplies none. */
  fallbackDetail?: string
}

const STATUSES: Record<WorkerStatus, StatusTokens> = {
  running: {
    dot: 'rounded-jv-full bg-jv-live animate-jv-pulse',
    row: 'bg-jv-surface-3',
    name: 'text-jv-text',
    detail: 'text-jv-live',
  },
  blocked: {
    // Square, deliberately: shape + hue, not hue alone.
    dot: 'bg-jv-blocked',
    row: 'bg-jv-blocked-bg-row',
    name: 'text-jv-text',
    detail: 'text-jv-blocked font-semibold tracking-jv-label',
    fallbackDetail: 'BLOCKED',
  },
  idle: {
    dot: 'rounded-jv-full bg-jv-dot-idle',
    row: '',
    name: 'text-jv-text-dim-2',
    detail: 'text-jv-label-faint',
  },
  queued: {
    dot: 'rounded-jv-full bg-jv-dot-idle',
    row: '',
    name: 'text-jv-text-dim-2',
    detail: 'text-jv-label-faint',
  },
  stale: {
    // Muted dot, red detail: silent long enough that it is a problem.
    dot: 'rounded-jv-full bg-jv-dot-idle',
    row: '',
    name: 'text-jv-text-dim-2',
    detail: 'text-jv-failed-muted',
  },
  failed: {
    dot: 'rounded-jv-full bg-jv-failed',
    row: 'bg-jv-failed-bg-row',
    name: 'text-jv-text',
    detail: 'text-jv-failed-text',
  },
  complete: {
    dot: 'rounded-jv-full bg-jv-verified',
    row: '',
    name: 'text-jv-text-dim-2',
    detail: 'text-jv-verified',
  },
}

export function WorkerStatusLine({
  name,
  status,
  detail,
}: WorkerStatusLineProps) {
  const tokens = STATUSES[status]
  const detailText = detail ?? tokens.fallbackDetail

  return (
    <div
      data-jv-worker-status={status}
      className={clsx(
        'flex items-center gap-jv-8 px-jv-14 py-jv-6 border-t border-jv-line-soft',
        tokens.row,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx('w-jv-5 h-jv-5 flex-none', tokens.dot)}
      />
      <span
        className={clsx(
          'flex-1 font-jv-mono text-jv-md leading-jv-none font-medium',
          tokens.name,
        )}
      >
        {name}
      </span>
      {detailText ? (
        <span
          className={clsx(
            'font-jv-mono text-jv-xs leading-jv-none',
            tokens.detail,
          )}
        >
          {detailText}
        </span>
      ) : null}
    </div>
  )
}
