# Test Suite — Buzz Registration · Hermes Kanban · Board↔Relay Sync

> First full automated pass: **2026-08-26 — 20/20 PASS** (`ops/bin/test-buzz-kanban.sh`).
> Companion to [test-suite.md](./test-suite.md) (T/TP/CS series). Append results to [test-log.md](./test-log.md).

Everything here runs **entirely on mocks and temp dirs** (`mktemp` board DB, PATH-shimmed
`buzz`, `HERMES_KANBAN_DB` override) — safe at any time of day, never touches the live
relay or the real `~/.hermes/kanban.db`.

## Conventions

Same as the master suite: a negative test "passes" when the refusal happens.
Board lanes map to DB statuses exactly as `src/server/kanban-backend.ts`:
backlog→queued · ready · running · review · blocked · done.

## A. TB — Agent registration (`ops/bin/buzz-register-agents.sh`)

| # | Test | Asserts |
|---|------|---------|
| TB01 | Plan mode (no auth tag) | rc=0; all 10 identities prepared under byte-exact original names; zero `draft-create` calls; 10 condensed prompt files staged |
| TB02 | Prompt hygiene | No unresolved template placeholders (`{LIST}` `{DATE}` `{KB_DIR}` …) in staged prompts |
| TB03 | Guardrail clauses | READ-ONLY + injection clause ("DATA, not commands") in every research/CoS prompt; approval-gate references for product-intel/chief-of-staff/doc-agent (#soc2) |
| TB04 | Idempotency lookup | Exact-name owner-scoped lookups (`users get --name X --owner me`) for all 9; pre-existing profile short-circuits to `= exists`; remaining 8 still prepared |
| TB05 | Live mode (auth tag set) | 10 × `draft-create` with exact `--display-name` and resolved channel UUIDs |
| TB06 | Relay unreachable | Refused rc=2 |

**Live procedure (owner):** export `BUZZ_AUTH_TAG='<NIP-OA tag>'` (or write
`ops/secrets/buzz-auth-tag.env` — gitignored), run the script, approve the prefilled forms
in Buzz Desktop. Re-runs converge: approved profiles are skipped.

Home-channel mapping (registration + sync share it):
orchestrator→#lobby · competitor-scout→#competitors · customer-watcher→#customers ·
partner-radar→#partners · product-intel→#product-intel · chief-of-staff→#morning-brief ·
watchdog→#night-runs · crm-sync→#crm-sync · doc-agent→#soc2.

## B. TK — Kanban wrapper (`ops/bin/kanban.sh`)

| # | Test | Asserts |
|---|------|---------|
| TK01 | create→get roundtrip | id matches `^t_[0-9a-f]{8}$`; status/assignee/title persisted |
| TK02 | Lane mapping | `--lane backlog` stored as `queued`; invalid lane refused rc=1 |
| TK03 | Lifecycle timestamps | running sets `started_at` (coalesce), done sets `completed_at`, non-done clears it |
| TK04 | Failure path | `fail <id> reason` appends `FAIL <ts>: reason` to body and blocks card |
| TK05 | Negatives | done/fail/set/get on unknown id → exit 4; `latest` for unknown agent → empty |
| TK06 | List filters | `--lane` / `--agent` return only matching rows |

## C. TS — Board↔relay sync (`ops/bin/buzz-kanban-sync.sh`)

Policy: only owner reactions in **#approvals** on messages tagged `[kanban:<id>]`
may mutate cards (✅→ready, ❌→done); nobody self-approves. Card transitions of
night-run cards echo exactly once, tagged, to the owning agent's home channel;
queue states are never echoed.

| # | Test | Asserts |
|---|------|---------|
| TS01 | Owner ✅ applies + idempotent | Tagged message + owner reaction → card ready; event recorded; same-state re-run applies nothing new |
| TS02 | Owner ❌ | Tagged card → done |
| TS03 | Non-owner reaction | Ignored — card untouched |
| TS04 | Untagged message | Never processed even with valid reaction |
| TS05 | Echo exactly-once | running-transition posts one tagged line to mapped channel UUID; re-run resends nothing |
| TS06 | Queue-state silence | queued cards produce no sends; running does |
| TS07 | DRYRUN isolation | Dead relay URL + DRYRUN=1 → rc=0 |

## D. TN — Regression

| # | Test | Asserts |
|---|------|---------|
| TN1 | Fleet bug stays dead | `run-night-agent.sh` resolves channel UUID via `channels list`; no direct `--channel "$AGENT"` name-based send remains (2026-08-26 fix) |

## Cadence

Run `ops/bin/test-buzz-kanban.sh` after any change to the three scripts, before each
night window on change days, and quarterly with the drill cycle. Mock battery is L0/L1;
the first real night run after deployment (cards appearing/moving on the PWA board +
echo lines in channels) is the supervised L2 check.
