import { promises as fs } from 'fs';
import { registerAdapter, type SourceAdapter } from './index';

interface RawCalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  calendarName?: string;
}

interface TimelineEvent {
  id: string;
  startMin: number;       // minutes since 6am (display window)
  durationMin: number;
  title: string;
  category: 'work' | 'uni' | 'clinic' | 'personal' | 'urgent';
}

interface UpNext { label: string; title: string; sub?: string; }

interface UrgentItem { id: string; tag: string; body: string; when: string; severity: 'urgent'; }

export interface CalendarData {
  upNext: UpNext | null;
  timelineEvents: TimelineEvent[];
  urgentItems: UrgentItem[];
}

function categorise(name?: string): TimelineEvent['category'] {
  const n = (name ?? '').toLowerCase();
  if (n.includes('tadc') || n.includes('hcc') || n.includes('clinic')) return 'clinic';
  if (n.includes('uni') || n.includes('lect') || n.includes('lab')) return 'uni';
  if (n.includes('work') || n.includes('praxentis')) return 'work';
  return 'personal';
}

export function deriveCalendarData(raw: RawCalEvent[], now: Date = new Date()): CalendarData {
  const sixAm = new Date(now);
  sixAm.setHours(6, 0, 0, 0);

  const enriched = raw.map(e => ({
    ...e,
    startDate: new Date(e.start),
    endDate: new Date(e.end),
  }));

  const upcoming = enriched
    .filter(e => e.endDate.getTime() > now.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const next = upcoming[0];
  const upNext: UpNext | null = next ? {
    label: `UP NEXT · ${Math.max(0, Math.round((next.startDate.getTime() - now.getTime()) / 60000))} MIN`,
    title: next.summary,
    sub: next.calendarName,
  } : null;

  const today = now.toDateString();
  const timelineEvents: TimelineEvent[] = enriched
    .filter(e => e.startDate.toDateString() === today)
    .map(e => ({
      id: e.id,
      startMin: Math.max(0, (e.startDate.getTime() - sixAm.getTime()) / 60000),
      durationMin: Math.max(15, (e.endDate.getTime() - e.startDate.getTime()) / 60000),
      title: e.summary,
      category: categorise(e.calendarName),
    }))
    .filter(e => e.startMin >= 0 && e.startMin < 840);  // 6am → 8pm window

  const urgentItems: UrgentItem[] = upcoming
    .filter(e => (e.startDate.getTime() - now.getTime()) < 3600_000 && (e.startDate.getTime() - now.getTime()) > 0)
    .map(e => ({
      id: `cal-${e.id}`,
      tag: 'URGENT',
      body: `${e.summary} in ${Math.round((e.startDate.getTime() - now.getTime()) / 60000)}min`,
      when: e.startDate.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
      severity: 'urgent' as const,
    }));

  return { upNext, timelineEvents, urgentItems };
}

interface RawFile { generatedAt?: string; events?: RawCalEvent[]; error?: string; }

export const googleCalendarAdapter: SourceAdapter<CalendarData> = {
  id: 'timeline',  // primary widget id; up-next post-processed in snapshot route
  ttlMs: 60_000,
  async fetch() {
    const raw = await fs.readFile('/root/.hermes/hud-cache/google-events-today.json', 'utf8');
    const file = JSON.parse(raw) as RawFile;
    return deriveCalendarData(file.events ?? []);
  },
};

registerAdapter(googleCalendarAdapter);
