# Runbook: watchdog (DEPRECATED)

> Status: **superseded by `fleet-health-monitor`** (richer L1/L2 contract, same channels). This page exists so old references resolve. No runner, no schedule.

`ops/agents/watchdog.md` (9-line stub) described a daily digest to `#approvals` covering service health + night results + new relay identities + anomalies. All of that is now owned by:

| Old watchdog duty | Current owner |
|---|---|
| Service health matrix | `fleet-health-monitor` L1 (`health.json`) — see [fleet-health-monitor](./fleet-health-monitor.md) |
| Night job results | fleet-health `## Night jobs` + `post-night-check.sh` |
| Relay anomalies | `buzz-relay.log` + `test-night-services.sh` (relay checks) |
| Digest channel | `#fleet-health` (fallback `#night-runs`) |

The `watchdog` Hermes profile and `KEY_watchdog` (used as Buzz-key fallback in `run-fleet-health.sh`) stay until the fallback is re-pointed. Do not build new automation on the watchdog name. `cos-staff.txt` still lists `watchdog|#night-runs|daily` for roster-completeness checks (soft WARN only).
