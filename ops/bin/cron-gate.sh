#!/bin/bash
# cron-gate.sh — B1 kanban gating signal (remediation-2026-11-04 §B1).
#
# Reads the A1 snapshot (ops/run/cron-health/last-24h-health.json, maintained by
# ops/bin/cron-health.sh via launchd com.ops.cron-health) and decides whether
# card consumers (run-night-agent.sh, run-product-intel.sh, …) may claim work.
#
# Fail-closed semantics — the gate closes on ANY of:
#   - snapshot missing or older than 90 min (fresh signal is a precondition)
#   - any ACTIVE job with acute failure in the last 24h window: failed_24h > 0,
#     stalled "running" execution > 2h, or cadence<=24h job with zero runs
#     (scheduler missed it)
# Chronic artifact debt (e.g. the never-written East/West/Master reports) FAILs
# cron-health but does NOT close the gate — blocking every night run until B2
# fixes a 6-month-old phantom would just institutionalize a new failure mode.
# Acute = run-level breakage within the freshness window.
#
# Exit: 0 = open (claims allowed), 1 = closed, 2 = usage/gate-aborted internal.
# Env override for hermetic tests: GATE_HEALTH_JSON=<fixture path>
set -euo pipefail

HEALTH_JSON="${GATE_HEALTH_JSON:-${HEALTH_OUT_DIR:-$HOME/hermes-workspace/ops/run/cron-health}/last-24h-health.json}"

python3 - "$HEALTH_JSON" <<'PYEOF'
import json, os, sys
from datetime import datetime

path = sys.argv[1]
acute = []
blocked_info = []

if not os.path.exists(path):
    print(f"GATE closed reason=snapshot-missing detail={path}")
    sys.exit(1)
try:
    doc = json.load(open(path))
except Exception as e:
    print(f"GATE closed reason=snapshot-corrupt detail={e}")
    sys.exit(1)

try:
    gen = datetime.fromisoformat(doc["summary"]["generated_at"])
    age_min = (datetime.now() - gen).total_seconds() / 60
except (KeyError, TypeError, ValueError):
    age_min = 10**6
if age_min > 90:
    print(f"GATE closed reason=snapshot-stale age_min={age_min:.0f} (refresh: ops/bin/cron-health.sh)")
    sys.exit(1)

for x in doc.get("jobs", []):
    if not x.get("active", True):
        continue
    cad = x.get("cadence_minutes") or 10**9
    if x.get("stalled_running_minutes"):
        acute.append(f"{x['name']}: running {x['stalled_running_minutes']}min (>2h)")
    if cad <= 1440 and (x.get("runs_24h") or 0) == 0:
        acute.append(f"{x['name']}: cadence<=24h but 0 runs in 24h (scheduler missed)")
    # Acute failure that actually broke the pipeline output:
    #   - artifact exists but is stale AND there were failed runs → the chain broke
    #   - delivery-only job (no artifact) with failed runs → deliverable lost
    # An artifact that is simply missing is chronic debt (B2 follow-up, e.g.
    # East/West/Master) and does not close the gate, otherwise a 6-month-old
    # phantom blocks every future night run.
    art = x.get("artifact") or {}
    if (x.get("failed_24h") or 0) > 0:
        if art and art.get("exists") and not art.get("fresh"):
            acute.append(f"{x['name']}: {x['failed_24h']} failed run(s) in 24h and artifact stale")
        elif not art:
            acute.append(f"{x['name']}: {x['failed_24h']} failed run(s) in 24h (delivery-only)")

if acute:
    print(f"GATE closed acute_jobs={len(acute)} *(within 24h window)* [{'; '.join(a[:90] for a in acute)}]")
    sys.exit(1)

chronic = [x["name"] for x in doc.get("jobs", [])
           if x.get("verdict") == "fail" and x["name"] not in [n.split(":")[0] for n in acute]]
fj = json.dumps(chronic, ensure_ascii=False)[:160]
print(f"GATE open (0 acute; {len(chronic)} chronic artifact debt tracked for B2/follow-up: {fj})")
sys.exit(0)
PYEOF
