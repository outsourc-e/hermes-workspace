# Run Hermes Workspace as a user service

Hermes Workspace can run without keeping a terminal open. The helper below installs a **user-level** service, not a system-wide root service.

## Prerequisites

```bash
pnpm install
pnpm build
cp .env.example .env # if you have not configured it yet
```

Set at least the same environment you use for `pnpm start`, for example:

```bash
export HERMES_API_URL=http://127.0.0.1:8642
export HERMES_DASHBOARD_URL=http://127.0.0.1:9119
export HERMES_API_TOKEN=...
```

## Install

```bash
chmod +x scripts/install-dashboard-service.sh
scripts/install-dashboard-service.sh
```

Defaults:

- `HOST=127.0.0.1`
- `PORT=3000`
- `NODE_ENV=production`
- command: `pnpm start`

Override them inline if needed:

```bash
PORT=3123 HOST=127.0.0.1 scripts/install-dashboard-service.sh
```

## macOS launchd

The installer writes:

```text
~/Library/LaunchAgents/com.hermes.workspace.plist
```

Useful commands:

```bash
launchctl print gui/$(id -u)/com.hermes.workspace
launchctl kickstart -k gui/$(id -u)/com.hermes.workspace
tail -f logs/hermes-workspace.out.log logs/hermes-workspace.err.log
```

## Linux systemd user service

The installer writes:

```text
~/.config/systemd/user/hermes-workspace.service
```

Useful commands:

```bash
systemctl --user status hermes-workspace
journalctl --user -u hermes-workspace -f
systemctl --user restart hermes-workspace
```

If you need the service after logout on Linux, enable lingering once:

```bash
loginctl enable-linger "$USER"
```

## Uninstall

```bash
scripts/install-dashboard-service.sh uninstall
```

## Security note

Do not bind to `0.0.0.0` unless `HERMES_PASSWORD` and your reverse-proxy/auth setup are configured. Workspace exposes files, terminals, and agent controls, so loopback is the safe default.
