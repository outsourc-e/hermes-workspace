import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import {
  CONTROLLED_COUNCIL_AGENT_IDS,
  runControlledCouncilRound,
  sanitizeControlledRunnerError,
} from '../../../../lib/war-room/body'
import {
  clearActiveCouncilDiscussion,
  loadCouncilDrawingBoardStore,
  markCouncilDiscussionRunning,
  recordCouncilReconsiderationRoundResult,
  recordCouncilRoundResult,
} from '../../../../lib/war-room/body/council-discussion-store'
import type { ControlledCouncilAgentId, ControlledCouncilPeerOpinion } from '../../../../lib/war-room/body'

const noStoreHeaders = { 'cache-control': 'no-store' }

export type CouncilRunRequestPayload = {
  topic: string
  includePeerVote: boolean
  agentIds?: Array<ControlledCouncilAgentId>
  previousOpinions?: Array<ControlledCouncilPeerOpinion>
  timeoutMs?: number
  discussionId?: string
  roundId?: string
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
    .filter((item) => item.generalId && (item.opinion || item.chatSummary))
    .slice(0, 12)
}

function parseCouncilTimeoutMs(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.max(5_000, Math.min(45_000, Math.round(numeric)))
}

function parseDiscussionId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.trim().replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96)
  return clean || undefined
}

export function readCouncilRunRequestPayload(body: unknown): CouncilRunRequestPayload {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const topic = safeString(input.topic) || safeString(input.operatorNote) || safeString(input.prompt)
  if (!topic) throw new Error('Council topic is required.')
  return {
    topic,
    includePeerVote: input.includePeerVote !== false,
    agentIds: parseCouncilAgentIds(input.agentIds),
    previousOpinions: parsePreviousOpinions(input.previousOpinions),
    timeoutMs: parseCouncilTimeoutMs(input.timeoutMs),
    discussionId: parseDiscussionId(input.discussionId),
    roundId: parseDiscussionId(input.roundId),
  }
}

export const Route = createFileRoute('/api/war-room/council/run')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const store = await loadCouncilDrawingBoardStore()
        return json({
          ok: true,
          state: store,
          discussions: store.discussions,
          activeDiscussionId: store.activeDiscussionId,
          generalStats: store.generalStats,
          database: 'Council Drawing Board file database',
          localOnly: true,
          usageAllowed: false,
          workerSpawnAllowed: false,
        }, { headers: noStoreHeaders })
      },
      DELETE: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        const store = await clearActiveCouncilDiscussion()
        return json({
          ok: true,
          activeDiscussionId: store.activeDiscussionId,
          stateVersion: store.stateVersion,
          localOnly: true,
          usageAllowed: false,
          workerSpawnAllowed: false,
        }, { headers: noStoreHeaders })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
        }
        try {
          const payload = readCouncilRunRequestPayload(await request.json())
          const discussionId = payload.discussionId ?? `discussion-${Date.now().toString(36)}`
          await markCouncilDiscussionRunning({ discussionId, topic: payload.topic })
          const result = await runControlledCouncilRound({
            topic: payload.topic,
            includePeerVote: payload.includePeerVote,
            agentIds: payload.agentIds,
            previousOpinions: payload.previousOpinions,
            timeoutMs: payload.timeoutMs,
            cwd: process.cwd(),
          })
          const store = payload.roundId
            ? await recordCouncilReconsiderationRoundResult({ discussionId, roundId: payload.roundId, question: payload.topic, result })
            : await recordCouncilRoundResult({ discussionId, result })
          return json({
            ...result,
            drawingBoard: {
              discussionId,
              database: 'Council Drawing Board file database',
              stateVersion: store.stateVersion,
            },
            generalStats: store.generalStats,
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
