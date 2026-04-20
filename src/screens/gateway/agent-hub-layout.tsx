import { useMemo, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { fetchSessions, type GatewaySession } from '@/lib/gateway-api'
import type { AgentWorkingRow } from './components/agents-working-panel'
import { OfficeView } from './components/office-view'
import type { AgentHubLayoutProps } from './components/hub-constants'

export { AgentAvatar } from './components/agent-avatar'

const THEME_STYLE: CSSProperties = {
  ['--theme-bg' as string]: 'var(--color-surface)',
  ['--theme-card' as string]: 'var(--color-primary-50)',
  ['--theme-border' as string]: 'var(--color-primary-200)',
  ['--theme-text' as string]: 'var(--color-ink)',
  ['--theme-muted' as string]: 'var(--color-primary-700)',
  ['--theme-muted-2' as string]: 'var(--color-primary-600)',
  ['--theme-accent' as string]: 'var(--color-accent-500)',
  ['--theme-accent-strong' as string]: 'var(--color-accent-600)',
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime()
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function getSessionLabel(session: GatewaySession): string {
  return readText(session.label) || readText(session.title) || readText(session.friendlyId) || readText(session.key) || 'Untitled'
}

function deriveAgentRows(agents: AgentHubLayoutProps['agents'], sessions: GatewaySession[]): AgentWorkingRow[] {
  if (agents.length > 0) {
    return agents.map((agent) => {
      const session = sessions.find((s) => {
        const label = getSessionLabel(s).toLowerCase()
        return label === agent.name.toLowerCase() || label.startsWith(`${agent.name.toLowerCase()} `)
      })
      const updatedAt = readTimestamp(session?.updatedAt)
      const statusText = `${readText(session?.status)} ${readText(session?.kind)}`.toLowerCase()
      const status = !session ? 'idle'
        : /error|failed/.test(statusText) ? 'error'
        : /pause/.test(statusText) ? 'paused'
        : Date.now() - updatedAt < 120_000 ? 'active' : 'idle'

      return {
        id: agent.id,
        name: agent.name,
        modelId: readText(session?.model) || 'auto',
        status,
        lastLine: readText(session?.task) || 'Waiting for work…',
        lastAt: updatedAt || undefined,
        taskCount: 0,
        roleDescription: agent.role,
        sessionKey: readText(session?.key) || undefined,
      }
    })
  }

  // No configured agents — show recent sessions as agents in the office
  const recent = [...sessions]
    .sort((a, b) => readTimestamp(b.updatedAt) - readTimestamp(a.updatedAt))
    .slice(0, 6)

  if (recent.length === 0) {
    return [
      { id: 'placeholder-1', name: 'Nova', modelId: 'auto', status: 'idle' as const, lastLine: 'Waiting for first mission…', taskCount: 0, roleDescription: 'Worker' },
      { id: 'placeholder-2', name: 'Pixel', modelId: 'auto', status: 'idle' as const, lastLine: 'Standing by…', taskCount: 0, roleDescription: 'Worker' },
      { id: 'placeholder-3', name: 'Blaze', modelId: 'auto', status: 'idle' as const, lastLine: 'Ready to build.', taskCount: 0, roleDescription: 'Worker' },
    ]
  }

  const NAMES = ['Nova', 'Pixel', 'Blaze', 'Echo', 'Sage', 'Drift']
  return recent.map((session, i) => {
    const updatedAt = readTimestamp(session.updatedAt)
    const statusText = `${readText(session.status)} ${readText(session.kind)}`.toLowerCase()
    const status = /error|failed/.test(statusText) ? 'error' as const
      : /pause/.test(statusText) ? 'paused' as const
      : Date.now() - updatedAt < 120_000 ? 'active' as const : 'idle' as const

    return {
      id: readText(session.key) || `session-${i}`,
      name: NAMES[i % NAMES.length],
      modelId: readText(session.model) || 'auto',
      status,
      lastLine: readText(session.task) || getSessionLabel(session),
      lastAt: updatedAt || undefined,
      taskCount: 0,
      roleDescription: readText(session.label) || 'Worker',
      sessionKey: readText(session.key) || undefined,
    }
  })
}

export function AgentHubLayout({ agents }: AgentHubLayoutProps) {
  const navigate = useNavigate()
  const sessionsQuery = useQuery({
    queryKey: ['gateway', 'sessions', 'agent-hub'],
    queryFn: async () => (await fetchSessions()).sessions ?? [],
    refetchInterval: 10_000,
  })

  const sessions = sessionsQuery.data ?? []
  const agentRows = useMemo(() => deriveAgentRows(agents, sessions), [agents, sessions])
  // Always show the office as "alive" — agents idle but present
  const hasActive = true

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--theme-bg)] text-[var(--theme-text)]" style={THEME_STYLE}>
      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col items-stretch justify-center gap-6 px-4 pb-24 md:px-6">
        <section className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-sm" style={{ height: 520 }}>
          <OfficeView
            agentRows={agentRows}
            missionRunning={hasActive}
            onViewOutput={() => void navigate({ to: '/conductor' })}
            onNewMission={() => void navigate({ to: '/conductor' })}
            processType="parallel"
            companyName="Agent Office"
            containerHeight={520}
          />
        </section>
      </main>
    </div>
  )
}
