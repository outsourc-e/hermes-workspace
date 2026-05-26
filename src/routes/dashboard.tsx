import { createFileRoute } from '@tanstack/react-router';
import { HUDShell, Brief, BentoRow, Timeline, MissionControl, InboxRail } from '../components/hud';
import type { WidgetSnapshot } from '../server/hud/types';

const now = Date.now();
const ok = <T,>(data: T): WidgetSnapshot<T> => ({ id: 'agents', state: 'loaded', data, fetchedAt: now, ttlMs: 60000 });

const mockTiles = [
  { id: 'agents', label: 'Agents', snapshot: ok({ value: '7', sub: '2 idle', tone: 'ok' as const }) },
  { id: 'jobs', label: 'Jobs (24h)', snapshot: ok({ value: '12 ✓', sub: '1 fail', tone: 'info' as const }) },
  { id: 'sessions', label: 'Sessions', snapshot: ok({ value: '4', sub: '3 hosts', tone: 'info' as const }) },
  { id: 'vm-health', label: 'VM', snapshot: ok({ value: '15%', sub: 'mem', tone: 'ok' as const }) },
  { id: 'prs', label: 'PRs', snapshot: ok({ value: '3', tone: 'info' as const }) },
  { id: 'ci', label: 'CI', snapshot: ok({ value: 'green', tone: 'ok' as const }) },
  { id: 'sms', label: 'SMS', snapshot: ok({ value: '2', tone: 'info' as const }) },
  { id: 'telegram', label: 'Telegram', snapshot: ok({ value: '5', tone: 'info' as const }) },
  { id: 'plaud', label: 'Plaud', snapshot: ok({ value: '1', tone: 'info' as const }) },
  { id: 'cliniko', label: 'Cliniko', snapshot: ok({ value: '3', tone: 'info' as const }) },
  { id: 'errors', label: 'Errors', snapshot: ok({ value: '0', tone: 'ok' as const }) },
];

const mockEvents = [
  { id: 'g', startMin: 90, durationMin: 60, title: 'Gym', category: 'personal' as const },
  { id: 'c', startMin: 300, durationMin: 60, title: 'TADC', category: 'clinic' as const },
  { id: 'r', startMin: 510, durationMin: 60, title: 'Rod call', category: 'urgent' as const },
  { id: 'u', startMin: 660, durationMin: 60, title: 'ANAT304 lab', category: 'uni' as const },
];

const mockInbox = [
  { id: '1', severity: 'urgent' as const, tag: 'URGENT', body: 'Rod call in 47min', when: '14:30' },
  { id: '2', severity: 'warn' as const, tag: 'UNI', body: 'ANAT304 due Fri', when: 'Fri' },
  { id: '3', severity: 'ok' as const, tag: 'AGENT', body: 'qa: CliniTrack smoke ✓', when: '2m' },
];

export const Route = createFileRoute('/dashboard')({ component: DashboardPage, ssr: false });
function DashboardPage() {
  const d = new Date();
  const nowMin = (d.getHours() - 6) * 60 + d.getMinutes();
  return (
    <HUDShell
      brief={<Brief subtitle="FROM HERMES · 07:00 BRIEF" text="Recovery 58% — light day. Rod call in 47 min. ANAT304 due Fri." />}
      bento={<BentoRow
        upNext={{ label: 'UP NEXT · 47 MIN', title: 'Rod call', sub: 'CliniTrack imaging' }}
        recovery={{ label: 'RECOVERY', title: '58%', sub: '6.2h sleep' }}
        nextDeadline={{ label: 'UNI · DUE FRI', title: 'ANAT304', sub: 'lab writeup · 4d untouched' }}
      />}
      timeline={<Timeline events={mockEvents} nowMin={Math.max(0, Math.min(840, nowMin))} />}
      missionControl={<MissionControl tiles={mockTiles} />}
      inbox={<InboxRail items={mockInbox} />}
    />
  );
}
