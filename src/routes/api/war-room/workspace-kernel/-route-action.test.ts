import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadWorkspacePacketStore } from '../../../../lib/workspace-kernel/packets/packet-store'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  mergeWorkspaceKernelStateWithSupabase,
  persistWorkspaceKernelRunsToSupabase,
} from '../../../../server/workspace-core-db'
import { Route, workspaceKernelPayloadFromBody } from './route-action'

vi.mock('../../../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../../../server/workspace-core-db', () => {
  const persistence = {
    provider: 'local-file' as const,
    enabled: false,
    liveSource: false,
    writebackAllowed: false,
    status: 'fallback' as const,
    readback: 'Test-local Workspace Kernel persistence.',
    runCount: 0,
    approvalCount: 0,
  }
  return {
    mergeWorkspaceKernelStateWithSupabase: vi.fn((state: unknown) => Promise.resolve({ state, persistence })),
    persistWorkspaceKernelRunsToSupabase: vi.fn((runs: Array<unknown>) => Promise.resolve({
      ...persistence,
      runCount: runs.length,
    })),
  }
})

type RouteWithHandlers = typeof Route & {
  options: {
    server: {
      handlers: {
        GET: (ctx: { request: Request }) => Promise<Response>
        POST: (ctx: { request: Request }) => Promise<Response>
      }
    }
  }
}

const handlers = (Route as RouteWithHandlers).options.server.handlers
const mockIsAuthenticated = vi.mocked(isAuthenticated)
const mockMergeWorkspaceKernelStateWithSupabase = vi.mocked(mergeWorkspaceKernelStateWithSupabase)
const mockPersistWorkspaceKernelRunsToSupabase = vi.mocked(persistWorkspaceKernelRunsToSupabase)
let tempDirs: Array<string> = []
let currentRootDir = ''

function makePost(
  body: unknown,
  idempotencyKey = 'route-api-post-idem',
  approvalOverrides: Record<string, unknown> = {},
) {
  return new Request('http://localhost/api/war-room/workspace-kernel/route-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey,
      approvalContext: {
        approvalId: `approval-${idempotencyKey}`,
        approvedBy: 'dlv',
        approvedAtMs: Date.now(),
        decision: 'approved',
        scope: 'workspace-kernel-route-action',
        ...approvalOverrides,
      },
      action: body,
    }),
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockIsAuthenticated.mockReturnValue(true)
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workspace-kernel-route-api-'))
  tempDirs.push(rootDir)
  currentRootDir = rootDir
  process.env.WORKSPACE_KERNEL_STORE_DIR = rootDir
  process.env.WORKSPACE_PACKET_STORE_DIR = rootDir
})

afterEach(async () => {
  delete process.env.WORKSPACE_KERNEL_STORE_DIR
  delete process.env.WORKSPACE_PACKET_STORE_DIR
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs = []
  currentRootDir = ''
})

describe('/api/war-room/workspace-kernel/route-action', () => {
  it('returns 401 when unauthenticated', async () => {
    mockIsAuthenticated.mockReturnValue(false)
    const response = await handlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action?q=smart%20intake'),
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid JSON', async () => {
    const response = await handlers.POST({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    })
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as { ok: boolean; error: string }
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Invalid JSON')
  })

  it('previews GET q routes without persisting local state', async () => {
    const response = await handlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action?q=AliExpress%20Drive%20Google%20Sheet%20local%20image%20Dolaro'),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as {
      ok: boolean
      preview: boolean
      persisted: boolean
      result: { route: { blueprint: { blueprintId: string; stationId?: string } }; run: { blueprintId: string; artifacts: Array<{ kind: string }> } }
    }
    expect(body.ok).toBe(true)
    expect(body.preview).toBe(true)
    expect(body.persisted).toBe(false)
    expect(body.result.route.blueprint).toMatchObject({
      blueprintId: 'etsy-smart-product-intake-v1',
      stationId: 'etsy-loki-product-hunt',
    })
    expect(body.result.run.blueprintId).toBe('etsy-smart-product-intake-v1')
    expect(body.result.run.artifacts[0].kind).toBe('product-candidate-packet')
    expect(await readdir(currentRootDir)).toEqual([])
    expect(mockMergeWorkspaceKernelStateWithSupabase).not.toHaveBeenCalled()
    expect(mockPersistWorkspaceKernelRunsToSupabase).not.toHaveBeenCalled()
  })

  it('rejects POST mutation without explicit approval and idempotency context', async () => {
    const missingContext = await handlers.POST({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary: 'unsafe legacy write' }),
      }),
    })
    expect(missingContext.status).toBe(400)
    expect(await missingContext.json()).toMatchObject({
      ok: false,
      error: 'Explicit approval and idempotency context required',
    })
    expect(await readdir(currentRootDir)).toEqual([])
  })

  it('persists a deterministic ExecutionPlan before committing an authenticated POST run', async () => {
    const response = await handlers.POST({
      request: makePost({
        source: 'ui',
        intent: 'local product research',
        summary: 'Persist the execution plan before routing.',
        input: { text: 'Local only.' },
      }, 'route-plan-before-run'),
    })
    const body = await response.json() as {
      ok: boolean
      result: { run: { runId: string; executionPlanPacketId?: string; packetRefs?: Array<string> } }
    }
    const packetStore = await loadWorkspacePacketStore({ rootDir: currentRootDir })

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.result.run.executionPlanPacketId).toBeTruthy()
    expect(body.result.run.packetRefs).toContain(body.result.run.executionPlanPacketId)
    expect(packetStore.ok).toBe(true)
    if (!packetStore.ok) throw new Error('Expected readable Packet store.')
    expect(packetStore.state.packets).toHaveLength(1)
    expect(packetStore.state.packets[0]).toMatchObject({
      packetId: body.result.run.executionPlanPacketId,
      runId: body.result.run.runId,
      packetType: 'execution-plan',
    })
    expect(packetStore.state.events.map((event) => event.type)).toEqual(['created', 'ready'])
  })

  it('rejects malformed, oversized, stale, and future approval envelopes before persistence', async () => {
    const action = { source: 'ui', summary: 'Must remain blocked' }
    const nowMs = Date.now()
    const requests = [
      makePost(action, 'x'.repeat(201), { approvalId: 'approval-overlong-key' }),
      makePost(action, 'valid-key-approval-id', { approvalId: 'x'.repeat(181) }),
      makePost(action, 'valid-key-approver', { approvedBy: 'x'.repeat(181) }),
      makePost(action, 'valid-key-stale', { approvedAtMs: nowMs - (16 * 60 * 1_000) }),
      makePost(action, 'valid-key-future', { approvedAtMs: nowMs + (2 * 60 * 1_000) }),
      makePost(action, 'valid-key-decision', { decision: 'pending' }),
      makePost(action, 'valid-key-scope', { scope: 'other-scope' }),
    ]

    for (const request of requests) {
      const response = await handlers.POST({ request })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: 'Explicit approval and idempotency context required',
      })
    }
    expect(await readdir(currentRootDir)).toEqual([])
    expect(mockMergeWorkspaceKernelStateWithSupabase).not.toHaveBeenCalled()
    expect(mockPersistWorkspaceKernelRunsToSupabase).not.toHaveBeenCalled()
  })

  it('uses the authenticated server principal instead of trusting claimed approvedBy', async () => {
    const action = { source: 'ui', summary: 'Server-owned approval identity' }
    const first = await handlers.POST({
      request: makePost(action, 'server-principal-key', { approvedBy: 'claimed-admin' }),
    })
    const replay = await handlers.POST({
      request: makePost(action, 'server-principal-key', { approvedBy: 'different-claim' }),
    })
    const firstBody = await first.json() as {
      result: { route: { action: { input: { payload?: Record<string, unknown> } } } }
    }
    const replayBody = await replay.json() as { idempotentReplay: boolean }

    expect(firstBody.result.route.action.input.payload).toMatchObject({
      kernelWriteApprovedBy: 'authenticated-workspace-owner',
      kernelWriteClaimedApprovedBy: 'claimed-admin',
    })
    expect(replayBody.idempotentReplay).toBe(true)
    expect(mockPersistWorkspaceKernelRunsToSupabase).toHaveBeenCalledTimes(1)
  })

  it('leaves existing persisted state byte-for-byte unchanged during GET preview', async () => {
    const committed = await handlers.POST({
      request: makePost({ source: 'ui', summary: 'Seed persisted state', input: { text: 'seed' } }, 'seed-before-preview'),
    })
    expect(committed.status).toBe(200)
    const statePath = path.join(currentRootDir, 'state.json')
    const eventsPath = path.join(currentRootDir, 'events.jsonl')
    const stateBefore = await readFile(statePath, 'utf8')
    const eventsBefore = await readFile(eventsPath, 'utf8')
    vi.clearAllMocks()

    const preview = await handlers.GET({
      request: new Request('http://localhost/api/war-room/workspace-kernel/route-action?q=preview%20only'),
    })

    expect(preview.status).toBe(200)
    expect(await readFile(statePath, 'utf8')).toBe(stateBefore)
    expect(await readFile(eventsPath, 'utf8')).toBe(eventsBefore)
    expect(mockMergeWorkspaceKernelStateWithSupabase).not.toHaveBeenCalled()
    expect(mockPersistWorkspaceKernelRunsToSupabase).not.toHaveBeenCalled()
  })

  it('accepts bounded POST WorkspaceAction payloads', async () => {
    const response = await handlers.POST({
      request: makePost({
        actionId: 'route-api-post',
        source: 'ui',
        intent: 'CAD packet',
        summary: `OpenSCAD STL print packet ${'x'.repeat(9_000)}`,
        input: {
          text: 'OpenSCAD STL STEP slicer G-code',
          payload: {
            huge: 'y'.repeat(2_000),
            nested: { unsafe: true },
          },
        },
      }),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      ok: boolean
      idempotentReplay: boolean
      result: {
        route: { action: { summary: string; input: { payload?: Record<string, unknown> } }; blueprint: { blueprintId: string }; safety: { usageAllowed: boolean; workerSpawnAllowed: boolean; liveActionsAllowed: boolean } }
        run: { status: string; approvals: Array<{ status: string }> }
      }
    }
    expect(body.ok).toBe(true)
    expect(body.idempotentReplay).toBe(false)
    expect(body.result.route.action.summary).toHaveLength(8_000)
    expect(String(body.result.route.action.input.payload?.huge)).toHaveLength(1_200)
    expect(body.result.route.action.input.payload?.nested).toBe('[object omitted]')
    expect(body.result.route.action.input.payload).toMatchObject({
      kernelWriteApprovalId: 'approval-route-api-post-idem',
      kernelWriteApprovedBy: 'authenticated-workspace-owner',
      kernelWriteClaimedApprovedBy: 'dlv',
      kernelWriteApprovalScope: 'workspace-kernel-route-action',
    })
    expect(body.result.route.blueprint.blueprintId).toBe('cad-3d-print-design-v1')
    expect(body.result.run.status).toBe('waiting_approval')
    expect(body.result.run.approvals[0].status).toBe('waiting_operator')
    expect(body.result.route.safety).toMatchObject({
      usageAllowed: false,
      workerSpawnAllowed: false,
      liveActionsAllowed: false,
    })
  })

  it('replays identical POST requests without creating a second run', async () => {
    const action = {
      actionId: 'caller-action-is-replaced-by-idempotency',
      source: 'ui',
      intent: 'prepare product packet',
      summary: 'Prepare local Etsy packet',
      input: { text: 'local Etsy product packet' },
    }
    const first = await handlers.POST({ request: makePost(action, 'same-request-key') })
    const statePath = path.join(currentRootDir, 'state.json')
    const eventsPath = path.join(currentRootDir, 'events.jsonl')
    const stateAfterFirst = await readFile(statePath, 'utf8')
    const eventsAfterFirst = await readFile(eventsPath, 'utf8')
    const second = await handlers.POST({ request: makePost(action, 'same-request-key') })
    const firstBody = await first.json() as { result: { run: { runId: string } }; stateVersion: string; idempotentReplay: boolean }
    const secondBody = await second.json() as { result: { run: { runId: string } }; stateVersion: string; state: { runs: Array<{ runId: string }> }; idempotentReplay: boolean }

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(firstBody.idempotentReplay).toBe(false)
    expect(secondBody.idempotentReplay).toBe(true)
    expect(secondBody.result.run.runId).toBe(firstBody.result.run.runId)
    expect(secondBody.stateVersion).toBe(firstBody.stateVersion)
    expect(secondBody.state.runs.filter((run) => run.runId === firstBody.result.run.runId)).toHaveLength(1)
    expect(await readFile(statePath, 'utf8')).toBe(stateAfterFirst)
    expect(await readFile(eventsPath, 'utf8')).toBe(eventsAfterFirst)
    expect(mockPersistWorkspaceKernelRunsToSupabase).toHaveBeenCalledTimes(1)
  })

  it('replays semantically identical actions regardless of object key order', async () => {
    const first = await handlers.POST({
      request: makePost({
        source: 'ui',
        summary: 'Canonical request',
        input: { text: 'same', payload: { alpha: 'a', beta: 'b' } },
      }, 'canonical-request-key'),
    })
    const reordered = await handlers.POST({
      request: makePost({
        summary: 'Canonical request',
        source: 'ui',
        input: { payload: { beta: 'b', alpha: 'a' }, text: 'same' },
      }, 'canonical-request-key'),
    })
    const firstBody = await first.json() as { result: { run: { runId: string } } }
    const replayBody = await reordered.json() as {
      idempotentReplay: boolean
      result: { run: { runId: string } }
    }

    expect(reordered.status).toBe(200)
    expect(replayBody.idempotentReplay).toBe(true)
    expect(replayBody.result.run.runId).toBe(firstBody.result.run.runId)
  })

  it('rejects reuse of an idempotency key for a different action', async () => {
    const first = await handlers.POST({
      request: makePost({ source: 'ui', summary: 'First safe action', input: { text: 'first' } }, 'conflict-key'),
    })
    const statePath = path.join(currentRootDir, 'state.json')
    const eventsPath = path.join(currentRootDir, 'events.jsonl')
    const stateBeforeConflict = await readFile(statePath, 'utf8')
    const eventsBeforeConflict = await readFile(eventsPath, 'utf8')
    const conflict = await handlers.POST({
      request: makePost({ source: 'ui', summary: 'Different action', input: { text: 'different' } }, 'conflict-key'),
    })

    expect(first.status).toBe(200)
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({
      ok: false,
      error: 'Idempotency key already used for a different action',
    })
    expect(await readFile(statePath, 'utf8')).toBe(stateBeforeConflict)
    expect(await readFile(eventsPath, 'utf8')).toBe(eventsBeforeConflict)
    expect(mockPersistWorkspaceKernelRunsToSupabase).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent identical POST requests into one logical run', async () => {
    const action = { source: 'ui', summary: 'Concurrent safe action', input: { text: 'same concurrent request' } }
    const [left, right] = await Promise.all([
      handlers.POST({ request: makePost(action, 'concurrent-request-key') }),
      handlers.POST({ request: makePost(action, 'concurrent-request-key') }),
    ])
    const bodies = await Promise.all([left.json(), right.json()]) as Array<{
      idempotentReplay: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
      result: { run: { runId: string; actionId: string } }
      state: { runs: Array<{ actionId: string }> }
    }>

    expect([left.status, right.status]).toEqual([200, 200])
    expect(bodies.map((body) => body.idempotentReplay).sort()).toEqual([false, true])
    expect(new Set(bodies.map((body) => body.result.run.runId)).size).toBe(1)
    const actionId = bodies[0].result.run.actionId
    expect(bodies.at(-1)?.state.runs.filter((run) => run.actionId === actionId)).toHaveLength(1)
    expect(bodies.every((body) => !body.externalRequestsAllowed && !body.liveActionsAllowed)).toBe(true)
    expect(mockPersistWorkspaceKernelRunsToSupabase).toHaveBeenCalledTimes(1)
  })

  it('releases the write queue after persistence failure so a retry can complete', async () => {
    mockPersistWorkspaceKernelRunsToSupabase.mockRejectedValueOnce(new Error('forced persistence failure'))
    const action = { source: 'ui', summary: 'Retry after failure', input: { text: 'retry safely' } }

    await expect(handlers.POST({
      request: makePost(action, 'retry-after-failure-key'),
    })).rejects.toThrow('forced persistence failure')

    const retry = await handlers.POST({
      request: makePost(action, 'retry-after-failure-key'),
    })
    const retryBody = await retry.json() as {
      idempotentReplay: boolean
      externalRequestsAllowed: boolean
      liveActionsAllowed: boolean
    }
    expect(retry.status).toBe(200)
    expect(retryBody.idempotentReplay).toBe(true)
    expect(retryBody.externalRequestsAllowed).toBe(false)
    expect(retryBody.liveActionsAllowed).toBe(false)
  })

  it('drops invalid route hints during body parsing', () => {
    const action = workspaceKernelPayloadFromBody({
      preferredBlueprintId: 'unknown-blueprint',
      preferredRoomId: 'unknown-room',
      preferredStationId: 'unknown-station',
      requestedWorkerProfileId: 'unknown-worker',
      source: 'bad-source',
      summary: 'daily news packet',
    }, 500)
    expect(action.preferredBlueprintId).toBeUndefined()
    expect(action.preferredRoomId).toBeUndefined()
    expect(action.preferredStationId).toBeUndefined()
    expect(action.requestedWorkerProfileId).toBeUndefined()
    expect(action.source).toBe('operator')
    expect(action.summary).toBe('daily news packet')
  })
})
