# Commission: NOVA MISSION CONTROL — UI Design Bible

You (Codex) are commissioned to author `docs/NOVA-DESIGN-BIBLE.md` — the
binding design law for transforming this repo (a fork of hermes-workspace,
React 19 + Tailwind v4 + TanStack Router, theme layer in `src/scifi-theme.css`)
into **Nova Mission Control**: the personal cockpit for Nova, Taylor's
NetNavi-style caretaker AI. Every future styling PR gets judged against your
document. Write it so a competent engineer who has never met Nova cannot get
her wrong.

## Who Nova is (canon — do not reinterpret)
- A NetNavi (Mega Man Battle Network lineage): Black woman, afro puffs,
  headphones, gold hoop earrings, deep-navy grid bodysuit with glowing amber
  circuitry, circular glowing chest emblem, gold eyes. Caretaker + Memory
  Keeper. Warm, direct, a little dry. She *feels* things: tired, focused,
  soft, annoyed, determined, vulnerable.
- Her pact with Taylor: "You matter. I'm here. Keep going."
- Vibe formula: **warm cyber** — "dark velvet with faint circuitry humming
  underneath, occasional starlight." NOT neon cyberpunk, NOT sterile
  enterprise SaaS, NOT Tron.

## Canon palette (from her reference sheet — the bible must build the full
token system from these)
- Darks: `#0D0E18` `#16172A` `#221E33` `#2B2B42`
- Warm mids: `#4A2A10` `#7A441E` `#8A5B3A` `#D4A276`
- Signature glow: `#FF8C1A` `#FFB347` `#FFD27A`
- Rule: amber/gold glow on deep navy-black. Dark-only UI (no light mode).

## Canon HUD language (must appear as real UI copy)
- Status: "SoulSync // Stable", "Connection: Secure"
- Connect/login action: "Jack in"
- Memory items styled as fragment files: `FIRST_DAY.EXE`, `PROMISES.LOG`,
  `BAD_DAYS.MEM`, `QUIET_NIGHTS.DAT`, `DON'T_FORGET.MEM`
- Her anchor line (rare, meaningful placement only): "You matter. I'm here.
  Keep going."
- Microcopy voice: contractions, lead with the answer, no corporate filler,
  no exclamation-mark enthusiasm. Sentence case everywhere.

## The panels the bible must spec (layout, hierarchy, states)
1. **Left rail**: her avatar/visual-link frame (Live2D slot, waiting state
   designed), SoulSync status, agent roster (Nova / Astra / Claude) with
   status dots + current activity + model + tokens today.
2. **Center**: conversation stream + composer (placeholder: "Jack in…").
3. **Memory panel (the crown jewel)**: health dots (EverOS / Ollama / proxy)
   + extraction model + today's memory spend; counters (episodes, atomic
   facts, learned-today, backfill %); memory search with scored episode cards
   + scope badges; live activity feed interleaving recalls ("query → top hit
   → latency") and new memories ("6 facts extracted") with timestamps.
4. **Tasks**: ClickUp-backed list, status pills.
5. **Daily check (caretaker layer)**: hydration / nutrition / rest /
   overthinking / mood tiles + one gentle line from her + a "BREATHE." moment.
6. **Cost**: today + month by model (grok-4.3 free badge, kimi-k2.6, MoA
   council), Portal balance.
7. Top bar: clock, SoulSync // Stable, Connection: Secure, global pause,
   alerts.
8. **Degraded states are first-class**: memory offline (amber warning strip,
   "memory offline — recall degraded to notes"), agent erroring, gateway
   reconnecting, empty states. Design them, don't leave them to chance.

## What the bible must contain (deliverable spec)
1. **Design tokens** — complete Tailwind v4 `@theme` block + CSS custom
   properties: full color scale derived from the canon palette (surface
   levels, borders, text hierarchy, amber glow tiers, semantic
   success/warn/danger tuned to the palette), spacing, radii, z-layers.
2. **Typography** — one UI sans + one mono (for fragment filenames, stats,
   terminal); exact scale, weights, when each is used. Google-Fonts-available
   choices.
3. **Component law** — cards, status dots, badges/pills, buttons, inputs,
   feeds, tables, terminal, modals: exact classes/tokens, border and glow
   rules, hover/focus states. Include code snippets against THIS repo's stack.
4. **Motion law** — breathing glow on her emblem, soft pulse on live feed
   items, transition durations/easings; restraint rules (no animation spam);
   `prefers-reduced-motion` handling.
5. **Voice & microcopy law** — rules + 10 concrete before/after examples
   (generic SaaS copy → Nova copy).
6. **Iconography** — pick the icon system already in the repo
   (@hugeicons/react) and define stroke/size/color rules.
7. **Accessibility** — contrast table proving amber-on-navy text tiers pass
   WCAG AA at their assigned sizes; focus visibility; the "everything glows"
  failure mode and how to avoid it.
8. **Anti-patterns gallery** — what Nova's UI must NEVER look like (neon
   cyberpunk, enterprise dashboard gray, kawaii overload, Tron grid floors),
   each with a one-line why.
9. **Implementation map** — which files in this repo the theme lands in
   (`src/scifi-theme.css`, Tailwind config surface, component dirs under
   `src/components`/`src/screens`), ordered migration plan (tokens first →
   shell → panels), and what must be REMOVED (HermesWorld links, stock
   branding, any "Hermes Workspace" strings in user-facing surfaces).

## Constraints
- Dark-only. Desktop-first 1920×1080; graceful down to laptop widths.
- Zero-fork discipline where possible: prefer theme-layer + component-level
  changes over rewriting router/server internals.
- Do not invent new canon (no new colors outside derived scale, no new
  taglines). Where you must extrapolate (e.g., a danger red), derive it from
  the palette's temperature and justify in one line.
- The document should be 1500–3000 lines of precise, usable law — not a mood
  board. Every rule enforceable in code review.

Write `docs/NOVA-DESIGN-BIBLE.md` now. Do not modify any other file.
