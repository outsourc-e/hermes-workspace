#!/bin/bash
# cron-health.sh — A1 cron-integrity evaluator (remediation-2026-11-04 §A1).
#
# Replaces the "last-24h failed-runs count" shrug (old T10) with a per-job
# health verdict grounded in the two signals that actually cannot lie:
#
#   1. artifact mtime  — did the deterministic step (vacuum/gatherer/synth)
#                        really produce/refresh its file *recently*?
#                        (a "successful" LLM run that wrote nothing, or a
#                        synth run whose raw input was missing, is thus
#                        exposed even when the run status says "ok")
#   2. execution rows  — runs/failed counts per job from executions.db,
#                        long-stalled "running" executions (>2h, the
#                        historical 50-minute+ wait-for-model stalls),
#                        and open cron_incidents still in 'detected'.
#
# Output: ops/run/cron-health/last-24h-health.json  + a human summary line:
#         "HEALTH: 9 ok / 2 warn / 1 fail (12 jobs)"
# Exit:   0 if no FAIL, 1 if any FAIL — usable in scripts and T10.
#
# Usage: ops/bin/cron-health.sh [--json]   (HERMES_HOME defaults to ~/.hermes)
set -euo pipefail

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
OUT_DIR="${HEALTH_OUT_DIR:-$HOME/hermes-workspace/ops/run/cron-health}"
OUT_JSON="$OUT_DIR/last-24h-health.json"

python3 - "$HERMES_HOME" "$OUT_JSON" <<'PYEOF'
import json, os, sqlite3, sys
from datetime import datetime, timezone

HERMES_HOME, OUT_JSON = sys.argv[1], sys.argv[2]
NOW = datetime.now()
now_iso = NOW.isoformat(timespec="seconds")

# Per-job expected artifacts. mtime is the canonical "did the deterministic
# step actually run" signal; thresholds are schedule-derived (cadence + 2h).
ARTIFACTS = {
    "3ea46f176983": ("/tmp/ai_protect_raw.txt", 26, "AI-Protect Vacuum (Step 1) raw"),
    "02ec11171558": ("~/Documents/Obsidian Vault/AI-Protect Intelligence.md", 26, "AI-Protect Distiller report"),
    "559c061fff6c": ("/tmp/kritis_south_raw.txt", 26, "KRITIS South Vacuum raw"),
    "87f724438caf": ("~/Documents/Obsidian Vault/KRITIS South Report.md", 26, "KRITIS South Distiller report"),
    "79442a28f4c1": ("~/Documents/Obsidian Vault/KRITIS East Report.md", 26, "KRITIS East Distiller report"),
    "097216ccdf9f": ("~/Documents/Obsidian Vault/KRITIS West Report.md", 26, "KRITIS West Distiller report"),
    "979a3af62036": ("~/Documents/Obsidian Vault/KRITIS Master Audit.md", 170, "KRITIS Master Audit report (weekly)"),
    "2424666b22a9": ("/tmp/shadow_ai_raw.txt", 26, "Shadow AI gatherer raw (shared w/ weekly vacuum)"),
    "f3221063fb96": ("/tmp/shadow_ai_weekly_raw.txt", 170, "Shadow AI weekly vacuum raw (own file since B2 — collision removed)"),
    "efa73ce56936": ("~/Documents/Obsidian Vault/Shadow AI Report.md", 170, "Shadow AI Distiller report (weekly)"),
    "6de6ca2e7086": ("~/twenty/sync_lusha.log", 26, "Lusha inbox watcher log"),
    "ce7963e57fad": (None, None, "Topic news digest — no file artifact (delivery-only)"),
}

jobs_meta = {j["id"]: j for j in json.load(open(os.path.join(HERMES_HOME, "cron", "jobs.json")))["jobs"]}

con = sqlite3.connect(os.path.join(HERMES_HOME, "cron", "executions.db"))
cur = con.cursor()
runs = {}
for job_id, total, failed, ran, fin, err in cur.execute(
    "SELECT job_id, count(*), COALESCE(sum(status='failed'),0), max(started_at), max(finished_at), "
    "       (SELECT error FROM executions e2 WHERE e2.job_id=e1.job_id AND status='failed' ORDER BY started_at DESC LIMIT 1) "
    "FROM executions e1 WHERE started_at >= datetime('now','-1 day') GROUP BY job_id"):
    runs[job_id] = {"total": total, "failed": failed, "last_started": ran, "last_finished": fin, "last_error": err}

# long-stalled running executions (kill-chain stalls, not real work)
stalled = {}
for job_id, started in cur.execute(
    "SELECT job_id, min(started_at) FROM executions WHERE status='running' GROUP BY job_id"):
    try:
        st = datetime.fromisoformat(started)
        mins = (NOW - st).total_seconds() / 60
        if mins > 120:
            stalled[job_id] = round(mins)
    except (TypeError, ValueError):
        pass

open_incidents = {}
for job_id, first, last in cur.execute(
    "SELECT job_id, first_seen_at, last_seen_at FROM cron_incidents "
    "WHERE closed_at IS NULL AND state='detected'"):
    open_incidents.setdefault(job_id, []).append({"first_seen": first, "last_seen": last})

results, counts = [], {"ok": 0, "warn": 0, "fail": 0}
for jid, meta in jobs_meta.items():
    cadence = (meta.get("schedule") or {}).get("minutes") if (meta.get("schedule") or {}).get("kind") == "interval" else None
    r = runs.get(jid, {})
    verdict, reasons = "ok", []

    # --- execution coverage (interval jobs that should fire daily) ---
    if cadence and cadence <= 1440:
        if not r and jid not in stalled:
            verdict = "fail"
            reasons.append("no executions in last 24h (cadence <= 24h)")

    # --- artifact freshness ---
    path, max_age, label = ARTIFACTS.get(jid, (None, None, None))
    art_out = None
    if path:
        p = os.path.expanduser(path)
        if not os.path.exists(p):
            verdict, _ = ("fail", verdict)
            reasons.append(f"artifact missing: {path} ({label})")
            art_out = {"path": path, "exists": False, "label": label}
        else:
            age_h = (NOW.timestamp() - os.path.getmtime(p)) / 3600
            fresh = age_h <= max_age
            art_out = {"path": path, "exists": True, "age_hours": round(age_h, 1),
                       "threshold_hours": max_age, "fresh": fresh, "label": label}
            if not fresh:
                verdict = "fail"
                reasons.append(f"artifact stale: age {age_h:.1f}h > {max_age}h ({label})")

    # --- degradations that don't invalidate the pipeline but must be visible ---
    if verdict != "fail":
        if r.get("failed"):
            verdict = "warn"
            reasons.append(f"{r['failed']} failed run(s) in 24h — last: "
                           f"{str(r.get('last_error'))[:160].replace(chr(10), ' | ')}")
        if jid in stalled:
            verdict = "warn"
            reasons.append(f"execution running {stalled[jid]}min (>2h) — historical model-await stall")
        if jid in open_incidents:
            verdict = "warn"
            reasons.append(f"open incident(s) state=detected: last_seen {open_incidents[jid][-1]['last_seen']}")

    counts[verdict] = counts.get(verdict, 0) + 1
    results.append({
        "id": jid, "name": meta.get("name"), "script": meta.get("script"),
        "active": meta.get("state") != "paused" if "state" in meta else True,
        "cadence_minutes": cadence,
        "runs_24h": r.get("total", 0), "failed_24h": r.get("failed", 0),
        "last_finished": r.get("last_finished"),
        "stalled_running_minutes": stalled.get(jid),
        "open_incidents": open_incidents.get(jid, []),
        "artifact": art_out,
        "verdict": verdict, "reasons": reasons,
    })

summary = {"generated_at": now_iso, "window_hours": 24, "jobs_tracked": len(results), **counts}
doc = {"summary": summary, "jobs": results}
os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, "w") as f:
    json.dump(doc, f, indent=2, ensure_ascii=False)

print(f"HEALTH: {counts.get('ok',0)} ok / {counts.get('warn',0)} warn / {counts.get('fail',0)} fail ({len(results)} jobs)")
for x in results:
    if x["verdict"] != "ok":
        one = "; ".join(x["reasons"]).replace("\n", " ⏎ ")
        print(f"  [{x['verdict'].upper():4}] {x['name']}: {one[:220]}", file=sys.stderr)
sys.exit(1 if counts.get("fail") else 0)
PYEOF
