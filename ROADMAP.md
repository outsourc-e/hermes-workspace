# ClawSuite Ship Roadmap
_Updated: 2026-03-07 19:46 EST_
_Source: 4 external audits + internal punch list_

## ✅ Done (2026-03-07)
- [x] Chat duplication fix — singleton event bus + text-based dedup (`e939e97`, `075b473`)
- [x] False Retry fix — removed optimistic ID trigger (`075b473`)
- [x] Update check crash on packaged installs (`fe95ac1`)
- [x] Session friendly names — `agent:main:cron:UUID` → "Cron Task" (`a01747d`)
- [x] Model name humanizer — `anthropic/claude-sonnet-4-5` → "Claude Sonnet 4.5" (`a01747d`)
- [x] Audit docs saved to `docs/` (`a01747d`)

## 🔴 P0 — Ship Blockers
- [ ] **Dashboard loading skeletons** — stale "0" tokens, "—" model on first load
- [ ] **Auth default hardening** — open access when no password set (file ops, terminal, updates exposed)
- [ ] **First-run wizard rewrite** — outcome-first, not gateway-first
- [ ] **Agent sidebar unification** — merge gateway sessions + CLI agents into one list

## 🟠 P1 — Critical UX
- [ ] **Chat status language** — "Queued"→"Sent", "Offline"→"Reconnecting", hide Retry unless failed
- [ ] **Mission state persistence** — move from React useState to Zustand+persist (missions die on nav)
- [ ] **Stop deleting sessions on mission complete** — patch status instead of DELETE
- [ ] **Connection error taxonomy** — clear states: auth required, rejected, pairing, unreachable
- [ ] **6 redundant EventSource connections** — consolidate to shared singleton client-side
- [ ] **Usage sidebar UX** — human-readable labels, progress bars, contextual help

## 🔵 P2 — Polish
- [ ] **Break up agent-hub-layout.tsx** (8,756 lines → extract by domain)
- [ ] **Break up chat-composer.tsx** (2,303 lines)
- [ ] **Dashboard loading shimmer on metric cards**
- [ ] **Splash screen fast-dismiss on gateway:health-restored**
- [ ] **Context bar label visibility**
- [ ] **Developer mode toggle** — one switch for tool messages, reasoning, verbose metadata
- [ ] **In-app diagnostics card** ("Why not connected?")
- [ ] **Empty states with action-oriented next steps**
- [ ] **Move Debug out of primary nav**
- [ ] **Keyboard shortcuts discoverable from UI**
- [ ] **Cron error investigation** (pre-compaction handoff, evening wrap-up)

## 🟣 Ship Requirements
- [ ] **Bundle OpenClaw inside Electron** — users won't have Node.js
- [ ] **Windows .exe build** — run `electron:build:win` on PC2 (100.122.180.1)
- [ ] **Wire electron-updater** — auto-updates via GitHub Releases
- [ ] **Code signing** — skip for beta ($99 Apple + $200 Windows)

## 🔒 Security (before public beta)
- [ ] Require auth by default OR restrict to localhost when no password
- [ ] Lock down `/api/update-check` (git pull + npm install from UI)
- [ ] Lock down `/api/local-setup` (global package install)
- [ ] Remove browser `--no-sandbox` + CSP stripping from default path
- [ ] Add `Secure` flag to session cookies
- [ ] Session persistence (currently in-memory Set, dies on restart)

## 📊 Code Health
- [ ] Formalize gateway payload types (too much `any`)
- [ ] Remove duplicate terminal panel implementations
- [ ] Resolve PWA contradiction (service workers nuked on boot)
- [ ] Enforce design system (dark-only docs but light mode exists)
- [ ] Add test coverage for privileged + stateful flows
- [ ] Clean up Tauri scaffold (unused, Electron is active path)
