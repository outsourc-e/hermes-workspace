# Model Policy — Hermes Agents

> **Locked 2026-11-03** · Owner: A. Nahrgang
> Update 2026-11-03: fleet migrated from `gemma4:12b` to `ternary-bonsai-2-27b:q2_0` (prism-ml/Ternary-Bonsai-2-27B-gguf, Q2_0 2-bit ternary, base Qwen/Qwen3.8-27B). Imported into Ollama via `ops/config/Modelfile.ternary-bonsai`.
> Update 2026-10-18: enforcement repaired (see [`remediation-2026-10-18-cache-purge-and-fleet-enforcement.md`](remediation-2026-10-18-cache-purge-and-fleet-enforcement.md)) — `context_length: 65536` now explicit on `model`/`fallback_model`/all auxiliaries in `~/.hermes/config.yaml`; Ollama server capped via `OLLAMA_CONTEXT_LENGTH=65536` (`com.ops.ollama-context.plist`). Policy is machine-checked by `ops/tests/test-hermes-health.sh` (T06/T07/T08).
> Single source of truth: `ops/config/model.env` + Hermes profile `fallback_model` (see below).
> This doc is the durable audit record for SOC 2 / ISO 27001: which models run, where, and how fallback works.

## 1. Decision

All Hermes agents (night + day) run **locally** on one unified model:

| Role | Model | Source | Quant | Served via | Port | Profile `model.default` |
|------|-------|--------|-------|------------|------|--------------------------|
| **PRIMARY** | `ternary-bonsai-2-27b:q2_0` | `prism-ml/Ternary-Bonsai-2-27B-gguf` (Q2_0 ternary, base Qwen/Qwen3.8-27B, 7.6 GB) | `Q2_0` (ternary, 7.6 GB) | Ollama `ollama serve` on :11434, proxied via `gemma-server.sh` to :8555 | `8555` | `ternary-bonsai-2-27b:q2_0` @ `http://127.0.0.1:8555/v1` |
| **FALLBACK** | same model, same endpoint | — | — | — | `8555` | unified same-model fallback (Hermes auto-retries on 429/529/503) |

**Rules:**

1. Never switch the primary model without updating this doc + `ops/config/model.env` + all Hermes profiles + `docs/ops/port-registry.md` + `docs/ops/system-operations-manual.md` in the same commit.
2. Fallback is **only** used if primary fails (connection error, 429/529/503, or `model-check.sh --completion` fails). It is not a load balancer. Unified fallback = same endpoint, so a dead `:8555` server means the whole fleet is down — restart with `ops/bin/gemma-server.sh start` (launchd can RunAtLoad).
3. The previous Qwen fleet (`0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` @ llama.cpp `:8555`) is **retired** 2026-09-18. Keep those models/prompts for rollback only.
4. The previous Gemma fallback (`AtomicChat/atomic-chat-gemma412-IQ4_XS` @ `:1337`) is **retired** 2026-09-18.
5. **Context = 65536** everywhere (server + Hermes profiles; set in the Ollama Modelfile). **Reasoning = ON** (Ternary-Bonsai-2-27B is a thinking model — it emits a reasoning phase) — per-completion latency is higher than a plain chat model; keep request timeouts generous (Hermes `request_timeout_seconds: 900`) and do not tighten for fleet jobs. Summarization/synthesis jobs need generous `max_tokens` (≥800) so the reasoning phase cannot swallow the answer (same pitfall as gemma4).

## 2. Where the model is enforced

### 2.1 Hermes profiles (≈) — `~/.hermes/config.yaml` + `~/.hermes/profiles/*/config.yaml`

Every profile that runs an agent has an explicit `fallback_model`:

```yaml
model:
  provider: custom
  base_url: http://127.0.0.1:8555/v1
  default: ternary-bonsai-2-27b:q2_0
  context_length: 65536
providers:
  custom:
    request_timeout_seconds: 900
# Primary: ternary-bonsai-2-27b:q2_0 (Ollama @11434, proxied to :8555) — locked 2026-11-03
# Fallback: same model, same endpoint (unified fleet)
fallback_model:
  provider: custom
  model: ternary-bonsai-2-27b:q2_0
  base_url: http://127.0.0.1:8555/v1
```

The main `~/.hermes/config.yaml` also routes all **auxiliary** subsystems (vision, compression, skills_hub, approval, mcp, title_generation, tts_audio_tags, triage_specifier, kanban_decomposer, profile_describer, curator, monitor, web_extract, session_search, flush_memories) and **delegation** (subagents) to the same model/endpoint.

Profiles covered (verify with `hermes profile list`):

- `default` (and `builder`, `ops`, `sage`, `scribe` — inherit)
- `competitor-scout`, `customer-watcher`, `partner-radar`
- `product-intel`, `chief-of-staff`, `fleet-health-monitor`
- `crm-sync`, `doc-agent`, `orchestrator`, `watchdog` (gateway-routed on this host → now direct `:8555`)

Hermes itself handles automatic failover: if the primary returns 429/529/503 or the endpoint is down, Hermes retries the request against `fallback_model`. Scripts only add *pre-flight probes* for observability.

### 2.2 Shell scripts — `ops/bin/*` source `ops/config/model.env`

All night runners source the env file first:

```bash
[ -f "$OPS_DIR/config/model.env" ] && source "$OPS_DIR/config/model.env"
PRIMARY_MODEL_ID="${PRIMARY_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
PRIMARY_BASE_URL="${PRIMARY_BASE_URL:-http://127.0.0.1:8555/v1}"
FALLBACK_MODEL_ID="${FALLBACK_MODEL_ID:-ternary-bonsai-2-27b:q2_0}"
FALLBACK_BASE_URL="${FALLBACK_BASE_URL:-http://127.0.0.1:8555/v1}"
```

Scripts updated 2026-10-11:

- `ops/bin/gemma-server.sh` — starts/stops the Ollama proxy on `:8555` (now the primary server)
- `ops/bin/pre-night-check.sh` — tries primary, then fallback (same endpoint)
- `ops/bin/run-night-agent.sh`, `run-product-intel.sh`, `run-chief-of-staff.sh`, `run-fleet-health.sh` — source `model.env` + profile `fallback_model`
- `ops/bin/post-night-check.sh`, `ops-status.sh`, `test-fleet-gemma.sh` — probe the `:8555` primary

### 2.3 Env file — `ops/config/model.env`

Single line-change to switch models globally. Never hardcode model IDs or URLs elsewhere. (Known caveat: `~/.hermes/config.yaml` and profile configs hardcode the model ID — a model switch must edit both layers, see §4.)

## 3. Verification (run before every night batch or after any change)

```bash
# Primary reachable? (Ollama + proxy must be running — ops/bin/gemma-server.sh start)
ops/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion

# Hermes knows the fallback?
hermes profile show competitor-scout | grep -A3 fallback
hermes profile show product-intel   | grep -A3 fallback
hermes profile show chief-of-staff  | grep -A3 fallback
hermes profile show fleet-health-monitor | grep -A3 fallback

# Dry-run a night agent (no window check, no Buzz post)
FORCE=1 DRYRUN=0 TIMEOUT_SECS=120 ops/bin/run-night-agent.sh competitor-scout
```

Expected:

- `PASS http://127.0.0.1:8555/v1 serves ternary-bonsai-2-27b:q2_0`
- `pre-flight: primary ternary-bonsai-2-27b:q2_0 PASS` in logs
- `gemma-server.sh status` reports the server; `ps` shows Ollama + proxy running
- If the server is stopped, the next run will `WARN` and (unless `:8555` is restored) the night batch aborts — this fleet has no second backend.

## 4. How to switch the primary (governed change)

1. Ensure the model is in Ollama (`ollama list` shows the model; for a HF GGUF import use `ops/config/Modelfile.ternary-bonsai` as the template).
2. Start/verify the server: `ops/bin/gemma-server.sh start` → `model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion`.
3. Edit `ops/config/model.env` (`PRIMARY_MODEL_ID`, `PRIMARY_BASE_URL`, `PRIMARY_MODEL_HF`, plus FALLBACK_*).
4. Update every profile: `~/.hermes/config.yaml` + `~/.hermes/profiles/*/config.yaml` — primary + `fallback_model` + auxiliary + delegation.
5. Update docs: this file, `docs/ops/port-registry.md`, `docs/ops/system-operations-manual.md`.
6. Run verification above + `FORCE=1 ops/bin/pre-night-check.sh` + one real night agent.
7. Commit all changes together, note in `#approvals` if change is strategic.

## 5. Fallback requirements

- Unified fallback is the same Ollama proxy on `:8555`. No extra runtime needed.
- Former fallback `Atomic Chat` (`atomic-chat-gemma412-IQ4_XS`), former primary `Qwen3.8-27B-Heretic`, and former primary `gemma4:12b` are retired — rollback only (§6).
- Vision (`auxiliary.vision`) uses the same endpoint. Note: the current primary is text-generation only — if image inputs are needed, add a vision-capable model (e.g. the mmproj payload `prism-ml/Ternary-Bonsai-2-9B-gguf` or `gemma4:12b`) to `auxiliary.vision` explicitly.

## 6. Rollback

- Qwen-era artifacts kept: GGUF in `~/.cache/huggingface/hub/models--0bserverx--Qwen3.8-27B-Heretic...`, llama.cpp build in `~/.unsloth/llama.cpp/`, and the pre-change git history.
- Gemma fallback-era artifacts: Atomic Chat app, and the pre-change git history.
- Gemma4:12b kept in Ollama (`gemma4:12b`, 8.0 GB) after the 2026-11-03 migration — rollback only, remove after 2 weeks.
- To rollback to Qwen: restore `ops/config/model.env` from git, restore profile configs from `git diff`, relaunch llama.cpp server via `ops/bin/qwen-night.sh` (recreate from history), run verification.
- To rollback to Gemma: restore `ops/config/model.env` from git, restore profile configs from `git diff`, restart `gemma-server.sh` (still points at `gemma4:12b` in the pre-2026-11-03 history), run verification.

## 7. Audit trail

- 2026-09-04: Locked to `unsloth/gemma-4-26B-A4B-it-GGUF:Q4_K_M` (Q4_K_M) as primary via Ollama; added `AtomicChat/atomic-chat-gemma412-IQ4_XS` as fallback via Atomic Chat. Retired Qwen3.8-27B :8555. Updated 7 profiles + 5 scripts + 3 docs.
- 2026-09-18: Locked to `0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF` (Q4_K_M) as **primary + unified fallback + all auxiliary + delegation**, served via llama.cpp `llama-server` on `:8555`. Retired Gemma fleet (Ollama `:11434` + Atomic Chat `:1337`). Re-activated `ops/bin/qwen-night.sh`. Updated all 14 profiles + main config + 8 scripts + 3 docs. Tested: `model-check.sh :8555 --completion` PASS, `hermes` profile configs validate, dry-run night agent produced a digest.
- 2026-10-11: Locked to `gemma4:12b` (Q4_K_M) as **primary + unified fallback + all auxiliary + delegation**, served via Ollama on `:11434` proxied to `:8555` via `gemma-server.sh`. Retired Qwen3.8-27B fleet (llama.cpp `:8555`). Updated all profiles + main config + scripts + docs. Tested: `model-check.sh :8555 gemma4:12b --completion` PASS, `hermes` profile configs validate.
- 2026-11-03: Locked to `ternary-bonsai-2-27b:q2_0` (`prism-ml/Ternary-Bonsai-2-27B-gguf`, Q2_0 ternary of Qwen/Qwen3.8-27B) as **primary + unified fallback + all auxiliary + delegation**, served via Ollama on `:11434` proxied to `:8555` via `gemma-server.sh`. Imported with `ops/config/Modelfile.ternary-bonsai`. Retired gemma4:12b (kept in Ollama, rollback only). Updated `model.env` + 9 fleet scripts + 2 test batteries + 5 agent prompts + all profiles + main config + docs. Tested: raw completion `:11434` PASS, `model-check.sh` identity+completion, `ops-status.sh` `OK primary`, fleet smoke.
- 2026-11-03 (same-day hardening): `gemma-server.sh` proxy rewritten as a **thin passthrough to Ollama's native `/v1`** — the old hand-rolled NDJSON collector silently dropped streamed `tool_calls`/`finish_reason` (Hermes aborts rc=1; same signature seen with gemma4:12b, bug is model-independent). Passthrough streams real SSE incl. tool_call deltas. Also: `tools` forwarded verbatim; fleet model injected when the client omits it. Verified tool-loop rc=0 via profile + fleet smoke 21/21 + `test-night-services.sh` proxy checks pass. First unattended window (2026-11-04): 6/6 research agents produced digests, `health.json primary PASS`; chief-of-staff alone hit the 900 s timeout because ~21k-token prompt-eval takes ~413 s on this model → chief profile `request_timeout_seconds` 900→2700, main-config aux timeouts raised (vision/session_search/flush_memories 30→300, title_generation 120→300).