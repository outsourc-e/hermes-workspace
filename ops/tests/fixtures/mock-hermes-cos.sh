#!/usr/bin/env bash
# mock-hermes-cos.sh — test double emitting a contract-valid Morning Brief.
# Pulls DATE / roster names / active repo name from the generated prompt so the
# runner's validation (sections, fleet completeness, proposal count) is exercised
# realistically. Env knobs: MOCK_BAD=1 garbage · MOCK_FAIL=1 crash · MOCK_SLOW=1 hang.
set -u
PROMPT_FILE=""; prev=""
for a in "$@"; do [ "$prev" = "--query-file" ] && PROMPT_FILE="$a"; prev="$a"; done
[ -n "$PROMPT_FILE" ] && [ -f "$PROMPT_FILE" ] || { echo "mock: no prompt file" >&2; exit 3; }
[ "${MOCK_SLOW:-0}" = "1" ] && { sleep 9999; exit 0; }
[ "${MOCK_FAIL:-0}" = "1" ] && { echo "mock: simulated crash" >&2; exit 7; }

DATE=$(grep -oE '^DATE: [0-9-]+' "$PROMPT_FILE" | awk '{print $2}')
ROSTER=$(grep 'Staff roster:' "$PROMPT_FILE" | head -1 | sed -E 's#.*Staff roster:[[:space:]]+##')
GH=$(grep 'GitHub activity:' "$PROMPT_FILE" | head -1 | sed -E 's#.*GitHub activity:[[:space:]]+##; s#[[:space:]]*\(active.*##')
REPO="unassigned"
[ -n "${GH:-}" ] && [ -f "$GH" ] && REPO=$(python3 -c "
import json,sys
try:
    d=json.load(open('$GH'))
    rs=[r['name'] for r in d.get('repos',[])]
    print(rs[0] if rs else 'unassigned')
except Exception: print('unassigned')")

if [ "${MOCK_BAD:-0}" = "1" ]; then echo "here are some thoughts about the night:"; exit 0; fi

AGENTS=$(awk -F'|' 'NF>2 && $1 !~ /^#/ {print $1}' "$ROSTER" | grep -v "^${MOCK_DROP:-}$" | sed 's/^/✅ /')
FLEET=""
while IFS= read -r line; do [ -n "$line" ] && FLEET="${FLEET}- ${line} — digest verified\n"; done <<< "$AGENTS"

cat <<EOF
# Morning Brief — $DATE

## 1. AI Product Update & Outlook
- Mock product update bullet. https://example.com/source

## 2. Customers · Partners · Competition
- Competition: mock signal from competitor-scout report.
- Partners: mock signal from partner-radar report.
- Customers: mock signal from customer-watcher report.

## 3. Suggestions — New Customers & Partners
### New customers
- **Mock Customer GmbH** — KRITIS-adjacent mid-market, CRM signal present.
- **Mock Klinik AG** — HIPAA/GDPR pressure, intel match.
- **Mock Bank e.G.** — Shadow-AI governance need visible.
### New partners
- **Mock Integrator GmbH** — DACH IT consultancy overlap.
- **Mock Gateway Inc** — gateway embed synergy.
- **Mock Cloud DUO** — co-marketing fit.

## 4. Active Development Projects (GitHub)
- $REPO: quiet in window (mock).

## 5. Agent Fleet Report
$(printf '%b' "$FLEET")
- Needs-decision items: none (mock).

## 6. Tech & Business Review
Tech: mock synthesis paragraph.
Business: mock synthesis paragraph.
CoS learning note: mock improvement line.

## 7. Feature Proposals for Approval
### Proposal P1
Title: Add export endpoint for sanitized audit receipts
Repo: $REPO
Rationale: Mock rationale tied to compliance demand.
Issue body:
Implement the export endpoint.
Acceptance criteria:
- [ ] Endpoint returns signed receipt PDF

### Proposal P2
Title: Ship onboarding checklist for team blueprints
Repo: $REPO
Rationale: Mock activation rationale.
Issue body:
Add guided onboarding.
Acceptance criteria:
- [ ] Checklist state persisted locally

### Proposal P3
Title: Publish EU AI Act mapping table on marketing site
Repo: $REPO
Rationale: Mock positioning rationale.
Issue body:
Publish mapping content.
Acceptance criteria:
- [ ] Table covers 4 risk tiers
EOF
exit 0
