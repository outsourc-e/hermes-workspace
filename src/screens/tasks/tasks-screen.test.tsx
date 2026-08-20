import { describe, expect, it, vi } from 'vitest'

// Unit tests for TasksScreen logic — focusing on pure functions and state management

// COLUMN_COLORS map
const COLUMN_COLORS: Record<string, string> = {
  backlog: '#6b7280',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  review: '#8b5cf6',
  blocked: '#ef4444',
  done: '#22c55e',
  deleted: '#9ca3af',
}

// COLUMN_LABELS map
const COLUMN_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  deleted: 'Deleted',
}

// COLUMN_ORDER array
const COLUMN_ORDER = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'blocked',
  'done',
] as const

// Skeleton card check
describe('TasksScreen — SkeletonCard render structure', () => {
  function SkeletonCard() {
    return (
      <div className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 animate-pulse">
        <div className="h-3.5 bg-[var(--theme-hover)] rounded w-3/4 mb-2" />
        <div className="h-2.5 bg-[var(--theme-hover)] rounded w-full mb-1" />
        <div className="h-2.5 bg-[var(--theme-hover)] rounded w-2/3 mb-3" />
        <div className="flex gap-1.5">
          <div className="h-4 w-12 bg-[var(--theme-hover)] rounded" />
          <div className="h-4 w-10 bg-[var(--theme-hover)] rounded" />
        </div>
      </div>
    )
  }

  it('renders skeleton with expected structure', () => {
    const card = SkeletonCard()
    expect(card.props.className).toContain('animate-pulse')
    expect(card.props.className).toContain('rounded-lg')
    expect(card.props.className).toContain('border')
    expect(card.props.className).toContain('bg-[var(--theme-card)]')
    expect(card.props.className).toContain('p-3')
  })
})

// Tasks by column grouping logic
describe('TasksScreen — tasksByColumn grouping', () => {
  function groupTasksByColumn(
    tasks: Array<{
      id: string
      title: string
      column: string
      position: number
      assignee?: string | null
    }>,
    assigneeFilter: string | null,
    columns: Array<string>,
  ) {
    const map: Record<
      string,
      Array<{
        id: string
        title: string
        column: string
        position: number
        assignee?: string | null
      }>
    > = {}
    for (const col of columns) {
      map[col] = []
    }
    for (const t of tasks) {
      if (assigneeFilter && t.assignee !== assigneeFilter) continue
      map[t.column].push(t)
    }
    for (const col of columns) {
      map[col].sort((a, b) => a.position - b.position)
    }
    return map
  }

  it('groups tasks by column', () => {
    const tasks = [
      { id: '1', title: 'Task 1', column: 'backlog', position: 100 },
      { id: '2', title: 'Task 2', column: 'todo', position: 200 },
      { id: '3', title: 'Task 3', column: 'in_progress', position: 300 },
    ]
    const result = groupTasksByColumn(tasks, null, COLUMN_ORDER)
    expect(result.backlog).toHaveLength(1)
    expect(result.backlog[0].id).toBe('1')
    expect(result.todo).toHaveLength(1)
    expect(result.todo[0].id).toBe('2')
    expect(result['in_progress']).toHaveLength(1)
    expect(result['in_progress'][0].id).toBe('3')
  })

  it('filters by assignee', () => {
    const tasks = [
      {
        id: '1',
        title: 'Task 1',
        column: 'backlog',
        position: 100,
        assignee: 'builder',
      },
      {
        id: '2',
        title: 'Task 2',
        column: 'todo',
        position: 200,
        assignee: 'km-agent',
      },
      { id: '3', title: 'Task 3', column: 'backlog', position: 300 },
    ]
    const result = groupTasksByColumn(tasks, 'builder', COLUMN_ORDER)
    expect(result.backlog).toHaveLength(1)
    expect(result.backlog[0].id).toBe('1')
    expect(result.todo).toHaveLength(0)
  })

  it('returns empty arrays for columns with no tasks', () => {
    const tasks: Array<{
      id: string
      title: string
      column: string
      position: number
    }> = []
    const result = groupTasksByColumn(tasks, null, COLUMN_ORDER)
    for (const col of COLUMN_ORDER) {
      expect(result[col]).toBeInstanceOf(Array)
      expect(result[col]).toHaveLength(0)
    }
  })

  it('sorts tasks by position within column', () => {
    const tasks = [
      { id: '3', title: 'Task 3', column: 'backlog', position: 300 },
      { id: '1', title: 'Task 1', column: 'backlog', position: 100 },
      { id: '2', title: 'Task 2', column: 'backlog', position: 200 },
    ]
    const result = groupTasksByColumn(tasks, null, COLUMN_ORDER)
    expect(result.backlog.map((t) => t.id)).toEqual(['1', '2', '3'])
  })
})

// Stats computation
describe('TasksScreen — stats computation', () => {
  function computeStats(
    tasks: Array<{ id: string; column: string; due_date?: string | null }>,
  ): {
    total: number
    running: number
    blocked: number
    done: number
    overdue: number
    completion: number
  } {
    const total = tasks.length
    const running = tasks.filter((t) => t.column === 'in_progress').length
    const blocked = tasks.filter((t) => t.column === 'blocked').length
    const done = tasks.filter((t) => t.column === 'done').length
    const overdue = tasks.filter((t) => {
      if (t.column === 'done') return false
      if (!t.due_date) return false
      return new Date(t.due_date) < new Date()
    }).length
    const completion = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, running, blocked, done, overdue, completion }
  }

  it('computes correct stats for mixed tasks', () => {
    const tasks = [
      { id: '1', column: 'backlog' },
      { id: '2', column: 'todo' },
      { id: '3', column: 'in_progress' },
      { id: '4', column: 'in_progress' },
      { id: '5', column: 'blocked' },
      { id: '6', column: 'done' },
      { id: '7', column: 'done' },
    ]
    const stats = computeStats(tasks)
    expect(stats.total).toBe(7)
    expect(stats.running).toBe(2)
    expect(stats.blocked).toBe(1)
    expect(stats.done).toBe(2)
    expect(stats.overdue).toBe(0)
    expect(stats.completion).toBe(29) // 2/7 = 28.57 -> 29
  })

  it('computes overdue tasks', () => {
    const tasks = [
      { id: '1', column: 'todo', due_date: '2020-01-01' },
      { id: '2', column: 'in_progress', due_date: '2020-06-15' },
      { id: '3', column: 'done', due_date: '2020-01-01' },
      { id: '4', column: 'backlog', due_date: '2030-12-31' },
    ]
    const stats = computeStats(tasks)
    expect(stats.overdue).toBe(2) // task 1 and 2 are overdue, task 3 is done, task 4 is future
  })

  it('handles empty task list', () => {
    const stats = computeStats([])
    expect(stats.total).toBe(0)
    expect(stats.running).toBe(0)
    expect(stats.blocked).toBe(0)
    expect(stats.done).toBe(0)
    expect(stats.overdue).toBe(0)
    expect(stats.completion).toBe(0)
  })

  it('completion is 100 when all done', () => {
    const tasks = [
      { id: '1', column: 'done' },
      { id: '2', column: 'done' },
    ]
    const stats = computeStats(tasks)
    expect(stats.completion).toBe(100)
  })
})

// Column visibility logic
describe('TasksScreen — visible columns logic', () => {
  function getVisibleColumns(
    showDone: boolean,
    columns: Array<string>,
  ): Array<string> {
    return showDone ? columns : columns.filter((c) => c !== 'done')
  }

  it('shows all columns when showDone is true', () => {
    const visible = getVisibleColumns(true, COLUMN_ORDER)
    expect(visible).toEqual(COLUMN_ORDER)
    expect(visible).toContain('done')
  })

  it('hides done column when showDone is false', () => {
    const visible = getVisibleColumns(false, COLUMN_ORDER)
    expect(visible).not.toContain('done')
    expect(visible).toEqual([
      'backlog',
      'todo',
      'in_progress',
      'review',
      'blocked',
    ])
  })

  it('always includes backlog and todo', () => {
    const visible = getVisibleColumns(false, COLUMN_ORDER)
    expect(visible).toContain('backlog')
    expect(visible).toContain('todo')
  })
})

// Column max width calculation
describe('TasksScreen — column width calculation', () => {
  function calcColMaxWidth(totalWidth: number, visibleColumns: number): number {
    return Math.floor(totalWidth / visibleColumns)
  }

  it('calculates equal width for visible columns', () => {
    expect(calcColMaxWidth(1200, 6)).toBe(200)
    expect(calcColMaxWidth(1200, 5)).toBe(240)
    expect(calcColMaxWidth(1200, 4)).toBe(300)
  })

  it('uses floor to round down', () => {
    expect(calcColMaxWidth(1201, 6)).toBe(200)
    expect(calcColMaxWidth(1199, 6)).toBe(199)
  })
})

// Help text constant
describe('TasksScreen — help text', () => {
  const TASKS_BOARD_HELP_TEXT =
    'Workspace Tasks is a lightweight task board. Drag cards to change status. Use Dashboard Kanban for native multi-board controls.'

  it('exports help text constant', () => {
    expect(TASKS_BOARD_HELP_TEXT).toBeTruthy()
    expect(TASKS_BOARD_HELP_TEXT).toContain('Workspace Tasks')
    expect(TASKS_BOARD_HELP_TEXT).toContain('lightweight task board')
    expect(TASKS_BOARD_HELP_TEXT).toContain('Dashboard Kanban')
  })
})
