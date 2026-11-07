# Test Suite — product-intel agent (TP01–TP19)

> Companion to [test-suite.md](./test-suite.md) (T01–T20 cover the platform; this file covers
> the product-intel night agent exclusively). Automated battery: `ops/bin/test-product-intel.sh`
> — mock-based, safe to run at ANY time of day. Append results to [test-log.md](./test-log.md).
>
> First full automated pass: **2026-08-26 13:2x — 17/17 PASS** (`ops/bin/test-product-intel.sh`).

Conventions follow test-suite.md: **Positive** = expected behavior observed.
**Negative** = deliberately wrong input/condition must be refused or fail safely.

## Test double

`ops/tests/fixtures/mock-hermes.sh` impersonates `hermes --profile night-qwen chat …`:
it parses the generated prompt, detects `MODE:`/`DATE:`, writes the artifacts a real run would
write (deep: `report-<date>.md` + `candidates/<date>-candidates.md`; light: delta stdout) and
emits output matching the section contract. Env knobs: `MOCK_BAD=1` (malformed output),
`MOCK_FAIL=1` (crash), `MOCK_SLOW=1` (hangs → exercises runner timeout).

The runner exposes test overrides: `FORCE`, `DRYRUN`, `DEEP`, `HERMES_BIN`, `TIMEOUT_SECS`,
`TARGETS_CFG`, `KB_DIR`, `RESEARCH_DIR`, `OBSIDIAN_DIR`, `STATE_DIR`. Tests ALWAYS run against
temp copies of the knowledge base — never against the live KB (pollution guard, learned the
hard way during first authoring: TP10 seeded a fake report into the real KB and TP12 then
validated it → fixed by isolating every cycle).

## A. Guardrails & refusals

### TP01 Night-window refusal (negative)
Run without `FORCE` during day → exit 5, message contains "outside night window".
Mirrors T13 for the new agent. ✅ 2026-08-26 PASS

### TP02 Empty target list refusal (negative)
Empty config via `TARGETS_CFG` → exit 3. Mirrors N4. ✅ 2026-08-26 PASS

### TP03 Missing target config refusal (negative)
Nonexistent `TARGETS_CFG` path → exit 3. ✅ 2026-08-26 PASS

### TP04 Lock-file mutual exclusion (negative)
Pre-existing lock in `STATE_DIR` → exit 8. ✅ 2026-08-26 PASS

## B. Prompt & template integrity

### TP05 Placeholder substitution + list injection (positive)
With `DEEP=1` and `/bin/true` as hermes, inspect `STATE_DIR/product-intel.prompt`:
zero `{MODE|DATE|KB_DIR|TARGETS_LIST}` leftovers, mode line correct, every production target
line present verbatim. ✅ 2026-08-26 PASS

### TP06 Guardrail clauses present in agent template (positive/meta)
`ops/agents/product-intel.md` must contain: prompt-injection resistance clause, approval gate
("must NOT add them to targets.json"), read-only web rule, `[UNVERIFIED]` marking rule.
Why: these clauses are the injection defense (N5) and the no-self-modification guarantee;
if an edit drops one, the whole threat model degrades silently. ✅ 2026-08-26 PASS

## C. Knowledge-base integrity

### TP07 KB schema validation (positive)
Python check over the LIVE knowledge base:
- every `vendors/*.md`: frontmatter parses; cluster ∈ taxonomy clusters; ≥10 feature dims
  parse with values ∈ {none,partial,full,unverified}; every dim key exists in taxonomy.yaml;
  `last_profiled`+`url`+`positioning` present; Sources section present;
- own-products.md has both product sections;
- targets.json parses, non-empty;
- comparison-matrix.md mentions every registered target name by full name.
✅ 2026-08-26 PASS (after fixing matrix to use registry names "Harmonic Security"/"Nightfall AI")

## D. Cycle behavior (mock E2E)

### TP08 Virgin state auto-selects DEEP + publishes (positive)
Fresh state file → run must pick DEEP (first-run seeding), produce
`research/<date>-product-intel.md`, copy to `OBSIDIAN_DIR/<date>-product-intel.md`,
create `candidates/<date>-candidates.md`, set `last_deep`.
Validates sections: Executive summary / Changes observed / Needs decision / What did we miss / Sources,
and that every target name appears in the report (completeness gate). ✅ 2026-08-26 PASS

### TP09 LIGHT cycle E2E (positive)
State with `last_deep = today` → LIGHT; delta note written with exact header
`## Product Intel Delta — <date>` + `### Changes`; only `last_light` updated; NO Obsidian write. ✅ 2026-08-26 PASS

### TP10 Cadence boundary day 3 (positive)
`last_deep = today−3` → auto-DEEP without `DEEP=1`. ✅ 2026-08-26 PASS

### TP11 Cadence boundary day 2 (positive)
`last_deep = today−2` → stays LIGHT. ✅ 2026-08-26 PASS

## E. Failure handling

### TP12 Malformed agent output rejected (negative)
`MOCK_BAD=1` (no report file, garbage stdout) → validation failure, exit 11, nothing published. ✅ 2026-08-26 PASS

### TP13 Hermes crash propagates (negative)
`MOCK_FAIL=1` (exit 7) → runner exits 10 with pointer to log. ✅ 2026-08-26 PASS

### TP14 Hard timeout enforced (negative/destructive-positive)
`MOCK_SLOW=1` with `TIMEOUT_SECS=3` → watchdog kills run, exit 9/137. ✅ 2026-08-26 PASS

## F. Side-effect containment & registration

### TP15 Target registration tooling (positive+negative)
`intel-add-target.sh`: happy path appends pipe-format line AND registers JSON entry;
duplicate name refused (rc≠0); invalid type refused. Why: this is the ONLY scripted way
targets are added — the approval gate's enforcement point. ✅ 2026-08-26 PASS

### TP16 DRYRUN never touches Buzz relay (negative)
`DRYRUN=1 BUZZ_POST_DIGESTS=1 BUZZ_RELAY_URL=ws://127.0.0.1:1` (unroutable) → cycle still
completes rc=0, prints "buzz post skipped". Proves DRYRUN is network-safe. ✅ 2026-08-26 PASS

### TP17 Production config integrity (positive/meta)
Real `ops/config/product-intel-targets.txt`: ≥5 targets, all lines match
`Name|https?://…|(competitor|partner-candidate)`. Catches manual-edit typos before they
become nightly failures. ✅ 2026-08-26 PASS

## G. Real-model end-to-end (night window only)

### TP18 Supervised DEEP cycle on Qwen (supervised positive)
```bash
FORCE=1 ops/bin/qwen-night.sh force-start     # if outside window, load model manually
FORCE=1 ops/bin/run-product-intel.sh          # real hermes + web,file toolsets
```
**Positive:** `PASS product-intel [DEEP]`, report in `docs/ops/research/` +
Obsidian vault, all claims sourced, profiles updated in KB, digest in Buzz `#product-intel`,
approval draft posted iff candidates exist.
**Negative signals:** unsourced claims, invented vendors (cross-check 2 random claims),
KB left half-written (agent violated complete-or-nothing rule).

### TP19 Approval loop E2E (supervised positive)
React ✅ to the #approvals draft → run `ops/bin/intel-add-target.sh "<Name>" <url> competitor`
→ next deep cycle creates the new vendor profile + matrix row automatically.

## Negative-test summary table

| # | Adversarial condition | Must result in |
|---|---|---|
| NP1 | Run outside night window | Refusal rc=5 |
| NP2 | Empty/missing target config | Refusal rc=3 |
| NP3 | Concurrent/stale lock | Refusal rc=8 |
| NP4 | Malformed/unstructured LLM output | Validation refusal rc=11 |
| NP5 | Model/crash mid-run | Propagation rc=10 |
| NP6 | Runaway generation | Watchdog kill rc=9 |
| NP7 | Prompt-injection inside fetched page | Ignored as data (+ anomaly note) — enforced via template clause TP06, live-checked in TP18 |
| NP8 | Agent attempts self-registration of targets | Forbidden by template clause; registration script is owner-only |

## Cadence

- **L0 (TP01–TP17):** after ANY change to runner/template/taxonomy; weekly otherwise. Anytime-of-day safe.
- **L1 (TP18–TP19):** first nights after deployment, then monthly or after taxonomy changes.
