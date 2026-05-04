# Hermes Playground — ship-ready checklist + multiplayer test plan

Status: **branch local-only on `feat/agent-view-port-from-clawsuite`** (do not push without Eric approval).
Latest commit: `13bc6e234`.

---

## 1. How to test multiplayer (5 min)

### Same-machine (fast smoke test)
1. Hard refresh the playground in your current browser tab: **Cmd+Shift+R**.
2. Open a second tab → http://localhost:3005/playground
3. Both tabs should:
   - Show each other's nameplates walking around
   - See the **online count chip** in the HUD increment to 2
   - Receive each other's chat messages (press `Enter` in chat)
4. Same-browser presence runs over BroadcastChannel + WS, so this works even with no network.

### Cross-device (real multiplayer)
1. Phone or second machine on **any network** (LAN or cellular).
2. From your dev Mac, expose 3005 — **easiest options**:
   - `tailscale serve --bg http://localhost:3005` → use the printed `https://aurora.tail***.ts.net` URL.
   - Or just use the public WS hub directly: anyone running their own copy of Playground will already meet you in the same shared world (the WS hub is global, the dev server is local-only).
3. With the `.env` we just wrote, both clients connect to:
   `wss://hermes-playground-ws.myaurora-agi.workers.dev/playground`
4. Verify in the browser console: you should see one WebSocket connection to that URL and **no fallback to BroadcastChannel-only** (transport indicator shows "ws" or "both").

### Verify hub health from CLI
```bash
curl https://hermes-playground-ws.myaurora-agi.workers.dev/health
# → {"ok":true,"online":N,"ts":...}

curl https://hermes-playground-ws.myaurora-agi.workers.dev/stats
# → {"online":N,"byWorld":{...},"peakToday":N,"peakDay":"..."}
```

---

## 2. What's wired up

| Surface | Status |
| --- | --- |
| Mouse camera (left/right/middle drag, wheel zoom) | ✅ |
| Hermes statue + braziers + banners | ✅ Training, Agora, Forge, Arena |
| Practice dummies + weapon racks | ✅ Trainer's Ring |
| Knight-styled NPCs (helmet/plume/sword sheath) | ✅ Trainer, Recruiter, Hermes |
| 5-step Hermes tutorial chain | ✅ |
| Quest education panels (Hermes lesson + Why it matters) | ✅ |
| Action bar (Strike/Dash/Bolt) + cooldowns | ✅ |
| Glitch Wisp training enemy | ✅ |
| HUD: minimap, quest tracker, equip/inventory, HP/MP/SP/XP | ✅ |
| Audio: Web Audio synth ambient + SFX, mute toggle | ✅ |
| Multiplayer presence (BroadcastChannel + WS) | ✅ |
| Public WS hub (Cloudflare Worker + Durable Object) | ✅ live |
| `.env.example` wired to public hub | ✅ |
| Local `.env` written for this dev session | ✅ |
| `pnpm build` clean | ✅ |

---

## 3. Pre-record checklist

- [ ] Cmd+Shift+R the playground tab to load latest build.
- [ ] Window 1280×720 (or 1920×1080) — close DevTools.
- [ ] System notifications muted, Do Not Disturb on.
- [ ] In-game audio toggle ON (the synth ambient is genuinely good).
- [ ] Reset progress for a clean tutorial run (DevTools → Application → Local Storage → delete `playerProfile`, then refresh).
- [ ] Open the Map screen once before recording so assets are warm.
- [ ] Test mouse pan: left-click drag rotates, wheel zooms — both should feel snappy.
- [ ] Open a 2nd tab to confirm online count chip lights up.

---

## 4. Showcase flow (mirrors `iterations/006-showcase.md`)

| # | Beat | Time |
| --- | --- | --- |
| 1 | Title screen → display name → avatar → enter Training Grounds | 5s |
| 2 | Slow orbit on **Hermes statue** at the center of Training Grounds | 5s |
| 3 | Talk to Athena → accept first quest | 8s |
| 4 | Trainer's Ring: practice dummies + weapon racks + Glitch Wisp duel using `1` `2` `3` | 12s |
| 5 | Quartermaster Tent → equip Training Blade + Novice Cloak | 6s |
| 6 | Archive Podium (Iris, docs/memory beat) | 6s |
| 7 | Walk to **Forge Gate** → portal payoff | 5s |
| 8 | Forge: cyan-flame braziers, Pan + Chronos build dialog | 8s |
| 9 | Map screen showing world graph | 4s |
| 10 | Open second tab → multiplayer nameplate visible | 6s |
| 11 | Quick cuts: Grove, Oracle, Arena (with Hermes referee + caduceus + 6-brazier ring) | 12s |
| 12 | End on slow zoom-out from the Hermes statue with banners + braziers | 5s |
| **Total** | | **~80s** |

---

## 5. Known limitations to call out (or hide)

- Branch is **not pushed** — anyone cloning the repo today won't see iterations 003–006 yet.
- Forge/Grove/Oracle interiors are functional but less dense than Training/Agora.
- Ground textures are flat color — fine for video, slightly thin in still screenshots.
- WS hub free tier on Cloudflare Workers — fine for hackathon traffic, not battle-tested at scale.
- LLM dialog requires `VITE_PLAYGROUND_LLM_CHAT=1` — default is offline-first scripted dialog (intentional).

---

## 6. If something breaks during recording

| Symptom | Fix |
| --- | --- |
| Camera frozen / left-drag dead | Cmd+Shift+R; check console for WS errors; mouse-look effect is in `playground-world-3d.tsx` ~L939 |
| Multiplayer nameplate missing | Check Network tab for `wss://hermes-playground-ws.*/playground`; `.env` must be loaded by Vite (restart dev if needed) |
| Audio dead | Click anywhere first (browsers gate audio behind user gesture); check mute toggle in utility dock |
| Quest stuck | Try `localStorage.removeItem('playerProfile'); location.reload()` |
| WS hub down | Falls back to BroadcastChannel — same-browser MP still works |
| Forge Gate locked | Finish all 5 tutorial steps; `playerProfile.questProgress` flags it |

---

## 7. Push readiness

When Eric explicitly OKs a push:
```bash
cd /Users/aurora/.worktrees/hermes-playground-local
git log --oneline feat/agent-view-port-from-controlsuite ^origin/main
# Expect: ~6 commits including 0134c1b13, e2ff6bb05, c9268f77a, 94f861f6b, 13bc6e234

git push origin feat/agent-view-port-from-controlsuite
gh pr create --title "Hermes Playground: Training Grounds + multiplayer" \
             --body "$(cat memory/goals/2026-05-03-playground-training-grounds/iterations/006-showcase.md)"
```

Branch must NOT be pushed without explicit Eric approval.
