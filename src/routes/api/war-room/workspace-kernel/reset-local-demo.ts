import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { WORKSPACE_KERNEL_SAFETY, buildKernelAgentDisplayStates } from '../../../../lib/workspace-kernel'
import { resetWorkspaceKernelStore } from '../../../../lib/workspace-kernel/store'
import { isAuthenticated } from '../../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

export const Route = createFileRoute('/api/war-room/workspace-kernel/reset-local-demo')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const state = await resetWorkspaceKernelStore()
        return json({
          ok: true,
          stateVersion: state.stateVersion,
          result: state,
          state,
          displayStates: buildKernelAgentDisplayStates(state),
          localOnly: true,
          usageAllowed: false,
          workerSpawnAllowed: false,
          externalRequestsAllowed: false,
          liveActionsAllowed: false,
          lockedActions: [],
          safety: WORKSPACE_KERNEL_SAFETY,
        }, { headers: noStoreHeaders })
      },
    },
  },
})
