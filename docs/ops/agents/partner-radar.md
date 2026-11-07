# Runbook: partner-radar

> Owner: A. Nahrgang · Model: `ternary-bonsai-2-27b:q2_0` @ `:8555` (see `ops/config/model.env`) · Profile: `partner-radar` · Runner: `ops/bin/run-night-agent.sh partner-radar` · Launchd: `com.ops.agent-partner-radar` 03:00 daily · Channel: `#partners` · Battery: `ops/bin/test-scout-radar.sh` (SR)

## What it does

Partner API/SDK/program/event watch over `ops/config/partners.txt` (currently TrueFoundry only). Signals: new APIs, SDK releases, program changes, co-marketing, events. Produces `## Partner Digest` with `Opportunities spotted`.

## Inputs → outputs

Targets from `ops/config/partners.txt`; otherwise identical pipeline to competitor-scout (`## .*(Digest|Research)` validator, research md, `#partners`, Slack, kanban).

## Flags & exit codes

Same as scout (64/5/8/9/10/11, `3` empty list).

## Debug

```bash
cat ops/config/partners.txt                  # empty (comments only) → SKIPPED run is healthy, not a failure
tail -n 20 ops/run/partner-radar.log
bash ops/bin/test-scout-radar.sh              # SR05 covers partner substitution
```

## Known failures

| Symptom | Cause → fix |
|---|---|
| No digest for a date | check `partners.txt` — empty list intentionally skips; otherwise model/proxy issue like scout |
