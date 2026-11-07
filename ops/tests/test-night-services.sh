#!/usr/bin/env bash
# test-night-services.sh — comprehensive regression suite for the nightly stack.
# Covers every failure mode from the 2026-10-06…13 outage (see
# docs/ops/remediation-2026-10-13-nightly-outage.md):
#   1. gateway probed via dead tailnet IP instead of localhost
#   2. workspace launchd plist running stale `node run-server.js` (missing dist/)
#   3. duplicate/broken com.hermes.workspace supervisor (exit 127)
#   4. gemma :8555 proxy: Response(body=generator) crash + NDJSON chunk-framing bug
#   5. Docker daemon down → Twenty :3000, pg_dump backup, buzz relay all red
#   6. tailscale-alive keepalive forcing a tailnet dependency in local-only mode
#
# Usage: bash ops/tests/test-night-services.sh [--tap]
# Exit: 0 all PASS (SKIP allowed), 1 on any FAIL.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TAP="${1:-}"
pass=0; fail=0; skip=0
ok()   { pass=$((pass+1)); if [ "$TAP" = "--tap" ]; then echo "ok $((pass+fail+skip)) - $1"; else echo "PASS $1"; fi; }
bad()  { fail=$((fail+1)); if [ "$TAP" = "--tap" ]; then echo "not ok $((pass+fail+skip)) - $1"; else echo "FAIL $1 ($2)"; fi; }
sk()   { skip=$((skip+1)); if [ "$TAP" = "--tap" ]; then echo "ok $((pass+fail+skip)) - $1 # SKIP $2"; else echo "SKIP $1 ($2)"; fi; }
[ "$TAP" = "--tap" ] && echo "TAP version 13"

# ── 1. Gateway (local-only) ──────────────────────────────────────────────
if curl -sf -m5 http://127.0.0.1:8642/health 2>/dev/null | grep -q '"status"'; then
  ok "gateway :8642/health on localhost"
else bad "gateway :8642/health on localhost" "is hermes gateway run active?"; fi

# Auth parity without leaking secrets (regression: 401-looks-connected probe)
if python3 - "$OPS_DIR/../.env" "$HOME/.hermes/.env" <<'PY' 2>/dev/null; then
import re,sys
ws = open(sys.argv[1], errors="ignore").read()
gw = open(sys.argv[2], errors="ignore").read()
m1 = re.search(r"^HERMES_API_TOKEN=(.+)$", ws, re.M)
m2 = re.search(r"^API_SERVER_KEY=(.+)$", gw, re.M)
sys.exit(0 if (m1 and m2 and m1.group(1).strip().strip('"') == m2.group(1).strip().strip('"')) else 1)
PY
  ok "gateway API token parity (.env == ~/.hermes/.env)"
else bad "gateway API token parity" "HERMES_API_TOKEN != API_SERVER_KEY"; fi

if curl -sf -m5 http://127.0.0.1:9119/api/status 2>/dev/null | grep -q '"gateway_running":true'; then
  ok "dashboard :9119 reports gateway_running"
else bad "dashboard :9119 reports gateway_running" "dashboard down?"; fi

# ── 2. Workspace ─────────────────────────────────────────────────────────
if launchctl list 2>/dev/null | grep -q "com.ops.hermes-workspace"; then
  if launchctl list 2>/dev/null | awk '$3=="com.ops.hermes-workspace"{print $2}' | grep -qx "0"; then
    ok "workspace launchd job exit status 0"
  else bad "workspace launchd job exit status" "$(launchctl list 2>/dev/null | grep hermes-workspace)"; fi
else bad "workspace launchd job loaded" "bootstrap com.ops.hermes-workspace"; fi

if curl -sf -m5 http://127.0.0.1:3001/api/gateway-status 2>/dev/null | grep -q '"mode":"zero-fork"'; then
  ok "workspace gateway-status mode=zero-fork"
else bad "workspace gateway-status mode=zero-fork" ":3001 down or gateway unreachable"; fi

# Installed plist must match repo (regression: stale `node run-server.js`)
if diff -q "$OPS_DIR/launchd/com.ops.hermes-workspace.plist" "$HOME/Library/LaunchAgents/com.ops.hermes-workspace.plist" >/dev/null 2>&1; then
  ok "installed workspace plist in sync with repo"
else bad "installed workspace plist in sync" "copy ops/launchd/… over ~/Library/LaunchAgents/… and reload"; fi
if grep -q "run-server" "$HOME/Library/LaunchAgents/com.ops.hermes-workspace.plist" 2>/dev/null; then
  bad "workspace plist free of run-server" "stale production launcher reference"
else ok "workspace plist free of run-server"; fi

# Stale duplicate supervisor must stay gone (regression: exit 127 double-supervision)
if launchctl list 2>/dev/null | grep -q "com.hermes.workspace"; then
  bad "stale com.hermes.workspace unloaded" "bootout gui/$(id -u)/com.hermes.workspace"
else ok "stale com.hermes.workspace unloaded"; fi

# ── 3. Models (:8555 proxy + :11434) ──────────────────────────────────────
if curl -sf -m5 http://127.0.0.1:11434/api/tags 2>/dev/null | grep -q "ternary-bonsai"; then
  ok "ollama :11434 serves ternary-bonsai-2-27b:q2_0"
else bad "ollama :11434 serves ternary-bonsai-2-27b:q2_0" "ollama serve down?"; fi

if curl -sf -m10 http://127.0.0.1:8555/v1/models 2>/dev/null | grep -q "ternary-bonsai"; then
  ok "gemma proxy :8555/v1/models"
else bad "gemma proxy :8555/v1/models" "bash ops/bin/gemma-server.sh start"; fi

# Regression: streamed replies crashed (Response body=generator) and chunk
# framing dropped content (raw resp.content iteration). Both must yield text.
if OUT=$(curl -sf -m150 -X POST http://127.0.0.1:8555/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"reply with exactly: PROXY_OK"}]}' 2>/dev/null) \
  && python3 -c "import json,sys; c=json.loads(sys.argv[1])['choices'][0]['message']['content']; sys.exit(0 if c.strip() else 1)" "$OUT"; then
  ok "gemma proxy non-streaming completion returns content"
else bad "gemma proxy non-streaming completion" "empty content or timeout"; fi

if OUT=$(curl -sf -m150 -N -X POST http://127.0.0.1:8555/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"messages":[{"role":"user","content":"reply with exactly: STREAM_OK"}],"stream":true}' 2>/dev/null) \
  && python3 -c "
import json,sys
chunks=[l for l in sys.argv[1].splitlines() if l.startswith('data: ') and 'DONE' not in l]
text=''.join(json.loads(c[6:])['choices'][0]['delta'].get('content','') for c in chunks)
sys.exit(0 if text.strip() else 1)" "$OUT"; then
  ok "gemma proxy streaming completion returns content"
else bad "gemma proxy streaming completion" "StreamResponse regression or timeout"; fi

# ── 4. Twenty + backup ────────────────────────────────────────────────────
if [ -x "$(command -v docker 2>/dev/null || echo /opt/homebrew/bin/docker)" ] \
  && docker info >/dev/null 2>&1; then
  ok "docker daemon reachable"
else bad "docker daemon reachable" "open -a Docker"; fi

if curl -sf -m5 -X POST http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' \
    -d '{"query":"{ __typename }"}' 2>/dev/null | grep -q "__typename"; then
  ok "twenty :3000 graphql"
else bad "twenty :3000 graphql" "docker containers down?"; fi

TODAY_F="twenty-prod-$(date +%Y%m%d)"*.dump
if ls "$OPS_DIR/backups/twenty"/$TODAY_F >/dev/null 2>&1; then
  ok "twenty backup dump for today exists"
  LATEST="$(ls -t "$OPS_DIR/backups/twenty"/twenty-prod-*.dump | head -1)"
  if docker exec twenty-db-1 pg_restore --list "/tmp/$(basename "$LATEST")" >/dev/null 2>&1 || \
     [ -s "$LATEST" ]; then
    ok "latest twenty dump non-empty"
  else bad "latest twenty dump non-empty" "$LATEST"; fi
else bad "twenty backup dump for today" "bash ops/bin/twenty-backup.sh"; fi

# ── 5. Buzz relay ─────────────────────────────────────────────────────────
if nc -z 127.0.0.1 3010 2>/dev/null; then
  ok "buzz relay :3010 open"
else bad "buzz relay :3010 open" "docker down or relay crashed — check ops/run/buzz-relay.log"; fi

if grep -q "buzz-relay TCP listening" "$OPS_DIR/run/buzz-relay.log" 2>/dev/null; then
  ok "buzz relay log shows TCP listening"
else bad "buzz relay log shows TCP listening" "relay never came up"; fi

# ── 6. Local-only config (no tailnet dependency) ───────────────────────────
GW_CFG="$(grep -E "^HERMES_GW_URL=" "$OPS_DIR/config/net.env" 2>/dev/null | cut -d= -f2)"
if [ "${TAILNET_OPTIONAL:-0}" = "1" ]; then
  sk "net.env localhost default" "TAILNET_OPTIONAL=1"
else
  case "$GW_CFG" in
    http://127.0.0.1:8642) ok "net.env gateway URL is localhost (local-only)" ;;
    *) bad "net.env gateway URL is localhost" "got: $GW_CFG" ;;
  esac
fi

if [ "${TAILNET_OPTIONAL:-0}" = "1" ]; then
  sk "tailscale-alive unloaded" "TAILNET_OPTIONAL=1"
elif launchctl list 2>/dev/null | grep -q "com.ops.tailscale-alive"; then
  bad "tailscale-alive unloaded in local mode" "bootout gui/$(id -u)/com.ops.tailscale-alive"
else ok "tailscale-alive unloaded in local mode"; fi

# ── Summary ───────────────────────────────────────────────────────────────
echo "---"
echo "PASS=$pass FAIL=$fail SKIP=$skip"
[ "$fail" -eq 0 ]
