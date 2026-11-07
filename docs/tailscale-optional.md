# Tailscale (Optional) — Multi-Device Access

Hermes runs **local-only by default**: gateway `:8642`, dashboard `:9119`, and
workspace `:3001` all bind to loopback and all health checks probe
`127.0.0.1`. You do **not** need Tailscale for single-machine use.

Enable Tailscale only when another device (phone, tablet, second machine)
must reach this Mac's Hermes stack.

## 1. Install & log in

```bash
# macOS (GUI, recommended): install "Tailscale" from the App Store, launch it, log in.
# CLI alternative:
brew install tailscale
sudo tailscaled  # if the daemon isn't running
tailscale up     # prints a login URL on first run
tailscale ip -4  # note your tailnet IP, e.g. 100.85.50.87
```

## 2. Point Hermes at the tailnet IP

```bash
# Gateway must listen on all interfaces (it does by default):
grep API_SERVER_HOST ~/.hermes/.env   # want: API_SERVER_HOST=0.0.0.0
# If it shows a specific IP, change it to 0.0.0.0, then:
hermes gateway restart
```

In `~/hermes-workspace/.env` (workspace side, pre-start config) or
`Settings → Connection` (persisted to `~/.hermes/workspace-overrides.json`,
takes effect immediately):

```env
HERMES_API_URL=http://<TAILNET_IP>:8642
HERMES_DASHBOARD_URL=http://<TAILNET_IP>:9119
```

Both URLs must use the tailnet IP — setting only one leaves the other
probing `127.0.0.1` from the remote device and failing (see README
remote-access section).

## 3. Enable tailnet health checks (opt-in)

```bash
# in ops/config/net.env, uncomment the tailnet overrides:
#   MAC_TS_IP=<TAILNET_IP>
#   HERMES_GW_URL=http://<TAILNET_IP>:8642
#   WORKSPACE_URL=http://<TAILNET_IP>:3001>
#   TAILNET_OPTIONAL=1
export TAILNET_OPTIONAL=1   # also honoured by ops-status.sh / run-fleet-health.sh
```

## 4. Re-enable the keepalive job (opt-in)

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ops.tailscale-alive.plist
launchctl kickstart -k gui/$(id -u)/com.ops.tailscale-alive
tail -n 5 ~/hermes-workspace/ops/run/tailscale-alive.log
```

To go back to local-only: `launchctl bootout gui/$(id -u)/com.ops.tailscale-alive`
and re-comment the `net.env` overrides.

## 5. Verify from the remote device

```bash
curl -sf http://<TAILNET_IP>:8642/health   # {"status":"ok",...}
curl -sf http://<TAILNET_IP>:9119/api/status
```

Then open `http://<TAILNET_IP>:3001` in the remote browser and complete
onboarding — the connection probe will use the tailnet IP.
