# Hermes Head Office Recovery Notes

Current working route as of 2026-05-28:

- Telegram and Workspace use Hermes gateway on `127.0.0.1:8642`.
- Hermes model config uses ChatGPT/Codex subscription through the Codex CLI app-server runtime:
  - `model.provider: openai-codex`
  - `model.default: gpt-5.5`
  - `model.openai_runtime: codex_app_server`
- Codex CLI must be installed and logged in with ChatGPT:
  - `codex login status` should print `Logged in using ChatGPT`.
- Workspace `.env` must include:
  - `HERMES_API_URL=http://127.0.0.1:8642`
  - `HERMES_API_TOKEN=<matches API_SERVER_KEY>`
- Hermes `.env` must include:
  - `API_SERVER_ENABLED=true`
  - `API_SERVER_KEY=<same token>`

## Health Check

Run this on the VPS:

```bash
cd /root/hermes-workspace
scripts/head-office-health.sh
```

Expected final line:

```text
OK: Head Office is operational
```

## Important Fix

`src/routes/api/send-stream.ts` uses the gateway non-streaming `/v1/chat/completions` path for Workspace zero-fork chat, then emits one Workspace SSE chunk. This avoids the empty-response/hanging behavior observed from the gateway streaming path while preserving the browser chat UI.

## Recovery Order

1. Confirm Codex is logged in: `codex login status`.
2. Confirm gateway health: `curl -sS http://127.0.0.1:8642/health`.
3. Confirm Workspace dev server is running in tmux target `ui`.
4. Run `scripts/head-office-health.sh`.
5. Only restart the gateway if health on `:8642` fails. Preserve Telegram as the working control channel whenever possible.


## Autopilot Watchdog

The VPS runs a cheap cron watchdog every 5 minutes:

```bash
cd /root/hermes-workspace
scripts/head-office-watchdog.sh light
```

The light check does not call the model. It verifies gateway health, Workspace HTTP availability, and Codex login status.

A deep model-backed health check runs once per day and after recovery attempts:

```bash
cd /root/hermes-workspace
scripts/head-office-watchdog.sh deep
```

Logs are written to:

```text
/root/.hermes/logs/head-office-watchdog.log
```

The watchdog usually runs cheap HTTP/login checks. Deep checks run `scripts/head-office-health.sh` once per day or after failures. If health fails, it restarts only the affected runtime:

- Gateway failures restart the `gateway` tmux session with `hermes gateway run`.
- Workspace UI failures restart the `ui` tmux session with `pnpm dev`.
- If gateway is healthy but end-to-end Workspace chat fails, it restarts Workspace UI first to preserve Telegram as the control channel.


## Cadence Review

The current recommended cadence is cheap light checks every 5 minutes and deep model-backed checks daily plus after failures. If the system remains stable for a week, switch the scheduled deep check to weekly to reduce subscription usage further.
