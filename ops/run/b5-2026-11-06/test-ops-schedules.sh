#!/usr/bin/env bash
# test-ops-schedules.sh — static battery for the launchd schedule layer.
# Guards the Oct 2026 outage class: stale production launcher (run-server.js),
# repo/installed plist drift, duplicate supervisors, tailnet coupling.
# No mocks, no services needed; anytime-safe. (OS01–OS08, PASS/FAIL/SKIP.)
#
# Usage: ops/bin/test-ops-schedules.sh [-v]
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LAUNCHD="$WS_DIR/ops/launchd"
INST="$HOME/Library/LaunchAgents"
VERBOSE="${1:-}"
PASS=0; FAIL=0; CURRENT=""
say() { [ "$VERBOSE" = "-v" ] && echo "    $*"; }
t_pass() { PASS=$((PASS+1)); echo "PASS $CURRENT"; }
t_fail() { FAIL=$((FAIL+1)); echo "FAIL $CURRENT — $*"; }
t_skip() { echo "SKIP $CURRENT ($1)"; }
t_start() { CURRENT="$1"; say ""; say "▶ $1"; }

# ── OS01 all repo plists parse ──
t_start "OS01 all ops/launchd plists parse"
bad=""
for p in "$LAUNCHD"/*.plist; do
  plutil -lint "$p" >/dev/null 2>&1 || bad="$bad $(basename "$p")"
done
[ -z "$bad" ] && t_pass || t_fail "unparseable:$bad"

# ── OS02 installed workspace plist in sync with repo ──
t_start "OS02 installed com.ops.hermes-workspace.plist in sync with repo"
if [ ! -f "$INST/com.ops.hermes-workspace.plist" ]; then
  t_fail "not installed"
elif diff -q "$LAUNCHD/com.ops.hermes-workspace.plist" "$INST/com.ops.hermes-workspace.plist" >/dev/null 2>&1; then
  t_pass
else t_fail "drift — copy ops/launchd over ~/Library/LaunchAgents and reload"; fi

# ── OS03 no installed ops plist references run-server ──
t_start "OS03 no installed plist references stale run-server.js"
hits=$(grep -l "run-server" "$INST"/com.ops.*.plist 2>/dev/null || true)
[ -z "$hits" ] && t_pass || t_fail "stale refs in: $hits"

# ── OS04 tailscale-alive unloaded in local mode ──
t_start "OS04 tailscale-alive unloaded in local-only mode"
if [ "${TAILNET_OPTIONAL:-0}" = "1" ]; then t_skip "TAILNET_OPTIONAL=1"
elif launchctl list 2>/dev/null | grep -q "com.ops.tailscale-alive"; then
  t_fail "loaded — bootout gui/$(id -u)/com.ops.tailscale-alive"
else t_pass; fi

# ── OS05 stale duplicate supervisor absent ──
t_start "OS05 stale com.hermes.workspace not loaded"
if launchctl list 2>/dev/null | grep -q "com.hermes.workspace"; then
  t_fail "loaded — bootout gui/$(id -u)/com.hermes.workspace"
else t_pass; fi

# ── OS06 net.env gateway URL is localhost in local mode ──
t_start "OS06 net.env HERMES_GW_URL is localhost in local-only mode"
if [ "${TAILNET_OPTIONAL:-0}" = "1" ]; then t_skip "TAILNET_OPTIONAL=1"
else
  gw=$(grep -E "^HERMES_GW_URL=" "$WS_DIR/ops/config/net.env" 2>/dev/null | cut -d= -f2)
  [ "$gw" = "http://127.0.0.1:8642" ] && t_pass || t_fail "got: ${gw:-missing}"
fi

# ── OS07 every plist entrypoint exists and is executable ──
t_start "OS07 every launchd entrypoint script exists + executable"
missing=""
for p in "$LAUNCHD"/*.plist; do
  while IFS= read -r arg; do
    case "$arg" in
      *.sh)
        # inline `-c` command lines end with the script token — test that
        # token, not the whole command string (2026-11-06: production plist
        # runs `exec bash scripts/start-stable.sh` inside a single arg).
        shp="${arg##* }"
        case "$shp" in
          */*) ;;
          *) [ -f "$WS_DIR/$shp" ] && shp="$WS_DIR/$shp" ;;
        esac
        [ -x "$shp" ] || missing="$missing $(basename "$p"):$arg" ;;
      *cd\ *)
        dir=$(printf '%s' "$arg" | sed -E 's/.*cd[[:space:]]+([^ ;]+).*/\1/; s#^~/#'"$HOME"'/#')
        [ -d "$dir" ] || missing="$missing $(basename "$p"):cdir:$dir" ;;
    esac
  done < <(python3 -c "
import plistlib
d=plistlib.load(open('$p','rb'))
for a in d.get('ProgramArguments',[]):
    print(a)" 2>/dev/null)
done
[ -z "$missing" ] && t_pass || t_fail "missing:$missing"

# ── OS08 workspace job healthy (loaded + exit 0) ──
t_start "OS08 com.ops.hermes-workspace loaded with exit 0"
if launchctl list 2>/dev/null | awk '$3=="com.ops.hermes-workspace"{print $2}' | grep -qx "0"; then
  t_pass
else t_fail "$(launchctl list 2>/dev/null | grep hermes-workspace || echo 'not loaded')"; fi

echo
echo "== ops-schedules battery: $PASS passed, $FAIL failed =="
[ "$FAIL" -eq 0 ]
