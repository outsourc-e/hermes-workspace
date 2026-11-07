#!/usr/bin/env bash
# crm-note-commit.sh — create a note in Twenty and link it to company/people.
# Usage: crm-note-commit.sh [--staging] payload.json
# payload: {"title":"...","text":"...","company_id":"uuid?","person_ids":["uuid",...]}
# SAFETY: refuses to run against PROD unless ALLOW_PROD=1 is set in the environment.
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING=0; [ "${1:-}" = "--staging" ] && { STAGING=1; shift; }
PAYLOAD="${1:?usage: crm-note-commit.sh [--staging] payload.json}"
[ -f "$PAYLOAD" ] || { echo "FAIL payload not found"; exit 64; }

get() { grep "^$1=" "$WS_DIR/.env" | head -1 | cut -d= -f2-; }
if [ $STAGING -eq 1 ]; then KEY=$(get TWENTY_API_KEY); URL="http://127.0.0.1:3100/graphql";
else
  [ "${ALLOW_PROD:-0}" = "1" ] || { echo "FAIL prod writes require ALLOW_PROD=1 (confirmation gate)"; exit 5; }
  KEY=$(get TWENTY_SERVICE_KEY); URL="http://127.0.0.1:3000/graphql"
fi

python3 - "$URL" "$KEY" "$PAYLOAD" <<'PY'
import json, sys, urllib.request, html
url, key, path = sys.argv[1], sys.argv[2], sys.argv[3]
d = json.load(open(path))
title = str(d.get('title','Appointment note'))[:150]
text  = str(d.get('text','')).strip() or '(no content)'
cid   = d.get('company_id'); pids = [p for p in (d.get('person_ids') or [])]
blocks = json.dumps([{"type":"paragraph","content":[{"type":"text","text":html.escape(text)}]}])

def gq(qry, var):
    req = urllib.request.Request(url, data=json.dumps({"query":qry,"variables":var}).encode(),
        headers={"Content-Type":"application/json","Authorization":f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.load(r)
    if res.get('errors'): raise RuntimeError(json.dumps(res['errors'])[:200])
    return res['data']

note = gq("mutation C($data: NoteInput!) { createNote(data: $data){ id title } }",
          {"data":{"title":title,"bodyV2":{"blocknote":blocks}}})['createNote']
nid = note['id']; linked=[]
tgt = ("mutation T($data: NoteTargetInput!) { createNoteTarget(data: $data){ id} }")
if cid:
    gq(tgt, {"data":{"noteId":nid,"targetCompanyId":cid}}); linked.append('company')
for pid in pids:
    gq(tgt, {"data":{"noteId":nid,"targetPersonId":pid}}); linked.append(pid[:8])
print(json.dumps({"ok":True,"note_id":nid,"title":note['title'],"linked":linked}))
PY