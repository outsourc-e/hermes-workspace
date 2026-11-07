# Remediation — Cron Integrity (2026-11-04/05)

Scope: restore trust in the Hermes cron/kanban automation layer after the read-only
investigation of 2026-11-04 (~10.4M tokens burnt since Aug with ~0% real research
output in October; 68%/49%/57% failure ratios on three daily LLM cron jobs).
Approved plan: A1–A5 cron integrity now, kanban gating (B1–B4) on top of the A1
health signal. This doc covers A1/A2 implementation + the 2026-11-05 outage found
during acceptance testing.

Backups: `ops/run/cron-integrity-2026-11-04/{jobs.json.bak, scripts/}`.

---

## 1. Root causes (layered — each masked the next)

| # | Layer | Defect | Effect |
|---|---|---|---|
| R1 | Interpreter | Cron env `PATH` resolves bare `python3` to Xcode Python (no `requests`/`bs4`); scripts used bare shebangs or `python3` | Vacuums died 2026-09-28 with `ModuleNotFoundError`; `/usr/local/bin/python3` + miniconda have the deps |
| R2 | Data source | DDG `html` + `lite` endpoints answer **202** (bot-block) to scripted requests (verified 2026-11-04); Bing alternates localized junk with a consent wall | Even with R1 fixed, vacuums wrote `Error fetching … 202` files and called it a day |
| R3 | Write-path | Daily `Shadow AI Update` prompt asked the LLM to *append to the Obsidian note itself* — instead of writing tools it degrades to printing unreachable pseudo-code | Note untouched since ~2026-09-07; "successful" runs every day |
| R4 | Path drift | Gatherer wrote `/tmp/shadow_ai_raw.md`, synth + prompts read `.txt` | silent empty input to the report job |
| R5 | Model pin | `Topic news digest` job pinned retired `gemma4:12b` | breaks when pruned |
| R6 | Persistence | The `:8555` fleet-proxy had **no supervision** (no launchd KeepAlive); it died 2026-11-04 12:27 right after the unattended window | Every cron agent run since hung `waiting for model response (763s)` then failed — including the batch on the morning of 2026-11-05 |
| R7 | Capacity | Ollama serves `num_parallel` = 1 lane; agent runs from cron, night agents and interactive sessions all queue on it | head-of-line blocking amplifies R6 into multi-minute waits; single 30-min completion delayed everything behind it |

## 2. Fixes (file-level)

### Interpreter + wrapper pins (R1)
`~/.hermes/scripts/`: `vacuum_ai_protect.sh`, `vacuum_kritis_south.sh`,
`shadow_ai_vacuum.sh`, `shadow_ai_gatherer.sh`, `lusha_inbox_sync.sh` — all
`export PATH=/usr/local/bin:/usr/bin:/bin` + `exec /usr/local/bin/python3 …`.
Verified with `env -i HOME=~ PATH=/usr/bin:/bin` (launchd-like stripped env), rc=0.
Pinned shebang + hardened top-of-file docstrings in `shadow_ai_gatherer.py`.

### Data source: Google News RSS (R2)
`generic_vacuum.py` + `shadow_ai_vacuum.py` now use
`https://news.google.com/rss/search` (deterministic XML, bot-tolerant, carries
titles/links/dates). Locale parameterized: `hl=de-AT, gl=AT, ceid=AT:de` for the
KRITIS South branch — the US-locale feed returns 0 items for German queries.
Verified real output: AI-Protect 56 lines, KRITIS-South 77 lines, with dates.
DDG/Bing intentionally removed (no dead paths kept in write-path scripts).

### Deterministic write-path (R3/R4)
`shadow_ai_gatherer.py` appends raw hits to
`~/Documents/Obsidian Vault/Shadow AI Research.md` itself (`## Gatherer — YYYY-MM-DD`
sections; only when hits found; non-fatal on failure). The daily LLM job
`2424666b22a9` is now **report-only** (reads `/tmp/shadow_ai_raw.txt`, ≤5 bullets,
`[SILENT]` contract). Same pattern for Lusha: real work is pre-step script
`lusha_inbox_sync.sh` (pinned wrapper around `~/twenty/lusha_inbox_watcher.py`);
job `6de6ca2e7086` is report-only over `~/twenty/sync_lusha.log`.
`OUTPUT_FILE` aligned to `/tmp/shadow_ai_raw.txt` (R4). `synth.py` `.md`→`.txt`
raw fix; summarizer no longer hardcodes `gemma4:31b` — reads
`PRIMARY_MODEL_ID` from `ops/config/model.env` (R5 adjacent).

### jobs.json rewires (live as of 2026-11-04 ~11:45)
- `6de6ca2e7086` Lusha-Twenty Inbox Sync → `script: lusha_inbox_sync.sh` + report-only prompt
- `2424666b22a9` Shadow AI Update → `script: shadow_ai_gatherer.sh` + report-only prompt
- `f3221063fb96` Shadow AI Vacuum (Step 1) → `script: shadow_ai_vacuum.sh`
- `ce7963e57fad` Topic news digest → `model: null` (un-pin)
- `2424666b22a9`/`6de6ca2e7086` → `skills: []` (2026-11-05): `web_search` was unresolvable
  (injected a skip-warning every run); `obsidian` injected its write-file instructions into
  jobs that must not write (LLMs are not the write-path).

### A1 health evaluator (acceptance signal)
`ops/bin/cron-health.sh` → `ops/run/cron-health/last-24h-health.json`.
Per-job verdict from signals that cannot lie: artifact mtime freshness
(schedule-derived thresholds), executions.db runs/failed/stalled (running >2h),
open `cron_incidents` state=detected. Exit 1 on any FAIL. Wired into
`ops/tests/test-hermes-health.sh` **T10** (replaced the failed-run-count
WARN-shrug; T10 detail row prints WARN jobs). Findings on first light:
East/West/Master distiller reports **never existed** (241 "ok" runs, zero
artifacts), Shadow AI Report stale 2611 h, both vacuums' 24h failures counted.

### Proxy supervision (R6) — 2026-11-05
- `ops/bin/fleet_proxy.py` extracted from `/tmp` (which was also non-reproducible
  across reboots); `gemma-server.sh` now runs that copy.
- New `launchd` plist `com.hermes.fleet-proxy` (RunAtLoad, KeepAlive, throttle 30 s,
  `/usr/local/bin/python3`, logs to `ops/run/gemma-8555.log`). KeepAlive verified:
  kill → respawn in ~35 s → serving.
- Rotated runaway 349 MB log → `gemma-8555.log.349MB-20261105-rotated`
  (cause: the unsupervised proxy logging full error tracebacks in a loop).
- Ollama itself is supervised by its app agent (verified by self-respawn).

## 3. Known collisions / follow-ups (not fixed here, tracked)
1. **Shared raw file**: daily gatherer `2424666b22a9` and weekly vacuum
   `f3221063fb96` both write `/tmp/shadow_ai_raw.txt` (weekly overwrite vs daily
   overwrite). Distiller `efa73ce56936` reads whichever landed last.
   → separate weekly raw file in B-phase.
2. **East/West/Master distillers produce nothing**: no vacuum writes
   `/tmp/kritis_{east,west}_raw.txt` or `/tmp/kritis_master_raw.txt` on any
   schedule → `synth.py run_for()` returns early. 241 historical "ok" runs = false
   fleet positives. → decide: create the missing vacuum jobs or retire the jobs.
3. **Single decode lane (R7)** — RESOLVED 2026-11-06, with a measured detour:
   OLLAMA_NUM_PARALLEL=3 was set on the serve (`ops/bin/ollama-env-apply.sh` +
   `com.ops.ollama-env.plist`, Aqua-launchd env, app restart drill) — but
   ollama 0.40.14 logs `model architecture does not currently support parallel
   requests architecture=qwen35` → `n_slots = 1` for ternary-bonsai-2-27b. The
   env agent stays loaded (zero cost, instant benefit for future
   parallel-capable archs); the actual capacity fix is **dual upstream lanes +
   proxy fan-out**: second supervised serve instance :21434
   (`com.ops.ollama-2`, KeepAlive, shared read-only model store) and
   `fleet_proxy.py` now picks the least-in-flight healthy lane per request
   (non-stream retry across lanes on pre-response failure). Measured: lane2
   cold-load + 3 concurrent completions wall 118.6 s/60.4 s warm at 300-tok
   reasoning replies (single baseline 13.0 s NOWAIT); lane2's own log shows it
   serving (task 84, 6.48 s); failover drill: killing :21434 → request
   completed via lane1 → KeepAlive restored the lane. Interactive/`ollama run`
   clients on :11434 are untouched — the desktop app keeps its lane.
4. **Shadow AI gatherer sensitivity**: HN RSS front-page keyword matching found
   0 hits both test days (2026-11-04/05) — the deterministic layer is correct but
   nearly blind. Add sources (HN Algolia search API verified live: 243 hits for
   "shadow AI") in B-phase if daily signal is wanted.

---

---

## 6. B2 — funnel backfill, collision fix, gatherer source, debt triage (2026-11-05/06)

**Decision (user-approved direction "proceed with B2" after the B1 gate):**
a) **East/West/Master resurrected by backfill** (not retire) — the regional
KRITIS intelligence is useful and the missing half is mechanical: no vacuum ever
wrote `/tmp/kritis_{east,west}_raw.txt` / `kritis_master_raw.txt`.
- `generic_vacuum.py`: new `KRITIS-EAST` (Wien/NÖ), `KRITIS-WEST` (Tirol/Sbg/OÖ)
  query sets, `de-AT` locale; new `KRITIS-MASTER` mode = own queries +
  deterministic aggregation of the freshest SOUTH/EAST/WEST raws.
- New pinned wrappers in `~/.hermes/scripts/`: `kritis_east_pipeline.sh`,
  `kritis_west_pipeline.sh`, `kritis_master_pipeline.sh`
  (vacuum → `synth.py <target>` single-exec), `shadow_ai_weekly_distill.sh`.
- jobs.json: the three distiller jobs (`79442a28f4c1`, `097216ccdf9f`,
  `979a3af62036`) now run the pipelines; `efa73ce56936` runs the weekly
  distiller. Warm-up fires on 2026-11-05 produced first real report files
  (evidence below). Acceptance: cron-health should show the three FAILs retired;
  if a raw is missing (e.g., South unrestored at master time) the aggregator
  records it explicitly instead of silently skipping.

b) **Raw-file collision removed** — weekly Shadow vacuum (`f3221063fb96`) now
writes `/tmp/shadow_ai_weekly_raw.txt`; `synth.py` gained the `shadow_ai_weekly`
target (report stays `Shadow AI Report.md`); the daily gatherer keeps the daily
raw. cron-health artifact map updated.

c) **Gatherer un-blinded** — `shadow_ai_gatherer.py` gained the HN Algolia
`search_by_date` source (last 24 h, 4 shadow/sovereign/local-LLM queries,
deduped alongside the HN RSS keyword path). First run: 3 real hits appended to
the Obsidian note (first deterministic append since ~2026-09-07).

d) **Card debt triaged (188 cards)** — `ops/bin/kanban-triage.sh` (dry-run by
default, `--execute` applies): ready/queued cards older than `--days` (14)
created by automated producers → `blocked` with the explicit reason
"auto-triage … superseded by B1 gate + B2 triage". Completion semantics
reserved for real work, never auto-done. Board backup:
`ops/run/b2-2026-11-05/kanban.db.pre-b2`.

**Reversion incident + root cause (2026-11-06 00:0x):** the first execution
(23:35) used `kanban.sh fail` — a RAW-SQL `status='blocked'` write that appends
no `blocked` event to `task_events`. Within 30 s the hermes gateway's
`recompute_ready()` sweep auto-promoted ALL 188 cards back to `ready`
(188 bare `promoted` events, 23:36:04) — `kanban_db._has_sticky_block`
documents the case verbatim: "a task with no such event at all (direct DB
edit) auto-recovers". Fix: `kanban-triage.sh` v2 blocks via the kernel
(`hermes kanban block <id> --kind needs_input`), whose `blocked` event is
STICKY — only an explicit `kanban unblock` exits it. Re-executed triage
(192 candidates by then, night fleet had produced 4 more): Final state
`ready 62 + queued 5 (fresh night-run cards), blocked 243, done 108,
running 1`, verified unchanged across multiple dispatcher sweeps with zero
subsequent auto-promotions.

Fresh backups for all touched files: `ops/run/b2-2026-11-05/`.

`ops/bin/cron-gate.sh` — deterministic gate consulted before every card claim.
Fail-closed semantics: closes on a missing/stale (>90 min)/corrupt A1 snapshot
(fresh signal is a precondition), on stalled executions (>2 h), on scheduler
misses (cadence ≤24 h job with 0 runs), and on failed runs that *broke the
pipeline's output* (artifact exists-but-stale, or delivery-only job). Chronic
artifact debt (the never-written East/West/Master reports) FAILs cron-health but
does NOT close the gate — otherwise a 6-month-old phantom would freeze every
future night run until B2 resolves it.

Snapshot freshness is maintained by new launchd poller
`com.ops.cron-health.plist` (StartInterval 1800, pinned PATH, log
`ops/run/cron-health-launchd.log`).

Runner wiring:
- `run-night-agent.sh` — gate consult after window/lock checks, before model
  pre-flight: closed → `exit 4` with reason, no card claim, no token burn.
  `FORCE=1` (supervised re-run) bypasses; `NOW_HOUR` env override added as
  hermetic test hook for the 00–06 window (test-cron-gate.sh only). Also added
  the `RESEARCH_DIR` env override (same pattern as run-product-intel) to keep
  test bypass runs from writing into the real research dir.
- `run-product-intel.sh` — same gate after the cadence decision; `DRYRUN=1` skips
  it so its existing hermetic battery stays unaffected.
- `run-chief-of-staff.sh` intentionally ungated — oversight must keep running,
  and reporting on a broken fleet is its job.

Battery: `ops/tests/test-cron-gate.sh` G01–G12 (verdict logic over
`fixtures/cron-gate/*.json` + runner wiring against a temp kanban DB, mock
hermes, temp research dir; 12/12, ~1.5 s). Added to `ops/tests/run-all.sh`.

Exit codes: runner rc=4 = gate closed (new documented code); cron-gate rc
0 = open / 1 = closed. Current live state: gate closed (today's outage
failures — Topic digest delivery-only ×2 — still inside the 24 h window; ages
out ~12:25 2026-11-06; chronics correctly not gating).

## 4. Acceptance evidence (2026-11-04/05)
- `env -i PATH=/usr/bin:/bin` launches of all 5 wrappers rc=0.
- Google News vacuums: real dated items for both locales (56/77 lines).
- Hermetic fake-HOME test of the Obsidian appender (no real-note writes).
- Proxy: `/v1/models` identity OK, chat completion "OK" via :8555, KeepAlive
  respawn drill PASS.
- Cron forced runs on new config: pre-step script executed (lusha log appended
  11:58:40 2026-11-04; gatherer rewrote raw 12:25 2026-11-05) — agent-half
  failures that morning were R6 (proxy down), retried post-fix — see test-log.
- **E2E validated 2026-11-05 22:40 post-proxy-fix**: `6de6ca2e7086` forced run
  (`source=direct`) — wrapper executed as pre-step (watcher log line injected
  into context), LLM responded exactly `[SILENT]` (inbox empty), delivered as
  `succeeded`, output file `2026-11-05_22-44-41.md` shows prompt/report contract
  holding. The 12:25 same-day failures (`waiting for model response (763s)`,
  `Script timed out after 3600s`, `1047.5s` on Topic digest) are R6-window
  failures; they stay visible in the 24h WARN window until age-out — by design.
- `cron-health.sh` reading post-fix: `4 fail (3 reports that never existed +
  weekly Shadow distiller stale 2645.8h) / 7 warn (outage-window failures) /
  1 ok` — the FAILs are the true remaining defect list (follow-ups §3.2/§3.4).

## 7. B3 — buzz-kanban-sync repaired, not retired (2026-11-06)

**Symptom:** `com.ops.buzz-kanban-sync` exit 2 since 2026-09-03; 1169 consecutive
"FAIL relay unreachable / orchestrator not authenticated" lines in `sync.log`
(rotated to `ops/run/sync.log.pre-b3`).

**Two stacked one-line root causes (each masked the other):**
1. `BUZZ_RELAY_URL` default was `ws://localhost:3010`; the CLI requires an
   http(s) base URL → every call returned `relay error 404` even though the
   Rust relay (`buzz-rela` :3010) was healthy the whole time and answered other
   pubkeys with 200. Note: `http://127.0.0.1` returns an empty channel list,
   `http://localhost` works — hostname must stay `localhost`.
2. With the URL fixed, the launchd agent STILL failed: the script called bare
   `buzz`, which lives in `~/.local/bin` — not on launchd's PATH, so the
   "unreachable" check was actually command-not-found under the agent
   (interactive shells always had it, which is how it ever passed).

**Fix:** both lines in `ops/bin/buzz-kanban-sync.sh` (`http://localhost:3010`
default + `PATH` export with `~/.local/bin`, commented).

**Cold-start catch-up (one-time, deterministic):** the sync state file predates
the B2 board work, so a live run would have batch-posted ~190 "lane changed"
one-liners to agent channels. Primed `ops/run/buzz-kanban-sync.json` with the
current 420 lanes and fast-forwarded `last_sweep` — no stale Sep–Nov owner
approval backlog gets replayed in one batch; fresh owner verdicts process live.

**Acceptance:** DRYRUN sweep OK; live run silent (`applied=0, tracked_cards=420`);
existing battery `ops/bin/test-buzz-kanban.sh` 20/20 PASS (hermetic mock, incl.
TS03 non-owner-reactions-refused and TS07 dead-relay handling); launchd
`kickstart` → `LastExitStatus = 0`, fresh `sync.log`. Agent is back on its
15-min cadence.

## 8. B4 — day-time consumption rule (2026-11-06)

**The debt mechanism found:** the nightly research runners adopt ONLY their own
`night-run: $AGENT <today>` card. A night run that fails (outage, wedged model,
gate closed) leaves its card `ready`, the gateway's `recompute_ready()` sweep
auto-recovers below-breaker failures back to `ready`, and the next night's
runner creates a fresh card — the orphan is never consumed again. This is
exactly how the 62 ready cards of Oct 24–Nov 5 piled up (66 `signal/early-exit`
events in 14 d, zero done research cards in 14 d).

**Rule (consumption, not retirement):** once a day inside the day window,
`ops/bin/run-day-catchup.sh` walks the three research agents and runs
`run-night-agent.sh <agent> CATCHUP=1`:
- window 09–17 (`NOW_HOUR` hermetic hook kept; night window untouched),
- adopts the OLDEST ready `night-run:` card that is NOT today's title —
  through the identical chain: B1 gate fail-closed, lock, pre-flight, model,
  digest check, Buzz post,
- nothing stale to adopt → quiet exit BEFORE model spend,
- quota = 1 card/agent/day → backlog drains ≈1/day, neither floods channels
  nor monopolizes the single model lane.
Night-run cards hence are no longer one-shot: a failed night is repaired the
next day, not in 14 days by triage (and chief-of-staff/product-intel keep
their own cadences).

**Two precondition bugs fixed in `run-night-agent.sh` while wiring it:**
1. EXIT/ERR/TERM trap ran `kb_fail` on EVERY exit including success — a done
   card would be re-blocked (then auto-recovered) by every clean run. Now
   `ALL_CLEAN=1` is set only by `kb_done`; the trap fails the card only on
   non-clean exits.
2. The 90-min stale-lock cleanup was UNREACHABLE (placed after the `[ -e
   "$LOCK" ] && exit 8` short-circuit) — a kill -9'd run jammed the agent
   until a manual cleanup (hit live when launchd fired the catch-up at load).
   Reordered: stale (>90 min) lock removed first, then the busy-check.

**Runner/test isolation:** runner gained `RUN_DIR_OVERRIDE` (locks/logs/prompts
go to the given dir) — the gate battery had been leaking/reading the LIVE
`ops/run` lock dir; a killed battery case jammed the real agent and vice versa
(`RUN_DIR_OVERRIDE/tmp` used by all battery cases, pattern matches the earlier
`RESEARCH_DIR` fix).

**Battery:** `test-cron-gate.sh` extended G13–G15 (night-window refusal, oldest
stale card adopted+completed through an open gate with newer stale cards held
ready, quiet no-op with zero claims) — 15/15 PASS. Fixture-time-rot fix: all
fixtures are re-stamped (`summary.generated_at`=now) into a temp dir per run,
except `closed-stale-snapshot.json` which IS the staleness case — the battery
rocks on any day now. Temp task schema mirrors the live table (the missing
`last_heartbeat_at` made `kanban.sh list/get` fail silently hermetically).

**Launchd:** `com.ops.day-catchup.plist` (`ops/launchd/` + loaded) fires daily
12:10, logs `ops/run/day-catchup.log`. Live validation 11:17: gate-closed skip
rc=4 (Topic digest acute inside its 24 h window — ages out ~12:25), full
claim→complete cycle covered hermetically by G14. Backups `ops/run/b4-2026-11-06/`.

## 9. B5 — R7 (dual-lane decode) + scheduled triage + product-intel catch-up (2026-11-06 PM)

Approved two-part plan; Part 1 (R7) is documented inline in §3 item 3
(collects: OLLAMA_NUM_PARALLEL env agent; qwen35 arch refuses parallel slots →
second supervised upstream :21434 + least-in-flight dual-lane fleet_proxy with
failover; interactive :11434 untouched; KeepAlive on both lanes per the R6
lesson). Part 2:

**Scheduled backlog hygiene (`com.ops.kanban-triage.plist`, loaded):** daily
06:50 runs `ops/bin/kanban-triage.sh --days 14 --execute` (log
`ops/run/kanban-triage.log`). Verified live same-day: 0 stale / 67 kept — the
oldest automated ready card is Oct-24 (13 d), so the first effective park fires
tomorrow 06:50. Sticky kernel blocks (`needs_input`) keep parked cards parked
(§6d: immune to `recompute_ready()` auto-recovery). This is the safety net for
cards nothing consumes — e.g. every chief-of-staff stale card.

**Product-intel joins the day catch-up.** `run-product-intel.sh` ports the B4
pattern verbatim: `CATCHUP=1` window 09–17 (night window untouched), newest→
oldest adoption of its own stale `night-run: product-intel <date>` ready cards
via the same awk one-shot, `ALL_CLEAN` trap fix, stale-lock cleanup reordered
before exit-8, quiet no-op before any model spend. LIGHT/DEEP chain unchanged;
cadence state (`product-intel-state.json`) is NOT touched by catch-up runs —
the nightly 03:00 schedule keeps its own rhythm (asserted by G17: pre-seeded
`last_light` survives a full catch-up cycle). `run-day-catchup.sh` default
sweep now walks all four agents (`competitor-scout customer-watcher
partner-radar product-intel`). First live 4-agent sweep: tomorrow 12:10
(today's 11:13 fire predates the port). Battery: G16–G18 in
`test-cron-gate.sh` (night-hour refusal, oldest card adopted + completed with
cadence state asserted untouched, quiet no-op) — 18/18 PASS.

**Chief-of-staff deliberately NOT backfilled:** its brief is dated and
bespoke (`run-chief-of-staff.sh`, 05:15); back-dating stale briefs has no
consumption value, so its stale cards park via the scheduled triage at day 14
instead of a catch-up runner.

**Battery-battery hermeticity repair (found by `run-all.sh`):** B3's
`buzz-kanban-sync.sh` hardened PATH with an unconditional
`~/.local/bin` prepend — under `test-buzz-kanban.sh` that shadows the mock
`buzz` shim with the real CLI, silently no-oping every TS sync case
(TS01/02/05 no-mutation, TS05 sent=0; the live daemon was fine). The engine now
prepends only when `buzz` is not already resolvable — TS battery back to
20/20, launchd behavior unchanged.

**Schedule-layer drift repaired (`test-ops-schedules.sh`):** the repo copy of
`com.ops.hermes-workspace.plist` still described the retired `pnpm dev`
launcher — synced from the installed production plist (`start-stable.sh`,
2026-11-02). Stale `com.hermes.workspace` (dots label, dead launcher script,
LastExitStatus 32512, owns nothing — port 3001 is the production agent's)
booted out and removed. `OS07` checker made token-aware: inline `-c` command
strings are `.sh`-suffixed but are not paths — it now tests the trailing
script token. `run-all.sh`: 10/10 suites PASS (first time post-migration).

Backups `ops/run/b5-2026-11-06/`.
**Gate-window correction (12:30 check):** earlier notes put the Topic news
digest acute aging-out at ~12:25 — wrong timestamp. `jobs.json` shows the
failure was last night's 21:00 fire, interrupted at **2026-11-05 21:20:16**
(model response timeout, 1047.5 s — plausibly exactly the single-decode-lane
head-of-line case R7 closes). The 24 h acute window therefore ends **21:20
today**, gated skips (rc=4) at 11:13 and 12:10 were correct by design, and the
gate reopens either at 21:20 or — hopefully, on the now-dual-lane upstream —
by a successful 21:00 run before the window even matters. Risk to watch: if
tonight's 21:00 digest fails again, a fresh acute lands close enough to
midnight to close tonight's 00–06 window again (delivery-only job; watch
`ops/run/*.log`).
