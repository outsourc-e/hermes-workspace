# ClawSuite Improvement Punch List
_Source: Live user setup/debug session — 2026-03-06_

## P0 (fix now)

### 1. ~~Handshake nonce reliability~~ ✅ FIXED
- **Commit:** `2cc5380` — single persistent handler captures challenge nonce
- **Status:** Shipped to main

### 2. Connection error taxonomy in UI
- **Problem:** "unauthorized/disconnected" messaging is ambiguous
- **Fix:** Explicit states:
  - ClawSuite auth required
  - Gateway auth rejected
  - Pairing required
  - Network unreachable
  - Handshake failed
- **Acceptance:** User can identify root cause in one screen without logs

### 3. Stale tab/session recovery
- **Problem:** Stale browser state can show false disconnected/unauthorized
- **Fix:** Stale-session detection + forced re-init banner with one-click "Reset connection state"
- **Acceptance:** Hard refresh no longer required in common stale-state cases

## P1 (next)

### 4. First-run vs returning-run indicator
- **Problem:** Onboarding tests can pass due to previously paired identity
- **Fix:** Show "Using existing paired identity: <deviceId>" vs "New pairing flow"
- **Acceptance:** Tester can verify true cold-start behavior

### 5. Session duplication clarity
- **Problem:** Duplicate-looking sessions (same channel/thread patterns) confuse users
- **Fix:** Group by canonical source + show session key and route origin
- **Acceptance:** Duplicates are understandable or deduped visually

### 6. Developer visibility preset
- **Problem:** Tool/exec visibility toggles are buried
- **Fix:** One toggle: "Developer Mode" enabling tool messages, reasoning blocks, verbose event metadata
- **Acceptance:** One click reveals full debug context

### 7. Mobile/LAN setup validator
- **Problem:** Users don't know if LAN/Tailscale/firewall path is actually reachable
- **Fix:** Setup wizard tests chosen URL from server perspective + gives explicit firewall guidance
- **Acceptance:** Successful phone access in one guided flow

## P2 (hardening/quality)

### 8. In-app diagnostics card ("Why not connected?")
- Display: gateway URL in use, auth mode, paired device id/mode, last handshake error + timestamp, retry/reset buttons

### 9. Security posture banner
- If gateway auth mode is `none` and host is network-exposed, show persistent warning + quick secure setup path

### 10. Package manager bootstrap guard
- Detect missing `pnpm`/expected PM and offer command fallback automatically

## Validation Matrix
- [ ] Fresh clone + fresh identity + fresh browser profile
- [ ] Returning identity + stale tab
- [ ] Loopback only
- [ ] LAN access
- [ ] Tailscale access
- [ ] Gateway auth `none` vs `token`
- [ ] Reconnect storm (gateway restart during active UI)
