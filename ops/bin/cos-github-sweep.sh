#!/usr/bin/env bash
# cos-github-sweep.sh — discover active development repos and snapshot their state.
# Output: JSON at ops/run/cos-github-snapshot.json consumed by the chief-of-staff agent.
#
# Discovery: owned non-fork repos pushed within COS_PUSH_WINDOW_DAYS (default 14),
# minus BLOCKLIST in ops/config/cos-repos.txt, capped at max_active_projects.
# Per repo: last push, default branch, commits since SINCE (default: 24h ago or
# COS_SINCE env), open PRs (titles), open issues (titles).
set -u
WS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CFG="$WS_DIR/config/cos-repos.txt"
OUT="${COS_SNAPSHOT:-$WS_DIR/run/cos-github-snapshot.json}"

command -v gh >/dev/null || { echo "FAIL gh CLI not installed"; exit 2; }
gh auth status >/dev/null 2>&1 || { echo "FAIL gh not authenticated"; exit 2; }

WINDOW=$(awk '/^push_window_days=/{print substr($0,index($0,"=")+1)}' "$CFG")
MAXPROJ=$(awk '/^max_active_projects=/{print substr($0,index($0,"=")+1)}' "$CFG")
LABELS=$(awk '/^default_labels=/{print substr($0,index($0,"=")+1)}' "$CFG")
WINDOW=${COS_WINDOW:-${WINDOW:-14}}
MAXPROJ=${MAXPROJ:-8}
LABELS=${LABELS:-chief-of-staff,feature-proposal}
BLOCKLIST=$(awk '/^BLOCKLIST/{f=1;next} f&&NF&&$1!~/^#/{print $1}' "$CFG")

SINCE=${COS_SINCE:-$(date -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)}
SINCE_DAYS=${COS_SINCE_DAYS:-1}

python3 - "$OUT" "$WINDOW" "$MAXPROJ" "$SINCE" "$SINCE_DAYS" $BLOCKLIST <<'PY'
import json, os, subprocess, sys, datetime as dt

out, window, maxproj, since, since_days = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
blocklist = set(sys.argv[6:])

def gh(*args):
    r = subprocess.run(["gh","api",*args], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode==0 and r.stdout.strip() else None

cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=window)).strftime("%Y-%m-%dT%H:%M:%SZ")
repos = gh(f"/user/repos?sort=pushed&per_page=100&type=owner") or []
active=[]
for r in repos:
    if r.get("fork"): continue
    if r["name"] in blocklist: continue
    if (r.get("pushed_at") or "") < cutoff: continue
    active.append(r)
active.sort(key=lambda r: r.get("pushed_at") or "", reverse=True)
active = active[:maxproj]

snapshot={"generated_at":dt.datetime.now().isoformat(timespec="seconds"),
          "since":since,"since_days":since_days,
          "default_labels":os.environ.get("COS_LABELS",""),
          "repos":[]}
for r in active:
    full=r["full_name"]; branch=r.get("default_branch") or "main"
    entry={"name":r["name"],"full_name":full,"private":bool(r.get("private")),
           "description":(r.get("description") or "")[:140],
           "default_branch":branch,"pushed_at":r.get("pushed_at"),"url":r.get("html_url")}
    try:
        cs=gh(f"/repos/{full}/commits?sha={branch}&since={since}&per_page=30") or []
        entry["commits_since"]=[{"sha":(c.get("sha") or "")[:7],
                                 "msg":((c.get("commit") or {}).get("message") or "").splitlines()[0][:120]}
                                for c in cs]
    except Exception: entry["commits_since"]=[]
    try:
        prs=gh(f"/repos/{full}/pulls?state=open&per_page=20") or []
        entry["open_prs"]=[{"num":p["number"],"title":p["title"][:120],"author":(p.get("user") or {}).get("login","")} for p in prs]
    except Exception: entry["open_prs"]=[]
    try:
        iss=gh(f"/repos/{full}/issues?state=open&per_page=30") or []
        entry["open_issues"]=[{"num":i["number"],"title":i["title"][:120],
                               "labels":[l["name"] for l in i.get("labels",[])]}
                              for i in iss if "pull_request" not in i]
    except Exception: entry["open_issues"]=[]
    snapshot["repos"].append(entry)

json.dump(snapshot, open(out,"w"), indent=2)
print(f"PASS snapshot → {out} ({len(snapshot['repos'])} active repos)")
PY
