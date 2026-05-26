import { createFileRoute } from '@tanstack/react-router';
import { runAggregator } from '../../../server/hud/aggregator';
import { adapterRegistry } from '../../../server/hud/sources';
import { HUDCache } from '../../../server/hud/cache';
import { loadHUDConfig } from '../../../lib/hud/config';
import { buildInboxFeed } from '../../../server/hud/severity';
import type { InboxItemData } from '../../../components/hud/InboxItem';
import '../../../server/hud/sources/vm-health';
import '../../../server/hud/sources/errors';
import '../../../server/hud/sources/jobs';
import '../../../server/hud/sources/agents';
import '../../../server/hud/sources/sms';
import '../../../server/hud/sources/telegram';
import '../../../server/hud/sources/cliniko-today';
import '../../../server/hud/sources/plaud';
import '../../../server/hud/sources/google-calendar';
import '../../../server/hud/sources/brief';
import '../../../server/hud/sources/whoop';
import '../../../server/hud/sources/sessions';
import '../../../server/hud/sources/pr-ci';
import '../../../server/hud/sources/uni-deadlines';
import '../../../server/hud/sources/calendar-feeds-health';
import '../../../server/hud/sources/tomorrow';

const cache = new HUDCache();

export async function snapshotHandler(): Promise<Response> {
  const snap = await runAggregator(adapterRegistry, { deadlineMs: 1500, cache });

  const cfg = await loadHUDConfig();

  // Fan out CalendarData into a separate up-next widget snapshot
  const calWidget = snap.widgets['timeline'];
  if (calWidget?.state === 'loaded' && calWidget.data) {
    const d = calWidget.data as any;
    snap.widgets['up-next'] = {
      id: 'up-next',
      state: d.upNext ? 'loaded' : 'loading',
      data: d.upNext,
      fetchedAt: calWidget.fetchedAt,
      ttlMs: calWidget.ttlMs,
    };
  }

  // Build inbox feed from contributing sources
  const items: InboxItemData[] = [];

  // Calendar urgents
  const cal = snap.widgets['timeline'];
  const urgents = (cal?.data as any)?.urgentItems ?? [];
  items.push(...urgents);

  // PLAUD untranscribed -> info item if > 0
  const plaud = snap.widgets['plaud'];
  if (plaud?.state === 'loaded' && Number((plaud.data as any)?.value) > 0) {
    items.push({
      id: 'plaud-untranscribed',
      severity: 'info',
      tag: 'PLAUD',
      body: (plaud.data as any).value + ' untranscribed recordings',
      when: 'now',
    });
  }

  // PRs needing review -> info item
  const prs = snap.widgets['prs'];
  if (prs?.state === 'loaded' && /need review/i.test((prs.data as any)?.sub ?? '')) {
    items.push({
      id: 'prs-review-needed',
      severity: 'info',
      tag: 'PR',
      body: (prs.data as any).sub,
      when: 'now',
    });
  }

  // Job failures -> warn
  const jobs = snap.widgets['jobs'];
  if (jobs?.state === 'loaded' && /fail/.test((jobs.data as any)?.sub ?? '')) {
    items.push({
      id: 'jobs-failed',
      severity: 'warn',
      tag: 'JOB',
      body: (jobs.data as any).sub + ' in last 24h',
      when: 'today',
    });
  }

  // Uni deadlines -> urgent/warn inbox item.
  // Fallback: if Obsidian source is empty/null, derive from next event in calendar's Uni+Study calendar.
  const uniWidget = snap.widgets['next-deadline'];
  const calDataAny = cal?.data as any;
  let uniData: any = null;
  if (uniWidget?.state === 'loaded' && uniWidget.data) {
    uniData = uniWidget.data;
  } else if (calDataAny?.nextUniEvent) {
    const ne = calDataAny.nextUniEvent;
    const labelTime = ne.daysOut <= 0 ? 'TODAY' : ne.daysOut === 1 ? 'TOMORROW' : ne.daysOut + 'D';
    uniData = {
      label: 'UNI · ' + labelTime,
      title: ne.title,
      sub: ne.calendarName || 'uni',
    };
    // Also publish synthesized data into the next-deadline widget so the Bento card shows it
    snap.widgets['next-deadline'] = {
      id: 'next-deadline',
      state: 'loaded',
      data: uniData,
      fetchedAt: cal!.fetchedAt,
      ttlMs: cal!.ttlMs,
    };
  }
  if (uniData) {
    items.push({
      id: 'uni-' + uniData.title,
      severity: uniData.label.includes('TODAY') || uniData.label.includes('TOMORROW') ? 'urgent' : 'warn',
      tag: 'UNI',
      body: uniData.title + ' ' + uniData.sub,
      when: uniData.label.replace('UNI · ', ''),
    });
  }

  snap.widgets['inbox'] = {
    id: 'inbox',
    state: 'loaded',
    data: buildInboxFeed(items, cfg) as any,
    fetchedAt: Date.now(),
    ttlMs: 60_000,
  };

  return new Response(JSON.stringify(snap), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const Route = createFileRoute('/api/hud/snapshot')({
  server: {
    handlers: {
      GET: snapshotHandler,
    },
  },
});
