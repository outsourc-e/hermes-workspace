#!/usr/bin/env bash
# Hermes weekly security scan (com.hermes.security-scan, Mondays 08:00).
#
# Checks (all read-only except permission fixes):
#   1. secret file permissions   — ~/.hermes/.env, profile .envs, google-token,
#                                  audit.key must be 600 (auto-fixes + reports)
#   2. listening ports           — anything beyond the expected set on 0.0.0.0
#   3. secrets in the repo       — token-shaped strings in tracked files
#   4. secrets in logs           — token-shaped strings in ~/.hermes/logs
#   5. audit chain integrity     — /api/audit-log?verify=1
#   6. Tailscale exposure        — funnel (public internet) must be off
#
# Findings → Discord + phone push. Silence = clean.
set -uo pipefail

ENV_FILE="$HOME/.hermes/.env"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
FINDINGS=()

f() { FINDINGS+=("$1"); echo "[security-scan] $1"; }

# 1. permissions --------------------------------------------------------------
for SECRET in "$ENV_FILE" "$HOME/.hermes/google-token.json" "$HOME/.hermes/audit.key" "$HOME"/.hermes/profiles/*/.env; do
  [ -f "$SECRET" ] || continue
  PERM=$(stat -f '%Lp' "$SECRET" 2>/dev/null || echo '')
  if [ "$PERM" != "600" ]; then
    chmod 600 "$SECRET" 2>/dev/null && f "fixed perms on $SECRET (was $PERM)" || f "BAD perms on $SECRET ($PERM) — could not fix"
  fi
done

# 2. listening ports ----------------------------------------------------------
# Expected local services; anything else listening on all interfaces is a flag.
EXPECTED_PORTS="3000 8642 9119 11434 9222 9223"
# macOS system daemons that always listen (AirPlay, Handoff): ignore by process.
IGNORE_PROCS="ControlCe rapportd sharingd AirPlayXP"
while IFS= read -r LINE; do
  PORT=$(printf '%s' "$LINE" | sed -E 's/.*[.:]([0-9]+)$/\1/')
  PROC=$(printf '%s' "$LINE" | awk '{print $1}')
  case " $IGNORE_PROCS " in *" $PROC "*) continue ;; esac
  case " $EXPECTED_PORTS " in *" $PORT "*) : ;; *) f "unexpected listener on 0.0.0.0:$PORT ($PROC)" ;; esac
done < <(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '$9 ~ /^\*[.:]/{print $1" "$9}' | sort -u)

# 3. secrets in tracked repo files ---------------------------------------------
HITS=$(cd "$REPO" && git grep -lIE '(ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{20,}|GOCSPX-[A-Za-z0-9_-]{10,}|AIza[A-Za-z0-9_-]{30,})' -- . 2>/dev/null | head -5 || true)
[ -n "$HITS" ] && f "token-shaped strings in tracked files: $(printf '%s' "$HITS" | tr '\n' ' ')"

# 4. secrets in logs ------------------------------------------------------------
LOGHITS=$(grep -rlIE '(ghp_[A-Za-z0-9]{20,}|GOCSPX-[A-Za-z0-9_-]{10,}|Bot [A-Za-z0-9_.-]{50,})' "$HOME/.hermes/logs" 2>/dev/null | head -3 || true)
[ -n "$LOGHITS" ] && f "token-shaped strings in logs: $(printf '%s' "$LOGHITS" | tr '\n' ' ')"

# 5. audit chain -----------------------------------------------------------------
CHAIN=$(curl -sS -m 15 'http://127.0.0.1:3000/api/audit-log?verify=1' 2>/dev/null | python3 -c 'import json,sys
try:
  c = json.load(sys.stdin)["chain"]
  print("ok" if c["ok"] else "BROKEN at entry %s of %s" % (c["brokenAt"], c["entries"]))
except Exception:
  print("unreachable")' || echo unreachable)
[ "$CHAIN" != "ok" ] && f "audit chain: $CHAIN"

# 6. tailscale funnel -------------------------------------------------------------
if command -v tailscale >/dev/null 2>&1; then
  FUNNEL=$(tailscale funnel status 2>/dev/null | grep -c 'proxy\|https' || true)
  [ "${FUNNEL:-0}" -gt 0 ] && f "Tailscale Funnel is exposing services to the public internet"
fi

# report ---------------------------------------------------------------------------
if [ ${#FINDINGS[@]} -eq 0 ]; then
  echo "[security-scan] clean"
  exit 0
fi

getenv() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }
BOT_TOKEN="$(getenv DISCORD_BOT_TOKEN)"; CHANNEL="$(getenv DISCORD_HOME_CHANNEL)"
NTFY_TOPIC="$(getenv HERMES_NTFY_TOPIC)"; NTFY_SERVER="$(getenv HERMES_NTFY_SERVER)"
[ -z "$NTFY_SERVER" ] && NTFY_SERVER="https://ntfy.sh"

if [ -n "$BOT_TOKEN" ] && [ -n "$CHANNEL" ]; then
  BODY=$(printf '%s\n' "${FINDINGS[@]}" | python3 -c 'import json,sys;print(json.dumps({"content":"🔒 **Security scan findings**\n"+sys.stdin.read()[:1800]}))')
  curl -sS -m 10 -X POST -H "Authorization: Bot $BOT_TOKEN" -H 'Content-Type: application/json' \
    -d "$BODY" "https://discord.com/api/v10/channels/$CHANNEL/messages" >/dev/null 2>&1 || true
fi
if [ -n "$NTFY_TOPIC" ]; then
  printf '%s\n' "${FINDINGS[@]}" | head -c 3800 | curl -sS -m 10 -X POST \
    -H 'Title: Security scan findings' -H 'Priority: 4' -H 'Tags: lock' \
    --data-binary @- "$NTFY_SERVER/$NTFY_TOPIC" >/dev/null 2>&1 || true
fi
exit 0
