# Fixing cron jobs and kanban locally — 2026-11-04 → 2026-11-06 (full post-mortem + dev hand-off)

> **Audience:** the next developer or LLM agent that touches this workspace.
> Read this top-to-bottom before editing anything in `ops/`. Every claim below
> is backed by evidence in `docs/ops/test-log.md` (append-only), the master
> remediation doc `docs/ops/remediation-2026-11-04-cron-integrity.md`, and the
> batteries under `ops/tests/` and `ops/bin/test-*.sh`.
>
> **One rule above all others:** LLMs are never the write-path. Deterministic
> scripts own every artifact (kanban board moves, digests, reports, state
> files). Agent jobs are report-only (`[SILENT]`) and get registered with
> heartbeat/claims like any cron process. If you find yourself writing an LLM
> that edits a board or a file directly — stop, you are re-creating the bug.

---

## 1. What happened (the incident stack, layer by layer)

The 2026-11-04 cron-integrity crash was not one bug. It was a stack of
independent defects, each one **masking** the one below it. In discovery order
(oldest → deepest):

| # | Layer | What was broken | Since when |
|---|-------|-----------------|-----------|
| 1 | Interpreter wraps | `set -e`-style one-liners silently died; pins/wrappers missing | months |
| 2 | kanban funnel | jobs fired but the board never noticed (gatherer source, collision bug in `recompute_ready`, B2) | ~Sep–Oct |
| 3 | buzz↔kanban sync | two stacked one-line bugs: relay URL used `ws://` scheme (CLI needs `http://`, relay error 404 forever) **and** the bare `buzz` binary is in `~/.local/bin` which is not on launchd's PATH — the "reachability check" was actually command-not-found. Sync dead since Sep 3 (B3). | Sep 3 → Nov 6 |
| 4 | backlog orphans | nightly runners adopt **only their own date's card** (`night-run: $AGENT <today>`). Every failed night left its card `ready`, the gateway's `recompute_ready()` sweep auto-recovered below-breaker failures to `ready`, and the orphan was never consumed → 62-card backlog Oct 24–Nov 5 (B4). | Oct 24 → Nov 6 |
| 5 | single decode lane | the whole fleet shares ONE ollama instance (`:11434`). One long completion head-of-line-blocks everything — this is what killed the Topic digest job (1047.5 s model-response timeout at 21:20 on Nov 5) and repeatedly wedged nightly runs ("slow-model" exit 8/9, 66 `signal/early-exit` events in 14 d) (R7). | ongoing |
| 6 | no scheduled board hygiene | nothing ever parked stale, useless automated cards — they just accumulated at `ready` forever | forever, until B5 |

Plus the meta-problem that produced tasks 3 and 4 in the first place:
**one-liner fixes were stacked into long-running scripts without tests, so
each "fix" introduced new silent failures**. The cure is the battery layer
described in §4.

---

## 2. What was done, and why (file by file)

### 2.1 B1 — fail-closed cron gate (before card claims / token burn)

- `ops/bin/cron-gate.sh` — reads the A1 health snapshot
  (`~/.hermes/cron/.../last-24h-health.json`) and returns **closed** on acute
  breakage (failed runs, stale artifacts, missed dailies, snapshot older than
  90 min, corrupt snapshot) within the last 24 h. Chronic artifact debt does
  **not** close the gate (that's tracked separately, and triage handles it).
  Fail-closed: missing/corrupt snapshot ⇒ closed.
- Every runner consults the gate **before** claiming a kanban card or spending
  model tokens. `exit 4` = gate closed. `FORCE=1` is the documented operator
  bypass.

Why: the crash class was "a runner burned 45 min of decode on a job that was
already doomed because the cron layer underneath was broken". The gate makes
broken-cron ⇒ zero spend.

### 2.2 B2 — funnel repair + backlog triage tool

- Repaired the gatherer/collision chain so the board reflects reality
  (details: remediation doc §6).
- Discovered and fixed the **board reversion** bug: `kanban.sh fail` is a raw
  SQL write with **no `blocked` event**, so the gateway's `recompute_ready()`
  auto-recovery treated direct DB edits as noise and flipped cards back to
  `ready`. **Never write the board's DB directly** — triage parks cards with
  sticky kernel blocks (`hermes kanban block <id> --kind needs_input`), which
  no auto-recovery touches.
- The tool: `ops/bin/kanban-triage.sh` (dry-run by default, `--days N`,
  `--execute`). It reports every automated card in ready/queued older than
  N days, and on `--execute` parks them via sticky blocks. Manual (human)
  cards are never touched.

### 2.3 B3 — buzz↔kanban sync repaired, not retired

- `ops/bin/buzz-kanban-sync.sh`:
  - `BUZZ_RELAY_URL` default fixed `ws://localhost:3010` →
    `http://localhost:3010` (keep hostname `localhost`; `http://127.0.0.1`
    returns `[]` for `channels list`).
  - PATH: only extend `PATH` with `~/.local/bin` **when `buzz` is not
    resolvable already** (`command -v buzz >/dev/null || export PATH=...`).
    This is deliberate: an unconditional prepend shadows PATH-shim mocks
    (see §4.3 hermeticity incident).
- Supervised by `com.ops.buzz-kanban-sync` (15-min cadence), log
  `ops/run/sync.log`, state `ops/run/buzz-kanban-sync.json` (idempotent:
  processed event ids + last posted lane per card).
- Migrations + cold-start: state primed to 420 lanes, no post storm verified.

### 2.4 B4 — the day catch-up (backlog drain rule)

- `ops/bin/run-day-catchup.sh` — launchd `com.ops.day-catchup`, daily
  **12:10**, walks its agent list. Each agent gets ONE catch-up cycle of its
  OLDEST stale card through the *identical nightly chain* (gate, lock,
  pre-flight, model, digest, Buzz post, Buzz→Slack mirror). Nothing stale ⇒
  quiet exit with zero model spend.
- `ops/bin/run-night-agent.sh` gained `CATCHUP=1` (day window 09–17,
  `NOW_HOUR` hermetic hook) and:
  - **`ALL_CLEAN` trap fix:** the EXIT/ERR/TERM trap used to run `kb_fail` on
    every exit including success — every clean run re-blocked its completed
    card (which `recompute_ready()` then auto-recovered). Now `ALL_CLEAN=1`
    is set only by `kb_done`, and the trap fails the card only on non-clean
    exits.
  - **stale-lock reorder:** the 90-min stale-lock cleanup was placed AFTER
    `[ -e "$LOCK" ] && exit 8` — unreachable. A kill -9'd run jammed the
    agent until a human cleaned the lock. Reordered (cleanup first, then the
    busy-check). **Same fix applied to `run-product-intel.sh`.**
- `RUN_DIR_OVERRIDE` for hermetic lock/log isolation in tests (see §4.3).

### 2.5 R7 — dual-lane decode capacity (the measured detour)

The intended fix was `OLLAMA_NUM_PARALLEL=3`. It was applied correctly and
correctly **did nothing**: ollama 0.40.14 logs
`model architecture does not currently support parallel requests
architecture=qwen35` → `n_slots = 1` for ternary-bonsai-2-27b. Do not
re-attempt parallel slots for this model family; the env var stays loaded
(zero cost, instant benefit for a future parallel-capable arch).

What capacity actually looks like now:

- **Lane 1:** Ollama.app GUI serve on `:11434` (interactive clients keep it).
- **Lane 2:** supervised second ollama serve on `:21434`
  (`com.ops.ollama-2`, KeepAlive, `OLLAMA_KEEP_ALIVE=-1`, cold load ≈ 5 s,
  warm), sharing the read-only model store.
- **Dispatcher:** `ops/bin/fleet_proxy.py` on `:8555` — the single upstream
  URL every fleet client uses. Picks the least-in-flight healthy lane,
  retries on the other lane for pre-response failures, marks a lane down for
  45 s after a connect failure, exposes `/health` with lane status. The
  client-facing API is byte-identical to before (models object, streaming
  passthrough) — **no client changes needed, ever, for lane work**.
- Env agent: `ops/bin/ollama-env-apply.sh` + `com.ops.ollama-env.plist`
  (Aqua launchd env, keeps `OLLAMA_NUM_PARALLEL=3` asserted, self-heals by
  restarting Ollama.app **wholly** — see quirk below).

Quirks recorded during R7 (all were learn-by-pain):
1. **Electron keeps its env snapshot at app launch.** Respawning only the
   `ollama serve` child does NOT pick up new `launchctl setenv` values. The
   whole app must be killed (AppleScript quit is ignored for a torn
   menu-bar app → SIGTERM the Electron main) and relaunched. Interactive
   `ollama run` sessions drop — nothing scheduled depends on the port.
2. **`setenv` only reaches the app when run inside a GUI LaunchAgent context**
   (that's how the existing `com.ops.ollama-context` agent was doing it).
3. **The model is a reasoning model**: with small `max_tokens` the returned
   `content` is empty and the tokens show up in `reasoning`. Validate any
   drill with ≥ 200-token budgets or you will think the model returned
   nothing.

### 2.6 B5 — scheduled hygiene + product-intel joins the drain

- `com.ops.kanban-triage.plist` — daily **06:50**,
  `kanban-triage.sh --days 14 --execute`, log
  `ops/run/kanban-triage.log`. This is the safety net for cards nothing
  consumes (e.g. **chief-of-staff**, which is deliberately NOT backfilled:
  its brief is dated and bespoke (`run-chief-of-staff.sh`, 05:15) —
  back-dating briefs has no value, so its stale cards park via triage at
  day 14).
- `ops/bin/run-product-intel.sh` — B4 pattern ported verbatim:
  `CATCHUP=1` day window 09–17, oldest-not-today adoption, `ALL_CLEAN` trap
  fix, stale-lock reorder, quiet no-op, and one product-intel-specific rule:
  a catch-up run does **not** touch the cadence state file
  (`product-intel-state.json`, `last_light`/`last_deep`) — the nightly 03:00
  schedule keeps its own rhythm.
- `run-day-catchup.sh` default sweep is now all **four** agents:
  `competitor-scout customer-watcher partner-radar product-intel`.

### 2.7 Schedule-layer hygiene the batteries forced along the way

- Repo copy of `ops/launchd/com.ops.hermes-workspace.plist` was stale (still
  described the retired `pnpm dev` launcher) → synced from the installed
  production plist (`scripts/start-stable.sh`, the 2026-11-02 change).
- Dead `com.hermes.workspace` (dotted label) agent booted out + plist
  removed: its launcher script did not exist (LastExitStatus 32512), it
  owned nothing (port 3001 is the production agent's).
- `test-ops-schedules.sh` OS07 made token-aware: an inline `-c` command string
  that *ends* with `.sh` is not a path; it now tests the trailing script
  token, resolving bare filenames against `$WS_DIR`.
- `test-buzz-kanban.sh` hermeticity restored (see §4.3).

---

## 3. Current state of the world (as of 2026-11-06 ~12:30)

- Board: `blocked 244 / done 109 / ready 63 / queued 4`, stable across
  sweeps, 0 auto-promotions after the B2 sticky-block fix.
- Launchd cron suite all rc=0 (`pre-night-check`, `post-night-check`,
  `day-catchup`, `kanban-triage`, `kanban-reconcile`, `buzz-kanban-sync`).
- Decode lanes: both idle and healthy (`curl 127.0.0.1:8555/health`).
- **Gate:** closed on exactly one acute — the Topic news digest failure at
  **2026-11-05 21:20:16** (delivery-only). Its 24 h window ends **21:20
  today**. The gate therefore reopens either at 21:20 or, on a successful
  21:00 digest run (which R7's second lane makes far more likely), before
  that. Every gate-skipped run today (11:13 catch-up, 12:10 catch-up) was
  correct-by-design rc=4.
- Health snapshot: `4 ok / 6 warn / 2 fail` — the 2 FAILs are intentional
  Shadow-weekly gaps cured by Sunday's first fire. Do not "fix" them.

Known acceptable blemish: the fleet proxy's in-flight counter can drift a
residual +1 after an upstream is killed mid-request; it self-heals on
restart. Not scheduled for repair.

---

## 4. What was tested, and why (the battery layer)

### 4.1 How to run everything

```bash
bash ops/tests/run-all.sh            # all suites; must end: SUITES PASS=10 FAIL=0
bash ops/tests/test-cron-gate.sh     # G01–G18 (gate verdicts + runner wiring + catch-up)
bash ops/bin/test-buzz-kanban.sh     # TB/TK/TS/TN (registration, wrapper, sync engine)
bash ops/bin/test-ops-schedules.sh   # OS01–OS08 (launchd static battery)
```

Exit code matters: `0` = green, `1` = any FAIL. `test-log.md` rows are added
**manually after human verification** — append-only, use shell
`cat >> docs/ops/test-log.md` (see §5 rules).

### 4.2 Case map for `test-cron-gate.sh`

- **G01–G08** — gate verdict logic over fixture snapshots
  (`ops/tests/fixtures/cron-gate/*.json`): chronic debt open, acute close,
  stale close, corrupt close, missing close, healthy open. Fixtures are
  re-stamped each run (`summary.generated_at` = now) because the 90-min
  staleness check otherwise rots the open-cases within a day
  (`closed-stale-snapshot.json` is deliberately NOT re-stamped — it *is* the
  staleness case).
- **G09–G12** — runner wiring on a temp kanban DB + mock hermes binary +
  `RUN_DIR_OVERRIDE` run dir: gate-closed refuses before any claim (rc=4,
  nothing claimed), `FORCE=1` bypass reaches the mock, gate-open claims +
  completes, product-intel `DRYRUN=1` skips the gate.
- **G13–G15** — B4 catch-up through the nightly runner: night-hour refusal
  (rc=5, zero claims), oldest-stale adoption + completion with a newer stale
  card deliberately held `ready`, and quiet no-op when only today's card
  exists.
- **G16–G18** — the same B4 contract through
  `run-product-intel.sh` (which uses `STATE_DIR`, not `RUN_DIR_OVERRIDE`,
  for its lock/state dir). G17 additionally **asserts the cadence state file
  was left untouched** by the catch-up cycle.

### 4.3 The hermeticity incident (read this before touching the batteries)

Two silent leaks were found and fixed while wiring B4/B5 — both are patterns
to avoid repeating:

1. **Battery cases were reading/leaking the LIVE `ops/run` lock dir.** A
   killed test case could jam the real nightly agent (and vice versa). Fix:
   `RUN_DIR_OVERRIDE` (night runner) / `STATE_DIR` (product-intel) point
   locks/logs/prompts/prompt-state into a temp dir. The temp task schema
   must mirror the live table (a missing `last_heartbeat_at` made
   `kanban.sh list/get` fail silently hermetically).
2. **B3's PATH hardening shadowed the sync battery's mock.**
   `buzz-kanban-sync.sh` unconditionally prepended `~/.local/bin` — under
   the battery, the *real* buzz CLI sat in front of the PATH-shim mock, so
   TS01/02/05 silently no-opped (mock log empty was the giveaway). Fix:
   conditional prepend. **Rule:** any production script that "repair PATH"
   must be conditional, not absolute, or it breaks PATH-shim-based tests.
3. Also: `notify-slack.sh` no-ops safely when no webhook/token env exists —
   verify before assuming; `BUZZ_POST_DIGESTS=0` in test invocations keeps
   the Buzz relay untouched.

### 4.4 Live verification performed (with what proved what)

- B2/board reversion: repeated sweeps → stable counts, 0 auto-promotions.
- B3: 20/20 TS battery, `launchctl kickstart` rc 0, primed state → no post
  storm on migration night.
- B4: launchd fired 11:13, orphan-lock + rc=8 (the stale-lock bug hit live!),
  after cleanup the gate-closed skip came out rc=4 — correct.
- R7 drills: server-log env assertion; 3 concurrent completions through
  `:8555` with lane-2's own log showing it serving (task 84); kill
  `:21434` → request completed via lane 1 → KeepAlive restored the lane.
- B5: triage kickstart (0 stale / 67 kept), G16–G18, full run-all 10/10.
- Gate-window truth check: `~/.hermes/cron/jobs.json` shows the Topic digest
  `last_failure.at` — the earlier "~12:25" estimate was wrong; the true
  failure timestamp (21:20) sets the correct window end.

---

## 5. Ground rules for whoever comes next (dev or LLM)

1. **Docs are append-only here.** New `test-log.md` rows go in with
   `cat >> ... << 'EOF'`; never rewrite history at the file tail (this has
   been clobbered twice by well-meaning edits — each one repaired).
2. **Never write `~/.hermes/kanban.db` directly.** Everything goes through
   `ops/bin/kanban.sh`; parking happens via sticky kernel blocks
   (`hermes kanban block <id> --kind needs_input`), never raw SQL status
   flips (gateway auto-recovery will undo them).
3. **Keep the batteries hermetic.** New runner features ⇒ extend
   `test-cron-gate.sh` (window refusal, claim+complete, quiet no-op) and run
   the full `run-all.sh`. Every hermetic knob so far:
   `NOW_HOUR`, `FORCE`, `DRYRUN`, `CATCHUP`, `HERMES_BIN`,
   `HERMES_KANBAN_DB`, `RUN_DIR_OVERRIDE` / `STATE_DIR`, `RESEARCH_DIR`,
   `KB_DIR`, `TARGETS_CFG`, `BUZZ_POST_DIGESTS=0`, `GATE_HEALTH_JSON`,
   `TIMEOUT_SECS`.
4. **Repairs are never retired silently.** The sync is *repaired, not
   replaced*; the backlog is *consumed, not deleted*; chief-of-staff is
   *parked via triage, not bypassed*. If you redesign one of these, update
   the remediation doc §6d/§7/§8/§9 notes first.
5. **Backups before day-surgery:** each batch left a snapshot in
   `ops/run/b2-2026-11-05/`, `b3-2026-11-06/`, `b4-2026-11-06/`,
   `r7-2026-11-06/`, `b5-2026-11-06/`. Note: `ops/` was never committed to
   git — backups like these are the only rollback path, so keep the habit.
6. **Client API invariance:** anything touching `fleet_proxy.py` must keep
   the `:8555` API byte-identical (same models object, streaming
   passthrough). 20+ fleet clients assume it.
7. **Reasoning-model drills:** use `max_tokens ≥ 200` or the empty
   `content` will mislead you (§2.5 quirk 3).
8. **Workspace tree hygiene:** the repo has many pre-existing modified files
   unrelated to this effort — don't attribute them, don't "clean them up"
   without asking. No commits were made during this effort end-to-end (the
   launchd-backed artifacts + docs are the durable record).

### Common operations cheatsheet

```bash
# gate verdict right now
GATE_HEALTH_JSON= ops/bin/cron-gate.sh

# board counts
sqlite3 ~/.hermes/kanban.db "select status, count(*) from tasks group by status;"

# triage dry-run (always dry-run first)
ops/bin/kanban-triage.sh --days 14

# manual catch-up sweep (only inside 09–17, respects the gate)
bash ops/bin/run-day-catchup.sh            # all 4 agents
CATCHUP=1 ops/bin/run-night-agent.sh competitor-scout   # single agent

# decode lane health + fleet entrypoint check
curl -s http://127.0.0.1:8555/health | python3 -m json.tool

# restart a launchd agent after editing its script
launchctl kickstart -k gui/$(id -u)/com.ops.<label>

# reload a plist after editing it
cp ops/launchd/<x>.plist ~/Library/LaunchAgents/ \
  && launchctl bootout gui/$(id -u)/<label> ; \
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<x>.plist
```

---

## 6. How to proceed (the watch schedule)

### Tonight (Nov 6)

1. **21:00 — Topic news digest fires.** This is the first real-world
   exercise of the dual-lane upstream. Watch for the failure that RUINED
   yesterday: 1047 s model-response timeout.
   - Success ⇒ gate opens for the 00–06 window; tonight's night runs
     proceed normally.
   - Failure ⇒ a fresh acute lands close enough to midnight to close
     tonight's window again. Then look at the digest job's
     timeout/`max_tokens` config, and its `next_run_at` 21:00 schedule
     against lane occupancy (`/health`) at that hour — the job runs during
     the evening when interactive `:11434` traffic competes for lane 1, and
     the proxy does not yet do hard lane isolation per time-of-day.
2. **21:20** the old acute exits its window regardless.
3. **00–06** pre/post-night checks run; if the gate stayed closed (option
   2), they skip by design — that is the rule protecting them, not a bug.

### Tomorrow (Nov 7) — first full B5 day

1. **06:50 — first effective scheduled triage.** The Oct-24 ready class is
   14 days old; expects the first real parks. Check
   `ops/run/kanban-triage.log` (dry-run report is logged before each
   execute) and confirm board counts moved ready→blocked, and that nothing
   bounced back overnight (sticky blocks must hold).
2. **12:10 — first 4-agent catch-up sweep** (product-intel included for the
   first time). Expect 0–4 cards consumed (one per agent at most), each
   through the full gate chain. Watch `ops/run/day-catchup.log` and the
   per-agent logs; rc 0/4/5/8 are all "fine" (success / gate-closed / wrong
   window / busy), anything else is a failure the launchd log records.
3. **Evening** — product-intel 03:00-style cadence: confirm
   `product-intel-state.json` still carried pre-catch-up values after any
   catch-up consumed a card (G17's guarantee, live).

### This week

- **Backlog drain rate ≈ 3–4 cards/day** (research agents + product-intel).
  Oct-24 → Nov-5 production is ~63 ready cards, so full drain in roughly
  2 weeks — triage's 14-day rule will slowly park whatever catch-up cannot
  repair in time. That combination (catch-up repairs the recent ones, triage
  ages out the rest) is the intended end state; revisit if `ready` grows
  week-over-week instead of shrinking.
- **Sunday** — first Shadow-weekly fire cures the 2 intentional health FAILs;
  expect the health snapshot to go fully ok except warns.
- **Optional, only if asked:** lane 1 `OLLAMA_KEEP_ALIVE=-1`
  (currently 5 m default on the app serve; lane 2 is already pinned),
  per-job lane routing/affinity in the proxy, and time-of-day lane
  isolation for the 21:00 digest. None of these were requested; the
  measured numbers do not currently demand them.

### If a night run still wedges

Work top-down: gate verdict (`cron-gate.sh`) → lanes
(`/health`, `lsof -iTCP:11434 -iTCP:21434`) → lock state
(`ops/run/*.lock`, the >90 min stale rule) → the agent's own log in
`ops/run/` → the remediation doc's relevant section number. Do not skip to a
DB edit; that is the B2 bug class.

---

## 7. File map (everything touched, in one place)

```
Runners / engine
  ops/bin/run-night-agent.sh        CATCHUP=1, ALL_CLEAN trap, stale-lock reorder, RUN_DIR_OVERRIDE
  ops/bin/run-day-catchup.sh        12:10 sweep, 4 agents (research ×3 + product-intel)
  ops/bin/run-product-intel.sh      CATCHUP port + cadence-state untouched rule
  ops/bin/buzz-kanban-sync.sh       http:// relay URL, conditional PATH, lock/trap discipline
  ops/bin/kanban-triage.sh          sticky-block parking (dry-run default)
Board / gate
  ops/bin/kanban.sh                 the ONLY board interface
  ops/bin/cron-gate.sh              fail-closed B1 gate
R7 decode plane
  ops/bin/fleet_proxy.py            dual-lane least-in-flight dispatcher on :8555
  ops/bin/ollama-env-apply.sh       GUI-domain env agent (full-app restart capable)
Tests
  ops/tests/test-cron-gate.sh       G01–G18 (gate, wiring, B4 catch-up, B5 product-intel)
  ops/tests/run-all.sh              aggregate; 10/10 expected green
  ops/bin/test-buzz-kanban.sh       TB/TK/TS/TN, mock-buzz.sh shim
  ops/bin/test-ops-schedules.sh     OS01–OS08 static launchd battery
Launchd     (ops/launchd/*.plist — copied to ~/Library/LaunchAgents/)
  com.ops.kanban-triage.plist       NEW  06:50 daily, --days 14 --execute
  com.ops.day-catchup.plist         NEW  12:10 daily
  com.ops.ollama-2.plist            NEW  :21434 KeepAlive upstream
  com.ops.ollama-env.plist          NEW  GUI env agent (NUM_PARALLEL=3)
  com.ops.buzz-kanban-sync.plist    15-min sync
  com.ops.hermes-workspace.plist    synced repo copy ↔ installed (production launcher)
State / logs (ops/run/)
  product-intel-state.json, day-catchup.log, kanban-triage.log, sync.log,
  ollama-env.log, ollama-2.log, buzz-kanban-sync.json
Docs (append-only)
  docs/ops/remediation-2026-11-04-cron-integrity.md   master: §1–§9 + R7 in §3
  docs/ops/test-log.md                                evidence rows per change
  CHANGELOG.md                                        user-facing rollups
Backups (ops/run/)
  b2-2026-11-05/ b3-2026-11-06/ b4-2026-11-06/ r7-2026-11-06/ b5-2026-11-06/
Live but NOT touched by this effort
  ~/.hermes/kanban.db               the board (backup pre-B2 exists)
  ~/.hermes/cron/jobs.json          job schedule incl. Topic digest truth source
```
