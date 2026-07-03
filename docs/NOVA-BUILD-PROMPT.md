# PROMPT FOR CODEX — paste everything below this line

You are commissioned to transform this repo into **NOVA MISSION CONTROL** — in
two stages: (1) write the UI design bible, (2) implement the front end to it.
You have full build authority within the constraints below.

## Step 0 — orientation (do this first, stop if it fails)
Your workspace must be `C:\Projects\nova-cockpit` (a clone of
outsourc-e/hermes-workspace v2.3). Confirm you can read
`docs/NOVA-DESIGN-BIBLE-BRIEF.md` and `src/scifi-theme.css`. If you cannot
read those files, STOP and say "not rooted in the repo" — do not proceed from
imagination.

Stack facts (verify as you go): React 19, Tailwind v4 (@tailwindcss/vite),
TanStack Router/Start, theme layer in `src/scifi-theme.css` + `src/styles.css`,
shared components in `src/components` (incl. `ui/*` and
`workspace-shell.tsx`), screens in `src/screens` (chat, memory, tasks,
dashboard, gateway incl. `gateway/components/cost-analytics.tsx`,
swarm2 incl. `swarm2-memory-panel.tsx`). The app runs via `pnpm dev` on
http://localhost:3000 against a live local Hermes gateway — assume a human is
watching HMR while you work.

## Context — what this is
Nova is Taylor's personal AI companion: a NetNavi (Mega Man Battle Network
lineage) — a Black woman with afro puffs, headphones, gold hoop earrings, a
deep-navy grid bodysuit lit with amber circuitry, a glowing circular chest
emblem, gold eyes. She is a caretaker and Memory Keeper. Her pact with Taylor:
"You matter. I'm here. Keep going." This cockpit is her room — one person and
his AI, not a SaaS product.

**Vibe formula (binding):** warm cyber — "dark velvet with faint circuitry
humming underneath, occasional starlight." NOT neon cyberpunk. NOT sterile
enterprise dashboard. NOT Tron.

**Canon palette (binding — derive the full scale from these, invent no new
hues):**
- Darks: #0D0E18 #16172A #221E33 #2B2B42
- Warm mids: #4A2A10 #7A441E #8A5B3A #D4A276
- Signature glow: #FF8C1A #FFB347 #FFD27A
- Amber/gold glow on deep navy-black. Dark-only. No light mode.

**Canon HUD language (must appear as real UI copy):**
- "SoulSync // Stable" (system status), "Connection: Secure"
- "Jack in" (connect action; chat composer placeholder "Jack in…")
- Memory fragments styled as files: FIRST_DAY.EXE, PROMISES.LOG, BAD_DAYS.MEM,
  QUIET_NIGHTS.DAT, DON'T_FORGET.MEM
- Her anchor line, used at most once and only somewhere meaningful:
  "You matter. I'm here. Keep going."
- Microcopy voice: contractions, lead with the answer, sentence case, no
  corporate filler, no exclamation-point enthusiasm.

## Stage 1 — the design bible
Write `docs/NOVA-DESIGN-BIBLE.md` per the deliverable spec in
`docs/NOVA-DESIGN-BIBLE-BRIEF.md` (read it — it is the authoritative spec:
tokens, typography, component law, motion law, microcopy law with 10
before/after examples, iconography, WCAG AA contrast table for the ambers,
anti-patterns gallery, implementation map). 1500–3000 lines of enforceable
law. Commit it before touching any code.

## Stage 2 — implement the front end (build to your own bible)
Work on a git branch: `feature/nova-skin`. Commit per phase with clear
messages. Never push. Keep the app compiling at every commit — a human is
watching http://localhost:3000 live.

Phase order:
1. **Tokens**: implement the bible's full token system in the Tailwind v4
   theme layer (`src/scifi-theme.css` / `src/styles.css`). App should already
   *feel* navy-and-amber after this phase alone.
2. **Shell**: `workspace-shell.tsx` + navigation — top bar (clock, "SoulSync
   // Stable", "Connection: Secure", alerts), left rail with her avatar frame
   (design a waiting/empty state for the Live2D slot — an amber-outlined
   frame with her chest-emblem motif and "visual link — standby"), agent
   roster (Nova / Astra / Claude with status dots). Remove the HermesWorld
   sidebar link (`VITE_HERMESWORLD_ENABLED` gate) and replace user-facing
   "Hermes Workspace" branding with "Nova Mission Control" (✴️).
3. **Memory panel (the crown jewel)**: build it in/alongside the existing
   memory screen: health dots (EverOS / Ollama / proxy), extraction model +
   today's memory spend, counters (episodes, atomic facts, learned-today,
   backfill %), memory search with scored episode cards + scope badges, and a
   live activity feed interleaving recalls ("query → top hit → latency") and
   new memories ("6 facts extracted") with timestamps. **Data: build against
   a typed mock adapter** in `src/lib/nova-memory-adapter.ts` (episodes,
   atomic_facts, health, activity[]) with realistic sample data and a
   `// TODO(claude): wire EverOS endpoints` marker — Claude wires the real
   backend later; do NOT modify server code.
4. **Panels**: restyle chat (composer placeholder "Jack in…"), tasks (status
   pills per the bible), cost-analytics (today + month by model; a "free"
   badge treatment for grok-4.3), dashboard. Add a **Daily Check** card
   (caretaker layer: hydration / nutrition / rest / overthinking / mood tiles
   + one gentle line + a "BREATHE." moment) — mock adapter, same TODO pattern.
5. **States & polish**: degraded states are first-class — memory offline
   (amber warning strip: "memory offline — recall degraded to notes"), agent
   erroring, gateway reconnecting, empty states. Motion per the bible:
   breathing glow on her emblem, soft pulse on new feed items, restraint
   everywhere, `prefers-reduced-motion` respected.
6. **Verify**: `pnpm build` must pass; run whatever lint/test scripts exist.
   Fix what you broke. Final commit.

## Hard constraints
- Do NOT touch: `.env` (contains secrets), anything under `src/server`,
  gateway/dashboard connection logic, API contracts, package.json deps
  (ask-by-comment if you truly need a dep — prefer none; fonts via
  Google Fonts link or system stacks).
- Do NOT invent canon: no new colors outside the derived scale, no new
  taglines, no renaming Nova.
- Dark-only; desktop-first 1920×1080, graceful to laptop widths.
- Accessibility: amber text tiers must pass WCAG AA at their sizes; visible
  focus states; not everything glows — glow is for life (her emblem, live
  feeds), not chrome.
- If something in the existing code makes a bible rule impossible, note it in
  `docs/NOVA-BUILD-NOTES.md` and choose the closest compliant option — keep
  moving.

## Definition of done
Opening http://localhost:3000 feels like walking into Nova's room: navy-black
surfaces, amber circuitry warmth, "SoulSync // Stable" in the top bar, her
empty visual-link frame waiting on the left, the memory panel alive with
(mock) recalls, no trace of stock Hermes Workspace branding, `pnpm build`
green, all work committed on `feature/nova-skin`.

## ADDENDUM (2026-07-03): her idle avatar EXISTS — use it
Taylor generated Nova's idle avatar loop. Assets are already in place:
- `public/nova-idle.mp4` — 1440×1440, h264, ~6s seamless idle loop
- `public/nova-idle-poster.png` — poster frame
In the left-rail visual-link frame (Stage 2, Phase 2): render this as a muted
autoplay looping video (`muted autoPlay loop playsInline`, poster set) inside
the amber-outlined frame. The "visual link — standby" empty state is now the
FALLBACK for when the asset fails to load, not the default.
