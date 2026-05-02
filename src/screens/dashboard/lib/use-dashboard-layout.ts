import { useCallback, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'dashboard.layout.v1'

/**
 * Catalog of hideable widgets. The order here is also the *default
 * display order* on the side rail / main column, so adding a new
 * widget = adding it here in the right position.
 *
 * `column` distinguishes main column from side rail so the edit panel
 * can group them sensibly in the picker UI.
 */
export type WidgetId =
  | 'analytics_chart'
  | 'top_models'
  | 'sessions_intelligence'
  | 'logs_tail'
  | 'attention'
  | 'skills_usage'
  | 'achievements'
  | 'mix_rhythm'

export type WidgetMeta = {
  id: WidgetId
  label: string
  description: string
  column: 'main' | 'rail'
  /** Defaults to true; widgets opt-in to being hideable explicitly so
   *  we can keep "Attention" mandatory if we want, etc. */
  hideable: boolean
}

export const WIDGET_CATALOG: ReadonlyArray<WidgetMeta> = [
  {
    id: 'analytics_chart',
    label: 'Analytics chart',
    description: 'Tokens/sessions/calls trend with period switcher.',
    column: 'main',
    hideable: true,
  },
  {
    id: 'top_models',
    label: 'Top models',
    description: 'Routing share by model in the analytics window.',
    column: 'main',
    hideable: true,
  },
  {
    id: 'sessions_intelligence',
    label: 'Sessions intelligence',
    description: 'Recent sessions with token / tool / status badges.',
    column: 'main',
    hideable: true,
  },
  {
    id: 'logs_tail',
    label: 'Live logs',
    description: 'Tail of the gateway log stream.',
    column: 'main',
    hideable: true,
  },
  {
    id: 'attention',
    label: 'Attention',
    description: 'Cron, config, gateway warnings the operator should look at.',
    column: 'rail',
    hideable: true,
  },
  {
    id: 'skills_usage',
    label: 'Skills usage',
    description: 'Top-5 used skills as a bar chart.',
    column: 'rail',
    hideable: true,
  },
  {
    id: 'achievements',
    label: 'Achievements',
    description: 'Recent unlocks & progress.',
    column: 'rail',
    hideable: true,
  },
  {
    id: 'mix_rhythm',
    label: 'Mix & rhythm',
    description: 'Token mix + hour-of-day activity strip.',
    column: 'rail',
    hideable: true,
  },
]

type StoredLayout = {
  hidden: Array<WidgetId>
}

function readLayout(): StoredLayout {
  if (typeof window === 'undefined') return { hidden: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { hidden: [] }
    const parsed = JSON.parse(raw) as StoredLayout
    if (!Array.isArray(parsed.hidden)) return { hidden: [] }
    const valid = new Set<WidgetId>(
      WIDGET_CATALOG.map((w) => w.id),
    )
    return {
      hidden: parsed.hidden.filter((id): id is WidgetId =>
        valid.has(id as WidgetId),
      ),
    }
  } catch {
    return { hidden: [] }
  }
}

function writeLayout(layout: StoredLayout) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {
    /* quota / disabled storage — non-fatal */
  }
}

/**
 * Dashboard widget layout hook. Owns:
 * - which widgets are hidden (persisted to localStorage)
 * - whether the dashboard is in edit mode
 *
 * Returns helpers for individual widgets to ask "am I visible?" and
 * for the edit panel to flip widgets on/off.
 *
 * Kept as a hook (not a React Context) because the dashboard tree is
 * shallow enough that prop-drilling the result one level is cleaner
 * than threading a provider — and prop-drilling makes it obvious
 * which widgets actually consume the layout.
 */
export function useDashboardLayout() {
  const [editMode, setEditMode] = useState(false)
  const [hidden, setHidden] = useState<Set<WidgetId>>(
    () => new Set(readLayout().hidden),
  )

  // Persist on every change. Cheap; ~1KB max.
  useEffect(() => {
    writeLayout({ hidden: Array.from(hidden) })
  }, [hidden])

  const toggleEdit = useCallback(() => setEditMode((v) => !v), [])

  const hide = useCallback((id: WidgetId) => {
    setHidden((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const show = useCallback((id: WidgetId) => {
    setHidden((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const reset = useCallback(() => setHidden(new Set()), [])

  const isVisible = useCallback(
    (id: WidgetId) => !hidden.has(id),
    [hidden],
  )

  const counts = useMemo(() => {
    const total = WIDGET_CATALOG.length
    return {
      total,
      visible: total - hidden.size,
      hidden: hidden.size,
    }
  }, [hidden])

  return {
    editMode,
    toggleEdit,
    setEditMode,
    hidden,
    hide,
    show,
    reset,
    isVisible,
    counts,
  }
}

export type DashboardLayout = ReturnType<typeof useDashboardLayout>
