import { WidgetShell } from './WidgetShell'
import type { WidgetState } from '../../server/hud/types'

interface TileProps {
  state: WidgetState
  label: string
  value: string
  sub?: string
  tone?: 'ok' | 'warn' | 'err' | 'info'
  fetchedAt?: number
  error?: { message: string }
}
const TONE = {
  ok: 'text-[#3fb950]',
  warn: 'text-[#d29922]',
  err: 'text-[#f85149]',
  info: 'text-[#e6edf3]',
}
export function Tile({
  state,
  label,
  value,
  sub,
  tone = 'info',
  fetchedAt,
  error,
}: TileProps) {
  return (
    <WidgetShell
      state={state}
      title={label}
      fetchedAt={fetchedAt}
      error={error}
      className="bg-[#161b22] border border-[#21262d] rounded-lg p-3 min-h-[68px] flex flex-col justify-between"
    >
      <h4 className="text-[10px] text-[#58a6ff] uppercase tracking-[0.15em] font-semibold m-0">
        {label}
      </h4>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-base font-bold ${TONE[tone]}`}>{value}</span>
        {sub && <span className="text-[11px] text-[#8b949e]">{sub}</span>}
      </div>
    </WidgetShell>
  )
}
