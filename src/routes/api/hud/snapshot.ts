import { createFileRoute } from '@tanstack/react-router';
import { runAggregator } from '../../../server/hud/aggregator';
import { adapterRegistry } from '../../../server/hud/sources';
import { HUDCache } from '../../../server/hud/cache';
import '../../../server/hud/sources/vm-health';
import '../../../server/hud/sources/errors';
import '../../../server/hud/sources/jobs';
import '../../../server/hud/sources/agents';
import '../../../server/hud/sources/sms';

const cache = new HUDCache();

export async function snapshotHandler(): Promise<Response> {
  const snap = await runAggregator(adapterRegistry, { deadlineMs: 1500, cache });
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
