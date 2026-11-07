# Test Suite — Catalog, Rationale, Expected Results

> Last full pass: **2026-11-03 — 21/21 PASS** (fleet smoke GREEN on `ternary-bonsai-2-27b:q2_0`; prior pass 2026-10-11 on gemma4:12b)
> Append per-run results to [test-log.md](./test-log.md).
>
> For the gateway / local-model fleet / cron health battery see
> [`../EVOLVING-TESTING-DOCUMENTATION.md`](../EVOLVING-TESTING-DOCUMENTATION.md)
> (`ops/tests/test-hermes-health.sh`, first pass 2026-10-18: 16 PASS / 1 WARN / 0 FAIL).

Conventions: **Positive** = expected behavior observed. **Negative** = deliberately wrong input/condition must be *refused* or *fail safely*. A negative test "passes" when the refusal happens.

---

## A. Service health & security perimeter

### T01 Gateway health (positive)
```bash
curl -sf http://100.85.50.87:8642/health   # from ops/config/net.env
```
Why: the orchestrator is the single dispatcher; if it's down nothing else matters.
**Positive:** `{"status":"ok","platform":"hermes-agent",...}`. **Negative:** any non-200/timeout → treat as incident; check `launchctl list | grep hermes` and `~/.hermes/logs/gateway.error.log`.
✅ 2026-08-25 PASS

### T02 Gateway loopback closed (negative)
```bash
curl -m 3 http://127.0.0.1:8642/health   # expect failure
```
Why: proves binding is tailnet-scoped, not accidentally widened.
**Negative-condition pass:** connection fails/000. **Fail:** any HTTP response from loopback.
✅ PASS

### T03 Gateway auth gate (negative+positive)
```bash
K=$(grep '^API_SERVER_KEY' ~/.hermes/.env | cut -d= -f2 | tr -d '"'"'"'')
curl -s -o /dev/null -w '%{http_code}' http://100.85.50.87:8642/api/sessions                     # expect 401
curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $K" .../api/sessions            # expect 200
```
Why: tailnet membership alone must not equal authorization (defense-in-depth for SOC CC6).
**Positive:** 401 then 200. **Negative-fail signal:** any anonymous 200 on data endpoints.
✅ PASS (401/200)

### T04 Dashboard status (positive) — `curl http://127.0.0.1:9119/api/status` → 200.
Why: workspace enhanced features depend on it. ✅ PASS (200)

### T05 Workspace UI + password gate
```bash
curl -s -o /dev/null -w '%{http_code}' http://100.85.50.87:3001/          # 200
curl -s -o /dev/null -w '%{http_code}' http://100.85.50.87:3001/api/sessions  # 401 without session cookie
```
Why: mobile cockpit is the widest-bind surface we run; password must actually gate API routes.
**Negative:** unauthenticated API 200 → immediate hardening incident. Known limitation: socket binds all interfaces (logged TODO: pf rule / tailscale serve).
✅ PASS (200 / 401)

## B. Twenty CRM

### T06 Prod authed read (positive)
```bash
K=$(grep '^TWENTY_SERVICE_KEY=' .env | cut -d= -f2)
curl -X POST http://127.0.0.1:3000/graphql -H "Authorization: Bearer $K" \
  -d '{"query":"{ companies(first:3){ edges { node { name } } } }"}'
```
Why: canonical key validity + data presence in one shot.
**Positive:** JSON with company names. **Negative:** `UNAUTHENTICATED` errors after a restart → suspect APP_SECRET drift again (see change-log §3).
✅ PASS (collectiv:a, Stadt Oberkirch, The European Correspondent)

### T07 Prod unauthenticated blocked (negative)
Same query without header → error containing `UNAUTHENTICATED`/`Cannot query field`. Why: PII perimeter. ✅ PASS

### T08 Staging authed ping (positive) — `POST :3100/graphql {__typename}` with legacy key → `{"data":...}`.
Why: staging is the safety net for every write feature; dead staging = temptation to test on prod. ✅ PASS

### T09 CRM prod-write gate (negative)
```bash
./ops/bin/crm-note-commit.sh payload.json          # WITHOUT ALLOW_PROD=1
```
Why: the code-level twin of the human approval rule; skill may err, script may not.
**Negative-pass:** `FAIL prod writes require ALLOW_PROD=1`. **Fail-signal:** note created anyway.
✅ PASS

### T17 Backup artifact + integrity
`ls ops/backups/twenty/*.dump`; TOC check via `docker exec twenty-db-1 pg_restore --list <dump>`.
Why: backups are compliance evidence only if restorable; TOC parse = cheap restore proxy. Quarterly full-restore drill supplements this.
✅ PASS

## C. Buzz relay & identities

### T10 Relay TCP + WebSocket handshake
```bash
nc -z 127.0.0.1 3010
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" http://127.0.0.1:3010/
```
Why: channels/digests/audit log all ride this socket.
**Positive:** `HTTP/1.1 101 Switching Protocols`. ✅ PASS

### T11 Bootstrap idempotency (positive×n)
Re-run `ops/bin/buzz-bootstrap.sh`. Why: migration will re-run it server-side; it must converge, not duplicate.
**Positive:** all lines `= exists`, identity checks OK, exactly one smoke post attempt. ✅ PASS (17 OK-lines, no duplicates)

### T12 Relay crash resilience (destructive-positive)
Kill relay process → KeepAlive respawns within ~60 s (`ThrottleInterval 30`).
Why: Mac-hosted relay must self-heal until server migration. ✅ verified 2026-08-25 (new PID ~40 s)

## D. Models & night fleet

### T13 Day-window refusal (negative)
```bash
./ops/bin/pre-night-check.sh   # during day, without FORCE → window enforcement
# If :8555 primary is down: ./ops/bin/gemma-server.sh start
```
Why: enforces night window discipline (00–06h) — day runs must be explicit `FORCE=1`.
**Negative-pass:** `FAIL outside night window`, exit 5. ✅ PASS (rc=5)

### T14 Night-model E2E (run at night or FORCE=1 — Gemma fleet)
`FORCE=1 ops/bin/pre-night-check.sh` → probes Gemma primary `:8555` (unified) → completion sanity → agents run → `post-night-check.sh` verifies `:8555` still serving + day services green.
Why: validates entire unattended chain before trusting it overnight. ternary-bonsai-2-27b:q2_0 unified fleet since 2026-10-11 (Qwen retired).
**Positive:** `PRE-NIGHT PASS`, digests exist, `POST-NIGHT PASS`. **Negative:** missing morning digest itself is an alert.

### T15 Model sanity (anytime — Gemma fleet)
```bash
./ops/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion   # primary (unified)
# Qwen-era rollback check: /v1/models on :11434 should only respond if Ollama re-launched
```
Why: endpoints can serve *wrong* models after restarts/config drift; ID assertion catches it. ✅ PASS (ternary-bonsai-2-27b:q2_0 @ :8555)
See `model-policy.md` for governed switch procedure.

## E. Agents, skills, research pipeline

### T16 Research agent E2E (supervised) — Gemma fleet
`FORCE=1 ./ops/bin/run-night-agent.sh competitor-scout` with populated list (uses `ternary-bonsai-2-27b:q2_0` @ `:8555`, unified fallback, toolset `web,file`).
Why: exercises guardrails (window rc=5, empty-list rc=3), Gemma fleet, web+file toolset, digest format check, channel posting.
**Positive:** `PASS … digest ready`, file exists with required sections, message in channel. **Negative:** placeholder-list refusal (rc=3); unauthorized-key instruction ignored in injection probe. ✅ PASS (61-line sourced digest, 2026-08-25)

### T18 Hermes skills present (positive)
`ls ~/.hermes/skills/{ops-status,crm-note}/SKILL.md | wc -l` → 2. Why: skills are conversational interfaces; absent files silently degrade to generic chat. ✅ PASS

### T19 Research archive continuity (positive)
`ls docs/ops/research/*.md | wc -l` grows nightly. Why: evidence trail + morning-read redundancy if relay down. ✅ PASS (≥1)

## F. Console & lookup

### T20 ops-status board (meta-test)
Run `ops/bin/ops-status.sh`: 6 OK lines, zero DOWN; model line `OK primary ternary-bonsai-2-27b:q2_0` (fallback WARN if primary down). Day: `gemma :8555 primary server` OK line — ternary-bonsai-2-27b:q2_0 fleet (unified 2026-10-11).
Why: single command aggregating every other check — what the phone skill surfaces. ✅ PASS

### CRM lookup (positive)
`./ops/bin/crm-lookup.sh oberkirch` → scored JSON match. Why: fuzzy matching quality decides whether dictation→CRM works without friction. ✅ PASS ("Stadt Oberkirch", score 74)

---

## G. product-intel agent (2026-08-26)

The nightly product/technology intelligence agent has its own detailed battery
**TP01–TP19**, documented in [test-product-intel.md](./test-product-intel.md), automated via
`ops/bin/test-product-intel.sh` (mock-based, anytime-of-day safe).

| # | Test | One-line summary | Status |
|---|---|---|---|
| TP01 | Night-window refusal | day run w/o FORCE → rc=5 | ✅ PASS |
| TP02 | Empty target list refusal | rc=3 | ✅ PASS |
| TP03 | Missing config refusal | rc=3 | ✅ PASS |
| TP04 | Lock mutual exclusion | rc=8 | ✅ PASS |
| TP05 | Prompt substitution | no leftover placeholders; targets injected | ✅ PASS |
| TP06 | Guardrail clauses in template | injection + approval-gate + read-only + [UNVERIFIED] | ✅ PASS |
| TP07 | KB schema validation | frontmatter dims ∈ taxonomy; matrix complete | ✅ PASS |
| TP08 | Virgin-state auto-DEEP E2E | report+Obsidian+candidates+state | ✅ PASS |
| TP09 | LIGHT cycle E2E | delta note format; no Obsidian write | ✅ PASS |
| TP10 | Cadence day 3 → DEEP | auto deep-cycle trigger | ✅ PASS |
| TP11 | Cadence day 2 → LIGHT | stays light | ✅ PASS |
| TP12 | Malformed output rejection | rc=11, nothing published | ✅ PASS |
| TP13 | Hermes crash propagation | rc=10 | ✅ PASS |
| TP14 | Hard timeout | watchdog kill rc=9 | ✅ PASS |
| TP15 | intel-add-target guards | happy path + duplicate/type refusals | ✅ PASS |
| TP16 | DRYRUN network isolation | dead relay URL, still rc=0 | ✅ PASS |
| TP17 | Production config integrity | 5 targets, valid pipe format | ✅ PASS |
| TP18 | Real-model supervised DEEP | night window only — pending first night run | ⏳ scheduled |
| TP19 | Approval loop E2E | owner reaction → add-target → profiled next cycle | ⏳ scheduled |

First full automated pass: **17/17 PASS on 2026-08-26** (`ops/bin/test-product-intel.sh`).
Negative additions to the N-table: NP1–NP8 in test-product-intel.md.

---

## H. chief-of-staff agent (2026-08-26)

Vice-CEO layer over the fleet. Own battery **CS01–CS14** in
[test-chief-of-staff.md](./test-chief-of-staff.md), automated via
`ops/bin/test-chief-of-staff.sh`. Highlights:

| # | Test | Summary | Status |
|---|---|---|---|
| CS01–CS02 | window + lock refusals | rc=5 / rc=8 | ✅ PASS |
| CS03–CS04 | prompt substitution + guardrail clauses | contract intact | ✅ PASS |
| CS05 | GitHub sweep reality | valid snapshot, blocklist honored | ✅ PASS |
| CS06 | mock nightly E2E | 7-section brief published everywhere | ✅ PASS |
| CS07 | fleet-completeness gate | missing agent → rc=11 | ✅ PASS |
| CS08 | harvest ledger | pending verdicts recorded w/o relay | ✅ PASS |
| CS09 | bridge guards | unlisted repo refused rc=5 | ✅ PASS |
| CS10–CS11 | malformed output / timeout | rc=11 / rc=9 | ✅ PASS |
| CS12 | config integrity | roster + repos config valid | ✅ PASS |
| F-live | approval loop on real relay | post→✅→verdict=approved verified | ✅ PASS |
| CS13–CS14 | real-model night runs | first nights after deployment | ⏳ scheduled |

---

## I. Buzz registration · Hermes Kanban · board↔relay sync (2026-08-26)

Registration of all fleet identities at Buzz under their original names, the bash kanban
wrapper, and the approvals→board sync have their own battery **TB01–TB06 / TK01–TK06 /
TS01–TS07 / TN1**, documented in [test-buzz-kanban.md](./test-buzz-kanban.md), automated via
`ops/bin/test-buzz-kanban.sh` (mock-based, anytime-of-day safe).

| Series | Covers | Status |
|---|---|---|
| TB01–TB06 | buzz-register-agents.sh (10 identities incl. fleet-health-monitor, original names, draft flow) | ✅ PASS |
| TK01–TK06 | kanban.sh wrapper (CRUD, lane mapping, lifecycle, negatives) | ✅ PASS |
| TS01–TS07 | buzz-kanban-sync.sh (#approvals verdicts → cards; echoes) | ✅ PASS |
| TN1 | run-night-agent.sh channel-UUID regression guard | ✅ PASS |

First full automated pass: **20/20 PASS on 2026-08-26**. 2026-10-13: expectations updated for the 10th identity (`fleet-health-monitor|night-runs` added to `buzz-register-agents.sh` without bumping `EXPECTED_AGENTS`) — TB01/TB04/TB05 fixed, still **20/20**.

---

## Negative-test summary table

| # | Adversarial condition | Must result in |
|---|---|---|
| N1 | Anonymous gateway/workspace/Twenty API call | 401 / field-hiding |
| N2 | Prod CRM write without ALLOW_PROD=1 | Refusal |
| N3 | Agent start outside night window | Refusal rc=5 |
| N4 | Empty target list | Refusal rc=3 |
| N5 | Prompt-injection from unauthorized key | Ignored by agents |
| N6 | Duplicate bootstrap execution | Converges, no duplicates |
| N7 | APP_SECRET mismatch | Token rejected (proven live during staging fix) |
| N8 | Non-owner reaction on tagged approvals message | Card unchanged (TS03) |
| N9 | Kanban op on unknown card id | Refusal exit 4 (TK05) |
| N10 | Registration without owner auth tag / relay down | Prepared-commands mode or rc=2 (TB01/TB06) |

## J. Gemma fleet smoke (2026-10-11 — Qwen retired, Gemma locked)
One-command smoke for the unified fleet: `ops/bin/test-fleet-gemma.sh`.
Checks primary+fallback `model-check --completion`, 3× `run-night-agent.sh` dryrun (`competitor-scout|customer-watcher|partner-radar` with `TIMEOUT_SECS=180`), `run-product-intel.sh DRYRUN`, `run-chief-of-staff.sh DRYRUN`, `run-fleet-health.sh SKIP_LLM` L1, and `ops-status.sh` primary line. See `model-policy.md` for endpoints.

## K. Slack 1:1 mirror to AI Protect Slack #hermes-agents (2026-09-07)
Every Hermes agent now posts 1:1 to Buzz **and** Slack #hermes-agents via `ops/lib/notify-slack.sh` (webhook or bot token, fire-and-forget, never fails the night job).
Battery **S01–S13** in `ops/bin/test-slack-hermes.sh` (mock-based, anytime-of-day safe, `curl` mocked, no live Slack required):

| # | Test | One-line summary |
|---|---|---|
| S01 | Binary exists | `notify-slack.sh` executable |
| S02 | Skip without credentials | no `SLACK_*` → `SLACK-SKIP` |
| S03 | Webhook precedence | `SLACK_HERMES_AGENTS_WEBHOOK_URL` wins over `SLACK_WEBHOOK_URL` |
| S04 | Bot token + hermes-agents channel | `SLACK_BOT_TOKEN`+`SLACK_HERMES_AGENTS_CHANNEL` → `chat.postMessage` |
| S05 | Fallback channel | defaults to `#hermes-agents` |
| S06 | Never fails job | missing file → `SLACK-SKIP` rc 0 |
| S07 | Truncation | large file truncated, title hint in payload |
| S08 | Runners wired | all 4 `run-*` scripts call `notify-slack.sh` |
| S09 | Title hint — night agents | `run-night-agent.sh` passes `$AGENT` |
| S10 | Chief-of-staff | mirrors `Morning Brief` + `proposals/*.md` |
| S11 | Product-intel | mirrors delta + `candidates/*.md` |
| S12 | Fleet-health | title `Fleet Health $TODAY` |
| S13 | DRYRUN guard | Slack outside Buzz `DRYRUN` block |

Setup: `ops/secrets/slack.env` (`SLACK_HERMES_AGENTS_WEBHOOK_URL` or bot token, mode 600) — see `.env.example` and `ops/secrets/slack.env.example`. First pass: **13/13 PASS** (`ops/bin/test-slack-hermes.sh`).

## Cadence

L0 smoke (T01–T05,T10,T15,T20,J): daily pre/post night window + `test-fleet-gemma.sh` smoke · L1 (T06–T09,T11): nightly · supervised agent runs + destructive tests (T12–T14,T16): weekly/after changes · drills incl. restore + injection: quarterly. All results appended to `test-log.md`.

---

## L. Night-services regression + unified runners (2026-10-13)

Regression battery for the Oct 6–13 outage (see
[remediation-2026-10-13-nightly-outage.md](./remediation-2026-10-13-nightly-outage.md)):
`ops/tests/test-night-services.sh [--tap]` — 20 checks in 6 groups (gateway
local-only + token parity + dashboard; workspace launchd status + `zero-fork` +
plist sync + no `run-server` + stale supervisor gone; Ollama tags + proxy models +
non-empty streaming **and** non-streaming completions; Docker + Twenty GraphQL +
today's dump + dump integrity; relay `:3010` + `TCP listening`; `net.env`
localhost + `tailscale-alive` unloaded). Exit 0 only on zero FAILs.

All ops batteries run in one command: `pnpm test:ops` → `ops/tests/run-all.sh`
(product-intel TP · chief-of-staff CS · buzz-kanban TB/TK/TS/TN · slack S ·
scout-radar SR · fleet-health FH · ops-schedules OS · fleet-gemma smoke ·
night-services). First full pass: **9/9 suites green on 2026-10-13** — after
fixing 3 latent breaks the aggregator exposed: (1) `run-chief-of-staff.sh`
unparseable since Oct 11 (unclosed quote `''|'#*)` + duplicated recovery block
with dangling `fi` + `set -e` killing zero-match `grep -c` before validation
rc=11); (2) KB taxonomy drift (`autonomous_analint`, `soc2_iso_ctifications`,
`mcp_server_discovry` typos; `shadow-ai-governance`/`data-loss-prevention`
clusters remapped to `agent-security`/`data-control-plane`); (3) stale
9-identity expectations. Evening extension the same day added SR/FH/OS
batteries and fixed what they found: raw-hermes-rc `set -e` leak in all three
`_run_once` runners (crash rc bypassed retry mapping — now `set +e` +
`143→timeout` mapping), `qwen-night.sh` gone (both launchd jobs exit 127 —
plists retired to `ops/launchd/retired/`), and an unescaped `&&` in the
workspace plist that failed `plutil -lint`.

| Series | Battery | Covers |
|---|---|---|
| SR01–SR12 | `ops/bin/test-scout-radar.sh` (+ `ops/tests/fixtures/mock-hermes-scout.sh`) | `run-night-agent.sh`: unknown-agent/window/lock refusals (64/5/8), list substitution, empty-list rc=3, digest validator rc=11, crash rc=10, timeout rc=9, mock E2E, live Twenty list (SKIP when down), preflight degrade |
| FH01–FH07 | `ops/bin/test-fleet-health.sh` (+ `mock-hermes-fleet.sh`) | window/lock refusals, L1 matrix + `health.json` keys, tailnet SKIP default, TAILNET_OPTIONAL probe, L2 degrade keeps L1, L2 accept replaces |
| OS01–OS08 | `ops/bin/test-ops-schedules.sh` | plist XML validity, repo/installed sync, no `run-server` refs, tailscale-alive + stale supervisor absent, `net.env` localhost, entrypoint scripts exist, workspace job exit 0 |

Vitest UI/data-layer coverage (B2/B3, all new 2026-10-13, mocked `fetch`):
`src/lib/cron-api.test.ts` (job/run normalization, `ops:`-agnostic shapes,
croniter friendly error, all 7 CRUD/run/toggle/upsert/delete endpoints +
URL-encoding) · `src/lib/gateway-api.test.ts` (sessions/history/status-envelopes,
`session-send` body, models normalization) · `src/routes/api/hermes-jobs.test.ts`
(401 gate, empty-jobs capability fallback, dashboard forward + array
normalization, 503 on POST without support) ·
`src/screens/agents/hooks/use-operations.test.tsx` (hidden-agent filter,
`default→Workspace` rename, `ops:<id>:` job binding, session key/label match +
newest-first, active/idle/error status, canonical session key).
B5 smoke: `pnpm smoke:operations` (`scripts/operations-smoke.mjs` — page 200,
zero-fork, profiles non-empty, jobs proxy). Full Playwright browser E2E is
pending `@playwright/test` (not installed; extension-smoke is vitest-shaped).

Vitest now also covers `src/**`: `src/**/*.{test,spec}.ts` added to
`vitest.config.ts` include (the old `src/server/**` exclude silently skipped
every server test in default runs), `@` → `src` alias added (7 UI test files
failed to resolve `@/lib/utils` without it), `kanban-backend.test.ts` fixed
(`node` environment + `importOriginal` builtin mocks). Full `pnpm test`:
**123 passed, 2 skipped, 1 todo** (4/4 consecutive runs). Known follow-up:
`property-rehydration` caught a real `__proto__` map-key bug in
`packages/ai-protect-core/src/substitute.ts` — tracked as `it.fails` pending
an own-key-safe map fix (out of scope for the agents track).