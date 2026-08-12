import type { NodeState } from '@/server/mission-coordinator/types'

export function classNames(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(' ')
}

const STATES: Record<
  NodeState,
  { label: string; color: string; bg: string; border: string }
> = {
  blocked_by_dependency: {
    label: 'waiting',
    color: 'text-[var(--cc-state-muted)]',
    bg: 'bg-[var(--cc-state-muted-bg)]',
    border: 'border-[var(--cc-state-muted-border)]',
  },
  ready: {
    label: 'ready',
    color: 'text-[var(--cc-state-accent)]',
    bg: 'bg-[var(--cc-state-accent-bg)]',
    border: 'border-[var(--cc-state-accent-border)]',
  },
  leased: {
    label: 'leased',
    color: 'text-[var(--cc-state-info)]',
    bg: 'bg-[var(--cc-state-info-bg)]',
    border: 'border-[var(--cc-state-info-border)]',
  },
  dispatched: {
    label: 'dispatched',
    color: 'text-[var(--cc-state-info)]',
    bg: 'bg-[var(--cc-state-info-bg)]',
    border: 'border-[var(--cc-state-info-border)]',
  },
  running: {
    label: 'running',
    color: 'text-[var(--cc-state-accent)]',
    bg: 'bg-[var(--cc-state-accent-bg)]',
    border: 'border-[var(--cc-state-accent-border)]',
  },
  verifying: {
    label: 'verifying',
    color: 'text-[var(--cc-state-accent)]',
    bg: 'bg-[var(--cc-state-accent-bg)]',
    border: 'border-[var(--cc-state-accent-border)]',
  },
  review: {
    label: 'review',
    color: 'text-[var(--cc-state-review)]',
    bg: 'bg-[var(--cc-state-review-bg)]',
    border: 'border-[var(--cc-state-review-border)]',
  },
  done: {
    label: 'done',
    color: 'text-[var(--cc-state-success)]',
    bg: 'bg-[var(--cc-state-success-bg)]',
    border: 'border-[var(--cc-state-success-border)]',
  },
  blocked: {
    label: 'blocked',
    color: 'text-[var(--cc-state-danger)]',
    bg: 'bg-[var(--cc-state-danger-bg)]',
    border: 'border-[var(--cc-state-danger-border)]',
  },
  needs_input: {
    label: 'needs input',
    color: 'text-[var(--cc-state-warning)]',
    bg: 'bg-[var(--cc-state-warning-bg)]',
    border: 'border-[var(--cc-state-warning-border)]',
  },
  retry_wait: {
    label: 'retry',
    color: 'text-[var(--cc-state-warning)]',
    bg: 'bg-[var(--cc-state-warning-bg)]',
    border: 'border-[var(--cc-state-warning-border)]',
  },
  failed: {
    label: 'failed',
    color: 'text-[var(--cc-state-danger)]',
    bg: 'bg-[var(--cc-state-danger-bg)]',
    border: 'border-[var(--cc-state-danger-border)]',
  },
  cancelled: {
    label: 'cancelled',
    color: 'text-[var(--cc-state-muted)]',
    bg: 'bg-[var(--cc-state-muted-bg)]',
    border: 'border-[var(--cc-state-muted-border)]',
  },
}

export function NodeStateBadge({ state }: { state: NodeState }) {
  const style = STATES[state]
  return (
    <span
      className={classNames(
        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        style.bg,
        style.color,
        style.border,
      )}
    >
      {state.replaceAll('_', ' ')}
    </span>
  )
}

export function Action({
  children,
  onClick,
  accent = false,
  danger = false,
  warning = false,
  disabled = false,
}: {
  children: React.ReactNode
  onClick: () => void
  accent?: boolean
  danger?: boolean
  warning?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={classNames(
        'rounded-lg border px-3 py-2 text-xs font-medium transition hover:scale-[1.03] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100',
        accent
          ? 'border-[var(--cc-action-accent-border)] bg-[var(--cc-action-accent-bg)] text-[var(--cc-action-accent)] hover:bg-[var(--cc-action-accent-bg-hover)] hover:shadow-sm hover:shadow-[var(--cc-action-accent-glow)]'
          : danger
            ? 'border-[var(--cc-action-danger-border)] bg-[var(--cc-action-danger-bg)] text-[var(--cc-action-danger)] hover:bg-[var(--cc-action-danger-bg-hover)] hover:shadow-sm hover:shadow-[var(--cc-action-danger-glow)]'
            : warning
              ? 'border-[var(--cc-action-warning-border)] bg-[var(--cc-action-warning-bg)] text-[var(--cc-action-warning)] hover:bg-[var(--cc-action-warning-bg-hover)] hover:shadow-sm hover:shadow-[var(--cc-action-warning-glow)]'
              : 'border-primary-200 bg-primary-50 text-primary-800 hover:border-accent-500 hover:shadow-sm',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-primary-50 p-3 text-center transition hover:bg-primary-100/60">
      <strong className="block text-lg font-bold tabular-nums text-ink">
        {value}
      </strong>
      <span className="text-[11px] text-primary-600">{label}</span>
    </div>
  )
}

export function PanelMessage({
  title,
  body,
  error = false,
}: {
  title: string
  body: string
  error?: boolean
}) {
  return (
    <div
      className={classNames(
        'cc-fade-in rounded-2xl border p-6',
        error
          ? 'border-[var(--cc-message-error-border)] bg-[var(--cc-message-error-bg)]'
          : 'border-dashed border-primary-300 bg-primary-50/30',
      )}
    >
      <h3
        className={classNames(
          'font-semibold',
          error ? 'text-[var(--cc-message-error-text)]' : 'text-ink',
        )}
      >
        {title}
      </h3>
      <p
        className={classNames(
          'mt-2 text-sm leading-6',
          error ? 'text-[var(--cc-message-error-text)]' : 'text-primary-600',
        )}
      >
        {body}
      </p>
    </div>
  )
}

export function Toast({
  message,
  kind,
}: {
  message: string
  kind: 'success' | 'error'
}) {
  return (
    <div
      className={classNames(
        'cc-toast-enter rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm',
        kind === 'error'
          ? 'border-[var(--cc-toast-error-border)] bg-[var(--cc-toast-error-bg)] text-[var(--cc-toast-error-text)]'
          : 'border-[var(--cc-toast-success-border)] bg-[var(--cc-toast-success-bg)] text-[var(--cc-toast-success-text)]',
      )}
    >
      {message}
    </div>
  )
}

export const STATE_MAP = STATES
