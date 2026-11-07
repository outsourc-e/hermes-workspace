# Runbook: crm-sync (on-demand)

> Owner: A. Nahrgang · Profile: `crm-sync` · Runner: `ops/bin/*` pipeline steps (manual) · Schedule: **none — as-run only** · Channel: `#crm-sync` · Spec: `ops/agents/crm-sync.md` (10-line stub)

## What it does

Twenty nightly pipeline spec: pre-snapshot → dry-run `:3100` → diff → prod `:3000` → verify, rollback on mismatch. Report `PASS/FAIL rows/duration/snapshot`.

## Scheduling decision (2026-10-13)

Deliberately **not** on launchd: CRM writes are destructive and need a human in the loop (staging `:3100` itself has been down since ~Sep 1). If you schedule it later: add a launchd job + a `test-crm-sync.sh` battery first, and revive staging.

## Debug

```bash
ls -t ops/backups/twenty/twenty-prod-*.dump | head -3   # pre-snapshot artifacts
curl -sf -m5 -X POST http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}'
```
