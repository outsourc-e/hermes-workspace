import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Rocket01Icon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'
import { buttonVariants } from '@/components/ui/button'

function readEnv(name: string): string {
  const value = (import.meta as any).env?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/uni/moodle')({
  ssr: false,
  component: MoodleRoute,
})

function MoodleRoute() {
  usePageTitle('University — Moodle')
  const moodleUrl = readEnv('VITE_UNI_MOODLE_URL')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <HugeiconsIcon icon={Rocket01Icon} size={24} strokeWidth={1.5} />
        <h1 className="text-xl font-semibold text-[var(--theme-text)]">
          Moodle
        </h1>
      </div>
      <p className="mb-4 text-sm text-[var(--theme-muted)]">
        Open your university Moodle dashboard in a new tab.
      </p>
      {moodleUrl ? (
        <div>
          <a
            href={moodleUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'outline' })}
          >
            Open Moodle →
          </a>
        </div>
      ) : (
        <p className="text-xs text-[var(--theme-muted)]">
          Set <code>VITE_UNI_MOODLE_URL</code> in <code>.env</code> to your
          institution&rsquo;s Moodle URL.
        </p>
      )}
    </div>
  )
}
