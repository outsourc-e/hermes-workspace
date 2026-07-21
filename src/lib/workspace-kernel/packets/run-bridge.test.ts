import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { routeWorkspaceActionToBlueprint } from '../router'
import { createWorkspacePacket } from './factory'
import {
  WorkspacePacketStoreConflictError,
  loadWorkspacePacketStore,
  persistWorkspacePacketStore,
} from './packet-store'
import {
  createWorkspaceRunWithExecutionPlan,
  verifyWorkspaceRunCompletionFromPacketStore,
} from './run-bridge'
import type { WorkspaceBlueprint } from '../contracts'

const tempDirs: Array<string> = []

async function temporaryStore() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-run-bridge-'))
  tempDirs.push(rootDir)
  return { rootDir, nowMs: 1_000 }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('Workspace Packet run bridge', () => {
  it('persists one deterministic ExecutionPlan before returning a Packet-aware run', async () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-run-bridge-create',
      createdAtMs: 1_000,
      source: 'hermes',
      intent: 'local product research',
      summary: 'Create a local research plan.',
      input: { text: 'Local only.' },
    })
    const store = await temporaryStore()

    const first = await createWorkspaceRunWithExecutionPlan(route.action, route.blueprint, 1_000, store)
    const replay = await createWorkspaceRunWithExecutionPlan(route.action, route.blueprint, 2_000, store)
    const loaded = await loadWorkspacePacketStore(store)

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('Expected readable Packet store.')
    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    expect(replay.run.runId).toBe(first.run.runId)
    expect(replay.executionPlanPacket.contentHash).toBe(first.executionPlanPacket.contentHash)
    expect(loaded.state.packets).toHaveLength(1)
    expect(loaded.state.activeRunIds).toEqual([first.run.runId])
    expect(loaded.state.packets[0]).toMatchObject({
      packetId: first.run.executionPlanPacketId,
      runId: first.run.runId,
      packetType: 'execution-plan',
      to: {
        roomId: first.run.ownerRoomId,
        agentId: first.run.assignedWorkerProfileId,
      },
    })
    expect(loaded.state.events.map((event) => event.type)).toEqual(['created', 'ready'])
    expect(first.run.events.map((event) => event.type)).toEqual([
      'run.created',
      'packet.created',
      'packet.ready',
      'run.routed',
    ])
  })

  it('rejects changed canonical plan content under the same idempotency identity', async () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-run-bridge-conflict',
      createdAtMs: 1_100,
      source: 'hermes',
      intent: 'local product research',
      summary: 'Original local plan.',
      input: { text: 'Original.' },
    })
    const store = await temporaryStore()
    await createWorkspaceRunWithExecutionPlan(route.action, route.blueprint, 1_100, store)

    await expect(createWorkspaceRunWithExecutionPlan({
      ...route.action,
      summary: 'Changed local plan under the same action ID.',
    }, route.blueprint, 1_200, store)).rejects.toBeInstanceOf(WorkspacePacketStoreConflictError)

    const loaded = await loadWorkspacePacketStore(store)
    expect(loaded.ok && loaded.state.packets).toHaveLength(1)
  })

  it('rejects a RunReadback delivery string that is not a real bound store Packet', async () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-run-bridge-fake-delivery',
      createdAtMs: 1_250,
      source: 'hermes',
      intent: 'local product research',
      summary: 'Verify fake delivery proof is rejected.',
      input: { text: 'Local only.' },
    })
    const store = await temporaryStore()
    const created = await createWorkspaceRunWithExecutionPlan(route.action, route.blueprint, 1_250, store)
    const plan = created.executionPlanPacket.payload as {
      steps: Array<{ stepId: string; title: string }>
    }
    const readbackPacket = createWorkspacePacket({
      packetId: 'packet-run-readback-fake-delivery',
      packetLineageId: 'lineage-run-readback-fake-delivery',
      createdAt: '2026-07-19T08:00:00.000Z',
      runId: created.run.runId,
      schemaVersion: '1.0.0',
      packetType: 'run-readback',
      from: created.executionPlanPacket.to,
      to: created.executionPlanPacket.from,
      sourceRefs: [created.executionPlanPacket.packetId, 'fake-delivery-readback'],
      evidenceRefs: ['fake-delivery-readback'], assumptions: [], missingFields: [], lockedActions: [],
      approval: { required: false, stage: null, grantId: null },
      acceptanceCriteria: [{ criterionId: 'readback-exact', description: 'Exact proof refs.', required: true }],
      idempotencyKey: 'run-readback:fake-delivery',
      payload: {
        executionPlanPacketId: created.executionPlanPacket.packetId,
        executionPlanRevision: created.executionPlanPacket.revision,
        finalStatus: 'completed',
        steps: [{
          stepId: plan.steps[0].stepId,
          required: true,
          packetRefs: [created.executionPlanPacket.packetId],
          ackRefs: ['ack-plan-fake'],
          expectedOutput: plan.steps[0].title,
          actualOutputRefs: ['fake-delivery-readback'],
          outcome: 'accepted',
        }],
        approvalGrantRefs: [], artifactRefs: [],
        deliveryReadbackRefs: ['fake-delivery-readback'],
        rollbackRefs: [], unresolvedItems: [], nextActions: [],
      },
    })
    await persistWorkspacePacketStore({ packets: [readbackPacket] }, store)
    const verification = await verifyWorkspaceRunCompletionFromPacketStore({
      ...created.run,
      runReadbackPacketId: readbackPacket.packetId,
    }, store)
    expect(verification.ok).toBe(false)
    if (verification.ok) throw new Error('Expected fake delivery proof to fail closed.')
    expect(verification.missingProof).toContain('deliveryReadback:fake-delivery-readback')
  })

  it('fails closed without writing when no worker can be resolved', async () => {
    const route = routeWorkspaceActionToBlueprint({
      actionId: 'action-run-bridge-no-worker',
      createdAtMs: 1_300,
      source: 'hermes',
      intent: 'local product research',
      summary: 'No eligible worker.',
      input: { text: 'Local only.' },
    })
    const blueprint: WorkspaceBlueprint = {
      ...route.blueprint,
      allowedWorkerProfileIds: [],
    }
    const store = await temporaryStore()

    await expect(createWorkspaceRunWithExecutionPlan(route.action, blueprint, 1_300, store))
      .rejects.toThrow('has no eligible worker profile')

    const loaded = await loadWorkspacePacketStore(store)
    expect(loaded.ok && loaded.state.packets).toHaveLength(0)
  })
})
