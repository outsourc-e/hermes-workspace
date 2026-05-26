import { promises as fs } from 'fs';
import { registerAdapter, type SourceAdapter } from './index';

interface RawWhoop {
  date?: string;
  recovery_pct?: number;
  sleep_hours?: number;
  sleep_performance_pct?: number;
  hrv_ms?: number;
  resting_hr_bpm?: number;
  day_strain?: number;
}

interface WhoopData { label: string; title: string; sub: string; }

export function computeWhoopData(w: RawWhoop): WhoopData {
  const sub = w.sleep_hours ? w.sleep_hours.toFixed(1) + 'h sleep' : '—';
  return {
    label: 'RECOVERY',
    title: (w.recovery_pct ?? 0) + '%',
    sub,
  };
}

export const whoopAdapter: SourceAdapter<WhoopData> = {
  id: 'recovery',
  ttlMs: 5 * 60_000,
  async fetch() {
    const raw = await fs.readFile('/root/.hermes/repos/nw-personal-projects/whoop/latest.json', 'utf8');
    return computeWhoopData(JSON.parse(raw));
  },
};

registerAdapter(whoopAdapter);
