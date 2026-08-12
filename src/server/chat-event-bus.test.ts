import { afterEach, describe, expect, it } from 'vitest'
import {
  publishCardActivityEvent,
  publishChatEvent,
  subscribeToChatEvents,
} from './chat-event-bus'
import {
  registerActiveSendRun,
  unregisterActiveSendRun,
} from './send-run-tracker'

const ACTIVE_RUN_ID = 'card-activity-active-run'

afterEach(() => {
  unregisterActiveSendRun(ACTIVE_RUN_ID)
})

describe('chat event bus active send-run suppression', () => {
  it('delivers explicit Card activity while suppressing normal active-run events', () => {
    const delivered: Array<{
      event: string
      data: Record<string, unknown>
    }> = []
    const unsubscribe = subscribeToChatEvents(
      (event) => delivered.push(event),
      'remote:parent',
    )

    try {
      registerActiveSendRun(ACTIVE_RUN_ID)
      publishChatEvent('message', {
        sessionKey: 'remote:parent',
        runId: ACTIVE_RUN_ID,
        text: 'must stay on the direct send stream',
      })
      publishCardActivityEvent({
        cardId: 'remote:parent-card',
        sessionKey: 'remote:parent',
        runId: ACTIVE_RUN_ID,
        state: 'running',
        updatedAt: 100,
        activity: 'run.started',
      })

      expect(delivered).toEqual([
        {
          event: 'card_activity',
          data: {
            cardId: 'remote:parent-card',
            sessionKey: 'remote:parent',
            runId: ACTIVE_RUN_ID,
            state: 'running',
            updatedAt: 100,
            activity: 'run.started',
          },
        },
      ])

      unregisterActiveSendRun(ACTIVE_RUN_ID)
      publishChatEvent('message', {
        sessionKey: 'remote:parent',
        runId: ACTIVE_RUN_ID,
        text: 'delivered after the direct stream closes',
      })
      expect(delivered.at(-1)?.event).toBe('message')
    } finally {
      unsubscribe()
    }
  })
})
