import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  WORKSPACE_KERNEL_SAFETY,
  applyWorkspaceKernelEventIngress,
  buildKernelAgentDisplayStates,
} from '../../../../lib/workspace-kernel'
import { loadWorkspaceKernelState, saveWorkspaceKernelState } from '../../../../lib/workspace-kernel/store'
import { isAuthenticated } from '../../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

function responsePayload(result: ReturnType<typeof applyWorkspaceKernelEventIngress>, stateVersion: string) {
  return {
    ok: result.ok,
    stateVersion,
    result,
    state: result.state,
    event: result.event,
    run: result.run,
    telemetry: result.telemetry,
    displayStates: buildKernelAgentDisplayStates(result.state),
    localOnly: true,
    usageAllowed: false,
    workerSpawnAllowed: false,
    externalRequestsAllowed: false,
    liveActionsAllowed: false,
    lockedActions: result.lockedActions,
    safety: WORKSPACE_KERNEL_SAFETY,
  }
}

export const Route = createFileRoute('/api/war-room/workspace-kernel/events')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: noStoreHeaders })
        }
        const state = await loadWorkspaceKernelState()
        const result = applyWorkspaceKernelEventIngress(body, state)
        if (!result.ok) {
          return json(responsePayload(result, state.stateVersion), { status: 400, headers: noStoreHeaders })
        }
        const saved = await saveWorkspaceKernelState({
          ...result.state,
          telemetry: result.telemetry ?? result.state.telemetry,
        })
        const savedResult = {
          ...result,
          state: saved,
        }
        return json(responsePayload(savedResult, saved.stateVersion), { headers: noStoreHeaders })
      },
    },
  },
})
