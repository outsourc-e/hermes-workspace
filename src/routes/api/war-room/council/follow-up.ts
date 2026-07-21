import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  CONTROLLED_COUNCIL_AGENT_IDS,
  runControlledCouncilFollowUp,
  sanitizeControlledRunnerError,
} from '../../../../lib/war-room/body'
import { recordCouncilFollowUpResult } from '../../../../lib/war-room/body/council-discussion-store'
import type { ControlledCouncilAgentId, ControlledCouncilPeerOpinion } from '../../../../lib/war-room/body'

const noStoreHeaders = { 'cache-control': 'no-store' }

export type CouncilFollowUpRequestPayload = {
  topic: string
  question: string
  agentId: ControlledCouncilAgentId
  previousOpinions: Array<ControlledCouncilPeerOpinion>
  timeoutMs?: number
  discussionId?: string
  roundId?: string
}

function safeString(value: unknown, max = 3_000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function parseCouncilAgentId(value: unknown): ControlledCouncilAgentId {
  const allowed = new Set<ControlledCouncilAgentId>(CONTROLLED_COUNCIL_AGENT_IDS)
  if (typeof value === 'string' && allowed.has(value as ControlledCouncilAgentId)) return value as ControlledCouncilAgentId
  throw new Error('Valid council agentId is required.')
}

function parsePreviousOpinions(value: unknown): Array<ControlledCouncilPeerOpinion> {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      generalId: safeString(item.generalId, 80) as ControlledCouncilPeerOpinion['generalId'],
      label: safeString(item.label, 120) || 'Council general',
      chatSummary: safeString(item.chatSummary, 400),
      opinion: safeString(item.opinion, 1_200),
      vote: safeString(item.vote, 40) as ControlledCouncilPeerOpinion['vote'],
      voteReason: safeString(item.voteReason, 500),
    }))
    .filter((item) => item.generalId && item.opinion)
    .slice(0, 8)
}

function parseCouncilTimeoutMs(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(5_000, Math.min(45_000, Math.round(numeric)))
}

function parseSafeId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.trim().replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96)
  return clean || undefined
}

export function readCouncilFollowUpRequestPayload(body: unknown): CouncilFollowUpRequestPayload {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const topic = safeString(input.topic)
  const question = safeString(input.question ?? input.operatorOpinion ?? input.prompt, 1_500)
  if (!topic) throw new Error('Council topic is required.')
  if (!question) throw new Error('Council follow-up question is required.')
  return {
    topic,
    question,
    agentId: parseCouncilAgentId(input.agentId),
    previousOpinions: parsePreviousOpinions(input.previousOpinions),
    timeoutMs: parseCouncilTimeoutMs(input.timeoutMs),
    discussionId: parseSafeId(input.discussionId),
    roundId: parseSafeId(input.roundId),
  }
}

export const Route = createFileRoute('/api/war-room/council/follow-up')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        try {
          const payload = readCouncilFollowUpRequestPayload(await request.json())
          const result = await runControlledCouncilFollowUp({
            topic: payload.topic,
            question: payload.question,
            agentId: payload.agentId,
            previousOpinions: payload.previousOpinions,
            timeoutMs: payload.timeoutMs,
            cwd: process.cwd(),
          })
          if (payload.discussionId && payload.roundId) {
            await recordCouncilFollowUpResult({
              discussionId: payload.discussionId,
              roundId: payload.roundId,
              question: payload.question,
              targetAgentId: payload.agentId,
              result,
            })
          }
          return json({
            ...result,
            drawingBoard: payload.discussionId ? {
              discussionId: payload.discussionId,
              roundId: payload.roundId,
              database: 'Council Drawing Board file database',
            } : undefined,
          }, { headers: noStoreHeaders })
        } catch (error) {
          const message = sanitizeControlledRunnerError(error instanceof Error ? error.message : String(error))
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
