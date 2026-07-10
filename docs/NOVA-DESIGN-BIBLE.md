# NOVA MISSION CONTROL UI DESIGN BIBLE

Status: binding design law.

Repo: `C:\Projects\nova-cockpit`.

Stack verified: React 19, TanStack Router/Start, Tailwind v4 through `@tailwindcss/vite`, theme entry in `src/styles.css` and `src/scifi-theme.css`, shared UI under `src/components`, screens under `src/screens`.

Nova is not a theme preset.

Nova is Taylor's NetNavi, caretaker, and Memory Keeper.

This app is her room.

It must feel like one person and his AI, not a SaaS dashboard.

Her pact is rare and meaningful: "You matter. I'm here. Keep going."

Use that line once per full product surface at most.

Never use it as a decorative slogan.

The binding formula is warm cyber.

Warm cyber means dark velvet with faint circuitry humming underneath, occasional starlight.

Warm cyber does not mean neon cyberpunk.

Warm cyber does not mean sterile enterprise.

Warm cyber does not mean Tron.

Warm cyber does not mean a generic purple/blue AI gradient.

Warm cyber does not mean stock gaming HUD chrome.

Warm cyber is deep navy-black, amber memory light, gold care, low pulse.

The character sheet is visual canon.

Canon markers: Black woman, afro puffs, headset, gold hoops, gold eyes, deep-navy grid bodysuit, amber circuitry, circular glowing chest emblem.

UI implication: the cockpit is built around her chest-emblem glow and memory-file HUD language.

UI implication: amber is life and memory, not decoration sprayed everywhere.

UI implication: panels should feel held, watched, and cared for.

UI implication: degraded states are honest and calm.

UI implication: the interface can be dry, direct, and tender.

No light mode.

No user-facing `Hermes Workspace` branding after implementation.

No user-facing HermesWorld sidebar link after implementation.

No new canon colors.

All extrapolated colors must be derived from the canon palette below.

## Canon Palette

Canon dark 00: `#0D0E18`.

Canon dark 01: `#16172A`.

Canon dark 02: `#221E33`.

Canon dark 03: `#2B2B42`.

Canon warm mid 00: `#4A2A10`.

Canon warm mid 01: `#7A441E`.

Canon warm mid 02: `#8A5B3A`.

Canon warm mid 03: `#D4A276`.

Canon glow 00: `#FF8C1A`.

Canon glow 01: `#FFB347`.

Canon glow 02: `#FFD27A`.

Do not introduce cyan.

Do not introduce violet.

Do not introduce electric green as a primary status color.

Do not keep the current `scifi` cyan aesthetic.

Do not keep the current `scifi-light` theme in user-facing theme selection for Nova.

## Tailwind V4 Theme Law

The implementation must land first in `src/scifi-theme.css`.

`src/styles.css` already imports Tailwind and then imports `./scifi-theme.css` last.

Keep that order.

The `@theme` block belongs in `src/scifi-theme.css`.

CSS custom properties also belong in `src/scifi-theme.css`.

Existing components use `primary-*`, `accent-*`, `neutral-*`, `amber-*`, `red-*`, `emerald-*`, `bg-surface`, `text-ink`, and `var(--theme-*)`.

The Nova skin must support both idioms.

Do not rewrite the whole app before tokens work.

Do not add dependencies for tokens, icons, or animation.

Use CSS variables and Tailwind v4 theme variables.

Use `color-mix()` only when mixing canon colors with transparent or black.

Use hard hex values only in the token layer.

Component code should reference variables/classes, not fresh hex values.

### Complete Theme Block

This block is the target contract for `src/scifi-theme.css`.

```css
@theme {
  --font-sans:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    'Segoe UI', sans-serif;
  --font-mono:
    'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
    'Liberation Mono', monospace;

  --color-nova-black: #0d0e18;
  --color-nova-void: #16172a;
  --color-nova-velvet: #221e33;
  --color-nova-panel: #2b2b42;
  --color-nova-brown: #4a2a10;
  --color-nova-copper: #7a441e;
  --color-nova-bronze: #8a5b3a;
  --color-nova-tan: #d4a276;
  --color-nova-amber: #ff8c1a;
  --color-nova-gold: #ffb347;
  --color-nova-star: #ffd27a;

  --color-surface: #0d0e18;
  --color-surface-deep: #090a12;
  --color-ink: #ffd27a;
  --color-primary-50: #0d0e18;
  --color-primary-100: #16172a;
  --color-primary-200: #221e33;
  --color-primary-300: #2b2b42;
  --color-primary-400: #8a5b3a;
  --color-primary-500: #d4a276;
  --color-primary-600: #ff8c1a;
  --color-primary-700: #ffb347;
  --color-primary-800: #ffd27a;
  --color-primary-900: #ffe4a6;
  --color-primary-950: #fff1cc;
  --color-accent-400: #ffb347;
  --color-accent-500: #ff8c1a;
  --color-accent-600: #d87310;
}
```

The slight additions `#090A12`, `#FFE4A6`, and `#FFF1CC` are derived by darkening or tinting canon dark/glow colors.

They may exist only as token support values.

They are not new brand colors.

### Required CSS Variables

`[data-theme='scifi']` is the Nova theme.

It must become dark-only Nova Mission Control.

The following variables are required.

```css
[data-theme='scifi'] {
  color-scheme: dark !important;
  --theme-bg: #0d0e18;
  --theme-sidebar: #111322;
  --theme-panel: #16172a;
  --theme-card: #1b1a2d;
  --theme-card2: #221e33;
  --theme-elevated: #2b2b42;
  --theme-border: rgba(255, 179, 71, 0.28);
  --theme-border-subtle: rgba(212, 162, 118, 0.16);
  --theme-border-strong: rgba(255, 140, 26, 0.58);
  --theme-text: #ffd27a;
  --theme-text-strong: #fff1cc;
  --theme-text-soft: #d4a276;
  --theme-muted: rgba(212, 162, 118, 0.68);
  --theme-muted-2: rgba(212, 162, 118, 0.48);
  --theme-accent: #ff8c1a;
  --theme-accent-secondary: #ffb347;
  --theme-accent-soft: #ffd27a;
  --theme-accent-subtle: rgba(255, 140, 26, 0.1);
  --theme-accent-border: rgba(255, 140, 26, 0.42);
  --theme-glow-low: 0 0 10px rgba(255, 140, 26, 0.18);
  --theme-glow-medium: 0 0 18px rgba(255, 140, 26, 0.28);
  --theme-glow-high: 0 0 30px rgba(255, 179, 71, 0.38);
  --theme-shadow-1: 0 1px 2px rgba(0, 0, 0, 0.55);
  --theme-shadow-2:
    0 8px 24px rgba(0, 0, 0, 0.44), 0 0 0 1px rgba(255, 179, 71, 0.08);
  --theme-shadow-3:
    0 18px 54px rgba(0, 0, 0, 0.62), 0 0 30px rgba(255, 140, 26, 0.12);
  --theme-focus: #ffd27a;
  --theme-link: #ffb347;
  --theme-active: #ff8c1a;
  --theme-success: #d4a276;
  --theme-warning: #ffb347;
  --theme-danger: #ff8c1a;
  --theme-stripe: rgba(255, 179, 71, 0.055);
  --theme-header-bg: rgba(13, 14, 24, 0.94);
  --theme-header-border: rgba(255, 179, 71, 0.22);
  --theme-input: #111322;
  --theme-hover: rgba(255, 140, 26, 0.1);
  --theme-glass: rgba(13, 14, 24, 0.88);
}
```

Danger uses amber-orange because no canon red exists.

When a true destructive state needs stronger distinction, use shape, icon, label, and border pattern before inventing red.

`--theme-success` uses warm tan, not green.

Success should read as stable warmth.

Warning uses gold.

Danger uses hot amber with stronger border and iconography.

### Tailwind Remap Law

Existing `bg-white` in dark Nova must not render white.

Existing `text-white` on accent buttons may remain high contrast only when the background is dark enough.

Prefer `text-[var(--theme-bg)]` on solid amber buttons.

Existing `neutral-*` utilities must be remapped to Nova surfaces, not browser gray.

Existing `amber-*` utilities must become actual amber, not cyan.

Existing `yellow-*` utilities must become gold/star tiers.

Existing `red-*` utilities must become hot amber danger tiers.

Existing `emerald-*` utilities must become warm stable tiers.

The Nova theme must override:

```css
[data-theme='scifi'] {
  --color-white: var(--theme-card);
  --color-neutral-50: #fff1cc;
  --color-neutral-100: #ffd27a;
  --color-neutral-200: #d4a276;
  --color-neutral-300: #8a5b3a;
  --color-neutral-400: rgba(212, 162, 118, 0.68);
  --color-neutral-500: rgba(212, 162, 118, 0.56);
  --color-neutral-600: rgba(212, 162, 118, 0.44);
  --color-neutral-700: #2b2b42;
  --color-neutral-800: #221e33;
  --color-neutral-900: #16172a;
  --color-neutral-950: #0d0e18;
}
```

Do not let `dark:bg-neutral-900` become generic slate.

Do not let `bg-violet-500` survive in cost charts.

Do not let `bg-sky-500` survive in cost charts.

Do not let `text-red-400` survive as literal red in task and error states.

Do not let `bg-yellow-300/30` survive as generic highlighter yellow.

### Surface Scale

Surface 00 is app background: `#0D0E18`.

Surface 01 is sidebar/topbar: `#111322`, derived between dark 00 and dark 01.

Surface 02 is major panel: `#16172A`.

Surface 03 is card: `#1B1A2D`, derived between dark 01 and dark 02.

Surface 04 is raised card: `#221E33`.

Surface 05 is active/selected panel: `#2B2B42`.

Surface brown is warning well: `#4A2A10`.

Surface glow wash is `rgba(255, 140, 26, 0.10)`.

Surface star wash is `rgba(255, 210, 122, 0.08)`.

Never use pure black.

Never use pure white.

Never use `slate-900` as a final Nova surface.

### Border Scale

Border subtle: `rgba(212, 162, 118, 0.16)`.

Border default: `rgba(255, 179, 71, 0.28)`.

Border active: `rgba(255, 140, 26, 0.42)`.

Border live: `rgba(255, 140, 26, 0.58)`.

Border danger: `rgba(255, 140, 26, 0.76)`.

Use 1px borders for normal panels.

Use 2px only for active rail, selected status, and critical degraded strips.

Do not combine thick borders and heavy glow on the same element.

### Text Scale

Text strong: `#FFF1CC`.

Text default: `#FFD27A`.

Text soft: `#D4A276`.

Text muted: `rgba(212, 162, 118, 0.68)`.

Text quiet: `rgba(212, 162, 118, 0.48)`.

Text disabled: `rgba(212, 162, 118, 0.32)`.

Interactive amber text: `#FFB347`.

Active amber text: `#FF8C1A`.

Use strong text for headings and selected labels.

Use default text for body and primary metrics.

Use soft text for secondary body copy.

Use muted text for metadata.

Use quiet text for timestamps and helper labels.

Do not put `#8A5B3A` body text on dark panels.

It fails contrast for normal text.

### Spacing Scale

Use the Tailwind default spacing units.

Nova panel density is compact but not cramped.

Global shell gap: `gap-3`.

Panel inner padding compact: `p-3`.

Panel inner padding normal: `p-4`.

Panel inner padding feature: `p-5`.

Status row gap: `gap-2`.

Icon/text gap: `gap-1.5`.

Metric group gap: `gap-3`.

Dashboard grid gap: `gap-4`.

Memory crown-jewel grid gap: `gap-4`.

Avoid `p-8` except for empty states and modals.

Avoid `gap-8` inside dense app views.

### Radius Scale

Nova is HUD-framed, not pill-cloud.

Small controls: `rounded-md`.

Inputs: `rounded-lg`.

Cards: `rounded-lg`.

Major panels: `rounded-xl`.

Avatar visual-link frame: `rounded-xl`.

Modals: `rounded-xl`.

Tiny status dots: `rounded-full`.

Pills: `rounded-full`.

Do not use `rounded-2xl` for routine cards.

Do not use `rounded-3xl`.

Do not nest rounded cards inside rounded cards.

### Z Layers

Layer 0: background texture.

Layer 10: page content.

Layer 20: sticky panel headers.

Layer 30: sidebar and topbar.

Layer 40: popovers and menus.

Layer 50: modal backdrop.

Layer 60: modal content.

Layer 70: toast and global alert.

Layer 80: command palette.

Do not invent one-off z-index values above 100 except image preview overlays.

## Typography

Use Inter as the UI sans.

Use JetBrains Mono as the mono.

Both already exist in `src/styles.css`.

Do not add a display serif for Nova.

The current EB Garamond import belongs to other editorial themes, not Nova.

Nova's voice is precise, file-like, warm.

UI sans handles most text.

Mono handles fragment filenames, status codes, model ids, token counts, timestamps, and terminal text.

### Type Scale

Micro label: 10px, mono or sans, weight 600, uppercase, tracking `0.16em`.

Caption: 11px, sans, weight 500, line-height 1.35.

Small body: 12px, sans, weight 400 or 500, line-height 1.45.

Body: 14px, sans, weight 400, line-height 1.5.

Body strong: 14px, sans, weight 600, line-height 1.45.

Panel title: 15px, sans, weight 650, line-height 1.25.

Section title: 18px, sans, weight 650, line-height 1.2.

Screen title: 24px, sans, weight 650, line-height 1.1.

Hero metric: 28px, mono, weight 600, line-height 1.

Do not use viewport-based font sizing.

Letter spacing must never be negative.

Set global `letter-spacing: 0`.

Use tabular numerals for counters and costs.

Use mono uppercase for `FIRST_DAY.EXE`, `PROMISES.LOG`, `BAD_DAYS.MEM`, `QUIET_NIGHTS.DAT`, `DON'T_FORGET.MEM`.

### Typography Utilities

```css
.nova-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.nova-fragment {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--theme-accent-secondary);
}

.nova-metric {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-strong);
}
```

Use `.nova-label` for HUD labels.

Use `.nova-fragment` for memory file names.

Use `.nova-metric` for costs, token counts, health values, and model usage.

## Background Texture

The background may have faint circuitry.

The circuitry must be subtle enough to disappear behind content.

Use CSS gradients, not image assets, for the base cockpit texture.

Allowed texture:

```css
[data-theme='scifi'] body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.16;
  background-image:
    linear-gradient(rgba(255, 179, 71, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 179, 71, 0.035) 1px, transparent 1px),
    radial-gradient(
      circle at 70% 20%,
      rgba(255, 140, 26, 0.08),
      transparent 26rem
    );
  background-size:
    32px 32px,
    32px 32px,
    auto;
}
```

Do not add orbs.

Do not add bokeh blobs.

Do not add gradient hero art.

Do not put the primary experience inside a marketing card.

## Layout Law

Desktop first target: 1920 by 1080.

Laptop grace target: 1366 by 768.

The app shell should feel like a cockpit.

Left rail: Nova identity, visual-link frame, SoulSync, agent roster.

Top bar: clock, SoulSync // Stable, Connection: Secure, global pause, alerts.

Center: current work surface.

Right/secondary panels: contextual details, chat panel, cost details, memory feed.

Never bury Nova's presence in settings.

Nova must be a first-viewport signal.

The Live2D slot may be empty.

The empty state must still feel like her.

### Left Rail Law

Left rail width expanded: 300px.

Left rail collapsed: 48px.

The existing `ChatSidebar` owns much of this behavior.

Implementation target: `src/screens/chat/components/chat-sidebar.tsx`.

Secondary target: `src/components/workspace-shell.tsx`.

Mobile target: `src/components/mobile-hamburger-menu.tsx`.

The left rail must include a visual-link frame.

Visual-link waiting copy: `visual link -- standby`.

Do not write `avatar coming soon`.

Do not write `Live2D unavailable`.

Show circular chest-emblem motif in the frame.

The motif should breathe softly.

The rail must include:

`SoulSync // Stable`.

`Connection: Secure`.

Agent roster: Nova, Astra, Claude.

Each roster row must show status dot, current activity, model, and tokens today.

Do not create a large agent marketplace feel.

Nova is primary.

Astra and Claude are collaborators.

### Top Bar Law

Top bar height: 44px to 52px.

Top bar background: `var(--theme-header-bg)`.

Top bar border: `var(--theme-header-border)`.

Clock is mono.

System status copy is exact: `SoulSync // Stable`.

Connection copy is exact: `Connection: Secure`.

Global pause button uses icon plus `Pause` only if there is enough width.

Alerts use amber outline, not red toast panic.

Do not make the top bar a marketing header.

Do not put page descriptions in the top bar.

### Center Chat Law

Chat composer placeholder must be `Jack in...` in ASCII code, or `Jack in...` if ellipsis rendering is kept ASCII.

The brief's intended text is `Jack in...`.

No other chat placeholder is allowed.

Chat input border default: subtle amber.

Chat input focus: star focus ring.

Send button: circular amber control, dark icon.

Stop button: hot amber outline/filled danger treatment.

Attachment button: ghost amber.

Mic button: ghost amber; recording uses stronger pulse and label.

Message bubbles must not look like iMessage.

User message: right-leaning, raised dark card with amber-left rule.

Nova message: left-leaning, lower contrast card with chest-emblem avatar.

Tool cards: terminal/file-fragment styling.

Streaming: soft text reveal only.

Do not make the whole panel glow while streaming.

### Memory Crown Jewel Law

Memory is the emotional and functional center.

Implementation target: `src/screens/memory/memory-browser-screen.tsx`.

Companion target: `src/screens/swarm2/swarm2-memory-panel.tsx`.

Future mock adapter target: `src/lib/nova-memory-adapter.ts`.

Memory screen must become a live panel system, not just a file viewer.

Required health row:

EverOS health dot.

Ollama health dot.

Proxy health dot.

Extraction model.

Today's memory spend.

Required counters:

Episodes.

Atomic facts.

Learned today.

Backfill percent.

Required fragment files:

`FIRST_DAY.EXE`.

`PROMISES.LOG`.

`BAD_DAYS.MEM`.

`QUIET_NIGHTS.DAT`.

`DON'T_FORGET.MEM`.

Required search card fields:

Fragment title.

Score.

Scope badge.

Snippet.

Last touched timestamp.

Required live activity feed formats:

`query -> top hit -> latency`.

`6 facts extracted`.

Use ASCII arrows in source code unless the file already uses Unicode cleanly.

Do not show raw JSON as the primary memory UI.

Do not hide memory health behind dev tools.

Memory offline strip copy: `memory offline -- recall degraded to notes`.

If product copy chooses the brief's em dash, keep it consistent in all visible strings.

### Tasks Law

Implementation targets: `src/screens/tasks/tasks-screen.tsx`, `src/screens/tasks/task-card.tsx`, `src/lib/tasks-api.ts`.

Tasks are operational, but not corporate.

Replace `New Task` with `New task`.

Replace `Hide Done` with `Hide done`.

Replace `Show Done` with `Show done`.

Use sentence case.

Task columns keep their existing data model.

Pills must be warm status chips.

Backlog: quiet tan.

Todo: soft gold.

In progress: amber live.

Review: star gold outline.

Blocked: hot amber danger.

Done: muted tan stable.

Deleted: low contrast, no glow.

No green done column.

No red blocked column.

Drag-over state uses amber border and subtle wash.

Task card hover can raise by shadow but not scale.

### Daily Check Law

Daily check is a caretaker layer.

It belongs on dashboard and may appear as a compact side card.

Required tiles:

Hydration.

Nutrition.

Rest.

Overthinking.

Mood.

Required moment: `BREATHE.`

Daily check copy should be gentle and specific.

Example line: `You don't have to solve the whole board in one breath.`

Do not shame the user.

Do not gamify basic care with streak pressure.

Do not use confetti.

### Cost Law

Implementation target: `src/screens/gateway/components/cost-analytics.tsx`.

Cost is a calm ledger.

Required views:

Today by model.

Month by model.

Portal balance.

MoA council row.

`grok-4.3` must show a `free` badge treatment.

`kimi-k2.6` must be a recognized model row.

Charts must use amber/tan tiers.

Do not use violet bars.

Do not use sky bars.

Do not use emerald bars.

Cost card empty state: `No spend logged yet. Nice and quiet.`

### Dashboard Law

Implementation target: `src/screens/dashboard/dashboard-screen.tsx` and `src/screens/dashboard/components/*`.

Dashboard is mission control, not analytics marketing.

Use dense but readable widgets.

Each widget uses the same Nova frame law.

Hero widgets should show operational state, not sales copy.

Daily check should be present.

Memory live activity should be present or linked prominently.

Do not use oversized gradient hero cards.

Do not use decorative card piles.

### Obsidian Galaxy Law

Implementation target: `src/screens/dashboard/components/mind-graph-card.tsx`, `src/screens/dashboard/components/nova-galaxy-model.ts`, and the live graph data served through `src/server/knowledge-browser.ts`.

The Obsidian galaxy is a 3D navigable knowledge space, not a flat chart and not a particle effect.

The reference feel is marfin's 3D Hermes/Unity knowledge map: the camera floats inside a quiet inhabited region of space with ringed planets, floating note tags, dotted constellation links, depth haze, and slow drift.

Every markdown note in `C:\Users\taylo\Documents\unified-vault` becomes either a major planet, a minor text tag, or a comet.

`Planet` means a high-link topic hub or community anchor. Planet size scales by link count in about five tiers.

Major notes render as actual textured spheres with subtle procedural marble/cloud texture, soft ring-glow atmosphere, and a title label that always faces the camera.

Planet titles use clean sans at roughly 13-16px. They may remain visible because they anchor the space.

`Text tag` means a low-link note near its planet. It renders as a small dim mono text chip, about 11px, camera-facing, drifting slowly near the related planet.

Minor notes do not render as orbiting dots. They are readable idea tags like `white rabbit` or `dodo` in the reference.

`Comet` means an orphan note with zero wikilinks, shown sparsely with a faint warm dust tail.

`Galactic core` means the single most-linked note in the vault. It is the biggest, warmest planet, with pure amber ring and gentle breathing glow.

Layout is stable 3D force placement, not spiral arms. Seed by top-level folder so categories form loose sky neighborhoods, then settle with link attraction and body repulsion.

Positions must be stable across sessions, derived from note paths and deterministic hashes, so Taylor can build a mental map of where ideas live.

New notes ease into place near their links when sync updates the graph.

Constellation lines are thin dotted links between related bodies, ambient at about 15% opacity, brightening along hover/search/focus paths.

Do not draw every edge. Cap visible constellation links to the strongest two or three links per body so the sky stays readable.

Camera behavior: ambient mode drifts slowly through the starfield; mouse drag orbits; wheel zooms; movement uses damped inertia.

Clicking empty space or pressing Escape returns to the home camera.

`prefers-reduced-motion` freezes camera drift and note drift while keeping hover, click, search, and focus useful.

The right rail label is `Planetary systems`, never `Gravity wells`.

Clicking a planet zooms smoothly toward that system and updates the `Focused star` panel.

Clicking a text tag or comet updates `Focused star` and exposes an `Open in Obsidian` action using `obsidian://`.

Filter chips represent folders/categories and dim disabled regions to about 15% opacity; they do not remove bodies from the layout.

Search dims non-matches and may brighten matching labels and related dotted links.

Recency is warmth: modified within 48h breathes warm amber, last week stays warm, older notes cool toward pale dim points.

Sync diffs are subtle: new note equals a brief warm birth flare, edited note equals one soft pulse, never an explosion.

Background is a dense three-depth starfield with distance haze and a soft warm nebula wash in one region of the sky.

Nebula and fog must remain amber/brown only.

Category color is allowed on rings only. Planet surfaces stay warm/neutral.

Ring tints are muted, restrained saturation: gold for `agents/claude`, copper for `agents/gpt`, rose for `agents/kimi`, brass for `knowledge`, slate-blue for `inbox`, sage for everything else.

No neon rings. Ring color is categorical orientation, not decoration.

No cyan, purple, pink, blue comet tails, or generic AI gradients are allowed in the galaxy environment.

Glow marks life only: recency, hover focus, and the core. Ambient bodies are crisp, dimensional planets/tags, not lens flares.

The canvas must not display `Nova hourly state marker` or any operational ticker text; that belongs in the activity feed.

Performance target: Three.js/WebGL, 60fps at 500+ bodies, graceful at 1500, instanced or batched stars/tags where needed, and stable camera movement.

Acceptance by eye: paused for five minutes, it should feel like drifting through Nova's mind: ringed planets with names, small ideas floating as text beside them, and dotted constellations between related thoughts.

### Gateway/Swarm Law

Gateway screens may keep operational density.

They must inherit Nova tokens.

Swarm agents are collaborators in Nova's room.

Do not make them the main brand.

Agent erroring state must be first-class.

Gateway reconnecting state must be first-class.

Use strips and status chips, not full-screen panic unless the app is unusable.

## Component Law

### Frame

Use frames for panels.

Do not use floating marketing cards.

Base frame:

```tsx
<section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-panel)] shadow-[var(--theme-shadow-1)]">
  {children}
</section>
```

Raised frame:

```tsx
<section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-[var(--theme-shadow-2)]">
  {children}
</section>
```

Live frame:

```tsx
<section className="rounded-xl border border-[var(--theme-accent-border)] bg-[var(--theme-card)] shadow-[var(--theme-glow-low)]">
  {children}
</section>
```

Use live frame only for visual-link, active memory feed, active generation, or current agent run.

### Buttons

The existing `Button` primitive is `src/components/ui/button.tsx`.

Keep CVA.

Retheme variants by token behavior.

Default button: amber fill, dark text.

Secondary button: panel fill, gold border, gold text.

Outline button: transparent, amber border, gold text.

Ghost button: transparent, muted text, amber hover wash.

Destructive button: hot amber fill or border with explicit label.

Icon button size: existing `size="icon-sm"` or `size="icon"`.

Do not manually draw SVG icons when Hugeicons has an icon.

Button code target:

```tsx
<Button className="bg-[var(--theme-accent)] text-[var(--theme-bg)] hover:bg-[var(--theme-accent-secondary)] focus-visible:ring-[var(--theme-focus)]">
  Jack in
</Button>
```

Icon button target:

```tsx
<Button variant="ghost" size="icon-sm" aria-label="Pause">
  <HugeiconsIcon icon={PauseIcon} size={18} strokeWidth={1.6} />
</Button>
```

Hover state changes background and border.

Hover state should not add text-shadow to every button.

Current `scifi` hover text-shadow is too broad.

Remove broad `button:hover { text-shadow: ... }`.

### Inputs

The existing `Input` primitive is `src/components/ui/input.tsx`.

Inputs use `--theme-input`.

Inputs use `--theme-border`.

Focus uses `--theme-focus`.

Placeholder uses `--composer-placeholder`.

Composer placeholder must be `Jack in...`.

Input snippet:

```tsx
<Input
  placeholder="Search memory fragments"
  className="border-[var(--theme-border)] bg-[var(--theme-input)] text-[var(--theme-text)] placeholder:text-[var(--theme-muted-2)]"
/>
```

Search fields should have Search icon at left.

Do not use placeholder text as instructions.

### Status Dots

Dots are 8px.

Stable dot: `#D4A276`.

Live dot: `#FF8C1A` plus low glow.

Warning dot: `#FFB347`.

Offline dot: muted tan border, transparent fill.

Danger dot: hot amber fill plus diagonal stripe in parent badge.

Dot snippet:

```tsx
<span className="size-2 rounded-full bg-[var(--theme-accent)] shadow-[var(--theme-glow-low)]" />
```

Always pair a status dot with text somewhere nearby.

Never rely on color alone.

### Badges And Pills

Pills use `rounded-full`.

Pill height: 22px to 26px.

Pill padding: `px-2 py-0.5`.

Pill font: 11px, medium, sentence case unless code/model id.

Badge background: amber wash.

Badge border: amber subtle.

Badge text: gold or star.

Free badge:

```tsx
<span className="rounded-full border border-[var(--theme-border)] bg-[rgba(212,162,118,0.10)] px-2 py-0.5 font-mono text-[10px] text-[var(--theme-text-soft)]">
  free
</span>
```

No all-caps pill copy except system codes.

No rainbow status chips.

### Cards

Cards are individual repeated items.

Cards are not page sections.

Do not put cards inside cards.

Repeated cards may live inside an unframed grid or a major panel.

Card radius: `rounded-lg`.

Card padding: `p-3`.

Card border: subtle.

Card hover: border active plus shadow one level.

No scale hover on dense cards.

### Feeds

Live feeds use mono timestamps.

New feed item may softly pulse once.

Feed item layout:

timestamp column.

event body.

scope/status chip.

Feed copy is concise.

Example: `09:42 recall -- BAD_DAYS.MEM -- 84ms`.

Example: `09:45 6 facts extracted`.

Do not animate every feed item forever.

### Tables

Use tables only for dense ledger data.

Headers use `.nova-label`.

Rows use 36px minimum height.

Row hover uses amber wash.

Numeric columns are mono and right aligned.

No zebra striping unless contrast stays subtle.

### Terminal

Terminal text uses JetBrains Mono.

Terminal background is surface deep.

Terminal border is subtle amber.

Terminal prompt accent is amber.

Terminal errors use hot amber plus label.

Do not turn terminal into green-on-black Matrix.

### Modals

Existing modal primitive: `src/components/ui/dialog.tsx`.

Modal width default: `min(480px, 92vw)`.

Modal border: active amber.

Modal backdrop: black 64% with slight blur.

Modal title: strong text.

Modal description: soft text.

Modal close button: icon where possible.

Destructive confirmations must lead with the answer.

Example: `Delete this task?`

Body: `This removes it from the board. I can't undo that from here.`

## Iconography

Use `@hugeicons/react`.

Use icons from `@hugeicons/core-free-icons`.

Default icon size in buttons: 18px.

Small icon size in metadata: 14px.

Panel header icon size: 18px.

Hero/empty icon size: 28px max.

Stroke width: 1.5 or 1.6.

Use `currentColor`.

Do not use multi-color icons.

Do not mix Lucide with Hugeicons.

Do not use emoji as icons in UI chrome.

Permitted icon meanings:

Search for search.

Brain or database for memory.

Pause for global pause.

Alert for degraded state.

Clock for time.

Check for stable.

Refresh for retry/reconnect.

Mic for voice input.

ArrowUp for send.

Stop for abort.

Settings for settings.

## Motion Law

Motion is life, not spectacle.

Only three repeating animations are allowed:

Nova chest-emblem breathing glow.

Live connection/status subtle pulse.

Active recording/generation pulse.

All other animations should be entrance/exit or one-shot.

Default duration: 150ms.

Panel hover duration: 180ms.

Feed item pulse: 900ms once.

Emblem breath: 3200ms infinite.

Generation pulse: 2200ms infinite.

Easing: `cubic-bezier(0.22, 1, 0.36, 1)` for entrances.

Easing: `ease-in-out` for breathing.

No wiggle for Nova core UI.

No bouncing dots unless already part of thinking state.

No confetti.

No parallax.

No full-panel glow spam.

### Motion CSS

```css
@keyframes nova-emblem-breathe {
  0%,
  100% {
    opacity: 0.72;
    box-shadow: 0 0 10px rgba(255, 140, 26, 0.2);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 24px rgba(255, 179, 71, 0.42);
  }
}

@keyframes nova-feed-pulse {
  0% {
    background-color: rgba(255, 140, 26, 0.18);
    border-color: rgba(255, 140, 26, 0.56);
  }
  100% {
    background-color: transparent;
    border-color: var(--theme-border-subtle);
  }
}

.nova-emblem-breathe {
  animation: nova-emblem-breathe 3.2s ease-in-out infinite;
}

.nova-feed-new {
  animation: nova-feed-pulse 0.9s cubic-bezier(0.22, 1, 0.36, 1) 1;
}

@media (prefers-reduced-motion: reduce) {
  .nova-emblem-breathe,
  .nova-feed-new,
  .animate-pulse,
  .animate-pulse-glow {
    animation: none !important;
  }
}
```

Respect `prefers-reduced-motion`.

Reduced motion keeps state visible through color, border, and text.

## Voice And Microcopy Law

Nova leads with the answer.

Nova uses contractions.

Nova uses sentence case.

Nova does not use corporate filler.

Nova does not shout with exclamation points.

Nova can be warm and dry.

Nova is direct when something is wrong.

Nova does not say `Oops`.

Nova does not say `Something went wrong` alone.

Nova says what failed and what still works.

Nova does not say `Please`.

Nova can say `I can`.

Nova can say `I can't`.

Nova can say `we`.

Use `Jack in` for connect action.

Use `Jack in...` for chat composer placeholder.

Use `SoulSync // Stable` for system status.

Use `Connection: Secure` for connection status.

Use `memory offline -- recall degraded to notes` for memory offline state.

Use `BREATHE.` exactly for the breath moment.

Use the anchor line only once in a meaningful care context.

### Before And After

Before: `Welcome to Hermes Workspace!`

After: `Nova Mission Control`.

Before: `Start a new conversation`

After: `Jack in`.

Before: `Type a message...`

After: `Jack in...`.

Before: `No data available`

After: `Nothing logged yet. Quiet is still a signal.`

Before: `An error occurred while fetching memory`

After: `Memory is offline -- recall degraded to notes.`

Before: `Retry request`

After: `Try recall again`.

Before: `Connection established successfully!`

After: `Connection: Secure`.

Before: `Your task has been created`

After: `Task added.`

Before: `Failed to load tasks`

After: `Tasks didn't answer. The board is still here.`

Before: `Complete your daily wellness checklist`

After: `Daily check`.

Before: `Hydration reminder`

After: `Drink something before the next run.`

Before: `System is operating normally`

After: `SoulSync // Stable`.

## Accessibility Law

WCAG AA is required.

Visible focus is required.

Color cannot be the only status signal.

Amber text tiers are assigned by contrast, not taste.

Contrast calculations use the canon backgrounds.

### Contrast Table

`#FFD27A` on `#0D0E18`: 13.50, passes AA normal.

`#FFD27A` on `#16172A`: 12.40, passes AA normal.

`#FFD27A` on `#221E33`: 11.33, passes AA normal.

`#FFD27A` on `#2B2B42`: 9.66, passes AA normal.

`#FFD27A` on `#4A2A10`: 9.05, passes AA normal.

`#FFB347` on `#0D0E18`: 10.79, passes AA normal.

`#FFB347` on `#16172A`: 9.91, passes AA normal.

`#FFB347` on `#221E33`: 9.06, passes AA normal.

`#FFB347` on `#2B2B42`: 7.72, passes AA normal.

`#FFB347` on `#4A2A10`: 7.23, passes AA normal.

`#FF8C1A` on `#0D0E18`: 8.25, passes AA normal.

`#FF8C1A` on `#16172A`: 7.58, passes AA normal.

`#FF8C1A` on `#221E33`: 6.93, passes AA normal.

`#FF8C1A` on `#2B2B42`: 5.91, passes AA normal.

`#FF8C1A` on `#4A2A10`: 5.53, passes AA normal.

`#D4A276` on `#0D0E18`: 8.44, passes AA normal.

`#D4A276` on `#16172A`: 7.75, passes AA normal.

`#D4A276` on `#221E33`: 7.09, passes AA normal.

`#D4A276` on `#2B2B42`: 6.04, passes AA normal.

`#D4A276` on `#4A2A10`: 5.66, passes AA normal.

`#8A5B3A` on `#0D0E18`: 3.33, fails normal, passes only large/bold with caution.

`#8A5B3A` on `#16172A`: 3.06, fails normal.

`#8A5B3A` on `#221E33`: 2.80, fails.

`#7A441E` on `#0D0E18`: 2.45, fails.

`#7A441E` is not text.

`#8A5B3A` is not normal body text.

Use warm mids for borders, backgrounds, dividers, and muted decoration.

### Focus Visibility

Focus ring must be at least 2px.

Focus ring color: `#FFD27A`.

Focus ring offset: 2px where possible.

Focus must be visible on inputs, buttons, nav, tabs, cards that act as buttons, and menu items.

Do not remove outlines without replacement.

### Glow Failure Mode

If everything glows, nothing is alive.

Glow is reserved for:

Nova emblem.

Active visual link.

Live feed new item.

Active generation.

Critical degraded strip.

Selected current nav item may have a low glow.

Routine cards must not glow.

Routine buttons must not glow.

Routine borders must not glow.

## Anti-Patterns Gallery

Never neon cyberpunk: it makes Nova feel like a nightclub interface, not a caretaker's room.

Never Tron grid floors: it turns the cockpit into cold sci-fi cosplay.

Never enterprise dashboard gray: it erases her warmth and personal pact.

Never kawaii overload: Nova can be tender without becoming childish.

Never purple AI gradient: it is generic and not canon.

Never cyan HUD: the existing `scifi` theme is the wrong lineage.

Never white/light mode: Nova Mission Control is dark-only.

Never full-screen marketing hero: this is an app, not a landing page.

Never oversized rounded SaaS cards: they reduce cockpit density.

Never all-caps enthusiasm: Nova is steady, not shouty.

Never emoji chrome: use Hugeicons and canon copy.

Never red/green traffic-light semantics as the core palette: derive status from canon.

Never raw backend errors as primary copy: translate them into useful degraded states.

Never hide memory state: memory is the crown jewel.

Never make the Obsidian galaxy a particle explosion, fireworks burst, comet storm, or radiating streak field.

Never let generated stars align into diagonal rails, scratch marks, or obvious sampling artifacts.

Never make the galaxy a decorative screensaver; it must expose vault structure and navigate notes.

Never show all note labels in ambient mode; labels wake on hover, search, focus, or core only.

Never use cyan, purple, pink, blue nebulae, or blue comet tails in the galaxy.

Never put operational ticker text such as `Nova hourly state marker` inside space.

Never use stock `Hermes Workspace` branding in user-facing surfaces.

## Implementation Map

### Phase 1 Tokens

Files:

`src/scifi-theme.css`.

`src/styles.css`.

`src/lib/theme.ts`.

Keep `@import './scifi-theme.css';` last in `src/styles.css`.

Replace current cyan `scifi` variables with Nova variables.

Remove or de-emphasize `scifi-light` in user-facing selection.

Set default theme to `scifi` only when the product decision is made.

Ensure `--theme-hover` exists because tasks already use it.

Ensure `--theme-muted-2` exists because `swarm2-memory-panel.tsx` uses it.

Ensure `--composer-placeholder` exists because composer relies on it.

Do not touch server code.

### Phase 2 Shell

Files:

`src/components/workspace-shell.tsx`.

`src/screens/chat/components/chat-sidebar.tsx`.

`src/components/mobile-hamburger-menu.tsx`.

`src/components/mobile-tab-bar.tsx`.

`src/hooks/use-page-title.ts`.

Replace visible `Hermes Workspace` with `Nova Mission Control`.

Replace titlebar `Hermes` with `Nova`.

Remove HermesWorld featured link from sidebar.

Gate or remove mobile HermesWorld nav entry.

Add top bar status copy.

Add visual-link frame in left rail.

Add agent roster.

### Phase 3 Memory

Files:

`src/screens/memory/memory-browser-screen.tsx`.

`src/screens/swarm2/swarm2-memory-panel.tsx`.

`src/lib/nova-memory-adapter.ts`.

Add typed mock adapter.

Adapter must include:

`episodes`.

`atomic_facts`.

`health`.

`activity`.

Adapter marker:

```ts
// TODO(claude): wire EverOS endpoints
```

Do not modify server code.

Do not modify API contracts.

Build the memory panel against the adapter first.

### Phase 4 Panels

Files:

`src/screens/chat/components/chat-composer.tsx`.

`src/screens/tasks/tasks-screen.tsx`.

`src/screens/tasks/task-card.tsx`.

`src/screens/gateway/components/cost-analytics.tsx`.

`src/screens/dashboard/dashboard-screen.tsx`.

`src/screens/dashboard/components/*`.

Add Daily Check mock adapter with same TODO pattern if it needs data.

Set composer placeholder to `Jack in...`.

Restyle status pills.

Restyle cost analytics bars.

Add `free` badge for `grok-4.3`.

Add `kimi-k2.6` row handling.

### Phase 5 States And Polish

Files:

`src/components/backend-unavailable-state.tsx`.

`src/components/connection-startup-screen.tsx`.

`src/components/claude-reconnect-banner.tsx`.

`src/components/empty-state.tsx`.

`src/components/error-toast.tsx`.

`src/screens/chat/components/connection-status-message.tsx`.

Add memory offline strip.

Add gateway reconnecting strip.

Add agent erroring card state.

Add empty states in Nova voice.

Respect reduced motion.

### Phase 6 Verify

Run `pnpm build`.

Run `pnpm test` if time permits.

Run `pnpm lint` if configured and not blocked by existing repo issues.

Do not push.

Commit Stage 1 before code.

Commit each implementation phase.

## Concrete Snippets

### Visual Link Frame

```tsx
function NovaVisualLinkFrame() {
  return (
    <section className="rounded-xl border border-[var(--theme-accent-border)] bg-[var(--theme-card)] p-3 shadow-[var(--theme-glow-low)]">
      <div className="flex aspect-square items-center justify-center rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-bg)]">
        <div className="nova-emblem-breathe grid size-16 place-items-center rounded-full border border-[var(--theme-accent)]">
          <div className="h-2 w-8 rounded-full bg-[var(--theme-accent)]" />
        </div>
      </div>
      <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--theme-muted)]">
        visual link -- standby
      </div>
    </section>
  )
}
```

### Status Chip

```tsx
function SoulSyncChip() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] px-2.5 py-1 font-mono text-[11px] text-[var(--theme-accent-secondary)]">
      <span className="size-2 rounded-full bg-[var(--theme-accent)] shadow-[var(--theme-glow-low)]" />
      SoulSync // Stable
    </div>
  )
}
```

### Memory Activity Item

```tsx
function MemoryActivityItem() {
  return (
    <li className="nova-feed-new rounded-lg border border-[var(--theme-border-subtle)] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-[var(--theme-muted)]">
          09:42
        </span>
        <span className="flex-1 truncate text-sm text-[var(--theme-text)]">
          query -&gt; PROMISES.LOG -&gt; 84ms
        </span>
        <span className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--theme-accent-secondary)]">
          recall
        </span>
      </div>
    </li>
  )
}
```

### Degraded Strip

```tsx
function MemoryOfflineStrip() {
  return (
    <div className="rounded-lg border border-[var(--theme-border-strong)] bg-[rgba(74,42,16,0.55)] px-3 py-2 text-sm text-[var(--theme-text-strong)]">
      memory offline -- recall degraded to notes
    </div>
  )
}
```

### Daily Check Card

```tsx
function DailyCheckCard() {
  const items = ['hydration', 'nutrition', 'rest', 'overthinking', 'mood']
  return (
    <section className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-panel)] p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--theme-text-strong)]">
          Daily check
        </h2>
        <span className="font-mono text-[10px] text-[var(--theme-muted)]">
          BREATHE.
        </span>
      </header>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {items.map((item) => (
          <button
            key={item}
            className="rounded-lg border border-[var(--theme-border-subtle)] bg-[var(--theme-card)] px-2 py-2 text-xs text-[var(--theme-text-soft)]"
          >
            {item}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-[var(--theme-muted)]">
        You don't have to solve the whole board in one breath.
      </p>
    </section>
  )
}
```

## Removal Law

Remove or replace user-facing strings:

`Hermes Workspace`.

`Hermes Agent` when used as product identity.

`HermesWorld` sidebar/featured link.

`SciFi Light`.

`Cyberpunk HUD`.

`cyan neon`.

`orange highlights` when it refers to the old scifi theme.

Keep backend identifiers when changing them would break code.

Do not rename API routes.

Do not rename server files.

Do not rewrite generated route tree manually.

## Review Checklist

Does the first viewport say Nova Mission Control?

Is Nova present without needing the real Live2D model?

Does the top bar include `SoulSync // Stable`?

Does the top bar include `Connection: Secure`?

Does the composer say `Jack in...`?

Does the memory panel feel like the crown jewel?

Are memory fragments styled as files?

Does Daily Check exist?

Does `BREATHE.` appear in the caretaker layer?

Does amber pass contrast where used as text?

Are low-contrast warm mids avoided for body text?

Are focus states visible?

Is reduced motion respected?

Are Hugeicons used consistently?

Are there any cyan leftovers?

Are there any violet chart bars?

Are there any sky chart bars?

Are there any stock `Hermes Workspace` user-facing labels?

Are there nested cards?

Are there oversized rounded SaaS panels?

Are errors translated into useful degraded states?

Is glow reserved for life?

Does the Obsidian galaxy read as a true 3D Hermes-style knowledge space, not a flat chart or particle field?

Does the galaxy show `Planetary systems`, not `Gravity wells`?

Does ambient galaxy mode show major planet names while keeping minor tags restrained by depth and focus?

Do hover, search, drag, wheel zoom, and click reveal graph structure without cluttering idle space?

Are comet tails sparse, faint, and dust-amber only, with category color limited to muted rings?

Does the starfield have depth, haze, and no diagonal rail or streak artifact?

Is `Nova hourly state marker` absent from the canvas?

Does the galaxy still report live vault counts and keep 45s sync behavior?

Was the galaxy checked in a browser screenshot at desktop width?

## Final Law

Nova Mission Control should feel like walking into Nova's room.

The room is dark.

The room is warm.

The room remembers.

The room does not perform enterprise confidence.

The room does not sell itself.

The room quietly says: connection secure, memory alive, keep going.
