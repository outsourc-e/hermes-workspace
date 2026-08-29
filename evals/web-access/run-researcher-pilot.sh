#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
EVIDENCE_DIR="$ROOT/.hermes/evidence/web-access/researcher-pilot"
MARKDOWN_DIR="$EVIDENCE_DIR/markdown"
TARGET_URL="https://example.com"
RUN_ID="researcher-pilot"

mkdir -p "$MARKDOWN_DIR"

printf '[PROGRESS] 10%% | Researcher pilot evidence directory ready: %s\n' "$EVIDENCE_DIR"

printf '== crawl4ai health ==\n'
curl -fsS http://localhost:11235/health -o "$EVIDENCE_DIR/crawl4ai-health.json.tmp"
mv "$EVIDENCE_DIR/crawl4ai-health.json.tmp" "$EVIDENCE_DIR/crawl4ai-health.json"
printf '\n'

printf '[PROGRESS] 25%% | Crawl4AI health captured\n'

printf '== crawl4ai markdown ==\n'
curl -fsS -X POST http://localhost:11235/md \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","f":"fit"}' \
  -o "$EVIDENCE_DIR/crawl4ai-md.json.tmp"
mv "$EVIDENCE_DIR/crawl4ai-md.json.tmp" "$EVIDENCE_DIR/crawl4ai-md.json"
printf '\n'

python3 - <<'PY'
import json
import pathlib

root = pathlib.Path(".hermes/evidence/web-access/researcher-pilot")
data = json.loads((root / "crawl4ai-md.json").read_text())
if data.get("success") is not True:
    raise SystemExit(f"crawl4ai markdown failed: {data!r}")
markdown = data.get("markdown") or ""
if "Example Domain" not in markdown:
    raise SystemExit("crawl4ai markdown missing Example Domain")
(root / "markdown" / "example.com.md").write_text(markdown)
PY

printf '[PROGRESS] 45%% | Crawl4AI markdown extracted and normalized\n'

printf '== agent-browser rendered evidence ==\n'
agent-browser close --all >/dev/null 2>&1 || true
PROFILE="$HOME/.agent-browser/profiles/researcher"
mkdir -p "$PROFILE"
agent-browser --profile "$PROFILE" --session-name hermes-researcher-pilot open "$TARGET_URL"
agent-browser snapshot -i --compact | tee "$EVIDENCE_DIR/browser-snapshot.txt" >/dev/null
agent-browser screenshot "$EVIDENCE_DIR/browser-screenshot.png" >/dev/null
agent-browser close >/dev/null 2>&1 || true
grep -q 'Example Domain' "$EVIDENCE_DIR/browser-snapshot.txt"
test -s "$EVIDENCE_DIR/browser-screenshot.png"

printf '[PROGRESS] screenshots_complete | Browser snapshot and screenshot captured\n'

python3 - <<'PY'
import datetime as dt
import json
import pathlib

root = pathlib.Path(".hermes/evidence/web-access/researcher-pilot")
now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
snapshot = (root / "browser-snapshot.txt").read_text(errors="replace")
markdown = (root / "markdown" / "example.com.md").read_text(errors="replace")
inventory = {
    "run_id": "researcher-pilot",
    "created_at": now,
    "doctrine": "gbrain -> crawl4ai -> agent-browser -> deep-browser-gated",
    "target_budget": {
        "max_urls": 1,
        "allowed_targets": ["https://example.com"],
        "cloud_stealth": False,
        "credentials": False,
        "public_actions": False,
    },
    "targets": [
        {
            "url": "https://example.com",
            "accessed_at": now,
            "method": "crawl4ai+agent-browser",
            "status": "pass",
            "source_role": "safe_public_smoke_target",
            "robots_terms_posture": "safe public example target; no account, no mutation, no bulk crawl",
            "evidence": {
                "crawl4ai_health": ".hermes/evidence/web-access/researcher-pilot/crawl4ai-health.json",
                "crawl4ai_json": ".hermes/evidence/web-access/researcher-pilot/crawl4ai-md.json",
                "markdown": ".hermes/evidence/web-access/researcher-pilot/markdown/example.com.md",
                "browser_snapshot": ".hermes/evidence/web-access/researcher-pilot/browser-snapshot.txt",
                "screenshot": ".hermes/evidence/web-access/researcher-pilot/browser-screenshot.png",
            },
            "quality_tier": "primary",
            "findings": [
                "Crawl4AI produced clean Markdown containing the Example Domain heading.",
                "agent-browser produced a compact rendered snapshot containing the same heading.",
                "A screenshot-backed visual artifact was captured for the rendered page.",
            ],
            "uncertainty": "Low for harness validation; this target is intentionally not a market signal.",
        }
    ],
}
(root / "source-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
report = f"""# Researcher Pilot Report

Status: PASS
Run ID: researcher-pilot
Created: {now}
Target: https://example.com

## Route

GBrain/internal context was represented by the loaded Phase 0/Phase 1 workspace docs. The runnable external leg used Crawl4AI first for Markdown breadth, then agent-browser for rendered snapshot and screenshot evidence. Deep browser and cloud stealth were not used.

## Evidence

- Source inventory: `.hermes/evidence/web-access/researcher-pilot/source-inventory.json`
- Crawl4AI health: `.hermes/evidence/web-access/researcher-pilot/crawl4ai-health.json`
- Crawl4AI Markdown JSON: `.hermes/evidence/web-access/researcher-pilot/crawl4ai-md.json`
- Markdown: `.hermes/evidence/web-access/researcher-pilot/markdown/example.com.md`
- Browser snapshot: `.hermes/evidence/web-access/researcher-pilot/browser-snapshot.txt`
- Browser screenshot: `.hermes/evidence/web-access/researcher-pilot/browser-screenshot.png`

## Checks

- Markdown contains `Example Domain`: {"PASS" if "Example Domain" in markdown else "FAIL"}
- Browser snapshot contains `Example Domain`: {"PASS" if "Example Domain" in snapshot else "FAIL"}
- Screenshot exists: {"PASS" if (root / "browser-screenshot.png").exists() else "FAIL"}

## Guards

- Target stayed on `https://example.com`.
- No Opportunity Engine paths were touched.
- No cloud stealth, proxy escalation, credentials, CAPTCHA handling, public actions, or bulk crawl were used.
"""
(root / "pilot-report.md").write_text(report)
results = "iteration\tmetric\tstatus\tsummary\tverify\tguard\n0\t7\tkeep\tbaseline pilot emitted required artifacts\tpass\tpass\n"
(root / "results.tsv").write_text(results)
PY

printf '[PROGRESS] phase_complete_major | Researcher pilot artifacts created under %s\n' "$EVIDENCE_DIR"
printf 'researcher pilot: PASS\n'
