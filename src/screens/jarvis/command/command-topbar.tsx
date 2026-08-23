/**
 * Desktop Command — top bar (artboard 01, 44px).
 *
 * Wordmark · session/uptime/vault · the pending-gate pill · greenlight state.
 * Fixture-driven and inert: nothing here reads a session or an approval queue.
 *
 * Token discipline: no raw colour, size, spacing or radius. The only non-token
 * numbers are structural, and they come from `JV_BOARD` (4px grid multiples).
 */
import { JV_BOARD } from './geometry'
import type { CommandTopbarFixture } from '@/components/jarvis/fixtures'

const LABEL_CLASS =
  'font-jv-mono text-jv-md leading-jv-none whitespace-nowrap text-jv-text-faint'

export function CommandTopbar({ data }: { data: CommandTopbarFixture }) {
  return (
    <header
      className="flex flex-none items-center border-b border-jv-line bg-jv-surface-2 px-jv-16"
      style={{ height: JV_BOARD.topbarHeight, gap: JV_BOARD.gap18 }}
    >
      <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-ultra text-jv-live">
        JARVIS
      </span>

      <span aria-hidden="true" className="h-jv-16 w-jv-1 bg-jv-border-muted" />

      <div className={LABEL_CLASS}>
        session <span className="text-jv-text">{data.session}</span> · uptime{' '}
        <span className="text-jv-text">{data.uptime}</span> · vault{' '}
        <span className="text-jv-text">{data.vault}</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-jv-7 rounded-jv-sm border border-jv-blocked-line bg-jv-blocked-bg-chip px-jv-9 py-jv-5 font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-wider whitespace-nowrap text-jv-blocked">
        <span
          aria-hidden="true"
          className="h-jv-5 w-jv-5 flex-none rounded-jv-full bg-jv-blocked"
        />
        {data.gateLabel}
      </div>

      <div className="font-jv-mono text-jv-md leading-jv-none whitespace-nowrap text-jv-label">
        greenlight <span className="text-jv-verified">{data.greenlight}</span>
      </div>
    </header>
  )
}
