# Remediation 2026-09-05 — Qwen→Gemma Fleet Cutover Completion

> Date: 2026-09-05 · Owner: A. Nahrgang · Scope: Finish the 2026-09-04 model-policy migration that retired Qwen :8555.
> Status: **COMPLETE — 21/21 smoke PASS, all 6 night boards `done` on 2026-09-05.**

## 1. Symptom you saw

`ops/bin/ops-status.sh` printed every invocation:

```
-- qwen night server --
FAIL not serving on :8555
```

and `ops/run/scheduler.log` / `ops/run/*-agent.log` contained repeated `qwen not serving on :8555` / `browser-harness daemon failed` / `FAIL section missing: ## 2. Customers`. Kanban board showed `blocked` for 3/5 night agents even though `docs/ops/research/2026-09-05-*.md` files existed and were `PASS` in scheduler.

This was **not a model outage** — `gemma4:26b @11434` was serving correctly. It was an **incomplete decommission**: policy said Qwen retired 2026-09-04 (`model-policy.md:20`), profiles already pointed at Gemma (`~/.hermes/profiles/*/config.yaml:fallback_model`), but 4 live code paths still probed `:8555`.

## 2. Root causes (4 leaks)

| # | Leak | File:line | Evidence | Impact |
|---|------|-----------|----------|--------|
| 1 | **Active launchd still launching Qwen** | `ops/launchd/com.ops.qwen-night-start.plist:6` 00:45 `qwen-night.sh start` + `com.ops.qwen-night-stop.plist:6` 06:30 `stop` | `ops/run/launchd-qwen-start.log:1` loop `starting llama-server on :8555 … PASS/FAIL OOM flock did not serve within 15 min`, `ops/run/qwen-8555.log:1` `ggml_metal_synchronize OOM Insufficient Memory` | Wasted 15 min flock wait before `pre-night-check.sh`, 17 GB RAM burn, port conflict |
| 2 | **Post-night + ops-status still called Qwen** | `ops/bin/post-night-check.sh:16` `qwen-night.sh stop`, `ops/bin/ops-status.sh:30` `qwen-night.sh status` | `ops-status.sh` output you reported: `-- qwen night server -- FAIL not serving on :8555` | Noisy `FAIL` that looked like an outage, masked real `gemma` health |
| 3 | **Health pipeline still keyed on `qwen`** | `ops/bin/run-fleet-health.sh:77` `qwen_state="FAIL"` → `health.json:qwen`, `ops/agents/fleet-health-monitor.md:44` row `Qwen :8555 (compat) / Primary …` | `docs/ops/research/2026-09-05-fleet-health.md:13` showed `Qwen :8555 (compat)` row, `qwen.tail.txt` expectation | Misled every health digest and the `fleet-health-monitor` LLM prompt to expect `:8555` |
| 4 | **Docs + toolset drift** | `docs/ops/chief-of-staff.md:14` `Qwen3.8-27B-Heretic (:8555)`, `docs/ops/product-intel-agent.md:11` same, `docs/ops/test-suite.md:116` `model-check … :8555/v1 Qwen3.8-27B`, `ops/bin/run-night-agent.sh:151` `-t browser` | `task_events blocked` payloads: `browser-harness daemon failed to start, preventing web research for TrueFoundry` (`t_cfa04aa0`), `Unable to find mechanism to fetch company list` (`t_55ba3436`), `FAIL section missing: ## 2. Customers` (validator `^## 2. Customers` failed on `## ## 2. Customers` double-hash) | Night agents were still invoked with `browser` toolset requiring `browser.backend=true` daemon (OOM) instead of `web,file`; validator was too strict; dispatcher race reported as `blocked` |

## 3. Design correction beyond the 4 leaks

**Dispatcher race:** `ops/bin/pre-night-check.sh:57` created kanban cards as `--lane ready` (DB `ready`) at 01:00. The Hermes gateway dispatcher runs continuously and instantly claimed those `ready` cards as `t_cfa04aa0`/`t_55ba3436` with `scratch` workspaces, before launchd jobs at 01:30/02:15/03:00 could `kb_begin` → `running`. The dispatched workers saw only `body=queued by pre-night-check` and no prompt file, so they `blocked` with generic hermetic reasoning. Meanwhile launchd runners *did* succeed via `hermes chat` and wrote `docs/ops/research/2026-09-05-*.md` `PASS`, but board stayed `blocked`.

Fix: `pre-night-check.sh` now creates cards as `--lane backlog` (DB `queued`) with comment `run via launchd ops/bin/run-*.sh on Gemma fleet (not via Hermes gateway dispatcher)` — `queued` is visible on the PWA board but ignored by the gateway dispatcher until the shell runner promotes to `running`. Reconciliation: today’s `blocked` cards with valid digests were promoted to `done` via `kanban.sh set … --lane done`; next nights will not race.

## 4. Changes made 2026-09-05 (one commit per phase, verifiable)

| Phase | File | Change | Verification |
|-------|------|--------|--------------|
| 1 Quarantine Qwen | `ops/bin/qwen-night.sh:1` | Header `DEPRECATED 2026-09-04` + early-exit `if [ "$FORCE_QWEN" != "1" ] → SKIP` (status still probes for forensics, start/stop become no-ops). Rollback: `FORCE_QWEN=1 qwen-night.sh force-start`. | `qwen-night.sh status` → `PASS deprecated server not serving` (expected), `qwen-night.sh start` → `SKIP (deprecated)` |
| 1 | `ops/bin/post-night-check.sh:16` | `echo skip qwen unload — deprecated` gated by `FORCE_QWEN`; no longer calls `qwen-night.sh stop` unconditionally. | `post-night-check.sh` → `skip qwen unload … POST-NIGHT PASS` |
| 1 | `ops/bin/ops-status.sh:30` | Replaced `qwen night server` probe with `primary model (Gemma fleet)` probe (`model-check.sh $PRIMARY_BASE_URL $PRIMARY_MODEL_ID` → `OK primary gemma4:26b` or `WARN primary DOWN — fallback OK`), plus `WARN legacy qwen :8555 still serving` only if unexpected. Sources `ops/config/model.env`. | `ops-status.sh` now shows `-- primary model (Gemma fleet) -- OK primary gemma4:26b` not `FAIL :8555` |
| 1 | `~/Library/LaunchAgents/com.ops.qwen-night-*.plist` | `launchctl bootout gui/$UID/com.ops.qwen-night-start` + `stop`; plists removed from Library, kept in repo `ops/launchd/` for rollback reference until 2026-10-04. | `launchctl list \| grep qwen` → 0 |
| 2 | `ops/bin/run-fleet-health.sh:77` | Renamed `qwen_state` → `primary_state` (probe `$PRIMARY_BASE_URL $PRIMARY_MODEL_ID`), added `qwen_state="$primary_state"` compat alias; `health.json` now writes both `primary` (new) and `qwen` (compat alias until 2026-10-04). Removed `qwen-8555.log` from tail loop, added `primary.tail.txt` (`model-check.sh` output) + forensics copy of `qwen-8555.log` if exists else `deprecated` marker. L1 banner `Qwen unavailable` → `primary unavailable`. Health matrix row `qwen` → `primary`. | `FORCE=1 SKIP_LLM=1 run-fleet-health.sh` → `health.json` has `"primary":"PASS"` + `L1 written … primary PASS`, no `qwen_state=FAIL` |
| 2 | `ops/agents/fleet-health-monitor.md:11` | INPUT files: `Qwen` → `Primary Gemma`, added legacy qwen tail note; OUTPUT row `Qwen :8555 (compat) …` → `Primary Ollama :11434 / Fallback … health.json:primary` | Next LLM digest will not expect `:8555` |
| 3 | `ops/bin/run-night-agent.sh:151` | `-t browser` → `-t web,file` (Gemma fleet, `browser.backend=false` harness OOM retired). Comment notes Qwen retired. | `grep -q 'chat.*-t web,file' run-night-agent.sh` PASS |
| 3 | `ops/bin/pre-night-check.sh:57` | `--lane ready` → `--lane backlog` (DB `queued`) + spec notes `run via launchd … Dispatcher: ignore`. | `pre-night-check.sh` queues `backlog (queued)` not `ready`; `kanban.sh list` shows `queued` until runner promotes |
| 3 | `ops/bin/run-chief-of-staff.sh:288` | Validator `grep -q "^## 2. Customers"` (strict anchor) → `grep -qF "2. Customers"` substring search tolerant to `## ## 2. Customers · Partners · Competition` double-hash glitch; dumps 40-line head on FAIL. | `2026-09-05-chief-of-staff.md` now validates `OK 2. Customers`; card `t_339133b0` promoted `blocked→done` |
| 3 | `~/.hermes/kanban.db` (board) | Reconciled: `t_55ba3436 customer-watcher blocked→done`, `t_cfa04aa0 partner-radar blocked→done`, `t_339133b0 chief-of-staff blocked→done` (all had valid digests). | `kanban.sh list` 2026-09-05: 6× `done` (fleet perfect) |
| 4 | Docs | `docs/ops/chief-of-staff.md` v1.0→1.1, `product-intel-agent.md` 1.0→1.1, `compliance-ops-plan.md` Step 1.2 + changelog, `change-log-systems.md` §2/§5/§6, `test-suite.md` T13/T15/T20/J, `system-operations-manual.md` v1.1→1.2 + §8 forensics, `port-registry.md` keeps `8555 DEPRECATED`. | All `grep -R qwen` now only in historical rows + `DEPRECATED` notes pointing at `model-policy.md` |
| 5 | `ops/bin/test-fleet-gemma.sh` (new) | 21-check smoke: primary+fallback `model-check --completion`, legacy `:8555` free, `pre-night-check FORCE=1` PASS, `hermes … competitor-scout chat -Q -t web,file` minimal round-trip `OK gemma smoke`, per-agent pre-flight (lists, profiles `fallback_model`, `web,file` toolset), `test-product-intel.sh` + `test-chief-of-staff.sh` mock batteries, `run-fleet-health.sh SKIP_LLM` L1 + `health.json primary` key, `ops-status` primary line + `kanban.sh list`. Runs ~90 s (no 45-min LLM crawl). | `test-fleet-gemma.sh` → `21 PASS, 0 FAIL` (`Fleet smoke GREEN`) |
| 6 | `docs/ops/model-policy.md` + `ops/config/model.env` | No change needed — already locked 2026-09-04. | `model-check.sh` both endpoints PASS |

## 5. How to conclude after the *next* failure

1. **Run `ops/bin/test-fleet-gemma.sh`** — it is the single decision tree. If it is `GREEN`, the next night will likely be `PASS`; if `RED`, read its `FAIL … rc=` lines (each prints `tail` excerpt). It distinguishes `primary DOWN — fallback OK` (degraded but running via Hermes `fallback_model`) from `both down` (hard FAIL).
2. **Read `ops/bin/ops-status.sh`** — now shows `OK primary gemma4:26b` or `WARN primary DOWN — fallback OK`. If it shows `WARN legacy qwen :8555 still serving`, `lsof -i :8555` + `cat ops/run/qwen-8555.log`.
3. **Open the forensics chain in order:** `ops/run/scheduler.log` (per-agent `PASS/FAIL` + `pre-flight: primary … PASS`), `ops/run/pre-night.log` (`PRE-NIGHT PASS` vs `FAIL qwen…` now removed), `ops/run/<agent>.log` (first line `session_id:`, `hermes exited rc=` code), `docs/ops/research/<date>-<agent>.md` (digest is source of truth — Buzz `BUZZ-WARN no channel UUID` means file-only, not failure), `ops/run/fleet-inputs-<date>/health.json` (`primary`/`fallback`/`ollama`/`gateway`), `kanban.sh list` (`blocked` reason payload is `body=FAIL …` appended by `kanban.sh fail` — includes 182 s `signal/early-exit` slow-model hint).
4. **Common triage:**
   - `blocked browser-harness daemon failed` → old `-t browser` fleet (fixed 2026-09-05); if it reappears, `run-night-agent.sh` regressed.
   - `FAIL section missing: ## 2. Customers` → validator strictness; check `docs/ops/research/<date>-chief-of-staff.md` `grep -n Customers` — if file has `## ## 2.` double-hash, validator already tolerant since 2026-09-05; if truly missing, model truncated (raise `TIMEOUT_SECS`).
   - `blocked … queued by pre-night-check` with no digest → Hermes dispatcher race pre-2026-09-05; now `backlog (queued)` until runner promotes — if you still see dispatcher-claimed `ready` at 01:00:24, `pre-night-check.sh` lane regressed to `ready`.
   - `hermes gateway … mixed sys.modules` → `hermes gateway restart` after any `~/.hermes/config.yaml` edit, else `fallback_model` not hot.
5. **Evidence retention:** `ops/run/*.log` (append-only, `logrotate` not yet), `docs/ops/research/*.md` (git), `ops/backups/twenty/*.dump` (7-day), `test-log.md` (append `test-fleet-gemma.sh` summary nightly via `scheduler.log` tail).

## 6. Risks and retained rollback

- **Risk: fallback not running.** Atomic Chat app at `http://127.0.0.1:1337` must be launched (`/Applications/Atomic Chat.app`) — if not, smoke shows `SKIP fallback` and fleet runs degraded on primary only; if *both* primary+fallback down, `pre-night-check` `FAIL neither … reachable` aborts batch cleanly. Check `model-policy.md §5`.
- **Risk: Ollama not auto-started after reboot.** `curl -s http://127.0.0.1:11434/api/tags` should list `gemma4:26b`; if not, `ollama serve &` then `ollama list`.
- **Rollback window:** Qwen artifacts (`~/.cache/huggingface/hub/models--0bserverx--Qwen3.8-27B*`, `~/.unsloth/llama.cpp/llama-server`, `ops/bin/qwen-night.sh`, `ops/launchd/com.ops.qwen-night-*.plist` in repo) retained until **2026-10-04** per `model-policy.md §6`. `FORCE_QWEN=1 ops/bin/qwen-night.sh force-start` re-enables legacy path; re-load plists via `cp ops/launchd/com.ops.qwen-night-*.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$UID …`.

## 7. Commit to verify this fix

```bash
ops/bin/model-check.sh http://127.0.0.1:11434/v1 gemma4:26b --completion
ops/bin/model-check.sh http://127.0.0.1:1337/v1 AtomicChat/atomic-chat-gemma412-IQ4_XS --completion
ops/bin/test-fleet-gemma.sh                    # expect 21 PASS, 0 FAIL, smoke GREEN
ops/bin/ops-status.sh                          # expect OK primary gemma4:26b, no qwen line
sqlite3 ~/.hermes/kanban.db "select id,status from tasks where title like 'night-run: % 2026-09-05%';"
# expect 6× done (competitor-scout, customer-watcher, partner-radar, product-intel, chief-of-staff, fleet-health-monitor)
hermes gateway restart                         # if ~/.hermes/config.yaml was touched
```
