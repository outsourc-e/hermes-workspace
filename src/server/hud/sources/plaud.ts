import { promises as fs } from 'fs';
import { registerAdapter, type SourceAdapter } from './index';

interface RawPlaud {
  id: string;
  transcribed?: boolean;
}

interface PlaudData {
  value: string;
  sub: string;
  tone: 'ok' | 'info';
}

export function computePlaudStat(recordings: RawPlaud[]): PlaudData {
  const untranscribed = recordings.filter(r => !r.transcribed).length;
  return {
    value: String(untranscribed),
    sub: 'untranscribed',
    tone: untranscribed === 0 ? 'ok' : 'info',
  };
}

export const plaudAdapter: SourceAdapter<PlaudData> = {
  id: 'plaud',
  ttlMs: 600_000, // 10 min — matches cron cadence from home PC
  async fetch() {
    const raw = await fs.readFile('/root/.hermes/hud-cache/plaud-recent.json', 'utf8');
    return computePlaudStat(JSON.parse(raw));
  },
};

registerAdapter(plaudAdapter);
