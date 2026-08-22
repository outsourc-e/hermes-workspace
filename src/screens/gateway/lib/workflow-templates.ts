export type WorkflowTemplate = {
  id: string
  name: string
  description: string
  icon: string
  goal: string
  tags?: string[]
  teamConfigId?: string
  tasks: Array<{
    title: string
    description?: string
  }>
  createdAt: number
  updatedAt: number
  isBuiltIn?: boolean
}

const STORAGE_KEY = 'clawsuite:workflow-templates'

// Built-in templates that ship with ClawSuite
export const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'tpl-code-review',
    name: 'Code Review',
    description: 'Review codebase for bugs, performance issues, and code quality',
    icon: '🔍',
    goal: 'Review the codebase for bugs, performance issues, and code quality improvements',
    tags: ['review', 'quality', 'audit'],
    tasks: [
      { title: 'Read all source files and understand architecture' },
      { title: 'Identify bugs and logic errors' },
      { title: 'Check for security vulnerabilities' },
      { title: 'Suggest code quality improvements' },
      { title: 'Write summary report with prioritized findings' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-bug-fix',
    name: 'Bug Fix',
    description: 'Diagnose and fix a specific bug with tests',
    icon: '🐛',
    goal: 'Investigate the reported bug, identify the root cause, implement a fix, and verify it works. Write tests if appropriate.',
    tasks: [
      { title: 'Reproduce the bug and understand the symptoms' },
      { title: 'Trace the code path to find root cause' },
      { title: 'Implement the fix' },
      { title: 'Run type check (npx tsc --noEmit)' },
      { title: 'Commit with descriptive message' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-feature-build',
    name: 'Feature Build',
    description: 'Plan and implement a new feature end-to-end',
    icon: '🏗️',
    goal: 'Plan, implement, test, and document the new feature',
    tags: ['build', 'feature', 'implementation'],
    tasks: [
      { title: 'Analyze existing code patterns and architecture' },
      { title: 'Create new files and components' },
      { title: 'Wire up routes, state management, and API calls' },
      { title: 'Add error handling and edge cases' },
      { title: 'Run type check and fix any issues' },
      { title: 'Commit and push' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-research',
    name: 'Research & Analysis',
    description: 'Research a topic and produce a structured report',
    icon: '📊',
    goal: 'Research the given topic thoroughly. Analyze findings and produce a structured report with key insights, comparisons, and recommendations.',
    tasks: [
      { title: 'Search for relevant sources and documentation' },
      { title: 'Analyze and compare approaches' },
      { title: 'Write structured findings report' },
      { title: 'Add recommendations section' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-refactor',
    name: 'Refactor',
    description: 'Refactor code for better organization, performance, or readability',
    icon: '♻️',
    goal: 'Refactor the specified code area to improve organization, reduce complexity, and maintain existing functionality. No behavioral changes.',
    tasks: [
      { title: 'Read and understand current implementation' },
      { title: 'Identify refactoring opportunities' },
      { title: 'Implement changes incrementally' },
      { title: 'Verify no behavioral changes (type check + manual review)' },
      { title: 'Commit with clear refactoring message' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-audit',
    name: 'Security Audit',
    description: 'Audit codebase for security vulnerabilities and best practices',
    icon: '🛡️',
    goal: 'Perform a security audit of the codebase. Check for common vulnerabilities (XSS, injection, auth bypass, secrets exposure, dependency issues). Produce a severity-ranked report.',
    tasks: [
      { title: 'Scan for hardcoded secrets and API keys' },
      { title: 'Check input validation and sanitization' },
      { title: 'Review authentication and authorization flows' },
      { title: 'Check dependency vulnerabilities' },
      { title: 'Write security audit report with severity ratings' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
  {
    id: 'tpl-waba-winback',
    name: 'WhatsApp Win-Back (Bonvoice)',
    description: 'Recurring 5-day WABA win-back for newly-lost Bitrix leads. Human approval required before any send.',
    icon: '💬',
    goal: [
      'Run the recurring WhatsApp (WABA) win-back campaign for Bonvoice on newly-lost Bitrix leads, executed every 5 days via Pinnacle (dashboard msg.bonvoice.com, API api.msg.bonvoice.com).',
      'Scope: NEWLY-lost leads only each run (not the backlog, not a re-blast) across 5 segments by lost-reason field UF_CRM_1741004117:',
      'Not Interested (131), Future DP (129), Custom Requirements (139), Pricing Issue (133), Taken from competitor (135). EXCLUDE Bad Data (141) and Duplicate (137).',
      'HARD SAFETY RULES: (1) Never send any WhatsApp message without explicit human approval — stop at the approval gate and present the batch. (2) Confirm opt-in / compliance before any send. (3) Dedup so no lead is ever messaged twice. (4) Never write secret values into notes.',
      'Open dependencies to confirm before sending: Pinnacle API creds (or UI-only); live sender number (confirm +91 9567855779 vs +91 79 4635 0518); 5 approved WABA marketing templates; 5 posters + final copy; opt-in confirmation.',
    ].join('\n'),
    tags: ['whatsapp', 'winback', 'campaign', 'bonvoice', 'lifecycle'],
    tasks: [
      { title: 'Strategy: confirm segments (131/129/139/133/135), newly-lost-only cadence, kill criteria, and the opt-in/compliance gate; freeze scope before execution', description: 'Routes to marketing-strategy. Human sign-off required. No sends result from this task.' },
      { title: 'Lifecycle: pull newly-lost leads from Bitrix (crm.lead.list, STATUS_SEMANTIC_ID=F, UF_CRM_1741004117 in [131,129,139,133,135], modified within last 5 days); select PHONE+NAME+reason; dedup against the messaged store', description: 'Live Bitrix pull each cycle — NO manual export. Build/maintain the dedup store.' },
      { title: 'Content: draft 5 WABA marketing templates (image header + body + buttons) and 5 posters + copy, one per segment; queue for WhatsApp template approval', description: 'Draft only (Tier 0). Brand assets needed. Approve templates once, then reuse.' },
      { title: 'Lifecycle: route each lead lost-reason to its matching approved Pinnacle template; assemble the sendable batch per segment — DO NOT SEND', description: 'Produces the batch manifest for review. No external send.' },
      { title: 'APPROVAL GATE (human): present per-segment batch + templates + posters + counts for sign-off; block until approved', description: 'external-send is greenlight-gated. Nothing sends before this passes.' },
      { title: 'Lifecycle: on approval only, send via Pinnacle API (fallback UI automation); track sent + retry failures; update dedup/messaged store', description: 'Runs strictly after the approval gate. Idempotent against the dedup store.' },
      { title: 'Revenue Enablement: phase-2 enrichment — pull VOXIMPLANT_CALL recordings (crm.activity.list, FILES[].url), STT transcribe, mine objections to sharpen lost-reason segmentation', description: 'voximplant.statistic.get is empty — use crm.activity.list. STT choice is an open dependency.' },
      { title: 'Lifecycle: wire inbound-reply webhook to AI-draft response (Hermes) then human approve before any reply is sent', description: 'AI-draft-then-approve. No autonomous public replies.' },
      { title: 'KM: write a handoff/status note — what ran, counts sent per segment, blockers, next-cycle actions; expose no secrets', description: 'Routes to km-agent. Knowledge hygiene for the recurring cycle.' },
    ],
    createdAt: 0,
    updatedAt: 0,
    isBuiltIn: true,
  },
]

export function loadCustomTemplates(): WorkflowTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WorkflowTemplate[]
  } catch {
    return []
  }
}

export function saveCustomTemplates(templates: WorkflowTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch { /* ignore */ }
}

export function getAllTemplates(): WorkflowTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...loadCustomTemplates()]
}

export function saveAsTemplate(template: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>): WorkflowTemplate {
  const newTemplate: WorkflowTemplate = {
    ...template,
    id: `tpl-custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const existing = loadCustomTemplates()
  saveCustomTemplates([newTemplate, ...existing])
  return newTemplate
}

export function deleteTemplate(id: string): void {
  const existing = loadCustomTemplates()
  saveCustomTemplates(existing.filter((t) => t.id !== id))
}
