import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  ensureGatewayProbed,
  getConfig,
  getGatewayCapabilities,
  getSession,
} from '../../server/claude-api'
import { getLocalSession } from '../../server/local-session-store'
import { getActiveRunForSession } from '../../server/run-store'
import { sessionCardService } from '../../server/session-card-service'
import type { ResolvedSessionCard } from '../../server/session-card-service'
import type { SessionCard } from '../../screens/chat/types'
import { isAuthenticated } from '@/server/auth-middleware'
import { readContextUsage } from '@/server/context-usage'

type CardUsageState =
  | 'idle'
  | 'running'
  | 'completed'
  | 'error'
  | 'pending_approval'

type ProvenSegmentUsage = {
  segmentKey: string
  model: string
  inputTokens: number
  outputTokens: number
  contextPercent: number
  maxTokens: number
  usedTokens: number
}

type CardUsageProjection = {
  cardId: string
  title: string
  canonicalSource: 'local' | 'remote'
  state: CardUsageState
  updatedAt: number
  usage: {
    model: string
    modelProvider: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    contextPercent: number
    maxTokens: number
    usedTokens: number
  }
}

type CardUsageScope = 'aggregate' | 'latest-continuation'

function estimateTokensFromText(text: string): number {
  const chars = text.trim().length
  return chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : 0
}

function cardState(card: SessionCard): CardUsageState {
  return card.activity?.state ?? 'idle'
}

function isExactCardProjection(
  resolved: ResolvedSessionCard,
): resolved is ResolvedSessionCard & {
  card: SessionCard & { canonicalSource: 'local' | 'remote' }
} {
  return (
    resolved.collection.completeness === 'complete' &&
    (resolved.card.canonicalSource === 'local' ||
      resolved.card.canonicalSource === 'remote') &&
    resolved.card.continuationSegmentKeys.length > 0
  )
}

async function readRemoteSegmentUsage(
  resolved: ResolvedSessionCard,
  segmentKey: string,
  activeTransport: 'dashboard' | 'gateway',
): Promise<ProvenSegmentUsage | null> {
  const source = resolved.sourceBySegmentKey.get(segmentKey)
  const upstreamKey = resolved.upstreamKeyBySegmentKey.get(segmentKey)
  if (
    !upstreamKey ||
    source !== activeTransport ||
    resolved.card.canonicalSource !== 'remote' ||
    resolved.card.canonicalTransport !== activeTransport
  ) {
    return null
  }

  try {
    const session = await getSession(upstreamKey)
    if (session.id !== upstreamKey) return null
    const context = await readContextUsage(upstreamKey)
    return {
      segmentKey,
      model: session.model || context.model,
      inputTokens: session.input_tokens ?? 0,
      outputTokens: session.output_tokens ?? 0,
      contextPercent: context.contextPercent,
      maxTokens: context.maxTokens,
      usedTokens: context.usedTokens,
    }
  } catch {
    return null
  }
}

async function readLocalSegmentUsage(
  resolved: ResolvedSessionCard,
  segmentKey: string,
): Promise<ProvenSegmentUsage | null> {
  const source = resolved.sourceBySegmentKey.get(segmentKey)
  const upstreamKey = resolved.upstreamKeyBySegmentKey.get(segmentKey)
  if (
    !upstreamKey ||
    source !== 'local' ||
    resolved.card.canonicalSource !== 'local'
  ) {
    return null
  }

  const session = getLocalSession(upstreamKey)
  if (!session || session.id !== upstreamKey) return null

  try {
    const context = await readContextUsage(upstreamKey)
    const activeRun = await getActiveRunForSession(upstreamKey)
    const runMatchesCard = Boolean(
      activeRun &&
      activeRun.sessionKey === upstreamKey &&
      activeRun.cardId === resolved.card.cardId &&
      activeRun.canonicalSegmentKey === segmentKey,
    )
    return {
      segmentKey,
      model: session.model ?? context.model,
      inputTokens: context.usedTokens,
      outputTokens: runMatchesCard
        ? estimateTokensFromText(activeRun?.assistantText ?? '')
        : 0,
      contextPercent: context.contextPercent,
      maxTokens: context.maxTokens,
      usedTokens: context.usedTokens,
    }
  } catch {
    return null
  }
}

async function projectCardUsage(
  resolved: ResolvedSessionCard,
  scope: CardUsageScope = 'aggregate',
): Promise<CardUsageProjection | null> {
  if (!isExactCardProjection(resolved)) return null

  const capabilities = getGatewayCapabilities()
  const activeTransport = capabilities.dashboard.available
    ? 'dashboard'
    : 'gateway'
  const segmentKeys =
    scope === 'latest-continuation'
      ? [resolved.card.canonicalSegmentKey]
      : resolved.card.continuationSegmentKeys
  const segments = await Promise.all(
    segmentKeys.map((segmentKey) =>
      resolved.card.canonicalSource === 'remote'
        ? capabilities.sessions
          ? readRemoteSegmentUsage(resolved, segmentKey, activeTransport)
          : Promise.resolve(null)
        : readLocalSegmentUsage(resolved, segmentKey),
    ),
  )
  const provenSegments = segments.filter(
    (segment): segment is ProvenSegmentUsage => segment !== null,
  )
  const canonicalUsage = provenSegments.find(
    (segment) => segment.segmentKey === resolved.card.canonicalSegmentKey,
  )

  let configuredModel = ''
  let modelProvider = ''
  if (
    resolved.card.canonicalSource === 'remote' &&
    provenSegments.length > 0 &&
    capabilities.config
  ) {
    try {
      const config = await getConfig()
      configuredModel = config.model ?? ''
      modelProvider = config.provider ?? ''
    } catch {
      // A Card projection remains valid without optional global model metadata.
    }
  }

  const inputTokens = provenSegments.reduce(
    (total, segment) => total + segment.inputTokens,
    0,
  )
  const outputTokens = provenSegments.reduce(
    (total, segment) => total + segment.outputTokens,
    0,
  )

  return {
    cardId: resolved.card.cardId,
    title: resolved.card.title,
    canonicalSource: resolved.card.canonicalSource,
    state: cardState(resolved.card),
    updatedAt: resolved.card.activity?.updatedAt ?? resolved.card.updatedAt,
    usage: {
      model:
        canonicalUsage?.model ??
        provenSegments.at(-1)?.model ??
        configuredModel,
      modelProvider,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      contextPercent: provenSegments.reduce(
        (maximum, segment) => Math.max(maximum, segment.contextPercent),
        0,
      ),
      maxTokens: provenSegments.reduce(
        (total, segment) => total + segment.maxTokens,
        0,
      ),
      usedTokens: provenSegments.reduce(
        (total, segment) => total + segment.usedTokens,
        0,
      ),
    },
  }
}

export const Route = createFileRoute('/api/session-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const searchParams = new URL(request.url).searchParams
        const cardId = searchParams.get('cardId')?.trim()
        if (!cardId) {
          return json({ ok: true, payload: { cards: [] } })
        }

        try {
          await ensureGatewayProbed()
          const resolved = await sessionCardService.resolveCard(cardId)
          const card = await projectCardUsage(
            resolved,
            searchParams.get('usageScope') === 'latest-continuation'
              ? 'latest-continuation'
              : 'aggregate',
          )
          if (!card) {
            return json(
              { ok: false, error: 'Card usage unavailable' },
              { status: 409 },
            )
          }
          return json({ ok: true, payload: { cards: [card] } })
        } catch {
          return json(
            { ok: false, error: 'Card usage unavailable' },
            { status: 404 },
          )
        }
      },
    },
  },
})
