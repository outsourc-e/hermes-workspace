# Hermes Inference Server Setup — Unsloth Qwen3.8-27B-Heretic with Metal GPU Acceleration

## Overview

This document describes the complete setup for running the **Unsloth Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF** model (Q4_K_M quantization) as the inference backend for Hermes Agent, using **llama.cpp with Metal GPU acceleration** on Apple Silicon.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Browser                                    │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTP :3011
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Hermes Workspace (TanStack Start)                        │
│  - Serves UI on port 3011                                                 │
│  - /api/hermes-proxy/* → authenticated proxy to gateway                   │
│  - /api/gateway-status, /api/connection-status → health checks            │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTP :8642 + Bearer token
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Hermes Gateway (hermes-agent)                            │
│  - Port 8642: OpenAI-compatible API server                                │
│  - /v1/chat/completions → forwards to inference server                     │
│  - /v1/models → lists "hermes-agent"                                       │
│  - Port 8644: Webhook receiver                                             │
│  - Port 9119: Dashboard (separate service)                                 │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │ HTTP :8555 (OpenAI-compatible)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              llama.cpp Server (Metal GPU Accelerated)                       │
│  - Model: Qwen3.8-27B-Heretic-Q4_K_M.gguf (15 GB)                          │
│  - Context: 65536 tokens (Hermes minimum requirement)                      │
│  - Metal: FULL GPU offload (-ngl 99) on Apple M2 Max                       │
│  - KV Cache: q8_0 quantized (50% memory savings)                           │
│  - Reasoning: DISABLED (--reasoning off)                                   │
│  - Threads: 10 (leaving 2 cores for OS/gateway)                            │
│  - Performance: ~230 tok/s prompt, ~17 tok/s generation                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Model Details

| Property | Value |
|----------|-------|
| **Model** | 0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF |
| **Quantization** | Q4_K_M (4-bit, medium quality) |
| **Size** | 15.4 GiB |
| **Parameters** | 26.9 B |
| **Training Context** | 262,144 tokens |
| **Serving Context** | 65,536 tokens (Hermes minimum) |
| **Source** | Hugging Face cache (downloaded via unsloth.ai) |
| **File Location** | `~/.cache/huggingface/hub/models--0bserverx--Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF/snapshots/20b94f0613b632b4848bbe3b1e05d9ee0c2b1608/Qwen3.8-27B-Heretic-Q4_K_M.gguf` |

---

## Hardware & Resources

| Resource | Specification |
|----------|---------------|
| **CPU** | Apple M2 Max (12 cores: 8 performance + 4 efficiency) |
| **RAM** | 64 GB Unified Memory |
| **GPU** | Apple M2 Max GPU (38 cores, Metal family Apple8) |
| **llama.cpp Build** | b10269-1.6.0 (commit 34d749cb5) with Metal support |

---

## Dynamic Context Size Calculation

The launch script automatically calculates the optimal context size:

```bash
# Available RAM = Total - System Reserved - Model Weights - Safety Margin
TOTAL_RAM = 64 GB
SYSTEM_RESERVED = 8 GB (macOS + background apps)
MODEL_WEIGHTS = 15 GB (Q4_K_M)
SAFETY_MARGIN = 20%

AVAILABLE_FOR_KV = (64 - 8 - 15) * 0.80 = 32.8 GB

# KV cache overhead for 27B model: ~0.12 MB per 1K tokens
MAX_TOKENS = 32.8 GB / 0.12 MB ≈ 280,000 tokens

# Capped at model max (131072) and Hermes minimum (65536)
FINAL_CTX_SIZE = min(131072, max(65536, 280000)) = 65536
```

**Result**: 65,536 tokens — meets Hermes minimum, leaves ample headroom.

---

## Launch Script

**File**: `~/.hermes/launch-llama-server.sh`

```bash
#!/usr/bin/env bash
# Dynamic llama.cpp server launcher for Hermes
# Calculates optimal context size based on available RAM
# Uses Metal acceleration, quantized KV cache, reasoning OFF

set -euo pipefail

MODEL_PATH="/Users/andreasnahrgang/.cache/huggingface/hub/models--0bserverx--Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF/snapshots/20b94f0613b632b4848bbe3b1e05d9ee0c2b1608/Qwen3.8-27B-Heretic-Q4_K_M.gguf"
LLAMA_SERVER="/Users/andreasnahrgang/Library/Application Support/Atomic Chat/data/llamacpp/backends/b10269-1.6.0/macos-arm64/build/bin/llama-server"
PID_FILE="/Users/andreasnahrgang/.hermes/llama-server.pid"
LOG_FILE="/Users/andreasnahrgang/.hermes/logs/llama-server.log"

# Calculate available RAM (macOS)
TOTAL_RAM_GB=$(sysctl -n hw.memsize | awk '{print $1/1024/1024/1024}')
MODEL_SIZE_GB=15
SYSTEM_RESERVED_GB=8
SAFETY_MARGIN=0.20

AVAILABLE_GB=$(echo "$TOTAL_RAM_GB - $SYSTEM_RESERVED_GB - $MODEL_SIZE_GB" | bc -l)
AVAILABLE_FOR_KV=$(echo "$AVAILABLE_GB * (1 - $SAFETY_MARGIN)" | bc -l)

# KV cache: ~0.12 MB per 1K tokens for 27B model
KB_PER_GB=1048576
MAX_TOKENS=$(echo "$AVAILABLE_FOR_KV * $KB_PER_GB / 0.12" | bc -l | awk '{print int($1)}')
MODEL_MAX_CTX=131072
CTX_SIZE=$(( MAX_TOKENS > MODEL_MAX_CTX ? MODEL_MAX_CTX : MAX_TOKENS ))

# Minimum sensible context
MIN_CTX=4096
CTX_SIZE=$(( CTX_SIZE < MIN_CTX ? MIN_CTX : CTX_SIZE ))

# Cap at 65536 for Hermes (requires min 64K context)
MAX_REASONABLE_CTX=65536
CTX_SIZE=$(( CTX_SIZE > MAX_REASONABLE_CTX ? MAX_REASONABLE_CTX : CTX_SIZE ))

# Hermes minimum
MIN_HERMES_CTX=65536
CTX_SIZE=$(( CTX_SIZE < MIN_HERMES_CTX ? MIN_HERMES_CTX : CTX_SIZE ))

echo "=== llama.cpp Server Launch ==="
echo "Total RAM: ${TOTAL_RAM_GB} GB"
echo "Model: ${MODEL_SIZE_GB} GB"
echo "Available for KV: ${AVAILABLE_FOR_KV} GB"
echo "Calculated ctx-size: ${CTX_SIZE}"
echo "Model max: ${MODEL_MAX_CTX}"
echo "Performance cap: ${MAX_REASONABLE_CTX}"
echo "Final ctx-size: ${CTX_SIZE}"
echo "Metal: enabled (-ngl 99)"
echo "KV cache: q8_0 quantized"
echo "Reasoning: OFF (--reasoning off)"
echo "Threads: 10 (leaving 2 for OS/gateway)"
echo "================================"

# Kill existing
if [[ -f "$PID_FILE" ]]; then
    kill $(cat "$PID_FILE") 2>/dev/null || true
    sleep 2
fi

# Launch with Metal acceleration, quantized KV cache, 10 threads, reasoning OFF
exec "$LLAMA_SERVER" \
    -m "$MODEL_PATH" \
    --port 8555 \
    --host 127.0.0.1 \
    --ctx-size "$CTX_SIZE" \
    --threads 10 \
    --threads-batch 10 \
    --batch-size 2048 \
    --ubatch-size 512 \
    --no-mmap \
    --mlock \
    --cont-batching \
    --cache-type-k q8_0 \
    --cache-type-v q8_0 \
    -ngl 99 \
    --reasoning off \
    > "$LOG_FILE" 2>&1 &

echo $! > "$PID_FILE"
echo "Started llama-server (PID: $!) with ctx-size=$CTX_SIZE"
```

**Make executable**: `chmod +x ~/.hermes/launch-llama-server.sh`

---

## Launchd Service (Auto-Start on Boot + On-Demand)

**File**: `~/Library/LaunchAgents/com.hermes.llama-server.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.hermes.llama-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/andreasnahrgang/.hermes/launch-llama-server.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/andreasnahrgang/.hermes/logs/llama-server-launchd.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/andreasnahrgang/.hermes/logs/llama-server-launchd.err</string>
    <key>WorkingDirectory</key>
    <string>/Users/andreasnahrgang/.hermes</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
```

**Install**:
```bash
launchctl load ~/Library/LaunchAgents/com.hermes.llama-server.plist
```

**Uninstall**:
```bash
launchctl unload ~/Library/LaunchAgents/com.hermes.llama-server.plist
```

**Status**:
```bash
launchctl list | grep llama-server
# -  127  com.hermes.llama-server   (dash = launchd manages it, starts on demand)
```

---

## On-Demand Startup Scripts

### 1. Shell Wrapper (`~/.hermes/ensure-llama-server.sh`)

**Purpose**: Idempotent check-and-start for shell scripts, cron, CI/CD.

```bash
#!/usr/bin/env bash
# Ensure llama.cpp server is running
# Called by Hermes gateway before making inference requests
# Returns 0 if server is ready, 1 if failed to start

set -euo pipefail

HEALTH_URL="http://127.0.0.1:8555/health"
MAX_WAIT=60
CHECK_INTERVAL=2

# Quick health check
if curl -s --max-time 3 "$HEALTH_URL" | grep -q '"status":"ok"'; then
    exit 0
fi

echo "[ensure-llama-server] Server not responding, starting..."

# Start the server
/Users/andreasnahrgang/.hermes/launch-llama-server.sh

# Wait for it to become healthy
ELAPSED=0
while [[ $ELAPSED -lt $MAX_WAIT ]]; do
    if curl -s --max-time 3 "$HEALTH_URL" | grep -q '"status":"ok"'; then
        echo "[ensure-llama-server] Server ready after ${ELAPSED}s"
        exit 0
    fi
    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
done

echo "[ensure-llama-server] ERROR: Server failed to start within ${MAX_WAIT}s"
exit 1
```

**Usage**:
```bash
# Make executable
chmod +x ~/.hermes/ensure-llama-server.sh

# In scripts - ensures server is up before proceeding
/Users/andreasnahrgang/.hermes/ensure-llama-server.sh
# Returns 0 immediately if running, waits up to 60s if starting
```

---

### 2. Python Module (`~/.hermes/ensure_llama_server.py`)

**Purpose**: Importable module for Hermes gateway integration (pre-request hook).

```python
#!/usr/bin/env python3
"""
Ensure llama.cpp inference server is running.
Can be imported by Hermes gateway for on-demand startup.
"""

import subprocess
import time
import requests
import sys
from pathlib import Path

LAUNCH_SCRIPT = Path("/Users/andreasnahrgang/.hermes/launch-llama-server.sh")
HEALTH_URL = "http://127.0.0.1:8555/health"
MAX_WAIT = 90
CHECK_INTERVAL = 3


def is_server_healthy() -> bool:
    """Check if llama.cpp server is responding."""
    try:
        resp = requests.get(HEALTH_URL, timeout=3)
        return resp.status_code == 200 and resp.json().get("status") == "ok"
    except Exception:
        return False


def start_server() -> subprocess.Popen:
    """Start the llama.cpp server via launch script."""
    print("[ensure_llama_server] Starting llama.cpp server...", file=sys.stderr)
    proc = subprocess.Popen(
        [str(LAUNCH_SCRIPT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    return proc


def wait_for_server(timeout: int = MAX_WAIT) -> bool:
    """Wait for server to become healthy."""
    elapsed = 0
    while elapsed < timeout:
        if is_server_healthy():
            print(f"[ensure_llama_server] Server ready after {elapsed}s", file=sys.stderr)
            return True
        time.sleep(CHECK_INTERVAL)
        elapsed += CHECK_INTERVAL
    return False


def ensure_server() -> bool:
    """Ensure llama.cpp server is running and healthy."""
    if is_server_healthy():
        return True

    print("[ensure_llama_server] Server not healthy, starting...", file=sys.stderr)
    proc = start_server()

    try:
        return wait_for_server()
    finally:
        # Don't wait for the process, it runs detached
        pass


if __name__ == "__main__":
    success = ensure_server()
    sys.exit(0 if success else 1)
```

**Usage in Hermes Gateway** (add to gateway startup or as pre-request hook):
```python
# In gateway code before /v1/chat/completions requests
from ensure_llama_server import ensure_server

if ensure_server():
    # Server is ready, make inference request
    requests.post("http://127.0.0.1:8555/v1/chat/completions", ...)
```

**CLI Usage**:
```bash
python3 ~/.hermes/ensure_llama_server.py
# Exit code 0 = ready, 1 = failed
```

---

## Configuration Files

### Hermes Gateway Config (`~/.hermes/config.yaml`)

```yaml
model:
  provider: custom
  base_url: http://127.0.0.1:8555/v1
  max_tokens: 4096
  default: 0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF
providers:
  custom:
    request_timeout_seconds: 600
fallback_model:
  provider: custom
  model: 0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF
  base_url: http://127.0.0.1:8555/v1
# ... all auxiliary providers also point to http://127.0.0.1:8555/v1
```

### Hermes Gateway Env (`~/.hermes/.env`)

```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=hermes_internal_secret_key_2026
API_SERVER_HOST=0.0.0.0
API_SERVER_PORT=8642
GATEWAY_API_ENABLED=true
GATEWAY_API_PORT=8642
```

### Workspace Env (`hermes-workspace/.env`)

```bash
HERMES_API_URL=http://127.0.0.1:8642
HERMES_API_TOKEN=hermes_internal_secret_key_2026
HERMES_DASHBOARD_URL=http://127.0.0.1:9119
```

---

## Verification Checklist

Run these commands in order to verify the full stack:

### 1. llama.cpp Server Health
```bash
curl -s http://127.0.0.1:8555/health
# Expected: {"status":"ok"}

curl -s http://127.0.0.1:8555/v1/models | jq '.data[0].meta.n_ctx'
# Expected: 65536
```

### 2. Direct Inference Test
```bash
curl -s --max-time 60 http://127.0.0.1:8555/v1/chat/completions \
  -X POST -H "Content-Type: application/json" \
  -d '{"model":"hermes-agent","messages":[{"role":"user","content":"Say hello"}],"max_tokens":50,"temperature":0.7}'
# Expected: JSON response with "content" field
```

### 3. Hermes Gateway Health
```bash
curl -s http://127.0.0.1:8642/health
# Expected: {"status":"ok","platform":"hermes-agent","version":"..."}

curl -s -H "Authorization: Bearer hermes_internal_secret_key_2026" \
  http://127.0.0.1:8642/v1/chat/completions \
  -X POST -H "Content-Type: application/json" \
  -d '{"model":"hermes-agent","messages":[{"role":"user","content":"hi"}],"max_tokens":20}'
# Expected: JSON response
```

### 4. Workspace Proxy Test
```bash
curl -s http://127.0.0.1:3011/api/gateway-status | jq .mode,.gateway.available
# Expected: "zero-fork", true

curl -s http://127.0.0.1:3011/api/connection-status | jq .ok
# Expected: true

curl -s --max-time 60 http://127.0.0.1:3011/api/hermes-proxy/v1/chat/completions \
  -X POST -H "Content-Type: application/json" \
  -d '{"model":"hermes-agent","messages":[{"role":"user","content":"test"}],"max_tokens":50}'
# Expected: JSON response
```

### 5. Metal GPU Verification
```bash
# Check Metal is active in logs
grep -i "metal\|gpu\|MTL" /Users/andreasnahrgang/.hermes/logs/llama-server.log

# Run benchmark
"/Users/andreasnahrgang/Library/Application Support/Atomic Chat/data/llamacpp/backends/b10269-1.6.0/macos-arm64/build/bin/llama-bench" \
  -m "$MODEL_PATH" -ngl 99 -p 512 -n 128 -t 4
# Expected: backend = "MTL,BLAS", prompt ~200+ tok/s
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| **Port 8555 in use** | Previous server not killed | `pkill -f llama-server; sleep 3` |
| **Context too small** | Hermes requires ≥64K | Set `--ctx-size 65536` in launch script |
| **Slow inference (<50 tok/s)** | Metal not working | Verify `-ngl 99`, check `ggml_metal` in logs, use b10269 build |
| **Model not found** | Wrong path | Verify MODEL_PATH in launch script matches actual file |
| **Hermes rejects model** | Gateway cached old context | `hermes gateway restart` after llama-server restart |
| **OOM / crash** | Context too large | Reduce MAX_REASONABLE_CTX, increase SAFETY_MARGIN |
| **Reasoning output** | Model thinks | Add `--reasoning off` to launch command |

---

## Resource Tuning Options

### Threading
```bash
# Current: 10 threads (leaves 2 for OS)
--threads 10 --threads-batch 10

# For maximum throughput (use all cores):
--threads 12 --threads-batch 12

# For lower latency (interactive):
--threads 8 --threads-batch 8
```

### Batch Sizes
```bash
# Current: balanced
--batch-size 2048 --ubatch-size 512

# Higher throughput (more VRAM):
--batch-size 4096 --ubatch-size 1024

# Lower latency:
--batch-size 1024 --ubatch-size 256
```

### KV Cache Quantization
```bash
# Current: q8_0 (8-bit, 50% savings, minimal quality loss)
--cache-type-k q8_0 --cache-type-v q8_0

# Higher quality (more VRAM):
--cache-type-k f16 --cache-type-v f16

# Maximum savings (lower quality):
--cache-type-k q4_0 --cache-type-v q4_0
```

### Metal Options
```bash
# Current: full offload
-ngl 99

# Partial offload (if OOM):
-ngl 60

# Disable Metal (CPU only):
-ngl 0
```

---

## Monitoring

### Log Locations
| Component | Log File |
|-----------|----------|
| llama.cpp server | `~/.hermes/logs/llama-server.log` |
| Hermes gateway | `~/.hermes/logs/gateway.log` |
| Gateway errors | `~/.hermes/logs/gateway.error.log` |
| Launchd stdout | `~/.hermes/logs/llama-server-launchd.log` |
| Launchd stderr | `~/.hermes/logs/llama-server-launchd.err` |

### Key Metrics to Watch
- **Prompt processing speed**: Should be 150-250 tok/s with Metal
- **Token generation speed**: Should be 15-25 tok/s with Metal
- **Memory usage**: ~19 GB RSS (15 GB model + KV cache + overhead)
- **GPU utilization**: Check Activity Monitor → GPU tab

---

## Performance Benchmarks

| Configuration | Prompt (tok/s) | Generation (tok/s) | VRAM Usage |
|--------------|----------------|-------------------|------------|
| Metal -ngl 99, ctx 65536, q8_0 KV | ~230 | ~17 | ~19 GB |
| Metal -ngl 99, ctx 32768, q8_0 KV | ~240 | ~18 | ~16 GB |
| CPU only (-ngl 0) | ~30 | ~3 | ~15 GB |

---

## Recovery Procedure

When things break, execute in order:

1. **Kill all llama-server processes**: `pkill -f llama-server`
2. **Wait for port release**: `sleep 3; lsof -i :8555`
3. **Restart llama-server**: `~/.hermes/ensure-llama-server.sh` (or `python3 ~/.hermes/ensure_llama_server.py`)
4. **Wait for model load**: `sleep 30; curl -s http://127.0.0.1:8555/health`
5. **Restart Hermes gateway**: `hermes gateway restart`
6. **Wait for gateway**: `sleep 10; curl -s http://127.0.0.1:8642/health`
7. **Restart workspace** (if needed): `pkill -f "vite dev"; cd /path/to/workspace && pnpm dev`
8. **Verify full stack**: Run all verification checklist items

---

## Related Files

| File | Purpose |
|------|---------|
| `~/.hermes/launch-llama-server.sh` | Dynamic launch script (calculates ctx-size, starts server) |
| `~/.hermes/ensure-llama-server.sh` | Shell wrapper for on-demand startup (idempotent) |
| `~/.hermes/ensure_llama_server.py` | Python module for Hermes gateway integration |
| `~/Library/LaunchAgents/com.hermes.llama-server.plist` | Launchd auto-start service |
| `~/.hermes/config.yaml` | Hermes gateway model config |
| `~/.hermes/.env` | Gateway runtime config |
| `hermes-workspace/.env` | Workspace connection config |
| `hermes-workspace/vite.config.ts` | Dev server proxy config |
| `hermes-workspace/src/server/gateway-capabilities.ts` | Capability probing |
| `hermes-workspace/src/routes/api/hermes-proxy/$.ts` | Authenticated proxy |
| `hermes-workspace/docs/archive/TROUBLESHOOTING_HERMES_GATEWAY.md` | Gateway troubleshooting |
| `hermes-workspace/docs/archive/INFERENCE_SERVER_SETUP.md` | This document |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-10-01 | Initial setup with Metal acceleration, 65536 ctx, Q4_K_M model |
| 2026-10-01 | Switched to b10269-1.6.0 build for Metal support |
| 2026-10-01 | Disabled reasoning (--reasoning off) |
| 2026-10-01 | Set Hermes minimum context (65536) |
| 2026-10-01 | Added launchd auto-start service (com.hermes.llama-server) |
| 2026-10-01 | Added on-demand shell wrapper (ensure-llama-server.sh) |
| 2026-10-01 | Added Python module for gateway integration (ensure_llama_server.py) |

---

## Notes

- **Model source**: Downloaded via `unsloth.ai` (not Atomic Chat/Ollama). The GGUF file is standard format — any llama.cpp server can run it.
- **Metal requirement**: Apple Silicon (M1/M2/M3/M4) with macOS 13+. Intel Macs not supported.
- **Context limit**: Hermes Agent enforces 64K minimum. Cannot run with smaller context.
- **KV cache**: q8_0 quantization saves ~50% KV memory with negligible quality loss.
- **Reasoning**: Disabled because Qwen3 models include thinking tokens by default which consume context and slow generation.