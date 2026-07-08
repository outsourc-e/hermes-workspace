## 2026-07-07 — Tier H: auto-verification, standing goals, proactive proposals

- **Auto-verification** (`src/server/swarm-verify.ts`): every non-trivial DONE
  checkpoint (≥120 chars task, not from reviewer/qa, not itself a
  verification) auto-queues a P1 `[verify]` task for the reviewer, who must
  end RESULT with "VERDICT: CONFIRMED" or "VERDICT: REFUTED — reason".
  Refuted → Discord alert from the server. Deduped per claim; disable with
  HERMES_SWARM_AUTO_VERIFY=0. Loop-safe: verify tasks are never verified.
- **Standing goals** (`src/server/swarm-goals.ts`, `/api/swarm-goals`,
  `.runtime/swarm-goals.json`): operator states a goal (UI/API/Discord
  `!goal <text>`); each sweep cycle the engine advances ONE goal one step:
  strategist plans a JSON pipeline → pipeline runs → strategist assesses →
  done / next iteration. Bounded by maxIterations (default 5, cap 10);
  honors the Clear All pause; every transition logged in goal notes.
  `!goals` lists; pause/resume/abandon via API.
- **Proactive proposals** (`src/server/swarm-suggest.ts`): deterministic
  scanners (recurring block reasons ≥3, workers <50% success over ≥5 tasks,
  frequent zombie reaps) file queue items with status `proposed` — never
  auto-dispatched. Approve via queue panel button, `!approve <id>`, or see
  them in the morning briefing. Max 5 open proposals, fingerprint-deduped.
- Queue gains `proposed` status; drain ignores it. Sweep now also runs
  propose + one goal step per cycle.

## 2026-07-07 — Clear All actually clears: zombie reaper, kill-first reset, dispatch pause, per-worker Stop **[RECURS — do not regress]**

Operator report: worker stuck "reviewing" 5h; Clear All appeared dead. Three
real causes, three fixes:
1. **Zombie states**: a tmux worker dying without a terminal checkpoint left
   runtime.json busy forever. Fix: `reapZombieSwarmRuntimes()` — busy state +
   no tmux session + no output 30 min → reset to idle. Sweep calls
   `POST /api/swarm-runtime/reset {"action":"reap"}` every 10 min and logs
   `zombie_reaped`.
2. **Reset undone by live session**: per-worker reset didn't kill tmux, so
   the TUI monitor rewrote runtime back to executing. Fix: reset route kills
   `swarm-<id>` tmux sessions BEFORE writing runtime (kill-first order also
   documented for cancel-all/chat-clear).
3. **Board refill after Clear All**: automation (queue drain / scheduled
   missions) re-dispatched within minutes. Fix: cancel-all writes
   `.runtime/dispatch-pause-until` (+10 min); queue drain and
   swarm-scheduled-mission.sh honor it. Manual dispatches unaffected.
Plus: per-worker ✕ Stop button on each active-agent card (swarm board) →
`POST /api/swarm-runtime/reset {workerIds:[id]}` — kill + reset one worker
without nuking the board.

## 2026-07-07 — Tier E+G: right-sizing, gzip, pipelines, iCloud backup, weekly report

- **Model right-sizing** (`tierCanDemote`/`demoteTier`): dispatch demotes one
  tier when the worker's record at the lower tier is deep and strong (>=5
  attempts, >=80% success in last 15). Escalation always wins; reasoning
  tasks never demote.
- **Gzip static serving** (`server-entry.js`): compressible assets gzip with
  an in-memory cache for hashed assets — main chunk 2.26 MB → 684 KB on the
  wire. [GOTCHA] `rollupOptions.output.manualChunks` CRASHES rollup under the
  TanStack Start multi-env build (getVariableForExportNameRecursive) — don't
  re-add vendor splitting without testing `vite build`.
- **Pipelines** (`src/server/swarm-pipeline.ts`, `/api/swarm-pipeline`):
  POST {title, stages:[{label, assignments:[{workerId,task}]}]} — up to 5
  stages × 4 parallel assignments; each stage's checkpoint results are
  appended to next-stage tasks as "## Previous stage results". Fire-and-
  forget; state in `.runtime/swarm-pipelines.json`; a stage with zero
  successes fails the run.
- **Off-site backup**: `hermes-backup.sh` now copies each archive to iCloud
  Drive `HermesBackups/` (keep 7, `HERMES_ICLOUD_BACKUP=0` to disable).
- **Weekly self-report**: `hermes-weekly-report.sh` — Sundays 18:00
  (`com.hermes.weekly-report`), writes `vault/reports/<ISO-week>-swarm-report.md`
  (per-worker/per-tier success, failure reasons, tokens) + Discord summary.

## 2026-07-07 — Tier D+F: RAG memory, task queue, briefing, palette, drop zone

- **RAG memory** (`src/server/rag-index.ts`, `/api/rag`): local semantic index
  (ollama `nomic-embed-text`, no cloud) over vault + playbook + outcomes +
  handoffs at `~/.hermes/memory/rag-index.json`. Incremental (mtime-keyed),
  throttled 5 min, keyword fallback when ollama is down. Dispatch injects top
  RAG hits into worker prompts alongside keyword skills (max 4 hints total).
  Force refresh: `POST /api/rag {"action":"reindex"}`.
- **Task queue** (`src/server/swarm-queue.ts`, `/api/swarm-queue`,
  `.runtime/swarm-queue.json`): priorities P1–P3, optional worker pin, else
  auto-picks an idle worker (orchestrator/strategist excluded). Lifecycle
  sweep drains max 2/cycle via local POST. Idle check sees through stale
  `state=executing, phase=done, currentTask=null` runtimes. Add from UI panel
  (swarm cards view), Discord `!queue [p1|p2|p3] [@worker] <task>` (operator
  only) / `!queuelist`, or ⌘K palette.
- **Morning briefing**: `hermes-discord-digest.sh` upgraded (overnight
  timeline stats, queue depth, underperforming workers, watchdog tail, disk,
  best-effort Calendar events) and rescheduled 08:05 → 07:30
  (`com.hermes.discord-digest` plist edited in place — NOT generated by
  installer; re-edit if reinstalled). Headless Gmail not possible without
  OAuth; email triage stays out until a connector is set up.
- **⌘K palette**: added Swarm/Dashboard/Tasks screens, "Queue task" (uses
  typed query as the task), "Reindex semantic memory", and live RAG search
  results (query ≥4 chars, 250 ms debounce).
- **Vault drop zone** (`/api/vault-ingest`, `vault-drop-zone.tsx`): drag any
  file onto the workspace → saved to `vault/inbox/`, non-md files get a
  `.note.md` companion (metadata + 4k excerpt), RAG reindex kicks off async.
  25 MB cap, 5 files per drop.

# Swarm Operations Playbook — read this first

**Audience:** any AI agent (Opus, Sonnet, Fable, etc.) picking up work on this
workspace from a cloud session. This is the durable memory of what breaks, why,
and how to fix it. Recurring bugs are marked **[RECURS]** — check them every
session, they come back.

Owner: Estevan. Repo: `outsourc-e/hermes-workspace`. Contributions currently go
via fork `estevanjim03-cyber/hermes-workspace` → PR (owner account lacks direct
push). Open PR: #690.

---

## 0. First 60 seconds — health check

```bash
# server up? (prod build served by launchd)
curl -s -m5 -o /dev/null -w "%{http_code}\n" http://localhost:3000/
# auth token for API probes
TOK=$(python3 -c "import json;print(list(json.load(open('$HOME/.hermes/workspace-sessions.json'))['tokens'])[0])")
# gateway + ollama
curl -s -m5 http://127.0.0.1:8642/health
curl -s -m5 http://localhost:11434/api/tags | head -c 80
# live workers
tmux ls | grep swarm-
# blocked assignments (should be ~0)
curl -s -H "Cookie: claude-auth=$TOK" http://localhost:3000/api/swarm-missions \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('blocked:',sum(1 for m in d.get('missions',[]) for a in m.get('assignments',[]) if a.get('state') in('blocked','needs_input')))"
```

API auth is a **cookie**: `Cookie: claude-auth=$TOK` (NOT a Bearer header).
Tokens live in `~/.hermes/workspace-sessions.json` (`{tokens:{<tok>:expiryMs}}`).

---

## 1. Serving mode — dev vs prod **[RECURS]**

The launchd service `com.hermes.workspace` must run the **production build**, not
`vite dev` (dev = 2.2s cold page loads, the "everything is slow" complaint).

- Plist: `~/Library/LaunchAgents/com.hermes.workspace.plist` →
  ProgramArguments must be `node server-entry.js` (not `pnpm dev`).
- **After ANY code change**, rebuild + restart or the running app is stale:
  ```bash
  node_modules/.bin/vite build && launchctl kickstart -k gui/501/com.hermes.workspace
  sleep 6 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
  ```
- `pnpm` is NOT installed. Use `node_modules/.bin/*` or `npx` directly.
- Port 3000 already bound by the launchd instance — don't start a second dev
  server on 3000; it'll `EADDRINUSE`.

---

## 2. Swarm worker model config **[RECURS — highest-value check]**

Worker profiles at `~/.hermes/profiles/<id>/config.yaml`. The `model:` block
**drifts back to broken values** — check every session:

```bash
for w in orchestrator km-agent builder reviewer qa researcher ops-watch \
  maintainer strategist inbox-triage release-agent security-auditor quant-agent concierge; do
  printf "%-16s " $w; grep -A2 '^model:' ~/.hermes/profiles/$w/config.yaml | grep -E 'default:|provider:' | tr '\n' ' '; echo
done
```

**Correct state:** `provider: ollama-cloud` (or `gemini` for researcher),
`base_url: ''`. Two failure modes seen repeatedly:

- `provider: deepseek` + `base_url: https://api.deepseek.com/v1` → **no API key
  for that endpoint** → silent fallback to `llama3.1:8b` (or timeout). Fix:
  set provider `ollama-cloud`, blank base_url.
- `base_url: http://127.0.0.1:11434` → forces cloud model name onto **local**
  ollama → wrong/slow. Clear base_url.

Only cloud creds present: **ollama-cloud** (`OLLAMA_API_KEY`) serves the whole
fleet, plus `GOOGLE_API_KEY` (gemini). NO anthropic/openai/deepseek-direct keys.
Model catalog: `~/.hermes/provider_models_cache.json` (ollama-cloud has
qwen3-coder:480b, kimi-k2-thinking, deepseek-v4-pro/flash, ministral-3:8b,
qwen3.5:397b, glm-\*, etc). Context floor: **Hermes rejects <64K-context models
at agent init** → the worker BLOCKS forever. Never assign a sub-64K model.

Verify a model actually stuck (no silent fallback) after a dispatch:

```bash
python3 -c "import sqlite3;c=sqlite3.connect('$HOME/.hermes/profiles/qa/state.db');c.row_factory=sqlite3.Row;print(c.execute('select model from sessions order by started_at desc limit 1').fetchone()['model'])"
```

---

## 3. Worker launch / tmux lifecycle **[RECURS]**

Dispatch delivers to a persistent `hermes chat --tui` in tmux session
`swarm-<id>`, falling back to a `hermes chat -q` oneshot.

- Wrappers `~/.local/bin/<id>` **and** `~/.local/bin/<wrapper-field>` (e.g.
  `reviewer:gate`). Regenerate with `scripts/swarm-generate-wrappers.sh`.
- Gotchas baked into the wrapper/launch — do not reintroduce:
  - zsh reserves `status` (read-only alias of `$?`). Use `hermes_status`.
  - launchd's minimal PATH lacks node → export `PATH=$HOME/.local/bin:...`
    (node is symlinked there).
- **Dead session detection:** a tmux session name existing ≠ agent alive. When
  `hermes chat --tui` exits, the pane drops to bare `-zsh`; delivering into it
  = no response = orchestrator re-dispatch loop. `ensureLiveTmuxSession`
  (`src/routes/api/swarm-dispatch.ts`) checks pane foreground cmd + exit
  sentinel and rebuilds. Don't weaken this.
- Recover manually: `tmux kill-session -t swarm-<id>` → next dispatch rebuilds.

---

## 4. False "session timed out" / blocked **[RECURS — do not regress]**

Symptom: task actually ran (file written, agent replied) but UI shows "session
timed out" + assignment BLOCKED. Cause was `dispatchBlockReason` blocking on
`checkpointStatus === 'timeout'` even when `result.ok`. **A successful dispatch
that merely lacks a structured checkpoint is NOT a block.** Current rule: only
`!result.ok` blocks. Oneshot success synthesizes a DONE checkpoint. Keep it.

Clear stale false-blocks: `POST /api/swarm-missions {"action":"clear-blocked"}`.

Live-TUI note: a delivered tmux task runs async in the pane; if it never emits a
checkpoint the assignment sits `executing` (not done). That's accurate, not a
bug. Open follow-up: read pane result → synthesize done for TUI path too.

---

## 5. File space — one root **[RECURS]**

All agent output must land in `~/workspace` (the Files-page root), not scattered
across `$HOME`. Enforced by:

- `terminal.cwd: /Users/estejim03/workspace` (absolute) in main `~/.hermes/config.yaml`
  and every profile config.
- `defaultWorkspaceRoot()` in swarm-dispatch (oneshot cwd) + wrappers `cd`.
- Files page root: `~/.hermes/webui_state/workspaces.json` +
  `last_workspace.txt`.
  If projects appear in `~/Polymarket` etc again, a config lost its absolute cwd.

---

## 6. Knowledge base = Obsidian vault

`~/workspace/vault` is both the Knowledge base and an Obsidian vault (a vault is
just a folder of .md). Knowledge source config points there
(`POST /api/knowledge/config {"source":{"type":"local","path":".../vault"}}`).
km-agent + concierge profiles carry `OBSIDIAN_VAULT_PATH` / `HERMES_KNOWLEDGE_VAULT`
(baked into `scripts/swarm-split-creds.sh` so they survive regeneration).

---

## 7. Credentials **[RECURS]**

Each profile `~/.hermes/profiles/<id>/.env` is a **real file (mode 600)** with
least-privilege keys — NOT a symlink to master. If they revert to symlinks,
re-run `scripts/swarm-split-creds.sh`. Master `~/.hermes/.env` stays for the
gateway/operator. Never put Discord tokens in worker envs. Never print key
values in output/logs.

---

## 8. Performance invariants (don't regress)

- Global `QueryClient` in `src/routes/__root.tsx` has `staleTime: 30s` etc — or
  every page re-flashes a loading state on revisit. Keep it.
- ~12 heavy routes are lazy-split (three.js/recharts/HermesWorld). Keep new
  heavy routes lazy.
- The launchd `com.hermes.dashboard` (:9119) has leaked to >1GB idle before —
  if RAM balloons, `launchctl kickstart -k gui/501/com.hermes.dashboard`.
- Desktop app orphans `hermes ... dashboard --port 0` backends on force-quit
  (upstream bug). The swarm sweep cron reaps them when Desktop isn't running.

---

## 9. Model router

Dispatch-time tiering in `src/server/swarm-model-router.ts`: task text → tier
(light/standard/heavy/reasoning) → model, clamped to the worker's `modelTiers`
band in swarm.yaml, one auto-escalation on oneshot failure. A trivial task
legitimately downshifts (e.g. orchestrator "reply OK" → deepseek-v4-flash, not
deepseek-v4-pro) — that's not a bug. Disable: `HERMES_SWARM_MODEL_ROUTER=0`.

---

## 10. Verify / test / ship

```bash
npx vitest run                       # baseline: 755 passing, 0 fail
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"   # baseline: 98 (dirty tree; don't exceed)
```

- The working tree is intentionally **very dirty** (large uncommitted docs +
  in-progress churn). Don't try to "clean" it. Stage only files you changed.
- `e2e/` specs run via Playwright, not vitest (excluded in vite.config).
- No `gh` CLI. Push via GitHub Desktop's keychain token:
  ```bash
  T=$(security find-generic-password -s "GitHub - https://api.github.com" -w)
  git push "https://estevanjim03-cyber:$T@github.com/estevanjim03-cyber/hermes-workspace.git" <branch>
  ```
  Then open PR fork→`outsourc-e:main` via the GitHub API (see PR #690 for shape).
- Commit trailer: `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.

---

## 11. Known open follow-ups (not yet fixed)

- TUI-path completion: delivered tmux tasks stay `executing` until they emit a
  checkpoint — read pane result → synthesize done.
- Stubs (product decisions, not bugs): Agora room = mock presence data; Echo
  Studio = unpersisted form; a few skills actions are "coming soon" toasts.
- Upstream: hermes-agent desktop `main.cjs` process-pool orphans children on
  force-quit (needs a PR to NousResearch, not fixable in this repo).

---

## 12. Change log of structural fixes (newest first)

Update this when you land a fix that future sessions must know about.

- (Tier C partial) **Watchdog + unified timeline**: `com.hermes.watchdog`
  (5 min, scripts/hermes-watchdog.sh) probes workspace/gateway/dashboard
  HTTP + discord-bot process, auto `launchctl kickstart`s them once, alerts
  #hermes-workspace via bot token, escalates if still down next cycle; also
  low-disk (<10 GB) and wedged-worker (executing >2h silent) alerts. State
  in ~/.hermes/logs/watchdog-state.json. Timeline: /api/swarm-timeline
  (src/server/swarm-timeline.ts) merges mission events + outcomes jsonl +
  scheduled-run logs + sweep/branch-guard rows, newest-first; panel on the
  swarm cards view. Multi-machine workers deliberately deferred.

- (Tier 1 learning loops) **Outcome memory + scoreboard + self-improvement**:
  every dispatch appends to `.runtime/swarm-outcomes.jsonl`
  (`src/server/swarm-outcomes.ts`, wired via `finalizeDispatch` in
  swarm-dispatch.ts). Feeds: `/api/swarm-scoreboard` + dashboard card;
  router learning (3+ recent failures at a tier <40% ok → pre-escalate one
  tier, clamped to the worker's band); per-worker failure "lessons" injected
  into the next prompt. DONE checkpoints with evidence are harvested into
  `~/workspace/vault/skills/*.md` (`src/server/swarm-skills.ts`) and matching
  skills are injected into future prompts by keyword overlap. Nightly
  `com.hermes.swarm.self-improve` (01:00, `scripts/swarm-self-improve.sh`)
  gathers tsc/test/health/scoreboard evidence and dispatches the maintainer
  to stage ONE reviewable fix — never pushes/merges; review lands in the
  morning digest. [RECURS-risk] Workers doing git work MUST use an isolated
  worktree (~/workspace/nightly-fixes/) — a bare `git checkout -b` in the
  live repo switches the operator's branch under running sessions (happened
  on the first live run — and again on a second run before the rule shipped).
  Defense is now three layers: (1) every worker prompt forbids
  checkout/switch/reset in the live repo and mandates worktrees under
  ~/workspace/worker-trees/; (2) swarm-self-improve.sh pre-creates the
  night's worktree so the maintainer never runs branch commands itself;
  (3) the 10-minute lifecycle sweep has a branch guard — live repo branch
  != .runtime/expected-branch → auto `checkout -m` back when the found
  branch matches nightly/_ or worker/_ (worker-made), Discord alert either
  way. Operator switching branches on purpose: update
  .runtime/expected-branch to the new name. Outcome writes are best-effort: never let them fail a
  dispatch.

- `260e9e90` **Security: auth-gated** /api/swarm-kanban, /api/events (SSE),
  /api/playground-npc, /api/playground-admin (Host-header check was
  spoofable → requireLocalOrAuth). Audit found no shell-injection or
  traversal issues elsewhere.

- `17537bd4` **[RECURS-class] cold-TUI + clear-race fixed — do not regress**:
  (a) never deliver a prompt to a swarm TUI pane until it shows the ready
  prompt — cold boots spend 30-60s installing deps; a fixed sleep loses the
  prompt and fakes a "session timed out" (ensureLiveTmuxSession now polls up
  to 90s). (b) never clear worker state.db before the hermes process is DEAD —
  tmux kill-session returns early and hermes recreates state.db on shutdown
  flush (cancel-all now kills tmux + oneshots, waits via pgrep with SIGKILL
  escalation, then clears). Both verified over 3 use→clear→use cycles.

- (pending) **Phase 2**: (a) daily backups — `scripts/hermes-backup.sh` +
  `com.hermes.backup` launchd (03:00) tar the .runtime, vault, and memory to
  `~/hermes-backups` (keep 14). (b) health strip now warns on provider drift /
  missing wrappers / missing profiles (`swarm-health.ts` summary.warnings).
  (c) Discord digest — `scripts/hermes-discord-digest.sh` +
  `com.hermes.discord-digest` (08:05) posts active/blocked/greenlight-queue +
  health warnings + token spend to Discord via the hermes bot (token from
  `~/.hermes/.env`; channel auto-discovers if `DISCORD_HOME_CHANNEL` is stale).

- (pending) **Tier-1 completeness**: (a) live-TUI dispatches now self-complete —
  on checkpoint-poll timeout the pane is read; if the TUI is idle-ready a DONE
  checkpoint is synthesized from the reply (`readIdleTuiReply` in
  swarm-dispatch). (b) **Spend cap**: set `HERMES_SWARM_DAILY_TOKEN_CAP` (in the
  `com.hermes.workspace` plist env) to a positive number — dispatch returns 429
  once the day's total tokens cross it; status is on `/api/swarm-usage`
  (`spendCap`). (c) **Scheduled agents**: `scripts/swarm-install-schedules.sh`
  installs launchd timers (security-auditor 02:00, quant-agent 07:00,
  concierge 08:00) that dispatch recurring missions via
  `scripts/swarm-scheduled-mission.sh`.

- (pending) **provider-drift self-heal**: hermes-agent's TUI rewrites a
  worker's `model.provider` from the bare model name (deepseek/custom/
  openrouter — none keyed) → silent llama fallback. Fixed three ways: (1)
  resolver maps the ollama-cloud catalog → `provider: ollama-cloud`
  (`swarm-model-resolver.ts`); (2) `syncSwarmProfileModel` runs on EVERY
  dispatch and clears stale `base_url` (`swarm-profile-config.ts` +
  `swarm-dispatch.ts`); (3) the model router emits **provider-qualified** ids
  `ollama-cloud/<model>` so the CLI can't re-guess (`swarm-model-router.ts`).
  Also fixed `/api/models` 503 (non-fatal upstream fetch) and the
  remove-provider settings button (`hermes-config-*`).
- `7512bdfe` stop false blocks on successful-but-uncheckpointed dispatches;
  oneshot synth-DONE; fixed reviewer profile provider drift.
- `dd2b4686` QueryClient caching; Obsidian vault wired; graceful API states
  (mark_ready_for_eric, session 404, external-memory empty); desktop reaper.
- `e304cc3c` blocked-item controls, permission modes, model router, sweep cron,
  cost meter, per-profile creds.
- `f1d6c892` unified file space, all-cloud fleet, 12 lazy routes, prod build,
  4 new agents (release/security/quant/concierge).
- `53ed7822` dead-session rebuild, launcher wrappers, raise sub-64K models.

## 2026-07-07 — Tier I (partial): phone push + GitHub reach

- **Phone push (ntfy)**: `src/server/notify.ts` — `notifyPhone()`, fire-and-forget.
  Config in `~/.hermes/.env`: `HERMES_NTFY_TOPIC` (unset = disabled),
  `HERMES_NTFY_SERVER` (default https://ntfy.sh), `HERMES_NTFY_TOKEN` (optional).
  Important events ONLY: refuted verification (P5), goal done/failed (P4),
  blocked worker (P4, throttled 1/10min per process), watchdog alerts (P5,
  shell-side in `hermes-watchdog.sh`).
- **GitHub watcher**: `scripts/hermes-github-watch.sh`, called from lifecycle
  sweep. Polls notifications API with the keychain token
  (`security find-generic-password -s "GitHub - https://api.github.com" -w`).
  All new → Discord; reasons review_requested/mention/security_alert/assign →
  phone push. State: `~/.hermes/logs/github-watch-state.json`.
  Disable: `HERMES_GITHUB_WATCH=0`.
- Gmail integration BLOCKED on Google OAuth credential (user to provide).
  Multi-machine parked (PC unavailable).

## 2026-07-07 — Tier I: Gmail integration live

- One-time OAuth: `scripts/hermes-gmail-auth.mjs` (fixed port 8765 — web-type
  client needs registered redirect URI `http://127.0.0.1:8765/`; user added as
  test user on consent screen). Token: `~/.hermes/google-token.json` (600).
- Watcher: `scripts/hermes-gmail-watch.mjs` in lifecycle sweep. Unread INBOX →
  Discord digest; Gmail IMPORTANT/starred → phone push. State:
  `~/.hermes/logs/gmail-watch-state.json`. Disable: `HERMES_GMAIL_WATCH=0`.
- Consent app in Testing mode: refresh token may expire after 7 days — if
  watcher goes quiet, re-run auth script or publish consent screen to
  Production.
