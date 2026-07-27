/**
 * Mock data for the Outreach Pipeline page.
 *
 * Since we don't have a dedicated outreach API yet, this module provides
 * realistic SEO/AEO business leads across pipeline stages.
 *
 * In the future, outreach items can be stored as tasks with tags like
 * 'outreach', 'lead', 'proposal' etc. via the tasks API.
 */

export type PipelineStage =
  | 'leads'
  | 'contacted'
  | 'responded'
  | 'meeting_set'
  | 'proposal_sent'
  | 'closed'

export type LeadPriority = 'high' | 'medium' | 'low'

export type OutreachLead = {
  id: string
  company: string
  contactName: string
  contactEmail: string
  contactTitle: string
  website: string
  stage: PipelineStage
  priority: LeadPriority
  assignedAgent: string
  lastInteraction: string // ISO date string
  notes: string
  tags: Array<string>
  estimatedValue: number | null // USD annual contract value
  source: string
}

export type OutreachActivity = {
  id: string
  leadId: string
  leadCompany: string
  type: 'email_sent' | 'email_opened' | 'call_made' | 'meeting_scheduled' | 'proposal_sent' | 'proposal_viewed' | 'follow_up' | 'note_added'
  description: string
  timestamp: string // ISO date string
  agent: string
}

// --- Pipeline stage metadata ---

export const PIPELINE_STAGES: Array<{
  id: PipelineStage
  label: string
  color: string
  order: number
}> = [
  { id: 'leads', label: 'Leads', color: '#6b7280', order: 0 },
  { id: 'contacted', label: 'Contacted', color: '#3b82f6', order: 1 },
  { id: 'responded', label: 'Responded', color: '#f59e0b', order: 2 },
  { id: 'meeting_set', label: 'Meeting Set', color: '#a855f7', order: 3 },
  { id: 'proposal_sent', label: 'Proposal Sent', color: '#06b6d4', order: 4 },
  { id: 'closed', label: 'Closed', color: '#22c55e', order: 5 },
]

export const STAGE_LABELS: Record<PipelineStage, string> = {
  leads: 'Leads',
  contacted: 'Contacted',
  responded: 'Responded',
  meeting_set: 'Meeting Set',
  proposal_sent: 'Proposal Sent',
  closed: 'Closed',
}

export const PRIORITY_COLORS: Record<LeadPriority, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#6b7280',
}

// --- Mock leads ---

export const MOCK_LEADS: Array<OutreachLead> = [
  {
    id: 'lead-001',
    company: 'Acme Corp',
    contactName: 'Sarah Chen',
    contactEmail: 'sarah.chen@acmecorp.com',
    contactTitle: 'VP of Engineering',
    website: 'https://acmecorp.com',
    stage: 'leads',
    priority: 'high',
    assignedAgent: 'orchestrator',
    lastInteraction: '2026-06-18T14:30:00Z',
    notes: 'Interested in SEO automation for their e-commerce platform. 50K+ products.',
    tags: ['seo', 'e-commerce', 'enterprise'],
    estimatedValue: 48000,
    source: 'LinkedIn Outreach',
  },
  {
    id: 'lead-002',
    company: 'TechFlow Inc',
    contactName: 'Marcus Johnson',
    contactEmail: 'marcus@techflow.io',
    contactTitle: 'Head of Growth',
    website: 'https://techflow.io',
    stage: 'contacted',
    priority: 'high',
    assignedAgent: 'builder',
    lastInteraction: '2026-06-17T10:15:00Z',
    notes: 'Responded positively to initial email. Wants to see a demo of AEO capabilities.',
    tags: ['aeo', 'saas', 'growth'],
    estimatedValue: 36000,
    source: 'Cold Email',
  },
  {
    id: 'lead-003',
    company: 'GreenLeaf Media',
    contactName: 'Emily Rodriguez',
    contactEmail: 'emily@greenleafmedia.com',
    contactTitle: 'Marketing Director',
    website: 'https://greenleafmedia.com',
    stage: 'responded',
    priority: 'medium',
    assignedAgent: 'strategist',
    lastInteraction: '2026-06-16T16:45:00Z',
    notes: 'Looking for content optimization. Has a blog with 200+ articles that need SEO refresh.',
    tags: ['seo', 'content', 'media'],
    estimatedValue: 24000,
    source: 'Referral',
  },
  {
    id: 'lead-004',
    company: 'DataPrime Analytics',
    contactName: 'David Kim',
    contactEmail: 'david.kim@dataprime.ai',
    contactTitle: 'CTO',
    website: 'https://dataprime.ai',
    stage: 'meeting_set',
    priority: 'high',
    assignedAgent: 'orchestrator',
    lastInteraction: '2026-06-18T09:00:00Z',
    notes: 'Meeting scheduled for June 22. Interested in AI-powered SEO for their data platform.',
    tags: ['seo', 'aeo', 'ai', 'enterprise'],
    estimatedValue: 72000,
    source: 'Conference',
  },
  {
    id: 'lead-005',
    company: 'BrightPath Health',
    contactName: 'Lisa Thompson',
    contactEmail: 'lisa@brightpath.health',
    contactTitle: 'Digital Marketing Manager',
    website: 'https://brightpath.health',
    stage: 'proposal_sent',
    priority: 'high',
    assignedAgent: 'strategist',
    lastInteraction: '2026-06-15T11:30:00Z',
    notes: 'Proposal sent for full SEO + AEO package. Decision expected by end of month.',
    tags: ['seo', 'aeo', 'healthcare'],
    estimatedValue: 60000,
    source: 'Inbound Form',
  },
  {
    id: 'lead-006',
    company: 'Nexus Robotics',
    contactName: 'James Park',
    contactEmail: 'james@nexusrobotics.com',
    contactTitle: 'CEO',
    website: 'https://nexusrobotics.com',
    stage: 'closed',
    priority: 'high',
    assignedAgent: 'orchestrator',
    lastInteraction: '2026-06-10T15:00:00Z',
    notes: 'Closed! Signed 12-month contract for SEO + AEO services. $84K ACV.',
    tags: ['seo', 'aeo', 'robotics', 'enterprise'],
    estimatedValue: 84000,
    source: 'LinkedIn Outreach',
  },
  {
    id: 'lead-007',
    company: 'CloudSync Solutions',
    contactName: 'Anna Petrov',
    contactEmail: 'anna@cloudsync.dev',
    contactTitle: 'Product Marketing Lead',
    website: 'https://cloudsync.dev',
    stage: 'leads',
    priority: 'medium',
    assignedAgent: 'builder',
    lastInteraction: '2026-06-19T08:00:00Z',
    notes: 'New lead from webinar. Interested in technical SEO for developer tools.',
    tags: ['seo', 'developer-tools', 'b2b'],
    estimatedValue: 30000,
    source: 'Webinar',
  },
  {
    id: 'lead-008',
    company: 'UrbanStyle Fashion',
    contactName: 'Rachel Green',
    contactEmail: 'rachel@urbanstyle.com',
    contactTitle: 'E-commerce Manager',
    website: 'https://urbanstyle.com',
    stage: 'contacted',
    priority: 'medium',
    assignedAgent: 'researcher',
    lastInteraction: '2026-06-18T12:00:00Z',
    notes: 'Sent follow-up with case study on fashion e-commerce SEO. Awaiting response.',
    tags: ['seo', 'e-commerce', 'fashion'],
    estimatedValue: 18000,
    source: 'Cold Email',
  },
  {
    id: 'lead-009',
    company: 'FinEdge Capital',
    contactName: 'Robert Chang',
    contactEmail: 'robert@finedge.capital',
    contactTitle: 'Head of Digital',
    website: 'https://finedge.capital',
    stage: 'responded',
    priority: 'high',
    assignedAgent: 'strategist',
    lastInteraction: '2026-06-17T14:20:00Z',
    notes: 'Very interested in AEO for financial content. Compliance review needed first.',
    tags: ['aeo', 'finance', 'compliance'],
    estimatedValue: 96000,
    source: 'Referral',
  },
  {
    id: 'lead-010',
    company: 'EduSpark Learning',
    contactName: 'Maria Santos',
    contactEmail: 'maria@eduspark.edu',
    contactTitle: 'VP Marketing',
    website: 'https://eduspark.edu',
    stage: 'meeting_set',
    priority: 'medium',
    assignedAgent: 'builder',
    lastInteraction: '2026-06-19T10:30:00Z',
    notes: 'Meeting set for June 23. Wants SEO audit for their online course platform.',
    tags: ['seo', 'education', 'saas'],
    estimatedValue: 28000,
    source: 'Inbound Form',
  },
  {
    id: 'lead-011',
    company: 'LogiTrans Global',
    contactName: 'Thomas Wright',
    contactEmail: 'thomas@logitrans.com',
    contactTitle: 'Marketing Director',
    website: 'https://logitrans.com',
    stage: 'proposal_sent',
    priority: 'medium',
    assignedAgent: 'orchestrator',
    lastInteraction: '2026-06-14T09:45:00Z',
    notes: 'Proposal sent for multilingual SEO. Competing with two other agencies.',
    tags: ['seo', 'multilingual', 'logistics'],
    estimatedValue: 42000,
    source: 'Trade Show',
  },
  {
    id: 'lead-012',
    company: 'PixelCraft Studios',
    contactName: 'Jenny Lee',
    contactEmail: 'jenny@pixelcraft.studio',
    contactTitle: 'Founder',
    website: 'https://pixelcraft.studio',
    stage: 'closed',
    priority: 'low',
    assignedAgent: 'builder',
    lastInteraction: '2026-06-08T16:00:00Z',
    notes: 'Closed! Small retainer for ongoing SEO maintenance. $12K ACV.',
    tags: ['seo', 'creative', 'small-business'],
    estimatedValue: 12000,
    source: 'Cold Email',
  },
  {
    id: 'lead-013',
    company: 'MedVance Pharmaceuticals',
    contactName: 'Dr. Alan Foster',
    contactEmail: 'alan@medvance.com',
    contactTitle: 'Chief Digital Officer',
    website: 'https://medvance.com',
    stage: 'leads',
    priority: 'high',
    assignedAgent: 'strategist',
    lastInteraction: '2026-06-19T07:30:00Z',
    notes: 'High-value prospect. Needs AEO for medical content. Long sales cycle expected.',
    tags: ['aeo', 'healthcare', 'pharma', 'enterprise'],
    estimatedValue: 120000,
    source: 'Conference',
  },
  {
    id: 'lead-014',
    company: 'SwiftDelivery',
    contactName: 'Carlos Mendez',
    contactEmail: 'carlos@swift.delivery',
    contactTitle: 'Growth Lead',
    website: 'https://swift.delivery',
    stage: 'contacted',
    priority: 'medium',
    assignedAgent: 'researcher',
    lastInteraction: '2026-06-18T15:10:00Z',
    notes: 'Initial email sent with local SEO case study. No response yet.',
    tags: ['seo', 'local', 'delivery'],
    estimatedValue: 22000,
    source: 'LinkedIn Outreach',
  },
  {
    id: 'lead-015',
    company: 'QuantumCompute',
    contactName: 'Dr. Yuki Tanaka',
    contactEmail: 'yuki@quantumcompute.io',
    contactTitle: 'VP Communications',
    website: 'https://quantumcompute.io',
    stage: 'responded',
    priority: 'high',
    assignedAgent: 'orchestrator',
    lastInteraction: '2026-06-19T11:00:00Z',
    notes: 'Responded asking for technical SEO audit proposal. Very technical audience.',
    tags: ['seo', 'aeo', 'quantum', 'deep-tech'],
    estimatedValue: 65000,
    source: 'Referral',
  },
  {
    id: 'lead-016',
    company: 'FreshBite Foods',
    contactName: 'Olivia Brown',
    contactEmail: 'olivia@freshbite.food',
    contactTitle: 'Brand Manager',
    website: 'https://freshbite.food',
    stage: 'meeting_set',
    priority: 'low',
    assignedAgent: 'builder',
    lastInteraction: '2026-06-17T13:00:00Z',
    notes: 'Meeting set for June 24. Small food brand looking for basic SEO setup.',
    tags: ['seo', 'food', 'small-business'],
    estimatedValue: 9600,
    source: 'Inbound Form',
  },
  {
    id: 'lead-017',
    company: 'SkyNet Security',
    contactName: 'Viktor Novak',
    contactEmail: 'viktor@skynet.security',
    contactTitle: 'Head of Marketing',
    website: 'https://skynet.security',
    stage: 'proposal_sent',
    priority: 'high',
    assignedAgent: 'strategist',
    lastInteraction: '2026-06-16T10:00:00Z',
    notes: 'Proposal under review. CTO is the final decision maker. Need security-focused case study.',
    tags: ['seo', 'aeo', 'security', 'enterprise'],
    estimatedValue: 78000,
    source: 'Cold Email',
  },
  {
    id: 'lead-018',
    company: 'Artisan Crafts Co',
    contactName: 'Sophie Martin',
    contactEmail: 'sophie@artisan.crafts',
    contactTitle: 'Owner',
    website: 'https://artisan.crafts',
    stage: 'closed',
    priority: 'low',
    assignedAgent: 'researcher',
    lastInteraction: '2026-06-05T14:00:00Z',
    notes: 'Closed! E-commerce SEO package. $8K ACV with quarterly reviews.',
    tags: ['seo', 'e-commerce', 'small-business'],
    estimatedValue: 8000,
    source: 'Referral',
  },
]

// --- Mock activity feed ---

export const MOCK_ACTIVITIES: Array<OutreachActivity> = [
  {
    id: 'act-001',
    leadId: 'lead-013',
    leadCompany: 'MedVance Pharmaceuticals',
    type: 'email_sent',
    description: 'Sent initial outreach email with AEO capabilities overview',
    timestamp: '2026-06-19T07:30:00Z',
    agent: 'strategist',
  },
  {
    id: 'act-002',
    leadId: 'lead-007',
    leadCompany: 'CloudSync Solutions',
    type: 'note_added',
    description: 'Added lead from webinar attendee list. Interested in technical SEO.',
    timestamp: '2026-06-19T08:00:00Z',
    agent: 'builder',
  },
  {
    id: 'act-003',
    leadId: 'lead-004',
    leadCompany: 'DataPrime Analytics',
    type: 'meeting_scheduled',
    description: 'Discovery call scheduled for June 22 at 2:00 PM EST',
    timestamp: '2026-06-18T09:00:00Z',
    agent: 'orchestrator',
  },
  {
    id: 'act-004',
    leadId: 'lead-015',
    leadCompany: 'QuantumCompute',
    type: 'email_opened',
    description: 'Opened initial outreach email and clicked through to case study',
    timestamp: '2026-06-19T11:00:00Z',
    agent: 'orchestrator',
  },
  {
    id: 'act-005',
    leadId: 'lead-010',
    leadCompany: 'EduSpark Learning',
    type: 'meeting_scheduled',
    description: 'SEO audit kickoff meeting set for June 23 at 10:00 AM EST',
    timestamp: '2026-06-19T10:30:00Z',
    agent: 'builder',
  },
  {
    id: 'act-006',
    leadId: 'lead-014',
    leadCompany: 'SwiftDelivery',
    type: 'email_sent',
    description: 'Sent local SEO case study for delivery companies',
    timestamp: '2026-06-18T15:10:00Z',
    agent: 'researcher',
  },
  {
    id: 'act-007',
    leadId: 'lead-001',
    leadCompany: 'Acme Corp',
    type: 'note_added',
    description: 'Identified as high-priority lead. 50K+ product catalog needs SEO automation.',
    timestamp: '2026-06-18T14:30:00Z',
    agent: 'orchestrator',
  },
  {
    id: 'act-008',
    leadId: 'lead-008',
    leadCompany: 'UrbanStyle Fashion',
    type: 'follow_up',
    description: 'Follow-up email sent with fashion e-commerce SEO case study',
    timestamp: '2026-06-18T12:00:00Z',
    agent: 'researcher',
  },
  {
    id: 'act-009',
    leadId: 'lead-002',
    leadCompany: 'TechFlow Inc',
    type: 'call_made',
    description: 'Discovery call completed. Very interested in AEO for SaaS content.',
    timestamp: '2026-06-17T10:15:00Z',
    agent: 'builder',
  },
  {
    id: 'act-010',
    leadId: 'lead-016',
    leadCompany: 'FreshBite Foods',
    type: 'meeting_scheduled',
    description: 'Initial consultation set for June 24 at 11:00 AM EST',
    timestamp: '2026-06-17T13:00:00Z',
    agent: 'builder',
  },
  {
    id: 'act-011',
    leadId: 'lead-009',
    leadCompany: 'FinEdge Capital',
    type: 'email_opened',
    description: 'Opened AEO proposal and requested compliance documentation',
    timestamp: '2026-06-17T14:20:00Z',
    agent: 'strategist',
  },
  {
    id: 'act-012',
    leadId: 'lead-017',
    leadCompany: 'SkyNet Security',
    type: 'proposal_sent',
    description: 'Full SEO + AEO proposal sent. $78K ACV, 12-month engagement.',
    timestamp: '2026-06-16T10:00:00Z',
    agent: 'strategist',
  },
  {
    id: 'act-013',
    leadId: 'lead-003',
    leadCompany: 'GreenLeaf Media',
    type: 'call_made',
    description: 'Follow-up call to discuss content optimization strategy',
    timestamp: '2026-06-16T16:45:00Z',
    agent: 'strategist',
  },
  {
    id: 'act-014',
    leadId: 'lead-011',
    leadCompany: 'LogiTrans Global',
    type: 'proposal_viewed',
    description: 'Proposal viewed by Marketing Director. Awaiting feedback.',
    timestamp: '2026-06-15T09:45:00Z',
    agent: 'orchestrator',
  },
  {
    id: 'act-015',
    leadId: 'lead-005',
    leadCompany: 'BrightPath Health',
    type: 'proposal_sent',
    description: 'Comprehensive SEO + AEO proposal sent. $60K ACV.',
    timestamp: '2026-06-15T11:30:00Z',
    agent: 'strategist',
  },
]

// --- Helper functions ---

export function getLeadsByStage(leads: Array<OutreachLead>): Record<PipelineStage, Array<OutreachLead>> {
  const map: Record<PipelineStage, Array<OutreachLead>> = {
    leads: [],
    contacted: [],
    responded: [],
    meeting_set: [],
    proposal_sent: [],
    closed: [],
  }
  for (const lead of leads) {
    map[lead.stage].push(lead)
  }
  return map
}

export function getPipelineStats(leads: Array<OutreachLead>) {
  const total = leads.length
  const byStage = getLeadsByStage(leads)
  const activeOutreach = leads.filter(
    (l) => !['closed'].includes(l.stage),
  ).length
  const proposalsSent = byStage.proposal_sent.length + byStage.closed.length
  const conversionRate = total > 0 ? Math.round((proposalsSent / total) * 100) : 0
  const totalPipelineValue = leads
    .filter((l) => l.estimatedValue !== null && l.stage !== 'closed')
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0)
  const closedValue = byStage.closed.reduce(
    (sum, l) => sum + (l.estimatedValue ?? 0),
    0,
  )

  return {
    total,
    activeOutreach,
    conversionRate,
    totalPipelineValue,
    closedValue,
    byStage,
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
