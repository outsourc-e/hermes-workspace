# HermesWorld — Final Demo Script

Status: **ship-ready, branch local-only on `feat/agent-view-port-from-controlsuite`** at HEAD `cc257b9f7`.
Worker: `hermes.playground.cf-worker.v2-hibernation` deployed.

---

## Pre-record (5 min)

1. Hard refresh both tabs (`Cmd+Shift+R`) so the latest bundle loads.
2. Window 1280×720 or 1920×1080 — close DevTools.
3. System notifications muted, Do Not Disturb on.
4. Reset progress (DevTools → Application → Local Storage → delete `playerProfile`, then refresh) for a fresh tutorial run.
5. Open Map screen once before recording to warm the assets.
6. Mute toggle should be **OFF** — narration auto-plays per world.
7. Verify multiplayer hub:
   ```bash
   curl https://hermes-playground-ws.myaurora-agi.workers.dev/health
   # {"ok":true,"online":N,"ts":...}
   ```

---

## 90-second shot list

| # | Beat | Time | Notes |
|---|---|---|---|
| 1 | Title screen — show **HermesWorld** gold serif title, "the agent MMO" tagline, premium gold "Enter the Realm" CTA | 0:00 – 0:08 | Type your name. Click Customize Avatar briefly to show the Sims-lite picker, then close. |
| 2 | Click "Enter the Realm" → land in **Training Grounds**. Narration auto-plays (~12s). | 0:08 – 0:18 | Slow camera orbit on the central **Hermes statue** with stone-tile plaza, braziers, banners, and practice dummies in the Trainer's Ring. |
| 3 | Press F to enable focus mode (eyeball glows). Mouse-drag to rotate camera. Walk to **Athena** at the Arrival Circle. | 0:18 – 0:25 | Note the **objective arrow** in the top-center HUD pointing to Athena. |
| 4 | Talk to Athena → accept first quest → claim Hermes Sigil. | 0:25 – 0:32 | Quest tracker on the right ticks. |
| 5 | Run to **Trainer's Ring** with practice dummies + weapon racks. Press 1 (Strike), 2 (Dash), 3 (Bolt) on the Glitch Wisp. | 0:32 – 0:42 | Action bar shows cooldowns. |
| 6 | Press **4 (Summon)** — a glowing purple familiar orbits you. (Hermes Summoning skill.) | 0:42 – 0:48 | "Summoner of the Forge" title unlocks if you trigger this in the Forge. |
| 7 | Visit **Quartermaster Tent** (Dorian) → buy Training Blade + Novice Cloak. | 0:48 – 0:54 | Avatar updates with knight cuirass + sigil + tasset + gauntlets + greaves. |
| 8 | Visit **Archive Podium** (Iris) for the docs/memory beat. | 0:54 – 0:60 | Modal explains Hermes Memory in plain English. |
| 9 | Walk to **Forge Gate** with banners + brazier. Step through. Forge intro plays. | 0:60 – 0:70 | Cyan-flame braziers + Hermes statue + floating data motes. |
| 10 | **Switch to second tab** (already running). Show both characters in same world, chat between them. | 0:70 – 0:82 | Speech bubbles appear over heads. Player count chip turns green with "2 players". This proves multiplayer is real. |
| 11 | Open **Map** (`M` key). Show the world graph: Training Grounds → Forge → Agora → Grove → Oracle → Arena. | 0:82 – 0:88 | Hover each — show locked/unlocked badges. |
| 12 | End on slow zoom-out from the **Hermes statue** in Training Grounds with banners + braziers + floating sparkles + your knight avatar. | 0:88 – 0:95 | Title overlay or just let it breathe. |

**Total**: ~95 seconds.

---

## Talking points for voice-over (replace the auto-narration if recording your own)

1. **Title screen**: "Hermes Workspace turns agent onboarding into a multiplayer RPG. This is **HermesWorld** — a 3D realm where you don't read about Hermes, you play it."
2. **Training Grounds**: "Six worlds. Each one teaches a real Hermes Agent skill. Movement, equipment, chat, memory, summoning, diplomacy."
3. **Combat**: "Engineering: detect the issue, choose the right tool, clear the blocker. The Glitch Wisp is a stand-in for every flaky API or noisy prompt."
4. **Familiar**: "Summoning: spawn sub-agents on demand to extend your reach without bloating your context. This familiar represents that pattern."
5. **Knight gear**: "Your gear maps to your Hermes loadout. Each piece changes both your stats and your silhouette in the world."
6. **Multiplayer**: "Real multiplayer over Cloudflare Durable Objects. Other Hermes builders walking the same Agora as you. Chat, presence, world-scoped fan-out."
7. **End**: "HermesWorld. The fastest way to teach builders what Hermes Agent actually feels like."

---

## What's covered (Hermes 6 Skills audit)

| Skill | In game | Where |
|---|---|---|
| **Promptcraft** | ✅ | Forge build dialog, Athena's lessons |
| **Worldsmithing** | ✅ | Forge entry, Forge Shard quest |
| **Summoning** | ✅ | Action bar key 4, Forge Summon quest |
| **Engineering** | ✅ | Trainer's Ring, Glitch Wisp combat |
| **Oracle** | ✅ | Oracle Temple, riddle quest |
| **Diplomacy** | ✅ | Agora quest: meet a live player + chat with them |

All six covered.

---

## Multiplayer test plan (re-verify before recording)

1. Open tab A: http://localhost:3005/playground (or 3006).
2. Open tab B: http://localhost:3006/playground (different origin = clean isolation).
3. Walk both into Training Grounds.
4. Chat header chip in both tabs: **green dot · 2 players · live**.
5. Type "hi" in tab A → bubble over your head in A, message in chat panel A, bubble over the same player in B's view, message in chat panel B.
6. Background tab A for 60 seconds. Tab B's view of A should persist.
7. Close tab A entirely. Tab B should remove the avatar within ~1s (sendBeacon leave).

---

## Known shipping checklist

| | |
|---|---|
| Title screen — HermesWorld branding, gold serif, premium feel | ✅ |
| Mouse drag camera (left/right/middle) + wheel zoom | ✅ |
| Avatar customizer (Sims-lite) | ✅ |
| Knight armor on local + remote players | ✅ |
| Hermes statue + braziers + banners (Training, Agora, Forge, Grove, Oracle, Arena) | ✅ |
| Stone-tile plazas (Training + Agora) | ✅ |
| Practice dummies + weapon racks at Trainer's Ring | ✅ |
| Audio system (synth ambient + SFX + per-world voice narration) | ✅ |
| Action bar: Strike / Dash / Bolt / Summon | ✅ |
| 5-step Hermes tutorial chain + 2 bonus quests (Wisp, Diplomacy, Summoning) | ✅ |
| HUD: avatar card + objective arrow + chat header live count | ✅ |
| Focus mode (F) | ✅ |
| Map (M) | ✅ |
| 6 enterable buildings in Agora | ✅ |
| Multiplayer: HTTP polling + WS + BroadcastChannel | ✅ |
| Cloudflare Worker hub (hibernation API) | ✅ |
| pnpm build clean | ✅ |

---

## When you're ready to push

```bash
cd /Users/aurora/.worktrees/hermes-playground-local
git log --oneline feat/agent-view-port-from-controlsuite ^origin/main
# ~15 commits

git push origin feat/agent-view-port-from-controlsuite

gh pr create \
  --title "HermesWorld: agent MMO with full multiplayer" \
  --body "$(cat memory/goals/2026-05-03-playground-training-grounds/HERMESWORLD-FINAL-DEMO-SCRIPT.md)"
```

Worker is already deployed. No additional `wrangler deploy` needed unless `playground-ws-worker/src/worker.ts` changes again.

---

## Last troubleshooting card

| If… | Then… |
|---|---|
| Chat chip says LOCAL-ONLY | Check Network tab: are POST /presence requests to the workers.dev URL succeeding? |
| Player avatar disappears | Check `__hermesPlaygroundLiveCount` in console — server prune is now 12s, hibernation API survives bg-tabs. Should be solid. |
| Narration silent | Click anywhere first (browsers gate audio). Check 🗣️ button isn't muted. |
| Quest stuck | `localStorage.removeItem('playerProfile'); location.reload()` |
| Forge Gate locked | Complete all 5 training quests first. |
| WS hub down | `curl https://hermes-playground-ws.myaurora-agi.workers.dev/stats` |
