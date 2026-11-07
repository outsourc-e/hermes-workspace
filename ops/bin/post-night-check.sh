#!/usr/bin/env bash
# post-night-check.sh — verify day-critical services survived the batch window.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
rc=0
chk() { if eval "$2" >/dev/null 2>&1; then echo "PASS $1"; else echo "FAIL $1"; rc=1; fi; }

source "$OPS_DIR/config/net.env" 2>/dev/null || true
GW_URL="${HERMES_GW_URL:-http://127.0.0.1:8642}"
chk "hermes gateway ($GW_URL)" "curl -sf -m 5 $GW_URL/health"
chk "dashboard :9119"          "curl -sf -m 5 http://127.0.0.1:9119/api/status"
chk "primary :8555"             "\"$OPS_DIR/bin/model-check.sh\" http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0"
chk "twenty :3000"             "curl -sf -m 5 -X POST http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' -d '{\"query\":\"{ __typename }\"}'"
chk "buzz relay :3010"         "nc -z 127.0.0.1 3010"

# ternary-bonsai-2-27b:q2_0 :8555 is the 24/7 PRIMARY fleet model — never unload it post-night.
if [ -x "$OPS_DIR/bin/gemma-server.sh" ]; then
  echo "gemma :8555 primary stays up (fleet model, not unloaded)"
fi

[ $rc -eq 0 ] && echo "POST-NIGHT PASS" || echo "POST-NIGHT FAIL"
exit $rc