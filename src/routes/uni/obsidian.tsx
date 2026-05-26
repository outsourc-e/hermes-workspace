import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { BrainIcon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'
import { buttonVariants } from '@/components/ui/button'

function readEnv(name: string): string {
  const value = (import.meta as any).env?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

export const Route = createFileRoute('/uni/obsidian')({
  ssr: false,
  component: ObsidianRoute,
})

function ObsidianRoute() {
  usePageTitle('University — Obsidian')
  const vaultUri = readEnv('VITE_UNI_OBSIDIAN_URI') || 'obsidian://open'

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <HugeiconsIcon icon={BrainIcon} size={24} strokeWidth={1.5} />
        <h1 className="text-xl font-semibold text-[var(--theme-text)]">
          Obsidian
        </h1>
      </div>
      <p className="mb-4 text-sm text-[var(--theme-muted)]">
        Open your university notes vault in the Obsidian desktop app.
      </p>
      <div>
        <a
          href={vaultUri}
          rel="noreferrer"
          className={buttonVariants({ variant: 'outline' })}
        >
          Open Obsidian vault →
        </a>
      </div>
      <p className="mt-3 text-xs text-[var(--theme-muted)]">
        Set <code>VITE_UNI_OBSIDIAN_URI</code> in <code>.env</code> to a vault
        URI (e.g. <code>obsidian://open?vault=Uni</code>).
      </p>
    </div>
  )
}
