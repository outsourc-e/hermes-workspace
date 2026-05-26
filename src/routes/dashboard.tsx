import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HUDShell, Brief, BentoRow, Timeline, MissionControl, InboxRail, type InboxItemData } from '../components/hud';
import { useHUDSnapshot } from '../components/hud/hooks/useHUDSnapshot';
import { useHUDConfig } from '../components/hud/hooks/useHUDConfig';

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
  const { data: cfg } = useHUDConfig();
  const qc = useQueryClient();

  const regen = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/hud/regen-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`regen failed: ${r.status} ${body}`);
      }
      return r.json();
    },
    onSuccess: () => {
      // Poll snapshot for the new brief; the brief job runs async so the snapshot
      // may take a few seconds to reflect the new output. Refetch every 5s for 30s.
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        qc.invalidateQueries({ queryKey: ['hud', 'snapshot'] });
        if (tries >= 6) clearInterval(iv);
      }, 5000);
    },
  });

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
  const widgetEnabled = (id: string) => cfg?.widgets?.[id] !== false;

  const tileIds = ['agents', 'jobs', 'sessions', 'vm-health', 'prs', 'ci', 'sms', 'telegram', 'plaud', 'cliniko', 'errors'];
  const mcTiles = tileIds
    .filter(id => widgetEnabled(id))
    .filter(id => w[id] && w[id].state !== 'disabled')
    .map(id => ({ id, label: PRETTY[id] ?? id, snapshot: w[id] }));

  const calData = w['timeline']?.data;
  const events = calData?.timelineEvents ?? [];
  const inboxItems: InboxItemData[] = (w['inbox']?.data ?? []) as InboxItemData[];

  const briefText = (w['brief']?.data as any)?.text ?? '_No brief available yet — click ↻ regen to trigger the morning brief job._';

  return (
    <HUDShell
      brief={widgetEnabled('brief') ? (
        <Brief
          subtitle="FROM HERMES · MORNING BRIEF"
          text={briefText}
          onRegen={() => regen.mutate()}
          regenLoading={regen.isPending}
        />
      ) : null}
      bento={(widgetEnabled('up-next') || widgetEnabled('recovery') || widgetEnabled('next-deadline')) ? (
        <BentoRow
          upNext={widgetEnabled('up-next') ? ((w['up-next']?.data as any) ?? PLACEHOLDER) : PLACEHOLDER}
          recovery={widgetEnabled('recovery') ? ((w['recovery']?.data as any) ?? PLACEHOLDER) : PLACEHOLDER}
          nextDeadline={widgetEnabled('next-deadline') ? ((w['next-deadline']?.data as any) ?? PLACEHOLDER) : PLACEHOLDER}
        />
      ) : null}
      timeline={widgetEnabled('timeline') ? (
        <Timeline events={events} nowMin={Math.max(0, Math.min(840, nowMin))} />
      ) : null}
      missionControl={<MissionControl tiles={mcTiles} />}
      inbox={widgetEnabled('inbox') ? <InboxRail items={inboxItems} /> : null}
    />
  );
}
