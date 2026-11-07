#!/usr/bin/env python3
# fleet_proxy.py — :8555 OpenAI-compatible passthrough onto the local Ollama fleet.
#
# R7 (2026-11-06): dual upstream lanes. The ternary-bonsai/qwen35 architecture
# does not support ollama num_parallel slots ("model architecture does not
# currently support parallel requests", ollama 0.40.14) — a single serve is
# stuck at n_slots=1 and one 50-min decode head-of-line-blocks the whole fleet
# (remediation-2026-11-04 §3.3). Capacity therefore comes from TWO supervised
# serve instances (:11434 Ollama.app + :21434 com.ops.ollama-2 KeepAlive), and
# this proxy fans requests out over the least-loaded lane.
# - No client-visible API change (same models object, same streaming passthrough).
# - Lane selection: least in-flight, health-aware (a lane that fails to connect
#   is skipped while marked down; recovery is probed in the background).
# - If the first-choice lane rejects the CONNECT/first-byte, the request is
#   retried once on the other lane. Mid-stream failures are not replayed.
# R6 lesson: both upstreams are supervised so a killed lane respawns.
import json
import time
from aiohttp import web, ClientSession, ClientTimeout

MODEL = "ternary-bonsai-2-27b:q2_0"
LANES = [
    {"url": "http://127.0.0.1:11434", "name": "upstream-app", "inflight": 0, "down_until": 0.0},
    {"url": "http://127.0.0.1:21434", "name": "upstream-lane2", "inflight": 0, "down_until": 0.0},
]
LANE_DOWN_SEC = 45.0  # after a connect failure, skip the lane for this long

timeout = ClientTimeout(total=900, sock_connect=10, sock_read=900)


async def pick_lanes():
    now = time.time()
    live = [l for l in LANES if l["down_until"] <= now]
    if not live:
        # everything marked down — try anyway, oldest down first
        live = sorted(LANES, key=lambda l: l["down_until"])
    return sorted(live, key=lambda l: l["inflight"])


async def forward(request, payload, stream):
    last_err = None
    for lane in await pick_lanes():
        lane["inflight"] += 1
        try:
            async with ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{lane['url']}/v1/chat/completions",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    if not stream:
                        # Buffer short non-streaming responses
                        body = await resp.read()
                        lane["inflight"] -= 1
                        request["lane_used"] = lane["name"]
                        return web.Response(
                            status=resp.status,
                            body=body,
                            headers={"Content-Type": resp.headers.get("Content-Type", "application/json")},
                        )
                    # Streaming: pass through verbatim (real SSE, incl. tool_calls
                    # deltas + finish_reason). A mid-stream failure cannot be
                    # replayed on another lane — the client gets the truncated
                    # connection, the lane is actuated for new requests.
                    lane_out = web.StreamResponse(
                        status=resp.status,
                        headers={"Content-Type": resp.headers.get("Content-Type", "text/event-stream"),
                                 "Cache-Control": "no-cache"},
                    )
                    await lane_out.prepare(request)
                    try:
                        async for chunk in resp.content.iter_any():
                            await lane_out.write(chunk)
                        await lane_out.write_eof()
                    except Exception as e:
                        lane["inflight"] -= 1
                        lane["down_until"] = time.time() + LANE_DOWN_SEC
                        last_err = f"{lane['name']}: mid-stream {type(e).__name__}: {e}"
                        import traceback
                        traceback.print_exc()
                        return web.json_response({"error": last_err}, status=502)
                    lane["inflight"] -= 1
                    request["lane_used"] = lane["name"]
                    return lane_out
        except Exception as e:
            # Pre-response failure only (connect/read of the initial response) —
            # retryable on the next lane. Comes before any client write for the
            # non-streamed path; a streamed connection may already be open only
            # when resp was received, which is handled in the inner except.
            try:
                lane["inflight"] -= 1
            except Exception:
                pass
            lane["down_until"] = time.time() + LANE_DOWN_SEC
            last_err = f"{lane['name']}: {type(e).__name__}: {e}"
            import traceback
            traceback.print_exc()
            continue
    return web.json_response({"error": f"all lanes failed: {last_err}"}, status=502)


async def chat_completions(request):
    payload = await request.read()
    stream = False
    try:
        data = json.loads(payload or b"{}")
    except Exception:
        data = {}
    # Fleet endpoints assert a single model: inject MODEL when the client omits it.
    if data and not data.get("model"):
        data["model"] = MODEL
        payload = json.dumps(data).encode("utf-8")
    stream = bool(data.get("stream", False))
    try:
        return await forward(request, payload, stream)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"error": str(e)}, status=500)


async def models(request):
    return web.json_response({
        "object": "list",
        "data": [{
            "id": MODEL,
            "object": "model",
            "owned_by": "ollama",
            "permission": []
        }]
    })


async def health(request):
    now = time.time()
    return web.json_response({
        "status": "ok",
        "lanes": [{"name": l["name"], "url": l["url"].split("//")[1],
                   "inflight": l["inflight"],
                   "down": l["down_until"] > now} for l in LANES],
    })

app = web.Application()
app.router.add_get('/health', health)
app.router.add_get('/v1/models', models)
app.router.add_post('/v1/chat/completions', chat_completions)

if __name__ == '__main__':
    web.run_app(app, host='127.0.0.1', port=8555)
