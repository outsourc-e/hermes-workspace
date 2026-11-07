# Fleet agents — index

> Single table for all 10 `ops/agents/` profiles: schedule → runner → channel → outputs → battery → runbook. Companion: `ops/config/cos-staff.txt` (roster), `docs/ops/test-suite.md` (batteries), `docs/ops/model-policy.md` (model).

| Agent | Schedule | Runner | Channel | Research glob / outputs | Battery | Runbook |
|---|---|---|---|---|---|---|
| competitor-scout | 01:30 daily | `run-night-agent.sh` | `#competitors` | `<D>-competitor-scout.md` | SR (test-scout-radar.sh) | [runbook](./competitor-scout.md) |
| customer-watcher | 02:15 daily | `run-night-agent.sh` | `#customers` | `<D>-customer-watcher.md` | SR | [runbook](./customer-watcher.md) |
| product-intel | 02:45 daily (LIGHT/DEEP) | `run-product-intel.sh` | `#product-intel` (+`#approvals` drafts) | `<D>-product-intel[-delta].md` + KB | TP | [runbook](./product-intel.md) |
| partner-radar | 03:00 daily | `run-night-agent.sh` | `#partners` | `<D>-partner-radar.md` | SR | [runbook](./partner-radar.md) |
| chief-of-staff | 05:15 daily | `run-chief-of-staff.sh` | `#morning-brief` + `#approvals` | `<D>-chief-of-staff.md` + proposals | CS | [runbook](./chief-of-staff.md) |
| fleet-health-monitor | 06:15 daily | `run-fleet-health.sh` | `#fleet-health` → `#night-runs` | `<D>-fleet-health.md` | FH | [runbook](./fleet-health-monitor.md) |
| watchdog | — (deprecated) | — | — | — | — | [runbook](./watchdog.md) |
| crm-sync | as-run | manual pipeline | `#crm-sync` | snapshot reports | — | [runbook](./crm-sync.md) |
| doc-agent | as-run | manual | `#approvals` | SOC drafts | — | [runbook](./doc-agent.md) |
| orchestrator | interactive | `kanban.sh` + Conductor | `#approvals` | board moves | TK/TS | [runbook](./orchestrator.md) |

Supporting jobs (no agent profile): `twenty-backup` 00:15 → `ops/backups/twenty/` · `pre-night-check` 01:00 (gates + queues 5 cards) · `kanban-reconcile` 06:40 · `post-night-check` 06:45 · `buzz-kanban-sync` every 15 min · `buzz-relay` + `hermes-workspace` KeepAlive.

## Clarifications (2026-10-13)
- **watchdog vs fleet-health-monitor**: watchdog is deprecated; fleet-health owns the digest. `KEY_watchdog` remains only as Buzz-key fallback.
- **crm-sync / doc-agent**: intentionally unscheduled (destructive / review-gated). Scheduling either requires a battery first.
- **orchestrator rituals**: cadence description, not automation — except the night slices above.
- **night-qwen profile**: retired with Qwen (Sep 18); directory removed Oct 13. `qwen-night-{start,stop}` launchd jobs retired to `ops/launchd/retired/` (script gone, both exit 127).
- **All runners use `ternary-bonsai-2-27b:q2_0` @ `:8555`** via `ops/config/model.env` (locked 2026-10-11). Stale Qwen/`browser_*` strings in prompts fixed 2026-10-13.

## Phase 4 spike decision (2026-10-13): keep launchd executors

Probe: `GET /api/hermes-jobs` returns **12 live gateway jobs** (KRITIS syncs,
Shadow AI vacuum/distiller, Lusha-Twenty sync, topic digest) — none with the
`ops:<agent>:` prefix, so night-agent cards show "Manual only" while a shadow
fleet runs invisibly to ops scripts. Gateway job model is
`{name, prompt, skills[], script, schedule}` executed by the gateway agent
itself — it cannot run the night pipeline (file locks, kanban sqlite, Twenty
GraphQL shaping, Buzz CLI posts, KB/Obsidian writes, exit-code contracts).
Migrating nights to gateway cron would mean reimplementing all of that in
gateway semantics. **Decision: option (b)** — launchd stays the executor;
convergence happens in the UI (Phase 3 unified schedule view + Run=kickstart /
Pause=bootout), gateway cron stays for agent-prompt jobs. Revisit only if the
gateway gains shell-executor jobs with exit codes.
