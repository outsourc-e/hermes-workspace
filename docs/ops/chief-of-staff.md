# chief-of-staff — Vice-CEO Agent · Morning Brief · Approval Bridge

> Version 1.3 · 2026-10-11 · Owner: A. Nahrgang · Model: `ternary-bonsai-2-27b:q2_0` @ Ollama :11434 proxied to :8555 (unified primary+fallback+aux, see `model-policy.md`)
> Companion docs: [system-operations-manual.md](./system-operations-manual.md) ·
> [product-intel-agent.md](./product-intel-agent.md) · Tests: [test-chief-of-staff.md](./test-chief-of-staff.md) · [model-policy.md](./model-policy.md)

---

## 1. Role

`chief-of-staff` (CoS) is the **personal assistant, chief of staff and deputy CEO** agent of
the one-person company behind AI-Protect / PrivacyScrubber / private projects.

- **Nightly brain:** runs at **05:15 on the Gemma fleet** (`chief-of-staff` profile, `ternary-bonsai-2-27b:q2_0` @ Ollama :11434 proxied to :8555 per `ops/config/model.env` / `model-policy.md`), analyzes everything that happened the previous day + overnight, checks off
  every subordinate agent, and produces the **Morning Brief**. Unified fleet since 2026-10-11 (Qwen retired).
- **Always-awake deputy:** reachable 24/7 for interactive questions via Tailscale +
  voice (see §5).
- **Fleet hierarchy:** all agents report to CoS (roster in `ops/config/cos-staff.txt`);
  it verifies their digests, escalates misses, and consolidates needs-decision items.

## 2. Nightly cycle (`ops/bin/run-chief-of-staff.sh`, launchd 05:15)

| Phase | What happens | Output |
|---|---|---|
| 0 HARVEST | Check ✅/❌ reactions on open feature proposals in #approvals; create GitHub issues for approved ones; write outcomes file | `ops/run/cos-harvest-<date>.json` |
| 1 INPUTS | Dump all Buzz channels since last run; export Twenty CRM company names; run `cos-github-sweep.sh` | `run/cos-inputs-<date>/`, `cos-github-snapshot.json` |
| 2 GENERATE | Compose prompt from `ops/agents/chief-of-staff.md`; run `hermes --profile chief-of-staff -t web,file` on Gemma fleet `ternary-bonsai-2-27b:q2_0` @ :8555 (unified fallback, 40-min watchdog, `ops/config/model.env`) | brief draft |
| 3 VALIDATE | Enforce exact 7-section contract + ≥3 proposal blocks + every roster agent mentioned | exit 11 on violation |
| 4 PUBLISH | Copy to `docs/ops/research/<date>-chief-of-staff.md` + Obsidian `Intelligence/Morning-Brief/` + Buzz **#morning-brief** + **Slack #hermes-agents (AI Protect Slack)** + macOS notification | published brief |
| 5 PROPOSE | Parse the 3 Proposal blocks → post each to **#approvals** + **Slack #hermes-agents** as its own message → record event_id/title/repo/body-file in `run/cos-proposals/proposals.jsonl` | trackable proposals |

### Morning Brief contract (sections are validated, never optional)

```
# Morning Brief — <date>
## 1. AI Product Update & Outlook
## 2. Customers · Partners · Competition
## 3. Suggestions — New Customers & Partners      (exactly 3 customers + 3 partners)
## 4. Active Development Projects (GitHub)        (from snapshot only)
## 5. Agent Fleet Report                          (✅/🔴 per roster agent + needs-decision items)
## 6. Tech & Business Review                      (short synthesis + CoS learning note)
## 7. Feature Proposals for Approval              (exactly 3, parseable format)
```

## 3. Feature-proposal → GitHub bridge

1. CoS proposes: each proposal becomes one Buzz message in `#approvals` **and** one Slack message in **AI Protect Slack #hermes-agents** (1:1 mirror via `ops/lib/notify-slack.sh`, fire-and-forget, never blocks the night job).
   (title, target repo, rationale, issue body with acceptance criteria).
2. You react ✅ (approve) or ❌ (reject) in Buzz Desktop. Slack is notify-only — harvesting still happens from Buzz reactions (Slack reactions are not harvested).
3. Next night, phase 0 harvests verdicts:
   - approved + repo assigned → `ops/bin/cos-feature-to-github.sh` creates the issue
     (`gh`, labels `chief-of-staff,feature-proposal`), posts the issue URL as a threaded reply;
   - rejected → marked, never re-proposed as-is (CoS learning input);
   - repo `unassigned` or not in active snapshot → held, surfaced in next brief §7.
4. Ledger: `ops/run/cos-proposals/proposals.jsonl` (append-friendly, status per proposal).

### Which repos may receive issues?

Auto-discovery (`ops/bin/cos-github-sweep.sh`): owned **non-fork** repos pushed within
`push_window_days` (default 14), minus the BLOCKLIST in `ops/config/cos-repos.txt`,
capped at `max_active_projects`. The bridge refuses any repo outside the current snapshot
(no surprises, ever).

## 4. Self-learning signals

| Signal | Feeds |
|---|---|
| Approved vs rejected proposal patterns (harvest file) | future §7 proposals |
| Cadence misses per agent (fleet report history) | reliability notes, escalation to #incidents |
| "CoS learning note" line in §6 | explicit daily self-critique |
| Brief sections you act on (reactions/replies in #morning-brief) | emphasis tuning over time |

## 5. Always-on reachability & voice (24/7 via Tailscale)

**Phone (S23, always online in tailnet):**
Hermes Workspace PWA → `http://100.85.50.87:3001` → session `chief-of-staff`.
Voice: composer mic icon (Web Speech API). Add to Home Screen for app-like use.

**Mac (Holdor dictation):**
Holdor.app is running with watched-apps mode — focus the browser tab with the PWA chat
(or a terminal running `ops/bin/cos-chat.sh`) and speak; Holdor types into the focused app.
Recommended: add your browser to Holdor's watched apps for hands-free briefing dialogue.

**Model policy (unified Gemma fleet since 2026-10-11):** all sessions run on `ternary-bonsai-2-27b:q2_0` @ `http://127.0.0.1:8555/v1` via `~/.hermes/config.yaml` + `ops/config/model.env`; unified same-model fallback (Hermes retries on 429/503/unreachable). Day and night share the same Ollama proxy server. To force a specific model: `hermes config set model` inside the session.
If the :8555 server dies: `ops/bin/gemma-server.sh start` (Qwen-era rollback artifacts kept per `model-policy.md §6`).

**Interactive wrapper:** `ops/bin/cos-chat.sh` opens/continues the dedicated
`chief-of-staff` session (day model). Voice instructions land as text either way — the CoS
system context lives in this repo; paste-referencing files works via the chat tools.

## 6. Configuration reference

| File | Purpose |
|---|---|
| `ops/config/cos-staff.txt` | Staff roster: `agent\|channel\|cadence\|output-dir`. Fleet check-off source of truth |
| `ops/config/cos-repos.txt` | GitHub settings (window/max/labels) + BLOCKLIST |
| `ops/run/chief-of-staff-state.json` | last_run marker |
| `ops/run/cos-proposals/proposals.jsonl` | proposal ledger (open/approved/issued/rejected) |
| `ops/secrets/agent-keys.env` | `KEY_chief_of_staff` identity keypair |
| `ops/secrets/slack.env` | `SLACK_HERMES_AGENTS_WEBHOOK_URL` or `SLACK_BOT_TOKEN`+`SLACK_HERMES_AGENTS_CHANNEL` (600, never commit) |
| `ops/lib/notify-slack.sh` | Slack 1:1 mirror to AI Protect Slack #hermes-agents (webhook or bot, see `.env.example`) |
| launchd `com.ops.agent-chief-of-staff` | 05:15 daily (Gemma fleet, before post-night-check 06:45) |

Buzz identities/channels: `#morning-brief` created by `buzz-bootstrap.sh` (idempotent);
CoS posts under its own keypair; approval drafts live in existing `#approvals`. Every Buzz post is mirrored 1:1 to Slack #hermes-agents — Slack is notify-only, Buzz remains source of truth for harvesting.

## 7. Failure modes

| Symptom | Cause | Action |
|---|---|---|
| exit 2 primary+fallback down | window missed / model unreachable | `ops/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0 --completion`; restart `ops/bin/gemma-server.sh start` |
| exit 11 section missing | model broke contract | inspect `run/chief-of-staff.log` + partial output; tighten template example; rerun |
| Proposals stuck "open" forever | you haven't reacted | react in Buzz Desktop; next night harvests |
| "FAIL repo not in active snapshot" at bridge time | repo went stale (>14d no push) or blocklisted | push or remove from blocklist; approve again next cycle |
| No buzz dumps in inputs | relay down at 05:15 | watchdog flags missing digests; brief still built from remaining inputs ("no data" discipline) |

## 8. First-run checklist

1. ✅ `buzz-bootstrap.sh` re-run (creates #morning-brief, verifies chief-of-staff identity)
2. Approve the chief-of-staff agent profile in Buzz Desktop (cosmetic, like other agents)
3. Tonight: automatic first cycle at 05:15 → verify Morning Brief in #morning-brief + Obsidian
4. React ✅/❌ on tomorrow morning's 3 feature proposals → confirm auto-issue creation the following night
5. Optional: add browser to Holdor watched apps; pin PWA on phone home screen