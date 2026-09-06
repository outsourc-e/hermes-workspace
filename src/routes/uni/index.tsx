/**
 * UniDashboard page — shows subjects, deadlines, tasks from Obsidian vault.
 * Reads context.md for content and vault/*.md for details.
 */
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { BookOpenIcon } from '@hugeicons/core-free-icons'
import { useEffect, useState } from 'react'
import { usePageTitle } from '@/hooks/use-page-title'

type Task = {
  text: string
  done: boolean
}

type Subject = {
  name: string
  code: string
  deadline: string | null
  deadlineRaw: string | null
  description: string
  tasks: Array<Task>
  notes: Array<string>
}

function parseContext(content: string): Array<Subject> {
  const subjects: Array<Subject> = []
  const lines = content.split('\n')
  let current: Partial<Subject> | null = null
  let section = ''
  let notes: Array<string> = []
  let tasks: Array<Task> = []

  for (const line of lines) {
    const hd2 = line.match(/^## (.+)/)
    const hd3 = line.match(/^### (.+)/)
    const task = line.match(/^- \[ \] (.+)/)
    const done = line.match(/^- \[x\] (.+)/)
    const deadline = line.match(
      /@deadline\((\d{4}-\d{2}-\d{2})\)|DEADLINE:\s*(\d{1,2}\/\d{2}\/\d{4})/i,
    )

    if (hd2) {
      if (current?.name && current.code) {
        subjects.push({ ...(current as Subject), notes, tasks })
      }
      const name = hd2[1].trim()
      const codeMatch = name.match(/\(([^)]+)\)/)
      current = {
        name: name.replace(/\([^)]*\)/, '').trim(),
        code: codeMatch ? codeMatch[1] : '',
        deadline: null,
        deadlineRaw: null,
        description: '',
        tasks: [],
        notes: [],
      }
      notes = []
      tasks = []
      section = 'notes'
    } else if (hd3) {
      section = hd3[1].toLowerCase().includes('task') ? 'tasks' : 'notes'
    } else if (task) {
      tasks.push({ text: task[1].trim(), done: false })
    } else if (done) {
      tasks.push({ text: done[1].trim(), done: true })
    } else if (current && line.trim()) {
      if (deadline) {
        const d = deadline[1] || deadline[2]
        current.deadlineRaw = d
        // Normalise to YYYY-MM-DD
        if (d.includes('/')) {
          const [day, month, year] = d.split('/')
          current.deadline = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        } else {
          current.deadline = d
        }
      } else if (section === 'notes' && !line.startsWith('-')) {
        notes.push(line.replace(/^- /, '').trim())
      }
    }
  }

  if (current?.name && current.code) {
    subjects.push({ ...(current as Subject), notes, tasks })
  }
  return subjects
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadline = new Date(dateStr)
  return Math.round((deadline.getTime() - today.getTime()) / 86400000)
}

function deadlineColor(days: number | null): string {
  if (days === null) return 'text-[var(--theme-muted)]'
  if (days < 0) return 'text-red-400'
  if (days <= 7) return 'text-amber-400'
  return 'text-emerald-400'
}

async function loadContext(): Promise<string> {
  const r = await fetch('/api/uni/context')
  if (!r.ok) return ''
  const data = await r.json()
  return data.content ?? ''
}

export const Route = createFileRoute('/uni/')({
  component: UniDashboardRoute,
})

function UniDashboardRoute() {
  usePageTitle('University')
  const { data: context = '', isLoading } = useQuery({
    queryKey: ['uni-context'],
    queryFn: loadContext,
    refetchInterval: 3600000, // refresh hourly
  })

  const subjects = parseContext(context)

  return (
    <div className="flex min-h-0 flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HugeiconsIcon icon={BookOpenIcon} size={28} strokeWidth={1.5} />
        <div>
          <h1 className="text-xl font-semibold text-[var(--theme-text)]">
            University
          </h1>
          <p className="text-sm text-[var(--theme-muted)]">
            Obsidian brain synced from home PC
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-[var(--theme-muted)]">Loading…</div>
      ) : subjects.length === 0 ? (
        <div className="text-sm text-[var(--theme-muted)]">
          No subjects found. Vault sync runs daily at 6am.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {subjects.map((sub) => {
            const days = daysUntil(sub.deadline)
            return (
              <div
                key={sub.code}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-4"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--theme-text)]">
                      {sub.name}
                    </h2>
                    <span className="text-xs text-[var(--theme-muted)]">
                      {sub.code}
                    </span>
                  </div>
                  {sub.deadline && (
                    <div className="text-right">
                      <div
                        className={`text-sm font-bold ${deadlineColor(days)}`}
                      >
                        {days !== null
                          ? days < 0
                            ? `${Math.abs(days)}d overdue`
                            : days === 0
                              ? 'Today'
                              : `${days}d left`
                          : sub.deadlineRaw}
                      </div>
                      {sub.deadlineRaw && (
                        <div className="text-[10px] text-[var(--theme-muted)]">
                          {sub.deadlineRaw}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Tasks */}
                {sub.tasks.length > 0 && (
                  <div className="mb-3 flex flex-col gap-1">
                    {sub.tasks.map((t, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <div
                          className={`h-3.5 w-3.5 rounded border ${t.done ? 'bg-emerald-500 border-emerald-500' : 'border-[var(--theme-border)]'}`}
                        >
                          {t.done && (
                            <svg
                              viewBox="0 0 12 12"
                              className="h-full w-full text-white"
                            >
                              <polyline
                                points="2,6 5,9 10,3"
                                stroke="currentColor"
                                strokeWidth="2"
                                fill="none"
                              />
                            </svg>
                          )}
                        </div>
                        <span
                          className={
                            t.done
                              ? 'text-[var(--theme-muted)] line-through'
                              : 'text-[var(--theme-text)]'
                          }
                        >
                          {t.text}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes */}
                {sub.notes.length > 0 && (
                  <div className="flex flex-col gap-1 border-t border-[var(--theme-border)] pt-2">
                    {sub.notes.map((n, i) => (
                      <div
                        key={i}
                        className="text-xs text-[var(--theme-muted)]"
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/uni/chat"
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          → Chat with UniChat
        </a>
        <a
          href="/uni/calendar"
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          → Calendar
        </a>
        <a
          href="/uni/moodle"
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          → Moodle
        </a>
        <a
          href="/uni/obsidian"
          className="rounded border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
        >
          → Open Vault
        </a>
      </div>
    </div>
  )
}
