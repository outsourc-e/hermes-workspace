import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type TeamCard = {
  name: string
  members: string[]
  summary: string
}

type ApprovalTier = {
  label: string
  summary: string
  toneClassName: string
}

type AuditEntry = {
  time: string
  actor: string
  action: string
}

const TEAM_CARDS: TeamCard[] = [
  {
    name: 'Admin',
    members: ['👤 Eric'],
    summary: 'Full access',
  },
  {
    name: 'Dev',
    members: ['🤖 Codex', '🧠 Claude', '🦙 Ollama'],
    summary: 'Run tasks / write files',
  },
  {
    name: 'Reviewer',
    members: ['🔍 QA Agent', '⚡ Aurora'],
    summary:
      'Review checkpoints · Run verification · Cannot write code · Can request revisions',
  },
]

const APPROVAL_TIERS: ApprovalTier[] = [
  {
    label: 'Low risk',
    summary: 'Auto-approve',
    toneClassName: 'border-green-400/25 bg-green-400/10 text-green-300',
  },
  {
    label: 'Medium',
    summary: '1 reviewer',
    toneClassName: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
  },
  {
    label: 'High',
    summary: 'Admin required',
    toneClassName: 'border-red-400/25 bg-red-400/10 text-red-300',
  },
]

const AUDIT_LOG: AuditEntry[] = [
  {
    time: '09:14',
    actor: 'Eric',
    action: 'Updated reviewer policy for production deploys',
  },
  {
    time: '08:52',
    actor: 'Aurora',
    action: 'Verified Codex patch on mobile setup wizard',
  },
  {
    time: '08:31',
    actor: 'QA Agent',
    action: 'Flagged a high-risk filesystem write for admin approval',
  },
  {
    time: '08:06',
    actor: 'Claude',
    action: 'Joined Dev team with write access to workspace files',
  },
  {
    time: '07:48',
    actor: 'Codex',
    action: 'Completed route scaffolding task and requested review',
  },
]

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
  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TEAM_CARDS.map((team) => (
              <article
                key={team.name}
                className="rounded-xl border border-primary-200 bg-primary-50/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-primary-900">
                      {team.name}
                    </h3>
                    <p className="mt-1 text-sm text-primary-500">
                      {team.summary}
                    </p>
                  </div>
                  <span className="rounded-full border border-primary-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary-600">
                    {team.members.length} member{team.members.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {team.members.map((member) => (
                    <span
                      key={member}
                      className="rounded-full border border-primary-200 bg-white px-3 py-1.5 text-sm text-primary-700"
                    >
                      {member}
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
            <div className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
              {AUDIT_LOG.map((entry) => (
                <div
                  key={`${entry.time}-${entry.actor}-${entry.action}`}
                  className="rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-primary-500">
                      {entry.time}
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
