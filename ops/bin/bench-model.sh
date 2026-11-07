#!/usr/bin/env bash
# bench-model.sh — latency/quality baseline for one endpoint. Appends to docs/ops/test-log.md data file.
# Usage: bench-model.sh <label> <base_url> <model_id> [max_tokens]
set -u
LABEL="${1:?}"; URL="${2:?}"; MID="${3:?}"; MT="${4:-300}"
PROMPTS=("What is the capital of France? One word." \
         "Summarize in one sentence: SOC 2 Type II requires evidence of controls operating over a period of months.")
pass=0; total=${#PROMPTS[@]}
for p in "${PROMPTS[@]}"; do
  j=$(python3 -c 'import json,sys; print(json.dumps({"model":sys.argv[1],"messages":[{"role":"user","content":sys.argv[2]}],"max_tokens":int(sys.argv[3])}))' "$MID" "$p" "$MT")
  out=$(curl -sf -m 240 "${URL%/}/chat/completions" -H 'Content-Type: application/json' -d "$j") || { echo "[$LABEL] ERROR on prompt"; continue; }
  printf '%s' "$out" | python3 -c '
import json,sys
label=sys.argv[1]
d=json.load(sys.stdin)
m=d["choices"][0]["message"]
c=(m.get("content") or "").strip().replace("\n"," ")[:90]
u=d.get("usage",{})
print("["+label+"] "+str(u.get("total_tokens","?"))+"tok | "+c)
sys.exit(0 if c else 1)' "$LABEL" && pass=$((pass+1))
done
echo "BENCH $LABEL: $pass/$total prompts produced content"
exit $([ $pass -eq $total ] && echo 0 || echo 1)
