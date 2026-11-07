#!/usr/bin/env bash
# kanban.sh — bash wrapper around the Hermes Kanban store (~/.hermes/kanban.db).
#
# Mirrors the status mapping and row shape of src/server/kanban-backend.ts so bash
# runners (launchd night fleet) and the workspace PWA board stay one source of truth.
# Board lanes:  backlog|ready|running|review|blocked|done
# DB statuses:  queued |ready |running |review |blocked |done
#
# Usage:
#   kanban.sh create --agent NAME --title TITLE [--spec TEXT] [--lane LANE] [--created-by ID]
#   kanban.sh set    <id> --lane LANE
#   kanban.sh fail   <id> "reason"        # -> blocked, reason appended to body
#   kanban.sh done   <id>                 # -> done
#   kanban.sh get    <id>
#   kanban.sh latest --agent NAME         # most recent card for an assignee
#   kanban.sh list   [--lane LANE] [--agent NAME]
#   kanban.sh meta                        # backend detection info
set -u

DB="${HERMES_KANBAN_DB:-${HERMES_HOME:-$HOME/.hermes}/kanban.db}"
KANBAN_WS_ROOT="$(dirname "$DB")/kanban"

sqlq() { # single-quote escape for sqlite literals
  printf '%s' "$1" | sed "s/'/''/g"
}

db() { # sqlite invocation with busy-timeout
  [ -f "$DB" ] || { echo "FAIL kanban db not found: $DB" >&2; exit 3; }
  sqlite3 -cmd '.timeout 5000' -json "$DB" "$@"
}

lane_to_db() {
  case "$(printf '%s' "${1:-backlog}" | tr '[:upper:]' '[:lower:]')" in
    backlog) echo queued ;;
    ready|running|review|blocked|done) printf '%s' "$1" | tr '[:upper:]' '[:lower:]' ;;
    *) echo "" ;;
  esac
}

now() { date +%s; }

require_card() { # ID -> rc1 + exit when card missing
  local n
  n=$(db "select count(*) as n from tasks where id='$(sqlq "$1")' limit 1;" 2>/dev/null \
    | python3 -c "import json,sys
try: print(json.load(sys.stdin)[0]['n'])
except Exception: print(0)")
  [ "$n" = "1" ] || { echo "FAIL no such card: $1" >&2; exit 4; }
}

new_id() { uuidgen | tr -d '-' | cut -c1-8 | tr '[:upper:]' '[:lower:]'; }

cmd="${1:-}"; shift || true
case "$cmd" in
  meta)
    if [ -f "$DB" ]; then
      echo "backend=hermes db=$DB writable=yes"
    else
      echo "backend=local-fallback db=$DB missing"
    fi
    ;;

  create)
    AGENT=""; TITLE=""; SPEC=""; LANE=backlog; BY="night-fleet"
    while [ $# -gt 0 ]; do
      case "$1" in
        --agent) AGENT="$2"; shift 2;;
        --title) TITLE="$2"; shift 2;;
        --spec) SPEC="$2"; shift 2;;
        --lane) LANE="$2"; shift 2;;
        --created-by) BY="$2"; shift 2;;
        *) echo "FAIL unknown option: $1" >&2; exit 1;;
      esac
    done
    [ -n "$TITLE" ] || { echo "FAIL --title required"; exit 1; }
    S=$(lane_to_db "$LANE"); [ -n "$S" ] || { echo "FAIL invalid lane: $LANE"; exit 1; }
    ID="t_$(new_id)"
    T=$(now); WP="$KANBAN_WS_ROOT/workspaces/$ID"
    db "insert into tasks (id,title,body,assignee,status,priority,created_by,created_at,workspace_kind,workspace_path)
        values ('$(sqlq "$ID")','$(sqlq "$TITLE")','$(sqlq "$SPEC")',$( [ -n "$AGENT" ] && echo "'$(sqlq "$AGENT")'" || echo NULL),'$S',0,'$(sqlq "$BY")',$T,'scratch','$(sqlq "$WP")');" >/dev/null
    echo "$ID"
    ;;

  set)
    ID="${1:?usage: kanban.sh set <id> --lane LANE}"; shift
    LANE=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --lane) LANE="$2"; shift 2;;
        *) shift;;
      esac
    done
    [ -n "$LANE" ] || { echo "FAIL --lane required"; exit 1; }
    S=$(lane_to_db "$LANE"); [ -n "$S" ] || { echo "FAIL invalid lane: $LANE"; exit 1; }
    SETS="status='$S'"
    [ "$S" = running ] && SETS="$SETS, started_at = coalesce(started_at, $(now))"
    if [ "$S" = done ]; then SETS="$SETS, completed_at=$(now)"; else SETS="$SETS, completed_at=NULL"; fi
    db "update tasks set $SETS where id='$(sqlq "$ID")';" >/dev/null
    ROW=$(db "select id,status from tasks where id='$(sqlq "$ID")' limit 1;" 2>/dev/null)
    [ -n "$ROW" ] && { echo "PASS $ID -> $S"; } || { echo "FAIL no such card: $ID"; exit 4; }
    ;;

  fail)
    ID="${1:?usage: kanban.sh fail <id> \"reason\"}"; REASON="${2:?usage: kanban.sh fail <id> \"reason\"}"
    require_card "$ID"
    OLD=$(db "select coalesce(body,'') from tasks where id='$(sqlq "$ID")' limit 1;" 2>/dev/null \
      | python3 -c "import json,sys
try: print(json.load(sys.stdin)[0].get(\"coalesce(body,'')\") or '')
except Exception: print('')")
    NEW="$(printf '%s' "$OLD" | sed "s/'/''/g")
FAIL $(date +%F_%T): $(printf '%s' "$REASON" | sed "s/'/''/g")"
    db "update tasks set status='blocked', completed_at=NULL, body='$NEW' where id='$(sqlq "$ID")';" >/dev/null
    echo "PASS $ID -> blocked"
    ;;

  done)
    ID="${1:?usage: kanban.sh done <id>}"
    require_card "$ID"
    db "update tasks set status='done', completed_at=$(now) where id='$(sqlq "$ID")';" >/dev/null
    echo "PASS $ID -> done"
    ;;

  get)
    ID="${1:?usage: kanban.sh get <id>}"
    require_card "$ID"
    db "select id,title,body,assignee,status,created_at,coalesce(last_heartbeat_at,completed_at,started_at,created_at) as updated_at
        from tasks where id='$(sqlq "$ID")' limit 1;" 2>/dev/null \
      | python3 -c "import json,sys
try:
    rows=json.load(sys.stdin)
except Exception:
    rows=[]
if not rows: raise SystemExit(4)
r=rows[0]
print(f\"id={r['id']}\")
print(f\"title={r['title']}\")
print(f\"assignee={r.get('assignee') or ''}\")
print(f\"status={r['status']}\")
print(f\"updated_at={r.get('updated_at') or ''}\")
b=(r.get('body') or '').strip()
if b: print(f\"body={b}\")"
    ;;
    
  latest)
    AGENT=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --agent) AGENT="$2"; shift 2;;
        *) shift;;
      esac
    done
    [ -n "$AGENT" ] || { echo "FAIL --agent required"; exit 1; }
    db "select id from tasks where assignee='$(sqlq "$AGENT")' order by created_at desc, id desc limit 1;" 2>/dev/null \
      | python3 -c "import json,sys
try:
    rows=json.load(sys.stdin)
except Exception:
    rows=[]
print(rows[0]['id'] if rows else '')"
    ;;

  list)
    LANE=""; AGENT=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --lane) LANE="$2"; shift 2;;
        --agent) AGENT="$2"; shift 2;;
        *) shift;;
      esac
    done
    WHERE="1=1"
    [ -n "$LANE" ] && { S=$(lane_to_db "$LANE"); [ -n "$S" ] || { echo "FAIL invalid lane: $LANE"; exit 1; }; WHERE="$WHERE and status='$S'"; }
    [ -n "$AGENT" ] && WHERE="$WHERE and assignee='$(sqlq "$AGENT")'"
    db "select id,assignee,status,title,coalesce(last_heartbeat_at,completed_at,started_at,created_at) as updated_at
        from tasks where $WHERE order by created_at desc, id desc;" 2>/dev/null \
      | python3 -c "import json,sys
try: rows=json.load(sys.stdin)
except Exception: rows=[]
for r in rows:
    print('\t'.join([r['id'], r.get('assignee') or '-', r['status'], r['title'].replace(chr(9),' '), str(r.get('updated_at') or '')]))"
    ;;

  *)
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    [ -n "$cmd" ] && { echo ""; echo "FAIL unknown command: $cmd"; exit 64; }
    ;;
esac
