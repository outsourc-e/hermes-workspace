import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { getWarRoomBodyState } from '../../../lib/war-room/body'
import { dispatchWarRoomIntent } from '../../../lib/war-room/body/runtime'
import { AgentIntentSchema } from '../../../lib/war-room/body/schemas'
import {
  parseWarRoomIntentApiPayload,
  runOracleScoutLocalBridge,
} from '../../../lib/war-room/body/oracle-scout-event-bridge'
import {
  parseEtsyRoomIntentApiPayload,
  runEtsyRoomLocalIntentBridge,
} from '../../../lib/war-room/body/etsy-room-event-bridge'

export const Route = createFileRoute('/api/war-room/intents')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const parsedOracle = parseWarRoomIntentApiPayload(body)
        const parsedEtsy = parseEtsyRoomIntentApiPayload(body)
        const parsedAgentIntent = AgentIntentSchema.safeParse(body)
        if (!parsedOracle.success && !parsedEtsy.success && !parsedAgentIntent.success) {
          return json({
            ok: false,
            error: `Unsupported War Room intent. Allowed local-only intents: run_oracle_scout_local, local AgentIntent body actions, prepare_product_scout_packet_local, apply_product_scout_worker_packet_local, select_etsy_candidate_local, create_shotlab_handoff_local, create_seo_packet_local, create_draft_payload_local, request_dlv_approval_local.`,
            state: getWarRoomBodyState(),
          }, { status: 400, headers: { 'cache-control': 'no-store' } })
        }
        try {
          if (parsedAgentIntent.success) {
            const state = dispatchWarRoomIntent({ ...parsedAgentIntent.data, source: parsedAgentIntent.data.source ?? 'ui' })
            return json({ ok: true, state }, { status: 200, headers: { 'cache-control': 'no-store' } })
          }
          let result
          if (parsedOracle.success) {
            result = await runOracleScoutLocalBridge(parsedOracle.data)
          } else if (parsedEtsy.success) {
            result = await runEtsyRoomLocalIntentBridge(parsedEtsy.data)
          } else {
            return json({
              ok: false,
              error: 'Unsupported War Room intent.',
              state: getWarRoomBodyState(),
            }, { status: 400, headers: { 'cache-control': 'no-store' } })
          }
          return json(result, { status: result.ok ? 200 : 400, headers: { 'cache-control': 'no-store' } })
        } catch (error) {
          return json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            state: getWarRoomBodyState(),
          }, { status: 400 })
        }
      },
    },
  },
})
