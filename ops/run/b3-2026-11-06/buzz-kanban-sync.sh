#!/usr/bin/env bash
# buzz-kanban-sync.sh — bidirectional sync between Buzz and the Hermes Kanban board.
#
# Direction A (Buzz → Board, #approvals ONLY per ops policy):
#   Owner signed reactions on messages tagged [kanban:<id>]:
#     ✅/👍 → card moves to ready      ❌/👎 → card done (rejected)
#   Nobody can self-approve: only OWNER pubkey reactions count.
#
# Direction B (Board → Buzz):
#   night-run cards changing lane post a one-liner tagged [kanban:<id>] to the owning
#   agent's home channel. Manual cards are never echoed.
#
# Idempotent via state file (processed event ids + last posted lane per card).
# Env: DRYRUN=1 hermetic · STATE_DIR override · SYNC_OWNER_PUBKEY override.
set -u
OPS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS_DIR="$(cd "$OPS_DIR/.." && pwd)"
SECRETS="$OPS_DIR/secrets/agent-keys.env"
[ -f "$SECRETS" ] || { echo "FAIL agent keys missing"; exit 1; }
source "$SECRETS"
# 2026-11-06 B3: scheme fix. The CLI expects an http(s) base URL; the old
# `ws://` default made `buzz channels list` return `relay error 404` forever
# (sync dead since Sep 3), while the relay itself was healthy the whole time.
# Also: http://127.0.0.1 returns [] but http://localhost returns the channels —
# keep hostname `localhost`.
export BUZZ_RELAY_URL="${BUZZ_RELAY_URL:-http://localhost:3010}"
# 2026-11-06 B3: `buzz` lives in ~/.local/bin, which is NOT on launchd's PATH —
# under the agent the reachability check was actually command-not-found
# (masked for months by the ws:// URL bug above).
export PATH="${HOME}/.local/bin:${PATH}"
SYNC_KEY="$KEY_orchestrator"
OWNER="${SYNC_OWNER_PUBKEY:-f4e3cc091edcadf4ac0e5a36e1d996f643f7d4c9a1993daeed59977d8326687f}"
KB="$OPS_DIR/bin/kanban.sh"
DRY="${DRYRUN:-0}"
RUN_DIR="${STATE_DIR:-$OPS_DIR/run}"; mkdir -p "$RUN_DIR"
STATE="$RUN_DIR/buzz-kanban-sync.json"
LOCK="$RUN_DIR/buzz-kanban-sync.lock"

[ -x "$KB" ] || { echo "FAIL kanban wrapper missing"; exit 1; }
[ -e "$LOCK" ] && exit 0   # overlapping sweep: skip silently, next tick catches up
trap 'rm -f "$LOCK"' EXIT
touch "$LOCK"

if [ "$DRY" != "1" ]; then
  BUZZ_PRIVATE_KEY="$SYNC_KEY" buzz channels list >/dev/null 2>&1 \
    || { echo "FAIL relay unreachable / orchestrator not authenticated"; exit 2; }
fi

CHAN_UUIDS=$(BUZZ_PRIVATE_KEY="$SYNC_KEY" buzz channels list 2>/dev/null \
  | python3 -c "import json,sys
try:
    for c in json.load(sys.stdin): print(f\"{c.get('name')}\t{c['channel_id']}\")
except Exception: pass") || CHAN_UUIDS=""

export DRY OWNER SYNC_KEY CHAN_UUIDS STATE KB

python3 - <<'PY'
import json, os, re, subprocess, sys, time

dry       = os.environ["DRY"] == "1"
owner     = os.environ["OWNER"]
key       = os.environ["SYNC_KEY"]
chan_uuids= {}
for line in os.environ.get("CHAN_UUIDS","").splitlines():
    if "\t" in line:
        n,u = line.split("\t",1); chan_uuids[n]=u
state_p   = os.environ["STATE"]
kb        = os.environ["KB"]

AGENT_CHANNEL = {
    "competitor-scout":"competitors", "customer-watcher":"customers",
    "partner-radar":"partners",       "product-intel":"product-intel",
    "chief-of-staff":"morning-brief", "watchdog":"night-runs",
    "crm-sync":"crm-sync",            "doc-agent":"soc2",
    "orchestrator":"lobby",
}
TAG = re.compile(r"\[kanban:(t_[0-9a-f]{8})\]")

def buzz(*args):
    env = dict(os.environ); env["BUZZ_PRIVATE_KEY"] = key
    r = subprocess.run(["buzz", *args], capture_output=True, text=True, env=env)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None

def kbd(*args):
    return subprocess.run([kb, *args], capture_output=True, text=True).stdout.strip()

st = {"events": {}, "cards": {}, "last_sweep": 0}
if os.path.exists(state_p):
    try: st.update(json.load(open(state_p)))
    except Exception: pass
now_ts = int(time.time())

applied = []

# ── Direction A: #approvals verdicts on tagged messages ──────────────────────
if not dry:
    ach = chan_uuids.get("approvals","")
    if ach:
        msgs = buzz("messages","get","--channel",ach,"--since",str(st.get("last_sweep",0)),"--limit","100") or []
        for m in msgs if isinstance(msgs,list) else []:
            eid = m.get("event_id") or m.get("id") or ""
            content = m.get("content") or ""
            mt = TAG.search(content)
            if not eid or not mt or eid in st["events"]:
                continue
            cid = mt.group(1)
            rx = buzz("reactions","get","--event",eid) or {"reactions":[]}
            verdict = None
            for r in rx.get("reactions",[]):
                if owner in (r.get("pubkeys") or []):
                    if r["emoji"] in ("✅","👍"): verdict = "approved"; break
                    if r["emoji"] in ("❌","👎"): verdict = "rejected"; break
            if not verdict:
                continue
            lane = "ready" if verdict == "approved" else "done"
            out = kbd("set",cid,"--lane",lane)
            if out.startswith("PASS"):
                st["events"][eid] = f"{verdict}:{cid}"
                applied.append(f"  A: {eid[:12]} [{cid}] owner {verdict} -> {lane}")
                print(applied[-1])
            else:
                print(f"  A: SKIP {eid[:12]} [{cid}] unknown card")
                st["events"][eid] = "skipped:unknown-card"   # never reprocess dead ids
else:
    print("  A: DRYRUN — approvals sweep skipped")

# ── Direction B: night-run card transitions → agent channels ─────────────────
rows_raw = subprocess.run([kb,"list"],capture_output=True,text=True).stdout
for line in rows_raw.splitlines():
    parts = line.split("\t")
    if len(parts) < 4: continue
    cid, assignee, lane, title = parts[0], parts[1], parts[2], parts[3]
    if assignee == "-" or not title.startswith("night-run:") or cid.startswith("__"):
        continue
    prev_lane = st["cards"].get(cid)
    if prev_lane == lane or lane in ("backlog", "queued", "ready"):
        # queue states are noise until a runner picks the card up; still record
        st["cards"].setdefault(cid, lane)
        continue
    ch = AGENT_CHANNEL.get(assignee)
    if dry or not ch or ch not in chan_uuids:
        note = "DRYRUN" if dry else f"(no channel for {assignee})"
        print(f"  B: would post {cid} {assignee}: {prev_lane}->{lane} {note}")
    else:
        body = f"[kanban:{cid}] {assignee}: {title} → {lane}"
        r = subprocess.run(["buzz","messages","send","--channel",chan_uuids[ch],
                            "--content",body], capture_output=True, text=True,
                           env={**os.environ,"BUZZ_PRIVATE_KEY":key})
        ok = r.returncode == 0
        print(f"  B: {'posted' if ok else 'FAILED'} {cid} {prev_lane}->{lane} to #{ch}")
    st["cards"][cid] = lane

st["last_sweep"] = now_ts
json.dump(st, open(state_p,"w"), indent=2)
print(f"sync done: applied={len(applied)} tracked_cards={len(st['cards'])}")
PY
