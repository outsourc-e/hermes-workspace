/**
 * Mobile Command — composer (artboard 03), pinned under the legend.
 *
 * `→ ORCH · /verify /hold /status` over `⌘ Instruct JARVIS   SEND`. The desktop
 * chip row (greenlight / vault / worktree) and the `⇧⏎ newline` hint are both
 * dropped: they are keyboard affordances and a 390pt column has no keyboard.
 *
 * Presentational only, exactly like the desktop composer — the input is a
 * styled div, not a form control, because this slice wires nothing and an
 * inert-but-focusable field would lie about what happens when you type in it.
 *
 * Token discipline: no raw colour, size, spacing or radius.
 */
import type { MobileComposerFixture } from '@/components/jarvis/fixtures'

export function MobileComposer({ data }: { data: MobileComposerFixture }) {
  return (
    <div className="flex-none border-t border-jv-line bg-jv-surface-0 px-jv-14 pt-jv-10 pb-jv-12">
      <div className="flex items-center gap-jv-8 font-jv-mono text-jv-sm leading-jv-none text-jv-label-dim">
        <span className="border border-jv-live-line bg-jv-live-bg px-jv-7 py-jv-3 font-semibold tracking-jv-label-2 text-jv-live">
          {data.target}
        </span>
        <span aria-hidden="true" className="text-jv-label-ghost">
          ·
        </span>
        <span>{data.slashHint}</span>
      </div>

      <div className="mt-jv-9 flex items-center gap-jv-10 border border-jv-border-input bg-jv-surface-2 px-jv-11 py-jv-10">
        <span
          aria-hidden="true"
          className="font-jv-mono text-jv-xl leading-jv-none font-semibold text-jv-live"
        >
          ⌘
        </span>
        <span className="flex-1 font-jv-sans text-jv-5xl leading-jv-none text-jv-label-faint">
          {data.placeholder}
        </span>
        <span className="bg-jv-live px-jv-11 py-jv-6 font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-wide-2 whitespace-nowrap text-jv-surface-0">
          {data.sendLabel}
        </span>
      </div>
    </div>
  )
}
