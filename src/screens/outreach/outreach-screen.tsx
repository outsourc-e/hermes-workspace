'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowRight01Icon,
  Building01Icon,
  Calendar01Icon,
  Money01Icon,
  Mail01Icon,
  Search01Icon,
  Target01Icon,
  UserIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import {
  PIPELINE_STAGES,
  PRIORITY_COLORS,
  formatCurrency,
  formatRelativeDate,
  getLeadsByStage,
  getPipelineStats,
  type LeadPriority,
  type OutreachActivity,
  type OutreachLead,
  type PipelineStage,
} from '@/lib/outreach-data'
import { useQuery } from '@tanstack/react-query'

// --- Stat Card ---

function StatCard({
  icon,
  label,
  value,
  subValue,
  accentColor,
}: {
  icon: typeof UserIcon
  label: string
  value: string | number
  subValue?: string
  accentColor?: string
}) {
  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 flex items-start gap-3">
      <div
        className="flex items-center justify-center rounded-lg size-10 shrink-0"
        style={{
          background: accentColor
            ? `${accentColor}18`
            : 'var(--theme-hover)',
        }}
      >
        <HugeiconsIcon
          icon={icon}
          size={20}
          className="text-[var(--theme-accent)]"
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[var(--theme-muted)]">{label}</p>
        <p className="text-xl font-semibold text-[var(--theme-text)] truncate">
          {value}
        </p>
        {subValue && (
          <p className="text-xs text-[var(--theme-muted)] mt-0.5">{subValue}</p>
        )}
      </div>
    </div>
  )
}

// --- Lead Card ---

function LeadCard({
  lead,
  isExpanded,
  onToggle,
}: {
  lead: OutreachLead
  isExpanded: boolean
  onToggle: () => void
}) {
  const priorityColor = PRIORITY_COLORS[lead.priority]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className={cn(
        'rounded-lg border bg-[var(--theme-card)] cursor-pointer transition-all',
        'hover:border-[var(--theme-accent)]',
        isExpanded
          ? 'border-[var(--theme-accent)]'
          : 'border-[var(--theme-border)]',
      )}
      onClick={onToggle}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-[var(--theme-text)] truncate">
                {lead.company}
              </h4>
              <span
                className="shrink-0 w-2 h-2 rounded-full"
                style={{ background: priorityColor }}
                title={`${lead.priority} priority`}
              />
            </div>
            <p className="text-xs text-[var(--theme-muted)] mt-0.5 truncate">
              {lead.contactName} · {lead.contactTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {lead.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--theme-hover)] text-[var(--theme-muted)]"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mt-2.5 text-[11px] text-[var(--theme-muted)]">
          <div className="flex items-center gap-1">
            <HugeiconsIcon icon={UserIcon} size={12} />
            <span className="capitalize">{lead.assignedAgent}</span>
          </div>
          <div className="flex items-center gap-1">
            <HugeiconsIcon icon={Calendar01Icon} size={12} />
            <span>{formatRelativeDate(lead.lastInteraction)}</span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 border-t border-[var(--theme-border)] space-y-2">
              <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)] pt-2">
                <HugeiconsIcon icon={Mail01Icon} size={13} />
                <span className="truncate">{lead.contactEmail}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)]">
                <HugeiconsIcon icon={Building01Icon} size={13} />
                <span className="truncate">{lead.website}</span>
              </div>
              {lead.estimatedValue && (
                <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)]">
                  <HugeiconsIcon icon={Money01Icon} size={13} />
                  <span>{formatCurrency(lead.estimatedValue)} ACV</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)]">
                <HugeiconsIcon icon={Target01Icon} size={13} />
                <span>Source: {lead.source}</span>
              </div>
              <p className="text-xs text-[var(--theme-muted)] leading-relaxed mt-1">
                {lead.notes}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// --- Pipeline Column ---

function PipelineColumn({
  stage,
  leads,
  expandedId,
  onToggleExpand,
}: {
  stage: (typeof PIPELINE_STAGES)[number]
  leads: Array<OutreachLead>
  expandedId: string | null
  onToggleExpand: (id: string) => void
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] min-w-[220px] w-full shrink-0 flex-1">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--theme-border)] rounded-t-xl"
        style={{
          borderTopWidth: 2,
          borderTopColor: stage.color,
          borderTopStyle: 'solid',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: stage.color }}
          />
          <span className="text-xs font-semibold text-[var(--theme-text)]">
            {stage.label}
          </span>
          <span className="text-xs text-[var(--theme-muted)]">
            ({leads.length})
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 flex-1 overflow-y-auto min-h-[60px]">
        <AnimatePresence initial={false}>
          {leads.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-6 gap-1 text-[var(--theme-muted)] opacity-50"
            >
              <p className="text-[11px]">No leads</p>
            </motion.div>
          ) : (
            leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                isExpanded={expandedId === lead.id}
                onToggle={() => onToggleExpand(lead.id)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// --- Activity Item ---

function ActivityItem({ activity }: { activity: OutreachActivity }) {
  const typeIcons: Record<OutreachActivity['type'], typeof Mail01Icon> = {
    email_sent: Mail01Icon,
    email_opened: Mail01Icon,
    call_made: UserIcon,
    meeting_scheduled: Calendar01Icon,
    proposal_sent: Target01Icon,
    proposal_viewed: Target01Icon,
    follow_up: ArrowRight01Icon,
    note_added: Add01Icon,
  }

  const typeLabels: Record<string, string> = {
    email_sent: 'Email sent',
    email_opened: 'Email opened',
    call_made: 'Call made',
    meeting_scheduled: 'Meeting scheduled',
    proposal_sent: 'Proposal sent',
    proposal_viewed: 'Proposal viewed',
    follow_up: 'Follow-up',
    note_added: 'Note added',
  }

  const Icon = typeIcons[activity.type] ?? Mail01Icon

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--theme-border)] last:border-b-0">
      <div className="flex items-center justify-center rounded-full size-7 shrink-0 bg-[var(--theme-hover)]">
        <HugeiconsIcon icon={Icon} size={13} className="text-[var(--theme-muted)]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--theme-text)]">
            {typeLabels[activity.type]}
          </span>
          <span className="text-[10px] text-[var(--theme-muted)]">
            {formatRelativeDate(activity.timestamp)}
          </span>
        </div>
        <p className="text-[11px] text-[var(--theme-muted)] mt-0.5 truncate">
          {activity.leadCompany}
        </p>
        <p className="text-[11px] text-[var(--theme-muted)] mt-0.5 leading-relaxed">
          {activity.description}
        </p>
        <p className="text-[10px] text-[var(--theme-muted)] mt-1 opacity-70">
          by {activity.agent}
        </p>
      </div>
    </div>
  )
}

// --- Notion CRM Lead type (subset of fields we display) ---

interface NotionCrmLead {
  id: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  website: string
  city: string
  state: string
  leadScore: number | null
  outreachStatus: string
  replyStatus: string
  dealStage: string
  recommendedPackage: string
  packageSold: string
  dealValue: number | null
  monthlyRetainer: number | null
  paymentStatus: string
  clientStage: string
  accessStatus: string
  clientHealth: string
  seoOpportunity: boolean
  aeoOpportunity: boolean
  gbpOpportunity: boolean
  followUpCount: number | null
  nextCheckIn: string
  nextReportDue: string
  reportingCadence: string
  source: string
  notes: string
  lastVerified: string
  dataConfidence: string
  recordUrl: string
}

interface NotionOutreachItem {
  id: string
  title: string
  type: string
  status: string
  relatedLeadIds: string[]
  relatedDealIds: string[]
  date: string
  nextFollowUp: string
  agent: string
  description: string
  channel: string
  recordUrl: string
  createdTime: string
}

function interactionTypeToActivityType(type: string, channel: string): OutreachActivity['type'] {
  const normalized = `${type} ${channel}`.toLowerCase()
  if (normalized.includes('proposal') && normalized.includes('view')) return 'proposal_viewed'
  if (normalized.includes('proposal')) return 'proposal_sent'
  if (normalized.includes('meeting')) return 'meeting_scheduled'
  if (normalized.includes('call')) return 'call_made'
  if (normalized.includes('follow')) return 'follow_up'
  if (normalized.includes('note')) return 'note_added'
  if (normalized.includes('open') || normalized.includes('view')) return 'email_opened'
  return 'email_sent'
}

function outreachItemToActivity(
  item: NotionOutreachItem,
  leadsById: Map<string, NotionCrmLead>,
): OutreachActivity {
  const relatedLead = item.relatedLeadIds.map((id) => leadsById.get(id)).find(Boolean)
  return {
    id: item.id,
    leadId: relatedLead?.id ?? item.relatedLeadIds[0] ?? '',
    leadCompany: relatedLead?.company || item.title || 'Notion interaction',
    type: interactionTypeToActivityType(item.type || item.status, item.channel),
    description: item.description || item.title || item.status || 'Notion outreach interaction',
    timestamp: item.date || item.nextFollowUp || item.createdTime || new Date().toISOString(),
    agent: item.agent || 'Notion',
  }
}

function crmToOutreachLead(crm: NotionCrmLead): OutreachLead {
  const stageMap: Record<string, PipelineStage> = {
    'New': 'leads',
    'Contacted': 'contacted',
    'Responded': 'responded',
    'Meeting Set': 'meeting_set',
    'Proposal Sent': 'proposal_sent',
    'Won': 'closed',
    'Lost': 'closed',
  }
  const priority: LeadPriority = (crm.dealValue ?? 0) > 20000 ? 'high' : (crm.dealValue ?? 0) > 5000 ? 'medium' : 'low'
  return {
    id: crm.id,
    company: crm.company,
    contactName: crm.contactName,
    contactEmail: crm.contactEmail,
    contactTitle: '',
    website: crm.website,
    stage: stageMap[crm.dealStage] || 'leads',
    priority,
    assignedAgent: 'orchestrator',
    lastInteraction: crm.nextCheckIn || crm.lastVerified || new Date().toISOString(),
    notes: crm.notes || '',
    tags: [crm.outreachStatus, crm.dealStage].filter(Boolean),
    estimatedValue: crm.dealValue,
    source: crm.source || 'Notion CRM',
  }
}

// --- Main Screen ---

export function OutreachScreen() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStage, setSelectedStage] = useState<PipelineStage | 'all'>('all')

  const crmQuery = useQuery({
    queryKey: ['notion', 'crm'],
    queryFn: async () => {
      const res = await fetch('/api/notion/crm')
      if (!res.ok) throw new Error('Failed to fetch CRM data')
      return res.json() as Promise<{ leads: NotionCrmLead[]; count: number }>
    },
    staleTime: 60_000,
  })

  const interactionsQuery = useQuery({
    queryKey: ['notion', 'outreach'],
    queryFn: async () => {
      const res = await fetch('/api/notion/outreach')
      if (!res.ok) throw new Error('Failed to fetch outreach interactions')
      return res.json() as Promise<{ items: NotionOutreachItem[]; count: number }>
    },
    staleTime: 60_000,
  })

  const notionLeads = crmQuery.data?.leads ?? []
  const notionInteractions = interactionsQuery.data?.items ?? []
  const leads = useMemo(() => notionLeads.map(crmToOutreachLead), [notionLeads])
  const activities = useMemo(() => {
    const leadsById = new Map(notionLeads.map((lead) => [lead.id, lead]))
    return notionInteractions
      .map((item) => outreachItemToActivity(item, leadsById))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [notionInteractions, notionLeads])
  const isLoading = crmQuery.isLoading || interactionsQuery.isLoading
  const hasNotionError = crmQuery.error || interactionsQuery.error

  const stats = useMemo(() => getPipelineStats(leads), [leads])

  const filteredLeads = useMemo(() => {
    let result = leads
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (l) =>
          l.company.toLowerCase().includes(q) ||
          l.contactName.toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (selectedStage !== 'all') {
      result = result.filter((l) => l.stage === selectedStage)
    }
    return result
  }, [searchQuery, selectedStage, leads])

  const leadsByStage = useMemo(
    () => getLeadsByStage(filteredLeads),
    [filteredLeads],
  )

  const visibleStages =
    selectedStage === 'all'
      ? PIPELINE_STAGES
      : PIPELINE_STAGES.filter((s) => s.id === selectedStage)

  return (
    <div className="min-h-full overflow-y-auto bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        {/* Header */}
        <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl font-medium text-[var(--theme-text)]">
                Outreach Pipeline
              </h1>
              <div className="flex items-center gap-2 text-xs text-[var(--theme-muted)] flex-wrap">
                {isLoading ? (
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] border-[var(--theme-border)] text-[var(--theme-muted)]">
                    Loading...
                  </span>
                ) : hasNotionError ? (
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] border-red-500/50 text-red-400">
                    Connection error
                  </span>
                ) : (
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] border-green-500/50 text-green-400">
                    Live · Notion
                  </span>
                )}
                <span>{stats.total} leads</span>
                <span>·</span>
                <span>{stats.activeOutreach} active</span>
                <span>·</span>
                <span>{stats.conversionRate}% conversion</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.location.assign('/notion')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--theme-accent)] text-white text-sm font-medium hover:opacity-90"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} />
              Browse Notion
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--theme-muted)]">
            Live data from Notion CRM / Leads ({notionLeads.length} records). Refreshes every 60s.
          </p>
        </header>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-3 text-[var(--theme-muted)]">
            <div className="w-5 h-5 border-2 border-[var(--theme-border)] border-t-[var(--theme-accent)] rounded-full animate-spin" />
            <span className="text-sm">Loading leads from Notion...</span>
          </div>
        )}

        {/* Error state */}
        {hasNotionError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
            Could not load all live Notion data. CRM and interactions will retry automatically.
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={UserMultipleIcon}
            label="Total Leads"
            value={stats.total}
            subValue={`${stats.byStage.leads.length} new`}
            accentColor="#3b82f6"
          />
          <StatCard
            icon={Target01Icon}
            label="Active Outreach"
            value={stats.activeOutreach}
            subValue={`${stats.byStage.contacted.length} contacted`}
            accentColor="#f59e0b"
          />
          <StatCard
            icon={ArrowRight01Icon}
            label="Conversion Rate"
            value={`${stats.conversionRate}%`}
            subValue={`${stats.byStage.proposal_sent.length + stats.byStage.closed.length} proposals`}
            accentColor="#a855f7"
          />
          <StatCard
            icon={Money01Icon}
            label="Pipeline Value"
            value={formatCurrency(stats.totalPipelineValue)}
            subValue={`${formatCurrency(stats.closedValue)} closed`}
            accentColor="#22c55e"
          />
        </div>

        {/* Search and Filter Bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <HugeiconsIcon
              icon={Search01Icon}
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-muted)]"
            />
            <input
              type="text"
              placeholder="Search leads by company, contact, or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] pl-9 pr-3 py-2 text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none focus:border-[var(--theme-accent)] transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedStage('all')}
              className={cn(
                'text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                selectedStage === 'all'
                  ? 'border-[var(--theme-accent)] text-[var(--theme-accent)] bg-[var(--theme-hover)]'
                  : 'border-[var(--theme-border)] text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:border-[var(--theme-accent)]',
              )}
            >
              All
            </button>
            {PIPELINE_STAGES.map((stage) => (
              <button
                key={stage.id}
                onClick={() => setSelectedStage(stage.id)}
                className={cn(
                  'text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5',
                  selectedStage === stage.id
                    ? 'border-[var(--theme-accent)] text-[var(--theme-accent)] bg-[var(--theme-hover)]'
                    : 'border-[var(--theme-border)] text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:border-[var(--theme-accent)]',
                )}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: stage.color }}
                />
                {stage.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pipeline Board + Activity Feed */}
        <div className="flex gap-4 flex-col xl:flex-row">
          {/* Pipeline Board */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-3 overflow-x-auto p-1 pb-4">
              {visibleStages.map((stage) => (
                <PipelineColumn
                  key={stage.id}
                  stage={stage}
                  leads={leadsByStage[stage.id]}
                  expandedId={expandedId}
                  onToggleExpand={(id) =>
                    setExpandedId((prev) => (prev === id ? null : id))
                  }
                />
              ))}
            </div>
          </div>

          {/* Recent Activity Sidebar */}
          <div className="w-full xl:w-[320px] shrink-0">
            <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
              <div className="px-4 py-3 border-b border-[var(--theme-border)]">
                <h3 className="text-sm font-semibold text-[var(--theme-text)]">
                  Recent Activity
                </h3>
                <p className="text-[11px] text-[var(--theme-muted)] mt-0.5">
                  Live from Notion Outreach / Interactions ({activities.length})
                </p>
              </div>
              <div className="max-h-[520px] overflow-y-auto px-4">
                {interactionsQuery.isLoading ? (
                  <div className="py-6 text-center text-xs text-[var(--theme-muted)]">
                    Loading interactions from Notion...
                  </div>
                ) : activities.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--theme-muted)]">
                    No outreach interactions yet.
                  </div>
                ) : (
                  activities.slice(0, 12).map((activity) => (
                    <ActivityItem key={activity.id} activity={activity} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
