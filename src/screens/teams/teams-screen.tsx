import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  parseUtcTimestamp,
  workspaceRequestJson,
} from '@/lib/workspace-checkpoints'
import { cn } from '@/lib/utils'
import {
  extractActivityEvents,
  type WorkspaceAuditEntry,
  type WorkspaceTeam,
  type WorkspaceTeamMember,
} from '@/screens/projects/lib/workspace-types'

type ApprovalTier = {
  id: string
  name: string
  minConfidence: number
  autoApprove: boolean
  requiresHuman: boolean
}

type WorkspaceTeamWithApproval = WorkspaceTeam & {
  approval_config: ApprovalTier[]
}

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

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)))
}

function getApprovalTierTone(tier: ApprovalTier): string {
  const normalizedName = tier.name.trim().toLowerCase()

  if (
    normalizedName.includes('auto') ||
    normalizedName.includes('trusted') ||
    normalizedName.includes('low') ||
    (tier.autoApprove && !tier.requiresHuman)
  ) {
    return 'border-green-200 bg-green-50 text-green-700'
  }

  if (
    normalizedName.includes('critical') ||
    normalizedName.includes('manual') ||
    normalizedName.includes('high') ||
    tier.requiresHuman
  ) {
    return 'border-red-200 bg-red-50 text-red-700'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function normalizeApprovalTier(
  value: unknown,
  index: number,
): ApprovalTier | null {
  const record = asRecord(value)
  if (!record) return null

  const name = asString(record.name)
  if (!name) return null

  return {
    id: asString(record.id) ?? `tier-${index}-${name}`,
    name,
    minConfidence: clampPercentage(asNumber(record.minConfidence) ?? 0),
    autoApprove: record.autoApprove === true,
    requiresHuman: record.requiresHuman === true,
  }
}

function normalizeTeamWithApproval(
  value: unknown,
  index: number,
): WorkspaceTeamWithApproval | null {
  const team = normalizeTeam(value, index)
  if (!team) return null

  const record = asRecord(value)
  const approvalConfig = asArray(record?.approval_config)
    .map((entry, tierIndex) => normalizeApprovalTier(entry, tierIndex))
    .filter((entry): entry is ApprovalTier => Boolean(entry))

  return {
    ...team,
    approval_config: approvalConfig,
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

async function fetchWorkspaceTeams(): Promise<WorkspaceTeamWithApproval[]> {
  const response = await fetch('/api/workspace/teams')
  const payload = await readPayload(response)

  if (!response.ok) {
    const record = asRecord(payload)
    throw new Error(
      asString(record?.error) ??
        asString(record?.message) ??
        `Request failed with status ${response.status}`,
    )
  }

  const record = asRecord(payload)
  const candidates = [payload, record?.teams, record?.data, record?.items]

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue

    const teams = candidate
      .map((entry, index) => normalizeTeamWithApproval(entry, index))
      .filter((entry): entry is WorkspaceTeamWithApproval => Boolean(entry))

    if (teams.length > 0) return teams
  }

  return []
}

async function updateApprovalConfig(
  teamId: string,
  tiers: ApprovalTier[],
): Promise<WorkspaceTeamWithApproval> {
  const payload = await workspaceRequestJson(
    `/api/workspace/teams/${encodeURIComponent(teamId)}/approval-config`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tiers }),
    },
  )

  return (
    normalizeTeamWithApproval(payload, 0) ?? {
      id: teamId,
      name: teamId,
      description: 'No description available',
      permissions: [],
      members: [],
      approval_config: tiers,
    }
  )
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
  const queryClient = useQueryClient()
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

  const [approvalDrafts, setApprovalDrafts] = useState<
    Record<string, ApprovalTier[]>
  >({})

  useEffect(() => {
    if (!teamsQuery.data) return

    setApprovalDrafts(
      Object.fromEntries(
        teamsQuery.data.map((team) => [team.id, team.approval_config ?? []]),
      ),
    )
  }, [teamsQuery.data])

  const saveApprovalMutation = useMutation({
    mutationFn: ({
      teamId,
      tiers,
    }: {
      teamId: string
      tiers: ApprovalTier[]
    }) => updateApprovalConfig(teamId, tiers),
    onSuccess: (updatedTeam) => {
      queryClient.setQueryData<WorkspaceTeamWithApproval[] | undefined>(
        ['workspace', 'teams'],
        (current) =>
          (current ?? []).map((team) =>
            team.id === updatedTeam.id ? updatedTeam : team,
          ),
      )
      setApprovalDrafts((current) => ({
        ...current,
        [updatedTeam.id]: updatedTeam.approval_config ?? [],
      }))
    },
  })

  const teams = teamsQuery.data ?? []
  const auditLog = auditLogQuery.data ?? FALLBACK_AUDIT_LOG

  function updateTierDraft(
    teamId: string,
    tierId: string,
    updater: (tier: ApprovalTier) => ApprovalTier,
  ) {
    setApprovalDrafts((current) => ({
      ...current,
      [teamId]: (current[teamId] ?? []).map((tier) =>
        tier.id === tierId ? updater(tier) : tier,
      ),
    }))
  }

  function isSavingTeam(teamId: string): boolean {
    return (
      saveApprovalMutation.isPending &&
      saveApprovalMutation.variables?.teamId === teamId
    )
  }

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto flex w-full max-w-[1480px] flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-400">
              <HugeiconsIcon icon={UserGroupIcon} size={24} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-primary-900">
                Teams
              </h1>
              <p className="mt-1 text-sm text-primary-500">
                Workspace permissions, approval thresholds, and review activity
                for the current operator roster.
              </p>
            </div>
          </div>
        </header>

        <SectionCard title="Teams">
          {teamsQuery.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`teams-skeleton-${index}`}
                  className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
                >
                  <div className="h-5 w-28 rounded bg-white" />
                  <div className="mt-3 h-4 w-full rounded bg-white" />
                  <div className="mt-2 h-4 w-3/4 rounded bg-white" />
                </div>
              ))}
            </div>
          ) : teamsQuery.isError ? (
            <p className="text-sm text-primary-600">
              Failed to load teams. {teamsQuery.error.message}
            </p>
          ) : (
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
          )}
        </SectionCard>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard title="Approval Policy">
            {teamsQuery.isPending ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div
                    key={`approval-skeleton-${index}`}
                    className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
                  >
                    <div className="h-5 w-36 rounded bg-white" />
                    <div className="mt-4 h-12 rounded bg-white" />
                    <div className="mt-3 h-12 rounded bg-white" />
                  </div>
                ))}
              </div>
            ) : teamsQuery.isError ? (
              <p className="text-sm text-primary-600">
                Failed to load approval tiers. {teamsQuery.error.message}
              </p>
            ) : (
              <div className="space-y-4">
                {teams.map((team) => {
                  const tiers = approvalDrafts[team.id] ?? []

                  return (
                    <div
                      key={team.id}
                      className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-primary-900">
                            {team.name}
                          </h3>
                          <p className="mt-1 text-sm text-primary-500">
                            Approval tiers synced from the workspace daemon.
                          </p>
                        </div>
                        <span className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-600">
                          {tiers.length} tier{tiers.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      {tiers.length === 0 ? (
                        <p className="mt-4 rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-500">
                          No approval tiers configured for this team.
                        </p>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {tiers.map((tier) => (
                            <div
                              key={tier.id}
                              className="rounded-xl border border-primary-200 bg-white px-4 py-4"
                            >
                              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_120px_140px_140px_auto] lg:items-center">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-primary-900">
                                      {tier.name}
                                    </p>
                                    <span
                                      className={cn(
                                        'rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em]',
                                        getApprovalTierTone(tier),
                                      )}
                                    >
                                      {tier.autoApprove
                                        ? 'auto'
                                        : tier.requiresHuman
                                          ? 'manual'
                                          : 'review'}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-primary-500">
                                    Confidence threshold and approval behavior.
                                  </p>
                                </div>

                                <label className="space-y-1">
                                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary-500">
                                    Min confidence
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={tier.minConfidence}
                                    onChange={(event) => {
                                      const nextValue = clampPercentage(
                                        Number(event.target.value) || 0,
                                      )
                                      updateTierDraft(team.id, tier.id, (current) => ({
                                        ...current,
                                        minConfidence: nextValue,
                                      }))
                                    }}
                                    className="h-10 w-full rounded-lg border border-primary-200 bg-white px-3 text-sm text-primary-900 outline-none transition focus:border-primary-300"
                                  />
                                </label>

                                <label className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5">
                                  <span className="text-sm text-primary-900">
                                    Auto-approve
                                  </span>
                                  <Switch
                                    checked={tier.autoApprove}
                                    onCheckedChange={(checked) => {
                                      updateTierDraft(team.id, tier.id, (current) => ({
                                        ...current,
                                        autoApprove: checked,
                                      }))
                                    }}
                                    className="focus-visible:ring-primary-300 focus-visible:ring-offset-0 data-checked:bg-accent-500 data-unchecked:bg-primary-200"
                                  />
                                </label>

                                <label className="flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-3">
                                  <input
                                    type="checkbox"
                                    checked={tier.requiresHuman}
                                    onChange={(event) => {
                                      updateTierDraft(team.id, tier.id, (current) => ({
                                        ...current,
                                        requiresHuman: event.target.checked,
                                      }))
                                    }}
                                    className="size-4 rounded border border-primary-300 accent-accent-500"
                                  />
                                  <span className="text-sm text-primary-900">
                                    Requires human
                                  </span>
                                </label>

                                <Button
                                  variant="outline"
                                  className="border-primary-200 bg-white text-primary-900 hover:bg-primary-50"
                                  disabled={isSavingTeam(team.id)}
                                  onClick={() => {
                                    void saveApprovalMutation.mutateAsync({
                                      teamId: team.id,
                                      tiers,
                                    })
                                  }}
                                >
                                  {isSavingTeam(team.id) ? 'Saving...' : 'Save'}
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {saveApprovalMutation.isError &&
                      saveApprovalMutation.variables?.teamId === team.id ? (
                        <p className="mt-3 text-sm text-primary-600">
                          Failed to save approval tiers.{' '}
                          {saveApprovalMutation.error.message}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Audit Log">
            {auditLogQuery.isPending ? (
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
