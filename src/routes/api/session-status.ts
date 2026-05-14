import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  ensureGatewayProbed,
  getConfig,
  getGatewayCapabilities,
  getSession,
  listSessions,
} from '../../server/claude-api'
import {
  isSyntheticSessionKey,
  resolveMainChatSessionId,
  shouldBindMainToPortableSession,
} from '../../server/session-utils'
import { getLocalSession } from '../../server/local-session-store'
import { getActiveRunForSession } from '../../server/run-store'
import { isAuthenticated } from '@/server/auth-middleware'
import { readContextUsage } from '@/server/context-usage'

function estimateTokensFromText(text: string): number {
  const chars = text.trim().length
  return chars > 0 ? Math.max(1, Math.ceil(chars / 4)) : 0
}

export const Route = createFileRoute('/api/session-status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        await ensureGatewayProbed()
        try {
          const capabilities = getGatewayCapabilities()
          if (!capabilities.sessions) {
            return json({
              ok: true,
              payload: {
                status: 'idle',
                sessionKey: 'new',
                sessionLabel: '',
                model: '',
                modelProvider: '',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                sessions: [],
              },
            })
          }
          const url = new URL(request.url)
          const requestedKey = url.searchParams.get('sessionKey')?.trim() || ''
          let sessionKey = requestedKey || 'main'
          const pinPortableMain = shouldBindMainToPortableSession({
            sessionKey,
            dashboardAvailable: capabilities.dashboard.available,
            enhancedChat: capabilities.enhancedChat,
          })

          if (sessionKey === 'new') {
            const contextUsage = await readContextUsage('new')
            return json({
              ok: true,
              payload: {
                status: 'idle',
                sessionKey: 'new',
                sessionLabel: '',
                model: contextUsage.model,
                modelProvider: '',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                contextPercent: contextUsage.contextPercent,
                maxTokens: contextUsage.maxTokens,
                usedTokens: contextUsage.usedTokens,
                sessions: [],
              },
            })
          }

          if (sessionKey === 'main' && !pinPortableMain) {
            try {
              const sessions = await listSessions(30, 0)
              const candidate = resolveMainChatSessionId(sessions)
              if (candidate) {
                sessionKey = candidate
              }
            } catch {
              // Fall through to local/synthetic handling below.
            }
          }

          if (pinPortableMain) {
            const contextUsage = await readContextUsage('main')
            const localMain = getLocalSession('main')
            const activeRun = await getActiveRunForSession('main')
            const outputTokens = estimateTokensFromText(activeRun?.assistantText ?? '')
            return json({
              ok: true,
              payload: {
                status: activeRun ? activeRun.status : 'idle',
                sessionKey: 'main',
                sessionLabel: localMain?.title ?? '',
                model: localMain?.model ?? contextUsage.model,
                modelProvider: 'portable',
                inputTokens: contextUsage.usedTokens,
                outputTokens,
                totalTokens: contextUsage.usedTokens + outputTokens,
                contextPercent: contextUsage.contextPercent,
                maxTokens: contextUsage.maxTokens,
                usedTokens: contextUsage.usedTokens,
                sessions: [],
              },
            })
          }

          const localSession = getLocalSession(sessionKey)
          if (localSession) {
            const contextUsage = await readContextUsage(sessionKey)
            const activeRun = await getActiveRunForSession(sessionKey)
            const outputTokens = estimateTokensFromText(activeRun?.assistantText ?? '')
            return json({
              ok: true,
              payload: {
                status: activeRun ? activeRun.status : 'idle',
                sessionKey,
                sessionLabel: localSession.title ?? '',
                model: localSession.model ?? contextUsage.model,
                modelProvider: 'local',
                inputTokens: contextUsage.usedTokens,
                outputTokens,
                totalTokens: contextUsage.usedTokens + outputTokens,
                contextPercent: contextUsage.contextPercent,
                maxTokens: contextUsage.maxTokens,
                usedTokens: contextUsage.usedTokens,
                sessions: [],
              },
            })
          }

          if (isSyntheticSessionKey(sessionKey)) {
            const contextUsage = await readContextUsage(sessionKey)
            return json({
              ok: true,
              payload: {
                status: 'idle',
                sessionKey,
                sessionLabel: '',
                model: contextUsage.model,
                modelProvider: '',
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                contextPercent: contextUsage.contextPercent,
                maxTokens: contextUsage.maxTokens,
                usedTokens: contextUsage.usedTokens,
                sessions: [],
              },
            })
          }

          const session = await getSession(sessionKey)
          const config = capabilities.config
            ? await getConfig()
            : ({ model: '', provider: '' } as const)

          const inputTokens = session.input_tokens ?? 0
          const outputTokens = session.output_tokens ?? 0
          const contextUsage = await readContextUsage(session.id)

          return json({
            ok: true,
            payload: {
              status: session.ended_at ? 'ended' : 'idle',
              sessionKey: session.id,
              sessionLabel: session.title ?? '',
              model: session.model ?? config.model ?? '',
              modelProvider: config.provider ?? '',
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              contextPercent: contextUsage.contextPercent,
              maxTokens: contextUsage.maxTokens,
              usedTokens: contextUsage.usedTokens,
              sessions: [
                {
                  key: session.id,
                  agentId: session.id,
                  label: session.title ?? session.id,
                  model: session.model ?? config.model ?? '',
                  modelProvider: config.provider ?? '',
                  updatedAt: session.last_active ?? session.started_at ?? 0,
                  usage: {
                    input: inputTokens,
                    output: outputTokens,
                  },
                },
              ],
            },
          })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
