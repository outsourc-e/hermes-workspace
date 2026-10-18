import type { ThemeId } from '@/lib/theme'

export type ThemePreviewColors = {
  bg: string
  panel: string
  border: string
  accent: string
  text: string
}

// Canonical theme preview palette — single source of truth shared by the
// settings page and the settings dialog (previously two drifting copies).
export const THEME_PREVIEWS: Record<ThemeId, ThemePreviewColors> = {
  'hermes-nous': {
    bg: '#041C1C',
    panel: '#06282A',
    border: 'rgba(255,230,203,0.2)',
    accent: '#FFAC02',
    text: '#FFE6CB',
  },
  'hermes-nous-light': {
    bg: '#F8FAF8',
    panel: '#FBFDFB',
    border: 'rgba(30,74,92,0.18)',
    accent: '#2557B7',
    text: '#16315F',
  },
  'hermes-official': {
    bg: '#0A0E1A',
    panel: '#11182A',
    border: '#24304A',
    accent: '#6366F1',
    text: '#E6EAF2',
  },
  'hermes-official-light': {
    bg: '#F7F7F1',
    panel: '#FAFBF6',
    border: '#CDD5DA',
    accent: '#2557B7',
    text: '#16315F',
  },
  'hermes-classic': {
    bg: '#0d0f12',
    panel: '#1a1f26',
    border: '#2a313b',
    accent: '#b98a44',
    text: '#eceff4',
  },
  'hermes-classic-light': {
    bg: '#F5F2ED',
    panel: '#FCFAF7',
    border: '#D8CCBC',
    accent: '#b98a44',
    text: '#1a1f26',
  },
  'hermes-slate': {
    bg: '#0d1117',
    panel: '#1c2128',
    border: '#30363d',
    accent: '#7eb8f6',
    text: '#c9d1d9',
  },
  'hermes-slate-light': {
    bg: '#F6F8FA',
    panel: '#FFFFFF',
    border: '#D0D7DE',
    accent: '#3b82f6',
    text: '#24292f',
  },
}

export function ThemeSwatch({ colors }: { colors: ThemePreviewColors }) {
  return (
    <div
      className="flex h-10 w-full overflow-hidden rounded-md border"
      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
    >
      <div
        className="flex h-full w-4 flex-col gap-0.5 p-0.5"
        style={{ backgroundColor: colors.panel }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1.5 w-full rounded-sm"
            style={{ backgroundColor: colors.border }}
          />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-1">
        <div
          className="h-1.5 w-3/4 rounded"
          style={{ backgroundColor: colors.text, opacity: 0.8 }}
        />
        <div
          className="h-1 w-1/2 rounded"
          style={{ backgroundColor: colors.text, opacity: 0.3 }}
        />
        <div
          className="mt-0.5 h-1.5 w-6 rounded-full"
          style={{ backgroundColor: colors.accent }}
        />
      </div>
    </div>
  )
}
