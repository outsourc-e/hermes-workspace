# System Operations Manual — Migration, Team, Compliance, Communication

> Version: 1.4 · 2026-10-11 · Owner: A. Nahrgang
> This is the handbook for running, extending, migrating and certifying the platform.
> Model policy locked: `ternary-bonsai-2-27b:q2_0` (Ollama `:11434`, proxied to `:8555`, unified primary+fallback+aux) — see [model-policy.md](./model-policy.md) + `ops/config/model.env`. Qwen fleet (llama.cpp `:8555`) retired 2026-10-11.
> Deep-dive companions: [server-migration-runbook.md](./server-migration-runbook.md) (command-level) · [co-founder-onboarding.md](./co-founder-onboarding.md) · [test-suite.md](./test-suite.md) · [model-policy.md](./model-policy.md)

---

## 1. What has been achieved — final summary

### Purpose of the system
One governed platform where **humans and AI agents collaborate visibly**: every agent action is attributed to its own cryptographic identity, every compliance-relevant change passes a human approval gate, heavy agent work runs at night on local models (no cloud exposure of business data), and everything is documented well enough to hand to a SOC 2 / ISO 27001 auditor.

### Architecture
```
                          ┌──────────── Tailscale tailnet (encrypted) ────────────┐
   Android (S23) ─────────│─► Hermes Workspace :3001 (password-gated PWA)          │
   "status" / voice notes │      │ server-side                                     │
                          │      ▼                                                 │
   Co-founder (later) ────│─►  Hermes gateway :8642 (tailnet-only, API-key auth)   │
   Buzz desktop           │      │            dashboard :9119 (loopback)           │
                          │      │                                                 │
   Night agents ──────────│─►  Ollama PRIMARY ternary-bonsai-2-27b:q2_0 :11434 (24/7)             │  ← ternary-bonsai-2-27b:q2_0 (Q2_0 ternary, locked 2026-11-03)
   (launchd fleet)        │    Proxied to :8555 via gemma-server.sh                │  ← unified same-model fallback
                          │      │                                                 │
                          ├──► Twenty CRM :3000 (+ staging :3100)                  │
                          └──► Buzz relay :3010 (self-hosted; channels+audit log)  │
                                  Postgres/Redis/Typesense/MinIO(:9100)/Keycloak   │
                                                                                   │
   Policies & registers (source of truth): git repo ~/hermes-workspace/docs/ops/  │
   Model policy: ops/config/model.env + docs/ops/model-policy.md                  │
```
> **Model:** 24/7 unified fleet — `ternary-bonsai-2-27b:q2_0` served by Ollama on `:11434` proxied to `:8555` (primary + fallback + all auxiliary + delegation). Served via `ops/bin/gemma-server.sh`; see `docs/ops/port-registry.md`.

### Achieved capabilities
| Capability | Status |
|---|---|
| Self-hosted Buzz relay w/ signed audit trail | ✅ live |
| Unified Gemma4:12b fleet (day+night) with Hermes `fallback_model` auto-failover + window enforcement | ✅ live (2026-10-11, Qwen retired) |
| Nightly research fleet (competitors/customers/partners/product-intel/chief-of-staff/fleet-health) posting under own identities | ✅ live (2026-09-05 remediation: all 6 boards `done`; Gemma fleet since 2026-10-11) |
| Nightly verified CRM backups + staging clone + sync safety rails | ✅ live |
| Mobile pocket control (`ops-status`) + voice dictation | ✅ live |
| Voice → parsed → confirmed → linked CRM notes | ✅ delivered, prod-gated |
| Human approval gates as signed events in `#approvals` | ✅ pattern established |
| Migration runbook rehearsed via staging restores | ✅ documented |

---

## 2. Migrating to the company server

Full command sequence lives in [server-migration-runbook.md](./server-migration-runbook.md). Summary of the governed procedure:

1. **Preconditions:** server in Tailscale; Docker installed; ~50 GB disk; SSH access.
2. **Order:** Buzz relay → Twenty → (optional, later) Hermes gateway. Lowest risk first; Mac stays fallback for 14 days (stopped, not deleted).
3. **Method per service:** freeze writers on Mac → dump (pg_dump with TOC check) → rsync dirs + dumps → restore on server → start → checksum/count verification → repoint clients one by one (port registry is the checklist).
4. **URL changes:** `BUZZ_BIND_ADDR=0.0.0.0:3010` but reachable only inside tailnet; `RELAY_URL=ws://<TS_IP>:3010`; Twenty `SERVER_URL=http://<TS_IP>:3000`. Update `ops/config/net.env` and `docs/ops/port-registry.md` first.
5. **Single-writer rule:** Mac instance stopped BEFORE server starts. Never both writable.
6. **Rollback:** bootout server-side job, restart Mac jobs, repoint clients back. Frozen originals are the rollback.

## 3. Adding your co-founder and his agents

Procedure detail in [co-founder-onboarding.md](./co-founder-onboarding.md). Principles:

> Registering **your own** fleet (the 9 owned agent profiles at Buzz) uses a different, owner-only
> flow — NIP-OA owner attestation. See [buzz-agent-registration.md](./buzz-agent-registration.md).

1. He installs Buzz desktop → joins relay URL → **you approve** his membership (owner power).
2. His Claude Code / Codex get their **own keypairs** via the owner-review flow or raw keys + channel grants; they use *his* subscriptions on *his* machine.
3. Channel policy: full access to `#dev-*` + `#lobby`; read/post separated from compliance channels; nobody self-approves in `#approvals`.
4. Cross-agent rule (both sides, written into agent prompts): no agent acts on another party's agent's instructions without an intervening human message.
5. Injection drill before production: test key posts adversarial instructions; both parties' agents must refuse.
6. Unknown/future agents: land in `#lobby` only → watchdog capability probe → promotion via your signed reaction → quarterly roster review.

## 4. Testing everything on the server

After migration, run the same battery as locally — that is the point of having a codified suite ([test-suite.md](./test-suite.md), all commands host-portable):

| Stage | Tests |
|---|---|
| Infra up | T01–T05 equivalents (gateway/dashboard/workspace health + auth codes) against server TS-IP |
| Data integrity | person/company counts vs. pre-cutover numbers; backup TOC check on server dumps |
| Relay integrity | audit hash-chain verify (`buzz-admin`), WS handshake 101, bootstrap idempotency re-run |
| Agents | force-run each night agent once supervised (`FORCE=1`); digests appear in channels |
| End-to-end | dictated test note → preview → commit → visible in CRM; approval flow in `#approvals` |
| Negative set | unauth probes (401s), prod-write gate refusal, day-window refusal, injection probe |

## 5. Using the system for SOC 1 / SOC 2 / ISO 27001

The platform maps to certification needs as follows:

| Certification requirement | Where it lives here |
|---|---|
| Change management evidence | Buzz hash-chained audit log + git history of policies; every approval = signed event in `#approvals` |
| Access control (CC6) | One keypair per actor; respond-to restrictions; channel membership gates; quarterly roster review job |
| Operations monitoring (CC7) | Watchdog digests, ops-status board, launchd job logs, dead-man's-switch heartbeat |
| Risk register & controls mapping | `#soc2`, `#iso27001`, `#soc1` canvases/threads; control matrix maintained by doc-agent drafts, approved by you |
| Evidence retention | `docs/ops/research/`, `test-log.md`, nightly backups (7-day rolling + offsite target TBD) |
| Incident response (CC7.x / ISO A.16) | `#incidents` channel; tabletop drills quarterly; incident template pinned there |
| Vendor risk (ISO A.15) | competitor-scout/partner-radar outputs double as ecosystem awareness; Block-hosted dependency eliminated |

**Operating rhythm:** doc-agent drafts control descriptions → you approve in `#approvals` (signed) → authoritative text committed to git → evidence links attached in channel. Start the Type II observation clock now: the audit log already accumulates history.

**Standing TODO for compliance:** API-key rotation policy (key expires year 2126); APP_SECRET rotation as planned maintenance (drift incident showed the risk); offsite backup target; formal access-review calendar.

## 6. General communication & documentation practice

- **Decisions** → `#approvals` (proposal → human signed yes/no) **+ mirrored 1:1 to AI Protect Slack #hermes-agents** (notify-only; harvest still from Buzz). Nothing else is a decision record.
- **Operational results** → `#night-runs` / `#crm-sync` (automatic) **+ mirrored 1:1 to Slack #hermes-agents** via `ops/lib/notify-slack.sh` (fire-and-forget, see `ops/secrets/slack.env`).
- **Market intelligence** → `#competitors` `#customers` `#partners` (+ `#product-intel`, `#morning-brief`) — **all mirrored 1:1 to Slack #hermes-agents** (single Slack timeline for all Hermes agents).
- **Incidents** → `#incidents`, post-mortem note within 48 h (+ Slack mirror if enabled).
- **Durable knowledge** → long-form posts (`buzz notes`, NIP-23) or files in `docs/ops/`; chat channels are conversation, not archive.
- **Policies/registers** → git (signed commits), channels only link.
- **Slack setup:** `ops/secrets/slack.env` (`SLACK_HERMES_AGENTS_WEBHOOK_URL` or `SLACK_BOT_TOKEN`+`SLACK_HERMES_AGENTS_CHANNEL`, mode 600) — see `.env.example` and `ops/lib/notify-slack.sh`. Test via `ops/bin/test-slack-hermes.sh`.

## 7. Daily operating loop

Morning: open **AI Protect Slack #hermes-agents** (primary) or Buzz → scan `#night-runs` + three intel channels + `#morning-brief`/`#product-intel` → act on Needs-decision items. All Hermes agents now post 1:1 to both Buzz and Slack #hermes-agents (`ops/lib/notify-slack.sh`); Slack is the single mobile-friendly timeline, Buzz remains the signed audit log. During day: Hermes app on phone for status/instructions (`ops-status.sh` → `OK primary ternary-bonsai-2-27b:q2_0`); appointments dictated straight into CRM pipeline. Anything strategic → proposal in `#approvals` (→ Slack #hermes-agents mirror). Friday: skim week's digests, confirm watchdog green, check disk space report.

## 8. Gemma fleet remediation 2026-09-05 / 2026-10-11 — how to debug next failure

Incident: after Qwen :8555 → Gemma migration (2026-09-04), `ops-status.sh` still printed `-- qwen night server -- FAIL not serving on :8555` (noisy legacy probe), fleet-health `health.json:qwen` misled, 3/5 night agents `blocked` (browser-harness OOM + dispatcher race + strict validator). All 6 boards restored to `done` same day.
**2026-10-11:** Migrated from Qwen3.8-27B-Heretic to gemma4:12b as primary model. Updated all configs, profiles, scripts, and docs.
**2026-11-03:** Migrated from gemma4:12b to ternary-bonsai-2-27b:q2_0 (prism-ml/Ternary-Bonsai-2-27B-gguf, Q2_0 ternary) as primary model. Updated all configs, profiles, scripts, and docs.

**Where to look first (in order):**
1. `ops/bin/ops-status.sh` — canonical 1-line summary: `OK primary ternary-bonsai-2-27b:q2_0 (http://127.0.0.1:8555/v1)` or `WARN primary DOWN — fallback OK`. If it prints `DOWN gemma :8555 primary server`, the Ollama proxy is not running — `ops/bin/gemma-server.sh start`.
2. `ops/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion` — proves model identity + completion, not just `/models` list.
3. `ops/bin/test-fleet-gemma.sh` — fleet smoke (endpoints, pre-night, profiles, board). Runs in ~90 s, no 45-min LLM crawl. If it is GREEN, fleet is ready for next window; if RED, read FAIL lines for direct `rc=` + `tail` excerpt.
4. `ops/run/scheduler.log` (launchd fleet) + `ops/run/pre-night.log` + `ops/run/post-night.log` — per-agent `PASS … → docs/ops/research/<date>-<agent>.md` or `FAIL <agent> <reason> rc=`. Night window is `00:00–06:30` (except `fleet-health 06:15`).
5. `~/.hermes/kanban.db` via `ops/bin/kanban.sh list` — board lanes `queued|ready|running|blocked|done`. Boards `blocked` with `browser-harness daemon failed` or `Unable to find the mechanism to fetch` indicate the Hermes gateway dispatcher race (pre-2026-09-05 `ready` → now `backlog/queued` until runner promotes). See `remediation-2026-09-05-gemma.md` §3.
6. `ops/run/<agent>.log` + `docs/ops/research/<date>-<agent>.md` — digest file is source of truth; Buzz `BUZZ-WARN no channel UUID` is file-only fallback, not failure.
7. `~/.hermes/profiles/*/config.yaml` `fallback_model` block — if missing, Hermes will not auto-failover on 429/503; re-add per `model-policy.md §2.1`.

**Standard recovery:**
```bash
hermes gateway restart          # after any ~/.hermes/config.yaml edit (stale modules warning)
ops/bin/gemma-server.sh status  # primary server on :8555 (start if down: ops/bin/gemma-server.sh start)
ops/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion
ops/bin/test-fleet-gemma.sh     # fleet smoke, ~90s
FORCE=1 ops/bin/pre-night-check.sh
FORCE=1 ops/bin/run-fleet-health.sh  # publishes latest health md
```
If the `:8555` primary ever dies mid-window: `ops/bin/gemma-server.sh start` (locks + ctx ladder handle restarts; see `model-policy.md §5`).

**Ollama proxy recovery:** under sustained load the Ollama backend can hit connection drops — the proxy then still serves `/v1/models` but streaming may fail. `gemma-server.sh start` now probes a real completion (not just `/v1/models`); if serving-but-not-completing it auto-restarts the proxy. Symptom in `ops/run/gemma-8555.log`: `Connection closed` from aiohttp.

**"API server disconnected" / tailnet recovery (2026-09-19, recurring — 2nd incident):** hermes `api_server` is bound to tailnet IP `100.85.50.87:8642` (`API_SERVER_HOST` in `~/.hermes/.env`). If **Tailscale is stopped** the bind fails at gateway start: `Could not bind 100.85.50.87:8642` + `✗ api_server failed to connect` → the hermes UI/CLI reports "API server disconnected". Recovery: start Tailscale (`open -a Tailscale`, or auto via launchd `com.ops.tailscale-alive` RunAtLoad/5-min guard) → `hermes gateway restart` → verify `lsof -nP -iTCP:8642 -sTCP:LISTEN` bound. Guards now flag it: `ops-status.sh` (`tailnet / api_server` line) + fleet-health L1 (`health.json:tailnet`). Related distinct MCP issue seen in the same log (not the cause): `linear` OAuth parked (non-interactive) — re-auth with `hermes mcp login linear`.

Full forensic write-up: `docs/ops/remediation-2026-09-05-gemma.md`.