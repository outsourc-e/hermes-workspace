export type MissionControlStatus =
  | 'running'
  | 'paused'
  | 'completed'
  | 'aborted'
  | 'stopped'

export const HUB_SPACING = {
  section: 'space-y-4',
  cardPadding: 'p-4',
  blockPadding: 'px-3 py-2.5',
  inlineGap: 'gap-2',
} as const

export const HUB_RADIUS = {
  card: 'rounded-2xl',
  block: 'rounded-xl',
  pill: 'rounded-full',
  button: 'rounded-lg',
} as const

export const HUB_COLORS = {
  surface:
    'border border-primary-200 bg-white/80 dark:border-neutral-700 dark:bg-neutral-900/70',
  mutedSurface:
    'border border-primary-200 bg-primary-50/60 dark:border-neutral-700 dark:bg-neutral-800/40',
  softSurface:
    'border border-primary-200 bg-primary-50/40 dark:border-neutral-700 dark:bg-neutral-900/20',
  heading: 'text-primary-900 dark:text-neutral-100',
  body: 'text-primary-700 dark:text-neutral-300',
  muted: 'text-primary-500 dark:text-neutral-400',
} as const

export const HUB_STATUS = {
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  blocked: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300',
  neutral: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
} as const

export const HUB_TYPE = {
  overline: 'text-[11px] font-semibold uppercase tracking-[0.14em]',
  title: 'text-lg font-semibold',
  subtitle: 'text-sm',
  body: 'text-xs',
  mono: 'font-mono text-[10px]',
} as const

export const MISSION_CONTROL_STATUS_META: Record<
  MissionControlStatus,
  {
    label: string
    className: string
  }
> = {
  running: {
    label: 'Running',
    className:
      'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  paused: {
    label: 'Paused',
    className:
      'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300',
  },
  completed: {
    label: 'Completed',
    className:
      'border border-neutral-200 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  },
  aborted: {
    label: 'Aborted',
    className:
      'border border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300',
  },
  stopped: {
    label: 'Stopped',
    className:
      'border border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
  },
}

export function mapSessionStatusToMissionControlStatus(
  value: string,
): MissionControlStatus {
  const status = value.trim().toLowerCase()
  if (
    status === 'active' ||
    status === 'running' ||
    status === 'thinking' ||
    status === 'processing' ||
    status === 'streaming'
  ) {
    return 'running'
  }
  if (
    status === 'idle' ||
    status === 'paused' ||
    status === 'pause' ||
    status === 'suspended'
  ) {
    return 'paused'
  }
  if (status === 'aborted' || status === 'error' || status === 'failed') {
    return 'aborted'
  }
  if (status === 'stopped') {
    return 'stopped'
  }
  return 'completed'
}
