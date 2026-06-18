import { describe, expect, it } from 'vitest'

import { appendDecisionStageNote, buildDecisionStageNote } from './task-dialog'
import { formatTaskAssigneeLabel } from './task-card'
import { TASKS_BOARD_HELP_TEXT } from './tasks-screen'

describe('tasks UX copy', () => {
  it('exposes helper copy that explains drag and assignment behavior', () => {
    expect(TASKS_BOARD_HELP_TEXT).toBe(
      'Workspace Tasks is a lightweight task board. Drag cards to change status. Use Dashboard Kanban for native multi-board controls.',
    )
  })

  it('formats assignee labels explicitly for assigned and unassigned tasks', () => {
    expect(formatTaskAssigneeLabel('jarvis', { jarvis: 'Jarvis' })).toBe(
      'Assignee: Jarvis',
    )
    expect(formatTaskAssigneeLabel(null, {})).toBe('Assignee: Unassigned')
  })

  it('builds safe staged decision notes without performing the decision', () => {
    const note = buildDecisionStageNote(
      'approve',
      '',
      new Date('2026-06-18T10:30:00'),
    )

    expect(note).toContain('Approve')
    expect(note).toContain('Safe follow-through only')
    expect(note).toContain('does not send customer-facing messages')
    expect(note).toContain('approve tool calls')
    expect(note).toContain('mutate production')
  })

  it('appends Other decision context to the existing task description', () => {
    const description = appendDecisionStageNote(
      'Current customer-review item.',
      'other',
      'Ask Friday to draft options before any reply.',
      new Date('2026-06-18T10:30:00'),
    )

    expect(description).toContain('Current customer-review item.')
    expect(description).toContain('Other')
    expect(description).toContain('Context: Ask Friday to draft options before any reply.')
    expect(description.split('\n\n')).toHaveLength(2)
  })
})
