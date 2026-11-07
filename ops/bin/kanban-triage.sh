#!/bin/bash
# kanban-triage.sh — B2 debt triage (remediation-2026-11-04 §B2):
#   the pending backlog (ready/queued) is 100% automation debt — nightly
#   auto-created cards that never had a day-time consumer; zero card
#   consumption happened for months (0 day-time consumers, cards from ≤Aug-23
#   still queued). With B1 in place, new claims are gated on cron health; the
#   stale pile must not keep passing through every future triage.
#
# Action: cards in ready/queued older than --days (default: 14) created by
# automated producers (pre-night-check | run-* | setup) → lane blocked with an
# explicit auto-triage reason. Blocked cards are already parked; done/completion
# semantics are reserved for real work — never auto-done.
#
# 2026-11-06 root-cause note (first triage silently reverted):
#   V1 used `kanban.sh fail`, a RAW-SQL blocked write with no `blocked` event in
#   task_events. The gateway's recompute_ready() sweep reads exactly that state
#   as "untyped block / direct DB edit" and auto-promotes the card back to
#   ready (kanban_db._has_sticky_block docstring says it verbatim) — all 188
#   cards flipped back within 30 s (188 `promoted` events, 23:36:04).
#   Fix: block via the kernel (`hermes kanban block --kind needs_input`) whose
#   `blocked` event is STICKY — only an explicit `kanban unblock` exits it.
#
# Dry-run by default; --execute applies. Exit 0 always (reporting tool).
# Evidence backup: ops/run/b2-2026-11-05/kanban.db.pre-b2.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB="${HERMES_KANBAN_DB:-${HERMES_HOME:-$HOME/.hermes}/kanban.db}"
KB="$OPS_DIR/bin/kanban.sh"
DAYS=14; EXECUTE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --execute) EXECUTE=1;;
    --days) DAYS="${2:-14}"; shift;;
    *) echo "usage: kanban-triage.sh [--execute] [--days N]" >&2; exit 64;;
  esac
  shift
done

python3 - "$DB" "$DAYS" "$EXECUTE" "$KB" <<'PYEOF'
import sqlite3, subprocess, sys
db, days, execute, kb = sys.argv[1], int(sys.argv[2]), sys.argv[3] == "1", sys.argv[4]
con = sqlite3.connect(db)
cutoff = __import__("time").time() - days * 86400
rows = con.execute(
    "select id, assignee, status, created_by, datetime(created_at,'unixepoch') "
    "from tasks where status in ('ready','queued') and created_at < ? "
    "and (created_by like 'run-%' or created_by in ('pre-night-check','setup')) "
    "order by created_at", (cutoff,)).fetchall()
print(f"kanban-triage: {len(rows)} stale automated card(s) older than {days}d in ready/queued")
per_agent = {}
for _, assignee, _, _, _ in rows:
    per_agent[assignee or "(none)"] = per_agent.get(assignee or "(none)", 0) + 1
for a, n in sorted(per_agent.items(), key=lambda x: -x[1]):
    print(f"  {a}: {n}")
kept = con.execute(
    "select count(*) from tasks where status in ('ready','queued') and created_at >= ?", (cutoff,)).fetchone()[0]
print(f"  keeping {kept} recent card(s) (< {days}d)")
if not rows:
    sys.exit(0)
if not execute:
    print("  DRY-RUN (rerun with --execute to apply)")
    sys.exit(0)
REASON = ("auto-triage: aged-out automated card (nightly creation, no day-time consumer); "
          "sticky needs_input block, exit via explicit kanban unblock only; "
          "see remediation-2026-11-04 B2 + the 2026-11-06 reversion note")
blocked = 0
skipped = []
for cid, assignee, status, created_by, created in rows:
    if status == "running":
        skipped.append(cid)
        continue
    r = subprocess.run(["hermes", "kanban", "block", cid, "--kind", "needs_input", REASON],
                       capture_output=True, text=True)
    tag = "blocked(sticky)" if r.returncode == 0 else f"FAILED rc={r.returncode}"
    if r.returncode == 0:
        blocked += 1
    else:
        err = (r.stderr or r.stdout or "").strip().splitlines()[-1:] or ""
        print(f"  !! {cid} {tag} {err}")
    print(f"  {cid} {assignee} ({created_by}, created {created[:10]}) → {tag}")
print(f"kanban-triage: {blocked} sticky-blocked, {len(skipped)} skipped(running)")
sys.exit(0)
PYEOF
