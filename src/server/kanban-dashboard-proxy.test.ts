import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CLAUDE_DASHBOARD_URL,
  fetchDashboardToken,
  getCapabilities,
} from './gateway-capabilities'
import {
  
  createDashboardKanbanTask,
  deleteDashboardKanbanTask,
  fetchDashboardKanbanBoard,
  fetchDashboardKanbanTask,
  listDashboardKanbanBoards,
  updateDashboardKanbanTask
} from './kanban-dashboard-proxy'
import type {DashboardKanbanTask} from './kanban-dashboard-proxy';

// Mocks for gateway capabilities
vi.mock('./gateway-capabilities', () => ({
  CLAUDE_DASHBOARD_URL: 'http://localhost:9119',
  getCapabilities: vi.fn(() => ({
    kanban: true,
    dashboard: { url: 'http://localhost:9119' },
  })),
  fetchDashboardToken: vi.fn(() => Promise.resolve('test-token')),
}))

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchDashboardKanbanBoard', () => {
  it('fetches board from dashboard plugin', async () => {
    const mockBoard: {
      columns: Array<{ name: string; tasks: Array<DashboardKanbanTask> }>
    } = {
      columns: [
        {
          name: 'todo',
          tasks: [{ id: 't1', title: 'Task 1', status: 'todo' }],
        },
        {
          name: 'done',
          tasks: [{ id: 't2', title: 'Task 2', status: 'done' }],
        },
      ],
    }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBoard),
    } as Response)

    const board = await fetchDashboardKanbanBoard()
    expect(board).toEqual(mockBoard)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:9119/api/plugins/kanban/board',
      expect.any(Object),
    )
  })

  it('passes board query param when specified', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ columns: [] }),
    } as Response)

    await fetchDashboardKanbanBoard('my-board')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('board=my-board'),
      expect.any(Object),
    )
  })

  it('throws on non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    } as Response)

    await expect(fetchDashboardKanbanBoard()).rejects.toThrow(
      'Dashboard kanban proxy: GET /api/plugins/kanban/board → 500',
    )
  })

  it('uses default board when not specified', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ columns: [] }),
    } as Response)

    await fetchDashboardKanbanBoard()
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:9119/api/plugins/kanban/board',
      expect.any(Object),
    )
  })
})

describe('fetchDashboardKanbanTask', () => {
  it('fetches a task by id', async () => {
    const mockTask: DashboardKanbanTask = {
      id: 't1',
      title: 'Task 1',
      status: 'todo',
    }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ task: mockTask }),
    } as Response)

    const task = await fetchDashboardKanbanTask('t1')
    expect(task).toEqual(mockTask)
  })

  it('returns null on 404', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    } as Response)

    const task = await fetchDashboardKanbanTask('non-existent')
    expect(task).toBe(null)
  })

  it('throws on other errors', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    } as Response)

    await expect(fetchDashboardKanbanTask('t1')).rejects.toThrow(
      'Dashboard kanban proxy: GET /api/plugins/kanban/tasks/t1 → 500',
    )
  })

  it('passes board param when specified', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          task: { id: 't1', title: 'Task 1', status: 'todo' },
        }),
    } as Response)

    await fetchDashboardKanbanTask('t1', 'my-board')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('board=my-board'),
      expect.any(Object),
    )
  })
})

describe('createDashboardKanbanTask', () => {
  it('creates a task via POST', async () => {
    const mockTask: DashboardKanbanTask = {
      id: 'new-t1',
      title: 'New Task',
      status: 'todo',
    }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ task: mockTask }),
    } as Response)

    const task = await createDashboardKanbanTask({ title: 'New Task' })
    expect(task).toEqual(mockTask)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:9119/api/plugins/kanban/tasks',
      expect.any(Object),
    )
  })

  it('includes body in payload', async () => {
    const mockTask: DashboardKanbanTask = {
      id: 'new-t2',
      title: 'Task with body',
      status: 'todo',
    }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ task: mockTask }),
    } as Response)

    await createDashboardKanbanTask({
      title: 'Task with body',
      body: 'Description',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ title: 'Task with body', body: 'Description' }),
      }),
    )
  })

  it('passes board param', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          task: { id: 't1', title: 'Task 1', status: 'todo' },
        }),
    } as Response)

    await createDashboardKanbanTask({ title: 'Task 1' }, 'my-board')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('board=my-board'),
      expect.any(Object),
    )
  })

  it('throws on failure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request'),
    } as Response)

    await expect(createDashboardKanbanTask({ title: '' })).rejects.toThrow(
      'Dashboard kanban proxy: POST /api/plugins/kanban/tasks → 400',
    )
  })
})

describe('updateDashboardKanbanTask', () => {
  it('patches a task via PATCH', async () => {
    const mockTask: DashboardKanbanTask = {
      id: 't1',
      title: 'Updated Task',
      status: 'done',
    }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ task: mockTask }),
    } as Response)

    const task = await updateDashboardKanbanTask('t1', {
      title: 'Updated Task',
      status: 'done',
    })
    expect(task).toEqual(mockTask)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:9119/api/plugins/kanban/tasks/t1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated Task', status: 'done' }),
      }),
    )
  })

  it('passes board param', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          task: { id: 't1', title: 'Task 1', status: 'todo' },
        }),
    } as Response)

    await updateDashboardKanbanTask('t1', { title: 'Task 1' }, 'my-board')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('board=my-board'),
      expect.any(Object),
    )
  })

  it('throws on 404', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    } as Response)

    await expect(
      updateDashboardKanbanTask('non-existent', { title: 'X' }),
    ).rejects.toThrow(
      'Dashboard kanban proxy: PATCH /api/plugins/kanban/tasks/non-existent → 404',
    )
  })
})

describe('deleteDashboardKanbanTask', () => {
  it('deletes a task via DELETE', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    const result = await deleteDashboardKanbanTask('t1')
    expect(result).toBe(true)
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:9119/api/plugins/kanban/tasks/t1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('returns false on 404', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    } as Response)

    const result = await deleteDashboardKanbanTask('non-existent')
    expect(result).toBe(false)
  })

  it('throws on other errors', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    } as Response)

    await expect(deleteDashboardKanbanTask('t1')).rejects.toThrow(
      'Dashboard kanban proxy: DELETE /api/plugins/kanban/tasks/t1 → 500',
    )
  })

  it('passes board param', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response)

    await deleteDashboardKanbanTask('t1', 'my-board')
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('board=my-board'),
      expect.any(Object),
    )
  })
})

describe('listDashboardKanbanBoards', () => {
  it('fetches boards list', async () => {
    const mockBoards = {
      boards: [{ slug: 'default', display_name: 'Default' }],
      current: 'default',
    }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockBoards),
    } as Response)

    const result = await listDashboardKanbanBoards()
    expect(result).toEqual(mockBoards)
  })

  it('throws on failure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Error'),
    } as Response)

    await expect(listDashboardKanbanBoards()).rejects.toThrow(
      'Dashboard kanban proxy: GET /api/plugins/kanban/boards → 500',
    )
  })
})
