#!/usr/bin/env bash
# mock-buzz.sh — PATH-shim stand-in for the buzz CLI used by test-buzz-kanban.sh.
# Behavior is fixture-driven; every invocation is logged to $MOCK_BUZZ_LOG (one line
# per call: subcommand + args) so tests can assert exact call shapes.
#
# Fixtures (env):
#   MOCK_BUZZ_LOG           log file (required)
#   MOCK_BUZZ_FIX           fixture dir (required)
#     channels.json         output for `buzz channels list`
#     existing-agents.txt   names reported as existing profiles (users get)
#     approvals.json        output for `buzz messages get`
#     reactions-<EID>.json  output for `buzz reactions get --event <EID>`
#     send-fail             if present, `messages send` exits 1
#   MOCK_BUZZ_DOWN=1        all relay calls fail rc=2 (unreachable simulation)
set -u
[ -n "${MOCK_BUZZ_LOG:-}" ] && echo "buzz $*" >> "$MOCK_BUZZ_LOG"
cmd="${1:-}"; [ $# -gt 0 ] && shift

if [ "${MOCK_BUZZ_DOWN:-0}" = "1" ]; then exit 2; fi
FIX="${MOCK_BUZZ_FIX:?}"

case "$cmd" in
  channels)
    case "${1:-}" in
      list) cat "$FIX/channels.json" 2>/dev/null || echo "[]";;
      *) exit 1;;
    esac;;

  users)
    case "${1:-}" in
      get)
        name=""
        while [ $# -gt 0 ]; do
          case "$1" in --name) name="$2"; shift 2;; *) shift;; esac
        done
        if [ -f "$FIX/existing-agents.txt" ] && grep -qx "$name" "$FIX/existing-agents.txt"; then
          printf '[{"display_name":"%s","pubkey":"aa"}]' "$name"
        else
          echo "[]"
        fi;;
      *) exit 1;;
    esac;;

  agents)
    # draft-create / draft-update succeed silently (forms "opened")
    exit 0;;

  messages)
    case "${1:-}" in
      get) cat "$FIX/approvals.json" 2>/dev/null || echo "[]";;
      send) [ -f "$FIX/send-fail" ] && exit 1 || exit 0;;
      *) exit 1;;
    esac;;

  reactions)
    case "${1:-}" in
      get)
        ev=""
        while [ $# -gt 0 ]; do
          case "$1" in --event) ev="$2"; shift 2;; *) shift;; esac
        done
        cat "$FIX/reactions-$ev.json" 2>/dev/null || echo '{"reactions":[]}';;
      *) exit 1;;
    esac;;

  *) exit 0;;
esac
