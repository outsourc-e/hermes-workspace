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
