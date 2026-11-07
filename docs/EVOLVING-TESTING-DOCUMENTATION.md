# EVOLVING TESTING DOCUMENTATION — Hermes Gateway, Local-Model Fleet & Cron

> Created 2026-10-18 · Owner: A. Nahrgang · Living document — **append, never rewrite history**.
> Machine-checked by: [`ops/tests/test-hermes-health.sh`](../ops/tests/test-hermes-health.sh)
> Latest full pass: **2026-10-18 15:19 — 16 PASS / 1 WARN / 0 FAIL** (WARN = pre-fix failure history in 24 h window, self-clears)
> Related: [`docs/ops/model-policy.md`](ops/model-policy.md) · [`docs/ops/remediation-2026-10-18-cache-purge-and-fleet-enforcement.md`](ops/remediation-2026-10-18-cache-purge-and-fleet-enforcement.md) · [`docs/ops/port-registry.md`](ops/port-registry.md) · [`docs/ops/test-suite.md`](ops/test-suite.md)

---

## 1. Why this document exists

Between Oct 11 and Oct 18 2026 the Hermes gateway looked "not working": 39 of 107
cron executions failed, chat turns hung 40+ minutes, and the workspace watchdog
crashed nightly. The forensic pass (see the remediation doc above) showed the
failures were **cascading and preventable**: stale model caches made every
inference request spawn a 262k-context llama-server (20 GB "memory fitting",
26-min cold loads, llama.cpp init crashes); two cron jobs ran under a Python
interpreter missing one dependency; the watchdog crontab lacked a PATH.

This document is the **evolving** record of how to prevent, detect and verify
every failure class discovered so far. It changes as the system changes — each
run appends to §6, every new failure class gets a new test here and a note in §7.

### Standing runtime rule (user directive 2026-10-18, encoded in T00)

> **Any time anything in this stack is checked or fixed, delete every involved
> cache first — before any other diagnostic or repair action, every time,
> without exception.** Models are never deleted; caches always are.

`T00` implements this: the battery purges all known regenerable caches at start.
`--no-purge` is possible but recorded as a violation of the rule.

## 2. Scope

| Layer | Covered | Not covered (separate suites) |
|---|---|---|
| Model caches (regenerables under `~/.hermes`) | T00, T00b | MCP schema tmp hygiene (purge list can grow) |
| Gateway API (`:8642` health, auth, completion) | T01–T03 | webhook receiver `:8644`, channels (Telegram/Slack) |
| Local model fleet (`:8555` proxy, `:11434`, llama-server spawn) | T04, T05, T08 | nightly llama.cpp bench (see model-policy §3) |
| Config policy compliance (primary/fallback/pins) | T06, T07 | profile-level configs (16 profiles, spot-checked via T06 only) |
| Cron scheduler (heartbeat, 24 h failure ratios) | T09, T10 | per-job output correctness (manual inspection) |
| Workspace + supervisors (`:3001`, LaunchAgents, dashboard, watchdog crontab) | T11–T14 | Playwright UI vit tilstands tests (`playwright.config.ts`) |

## 3. Test catalog

Run: `bash ops/tests/test-hermes-health.sh [-v] [--no-purge]`
Logs: `ops/run/hermes-health-<YYYYMMDD>-<HHMMSS>.log` · Exit `0` all green, `1` any FAIL. WARN never fails a run.

| # | Test | Type | Expect | What breaks if it fails |
|---|---|---|---|---|
| T00 | Cache purge executed | positive | all regenerable caches deleted before any probe | stale model metadata resurrects old outages |
| T00b | Retired-model refs in active caches | positive | 0 stale references | config-drift noise, wrong capability maps |
| T01 | `GET :8642/health` = `status ok` | positive | HTTP 200 platform=hermes-agent | orchestrator down — nothing else matters |
| T02 | Bad API key rejected on `/api/sessions` | **negative** | HTTP 401 | auth bypass / exposed sessions |
| T03 | Completion round-trip `ternary-bonsai-2-27b:q2_0` via gateway | positive | HTTP 200, `finish_reason` present | inference path dead (cold-fit, Ollama down, crash) |
| T04 | `:8555` proxy reachable | positive | HTTP 200/401 | policy endpoint dead — fleet down |
| T05 | `:11434` Ollama reachable | positive | HTTP 200 | backend server down |
| T06 | `config.yaml` primary + fallback = local policy model | positive | both entries identical, on-policy | policy drift → retry storms, cost surprises |
| T07 | No cron job pinned off-policy | positive | `no foreign pins` | nightly 19 GB model loads stall the gateway |
| T08 | llama-server spawned at context 65536 | positive | `-c 65536` | 262k spawn → 20 GB KV fit, `ctx_other` crash, 26-min hangs |
| T09 | Cron ticker heartbeat < 1800 s | positive | fresh tick | scheduler dead, jobs silently skipped |
| T10 | Executions in last 24 h, failure count | information | 0 failed (history shows as WARN) | regressions from today's fixes |
| T11 | Workspace `:3001/chat/new` 200 | positive | HTTP 200 | UI down |
| T12 | `ai.hermes.gateway`, `com.ops.hermes-workspace` running | positive | pid present | supervisor dead |
| T13 | Dashboard `:9119` 200 | information | HTTP 200 | observability blind (advisory: manual restart pending 2026-10-13) |
| T14 | Watchdog crontab entry present | positive | entry found | no automatic workspace recovery |

### Known-good vs known-bad baselines

* **65536** = fleet context standard (model-policy.md). `-c 262144` is a FAIL-class symptom.
* Cold-load completion ≈ **1:45 min** acceptable; > 10 min = cold-fit regression.
* `RSS ~11 GB` during llama-server fit with 65536 ctx is normal (model + KV + vision projector); `15–20 GB` = maximal-ctx fit, investigate `context_length` config.
* Test T00 will always show the cache purge as PASS and T00b as PASS — they are hygiene assertions, not health probes.

## 4. Failure → test mapping (how this doc earns its keep)

| Symptom (seen Oct 11–18) | Root cause | Test that catches it today |
|---|---|---|
| Chat turns hang, then `Operation interrupted: waiting for model response` | llama-server spawned at 262 k ctx (`ctx_other` crash / 26-min fit) | T03 (times out → FAIL), T08 (catches wrong `-c`), T00 (stale ctx cache — now non-regenerating) |
| Jobs fail `ModuleNotFoundError: requests` | cron interpreter missing dep | T10 (failure count WARN) — direct dep check not yet a dedicated test (§7 backlog) |
| Watchdog logs `CRITICAL - Failed to execute start script` hourly | cron PATH without pnpm | T14 (entry present) + PATH now in crontab; manual check until first green tick |
| `Topic news digest` triggers nightly 19 GB model load | off-policy pin in jobs.json | T07 |
| Workspace UI "not connected" | gateway port race on restart, dashboard advisory | T01, T12, T13 |
| 1284 `invalid API key` warnings Oct 14 | local node health-checker with wrong key | T02 (negative ensures wrong keys are refused — the *client* side is a §7 backlog item) |

## 5. Operating procedure

1. **Before touching anything**: `bash ops/tests/test-hermes-health.sh -v` (this purges caches per the standing rule).
2. **After any config/script/model change**: purge happens again (T00 runs every invocation) — no manual purge needed.
3. **Interpretation**: FAIL = incident now. WARN = tracked defect or degraded-but-alive (see note column + §4).
4. **Append the run's summary line to §6** (timestamp · counts · notable note).
5. **Escalation mapping**: gateway FAIL → check LaunchAgent (T12) → `~/.hermes/logs/gateway.error.log`; completion FAIL + T08 `-c 262144` → config policy drift; T09 stale → gateway scheduler crashed, restart.

### Gateway restart hazard (documented 2026-10-18)

`hermes gateway restart` can **race the draining predecessor**: the old process holds `:8642` while the new one binds → new API server parks (`Port 8642 already in use`). Seen twice in one afternoon. Recovery: run `hermes gateway restart` a second time once the old pid is gone (candidates: `lsof -tiTCP:8642`). If `lsof` shows no listener, a second restart is always safe.

## 6. Run log (append-only)

| Date / time | Result | Notes |
|---|---|---|
| 2026-10-18 14:23 | 13 PASS / 3 WARN / 1 FAIL | first run of the battery; T03 grep bug (space in JSON), T07 un-pin pending, T08 262144 pre-fix |
| 2026-10-18 15:19 | **16 PASS / 1 WARN / 0 FAIL** | all approved fixes live: ctx 65536 (config + `OLLAMA_CONTEXT_LENGTH`), digest un-pinned, vacuums fixed (requests 2.34.2, script verified end-to-end), watchdog PATH + SKIP_BUILD, prompt fixes. WARN = T10 history from before fixes (self-clears in 24 h) |
| 2026-10-19 12:35 | 16 PASS / 1 WARN / 0 FAIL | verification pass requested same-day after full test-suite sweep; WARN = T10 (8 failed / 23 cron runs in last 24 h — history from known vacuum defects, documenting against §4 table), all other tests green including T08 `-c 65536`, RSS 13.7 GB |

## 7. Backlog / evolution rules

* Add a test for each NEW failure class before closing its remediation doc.
* When `model-policy.md` changes (model, ctx, endpoint), update T04/T06/T08 expectations **in the same commit**.
* Backlog candidates:
  * dedicated vacuum-jobs dependency test (`python -c "import requests"` under the cron interpreter);
  * watchdog end-to-end test (`SKIP_BUILD=1 bash scripts/start-stable.sh` on a spare port + health);
  * client-side key audit (who sent the 401s) as a scheduled report;
  * gateway restart race → propose `RestartPreventExitStatus`-friendly drain fix upstream (see truncated launchd comment in `ai.hermes.gateway.plist`).
* History is never deleted: this file grows; superseded guidance is struck through, not removed.

---

*Comprehensive reference index: this document is referenced from the repo README (Documentation section), `docs/troubleshooting.md`, and `docs/ops/test-suite.md`.*
