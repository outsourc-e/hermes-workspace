# System Change Log — What Was Changed, Why, and What Was Built

> Date: 2026-08-25 · Author: opencode session (approved stepwise by A. Nahrgang)
> Companion docs: [system-operations-manual.md](./system-operations-manual.md) · [test-suite.md](./test-suite.md) · [compliance-ops-plan.md](./compliance-ops-plan.md)

Purpose of all changes: turn a set of loosely connected AI tools into one governed platform — Hermes as orchestrator, Buzz as collaboration/audit layer, Twenty CRM as customer data core, Qwen3.8-27B-Heretic unified fleet (primary + unified fallback `0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` @ llama.cpp :8555, Gemma retired 2026-09-18) — ready for SOC 1 / SOC 2 / ISO 27001 documentation work, safe night-time agent operation, mobile control, and later migration to the company server.

---

## 1. Hermes Agent (`~/.hermes/`)

| Change | Why |
|---|---|
| Timestamped backups of `config.yaml`, `auth.json`, `.env` → `~/.hermes/backups/` | Config had survived ≥2 corruption events; no recovery path existed |
| `hermes update` applied (upstream 5908c577→76e306c4) | Was 26 commits behind; stale gateway is an audit finding |
| Cron integrity A1/A2 (2026-11-04/05, [remediation doc](./remediation-2026-11-04-cron-integrity.md)) — interpreter-pinned wrapper scripts in `~/.hermes/scripts/*.sh`, Google News RSS vacuums, deterministic Obsidian append in the gatherer, 4 cron jobs rewired to script-pre-step + report-only LLM, `ops/bin/cron-health.sh` artifact-freshness evaluator wired into T10, launchd-supervised `:8555` proxy (`com.hermes.fleet-proxy`) | LLM cron jobs were the write-path and degraded to no-ops through silent layer failures (wrong interpreter, bot-blocked search engines, path drifted `.md`/`.txt`, unsupervised proxy); health signal must be artifact mtime, not run status |
| Removed duplicate Composio MCP entry (lowercase `composio`) | Two identical MCP servers = duplicate tool surface + confusion; YAML validated after edit |
| Confirmed/enforced `API_SERVER_KEY` pairing; added `HERMES_API_TOKEN` to workspace `.env` | Gateway returned 401 without token — workspace had been running degraded/unauthenticated |
| `API_SERVER_HOST=100.85.50.87` in `~/.hermes/.env` (was loopback) | Gateway must be reachable from phone via tailnet; binding the tailnet IP specifically excludes LAN |
| Root-caused "gateway won't start" episode | Tailscale was *stopped* on the Mac — documented; re-enabled |
| Created profile `night-qwen` (+ seeded its `config.yaml`: base_url :8555, ctx 65536, gateway port 8643) | Day/night model separation without touching the fragile main config; hermes enforces ≥64K context |
| Installed skills `ops-status` and `crm-note` in `~/.hermes/skills/` | Pocket console + voice-to-CRM workflows with hard safety rules |

## 2. Models (Ollama + Atomic fallback — Gemma unified fleet since 2026-09-04)

| Change | Why |
|---|---|
| Discovered Unsloth served Qwen3.8-27B only on ephemeral port 60731 | Ephemeral ports break scheduled jobs silently |
| Built own launcher `ops/bin/qwen-night.sh` (static port 8555, ctx 65536, `-ngl 99`, pidfile/log) — **RETIRED 2026-09-04** (inert, `FORCE_QWEN=1` rollback until 2026-10-04) | Deterministic endpoint for night jobs; replaced by unified Gemma fleet |
| Raised context 32K→64K both sides | Hermes refuses endpoints below 64K |
| Benchmark battery (`bench-model.sh`): gemma4 1/2 clean answers @300 tok (reasoning-budget quirk), Qwen 2/2 | Baseline evidence for model routing decisions; gemma4 summarization needs ≥800 max_tokens |
| Decision 2026-08-25: day = gemma4:12b via Ollama (conservative), night = Qwen3.8-27B (heavy reasoning), uncensored model never unsupervised on compliance text | Performance reality (27B Q8 ≈ 29 GB) + governance risk containment |
| Decision 2026-09-04: **Unified Gemma fleet locked** — primary `gemma4:26b@11434` (`unsloth/gemma-4-26B-A4B-it-GGUF:Q4_K_M`) + fallback `AtomicChat/atomic-chat-gemma412-IQ4_XS @1337/:3890` per `ops/config/model.env` + `model-policy.md`; 7 Hermes profiles updated with `fallback_model`; Qwen :8555 retired, launchd qwen jobs unloaded, port free | Metal OOM on 27B Q8 + day/night split operational cost; Hermes auto-failover on 429/503/unreachable; evidence: `model-check.sh` both endpoints PASS |
| Decision 2026-09-18: **Unified Qwen3.8-27B-Heretic fleet locked** — primary + unified fallback + all auxiliary + delegation = `0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` @ llama.cpp `:8555`, ctx 65536, MinP/dynamic top-k preserved; Gemma retired (rollback only). All 14 profiles + main config + 8 scripts + 6 docs updated | User directive; Metal OOM on Q8 resolved via `Q4_K_M` + `-ngl 99`; single server = single ops surface |
| 2026-09-19: lit bugs to GREEN smoke — `qwen-night.sh` dropped dead `flock(1)` (pidfile guard fallback, was phantom 15-min rc=7 waits) · fleet smoke must not leak `FORCE=1` into battery window-refusal tests (real-runner CS01/TP01 → stray product-intel kanban LLM runs + 15-min hangs; now `env -u FORCE`) · `qwen-night.sh start` now probes a real completion, not just `/v1/models` (Metal backend can wedge with `Compute error` 500 mid-window while `/models` still serves; auto-restart recovers) · `--reasoning on --reasoning-effort low` (minimal); ctx restored 65536 everywhere | Verified: fleet smoke GREEN 21/21, completion 200/2s; wedged 20h-old backend detected & auto-recovered by the new completion probe |
| 2026-09-19: **"API server disconnected" fixed (recurring — 2nd)** — Tailscale was stopped, so hermes `api_server` could not bind `API_SERVER_HOST=100.85.50.87:8642` (`Could not bind` + `api_server failed to connect` in gateway log). Started Tailscale → `hermes gateway restart` → :8642 bound. Guards added: new launchd `com.ops.tailscale-alive` (RunAtLoad + 5-min keepalive: relaunch Tailscale GUI if tailnet IP missing) + `ops-status.sh` `tailnet/api_server` probe + fleet-health L1 `health.json:tailnet`. Recovery note in `system-operations-manual.md` §8 | Same root cause as the 2026-08-25 "gateway won't start" incident — tailscale "Launch at login" was off; the agent now closes that gap. Separate/not fixed: `linear` MCP OAuth parked (run `hermes mcp login linear`), SQLite session-store fallback (`fts_align_empty`) |

## 3. Twenty CRM (`~/twenty` prod, `~/twenty/staging` new)

| Change | Why |
|---|---|
| Auth audit: unauthenticated GraphQL sees no object fields; API-key auth verified | PII baseline check before building anything on top |
| **Found & fixed APP_SECRET config drift** — running container secret ≠ `.env` file (rotated post-start). File aligned to running value; backups: `~/twenty/.env.drift-found-backup`, staging backups kept | Latent incident: next restart would have invalidated every API key/session at once |
| Staging clone built on `:3100` (own Postgres/Redis, pinned image v1.23.4, secrets in chmod-600 `.env`) | Safe testing ground for syncs and note pipeline; restore verified byte-exact (2,958 person rows) |
| Staging APP_SECRET aligned to prod's running secret | API-key JWTs are signed `sha256(APP_SECRET+workspaceId+type)` — discovered by reading server code in-container |
| Nightly backup job (`twenty-backup.sh` + launchd 00:15): pg_dump → TOC integrity check inside container → 7-day retention | Backup without restore-check is hope, not evidence |
| Registered service-account API key as canonical `TWENTY_SERVICE_KEY` | Owner-provided key verified against live instance; flagged year-2126 expiry → rotation policy TODO |

## 4. Buzz (`~/srv/buzz` self-hosted — replaced hosted buzz.xyz)

| Change | Why |
|---|---|
| Cloned block/buzz, Hermit-pinned toolchain, compiled relay (1m13s) | Data sovereignty for compliance content; hosted relay = Block infrastructure, outside audit scope |
| Relay bound `127.0.0.1:3010`; MinIO remapped 9000→9100/9101 via `docker-compose.override.yml` | Port 3000 = Twenty, 9000/9001 = Portainer; override file keeps upstream pristine for git pulls |
| launchd `com.ops.buzz-relay` with KeepAlive **and explicit PATH fix** (launchd lacks `/usr/local/bin` → Docker not found → crash-loop; caught via log review, fixed, resilience re-tested) | Mac relay must survive crashes/reboots without manual care |
| Desktop repointed to local relay; owner identity "Local dev" created by Andreas | First identity = community owner — must be the human |
| 10 channels created via idempotent `buzz-bootstrap.sh` (approvals, night-runs, competitors, customers, partners, soc2, iso27001, incidents, crm-sync, lobby) | Channel taxonomy = information architecture for the whole ops system |
| 7 Nostr keypairs generated locally (`ops/secrets/agent-keys.env`, chmod 600, gitignored) | One identity per actor = provable attribution in hash-chained audit log |
| Verified open-join membership for all agent identities; documented that `agents draft-create` requires owner NIP-OA auth tag (by design) | Security model respected rather than worked around |

## 5. Night operations (launchd fleet — 10 jobs; Gemma fleet since 2026-09-04)

```
00:15 twenty-backup · (00:45 qwen up DEPRECATED → no-op) · 01:00 pre-night gate (Gemma :11434→:1337 probe)
01:30 competitor-scout · 02:15 customer-watcher · 02:45 product-intel · 03:00 partner-radar
05:15 chief-of-staff · 06:15 fleet-health-monitor · (06:30 qwen down DEPRECATED) · 06:45 post-night check
+ com.ops.hermes-workspace (persistent UI) + com.ops.buzz-relay (KeepAlive)
```

Why each guard exists: window checks enforce night discipline (00–06h); lock files prevent double runs; pre-flight Gemma checks + fallback prevent silent garbage; mandatory digests make silent failure visible; `caffeinate`/window logic handles macOS sleep.
Qwen quirk 2026-09-05: Metal OOM / flock 15-min wait on :8555 caused `PRE-NIGHT FAIL`; fix 2026-09-05 switched fleet to `web,file` toolsets and `pre-night` backlog queuing to avoid Hermes dispatcher race.

## 6. Research agent fleet + product-intel + chief-of-staff + fleet-health (Gemma fleet)

Three agents — competitor-scout, customer-watcher, partner-radar — plus product-intel (02:45) + chief-of-staff (05:15) + fleet-health-monitor (06:15): headless Hermes runs on Gemma fleet (`gemma4:26b@11434` → fallback `atomic-chat@1337`, toolsets `web,file`), prompts in `ops/agents/*.md`. Guardrails baked in: source-URL-or-[UNVERIFIED] rule, read-only scope, company-names-only for CRM lookups (no contact PII ever leaves to web search), fixed digest formats with Needs-decision sections, digests filed to `docs/ops/research/` AND posted under own identities (`BUZZ_POST_DIGESTS=1`).
Remediation 2026-09-05: `run-night-agent.sh` toolset `browser→web,file` (harness OOM), `pre-night-check.sh` kanban `ready→backlog` to avoid dispatcher race, `run-chief-of-staff.sh` validator tolerant to heading glitches, `run-fleet-health.sh` key `qwen→primary` + `ops-status.sh` Gemma probe.

## 7. Mobile access (Phase M1/M2/M4)

| Change | Why |
|---|---|
| Workspace made persistent (`com.ops.hermes-workspace`, HOST=100.85.50.87:3001, HERMES_PASSWORD set, 401-verified) | Phone needs a stable cockpit; fail-closed password guard engaged |
| `ops/bin/ops-status.sh` + skill | One-command health board; terse output designed for phone screens |
| Gboard on-device dictation chosen over whisper server (escalation path documented) | Zero infra, audio never leaves phone |

## 8. Voice→CRM pipeline (Phase M3, new)

Reverse-engineered from server code (introspection disabled): note creation = `createNote(data:{title, bodyV2:{blocknote:"<json-array>"}})`; linking = `createNoteTarget(data:{noteId, targetCompanyId|targetPersonId})`; deletes cascade targets.
Built `crm-lookup.sh` (client-side fuzzy match, scores), `crm-note-commit.sh` (**refuses prod writes without ALLOW_PROD=1**), skill `crm-note` (dictation → parse → lookup → mandatory preview → explicit yes). E2E tested on staging incl. cleanup; prod gate refusal tested.

## 9. Documentation system (this directory)

`compliance-ops-plan.md` (living plan + decision log) · `port-registry.md` · `test-log.md` (append-only) · `server-migration-runbook.md` · `co-founder-onboarding.md` · `change-log-systems.md` (this file) · `system-operations-manual.md` · `test-suite.md`.
Why: auditability of our own ops is the first SOC 2 evidence we produce.
