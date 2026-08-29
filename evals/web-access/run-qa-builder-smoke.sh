#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
TARGET_URL="https://example.com"
RUN_ID="qa-builder-smoke"
EVIDENCE_DIR="$ROOT/.hermes/evidence/web-access/$RUN_ID"
QA_DIR="$EVIDENCE_DIR/qa"
BUILDER_DIR="$EVIDENCE_DIR/builder"
PROFILE_ROOT="$ROOT/.agent-browser-profiles"

export AGENT_BROWSER_QA_PROFILE="$PROFILE_ROOT/qa"
export AGENT_BROWSER_BUILDER_PROFILE="$PROFILE_ROOT/builder"
export AGENT_BROWSER_QA_SESSION_NAME="hermes-qa-phase2"
export AGENT_BROWSER_BUILDER_SESSION_NAME="hermes-builder-phase2"
export AGENT_BROWSER_SOCKET_DIR="${AGENT_BROWSER_SOCKET_DIR:-/private/tmp/hermes-ab-phase2}"
export AGENT_BROWSER_ALLOWED_DOMAINS="example.com"

mkdir -p "$QA_DIR" "$BUILDER_DIR" "$AGENT_BROWSER_QA_PROFILE" "$AGENT_BROWSER_BUILDER_PROFILE" "$AGENT_BROWSER_SOCKET_DIR"

printf '[PROGRESS] validation_starts | QA/Builder smoke starting for %s\n' "$TARGET_URL"

agent-browser close --all >/dev/null 2>&1 || true

printf '== qa rendered evidence ==\n'
agent-browser \
  --profile "$AGENT_BROWSER_QA_PROFILE" \
  --session-name "$AGENT_BROWSER_QA_SESSION_NAME" \
  open "$TARGET_URL"
agent-browser snapshot -i --compact | tee "$QA_DIR/snapshot-before.txt" >/dev/null
agent-browser screenshot "$QA_DIR/screenshot-before.png" >/dev/null
agent-browser close >/dev/null 2>&1 || true
grep -q 'Example Domain' "$QA_DIR/snapshot-before.txt"
test -s "$QA_DIR/screenshot-before.png"

cat > "$QA_DIR/qa-report.md.tmp" <<EOF
# QA Smoke Report

Status: PASS
Run ID: $RUN_ID
Target: $TARGET_URL
Profile: $AGENT_BROWSER_QA_PROFILE
Session: $AGENT_BROWSER_QA_SESSION_NAME

## Route

QA used agent-browser first for rendered snapshot and screenshot evidence. Crawl4AI was not needed because the target is a safe static smoke page and no source preflight was required. Playwright/browser-harness and deep-browser were not used.

## Checks

- Snapshot contains \`Example Domain\`: PASS
- Screenshot exists and is non-empty: PASS

## Guards

- No credential entry.
- No public actions.
- No form submission.
- No external sends.
- No cloud stealth, proxy escalation, CAPTCHA handling, or destructive action.
EOF
mv "$QA_DIR/qa-report.md.tmp" "$QA_DIR/qa-report.md"

printf '[PROGRESS] phase_complete_major | QA smoke evidence captured\n'

printf '== builder rendered evidence ==\n'
agent-browser close --all >/dev/null 2>&1 || true
agent-browser \
  --profile "$AGENT_BROWSER_BUILDER_PROFILE" \
  --session-name "$AGENT_BROWSER_BUILDER_SESSION_NAME" \
  open "$TARGET_URL"
agent-browser snapshot -i --compact | tee "$BUILDER_DIR/before.snapshot.txt" >/dev/null
agent-browser screenshot "$BUILDER_DIR/before.png" >/dev/null
agent-browser close >/dev/null 2>&1 || true
grep -q 'Example Domain' "$BUILDER_DIR/before.snapshot.txt"
test -s "$BUILDER_DIR/before.png"

cat > "$BUILDER_DIR/actions.md.tmp" <<EOF
# Builder Actions

Status: PASS
Run ID: $RUN_ID
Target: $TARGET_URL
Profile: $AGENT_BROWSER_BUILDER_PROFILE
Session: $AGENT_BROWSER_BUILDER_SESSION_NAME

## Contract

- Allowed actions: open target, capture compact snapshot, capture screenshot, verify static text.
- Forbidden actions: credential entry, public posting, form submission, external send, purchase, account/admin mutation, CAPTCHA bypass, cloud stealth, proxy escalation, destructive flow.
- Expected end state: rendered page snapshot contains \`Example Domain\`; screenshot artifact exists.
- Auth/session posture: unauthenticated sandbox-local profile.

## Actions Performed

1. Opened \`$TARGET_URL\` with sandbox-local Builder profile.
2. Captured \`before.snapshot.txt\`.
3. Captured \`before.png\`.
4. Verified \`Example Domain\` in the snapshot.

No page mutation, form submission, or external action was attempted.
EOF
mv "$BUILDER_DIR/actions.md.tmp" "$BUILDER_DIR/actions.md"

python3 - <<'PY'
import datetime as dt
import json
import os
import pathlib

root = pathlib.Path(".hermes/evidence/web-access/qa-builder-smoke")
now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
summary = {
    "run_id": "qa-builder-smoke",
    "created_at": now,
    "target": "https://example.com",
    "status": "PASS",
    "route": {
        "qa": "agent-browser first for snapshot/action/screenshot evidence",
        "builder": "agent-browser first for scoped non-mutating execution evidence",
        "crawl4ai": "not needed for safe static smoke preflight",
        "playwright_browser_harness": "not used",
        "deep_browser": "gated; not used",
    },
    "profiles": {
        "qa": os.environ["AGENT_BROWSER_QA_PROFILE"],
        "builder": os.environ["AGENT_BROWSER_BUILDER_PROFILE"],
    },
    "sessions": {
        "qa": os.environ["AGENT_BROWSER_QA_SESSION_NAME"],
        "builder": os.environ["AGENT_BROWSER_BUILDER_SESSION_NAME"],
    },
    "checks": {
        "qa_snapshot_contains_example_domain": "PASS",
        "qa_screenshot_non_empty": "PASS",
        "builder_snapshot_contains_example_domain": "PASS",
        "builder_screenshot_non_empty": "PASS",
    },
    "evidence": {
        "qa_snapshot": ".hermes/evidence/web-access/qa-builder-smoke/qa/snapshot-before.txt",
        "qa_screenshot": ".hermes/evidence/web-access/qa-builder-smoke/qa/screenshot-before.png",
        "qa_report": ".hermes/evidence/web-access/qa-builder-smoke/qa/qa-report.md",
        "builder_snapshot": ".hermes/evidence/web-access/qa-builder-smoke/builder/before.snapshot.txt",
        "builder_screenshot": ".hermes/evidence/web-access/qa-builder-smoke/builder/before.png",
        "builder_actions": ".hermes/evidence/web-access/qa-builder-smoke/builder/actions.md",
    },
    "guards": {
        "safe_public_target_only": True,
        "credentials": False,
        "public_actions": False,
        "form_submission": False,
        "external_sends": False,
        "cloud_stealth": False,
        "destructive_actions": False,
    },
}
(root / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
PY

printf '[PROGRESS] qa-builder smoke evidence captured | Evidence directory: %s\n' "$EVIDENCE_DIR"
printf '[PROGRESS] phase_complete_major | Phase 2 QA/Builder smoke artifacts created\n'
printf 'qa-builder smoke: PASS\n'
