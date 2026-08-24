/**
 * Desktop Conductor — top bar (artboard 02, 44px).
 *
 * Wordmark · COMMAND/CONDUCTOR tab pair · fleet status line · date.
 *
 * The tabs are the only navigation on this board and they are presentational:
 * the active tab is a plain span, and the inactive one is a `<Link>` purely so
 * the two dev boards are reachable from each other. No tab state, no handler.
 *
 * The status line is hue-coded — `failed` in `--jv-failed`, `stale` in
 * `--jv-blocked` — so it is supplied pre-split by the fixture rather than
 * parsed out of one string here.
 *
 * Token discipline: no raw colour, size, spacing or radius. The only non-token
 * numbers are structural, and they come from `JV_BOARD` (4px grid multiples).
 */
import { Link } from '@tanstack/react-router'
import { clsx } from 'clsx'
import { JV_BOARD } from '../command/geometry'
import type { ConductorTopbarFixture } from '@/components/jarvis/fixtures'

const TAB_CLASS =
  'px-jv-10 py-jv-6 font-jv-mono text-jv-xs leading-jv-none font-semibold tracking-jv-wide-2'

export function ConductorTopbar({ data }: { data: ConductorTopbarFixture }) {
  return (
    <header
      className="flex flex-none items-center border-b border-jv-line bg-jv-surface-2 px-jv-16"
      style={{ height: JV_BOARD.topbarHeight, gap: JV_BOARD.gap18 }}
    >
      <span className="font-jv-mono text-jv-sm leading-jv-none font-semibold tracking-jv-ultra text-jv-live">
        JARVIS
      </span>

      <span aria-hidden="true" className="h-jv-16 w-jv-1 bg-jv-border-muted" />

      <nav aria-label="Boards" className="flex gap-jv-2">
        {data.tabs.map((tab) =>
          tab.active || !tab.href ? (
            <span
              key={tab.label}
              aria-current={tab.active ? 'page' : undefined}
              className={clsx(TAB_CLASS, 'bg-jv-surface-5 text-jv-text')}
            >
              {tab.label}
            </span>
          ) : (
            <Link
              key={tab.label}
              to={tab.href}
              className={clsx(TAB_CLASS, 'text-jv-label-dim')}
            >
              {tab.label}
            </Link>
          ),
        )}
      </nav>

      <div className="flex-1" />

      <div className="font-jv-mono text-jv-md leading-jv-none whitespace-nowrap text-jv-text-faint">
        {data.statusLead}
        <span className="text-jv-failed">{data.statusFailed}</span>
        {' · '}
        <span className="text-jv-blocked">{data.statusStale}</span>
      </div>

      <div className="font-jv-mono text-jv-md leading-jv-none whitespace-nowrap text-jv-label">
        {data.date}
      </div>
    </header>
  )
}
