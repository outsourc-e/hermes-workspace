import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  type WorkflowTemplate,
  getAllTemplates,
  deleteTemplate,
} from '../lib/workflow-templates'

type TemplatePickerProps = {
  onSelect: (template: WorkflowTemplate) => void
  onClose: () => void
}

export function TemplatePicker({ onSelect, onClose }: TemplatePickerProps) {
  const [search, setSearch] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const templates = useMemo(() => {
    void refreshKey // Force re-read on delete
    return getAllTemplates()
  }, [refreshKey])

  const filtered = useMemo(() => {
    if (!search) return templates
    const q = search.toLowerCase()
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.goal.toLowerCase().includes(q),
    )
  }, [templates, search])

  const builtIn = filtered.filter((t) => t.isBuiltIn)
  const custom = filtered.filter((t) => !t.isBuiltIn)

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Mission Templates
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            autoFocus
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto px-5 py-4">
          {builtIn.length > 0 && (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Built-in
              </p>
              <div className="grid gap-2">
                {builtIn.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </>
          )}

          {custom.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Custom
              </p>
              <div className="grid gap-2">
                {custom.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={onSelect}
                    onDelete={() => {
                      deleteTemplate(template.id)
                      setRefreshKey((k) => k + 1)
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-400">
              No templates found
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  onSelect,
  onDelete,
}: {
  template: WorkflowTemplate
  onSelect: (t: WorkflowTemplate) => void
  onDelete?: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className={cn(
        'group w-full rounded-xl border p-3 text-left transition-all',
        'border-neutral-200 bg-neutral-50 hover:border-sky-300 hover:bg-sky-50/50',
        'dark:border-neutral-700 dark:bg-neutral-800/50 dark:hover:border-sky-700 dark:hover:bg-sky-950/30',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-xl">{template.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              {template.name}
            </span>
            {template.tasks.length > 0 && (
              <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[9px] font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
                {template.tasks.length} tasks
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {template.description}
          </p>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="shrink-0 rounded p-1 text-xs text-neutral-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
          >
            🗑
          </button>
        )}
      </div>
    </button>
  )
}
