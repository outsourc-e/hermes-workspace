# Runbook: fleet-health-monitor

> Owner: A. Nahrgang · Model: L1 deterministic (no LLM) + L2 optional `ternary-bonsai-2-27b:q2_0` 900s · Profile: `fleet-health-monitor` · Runner: `ops/bin/run-fleet-health.sh` · Launchd: `com.ops.fleet-health-monitor` 06:15 daily · Channel: `#fleet-health` (fallback `#night-runs`) + Telegram/Slack · Battery: `ops/bin/test-fleet-health.sh` (FH01–FH07)

## What it does

Synthesis watchdog, runs last. L1 always: probes gateway (`HERMES_GW_URL`), dashboard `:9119`, Twenty `:3000`, Buzz `:3010`, `model-check ternary-bonsai-2-27b:q2_0` → `fleet-inputs-<DATE>/health.json` + `docs/ops/research/<DATE>-fleet-health.md`. L2 replaces L1 only if output has `# Fleet Health` + `Health matrix` + `Night jobs`; otherwise keeps L1 with a degraded note (slow-model tolerant by design).

## Inputs → outputs

Reads: `health.json`, `kanban.txt`, scheduler/pre/post/primary/gemma tails, `digests.txt`, previous `fleet-inputs-*/health.json` (deltas).
Writes: research md → Buzz + `notify-telegram.sh` + `notify-slack.sh` (all fire-and-forget; require `ops/secrets/{telegram,sms}…` — currently unconfigured, so no pages fire).

## Flags & exit codes

`FORCE=1` (window 05–08) · `SKIP_LLM=1` (L1 only) · `TIMEOUT_SECS` (900) · `DRYRUN=1` (no Buzz post) · `TAILNET_OPTIONAL=1` (probe tailnet instead of SKIP) · `5` window · `8` lock.

## Debug

```bash
cat ops/run/fleet-inputs-$(date +%F)/health.json   # the matrix
FORCE=1 SKIP_LLM=1 bash ops/bin/run-fleet-health.sh # L1 only, fast
bash ops/bin/test-fleet-health.sh                   # FH01–FH07
bash ops/tests/test-night-services.sh               # overlapping service checks
```

## Known failures

| Symptom | Cause → fix |
|---|---|
| `L2 degraded rc=130/1` every day | LLM path down but L1 authoritative — investigate model, not the monitor |
| `tailnet: FAIL` (pre-2026-10-13) | old behavior; now `SKIP` unless opted in |
| No Telegram/Slack pages during red streaks | credentials never configured — see `ops/secrets/` examples |
