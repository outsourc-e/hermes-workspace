import { createFileRoute } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckListIcon } from '@hugeicons/core-free-icons'
import { usePageTitle } from '@/hooks/use-page-title'

export const Route = createFileRoute('/todo')({
  ssr: false,
  component: TodoRoute,
})

function TodoRoute() {
  usePageTitle('To-do')
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center gap-3">
        <HugeiconsIcon icon={CheckListIcon} size={24} strokeWidth={1.5} />
        <h1 className="text-xl font-semibold text-[var(--theme-text)]">
          To-do
        </h1>
      </div>
      <p className="text-sm text-[var(--theme-muted)]">
        Personal to-do list. Quick items that don't need a full task or project.
      </p>
    </div>
  )
}
