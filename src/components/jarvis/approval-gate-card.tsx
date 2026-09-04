/**
 * Approval gate card — the honest gate.
 *
 * What makes it honest is the two-cell panel: BLAST RADIUS (what this does to
 * the world) and UNDO PATH (what you can actually take back), stated before the
 * buttons rather than after. Neither has a source in today's backend — see
 * `docs/design/jarvis-ui-mapping.md` §3.2 — so both arrive as props and this
 * component never invents them.
 *
 * The buttons are presentational: they call `onAction` if one is supplied and
 * do nothing otherwise. No approval is resolved here. `hint` prints a keyboard
 * affordance after them while pending — text only, this card binds no keys.
 *
 * `cellLabels` shortens the two headings for narrow boards (RADIUS / UNDO).
 * Both it and `hint` are optional and default to the desktop rendering, so a
 * caller that passes neither draws exactly what it drew before they existed.
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
import type { ApprovalGateCardProps, ApprovalGateState } from './types'

interface GateTokens {
  /** 2px rule across the top — the card's loudest signal. */
  rule: string
  frame: string
  label: string
  labelColor: string
  sublabel: string
  /** Hairline between the label and the sublabel. */
  divider: string
  /** Gutter behind the blast/undo grid (shows through the 1px gap). */
  gutter: string
  cell: string
  cellLabel: string
}

const GATES: Record<ApprovalGateState, GateTokens> = {
  pending: {
    rule: 'bg-jv-blocked',
    frame: 'border-jv-blocked-line bg-jv-blocked-bg',
    label: 'APPROVAL REQUIRED',
    labelColor: 'text-jv-blocked',
    sublabel: 'text-jv-blocked-dim',
    divider: 'bg-jv-blocked-divider',
    gutter: 'bg-jv-blocked-line-soft border-jv-blocked-line-soft',
    cell: 'bg-jv-blocked-bg-2',
    cellLabel: 'text-jv-blocked-dim',
  },
  approved: {
    rule: 'bg-jv-verified',
    frame: 'border-jv-verified-line bg-jv-verified-bg-2',
    label: 'APPROVED',
    labelColor: 'text-jv-verified',
    sublabel: 'text-jv-label',
    divider: 'bg-jv-border',
    gutter: 'bg-jv-line border-jv-line',
    cell: 'bg-jv-surface-2',
    cellLabel: 'text-jv-label',
  },
  rejected: {
    rule: 'bg-jv-failed',
    frame: 'border-jv-failed-line bg-jv-failed-bg',
    label: 'REJECTED',
    labelColor: 'text-jv-failed',
    sublabel: 'text-jv-label',
    divider: 'bg-jv-border',
    gutter: 'bg-jv-line border-jv-line',
    cell: 'bg-jv-surface-2',
    cellLabel: 'text-jv-label',
  },
}

const CELL_LABEL_CLASS =
  'font-jv-mono text-jv-3xs leading-jv-none font-semibold tracking-jv-wider-2'

/** Full headings. Narrow boards override them; nothing else does. */
const DEFAULT_BLAST_RADIUS_LABEL = 'BLAST RADIUS'
const DEFAULT_UNDO_PATH_LABEL = 'UNDO PATH'

export function ApprovalGateCard({
  title,
  command,
  subtitle,
  waiting,
  blastRadius,
  undoPath,
  cellLabels,
  caveat,
  actions,
  hint,
  state = 'pending',
  onAction,
}: ApprovalGateCardProps) {
  const tokens = GATES[state]
  const pending = state === 'pending'

  return (
    <div data-jv-gate-state={state} className={clsx('border', tokens.frame)}>
      <div className={clsx('h-jv-2', tokens.rule)} />

      <div className="px-jv-16 pt-jv-13 pb-jv-16">
        <div className="flex items-center gap-jv-10">
          <span
            className={clsx(
              'font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-widest',
              tokens.labelColor,
            )}
          >
            {tokens.label}
          </span>
          {subtitle ? (
            <>
              <span
                aria-hidden="true"
                className={clsx('w-jv-1 h-jv-11 flex-none', tokens.divider)}
              />
              <span
                className={clsx(
                  'font-jv-mono text-jv-sm leading-jv-none',
                  tokens.sublabel,
                )}
              >
                {subtitle}
              </span>
            </>
          ) : null}
          <div className="flex-1" />
          {pending && waiting ? (
            <span className="font-jv-mono text-jv-sm leading-jv-none font-medium text-jv-blocked">
              waiting {waiting}
            </span>
          ) : null}
        </div>

        <div className="mt-jv-11 font-jv-sans text-jv-6xl leading-jv-normal-2 font-medium text-jv-text-bright">
          {title}
        </div>
        <div className="mt-jv-4 font-jv-mono text-jv-md leading-jv-loose text-jv-text-faint">
          {command}
        </div>

        <div className={clsx('mt-jv-13 flex gap-jv-1 border', tokens.gutter)}>
          {[
            {
              key: 'blast-radius',
              label: cellLabels?.blastRadius ?? DEFAULT_BLAST_RADIUS_LABEL,
              value: blastRadius,
            },
            {
              key: 'undo-path',
              label: cellLabels?.undoPath ?? DEFAULT_UNDO_PATH_LABEL,
              value: undoPath,
            },
          ].map((cell) => (
            <div
              key={cell.key}
              className={clsx('flex-1 px-jv-11 py-jv-9', tokens.cell)}
            >
              <div className={clsx(CELL_LABEL_CLASS, tokens.cellLabel)}>
                {cell.label}
              </div>
              <div className="mt-jv-7 font-jv-sans text-jv-lg leading-jv-loose-3 text-jv-text-body">
                {cell.value}
              </div>
            </div>
          ))}
        </div>

        {caveat ? (
          <div className="mt-jv-11 font-jv-sans text-jv-lg leading-jv-loose text-jv-text-dim-2">
            {caveat}
          </div>
        ) : null}

        {pending ? (
          <div className="mt-jv-13 flex items-center gap-jv-8">
            {actions.map((action, index) => (
              <button
                key={action}
                type="button"
                onClick={() => onAction?.(action)}
                className={clsx(
                  'font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-wider',
                  index === 0
                    ? 'px-jv-20 py-jv-9 bg-jv-verified text-jv-surface-0'
                    : index === 1
                      ? 'px-jv-20 py-jv-9 border border-jv-border-btn-2 text-jv-text-body'
                      : 'px-jv-14 py-jv-9 border border-jv-border-btn text-jv-text-faint',
                )}
              >
                {action}
              </button>
            ))}
            {hint ? (
              <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-text-faint">
                {hint}
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className={clsx(
              'mt-jv-13 font-jv-mono text-jv-sm leading-jv-none tracking-jv-label',
              tokens.labelColor,
            )}
          >
            {`gate resolved · ${state}`}
          </div>
        )}
      </div>
    </div>
  )
}
