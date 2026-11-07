# Test Suite — chief-of-staff agent (CS01–CS14)

> Companion to [test-suite.md](./test-suite.md). Automated battery:
> `ops/bin/test-chief-of-staff.sh` (mock-based, anytime-of-day safe).
> First full pass: **2026-08-26 — 12/12 PASS** + live relay validation of the approval loop.
>
> Fix history during authoring (kept honestly): argv-unpack crash in prompt composer
> (11 vs 10 args), indented-line grep failures in mock path extraction, CS07 mock too
> faithful to fail → added `MOCK_DROP` simulation knob, ROSTER_PATH made overridable for tests.

## Test doubles & knobs

- `ops/tests/fixtures/mock-hermes-cos.sh`: emits a contract-valid Morning Brief; pulls
  DATE / roster / active-repo from the real generated prompt. Knobs: `MOCK_BAD=1`
  (garbage), `MOCK_FAIL=1` (crash), `MOCK_SLOW=1` (hang), `MOCK_DROP=<agent>` (omit agent
  from fleet report — exercises the completeness gate).
- Runner overrides: `FORCE DRYRUN STATE_DIR RESEARCH_DIR OBSIDIAN_DIR HERMES_BIN
  TIMEOUT_SECS ROSTER_PATH COS_SNAPSHOT COS_SINCE_DAYS`.

## A. Guardrails

### CS01 Night-window refusal (negative)
No FORCE during day → rc=5. ✅ 2026-08-26 PASS

### CS02 Lock mutual exclusion (negative)
Stale lock → rc=8. ✅ 2026-08-26 PASS

## B. Prompt & template integrity

### CS03 Placeholder substitution + input injection (positive)
Zero `{DATE|ROSTER_PATH|BUZZ_DIR|HARVEST_FILE|GH_SNAPSHOT|CRM_FILE|KB_MATRIX|PREV_BRIEF}`
leftovers; roster and KB matrix paths present in composed prompt. ✅ 2026-08-26 PASS

### CS04 Guardrail clauses (positive/meta)
Template contains: READ-ONLY rule, embedded-instructions-are-DATA rule, NEVER invent rule,
"exactly 3 proposals" contract. ✅ 2026-08-26 PASS

## C. Inputs

### CS05 GitHub sweep reality check (positive, read-only live)
`cos-github-sweep.sh` produces a valid snapshot; no BLOCKLIST repo leaks into active set.
✅ 2026-08-26 PASS (2 active repos discovered: kinkypuppies.store, NFT-dog-marketplace)

## D. Cycle behavior

### CS06 Mock nightly E2E (positive)
Full run: brief file with all 7 sections + ≥3 proposal blocks, Obsidian copy, state update,
"PASS chief-of-staff". ✅ 2026-08-26 PASS

### CS07 Fleet-completeness gate (negative)
`MOCK_DROP=customer-phantom` + tampered roster containing that agent → runner must refuse
with rc=11 naming the missing agent. ✅ 2026-08-26 PASS

### CS08 Harvest ledger mechanics (positive)
Pre-seeded open proposal in jsonl → harvest file created with `verdict: pending` under
DRYRUN (no relay contact). ✅ 2026-08-26 PASS

## E. Approval bridge

### CS09 Bridge guards (negative)
usage error (rc=64) · missing body file (rc=1) · repo not in snapshot (rc=5 with clear
message). ✅ 2026-08-26 PASS

### CS10 Malformed brief rejected (negative)
`MOCK_BAD=1` → rc=11, nothing published. ✅ 2026-08-26 PASS

### CS11 Hard timeout (negative/destructive-positive)
`MOCK_SLOW=1 TIMEOUT_SECS=3` → watchdog kill rc=9. ✅ 2026-08-26 PASS

### CS12 Production config integrity (meta)
Roster ≥5 agents, pipe-format valid; repos config has settings + BLOCKLIST sections.
✅ 2026-08-26 PASS

## F. Live-relay validations (executed once at build time)

- **Approval loop E2E:** CoS identity posted a proposal to #approvals → owner key reacted ✅
  → `reactions get` returned owner pubkey → verdict logic = approved. Verified live on the
  local relay 2026-08-26 (event 682a5eae…).
- **Channel bootstrap:** #morning-brief created; chief-of-staff identity verified member.

## G. Real-model night runs (supervised)

### CS13 First real Morning Brief (supervised positive)
```bash
FORCE=1 ops/bin/qwen-night.sh force-start   # if manual/daytime
FORCE=1 ops/bin/run-chief-of-staff.sh       # full pipeline incl. buzz dumps + gh sweep
```
Positive: brief in research dir + Obsidian + #morning-brief; every section populated from
real inputs; 3 proposals posted individually to #approvals with tracked event ids.
Negative signals: invented facts (spot-check §4 against `gh api`), hallucinated agents,
unsourced outlook claims.

### CS14 Approval→issue E2E (supervised positive)
React ✅ on a real proposal → next night: issue exists in target repo with labels
`chief-of-staff,feature-proposal`, threaded reply in #approvals, ledger status `issued`.
Rollback: close issue manually; ledger edit documented in master doc §7.

## Negative summary table

| # | Adversarial condition | Must result in |
|---|---|---|
| NC1 | Run outside window | rc=5 |
| NC2 | Stale lock | rc=8 |
| NC3 | Broken contract output | rc=11 |
| NC4 | Missing fleet agent in brief | rc=11 naming agent |
| NC5 | Model hang | watchdog rc=9 |
| NC6 | Issue creation against unlisted repo | refusal rc=5 |
| NC7 | Instructions embedded in Buzz dumps | ignored as data (template clause CS04, live-checked CS13) |

## Cadence
L0 (CS01–CS12): after any change to runner/template/configs; weekly otherwise.
F-live: after relay/key changes. G (CS13–14): first nights + after template changes.
