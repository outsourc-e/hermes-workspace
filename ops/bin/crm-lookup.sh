#!/usr/bin/env bash
# crm-lookup.sh — fuzzy-search Twenty companies & people by name fragment.
# Usage: crm-lookup.sh [--staging] "<query>"
# Output: JSON {companies:[{id,name}], people:[{id,name}]}
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING=0; [ "${1:-}" = "--staging" ] && { STAGING=1; shift; }
Q="${1:?usage: crm-lookup.sh [--staging] \"query\"}"
get() { grep "^$1=" "$WS_DIR/.env" | head -1 | cut -d= -f2-; }
KEY=$(get TWENTY_SERVICE_KEY); URL="http://127.0.0.1:3000/graphql"
[ $STAGING -eq 1 ] && { KEY=$(get TWENTY_API_KEY); URL="http://127.0.0.1:3100/graphql"; }

gq() { curl -sf -m 15 -X POST "$URL" -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' -d "$1"; }

gq '{"query":"{ companies { edges { node { id name } } } }"}' > /tmp/_cl.json || { echo "{\"error\":\"unreachable\"}"; exit 2; }
gq '{"query":"{ people(first:100) { edges { node { id firstName lastName } } } }"}' > /tmp/_pl.json 2>/dev/null || echo '{"data":{"people":{"edges":[]}}}' > /tmp/_pl.json

python3 - "$Q" <<'PY'
import json, sys, re
q=sys.argv[1].lower().strip()
def load(p, kind):
    try:
        d=json.load(open(p))
        return [n['node'] for n in d['data'][kind]['edges']]
    except Exception: return []
def score(name):
    n=name.lower()
    if n==q: return 100
    if q in n: return 80-(len(n)-len(q))
    if re.search(r'\b'+re.escape(q), n): return 60
    # all query words present
    return 40 if all(w in n for w in q.split()) else 0
comps=[{'id':c['id'],'name':c.get('name') or '',**{'s':score(c.get('name') or '')}} for c in load('/tmp/_cl.json','companies')]
ppl=[]
for p in load('/tmp/_pl.json','people'):
    name=f"{p.get('firstName','')} {p.get('lastName','')}".strip()
    s=score(name)
    if s: ppl.append({'id':p['id'],'name':name,'s':s})
out={'companies':[c for c in sorted(comps,key=lambda x:-x['s'])[:5] if c['s']>0],
     'people':  [p for p in sorted(ppl, key=lambda x:-x['s'])[:5]]}
print(json.dumps(out))
PY