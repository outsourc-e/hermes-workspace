import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parseUtcTimestamp } from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import {
  extractActivityEvents,
  type WorkspaceAuditEntry,
  type WorkspaceTeam,
  type WorkspaceTeamMember,
} from '@/screens/projects/lib/workspace-types'

type ApprovalTier = {
  label: string
  summary: string
  toneClassName: string
}

const FALLBACK_TEAMS: WorkspaceTeam[] = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full access',
    permissions: ['workspace.admin'],
    members: [{ id: 'eric', name: 'Eric', type: 'user', avatar: '👤' }],
  },
  {
    id: 'dev',
    name: 'Dev',
    description: 'Run tasks / write files',
    permissions: ['workspace.tasks.run', 'workspace.files.write'],
    members: [
      { id: 'codex', name: 'Codex', type: 'agent', avatar: '🤖' },
      { id: 'claude', name: 'Claude', type: 'agent', avatar: '🧠' },
      { id: 'ollama', name: 'Ollama', type: 'agent', avatar: '🦙' },
    ],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description:
      'Review checkpoints · Run verification · Cannot write code · Can request revisions',
    permissions: [
      'workspace.checkpoints.review',
      'workspace.verification.run',
    ],
    members: [
      { id: 'qa-agent', name: 'QA Agent', type: 'agent', avatar: '🔍' },
      { id: 'aurora', name: 'Aurora', type: 'user', avatar: '⚡' },
    ],
  },
]

const APPROVAL_TIERS: ApprovalTier[] = [
  {
    label: 'Low risk',
    summary: 'Auto-approve',
    toneClassName: 'border-green-200 bg-green-50 text-green-700',
  },
  {
    label: 'Medium',
    summary: '1 reviewer',
    toneClassName: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  {
    label: 'High',
    summary: 'Admin required',
    toneClassName: 'border-red-200 bg-red-50 text-red-700',
  },
]

const FALLBACK_AUDIT_LOG: WorkspaceAuditEntry[] = [
  {
    id: 'audit-1',
    timestamp: '09:14',
    actor: 'Eric',
    action: 'Updated reviewer policy for production deploys',
  },
  {
    id: 'audit-2',
    timestamp: '08:52',
    actor: 'Aurora',
    action: 'Verified Codex patch on mobile setup wizard',
  },
  {
    id: 'audit-3',
    timestamp: '08:31',
    actor: 'QA Agent',
    action: 'Flagged a high-risk filesystem write for admin approval',
  },
  {
    id: 'audit-4',
    timestamp: '08:06',
    actor: 'Claude',
    action: 'Joined Dev team with write access to workspace files',
  },
  {
    id: 'audit-5',
    timestamp: '07:48',
    actor: 'Codex',
    action: 'Completed route scaffolding task and requested review',
  },
]

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function normalizeTeamMember(
  value: unknown,
  index: number,
): WorkspaceTeamMember | null {
  if (typeof value === 'string') {
    return {
      id: `member-${index}-${value}`,
      name: value,
      type: 'user',
    }
  }

  const record = asRecord(value)
  if (!record) return null

  const name = asString(record.name) ?? asString(record.label)
  if (!name) return null

  return {
    id: asString(record.id) ?? `member-${index}-${name}`,
    name,
    type: record.type === 'agent' ? 'agent' : 'user',
    avatar: asString(record.avatar),
  }
}

function normalizeTeam(value: unknown, index: number): WorkspaceTeam | null {
  const record = asRecord(value)
  if (!record) return null

  const name = asString(record.name)
  if (!name) return null

  const members = asArray(record.members)
    .map((member, memberIndex) => normalizeTeamMember(member, memberIndex))
    .filter((member): member is WorkspaceTeamMember => Boolean(member))

  return {
    id: asString(record.id) ?? `team-${index}-${name}`,
    name,
    description:
      asString(record.description) ??
      asString(record.summary) ??
      'No description available',
    permissions: asArray(record.permissions)
      .map((permission) => asString(permission))
      .filter((permission): permission is string => Boolean(permission)),
    members,
  }
}

function normalizeAuditEntry(
  value: unknown,
  index: number,
): WorkspaceAuditEntry | null {
  const record = asRecord(value)
  if (!record) return null

  const actor =
    asString(record.actor) ??
    asString(record.user_name) ??
    asString(record.agent_name) ??
    asString(record.name)
  const action =
    asString(record.action) ??
    asString(record.message) ??
    asString(record.summary) ??
    asString(record.type)
  const timestamp =
    asString(record.timestamp) ??
    asString(record.created_at) ??
    asString(record.time)

  if (!actor || !action || !timestamp) return null

  return {
    id: asString(record.id) ?? `audit-${index}-${actor}-${timestamp}`,
    timestamp,
    actor,
    action,
  }
}

function formatMemberLabel(member: WorkspaceTeamMember): string {
  return member.avatar ? `${member.avatar} ${member.name}` : member.name
}

function formatAuditTimestamp(timestamp: string): string {
  const parsed = parseUtcTimestamp(timestamp)
  if (Number.isNaN(parsed.getTime())) return timestamp

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

async function fetchWorkspaceTeams(): Promise<WorkspaceTeam[]> {
  try {
    const response = await fetch('/api/workspace/teams')
    if (!response.ok) return FALLBACK_TEAMS

    const payload = await readPayload(response)
    const record = asRecord(payload)
    const candidates = [
      payload,
      record?.teams,
      record?.data,
      record?.items,
    ]

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) continue

      const teams = candidate
        .map((entry, index) => normalizeTeam(entry, index))
        .filter((entry): entry is WorkspaceTeam => Boolean(entry))

      if (teams.length > 0) return teams
    }

    return FALLBACK_TEAMS
  } catch {
    return FALLBACK_TEAMS
  }
}

async function fetchAuditLog(): Promise<WorkspaceAuditEntry[]> {
  try {
    const response = await fetch('/api/workspace/events?type=audit&limit=10')
    if (!response.ok) return FALLBACK_AUDIT_LOG

    const payload = await readPayload(response)
    const directEntries = (Array.isArray(payload) ? payload : [])
      .map((entry, index) => normalizeAuditEntry(entry, index))
      .filter((entry): entry is WorkspaceAuditEntry => Boolean(entry))

    if (directEntries.length > 0) return directEntries

    const entries = extractActivityEvents(payload)
      .map((event) => {
        const record = asRecord(event.data)
        return normalizeAuditEntry(
          {
            id: event.id,
            timestamp: event.timestamp,
            actor:
              asString(record?.actor) ??
              asString(record?.user_name) ??
              asString(record?.agent_name) ??
              'System',
            action:
              asString(record?.action) ??
              asString(record?.message) ??
              asString(record?.summary) ??
              event.type,
          },
          0,
        )
      })
      .filter((entry): entry is WorkspaceAuditEntry => Boolean(entry))

    return entries.length > 0 ? entries : FALLBACK_AUDIT_LOG
  } catch {
    return FALLBACK_AUDIT_LOG
  }
}

function SectionCard({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-primary-200 bg-white p-4 shadow-sm md:p-5',
        className,
      )}
    >
      <h2 className="text-sm font-semibold text-primary-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function TeamsScreen() {
  const teamsQuery = useQuery({
    queryKey: ['workspace', 'teams'],
    queryFn: fetchWorkspaceTeams,
    staleTime: 30_000,
  })
  const auditLogQuery = useQuery({
    queryKey: ['workspace', 'audit-log'],
    queryFn: fetchAuditLog,
    staleTime: 30_000,
  })

  const teams = teamsQuery.data ?? FALLBACK_TEAMS
  const auditLog = auditLogQuery.data ?? FALLBACK_AUDIT_LOG

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
        <header className="rounded-xl border border-primary-200 bg-primary-50/80 px-4 py-4 shadow-sm md:px-5">
          <h1 className="text-xl font-bold text-primary-900 md:text-2xl">
            Teams &amp; Roles
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-primary-500">
            Workspace permissions, approval thresholds, and review activity for
            the current operator roster.
          </p>
        </header>

        <SectionCard title="Teams">
          {teamsQuery.isLoading ? (
            <p className="mb-4 text-sm text-primary-500">Loading...</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <article
                key={team.id}
                className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-primary-900">
                      {team.name}
                    </h3>
                    <p className="mt-1 text-sm text-primary-500">
                      {team.description}
                    </p>
                  </div>
                  <span className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-600">
                    {team.members.length} member{team.members.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {team.members.map((member) => (
                    <span
                      key={member.id}
                      className="rounded-full border border-primary-200 bg-white px-3 py-1.5 text-sm text-primary-700"
                    >
                      {formatMemberLabel(member)}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Approval Policy">
            <div className="grid gap-3 md:grid-cols-3">
              {APPROVAL_TIERS.map((tier) => (
                <div
                  key={tier.label}
                  className={cn(
                    'rounded-xl border px-4 py-4',
                    tier.toneClassName,
                  )}
                >
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em]">
                    {tier.label}
                  </p>
                  <p className="mt-2 text-base font-semibold">{tier.summary}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Audit Log">
            {auditLogQuery.isLoading ? (
              <p className="mb-4 text-sm text-primary-500">Loading...</p>
            ) : null}
            <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
              {auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-primary-500">
                      {formatAuditTimestamp(entry.timestamp)}
                    </span>
                    <span className="text-sm font-medium text-primary-800">
                      {entry.actor}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-primary-600">{entry.action}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </section>
    </main>
  )
}
