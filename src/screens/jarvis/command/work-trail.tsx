/**
 * Desktop Command — right rail (artboard 01, 320px): WORK TRAIL.
 *
 * Delegation chain → files touched → tool calls → tokens/cost footer.
 *
 * Honesty notes, all from `docs/design/jarvis-ui-mapping.md` §3.5:
 *   • the chain is a LAYOUT CONVENTION (item 14) — no parent→child edge graph
 *     is modelled anywhere today, so the fixed four-node chain is drawn, not
 *     captured, and the section says so;
 *   • files touched (item 8) and per-tool-call duration (item 9) have no
 *     source at all.
 * Each carries `data-jv-fixture="no-source"`.
 *
 * Token discipline: no raw colour, size, spacing or radius.
 */
import { clsx } from 'clsx'
import { JV_BOARD } from './geometry'
import type {
  ChainNodeFixture,
  ChainNodeState,
  FileChange,
  FileTouchedFixture,
  ToolCallFixture,
  ToolCallState,
  WorkTrailChromeFixture,
} from '@/components/jarvis/fixtures'

const SECTION_LABEL_CLASS =
  'font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-widest text-jv-label-ghost'

/** `jv-ring` is the artboard's active-node halo; the queued/done nodes are outlines. */
const CHAIN_STATES: Record<
  ChainNodeState,
  { marker: string; connector: string; name: string; detail: string }
> = {
  done: {
    marker: 'border border-jv-known-rule bg-jv-surface-0',
    connector: 'bg-jv-border-input',
    name: 'text-jv-text-faint font-medium',
    detail: 'text-jv-label-faint',
  },
  active: {
    marker: 'bg-jv-live animate-jv-ring',
    connector: 'bg-jv-live-line',
    name: 'text-jv-live font-semibold',
    detail: 'text-jv-text-detail',
  },
  queued: {
    marker: 'border border-jv-dot-idle',
    connector: 'bg-jv-border-input',
    name: 'text-jv-label-dim font-medium',
    detail: 'text-jv-label-ghost',
  },
}

const FILE_CHANGES: Record<FileChange, string> = {
  M: 'text-jv-verified',
  A: 'text-jv-live',
  D: 'text-jv-failed',
}

const TOOL_CALL_STATES: Record<
  ToolCallState,
  { row: string; time: string; label: string; result: string }
> = {
  ok: {
    row: '',
    time: 'text-jv-label-ghost',
    label: 'text-jv-text-dim',
    result: 'text-jv-label-faint',
  },
  failed: {
    row: '',
    time: 'text-jv-label-ghost',
    label: 'text-jv-text-dim',
    result: 'text-jv-failed-muted',
  },
  live: {
    row: 'bg-jv-surface-3',
    time: 'text-jv-live',
    label: 'text-jv-text',
    result: 'text-jv-live animate-jv-pulse-fast',
  },
}

function ChainNode({ node, last }: { node: ChainNodeFixture; last: boolean }) {
  const tokens = CHAIN_STATES[node.state]

  return (
    <div data-jv-chain-state={node.state} className="flex gap-jv-10">
      <div className="flex w-jv-9 flex-none flex-col items-center">
        <span
          aria-hidden="true"
          className={clsx('mt-jv-4 h-jv-7 w-jv-7 flex-none', tokens.marker)}
        />
        {last ? null : (
          <span
            aria-hidden="true"
            className={clsx('w-jv-1 flex-1', tokens.connector)}
          />
        )}
      </div>

      <div className={clsx('flex-1', last ? '' : 'pb-jv-11')}>
        <div className="flex items-baseline justify-between gap-jv-8">
          <span
            className={clsx(
              'font-jv-mono text-jv-lg leading-jv-snug',
              tokens.name,
            )}
          >
            {node.name}
          </span>
          {node.time ? (
            <span className="font-jv-mono text-jv-sm leading-jv-snug text-jv-live">
              {node.time}
            </span>
          ) : null}
        </div>
        <div
          className={clsx(
            'mt-jv-3 font-jv-mono text-jv-sm leading-jv-normal-2',
            tokens.detail,
          )}
        >
          {node.detail.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function WorkTrail({
  chain,
  files,
  toolCalls,
  chrome,
}: {
  chain: Array<ChainNodeFixture>
  files: Array<FileTouchedFixture>
  toolCalls: Array<ToolCallFixture>
  chrome: WorkTrailChromeFixture
}) {
  return (
    <aside
      aria-label="Work trail"
      className="flex flex-none flex-col border-l border-jv-line bg-jv-surface-0"
      style={{ width: JV_BOARD.rightRailWidth }}
    >
      <div className="flex items-baseline justify-between border-b border-jv-line-soft px-jv-14 pt-jv-13 pb-jv-10">
        <span className="font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-widest text-jv-label">
          WORK TRAIL
        </span>
        <span className="font-jv-mono text-jv-sm leading-jv-none font-medium text-jv-live">
          {chrome.elapsed}
        </span>
      </div>

      <div
        data-jv-fixture="no-source"
        title="Layout convention — no parent→child delegation graph is captured today"
        className={clsx(SECTION_LABEL_CLASS, 'px-jv-14 pt-jv-14 pb-jv-4')}
      >
        DELEGATION CHAIN
      </div>
      <div className="flex flex-col px-jv-14 pt-jv-8 pb-jv-14">
        {chain.map((node, index) => (
          <ChainNode
            key={node.name}
            node={node}
            last={index === chain.length - 1}
          />
        ))}
      </div>

      <div
        data-jv-fixture="no-source"
        className={clsx(
          SECTION_LABEL_CLASS,
          'border-t border-jv-line-soft px-jv-14 pt-jv-10 pb-jv-4',
        )}
      >
        {`FILES TOUCHED · ${files.length}`}
      </div>
      <div className="px-jv-14 pt-jv-6 pb-jv-12 font-jv-mono text-jv-base leading-jv-max text-jv-text-faint">
        {files.map((file) => (
          <div key={file.path}>
            <span className={FILE_CHANGES[file.change]}>{file.change}</span>{' '}
            {file.path} <span className="text-jv-label-faint">{file.diff}</span>
          </div>
        ))}
      </div>

      <div
        className={clsx(
          SECTION_LABEL_CLASS,
          'border-t border-jv-line-soft px-jv-14 pt-jv-10 pb-jv-4',
        )}
      >
        TOOL CALLS
      </div>
      <div className="flex flex-col pt-jv-4">
        {toolCalls.map((call) => {
          const tokens = TOOL_CALL_STATES[call.state]
          return (
            <div
              key={`${call.time}-${call.label}`}
              data-jv-tool-call-state={call.state}
              className={clsx(
                'flex gap-jv-8 px-jv-14 py-jv-5 font-jv-mono text-jv-base leading-jv-normal',
                tokens.row,
              )}
            >
              <span
                className={clsx('flex-none', tokens.time)}
                style={{ width: JV_BOARD.toolCallTimeWidth }}
              >
                {call.time}
              </span>
              <span className={clsx('flex-1 truncate', tokens.label)}>
                {call.label}
              </span>
              <span
                data-jv-fixture={call.state === 'ok' ? 'no-source' : undefined}
                className={tokens.result}
              >
                {call.result}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-jv-8 border-t border-jv-line px-jv-14 py-jv-11">
        <span className="flex-1 font-jv-mono text-jv-sm leading-jv-relaxed-2 text-jv-label-faint">
          {chrome.footerLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </span>
        <span className="border border-jv-border-btn px-jv-9 py-jv-6 font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-wide-2 whitespace-nowrap text-jv-text-faint">
          {chrome.holdLabel}
        </span>
      </div>
    </aside>
  )
}
