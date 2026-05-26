/**
 * GET /api/hud/stream
 *
 * Server-Sent Events live HUD feed. Streams an initial 'snapshot' event
 * with the full HUDSnapshot, then per-widget 'widget' events whenever a
 * source'"'"'s data changes. Comment-only ': ping' lines every 25s keep
 * intermediate proxies from killing idle connections.
 *
 * The heartbeat loop is per-connection: each EventSource client gets its
 * own setInterval. runAggregator hits the shared file-backed HUDCache, so
 * most ticks are cheap (no fan-out fetches when within TTL).
 *
 * Auth-gated identically to the rest of /api/hud — local IP shortcut or
 * authenticated session cookie.
 */
import { createFileRoute } from '@tanstack/react-router';
import { buildHUDSnapshot } from '../../../server/hud/build-snapshot';
import { isAuthenticated, isLocalRequest } from '../../../server/auth-middleware';
import type { WidgetSnapshot } from '../../../server/hud/types';

const HEARTBEAT_MS = Number(process.env.HUD_STREAM_HEARTBEAT_MS || '5000');
const KEEPALIVE_MS = Number(process.env.HUD_STREAM_KEEPALIVE_MS || '25000');

export const Route = createFileRoute('/api/hud/stream')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request) && !isLocalRequest(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const encoder = new TextEncoder();
        let cancelled = false;
        let heartbeatId: ReturnType<typeof setInterval> | null = null;
        let keepaliveId: ReturnType<typeof setInterval> | null = null;
        let lastWidgets: Record<string, WidgetSnapshot> = {};

        const stream = new ReadableStream({
          start(controller) {
            const send = (event: string, data: unknown) => {
              if (cancelled) return;
              try {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              } catch {
                cancelled = true;
              }
            };

            const sendPing = () => {
              if (cancelled) return;
              try {
                controller.enqueue(encoder.encode(`: ping\n\n`));
              } catch {
                cancelled = true;
              }
            };

            const teardown = () => {
              if (cancelled) return;
              cancelled = true;
              if (heartbeatId) clearInterval(heartbeatId);
              if (keepaliveId) clearInterval(keepaliveId);
              try {
                controller.close();
              } catch {
                // already closed
              }
            };

            // Listen for client disconnect via AbortSignal so we don't leak
            // the per-connection intervals after the EventSource closes.
            request.signal.addEventListener('abort', teardown);

            // Initial snapshot
            (async () => {
              try {
                const snap = await buildHUDSnapshot();
                lastWidgets = { ...snap.widgets };
                send('snapshot', snap);
              } catch (err) {
                send('error', {
                  message: err instanceof Error ? err.message : 'initial snapshot failed',
                });
                teardown();
              }
            })();

            const tick = async () => {
              if (cancelled) return;
              try {
                const snap = await buildHUDSnapshot();
                for (const [id, widget] of Object.entries(snap.widgets)) {
                  const prev = lastWidgets[id];
                  const prevDataStr = prev ? JSON.stringify(prev.data) : '';
                  const curDataStr = JSON.stringify(widget.data);
                  if (
                    !prev ||
                    prev.state !== widget.state ||
                    prevDataStr !== curDataStr
                  ) {
                    send('widget', { id, snapshot: widget });
                  }
                }
                lastWidgets = { ...snap.widgets };
              } catch (err) {
                send('error', {
                  message: err instanceof Error ? err.message : 'tick failed',
                });
              }
            };

            heartbeatId = setInterval(tick, HEARTBEAT_MS);
            keepaliveId = setInterval(sendPing, KEEPALIVE_MS);
          },
          cancel() {
            cancelled = true;
            if (heartbeatId) clearInterval(heartbeatId);
            if (keepaliveId) clearInterval(keepaliveId);
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            // Tells reverse proxies (nginx, cloudflared) not to buffer the
            // response — without this, SSE events arrive in batches once the
            // proxy decides to flush its buffer.
            'X-Accel-Buffering': 'no',
          },
        });
      },
    },
  },
});
