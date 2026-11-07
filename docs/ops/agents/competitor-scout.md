# Runbook: competitor-scout

> Owner: A. Nahrgang · Model: `ternary-bonsai-2-27b:q2_0` @ `:8555` (see `ops/config/model.env`) · Profile: `competitor-scout` · Runner: `ops/bin/run-night-agent.sh competitor-scout` · Launchd: `com.ops.agent-competitor-scout` 01:30 daily · Channel: `#competitors` · Battery: `ops/bin/test-scout-radar.sh` (SR)

## What it does

Nightly web watch over `ops/config/competitors.txt` (Protecto, Nightfall AI, Harmonic Security). Produces `## Competitor Digest` with `Needs-decision` items. Read-only: never purchases, signs up, or contacts anyone.

## Inputs → outputs

| Input | Source |
|---|---|
| Target list | `ops/config/competitors.txt` (`#` comments + blanks ignored) |
| Prompt | `ops/agents/competitor-scout.md` (`{LIST}` substituted by runner) |
| Model | `PRIMARY_BASE_URL`/`PRIMARY_MODEL_ID` from `ops/config/model.env` |

| Output | Destination |
|---|---|
| Digest | `docs/ops/research/<DATE>-competitor-scout.md` (must match `## .*(Digest\|Research)`, else rc=11) |
| Prompt transcript | `ops/run/competitor-scout.prompt` |
| Channel post | `#competitors` (first 3500 chars; file is source of truth) |
| Slack mirror | `#hermes-agents` via `ops/lib/notify-slack.sh` |
| Kanban | adopts/creates `night-run: competitor-scout <DATE>` → `done`/`blocked` |

## Flags & exit codes

`FORCE=1` (bypass 00–06 window) · `TIMEOUT_SECS` (default 2700, 2 attempts) · `CUSTOMER_*` n/a.
`64` unknown agent · `5` outside window · `8` lock held · `3` empty target list · `9` timeout · `10` hermes crash · `11` digest validator.

## Debug

```bash
tail -n 20 ops/run/competitor-scout.log        # runner activity + session_id
tail -n 20 ops/run/scheduler.log               # launchd evidence
ls -t docs/ops/research/*-competitor-scout.md | head -3
bash ops/bin/model-check.sh http://127.0.0.1:8555/v1 ternary-bonsai-2-27b:q2_0
FORCE=1 TIMEOUT_SECS=120 bash ops/bin/run-night-agent.sh competitor-scout  # supervised rerun
bash ops/bin/test-scout-radar.sh               # SR01–SR12 battery
```

## Known failures

| Symptom | Cause → fix |
|---|---|
| `warn: both models down` | `:8555` proxy down → `bash ops/bin/gemma-server.sh start` |
| `FAIL digest format missing` rc=11 | model returned prose — rerun supervised; persistent → check prompt drift |
| Empty digest, "no news" everywhere | normal when targets quiet — not a failure |
