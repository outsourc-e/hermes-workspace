import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { Building01Icon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'

export const Route = createFileRoute('/projects')({
  ssr: false,
  component: ProjectsRoute,
})

function ProjectsRoute() {
  usePageTitle('Projects')
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <HugeiconsIcon icon={Building01Icon} size={24} strokeWidth={1.5} />
        <h1 className="text-xl font-semibold text-[var(--theme-text)]">
          Projects
        </h1>
      </div>
      <p className="text-sm text-[var(--theme-muted)]">
        Project workspaces will live here. Set one up to start tracking
        milestones, owners, and linked tasks.
      </p>
    </div>
  )
}
