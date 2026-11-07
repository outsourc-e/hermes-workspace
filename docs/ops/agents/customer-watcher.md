# Runbook: customer-watcher

> Owner: A. Nahrgang · Model: `ternary-bonsai-2-27b:q2_0` @ `:8555` (see `ops/config/model.env`) · Profile: `customer-watcher` · Runner: `ops/bin/run-night-agent.sh customer-watcher` · Launchd: `com.ops.agent-customer-watcher` 02:15 daily · Channel: `#customers` · Battery: `ops/bin/test-scout-radar.sh` (SR)

## What it does

Company-only intel (funding, leadership at company level, layoffs, launches, M&A) over a Twenty-filtered company list. Companies only — never personal contact data. Produces `## Customer Digest`.

## Inputs → outputs

| Input | Source |
|---|---|
| Company list | Twenty `:3000/graphql` `companies(first:500)`, scored ICP-first then recency, kept if ICP **or** `updatedAt` ≤ `CUSTOMER_DAYS` (default 60), capped `CUSTOMER_LIMIT` (default 20); `<10` matches → top-N fallback |
| CRM key | `TWENTY_API_KEY` from workspace `.env` |
| Prompt/model | `ops/agents/customer-watcher.md` · `ops/config/model.env` |

Outputs mirror competitor-scout: `docs/ops/research/<DATE>-customer-watcher.md`, `ops/run/customer-watcher.prompt`, `#customers`, Slack mirror, kanban card.

## Flags & exit codes

Same as scout (64/5/8/9/10/11) plus **`3` CRM list unavailable** (`FAIL … could not fetch company list from Twenty` — the Oct 13 hard FAIL when `:3000` was down) and **`3` empty filtered list**.

## Debug

```bash
tail -n 20 ops/run/customer-watcher.log
curl -sf -m5 -X POST http://127.0.0.1:3000/graphql -H 'Content-Type: application/json' -d '{"query":"{ __typename }"}'  # CRM up?
CUSTOMER_LIMIT=3 FORCE=1 bash ops/bin/run-night-agent.sh customer-watcher  # supervised, small list
bash ops/bin/test-scout-radar.sh  # SR11 covers the live Twenty path (SKIP when :3000 down)
```

## Known failures

| Symptom | Cause → fix |
|---|---|
| `FAIL … could not fetch company list` rc=3 | Twenty down (usually Docker) → `open -a Docker`, verify `:3000` |
| Missing session for a date, others present | this agent failed while siblings ran — check its log + Twenty |
