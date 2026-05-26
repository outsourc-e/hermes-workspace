import { Tile } from './Tile';
import type { WidgetSnapshot } from '../../server/hud/types';
export interface MCTileSpec {
  id: string;
  snapshot: WidgetSnapshot<{ value: string; sub?: string; tone?: 'ok'|'warn'|'err'|'info' }>;
  label: string;
}
interface MissionControlProps { tiles: MCTileSpec[]; }
export function MissionControl({ tiles }: MissionControlProps) {
  return (
    <div className="bg-[#0d1117] border border-[#21262d] rounded p-2.5">
      <div className="text-[8px] text-[#8b949e] tracking-wider mb-2 flex justify-between">
        <span>MISSION CONTROL</span><span>live</span>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
        {tiles.map(t => (
          <Tile
            key={t.id}
            state={t.snapshot.state}
            label={t.label}
            value={t.snapshot.data?.value ?? '—'}
            sub={t.snapshot.data?.sub}
            tone={t.snapshot.data?.tone}
            fetchedAt={t.snapshot.fetchedAt}
            error={t.snapshot.error}
          />
        ))}
      </div>
    </div>
  );
}
