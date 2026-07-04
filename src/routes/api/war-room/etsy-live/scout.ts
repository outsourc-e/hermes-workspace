import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { runEtsyLiveScoutBackend } from '../../../../lib/war-room/body/etsy-live-backend'
import { loadSharedEtsyRoomStore, saveSharedEtsyRoomState } from '../../../../lib/war-room/body/etsy-room-shared-store'
import { applyEtsyLiveResearchRunToEtsyRoomLocal } from '../../../../lib/war-room/living-v3/etsy-room-contracts'
import { WORKSPACE_KERNEL_SAFETY } from '../../../../lib/workspace-kernel'
import { isAuthenticated } from '../../../../server/auth-middleware'

const noStoreHeaders = { 'cache-control': 'no-store' }

export const Route = createFileRoute('/api/war-room/etsy-live/scout')({
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

        try {
          const result = await runEtsyLiveScoutBackend({ requestBody: body, cwd: process.cwd() })
          let sharedRoomState: unknown = undefined
          let sharedRoomStore: Awaited<ReturnType<typeof saveSharedEtsyRoomState>> | undefined = undefined
          let sharedRoomError: string | undefined = undefined
          if (result.liveRun.status === 'completed' && result.liveRun.candidates.length > 0) {
            try {
              const previousSharedStore = await loadSharedEtsyRoomStore()
              const nextSharedRoomState = applyEtsyLiveResearchRunToEtsyRoomLocal(previousSharedStore.roomState, {
                liveRun: result.liveRun,
                nowMs: Date.now(),
              })
              sharedRoomStore = await saveSharedEtsyRoomState(nextSharedRoomState, {
                reason: 'Live read-only scout completed',
                source: 'scout-api',
              })
              sharedRoomState = sharedRoomStore.roomState
            } catch (error) {
              sharedRoomError = error instanceof Error ? error.message : String(error)
            }
          }
          return json({
            ...result,
            sharedRoomState,
            sharedRoomStore,
            sharedRoomError,
            localOnly: true,
            usageAllowed: false,
            workerSpawnAllowed: false,
            externalRequestsAllowed: false,
            liveActionsAllowed: false,
          }, {
            status: result.liveRun.status === 'failed' ? 500 : 200,
            headers: noStoreHeaders,
          })
        } catch (error) {
          return json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            safety: WORKSPACE_KERNEL_SAFETY,
            localOnly: true,
            usageAllowed: false,
            workerSpawnAllowed: false,
            externalRequestsAllowed: false,
            liveActionsAllowed: false,
          }, { status: 400, headers: noStoreHeaders })
        }
      },
    },
  },
})
