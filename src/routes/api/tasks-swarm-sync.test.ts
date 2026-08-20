import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Re-import after mocking
import { isAuthenticated } from '../../server/auth-middleware'
import { listTasks, updateTask } from '../../server/tasks-store'
import { readStore } from '../../server/swarm-missions'
import { Route } from './tasks-swarm-sync'

// Module-level mocks for dependencies
vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/tasks-store', () => ({
  listTasks: vi.fn(() => []),
  updateTask: vi.fn(() => Promise.resolve()),
}))

vi.mock('../../server/swarm-missions', () => ({
  readStore: vi.fn(() => ({ missions: [] })),
}))

vi.mock('../../lib/tasks-api', () => ({
  SWARM_WORKER_BY_ASSIGNEE: {},
}))

type HandlerContext = { request: Request }

type GetHandler = (ctx: HandlerContext) => Promise<Response>
type PostHandler = (ctx: HandlerContext) => Promise<Response>

const getHandler = Route.options.server.handlers.GET as unknown as GetHandler
const postHandler = Route.options.server.handlers.POST as unknown as PostHandler

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/tasks-swarm-sync', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

type MockTask = {
  id: string
  title: string
  column: string
  session_id: string | null
  assignee: string | null
}

function mockTask(overrides: Partial<MockTask> = {}): MockTask {
  return {
    id: 'task-1',
    title: 'Test task',
    column: 'in_progress',
    session_id: null,
    assignee: null,
    ...overrides,
  }
}

type MockMission = {
  id: string
  state: string
  assignments: Array<{ workerId: string }>
}

function mockMission(overrides: Partial<MockMission> = {}): MockMission {
  return {
    id: 'mission-1',
    state: 'running',
    assignments: [{ workerId: 'builder' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tasks-swarm-sync', () => {
  describe('GET handler', () => {
    it('returns 401 when not authenticated', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(false)
      const req = makeRequest('GET')
      const res = await getHandler({ request: req })
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Unauthorized')
    })

    it('returns synced tasks with mission states when authenticated', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          title: 'Task 1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
        mockTask({
          id: 't2',
          title: 'Task 2',
          session_id: 'm2',
          assignee: 'km-agent',
          column: 'todo',
        }),
        mockTask({
          id: 't3',
          title: 'Task 3',
          session_id: null,
          assignee: null,
          column: 'backlog',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({
          id: 'm1',
          state: 'running',
          assignments: [{ workerId: 'builder' }],
        }),
        mockMission({
          id: 'm2',
          state: 'complete',
          assignments: [{ workerId: 'km-agent' }],
        }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)

      const req = makeRequest('GET')
      const res = await getHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        synced: number
        byState: Record<string, number>
        tasks: Array<{
          taskId: string
          missionState: string
          missionAssignee: string | null
        }>
      }
      expect(body.synced).toBe(2)
      expect(body.byState).toEqual({
        active: 1,
        done: 1,
        cancelled: 0,
        unknown: 0,
      })
      expect(body.tasks).toHaveLength(2)
      expect(body.tasks[0].taskId).toBe('t1')
      expect(body.tasks[0].missionState).toBe('active')
      expect(body.tasks[0].missionAssignee).toBe('builder')
      expect(body.tasks[1].taskId).toBe('t2')
      expect(body.tasks[1].missionState).toBe('done')
      expect(body.tasks[1].missionAssignee).toBe('km-agent')
    })

    it('returns empty synced list when no tasks have session_id', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          title: 'Task 1',
          session_id: null,
          assignee: null,
          column: 'backlog',
        }),
        mockTask({
          id: 't2',
          title: 'Task 2',
          session_id: null,
          assignee: null,
          column: 'todo',
        }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions: [] } as any)

      const req = makeRequest('GET')
      const res = await getHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        synced: number
        byState: Record<string, number>
        tasks: Array<any>
      }
      expect(body.synced).toBe(0)
      expect(body.byState).toEqual({
        active: 0,
        done: 0,
        cancelled: 0,
        unknown: 0,
      })
      expect(body.tasks).toHaveLength(0)
    })

    it('returns unknown mission state for task with non-existent session_id', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          title: 'Task 1',
          session_id: 'non-existent-mission',
          assignee: null,
          column: 'in_progress',
        }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions: [] } as any)

      const req = makeRequest('GET')
      const res = await getHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        tasks: Array<{ missionState: string }>
      }
      expect(body.tasks[0].missionState).toBe('unknown')
    })

    it('counts tasks by mission state correctly', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
        mockTask({
          id: 't2',
          session_id: 'm2',
          assignee: 'km-agent',
          column: 'todo',
        }),
        mockTask({
          id: 't3',
          session_id: 'm3',
          assignee: 'reviewer',
          column: 'in_progress',
        }),
        mockTask({
          id: 't4',
          session_id: 'm4',
          assignee: 'orchestrator',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'running' }),
        mockMission({ id: 'm2', state: 'complete' }),
        mockMission({ id: 'm3', state: 'cancelled' }),
        mockMission({ id: 'm4', state: 'complete' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)

      const req = makeRequest('GET')
      const res = await getHandler({ request: req })
      const body = (await res.json()) as { byState: Record<string, number> }
      expect(body.byState).toEqual({
        active: 1,
        done: 2,
        cancelled: 1,
        unknown: 0,
      })
    })

    it('returns null missionAssignee when no assignments on mission', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: null,
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'running', assignments: [] }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)

      const req = makeRequest('GET')
      const res = await getHandler({ request: req })
      const body = (await res.json()) as {
        tasks: Array<{ missionAssignee: string | null }>
      }
      expect(body.tasks[0].missionAssignee).toBe(null)
    })
  })

  describe('POST handler', () => {
    it('returns 401 when not authenticated', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(false)
      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'complete' }],
      })
      const res = await postHandler({ request: req })
      expect(res.status).toBe(401)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('Unauthorized')
    })

    it('returns no updates message when updates array is empty', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const req = makeRequest('POST', { updates: [] })
      const res = await postHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        ok: boolean
        applied: number
        message: string
      }
      expect(body.ok).toBe(true)
      expect(body.applied).toBe(0)
      expect(body.message).toBe('no updates')
    })

    it('returns no updates message when body has no updates key', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const req = makeRequest('POST', {})
      const res = await postHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; applied: number }
      expect(body.ok).toBe(true)
      expect(body.applied).toBe(0)
    })

    it('returns no updates message when updates is not an array', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const req = makeRequest('POST', { updates: 'not-an-array' })
      const res = await postHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; applied: number }
      expect(body.ok).toBe(true)
      expect(body.applied).toBe(0)
    })

    it('applies complete state to in_progress task', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'complete' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'complete' }],
      })
      const res = await postHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        ok: boolean
        applied: number
        processed: number
      }
      expect(body.ok).toBe(true)
      expect(body.applied).toBe(1)
      expect(body.processed).toBe(1)
      expect(updateTask).toHaveBeenCalledWith('t1', { column: 'done' })
    })

    it('applies done state same as complete', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [mockMission({ id: 'm1', state: 'done' })]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'done' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(1)
      expect(updateTask).toHaveBeenCalledWith('t1', { column: 'done' })
    })

    it('skips tasks not linked to any mission', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = []
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'complete' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(0)
      expect(updateTask).not.toHaveBeenCalled()
    })

    it('skips invalid updates with missing missionId', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'complete' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)

      const req = makeRequest('POST', {
        updates: [{ state: 'complete' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(0)
      expect(updateTask).not.toHaveBeenCalled()
    })

    it('skips invalid updates with missing state', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'complete' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(0)
      expect(updateTask).not.toHaveBeenCalled()
    })

    it('does not move tasks from review to done when cancelled', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'review',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'cancelled' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'cancelled' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(0)
      expect(updateTask).not.toHaveBeenCalled()
    })

    it('moves in_progress task to done when cancelled', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'cancelled' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'cancelled' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(1)
      expect(updateTask).toHaveBeenCalledWith('t1', { column: 'done' })
    })

    it('moves in_progress task to done when failed', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'failed' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'failed' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(1)
      expect(updateTask).toHaveBeenCalledWith('t1', { column: 'done' })
    })

    it('does not move backlog task to done when cancelled', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'backlog',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'cancelled' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'cancelled' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(0)
      expect(updateTask).not.toHaveBeenCalled()
    })

    it('batch processes multiple updates correctly', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
        mockTask({
          id: 't2',
          session_id: 'm2',
          assignee: 'km-agent',
          column: 'todo',
        }),
        mockTask({
          id: 't3',
          session_id: 'm3',
          assignee: 'reviewer',
          column: 'review',
        }),
        mockTask({
          id: 't4',
          session_id: 'm4',
          assignee: 'orchestrator',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'complete' }),
        mockMission({ id: 'm2', state: 'complete' }),
        mockMission({ id: 'm3', state: 'cancelled' }),
        mockMission({ id: 'm4', state: 'cancelled' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [
          { missionId: 'm1', state: 'complete' },
          { missionId: 'm2', state: 'complete' },
          { missionId: 'm3', state: 'cancelled' },
          { missionId: 'm4', state: 'cancelled' },
        ],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number; processed: number }
      expect(body.applied).toBe(3)
      expect(body.processed).toBe(4)
      expect(updateTask).toHaveBeenCalledTimes(3)
      expect(updateTask).toHaveBeenNthCalledWith(1, 't1', { column: 'done' })
      expect(updateTask).toHaveBeenNthCalledWith(2, 't2', { column: 'done' })
      expect(updateTask).toHaveBeenNthCalledWith(3, 't4', { column: 'done' })
    })

    it('processes updates even when some are invalid', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'complete' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [
          { missionId: 'm1', state: 'complete' },
          { missionId: 'invalid', state: 'complete' },
          { state: 'complete' },
        ],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number; processed: number }
      expect(body.applied).toBe(1)
      expect(body.processed).toBe(3)
    })

    it('handles JSON parse failure gracefully', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const req = new Request('http://localhost/api/tasks-swarm-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })
      const res = await postHandler({ request: req })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { ok: boolean; applied: number }
      expect(body.ok).toBe(true)
      expect(body.applied).toBe(0)
    })

    it('returns processed count equal to updates length', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'in_progress',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'complete' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [
          { missionId: 'm1', state: 'complete' },
          { missionId: 'm2', state: 'complete' },
          { missionId: 'm3', state: 'complete' },
        ],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number; processed: number }
      expect(body.processed).toBe(3)
      expect(body.applied).toBe(1)
    })

    it('does not update task if newColumn same as current column', async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true)
      const tasks: Array<MockTask> = [
        mockTask({
          id: 't1',
          session_id: 'm1',
          assignee: 'builder',
          column: 'done',
        }),
      ]
      const missions: Array<MockMission> = [
        mockMission({ id: 'm1', state: 'complete' }),
      ]
      vi.mocked(listTasks).mockReturnValue(tasks as any)
      vi.mocked(readStore).mockReturnValue({ missions } as any)
      vi.mocked(updateTask).mockResolvedValue(undefined)

      const req = makeRequest('POST', {
        updates: [{ missionId: 'm1', state: 'complete' }],
      })
      const res = await postHandler({ request: req })
      const body = (await res.json()) as { applied: number }
      expect(body.applied).toBe(0)
      expect(updateTask).not.toHaveBeenCalled()
    })
  })
})
