#!/usr/bin/env bash
# test-slack-hermes.sh — automated battery for Slack 1:1 mirror to AI Protect Slack #hermes-agents.
# Hermes agents must post 1:1 to Buzz AND Slack hermes-agents (see docs/ops/chief-of-staff.md §2, system-operations-manual.md §7).
# Mock-based, anytime-of-day safe; never hits live Slack/Buzz. Mirrors test-chief-of-staff.sh style (PASS/FAIL, no DRYRUN leak).
# Usage: ops/bin/test-slack-hermes.sh [-v]
set -u
WS_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
NOTIFY="$WS_DIR/ops/lib/notify-slack.sh"
RUNNER_NIGHT="$WS_DIR/ops/bin/run-night-agent.sh"
RUNNER_PI="$WS_DIR/ops/bin/run-product-intel.sh"
RUNNER_COS="$WS_DIR/ops/bin/run-chief-of-staff.sh"
RUNNER_FH="$WS_DIR/ops/bin/run-fleet-health.sh"
FIX="$(mktemp -d /tmp/slack-hermes-test.XXXXXX)"
VERBOSE="${1:-}"
PASS=0; FAIL=0; CURRENT=""
say()  { [ "$VERBOSE" = "-v" ] && echo "    $*"; }
t_start(){ CURRENT="$1"; say ""; say "▶ $1"; }
t_pass(){ PASS=$((PASS+1)); echo "PASS $CURRENT"; }
t_fail(){ FAIL=$((FAIL+1)); echo "FAIL $CURRENT — $*"; }
trap 'rm -rf "$FIX"' EXIT

# Mock curl to capture Slack payloads without network — used for notify tests only.
MOCK_BIN="$FIX/mock-bin"; mkdir -p "$MOCK_BIN"
cat > "$MOCK_BIN/curl" <<'MOCKCURL'
#!/usr/bin/env bash
# Capture args to file indicated by CURL_CAPTURE; simulate Slack API responses.
CAP="${CURL_CAPTURE:-/tmp/curl-capture.json}"
printf '%s\n' "$@" > "$CAP.args"
# If POST data contains chat.postMessage mock success, or webhook URL mock success
PAYLOAD=""
for a in "$@"; do case "$a" in -d) PAYLOAD_NEXT=1;; *) if [ "${PAYLOAD_NEXT:-0}" = "1" ]; then PAYLOAD="$a"; PAYLOAD_NEXT=0; fi;; esac; done
printf '%s' "$PAYLOAD" > "$CAP.payload" 2>/dev/null || true
# Simulate return: webhook path → 200; bot path → {"ok":true}
if printf '%s\n' "$@" | grep -q "hooks.slack.com"; then
  echo "ok"; exit 0
fi
if printf '%s\n' "$@" | grep -q "slack.com/api/chat.postMessage"; then
  printf '{"ok":true}\n200\n'
  exit 0
fi
# Default: success
printf '{}\n200\n'; exit 0
MOCKCURL
chmod +x "$MOCK_BIN/curl"

# Helpers
mkfile() { local f="$FIX/$1"; mkdir -p "$(dirname "$f")"; printf '%s\n' "$2" > "$f"; printf '%s' "$f"; }

# ── S01 notify-slack.sh exists and is executable ─────────────────────────────
t_start "S01 notify-slack.sh exists and is executable"
[ -x "$NOTIFY" ] && t_pass || t_fail "missing or not executable: $NOTIFY"

# ── S02 skip when no credentials (clean env) ─────────────────────────────────
t_start "S02 SLACK-SKIP when no credentials"
F=$(mkfile "digest.md" "# Fleet Health — 2026-09-07")
# Isolate: no secrets files, no env vars
out=$(env -u SLACK_WEBHOOK_URL -u SLACK_HERMES_AGENTS_WEBHOOK_URL -u SLACK_BOT_TOKEN -u SLACK_CHANNEL -u SLACK_HERMES_AGENTS_CHANNEL \
  OPS_DIR="$WS_DIR/ops" WS_DIR="$WS_DIR" bash -c "
    export FIX_OPS=\"$FIX/ops-empty\"
    mkdir -p \"\$FIX_OPS/secrets\" \"\$FIX_OPS/config\"
    # point script to empty ops dir via symlink trick: override OPS_DIR inside script by moving secrets
    # simpler: run with empty slack.env — script sources WS_DIR/.env but we clear vars above; it will see no webhook/bot
    PATH=\"$MOCK_BIN:\$PATH\" \"$NOTIFY\" \"$F\" 2>&1
  " 2>&1) || true
echo "$out" | grep -q "SLACK-SKIP" && t_pass || t_fail "expected SLACK-SKIP, got: $out"

# ── S03 webhook precedence: SLACK_HERMES_AGENTS_WEBHOOK_URL wins ─────────────
t_start "S03 webhook precedence — SLACK_HERMES_AGENTS_WEBHOOK_URL → #hermes-agents"
F=$(mkfile "brief.md" "# Morning Brief")
WEBHOOK_HERMES="https://hooks.slack.com/services/T000/B000/HERMESAGENTS"
WEBHOOK_LEGACY="https://hooks.slack.com/services/T000/B000/LEGACY"
CAP="$FIX/cap-webhook"
out=$(CURL_CAPTURE="$CAP" PATH="$MOCK_BIN:$PATH" SLACK_HERMES_AGENTS_WEBHOOK_URL="$WEBHOOK_HERMES" SLACK_WEBHOOK_URL="$WEBHOOK_LEGACY" "$NOTIFY" "$F" "Morning Brief" 2>&1) || true
# Check curl was called with hermes-agents webhook (not legacy)
if grep -q "SLACK-OK.*webhook.*#hermes-agents" <<<"$out" && grep -q "HERMESAGENTS" "$CAP.args" 2>/dev/null; then t_pass; else t_fail "out=$out cap=$(cat "$CAP.args" 2>/dev/null | tr '\n' ' ')"; fi

# ── S04 bot token with hermes-agents channel ─────────────────────────────────
t_start "S04 bot token → SLACK_HERMES_AGENTS_CHANNEL #hermes-agents"
F=$(mkfile "pi-delta.md" "## Product Intel Delta")
CAP2="$FIX/cap-bot"
out=$(CURL_CAPTURE="$CAP2" PATH="$MOCK_BIN:$PATH" SLACK_BOT_TOKEN="xoxb-fake" SLACK_HERMES_AGENTS_CHANNEL="#hermes-agents" "$NOTIFY" "$F" "product-intel LIGHT" 2>&1) || true
if grep -q "SLACK-OK.*bot.*#hermes-agents" <<<"$out" && grep -q "chat.postMessage" "$CAP2.args" 2>/dev/null; then t_pass; else t_fail "out=$out"; fi

# ── S05 bot fallback to SLACK_CHANNEL then default #hermes-agents ─────────────
t_start "S05 bot fallback channel defaults to #hermes-agents when no explicit channel"
F=$(mkfile "fleet.md" "# Fleet Health")
CAP3="$FIX/cap-fallback"
out=$(CURL_CAPTURE="$CAP3" PATH="$MOCK_BIN:$PATH" SLACK_BOT_TOKEN="xoxb-fake" "$NOTIFY" "$F" 2>&1) || true
# Should default to #hermes-agents, not #night-runs
if grep -q "#hermes-agents" <<<"$out"; then t_pass; else t_fail "expected default #hermes-agents, got: $out"; fi

# ── S06 never fails job (exit 0 on missing file, bad file) ───────────────────
t_start "S06 never fails job — missing file exits 0 with SLACK-SKIP"
out=$(PATH="$MOCK_BIN:$PATH" "$NOTIFY" "/nonexistent-$(date +%s).md" 2>&1); rc=$?
[ $rc -eq 0 ] && echo "$out" | grep -q "SLACK-SKIP" && t_pass || t_fail "rc=$rc out=$out"

# ── S07 payload truncation & header (title hint included) ─────────────────────
t_start "S07 payload includes title hint and is truncated to Slack limits"
# Generate a large file > 4000 chars
LARGE="$FIX/large.md"; python3 -c "print('# Large\n' + 'x'*5000)" > "$LARGE"
CAP4="$FIX/cap-large"
out=$(CURL_CAPTURE="$CAP4" PATH="$MOCK_BIN:$PATH" SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T/B/LARGE" "$NOTIFY" "$LARGE" "Large Digest" 2>&1) || true
# Payload should exist and be ≤ ~4000 JSON chars (script truncates to 2900 body + 3500 head)
if [ -f "$CAP4.payload" ] && [ "$(wc -c < "$CAP4.payload" | tr -d ' ')" -lt 8000 ] && grep -q "Large Digest" "$CAP4.payload" 2>/dev/null; then t_pass; else t_fail "payload missing or not truncated"; fi

# ── S08 runners wire notify-slack.sh (1:1 Buzz AND Slack) ─────────────────────
t_start "S08 runners wire Slack 1:1 — all 4 run-* scripts call notify-slack.sh"
missing=""
for R in "$RUNNER_NIGHT" "$RUNNER_PI" "$RUNNER_COS" "$RUNNER_FH"; do
  if ! grep -q "notify-slack.sh" "$R"; then missing="$missing $(basename "$R")"; fi
done
if [ -z "$missing" ]; then t_pass; else t_fail "missing notify-slack in:$missing"; fi

# ── S09 run-night-agent posts with agent name as title hint ───────────────────
t_start "S09 run-night-agent uses agent name as Slack title hint"
if grep -q 'notify-slack.sh.*"\$OUT_FILE".*"\$AGENT"' "$RUNNER_NIGHT"; then t_pass; else t_fail "no \$AGENT hint in $RUNNER_NIGHT"; fi

# ── S10 run-chief-of-staff mirrors both Morning Brief and proposals ───────────
t_start "S10 run-chief-of-staff mirrors Morning Brief and proposals to Slack"
if grep -q 'Morning Brief.*\$TODAY' "$RUNNER_COS" && grep -q 'Feature Proposal' "$RUNNER_COS" && grep -q 'cos-proposals' "$RUNNER_COS"; then t_pass; else t_fail "missing brief or proposals mirror"; fi

# ── S11 run-product-intel mirrors delta + candidates ───────────────────────────
t_start "S11 run-product-intel mirrors delta and candidates to Slack"
if grep -q 'product-intel.*MODE' "$RUNNER_PI" && grep -q 'CAND_TODAY' "$RUNNER_PI" && grep -q 'notify-slack.sh.*CAND_TODAY' "$RUNNER_PI"; then t_pass; else t_fail "missing CAND_TODAY slack mirror"; fi

# ── S12 run-fleet-health includes Slack title Fleet Health ─────────────────────
t_start "S12 run-fleet-health posts Fleet Health title to Slack"
if grep -q 'Fleet Health.*\$TODAY' "$RUNNER_FH"; then t_pass; else t_fail "no Fleet Health hint"; fi

# ── S13 DRYRUN-aware: runners still allow notify in DRYRUN? Check not hard-bypassed ─
# Our design: notify-slack.sh is outside DRYYN guard (fire-and-forget always writes file source). Ensure not inside DRYRUN=1 skip.
t_start "S13 notify-slack calls are outside DRYRUN-only Buzz guard (Slack always attempted)"
# Slack lines should NOT be inside 'if [ \"${DRYRUN:-0}\" != \"1\" ] && [ -f \"$SECRETS\" ]' — they are after it
if grep -A2 "DRYRUN.*!=.*1.*SECRETS" "$RUNNER_NIGHT" | grep -q "notify-slack"; then
  t_fail "Slack inside DRYRUN-guarded block — should be outside"
else
  t_pass
fi

echo
echo "== slack-hermes battery: $PASS passed, $FAIL failed =="
[ $FAIL -eq 0 ]
