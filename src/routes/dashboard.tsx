import { useMemo } from 'react';
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
  'calendar-feeds': 'Calendars',
};
const TILE_IDS = ['agents', 'jobs', 'sessions', 'vm-health', 'prs', 'ci', 'sms', 'telegram', 'plaud', 'cliniko', 'errors', 'calendar-feeds'] as const;

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
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        qc.invalidateQueries({ queryKey: ['hud', 'snapshot'] });
        if (tries >= 6) clearInterval(iv);
      }, 5000);
    },
  });

  // Snapshot widgets — undefined-safe so the hooks below can run before data arrives.
  const w = data?.widgets;
  const widgetEnabled = (id: string) => cfg?.widgets?.[id] !== false;

  // Slice each region's props with useMemo so the snapshot reference churning
  // every SSE tick doesn't bust the memoized region components. Each useMemo
  // key list captures only the *individual widget references* it consumes,
  // and SSE deltas preserve untouched widget refs, so unrelated updates
  // become pure no-ops downstream.
  const briefText = useMemo(
    () => (w?.['brief']?.data as { text?: string } | undefined)?.text
      ?? '_No brief available yet — click ↻ regen to trigger the morning brief job._',
    [w?.['brief']?.data],
  );

  const bentoProps = useMemo(() => ({
    upNext: widgetEnabled('up-next') ? ((w?.['up-next']?.data as any) ?? PLACEHOLDER) : PLACEHOLDER,
    recovery: widgetEnabled('recovery') ? ((w?.['recovery']?.data as any) ?? PLACEHOLDER) : PLACEHOLDER,
    nextDeadline: widgetEnabled('next-deadline') ? ((w?.['next-deadline']?.data as any) ?? PLACEHOLDER) : PLACEHOLDER,
    tomorrow: widgetEnabled('tomorrow') ? ((w?.['tomorrow']?.data as any) ?? PLACEHOLDER) : undefined,
  }), [
    w?.['up-next']?.data,
    w?.['recovery']?.data,
    w?.['next-deadline']?.data,
    w?.['tomorrow']?.data,
    cfg?.widgets,
  ]);

  const timelineEvents = useMemo(
    () => (w?.['timeline']?.data as { timelineEvents?: any[] } | undefined)?.timelineEvents ?? [],
    [w?.['timeline']?.data],
  );

  // nowMin only progresses one notch per minute, so deriving it inline would
  // still produce the same reference within the same minute. Use a Date.now
  // bucket so it stays stable across SSE ticks within the same minute.
  const nowMin = useMemo(() => {
    const d = new Date();
    return Math.max(0, Math.min(840, (d.getHours() - 6) * 60 + d.getMinutes()));
  }, [
    // Re-evaluate at most once per minute. Math.floor / 60000 buckets ticks.
    Math.floor(Date.now() / 60_000),
  ]);

  const mcTiles = useMemo(() => {
    if (!w) return [];
    return TILE_IDS
      .filter((id) => widgetEnabled(id))
      .filter((id) => w[id] && w[id].state !== 'disabled')
      .map((id) => ({ id, label: PRETTY[id] ?? id, snapshot: w[id] }));
  }, [
    // One key per tile widget so adding e.g. agent activity only re-derives
    // the tiles array when an actual tile widget changes, not when brief
    // or timeline tick.
    w?.['agents'], w?.['jobs'], w?.['sessions'], w?.['vm-health'],
    w?.['prs'], w?.['ci'], w?.['sms'], w?.['telegram'],
    w?.['plaud'], w?.['cliniko'], w?.['errors'], w?.['calendar-feeds'],
    cfg?.widgets,
  ]);

  const inboxItems = useMemo<InboxItemData[]>(
    () => (w?.['inbox']?.data ?? []) as InboxItemData[],
    [w?.['inbox']?.data],
  );

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
      bento={(widgetEnabled('up-next') || widgetEnabled('recovery') || widgetEnabled('next-deadline') || widgetEnabled('tomorrow')) ? (
        <BentoRow {...bentoProps} />
      ) : null}
      timeline={widgetEnabled('timeline') ? (
        <Timeline events={timelineEvents} nowMin={nowMin} />
      ) : null}
      missionControl={<MissionControl tiles={mcTiles} />}
      inbox={widgetEnabled('inbox') ? <InboxRail items={inboxItems} /> : null}
    />
  );
}
