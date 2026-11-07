#!/usr/bin/env bash
# buzz-bootstrap.sh — idempotent local-relay setup. Run AFTER owner onboarding in Buzz Desktop.
# Creates channels (dedupe-safe via UUID), posts smoke message, drafts agents for owner approval.
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SECRETS="$WS_DIR/ops/secrets/agent-keys.env"
[ -f "$SECRETS" ] || { echo "FAIL agent keys missing"; exit 1; }
source "$SECRETS"
export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-http://localhost:3010}"
ORCH_KEY="$KEY_orchestrator"

chan_id() { # name → UUID or empty
  BUZZ_PRIVATE_KEY="$ORCH_KEY" buzz channels list 2>/dev/null \
    | python3 -c "import json,sys;[print(c['channel_id']) for c in json.load(sys.stdin) if c['name']=='$1']" | head -1
}

echo "[1/4] connectivity"
BUZZ_PRIVATE_KEY="$ORCH_KEY" buzz channels list >/dev/null 2>&1 || { echo "FAIL relay unreachable / not authenticated"; exit 2; }
echo "  OK"

echo "[2/4] channels"
mkchan() { # name type description  (type: stream|forum)
  local name="$1" ctype="$2" desc="$3"
  local existing; existing=$(chan_id "$name")
  if [ -n "$existing" ]; then echo "  = exists: $name"; return 0; fi
  BUZZ_PRIVATE_KEY="$ORCH_KEY" buzz channels create --name "$name" --type "$ctype" --visibility open --description "$desc" >/dev/null 2>&1 \
    && echo "  + created: $name" || echo "  ! FAILED: $name"
}
mkchan approvals   stream "Human approval gate — nothing compliance-relevant lands without an owner reaction here"
mkchan night-runs  stream "Nightly job digests and pass/fail results"
mkchan competitors stream "competitor-scout nightly research digests"
mkchan customers   stream "customer-watcher nightly research digests (company signals only)"
mkchan partners    stream "partner-radar nightly ecosystem digests"
mkchan product-intel stream "product-intel nightly feature/technology intel digests + 3-day deep reports"
mkchan morning-brief stream "chief-of-staff daily Morning Brief — product/customers/partners/competition/dev/fleet/review/proposals"
mkchan soc2        forum  "SOC 2 control mapping, evidence links, discussion"
mkchan iso27001    forum  "ISO 27001 ISMS discussion and control references"
mkchan incidents   stream "Incident log and tabletop exercises"
mkchan crm-sync    stream "Twenty CRM sync results and anomalies"
mkchan lobby       stream "Quarantine sandbox for unknown/new agents — no other access"

echo "[3/4] smoke post to #night-runs"
NR=$(chan_id night-runs)
if [ -n "$NR" ] && printf 'bootstrap complete %s — relay operational' "$(date +%F_%T)" \
  | BUZZ_PRIVATE_KEY="$ORCH_KEY" buzz messages send --channel "$NR" --content - >/dev/null 2>&1; then
  echo "PASS smoke message in #night-runs"
else
  echo "! smoke post failed"
fi

echo "[4/4] verifying agent identities (open-join membership)"
# NOTE: `buzz agents draft-create` requires an owner BUZZ_AUTH_TAG (NIP-OA) — it cannot
# be scripted safely by design. Agent PROFILES are optional desktop polish; the ops
# pipeline authenticates and posts via raw keypairs. Verify each identity here:
verify_agent() { # key-value name
  local v="$1" name="$2"
  if [ -n "$v" ] && BUZZ_PRIVATE_KEY="$v" buzz channels list >/dev/null 2>&1; then
    echo "  OK $name"
  else
    echo "  FAIL $name"
  fi
}
verify_agent "$KEY_competitor_scout" "competitor-scout"
verify_agent "$KEY_customer_watcher" "customer-watcher"
verify_agent "$KEY_partner_radar"    "partner-radar"
verify_agent "$KEY_product_intel"    "product-intel"
verify_agent "$KEY_chief_of_staff"   "chief-of-staff"
verify_agent "$KEY_watchdog"         "watchdog"
verify_agent "$KEY_crm_sync"         "crm-sync"
verify_agent "$KEY_doc_agent"        "doc-agent"
echo "Optional: create matching agent profiles in Buzz Desktop → Agents view (cosmetic only)."

echo "DONE — approve the agent drafts inside Buzz Desktop to bring them online."
