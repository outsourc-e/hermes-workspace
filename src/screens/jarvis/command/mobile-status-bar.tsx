/**
 * The phone status bar shared by the two mobile boards (artboards 03 and 04).
 *
 * `9:47 · JARVIS · 􀙇 􀛨` — the time, the wordmark, and the artboard's signal
 * and battery glyphs. The glyphs are literal characters, not icons: the
 * artboard draws them as text and this slice introduces no iconography.
 *
 * Lives in `command/` and is imported by `conductor/` for the same reason
 * `geometry.ts` does — the two boards already share this directory for
 * anything neither of them owns alone, and duplicating a 44px bar so it can
 * sit in "its own" folder would just give the two boards two bars to drift.
 *
 * Token discipline: no raw colour, size, spacing or radius. The bar height is
 * structural and comes from `JV_MOBILE` (a 4px grid multiple plus its rule).
 */
import { JV_MOBILE } from './geometry'
import type { MobileStatusBarFixture } from '@/components/jarvis/fixtures'

export function MobileStatusBar({ data }: { data: MobileStatusBarFixture }) {
  return (
    <header
      className="flex flex-none items-center gap-jv-12 border-b border-jv-line bg-jv-surface-2 px-jv-14"
      style={{ height: JV_MOBILE.statusBarHeight }}
    >
      <span className="font-jv-mono text-jv-md leading-jv-none font-medium text-jv-text">
        {data.time}
      </span>

      <div className="flex-1" />

      <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-ultra text-jv-live">
        {data.wordmark}
      </span>

      <div className="flex-1" />

      <span
        aria-hidden="true"
        className="font-jv-mono text-jv-md leading-jv-none text-jv-text-faint"
      >
        {data.glyphs}
      </span>
    </header>
  )
}
