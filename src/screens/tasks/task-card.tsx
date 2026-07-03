import { cn } from '@/lib/utils'
import type { ClaudeTask } from '@/lib/tasks-api'
import { PRIORITY_COLORS, isOverdue } from '@/lib/tasks-api'

type Props = {
  task: ClaudeTask
  assigneeLabels?: Record<string, string>
  onClick: () => void
  onDragStart: (e: React.DragEvent) => void
  isDragging?: boolean
}

export function formatTaskAssigneeLabel(
  assignee: string | null,
  assigneeLabels: Record<string, string>,
): string {
  const resolvedLabel = assignee ? (assigneeLabels[assignee] ?? assignee) : 'Unassigned'
  return `scope: ${resolvedLabel}`
}

export function TaskCard({ task, assigneeLabels = {}, onClick, onDragStart, isDragging }: Props) {
  const overdue = isOverdue(task)
  const priorityColor = PRIORITY_COLORS[task.priority]
  const visibleTags = task.tags.slice(0, 2)
  const extraTagCount = task.tags.length - 2
  const assigneeLabel = formatTaskAssigneeLabel(task.assignee, assigneeLabels)

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'relative rounded-lg border p-3 cursor-pointer transition-all select-none',
        'bg-[#080d12]/95 border-amber-500/20',
        'hover:border-amber-400/55',
        isDragging ? 'opacity-40 rotate-1 shadow-2xl' : 'hover:shadow-[0_4px_16px_rgba(0,0,0,0.35)]',
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: priorityColor }}
    >
      {/* Priority dot in top-right */}
      <span
        className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full shrink-0"
        style={{ background: priorityColor }}
        title={`Priority: ${task.priority}`}
      />

      <p className="mb-1 line-clamp-2 pr-4 font-mono text-sm font-medium leading-snug text-amber-50">
        {task.title}
      </p>

      {task.description && (
        <p className="mb-2 line-clamp-2 text-xs text-amber-100/65">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="rounded-sm border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-amber-200">
            {assigneeLabel}
          </span>
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="rounded-sm border border-amber-500/20 bg-amber-500/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-amber-200/80"
            >
              {tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span className="rounded-sm border border-amber-500/20 bg-amber-500/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-amber-200/80">
              +{extraTagCount} more
            </span>
          )}
        </div>

        {task.due_date && (
          <div className="flex items-center gap-1 text-[10px] tabular-nums">
            {overdue && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="text-red-400 font-semibold">Overdue</span>
                <span className="text-[var(--theme-muted)] mx-0.5">·</span>
              </>
            )}
            <span className={overdue ? 'text-red-400 font-semibold' : 'text-[var(--theme-muted)]'}>
              {(() => {
                const [y, m, d] = task.due_date!.split('-').map(Number)
                return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              })()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
