import { createFileRoute } from '@tanstack/react-router';
import { runAggregator } from '../../../server/hud/aggregator';
import { adapterRegistry } from '../../../server/hud/sources';
import { HUDCache } from '../../../server/hud/cache';
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

const cache = new HUDCache();

export async function snapshotHandler(): Promise<Response> {
  const snap = await runAggregator(adapterRegistry, { deadlineMs: 1500, cache });

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
