import { useEffect, useState } from 'react'
import type { ClaudeTask, CreateTaskInput, TaskAssignee, TaskColumn, TaskPriority } from '@/lib/tasks-api'
import { Button } from '@/components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { COLUMN_LABELS, COLUMN_ORDER } from '@/lib/tasks-api'
import { cn } from '@/lib/utils'

export type DecisionQuickAction = 'approve' | 'deny' | 'hold' | 'other'

const DECISION_ACTION_LABELS: Record<DecisionQuickAction, string> = {
  approve: 'Approve',
  deny: 'Deny',
  hold: 'Hold',
  other: 'Other',
}

const DECISION_ACTION_STYLES: Record<DecisionQuickAction, string> = {
  approve: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
  deny: 'border-red-400/50 bg-red-500/10 text-red-300 hover:bg-red-500/20',
  hold: 'border-amber-400/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
  other: 'border-sky-400/50 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20',
}

export function buildDecisionStageNote(
  action: DecisionQuickAction,
  detail = '',
  now: Date = new Date(),
): string {
  const label = DECISION_ACTION_LABELS[action]
  const trimmedDetail = detail.trim()
  const safeContext = trimmedDetail ? ` Context: ${trimmedDetail}` : ''

  return [
    `[Decision staged ${now.toLocaleString()}] ${label}.`,
    'Safe follow-through only: this records Petie/Friday intent for Kanban review and does not send customer-facing messages, approve tool calls, deploy, delete, bill, or otherwise mutate production by itself.',
    safeContext,
  ].join(' ').trim()
}

export function appendDecisionStageNote(
  description: string,
  action: DecisionQuickAction,
  detail = '',
  now: Date = new Date(),
): string {
  const note = buildDecisionStageNote(action, detail, now)
  return description.trim() ? `${description.trim()}\n\n${note}` : note
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: ClaudeTask | null
  defaultColumn?: TaskColumn
  assignees: Array<TaskAssignee>
  onSubmit: (input: CreateTaskInput) => Promise<void>
  isSubmitting: boolean
}

export function TaskDialog({ open, onOpenChange, task, defaultColumn, assignees, onSubmit, isSubmitting }: Props) {
  const isEdit = Boolean(task)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [column, setColumn] = useState<TaskColumn>(defaultColumn ?? 'backlog')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignee, setAssignee] = useState<string>('')
  const [tags, setTags] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [decisionMode, setDecisionMode] = useState<DecisionQuickAction | null>(null)
  const [decisionDetail, setDecisionDetail] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description)
      setColumn(task.column)
      setPriority(task.priority)
      setAssignee(task.assignee ?? '')
      setTags(task.tags.join(', '))
      setDueDate(task.due_date ?? '')
    } else {
      setTitle('')
      setDescription('')
      setColumn(defaultColumn ?? 'backlog')
      setPriority('medium')
      setAssignee('')
      setTags('')
      setDueDate('')
    }
    setDecisionMode(null)
    setDecisionDetail('')
  }, [task, open, defaultColumn])

  function stageDecision(action: DecisionQuickAction) {
    if (action === 'other' && decisionMode !== 'other') {
      setDecisionMode('other')
      return
    }

    setDescription((current) => appendDecisionStageNote(current, action, action === 'other' ? decisionDetail : ''))

    const nextTags = new Set(tags.split(',').map(t => t.trim()).filter(Boolean))
    nextTags.add('decision-staged')
    nextTags.add(`decision-${action}`)
    setTags(Array.from(nextTags).join(', '))
    setDecisionMode(action)
    setDecisionDetail('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      column,
      priority,
      assignee: assignee || null,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      due_date: dueDate || null,
    })
  }

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm',
    'bg-[var(--theme-input)] border-[var(--theme-border)] text-[var(--theme-text)]',
    'focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)]',
    'placeholder:text-[var(--theme-muted)]',
  )

  const labelClass = 'block text-xs font-medium text-[var(--theme-muted)] mb-1'

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,95vw)] border-[var(--theme-border)] bg-[var(--theme-bg)] overflow-hidden">
        {/* Accent top border */}
        <div className="h-[3px] w-full" style={{ background: 'var(--theme-accent)' }} />

        <div className="p-5">
          <DialogTitle className="text-base font-semibold text-[var(--theme-text)] mb-1">
            {isEdit ? 'Edit Task' : 'New Task'}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--theme-muted)] mb-4">
            {isEdit ? 'Update the task details below.' : 'Fill in the details for your new task.'}
          </DialogDescription>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className={labelClass}>Title *</label>
              <input
                className={inputClass}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                required
                autoFocus
              />
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                className={cn(inputClass, 'resize-none')}
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional details..."
              />
            </div>

            {isEdit ? (
              <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[var(--theme-text)]">Decision quick actions</p>
                    <p className="mt-0.5 text-[10px] leading-4 text-[var(--theme-muted)]">
                      Stages the choice as a Kanban note only — no customer messages, tool approvals, deploys, deletes, billing, or production mutations.
                    </p>
                  </div>
                  {decisionMode ? (
                    <span className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-muted)]">
                      staged: {DECISION_ACTION_LABELS[decisionMode]}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(DECISION_ACTION_LABELS) as Array<DecisionQuickAction>).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => stageDecision(action)}
                      className={cn(
                        'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                        DECISION_ACTION_STYLES[action],
                      )}
                    >
                      {DECISION_ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>

                {decisionMode === 'other' ? (
                  <div className="mt-2">
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                      Other decision context
                    </label>
                    <div className="flex gap-2">
                      <input
                        className={cn(inputClass, 'py-1.5 text-xs')}
                        value={decisionDetail}
                        onChange={e => setDecisionDetail(e.target.value)}
                        placeholder="Explain what Friday/Kanban should do next..."
                      />
                      <button
                        type="button"
                        disabled={!decisionDetail.trim()}
                        onClick={() => stageDecision('other')}
                        className="shrink-0 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Stage
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Column</label>
                <select
                  className={inputClass}
                  style={{ colorScheme: 'dark' }}
                  value={column}
                  onChange={e => setColumn(e.target.value as TaskColumn)}
                >
                  {COLUMN_ORDER.map(col => (
                    <option key={col} value={col}>{COLUMN_LABELS[col]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <select
                  className={inputClass}
                  style={{ colorScheme: 'dark' }}
                  value={priority}
                  onChange={e => setPriority(e.target.value as TaskPriority)}
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Assignee</label>
                <select
                  className={inputClass}
                  style={{ colorScheme: 'dark' }}
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {assignees.map(({ id, label }) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[10px] text-[var(--theme-muted)]">
                  Assignee is separate from status. Dragging a card changes its column only.
                </p>
              </div>
              <div>
                <label className={labelClass}>Due Date</label>
                <input
                  type="date"
                  className={inputClass}
                  style={{ colorScheme: 'dark' }}
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Tags (comma-separated)</label>
              <input
                className={inputClass}
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="frontend, bug, research"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[10px] text-[var(--theme-muted)]">Press Esc to cancel</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting || !title.trim()}
                  style={{ background: 'var(--theme-accent)', color: 'white' }}
                >
                  {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Task'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
