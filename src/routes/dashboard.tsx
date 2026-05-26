import { createFileRoute } from '@tanstack/react-router';
import { HUDShell, Brief, BentoRow, Timeline, MissionControl, InboxRail, type InboxItemData } from '../components/hud';
import { useHUDSnapshot } from '../components/hud/hooks/useHUDSnapshot';

export const Route = createFileRoute('/dashboard')({ component: DashboardPage, ssr: false });

const PLACEHOLDER = { label: '—', title: '—' };
const PRETTY: Record<string, string> = {
  'agents': 'Agents',
  'jobs': 'Jobs (24h)',
  'sessions': 'Sessions',
  'vm-health': 'VM',
  'prs': 'PRs',
  'ci': 'CI',
  'sms': 'SMS',
  'telegram': 'Telegram',
  'plaud': 'Plaud',
  'cliniko': 'Cliniko',
  'errors': 'Errors',
};

function DashboardPage() {
  const { data, isLoading, error } = useHUDSnapshot();

  if (isLoading && !data) {
    return (
      <HUDShell
        brief={<div className="text-[#6e7681] text-xs">loading…</div>}
        bento={null}
        timeline={null}
        missionControl={null}
        inbox={null}
      />
    );
  }
  if (error || !data) {
    return (
      <HUDShell
        brief={<div className="text-red-400 text-xs">snapshot failed: {String(error)}</div>}
        bento={null}
        timeline={null}
        missionControl={null}
        inbox={null}
      />
    );
  }

  const w = data.widgets as Record<string, any>;
  const d = new Date();
  const nowMin = (d.getHours() - 6) * 60 + d.getMinutes();

  const tileIds = ['agents', 'jobs', 'sessions', 'vm-health', 'prs', 'ci', 'sms', 'telegram', 'plaud', 'cliniko', 'errors'];
  const mcTiles = tileIds
    .filter(id => w[id] && w[id].state !== 'disabled')
    .map(id => ({ id, label: PRETTY[id] ?? id, snapshot: w[id] }));

  const calData = w['timeline']?.data;
  const events = calData?.timelineEvents ?? [];
  const urgentInbox: InboxItemData[] = (calData?.urgentItems ?? []) as InboxItemData[];

  return (
    <HUDShell
      brief={<Brief subtitle="FROM HERMES" text={(w['brief']?.data as any)?.text ?? 'Brief not wired yet (Task C.1).'} />}
      bento={<BentoRow
        upNext={(w['up-next']?.data as any) ?? PLACEHOLDER}
        recovery={(w['recovery']?.data as any) ?? PLACEHOLDER}
        nextDeadline={(w['next-deadline']?.data as any) ?? PLACEHOLDER}
      />}
      timeline={<Timeline events={events} nowMin={Math.max(0, Math.min(840, nowMin))} />}
      missionControl={<MissionControl tiles={mcTiles} />}
      inbox={<InboxRail items={urgentInbox} />}
    />
  );
}
