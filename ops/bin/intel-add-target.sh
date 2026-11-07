#!/usr/bin/env bash
# intel-add-target.sh — register an owner-approved research target for product-intel.
# Usage: intel-add-target.sh "<Name>" <url> <competitor|partner-candidate>
# Updates BOTH ops/config/product-intel-targets.txt (runner prompt source)
# and docs/ops/intel/knowledge-base/targets.json (agent registry).
# Refuses duplicates; refuses invalid type. This is the ONLY scripted way targets are added —
# the agent itself can only propose candidates.
set -euo pipefail
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS_DIR="$(cd "$OPS_DIR/.." && pwd)"
CFG="${INTEL_CFG:-$OPS_DIR/config/product-intel-targets.txt}"
TJSON="${INTEL_TJSON:-$WS_DIR/docs/ops/intel/knowledge-base/targets.json}"

[ $# -eq 3 ] || { echo "usage: $0 \"<Name>\" <url> <competitor|partner-candidate>"; exit 64; }
NAME="$1"; URL="$2"; TYPE="$3"
case "$TYPE" in competitor|partner-candidate) ;; *) echo "FAIL type must be competitor|partner-candidate"; exit 1;; esac
echo "$URL" | grep -qE '^https?://' || { echo "FAIL url must start with http(s)://"; exit 1; }

touch "$CFG"
if grep -v '^#' "$CFG" | grep -qi "^${NAME}|"; then
  echo "FAIL target already registered: $NAME"; exit 5
fi

printf '%s|%s|%s\n' "$NAME" "$URL" "$TYPE" >> "$CFG"
python3 - "$TJSON" "$NAME" "$URL" "$TYPE" <<'PY'
import json,sys,datetime as dt
p,name,url,typ=sys.argv[1:]
d=json.load(open(p))
slug=name.lower().replace(" ","-")
cluster={"competitor":"unknown","partner-candidate":"gateway-infra"}.get(typ,"unknown")
d["targets"].append({"name":name,"url":url,"type":typ,"cluster":cluster,"status":"active",
                     "profile":f"vendors/{slug}.md","added":dt.date.today().isoformat()})
json.dump(d,open(p,"w"),indent=2)
PY

echo "PASS registered: $NAME ($TYPE) → $URL"
echo "Next deep cycle will create vendors/ profile + matrix row automatically."
