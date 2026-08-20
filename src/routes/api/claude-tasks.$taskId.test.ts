import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  deleteClaudeTask,
  getClaudeTask,
  moveClaudeTask,
  updateClaudeTask,
} from '../../server/claude-tasks-backend'
import { Route } from './claude-tasks.$taskId'

// Mocks for dependencies
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/claude-tasks-backend', () => ({
  getClaudeTask: vi.fn(),
  updateClaudeTask: vi.fn(),
  deleteClaudeTask: vi.fn(),
  moveClaudeTask: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Helper to access the handlers via type assertion
const handlers = Route.options?.server?.handlers as {
  GET: (ctx: {
    request: Request
    params: { taskId: string }
  }) => Promise<Response>
  PATCH: (ctx: {
    request: Request
    params: { taskId: string }
  }) => Promise<Response>
  DELETE: (ctx: {
    request: Request
    params: { taskId: string }
  }) => Promise<Response>
  POST: (ctx: {
    request: Request
    params: { taskId: string }
  }) => Promise<Response>
}

const getHandler = handlers.GET
const patchHandler = handlers.PATCH
const deleteHandler = handlers.DELETE
const postHandler = handlers.POST

function makeRequest(
  method: string,
  body?: unknown,
  url = 'http://localhost/api/claude-tasks/task-1',
): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('claude-tasks.$taskId — type guards', () => {
  it('TaskColumn accepts valid values', () => {
    const column:
      | 'backlog'
      | 'todo'
      | 'in_progress'
      | 'review'
      | 'blocked'
      | 'done' = 'todo'
    expect(column).toBe('todo')
  })

  it('TaskPriority accepts valid values', () => {
    const priority: 'high' | 'medium' | 'low' = 'high'
    expect(priority).toBe('high')
  })
})

describe('claude-tasks.$taskId — GET handler', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = makeRequest('GET')
    const res = await getHandler({ request: req, params: { taskId: 'task-1' } })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Unauthorized')
  })

  it('returns task when found and authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(getClaudeTask).mockResolvedValue({
      id: 'task-1',
      title: 'Test task',
      description: 'Test description',
      column: 'todo' as any,
      priority: 'medium' as any,
      assignee: 'builder',
      tags: [],
      due_date: null,
      position: 100,
      created_by: 'user',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    } as any)
    const req = makeRequest('GET')
    const res = await getHandler({ request: req, params: { taskId: 'task-1' } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { task: any }
    expect(body.task.id).toBe('task-1')
    expect(body.task.title).toBe('Test task')
  })

  it('returns 404 when task not found', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(getClaudeTask).mockResolvedValue(null as any)
    const req = makeRequest('GET')
    const res = await getHandler({
      request: req,
      params: { taskId: 'non-existent' },
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Task not found')
  })
})

describe('claude-tasks.$taskId — PATCH handler', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = makeRequest('PATCH', { title: 'Updated' })
    const res = await patchHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when request body is invalid JSON', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request('http://localhost/api/claude-tasks/task-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json',
    })
    const res = await patchHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid request body')
  })

  it('updates task title when authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(updateClaudeTask).mockResolvedValue({
      id: 'task-1',
      title: 'Updated title',
      description: 'Old description',
      column: 'todo' as any,
      priority: 'medium' as any,
      assignee: null,
      tags: [],
      due_date: null,
      position: 100,
      created_by: 'user',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    } as any)
    const req = makeRequest('PATCH', { title: 'Updated title' })
    const res = await patchHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(200)
    expect(updateClaudeTask).toHaveBeenCalledWith('task-1', {
      title: 'Updated title',
      description: undefined,
      column: undefined,
      priority: undefined,
      assignee: undefined,
      tags: undefined,
      due_date: undefined,
    })
  })

  it('returns 404 when task not found after update', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(updateClaudeTask).mockResolvedValue(null as any)
    const req = makeRequest('PATCH', { title: 'Updated' })
    const res = await patchHandler({
      request: req,
      params: { taskId: 'non-existent' },
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Task not found')
  })

  it('updates multiple fields at once', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(updateClaudeTask).mockResolvedValue({
      id: 'task-1',
      title: 'Updated title',
      description: 'Updated description',
      column: 'done' as any,
      priority: 'high' as any,
      assignee: 'reviewer',
      tags: ['tag1', 'tag2'],
      due_date: '2024-12-31',
      position: 100,
      created_by: 'user',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    } as any)
    const req = makeRequest('PATCH', {
      title: 'Updated title',
      description: 'Updated description',
      column: 'done',
      priority: 'high' as any,
      assignee: 'reviewer',
      tags: ['tag1', 'tag2'],
      due_date: '2024-12-31',
    })
    const res = await patchHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(200)
    expect(updateClaudeTask).toHaveBeenCalledWith('task-1', {
      title: 'Updated title',
      description: 'Updated description',
      column: 'done',
      priority: 'high',
      assignee: 'reviewer',
      tags: ['tag1', 'tag2'],
      due_date: '2024-12-31',
    })
  })
})

describe('claude-tasks.$taskId — DELETE handler', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = makeRequest('DELETE')
    const res = await deleteHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(401)
  })

  it('deletes task when found', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(deleteClaudeTask).mockResolvedValue(true as any)
    const req = makeRequest('DELETE')
    const res = await deleteHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; deleted: boolean }
    expect(body.ok).toBe(true)
    expect(body.deleted).toBe(true)
    expect(deleteClaudeTask).toHaveBeenCalledWith('task-1')
  })

  it('returns 404 when task not found', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(deleteClaudeTask).mockResolvedValue(false as any)
    const req = makeRequest('DELETE')
    const res = await deleteHandler({
      request: req,
      params: { taskId: 'non-existent' },
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Task not found')
  })
})

describe('claude-tasks.$taskId — POST handler', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = makeRequest('POST', { column: 'done' })
    const res = await postHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 for unsupported action', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request(
      'http://localhost/api/claude-tasks/task-1?action=delete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: 'done' }),
      },
    )
    const res = await postHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Unsupported action: delete')
  })

  it('returns 400 when column is missing', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = makeRequest('POST', {})
    const res = await postHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('column is required')
  })

  it('returns 400 when column is invalid', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = makeRequest('POST', { column: 'invalid' })
    const res = await postHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('column is required')
  })

  it('returns 400 when request body is invalid JSON', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request(
      'http://localhost/api/claude-tasks/task-1?action=move',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json',
      },
    )
    const res = await postHandler({
      request: req,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Invalid request body')
  })

  it('moves task to new column when valid', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(moveClaudeTask).mockResolvedValue({
      id: 'task-1',
      title: 'Test task',
      description: 'Test description',
      column: 'done' as any,
      priority: 'medium' as any,
      assignee: null,
      tags: [],
      due_date: null,
      position: 100,
      created_by: 'user',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-02T00:00:00.000Z',
    } as any)
    const req = makeRequest('POST', { column: 'done' })
    // Add query param
    const url = new URL(req.url)
    url.searchParams.set('action', 'move')
    const reqWithQuery = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: 'done' }),
    })
    const res = await postHandler({
      request: reqWithQuery,
      params: { taskId: 'task-1' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { task: any }
    expect(body.task.column).toBe('done')
    expect(moveClaudeTask).toHaveBeenCalledWith('task-1', 'done')
  })

  it('returns 404 when task not found on move', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    vi.mocked(moveClaudeTask).mockResolvedValue(null as any)
    const url = new URL(
      'http://localhost/api/claude-tasks/non-existent?action=move',
    )
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: 'done' }),
    })
    const res = await postHandler({
      request: req,
      params: { taskId: 'non-existent' },
    })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('Task not found')
  })
})
