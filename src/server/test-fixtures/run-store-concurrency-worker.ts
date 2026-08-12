import {
  addRunLifecycleEvent,
  appendRunText,
  createPersistedRun,
  markRunStatus,
} from '../run-store'
import type { PersistedRunState } from '../run-store'

type WorkerCommand = {
  action: 'create' | 'events' | 'status' | 'append-many' | 'stop'
  runId?: string
  sessionKey?: string
  friendlyId?: string
  prefix?: string
  count?: number
  status?: PersistedRunState['status']
}

process.on('message', async (command: WorkerCommand) => {
  if (command.action === 'stop') {
    process.send?.({ stopped: true })
    process.disconnect()
    return
  }

  const runId = command.runId!
  const sessionKey = command.sessionKey!
  try {
    if (command.action === 'create') {
      await createPersistedRun({
        runId,
        sessionKey,
        friendlyId: command.friendlyId,
      })
    } else if (command.action === 'events') {
      await Promise.all(
        Array.from({ length: command.count ?? 0 }, (_, index) =>
          addRunLifecycleEvent(sessionKey, runId, {
            text: `${command.prefix}-${index}`,
            emoji: '',
            timestamp: index,
            isError: false,
          }),
        ),
      )
    } else if (command.action === 'status') {
      await markRunStatus(sessionKey, runId, command.status!)
    } else {
      await Promise.all(
        Array.from({ length: command.count ?? 0 }, () =>
          appendRunText(sessionKey, runId, 'stale-active-write'),
        ),
      )
    }
    process.send?.({ ok: true })
  } catch (error) {
    process.send?.({
      ok: false,
      code: (error as NodeJS.ErrnoException).code,
      message:
        error instanceof Error ? error.message : 'run-store worker failed',
    })
  }
})

process.send?.({ ready: true })
