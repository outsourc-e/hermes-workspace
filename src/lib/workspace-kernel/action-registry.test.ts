import { describe, expect, it } from 'vitest'

import { createWorkspaceRun } from './reducer'
import { routeWorkspaceActionToBlueprint } from './router'
import { workspaceExecutorPlanForRun } from './action-registry'

describe('workspace action executor registry', () => {
  it('maps live publish/purchase/send text to locked approval executors', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'executor-registry-live-risk',
      createdAtMs: 100,
      source: 'operator',
      intent: 'Publish and pay',
      summary: 'Publish Etsy listing, purchase inventory, pay supplier, and send Discord readback.',
      input: { text: 'publish upload purchase pay supplier message Discord send live listing' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 100)
    const plan = workspaceExecutorPlanForRun(run)

    expect(plan.liveExecutorConnected).toBe(false)
    expect(plan.approvalsRequired).toBe(true)
    expect(plan.mode).toBe('locked_until_sender_connected')
    expect(plan.route.map((entry) => entry.executorId)).toEqual(expect.arrayContaining([
      'etsy-draft-or-publish',
      'discord-send',
      'supplier-message-or-purchase',
    ]))
  })

  it('keeps generic local status work as local readback only', () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'executor-registry-local',
      createdAtMs: 200,
      source: 'operator',
      intent: 'status',
      summary: 'Show a local project checkpoint.',
      input: { text: 'local status checkpoint only' },
    })
    const run = createWorkspaceRun(route.action, route.blueprint, 200)
    const plan = workspaceExecutorPlanForRun(run)

    expect(plan.mode).toBe('draft_only')
    expect(plan.approvalsRequired).toBe(false)
    expect(plan.route).toHaveLength(1)
    expect(plan.route[0].executorId).toBe('local-readback-only')
  })
})
