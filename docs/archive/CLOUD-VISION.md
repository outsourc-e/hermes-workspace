# ClawSuite Cloud — Full Product Vision
_Captured: 2026-02-27_

---

## The Product

**ChatGPT with memory, app connections, multi-agent, and your own AI stack.**

Works for:
- Complete beginners (no gateway, no local setup, just sign up)
- Power users (bring own keys, local models, self-hosted gateway)
- Teams (shared workspace, multiple agents, mission control)

---

## User Tiers

### Free
- Cloud-hosted gateway (no local setup required)
- Auto model: OpenRouter free tier (Llama 3.3 70B, Gemma 3 27B, Qwen3 Coder — all free, 128k-262k ctx)
- Persistent memory across sessions
- Basic app connections (1-2 integrations)
- Rate limited (X messages/day)

### Pro ($X/mo)
- Larger message quota
- Access to better models (Sonnet, GPT-4o via ClawSuite credits)
- Full app integrations
- Multi-agent missions
- Goal-guided sessions
- Priority gateway (faster, dedicated)

### BYOK (Bring Your Own Keys)
- Connect own OpenAI / Anthropic / OpenRouter key
- No usage billing — you pay providers directly
- Full feature access
- Works with local models (Ollama on their machine)

### Self-hosted (existing power users)
- Local gateway (current ClawSuite)
- Full control, no cloud dependency
- Desktop + mobile via LAN QR or Tailscale

---

## Model Strategy

### Free tier default stack (OpenRouter, zero cost to us):
| Use case | Model | Context |
|----------|-------|---------|
| General chat | meta-llama/llama-3.3-70b-instruct:free | 128k |
| Coding | qwen/qwen3-coder:free | 262k |
| Long context | qwen/qwen3-next-80b-a3b-instruct:free | 262k |
| Fast/cheap | google/gemma-3-27b-it:free | 131k |
| Vision | nvidia/nemotron-nano-12b-v2-vl:free | 128k |

### Pro tier (we buy wholesale, sell at margin):
- Claude Sonnet (Anthropic API)
- GPT-4o (OpenAI API)
- Gemini Pro (Google API)
- Auto-routing: cheapest model that fits the task

### BYOK:
- User pastes their OpenRouter/OpenAI/Anthropic key
- Stored encrypted in their gateway container
- We never see it, never proxy it

---

## Architecture

```
clawsuite.app
  ├── Web app (SvelteKit — already built)
  ├── Desktop app (Tauri — already built, Mac/Win/Linux)
  ├── Mobile app (PWA first, then Tauri Mobile / App Store)
  │
  └── Cloud Backend
        ├── Auth API (signup/login/OAuth)
        ├── Provisioning API → calls Coolify API → spins gateway per user
        ├── Billing API (Stripe — free tier limits + Pro subscription + usage metering)
        ├── OpenRouter proxy (for managed model access + usage tracking)
        │
        └── Hetzner VPS (Coolify)
              ├── gateway-user001 → user001.gateway.clawsuite.app
              ├── gateway-user002 → user002.gateway.clawsuite.app
              └── ... (auto-provisioned per signup)
```

---

## Mobile Connect Flow (no Tailscale required)

### Cloud users:
1. Sign in at clawsuite.app on phone
2. Auto-connects to their cloud gateway
3. Done — no QR, no IP, no config

### Local gateway users (LAN QR):
1. Desktop ClawSuite shows QR
2. Phone scans → opens clawsuite.app/join?token=xyz
3. Token authenticates → connected on same WiFi
4. No Tailscale needed

### Remote local gateway users:
1. Desktop generates shareable link: clawsuite.app/join/eric (persistent)
2. Requires Tailscale OR cloud relay
3. Cloud relay: traffic goes through ClawSuite relay server (like ngrok/Cloudflare Tunnel)

---

## Revenue Model

| Source | How |
|--------|-----|
| Pro subscriptions | $X/mo flat, Stripe |
| Usage credits | Buy API credits from us (we buy wholesale at volume discount) |
| Team plans | Per-seat pricing for shared workspaces |
| BYOK users | Pay flat Pro fee, use their own keys (no usage billing) |

**Unit economics on managed models:**
- Anthropic gives volume discounts at scale
- We charge users a small markup (~20-30%) for convenience
- Free tier uses OpenRouter free models = $0 cost to us

---

## Build Order (Cloud MVP)

### Phase 1 — Foundation (Week 1-2)
- [ ] Hetzner CX32 + Coolify installed
- [ ] Wildcard DNS `*.gateway.clawsuite.app` + SSL
- [ ] OpenClaw gateway Docker image (verify headless operation)
- [ ] Simple provisioning API: POST /signup → Coolify API → gateway URL

### Phase 2 — ClawSuite Integration (Week 2-3)
- [ ] "Sign in to ClawSuite Cloud" flow in app
- [ ] CSP update: allow `*.gateway.clawsuite.app`
- [ ] Auto-connect after signup (no manual gateway URL)
- [ ] OpenRouter free model as default (zero config for new users)
- [ ] BYOK settings screen (paste OpenAI/Anthropic/OpenRouter key)

### Phase 3 — Billing + Free Tier (Week 3-4)
- [ ] Stripe integration
- [ ] Free tier rate limiting
- [ ] Pro plan upgrade flow
- [ ] Usage tracking per user

### Phase 4 — Mobile (parallel)
- [ ] PWA manifest + service worker (1 day, works immediately)
- [ ] LAN QR connect (removes Tailscale requirement for local users)
- [ ] Cloud users: just sign in, auto-connected

### Phase 5 — Goal Mode + Polish (post-launch)
- [ ] Session goal setting
- [ ] Auto model routing by goal
- [ ] Decision cards UI
- [ ] App Store submissions (iOS/Android)
