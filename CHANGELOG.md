# Changelog

All notable changes to Project Workspace are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- **Gemma fleet remediation 2026-09-05** — completed Qwen :8555 → unified Gemma retirement (started 2026-09-04). `qwen-night.sh` now inert (`FORCE_QWEN=1` rollback until 2026-10-04), launchd qwen jobs unloaded, port 8555 free; `post-night-check.sh` and `ops-status.sh` now probe Gemma fleet `gemma4:26b@11434` + fallback `atomic-chat@1337` (no more `FAIL not serving on :8555`); `run-fleet-health.sh` key `qwen→primary` and health row `Primary Ollama / Fallback Atomic`; `run-night-agent.sh` toolset `browser→web,file` fixing `browser-harness daemon` OOM; `pre-night-check.sh` lane `ready→backlog` fixing Hermes dispatcher race; `run-chief-of-staff.sh` validator tolerant to heading glitches (`## ## 2.`). All 2026-09-05 boards reconciled to `done`. Added `ops/bin/test-fleet-gemma.sh` 21-check smoke + forensics runbook `docs/ops/remediation-2026-09-05-gemma.md` + `system-operations-manual.md §8`. Batteries: `test-product-intel.sh 17/17`, `test-chief-of-staff.sh 12/12` (see `test-log.md`). — [model-policy.md, port-registry.md]

### Changed
- **Ops hand-off doc added (2026-11-06 PM): `docs/ops/fixing chron jobs and kanban localy.md`** — the full post-mortem for the cron/kanban repair effort: incident layer-stack, every fix + rationale (B1/B2/B3/B4/R7/B5), what was tested and why (G01–G18 case map, hermeticity incidents), ground rules for the next dev/LLM (append-only docs, no raw-SQL board writes, hermetic knobs, client-API invariance), a cheatsheet, and the forward watch schedule (21:00 Topic digest = first real dual-lane exercise; tomorrow's 06:50 first effective triage and 12:10 first 4-agent catch-up sweep).

- **Part 2 (2026-11-06 PM)** — backlog gets its scheduled janitor and product-intel joins the day catch-up: `com.ops.kanban-triage.plist` parks automated cards older than 14 days daily at 06:50 (verified live: 0 stale / 67 kept — the Oct-24 tail class becomes eligible tomorrow); `run-product-intel.sh` ports the B4 CATCHUP pattern verbatim (day window 09–17, oldest-not-today adoption, `ALL_CLEAN` trap fix, stale-lock reorder, quiet no-op, cadence state asserted untouched) and `run-day-catchup.sh` now walks all four agents. chief-of-staff deliberately not backfilled — stale cards park via triage at day 14. Herbmeticity repairs: the sync engine no longer unconditionally prepends `~/.local/bin` (TS battery 20/20 restored), the repo plist for the workspace server was synced from the installed production copy, a dead `com.hermes.workspace` agent was booted out, and the OS07 checker is token-aware. run-all: 10/10 suites PASS. — [remediation-2026-11-04-cron-integrity.md §9, test-log.md]

- **Fleet decode capacity R7 (2026-11-06)** — the single decode lane is gone: `OLLAMA_NUM_PARALLEL=3` is now asserted on the Ollama serve via a self-healing launchd env agent (`ollama-env-apply.sh` + `com.ops.ollama-env.plist`, full-app-restart capable), and because the qwen35-family architecture refuses parallel slots in ollama 0.40.14 (`n_slots=1`, measured — no silent capacity fantasy), a **second supervised upstream on :21434** gives real capacity: `fleet_proxy.py` (:8555) fans fleet requests over the two lanes least-in-flight-first, with pre-response failover, lane-down marking, and a `/health` endpoint exposing lane state. Interactive `:11434` clients are untouched; both upstreams are KeepAlive-supervised (the R6 lesson applied to the final unsupervised process). — [remediation-2026-11-04-cron-integrity.md R7, test-log.md]

- **Day-time consumption rule B4 (2026-11-06)** — failed nightly research runs no longer orphan their cards forever: `run-day-catchup.sh` (daily 12:10 launchd) has each research agent adopt its OLDEST stale ready `night-run:` card — through the same fail-closed B1 gate, lock, pre-flight and digest chain as the night fleet, quota 1/agent/day, zero model spend when there's nothing stale. (Mechanism closed: the nightly runner only adopts its own date's card, and the gateway auto-recovers below-breaker failures to ready, so every interrupted night used to become permanent backlog.) Runner hardened en route: the exit trap no longer re-blocks completed cards, the previously unreachable 90-min stale-lock cleanup now runs, and the gate battery got hermetic `RUN_DIR_OVERRIDE` isolation, time-rot-proof fixtures, and three new catch-up cases (G13–G15, 15/15). — [remediation-2026-11-04-cron-integrity.md §8, test-log.md]

- **Buzz sync repair B3 (2026-11-06)** — the Buzz↔Hermes kanban sync (owner-approval lane flips in, night-run lane-change posts out) came back after two months dead: single-line fixes in `buzz-kanban-sync.sh` — `BUZZ_RELAY_URL` scheme (`ws://`→`http://localhost:3010`; the relay itself had stayed healthy, `ws://` gave 404s at the CLI) and launchd PATH (`~/.local/bin` missing, so bare `buzz` was command-not-found under the agent while reporting "relay unreachable"). Sync state cold-start-primed to the current 420 lanes (no post storm, no stale approval replay); battery `test-buzz-kanban.sh` 20/20; launchd kickstart rc 0; back on 15-min cadence. — [remediation §7, test-log.md]

- **Funnel resurrection + card-debt triage B2 (2026-11-06)** — the three phantom KRITIS distillers now have real feed chains: `generic_vacuum.py` gained KRITIS-EAST/WEST query sets plus a KRITIS-MASTER aggregation mode (deterministic merge of the freshest regional raws), wired via 4 new interpreter-pinned wrappers ("pipeline" = vacuum → synth in one job; the two-`exec` trap — only the first `exec` runs — was caught by the T10 artifact signal and fixed). Weekly Shadow vacuum writes its own `/tmp/shadow_ai_weekly_raw.txt` (collision with the daily gatherer's file removed), `synth.py shadow_ai_weekly` target added. `shadow_ai_gatherer.py` gained the HN Algolia `search_by_date` source (24 h, 4 shadow/sovereign/local-LLM queries) — first run found 3 real hits and made the first deterministic Obsidian append since 2026-09-07. `ops/bin/kanban-triage.sh` (dry-run default, `--execute` applies) parked the aged-out automated cards in `blocked` with explicit reasons — v1 (`kanban.sh fail`) was silently reverted within 30 s by the gateway's `recompute_ready()` sweep (raw-SQL block = recoverable "direct DB edit"), fixed in v2 via sticky kernel blocks (`hermes kanban block --kind needs_input`); final stable state: ready 62 + queued 5 (fresh night-runs), blocked 243, done 108, running 1. Backups: `ops/run/b2-2026-11-05/` (jobs.json + scripts + full kanban.db). Backups: `ops/run/b2-2026-11-05/` (jobs.json + scripts + full kanban.db). — [remediation-2026-11-04-cron-integrity.md §6, test-log.md]

- **Kanban gate B1 (2026-11-05)** — `ops/bin/cron-gate.sh` consulted by `run-night-agent.sh` + `run-product-intel.sh` before every card claim: fail-closed on a stale/missing/corrupt A1 health snapshot, stalled executions, missed daily runs, or failed runs that actually broke pipeline output — while chronic artifact debt (never-written East/West/Master distiller reports) is intentionally exempt until B2 resolves it. Fail-closed means: closed → runner exits rc=4 without claiming a card or spending tokens; `FORCE=1` superviser bypass; chief-of-staff stays ungated (oversight keeps running). Snapshot freshness via new launchd poller `com.ops.cron-health.plist` (30 min). New battery `ops/tests/test-cron-gate.sh` G01–G12 (12/12 hermetic, ~1.5 s), added to `ops/tests/run-all.sh`; runner hermeticity hardened (`RESEARCH_DIR` override). — [remediation-2026-11-04-cron-integrity.md, test-log.md]

- **Cron integrity A1/A2 (2026-11-04/05)** — see `docs/ops/remediation-2026-11-04-cron-integrity.md`. LLM cron jobs are no longer the write-path: vacuums/gatherer/Lusha pre-steps run as interpreter-pinned deterministic scripts (launchd-PATH-safe wrappers), daily Shadow AI Update + Lusha jobs demoted to report-only, search switched to Google News RSS (DDG bot-blocked 202, Bing walled), jobs.json model-pin removed. New `ops/bin/cron-health.sh` A1 evaluator (artifact-mtime + executions verdicts → `ops/run/cron-health/last-24h-health.json`) wired into test-hermes-health T10, replacing the failed-count WARN-shrug; it exposed 3 distiller reports that never existed and a 2611 h stale Shadow AI report. Fixed 2026-11-05 outage: `:8555` fleet proxy now launchd-supervised (`com.hermes.fleet-proxy`, KeepAlive verified) after an unsupervised death caused all cron agent runs to hang 763 s; proxy moved from `/tmp` to `ops/bin/fleet_proxy.py`; 349 MB runaway log rotated.

- **Model migration 2026-11-03: `gemma4:12b` → `ternary-bonsai-2-27b:q2_0`** — unified fleet primary + fallback + all auxiliary + delegation + cron jobs moved to `ternary-bonsai-2-27b:q2_0` (`prism-ml/Ternary-Bonsai-2-27B-gguf`, Q2_0 2-bit ternary of Qwen/Qwen3.8-27B, 7.6 GB), served via Ollama `:11434` proxied to `:8555` by `gemma-server.sh` (filename kept; internals rewritten as a thin pass-through to Ollama's native OpenAI `/v1` endpoint — the old NDJSON collector silently dropped streamed `tool_calls`/`finish_reason` and Hermes aborted agent runs rc=1; passthrough also injects the fleet model when the client omits it). Updated `ops/config/model.env` + `ops/config/Modelfile.ternary-bonsai` + 9 fleet scripts + 2 test batteries + 5 agent prompts + all 14 active Hermes profiles + `~/.hermes/config.yaml` (model/fallback/18 aux/delegation; aux timeouts raised for the reasoning model: vision/session_search/flush_memories 30→300, title_generation 120→300; chief-of-staff profile request_timeout 900→2700 due to ~50 tok/s prompt-eval at ~20k-token contexts) + docs. `night-qwen` profile untouched (Qwen rollback). gemma4:12b kept in Ollama for rollback (remove after ~2 weeks). First unattended window 2026-11-04: 6/6 research digests produced, `health.json primary PASS`. Tested: identity+completion checks PASS, fleet smoke 21/21 (×2), hermes-health 15/2W/0F, bench 2/2 @800 tok, supervised competitor-scout E2E with real web tool-calls PASS. — [model-policy.md, test-log.md]

- **`docker compose up` now pulls pre-built images by default** (#82) — `nousresearch/hermes-agent:latest` for the gateway and `ghcr.io/outsourc-e/hermes-workspace:latest` for the UI. Agent state persists in the `hermes-data` named volume. Adds `docker-compose.dev.yml` overlay for building from source.

## [2.0.0] — 2026-04-20

**Zero-fork release.** Clone, don't fork. Project Workspace now runs on vanilla `pip install hermes-agent` with no patches, no drift, no custom gateway required.

### Added
- **Zero-fork architecture** — dual gateway/dashboard routing; workspace talks directly to vanilla `hermes-agent` 0.10.0+ via standard endpoints (`/v1/models`, `/api/sessions`, `/api/skills`, `/api/config`, `/api/jobs`)
- **One-liner curl installer** — `curl -fsSL … | bash` provisions workspace + gateway + defaults
- **Hermes-Nous theme** — dark + light editorial variants with cobalt/paper surface pass, thin 1px architectural borders, editorial type accents
- **Conductor** (`/conductor`) — mission-control surface ported from Clawsuite; spawn missions, assign workers, watch live output and costs
- **Operations** (`/operations`) — agent registry / sessions manager ported from Clawsuite; pause, steer, kill live agents with role and model insight
- **Synthesized tool pills** — inline tool-call rendering from dashboard stream markers when running against zero-fork gateway
- **Landing parity pass** — hero, features, screenshots, setup, OG image, mobile theme toggle
- **Task board status vs. assignee** decoupling
- **Local-model chat session persistence** — local sessions appear in history + session list
- **Memory is local-fs first** — honors `HERMES_HOME`, no gateway dependency
- **Splash + screenshots refresh** — Conductor, Dashboard, Tasks, Jobs captured in new editorial theme

### Changed
- **Model picker** — fetches from gateway (`~/.hermes/models.json` for user-configured models), matches OCPlatform behavior; shows only configured providers instead of all upstream
- **`enhanced-fork` mode label** no longer implies a fork is required; it indicates streaming route availability on vanilla gateway
- **Dashboard + enhanced-chat capabilities** marked optional; missing endpoints no longer trigger warnings
- **Feature-gate + install copy** — all fork-era references purged
- **Theme family allowlist** — `hermes-nous` promoted to the enterprise allowlist
- **Session pill** — solid dark-mode background, matches model selector

### Fixed
- Duplicate responses and disappearing history on interrupt (#62)
- Portable-mode double user message, uncleaned timeouts, orphaned unregister callbacks
- Local model selection actually propagates to chat (no silent fallback)
- Strip provider prefix correctly for local routing
- Dashboard token injection on `/` (not `/index.html`)
- Onboarding no longer stacks behind workspace shell
- Root bootstrap guards against uncaught errors
- Preserve assistant text during tool-call streaming
- Installer output uses defined escape vars (removed undefined BOLD/RESET)

### Removed
- All references to the legacy "enhanced fork" as a requirement
- Stale fork-era gateway instructions and feature-gate copy

---

## [1.0.0] — 2026-04-10

Initial public release. Chat, files, memory, skills, terminal, dashboard, settings — the foundational workspace.
