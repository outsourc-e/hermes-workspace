# Remediation 2026-10-13 — Nightly Outage (Gateway "Down", Workspace Crash-Loop, Docker Outage)

> Date: 2026-10-13 · Owner: A. Nahrgang · Scope: Oct 6–13 cron degradation + full Oct 13 outage (gateway, workspace, models, Twenty, Buzz).
> Status: **COMPLETE — POST-NIGHT PASS 5/5, ops/tests/test-night-services.sh 20/20 PASS.**

## 1. Symptoms you saw

- `post-night.log` (Oct 9–13): `FAIL hermes gateway (http://100.85.50.87:8642)` every night; Oct 13: `FAIL gateway / FAIL gemma / FAIL twenty:3000 / FAIL buzz relay:3010`.
- Workspace UI banner: `Hermes agent not connected`; `workspace.log` (6,498 lines) repeating `ERR_MODULE_NOT_FOUND dist/server/server.js`.
- Night agents ran but degraded: `warn: both models down` (Oct 9–11, 13), `customer-watcher` hard FAIL Oct 13 (`could not fetch company list from Twenty`), `twenty-backup.log` `BACKUP FAIL pg_dump after 3 retries`, `sync.log` 342× `FAIL relay unreachable`, `buzz-relay.log` 1,270 lines of `Cannot connect to Docker daemon`.
- `fleet-health-monitor.log`: `gateway:FAIL` 5/5 days while `dashboard:PASS` 5/5.

## 2. Root causes (6 + 1 resolving itself)

| # | Cause | File:line | Evidence | Impact |
|---|-------|-----------|----------|--------|
| 1 | **Gateway probed via dead tailnet IP, not localhost.** Health scripts used `HERMES_GW_URL=http://100.85.50.87:8642` (`ops/config/net.env:3`) while Tailscale was `Stopped` (`tailscale status` → `BackendState: Stopped`). The gateway itself was healthy the whole time (`curl 127.0.0.1:8642/health` → `{"status":"ok","platform":"hermes-agent","version":"0.21.6"}`, pid 28654, `API_SERVER_HOST=0.0.0.0`, `*:8642 LISTEN`). | `ops/config/net.env:2-3`, `ops/run/post-night.log:1-32`, `ops/bin/run-fleet-health.sh:99-103` | 5 days of false `gateway:FAIL`; every downstream verdict (`POST-NIGHT FAIL`) blamed the wrong component. |
| 2 | **Installed workspace plist ran a stale production launcher.** `~/Library/LaunchAgents/com.ops.hermes-workspace.plist` executed `node run-server.js`, which imports `dist/server/server.js` — a bundle this repo layout never builds (`pnpm build` → `vite build`, no `dist/`; prod entry would be `.output/`). The repo's `ops/launchd/com.ops.hermes-workspace.plist` correctly runs `pnpm dev`. 382 restarts, exit 1. | installed plist `ProgramArguments`, `run-server.js:1`, `ops/run/workspace.log:5…` (360× same error) | `/api/gateway-status` never answered → UI showed `disconnected` even with a healthy gateway; masked cause #1. |
| 3 | **Duplicate broken supervisor.** `com.hermes.workspace` pointed at `~/Library/LaunchAgents/scripts/hermes-workspace-launcher.sh`, which does not exist (exit 127), fighting `com.ops.hermes-workspace` for port 3001. | `~/Library/LaunchAgents/com.hermes.workspace.plist`, `launchctl list` (`127 com.hermes.workspace`) | Flapping/restarts, confusing `launchctl` forensics. |
| 4 | **Gemma :8555 proxy had two bugs.** (a) Streaming path used `web.Response(body=<async-generator>)` — aiohttp requires bytes/str body; every streamed request crashed with `TypeError: sequence item 2: expected a bytes-like object, str found`. (b) Ollama NDJSON was parsed by iterating raw TCP chunks (`async for line in resp.content`), so concatenated JSON objects failed `json.loads` and content was silently dropped. | `ops/bin/gemma-server.sh:105-114` (before fix), `ops/run/gemma-8555.log` tracebacks, pid file 10694 dead | `model-check.sh` + all night agents (`both models down`) failed; only Oct 12 briefly green. |
| 5 | **Docker daemon down took out three services at once.** Twenty `:3000` runs in `twenty-server-1`, backups via `docker exec twenty-db-1 pg_dump`, and buzz relay's `_ensure-services` (postgres/minio/keycloak/prometheus) all require the daemon. | `docker ps` → `Cannot connect to the Docker daemon`, `ops/bin/twenty-backup.sh:13`, `ops/run/buzz-relay.log:1-8` | `twenty:FAIL` → backup FAIL + watcher FAIL; `buzz:FAIL` → 342× sync FAIL + crash-looping relay. |
| 6 | **Tailscale keepalive forced a tailnet dependency in local-only mode.** `com.ops.tailscale-alive` (every 5 min) + hard `LIVE_IP == 100.85.50.87` checks made `tailnet` a FAIL condition for a machine that only needs loopback. | `ops/bin/tailscale-keepalive.sh`, `~/Library/LaunchAgents/com.ops.tailscale-alive.plist`, `ops/bin/ops-status.sh:20-26` | Local-only operation could never be green while Tailscale was stopped. |
| 7 | **(Self-healed)** Buzz relay `:3010` and Twenty containers recovered on their own once the daemon returned (KeepAlive + `restart` policies); no code change needed. Verified `buzz-relay TCP listening 127.0.0.1:3010` and `twenty-server-1 (healthy)`. | `ops/run/buzz-relay.log` tail, `docker ps` | — |

Why it went unnoticed: Telegram/Slack notifiers were never configured (`TELEGRAM-SKIP`/`SLACK-SKIP` every fleet run), so no alerts fired for 5 days; and `startHermesAgent()` (`src/server/hermes-agent.ts:196-200`) reports `ok:true` even when the gateway never becomes healthy, so the UI `Start Agent` button gave false reassurance.

## 3. Design corrections

- **Local-only by default, tailnet opt-in.** `net.env` now points at `127.0.0.1` with tailnet values kept as commented overrides + `TAILNET_OPTIONAL=1` flag. `run-fleet-health.sh` reports `tailnet: SKIP` (not FAIL) unless opted in; `ops-status.sh` prints `SKIP tailnet check`; `com.ops.tailscale-alive` unloaded. Multi-device setup documented in `docs/tailscale-optional.md`.
- **Single supervisor per service.** Stale `com.hermes.workspace` unloaded; installed `com.ops.hermes-workspace.plist` synced with repo (verified by test).
- **Proxy correctness.** `StreamResponse + prepare() + write()` for SSE; `readline()`-framed NDJSON parsing. Note for future: thinking models stream `message.thinking` with empty `content` until reasoning finishes — always test completions with a realistic token budget (a `max_tokens=16` probe truncates mid-thought and looks like an empty-reply bug).
- **`keep-alive.sh` deprecated** to delegate to `pnpm dev` when the legacy `dist/` bundle is absent, instead of infinite crash-looping.

## 4. Changes made 2026-10-13 (verifiable)

| Area | File | Change | Verification |
|------|------|--------|--------------|
| Config | `ops/config/net.env` | localhost defaults; tailnet as commented opt-in + `TAILNET_OPTIONAL` | `test-night-services.sh`: `net.env gateway URL is localhost` PASS |
| Health | `ops/bin/ops-status.sh` | default GW `127.0.0.1`; tailnet section SKIP unless opt-in; staging `:3100` marked retired (dead since ~Sep 1, not in nightly ops) | `ops-status.sh`: OK gateway/dashboard/twenty/buzz/gemma, SKIP tailnet |
| Health | `ops/bin/run-fleet-health.sh:99-125` | `tail_rc` tri-state (0/1/2→PASS/FAIL/SKIP), probed only when `TAILNET_OPTIONAL=1` | next fleet run writes `tailnet: SKIP` |
| Proxy | `ops/bin/gemma-server.sh:105-151` | StreamResponse SSE; readline NDJSON framing | `model-check.sh … PASS`; stream + non-stream completions return content |
| Supervisor | `~/Library/LaunchAgents/com.ops.hermes-workspace.plist` | synced with repo (`pnpm dev`), reloaded (pid 94983, status 0) | `/api/gateway-status` → `mode=zero-fork`, all capabilities true |
| Supervisor | launchd | unloaded `com.hermes.workspace` (exit 127) and `com.ops.tailscale-alive` | `launchctl list` clean |
| Helpers | `keep-alive.sh`, `ops/bin/tailscale-keepalive.sh`, `ops/bin/cos-chat.sh` | deprecation/opt-in headers; localhost voice URL | — |
| Docs | `docs/tailscale-optional.md` | install/login → bind `0.0.0.0` → set both URLs → `TAILNET_OPTIONAL=1` → re-enable keepalive → verify | — |
| Tests | `ops/tests/test-night-services.sh` | 20 checks across gateway/workspace/models/twenty/buzz/config (see §5) | **20/20 PASS** |

## 5. Regression suite

`ops/tests/test-night-services.sh [--tap]` — run after any infra change or before declaring the night green. Covers: gateway health + token parity + dashboard `gateway_running`; workspace launchd status + `zero-fork` + plist sync + no `run-server` + stale supervisor absent; Ollama tags + proxy models + **non-empty non-stream AND streaming completions** (the two proxy bugs); Docker daemon + Twenty GraphQL + today's dump + dump non-empty; relay `:3010` + `TCP listening` in log; `net.env` localhost + `tailscale-alive` unloaded (both skipped when `TAILNET_OPTIONAL=1`). Exit 0 only on zero FAILs.

## 6. Remaining follow-ups (not this outage)

- Twenty staging `:3100` containers (`staging-*`, twenty v1.23.4, restart policy `no`) stopped ~6 weeks ago — start or delete intentionally; currently only noted in `ops-status.sh`.
- Configure `ops/secrets/telegram.env` / `slack.env` so the next 5-day red streak pages someone.
- `POST /api/start-all` false-positive (`ok:true` on failed start) still open upstream in `src/server/hermes-agent.ts`.
