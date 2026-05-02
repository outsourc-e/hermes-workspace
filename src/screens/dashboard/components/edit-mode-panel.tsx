import {
  WIDGET_CATALOG,
  type DashboardLayout,
} from '@/screens/dashboard/lib/use-dashboard-layout'

/**
 * Edit-mode banner. Renders only when `layout.editMode` is true.
 *
 * Layout: a single sticky-ish strip below the header showing all
 * known widgets grouped by column (Main / Side rail) with a toggle
 * pill for each. Hidden widgets show as outlined chips so the
 * operator can re-add them.
 *
 * Design notes:
 * - We deliberately surface every widget here even ones that are
 *   currently visible, so it doubles as a hint of what's available.
 * - The banner is dense (single row on lg) so it doesn't push the
 *   real content way down.
 */
export function EditModePanel({ layout }: { layout: DashboardLayout }) {
  if (!layout.editMode) return null

  const main = WIDGET_CATALOG.filter((w) => w.column === 'main')
  const rail = WIDGET_CATALOG.filter((w) => w.column === 'rail')

  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-xl border p-3"
      style={{
        background:
          'linear-gradient(120deg, color-mix(in srgb, var(--theme-accent) 6%, var(--theme-card)), color-mix(in srgb, var(--theme-card) 92%, transparent))',
        borderColor: 'var(--theme-accent)',
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              background:
                'color-mix(in srgb, var(--theme-accent) 18%, transparent)',
              color: 'var(--theme-accent)',
            }}
          >
            Edit mode
          </span>
          <span
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
            style={{ color: 'var(--theme-muted)' }}
          >
            {layout.counts.visible} of {layout.counts.total} widgets shown
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={layout.reset}
            className="rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors hover:bg-[var(--theme-card)]"
            style={{
              background: 'var(--theme-card)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text)',
            }}
            title="Show every widget again"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => layout.setEditMode(false)}
            className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
            style={{
              background:
                'linear-gradient(135deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 60%, transparent))',
              color: 'var(--theme-on-accent, white)',
            }}
            title="Exit edit mode"
          >
            Done
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Group title="Main column" layout={layout} widgets={main} />
        <Group title="Side rail" layout={layout} widgets={rail} />
      </div>
    </div>
  )
}

function Group({
  title,
  layout,
  widgets,
}: {
  title: string
  layout: DashboardLayout
  widgets: typeof WIDGET_CATALOG
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span
        className="font-mono text-[9px] uppercase tracking-[0.18em]"
        style={{ color: 'var(--theme-muted)' }}
      >
        {title}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {widgets.map((w) => {
          const visible = layout.isVisible(w.id)
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => (visible ? layout.hide(w.id) : layout.show(w.id))}
              className="group inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-all"
              style={{
                background: visible
                  ? 'color-mix(in srgb, var(--theme-success) 14%, transparent)'
                  : 'transparent',
                border: `1px ${visible ? 'solid' : 'dashed'} ${
                  visible
                    ? 'color-mix(in srgb, var(--theme-success) 60%, transparent)'
                    : 'var(--theme-border)'
                }`,
                color: visible
                  ? 'var(--theme-success)'
                  : 'var(--theme-muted)',
              }}
              title={w.description}
            >
              <span
                className="inline-block size-1.5 rounded-full"
                style={{
                  background: visible
                    ? 'var(--theme-success)'
                    : 'var(--theme-muted)',
                }}
              />
              {w.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
