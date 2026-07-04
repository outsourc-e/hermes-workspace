import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDispatchedWarRoomTask,
  dispatchWarRoomIntentSequence,
  getWarRoomBodyState,
  listWarRoomEvents,
  markDispatchedWarRoomTaskStatus,
  resetWarRoomBodyRuntimeForDev,
} from './index'

describe('War Room task dispatcher scaffold', () => {
  beforeEach(() => {
    resetWarRoomBodyRuntimeForDev(20_000)
  })

  it('creates tasks and dispatches local intent sequences with correlation metadata', () => {
    const task = createDispatchedWarRoomTask({
      taskId: 'dispatch-task',
      label: 'Dispatch Athena to opportunity intake',
      roomId: 'agora-opportunity',
      stationId: 'agora-intake',
      assignedAgentId: 'athena',
      runId: 'run-dispatch',
      correlationId: 'corr-dispatch',
    }, 20_100)

    dispatchWarRoomIntentSequence({
      runId: 'run-dispatch',
      correlationId: 'corr-dispatch',
      intents: [
        { type: 'move_to_station', agentId: 'athena', roomId: 'agora-opportunity', stationId: 'agora-intake' },
        { type: 'work_at_station', agentId: 'athena', roomId: 'agora-opportunity', stationId: 'agora-intake', taskId: task.taskId },
      ],
    }, 20_200)
    markDispatchedWarRoomTaskStatus({ taskId: task.taskId, status: 'completed', runId: 'run-dispatch', correlationId: 'corr-dispatch' }, 20_400)

    expect(getWarRoomBodyState().tasks.find((candidate) => candidate.taskId === task.taskId)?.status).toBe('completed')
    expect(listWarRoomEvents().filter((event) => event.correlationId === 'corr-dispatch').map((event) => event.type)).toEqual(expect.arrayContaining([
      'task.created',
      'agent.intent.received',
      'agent.moved',
      'agent.started_work',
      'task.completed',
    ]))
  })

  it('blocks usage-consuming dispatch paths by default', () => {
    expect(() => dispatchWarRoomIntentSequence({
      usageConsuming: true,
      requestedAction: 'run Hermes worker',
      runId: 'run-usage-block',
      correlationId: 'corr-usage-block',
      intents: [
        { type: 'work_at_station', agentId: 'hermes', roomId: 'olympus-command', stationId: 'mission-router' },
      ],
    }, 20_500)).toThrow(/frozen|blocked|does not allow/i)

    expect(listWarRoomEvents().map((event) => event.type)).toContain('agent.connection.blocked')
  })
})
