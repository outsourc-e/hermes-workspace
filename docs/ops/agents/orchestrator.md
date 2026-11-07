# Runbook: orchestrator (interactive)

> Owner: A. Nahrgang · Profile: `orchestrator` · Schedule: **none — interactive/on-demand** · Spec: `ops/agents/orchestrator.md`

## What it does

Fleet coordinator prompt: Kanban (`Backlog→Ready→Running→Review→Done` via `ops/bin/kanban.sh`), Conductor missions, worker supervision, approval gates. Owns `buzz-kanban-sync.sh` conceptually (the 15-min board↔Buzz mirror). The `DAILY RITUAL` times in the spec (06:30…22:00) describe an operating cadence, not automated jobs — only the night slices are mechanized (see scheduled agents).

## Debug

```bash
bash ops/bin/kanban.sh list | head -n 20
tail -n 10 ops/run/buzz-kanban-sync.json 2>/dev/null; tail -n 5 ops/run/sync.log
bash ops/bin/test-buzz-kanban.sh  # TK/TS series cover the board+sync mechanics
```
