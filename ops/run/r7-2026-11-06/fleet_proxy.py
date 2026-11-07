#!/usr/bin/env python3
import json
from aiohttp import web, ClientSession, ClientTimeout

OLLAMA_URL = "http://127.0.0.1:11434"
MODEL = "ternary-bonsai-2-27b:q2_0"

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
    timeout = ClientTimeout(total=900, sock_connect=10, sock_read=900)
    try:
        async with ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{OLLAMA_URL}/v1/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json"},
            ) as resp:
                if not stream:
                    # Buffer short non-streaming responses
                    body = await resp.read()
                    return web.Response(
                        status=resp.status,
                        body=body,
                        headers={"Content-Type": resp.headers.get("Content-Type", "application/json")},
                    )
                out = web.StreamResponse(
                    status=resp.status,
                    headers={"Content-Type": resp.headers.get("Content-Type", "text/event-stream"),
                             "Cache-Control": "no-cache"},
                )
                await out.prepare(request)
                # Stream chunks through verbatim (real SSE, incl. tool_calls deltas + finish_reason)
                async for chunk in resp.content.iter_any():
                    await out.write(chunk)
                await out.write_eof()
                return out
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
    return web.json_response({"status": "ok"})

app = web.Application()
app.router.add_get('/health', health)
app.router.add_get('/v1/models', models)
app.router.add_post('/v1/chat/completions', chat_completions)

if __name__ == '__main__':
    web.run_app(app, host='127.0.0.1', port=8555)
