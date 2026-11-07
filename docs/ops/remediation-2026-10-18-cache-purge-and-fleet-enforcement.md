# Remediation 2026-10-18 — Cache Purge and Local-Model Fleet Enforcement

> Date: 2026-10-18 · Owner: A. Nahrgang · Scope: Last-week cron degradation analysis (Oct 11–18), stale model-cache purge, fleet enforceability check.
> Status: **COMPLETE — test battery 16 PASS / 1 WARN / 0 FAIL (`ops/tests/test-hermes-health.sh`, WARN = pre-fix history in 24 h window).**
> Single source of truth for model policy: `docs/ops/model-policy.md` (locked 2026-10-11 — one local model: `ternary-bonsai-2-27b:q2_0`, context 65536, endpoint `:8555` proxy).
> Testing reference: [`docs/EVOLVING-TESTING-DOCUMENTATION.md`](../EVOLVING-TESTING-DOCUMENTATION.md).

## 1. Symptoms (Oct 11–18)

From `~/.hermes/cron/executions.db` — 107 executions in 7 days: 67 completed, 39 failed, 1 unknown.

| Job | Runs | Failed | Failure mode |
|---|---|---|---|
| AI-Protect Vacuum | 15 | **15 (100%)** | `ModuleNotFoundError: No module named 'requests'` — broken all week |
| KRITIS South Vacuum | 15 | **15 (100%)** | same |
| Lusha-Twenty Inbox Sync | 8 | 4 | Stalls "waiting for model response" up to 61 min, killed by stale-stream watchdog (900 s threshold) |
| Shadow AI Update | 7 | 4 | Model stalls + prompt reads `/tmp/shadow_ai_raw.md` while the vacuum writes `/tmp/shadow_ai_raw.txt` → silent no-op on success |
| Topic news digest | 7 | 3 | Model stalls mid-Oct; recovered Oct 17 21:07 |
| KRITIS East / West / Master Audit + all three Distillers | ~56 | 0 | healthy |

User-visible symptom: "the hermes gateway is not working" — chat turns hang, jobs stall for 40+ min.

## 2. Root causes

| # | Cause | Evidence | Impact |
|---|---|---|---|
| 1 | **Stale context-length cache.** `~/.hermes/context_length_cache.yaml` held `262144` for the local model (probed from the model's *max* GGUF metadata on Oct 13 21:00). The active `config.yaml` sets no global `context_length`, so Hermes trusted the cache and requested full-262144-token context → llama-server spawned with `-c 262144` → ~20 GB KV-cache "memory fitting", ~26 min cold loads, and llama.cpp init crashes (`Gemma4Assistant requires ctx_other to be set`) on Oct 16 21:59 and Oct 18 00:59. | `~/.hermes/context_length_cache.yaml` (mtime Oct 13 21:00), `gateway.error.log` 500s "timed out waiting for llama-server to start", stale-stream kills at Oct 16 21:xx–22:xx and Oct 18 00:xx–01:33 | Whole inference path stalls; every agent-backed cron job in flight fails |
| 2 | **Stale/duplicated model caches** (`models_dev_cache.json` ×8 incl. 7 profile copies, `ollama_cloud_models_cache.json`, `provider_models_cache.json`, catalog/probe caches) embedding retired-model entries and wrong context metadata from as far back as Sep 3. | `grep 31b` hits in all of the above | Config drift detection noise, wrong capabilities, repeated drift_skip incidents |
| 3 | **Vacuum cron jobs run under an interpreter without `requests`** while distillers (`synth.py`, stdlib-only) succeed. | executions.db stderr: `generic_vacuum.py:2 ModuleNotFoundError` | 30 failed jobs in 7 days, zero successful vacuums since ≥ Oct 14 |
| 4 | **Workspace watchdog cron broken** (`/etc/crontab` PATH minimal → `pnpm: command not found` → start script aborts) — logged `CRITICAL - Failed to execute start script` every run since Oct 16 12:00. Workspace survives only via `com.ops.hermes-workspace` LaunchAgent. | `~/hermes_scripts/watchdog.log`, `.runtime/hermes-workspace.build.log` | No automatic workspace recovery |
| 5 | Minor: `Shadow AI Update` path mismatch (`/tmp/shadow_ai_raw.md` vs `.txt`), KRITIS West prompt typo `/Users/andandreasnahrgang/`, Oct 14 transient invalid-API-key health-check spam (1284 warnings, self-resolved). | gateway.log, jobs.json | Silent data gaps, log noise |

## 3. Cache purge — 2026-10-18 (FIRST ACTION, before any fix)

> **Standing runtime rule (user directive, 2026-10-18):** any time anything in this stack is checked or fixed, delete every cache involved *first*, before any other diagnostic or repair action. Record every deletion in this section.

Deleted (all regenerable; no models, no user config, no backups touched):

| Path | Size | mtime | Cached content | Reason |
|---|---|---|---|---|
| `~/.hermes/context_length_cache.yaml` | 111 B | Oct 13 21:00 | per-endpoint/context ctx lengths incl. `262144` | root cause #1 — forced llama-server 262k spawn |
| `~/.hermes/models_dev_cache.json` | 5.14 MB | Oct 8 11:14 | models.dev catalog | stale model metadata |
| `~/.hermes/models_dev_cache.etag` | 36 B | Oct 8 11:14 | etag that pins the stale fetch | same |
| `~/.hermes/ollama_cloud_models_cache.json` | 410 B | Sep 11 17:15 | cloud model list | stale, pre-cutover |
| `~/.hermes/provider_models_cache.json` | 2.3 KB | Oct 7 23:40 | provider model list | stale |
| `~/.hermes/cache/model_catalog.json` | 11.5 KB | Oct 18 13:13 | model catalog | regenerable |
| `~/.hermes/cache/nous_recommended_cache.json` | 15 KB | Oct 18 13:13 | recommended-models list | regenerable |
| `~/.hermes/cache/openrouter_curated_catalog.json` | 3.5 KB | Oct 18 13:13 | curated catalog | regenerable |
| `~/.hermes/cache/reasoning_caps.json` | 49 KB | Oct 18 13:13 | reasoning capability map | regenerable |
| `~/.hermes/cache/tool_discovery_cache.json` | 30 KB | Oct 11 20:29 | tool discovery results | stale |
| `~/.hermes/cache/plugin-catalog.json` | 926 KB | Oct 18 04:12 | plugin catalog | regenerable |
| `~/.hermes/cache/local_endpoint_probes.json` | 182 B | Oct 18 00:33 | endpoint probe results | stale during outages |
| `~/.hermes/profiles/{chief-of-staff,competitor-scout,customer-watcher,fleet-health-monitor,night-qwen,partner-radar,product-intel}/models_dev_cache.json` | 4.4–5.4 MB each | Sep 3–Oct 11 | per-profile catalog copies | stale model metadata ×7 |
| `~/.hermes/profiles/*/models_dev_cache.etag` | 36 B each | same | etags ×7 | same |
| `~/.hermes/cache/.mcp_schema_cache_*.tmp` | 55.7 MB total | Sep 11–Oct 12 | 645 orphaned MCP schema temp files | pure waste |

Post-purge check: 0 `models_dev_cache.*` remaining, 0 `models_dev_cache`/`context_length_cache` in `~/.hermes/`, 0 `.*_cache.json` catalog files remaining in `~/.hermes/cache/`.

## 4. Purge verification

| Check | Time (local) | Result |
|---|---|---|
| Gateway restart #1 | 13:32–13:36 | Boot loop raced port 8642 (`api_server failed to connect: Port 8642 already in use` — draining predecessor held the port); API server parked |
| Gateway restart #2 | 13:41–13:42 | **OK** — `{"status":"ok","platform":"hermes-agent","version":"0.21.6"}`, `*:8642 LISTEN` (pid 35716), cron scheduler ticking 16 profiles |
| Caches regenerate | 13:36/dist. | `model_catalog.json` etc. rebuilt immediately — regeneration works |
| **`context_length_cache.yaml` rebuilds to `ternary-bonsai-2-27b:q2_0@…:11434: 262144` on its own** | 13:36 + again after second purge | **Cache deletion alone does NOT keep context sane** — the probe re-derives the model's *max* GGUF context every time because `config.yaml` sets no explicit `context_length` |
| Pre-verification purge #2 (standing rule) | 13:46 | 7 cache files + profile copies re-purged before probing |
| Chat completion round-trip via `:8642` (`ternary-bonsai-2-27b:q2_0`, "reply ready") | ~13:50 | **HTTP 200, `"ready"`, finish_reason `stop`** — first completion after purge succeeded |
| Second completion probe | 14:02–14:17 | Timed out at 60 s — llama-server had been unloaded and was re-fitting memory |
| llama-server respawn PID 38629 | 14:18:57 | **Spawned with `-c 262144` again**, RSS climbing past 15 GB during "memory fitting" |

**Verdict:** purge + gateway restart restored API service and one successful completion, but the 262k-context cold-load problem **recurs** every time llama-server unloads — root cause #1 requires the config-level cap (see §5, pending approval).

## 5. Remaining defects → resolved (approved 2026-10-18 ~14:20)

User approved Steps 3 and 4; all were executed with the standing purge first. Results:

| Defect | Fix applied | Verification |
|---|---|---|
| Context re-probe loop (root cause #1) | `context_length: 65536` set explicitly on `model` + `fallback_model`, and all 16 auxiliary `context_length: 24576` entries raised to `65536` in `~/.hermes/config.yaml` (fleet standard per model-policy.md) | llama-server respawned **15:05:29 with `-c 65536`** (was 262144); completion round-trip 1:45 cold (was 20+ min); `context_length_cache.yaml` no longer regenerates at 262144 |
| `Topic news digest` pinned to retired model (root cause #2) | `jobs.json` pin `ce7963e57fad` → `ternary-bonsai-2-27b:q2_0` (T07 now PASS, "no foreign pins") | test T07 PASS |
| Server-side context (defense in depth) | `OLLAMA_CONTEXT_LENGTH=65536` via new `com.ops.ollama-context.plist` (launchctl setenv at login, persistent) + Ollama restart; confirmed `ollama serve` env child carries `OLLAMA_CONTEXT_LENGTH=65536` | fresh llama-server spawn `-c 65536`, RSS ~11 GB during fit (was 15.6+) |
| Vacuum jobs `ModuleNotFoundError: requests` (root cause #3) | `requests` 2.34.2 pip-installed into the cron interpreter (`~/.hermes/tools/python-3.14.7+20260901…/bin/python3`) | ran `generic_vacuum.vacuum('AI-PROTECT')` directly → 3 queries, `/tmp/ai_protect_raw.txt` written (30 185 B) |
| Watchdog cron `pnpm: command not found` (root cause #4) | `PATH=` line added to crontab (homebrew + hermes node/npm + local bin); `SKIP_BUILD=1 + dist guard` added to `scripts/start-stable.sh` so hourly runs stop rebuilding the whole workspace | crontab verified; watchdog's next hourly tick will exercise it |
| `Shadow AI Update` reads `shadow_ai_raw.md` | jobs.json prompt corrected to `/tmp/shadow_ai_raw.txt` (the vacuum's real output) | next daily run exercises the corrected path |
| KRITIS West prompt typo | `/Users/andandreasnahrgang/` → `/Users/andreasnahrgang/` in jobs.json | next 12 h sync run |

## 6. Changes made

| Area | File | Change | Verification |
|---|---|---|---|
| Cache | `~/.hermes/*` (24 files + 645 tmp, §3) | full purge ×4 during the session (standing rule at every check) | post-purge checks: 0 residue |
| Config | `~/.hermes/config.yaml` | `model.context_length` + `fallback_model.context_length` = 65536; 16 aux `24576` → `65536` | YAML parses; T06/T08 PASS |
| Cron | `~/.hermes/cron/jobs.json` | digest un-pinned → `ternary-bonsai-2-27b:q2_0`; Shadow AI path fixed; KRITIS typo fixed | T07 PASS |
| Python | cron interpreter | `requests` 2.34.2 installed | vacuum script ran end-to-end |
| Crontab | user crontab | `PATH` line added | `crontab -l` verified |
| Watchdog | `scripts/start-stable.sh` | `SKIP_BUILD`/dist guard | syntax-checked, executed by next cron tick |
| Ollama | `~/Library/LaunchAgents/com.ops.ollama-context.plist` (new) | sets `OLLAMA_CONTEXT_LENGTH=65536` at login | `ollama serve` env verified; llama-server `-c 65536` |
| Testing | `ops/tests/test-hermes-health.sh` (new) | comprehensive health battery, cache-purge-first encoded | 16 PASS / 1 WARN / 0 FAIL (see docs/EVOLVING-TESTING-DOCUMENTATION.md) |
| Docs | `docs/EVOLVING-TESTING-DOCUMENTATION.md` (new), `docs/ops/model-policy.md` (changelog), cross-refs | testing documentation + references | — |

## 7. Runtime rule

**Every cache involved is deleted any time something in this stack is checked or fixed — before any other diagnostic or repair action, always, without exception.**
