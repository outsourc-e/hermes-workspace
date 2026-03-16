# ClawSuite Product Roadmap
_Last updated: 2026-02-27_

---

## Phase 1 — Cloud Install (CURRENT PRIORITY)
Get new users running without needing to set up a local gateway.
- Cloud-hosted gateway option (no local setup required)
- One-click onboarding wizard
- Works on any device, no technical knowledge needed

---

## Phase 2 — Free Tier / Growth Engine
**"ChatGPT but connected to your life"**

### The Hook
Free plan gives users:
- Clean chat UI (ChatGPT-like, no friction)
- Unlimited context + persistent memory across sessions
- Connect their apps/services (GitHub, Notion, Vercel, etc.)
- Multi-agent missions (basic)

### Free vs Paid
| Feature | Free | Pro |
|---------|------|-----|
| Chat (GPT-like) | ✅ | ✅ |
| Persistent memory | ✅ | ✅ |
| App integrations | Limited (2-3) | Unlimited |
| Local model support | ❌ | ✅ |
| Multi-agent missions | Basic | Full |
| Goal-guided sessions | ❌ | ✅ |
| Custom agents | ❌ | ✅ |

### Marketing Angle
> "ChatGPT with access to your apps, services, unlimited context, and memory that actually helps you finish things."

---

## Phase 3 — Goal-Guided Sessions ("OpenClaw for Dummies")
**For non-technical users who want AI to guide them, not just answer them.**

### Core Concept
When a user starts a new session, they set a goal. The app:
1. Picks the best model for that goal automatically
2. Guides them through decisions with choice cards instead of a blank prompt box
3. Handles compaction silently — saves progress, resumes next session
4. Walks them toward completion step by step

### Model Routing by Goal
- 🔬 Research → best context window model
- 🌐 Build something → best coder model
- ✍️ Write/create → best creative model
- 📊 Analyze → best reasoning model
- 💬 Just chat → balanced/fast model

### Decision Cards (key UX innovation)
Instead of overwhelming users with a blank prompt, the AI surfaces structured choices at the right moment:
> "You want to build a website. First, pick a host:"
> **[Vercel]** **[Netlify]** **[Self-host]** **[Help me decide]**

Then guides them through each step — domain, framework, deployment — all via conversation + guided cards.

### Compaction for Dummies
- Before context limit: auto-saves goal + progress as handoff
- Next session auto-loads: "Welcome back — you were building X, last step was Y. Continue?"
- User never loses work or context

### Why This Beats ChatGPT
| ChatGPT | ClawSuite Goal Mode |
|---------|---------------------|
| Blank box, figure it out | Goal-first, app guides you |
| One model, always | Best model auto-selected per task |
| Context dies silently | Compaction handled, progress saved |
| No memory between sessions | Full persistent memory |
| No multi-agent | Spawn specialists mid-session |
| No app integrations | Connect GitHub, Vercel, Notion, etc. |

### Tagline
> "Set a goal. ClawSuite picks the best AI, walks you through every decision, and never forgets where you left off."

---

## Build Order
1. ✅ Core ClawSuite features (shipped in v3.0.0)
2. 🔄 Cloud install / hosted gateway (current)
3. ⬜ Free tier + growth funnel
4. ⬜ Goal-guided sessions + decision cards
5. ⬜ App integrations marketplace

---

## Cloud Infrastructure R&D (2026-02-27)

### Decision: Coolify + Hetzner
- **Hosting:** Hetzner VPS (CX32 ~€9/mo handles 50-200 users)
- **Orchestration:** Coolify (open source PaaS, has REST API for programmatic deploys)
- **Routing:** Traefik (built into Coolify) + wildcard SSL via Cloudflare DNS challenge
- **Subdomain pattern:** `user123.gateway.clawsuite.app` per user
- **Auth:** Simple signup API → calls Coolify API → spins gateway container → returns URL
- **Sizing:** 0-50 users CX22 (€4), 50-200 CX32 (€9), 200-500 CAX41 (€19)
- **Also look at:** Elestio (managed hosting for OSS apps, could shortcut provisioning infra)

### UX Pattern ("magic install")
- No terminal ever for cloud users
- Signup → paste API key → auto-connects → land in chat UI
- Behind the scenes: gateway container auto-provisioned via Coolify API
- Same pattern as n8n Cloud, Flowise Cloud, AnythingLLM Cloud

### Desktop + Mobile App Distribution
- **Tauri v2** already configured: dmg (Mac), nsis (Windows), appimage (Linux)
- **CI/CD:** `.github/workflows/release.yml` — push tag → builds all platforms → GitHub Release
- **Identifier:** `io.buildingthefuture.clawsuite`
- **Missing for cloud:** CSP needs `connect-src` updated to allow cloud gateway URLs (not just localhost)
- **iOS/Android:** Tauri Mobile (beta) — needs `tauri-plugin-mobile`, separate build targets
- **App Stores:** Mac App Store needs Apple signing certs + notarization. Windows needs code signing cert. iOS needs Apple Dev account ($99/yr). Android needs Google Play ($25 one-time).
- **Auto-update:** Tauri updater plugin — point at GitHub Releases, signs updates with existing TAURI_SIGNING_PRIVATE_KEY

### Next Steps (Cloud MVP)
1. Hetzner CX32 + Coolify install
2. Wildcard DNS `*.gateway.clawsuite.app` → Hetzner IP
3. Verify OpenClaw gateway runs headless in Docker
4. Simple provisioning API (Node/Bun)
5. ClawSuite onboarding: "Connect to cloud" flow
6. Update CSP to allow cloud URLs
7. Desktop: update release workflow with proper signing
8. Mobile: scope Tauri Mobile vs PWA vs separate React Native app
