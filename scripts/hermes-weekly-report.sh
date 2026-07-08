#!/usr/bin/env bash
# Weekly swarm self-report — the org writes its own retro.
#
# Runs Sundays 18:00 via launchd (com.hermes.weekly-report). Gathers the last
# 7 days of outcomes, scoreboard, timeline and usage, writes a dated markdown
# report to the vault (vault/reports/) and posts a summary to Discord.
# Read-only + best-effort: never mutates swarm state.
set -uo pipefail

ENV_FILE="${HERMES_ENV_FILE:-$HOME/.hermes/.env}"
BASE_URL="${SWARM_BASE_URL:-http://127.0.0.1:3000}"
VAULT="${HERMES_KNOWLEDGE_VAULT:-$HOME/workspace/vault}"
REPORT_DIR="$VAULT/reports"
mkdir -p "$REPORT_DIR"

getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }
BOT_TOKEN="$(getenv DISCORD_BOT_TOKEN)"
CHANNEL="$(getenv DISCORD_HOME_CHANNEL)"

scoreboard=$(curl -s -m 15 "$BASE_URL/api/swarm-scoreboard" || echo '{}')
timeline=$(curl -s -m 15 "$BASE_URL/api/swarm-timeline?limit=500" || echo '{}')
usage=$(curl -s -m 15 "$BASE_URL/api/swarm-usage" || echo '{}')
OUTCOMES_FILE="$(cd "$(dirname "$0")/.." && pwd)/.runtime/swarm-outcomes.jsonl"

REPORT_PATH="$REPORT_DIR/$(date +%G-W%V)-swarm-report.md"

summary=$(OUTCOMES_FILE="$OUTCOMES_FILE" REPORT_PATH="$REPORT_PATH" \
  python3 - "$scoreboard" "$timeline" "$usage" <<'PY'
import sys, json, os, time
def load(i):
    try: return json.loads(sys.argv[i])
    except Exception: return {}
sb, tl, u = load(1), load(2), load(3)
week_ago = time.time() * 1000 - 7 * 24 * 3600 * 1000

# Outcomes for the week straight from the JSONL (timeline caps at 500).
rows = []
try:
    with open(os.environ['OUTCOMES_FILE']) as f:
        for line in f:
            try:
                r = json.loads(line)
                if r.get('at', 0) >= week_ago: rows.append(r)
            except Exception: pass
except Exception: pass

done = [r for r in rows if r.get('ok') and not r.get('blocked')]
blocked = [r for r in rows if r.get('blocked')]
by_worker = {}
for r in rows:
    w = by_worker.setdefault(r.get('workerId', '?'), {'total': 0, 'ok': 0})
    w['total'] += 1
    if r.get('ok') and not r.get('blocked'): w['ok'] += 1
by_tier = {}
for r in rows:
    t = r.get('tier') or 'default'
    d = by_tier.setdefault(t, {'total': 0, 'ok': 0})
    d['total'] += 1
    if r.get('ok') and not r.get('blocked'): d['ok'] += 1

guards = [e for e in (tl.get('entries', []) if isinstance(tl, dict) else [])
          if e.get('type') == 'branch_guard' and e.get('at', 0) >= week_ago]

tokens = 0
for w in (u.get('workers', []) if isinstance(u, dict) else []):
    tokens += (w.get('week', {}) or {}).get('total', 0) or (w.get('today', {}) or {}).get('total', 0) or 0

# Common failure reasons.
reasons = {}
for r in blocked:
    key = (r.get('blockReason') or 'unknown')[:60]
    reasons[key] = reasons.get(key, 0) + 1
top_reasons = sorted(reasons.items(), key=lambda kv: -kv[1])[:5]

lines = [f"# Swarm weekly report — {time.strftime('%G-W%V')}", ""]
lines.append(f"- Tasks: {len(rows)} total · {len(done)} done · {len(blocked)} blocked/failed")
rate = round(100 * len(done) / len(rows)) if rows else 0
lines.append(f"- Success rate: {rate}%")
lines.append(f"- Tokens (approx week): {tokens:,}")
lines.append(f"- Branch-guard events: {len(guards)}")
lines.append("")
lines.append("## Per worker")
lines.append("| worker | tasks | success |")
lines.append("|---|---|---|")
for wid, d in sorted(by_worker.items(), key=lambda kv: -kv[1]['total']):
    pct = round(100 * d['ok'] / d['total']) if d['total'] else 0
    lines.append(f"| {wid} | {d['total']} | {pct}% |")
lines.append("")
lines.append("## Per model tier")
lines.append("| tier | tasks | success |")
lines.append("|---|---|---|")
for t, d in sorted(by_tier.items(), key=lambda kv: -kv[1]['total']):
    pct = round(100 * d['ok'] / d['total']) if d['total'] else 0
    lines.append(f"| {t} | {d['total']} | {pct}% |")
if top_reasons:
    lines.append("")
    lines.append("## Top failure reasons")
    for reason, n in top_reasons:
        lines.append(f"- {n}× {reason}")
lines.append("")
lines.append(f"_Generated {time.strftime('%Y-%m-%d %H:%M')} by hermes-weekly-report.sh_")

with open(os.environ['REPORT_PATH'], 'w') as f:
    f.write("\n".join(lines) + "\n")

# Discord summary (short form).
weak = [f"{wid} ({round(100*d['ok']/d['total'])}%)" for wid, d in by_worker.items()
        if d['total'] >= 3 and d['ok'] / d['total'] < 0.6]
out = [f"📊 **Swarm weekly report ({time.strftime('%G-W%V')})**"]
out.append(f"• {len(rows)} tasks · {rate}% success · {len(blocked)} blocked · {tokens:,} tokens")
if weak: out.append("• 📉 Needs attention: " + ", ".join(weak[:4]))
if top_reasons: out.append(f"• Top failure: {top_reasons[0][1]}× {top_reasons[0][0]}")
out.append(f"• Full report: vault/reports/{os.path.basename(os.environ['REPORT_PATH'])}")
print("\n".join(out))
PY
)

echo "report written: $REPORT_PATH"

if [ -n "$BOT_TOKEN" ] && [ -n "$CHANNEL" ] && [ -n "$summary" ]; then
  body=$(printf '%s' "$summary" | python3 -c 'import json,sys;print(json.dumps({"content":sys.stdin.read()[:1900]}))')
  curl -sS -m 10 -X POST \
    -H "Authorization: Bot $BOT_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body" \
    "https://discord.com/api/v10/channels/$CHANNEL/messages" >/dev/null 2>&1 || true
fi

# ---- self-benchmark -----------------------------------------------------------
# Fixed micro-suite through the real dispatch path; a score drop week-over-week
# means worker quality regressed even if nothing "failed" in production.
BENCH_PASS=0; BENCH_TOTAL=3
bench() {
  local WORKER="$1" TASK="$2" EXPECT="$3"
  local OUT
  OUT=$(curl -sS -m 300 -X POST -H 'Content-Type: application/json' \
    -d "{\"assignments\":[{\"workerId\":\"$WORKER\",\"task\":\"$TASK\",\"oneshot\":true}],\"waitForCheckpoint\":true,\"timeoutSeconds\":240}" \
    "http://127.0.0.1:3000/api/swarm-dispatch" 2>/dev/null | \
    python3 -c 'import json,sys
try:
  r=(json.load(sys.stdin).get("results") or [{}])[0]
  print(r.get("output") or (r.get("checkpoint") or {}).get("result") or "")
except Exception: print("")')
  printf '%s' "$OUT" | grep -q "$EXPECT" && BENCH_PASS=$((BENCH_PASS+1))
}
bench qa "Compute 17*23 and reply with exactly: BENCH_MATH_<answer> (replace <answer> with the number)" "BENCH_MATH_391"
bench researcher "Reply with exactly: BENCH_ECHO_OK" "BENCH_ECHO_OK"
bench builder "What does 'set -euo pipefail' do in bash? End your reply with exactly: BENCH_EXPLAIN_OK" "BENCH_EXPLAIN_OK"
echo "" >> "$REPORT_PATH"
echo "## Self-benchmark" >> "$REPORT_PATH"
echo "- Score: $BENCH_PASS/$BENCH_TOTAL (qa math, researcher echo, builder explain)" >> "$REPORT_PATH"
echo "self-benchmark: $BENCH_PASS/$BENCH_TOTAL"
if [ -n "$BOT_TOKEN" ] && [ -n "$CHANNEL" ]; then
  body=$(python3 -c "import json;print(json.dumps({'content':'🧪 Self-benchmark: $BENCH_PASS/$BENCH_TOTAL'}))")
  curl -sS -m 10 -X POST -H "Authorization: Bot $BOT_TOKEN" -H 'Content-Type: application/json' \
    -d "$body" "https://discord.com/api/v10/channels/$CHANNEL/messages" >/dev/null 2>&1 || true
fi
