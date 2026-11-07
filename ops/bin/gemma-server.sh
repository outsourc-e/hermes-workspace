#!/usr/bin/env bash
# gemma-server.sh — fleet primary model server on :8555 via Ollama (native, stable, MLX backend).
# LEGACY FILENAME: still named "gemma-server.sh" so existing docs/scripts/launchd keep working;
# it is a generic Ollama→OpenAI proxy for whatever the fleet model is.
# Model: ternary-bonsai-2-27b:q2_0 (Ternary-Bonsai-2-27B Q2_0 ~7.6GB) — imported into Ollama 2026-11-03.
# Retired: gemma4:12b (Q4_K_M ~8GB).
# Runs on port 11434, proxied to :8555 for Hermes compatibility.
set -euo pipefail

OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$OPS_DIR/run"; mkdir -p "$RUN_DIR"
PIDFILE="$RUN_DIR/gemma-8555.pid"
LOG="$RUN_DIR/gemma-8555.log"
PORT=8555
OLLAMA_PORT=11434
MODEL="ternary-bonsai-2-27b:q2_0"

# Increase Metal wired memory limit (also helps MLX)
if ! sysctl -n iogpu.wired_limit_mb | grep -q '^32768$'; then
    echo "Setting iogpu.wired_limit_mb=32768 (requires sudo)..."
    sudo sysctl iogpu.wired_limit_mb=32768 2>/dev/null || echo "Warning: Could not set wired_limit_mb (need sudo)"
fi

FLOCK_FILE="/tmp/gemma-8555.lock"

serving() {
  curl -sf -m 5 "http://127.0.0.1:$PORT/v1/models" 2>/dev/null | grep -qi "ternary-bonsai"
}

# Health check via Ollama
ollama_healthy() {
  curl -sf -m 5 "http://127.0.0.1:$OLLAMA_PORT/api/tags" >/dev/null 2>&1
}

# Start Ollama if not running
ensure_ollama() {
  if ! ollama_healthy; then
    echo "Starting Ollama..."
    nohup ollama serve >>"$LOG" 2>&1 &
    local pid=$!
    echo $pid > "$RUN_DIR/ollama.pid"
    for i in $(seq 1 30); do
      sleep 1
      if ollama_healthy; then
        echo "Ollama started"
        return 0
      fi
    done
    echo "FAIL: Ollama failed to start"
    return 1
  fi
}

# Start the proxy (Ollama -> OpenAI compatible on :8555)
start_proxy() {
  # Python proxy: thin pass-through Ollama :11434/v1 -> :8555 (OpenAI-compatible).
  # 2026-11-03 rewrite v2: instead of hand-translating OpenAI <-> Ollama NDJSON
  # (which dropped streamed tool_calls/finish_reason, then hit Ollama's
  # /api/chat parser bug on assistant tool_calls with string `arguments` —
  # "Value looks like object, but can't find closing '}' symbol"), we forward
  # the request byte-for-byte to Ollama's native OpenAI-compatible endpoint,
  # which normalizes the full OpenAI schema (assistant tool_calls + tool
  # results, streaming SSE) correctly. :8555 keeps its role as the fleet's
  # stable identity-asserted endpoint for scripts and probes.
  cat > /tmp/fleet_proxy.py << 'PYEOF'
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
PYEOF

  # Start the proxy
  # 2026-11-05: run the extracted copy in $OPS_DIR/bin (launchd-managed proxy also
  # launches that file — a /tmp write is not reproducible across reboot/cleanup).
  nohup python3 "$OPS_DIR/bin/fleet_proxy.py" >>"$LOG" 2>&1 &
  local pid=$!
  echo $pid > "$PIDFILE"

  # Wait for proxy to be ready
  for i in $(seq 1 30); do
    sleep 1
    if curl -sf "http://127.0.0.1:8555/health" >/dev/null 2>&1; then
      echo "Proxy started on :8555"
      return 0
    fi
  done
  echo "FAIL: Proxy failed to start"
  return 1
}

case "${1:-status}" in
  start)
    if serving; then echo "PASS already serving on :$PORT"; exit 0; fi

    # Ensure Ollama is running
    ensure_ollama || exit 1

    # Start proxy
    start_proxy || exit 1

    # Verify model is loaded
    for i in $(seq 1 30); do
      sleep 2
      if curl -sf "http://127.0.0.1:8555/v1/models" | grep -qi "ternary-bonsai"; then
        echo "PASS serving on :$PORT (model: ternary-bonsai-2-27b:q2_0)"
        exit 0
      fi
    done
    echo "FAIL: Model not available via proxy"
    exit 1
    ;;
  stop)
    if [ -f "$PIDFILE" ]; then
      P=$(cat "$PIDFILE")
      if kill -0 "$P" 2>/dev/null; then kill "$P"; sleep 2; kill -9 "$P" 2>/dev/null; fi
      rm -f "$PIDFILE"
    fi
    # Kill both old (gemma) and current (fleet) proxy names — stale /tmp proxies keep serving
    # the retired model otherwise.
    pkill -f "gemma_proxy.py" 2>/dev/null
    pkill -f "fleet_proxy.py" 2>/dev/null
    if [ -f "$RUN_DIR/ollama.pid" ]; then
      OP=$(cat "$RUN_DIR/ollama.pid")
      if kill -0 "$OP" 2>/dev/null; then kill "$OP"; sleep 2; kill -9 "$OP" 2>/dev/null; fi
      rm -f "$RUN_DIR/ollama.pid"
    fi
    echo "PASS stopped (if running)"; exit 0
    ;;
  status)
    if serving; then echo "PASS serving on :$PORT"; exit 0; else echo "FAIL not serving on :$PORT"; exit 1; fi
    ;;
  *) echo "usage: gemma-server.sh {start|stop|status}"; exit 64 ;;
esac
