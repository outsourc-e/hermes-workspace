#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/root/hermes-workspace}"
HERMES_HOME="${HERMES_HOME:-/root/.hermes}"
cd "$ROOT"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "OK: $*"
}

echo "== Hermes Head Office health =="

command -v codex >/dev/null 2>&1 || fail "codex CLI not on PATH"
codex login status >/tmp/hermes-codex-status.$$ 2>&1 || fail "codex login status failed: $(cat /tmp/hermes-codex-status.$$)"
grep -q "Logged in using ChatGPT" /tmp/hermes-codex-status.$$ || fail "codex is not logged in using ChatGPT: $(cat /tmp/hermes-codex-status.$$)"
rm -f /tmp/hermes-codex-status.$$
pass "Codex CLI logged in via ChatGPT"

grep -q "provider: openai-codex" "$HERMES_HOME/config.yaml" || fail "Hermes provider is not openai-codex"
grep -q "default: gpt-5.5" "$HERMES_HOME/config.yaml" || fail "Hermes default model is not gpt-5.5"
grep -q "openai_runtime: codex_app_server" "$HERMES_HOME/config.yaml" || fail "Hermes is not using codex_app_server runtime"
pass "Hermes model config points at ChatGPT/Codex subscription runtime"

grep -q "^API_SERVER_ENABLED=true" "$HERMES_HOME/.env" || fail "API_SERVER_ENABLED=true missing in $HERMES_HOME/.env"
TOKEN="$(grep "^HERMES_API_TOKEN=" "$ROOT/.env" 2>/dev/null | cut -d= -f2- || true)"
[ -n "$TOKEN" ] || fail "HERMES_API_TOKEN missing in $ROOT/.env"
pass "Workspace API token is configured"

curl -fsS http://127.0.0.1:8642/health >/tmp/hermes-health.$$ || fail "Hermes gateway health check failed on :8642"
grep -q "hermes-agent" /tmp/hermes-health.$$ || fail "Unexpected gateway health payload: $(cat /tmp/hermes-health.$$)"
rm -f /tmp/hermes-health.$$
pass "Hermes gateway is healthy on :8642"

completion="$(timeout 60s curl -fsS -X POST http://127.0.0.1:8642/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  --data '{"model":"hermes-agent","messages":[{"role":"user","content":"reply exactly HEALTH_OK"}],"stream":false}' || true)"
echo "$completion" | grep -q "HEALTH_OK" || fail "Gateway completion test did not return HEALTH_OK: $completion"
pass "Hermes gateway completion route returns text"

stream="$(timeout 90s curl -fsS -N -X POST http://127.0.0.1:3000/api/send-stream \
  -H "Content-Type: application/json" \
  --data '{"message":"reply exactly WORKSPACE_OK","sessionKey":"health-check"}' || true)"
echo "$stream" | grep -q "event: chunk" || fail "Workspace stream emitted no chunk: $stream"
echo "$stream" | grep -q "WORKSPACE_OK" || fail "Workspace stream did not return WORKSPACE_OK: $stream"
pass "Hermes Workspace chat route returns text"

pass "Head Office is operational"
