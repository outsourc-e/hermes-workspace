# Mobile Setup — ClawSuite

Access ClawSuite from your phone as a native app using Tailscale for secure remote access.

## Overview

ClawSuite is a web app — no App Store needed. You access it directly from your phone's browser and add it to your home screen as a PWA. Tailscale handles the secure tunnel between your phone and the machine running ClawSuite.

## Requirements

- ClawSuite running on a desktop/server
- [Tailscale](https://tailscale.com) account (free)
- iOS or Android phone

---

## Setup Steps

### 1. Install Tailscale on the ClawSuite machine

Download and install Tailscale on the machine running ClawSuite:
- **macOS/Windows/Linux:** https://tailscale.com/download

Sign in with your Tailscale account. Once connected, note the machine's Tailscale IP (e.g. `100.x.x.x`) — visible in the Tailscale app or dashboard.

### 2. Install Tailscale on your phone

- **iOS:** [App Store](https://apps.apple.com/app/apple-store/id425072860)
- **Android:** [Google Play](https://play.google.com/store/apps/details?id=com.tailscale.ipn)

Sign in with the **same Tailscale account** as your desktop. Both devices will now share a private network.

### 3. Open ClawSuite on your phone

In your phone's browser, navigate to your ClawSuite URL using the Tailscale IP:

```
http://<tailscale-ip>:3000
```

Replace `<tailscale-ip>` with your desktop's Tailscale IP (e.g. `http://100.90.212.55:3000`).

> **Tip:** If you've set up a custom domain or reverse proxy, use that URL instead.

### 4. Add to Home Screen (optional but recommended)

Install as a PWA for a native app experience:

**iPhone / iPad:**
1. Tap the **Share** icon (box with arrow)
2. Scroll down → tap **"Add to Home Screen"**
3. Tap **"Add"**

**Android:**
1. Tap the browser menu (⋮)
2. Tap **"Add to Home screen"** or **"Install App"**
3. Confirm

---

## In-App Setup Wizard

ClawSuite includes a built-in mobile setup wizard. After 45 seconds on desktop, a prompt will appear in the bottom-right corner offering to walk you through the setup.

To trigger it manually, open ClawSuite and append `?mobile-preview=1` to the URL:

```
http://localhost:3000?mobile-preview=1
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't reach ClawSuite from phone | Make sure both devices are connected to Tailscale (check the Tailscale app — both should show as "Connected") |
| Tailscale IP not reachable | Try the machine's local IP (192.168.x.x) if on the same WiFi network |
| Page loads but auth fails | ClawSuite auth tokens are stored per-browser — you'll need to log in on mobile separately |
| PWA not installing | Make sure you're on HTTPS or localhost (some browsers block PWA install on plain HTTP) |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_PING_URL` | Optional. If set, enables anonymous daily active user pings (no PII — SHA-256 fingerprint only). Leave unset to disable telemetry entirely. |
| `NEXT_PUBLIC_APP_VERSION` | Optional. App version reported in telemetry pings. Defaults to `3.1.0`. |
