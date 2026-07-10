# Nova Cockpit Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Navy+amber cockpit chrome with a palette tripwire, dense hero-galaxy dashboard layout, and the dust-forward galaxy rebuild with 5-layer wayfinding.

**Architecture:** The cockpit chrome is a single CSS-custom-property token map (`NOVA_COCKPIT_TOKENS`) applied once as inline `style` on the dashboard root, so every card that already reads `var(--theme-*)` recolors automatically — no per-card token renaming required. Status coloring is centralized behind a single `STATUS_TONE()` lookup so every card's "operational/degraded/offline/…" pill draws from the same gold/amber/warm-red/muted semantics instead of five divergent local maps. The galaxy is a `three.js` `WebGLRenderer` scene (not a 2D `<canvas>` — see note under T6), so the dust-forward rebuild adds a procedural dust `THREE.Points` cloud, per-cluster nebula `THREE.Sprite`s, and ember-tier note markers on top of the existing planet/tag/comet/line object model, reusing the existing raycast-pick, camera-lerp, and label-projection machinery already in `Galaxy3D`.

**Tech Stack:** React 19, TanStack Start, Tailwind v4, `three.js` `WebGLRenderer` in `mind-graph-card.tsx` (see architecture note — the task brief's "2D canvas" description does not match the real file), vitest.

---

## Task 1: Cockpit token + status modules

**Files:**
- Create `src/screens/dashboard/lib/nova-cockpit-theme.ts`
- Create `src/screens/dashboard/lib/status-meta.ts`
- Modify `src/screens/dashboard/dashboard-screen.tsx`

- [ ] 1.1 Create `src/screens/dashboard/lib/nova-cockpit-theme.ts` with the full chrome token map, galaxy-only blue palette, and chart fallbacks:

```ts
import type { CSSProperties } from 'react'

/**
 * Cockpit chrome tokens — navy surfaces + amber/gold accents ONLY.
 *
 * This object is the single source of truth for every `var(--theme-*)`
 * consumed by dashboard cards. Recoloring a value here recolors every
 * card automatically (they already read the CSS custom property) — no
 * per-card edits are needed for the chrome pass.
 *
 * Chrome ban list (binding, see docs/superpowers/specs/2026-07-10-
 * galaxy-dust-forward-design.md): no purple, no green, no cyan as
 * *chrome*. Neon blues stay canon ONLY inside `GALAXY_PALETTE` below,
 * for the galaxy render and data-glow accents — never here.
 *
 * `nova-cockpit-theme.test.ts` is the tripwire: it fails the build if
 * any value in this object resolves to a green/purple/cyan hue.
 */
export const NOVA_COCKPIT_TOKENS: Record<string, string> = {
  colorScheme: 'dark',
  backgroundColor: 'var(--theme-bg)',
  color: 'var(--theme-text)',
  backgroundImage:
    'radial-gradient(circle at 14% 18%, rgba(255, 179, 71, 0.10), transparent 19rem), radial-gradient(circle at 76% 8%, rgba(255, 140, 26, 0.08), transparent 22rem), linear-gradient(rgba(255, 179, 71, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 179, 71, 0.05) 1px, transparent 1px)',
  backgroundSize: 'auto, auto, 36px 36px, 36px 36px',
  '--theme-bg': '#050b16',
  '--theme-sidebar': '#071426',
  '--theme-panel': '#0a1b33',
  '--theme-card': '#0d203b',
  '--theme-card2': '#10284a',
  '--theme-elevated': '#153a66',
  '--theme-border': 'rgba(255, 179, 71, 0.16)',
  '--theme-border-subtle': 'rgba(255, 210, 122, 0.10)',
  '--theme-border-strong': 'rgba(255, 140, 26, 0.52)',
  '--theme-text': '#ffd27a',
  '--theme-text-strong': '#fff1cc',
  '--theme-text-soft': '#d4a276',
  '--theme-muted': 'rgba(212, 190, 160, 0.55)',
  '--theme-muted-2': 'rgba(212, 190, 160, 0.36)',
  '--theme-glass': 'rgba(5, 11, 22, 0.88)',
  '--theme-focus': '#ffd27a',
  '--theme-accent': '#ff8c1a',
  '--theme-accent-secondary': '#ffb347',
  '--theme-accent-soft': '#ffd27a',
  '--theme-on-accent': '#050b16',
  // Legacy `--theme-blue*` var NAMES stay (many cards still reference
  // them for badges/dividers), but their VALUES are recolored off cyan
  // per the chrome ban list. `--theme-blue-deep` reuses the elevated
  // navy surface color, which is a navy hue, not a saturated cyan glow.
  '--theme-blue': '#ffb347',
  '--theme-blue-secondary': '#ffd27a',
  '--theme-blue-deep': '#153a66',
  '--theme-blue-subtle': 'rgba(255, 179, 71, 0.08)',
  '--theme-blue-border': 'rgba(255, 179, 71, 0.20)',
  '--theme-accent-subtle': 'rgba(255, 140, 26, 0.10)',
  '--theme-accent-border': 'rgba(255, 140, 26, 0.42)',
  '--theme-glow-low': '0 0 10px rgba(255, 140, 26, 0.18)',
  '--theme-glow-medium': '0 0 18px rgba(255, 140, 26, 0.28)',
  '--theme-glow-high': '0 0 30px rgba(255, 179, 71, 0.38)',
  '--theme-active': '#ff8c1a',
  '--theme-link': '#ffb347',
  '--theme-success': '#ffd27a',
  '--theme-warning': '#ffb347',
  '--theme-danger': '#ff6b4a',
  '--theme-stripe': 'rgba(255, 179, 71, 0.055)',
  '--theme-header-bg': 'rgba(5, 11, 22, 0.94)',
  '--theme-header-border': 'rgba(255, 179, 71, 0.18)',
  '--theme-input': '#071426',
  '--theme-hover': 'rgba(255, 179, 71, 0.10)',
  '--color-surface': '#050b16',
  '--color-surface-deep': '#020712',
  '--color-ink': '#ffd27a',
}

/**
 * Cast for use as inline `style` (matches the shape `CSSProperties`
 * expects for custom properties, mirroring the old
 * `NOVA_MISSION_CONTROL_STYLE` usage in dashboard-screen.tsx).
 */
export const NOVA_COCKPIT_STYLE = NOVA_COCKPIT_TOKENS as CSSProperties

/**
 * Neon-blue + amber palette for the galaxy render and data-glow accents
 * ONLY. Never spread these into card chrome — that's what the tripwire
 * test guards against.
 */
export const GALAXY_PALETTE = {
  space: ['#030710', '#0A1424'],
  blues: ['#63C7FF', '#9DDCFF', '#2E7FD9'],
  ambers: ['#FF8C1A', '#FFB347', '#FFD27A'],
} as const

/**
 * Fallback colors for `readDashboardPalette()` in dashboard-screen.tsx,
 * used only before the `--theme-*` custom properties resolve (SSR /
 * first paint). Replaces the old indigo/violet/green Tailwind defaults
 * with cockpit-canon equivalents so there's no purple/green flash.
 */
export const CHART_FALLBACKS = {
  accent: '#FF8C1A',
  accentSecondary: '#FFB347',
  success: '#FFD27A',
  warning: '#FFB347',
  danger: '#FF6B4A',
  muted: '#8A7A68',
  border: '#3A2C1A',
  card: '#0D203B',
  text: '#FFD27A',
} as const
```

- [ ] 1.2 Create `src/screens/dashboard/lib/status-meta.ts` — the single status→tone lookup replacing five divergent per-card maps:

```ts
/**
 * Canonical status tones for every dashboard status literal in use
 * across live-systems-card, agent-lanes-card, nova-session-bridge-card,
 * agent-workforce-card, and control-loops-card.
 *
 * Bucketed per the binding spec: healthy = gold (--theme-success),
 * attention/needs-Taylor = amber (--theme-warning), danger = warm
 * red-amber (--theme-danger), inert = navy-muted (--theme-muted).
 * Distinction is by color family + the caller's own dot/pill shape —
 * never by green.
 */
export type DashboardStatusLiteral =
  | 'operational'
  | 'connected'
  | 'reachable'
  | 'approval-gated'
  | 'degraded'
  | 'offline'
  | 'not-wired'
  | 'active'
  | 'idle'
  | 'setup-needed'
  | 'unknown'
  | 'ready'
  | 'partial'

export type StatusTone = {
  label: string
  dot: string
  tone: string
}

type ToneFamily = 'success' | 'warning' | 'danger' | 'muted'

const FAMILY: Record<DashboardStatusLiteral, ToneFamily> = {
  operational: 'success',
  connected: 'success',
  active: 'success',
  ready: 'success',
  reachable: 'warning',
  'approval-gated': 'warning',
  degraded: 'warning',
  'setup-needed': 'warning',
  partial: 'warning',
  offline: 'danger',
  'not-wired': 'muted',
  idle: 'muted',
  unknown: 'muted',
}

const LABEL_OVERRIDE: Partial<Record<DashboardStatusLiteral, string>> = {
  'approval-gated': 'needs Taylor',
  'not-wired': 'not wired',
  'setup-needed': 'setup needed',
}

const FAMILY_VAR: Record<ToneFamily, string> = {
  success: '--theme-success',
  warning: '--theme-warning',
  danger: '--theme-danger',
  muted: '--theme-muted',
}

function toneClasses(family: ToneFamily): { dot: string; tone: string } {
  const varName = FAMILY_VAR[family]
  return {
    dot: `bg-[var(${varName})]`,
    tone: `border-[color-mix(in_srgb,var(${varName})_35%,var(--theme-border))] text-[var(${varName})]`,
  }
}

/**
 * Resolve a dashboard status literal to its label/dot/tone classes.
 * Unknown strings fall back to the `muted` family rather than throwing,
 * since status enums are sourced from server payloads.
 */
export function STATUS_TONE(status: string): StatusTone {
  const known = status as DashboardStatusLiteral
  const family = FAMILY[known] ?? 'muted'
  const classes = toneClasses(family)
  return {
    label: LABEL_OVERRIDE[known] ?? status,
    dot: classes.dot,
    tone: classes.tone,
  }
}
```

- [ ] 1.3 Modify `src/screens/dashboard/dashboard-screen.tsx`: delete the inline `NOVA_MISSION_CONTROL_STYLE` literal (lines 133–183) and the purple-tinted fallbacks in `readDashboardPalette`, importing both from the new theme module.

  Delete:
  ```ts
  const NOVA_MISSION_CONTROL_STYLE = {
    colorScheme: 'dark',
    // … (full object, lines 133-183)
  } as CSSProperties
  ```

  Add near the top imports (after the `WidgetShell` import block):
  ```ts
  import { CHART_FALLBACKS, NOVA_COCKPIT_STYLE } from './lib/nova-cockpit-theme'
  ```

  Replace `readDashboardPalette`:
  ```ts
  function readDashboardPalette() {
    return {
      accent: themeColor('--theme-accent', CHART_FALLBACKS.accent),
      accentSecondary: themeColor(
        '--theme-accent-secondary',
        CHART_FALLBACKS.accentSecondary,
      ),
      success: themeColor('--theme-success', CHART_FALLBACKS.success),
      warning: themeColor('--theme-warning', CHART_FALLBACKS.warning),
      danger: themeColor('--theme-danger', CHART_FALLBACKS.danger),
      muted: themeColor('--theme-muted', CHART_FALLBACKS.muted),
      border: themeColor('--theme-border', CHART_FALLBACKS.border),
      card: themeColor('--theme-card', CHART_FALLBACKS.card),
      text: themeColor('--theme-text', CHART_FALLBACKS.text),
    }
  }
  ```

  Find every JSX usage of `NOVA_MISSION_CONTROL_STYLE` (the dashboard root `<div style={NOVA_MISSION_CONTROL_STYLE}>` wrapper) and rename to `NOVA_COCKPIT_STYLE`.

- [ ] 1.4 Run `npx tsc --noEmit -p tsconfig.json` (or the repo's existing typecheck script) — expect zero new errors from the rename.

- [ ] 1.5 Commit:
  ```
  git add src/screens/dashboard/lib/nova-cockpit-theme.ts src/screens/dashboard/lib/status-meta.ts src/screens/dashboard/dashboard-screen.tsx
  git commit -m "cockpit: navy+amber chrome tokens and centralized status tones"
  ```

---

## Task 2: Palette tripwire test

**Files:**
- Create `src/screens/dashboard/lib/nova-cockpit-theme.test.ts`

- [ ] 2.1 Write the test file. Write it FIRST, run it, confirm it currently passes against the T1 output (T1 must already be committed — this is a regression tripwire, not classic TDD-before-implementation, since T1's token values were authored together with this test's bucket math):

```ts
import { describe, expect, it } from 'vitest'
import { GALAXY_PALETTE, NOVA_COCKPIT_TOKENS } from './nova-cockpit-theme'

type Hsl = { h: number; s: number; l: number }

/** Minimal #rgb / #rrggbb / rgba(r,g,b,a) → HSL, tripwire-local only. */
function hexToHsl(hex: string): Hsl {
  let r = 0
  let g = 0
  let b = 0
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16)
    g = parseInt(hex[2] + hex[2], 16)
    b = parseInt(hex[3] + hex[3], 16)
  } else {
    r = parseInt(hex.slice(1, 3), 16)
    g = parseInt(hex.slice(3, 5), 16)
    b = parseInt(hex.slice(5, 7), 16)
  }
  return rgbToHsl(r, g, b)
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = 60 * (((gn - bn) / delta) % 6)
  else if (max === gn) h = 60 * ((bn - rn) / delta + 2)
  else h = 60 * ((rn - gn) / delta + 4)
  if (h < 0) h += 360
  return { h, s, l }
}

/** Extract every #hex / rgba(...) color literal in a CSS value string. */
function extractColors(value: string): Array<Hsl> {
  const colors: Array<Hsl> = []
  const hexMatches = value.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []
  for (const hex of hexMatches) colors.push(hexToHsl(hex))
  const rgbaMatches = value.matchAll(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)/g,
  )
  for (const match of rgbaMatches) {
    colors.push(rgbToHsl(Number(match[1]), Number(match[2]), Number(match[3])))
  }
  return colors
}

function isNeutral(c: Hsl): boolean {
  return c.s < 0.12
}
function isNavySurface(c: Hsl): boolean {
  return c.h >= 200 && c.h <= 235 && c.l < 0.35
}
function isAmberOrGold(c: Hsl): boolean {
  return c.h >= 15 && c.h <= 50
}
function isWarmRed(c: Hsl): boolean {
  return c.h >= 0 && c.h < 15
}
function isGreenLeak(c: Hsl): boolean {
  return c.h > 70 && c.h < 170 && c.s >= 0.12
}
function isPurpleLeak(c: Hsl): boolean {
  return c.h > 250 && c.h < 300 && c.s >= 0.12
}
function isCyanChromeLeak(c: Hsl): boolean {
  return c.h > 170 && c.h < 200 && c.s > 0.3
}

describe('cockpit chrome token tripwire', () => {
  const entries = Object.entries(NOVA_COCKPIT_TOKENS)

  it('every chrome token color resolves to navy, amber/gold, warm-red, or neutral', () => {
    for (const [key, value] of entries) {
      const colors = extractColors(value)
      for (const color of colors) {
        const ok =
          isNeutral(color) ||
          isNavySurface(color) ||
          isAmberOrGold(color) ||
          isWarmRed(color)
        expect(
          ok,
          `${key}="${value}" resolved to h=${color.h.toFixed(1)} s=${color.s.toFixed(2)} l=${color.l.toFixed(2)}, outside the navy/amber/warm-red/neutral chrome canon`,
        ).toBe(true)
      }
    }
  })

  it('no chrome token leaked a green hue', () => {
    for (const [key, value] of entries) {
      for (const color of extractColors(value)) {
        expect(isGreenLeak(color), `${key}="${value}" leaked a green hue`).toBe(
          false,
        )
      }
    }
  })

  it('no chrome token leaked a purple hue', () => {
    for (const [key, value] of entries) {
      for (const color of extractColors(value)) {
        expect(
          isPurpleLeak(color),
          `${key}="${value}" leaked a purple hue`,
        ).toBe(false)
      }
    }
  })

  it('no chrome token leaked a saturated cyan hue', () => {
    for (const [key, value] of entries) {
      for (const color of extractColors(value)) {
        expect(
          isCyanChromeLeak(color),
          `${key}="${value}" leaked a saturated cyan hue into chrome`,
        ).toBe(false)
      }
    }
  })

  it('GALAXY_PALETTE.blues stays untouched — neon blues are canon there, never in chrome', () => {
    expect(GALAXY_PALETTE.blues).toEqual(['#63C7FF', '#9DDCFF', '#2E7FD9'])
  })
})
```

- [ ] 2.2 Run `npx vitest run src/screens/dashboard/lib/nova-cockpit-theme.test.ts` — expect all 5 tests to pass (0 failures). If any chrome token fails, fix its value in `nova-cockpit-theme.ts` (T1), not the test.

- [ ] 2.3 Commit:
  ```
  git add src/screens/dashboard/lib/nova-cockpit-theme.test.ts
  git commit -m "cockpit: add green/purple/cyan tripwire test for chrome tokens"
  ```

---

## Task 3: Migrate card status colors to STATUS_TONE

**Files:**
- Modify `src/screens/dashboard/components/live-systems-card.tsx`
- Modify `src/screens/dashboard/components/agent-lanes-card.tsx`
- Modify `src/screens/dashboard/components/nova-session-bridge-card.tsx`
- Modify `src/screens/dashboard/components/agent-workforce-card.tsx`
- Modify `src/screens/dashboard/components/control-loops-card.tsx`

- [ ] 3.1 `live-systems-card.tsx` — delete the local `STATUS_META` object and `StatusPill`'s direct lookup, replace with `STATUS_TONE`:

  Delete lines 7–46 (`const STATUS_META: Record<LiveSystemStatus, …> = { … }`).

  Add import:
  ```ts
  import { STATUS_TONE } from '../lib/status-meta'
  ```

  Replace `StatusPill`:
  ```ts
  function StatusPill({ status }: { status: LiveSystemStatus }) {
    const meta = STATUS_TONE(status)
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.13em] ${meta.tone}`}
      >
        <span className={`size-1.5 rounded-full ${meta.dot}`} />
        {meta.label}
      </span>
    )
  }
  ```
  (Markup is unchanged — `STATUS_TONE('operational')` and `STATUS_TONE('approval-gated')` reproduce the same `{label, dot, tone}` shape the old literal returned, just gold/amber/warm-red instead of blue/amber/orange.)

- [ ] 3.2 `agent-lanes-card.tsx` — delete the local `STATUS_META` (lines 14–20), import `STATUS_TONE`, update `LaneRow`:

  Delete:
  ```ts
  const STATUS_META: Record<AgentLaneStatus, { label: string; dot: string }> = {
    active: { label: 'active', dot: 'bg-[var(--theme-success)]' },
    idle: { label: 'idle', dot: 'bg-[color-mix(in_srgb,var(--theme-success)_55%,var(--theme-muted))]' },
    offline: { label: 'offline', dot: 'bg-[var(--theme-danger)]' },
    'setup-needed': { label: 'setup needed', dot: 'bg-[var(--theme-accent)]' },
    unknown: { label: 'unknown', dot: 'bg-[var(--theme-muted)]' },
  }
  ```
  Add:
  ```ts
  import { STATUS_TONE } from '../lib/status-meta'
  ```
  In `LaneRow`, replace `const meta = STATUS_META[lane.status]` with `const meta = STATUS_TONE(lane.status)`. The pill JSX (`<span className="... text-[var(--theme-text)]"><span className={meta.dot} />{meta.label}</span>`) is unchanged since `meta.dot`/`meta.label` keep the same shape.

- [ ] 3.3 `nova-session-bridge-card.tsx` — replace `SOURCE_TONE` with a 3-line adapter over `STATUS_TONE` (this card's sources use a different 3-value enum, `ok | degraded | unavailable`, and render plain text with no border/pill, so only the text-color class is extracted):

  Delete:
  ```ts
  const SOURCE_TONE: Record<SessionBridgeSourceState, string> = {
    ok: 'text-[var(--theme-success)]',
    degraded: 'text-[var(--theme-warning)]',
    unavailable: 'text-[var(--theme-muted)]',
  }
  ```
  Add:
  ```ts
  import { STATUS_TONE } from '../lib/status-meta'

  // 3-line adapter: SessionBridgeSourceState → STATUS_TONE's status
  // literal, then strip the border-color class since this label is
  // plain inline text (no pill/border in the markup below).
  function sourceToneText(state: SessionBridgeSourceState): string {
    const status = state === 'ok' ? 'operational' : state === 'degraded' ? 'degraded' : 'not-wired'
    return STATUS_TONE(status).tone.replace(/border-\S+\s*/, '').trim()
  }
  ```
  Update the usage site:
  ```tsx
  <span
    key={source.label}
    className={`font-mono text-[9px] uppercase tracking-[0.1em] ${sourceToneText(source.state)}`}
    title={source.detail}
  >
    {source.label}: {source.state}
  </span>
  ```

- [ ] 3.4 `agent-workforce-card.tsx` — delete the local `STATUS_META` (lines 7–38), import `STATUS_TONE`, adapt `AgentWorkerStatus` (`idle|queued|running|blocked|reviewing|done`, which has no 1:1 match in `DashboardStatusLiteral`) with a small map:

  Delete the `STATUS_META` object.
  Add:
  ```ts
  import { STATUS_TONE } from '../lib/status-meta'

  const WORKER_STATUS_MAP: Record<AgentWorkerStatus, string> = {
    idle: 'idle',
    queued: 'setup-needed',
    running: 'active',
    blocked: 'offline',
    reviewing: 'degraded',
    done: 'not-wired',
  }
  ```
  In `WorkerRow`, replace `const meta = STATUS_META[worker.status]` with:
  ```ts
  const meta = STATUS_TONE(WORKER_STATUS_MAP[worker.status])
  ```

- [ ] 3.5 `control-loops-card.tsx` — delete `LOOP_STATUS_STYLE` and `SOURCE_STATUS_STYLE` (lines 25–39), replace with `STATUS_TONE`-derived lookups. `ControlLoopStatus` (`ready|partial|not-wired`) maps 1:1; `ControlLoopSourceStatus` (`connected|available|not-wired|unavailable`) needs a small adapter since it renders only a `<span className={dot} />`, no border:

  Delete:
  ```ts
  const LOOP_STATUS_STYLE: Record<ControlLoopStatus, string> = { … }
  const SOURCE_STATUS_STYLE: Record<ControlLoopSourceStatus, string> = { … }
  ```
  Add:
  ```ts
  import { STATUS_TONE } from '../lib/status-meta'

  function loopStatusPillClass(status: ControlLoopStatus): string {
    const meta = STATUS_TONE(status)
    return `${meta.tone} bg-[color-mix(in_srgb,var(--theme-border)_0%,transparent)]`
  }

  const SOURCE_STATUS_MAP: Record<ControlLoopSourceStatus, string> = {
    connected: 'operational',
    available: 'setup-needed',
    'not-wired': 'not-wired',
    unavailable: 'offline',
  }
  ```
  Update `StatusBadge`:
  ```tsx
  function StatusBadge({ status }: { status: ControlLoopStatus }) {
    return (
      <span
        className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${loopStatusPillClass(status)}`}
      >
        {formatStatus(status)}
      </span>
    )
  }
  ```
  Update the source dot usage inside `LoopCard`:
  ```tsx
  <span
    className={`size-1.5 rounded-full ${STATUS_TONE(SOURCE_STATUS_MAP[system.status]).dot}`}
  />
  ```

- [ ] 3.6 Run the migrated cards through typecheck and the existing dashboard test suite (there is no dashboard-specific test file yet — see T2 for the only current dashboard test — so this step is a build/typecheck gate, not a vitest run):
  ```
  npx tsc --noEmit -p tsconfig.json
  ```
  Expect zero errors referencing `STATUS_META`, `SOURCE_TONE`, `LOOP_STATUS_STYLE`, or `SOURCE_STATUS_STYLE` (all five must be fully removed, not just unused).

- [ ] 3.7 Commit:
  ```
  git add src/screens/dashboard/components/live-systems-card.tsx src/screens/dashboard/components/agent-lanes-card.tsx src/screens/dashboard/components/nova-session-bridge-card.tsx src/screens/dashboard/components/agent-workforce-card.tsx src/screens/dashboard/components/control-loops-card.tsx
  git commit -m "cockpit: migrate 5 cards from local STATUS_META literals to STATUS_TONE"
  ```

---

## Task 4: Hero galaxy + dense grid

**Files:**
- Modify `src/screens/dashboard/dashboard-screen.tsx`
- Modify `src/screens/dashboard/components/mind-graph-card.tsx`

**Context:** `MindGraphCard` is currently mounted unwrapped (not through `WidgetShell`, unlike every other card) directly after `<HomeModeCard />` at line 1240, so it is always visible and not part of `WIDGET_CATALOG`. It stays that way — the spec calls it "the hero," not a toggleable widget. Today its canvas is `h-[58vh] min-h-[360px] ... sm:h-[560px] lg:h-[650px]` (a fixed-px override on lg+ that caps it well under 70vh on tall monitors). The primary-ops cards (`live_systems`, `taylor_approvals`, `session_bridge`) are currently scattered mid-page (lines 1244–1271); this task pulls them to sit directly under the galaxy and marks the decorative cards `data-tier="quiet"`.

- [ ] 4.1 Modify `mind-graph-card.tsx` — widen the galaxy viewport on desktop. Replace:
  ```tsx
  <div className="nova-galaxy-field relative mt-3 h-[58vh] min-h-[360px] flex-1 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] sm:h-[560px] lg:h-[650px]">
  ```
  with:
  ```tsx
  <div className="nova-galaxy-field relative mt-3 h-[58vh] min-h-[360px] flex-1 overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] lg:h-[70vh] lg:min-h-[560px]">
  ```
  (Drops the `sm:h-[560px] lg:h-[650px]` px caps in favor of a real `70vh` on lg+ per the spec's "not a ~350px strip" note, keeping `min-h-[560px]` as a floor on short viewports. The sidebar `xl:flex xl:w-72 xl:flex-col` in the parent `<aside>` already sits beside the field at `xl+`, not below — no change needed there.)

- [ ] 4.2 Modify `dashboard-screen.tsx` — regroup the top of the card stack. Replace the block from `<HomeModeCard />` through the `<WidgetShell id="git_work" …>` close (lines 1238–1271) with:

  ```tsx
        <HomeModeCard />

        <MindGraphCard />

        {/* ── Primary ops row: hero-adjacent, always the first thing seen
           after the galaxy. Iteration nova-cockpit-pass: pulled live
           systems / approvals / session bridge out of the scattered
           mid-page order so the operator sees "is anything broken" and
           "does Nova need me" immediately below the galaxy. ── */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <WidgetShell id="taylor_approvals" layout={layout}>
            <TaylorApprovalQueueCard />
          </WidgetShell>
          <WidgetShell id="session_bridge" layout={layout}>
            <NovaSessionBridgeCard />
          </WidgetShell>
        </div>
        <WidgetShell id="live_systems" layout={layout}>
          <LiveSystemsCard liveSystems={overview?.liveSystems ?? null} />
        </WidgetShell>

        <DailyCheckCard />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <WidgetShell id="agent_lanes" layout={layout}>
            <AgentLanesCard />
          </WidgetShell>
          <WidgetShell id="nova_wants" layout={layout}>
            <NovaWantsCard />
          </WidgetShell>
        </div>

        <WidgetShell id="nova_fabric" layout={layout}>
          <NovaFabricCard />
        </WidgetShell>

        <WidgetShell id="agent_workforce" layout={layout}>
          <AgentWorkforceCard workforce={overview?.agentWorkforce ?? null} />
        </WidgetShell>

        <WidgetShell id="git_work" layout={layout}>
          <GitWorkCard gitWork={overview?.gitWork ?? null} />
        </WidgetShell>
  ```

  (`galaxy → approvals → session_bridge → live_systems` matches the task order exactly: the galaxy is unwrapped/always-on so it's first by construction, then approvals+session_bridge share a row, then live_systems gets its own full-width row since it's the widest card. `agent_lanes`/`nova_wants` are paired below since neither is in the primary-ops set. Tightened from the original single-column stack — was 8 full-width sections in a row, now 2 two-up rows + 4 full-width, cutting vertical scroll roughly in half before Hero Metrics.)

- [ ] 4.3 Modify `dashboard-screen.tsx` — tighten the analytics/session-rail grid gaps from the default 3-unit gap already in place (`gap-3` is already the value used at lines 1297, 1361 — confirm no larger gap classes remain) by auditing for any `gap-4`/`gap-6` in the dashboard JSX and downgrading to `gap-3`:
  ```
  grep -n "gap-4\|gap-6" src/screens/dashboard/dashboard-screen.tsx
  ```
  For each match found in the card-grid containers (not inside a single card's internal layout, which is out of scope), change to `gap-3`.

- [ ] 4.4 Modify `dashboard-screen.tsx` — mark the six named decorative cards `data-tier="quiet"` with reduced padding/type scale. Each of these renders through `<WidgetShell id="X" layout={layout}><Card /></WidgetShell>`; since `WidgetShell` passes through children unchanged in non-edit mode (see `widget-shell.tsx` line 40, `return <>{children}</>`), the `data-tier` attribute must go on each card's own root `<section>`, not the `WidgetShell` wrapper. For each of `operator-tip-card.tsx`, `achievements-card.tsx`, `token-mix-hour-card.tsx` (the `mix_rhythm` widget), `skills-usage-card.tsx`, `notebooklm-bridge-card.tsx`, `trust-ledger-card.tsx`:
  - Add `data-tier="quiet"` to the card's root `<section>`.
  - Change the root's padding class from `p-4` to `p-3` (or add `p-3` if unset).
  - Change the card's header label class (the `font-mono ... uppercase tracking-[0.18em] text-[var(--theme-muted)]` header line each card already has, matching the pattern seen in `live-systems-card.tsx`/`agent-workforce-card.tsx`) from `text-[10px]` to `text-[10px]` with an added `data-tier` scoped override — add this once, globally, instead of touching six files individually. In `dashboard-screen.tsx`'s top-level style block (or a new small `<style>` tag rendered once near the root, matching how the file already inlines `NOVA_COCKPIT_STYLE` as a `style` prop) add:
  ```tsx
  <style>{`
    [data-tier="quiet"] { padding: 0.75rem; }
    [data-tier="quiet"] .nova-label { font-size: 9px; }
  `}</style>
  ```
  placed once, immediately after the dashboard root `<div style={NOVA_COCKPIT_STYLE}>` open tag. (`nova-label` is the shared class every card already uses for its section header — confirmed via `mind-graph-card.tsx`'s `<div className="nova-label">Operational map</div>` and the same class name pattern in the header rows above — so this one CSS rule quiets every quiet-tier card's header without touching each file's className strings.) Then in each of the six files, add only `data-tier="quiet"` to the root `<section>` element — a one-line, one-attribute diff per file.

- [ ] 4.5 Run `npx vite build` — expect a clean build with no missing-import or JSX errors from the reordering.

- [ ] 4.6 Commit:
  ```
  git add src/screens/dashboard/dashboard-screen.tsx src/screens/dashboard/components/mind-graph-card.tsx src/screens/dashboard/components/operator-tip-card.tsx src/screens/dashboard/components/achievements-card.tsx src/screens/dashboard/components/token-mix-hour-card.tsx src/screens/dashboard/components/skills-usage-card.tsx src/screens/dashboard/components/notebooklm-bridge-card.tsx src/screens/dashboard/components/trust-ledger-card.tsx
  git commit -m "cockpit: hero-height galaxy, primary-ops row reorder, quiet-tier decorative cards"
  ```

---

## Task 5: Galaxy model v2 (pure)

**Files:**
- Modify `src/screens/dashboard/components/nova-galaxy-model.ts`
- Create `src/screens/dashboard/components/nova-galaxy-model-v2.test.ts`

TDD order: write the test file first, watch it fail (functions don't exist yet), then add the functions to `nova-galaxy-model.ts`.

- [ ] 5.1 Write `nova-galaxy-model-v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  HUB_DEGREE_THRESHOLD,
  clusterHue,
  emberSize,
  gaussianFrom,
  isHub,
  mulberry32,
  recencyGlow,
  spiralPosition,
} from './nova-galaxy-model'

describe('mulberry32 + gaussianFrom', () => {
  it('is deterministic for a fixed seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect(a()).toBe(b())
    expect(a()).toBe(b())
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)()
    const b = mulberry32(2)()
    expect(a).not.toBe(b)
  })

  it('gaussianFrom stays finite across many draws', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 200; i += 1) {
      expect(Number.isFinite(gaussianFrom(rng))).toBe(true)
    }
  })
})

describe('spiralPosition', () => {
  it('is deterministic — same inputs produce the same outputs', () => {
    const a = spiralPosition(5, 1, 3, 0.6)
    const b = spiralPosition(5, 1, 3, 0.6)
    expect(a).toEqual(b)
  })

  it('differs across arms for the same seed and radius', () => {
    const arm0 = spiralPosition(5, 0, 3, 0.6)
    const arm1 = spiralPosition(5, 1, 3, 0.6)
    expect(arm0).not.toEqual(arm1)
  })

  it('radius grows with radiusNorm — low radiusNorm stays near the core, high radiusNorm reaches the rim', () => {
    // radiusNorm gates the exponential term multiplicatively, so the
    // gap between a low and high sample dwarfs the bounded jitter
    // term at every seed — this is a wide-margin comparison, not an
    // exact-boundary one, precisely so it isn't seed-flaky.
    for (let seed = 1; seed <= 10; seed += 1) {
      const near = spiralPosition(seed, 0, 3, 0.05)
      const far = spiralPosition(seed, 0, 3, 0.95)
      const nearRadius = Math.hypot(near.x, near.z)
      const farRadius = Math.hypot(far.x, far.z)
      expect(farRadius, `seed ${seed}: far=${farRadius} near=${nearRadius}`).toBeGreaterThan(
        nearRadius,
      )
    }
  })
})

describe('clusterHue', () => {
  it('cycles through the 4-hue palette deterministically', () => {
    expect(clusterHue(0)).toBe('blue')
    expect(clusterHue(1)).toBe('blue2')
    expect(clusterHue(2)).toBe('amber')
    expect(clusterHue(3)).toBe('blend')
    expect(clusterHue(4)).toBe('blue')
  })

  it('is stable for the same folderIndex', () => {
    expect(clusterHue(11)).toBe(clusterHue(11))
  })
})

describe('recencyGlow', () => {
  const now = '2026-07-10T12:00:00.000Z'

  it('is 1.0 for anything modified within the last 7 days', () => {
    expect(recencyGlow('2026-07-09T12:00:00.000Z', now)).toBe(1)
    expect(recencyGlow(now, now)).toBe(1)
  })

  it('falls off linearly and clamps at 0.35 for anything 90+ days old', () => {
    expect(recencyGlow('2026-04-11T12:00:00.000Z', now)).toBe(0.35)
    expect(recencyGlow('2020-01-01T00:00:00.000Z', now)).toBe(0.35)
  })

  it('sits strictly between 0.35 and 1 at the midpoint of the falloff window', () => {
    const midpoint = new Date(
      Date.parse('2026-07-03T12:00:00.000Z') -
        ((90 - 7) / 2) * 86_400_000,
    ).toISOString()
    const glow = recencyGlow(midpoint, now)
    expect(glow).toBeGreaterThan(0.35)
    expect(glow).toBeLessThan(1)
  })

  it('falls back to 0.35 for unparseable dates', () => {
    expect(recencyGlow('not-a-date', now)).toBe(0.35)
  })
})

describe('emberSize + isHub', () => {
  it('grows monotonically with degree', () => {
    expect(emberSize(0)).toBeLessThan(emberSize(3))
    expect(emberSize(3)).toBeLessThan(emberSize(10))
  })

  it('is 1 at degree 0', () => {
    expect(emberSize(0)).toBe(1)
  })

  it('flags hubs at the documented threshold', () => {
    expect(HUB_DEGREE_THRESHOLD).toBe(6)
    expect(isHub(5)).toBe(false)
    expect(isHub(6)).toBe(true)
    expect(isHub(20)).toBe(true)
  })
})
```

- [ ] 5.2 Run `npx vitest run src/screens/dashboard/components/nova-galaxy-model-v2.test.ts` — expect all tests to FAIL with "does not provide an export named …" (functions don't exist yet).

- [ ] 5.3 Append the new pure functions to `nova-galaxy-model.ts` (after the existing `obsidianUri` export, before `fallbackFolder`, so they sit alongside the other small pure helpers already in the file — `clamp` and `seededUnit` above are reused, not duplicated):

```ts
/**
 * Deterministic PRNG (mulberry32). Used for the dust-forward field's
 * procedural scatter so the same vault graph always renders the same
 * dust cloud — no re-shuffling on every re-render.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal sample via Box-Muller, drawn from a mulberry32 rng. */
export function gaussianFrom(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-9)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

const SPIRAL_A = 1.6
const SPIRAL_B = 0.28
const SPIRAL_THETA_SPAN = 6.2

/**
 * A point on a 3-arm logarithmic spiral (r = a·e^(bθ)), with
 * deterministic gaussian scatter layered on top so the arm reads as
 * dust rather than a clean line. `radiusNorm` in [0, 1] gates both the
 * radius (0 = core, 1 = rim) and the scatter width (dust is tighter
 * near the core, wider toward the rim).
 */
export function spiralPosition(
  seedIndex: number,
  armIndex: number,
  armCount: number,
  radiusNorm: number,
): { x: number; y: number; z: number } {
  const rng = mulberry32(seedIndex)
  const armOffset = (Math.PI * 2 * armIndex) / Math.max(1, armCount)
  const clampedRadius = clamp(radiusNorm, 0, 1)
  const theta = clampedRadius * SPIRAL_THETA_SPAN + armOffset
  const r = SPIRAL_A * Math.exp(SPIRAL_B * theta) * clampedRadius
  const scatter = 1 - clampedRadius * 0.4
  const jitterX = gaussianFrom(rng) * scatter * 2.4
  const jitterY = gaussianFrom(rng) * scatter * 1.1
  const jitterZ = gaussianFrom(rng) * scatter * 2.4
  return {
    x: Math.cos(theta) * r + jitterX,
    y: jitterY,
    z: Math.sin(theta) * r + jitterZ,
  }
}

const CLUSTER_HUE_CYCLE = ['blue', 'blue2', 'amber', 'blend'] as const
export type ClusterHue = (typeof CLUSTER_HUE_CYCLE)[number]

/** Round-robin cluster tint assignment: neon blues + one amber + blends. */
export function clusterHue(folderIndex: number): ClusterHue {
  const index =
    ((folderIndex % CLUSTER_HUE_CYCLE.length) + CLUSTER_HUE_CYCLE.length) %
    CLUSTER_HUE_CYCLE.length
  return CLUSTER_HUE_CYCLE[index]
}

const RECENCY_HOT_DAYS = 7
const RECENCY_COLD_DAYS = 90
const RECENCY_FLOOR = 0.35

/**
 * Recency-driven ember brightness: 1.0 for anything touched in the
 * last week, linear falloff to a 0.35 floor by 90 days, clamped.
 */
export function recencyGlow(modifiedIso: string, nowIso: string): number {
  const modified = Date.parse(modifiedIso)
  const now = Date.parse(nowIso)
  if (!Number.isFinite(modified) || !Number.isFinite(now)) return RECENCY_FLOOR
  const ageDays = Math.max(0, (now - modified) / 86_400_000)
  if (ageDays <= RECENCY_HOT_DAYS) return 1
  if (ageDays >= RECENCY_COLD_DAYS) return RECENCY_FLOOR
  const t =
    (ageDays - RECENCY_HOT_DAYS) / (RECENCY_COLD_DAYS - RECENCY_HOT_DAYS)
  return clamp(1 - t * (1 - RECENCY_FLOOR), RECENCY_FLOOR, 1)
}

export const HUB_DEGREE_THRESHOLD = 6

/** Ember visual size from wikilink degree — log-scaled so hubs read big without dominating. */
export function emberSize(degree: number): number {
  return 1 + Math.log2(1 + Math.max(0, degree)) * 0.6
}

/** Whether a note's degree crosses the hub threshold (amber pulse tier). */
export function isHub(degree: number): boolean {
  return degree >= HUB_DEGREE_THRESHOLD
}
```

- [ ] 5.4 Run `npx vitest run src/screens/dashboard/components/nova-galaxy-model-v2.test.ts` — expect all tests to PASS.

- [ ] 5.5 Run `npx vitest run src/screens/dashboard/components/` (or whatever glob matches existing galaxy-model tests, if any pre-date this plan) to confirm the append did not break existing exports — since this step only *appends* new named exports and reuses (not redefines) `clamp`, no existing export's behavior changes.

- [ ] 5.6 Commit:
  ```
  git add src/screens/dashboard/components/nova-galaxy-model.ts src/screens/dashboard/components/nova-galaxy-model-v2.test.ts
  git commit -m "galaxy-model: add spiralPosition/clusterHue/recencyGlow/emberSize pure helpers"
  ```

---

## Task 6: Dust-forward renderer

**Files:**
- Modify `src/screens/dashboard/components/mind-graph-card.tsx`

**Architecture note (deviation from the task brief — read before editing):** the task brief describes this card as "already uses a 2D canvas" and asks to keep 2D canvas with `globalCompositeOperation='lighter'`, no `three.js` dependency. That does not match the real file: `mind-graph-card.tsx` imports `* as THREE from 'three'` and drives a full `THREE.WebGLRenderer` scene (`Galaxy3D`, lines 316–972) — perspective camera, raycasting, textured planet meshes, `THREE.Points` starfield, a `THREE.Sprite` fog nebula. There is no 2D canvas anywhere in this file. This task implements the same dust-forward look using `three.js` primitives instead (`THREE.Points` with `AdditiveBlending` for dust — the direct WebGL equivalent of 2D `globalCompositeOperation='lighter'` — and `THREE.Sprite` for nebula regions, which the file already uses for its single hardcoded fog sprite). This satisfies the spec's "one canvas/renderer" budget line (`WebGLRenderer` owns exactly one `<canvas>`) without introducing a second rendering stack. Do not add a 2D `<canvas>` element to this file — that would violate the spec's own one-renderer budget.

- [ ] 6.1 Add the dust-field + nebula-cluster data prep as a `useMemo` inside `MindGraphCard`, computed once per `model` change (not per frame). Insert after the existing `const model = useMemo(...)` block:

```ts
type DustField = {
  positions: Float32Array
  colors: Float32Array
}

type NebulaRegion = {
  armId: string
  color: string
  position: { x: number; y: number; z: number }
  scale: number
}

const DUST_POINTS_PER_ARM = 5500
const DUST_ARM_COUNT = 3

function clusterHueColor(hue: ReturnType<typeof clusterHue>): string {
  switch (hue) {
    case 'blue':
      return GALAXY_PALETTE.blues[0]
    case 'blue2':
      return GALAXY_PALETTE.blues[1]
    case 'amber':
      return GALAXY_PALETTE.ambers[0]
    case 'blend':
      return GALAXY_PALETTE.ambers[2]
  }
}

function buildDustField(): DustField {
  const total = DUST_POINTS_PER_ARM * DUST_ARM_COUNT
  const positions = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)
  let cursor = 0
  for (let arm = 0; arm < DUST_ARM_COUNT; arm += 1) {
    for (let i = 0; i < DUST_POINTS_PER_ARM; i += 1) {
      const radiusNorm = i / DUST_POINTS_PER_ARM
      const point = spiralPosition(i, arm, DUST_ARM_COUNT, radiusNorm)
      positions[cursor * 3] = point.x
      positions[cursor * 3 + 1] = point.y
      positions[cursor * 3 + 2] = point.z
      // amber-white core → neon-blue arms → deep-blue rim
      const color = new THREE.Color()
      if (radiusNorm < 0.18) color.set('#FFF1CC')
      else if (radiusNorm < 0.62) color.set(GALAXY_PALETTE.blues[0])
      else color.set(GALAXY_PALETTE.blues[2])
      colors[cursor * 3] = color.r
      colors[cursor * 3 + 1] = color.g
      colors[cursor * 3 + 2] = color.b
      cursor += 1
    }
  }
  return { positions, colors }
}

function buildNebulaRegions(model: GalaxyModel): Array<NebulaRegion> {
  return model.arms.map((arm, index) => {
    const systemsInArm = model.systems.filter((s) => s.armId === arm.id)
    const center = systemsInArm.reduce(
      (acc, system) => ({
        x: acc.x + system.baseX / Math.max(1, systemsInArm.length),
        y: acc.y + system.baseY / Math.max(1, systemsInArm.length),
        z: acc.z + system.baseZ / Math.max(1, systemsInArm.length),
      }),
      { x: 0, y: 0, z: 0 },
    )
    return {
      armId: arm.id,
      color: clusterHueColor(clusterHue(index)),
      position: center,
      scale: 26 + Math.min(24, systemsInArm.length * 2.4),
    }
  })
}
```
  Then inside the `MindGraphCard` component body:
  ```ts
  const dustField = useMemo(() => buildDustField(), [])
  const nebulaRegions = useMemo(() => buildNebulaRegions(model), [model])
  ```
  Add the new imports to the top of the file:
  ```ts
  import {
    buildGalaxyModel,
    clamp,
    clusterHue,
    emberSize,
    focusBodyForNavigation,
    focusDistanceForSystem,
    folderTintFor,
    isHub,
    obsidianUri,
    recencyGlow,
    resolveProjectedLabels,
    seededUnit,
    selectLabelCandidates,
    shortTitle,
    spiralPosition,
  } from './nova-galaxy-model'
  import { GALAXY_PALETTE } from '../lib/nova-cockpit-theme'
  ```

- [ ] 6.2 Pass `dustField` and `nebulaRegions` into `Galaxy3D` as new props (extend `Galaxy3DProps`):
  ```ts
  type Galaxy3DProps = {
    model: GalaxyModel
    dustField: { positions: Float32Array; colors: Float32Array }
    nebulaRegions: Array<{
      armId: string
      color: string
      position: { x: number; y: number; z: number }
      scale: number
    }>
    selectedBody: CelestialBody | null
    hoveredBody: CelestialBody | null
    disabledArms: Set<string>
    searchTerm: string
    isLoading: boolean
    onHover: (body: CelestialBody | null) => void
    onSelect: (body: CelestialBody | null) => void
  }
  ```
  and at the `<Galaxy3D …>` call site in `MindGraphCard`'s JSX:
  ```tsx
  <Galaxy3D
    model={model}
    dustField={dustField}
    nebulaRegions={nebulaRegions}
    selectedBody={selectedBody}
    hoveredBody={hoveredBody}
    disabledArms={disabledArms}
    searchTerm={searchTerm}
    isLoading={graphQuery.isLoading}
    onHover={handleHover}
    onSelect={handleSelect}
  />
  ```

- [ ] 6.3 Inside `Galaxy3D`'s main `useEffect` (the scene-setup effect, currently starting `const scene = new THREE.Scene()` at line 351), replace the single hardcoded starfield block (lines 377–407, `model.starfield.forEach(...)` through `scene.add(stars)`) with a dust-forward version that renders BOTH the existing sparse background starfield (kept, for depth) AND the new dense dust cloud:

  Keep the existing `stars` block unchanged (it's the far-background depth layer), and immediately after `scene.add(stars)` add:
  ```ts
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(dustField.positions, 3),
  )
  dustGeometry.setAttribute(
    'color',
    new THREE.BufferAttribute(dustField.colors, 3),
  )
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  const dustGroup = new THREE.Group()
  dustGroup.add(dust)
  scene.add(dustGroup)
  ```

  Replace the single `scene.add(ambient, key, coreLight, fill, rim, createFogNebula())` call: drop the bare `createFogNebula()` call (it stays defined, reused below per-cluster) and add lights only:
  ```ts
  scene.add(ambient, key, coreLight, fill, rim)
  ```
  Then, right after the `dustGroup` block, add one nebula sprite per cluster using the existing `createFogNebula` factory (generalized to take color/position/scale — see 6.4):
  ```ts
  const nebulaSprites = nebulaRegions.map((region) => {
    const sprite = createClusterNebula(region.color)
    sprite.position.set(region.position.x, region.position.y, region.position.z)
    sprite.scale.set(region.scale, region.scale * 0.55, 1)
    scene.add(sprite)
    return sprite
  })
  ```

- [ ] 6.4 Generalize `createFogNebula` (lines 290–315) into a color-parameterized `createClusterNebula`, keeping a no-arg `createFogNebula` wrapper so nothing else calling it breaks (nothing else does today, but this keeps the diff additive):

  ```ts
  function createClusterNebula(color: string): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext('2d')!
    const base = new THREE.Color(color)
    const glow = context.createRadialGradient(256, 256, 0, 256, 256, 256)
    glow.addColorStop(0, `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, 0.10)`)
    glow.addColorStop(0.34, `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, 0.05)`)
    glow.addColorStop(0.72, `rgba(${Math.round(base.r * 255)}, ${Math.round(base.g * 255)}, ${Math.round(base.b * 255)}, 0.02)`)
    glow.addColorStop(1, 'rgba(9, 10, 18, 0)')
    context.fillStyle = glow
    context.fillRect(0, 0, 512, 512)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    })
    return new THREE.Sprite(material)
  }

  function createFogNebula(): THREE.Sprite {
    const sprite = createClusterNebula('#7A441E')
    sprite.position.set(-28, -10, -48)
    sprite.scale.set(92, 42, 1)
    return sprite
  }
  ```
  (Budget check: spec caps nebula sprites at 90 — `nebulaRegions.length` is bounded by `model.arms.length`, already capped at 6 in `buildGalaxyModel`, so this is nowhere near the ceiling.)

- [ ] 6.5 Ember sizing/glow for tag-level bodies: wire `emberSize`/`recencyGlow`/`isHub` into the existing tag-marker creation loop (inside the `for (const system of model.systems)` block, `for (const tag of system.tags)` sub-loop, lines 487–507) so ember scale and glow are driven by the new model helpers instead of only `tag.importance`/`tag.recencyTier`. Replace the marker scale line:
  ```ts
  marker.scale.setScalar(
    0.62 + Math.min(0.9, Math.log2(tag.importance + 1) * 0.2),
  )
  ```
  with:
  ```ts
  const nowIso = new Date().toISOString()
  const glow = recencyGlow(tag.modified ?? tag.updated ?? '', nowIso)
  const hub = isHub(tag.degree)
  marker.scale.setScalar(emberSize(tag.degree) * (hub ? 1.15 : 1))
  tagMaterial.emissiveIntensity = hub ? 0.55 : 0.12 + glow * 0.3
  tagMaterial.emissive = new THREE.Color(hub ? AMBER : armTint)
  ```
  (`glow`/`hub` computed once per tag at scene-build time is intentional — recency doesn't change mid-session, so this avoids a per-frame `Date.now()` call; the existing `updateVisualState` per-frame loop still handles the hot-recency *pulse* animation via `tag.body.recencyTier === 'hot'`, unchanged.)

- [ ] 6.6 Cluster→core filaments: add a dedicated spoke-line pass after the existing `for (const link of model.links)` block (line 602, right before `const raycaster = new THREE.Raycaster()`):
  ```ts
  const spokeObjects: Array<LineObject> = []
  if (model.core) {
    const corePosition = bodyPositions.get(model.core.id)
    if (corePosition) {
      for (const system of model.systems) {
        if (system.planet.id === model.core.id) continue
        const systemPosition = bodyPositions.get(system.planet.id)
        if (!systemPosition) continue
        const geometry = new THREE.BufferGeometry().setFromPoints([
          systemPosition,
          corePosition,
        ])
        const material = new THREE.LineBasicMaterial({
          color: AMBER,
          transparent: true,
          opacity: 0.035,
          depthWrite: false,
        })
        const line = new THREE.Line(geometry, material)
        scene.add(line)
        spokeObjects.push({
          source: system.planet.id,
          target: model.core.id,
          strength: 0,
          material: material as unknown as THREE.LineDashedMaterial,
        })
      }
    }
  }
  ```

- [ ] 6.7 Slow rotation (~110s/rev) + mouse-parallax tilt, respecting `prefers-reduced-motion`: wrap the dust group + nebula sprites in rotation inside `animate()`. Add near the top of `animate`:
  ```ts
  const ROTATION_PERIOD_MS = 110_000
  let parallaxYaw = 0
  let parallaxPitch = 0
  ```
  (declare these two `let`s alongside the existing `let frame = 0` block, not inside `animate`, since they persist across frames) and inside `animate(now)`, before `updateCamera(now)`:
  ```ts
  if (!reducedMotionRef.current) {
    dustGroup.rotation.y = (now / ROTATION_PERIOD_MS) * Math.PI * 2
    for (const sprite of nebulaSprites) {
      sprite.material.rotation = (now / ROTATION_PERIOD_MS) * Math.PI * 2 * 0.4
    }
  }
  parallaxYaw += (pointerParallax.x * 0.05 - parallaxYaw) * 0.04
  parallaxPitch += (pointerParallax.y * 0.03 - parallaxPitch) * 0.04
  ```
  Add a `pointerParallax` ref (normalized -1..1 pointer position) updated in the existing `onPointerMove` handler (which already computes `pointer.x`/`pointer.y` via `normalizedPointer` — reuse those, don't recompute):
  ```ts
  let pointerParallax = { x: 0, y: 0 }
  ```
  and inside `onPointerMove`, after `normalizedPointer(event)` runs via `pickPlanet`, add (at the top of `onPointerMove`, before the `isDragging` branch, so parallax tracks even while not hovering a body):
  ```ts
  const bounds = renderer.domElement.getBoundingClientRect()
  pointerParallax = {
    x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    y: ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
  }
  ```
  Then fold `parallaxYaw`/`parallaxPitch` into the existing camera orientation inside `updateCamera` — after the existing auto-drift block (`if (!selected && !isDragging && !reducedMotionRef.current) { state.yaw += … }`), add:
  ```ts
  const appliedYaw = state.yaw + parallaxYaw
  const appliedPitch = clamp(state.pitch + parallaxPitch, -0.62, 0.78)
  ```
  and use `appliedYaw`/`appliedPitch` in place of `state.yaw`/`state.pitch` in the `camera.position.set(...)` call that follows (the stored `state.yaw`/`state.pitch` stay parallax-free so drag/wheel controls aren't fighting the parallax offset).

- [ ] 6.8 RAF lifecycle: stop on `document.hidden` and when offscreen (`IntersectionObserver`) — currently absent. Add both, alongside the existing `resizeObserver` setup (line 891 area):
  ```ts
  let isVisible = true
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      isVisible = entry.isIntersecting
    },
    { threshold: 0.05 },
  )
  intersectionObserver.observe(host)
  const onVisibilityChange = () => {
    if (document.hidden) {
      window.cancelAnimationFrame(frame)
    } else if (isVisible) {
      frame = window.requestAnimationFrame(animate)
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  ```
  and change the tail of `animate()` from an unconditional re-schedule to:
  ```ts
  if (!document.hidden && isVisible) {
    frame = window.requestAnimationFrame(animate)
  }
  ```
  When `isVisible` flips back to `true` via the `IntersectionObserver` callback while the tab is foregrounded, resume by requesting a frame there too:
  ```ts
  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      const wasVisible = isVisible
      isVisible = entry.isIntersecting
      if (isVisible && !wasVisible && !document.hidden) {
        frame = window.requestAnimationFrame(animate)
      }
    },
    { threshold: 0.05 },
  )
  ```
  Add cleanup in the effect's `return () => { … }` teardown:
  ```ts
  intersectionObserver.disconnect()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  ```

- [ ] 6.9 Cap `devicePixelRatio` at 1.5 per the spec's hard budget (currently capped at 2). Change:
  ```ts
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  ```
  to:
  ```ts
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  ```

- [ ] 6.10 `powerPreference: 'low-power'` per spec: add to the `WebGLRenderer` constructor:
  ```ts
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  })
  ```

- [ ] 6.11 Add the `spokeObjects` and `nebulaSprites`/`dustGroup` to the disposal pass in the effect teardown (the existing `scene.traverse(...)` disposal loop already walks every scene child generically via `geometry`/`material` duck-typing, so `dust`, `dustGroup`, `nebulaSprites`, and spoke `line`s are disposed automatically — no separate disposal code needed, confirm by reading the teardown block, not by adding redundant dispose calls).

- [ ] 6.12 Run `npx vite build` — expect a clean build (this file has no dedicated unit tests; `Galaxy3D` is a DOM/WebGL-effect component, verified visually in T10, not via vitest).

- [ ] 6.13 Commit:
  ```
  git add src/screens/dashboard/components/mind-graph-card.tsx
  git commit -m "galaxy: dust-forward THREE.Points field, per-cluster nebula sprites, ember sizing, slow rotation + parallax, RAF lifecycle, perf budget"
  ```

---

## Task 7: Wayfinding L1+L2 (constellation labels always-on, hover-identify)

**Files:**
- Modify `src/screens/dashboard/components/mind-graph-card.tsx`

**Context:** planet/tag label projection already exists (`projectLabels`, throttled to ~90ms via `lastLabelUpdate`) and already covers most of L2's "hover = identify + title chip" via the existing `labels` state rendered as `<button>` chips at lines 938–969. This task adds the missing pieces: (a) a separate, coarser cluster/arm-level label layer throttled to 4Hz as its own state (not folded into the existing 90ms planet/tag cadence, so a cheap always-on layer doesn't get starved by the denser one), and (b) screen-space (not raycast) nearest-ember hover + edge-flare-to-neon-blue.

- [ ] 7.1 Add cluster-label state and a 4Hz-throttled projection loop. Add a new type and state near the top of `Galaxy3D`:
  ```ts
  type ClusterLabel = {
    armId: string
    name: string
    x: number
    y: number
    opacity: number
  }
  ```
  Add state: `const [clusterLabels, setClusterLabels] = useState<Array<ClusterLabel>>([])`.
  Inside the effect, declare `let lastClusterLabelUpdate = 0` alongside `let lastLabelUpdate = 0`, and add a `projectClusterLabels` function mirroring `projectLabels`'s vector-projection pattern but over `nebulaRegions` instead of `model.systems`:
  ```ts
  const projectClusterLabels = () => {
    const vector = new THREE.Vector3()
    const projected: Array<ClusterLabel> = []
    for (const region of nebulaRegions) {
      vector.set(region.position.x, region.position.y, region.position.z)
      vector.project(camera)
      if (vector.z < -1 || vector.z > 1) continue
      const arm = model.arms.find((a) => a.id === region.armId)
      if (!arm) continue
      const distance = camera.position.distanceTo(
        new THREE.Vector3(region.position.x, region.position.y, region.position.z),
      )
      projected.push({
        armId: region.armId,
        name: arm.name,
        x: (vector.x * 0.5 + 0.5) * width,
        y: (-vector.y * 0.5 + 0.5) * height,
        // Fades as the camera closes in — "constellation names always
        // on, soft zoomed out, fade as camera closes in" (spec L1).
        opacity: clamp(1 - (OVERVIEW_DISTANCE - distance) / OVERVIEW_DISTANCE, 0.12, 0.85),
      })
    }
    setClusterLabels(projected)
  }
  ```
  In `animate(now)`, alongside the existing `if (now - lastLabelUpdate > 90) { projectLabels(); lastLabelUpdate = now }`, add:
  ```ts
  if (now - lastClusterLabelUpdate > 250) {
    projectClusterLabels()
    lastClusterLabelUpdate = now
  }
  ```
  (250ms = 4Hz, per spec's explicit throttle to avoid a re-render storm — deliberately coarser than the 90ms planet/tag cadence.)
  Reset `setClusterLabels([])` in the teardown alongside the existing `setLabels([])`.

- [ ] 7.2 Render the always-on cluster chips. Add a second pointer-events-none layer in `Galaxy3D`'s returned JSX, before the existing per-body `labels.map(...)` block:
  ```tsx
  <div className="pointer-events-none absolute inset-0 z-[9]">
    {clusterLabels.map((cluster) => (
      <div
        key={cluster.armId}
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,179,71,0.14)] bg-[rgba(5,11,22,0.5)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--theme-accent-secondary)] backdrop-blur-sm"
        style={{ left: cluster.x, top: cluster.y, opacity: cluster.opacity }}
      >
        {cluster.name}
      </div>
    ))}
  </div>
  ```

- [ ] 7.3 Screen-space nearest-ember hover (replacing raycast-only picking for tag-tier bodies while keeping raycast for planets/core/comets, which have real hit geometry sized to their visual radius). Add a helper inside the effect, near `pickPlanet`:
  ```ts
  const NEAREST_EMBER_PX = 24
  const emberScreenPositions = new Map<string, { x: number; y: number }>()
  const refreshEmberScreenPositions = () => {
    const vector = new THREE.Vector3()
    emberScreenPositions.clear()
    for (const tag of tagObjects) {
      vector.copy(tag.mesh.position).project(camera)
      if (vector.z < -1 || vector.z > 1) continue
      emberScreenPositions.set(tag.body.id, {
        x: (vector.x * 0.5 + 0.5) * width,
        y: (-vector.y * 0.5 + 0.5) * height,
      })
    }
  }
  const pickNearestEmber = (event: PointerEvent): CelestialBody | null => {
    const bounds = renderer.domElement.getBoundingClientRect()
    const px = event.clientX - bounds.left
    const py = event.clientY - bounds.top
    let best: { id: string; distance: number } | null = null
    for (const [id, pos] of emberScreenPositions) {
      const distance = Math.hypot(pos.x - px, pos.y - py)
      if (distance <= NEAREST_EMBER_PX && (!best || distance < best.distance)) {
        best = { id, distance }
      }
    }
    return best ? (model.bodyById.get(best.id) ?? null) : null
  }
  ```
  Call `refreshEmberScreenPositions()` once per frame in `animate(now)` (cheap — it's the same projection math `projectLabels` already does, just cached into a plain map instead of React state, so it doesn't trigger a re-render):
  ```ts
  refreshEmberScreenPositions()
  ```
  In `onPointerMove`, change the pick order so screen-space nearest-ember wins over raycast when both would hit (embers are visually small; the raycast hit-sphere is often larger than the visible dot, which reads as "imprecise" — the spec explicitly wants 24px screen-space nearest):
  ```ts
  const onPointerMove = (event: PointerEvent) => {
    pointerParallax = {
      x: ((event.clientX - renderer.domElement.getBoundingClientRect().left) / width) * 2 - 1,
      y: ((event.clientY - renderer.domElement.getBoundingClientRect().top) / height) * 2 - 1,
    }
    if (isDragging) {
      const dx = event.clientX - lastPointer.x
      const dy = event.clientY - lastPointer.y
      if (Math.abs(dx) + Math.abs(dy) > 2) pointerMoved = true
      cameraStateRef.current.yaw -= dx * 0.0045
      cameraStateRef.current.pitch -= dy * 0.0038
      lastPointer = { x: event.clientX, y: event.clientY }
      return
    }
    const nearestEmber = pickNearestEmber(event)
    const body = nearestEmber ?? pickPlanet(event)
    renderer.domElement.style.cursor = body ? 'pointer' : 'grab'
    onHover(body)
  }
  ```
  (This replaces the earlier draft of `onPointerMove` from 6.7's parallax step — 6.7 only added the `pointerParallax` assignment; this step folds that same assignment in while also swapping the pick logic, so implement 6.7's parallax line as part of this final `onPointerMove` body rather than twice.)

- [ ] 7.4 Edge-flare on hover: brighten the hovered ember's links to neon-blue for that frame (not persisted state — recomputed every frame in `updateVisualState`, which already loops `lineObjects` and computes `active`). Extend the existing link-opacity loop in `updateVisualState`:
  ```ts
  for (const link of lineObjects) {
    const source = model.bodyById.get(link.source)
    const target = model.bodyById.get(link.target)
    const active =
      (source?.systemId && activeIds.has(source.systemId)) ||
      (target?.systemId && activeIds.has(target.systemId)) ||
      source?.id === activeBodyId ||
      target?.id === activeBodyId
    const isHoverFlare =
      Boolean(hovered) && (source?.id === hovered?.id || target?.id === hovered?.id)
    const searched = Boolean(
      query &&
      ((source && matchesSearch(source, query)) ||
        (target && matchesSearch(target, query))),
    )
    const backbone = link.strength >= 12
    if (isHoverFlare) {
      link.material.color.set(GALAXY_PALETTE.blues[0])
      link.material.opacity = 0.72
    } else {
      link.material.color.set(
        source && target && source.systemId === target.systemId
          ? folderTintFor(source.folder)
          : GOLD,
      )
      if (active) link.material.opacity = 0.42
      else if (searched) link.material.opacity = 0.22
      else if (backbone) link.material.opacity = 0.07
      else link.material.opacity = 0.025
    }
  }
  ```
  (This is the first place `lineObjects[].material.color` is written per-frame — previously color was set once at creation. `THREE.LineDashedMaterial`/`LineBasicMaterial.color` is a mutable `THREE.Color`, so `.set(...)` is a cheap in-place update, not a material replacement.)

- [ ] 7.5 Run `npx vite build` — expect clean build.

- [ ] 7.6 Commit:
  ```
  git add src/screens/dashboard/components/mind-graph-card.tsx
  git commit -m "galaxy: always-on cluster labels (4Hz), 24px screen-space ember hover, neon-blue edge flare"
  ```

---

## Task 8: Wayfinding L3 (click = go & read, camera glide)

**Files:**
- Modify `src/screens/dashboard/components/mind-graph-card.tsx`

**Context:** click-to-select (`onSelect` → `setSelectedId`) and the note-read side panel (`selectedNotePath` → `/api/knowledge/read` via `noteQuery`) already exist and are NOT touched by this task — the spec's "reuses existing wiring, no fake data" requirement is already satisfied. What's missing is (a) a fixed ~600ms eased glide instead of the current open-ended exponential decay (which visually converges but has no defined duration), and (b) top-5 hub labels forced into `selectLabelCandidates` while a cluster is focused.

- [ ] 8.1 Time-boxed camera glide. Add glide-tracking fields to `cameraStateRef`'s initial value and a new ref for glide start state:
  ```ts
  const glideRef = useRef<{
    active: boolean
    startedAt: number
    fromTarget: THREE.Vector3
    fromDistance: number
    toTarget: THREE.Vector3
    toDistance: number
  } | null>(null)
  ```
  Add a `GLIDE_DURATION_MS = 600` constant near `OVERVIEW_DISTANCE`.
  Add an easing helper near the other free functions:
  ```ts
  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }
  ```
  In the effect, track the previous selected id so a glide only starts on a genuine selection change (not every render):
  ```ts
  let lastSelectedId: string | null = selectedRef.current?.id ?? null
  ```
  Replace the target/distance interpolation inside `updateCamera`:
  ```ts
  const updateCamera = (now: number) => {
    const state = cameraStateRef.current
    const selected = selectedRef.current
    const focusBody = focusBodyForNavigation(model, selected)
    const selectedSystem = focusBody
      ? model.systemByBodyId.get(focusBody.id)
      : null
    const selectedPosition = focusBody ? bodyPositions.get(focusBody.id) : null
    const desiredTarget = selectedPosition
      ? selectedPosition.clone().add(new THREE.Vector3(0, 1.4, 0))
      : homeTarget
    const desiredDistance = selectedSystem
      ? focusDistanceForSystem(selectedSystem)
      : OVERVIEW_DISTANCE

    const currentSelectedId = selected?.id ?? null
    if (currentSelectedId !== lastSelectedId && !reducedMotionRef.current) {
      glideRef.current = {
        active: true,
        startedAt: now,
        fromTarget: state.target.clone(),
        fromDistance: state.distance,
        toTarget: desiredTarget.clone(),
        toDistance: desiredDistance,
      }
      lastSelectedId = currentSelectedId
    } else if (currentSelectedId !== lastSelectedId) {
      // Reduced motion: snap instead of gliding.
      state.target.copy(desiredTarget)
      state.distance = desiredDistance
      lastSelectedId = currentSelectedId
    }

    const glide = glideRef.current
    if (glide?.active) {
      const t = clamp((now - glide.startedAt) / GLIDE_DURATION_MS, 0, 1)
      const eased = easeInOutCubic(t)
      state.target.lerpVectors(glide.fromTarget, glide.toTarget, eased)
      state.distance = glide.fromDistance + (glide.toDistance - glide.fromDistance) * eased
      if (t >= 1) glide.active = false
    } else {
      // No active glide (idle overview, or drag-driven re-target): keep
      // the original soft exponential follow so free-look drag doesn't
      // feel snappy/robotic.
      state.target.lerp(desiredTarget, reducedMotionRef.current ? 1 : 0.055)
      state.distance +=
        (desiredDistance - state.distance) *
        (reducedMotionRef.current ? 1 : 0.048)
    }

    if (!selected && !isDragging && !reducedMotionRef.current) {
      state.yaw += Math.sin(now / 14000) * 0.00016 + 0.00012
      state.pitch += (0.28 + Math.sin(now / 21000) * 0.03 - state.pitch) * 0.01
    }
    state.pitch = clamp(state.pitch, -0.62, 0.78)
    state.distance = clamp(state.distance, 11, 140)
    const appliedYaw = state.yaw + parallaxYaw
    const appliedPitch = clamp(state.pitch + parallaxPitch, -0.62, 0.78)
    const cosPitch = Math.cos(appliedPitch)
    camera.position.set(
      state.target.x + Math.sin(appliedYaw) * cosPitch * state.distance,
      state.target.y + Math.sin(appliedPitch) * state.distance,
      state.target.z + Math.cos(appliedYaw) * cosPitch * state.distance,
    )
    camera.lookAt(state.target)
  }
  ```
  (This supersedes the plain `state.target.lerp(desiredTarget, 0.055)` two-liner from the original file and folds in the parallax application from T6.7 — implement T6.7's `appliedYaw`/`appliedPitch` lines as part of this rewritten `updateCamera`, not as a separate edit, since both touch the same function body.)

- [ ] 8.2 Top-5 hub labels while a cluster is focused. In `selectLabelCandidates` (in `nova-galaxy-model.ts`), the `tagBudget` for an active system is already `12` — extend the per-tag ranking to force-include the top-5 by `isHub`/degree ahead of the importance sort, so hubs never lose their budget slot to a recently-touched non-hub tag. Modify the `rankedTags` sort inside the `isActive` branch of `selectLabelCandidates`:
  ```ts
  const rankedTags = [...system.tags].sort((a, b) => {
    if (isActive) {
      const hubDelta = Number(isHub(b.degree)) - Number(isHub(a.degree))
      if (hubDelta !== 0) return hubDelta
    }
    return b.importance - a.importance || a.title.localeCompare(b.title)
  })
  ```
  This requires importing `isHub` into `nova-galaxy-model.ts`'s own top-of-file scope — it's defined in the same file (T5), so no import is needed, just place `selectLabelCandidates`'s edit after `isHub`'s definition in file order, or (simpler, since `selectLabelCandidates` is defined earlier in the file than where T5 appends `isHub`) move this one-line sort tweak to reference `isHub` via a forward function declaration, which works in TypeScript/JS for `function`-declared exports regardless of source order — no reordering needed.

- [ ] 8.3 Escape-clears-selection: already implemented (`useEscape(clearSelection)`, `clearSelection` calls both `setSelectedId(null)` and `setInspectedId(null)`) — no change. Confirm by reading lines 1062–1066 before starting this task; if a regression is found here during T6/T7 edits, fix it as part of this task's commit rather than opening a new task.

- [ ] 8.4 Run `npx vite build` — expect clean build.

- [ ] 8.5 Commit:
  ```
  git add src/screens/dashboard/components/mind-graph-card.tsx src/screens/dashboard/components/nova-galaxy-model.ts
  git commit -m "galaxy: 600ms eased camera glide on select, force top hub labels in focus mode"
  ```

---

## Task 9: Wayfinding L4+L5 (search, legend, filters)

**Files:**
- Modify `src/screens/dashboard/components/mind-graph-card.tsx`

**Context:** `/api/knowledge/search?q=` already exists (`src/routes/api/knowledge/search.ts`) and returns `Array<{ path: string; title: string; line: number; text: string }>` via `searchKnowledgePages`. The card already has a plain search `<input>` wired to local `searchTerm` state (used only for label/opacity filtering inside the 3D scene, lines 1141–1149) — this task adds a real results dropdown against the server endpoint, a legend, and cluster/recency filter chips, without removing the existing `searchTerm` 3D-highlight behavior (results picking still sets `searchTerm` too, so the existing highlight logic keeps working).

- [ ] 9.1 Add the debounced search-results query inside `MindGraphCard` (not `Galaxy3D` — this is a side-panel concern):
  ```ts
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => window.clearTimeout(handle)
  }, [searchTerm])
  const searchResultsQuery = useQuery({
    queryKey: ['dashboard', 'knowledge-search', debouncedSearch],
    enabled: debouncedSearch.length > 0,
    queryFn: async (): Promise<{
      results: Array<{ path: string; title: string; line: number; text: string }>
    }> => {
      const response = await fetch(
        `/api/knowledge/search?q=${encodeURIComponent(debouncedSearch)}`,
      )
      if (!response.ok) throw new Error(`search ${response.status}`)
      return (await response.json()) as {
        results: Array<{ path: string; title: string; line: number; text: string }>
      }
    },
    staleTime: 15_000,
  })
  const searchResults = (searchResultsQuery.data?.results ?? []).slice(0, 8)
  ```

- [ ] 9.2 Render the results dropdown under the existing search input (lines 1141–1149). Wrap the existing `<label>…<input>…</label>` in a `relative` container and append a results list:
  ```tsx
  <div className="relative order-last w-full sm:order-none sm:ml-auto sm:w-auto sm:min-w-[180px]">
    <label className="flex items-center rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.72)] px-2 py-1 backdrop-blur-sm">
      <span className="sr-only">Search galaxy notes</span>
      <input
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Search notes"
        className="w-full bg-transparent font-mono text-[11px] text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted-2)]"
      />
    </label>
    {debouncedSearch && searchResults.length > 0 ? (
      <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--theme-border)] bg-[rgba(5,11,22,0.94)] p-1 backdrop-blur-sm">
        {searchResults.map((result) => (
          <button
            key={result.path}
            type="button"
            onClick={() => {
              setSelectedId(result.path)
              setSearchTerm(result.title)
            }}
            className="block w-full truncate rounded px-2 py-1 text-left font-mono text-[10px] text-[var(--theme-text-soft)] hover:bg-[var(--theme-accent-subtle)] hover:text-[var(--theme-accent-secondary)]"
            title={result.text}
          >
            {shortTitle(result.title)}
          </button>
        ))}
      </div>
    ) : null}
  </div>
  ```
  (`setSelectedId(result.path)` reuses the exact selection path `noteQuery`/backlink buttons already use elsewhere in this file (line 1281's `onClick={() => setSelectedId(backlink)}`) — the glide from T8 fires automatically since it's driven off `selectedId` changes, not a separate "fly to" call.)

- [ ] 9.3 Legend chip row. Add a new fixed-position legend block inside the galaxy field container (sibling to the existing top-toolbar `<div className="absolute left-2 right-2 top-2 …">`), anchored bottom-left per spec's "corner legend chip":
  ```tsx
  <div className="pointer-events-none absolute bottom-2 left-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--theme-border-subtle)] bg-[rgba(5,11,22,0.72)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--theme-muted)] backdrop-blur-sm">
    <span className="flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: GALAXY_PALETTE.blues[0] }} />
      color = cluster
    </span>
    <span className="flex items-center gap-1">
      <span className="size-2.5 rounded-full" style={{ background: GALAXY_PALETTE.ambers[1] }} />
      size = links
    </span>
    <span className="flex items-center gap-1">
      <span className="size-2 animate-pulse rounded-full" style={{ background: GALAXY_PALETTE.ambers[0] }} />
      pulse = hub
    </span>
    <span className="flex items-center gap-1">
      <span className="size-2 rounded-full" style={{ background: '#FFF1CC' }} />
      bright = this week
    </span>
    <span className="flex items-center gap-1">
      <span className="size-1.5 rounded-full" style={{ background: TAN }} />
      comet = orphan
    </span>
  </div>
  ```

- [ ] 9.4 Filter chips: per-cluster toggle (already exists as the arm toggle row, lines 1127–1140 — `disabledArms`/`toggleArm` — this satisfies "filters: by cluster/folder" already; no new code needed here beyond confirming it dims to the spec's target, see 9.5) plus a new "this week" recency toggle:
  Add state in `MindGraphCard`: `const [thisWeekOnly, setThisWeekOnly] = useState(false)`.
  Add the toggle button in the same toolbar row as the arm chips (after the `model.arms.slice(0, 7).map(...)` block, before the search `<label>`):
  ```tsx
  <button
    type="button"
    onClick={() => setThisWeekOnly((current) => !current)}
    className={`rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] transition-colors sm:text-[10px] sm:tracking-[0.12em] ${thisWeekOnly ? 'border-[var(--theme-border)] bg-[var(--theme-accent-subtle)] text-[var(--theme-accent-secondary)]' : 'border-[var(--theme-border-subtle)] bg-[rgba(13,14,24,0.58)] text-[var(--theme-muted-2)]'}`}
    aria-pressed={thisWeekOnly}
  >
    this week
  </button>
  ```
  Pass `thisWeekOnly` down to `Galaxy3D` as a new prop (add to `Galaxy3DProps`: `thisWeekOnly: boolean`), and mirror it into a ref (`thisWeekRef`) alongside the existing `disabledRef`/`searchRef` sync effect.

- [ ] 9.5 Wire `thisWeekOnly` into the existing `bodyVisibleOpacity` helper (already the single choke point every render loop calls for opacity — planets, tags, comets, lines, labels all route through it, so one change here satisfies "dims embers with recencyGlow<1 to 20%" everywhere at once):
  ```ts
  const bodyVisibleOpacity = (
    body: CelestialBody,
    activeIds: Set<string>,
    query: string,
  ) => {
    const disabled = disabledRef.current.has(body.armId)
    let opacity = disabled ? 0.15 : 1
    if (activeIds.size > 0 && body.systemId && !activeIds.has(body.systemId))
      opacity *= 0.34
    if (query && !matchesSearch(body, query)) opacity *= 0.16
    if (thisWeekRef.current) {
      const glow = recencyGlow(body.modified ?? body.updated ?? '', new Date().toISOString())
      if (glow < 1) opacity *= 0.2
    }
    return opacity
  }
  ```
  (This matches the existing per-cluster dim ratio of `0.15` closely enough to read as one consistent filter language — spec asks for "dims other clusters to 15% alpha" (already `0.15`, unchanged) and "dims embers with recencyGlow<1 to 20%" (new `0.2` factor here) — both are satisfied by the same choke-point function, multiplicatively, so a note that's both off-cluster AND stale gets both penalties stacked, which is the expected filter-combination behavior.)

- [ ] 9.6 Run `npx vite build` — expect clean build.

- [ ] 9.7 Commit:
  ```
  git add src/screens/dashboard/components/mind-graph-card.tsx
  git commit -m "galaxy: search dropdown over /api/knowledge/search, legend chip, this-week recency filter"
  ```

---

## Task 10: Perf + design gate + ship

**Files:** none (verification-only task; a fix-up commit is expected if T1–T9 introduced issues, but no new files are planned)

- [ ] 10.1 Run the full test suite touched by this plan:
  ```
  npx vitest run src/screens/dashboard/lib/nova-cockpit-theme.test.ts
  npx vitest run src/screens/dashboard/components/nova-galaxy-model-v2.test.ts
  ```
  Expect 0 failures across both files.

- [ ] 10.2 Run a full production build:
  ```
  npx vite build
  ```
  Expect a clean build with no TypeScript or bundler errors.

- [ ] 10.3 Manual perf check (Chrome DevTools, dashboard route loaded with the real vault graph, not a mock):
  - Open the Performance panel, record 10s with the galaxy in view and the tab focused. Confirm the frame rate stays at or above 50fps on a mid-tier laptop GPU (spec doesn't set an exact fps floor beyond "budget respected" — use 50fps as the working bar since it's comfortably above the visible-jank threshold).
  - Open the Memory panel, take a heap snapshot after 60s of the dashboard sitting open. Confirm tab heap stays under 300MB (spec's incident note: "the 3-demo mockup page contributed to a RAM incident on 2026-07-10" — this is the regression guard).
  - Switch to a different browser tab for 15s, switch back; confirm via a `console.log` breakpoint or the Performance panel that no animation frames were recorded while hidden (validates T6.8's `document.hidden` RAF stop).
  - Scroll the galaxy card out of the viewport; confirm RAF also stops (validates the `IntersectionObserver` half of T6.8).

- [ ] 10.4 Screenshot design gate against the approved reference. Reference: `.superpowers/brainstorm/*/content/galaxy-dust-forward.html` (per the spec's "Look (locked)" section). Compare:
  - **Dust dominance** — does the field read as dust-forward (thousands of faint points) rather than a handful of bright planet spheres dominating the frame?
  - **Nebula subtlety** — are cluster nebula regions soft/low-opacity, "never clouds pasted on top" (spec wording), not solid-looking blobs?
  - **Label behavior** — do cluster labels stay legible at overview zoom and fade smoothly on zoom-in (T7); does hover produce a clean title chip within ~24px of the cursor (T7.3)?
  - **Chrome navy/amber** — zero cyan/purple/green anywhere in card borders, buttons, chips, or the dashboard background grid (this is also mechanically enforced by T2's tripwire, but the screenshot gate catches anything the tripwire's regex-based color extraction might miss, e.g. colors set via a Tailwind class name rather than a literal hex/rgba in the token map).
  - Iterate at least 2 rounds: take a screenshot, list concrete deltas against the 4 points above, make the code change, re-screenshot, repeat once more minimum before calling it done.

- [ ] 10.5 Check for whitespace/EOF issues before committing:
  ```
  git diff --check
  ```
  Fix any flagged trailing-whitespace or missing-newline issues.

- [ ] 10.6 Commit any fix-ups from 10.3/10.4 (only if changes were needed — if the design gate passes clean on the first screenshot, skip straight to 10.7):
  ```
  git add -A
  git commit -m "cockpit: perf + design-gate fixups from nova-cockpit-pass verification"
  ```

- [ ] 10.7 Push the branch:
  ```
  git push -u origin feature/nova-skin
  ```

---

## Verification

Run these in order from the repo root (`C:\Projects\nova-cockpit`) after all 10 tasks are complete:

```
npx vitest run src/screens/dashboard/lib/nova-cockpit-theme.test.ts
npx vitest run src/screens/dashboard/components/nova-galaxy-model-v2.test.ts
npx tsc --noEmit -p tsconfig.json
npx vite build
git diff --check
git log --oneline feature/nova-skin -10
```

Expected: both vitest files report 0 failures; `tsc` and `vite build` exit 0; `git diff --check` prints nothing; the last 10 commits show the task-by-task history from T1 through T10's fix-up (if any).
