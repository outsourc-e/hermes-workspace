import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  CONTROLLED_COUNCIL_AGENT_IDS,

  runControlledCouncilRound
} from '../../../../lib/war-room/body'
import type {ControlledCouncilAgentId} from '../../../../lib/war-room/body';

const noStoreHeaders = { 'cache-control': 'no-store' }

export type CouncilRunRequestPayload = {
  topic: string
  includePeerVote: boolean
  agentIds?: Array<ControlledCouncilAgentId>
  timeoutMs?: number
}

function safeString(value: unknown, max = 3_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function parseCouncilAgentIds(value: unknown): Array<ControlledCouncilAgentId> | undefined {
  if (!Array.isArray(value)) return undefined
  const allowed = new Set<ControlledCouncilAgentId>(CONTROLLED_COUNCIL_AGENT_IDS)
  const parsed = value
    .filter((item): item is ControlledCouncilAgentId => typeof item === 'string' && allowed.has(item as ControlledCouncilAgentId))
    .filter((item, index, list) => list.indexOf(item) === index)
  return parsed.length ? parsed : undefined
}

function parseCouncilTimeoutMs(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(5_000, Math.min(45_000, Math.round(numeric)))
}

export function readCouncilRunRequestPayload(body: unknown): CouncilRunRequestPayload {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const topic = safeString(input.topic) || safeString(input.operatorNote) || safeString(input.prompt)
  if (!topic) throw new Error('Council topic is required.')
  return {
    topic,
    includePeerVote: input.includePeerVote !== false,
    agentIds: parseCouncilAgentIds(input.agentIds),
    timeoutMs: parseCouncilTimeoutMs(input.timeoutMs),
  }
}

export const Route = createFileRoute('/api/war-room/council/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        try {
          const payload = readCouncilRunRequestPayload(await request.json())
          const result = await runControlledCouncilRound({
            topic: payload.topic,
            includePeerVote: payload.includePeerVote,
            agentIds: payload.agentIds,
            timeoutMs: payload.timeoutMs,
            cwd: process.cwd(),
          })
          return json(result, { headers: noStoreHeaders })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return json({
            ok: false,
            error: message,
            localOnly: true,
            usageAllowed: false,
            workerSpawnAllowed: false,
            noFakeResponses: true,
          }, { status: message.includes('required') ? 400 : 500, headers: noStoreHeaders })
        }
      },
    },
  },
})
