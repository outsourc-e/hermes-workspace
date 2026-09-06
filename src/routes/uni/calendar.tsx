import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'

function readEnv(name: string): string {
  const value = (import.meta as any).env?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/uni/calendar')({
  ssr: false,
  component: UniCalendarRoute,
})

function UniCalendarRoute() {
  usePageTitle('University — Calendar')
  const calendarUrl = readEnv('VITE_UNI_CALENDAR_URL')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <HugeiconsIcon icon={Clock01Icon} size={24} strokeWidth={1.5} />
        <h1 className="text-xl font-semibold text-[var(--theme-text)]">
          University calendar
        </h1>
      </div>
      <div className="flex flex-col rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)]">
          <span>Classes &amp; deadlines</span>
          {calendarUrl ? (
            <a
              href={calendarUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] underline-offset-2 hover:underline"
            >
              Open in Google Calendar ↗
            </a>
          ) : null}
        </div>
        {calendarUrl ? (
          <iframe
            title="University calendar"
            src={calendarUrl}
            className="h-[640px] w-full bg-white"
            style={{ border: 0 }}
          />
        ) : (
          <div className="flex h-[260px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[var(--theme-muted)]">
            <span>No calendar configured.</span>
            <span className="text-xs">
              Set <code>VITE_UNI_CALENDAR_URL</code> in <code>.env</code> to a
              Google Calendar embed URL (Settings → Integrate calendar → Public
              URL).
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
