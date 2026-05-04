# Iteration 006 — World theming pass + Showcase script

Commit: `e2ff6bb05` (mouse fix) + `c9268f77a` (Hermes/knight theming) — local-only
Build: `pnpm build` clean ✅

---

## What shipped

### Mouse camera (left-click pan fix)
- **Left-click drag now rotates the camera** (yaw + pitch), matching arrow keys.
- 5px movement threshold so plain clicks still hit NPCs and quest zones.
- Right-click and middle-click drag still work (immediate, no threshold).
- Wheel still zooms.
- Help text updated: "Drag with mouse to rotate camera · wheel to zoom".

### Hermes / knight theming
- **HermesStatue** — winged-petasos hero centerpiece with chlamys cape, caduceus staff, and winged sandals. Glowing inscription ring at the base. Anchors **Training Grounds** + **Agora Commons**.
- **PracticeDummy + WeaponRack** — wooden practice dummies with stitched X-faces and racks holding spear/sword/Hermes-shield. Lined up around the **Trainer's Ring** (3 dummies + 2 racks).
- **HermesBanner** — pole + colored cloth + winged sigil dot. Flanks the Forge Gate (Training Grounds), Arrival Circle, Agora colonnade entrances (4), Forge entry (2), and Arena gates (4).
- **Brazier** — animated flame + soft point light. Rings the central statue (Training Grounds + Agora), the Forge floor, and the Arena duel medallion (6-pt ring around the medallion).

### Knight-styled NPCs
- **Trainer (Leonidas) / Recruiter (Cassia)** — plumed centurion helmet, breastplate disc, hip sword sheath, plus existing shoulder armor + tools.
- **Hermes (Arena referee)** — winged petasos, breastplate disc, glowing chlamys cape, caduceus staff in offhand, hip sword sheath.
- These read as knights/mythic at distance now — no more anonymous boxy NPCs in the central zones.

---

## Per-map showcase script (for the video)

> Use this as your scene list. Each map gets ~30–60 seconds.

### 1. Training Grounds — "First steps with a Hermes Agent"
**What it teaches:** core onboarding loop — talk to NPCs, equip gear, pick up your first quest, complete the Hermes tutorial chain (move/talk → equip → chat → archive/docs → forge build).

**Showcase moves:**
- Open on the **Hermes statue** at center. Slow camera orbit (right-click drag).
- Pan to **Trainer's Ring** with the practice dummies + weapon racks + Leonidas in plumed helmet.
- Approach **Athena · Guide** at Arrival Circle, accept the first quest.
- Run the action bar: `1` Strike on the Glitch Wisp, `2` Dash, `3` Bolt.
- Visit **Quartermaster Tent** (Dorian) → buy / equip Training Blade + Novice Cloak.
- Walk to **Archive Podium** (Iris) for the docs/memory beat.
- End on the lit **Forge Gate** with banners flanking it.

**Talking points:** "This is the Hermes Agent onboarding — every quest maps to a real Hermes concept: prompts, memory, docs, building, deploying."

---

### 2. Agora Commons — "Where humans and agents mingle"
**What it teaches:** social plaza, interior buildings (Tavern, Bank, Smithy, Inn, Apothecary, Guild Hall), specialized NPCs.

**Showcase moves:**
- Open on the **Hermes statue + colonnade** with banners at the 4 entrances and braziers around the statue.
- Quick swing past each NPC: Athena (Sage), Apollo (Bard), Iris (Messenger), Nike (Champion), Midas (Banker, gold crown), Cassia (Recruiter, plumed helmet), Selene (Tavern), Dorian (Quartermaster).
- Enter one interior — recommend **Smithy** (rose-pink door) — to show the door-trigger interior system.
- Pick up the **Athena's Scroll** quest at her position.

**Talking points:** "The Agora is the public square — multiplayer presence, shared chat, and named buildings act as separate scenes you can step into."

---

### 3. The Forge — "Where prompts harden into tools"
**What it teaches:** the post-tutorial builder world — neon cyberpunk vibe, Pan (Hacker) + Chronos (Architect), Forge Shard quest.

**Showcase moves:**
- Enter through the Forge Gate portal in Training Grounds.
- Open on the cyan-flame **Forge braziers** at the 4 corners, banners on the side walls, **TechPillars** glowing.
- Approach Pan and Chronos — show the dialog-driven build flow.
- Trigger the **Forge Shard** quest zone in the back.

**Talking points:** "This is the builder realm — once your agent has the basics, you graduate from training into actually shipping tools."

---

### 4. The Grove — "Music, ritual, and community"
**What it teaches:** softer social/creative world. Pan (Druid), Apollo (Songkeeper), Artemis (Tracker).

**Showcase moves:**
- Travel via map after unlocking (`forge-shard` required).
- Show the **bioluminescent forest** circle of trees + mossy center ring.
- Trigger **Song of the Grove** quest.

**Talking points:** "Not every agent task is engineering — Grove represents the creative side: music, content, rituals, group experiences."

---

### 5. Oracle Temple — "Quiet archive of lore and memory"
**What it teaches:** Sage-style research world. Athena (Oracle), Chronos (Archivist), Eros (Whisperer).

**Showcase moves:**
- Show the floating **crystals** + outer ring of low pillars + bright accent ring.
- Hit the **Oracle's Riddle** quest.

**Talking points:** "The Oracle is your memory and search layer — long-term context, retrieval, and asking questions of your own corpus."

---

### 6. Benchmark Arena — "Models duel"
**What it teaches:** combat / evaluation world. Nike (Champion), Hermes (Referee, fully knighted with caduceus), Chronos (Bookmaker).

**Showcase moves:**
- Show the new **6-brazier ring around the duel medallion**.
- 3 tiers of stone seats around the arena (existing).
- Banners at the 4 cardinal entrances.
- Hermes the Referee should now look unmistakably mythic — petasos + cape + caduceus.
- Trigger **Enter the Duel** quest.

**Talking points:** "The Arena is where your agents fight — model duels, prompt vs prompt, eval-as-game. The Kimi Sigil unlocks here."

---

## Recording kit checklist

Before you record:
- [ ] Hard refresh the playground (Cmd+Shift+R) so the new build loads.
- [ ] Mute system notifications.
- [ ] Set window to 1920×1080 or 1280×720 native; no DevTools panel open.
- [ ] Reset progress: localStorage `playerProfile` cleared if you want a fresh tutorial run.
- [ ] Audio toggle on (the new audio system has good ambient).
- [ ] Map open + close once to prime the assets.

Suggested capture order:
1. Title + intro
2. Training Grounds — full tutorial run (longest segment)
3. Agora Commons — interior dive
4. Forge — quick build segment
5. Map screen — show the world graph
6. Oracle / Grove / Arena — fast cuts (10–20s each)
7. End on the **Hermes statue** with banners + braziers, slow zoom out

---

## Open / next

- Forge interior polish (post-tutorial world is functional but plain).
- Ground texture pass — current grass is flat. A subtle stone-tile texture under the central plazas would lift the screenshots a lot.
- Optional: knight-styled remote-player avatars (right now multiplayer presence reuses the basic player silhouette).
- WS hub deploy decision still pending.

## Watchouts
- Branch is still **local-only** — do not push without explicit Eric approval.
- Crons remain disabled.
