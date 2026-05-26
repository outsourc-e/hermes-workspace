import type { WidgetState } from '../../server/hud/types';
import { WidgetShell } from './WidgetShell';
interface TileProps {
  state: WidgetState;
  label: string;
  value: string;
  sub?: string;
  tone?: 'ok'|'warn'|'err'|'info';
  fetchedAt?: number;
  error?: { message: string };
}
const TONE = { ok: 'text-[#3fb950]', warn: 'text-[#d29922]', err: 'text-[#f85149]', info: 'text-[#e6edf3]' };
export function Tile({ state, label, value, sub, tone='info', fetchedAt, error }: TileProps) {
  return (
    <WidgetShell state={state} title={label} fetchedAt={fetchedAt} error={error} className="bg-[#161b22] border border-[#21262d] rounded p-2 min-h-[44px]">
      <h4 className="text-[7px] text-[#58a6ff] uppercase tracking-wider font-semibold m-0 mb-1">{label}</h4>
      <span className={`text-xs font-semibold ${TONE[tone]}`}>{value}</span>
      {sub && <span className="text-[8px] text-[#6e7681] ml-1">{sub}</span>}
    </WidgetShell>
  );
}
