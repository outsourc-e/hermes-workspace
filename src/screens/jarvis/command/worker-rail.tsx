/**
 * Desktop Command — left rail (artboard 01, 220px): WORKERS then THREADS,
 * with the ctx/worktree footer pinned to the bottom.
 *
 * The worker list COMPOSES the Slice 2 `WorkerStatusLine` primitive — every row
 * is one call, no row is re-styled here. The rail only supplies the frame, the
 * section labels and the thread rows the primitive does not cover.
 *
 * Fixture-driven and inert. `ctx 41%` in the footer is NO SOURCE
 * (`docs/design/jarvis-ui-mapping.md` §3.5 item 10) and is marked as fixture
 * data in the DOM.
 *
 * Token discipline: no raw colour, size, spacing or radius.
 */
import { clsx } from 'clsx'
import { JV_BOARD } from './geometry'
import type { ThreadFixture, ThreadTone } from '@/components/jarvis/fixtures'
import type { WorkerStatusLineProps } from '@/components/jarvis/types'
import { WorkerStatusLine } from '@/components/jarvis/worker-status-line'

const SECTION_LABEL_CLASS =
  'font-jv-mono text-jv-2xs leading-jv-none font-semibold tracking-jv-widest text-jv-label'

/** Tone drives both the title and the meta line — see the artboard rail. */
const THREAD_TONES: Record<
  ThreadTone,
  { row: string; title: string; meta: string }
> = {
  active: {
    row: 'bg-jv-surface-3',
    title: 'text-jv-text',
    meta: 'text-jv-live',
  },
  idle: { row: '', title: 'text-jv-text-dim', meta: 'text-jv-label-faint' },
  attention: {
    row: '',
    title: 'text-jv-text-dim',
    meta: 'text-jv-failed-muted',
  },
}

export function WorkerRail({
  workers,
  counts,
  threads,
  footerLines,
}: {
  workers: Array<WorkerStatusLineProps>
  counts: string
  threads: Array<ThreadFixture>
  footerLines: Array<string>
}) {
  return (
    <nav
      aria-label="Workers and threads"
      className="flex flex-none flex-col border-r border-jv-line bg-jv-surface-0"
      style={{ width: JV_BOARD.leftRailWidth }}
    >
      <div className="flex items-baseline justify-between px-jv-14 pt-jv-13 pb-jv-9">
        <span className={SECTION_LABEL_CLASS}>WORKERS</span>
        <span className="font-jv-mono text-jv-2xs leading-jv-none text-jv-label-ghost">
          {counts}
        </span>
      </div>

      {/* The primitive draws only a top rule, so the list closes itself. */}
      <div className="flex flex-col border-b border-jv-line-soft">
        {workers.map((worker) => (
          <WorkerStatusLine key={worker.name} {...worker} />
        ))}
      </div>

      <div
        className={clsx(SECTION_LABEL_CLASS, 'px-jv-14 pb-jv-9')}
        style={{ paddingTop: JV_BOARD.gap18 }}
      >
        THREADS
      </div>

      <div className="flex flex-col border-b border-jv-line-soft">
        {threads.map((thread) => {
          const tone = THREAD_TONES[thread.tone]
          return (
            <div
              key={thread.title}
              data-jv-thread-tone={thread.tone}
              className={clsx(
                'border-t border-jv-line-soft px-jv-14 py-jv-8',
                tone.row,
              )}
            >
              <div
                className={clsx(
                  'font-jv-sans text-jv-lg leading-jv-normal font-medium',
                  tone.title,
                )}
              >
                {thread.title}
              </div>
              <div
                className={clsx(
                  'mt-jv-3 font-jv-mono text-jv-xs leading-jv-none',
                  tone.meta,
                )}
              >
                {thread.meta}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex-1" />

      <div
        data-jv-fixture="no-source"
        className="border-t border-jv-line px-jv-14 py-jv-12 font-jv-mono text-jv-xs leading-jv-loose text-jv-label-ghost"
      >
        {footerLines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </nav>
  )
}
