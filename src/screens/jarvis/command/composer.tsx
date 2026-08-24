/**
 * Desktop Command — composer (artboard 01), pinned under the conversation.
 *
 * Presentational only. The input is a static styled div, not a form control:
 * this slice wires nothing, so there is no submit handler to hang off a real
 * field and an inert-but-focusable textarea would be a lie about what happens
 * when you type in it.
 *
 * Token discipline: no raw colour, size, spacing or radius.
 */
import type { ComposerFixture } from '@/components/jarvis/fixtures'

export function Composer({ data }: { data: ComposerFixture }) {
  return (
    <div className="flex-none border-t border-jv-line bg-jv-surface-0 px-jv-14 pt-jv-11 pb-jv-12">
      <div className="flex items-center gap-jv-9 font-jv-mono text-jv-sm leading-jv-none text-jv-label-dim">
        <span className="border border-jv-live-line bg-jv-live-bg px-jv-7 py-jv-3 font-semibold tracking-jv-label-2 text-jv-live">
          {data.target}
        </span>
        {data.chips.map((chip) => (
          <span
            key={chip}
            className="border border-jv-border-chip px-jv-7 py-jv-3"
          >
            {chip}
          </span>
        ))}
        <div className="flex-1" />
        <span>{data.slashHint}</span>
      </div>

      <div className="mt-jv-9 flex items-center gap-jv-11 border border-jv-border-input bg-jv-surface-2 px-jv-13 py-jv-11">
        <span
          aria-hidden="true"
          className="font-jv-mono text-jv-xl leading-jv-none font-semibold text-jv-live"
        >
          ⌘
        </span>
        <span className="flex-1 font-jv-sans text-jv-5xl leading-jv-none text-jv-label-faint">
          {data.placeholder}
        </span>
        <span className="font-jv-mono text-jv-sm leading-jv-none text-jv-label-ghost">
          {data.newlineHint}
        </span>
        <span className="bg-jv-live px-jv-11 py-jv-6 font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-wide-2 text-jv-surface-0">
          {data.sendLabel}
        </span>
      </div>
    </div>
  )
}
