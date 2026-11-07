# Compliance & Agent Operations Plan — v2.2

> **Status:** APPROVED by Andreas (2026-10-11) — Phase 1 executing
> **Owner:** Andreas Nahrgang · **Co-founder:** runs Claude Code + Codex dev agents on his machine
> **Living document:** update after every phase review. Test results: [`test-log.md`](./test-log.md) · Ports: [`port-registry.md`](./port-registry.md)

---

## 0. Mission

Use **Hermes agent as orchestrator** and **Buzz (Block) as documentation/collaboration/audit layer** to build and maintain **SOC 1, SOC 2 and ISO 27001** readiness, with all heavy agent work running at night, everything self-hosted where feasible, and every compliance-relevant action gated by explicit human approval.

## 1. Current state audit (2026-10-11)

| Component | State |
|---|---|
| Hermes agent | v0.20.5 installed (`~/.hermes/hermes-agent`, git), gateway :8642 + dashboard :9119 live; 26 commits behind; config survived ≥2 corruption events (`config.yaml.corrupt.*`); `API_SERVER_KEY` present in `~/.hermes/.env`; approvals mode = manual |
| Models | Ollama :11434 → **ternary-bonsai-2-27b:q2_0 PRIMARY fleet** `ternary-bonsai-2-27b:q2_0` (Q2_0 ternary, locked 2026-11-03, `ops/config/model.env` + `model-policy.md`) · unified same-model fallback @ :8555 (Ollama proxy via `gemma-server.sh`) · Qwen3.8-27B-Heretic (llama.cpp :8555) **RETIRED 2026-10-11** (rollback only) · Atomic Chat **RETIRED 2026-09-18** (rollback only) · embeddings bge-small :53299 |
| Twenty CRM | Self-hosted Docker stack up 12 days (:3000 + db/redis/worker); prior LinkedIn sync corruption incident in repo history |
| Buzz | Desktop app installed & running; CLI at `~/.local/bin/buzz`; nest `~/.buzz` exists; self-hosted relay on :3010 |
| Known discrepancy | `PROFILES.md` says default profile model = `gemma4:31b`, live config uses `ternary-bonsai-2-27b:q2_0` |

## 2. Target architecture

```
Day                          Night (01:00–06:00)
─────────────────────        ─────────────────────────────────────
You: opencode + hermes       competitor-scout   → #competitors
Hermes ⇄ ternary-bonsai-2-27b:q2_0          customer-watcher   → #customers
Coding agents                partner-radar      → #partners
Twenty CRM :3000             watchdog digest    → #approvals
                              CRM sync pipeline (staged, rolled-back-on-fail)
Later (Phase 4): buzz relay + Twenty (+ optionally hermes gateway)
migrate to own server; Tailscale mesh incl. co-founder.
```

**Principles:** Buzz = collaboration + hash-chained audit trail · Git = source of truth for policies · Hermes = only dispatcher · You = approval gate for anything compliance-relevant · Unified `ternary-bonsai-2-27b:q2_0` fleet (day+night via Ollama `:11434`, proxied to `:8555`, `model-policy.md`) — Qwen retired 2026-10-11, gemma4:12b retired 2026-11-03.

## 3. Phase 1 — Local foundation (this Mac)

### Step 1.1 Stabilize Hermes baseline — DOING
Actions: timestamped backups of `config.yaml`, `auth.json`, `.env` → dedupe Composio MCP entries → `hermes update` → confirm `API_SERVER_KEY` pairing with workspace `.env` → restart gateway → verify.

Risks & coverage:
- **R1 Config corruption during change** → backup first; edit only while gateway stopped; YAML-validate after each edit; keep `config.yaml.working` as last-known-good.
- **R2 Update breaks working setup** → run at day's end; full smoke test before relying; rollback = restore backups + checkout previous git tag.
- **R3 Key change breaks paired clients** → set matching `HERMES_API_TOKEN` on workspace side; verify pairing; rollback documented (remove key).

Verify: `/health` ok · dashboard status ok · one chat roundtrip · workspace pairs (`mode=enhanced-fork`).

### Step 1.2 Unified fleet (day+night) — Qwen retired 2026-10-11, gemma4:12b retired 2026-11-03
| | Day | Night |
|---|---|---|
| Model | **ternary-bonsai-2-27b:q2_0 via Ollama :11434** (PRIMARY) | **same model (PRIMARY)** — unified same-model fallback @ :8555 (Ollama proxy) |
| Endpoint | static :8555 (proxy) | same :8555 (Hermes auto-retry on 429/503) |
| Mechanism | Hermes `default` profile | Hermes `chief-of-staff`/`product-intel`/`competitor-scout`/`customer-watcher`/`partner-radar`/`fleet-health-monitor` profiles per `model-policy.md` |
| Legacy | — | Qwen fleet (llama.cpp :8555) retired 2026-10-11, rollback only |

Actions: ensure Ollama serves `ternary-bonsai-2-27b:q2_0` → create profile → write `ops/bin/model-check.sh`, `pre-night-check.sh`, `post-night-check.sh`, `gemma-server.sh` → benchmark battery → log baseline.

Risks & coverage:
- **R1 Ephemeral ports break jobs silently** → static `8555` + pre-flight `model-check.sh` asserts exact model ID served (Gemma fleet).
- **R2 Small-model hallucination in planning/compliance text** → Gemma draft only; frontier or human for final control text; known-answer benchmark gates trust.
- **R3 RAM / disk contention** → Ollama + proxy (`gemma-server.sh` checks ≥20 GB disk); restart via launchd if killed.
- **R4 Uncensored model exposure** → never unsupervised on CRM writes/compliance registers; outputs always land in digests for morning review.
- **R5 Model not serving at night** → `pre-night-check.sh` probes primary then fallback; if both fail, FAIL aborts batch with alert.

Verify: `model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion` PASS · benchmark logged · forced out-of-window refusal.

### Step 1.3 Harden Twenty CRM
Actions: auth audit (data query without token must fail) → dedicated API service account + scoped key → disable open signup → staging clone on :3100 from prod dump → nightly encrypted `pg_dump` (7-day retention) → sync scripts wrapped snapshot→sync→diff→rollback.

Risks: PII scope expansion (GDPR/SOC 2) → minimize exports, staging anonymized where possible · repeat of sync corruption → mandatory snapshot + checksum gate + auto-rollback · schema drift on upgrade → pin image tags + GraphQL contract test · single-machine loss → offsite encrypted backup target chosen now (doubles as migration artifact).

### Step 1.4 Buzz relay on :3010
Actions: relay via Docker (host port 3010) → desktop points to `ws://localhost:3010` → keypairs: you / orchestrator / doc-agent / watchdog / crm-sync / competitor-scout / customer-watcher / partner-radar → channels: `#approvals #night-runs #crm-sync #soc2 #iso27001 #incidents #competitors #customers #partners #lobby` → register Hermes-backed agent via `buzz-cli`.

Risks: port collision (solved by registry) · key loss → encrypted local backup, one key per agent, rotation procedure · Buzz immaturity (approval gates still shipping) → approvals = human signed messages/reactions only · Mac-as-SPOF → accepted short-term by design; Phase 4 moves relay to server; launchd auto-start meanwhile.

Verify: desktop+CLI post OK · kill-relay reconnect w/o loss · audit hash-chain export verifies.

### Step 1.5 Night-shift scheduling
launchd plists, 01:00–06:00, each job wrapped in `caffeinate -i`, lock files, append-only logs, mandatory pass/fail digest to `#night-runs`. Risks: sleep kills jobs (caffeinate + `pmset repeat wake`) · runaway loops (timeouts, turn caps, cost counters) · partial writes (temp dir + atomic move) · silent failure (missing digest alerts via watchdog).

## 4. Research agent fleet (nightly web intelligence)

All three agents: run inside the night window, use web search, post structured digests (with source links) to their channel, flag items needing decision into `#approvals`. Own identity/keypair. respond-to = Only me. Guardrails below are compliance rules, not suggestions.

| Agent | Channel | Schedule | Mission | Guardrails |
|---|---|---|---|---|
| **competitor-scout** | `#competitors` | nightly 01:30 | Product/pricing/news/hiring changes of named competitors; weekly rollup Mon | Competitor list maintained in `ops/config/competitors.txt`; no purchases/trials of competitor products; cite sources |
| **customer-watcher** | `#customers` | nightly 02:15 | News/funding/hiring/product signals for active accounts | **Company names/domains only in web queries — never contact-personal PII**; data sourced read-only from Twenty `companies` |
| **partner-radar** | `#partners` | nightly 03:00 | Ecosystem/partner announcements, integration opportunities | Partner list in `ops/config/partners.txt`; same citation rule |

Implementation: Hermes headless runs scheduled via launchd calling `ops/bin/run-night-agent.sh <agent>`; script enforces: pre-night check → correct window → lock file → run agent with agent-specific skill prompt → post digest → release lock. Digest format fixed (markdown sections: Changes / New signals / Needs-decision). All output also appended under `docs/ops/research/<date>-<agent>.md` for evidence trail.

Risks: hallucinated "facts" → every claim must carry a URL; unverified claims marked `[UNVERIFIED]` · search API costs/rate limits → prefer local models for summarization, batch queries, cache raw results · PII leakage → hard filter step strips anything matching contact records before queries · scope creep into actions → these agents have NO write access to CRM/git/Buzz beyond their digest channel.

## 5. Phase 2 — Orchestration, testing, monitoring

- **2.1 Orchestrator wiring**: task protocol via `#approvals`; dispatch → report → your signed approval → artifact lands. Injection test from unauthorized key must fail closed.
- **2.3 Testing suite**: L0 smoke (morning+pre/post change) · L1 integration (sync pytest vs staging, `pnpm test`, relay `just ci`) nightly · L2 E2E scenarios weekly (control-update lifecycle, unauthorized-injection, sync-crash rollback, relay kill) · L3 quarterly drills (restore, access review, tabletop). Results → `test-log.md`.
- **2.4 Watchdog + dead-man switch**: daily health digest to `#approvals`; independent launchd heartbeat check alarms if watchdog silent >24h; watchdog is read-scoped, no approval powers.

## 6. Phase 3 — Humans & unknown agents

- Co-founder: own keypair; his Claude Code/Codex via `buzz-acp` harnesses with own keys; `#dev-*` open, compliance channels gated; cross-trigger tests both directions.
- Unknown-agent admission protocol: own key → `#lobby` sandbox → capability probe by watchdog → promotion only via signed approval → quarterly roster review job.

## 7. Phase 4 — Server migration

Day-one migration-ready rules already applied: env-driven URLs (no hardcoded hosts), host-path volume binds over named volumes, backups double as migration artifacts, restore-on-server = rehearsal, Tailscale mesh, nothing public.
Cutover order: buzz relay → Twenty → optional hermes gateway. Old instance frozen 14 days post-cutover; single-writer enforced.

## 8. Approval gates (standing)

Nothing enters compliance registers, git main, or CRM writes without a human signed approval event in `#approvals`. Watchdog and research agents are read-only by construction. Exceptions require a written decision recorded in this file's changelog.

## Changelog

- 2026-10-11 **Gemma4:12b fleet locked** — Migrated from Qwen3.8-27B-Heretic to gemma4:12b as primary model. Updated all configs, profiles, scripts, and docs. Ollama serves model on :11434, proxied to :8555 via `gemma-server.sh`.
- 2026-11-03 **Ternary-Bonsai-2-27B fleet locked** — Migrated from gemma4:12b to `ternary-bonsai-2-27b:q2_0` (Q2_0 ternary, base Qwen/Qwen3.8-27B) as primary model. Updated all configs, profiles, scripts, and docs. Ollama serves model on :11434, proxied to :8555 via `gemma-server.sh`.
- 2026-09-18 Qwen3.8-27B-Heretic fleet locked: primary + unified fallback + all auxiliary + delegation = `0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` @ llama.cpp :8555 (`qwen-night.sh` restored, launchd start job re-armed); Gemma fleet retired (rollback only).
- 2026-09-05 Fleet remediation: `run-night-agent.sh` switched from `-t browser` (daemon OOM) to `-t web,file`; `run-chief-of-staff.sh` validator tolerant to heading glitches (`## ## 2. Customers`); `pre-night-check.sh` lanes `backlog` (queued) to avoid Hermes gateway dispatcher race; `run-fleet-health.sh` primary key renamed `qwen→primary`; `ops-status.sh` now probes Gemma fleet; all 2026-09-05 boards recovered to `done`.
- 2026-09-04 Gemma fleet locked: primary `gemma4:26b@11434` + fallback `atomic-chat@1337` per `model-policy.md`; Qwen :8555 retired, `qwen-night.sh` inert, launchd qwen jobs unloaded (rollback until 2026-10-04 via `FORCE_QWEN=1`). Night schedule unchanged except Qwen start/stop no-ops.
- 2026-08-25 MOBILE M3 UNBLOCKED & DELIVERED: owner provided Twenty service key (= existing TWENTY_API_KEY). **CRITICAL FIND**: prod APP_SECRET config drift (running ≠ file) — latent restart-incident fixed, backups kept, secret rotation added to TODO. Write path reverse-engineered from server code (createNote + createNoteTarget w/ targetCompanyId/targetPersonId; bodyV2 = {blocknote:"<json>"}). Shipped: crm-lookup.sh (fuzzy match), crm-note-commit.sh (prod-gated via ALLOW_PROD=1), ~/.hermes/skills/crm-note/ (dictation→parse→lookup→preview→explicit-yes flow). E2E tested on staging incl. cleanup.
- 2026-08-25 MOBILE PHASE M1+M2+M4 DONE (M3 CRM-pipeline HELD pending owner's Twenty service-account key): gateway bound tailnet-only (100.85.50.87:8642) after fixing stopped-Tailscale root cause; workspace persistent via launchd on :3001 with HERMES_PASSWORD gate; ops-status.sh + ~/.hermes/skills/ops-status/SKILL.md enable pocket control ("status", digest recall, confirmation-phrase-gated reruns). Voice = Gboard on-device dictation first; whisper.cpp escalation deferred. Hardening TODO: :3001 wide bind (pf/tailscale-serve).
- 2026-08-25 BUZZ LIVE END-TO-END: owner ("Local dev") + orchestrator + 6 agent identities all authenticated members of self-hosted relay; 10 channels created; smoke post verified; run-night-agent.sh wired to post per-agent-key digests into channels (BUZZ_POST_DIGESTS=1 in ops/config/buzz.env). Learned constraints: agents draft-create needs owner NIP-OA auth tag (by design — profiles are optional UI polish); channel create requires --type/--visibility; messages --channel takes UUIDs.
- 2026-08-25 BUZZ FULLY SELF-HOSTED + FUTURE-PROOFED (owner confirmed no hosted data needs preserving): 7 agent keypairs generated (ops/secrets/, gitignored); buzz-bootstrap.sh ready (channels + owner-approved agent drafts); run-night-agent.sh can post digests to channels (BUZZ_POST_DIGESTS=1); server migration runbook written (docs/ops/server-migration-runbook.md); co-founder + unknown-agent onboarding documented (docs/ops/co-founder-onboarding.md). REMAINING MANUAL STEP: owner completes desktop onboarding at ws://localhost:3010 → then run ops/bin/buzz-bootstrap.sh.
- 2026-08-25 RELAY FIX: launchd PATH issue resolved (Docker not found by launchd) — plist now exports full PATH; crash-resilience re-verified (respawn PASS).
- 2026-08-25 v2.1 added research agent fleet (competitor-scout, customer-watcher, partner-radar) per owner request
- 2026-08-25 v2.0 approved: reordered local-first plan, dual-model day/night architecture, migration-ready design
- 2026-08-25 EXECUTION LOG: Steps 1.1–1.3 + 1.5 + 2.0 complete (see test-log.md). Step 1.4 Buzz relay BLOCKED pending owner decision: desktop currently on Block-hosted relay; self-hosted requires source build (~30–60min, Rust toolchain) — options: (a) stay hosted for Phase 1, revisit at server migration; (b) build local relay now on :3010; (c) skip straight to server-hosted in Phase 4.
- 2026-08-25 Night schedule live: 00:15 backup · 00:45 Qwen up · 01:30 competitor-scout · 02:15 customer-watcher · 03:00 partner-radar · 06:30 Qwen down + post-check
- 2026-08-25 BUZZ SELF-HOSTED (owner approved "build now"): relay compiled from source at ~/srv/buzz, live on 127.0.0.1:3010, launchd-managed (KeepAlive). Infra: Postgres 17/Redis/Typesense/Keycloak/MinIO(:9100 remapped). Supersedes earlier "hosted until Phase 4" decision — local test now, migrate relay+Twenty(+Hermes optional) to company server after local validation. Migration = pg_dump buzz db + rsync ~/srv/buzz + restore on server + repoint clients' BUZZ_RELAY_URL.
- 2026-08-25 PENDING owner actions: real competitor/partner lists in ops/config/; dedicated Twenty service-account API key (Settings→APIs); consider unloading Qwen from Unsloth Studio UI before first scheduled night (RAM coexistence); disable open signup in Twenty workspace settings if applicable; IN DESKTOP APP: switch relay to ws://localhost:3010 and complete local onboarding (creates owner identity), then approve drafted agents