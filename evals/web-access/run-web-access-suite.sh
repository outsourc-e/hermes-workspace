#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
EVIDENCE_DIR="$ROOT/.hermes/evidence/web-access/suite"
SUMMARY_MD="$EVIDENCE_DIR/latest-summary.md"
SUMMARY_JSON="$EVIDENCE_DIR/latest-summary.json"
mkdir -p "$EVIDENCE_DIR"

STARTED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
TMP_JSONL="$(mktemp "${TMPDIR:-/tmp}/web-access-suite.XXXXXX.jsonl")"
FAILURES=0

printf '[PROGRESS] validation_starts | Web-access safe suite started at %s\n' "$STARTED_AT"

json_escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'
}

run_lane() {
  local id="$1"
  shift
  local output_file="$EVIDENCE_DIR/${id}.out"
  local started finished status output_json

  started="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf '== %s ==\n' "$id"
  "$@" >"$output_file" 2>&1
  status=$?
  finished="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  cat "$output_file"
  if [ "$status" -ne 0 ]; then
    FAILURES=$((FAILURES + 1))
  fi
  output_json="$(json_escape <"$output_file")"
  printf '{"id":"%s","command":%s,"status":%s,"started_at":"%s","finished_at":"%s","output_path":%s,"output":%s}\n' \
    "$id" \
    "$(printf '%s' "$*" | json_escape)" \
    "$status" \
    "$started" \
    "$finished" \
    "$(printf '%s' "${output_file#$ROOT/}" | json_escape)" \
    "$output_json" >>"$TMP_JSONL"
}

run_lane "validator" python3 scripts/validate-web-access-empowerment.py
run_lane "phase0-smoke" bash evals/web-access/run-phase0-smoke.sh
run_lane "researcher-pilot" bash evals/web-access/run-researcher-pilot.sh
run_lane "qa-builder-smoke" bash evals/web-access/run-qa-builder-smoke.sh
run_lane "docker-crawl4ai-status" docker ps --filter name=crawl4ai --format '{{.Names}} {{.Image}} {{.Status}} {{.Ports}}'

FINISHED_AT="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if [ "$FAILURES" -eq 0 ]; then
  OVERALL="PASS"
else
  OVERALL="BLOCK"
fi

python3 - "$TMP_JSONL" "$SUMMARY_JSON" "$SUMMARY_MD" "$STARTED_AT" "$FINISHED_AT" "$OVERALL" "$FAILURES" <<'PY'
import json
import pathlib
import sys

jsonl, summary_json, summary_md, started, finished, overall, failures = sys.argv[1:]
records = [json.loads(line) for line in pathlib.Path(jsonl).read_text().splitlines() if line.strip()]
summary = {
    "suite": "web-access-empowerment-suite",
    "status": overall,
    "started_at": started,
    "finished_at": finished,
    "failures": int(failures),
    "safe_default_lanes_only": True,
    "gated_lanes_not_run": [
        "gated-antibot-matrix",
        "gated-auth-persistence",
        "gated-token-cost-baseline",
    ],
    "records": records,
    "evidence_dir": ".hermes/evidence/web-access/suite",
}
pathlib.Path(summary_json).write_text(json.dumps(summary, indent=2) + "\n")

lines = [
    "# Web Access Suite Latest Summary",
    "",
    f"Status: {overall}",
    f"Started: {started}",
    f"Finished: {finished}",
    f"Failures: {failures}",
    "",
    "## Guardrails",
    "",
    "- Ran only safe default lanes.",
    "- Did not run gated anti-bot, login/auth persistence, cloud, proxy, CAPTCHA, or destructive lanes.",
    "- Docker command was status-only.",
    "",
    "## Results",
    "",
]
for record in records:
    lane_status = "PASS" if record["status"] == 0 else "BLOCK"
    lines.append(f"- `{record['id']}`: {lane_status} (`{record['command']}`), output `{record['output_path']}`")
lines.extend([
    "",
    "## Evidence",
    "",
    "- JSON summary: `.hermes/evidence/web-access/suite/latest-summary.json`",
    "- Markdown summary: `.hermes/evidence/web-access/suite/latest-summary.md`",
])
pathlib.Path(summary_md).write_text("\n".join(lines) + "\n")
PY

rm -f "$TMP_JSONL"

printf '[PROGRESS] suite summary written | %s and %s\n' "${SUMMARY_MD#$ROOT/}" "${SUMMARY_JSON#$ROOT/}"

if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi
