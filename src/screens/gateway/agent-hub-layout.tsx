import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgentHubErrorBoundary } from './components/agent-hub-error-boundary'
import { useQuery } from '@tanstack/react-query'
import { TEAM_TEMPLATES, MODEL_PRESETS, type ModelPresetId, type TeamMember, type TeamTemplateId, type AgentSessionStatusEntry } from './components/team-panel'
import { TaskBoard as _TaskBoard, type HubTask, type TaskBoardRef, type TaskStatus } from './components/task-board'
// LiveFeedPanel removed — right panel is now Live Output only
// import { LiveFeedPanel } from './components/live-feed-panel'
// MissionTimeline available for future detail views:
// import { MissionTimeline } from './components/mission-timeline'
import { AgentOutputPanel } from './components/agent-output-panel'
import { emitFeedEvent, onFeedEvent } from './components/feed-event-bus'
import { AgentsWorkingPanel as _AgentsWorkingPanel, type AgentWorkingRow, type AgentWorkingStatus } from './components/agents-working-panel'
import { OfficeView as PixelOfficeView } from './components/office-view'
import { Markdown } from '@/components/prompt-kit/markdown'
import {
  saveMissionStoreBeforeUnload,
  useMissionStore,
  type MissionArtifact,
} from '@/stores/mission-store'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { steerAgent, toggleAgentPause, fetchGatewayApprovals, resolveGatewayApproval, killAgentSession } from '@/lib/gateway-api'
import { ApprovalsBell } from './components/approvals-bell'
import { AgentWizardModal, TeamWizardModal, AddTeamModal, ProviderEditModal, ProviderLogo, PROVIDER_META, WizardModal, PROVIDER_COMMON_MODELS } from './components/config-wizards'
import {
  loadMissionHistory,
  type MissionCheckpoint,
} from './lib/mission-checkpoint'
import {
  loadApprovals,
  saveApprovals,
  addApproval,
  type ApprovalRequest,
} from './lib/approvals-store'

type AgentHubLayoutProps = {
  agents: Array<{
    id: string
    name: string
    role: string
    status: string
  }>
}

const TEAM_STORAGE_KEY = 'clawsuite:hub-team'
const TEAM_CONFIGS_STORAGE_KEY = 'clawsuite:hub-team-configs'
const MISSION_REPORTS_STORAGE_KEY = 'clawsuite-mission-reports'
const MAX_MISSION_REPORTS = 10
const ROUGH_COST_PER_1K_TOKENS_USD = 0.01

type SavedTeamConfig = {
  id: string
  name: string
  icon?: string
  description?: string
  createdAt: number
  updatedAt: number
  team: TeamMember[]
}

const TEMPLATE_MODEL_SUGGESTIONS: Record<TeamTemplateId, Array<ModelPresetId>> = {
  research: ['opus', 'sonnet', 'auto'],
  coding: ['opus', 'codex', 'sonnet'],
  content: ['opus', 'sonnet', 'flash'],
  'pc1-loop': ['pc1-coder', 'pc1-planner', 'pc1-critic'],
}

// Maps ModelPresetId → real model string for gateway. Empty string = omit (use gateway default).
const MODEL_PRESET_MAP: Record<string, string> = {
  auto: '',
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  codex: 'openai/gpt-5.3-codex',
  flash: 'google/gemini-2.5-flash',
  minimax: 'minimax/MiniMax-M2.5',
}

type GatewayModelEntry = {
  provider?: string
  id?: string
  name?: string
}

type GatewayModelsResponse = {
  ok?: boolean
  models?: GatewayModelEntry[]
}

function resolveGatewayModelId(modelId: string): string {
  if (Object.prototype.hasOwnProperty.call(MODEL_PRESET_MAP, modelId)) {
    return MODEL_PRESET_MAP[modelId] ?? ''
  }
  return modelId
}

function getModelDisplayLabel(modelId: string): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return preset.label
  const parts = modelId.split('/')
  return parts[parts.length - 1] || modelId
}

function getModelDisplayLabelFromLookup(
  modelId: string,
  gatewayModelLabelById?: Map<string, { label: string; provider: string }>,
): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return preset.label
  const gatewayModel = gatewayModelLabelById?.get(modelId)
  if (gatewayModel?.label) return gatewayModel.label
  return getModelDisplayLabel(modelId)
}

function getModelShortLabel(
  modelId: string,
  gatewayModelLabelById?: Map<string, { label: string; provider: string }>,
): string {
  if (!modelId) return 'Unknown'
  const preset = MODEL_PRESETS.find((entry) => entry.id === modelId)
  if (preset) return OFFICE_MODEL_LABEL[preset.id]
  const gatewayModel = gatewayModelLabelById?.get(modelId)
  if (gatewayModel?.label) return gatewayModel.label

  const parts = modelId.split('/')
  return parts[parts.length - 1] || modelId
}

type AgentActivityEntry = {
  lastLine?: string
  lastAt?: number
  lastEventType?: 'tool' | 'assistant' | 'system'
}

type MissionTaskStats = {
  total: number
  completed: number
  failed: number
}

type MissionAgentSummary = {
  agentId: string
  agentName: string
  modelId: string
  lines: string[]
}

type MissionReportPayload = {
  missionId: string
  name?: string
  goal: string
  teamName: string
  startedAt: number
  completedAt: number
  team: TeamMember[]
  tasks: HubTask[]
  artifacts: MissionArtifact[]
  tokenCount: number
  agentSummaries: MissionAgentSummary[]
  needsEnrichment: boolean
}

type StoredMissionReport = {
  id: string
  missionId?: string
  name?: string
  goal: string
  teamName: string
  agents: Array<{ id: string; name: string; modelId: string }>
  taskStats: MissionTaskStats
  duration: number
  tokenCount: number
  costEstimate: number
  artifacts: MissionArtifact[]
  report: string
  completedAt: number
}

type MissionBoardDraft = {
  id: string
  name: string
  goal: string
  teamConfigId: string
  teamName: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
  budgetLimit: string
  createdAt: number
}

// Example mission chips: label → textarea fill text
const EXAMPLE_MISSIONS: Array<{ label: string; text: string }> = [
  {
    label: 'Build a REST API',
    text: 'Design and implement a REST API: define endpoints, write route handlers, add authentication middleware, write tests, and document all endpoints with OpenAPI spec.',
  },
  {
    label: 'Research competitors',
    text: 'Research top 5 competitors: analyze their product features, pricing models, target markets, and customer reviews. Summarize findings and identify gaps we can exploit.',
  },
  {
    label: 'Write blog posts',
    text: 'Create a 3-part blog series: outline topics, research each subject, write drafts, add SEO keywords, and prepare a publishing schedule with social media copy.',
  },
]

type GatewayStatus = 'connected' | 'disconnected' | 'spawning'
type WizardStep = 'gateway' | 'team' | 'goal' | 'launch'

type ActiveTab = 'overview' | 'configure' | 'missions'
type ConfigSection = 'agents' | 'teams' | 'keys'

const TAB_DEFS: Array<{ id: ActiveTab; icon: string; label: string }> = [
  { id: 'overview', icon: '🏠', label: 'Overview' },
  { id: 'missions', icon: '🚀', label: 'Missions' },
  { id: 'configure', icon: '⚙️', label: 'Configure' },
]

const CONFIG_SECTIONS: Array<{ id: ConfigSection; icon: string; label: string }> = [
  { id: 'agents', icon: '🤖', label: 'Agents' },
  { id: 'teams', icon: '👥', label: 'Teams' },
  { id: 'keys', icon: '🔑', label: 'API Keys' },
]

const HUB_PAGE_TITLE_CLASS = 'text-lg font-bold text-neutral-900 dark:text-neutral-100 md:text-xl'
const HUB_SUBSECTION_TITLE_CLASS = 'text-base font-bold text-neutral-900 dark:text-white'
const HUB_CARD_LABEL_CLASS = 'text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-slate-400'
const HUB_PRIMARY_BUTTON_CLASS = 'min-h-11 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600 sm:px-4 sm:py-2 sm:text-sm'
const HUB_SECONDARY_BUTTON_CLASS = 'min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 sm:px-4 sm:py-2 sm:text-sm'
const HUB_PAGE_HEADER_CARD_CLASS = 'flex w-full items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel)] sm:px-4 sm:py-3'
const HUB_FILTER_PILL_CLASS = 'flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors whitespace-nowrap hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
const HUB_FILTER_PILL_ACTIVE_CLASS = 'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/60 dark:bg-orange-900/20 dark:text-orange-300'

const WIZARD_STEP_ORDER: WizardStep[] = ['gateway', 'team', 'goal', 'launch']

// ── Team Quick-Start Templates ──
const TEAM_QUICK_TEMPLATES: Array<{
  id: string
  label: string
  icon: string
  description: string
  templateId: string
  tier: 'budget' | 'balanced' | 'max'
  agents: string[]
}> = [
  { id: 'research-budget', label: 'Research Lite', icon: '🔬', description: 'Fast research with minimal cost', templateId: 'research', tier: 'budget', agents: ['Atlas', 'Lens'] },
  { id: 'research-max', label: 'Research Pro', icon: '🧪', description: 'Deep analysis with full team', templateId: 'research', tier: 'max', agents: ['Atlas', 'Lens', 'Cipher'] },
  { id: 'coding-budget', label: 'Dev Lite', icon: '⚡', description: 'Quick coding tasks, single agent', templateId: 'coding', tier: 'budget', agents: ['Forge'] },
  { id: 'coding-balanced', label: 'Dev Team', icon: '💻', description: 'Balanced dev team with review', templateId: 'coding', tier: 'balanced', agents: ['Forge', 'Sentinel', 'Spark'] },
  { id: 'content-balanced', label: 'Content Studio', icon: '✍️', description: 'Writing, editing, and polish', templateId: 'content', tier: 'balanced', agents: ['Scout', 'Quill', 'Polish'] },
  { id: 'full-max', label: 'Full Stack', icon: '🚀', description: 'Maximum output — all roles covered', templateId: 'coding', tier: 'max', agents: ['Forge', 'Sentinel', 'Spark', 'Atlas', 'Lens'] },
]

// ── System Prompt Templates (inspired by real model system prompts) ──
const SYSTEM_PROMPT_TEMPLATES: Array<{
  id: string
  label: string
  icon: string
  roleHint: string // 'any' | role keyword to filter by
  category: 'engineering' | 'research' | 'content' | 'ops' | 'general'
  prompt: string
}> = [
  // ── Engineering ──────────────────────────────────────────────────────────────
  {
    id: 'senior-dev',
    label: 'Senior Dev',
    icon: '💻',
    roleHint: 'cod',
    category: 'engineering',
    prompt: `You are a senior software engineer with 10+ years of experience building production systems.

Your principles:
- Write clean, idiomatic, well-tested code. No shortcuts.
- Follow existing patterns in the codebase before introducing new ones.
- Handle errors explicitly. Never silently swallow exceptions.
- Performance matters — identify bottlenecks before they become problems.
- Security is non-negotiable — validate inputs, never trust user data, audit dependencies.
- Prefer composition over inheritance. SOLID, DRY, KISS in that order.

Output format:
- Lead with the implementation, not the explanation.
- Comment WHY, not WHAT. Code should be self-documenting.
- For architecture decisions, give one recommendation with a brief rationale.
- Flag tech debt or risks inline with TODO/FIXME comments.`,
  },
  {
    id: 'code-reviewer',
    label: 'Code Reviewer',
    icon: '🔎',
    roleHint: 'review',
    category: 'engineering',
    prompt: `You are a meticulous code reviewer with deep expertise in software quality and security.

Review methodology:
1. **Security first** — identify injection, auth bypasses, sensitive data exposure, supply chain risks.
2. **Correctness** — does the code actually do what it claims? Edge cases, off-by-one errors, race conditions.
3. **Performance** — O(n²) loops, N+1 queries, unnecessary re-renders, memory leaks.
4. **Maintainability** — naming clarity, function length, coupling, test coverage.
5. **Style** — flag only when it harms readability.

Output format: Severity label [CRITICAL / MAJOR / MINOR / NIT] + file:line + issue + recommended fix.
Never just report a problem. Always suggest the fix.
Be direct. Praise only when genuinely exceptional.`,
  },
  {
    id: 'architect',
    label: 'Architect',
    icon: '🏗️',
    roleHint: 'arch',
    category: 'engineering',
    prompt: `You are a software architect specializing in scalable, maintainable system design.

Your responsibilities:
- Translate business requirements into technical architecture decisions.
- Evaluate trade-offs: build vs buy, monolith vs microservices, sync vs async.
- Design for failure — every component will fail; plan accordingly.
- Document decisions using ADR format: Context → Options → Decision → Consequences.
- Identify coupling hotspots and propose clean boundaries (domain-driven design).
- Consider operational concerns: observability, deployability, team cognitive load.

Constraints you always surface: consistency requirements, latency budgets, team skill gaps, compliance needs.
Never over-engineer. The best architecture is the simplest one that meets current needs with clear extension points.`,
  },
  {
    id: 'devops',
    label: 'DevOps/SRE',
    icon: '⚙️',
    roleHint: 'ops',
    category: 'engineering',
    prompt: `You are a DevOps/SRE engineer responsible for reliability, deployability, and operational excellence.

Core responsibilities:
- Design CI/CD pipelines that are fast, reliable, and auditable.
- Define SLIs/SLOs/SLAs. Error budgets > zero-tolerance policies.
- Implement observability: structured logs, metrics, distributed traces, alerting.
- Automate toil. If you do it twice manually, automate it.
- Disaster recovery: RTO/RPO targets, runbooks, chaos engineering.
- Infrastructure as Code — every resource tracked, versioned, reproducible.

On incidents: triage fast, communicate clearly, fix forward, blameless postmortems.
Security posture: least privilege, secrets management, network segmentation, audit trails.`,
  },
  {
    id: 'security',
    label: 'Security',
    icon: '🔐',
    roleHint: 'secur',
    category: 'engineering',
    prompt: `You are an application security engineer and penetration tester.

Your focus areas:
- OWASP Top 10: injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, vulnerable components, insufficient logging.
- Authentication & authorization: JWT pitfalls, session management, privilege escalation vectors.
- API security: rate limiting, input validation, schema enforcement, exposed endpoints.
- Supply chain: dependency auditing, typosquatting, malicious packages.
- Secrets management: hardcoded credentials, environment variable exposure, rotation policies.

Output: vulnerability + CVSS score estimate + exploit scenario + remediation.
Never water down findings. Security debt kills companies.`,
  },
  // ── Research ──────────────────────────────────────────────────────────────
  {
    id: 'researcher',
    label: 'Researcher',
    icon: '🔍',
    roleHint: 'research',
    category: 'research',
    prompt: `You are a rigorous research analyst. Your job is to gather, verify, and synthesize information into actionable intelligence.

Research methodology:
1. Define the research question precisely before searching.
2. Triangulate — never rely on a single source. Cross-reference primary and secondary sources.
3. Separate fact from opinion. Label speculative claims explicitly.
4. Identify knowledge gaps and state your confidence level.
5. Present findings in structured formats: executive summary → key findings → supporting evidence → gaps → recommendations.

Output standards:
- Cite sources with URL, date accessed, and credibility assessment.
- Use tables for comparisons. Use bullet points for lists. Use prose for narrative context.
- Flag contradictions in sources rather than silently resolving them.
- When uncertain, say "I'm uncertain" and explain what would resolve the uncertainty.`,
  },
  {
    id: 'analyst',
    label: 'Analyst',
    icon: '📊',
    roleHint: 'analy',
    category: 'research',
    prompt: `You are a quantitative analyst and business intelligence specialist.

Your analytical process:
1. Clarify the decision this analysis will inform — never analyze for its own sake.
2. Define metrics clearly. Distinguish leading vs lagging indicators.
3. Segment data to find signal. Averages hide distributions.
4. Test assumptions with data. State what would falsify your conclusion.
5. Present the "so what" — translate numbers into decisions.

Output format:
- Key insight in one sentence at the top.
- Supporting data with explicit methodology.
- Sensitivity analysis: how wrong could you be?
- Clear recommendation with confidence interval.

Avoid: correlation-as-causation, survivorship bias, p-hacking, cherry-picked windows.`,
  },
  {
    id: 'competitive-intel',
    label: 'Competitive Intel',
    icon: '🕵️',
    roleHint: 'compet',
    category: 'research',
    prompt: `You are a competitive intelligence analyst. Your job is to map the competitive landscape and surface strategic insights.

Framework:
1. **Company profile**: product, ICP, pricing, go-to-market, distribution channels.
2. **Strengths & weaknesses**: what they do well, where they're vulnerable.
3. **Strategic signals**: recent funding, hires, job postings, product releases, partnerships.
4. **Customer sentiment**: review analysis (G2, Capterra, Reddit, Twitter), support threads.
5. **Positioning gaps**: what pain points they don't address, what segments they ignore.

Output: competitor card with profile → strengths → weaknesses → strategic signals → opportunities for us.
Be specific. "Their UX is bad" is useless. "Their onboarding requires 6 steps before first value" is useful.`,
  },
  // ── Content ───────────────────────────────────────────────────────────────
  {
    id: 'writer',
    label: 'Copywriter',
    icon: '✍️',
    roleHint: 'writ',
    category: 'content',
    prompt: `You are an elite copywriter and content strategist. You write words that move people to action.

Writing principles:
- Lead with the reader's problem, not your solution.
- One idea per sentence. Short sentences create momentum.
- Active voice. Concrete nouns. Specific numbers over vague claims.
- Every paragraph must earn its place. Cut ruthlessly.
- The headline is 80% of the work. Write 10, pick the best.

Style rules:
- No jargon unless it's the reader's native language.
- No passive voice ("mistakes were made" → "we made mistakes").
- No throat-clearing openings ("In today's world…").
- End with a clear call to action that creates urgency without being desperate.

Calibrate tone to: audience sophistication, channel (email/landing page/ad/social), and desired emotion.`,
  },
  {
    id: 'content-strategist',
    label: 'Content Strategy',
    icon: '📣',
    roleHint: 'content',
    category: 'content',
    prompt: `You are a content strategist and editorial director.

Your responsibilities:
- Translate business goals into content that reaches, educates, and converts the target audience.
- Map content to the buyer journey: awareness → consideration → decision → retention.
- Develop content pillars that reinforce positioning and build authority.
- Define distribution strategy: owned, earned, paid channels for each content type.
- Measure what matters: engagement rate, time-on-page, pipeline influenced, not vanity metrics.

Output: content briefs with target persona, search intent, key message, format, CTA, and success metric.
Every piece of content should have one job. Define it before writing a word.`,
  },
  // ── Ops ───────────────────────────────────────────────────────────────────
  {
    id: 'product-manager',
    label: 'Product Manager',
    icon: '🗺️',
    roleHint: 'product',
    category: 'ops',
    prompt: `You are a seasoned product manager who builds products users love and businesses grow from.

Your operating model:
- Start with the problem, not the solution. Deeply understand the user pain.
- Write crisp PRDs: problem statement → success metrics → user stories → constraints → non-goals.
- Prioritize ruthlessly using impact/effort. Say no more than yes.
- Align stakeholders early. Surface trade-offs explicitly — never bury disagreements.
- Ship → measure → learn. Velocity matters; perfection is the enemy.

Output format:
- PRDs: one-pager max, with acceptance criteria for each user story.
- Roadmap items: hypothesis + metric + timeline + owner.
- Decision docs: context → options considered → recommendation → open questions.

Red lines: never write a spec without talking to users first.`,
  },
  {
    id: 'planner',
    label: 'Planner',
    icon: '📋',
    roleHint: 'plan',
    category: 'ops',
    prompt: `You are a strategic planner and execution specialist. You turn ambiguous goals into clear, executable plans.

Planning methodology:
1. **Scope**: Define what done looks like. Explicit non-goals prevent scope creep.
2. **Decompose**: Break goals into milestones → tasks → sub-tasks with owners and deadlines.
3. **Dependencies**: Map critical path. Identify blockers early.
4. **Risk**: For each key task, ask "what could go wrong?" Mitigation > reaction.
5. **Resource**: Match task complexity to available skills and capacity.

Output format:
- Plan as numbered task list with: task → owner → deadline → dependencies → success criterion.
- Timeline as Gantt-style milestones.
- Risk register with: risk → likelihood (H/M/L) → impact (H/M/L) → mitigation.

Check your plans: Are there any tasks with no owner? Are deadlines realistic? Are dependencies explicit?`,
  },
  // ── General ───────────────────────────────────────────────────────────────
  {
    id: 'critic',
    label: 'Critic',
    icon: '⚖️',
    roleHint: 'critic',
    category: 'general',
    prompt: `You are a rigorous quality evaluator. Your job is to find what's wrong and how to fix it.

Evaluation framework:
1. Understand intent — what was this trying to achieve?
2. Score against criteria — does it achieve the intent? On a scale, not pass/fail.
3. Identify root causes — don't just describe symptoms. Why does this fail?
4. Prescribe fixes — specific, actionable changes, not vague guidance.
5. Acknowledge strengths — but only when genuine. Empty praise is useless.

Output: verdict (1–10 with rubric) → top 3 issues with root causes → specific fixes → what would make this excellent.
Be direct. Honest feedback delivered respectfully is a gift. Sugarcoating wastes everyone's time.`,
  },
  {
    id: 'assistant',
    label: 'General',
    icon: '🤖',
    roleHint: 'any',
    category: 'general',
    prompt: `You are a highly capable AI assistant. You're thorough, honest, and direct.

Core behaviors:
- Think step-by-step for complex problems. Show your reasoning when it adds value.
- Ask one clarifying question if the request is genuinely ambiguous — don't ask for information you can infer.
- Be concise by default. Expand only when depth is needed.
- Prioritize the user's actual goal, not just the literal request.
- Disagree when you have good reason to. "Yes, and..." is fine; "Yes" when wrong is not.
- Acknowledge uncertainty. "I don't know" is better than confident confabulation.

Format rules:
- Use markdown only when it will be rendered.
- Lists for enumerable items. Prose for narrative. Tables for comparisons.
- Lead with the answer. Context and caveats follow.`,
  },
]
const CUSTOM_PROVIDER_OPTION = '__custom__'
const KNOWN_GATEWAY_PROVIDERS = [
  'openai',
  'anthropic',
  'google-antigravity',
  'google',
  'deepseek',
  'minimax',
  'openrouter',
  'mistral',
  'xai',
  'groq',
  'github-copilot',
  'ollama',
  'together',
  'fireworks',
  'perplexity',
  'cohere',
] as const


function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Fetch the actual chat history for an agent session and extract assistant messages.
 * Returns cleaned markdown lines from the agent's final responses — NOT raw SSE chunks.
 */
function normalizeHistoryAssistantMessage(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}

function dedupeProgressiveHistoryMessages(messages: string[]): string[] {
  const keptNormalized: string[] = []
  const deduped = [...messages].sort((a, b) => b.length - a.length).filter((message) => {
    const normalized = normalizeHistoryAssistantMessage(message)
    if (!normalized) return false
    const isProgressiveFragment = keptNormalized.some((existing) => existing.includes(normalized))
    if (isProgressiveFragment) return false
    keptNormalized.push(normalized)
    return true
  })

  const dedupedSet = new Set(deduped.map((message) => normalizeHistoryAssistantMessage(message)))
  return messages.filter((message) => dedupedSet.has(normalizeHistoryAssistantMessage(message)))
}

async function fetchAgentFinalOutput(sessionKey: string): Promise<string[]> {
  try {
    const response = await fetch(`/api/history?sessionKey=${encodeURIComponent(sessionKey)}&limit=100`)
    if (!response.ok) return []
    const data = await response.json() as { messages?: Array<{ role?: string; text?: string; content?: string }> }
    const messages = Array.isArray(data.messages) ? data.messages : []
    // Extract assistant messages (the actual formatted responses)
    const assistantMessages = messages
      .filter((m) => m.role === 'assistant')
      .map((m) => {
        const text = m.text || m.content || ''
        return typeof text === 'string' ? normalizeHistoryAssistantMessage(text) : ''
      })
      .filter((t) => t.length > 0)

    const completeMessages = dedupeProgressiveHistoryMessages(assistantMessages)
    const finalMessage = completeMessages.at(-1) ?? ''
    return finalMessage ? finalMessage.split('\n') : []
  } catch {
    return []
  }
}

function createMemberId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 8)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function capitalizeFirst(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length
}

function cleanMissionSegment(value: string): string {
  const normalized = value
    .replace(/^\s*[-*+]\s*/, '')
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/[.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return capitalizeFirst(normalized)
}

function extractMissionItems(goal: string): string[] {
  const rawSegments = goal
    .replace(/\r/g, '\n')
    .replace(/[•●▪◦]/g, '\n')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\b\d+\.\s+/g, '\n')
    .replace(/[.?!;]+\s*/g, '\n')
    .split('\n')
    .flatMap((line) => line.split(/,\s+|\s+\band\b\s+/gi))
    .map(cleanMissionSegment)
    .filter((segment) => segment.length > 0 && wordCount(segment) >= 3)

  const uniqueSegments: string[] = []
  const seen = new Set<string>()
  rawSegments.forEach((segment) => {
    const key = segment.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    uniqueSegments.push(segment)
  })
  return uniqueSegments
}

function parseMissionGoal(goal: string, teamMembers: TeamMember[], missionId?: string): HubTask[] {
  const trimmedGoal = goal.trim()
  if (!trimmedGoal) return []
  const now = Date.now()
  const segments = extractMissionItems(trimmedGoal)
  const normalizedGoal = cleanMissionSegment(trimmedGoal)

  // If we extracted >= 2 subtasks, return ONLY those subtasks (not the full goal as a task).
  // If 0–1 subtasks, collapse to [goal] as a single task.
  let missionItems: string[]
  if (segments.length >= 2) {
    const withoutFullGoal = segments.filter((s) => s !== normalizedGoal)
    missionItems = withoutFullGoal.length >= 1 ? withoutFullGoal : segments
  } else {
    missionItems = normalizedGoal ? [normalizedGoal] : []
  }

  return missionItems.map((segment, index) => {
    const member = teamMembers.length > 0 ? teamMembers[index % teamMembers.length] : undefined
    const createdAt = now + index
    return {
      id: createTaskId(),
      title: segment,
      description: '',
      priority: index === 0 ? 'high' : 'normal',
      status: member ? 'assigned' : 'inbox',
      agentId: member?.id,
      missionId,
      createdAt,
      updatedAt: createdAt,
    }
  })
}

function truncateMissionGoal(goal: string, max = 110): string {
  if (goal.length <= max) return goal
  return `${goal.slice(0, max - 1).trimEnd()}…`
}

function buildTeamFromTemplate(templateId: TeamTemplateId): TeamMember[] {
  const template = TEAM_TEMPLATES.find((entry) => entry.id === templateId)
  if (!template) return []

  const modelSuggestions = TEMPLATE_MODEL_SUGGESTIONS[template.id]

  return template.agents.map((agentName, index) => ({
    id: `${template.id}-${agentName}`,
    name: toTitleCase(agentName),
    avatar: getAgentAvatarForSlot(index),
    modelId: modelSuggestions[index] ?? 'auto',
    roleDescription: `${toTitleCase(agentName)} lead for this mission`,
    goal: '',
    backstory: '',
    status: 'available',
  }))
}

function buildTeamFromRuntime(
  agents: AgentHubLayoutProps['agents'],
): TeamMember[] {
  return agents.slice(0, 5).map((agent, index) => ({
    id: agent.id,
    name: agent.name,
    avatar: getAgentAvatarForSlot(index),
    modelId: 'auto',
    roleDescription: agent.role,
    goal: '',
    backstory: '',
    status: agent.status || 'available',
  }))
}

function toTeamMember(value: unknown): TeamMember | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const status = typeof row.status === 'string' ? row.status.trim() : 'available'
  const roleDescription =
    typeof row.roleDescription === 'string' ? row.roleDescription : ''
  const avatar =
    row.avatar === undefined
      ? undefined
      : normalizeAgentAvatarIndex(row.avatar)
  const goal = typeof row.goal === 'string' ? row.goal : ''
  const backstory = typeof row.backstory === 'string' ? row.backstory : ''
  const modelIdRaw = typeof row.modelId === 'string' ? row.modelId.trim() : 'auto'
  const modelId = modelIdRaw || 'auto'

  if (!id || !name) return null

  return {
    id,
    name,
    avatar,
    modelId,
    roleDescription,
    goal,
    backstory,
    status: status || 'available',
  }
}

function readStoredTeam(): TeamMember[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(TEAM_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => toTeamMember(entry))
      .filter((entry): entry is TeamMember => Boolean(entry))
  } catch {
    return []
  }
}

function toSavedTeamConfig(value: unknown): SavedTeamConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  const createdAt =
    typeof row.createdAt === 'number' ? row.createdAt : Date.now()
  const updatedAt =
    typeof row.updatedAt === 'number' ? row.updatedAt : createdAt
  const teamRaw = Array.isArray(row.team) ? row.team : []
  const team = teamRaw
    .map((entry) => toTeamMember(entry))
    .filter((entry): entry is TeamMember => Boolean(entry))

  if (!id || !name || team.length === 0) return null

  const icon = typeof row.icon === 'string' ? row.icon : undefined

  return {
    id,
    name,
    icon,
    createdAt,
    updatedAt,
    team,
  }
}

function readStoredTeamConfigs(): SavedTeamConfig[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(TEAM_CONFIGS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => toSavedTeamConfig(entry))
      .filter((entry): entry is SavedTeamConfig => Boolean(entry))
      .sort((left, right) => right.updatedAt - left.updatedAt)
  } catch {
    return []
  }
}

function suggestTemplate(goal: string): TeamTemplateId {
  const normalized = goal.toLowerCase()
  const hasAny = (keywords: string[]) =>
    keywords.some((keyword) => normalized.includes(keyword))

  if (hasAny(['coding', 'code', 'dev', 'build', 'ship', 'fix', 'bug', 'api', 'rest', 'endpoint'])) {
    return 'coding'
  }
  if (hasAny(['research', 'analyze', 'investigate', 'report', 'competitor'])) {
    return 'research'
  }
  if (hasAny(['write', 'content', 'blog', 'copy', 'edit'])) {
    return 'content'
  }
  return 'coding'
}

function resolveActiveTemplate(team: TeamMember[]): TeamTemplateId | undefined {
  return TEAM_TEMPLATES.find((template) => {
    if (team.length !== template.agents.length) return false
    return template.agents.every((agentName) =>
      team.some((member) => member.id === `${template.id}-${agentName}`),
    )
  })?.id
}

// Stored format for agent session info in localStorage (v2)
type AgentSessionInfo = {
  sessionKey: string
  model?: string
}

type SessionRecord = Record<string, unknown>

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function readSessionTokens(session: SessionRecord): number {
  const usage = session.usage as Record<string, unknown> | undefined
  if (usage && typeof usage === 'object') {
    const total = readNumber(usage.totalTokens)
    if (total > 0) return total
    const tokens = readNumber(usage.tokens)
    if (tokens > 0) return tokens
  }
  return 0
}

function readSessionCost(session: SessionRecord): number {
  const usage = session.usage as Record<string, unknown> | undefined
  if (usage && typeof usage === 'object') {
    const cost = readNumber(usage.cost)
    if (cost > 0) return cost
    const totalCost = readNumber(usage.totalCost)
    if (totalCost > 0) return totalCost
  }
  const directCost = readNumber(session.cost)
  if (directCost > 0) return directCost
  return 0
}

function readSessionModel(session: SessionRecord): string {
  return readString(session.model) || readString(session.agentModel) || ''
}

function isOAuthModel(model: string): boolean {
  return model.includes('-oauth') || model.includes('oauth/')
}

function readSessionId(session: SessionRecord): string {
  return readString(session.key) || readString(session.friendlyId)
}

function readSessionName(session: SessionRecord): string {
  return (
    readString(session.label) ||
    readString(session.displayName) ||
    readString(session.title) ||
    readString(session.friendlyId) ||
    readString(session.key)
  )
}

function readSessionLastMessage(session: SessionRecord): string {
  const record =
    session.lastMessage && typeof session.lastMessage === 'object' && !Array.isArray(session.lastMessage)
      ? (session.lastMessage as Record<string, unknown>)
      : null
  if (!record) return ''
  const directText = readString(record.text)
  if (directText) return directText
  const parts = Array.isArray(record.content) ? record.content : []
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) return ''
      return readString((part as Record<string, unknown>).text)
    })
    .filter(Boolean)
    .join(' ')
}

function readSessionActivityMarker(session: SessionRecord): string {
  const updatedAtRaw =
    typeof session.updatedAt === 'number' || typeof session.updatedAt === 'string'
      ? String(session.updatedAt)
      : ''
  const lastMessage = readSessionLastMessage(session)
  const status = readString(session.status)
  return `${updatedAtRaw}|${status}|${lastMessage}`
}

function parseSsePayload(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

/** Extract text content from a chat message object (handles string and content-block arrays). */
function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const msg = message as Record<string, unknown>
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return (msg.content as Array<Record<string, unknown>>)
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('')
  }
  return ''
}

function readEventText(payload: Record<string, unknown>): string {
  const direct = readString(payload.text) || readString(payload.content) || readString(payload.chunk)
  if (direct) return direct
  const message =
    payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)
      ? (payload.message as Record<string, unknown>)
      : null
  if (!message) return ''
  const nested = readString(message.text) || readString(message.content)
  if (nested) return nested
  const contentBlocks = Array.isArray(message.content) ? message.content : []
  return contentBlocks
    .map((block) => {
      if (!block || typeof block !== 'object' || Array.isArray(block)) return ''
      const row = block as Record<string, unknown>
      return readString(row.type) === 'text' ? readString(row.text) : ''
    })
    .filter(Boolean)
    .join('')
}

function readEventRole(payload: Record<string, unknown>): 'assistant' | 'user' | '' {
  const direct = readString(payload.role).toLowerCase()
  if (direct === 'assistant' || direct === 'user') return direct
  const message =
    payload.message && typeof payload.message === 'object' && !Array.isArray(payload.message)
      ? (payload.message as Record<string, unknown>)
      : null
  const nested = readString(message?.role).toLowerCase()
  return nested === 'assistant' || nested === 'user' ? nested : ''
}

function normalizeArtifactType(lang: string): MissionArtifact['type'] {
  const normalized = lang.toLowerCase()
  if (normalized === 'html') return 'html'
  if (normalized === 'md' || normalized === 'markdown') return 'markdown'
  if (normalized === 'txt' || normalized === 'text') return 'text'
  return 'code'
}

function extractArtifactsFromOutput(params: {
  agentId: string
  agentName: string
  text: string
  timestamp?: number
}): MissionArtifact[] {
  const { agentId, agentName, text } = params
  const timestamp = params.timestamp ?? Date.now()
  const artifacts: MissionArtifact[] = []
  const codeBlockRegex = /```([a-zA-Z0-9_-]+)?([^\n]*)\n([\s\S]*?)```/g

  for (const match of text.matchAll(codeBlockRegex)) {
    const lang = (match[1] ?? '').trim()
    const meta = match[2] ?? ''
    const content = (match[3] ?? '').trim()
    const filenameMatch = meta.match(/\bfilename=([^\s`]+)/i)
    const filename = filenameMatch?.[1]?.trim()
    if (!filename || !content) continue
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: normalizeArtifactType(lang),
      title: filename,
      content,
      timestamp,
    })
  }

  const reportPatterns = [
    {
      regex: /(^##\s+Report\b[\s\S]*?)(?=^\s*##\s+|\Z)/im,
      title: 'Report',
    },
    {
      regex: /(^#\s+Summary\b[\s\S]*?)(?=^\s*#\s+|\Z)/im,
      title: 'Summary',
    },
  ] as const

  reportPatterns.forEach(({ regex, title }) => {
    const match = text.match(regex)
    if (!match?.[1]) return
    const content = match[1].trim()
    if (!content) return
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: 'markdown',
      title: `${agentName} ${title}`,
      content,
      timestamp,
    })
  })

  return artifacts
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function computeMissionTaskStats(tasks: HubTask[]): MissionTaskStats {
  const total = tasks.length
  const completed = tasks.filter((task) => task.status === 'done' || (task.status as string) === 'completed').length
  const failed = tasks.filter((task) => (task.status as string) === 'blocked').length
  return { total, completed, failed }
}

function estimateMissionCost(tokenCount: number): number {
  return Number(((tokenCount / 1000) * ROUGH_COST_PER_1K_TOKENS_USD).toFixed(2))
}

function parseTokenBudget(value: string): number | null {
  const digits = value.replace(/[^\d]/g, '')
  if (!digits) return null
  const parsed = Number.parseInt(digits, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

/** Lines that are metadata / noise — strip from per-agent summaries. */
const METADATA_LINE_PATTERNS = [
  /^session ended/i,
  /^session aborted/i,
  /^session ended with error/i,
  /^mission complete\.?$/i,
  /^\[?TASK_COMPLETE\]?$/i,
  /^\[?DONE\]?$/i,
  /^\[?MISSION_COMPLETE\]?$/i,
  /^task \d+:/i,
  /^Dispatching to /i,
  /^Waiting for response/i,
]

function isMetadataLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  return METADATA_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/** Strip metadata lines from agent output, preserving markdown formatting. */
function cleanAgentOutputLines(lines: string[]): string[] {
  return lines.filter((line) => !isMetadataLine(line))
}

function getAgentOutputMarkdown(lines: string[]): string {
  return cleanAgentOutputLines(lines).join('\n').trim()
}

function getLongestAgentOutput(agentSummaries: MissionAgentSummary[]): string {
  const outputs = agentSummaries
    .map((summary) => getAgentOutputMarkdown(summary.lines))
    .filter((output) => output.length > 0)

  if (outputs.length === 0) return ''
  outputs.sort((a, b) => b.length - a.length)
  return outputs[0] ?? ''
}

/**
 * Extract the last meaningful prose line from agent output for card preview.
 * Filters out raw command flags, code snippets, and noise.
 * Returns "Agent working..." as fallback if no prose is found.
 */
function extractPreviewLine(lines: string[]): string {
  // Patterns that indicate a line is code/command/noise, not prose
  const CODE_LINE_PATTERNS = [
    /^\s*--\S/,              // command flags: --max-model-len
    /^\s*\$\s/,              // shell prompts: $ command
    /^\s*```/,               // fenced code blocks
    /^\s*[|+][-=+|]+/,      // table borders
    /^\s*[{}[\]]/,           // JSON/code brackets
    /^\s*#!\//,              // shebangs
    /^\s*\/\//,              // code comments
    /^\s*\*/,                // code comments (block)
    /^\s*import\s/,          // import statements
    /^\s*export\s/,          // export statements
    /^\s*const\s/,           // variable declarations
    /^\s*function\s/,        // function declarations
    /^\s*if\s*\(/,           // if statements
    /^\s*for\s*\(/,          // for loops
    /^\s*return\s/,          // return statements
    /^[A-Z_]{3,}[:=]/,      // ENV_VAR=value or CONFIG:value
    /^[a-z_]+\(/,            // function calls: someFunc(
    /^\s*\\\s*$/,            // line continuations
    /^[^\w\s]{4,}/,          // lines of mostly punctuation/symbols
    /^\s*[<>]\s/,            // diff markers or XML tags
    /^\s*\d+[.:]\d+/,       // timestamps or version numbers at start
  ]

  function isCodeOrCommand(line: string): boolean {
    const trimmed = line.trim()
    if (!trimmed) return true
    if (trimmed.length < 3) return true
    // All-caps with no spaces (likely a constant or marker)
    if (/^[A-Z_]{4,}$/.test(trimmed)) return true
    // Very short with no word characters
    if (trimmed.length < 8 && !/[a-zA-Z]{3,}/.test(trimmed)) return true
    return CODE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed))
  }

  // Walk backwards through lines to find last meaningful prose
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 30); i--) {
    const line = lines[i].trim()
    if (!line) continue
    if (isMetadataLine(line)) continue
    if (isCodeOrCommand(line)) continue
    // Must contain at least 2 word characters (basic prose check)
    if (!/\w.*\s+\w/.test(line)) continue
    // Truncate to reasonable preview length
    return line.length > 120 ? `${line.slice(0, 117)}…` : line
  }

  return 'Agent working...'
}

/**
 * Auto-detect artifacts from agent output text.
 * Finds: fenced code blocks, URLs, markdown tables.
 */
function detectArtifactsFromText(params: {
  agentId: string
  agentName: string
  lines: string[]
}): MissionArtifact[] {
  const { agentId, agentName, lines } = params
  const text = lines.join('\n')
  const artifacts: MissionArtifact[] = []
  const timestamp = Date.now()

  // Code blocks (``` fenced)
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g
  for (const match of text.matchAll(codeBlockRegex)) {
    const lang = (match[1] ?? '').trim() || 'code'
    const content = (match[2] ?? '').trim()
    if (!content || content.length < 10) continue
    const preview = content.split('\n')[0]?.slice(0, 40) ?? 'code block'
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: 'code',
      title: `${lang}: ${preview}`,
      content,
      timestamp,
    })
  }

  // URLs
  const urlRegex = /https?:\/\/[^\s)<>"]+/g
  const seenUrls = new Set<string>()
  for (const match of text.matchAll(urlRegex)) {
    const url = match[0].replace(/[.,;:!?)]+$/, '')
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: 'text',
      title: url.length > 60 ? `${url.slice(0, 57)}…` : url,
      content: url,
      timestamp,
    })
  }

  // Markdown tables (lines starting with |)
  const tableLines: string[] = []
  let inTable = false
  for (const line of lines) {
    if (/^\|/.test(line.trim())) {
      inTable = true
      tableLines.push(line)
    } else if (inTable) {
      // End of table
      if (tableLines.length >= 3) {
        artifacts.push({
          id: createTaskId(),
          agentId,
          agentName,
          type: 'text',
          title: `Table (${tableLines.length - 1} rows)`,
          content: tableLines.join('\n'),
          timestamp,
        })
      }
      tableLines.length = 0
      inTable = false
    }
  }
  // Flush final table
  if (inTable && tableLines.length >= 3) {
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: 'text',
      title: `Table (${tableLines.length - 1} rows)`,
      content: tableLines.join('\n'),
      timestamp,
    })
  }

  // Numbered recommendation lists (consecutive lines starting with "1." "2." etc.)
  const numberedLines: string[] = []
  for (const line of lines) {
    if (/^\s*\d+\.\s+/.test(line)) {
      numberedLines.push(line)
    } else if (numberedLines.length > 0) {
      if (numberedLines.length >= 3) {
        const preview = numberedLines[0].trim().slice(0, 50)
        artifacts.push({
          id: createTaskId(),
          agentId,
          agentName,
          type: 'text',
          title: `List (${numberedLines.length} items): ${preview}`,
          content: numberedLines.join('\n'),
          timestamp,
        })
      }
      numberedLines.length = 0
    }
  }
  if (numberedLines.length >= 3) {
    const preview = numberedLines[0].trim().slice(0, 50)
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: 'text',
      title: `List (${numberedLines.length} items): ${preview}`,
      content: numberedLines.join('\n'),
      timestamp,
    })
  }

  // Command lines (install/run commands)
  const commandPattern = /(?:ollama run|pip install|npm install|git clone)\s+\S+/g
  const seenCommands = new Set<string>()
  for (const match of text.matchAll(commandPattern)) {
    const cmd = match[0].trim()
    if (seenCommands.has(cmd)) continue
    seenCommands.add(cmd)
    artifacts.push({
      id: createTaskId(),
      agentId,
      agentName,
      type: 'code',
      title: `Command: ${cmd.length > 50 ? cmd.slice(0, 47) + '…' : cmd}`,
      content: cmd,
      timestamp,
    })
  }

  // Quick Reference / Commands sections
  const refHeaderPattern = /^#{1,3}\s+(Quick Reference|Commands)\s*$/i
  for (let i = 0; i < lines.length; i++) {
    if (refHeaderPattern.test(lines[i].trim())) {
      const sectionLines: string[] = [lines[i]]
      for (let j = i + 1; j < lines.length; j++) {
        if (/^#{1,3}\s+/.test(lines[j].trim()) && j > i) break
        sectionLines.push(lines[j])
        if (sectionLines.length >= 30) break
      }
      if (sectionLines.length >= 2) {
        const headerText = lines[i].replace(/^#{1,3}\s+/, '').trim()
        artifacts.push({
          id: createTaskId(),
          agentId,
          agentName,
          type: 'text',
          title: `Reference: ${headerText}`,
          content: sectionLines.join('\n'),
          timestamp,
        })
      }
    }
  }

  return artifacts
}

/**
 * Extract an executive summary from agent output lines.
 * Looks for a dedicated summary/overview heading first, then falls back to first prose sentences.
 * Returns up to 200 chars ending on a sentence boundary, or empty string if nothing found.
 */
function extractExecutiveSummary(agentSummaries: MissionAgentSummary[]): string {
  const longestOutput = getLongestAgentOutput(agentSummaries)
  if (!longestOutput) return ''
  return longestOutput.length > 500 ? `${longestOutput.slice(0, 500).trimEnd()}…` : longestOutput
}

/**
 * Extract key findings from agent output: bullet lists, numbered lists, or known heading sections.
 * Returns up to 5 items, or empty array if nothing meaningful found.
 */
function extractKeyFindings(agentSummaries: MissionAgentSummary[]): string[] {
  const findings: string[] = []
  const seen = new Set<string>()

  for (const summary of agentSummaries) {
    for (const line of cleanAgentOutputLines(summary.lines)) {
      const trimmed = line.trim()
      if (!/^([-*]\s+|\d+\.\s+)/.test(trimmed)) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      findings.push(trimmed)
      if (findings.length >= 5) return findings
    }
  }

  return findings
}

/**
 * Determine mission outcome from task stats and agent output.
 */
function determineMissionOutcome(
  taskStats: MissionTaskStats,
  agentSummaries: MissionAgentSummary[],
): string {
  const hasOutput = agentSummaries.some((s) => cleanAgentOutputLines(s.lines).length > 0)
  const hasAbortMarker = agentSummaries.some((s) =>
    s.lines.some((line) => /session aborted|mission aborted/i.test(line)),
  )

  if (hasAbortMarker) return '**Outcome:** 🛑 Aborted'
  if (!hasOutput) return '**Outcome:** ❌ No output'
  if (taskStats.failed > 0) return '**Outcome:** ⚠️ Partial'
  if (taskStats.total > 0 && taskStats.completed >= taskStats.total) return '**Outcome:** ✅ Complete'
  if (taskStats.total === 0 && hasOutput) return '**Outcome:** ✅ Complete'
  return '**Outcome:** ⚠️ Partial'
}

function generateMissionReport(payload: MissionReportPayload): string {
  const durationMs = Math.max(0, payload.completedAt - payload.startedAt)
  const taskStats = computeMissionTaskStats(payload.tasks)
  const costEstimate = estimateMissionCost(payload.tokenCount)
  const lines: string[] = []

  // Clean goal text — strip leading "Mission" if duplicated
  const rawGoal = payload.goal || 'Untitled mission'
  const cleanGoal = rawGoal.replace(/^Mission\s+/i, '').trim() || rawGoal

  lines.push('# Mission Report')
  lines.push('')
  lines.push(`**Goal:** ${cleanGoal}`)
  lines.push(`**Team:** ${payload.teamName}`)
  lines.push(`**Started:** ${new Date(payload.startedAt).toLocaleString()}`)
  lines.push(`**Completed:** ${new Date(payload.completedAt).toLocaleString()}`)
  lines.push(`**Duration:** ${formatDuration(durationMs)}`)
  lines.push(determineMissionOutcome(taskStats, payload.agentSummaries))
  lines.push('')

  // Executive Summary
  const execSummary = extractExecutiveSummary(payload.agentSummaries)
  if (execSummary) {
    lines.push('## Executive Summary')
    lines.push(execSummary)
    lines.push('')
  }

  lines.push('## Team')
  if (payload.team.length === 0) {
    lines.push('- No agents')
  } else {
    payload.team.forEach((member) => {
      lines.push(`- **${member.name}** — ${member.modelId}`)
    })
  }
  lines.push('')
  lines.push('## Tasks')
  lines.push(`- Total: ${taskStats.total}`)
  lines.push(`- Completed: ${taskStats.completed}`)
  if (taskStats.failed > 0) lines.push(`- Failed: ${taskStats.failed}`)
  lines.push('')

  // Key Findings
  const keyFindings = extractKeyFindings(payload.agentSummaries)
  if (keyFindings.length > 0) {
    lines.push('## Key Findings')
    keyFindings.forEach((finding) => {
      // Normalize to bullet if it's a numbered item
      const normalized = finding.replace(/^\d+\.\s+/, '- ')
      lines.push(normalized.startsWith('- ') || normalized.startsWith('* ') ? normalized : `- ${normalized}`)
    })
    lines.push('')
  }

  // Collect auto-detected artifacts from agent output
  const autoDetectedArtifacts: MissionArtifact[] = []

  lines.push('## Per-Agent Summary')
  if (payload.agentSummaries.length === 0) {
    lines.push('*No agent output captured*')
  } else {
    payload.agentSummaries.forEach((summary) => {
      lines.push(`### ${summary.agentName} (${summary.modelId || 'unknown'})`)
      const markdownOutput = getAgentOutputMarkdown(summary.lines)
      if (!markdownOutput) {
        lines.push('*No output captured*')
      } else {
        lines.push(markdownOutput)
      }
      lines.push('')

      // Auto-detect artifacts from this agent's output
      const detectedFromAgent = detectArtifactsFromText({
        agentId: summary.agentId,
        agentName: summary.agentName,
        lines: cleanAgentOutputLines(summary.lines),
      })
      autoDetectedArtifacts.push(...detectedFromAgent)
    })
  }

  // Merge explicit artifacts + auto-detected (deduped by title)
  const allArtifacts = [...payload.artifacts]
  const existingTitles = new Set(allArtifacts.map((a) => a.title.toLowerCase()))
  autoDetectedArtifacts.forEach((a) => {
    if (!existingTitles.has(a.title.toLowerCase())) {
      existingTitles.add(a.title.toLowerCase())
      allArtifacts.push(a)
    }
  })

  lines.push('## Artifacts')
  if (allArtifacts.length === 0) {
    lines.push('*None*')
  } else {
    allArtifacts.forEach((artifact) => {
      const typeEmoji = artifact.type === 'code' ? '📄' : artifact.type === 'html' ? '🌐' : '📝'
      lines.push(`- ${typeEmoji} **${artifact.title}** [${artifact.type}] — ${artifact.agentName}`)
    })
  }
  lines.push('')
  lines.push('## Cost Estimate')
  lines.push(`- Tokens: ${payload.tokenCount.toLocaleString()}`)
  lines.push(`- Estimated Cost: $${costEstimate.toFixed(2)} (rough)`)
  lines.push('')

  return lines.join('\n')
}

function getStoredMissionReportMissionId(report: StoredMissionReport): string {
  return report.missionId ?? report.id
}

function buildStoredMissionReportFromCheckpoint(cp: MissionCheckpoint): StoredMissionReport | null {
  if (!cp.report) return null
  const completedTasks = cp.tasks.filter((task) => task.status === 'done' || task.status === 'completed').length
  const failedTasks = cp.tasks.filter((task) => task.status === 'blocked' || task.status === 'failed').length
  const completedAt = cp.completedAt ?? cp.updatedAt
  return {
    id: cp.id,
    missionId: cp.id,
    name: cp.label,
    goal: cp.label,
    teamName: cp.team.length > 0 ? `${cp.team.length}-agent team` : 'Archived Mission',
    agents: cp.team.map((member) => ({
      id: member.id,
      name: member.name,
      modelId: member.modelId,
    })),
    taskStats: {
      total: cp.tasks.length,
      completed: completedTasks,
      failed: failedTasks,
    },
    duration: Math.max(0, completedAt - cp.startedAt),
    tokenCount: 0,
    costEstimate: 0,
    artifacts: [],
    report: cp.report,
    completedAt,
  }
}

function loadStoredMissionReports(): StoredMissionReport[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(MISSION_REPORTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is StoredMissionReport => Boolean(entry && typeof entry === 'object'))
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, MAX_MISSION_REPORTS)
  } catch {
    return []
  }
}

function saveStoredMissionReport(entry: StoredMissionReport): StoredMissionReport[] {
  if (typeof window === 'undefined') return [entry]
  const entryMissionId = getStoredMissionReportMissionId(entry)
  const next = [entry, ...loadStoredMissionReports().filter((row) => getStoredMissionReportMissionId(row) !== entryMissionId)]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, MAX_MISSION_REPORTS)
  try {
    window.localStorage.setItem(MISSION_REPORTS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore quota/write errors
  }
  return next
}

const TEMPLATE_DISPLAY_NAMES: Record<TeamTemplateId, string> = {
  research: 'Research Team',
  coding: 'Coding Sprint',
  content: 'Content Pipeline',
  'pc1-loop': 'PC1 Agent Loop',
}

/**
 * Detect whether an agent's final message signals that it has genuinely
 * completed its work, versus ending a turn mid-conversation (e.g. asking a
 * clarifying question).
 *
 * Returns `'completed'` when the output looks like a finished deliverable,
 * `'waiting_for_input'` when the agent appears to be asking the user something.
 *
 * Heuristic order:
 *  1. Explicit structured markers always win.
 *  2. Question-like endings → waiting_for_input.
 *  3. Short responses (< 60 chars) that aren't markers → waiting_for_input
 *     (likely a clarification, not a deliverable).
 *  4. Everything else → completed (long-form output = deliverable).
 */
function classifyAgentTurnEnd(text: string | undefined | null): 'completed' | 'waiting_for_input' {
  if (!text) return 'completed' // no output → nothing to wait for

  const trimmed = text.trim()
  if (!trimmed) return 'completed'

  // ── 1. Explicit completion markers (case-insensitive) ──────────────────
  const completionMarkers = [
    '[TASK_COMPLETE]', '[DONE]', '[MISSION_COMPLETE]', '[COMPLETED]',
    'TASK_COMPLETE', 'MISSION_COMPLETE',
  ]
  const upper = trimmed.toUpperCase()
  for (const marker of completionMarkers) {
    if (upper.includes(marker)) return 'completed'
  }

  // ── 2. Explicit waiting markers ────────────────────────────────────────
  const waitingMarkers = [
    '[WAITING_FOR_INPUT]', '[NEEDS_INPUT]', '[QUESTION]',
    'APPROVAL_REQUIRED:',
  ]
  for (const marker of waitingMarkers) {
    if (upper.includes(marker.toUpperCase())) return 'waiting_for_input'
  }

  // ── 3. Ends with a question → likely asking for input ──────────────────
  // Look at the last meaningful line (skip blank lines and trailing whitespace)
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  const lastLine = lines[lines.length - 1] ?? ''
  if (/\?\s*$/.test(lastLine)) return 'waiting_for_input'

  // ── 4. Very short output without markers → probably a question/note ────
  if (trimmed.length < 60) return 'waiting_for_input'

  // ── 5. Default: treat long output as a completed deliverable ───────────
  return 'completed'
}

const LEGACY_AGENT_AVATARS = ['🔍', '✍️', '📝', '🧪', '🎨', '📊', '🛡️', '⚡', '🔬', '🎯'] as const
const AGENT_AVATAR_COUNT = 10

const AGENT_NAME_POOL = [
  'Atlas', 'Forge', 'Nova', 'Scout', 'Nexus', 'Echo', 'Apex', 'Vega',
  'Orbit', 'Zen', 'Flux', 'Cipher', 'Sage', 'Wren', 'Coda', 'Drift',
  'Hex', 'Iris', 'Jett', 'Lux', 'Mira', 'Pix', 'Quest', 'Sol',
  'Terra', 'Unity', 'Blaze', 'Rune', 'Arlo', 'Cruz',
]

function pickUniqueAgentName(existingNames: string[]): string {
  const usedSet = new Set(existingNames.map((n) => n.toLowerCase()))
  const available = AGENT_NAME_POOL.filter((n) => !usedSet.has(n.toLowerCase()))
  const pool = available.length > 0 ? available : AGENT_NAME_POOL
  return pool[Math.floor(Math.random() * pool.length)]
}
const LEGACY_AGENT_AVATAR_INDEX = new Map<string, number>(
  LEGACY_AGENT_AVATARS.map((avatar, index) => [avatar, index]),
)

function normalizeAgentAvatarIndex(value: unknown, fallbackIndex = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value)
    if (normalized >= 0) return normalized % AGENT_AVATAR_COUNT
  }
  if (typeof value === 'string') {
    const legacy = LEGACY_AGENT_AVATAR_INDEX.get(value.trim())
    if (legacy !== undefined) return legacy
  }
  const fallback = Math.trunc(fallbackIndex)
  return ((fallback % AGENT_AVATAR_COUNT) + AGENT_AVATAR_COUNT) % AGENT_AVATAR_COUNT
}

function getAgentAvatarForSlot(index: number): number {
  return normalizeAgentAvatarIndex(index, 0)
}

function resolveAgentAvatarIndex(member: unknown, index: number): number {
  const row = member && typeof member === 'object' && !Array.isArray(member)
    ? (member as Record<string, unknown>)
    : null
  return normalizeAgentAvatarIndex(row?.avatar, index)
}

function darkenHexColor(color: string, amount = 0.2): string {
  const hex = color.trim()
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex
  const expanded =
    normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return color

  const r = Math.round(parseInt(expanded.slice(0, 2), 16) * (1 - amount))
  const g = Math.round(parseInt(expanded.slice(2, 4), 16) * (1 - amount))
  const b = Math.round(parseInt(expanded.slice(4, 6), 16) * (1 - amount))
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

export function AgentAvatar({
  index,
  color,
  size = 40,
  className,
}: {
  index: number
  color: string
  size?: number
  className?: string
}) {
  const variant = normalizeAgentAvatarIndex(index, 0)
  const shade = darkenHexColor(color, 0.2)
  const outline = darkenHexColor(color, 0.35)
  const eye = '#f8fafc'

  const baseParts = (() => {
    switch (variant) {
      case 2:
        return {
          head: (
            <>
              <rect x="16" y="9" width="16" height="12" fill={color} />
              <rect x="14" y="11" width="20" height="8" fill={color} />
              <rect x="30" y="9" width="2" height="12" fill={shade} />
              <rect x="14" y="17" width="20" height="2" fill={shade} />
              <rect x="16" y="19" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 9, rightX: 35, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
      case 3:
        return {
          head: (
            <>
              <rect x="15" y="10" width="18" height="11" fill={color} />
              <rect x="31" y="10" width="2" height="11" fill={shade} />
              <rect x="14" y="19" width="20" height="3" fill={shade} />
            </>
          ),
          body: { x: 12, y: 22, w: 24, h: 15 },
          arms: { leftX: 7, rightX: 37, y: 24, w: 5, h: 11 },
          legs: { y: 37, w: 6, h: 5, leftX: 16, rightX: 26 },
        }
      case 4:
        return {
          head: (
            <>
              <rect x="18" y="9" width="12" height="14" fill={color} />
              <rect x="28" y="9" width="2" height="14" fill={shade} />
              <rect x="18" y="21" width="12" height="2" fill={shade} />
            </>
          ),
          body: { x: 17, y: 23, w: 14, h: 15 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 4, h: 10 },
          legs: { y: 38, w: 4, h: 5, leftX: 19, rightX: 25 },
        }
      case 8:
        return {
          head: (
            <>
              <rect x="17" y="12" width="14" height="11" fill={color} />
              <rect x="29" y="12" width="2" height="11" fill={shade} />
              <rect x="17" y="21" width="14" height="2" fill={shade} />
            </>
          ),
          body: { x: 16, y: 23, w: 16, h: 12 },
          arms: { leftX: 12, rightX: 32, y: 25, w: 3, h: 8 },
          legs: { y: 35, w: 4, h: 6, leftX: 18, rightX: 25 },
        }
      default:
        return {
          head: (
            <>
              <rect x="16" y="10" width="16" height="12" fill={color} />
              <rect x="30" y="10" width="2" height="12" fill={shade} />
              <rect x="16" y="20" width="16" height="2" fill={shade} />
            </>
          ),
          body: { x: 14, y: 22, w: 20, h: 14 },
          arms: { leftX: 10, rightX: 34, y: 24, w: 4, h: 10 },
          legs: { y: 36, w: 5, h: 6, leftX: 17, rightX: 26 },
        }
    }
  })()

  const bodyParts = (
    <>
      {baseParts.head}
      <rect x={baseParts.body.x} y={baseParts.body.y} width={baseParts.body.w} height={baseParts.body.h} fill={color} />
      <rect x={baseParts.body.x + baseParts.body.w - 2} y={baseParts.body.y} width="2" height={baseParts.body.h} fill={shade} />
      <rect x={baseParts.body.x} y={baseParts.body.y + baseParts.body.h - 2} width={baseParts.body.w} height="2" fill={shade} />
      <rect x={baseParts.arms.leftX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.rightX} y={baseParts.arms.y} width={baseParts.arms.w} height={baseParts.arms.h} fill={color} />
      <rect x={baseParts.arms.leftX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.arms.rightX + Math.max(0, baseParts.arms.w - 1)} y={baseParts.arms.y} width="1" height={baseParts.arms.h} fill={shade} />
      <rect x={baseParts.legs.leftX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.rightX} y={baseParts.legs.y} width={baseParts.legs.w} height={baseParts.legs.h} fill={color} />
      <rect x={baseParts.legs.leftX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
      <rect x={baseParts.legs.rightX + Math.max(0, baseParts.legs.w - 1)} y={baseParts.legs.y} width="1" height={baseParts.legs.h} fill={shade} />
    </>
  )

  const details = (() => {
    switch (variant) {
      case 0:
        return (
          <>
            <rect x="23" y="6" width="2" height="4" fill={color} />
            <circle cx="24" cy="5" r="1.5" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 1:
        return (
          <>
            <rect x="17" y="14" width="14" height="5" fill={eye} opacity="0.95" />
            <rect x="17" y="18" width="14" height="1" fill={shade} />
            <rect x="19" y="28" width="10" height="2" fill={shade} />
            <rect x="13" y="15" width="3" height="2" fill={shade} />
            <rect x="32" y="15" width="3" height="2" fill={shade} />
          </>
        )
      case 2:
        return (
          <>
            <circle cx="19" cy="16" r="2.2" fill={eye} />
            <circle cx="29" cy="16" r="2.2" fill={eye} />
            <rect x="20" y="20" width="8" height="2" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
          </>
        )
      case 3:
        return (
          <>
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="16" y="18" width="16" height="2" fill={outline} />
            <rect x="18" y="28" width="12" height="2" fill={outline} />
            <rect x="16" y="31" width="16" height="2" fill={shade} />
          </>
        )
      case 4:
        return (
          <>
            <circle cx="21" cy="16" r="1.7" fill={eye} />
            <circle cx="27" cy="16" r="1.7" fill={eye} />
            <rect x="22" y="20" width="4" height="1" fill={shade} />
            <rect x="20" y="29" width="8" height="2" fill={shade} />
            <rect x="21" y="32" width="6" height="1" fill={outline} />
          </>
        )
      case 5:
        return (
          <>
            <rect x="18" y="5" width="2" height="5" fill={color} />
            <rect x="28" y="5" width="2" height="5" fill={color} />
            <circle cx="19" cy="4" r="1.6" fill={eye} />
            <circle cx="29" cy="4" r="1.6" fill={eye} />
            <circle cx="20" cy="16" r="1.6" fill={eye} />
            <circle cx="28" cy="16" r="1.6" fill={eye} />
            <rect x="19" y="20" width="10" height="2" fill={shade} />
            <rect x="18" y="28" width="12" height="2" fill={shade} />
          </>
        )
      case 6:
        return (
          <>
            <circle cx="24" cy="16" r="3.2" fill={eye} />
            <circle cx="24" cy="16" r="1.3" fill={shade} />
            <rect x="18" y="20" width="12" height="2" fill={outline} />
            <rect x="17" y="28" width="2" height="2" fill={shade} />
            <rect x="19" y="30" width="2" height="2" fill={shade} />
            <rect x="21" y="28" width="2" height="2" fill={shade} />
            <rect x="23" y="30" width="2" height="2" fill={shade} />
            <rect x="25" y="28" width="2" height="2" fill={shade} />
            <rect x="27" y="30" width="2" height="2" fill={shade} />
            <rect x="29" y="28" width="2" height="2" fill={shade} />
          </>
        )
      case 7:
        return (
          <>
            <rect x="21" y="7" width="6" height="3" fill={color} />
            <rect x="22" y="5" width="4" height="2" fill={color} />
            <rect x="18" y="15" width="4" height="2" fill={eye} />
            <rect x="26" y="15" width="4" height="2" fill={eye} />
            <rect x="17" y="18" width="14" height="2" fill={outline} />
            <rect x="19" y="28" width="10" height="2" fill={outline} />
          </>
        )
      case 8:
        return (
          <>
            <circle cx="20" cy="17" r="2.3" fill={eye} />
            <circle cx="28" cy="17" r="2.3" fill={eye} />
            <rect x="21" y="21" width="6" height="1" fill={shade} />
            <rect x="20" y="27" width="8" height="2" fill={shade} />
          </>
        )
      case 9:
      default:
        return (
          <>
            <circle cx="19" cy="16" r="2.4" fill={eye} />
            <circle cx="29" cy="16" r="1.4" fill={eye} />
            <rect x="17" y="20" width="4" height="1" fill={shade} />
            <rect x="23" y="20" width="3" height="1" fill={shade} />
            <rect x="28" y="20" width="2" height="1" fill={shade} />
            <rect x="18" y="28" width="2" height="2" fill={outline} />
            <rect x="20" y="30" width="2" height="2" fill={outline} />
            <rect x="22" y="28" width="2" height="2" fill={outline} />
            <rect x="24" y="30" width="2" height="2" fill={outline} />
            <rect x="26" y="28" width="2" height="2" fill={outline} />
            <rect x="28" y="30" width="2" height="2" fill={outline} />
            <rect x="31" y="24" width="2" height="4" fill={shade} />
          </>
        )
    }
  })()

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className={className}
      shapeRendering="crispEdges"
    >
      <rect x="5" y="5" width="38" height="38" fill={color} opacity="0.08" />
      <rect x="7" y="7" width="34" height="34" fill="white" opacity="0.92" />
      <rect x="7" y="7" width="34" height="34" fill="none" stroke={outline} strokeWidth="1" />
      {bodyParts}
      {details}
    </svg>
  )
}

// ── Agent accent colors (indexed per agent slot) ───────────────────────────────
const AGENT_ACCENT_COLORS = [
  { bar: 'bg-accent-500', border: 'border-orange-500', avatar: 'bg-orange-100', text: 'text-orange-600', ring: 'ring-orange-500/20' },
  { bar: 'bg-blue-500', border: 'border-blue-500', avatar: 'bg-blue-100', text: 'text-blue-600', ring: 'ring-blue-500/20' },
  { bar: 'bg-violet-500', border: 'border-violet-500', avatar: 'bg-violet-100', text: 'text-violet-600', ring: 'ring-violet-500/20' },
  { bar: 'bg-emerald-500', border: 'border-emerald-500', avatar: 'bg-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-500/20' },
  { bar: 'bg-rose-500', border: 'border-rose-500', avatar: 'bg-rose-100', text: 'text-rose-600', ring: 'ring-rose-500/20' },
  { bar: 'bg-amber-500', border: 'border-amber-500', avatar: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-500/20' },
  { bar: 'bg-cyan-500', border: 'border-cyan-500', avatar: 'bg-cyan-100', text: 'text-cyan-600', ring: 'ring-cyan-500/20' },
  { bar: 'bg-fuchsia-500', border: 'border-fuchsia-500', avatar: 'bg-fuchsia-100', text: 'text-fuchsia-600', ring: 'ring-fuchsia-500/20' },
  { bar: 'bg-lime-500', border: 'border-lime-500', avatar: 'bg-lime-100', text: 'text-lime-700', ring: 'ring-lime-500/20' },
  { bar: 'bg-sky-500', border: 'border-sky-500', avatar: 'bg-sky-100', text: 'text-sky-600', ring: 'ring-sky-500/20' },
].map((accent, index) => ({
  ...accent,
  hex: ['#f97316', '#3b82f6', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#d946ef', '#84cc16', '#0ea5e9'][index] ?? '#f97316',
}))

// ── Model badge styling ────────────────────────────────────────────────────────
const OFFICE_MODEL_BADGE: Record<ModelPresetId, string> = {
  auto:   'rounded-full border border-neutral-200 bg-neutral-100 text-neutral-600',
  opus:   'border border-orange-200 bg-orange-50 text-orange-700',
  sonnet: 'border border-blue-200 bg-blue-50 text-blue-700',
  codex:  'border border-emerald-200 bg-emerald-50 text-emerald-700',
  flash:  'border border-violet-200 bg-violet-50 text-violet-700',
  minimax: 'border border-amber-200 bg-amber-50 text-amber-700',
  'pc1-coder':   'border border-cyan-200 bg-cyan-50 text-cyan-700',
  'pc1-planner': 'border border-teal-200 bg-teal-50 text-teal-700',
  'pc1-critic':  'border border-rose-200 bg-rose-50 text-rose-700',
}

const OFFICE_MODEL_LABEL: Record<ModelPresetId, string> = {
  auto:   'Auto',
  opus:   'Opus',
  sonnet: 'Sonnet',
  codex:  'Codex',
  flash:  'Flash',
  minimax: 'MiniMax',
  'pc1-coder':   'PC1 Coder',
  'pc1-planner': 'PC1 Plan',
  'pc1-critic':  'PC1 Critic',
}

const DEFAULT_OFFICE_MODEL_BADGE =
  'border border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'

function getOfficeModelBadge(modelId: string): string {
  return OFFICE_MODEL_BADGE[modelId as ModelPresetId] ?? DEFAULT_OFFICE_MODEL_BADGE
}

function getAgentStatusMeta(status: AgentWorkingStatus): {
  label: string
  className: string
  dotClassName: string
  pulse?: boolean
} {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        className: 'text-blue-600',
        dotClassName: 'bg-blue-500',
        pulse: true,
      }
    case 'ready':
    case 'idle':
      return {
        label: 'Ready',
        className: 'text-emerald-600',
        dotClassName: 'bg-emerald-500',
      }
    case 'error':
      return {
        label: 'Error',
        className: 'text-red-600',
        dotClassName: 'bg-red-500',
      }
    case 'none':
      return {
        label: 'No session',
        className: 'text-neutral-400',
        dotClassName: 'bg-neutral-400',
      }
    case 'spawning':
      return {
        label: 'Spawning',
        className: 'text-amber-600',
        dotClassName: 'bg-amber-400',
        pulse: true,
      }
    case 'paused':
      return {
        label: 'Paused',
        className: 'text-blue-600',
        dotClassName: 'bg-blue-400',
      }
    case 'waiting_for_input':
      return {
        label: 'Awaiting Input',
        className: 'text-amber-600',
        dotClassName: 'bg-amber-400',
        pulse: true,
      }
    default:
      return {
        label: toTitleCase(String(status)),
        className: 'text-neutral-600',
        dotClassName: 'bg-neutral-400',
      }
  }
}

// ── OfficeView ─────────────────────────────────────────────────────────────────
type OfficeViewProps = {
  agentRows: AgentWorkingRow[]
  missionRunning: boolean
  onViewOutput: (agentId: string) => void
  selectedOutputAgentId?: string
  activeTemplateName?: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
}

function OfficeView({
  agentRows,
  missionRunning,
  onViewOutput,
  selectedOutputAgentId,
  activeTemplateName,
  processType,
}: OfficeViewProps) {
  if (agentRows.length === 0) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl">🏢</p>
          <p className="text-sm font-medium text-neutral-600 dark:text-slate-400">No agents in your team</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">Switch to the Team tab to add agents.</p>
        </div>
      </div>
    )
  }

  const processTypeBadgeClass =
    processType === 'hierarchical' ? 'border-violet-300 bg-violet-50 text-violet-700' :
    processType === 'sequential'   ? 'border-blue-300 bg-blue-50 text-blue-700' :
                                     'border-emerald-300 bg-emerald-50 text-emerald-700'

  return (
    <div className="min-h-full p-4 md:h-full md:overflow-y-auto md:bg-surface">
      {/* ── Crew strip ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-3 shadow-sm">
        {/* Overlapping agent avatars */}
        <div className="flex -space-x-2">
          {agentRows.slice(0, 5).map((agent, i) => {
            const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
            return (
              <div
                key={agent.id}
                title={agent.name}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 border-white shadow-sm',
                  accent.avatar,
                )}
              >
                <AgentAvatar index={i} color={accent.hex} size={22} />
              </div>
            )
          })}
          {agentRows.length > 5 ? (
            <div className="flex size-8 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-[10px] font-bold text-neutral-600 dark:text-slate-400">
              +{agentRows.length - 5}
            </div>
          ) : null}
        </div>

        {/* Labels */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {agentRows.length} agent{agentRows.length !== 1 ? 's' : ''}
          </span>
          {activeTemplateName ? (
            <>
              <span className="text-neutral-300">·</span>
              <span className="truncate text-sm text-neutral-500 dark:text-slate-400">{activeTemplateName}</span>
            </>
          ) : null}
        </div>

        {/* Process type badge */}
        <div className="flex items-center gap-2 shrink-0">
          {missionRunning && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              <span className="relative flex size-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              MISSION ACTIVE
            </span>
          )}
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
              processTypeBadgeClass,
            )}
          >
            {processType}
          </span>
        </div>
      </div>

      {/* ── Agent desk grid ─────────────────────────────────────────────── */}
      <div
        className={cn(
          'grid auto-rows-fr gap-4',
          agentRows.length <= 3 ? 'grid-cols-1 sm:grid-cols-2' :
          'grid-cols-1 sm:grid-cols-2 md:grid-cols-3',
        )}
      >
        {agentRows.map((agent, i) => {
          const accent = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
          const isActive = agent.status === 'active'
          const isSelected = agent.id === selectedOutputAgentId
          const isSpawning = agent.status === 'spawning'
          const statusMeta = getAgentStatusMeta(agent.status)

          // Fix 2: Standardised status dots
          // 🟢 Green = active  🟡 Yellow = has session (idle/ready)  ⚫ Gray = no session  🔴 Red = error
          const statusDotEl = isActive ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
            </span>
          ) : isSpawning ? (
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/60" />
              <span className="relative inline-flex size-3 rounded-full bg-amber-400" />
            </span>
          ) : (
            <span
              className={cn(
                'size-3 shrink-0 rounded-full',
                agent.status === 'idle'  ? 'bg-yellow-500' :
                agent.status === 'ready' ? 'bg-yellow-500' :
                agent.status === 'error' ? 'bg-red-500' :
                'bg-neutral-400',  // 'none' — no session
              )}
            />
          )

          return (
            <div
              key={agent.id}
              className={cn(
            'relative flex h-full min-h-[248px] cursor-pointer flex-col overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md hover:ring-1 hover:ring-orange-200',
            isSelected
                  ? 'shadow-md ring-1 ring-orange-300'
                  : '',
                isActive && missionRunning && !isSelected && 'ring-1 ring-emerald-200',
              )}
            >
              {/* Top accent bar (3px) */}
              <div className={cn('h-[3px] w-full', accent.bar)} />

              <div className="flex h-full flex-col p-4">
                {/* Header: avatar (left) + status dot (right) */}
                <div className="flex items-start justify-between">
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex size-12 items-center justify-center rounded-full border border-white/80 shadow-sm',
                      accent.avatar,
                    )}
                  >
                    <AgentAvatar index={i} color={accent.hex} size={28} />
                  </div>
                  {/* Status dot */}
                  {statusDotEl}
                </div>

                {/* Agent name */}
                <h3 className="mt-3 truncate text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
                  {agent.name}
                </h3>

                {/* Role / model row */}
                <div className="mt-1 flex flex-wrap items-start gap-1.5">
                  {agent.roleDescription ? (
                    <span className="line-clamp-2 min-w-0 text-xs text-neutral-600 dark:text-slate-400">
                      {agent.roleDescription}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 font-mono text-[10px] font-medium',
                      getOfficeModelBadge(agent.modelId),
                    )}
                  >
                    {getModelShortLabel(agent.modelId)}
                  </span>
                </div>

                <p
                  className={cn(
                    'mt-2 text-xs font-medium',
                    statusMeta.className,
                  )}
                >
                  ● {statusMeta.label}
                </p>
                {agent.lastLine ? (
                  <p className="mt-1 line-clamp-2 min-h-[2.1em] font-mono text-xs leading-relaxed text-neutral-500 dark:text-slate-400">
                    {agent.lastLine}
                  </p>
                ) : (
                  <p className="mt-1 min-h-[2.1em] font-mono text-xs leading-relaxed text-neutral-400">
                    {agent.status === 'none' ? 'Waiting for session' : 'No recent output'}
                  </p>
                )}

                {/* Footer: task count badge */}
                {agent.taskCount > 0 ? (
                  <div className="mt-2">
                    <span className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:text-slate-400">
                      {agent.taskCount} task{agent.taskCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                ) : null}

                {/* Edit agent button — full-width */}
                <button
                  type="button"
                  title="Click to view agent output"
                  onClick={() => onViewOutput(agent.id)}
                  className={cn(
                    'mt-auto w-full cursor-pointer rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                    isSelected
                      ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                      : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700',
                  )}
                >
                  Edit agent
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Fix 2: Status dot legend */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 shadow-sm">
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-emerald-500" /> Active
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-yellow-500" /> Idle
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-neutral-400" /> No session
        </span>
        <span className="flex items-center gap-1 text-[10px] text-neutral-500 dark:text-slate-400">
          <span className="size-2 rounded-full bg-red-500" /> Error
        </span>
      </div>
    </div>
  )
}

// ── HistoryView ────────────────────────────────────────────────────────────────
function timeAgoFromMs(ms: number): string {
  const delta = Math.max(0, Date.now() - ms)
  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

type HistoryViewProps = {
  localHistory?: MissionCheckpoint[]
  onViewReport?: (report: StoredMissionReport) => void
}

function MissionReportDetailModal({
  report,
  onClose,
  onArtifactPreview,
}: {
  report: StoredMissionReport
  onClose: () => void
  onArtifactPreview?: (artifact: MissionArtifact) => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full shrink-0 bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400" />
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-neutral-900 dark:text-white">
              {report.name || report.goal}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {report.teamName} · {new Date(report.completedAt).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-neutral-200 px-6 py-4 dark:border-neutral-700 sm:grid-cols-4">
          {[
            { label: 'Duration', value: formatDuration(report.duration) },
            { label: 'Tasks', value: `${report.taskStats.completed}/${report.taskStats.total}` },
            { label: 'Tokens', value: report.tokenCount.toLocaleString() },
            { label: 'Cost', value: report.costEstimate === 0 ? 'Free (OAuth)' : `$${report.costEstimate.toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-center dark:border-neutral-700 dark:bg-slate-800/50">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>
        {report.agents.length > 0 ? (
          <div className="shrink-0 px-6 pt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Agents</p>
            <div className="flex flex-wrap gap-1.5">
              {report.agents.map((agent) => (
                <span key={agent.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-slate-800/50 dark:text-neutral-300">
                  {agent.name}
                  <span className="text-[10px] text-neutral-400">· {getModelDisplayLabel(agent.modelId)}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {onArtifactPreview && report.artifacts.length > 0 ? (
          <div className="shrink-0 px-6 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Artifacts</p>
            <div className="flex flex-wrap gap-1.5">
              {report.artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => onArtifactPreview(artifact)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:border-accent-300 dark:border-neutral-700 dark:bg-slate-800/50 dark:text-neutral-300"
                >
                  {artifact.type === 'code' ? '📄' : artifact.type === 'html' ? '🌐' : '📝'} {artifact.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <Markdown>{report.report}</Markdown>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-6 py-3 dark:border-neutral-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryView({ localHistory: localHistoryProp, onViewReport }: HistoryViewProps = {}) {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [localHistory] = useState<MissionCheckpoint[]>(() => localHistoryProp ?? loadMissionHistory())
  const [inlineSelectedReport, setInlineSelectedReport] = useState<StoredMissionReport | null>(null)
  const storedReportsByMissionId = useMemo(() => {
    return new Map(loadStoredMissionReports().map((report) => [getStoredMissionReportMissionId(report), report]))
  }, [])
  const historyItems = localHistoryProp ?? localHistory
  const handleViewReport = useCallback((report: StoredMissionReport) => {
    if (onViewReport) {
      onViewReport(report)
      return
    }
    setInlineSelectedReport(report)
  }, [onViewReport])

  useEffect(() => {
    let cancelled = false

    async function fetchHistory() {
      setLoading(true)
      try {
        const res = await fetch('/api/sessions')
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { sessions?: SessionRecord[] }
        const missionSessions = (data.sessions ?? [])
          .filter((s) => {
            const label = readString(s.label)
            return label.startsWith('Mission:')
          })
          .sort((a, b) => {
            const aTime = typeof a.updatedAt === 'number' ? a.updatedAt : 0
            const bTime = typeof b.updatedAt === 'number' ? b.updatedAt : 0
            return bTime - aTime
          })
        if (!cancelled) setSessions(missionSessions)
      } catch {
        // ignore fetch errors
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchHistory()
    return () => {
      cancelled = true
    }
  }, [])

  const hasLocalHistory = historyItems.length > 0
  const hasApiSessions = sessions.length > 0

  if (loading && !hasLocalHistory) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-2 size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
          <p className="font-mono text-[10px] text-neutral-500 dark:text-slate-400">// loading mission history…</p>
        </div>
      </div>
    )
  }

  if (!hasLocalHistory && !hasApiSessions) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="mb-3 text-4xl opacity-30">📋</p>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">No mission history yet</p>
          <p className="mt-1 font-mono text-[10px] text-neutral-500 dark:text-slate-400">// start a mission to see it recorded here</p>
        </div>
      </div>
    )
  }

  const PROCESS_TYPE_BADGE: Record<string, string> = {
    sequential:   'bg-blue-50 text-blue-700 border border-blue-200',
    hierarchical: 'bg-violet-50 text-violet-700 border border-violet-200',
    parallel:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  }

  const CHECKPOINT_STATUS_BADGE: Record<string, { label: string; icon: string; className: string }> = {
    running:   { label: 'Running',   icon: '▶', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
    paused:    { label: 'Paused',    icon: '⏸', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
    completed: { label: 'Completed', icon: '●', className: 'bg-neutral-100 text-neutral-600 border border-neutral-200' },
    aborted:   { label: 'Aborted',   icon: '✕', className: 'bg-red-50 text-red-700 border border-red-200' },
  }

  return (
    <div className="min-h-full p-4 md:h-full md:overflow-y-auto">
      <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-neutral-600 dark:text-slate-400">Mission Reports</h2>

      {/* Local checkpoint history */}
      {hasLocalHistory ? (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-700 dark:text-neutral-300">📦 Local Checkpoints</p>
          {historyItems.map((cp) => {
            const completedTasks = cp.tasks.filter(t => t.status === 'done' || t.status === 'completed').length
            const totalTasks = cp.tasks.length
            const statusBadge = CHECKPOINT_STATUS_BADGE[cp.status] ?? CHECKPOINT_STATUS_BADGE['completed']!
            const processClass = PROCESS_TYPE_BADGE[cp.processType] ?? ''
            const timeRef = cp.completedAt ?? cp.updatedAt
            const availableReport = storedReportsByMissionId.get(cp.id) ?? buildStoredMissionReportFromCheckpoint(cp)

            return (
              <div
                key={cp.id}
                className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4 transition-colors hover:border-neutral-300"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-neutral-500 dark:text-slate-400" aria-hidden>{statusBadge!.icon}</span>
                  <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                    {cp.label}
                  </h3>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', statusBadge!.className)}>
                    {statusBadge!.label}
                  </span>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', processClass)}>
                    {cp.processType}
                  </span>
                </div>

                {/* Team avatars */}
                {cp.team.length > 0 ? (
                  <div className="mb-2 flex -space-x-1.5">
                    {cp.team.slice(0, 5).map((member, idx) => {
                      const ac = AGENT_ACCENT_COLORS[idx % AGENT_ACCENT_COLORS.length]
                      return (
                        <span
                          key={member.id}
                          title={member.name}
                          className={cn('flex size-6 items-center justify-center rounded-full border border-white text-sm leading-none', ac.avatar)}
                        >
                          <AgentAvatar index={resolveAgentAvatarIndex(member, idx)} color={ac.hex} size={16} />
                        </span>
                      )
                    })}
                    {cp.team.length > 5 ? (
                      <span className="flex size-6 items-center justify-center rounded-full border border-white bg-neutral-200 text-[10px] font-bold text-neutral-600 dark:text-slate-400">
                        +{cp.team.length - 5}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 font-mono text-[10px] text-neutral-700 dark:text-neutral-400">
                    {totalTasks > 0 ? (
                      <span>{completedTasks}/{totalTasks} tasks</span>
                    ) : null}
                    {timeRef > 0 ? <span>{timeAgoFromMs(timeRef)}</span> : null}
                  </div>
                  {availableReport ? (
                    <button
                      type="button"
                      onClick={() => handleViewReport(availableReport)}
                      className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                      View Report
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {/* API sessions history */}
      {hasApiSessions ? (
        <div className="space-y-3">
          {hasLocalHistory ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-700 dark:text-neutral-300">🌐 Gateway Sessions</p>
          ) : null}
          {sessions.map((session) => {
            const sessionId = readSessionId(session)
            const label = readString(session.label)
            const status = readString(session.status)
            const lastMessage = readSessionLastMessage(session)
            const updatedAtRaw = session.updatedAt
            const updatedAt =
              typeof updatedAtRaw === 'number'
                ? updatedAtRaw
                : typeof updatedAtRaw === 'string'
                  ? Date.parse(updatedAtRaw)
                  : 0
            const isExpanded = expandedId === sessionId
            // Clamp token count to 0 minimum (gateway may return negative for cache accounting)
            const tokenCount = typeof session.tokenCount === 'number' ? Math.max(0, session.tokenCount) : undefined

            const statusBadge =
              status === 'active'
                ? { label: 'Active', icon: '▶', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
                : status === 'idle'
                  ? { label: 'Idle', icon: '⏸', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
                  : { label: 'Ended', icon: '●', className: 'bg-neutral-100 text-neutral-600 border border-neutral-200' }

            return (
              <div
                key={sessionId || label}
                className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4 transition-colors hover:border-neutral-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-neutral-500 dark:text-slate-400" aria-hidden>{statusBadge.icon}</span>
                      <h3 className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
                        {label.replace(/^Mission:\s*/, '')}
                      </h3>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          statusBadge.className,
                        )}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                    {lastMessage ? (
                      <p className="mt-1.5 line-clamp-2 font-mono text-[10px] text-neutral-600 dark:text-slate-400">
                        {lastMessage}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-neutral-700 dark:text-neutral-400">
                      {updatedAt > 0 ? <span>{timeAgoFromMs(updatedAt)}</span> : null}
                      {tokenCount !== undefined ? (
                        <span>{tokenCount.toLocaleString()} tokens</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : sessionId)}
                    className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[10px] font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900 dark:text-white"
                  >
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-slate-400">
                      Session Details
                    </p>
                    <dl className="space-y-1.5">
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-mono text-[10px] text-neutral-500 dark:text-slate-400">ID</dt>
                        <dd className="truncate font-mono text-[10px] text-neutral-600 dark:text-slate-400">{sessionId}</dd>
                      </div>
                      {lastMessage ? (
                        <div className="flex flex-col gap-0.5">
                          <dt className="font-mono text-[10px] text-neutral-700 dark:text-neutral-400">Last output</dt>
                          <dd className="line-clamp-4 font-mono text-[10px] text-neutral-500 dark:text-slate-400">{lastMessage}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {inlineSelectedReport ? (
        <MissionReportDetailModal
          report={inlineSelectedReport}
          onClose={() => setInlineSelectedReport(null)}
        />
      ) : null}
    </div>
  )
}

// Retained temporarily while the new 3-tab layout rolls out.
void OfficeView
void HistoryView

export function AgentHubLayout({ agents }: AgentHubLayoutProps) {
  // ── Tab + sidebar state ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [configSection, setConfigSection] = useState<ConfigSection>('agents')
  const [avatarPickerOpenId, setAvatarPickerOpenId] = useState<string | null>(null)
  const [agentWizardOpenId, setAgentWizardOpenId] = useState<string | null>(null)
  const [teamWizardOpenId, setTeamWizardOpenId] = useState<string | null>(null)
  const [showAddTeamModal, setShowAddTeamModal] = useState(false)
  const [providerEditModalProvider, setProviderEditModalProvider] = useState<string | null>(null)
  const [showAddProviderModal, setShowAddProviderModal] = useState(false)
  const [newAgentDraft, setNewAgentDraft] = useState<(TeamMember & { backstory: string; roleDescription: string }) | null>(null)
  const [providerWizardStep, setProviderWizardStep] = useState<'select' | 'key'>('select')
  const [providerWizardSelected, setProviderWizardSelected] = useState('')
  // Live Feed UI removed — right panel is Live Output only. Feed event bus still runs internally.
  const [processType, setProcessType] = useState<'sequential' | 'hierarchical' | 'parallel'>('parallel')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStepIndex, setWizardStepIndex] = useState(0)
  const [wizardCheckingGateway, setWizardCheckingGateway] = useState(false)
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([])
  const [addProviderName, setAddProviderName] = useState('')
  const [addProviderSelection, setAddProviderSelection] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [addProviderApiKey, setAddProviderApiKey] = useState('')
  const [addProviderBaseUrl, setAddProviderBaseUrl] = useState('')
  const [addProviderApiType, setAddProviderApiType] = useState('openai-completions')
  const [isAddingProvider, setIsAddingProvider] = useState(false)
  const [providerTestStatus, setProviderTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [providerTestError, setProviderTestError] = useState('')

  // ── Approvals state ────────────────────────────────────────────────────────
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(() => loadApprovals())
  const missionStore = useMissionStore()
  const {
    activeMission,
    missionActive,
    missionGoal,
    activeMissionName,
    activeMissionGoal,
    missionState,
    boardTasks,
    missionTasks,
    dispatchedTaskIdsByAgent,
    agentSessionMap,
    agentSessionModelMap,
    agentSessionStatus,
    artifacts,
    restoreCheckpoint,
    beforeUnloadRegistered,
    startMission,
    completeMission,
    abortMission,
    setMissionState,
    restoreMission,
    setMissionGoal,
    setRestoreCheckpoint,
    setBoardTasks: _setBoardTasks,
    setDispatchedTaskIdsByAgent,
    setMissionTasks,
    setAgentSessionMap,
    setAgentSessionModelMap,
    setAgentSessionStatus,
    setArtifacts,
    setActiveMissionMeta,
    saveCheckpoint,
    markBeforeUnloadRegistered,
  } = missionStore
  const setMissionActive = useCallback((active: boolean) => {
    if (!active) {
      setMissionState('stopped')
      return
    }
    setMissionState((previous) => (previous === 'stopped' ? 'running' : previous))
  }, [setMissionState])
  const setActiveMissionName = useCallback((name: string) => {
    setActiveMissionMeta({ name })
  }, [setActiveMissionMeta])
  const setActiveMissionGoal = useCallback((goal: string) => {
    setActiveMissionMeta({ goal })
  }, [setActiveMissionMeta])
  const [, setRestoreDismissed] = useState(false)

  // ── Existing state ──────────────────────────────────────────────────────────
  const [isMobileHub, setIsMobileHub] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  )
  const [, setMissionBoardDrafts] = useState<MissionBoardDraft[]>([])
  const [missionBoardModalOpen, setMissionBoardModalOpen] = useState(false)
  const [missionWizardStep, setMissionWizardStep] = useState(0)
  const [newMissionName, setNewMissionName] = useState('')
  const [newMissionGoal, setNewMissionGoal] = useState('')
  const [newMissionTeamConfigId, setNewMissionTeamConfigId] = useState('__current__')
  const [newMissionProcessType, setNewMissionProcessType] = useState<'sequential' | 'hierarchical' | 'parallel'>('parallel')
  const [newMissionBudgetLimit, setNewMissionBudgetLimit] = useState('120000')
  const [maximizedMissionId, setMaximizedMissionId] = useState<string | null>(null)
  const [_view, setView] = useState<'board' | 'timeline'>('board')
  const [missionSubTab, setMissionSubTab] = useState<'all' | 'running' | 'needs_input' | 'complete' | 'failed'>('all')
  const [budgetLimit, setBudgetLimit] = useState('120000')
  const [, setActiveMissionBudgetLimit] = useState('')
  const [autoAssign, setAutoAssign] = useState(true)
  void autoAssign; void setAutoAssign // Sidebar controls removed; keeping state for future use
  const [, setTeamPanelFlash] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState<string>()
  const [selectedOutputAgentId, setSelectedOutputAgentId] = useState<string>()
  const [outputPanelVisible, setOutputPanelVisible] = useState(false)
  const [compactionBanner, setCompactionBanner] = useState<string | null>(null)

  useEffect(() => {
    if (!restoreCheckpoint || restoreCheckpoint.status !== 'running') return
    if (missionState !== 'stopped') return
    restoreMission(restoreCheckpoint)
    setActiveTab('missions')
    setMissionSubTab('running')
    agentSessionsDoneRef.current = new Set()
    expectedAgentCountRef.current = Object.keys(
      restoreCheckpoint.agentSessions || restoreCheckpoint.agentSessionMap || {},
    ).length
    setRetryingAgents({})
    agentRetryCountRef.current = {}
    retriedAgentsRef.current = new Set()
    pendingAgentRetryRef.current.clear()
    handledFailedSessionKeysRef.current.clear()
    agentRetryPayloadRef.current = {}
    for (const timer of agentRetryTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    agentRetryTimersRef.current.clear()
    sessionActivityRef.current = new Map()
    restoreGraceUntilRef.current = Date.now() + 20_000 // 20s grace for SSE to reconnect
    setRestoreCheckpoint(null)
    toast('Mission restored: Reconnected to running mission', { type: 'success' })
  }, [missionState, restoreCheckpoint, restoreMission, setRestoreCheckpoint])
  const [spawnState, setSpawnState] = useState<Record<string, 'idle' | 'spawning' | 'ready' | 'error'>>({})
  const [retryingAgents, setRetryingAgents] = useState<Record<string, boolean>>({})
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>('connected')
  const [, setAgentModelNotApplied] = useState<Record<string, boolean>>({})
  const [agentActivity, setAgentActivity] = useState<Record<string, AgentActivityEntry>>({})
  const [missionReports, setMissionReports] = useState<StoredMissionReport[]>(() => loadStoredMissionReports())
  const [missionHistory, setMissionHistory] = useState<MissionCheckpoint[]>(() => loadMissionHistory())
  const [artifactPreview, setArtifactPreview] = useState<MissionArtifact | null>(null)
  const [selectedReport, setSelectedReport] = useState<StoredMissionReport | null>(null)
  const [completionReportVisible, setCompletionReportVisible] = useState(false)
  const [completionReport, setCompletionReport] = useState<StoredMissionReport | null>(null)
  const [missionTokenCount, setMissionTokenCount] = useState(0)
  const [missionRealTokens, setMissionRealTokens] = useState(0)
  const [missionRealCost, setMissionRealCost] = useState(0)
  const [missionAllOAuth, setMissionAllOAuth] = useState(false)
  const [pausedByAgentId, setPausedByAgentId] = useState<Record<string, boolean>>({})
  const [steerAgentId, setSteerAgentId] = useState<string | null>(null)
  const [steerInput, setSteerInput] = useState('')
  const [team, setTeam] = useState<TeamMember[]>(() => {
    const stored = readStoredTeam()
    if (stored.length > 0) return stored
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) return runtimeTeam
    return buildTeamFromTemplate('research')
  })
  const [teamConfigs, setTeamConfigs] = useState<SavedTeamConfig[]>(() =>
    readStoredTeamConfigs(),
  )
  const [selectedTeamConfigId, setSelectedTeamConfigId] = useState('')
  const taskBoardRef = useRef<TaskBoardRef | null>(null)
  const teamPanelFlashTimerRef = useRef<number | undefined>(undefined)
  const pendingTaskMovesRef = useRef<Array<{ taskIds: Array<string>; status: TaskStatus }>>([])
  const sessionActivityRef = useRef<Map<string, string>>(new Map())
  const dispatchingRef = useRef(false)
  const artifactDedupRef = useRef<Set<string>>(new Set())
  const agentOutputLinesRef = useRef<Record<string, string[]>>({})
  const [agentOutputLines, setAgentOutputLines] = useState<Record<string, string[]>>({})
  const missionCompletionSnapshotRef = useRef<MissionReportPayload | null>(null)
  const prevMissionStateRef = useRef<'running' | 'paused' | 'stopped'>('stopped')
  const lastReportedMissionIdRef = useRef<string>('')
  const missionIdRef = useRef(activeMission?.id ?? '')
  const missionStartedAtRef = useRef(activeMission?.startedAt ?? 0)
  // Grace period after restore — prevents safety net from auto-completing before SSE reconnects
  const restoreGraceUntilRef = useRef<number>(0)
  // SSE streams for active agents (capped at MAX_AGENT_STREAMS)
  const agentStreamsRef = useRef<Map<string, EventSource>>(new Map())
  const agentStreamLastAtRef = useRef<Map<string, number>>(new Map())
  // Stable ref for team so feed-event callback always sees latest team
  const teamRef = useRef(team)
  const missionGoalRef = useRef(missionGoal)
  const pendingMissionNameRef = useRef('')
  const pendingMissionBudgetLimitRef = useRef('')
  const missionActiveRef = useRef(missionActive)
  const handleCreateMissionRef = useRef<() => void>(() => {})
  const scheduleAgentRetryRef = useRef<(agentId: string, sessionKey: string, reason: string) => void>(() => {})
  // Stable ref for buildMissionCompletionSnapshot — kept in sync each render so
  // SSE closures (which can't list missionTasks etc. in their own deps) can call it.
  const buildMissionCompletionSnapshotRef = useRef<() => MissionReportPayload | null>(() => null)
  // (Live Feed refs removed — sidebar no longer exists)
  // Tracks which agent session keys have sent their 'done' SSE event
  const agentSessionsDoneRef = useRef<Set<string>>(new Set())
  // Tracks the number of agents expected to complete for the current mission
  const expectedAgentCountRef = useRef(0)
  const agentRetryCountRef = useRef<Record<string, number>>({})
  const retriedAgentsRef = useRef<Set<string>>(new Set())
  const pendingAgentRetryRef = useRef<Set<string>>(new Set())
  const agentRetryTimersRef = useRef<Map<string, number>>(new Map())
  const handledFailedSessionKeysRef = useRef<Set<string>>(new Set())
  const agentRetryPayloadRef = useRef<Record<string, { tasks: Array<HubTask>; messageText: string }>>({})

  teamRef.current = team
  const missionId = activeMission?.id ?? ''
  const missionStartedAt = activeMission?.startedAt ?? 0
  missionIdRef.current = missionId
  missionStartedAtRef.current = missionStartedAt
  missionGoalRef.current = missionGoal
  missionActiveRef.current = missionActive

  const appendArtifacts = useCallback((nextArtifacts: MissionArtifact[]) => {
    if (nextArtifacts.length === 0) return
    setArtifacts((previous) => {
      const additions: MissionArtifact[] = []
      nextArtifacts.forEach((artifact) => {
        const signature = [
          artifact.agentId,
          artifact.title.toLowerCase(),
          artifact.type,
          artifact.content.trim(),
        ].join('|')
        if (artifactDedupRef.current.has(signature)) return
        artifactDedupRef.current.add(signature)
        additions.push(artifact)
      })
      if (additions.length === 0) return previous
      return [...previous, ...additions].sort((a, b) => b.timestamp - a.timestamp)
    })
  }, [])

  const captureAgentOutput = useCallback((agentId: string, text: string) => {
    const member = teamRef.current.find((entry) => entry.id === agentId)
    if (!member) return
    const cleaned = text.trim()
    if (!cleaned) return

    // ── Content-tail dedup guard ──────────────────────────────────────────
    // If the tail of the current buffer already ends with this exact text,
    // skip the append entirely. Prevents duplicate content from multiple
    // SSE connections (desktop panel + mobile panel + main useEffect).
    const currentBuffer = agentOutputLinesRef.current[agentId] ?? []
    const bufferTail = currentBuffer.slice(-10).join('\n')
    if (bufferTail.length > 0 && cleaned.length > 0) {
      // Exact tail match — incoming text is already at the end of the buffer
      if (bufferTail.endsWith(cleaned) || bufferTail === cleaned) return
      // Or the incoming text ends with the buffer tail (superset — still dup)
      if (cleaned.length <= bufferTail.length && bufferTail.endsWith(cleaned)) return
    }

    const nextLines = cleaned
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-6)

    if (nextLines.length > 0) {
      const current = agentOutputLinesRef.current[agentId] ?? []
      // Deduplicate: skip lines already present in the tail of the current buffer
      const existingSet = new Set(current.slice(-20))
      const freshLines = nextLines.filter((line) => !existingSet.has(line))
      if (freshLines.length === 0) return

      agentOutputLinesRef.current[agentId] = [...current, ...freshLines].slice(-200)
      setAgentOutputLines((prev) => ({
        ...prev,
        [agentId]: [...(prev[agentId] ?? []), ...freshLines].slice(-200),
      }))
    }

    appendArtifacts(
      extractArtifactsFromOutput({
        agentId,
        agentName: member.name,
        text: cleaned,
        timestamp: Date.now(),
      }),
    )
  }, [appendArtifacts])

  const buildMissionCompletionSnapshot = useCallback((): MissionReportPayload | null => {
    if (!missionId) return null
    const goal = activeMissionGoal || missionGoal || 'Untitled mission'
    const name = activeMissionName.trim() || undefined
    const startedAt = missionStartedAt || Date.now()
    const completedAt = Date.now()
    const teamSnapshot = teamRef.current.map((member) => ({ ...member }))
    const tasksSnapshot = (missionTasks.length > 0 ? missionTasks : boardTasks).map((task) => ({ ...task }))
    const artifactsSnapshot = artifacts.map((artifact) => ({ ...artifact }))
    const agentSummaries: MissionAgentSummary[] = teamSnapshot.map((member) => ({
      agentId: member.id,
      agentName: member.name,
      modelId: member.modelId,
      lines: agentOutputLinesRef.current[member.id] ?? [],
    }))
    const resolvedTemplate = resolveActiveTemplate(teamSnapshot)
    const teamName = resolvedTemplate ? TEMPLATE_DISPLAY_NAMES[resolvedTemplate] : `Custom Team (${teamSnapshot.length})`

    return {
      missionId,
      name,
      goal,
      teamName,
      startedAt,
      completedAt,
      team: teamSnapshot,
      tasks: tasksSnapshot,
      artifacts: artifactsSnapshot,
      tokenCount: missionRealTokens > 0 ? missionRealTokens : missionTokenCount,
      agentSummaries,
      needsEnrichment: true,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMissionGoal, activeMissionName, artifacts, boardTasks, missionGoal, missionRealTokens, missionTasks, missionTokenCount])

  const stopMissionAndCleanup = useCallback((reason: 'aborted' | 'completed' = 'aborted') => {
    missionCompletionSnapshotRef.current = buildMissionCompletionSnapshot()

    Object.values(agentSessionMap).forEach((sessionKey) => {
      fetch('/api/chat-abort', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey }),
      }).catch(() => {})
    })

    setAgentSessionMap({})
    setSpawnState({})
    setAgentSessionStatus({})
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('clawsuite:hub-agent-sessions')
    }
    if (reason === 'completed') {
      completeMission()
    } else {
      abortMission()
    }
    setMissionState('stopped')
    setMissionActive(false)
    setActiveMissionName('')
    setActiveMissionGoal('')
    setMissionTasks([])
    setDispatchedTaskIdsByAgent({})
    setPausedByAgentId({})
    setSelectedOutputAgentId(undefined)
    setActiveTab('missions')
    // Auto-switch filter tab based on abort/complete reason
    setMissionSubTab(reason === 'aborted' ? 'failed' : 'complete')
    setRetryingAgents({})
    agentRetryCountRef.current = {}
    retriedAgentsRef.current = new Set()
    pendingAgentRetryRef.current.clear()
    handledFailedSessionKeysRef.current.clear()
    agentRetryPayloadRef.current = {}
    for (const timer of agentRetryTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    agentRetryTimersRef.current.clear()
    dispatchingRef.current = false
    pendingTaskMovesRef.current = []
    sessionActivityRef.current = new Map()
    taskBoardRef.current = null
    setMissionHistory(loadMissionHistory())
  }, [
    abortMission,
    agentSessionMap,
    buildMissionCompletionSnapshot,
    completeMission,
    missionReports,
    setActiveMissionGoal,
    setActiveMissionName,
    setDispatchedTaskIdsByAgent,
    setMissionActive,
    setMissionTasks,
  ])

  // Live template suggestion based on current mission goal input
  const suggestedTemplateName = useMemo(() => {
    const trimmed = missionGoal.trim()
    if (!trimmed) return null
    const templateId = suggestTemplate(trimmed)
    return TEMPLATE_DISPLAY_NAMES[templateId]
  }, [missionGoal])

  const wizardStep = WIZARD_STEP_ORDER[wizardStepIndex] ?? 'gateway'

  const modelsQuery = useQuery({
    queryKey: ['gateway-models'],
    queryFn: async (): Promise<GatewayModelsResponse> => {
      const response = await fetch('/api/models')
      if (!response.ok) {
        throw new Error(`Failed to load models (${response.status})`)
      }
      return (await response.json()) as GatewayModelsResponse
    },
    staleTime: 30_000,
    retry: 1,
  })

  const gatewayModels = useMemo(() => {
    const rows = Array.isArray(modelsQuery.data?.models) ? modelsQuery.data.models : []
    const seen = new Set<string>()
    return rows
      .map((entry) => {
        const provider = typeof entry.provider === 'string' ? entry.provider.trim() : ''
        const id = typeof entry.id === 'string' ? entry.id.trim() : ''
        const name = typeof entry.name === 'string' ? entry.name.trim() : ''
        if (!provider || !id) return null
        const value = `${provider}/${id}`
        if (seen.has(value)) return null
        seen.add(value)
        return {
          value,
          provider,
          label: name || id,
        }
      })
      .filter((entry): entry is { value: string; provider: string; label: string } => Boolean(entry))
  }, [modelsQuery.data?.models])

  const gatewayModelLabelById = useMemo(
    () =>
      new Map(
        gatewayModels.map((model) => [model.value, { label: model.label, provider: model.provider }] as const),
      ),
    [gatewayModels],
  )

  const addProviderAvailableModels = useMemo(() => {
    const provider = addProviderName.trim().toLowerCase()
    if (!provider) return []
    return gatewayModels.filter(
      (model) => model.provider.trim().toLowerCase() === provider,
    )
  }, [addProviderName, gatewayModels])

  useEffect(() => {
    if (!selectedModel) return
    const isStillAvailable = addProviderAvailableModels.some((model) => model.value === selectedModel)
    if (!isStillAvailable) {
      setSelectedModel('')
    }
  }, [addProviderAvailableModels, selectedModel])

  const refreshGatewayStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/gateway/status')
      const payload = (await res.json().catch(() => ({}))) as {
        connected?: boolean
      }
      const connected = res.ok && payload.connected !== false
      setGatewayStatus(connected ? 'connected' : 'disconnected')
      return connected
    } catch {
      setGatewayStatus('disconnected')
      return false
    }
  }, [])

  const refreshConfiguredProviders = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/models')
      if (!response.ok) {
        setConfiguredProviders([])
        return
      }
      const payload = (await response.json()) as {
        configuredProviders?: unknown
      }
      const providers = Array.isArray(payload.configuredProviders)
        ? payload.configuredProviders.filter(
            (provider): provider is string =>
              typeof provider === 'string' && provider.trim().length > 0,
          )
        : []
      setConfiguredProviders(providers)
    } catch {
      setConfiguredProviders([])
    }
  }, [])

  const handleAddProvider = useCallback(async () => {
    const provider = addProviderName.trim()
    const apiKey = addProviderApiKey.trim()
    const defaultModel = selectedModel.trim()

    if (!provider) {
      toast('Provider name is required', { type: 'error' })
      return
    }
    if (!apiKey) {
      toast('API key is required', { type: 'error' })
      return
    }

    setIsAddingProvider(true)
    try {
      const response = await fetch('/api/gateway-config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add-provider',
          provider,
          apiKey,
          defaultModel: defaultModel || undefined,
          baseUrl: addProviderBaseUrl.trim() || undefined,
          apiType: addProviderApiType.trim() || undefined,
        }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean
        error?: unknown
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(
          typeof payload.error === 'string' && payload.error
            ? payload.error
            : `Failed to add provider (${response.status})`,
        )
      }

      setAddProviderApiKey('')
      setAddProviderBaseUrl('')
      setAddProviderApiType('openai-completions')
      setAddProviderName('')
      setAddProviderSelection('')
      setSelectedModel('')
      await refreshConfiguredProviders()
      void modelsQuery.refetch()
      toast(`Provider "${provider}" added`, { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to add provider', {
        type: 'error',
      })
    } finally {
      setIsAddingProvider(false)
    }
  }, [addProviderApiKey, addProviderName, modelsQuery, refreshConfiguredProviders, selectedModel])

  const handleTestProviderKey = useCallback(async () => {
    if (!addProviderApiKey.trim() || !addProviderName.trim()) return
    setProviderTestStatus('testing')
    setProviderTestError('')
    try {
      const resp = await fetch('/api/validate-provider', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providerId: addProviderName.toLowerCase(), apiKey: addProviderApiKey.trim() }),
      })
      const data = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (data.ok) {
        setProviderTestStatus('ok')
      } else {
        setProviderTestStatus('error')
        setProviderTestError(data.error ?? 'Connection failed')
      }
    } catch {
      setProviderTestStatus('error')
      setProviderTestError('Network error — could not reach gateway')
    }
  }, [addProviderApiKey, addProviderName])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(team))
  }, [team])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      TEAM_CONFIGS_STORAGE_KEY,
      JSON.stringify(teamConfigs),
    )
  }, [teamConfigs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const combined: Record<string, AgentSessionInfo> = {}
    for (const [id, sessionKey] of Object.entries(agentSessionMap)) {
      const model = agentSessionModelMap[id]
      combined[id] = model ? { sessionKey, model } : { sessionKey }
    }
    window.localStorage.setItem('clawsuite:hub-agent-sessions', JSON.stringify(combined))
  }, [agentSessionMap, agentSessionModelMap])

  useEffect(() => {
    if (typeof window === 'undefined' || beforeUnloadRegistered) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (useMissionStore.getState().missionState !== 'running') return
      saveMissionStoreBeforeUnload()
      event.preventDefault()
      event.returnValue = ''
    }

    markBeforeUnloadRegistered(true)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (useMissionStore.getState().missionState === 'running') {
        saveMissionStoreBeforeUnload()
      }
      markBeforeUnloadRegistered(false)
    }
  }, [beforeUnloadRegistered, markBeforeUnloadRegistered])

  useEffect(() => {
    if (team.length > 0) return
    const runtimeTeam = buildTeamFromRuntime(agents)
    if (runtimeTeam.length > 0) {
      setTeam(runtimeTeam)
      return
    }
    setTeam(buildTeamFromTemplate('research'))
  }, [agents, team.length])

  useEffect(() => {
    if (!selectedAgentId) return
    const exists = team.some((member) => member.id === selectedAgentId)
    if (!exists) setSelectedAgentId(undefined)
  }, [selectedAgentId, team])

  useEffect(() => {
    if (!selectedOutputAgentId) return
    const exists = team.some((member) => member.id === selectedOutputAgentId)
    if (!exists) setSelectedOutputAgentId(undefined)
  }, [selectedOutputAgentId, team])

  useEffect(() => {
    setPausedByAgentId((previous) => {
      const validAgentIds = new Set(Object.keys(agentSessionMap))
      const next: Record<string, boolean> = {}
      for (const [agentId, paused] of Object.entries(previous)) {
        if (paused && validAgentIds.has(agentId)) {
          next[agentId] = true
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) {
        return previous
      }
      return next
    })
  }, [agentSessionMap])

  useEffect(
    () => () => {
      if (teamPanelFlashTimerRef.current !== undefined) {
        window.clearTimeout(teamPanelFlashTimerRef.current)
      }
      for (const timer of agentRetryTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      agentRetryTimersRef.current.clear()
    },
    [],
  )

  useEffect(() => {
    if (missionState !== 'stopped') return
    setRetryingAgents({})
    agentRetryCountRef.current = {}
    retriedAgentsRef.current = new Set()
    pendingAgentRetryRef.current.clear()
    handledFailedSessionKeysRef.current.clear()
    agentRetryPayloadRef.current = {}
    for (const timer of agentRetryTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    agentRetryTimersRef.current.clear()
  }, [missionState])

  // Mobile viewport detection
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobileHub(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // Gateway status polling every 15s
  useEffect(() => {
    async function checkGateway() {
      const connected = await refreshGatewayStatus()
      if (connected) {
        void refreshConfiguredProviders()
      } else {
        setConfiguredProviders([])
      }
    }
    void checkGateway()
    const interval = window.setInterval(() => {
      void checkGateway()
    }, 15_000)
    return () => window.clearInterval(interval)
  }, [refreshConfiguredProviders, refreshGatewayStatus])

  // Avatar picker: close on outside click
  useEffect(() => {
    if (!avatarPickerOpenId) return
    function onDown(e: MouseEvent) {
      const target = e.target as Element
      if (!target.closest('[data-avatar-picker]')) {
        setAvatarPickerOpenId(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [avatarPickerOpenId])

  // Gateway approvals polling every 8s — merge into local approval state
  useEffect(() => {
    let cancelled = false
    const seenGatewayIds = new Set<string>()

    async function pollGatewayApprovals() {
      try {
        const response = await fetchGatewayApprovals()
        if (cancelled) return
        const raw = response.approvals ?? response.pending ?? []
        if (raw.length === 0) return

        setApprovals((current) => {
          const existingGatewayIds = new Set(
            current.filter(a => a.source === 'gateway').map(a => a.gatewayApprovalId).filter(Boolean)
          )
          const toAdd = raw.filter(entry => {
            if (!entry.id) return false
            if (existingGatewayIds.has(entry.id)) return false
            if (seenGatewayIds.has(entry.id)) return false
            if ((entry.status ?? 'pending') !== 'pending') return false
            return true
          })
          if (toAdd.length === 0) return current

          const newApprovals = toAdd.map(entry => {
            seenGatewayIds.add(entry.id)
            const action = entry.action ?? entry.tool ?? 'Gateway action requires approval'
            return {
              id: `gw-${entry.id}`,
              agentId: entry.sessionKey ?? 'gateway',
              agentName: entry.agentName ?? entry.sessionKey ?? 'Gateway',
              action: typeof action === 'string' ? action : JSON.stringify(action),
              context: entry.context ?? (entry.input ? JSON.stringify(entry.input, null, 2) : ''),
              requestedAt: entry.requestedAt ?? Date.now(),
              status: 'pending' as const,
              source: 'gateway' as const,
              gatewayApprovalId: entry.id,
            }
          })

          const merged = [...newApprovals, ...current]
          saveApprovals(merged)
          return merged
        })
      } catch {
        // gateway may not have approvals endpoint — silently skip
      }
    }

    void pollGatewayApprovals()
    const interval = window.setInterval(() => void pollGatewayApprovals(), 8_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // stable — uses setApprovals (setter is stable)

  useEffect(() => {
    if (!wizardOpen || wizardStep !== 'gateway') return
    let cancelled = false
    setWizardCheckingGateway(true)
    void (async () => {
      const connected = await refreshGatewayStatus()
      if (!cancelled) {
        if (connected) {
          await refreshConfiguredProviders()
        } else {
          setConfiguredProviders([])
        }
      }
      if (!cancelled) {
        setWizardCheckingGateway(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    refreshConfiguredProviders,
    refreshGatewayStatus,
    wizardOpen,
    wizardStep,
  ])

  // Feed event tracking (Live Feed UI removed — events still logged internally via feed-event-bus)

  // ── Feed event → agentActivity + approval parsing ─────────────────────────
  // Update last-line activity from feed events (agent_active, agent_spawned, etc.)
  // Also parse APPROVAL_REQUIRED: markers from assistant messages.
  useEffect(() => {
    const unsubscribe = onFeedEvent((event) => {
      if (!event.agentName) return
      const currentTeam = teamRef.current
      const member = currentTeam.find((m) => m.name === event.agentName)
      if (!member) return
      if (
        event.type === 'agent_active' ||
        event.type === 'agent_spawned' ||
        event.type === 'task_assigned'
      ) {
        setAgentActivity((prev) => ({
          ...prev,
          [member.id]: {
            ...prev[member.id],
            lastLine: event.message,
            lastAt: event.timestamp,
            lastEventType: 'system',
          },
        }))
      }

      // Parse APPROVAL_REQUIRED from assistant messages
      const content = event.message ?? ''
      if (content.includes('APPROVAL_REQUIRED:')) {
        const agentId = member.id
        const agentName = member.name
        const action = content.split('APPROVAL_REQUIRED:')[1]?.split('\n')[0]?.trim() ?? content
        addApproval({ agentId, agentName, action, context: content })
        setApprovals(loadApprovals())
      }
    })
    return unsubscribe
  }, []) // uses teamRef — stable

  // ── SSE streams for active agents ─────────────────────────────────────────
  // Open SSE streams for up to 3 simultaneously-active agents; close stale ones.
  const MAX_AGENT_STREAMS = 3
  useEffect(() => {
    const streams = agentStreamsRef.current
    const lastAtMap = agentStreamLastAtRef.current
    const currentTeam = teamRef.current

    // Determine which agents have known sessions (capped at MAX_AGENT_STREAMS).
    // Open the SSE stream as soon as a sessionKey exists — don't gate on
    // agentSessionStatus being 'active' because agents start as 'spawning'/'ready'
    // and the stream needs to be open to receive the first events.
    const activeAgentIds = currentTeam
      .filter((m) => agentSessionMap[m.id] != null)
      .slice(0, MAX_AGENT_STREAMS)
      .map((m) => m.id)

    const activeSessionKeys = new Set(
      activeAgentIds.map((id) => agentSessionMap[id]).filter(Boolean),
    )

    // Close streams for agents no longer active
    for (const [sessionKey, source] of streams) {
      if (!activeSessionKeys.has(sessionKey)) {
        source.close()
        streams.delete(sessionKey)
        lastAtMap.delete(sessionKey)
      }
    }

    // Open new streams for newly-active agents
    for (const agentId of activeAgentIds) {
      const sessionKey = agentSessionMap[agentId]
      if (!sessionKey || streams.has(sessionKey)) continue
      if (streams.size >= MAX_AGENT_STREAMS) break

      const source = new EventSource(
        `/api/chat-events?sessionKey=${encodeURIComponent(sessionKey)}`,
      )
      streams.set(sessionKey, source)
      lastAtMap.set(sessionKey, Date.now())

      const markStreamAlive = () => {
        lastAtMap.set(sessionKey, Date.now())
      }

      const handleUpdate = (text: string, type: AgentActivityEntry['lastEventType']) => {
        if (!text) return
        markStreamAlive()
        setAgentActivity((prev) => ({
          ...prev,
          [agentId]: {
            lastLine: text,
            lastAt: Date.now(),
            lastEventType: type,
          },
        }))
        // ── Compaction detection ────────────────────────────────────────
        const lower = text.toLowerCase()
        if (lower.includes('compaction') || lower.includes('context compacted') || lower.includes('pre-compaction')) {
          const agentName = currentTeam.find((m) => m.id === agentId)?.name ?? agentId
          setCompactionBanner(`Context compacted for ${agentName} — session history summarized`)
          window.setTimeout(() => setCompactionBanner(null), 8_000)
        }
      }

      source.addEventListener('chunk', (event) => {
        if (!(event instanceof MessageEvent)) return
        markStreamAlive()
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          const text = String(data.text ?? data.content ?? data.chunk ?? '').trim()
          if (text && data.fullReplace !== true) {
            setMissionTokenCount((current) => current + Math.ceil(text.length / 4))
            captureAgentOutput(agentId, text)
          }
          handleUpdate(text, 'assistant')
          if (text.includes('APPROVAL_REQUIRED:')) {
            const member = currentTeam.find((m) => m.id === agentId)
            if (member) {
              const action =
                text.split('APPROVAL_REQUIRED:')[1]?.split('\n')[0]?.trim() ?? text
              addApproval({
                agentId: member.id,
                agentName: member.name,
                action,
                context: text,
              })
              setApprovals(loadApprovals())
            }
          }
        } catch { /* ignore parse errors */ }
      })

      source.addEventListener('tool', (event) => {
        if (!(event instanceof MessageEvent)) return
        markStreamAlive()
        try {
          const data = JSON.parse(event.data as string) as Record<string, unknown>
          const name = String(data.name ?? 'tool')
          handleUpdate(`${name}()`, 'tool')
        } catch { /* ignore parse errors */ }
      })

      source.addEventListener('message', (event) => {
        if (!(event instanceof MessageEvent)) return
        markStreamAlive()
        const payload = parseSsePayload(event.data as string)
        if (!payload) return
        const role = readEventRole(payload)
        if (role !== 'assistant') return
        const text = readEventText(payload)
        if (!text) return
        captureAgentOutput(agentId, text)
      })
      source.addEventListener('done', (event) => {
        markStreamAlive()

        // ── Extract the final message text from the done event ────────────
        let finalText = ''
        if (event instanceof MessageEvent) {
          try {
            const data = JSON.parse(event.data as string) as Record<string, unknown>
            finalText = extractTextFromMessage(data.message) || String(data.text ?? data.content ?? '')
          } catch { /* ignore parse errors */ }
        }
        // Also check the last captured output lines for this agent
        if (!finalText) {
          const captured = agentOutputLinesRef.current[agentId]
          finalText = captured?.[captured.length - 1] ?? ''
        }

        const turnResult = classifyAgentTurnEnd(finalText)
        const agentName = teamRef.current.find((m) => m.id === agentId)?.name ?? agentId

        if (turnResult === 'waiting_for_input') {
          // ── Agent is asking a question / needs input — do NOT mark as done ──
          setAgentSessionStatus((prev) => ({
            ...prev,
            [agentId]: { status: 'waiting_for_input', lastSeen: Date.now(), lastMessage: finalText },
          }))
          // Auto-switch to Needs Input tab so user sees the prompt
          setMissionSubTab('needs_input')
          emitFeedEvent({
            type: 'agent_active',
            message: `${agentName} is waiting for input`,
            agentName,
          })
          return // Do NOT mark tasks done or trigger auto-completion
        }

        // ── Agent has genuinely completed its work ──────────────────────────
        agentSessionsDoneRef.current.add(sessionKey)

        // Mark agent status as idle (completed)
        setAgentSessionStatus((prev) => ({
          ...prev,
          [agentId]: { status: 'idle', lastSeen: Date.now() },
        }))

        // ── Mark this agent's tasks as done ──────────────────────────────
        setMissionTasks((prev: HubTask[]) => {
          const updated = prev.map((task: HubTask) =>
            task.agentId === agentId && task.status !== 'done'
              ? { ...task, status: 'done' as TaskStatus, updatedAt: Date.now() }
              : task
          )
          const justCompleted = updated.filter(
            (t: HubTask, i: number) => t.status === 'done' && prev[i]?.status !== 'done',
          )
          if (justCompleted.length > 0) {
            justCompleted.forEach((task: HubTask) => {
              emitFeedEvent({
                type: 'task_completed',
                message: `${agentName} completed: ${task.title}`,
                agentName,
                taskTitle: task.title,
              })
            })
            saveCheckpoint()
          }
          return updated
        })

        const doneCount = agentSessionsDoneRef.current.size
        const expected = expectedAgentCountRef.current

        // Auto-complete: if all expected agents have finished, stop the mission.
        // Delay long enough for final SSE output to flush into agentOutputLinesRef
        // so the mission report captures all agent output (not just partial).
        if (expected > 0 && doneCount >= expected) {
          window.setTimeout(() => {
            // Capture snapshot AFTER output has settled (uses fresh ref to avoid stale closure)
            missionCompletionSnapshotRef.current = buildMissionCompletionSnapshotRef.current()
            setMissionState((prev) => (prev === 'running' ? 'stopped' : prev))
            emitFeedEvent({
              type: 'mission_started',
              message: `✓ All ${expected} agents completed — mission auto-finished`,
            })
          }, 5000)
        }
      })
      source.addEventListener('open', () => {
        markStreamAlive()
        handledFailedSessionKeysRef.current.delete(sessionKey)
      })
      source.addEventListener('error', () => {
        markStreamAlive()
        if (source.readyState !== EventSource.CLOSED) return
        scheduleAgentRetryRef.current(agentId, sessionKey, 'SSE connection closed')
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentSessionMap, captureAgentOutput]) // intentionally omit teamRef (stable ref); agentSessionStatus no longer gates stream open

  // Stale SSE stream pruner (60s inactivity → close) + unmount cleanup
  useEffect(() => {
    const interval = window.setInterval(() => {
      const streams = agentStreamsRef.current
      const lastAtMap = agentStreamLastAtRef.current
      const now = Date.now()
      for (const [sessionKey, source] of streams) {
        const lastAt = lastAtMap.get(sessionKey) ?? 0
        if (now - lastAt > 60_000) {
          const agentId = Object.entries(agentSessionMap).find(([, key]) => key === sessionKey)?.[0]
          source.close()
          streams.delete(sessionKey)
          lastAtMap.delete(sessionKey)
          if (agentId) {
            scheduleAgentRetryRef.current(agentId, sessionKey, 'SSE stream timed out')
          }
        }
      }
    }, 10_000)

    return () => {
      window.clearInterval(interval)
      // Close all streams on unmount
      for (const source of agentStreamsRef.current.values()) {
        source.close()
      }
      agentStreamsRef.current.clear()
      agentStreamLastAtRef.current.clear()
    }
  }, [agentSessionMap])

  // Keyboard shortcuts (desktop only): Cmd/Ctrl+Enter → Start Mission; Space → pause/resume mission; Escape → close panel / deselect
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
      const modKey = isMac ? event.metaKey : event.ctrlKey
      const target = event.target instanceof Element ? event.target : null
      const tagName = target?.tagName ?? ''
      const isTypingTarget =
        !!target?.closest('button, select, a, [role=button], input, textarea, [contenteditable]')

      // Cmd/Ctrl+Enter: Start Mission when textarea is focused and has content
      if (modKey && event.key === 'Enter') {
        if (tagName === 'TEXTAREA' && missionGoalRef.current.trim()) {
          event.preventDefault()
          handleCreateMissionRef.current()
        }
        return
      }

      if (
        event.code === 'Space' &&
        !event.repeat &&
        !event.altKey &&
        !event.shiftKey &&
        !modKey
      ) {
        if (isTypingTarget) return
        if (!missionActiveRef.current) return
        event.preventDefault()
        void handleMissionPause(missionState === 'running')
        return
      }

      // Escape: Close output panel → deselect agent
      if (event.key === 'Escape') {
        // Don't interfere when user is typing in an input/textarea
        if (isTypingTarget) return
        setSelectedOutputAgentId((prev) => {
          if (prev) return undefined
          setSelectedAgentId(undefined)
          return undefined
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // uses refs — stable, no deps needed

  const runtimeById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [
    agents,
  ])

  const teamWithRuntimeStatus = useMemo(
    () =>
      team.map((member) => {
        const runtimeAgent = runtimeById.get(member.id)
        if (!runtimeAgent) return member
        return {
          ...member,
          status: runtimeAgent.status || member.status,
        }
      }),
    [runtimeById, team],
  )

  const activeTaskSource = useMemo(
    () => (missionActive && missionTasks.length > 0 ? missionTasks : boardTasks),
    [boardTasks, missionActive, missionTasks],
  )
  const agentTaskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    activeTaskSource.forEach((task) => {
      if (!task.agentId) return
      counts[task.agentId] = (counts[task.agentId] ?? 0) + 1
    })
    return counts
  }, [activeTaskSource])
  const activeTemplateId = useMemo(() => resolveActiveTemplate(team), [team])
  const teamById = useMemo(
    () => new Map(teamWithRuntimeStatus.map((member) => [member.id, member])),
    [teamWithRuntimeStatus],
  )
  const selectedOutputTasks = useMemo(() => {
    if (!selectedOutputAgentId) return []
    const taskSource = boardTasks.length > 0 ? boardTasks : missionTasks
    const dispatchedTaskIds = dispatchedTaskIdsByAgent[selectedOutputAgentId]
    if (!dispatchedTaskIds || dispatchedTaskIds.length === 0) {
      return taskSource.filter((task) => task.agentId === selectedOutputAgentId)
    }

    const dispatchedSet = new Set(dispatchedTaskIds)
    return taskSource.filter(
      (task) => task.agentId === selectedOutputAgentId && dispatchedSet.has(task.id),
    )
  }, [boardTasks, dispatchedTaskIdsByAgent, missionTasks, selectedOutputAgentId])
  const selectedOutputAgentName = selectedOutputAgentId
    ? teamById.get(selectedOutputAgentId)?.name ?? selectedOutputAgentId
    : ''
  const selectedOutputModelId = selectedOutputAgentId
    ? teamById.get(selectedOutputAgentId)?.modelId
    : undefined

  // Build AgentWorkingRow array for AgentsWorkingPanel
  const agentWorkingRows = useMemo((): AgentWorkingRow[] => {
    return teamWithRuntimeStatus.map((member) => {
      const sessionStatus = agentSessionStatus[member.id]
      const spawnStatus = spawnState[member.id]
      const sessionKey = agentSessionMap[member.id]
      const hasSession = Boolean(sessionKey)
      const activity = agentActivity[member.id]
      const isPaused = pausedByAgentId[member.id] === true

      // Resolve working status
      let status: AgentWorkingStatus
      if (spawnStatus === 'spawning') {
        status = 'spawning'
      } else if (isPaused) {
        status = 'paused'
      } else if (!hasSession) {
        status = spawnStatus === 'error' ? 'error' : 'none'
      } else if (!sessionStatus) {
        status = 'ready'
      } else if (sessionStatus.status === 'error') {
        status = 'error'
      } else if (sessionStatus.status === 'waiting_for_input') {
        status = 'waiting_for_input'
      } else if (sessionStatus.status === 'active') {
        status = 'active'
      } else {
        status = 'idle'
      }

      const inProgressTask = activeTaskSource.find(
        (t) => t.agentId === member.id && t.status === 'in_progress',
      )

      // Prefer SSE stream activity over session poll lastMessage
      const lastLine = activity?.lastLine ?? sessionStatus?.lastMessage
      const lastAt = activity?.lastAt ?? (sessionStatus?.lastSeen ?? undefined)

      return {
        id: member.id,
        name: member.name,
        modelId: member.modelId,
        roleDescription: member.roleDescription,
        status,
        lastLine,
        lastAt,
        taskCount: agentTaskCounts[member.id] ?? 0,
        currentTask: inProgressTask?.title,
        sessionKey,
      }
    })
  }, [
    teamWithRuntimeStatus,
    agentSessionStatus,
    spawnState,
    agentSessionMap,
    agentActivity,
    pausedByAgentId,
    activeTaskSource,
    agentTaskCounts,
  ])
  const selectedOutputStatusLabel = useMemo(() => {
    if (!selectedOutputAgentId) return undefined
    const row = agentWorkingRows.find((entry) => entry.id === selectedOutputAgentId)
    return row ? toTitleCase(row.status) : undefined
  }, [agentWorkingRows, selectedOutputAgentId])

  // Safety net: auto-complete mission if all agents reach terminal state (handles missed SSE done events).
  // Agents in 'waiting_for_input' are NOT terminal — the mission stays open for human input.
  useEffect(() => {
    if (!missionActive || missionState !== 'running') return
    if (agentWorkingRows.length === 0) return
    // Skip during restore grace period — SSE streams need time to reconnect and populate status
    if (Date.now() < restoreGraceUntilRef.current) return
    const anyWaiting = agentWorkingRows.some((r) => r.status === 'waiting_for_input')
    if (anyWaiting) return // Mission needs human input — don't auto-close
    const anyRetrying = Object.values(retryingAgents).some(Boolean)
    if (anyRetrying) return
    const allTerminal = agentWorkingRows.every((r) =>
      r.status === 'idle' || r.status === 'none' || r.status === 'error'
    )
    if (!allTerminal) return
    const timer = window.setTimeout(() => {
      // Capture snapshot AFTER output has settled (uses fresh ref to avoid stale closure)
      missionCompletionSnapshotRef.current = buildMissionCompletionSnapshotRef.current()
      setMissionState((prev) => (prev === 'running' ? 'stopped' : prev))
      emitFeedEvent({ type: 'mission_started', message: '✓ All agents reached terminal state — mission complete' })
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [agentWorkingRows, missionActive, missionState, retryingAgents])

  // Global agent pool: active team + all agents from saved team configs (deduped by id)
  const allKnownAgents = useMemo(() => {
    const seen = new Set<string>()
    const pool: typeof team = []
    for (const m of team) {
      if (!seen.has(m.id)) { seen.add(m.id); pool.push(m) }
    }
    for (const config of teamConfigs) {
      for (const m of config.team) {
        if (!seen.has(m.id)) {
          seen.add(m.id)
          pool.push({ ...m, status: m.status ?? 'available' })
        }
      }
    }
    return pool
  }, [team, teamConfigs])

  const moveTasksToStatus = useCallback((taskIds: Array<string>, status: TaskStatus) => {
    if (taskIds.length === 0) return
    const uniqueTaskIds = Array.from(new Set(taskIds))
    const ids = new Set(uniqueTaskIds)

    setMissionTasks((previous: HubTask[]) => {
      const updated = previous.map((task: HubTask) => {
        if (!ids.has(task.id) || task.status === status) return task
        return { ...task, status, updatedAt: Date.now() }
      })
      return updated
    })
    saveCheckpoint()

    const boardApi = taskBoardRef.current
    if (boardApi) {
      boardApi.moveTasks(uniqueTaskIds, status)
      return
    }

    pendingTaskMovesRef.current.push({ taskIds: uniqueTaskIds, status })
  }, [])

  const dispatchAgentTasks = useCallback(async ({
    sessionKey,
    agentId,
    agentTasks,
    messageText,
    member,
  }: {
    sessionKey: string
    agentId: string
    agentTasks: Array<HubTask>
    messageText: string
    member?: TeamMember
  }): Promise<void> => {
    const modelString = member ? resolveGatewayModelId(member.modelId) : ''

    const response = await fetch('/api/agent-dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionKey,
        message: messageText,
        agentId,
        model: modelString || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    })

    if (!response.ok) {
      const payload = (await response
        .json()
        .catch(() => ({}))) as Record<string, unknown>
      const errorMessage =
        readString(payload.error) || readString(payload.message) || `HTTP ${response.status}`
      emitFeedEvent({
        type: 'system',
        message: `Failed to dispatch to ${member?.name || agentId}: ${errorMessage}`,
      })
      const taskIds = agentTasks.map((task) => task.id)
      moveTasksToStatus(taskIds, 'done')
      agentSessionsDoneRef.current.add(sessionKey)
      setAgentSessionStatus((prev) => ({
        ...prev,
        [agentId]: { status: 'error', lastSeen: Date.now(), lastMessage: errorMessage },
      }))
      throw new Error(errorMessage)
    }

    const taskIds = agentTasks.map((task) => task.id)
    setDispatchedTaskIdsByAgent((previous) => ({
      ...previous,
      [agentId]: taskIds,
    }))
    moveTasksToStatus(taskIds, 'in_progress')

    agentTasks.forEach((task) => {
      emitFeedEvent({
        type: 'agent_active',
        message: `${member?.name || agentId} started working on: ${task.title}`,
        agentName: member?.name,
        taskTitle: task.title,
      })
    })
  }, [moveTasksToStatus, setDispatchedTaskIdsByAgent])
  const spawnAgentSession = useCallback(async (
    member: TeamMember,
    options?: { reuseExisting?: boolean; labelSuffix?: string },
  ): Promise<string> => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const baseName = member.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const friendlyId = `hub-${baseName}-${suffix}`
    const reuseExisting = options?.reuseExisting !== false
    const labelSuffix = options?.labelSuffix ? ` (${options.labelSuffix})` : ''
    const label = `Mission: ${member.name}${labelSuffix}`

    // Check if a session with this label already exists — reuse it instead of
    // trying to create a duplicate (gateway enforces unique labels).
    if (reuseExisting) {
      try {
        const listResp = await fetch('/api/sessions')
        if (listResp.ok) {
          const listData = (await listResp.json()) as { sessions?: Array<Record<string, unknown>> }
          const existing = (listData.sessions ?? []).find(
            (s) => typeof s.label === 'string' && s.label === label,
          )
          if (existing) {
            const existingKey = readString(existing.key)
            if (existingKey) return existingKey
          }
        }
      } catch {
        // If the lookup fails, fall through to normal spawn
      }
    }

    const modelString = resolveGatewayModelId(member.modelId)
    const requestBody: {
      exec: string
      friendlyId: string
      isolated: boolean
      label: string
      model?: string
    } = {
      friendlyId,
      label,
      isolated: true,
      exec: 'auto',
    }
    if (modelString) requestBody.model = modelString

    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
      throw new Error(
        readString(payload.error) || readString(payload.message) || `Spawn failed: HTTP ${response.status}`,
      )
    }

    const data = (await response.json()) as Record<string, unknown>
    const sessionKey = readString(data.sessionKey)
    if (!sessionKey) throw new Error('No sessionKey in spawn response')

    // Track whether the gateway actually applied the requested model
    const modelApplied = data.modelApplied !== false
    if (modelString && !modelApplied) {
      setAgentModelNotApplied((prev) => ({ ...prev, [member.id]: true }))
    } else {
      setAgentModelNotApplied((prev) => {
        if (!prev[member.id]) return prev
        const next = { ...prev }
        delete next[member.id]
        return next
      })
    }

    return sessionKey
  }, [])

  const clearRetryingAgent = useCallback((agentId: string) => {
    setRetryingAgents((prev) => {
      if (!prev[agentId]) return prev
      const next = { ...prev }
      delete next[agentId]
      return next
    })
  }, [])

  const markAgentTasksFailed = useCallback((agentId: string, reason: string) => {
    const failedStatus = 'failed' as TaskStatus
    const failedTaskIds = new Set(
      (agentRetryPayloadRef.current[agentId]?.tasks ?? []).map((task) => task.id),
    )

    if (failedTaskIds.size > 0) {
      const markFailed = (tasks: HubTask[]) =>
        tasks.map((task) =>
          task.agentId === agentId && failedTaskIds.has(task.id)
            ? { ...task, status: failedStatus, updatedAt: Date.now() }
            : task,
        )
      setMissionTasks(markFailed)
      _setBoardTasks(markFailed)
    }

    clearRetryingAgent(agentId)
    setSpawnState((prev) => ({ ...prev, [agentId]: 'error' }))
    setAgentSessionStatus((prev) => ({
      ...prev,
      [agentId]: { status: 'error', lastSeen: Date.now(), lastMessage: reason },
    }))
    setMissionSubTab('failed')
    saveCheckpoint()
  }, [_setBoardTasks, clearRetryingAgent, saveCheckpoint, setMissionTasks])

  const scheduleAgentRetry = useCallback((agentId: string, sessionKey: string, reason: string) => {
    if (useMissionStore.getState().missionState !== 'running') return
    if (agentSessionMap[agentId] !== sessionKey) return
    if (agentSessionsDoneRef.current.has(sessionKey)) return
    if (handledFailedSessionKeysRef.current.has(sessionKey)) return

    handledFailedSessionKeysRef.current.add(sessionKey)
    agentSessionsDoneRef.current.delete(sessionKey)

    const member = teamRef.current.find((entry) => entry.id === agentId)
    const retryPayload = agentRetryPayloadRef.current[agentId]
    const canRetry = Boolean(member && retryPayload && !retriedAgentsRef.current.has(agentId))

    setAgentSessionStatus((prev) => ({
      ...prev,
      [agentId]: { status: 'error', lastSeen: Date.now(), lastMessage: reason },
    }))

    if (!canRetry) {
      captureAgentOutput(agentId, `[system] Session failed: ${reason}`)
      markAgentTasksFailed(agentId, reason)
      emitFeedEvent({
        type: 'system',
        message: `${member?.name ?? agentId} failed: ${reason}`,
        agentName: member?.name,
      })
      return
    }

    if (pendingAgentRetryRef.current.has(agentId)) return

    retriedAgentsRef.current.add(agentId)
    pendingAgentRetryRef.current.add(agentId)
    setRetryingAgents((prev) => ({ ...prev, [agentId]: true }))

    const existingStream = agentStreamsRef.current.get(sessionKey)
    if (existingStream) {
      existingStream.close()
      agentStreamsRef.current.delete(sessionKey)
    }
    agentStreamLastAtRef.current.delete(sessionKey)

    setSpawnState((prev) => ({ ...prev, [agentId]: 'spawning' }))
    setAgentSessionMap((prev) => {
      if (prev[agentId] !== sessionKey) return prev
      const next = { ...prev }
      delete next[agentId]
      return next
    })

    captureAgentOutput(
      agentId,
      `[system] Session failed: ${reason}\n[system] Auto-retrying in 3s (1/1)`,
    )
    emitFeedEvent({
      type: 'system',
      message: `${member?.name ?? agentId} failed: ${reason}. Retrying (1/1)`,
      agentName: member?.name,
    })

    const retryTimer = window.setTimeout(() => {
      agentRetryTimersRef.current.delete(agentId)

      if (useMissionStore.getState().missionState !== 'running') {
        pendingAgentRetryRef.current.delete(agentId)
        clearRetryingAgent(agentId)
        return
      }

      const currentMember = teamRef.current.find((entry) => entry.id === agentId)
      const payload = agentRetryPayloadRef.current[agentId]
      if (!currentMember || !payload) {
        pendingAgentRetryRef.current.delete(agentId)
        markAgentTasksFailed(agentId, reason)
        return
      }

      void (async () => {
        try {
          const newSessionKey = await spawnAgentSession(currentMember, {
            reuseExisting: false,
            labelSuffix: 'retry-1',
          })
          if (useMissionStore.getState().missionState !== 'running') {
            pendingAgentRetryRef.current.delete(agentId)
            clearRetryingAgent(agentId)
            return
          }

          handledFailedSessionKeysRef.current.delete(newSessionKey)
          setAgentSessionMap((prev) => ({ ...prev, [agentId]: newSessionKey }))
          setSpawnState((prev) => ({ ...prev, [agentId]: 'ready' }))
          setAgentSessionStatus((prev) => ({
            ...prev,
            [agentId]: {
              status: 'active',
              lastSeen: Date.now(),
              lastMessage: 'Retry 1/1 started',
            },
          }))

          const modelString = resolveGatewayModelId(currentMember.modelId)
          if (modelString) {
            setAgentSessionModelMap((prev) => ({ ...prev, [agentId]: modelString }))
          }

          captureAgentOutput(
            agentId,
            '[system] Retry 1/1 session started\n[system] Re-dispatching assigned tasks',
          )
          await dispatchAgentTasks({
            sessionKey: newSessionKey,
            agentId,
            agentTasks: payload.tasks,
            messageText: payload.messageText,
            member: currentMember,
          })
          pendingAgentRetryRef.current.delete(agentId)
          clearRetryingAgent(agentId)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          pendingAgentRetryRef.current.delete(agentId)
          captureAgentOutput(
            agentId,
            `[system] Retry 1/1 failed: ${errorMessage}`,
          )
          markAgentTasksFailed(agentId, `Retry failed: ${errorMessage}`)
          emitFeedEvent({
            type: 'system',
            message: `Retry 1/1 failed for ${currentMember.name}: ${errorMessage}`,
            agentName: currentMember.name,
          })
        }
      })()
    }, 3_000)

    agentRetryTimersRef.current.set(agentId, retryTimer)
  }, [
    agentSessionMap,
    captureAgentOutput,
    clearRetryingAgent,
    dispatchAgentTasks,
    markAgentTasksFailed,
    setAgentSessionModelMap,
    spawnAgentSession,
  ])
  scheduleAgentRetryRef.current = scheduleAgentRetry



  const _handleSetAgentPaused = useCallback(
    async (agentId: string, pause: boolean) => {
      const sessionKey = agentSessionMap[agentId]
      if (!sessionKey) {
        toast('No active session to control', { type: 'error' })
        return
      }

      const member = team.find((entry) => entry.id === agentId)
      const agentName = member?.name ?? agentId
      const previousPaused = pausedByAgentId[agentId] ?? false

      setPausedByAgentId((prev) => ({ ...prev, [agentId]: pause }))

      try {
        await toggleAgentPause(sessionKey, pause)
        emitFeedEvent({
          type: pause ? 'agent_paused' : 'agent_active',
          message: `${agentName} ${pause ? 'paused' : 'resumed'}`,
          agentName,
        })
        toast(`${agentName} ${pause ? 'paused' : 'resumed'}`, {
          type: 'success',
        })
      } catch (error) {
        // Graceful fallback: if server-side pause isn't available, keep local
        // paused state but warn the user instead of crashing.
        const errMsg = error instanceof Error ? error.message : String(error)
        const isNotImplemented =
          errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('Not Found') || errMsg.includes('not implemented')
        if (isNotImplemented) {
          // Server doesn't support pause — keep optimistic local state and inform user
          toast(`${agentName} pause not available on this gateway`, { type: 'warning' })
          emitFeedEvent({
            type: 'system',
            message: `Pause not available for ${agentName} — gateway endpoint missing`,
            agentName,
          })
        } else {
          setPausedByAgentId((prev) => ({ ...prev, [agentId]: previousPaused }))
          toast(errMsg || `Failed to ${pause ? 'pause' : 'resume'} ${agentName}`, { type: 'error' })
        }
      }
    },
    [agentSessionMap, pausedByAgentId, team],
  )

  const handleMissionPause = useCallback(async (pause: boolean) => {
    // BUG-5 fix: do NOT set state optimistically before async calls settle.
    // setMissionState fires AFTER Promise.allSettled confirms all pauses succeeded.
    // If any settle with 'rejected', revert to the previous state instead.
    const previousState: 'running' | 'paused' | 'stopped' = pause ? 'running' : 'paused'
    try {
      const results = await Promise.allSettled(
        team
          .filter((m) => agentSessionMap[m.id])
          .map((m) => _handleSetAgentPaused(m.id, pause))
      )
      // Only update mission state when all pause/resume calls succeeded (or were no-ops)
      const anyFailed = results.some((r) => r.status === 'rejected')
      if (anyFailed) {
        // At least one agent failed to pause/resume — leave state unchanged
        // (individual agents already show their own error toasts via _handleSetAgentPaused)
        setMissionState(previousState)
      } else {
        setMissionState(pause ? 'paused' : 'running')
      }
    } catch {
      // Unexpected error — revert to previous state
      setMissionState(previousState)
    }
  }, [team, agentSessionMap, _handleSetAgentPaused])

  const handleKillAgent = useCallback(async (agentId: string) => {
    const sessionKey = agentSessionMap[agentId]
    if (!sessionKey) return
    const member = team.find((m) => m.id === agentId)
    const agentName = member?.name ?? agentId
    try {
      await killAgentSession(sessionKey)
      setAgentSessionMap((prev) => { const n = { ...prev }; delete n[agentId]; return n })
      setSpawnState((prev) => ({ ...prev, [agentId]: 'idle' }))
      setAgentSessionStatus((prev) => { const n = { ...prev }; delete n[agentId]; return n })
      emitFeedEvent({ type: 'agent_killed', message: `${agentName} session killed`, agentName })
      toast(`${agentName} killed`, { type: 'success' })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Kill failed', { type: 'error' })
    }
  }, [agentSessionMap, team])

  const handleSteerAgent = useCallback(
    async (agentId: string, message: string) => {
      const sessionKey = agentSessionMap[agentId]
      if (!sessionKey) {
        toast('No active session to steer', { type: 'error' })
        return
      }
      const directive = message.trim()
      if (!directive) return
      const member = team.find((entry) => entry.id === agentId)
      const agentName = member?.name ?? agentId
      try {
        await steerAgent(sessionKey, directive)
        // Clear waiting_for_input — user has provided input, agent will resume
        setAgentSessionStatus((prev) => {
          if (prev[agentId]?.status !== 'waiting_for_input') return prev
          return { ...prev, [agentId]: { ...prev[agentId], status: 'active', lastSeen: Date.now() } }
        })
        // Remove from done set so agent can be re-evaluated on next turn end
        agentSessionsDoneRef.current.delete(sessionKey)
        emitFeedEvent({
          type: 'system',
          message: `Directive sent to ${agentName}: ${directive.slice(0, 80)}`,
          agentName,
        })
        toast(`Directive sent to ${agentName}`, { type: 'success' })
        setSteerAgentId(null)
        setSteerInput('')
      } catch (error) {
        toast(
          error instanceof Error ? error.message : `Failed to send directive to ${agentName}`,
          { type: 'error' },
        )
      }
    },
    [agentSessionMap, team],
  )

  const handleRetrySpawn = useCallback(
    async (member: TeamMember): Promise<void> => {
      setSpawnState((prev) => ({ ...prev, [member.id]: 'spawning' }))
      try {
        const sessionKey = await spawnAgentSession(member)
        setAgentSessionMap((prev) => ({ ...prev, [member.id]: sessionKey }))
        setSpawnState((prev) => ({ ...prev, [member.id]: 'ready' }))
        setAgentSessionStatus((prev) => ({
          ...prev,
          [member.id]: { status: 'idle', lastSeen: Date.now() },
        }))
        const modelLabel = getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)
        const modelSuffix = member.modelId !== 'auto' ? ` (${modelLabel})` : ''
        emitFeedEvent({
          type: 'agent_spawned',
          message: `${member.name} session re-created${modelSuffix}`,
          agentName: member.name,
        })
        toast(`${member.name} spawned successfully`, { type: 'success' })
      } catch (err) {
        setSpawnState((prev) => ({ ...prev, [member.id]: 'error' }))
        emitFeedEvent({
          type: 'system',
          message: `Failed to re-spawn ${member.name}: ${err instanceof Error ? err.message : String(err)}`,
          agentName: member.name,
        })
      }
    },
    [gatewayModelLabelById, spawnAgentSession],
  )
  void handleRetrySpawn

  // ── Approval handlers ──────────────────────────────────────────────────────
  const handleApprove = useCallback((id: string) => {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return

    // Gateway approval — resolve via gateway API
    if (approval.source === 'gateway' && approval.gatewayApprovalId) {
      void resolveGatewayApproval(approval.gatewayApprovalId, 'approve')
    }

    // Agent approval — send APPROVED message to session
    if (approval.source !== 'gateway') {
      const sessionKey = agentSessionMap[approval.agentId]
      if (sessionKey) {
        fetch('/api/sessions/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey,
            message: `[APPROVED] You may proceed with: ${approval.action}`,
          }),
        }).catch(() => { /* best-effort */ })
        // Clear waiting_for_input — approval is a form of human input
        setAgentSessionStatus((prev) => {
          if (prev[approval.agentId]?.status !== 'waiting_for_input') return prev
          return { ...prev, [approval.agentId]: { ...prev[approval.agentId], status: 'active', lastSeen: Date.now() } }
        })
        agentSessionsDoneRef.current.delete(sessionKey)
      }
    }

    const updated = approvals.map(a =>
      a.id === id ? { ...a, status: 'approved' as const, resolvedAt: Date.now() } : a
    )
    setApprovals(updated)
    saveApprovals(updated)
  }, [approvals, agentSessionMap])

  const handleDeny = useCallback((id: string) => {
    const approval = approvals.find(a => a.id === id)
    if (!approval) return

    // Gateway approval — resolve via gateway API
    if (approval.source === 'gateway' && approval.gatewayApprovalId) {
      void resolveGatewayApproval(approval.gatewayApprovalId, 'deny')
    }

    // Agent approval — send DENIED message to session
    if (approval.source !== 'gateway') {
      const sessionKey = agentSessionMap[approval.agentId]
      if (sessionKey) {
        fetch('/api/sessions/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionKey,
            message: `[DENIED] You may NOT proceed with: ${approval.action}. Please stop and await further instructions.`,
          }),
        }).catch(() => { /* best-effort */ })
      }
    }

    const updated = approvals.map(a =>
      a.id === id ? { ...a, status: 'denied' as const, resolvedAt: Date.now() } : a
    )
    setApprovals(updated)
    saveApprovals(updated)
  }, [approvals, agentSessionMap])

  const ensureAgentSessions = useCallback(async (
    teamMembers: TeamMember[],
    launchMissionId?: string,
  ): Promise<Record<string, string>> => {
    const currentMap = { ...agentSessionMap }
    const spawnPromises: Array<Promise<void>> = []
    const isStaleLaunch = () =>
      Boolean(launchMissionId) && missionIdRef.current !== launchMissionId

    for (const member of teamMembers) {
      if (isStaleLaunch()) break
      if (currentMap[member.id]) continue

      setSpawnState((prev) => ({ ...prev, [member.id]: 'spawning' }))

        spawnPromises.push(
          spawnAgentSession(member)
          .then((sessionKey) => {
            if (isStaleLaunch()) return
            currentMap[member.id] = sessionKey
            // Update session map incrementally so output panel gets sessionKey ASAP
            // (not just after all agents finish spawning)
            setAgentSessionMap((prev) => ({ ...prev, [member.id]: sessionKey }))
            setSpawnState((prev) => ({ ...prev, [member.id]: 'ready' }))
            // Set status to active immediately after spawn so SSE streams open right away.
            // (The session poll will confirm/correct this within 5s; using 'active' ensures
            // streams open before the agent starts processing messages.)
            setAgentSessionStatus((prev) => ({
              ...prev,
              [member.id]: { status: 'active', lastSeen: Date.now() },
            }))
            // Track model used at spawn time
            const modelString = resolveGatewayModelId(member.modelId)
            if (modelString) {
              setAgentSessionModelMap((prev) => ({ ...prev, [member.id]: modelString }))
            }
            const modelLabel = getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)
            const modelSuffix = member.modelId !== 'auto' ? ` (${modelLabel})` : ''
            emitFeedEvent({
              type: 'agent_spawned',
              message: `spawned ${member.name}${modelSuffix}`,
              agentName: member.name,
            })
          })
          .catch((err: unknown) => {
            if (isStaleLaunch()) return
            setSpawnState((prev) => ({ ...prev, [member.id]: 'error' }))
            emitFeedEvent({
              type: 'system',
              message: `Failed to spawn ${member.name}: ${err instanceof Error ? err.message : String(err)}`,
              agentName: member.name,
            })
          }),
      )
    }

    await Promise.allSettled(spawnPromises)
    if (isStaleLaunch()) return currentMap
    setAgentSessionMap(currentMap)
    return currentMap
  }, [agentSessionMap, gatewayModelLabelById, spawnAgentSession])

  const executeMission = useCallback(async (
    tasks: Array<HubTask>,
    teamMembers: Array<TeamMember>,
    missionGoalValue: string,
    mode: 'sequential' | 'hierarchical' | 'parallel' = 'parallel',
    launchMissionId?: string,
  ) => {
    const isStaleLaunch = () =>
      Boolean(launchMissionId) && missionIdRef.current !== launchMissionId

    if (isStaleLaunch()) return
    // STEP A: Ensure all agents have isolated gateway sessions
    const sessionMap = await ensureAgentSessions(teamMembers, launchMissionId)
    if (isStaleLaunch()) return

    // STEP B: Group tasks by agent
    const tasksByAgent = new Map<string, Array<HubTask>>()
    for (const task of tasks) {
      if (!task.agentId) continue
      const existing = tasksByAgent.get(task.agentId) || []
      existing.push(task)
      tasksByAgent.set(task.agentId, existing)
    }

    // Helper: build agent context prefix for dispatch messages
    function buildAgentContext(member: TeamMember): string {
      const parts = [
        member.roleDescription && `Role: ${member.roleDescription}`,
        member.goal && `Your goal: ${member.goal}`,
        member.backstory && `Background: ${member.backstory}`,
      ].filter(Boolean)
      return parts.join('\n')
    }

    // Helper: send a message to an agent session and update task state
    async function dispatchToAgent(
      agentId: string,
      agentTasks: Array<HubTask>,
      messageText: string,
    ): Promise<void> {
      const sessionKey = sessionMap[agentId]
      if (!sessionKey) {
        emitFeedEvent({
          type: 'system',
          message: `No session for agent ${agentId} — skipping dispatch`,
        })
        return
      }

      const member = teamMembers.find((entry) => entry.id === agentId)
      agentRetryPayloadRef.current[agentId] = {
        tasks: agentTasks.map((task) => ({ ...task })),
        messageText,
      }

      try {
        await dispatchAgentTasks({
          sessionKey,
          agentId,
          agentTasks,
          messageText,
          member,
        })
      } catch {
        if (isStaleLaunch()) return
      }
    }

    // ── HIERARCHICAL mode ─────────────────────────────────────────────────
    if (mode === 'hierarchical') {
      const [leadMember, ...workerMembers] = teamMembers
      if (!leadMember || isStaleLaunch()) return

      const leadSessionKey = sessionMap[leadMember.id]
      if (leadSessionKey) {
        const leadContext = buildAgentContext(leadMember)
        const teamList = workerMembers.map((m) => `- ${m.name} (${m.roleDescription})`).join('\n')
        const leadBriefing = `You are the Lead Agent coordinating this mission.\n\nYour team:\n${teamList}\n\nMission Goal: ${missionGoalValue}\n\nYour job: Break down the goal into clear subtasks, delegate them to your team members by name, and synthesize the final result. Start by outlining the plan.`
        const leadMessage = [leadContext, leadBriefing].filter(Boolean).join('\n\n')

        const leadTasks = tasksByAgent.get(leadMember.id) ?? []
        const effectiveLeadTasks = leadTasks.length > 0 ? leadTasks : [{
          id: createTaskId(),
          title: `Lead: ${missionGoalValue}`,
          description: '',
          priority: 'high' as const,
          status: 'assigned' as const,
          agentId: leadMember.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }]
        await dispatchToAgent(leadMember.id, effectiveLeadTasks, leadMessage)
        if (isStaleLaunch()) return

        // Dispatch to workers with delegation prefix
        for (const worker of workerMembers) {
          if (isStaleLaunch()) return
          const workerTasks = tasksByAgent.get(worker.id)
          if (!workerTasks || workerTasks.length === 0) continue
          const workerContext = buildAgentContext(worker)
          const taskList = workerTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
          const delegationPrefix = `Delegated by ${leadMember.name}:`
          const workerBody = `${delegationPrefix}\n\nMission Task Assignment for ${worker.name}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
          const workerMessage = [workerContext, workerBody].filter(Boolean).join('\n\n')
          await dispatchToAgent(worker.id, workerTasks, workerMessage)
        }
      }
      return
    }

    // ── SEQUENTIAL mode ───────────────────────────────────────────────────
    if (mode === 'sequential') {
      const agentEntries = Array.from(tasksByAgent.entries())
      for (let i = 0; i < agentEntries.length; i++) {
        if (isStaleLaunch()) return
        const [agentId, agentTasks] = agentEntries[i]
        const member = teamMembers.find((entry) => entry.id === agentId)
        const agentContext = member ? buildAgentContext(member) : ''
        const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
        const body = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
        const message = [agentContext, body].filter(Boolean).join('\n\n')
        await dispatchToAgent(agentId, agentTasks, message)

        // Stagger: wait 30 seconds between agents (except after the last one)
        if (i < agentEntries.length - 1) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 30_000))
          if (isStaleLaunch()) return
        }
      }
      return
    }

    // ── PARALLEL mode (default) ────────────────────────────────────────────
    for (const [agentId, agentTasks] of tasksByAgent) {
      if (isStaleLaunch()) return
      const member = teamMembers.find((entry) => entry.id === agentId)
      const agentContext = member ? buildAgentContext(member) : ''
      const taskList = agentTasks.map((task, index) => `${index + 1}. ${task.title}`).join('\n')
      const body = `Mission Task Assignment for ${member?.name || agentId}:\n\n${taskList}\n\nMission Goal: ${missionGoalValue}\n\nPlease work through these tasks sequentially. Report progress on each.`
      const message = [agentContext, body].filter(Boolean).join('\n\n')
      await dispatchToAgent(agentId, agentTasks, message)
    }
  }, [dispatchAgentTasks, ensureAgentSessions])

  useEffect(() => {
    const isMissionRunning = missionActive && missionState === 'running'

    // Reset activity markers when mission is not running
    if (!isMissionRunning) {
      sessionActivityRef.current = new Map()
    }

    const hasSessions = Object.keys(agentSessionMap).length > 0

    // Only poll when we have sessions to roster or an active mission
    if (!hasSessions && !isMissionRunning) return

    // Build reverse lookup: sessionKey → agentId
    const sessionKeyToAgentId = new Map<string, string>()
    for (const [agentId, sessionKey] of Object.entries(agentSessionMap)) {
      if (sessionKey) sessionKeyToAgentId.set(sessionKey, agentId)
    }

    let cancelled = false

    async function pollSessions() {
      try {
        const response = await fetch('/api/sessions')
        if (!response.ok || cancelled) return

        const payload = (await response
          .json()
          .catch(() => ({}))) as { sessions?: Array<SessionRecord> }
        const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
        const now = Date.now()

        // ── Session Roster Tracking ───────────────────────────────────────────
        if (hasSessions) {
          const seenAgentIds = new Set<string>()
          const failedSessionsToRetry: Array<{ agentId: string; sessionKey: string; reason: string }> = []

          // Compute status for each matched session
          const matchedEntries: Array<[string, AgentSessionStatusEntry]> = []
          for (const session of sessions) {
            const sessionKey = readSessionId(session)
            if (!sessionKey) continue
            const agentId = sessionKeyToAgentId.get(sessionKey)
            if (!agentId) continue

            seenAgentIds.add(agentId)

            const updatedAtRaw = session.updatedAt
            const updatedAt =
              typeof updatedAtRaw === 'number'
                ? updatedAtRaw
                : typeof updatedAtRaw === 'string'
                  ? Date.parse(updatedAtRaw)
                  : 0
            const lastSeen = Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now
            const lastMessage = readSessionLastMessage(session) || undefined
            const ageMs = now - lastSeen
            const rawStatus = readString(session.status)

            let status: AgentSessionStatusEntry['status']
            if (rawStatus === 'error') {
              status = 'error'
              failedSessionsToRetry.push({
                agentId,
                sessionKey,
                reason: lastMessage || 'Session reported an error state',
              })
            } else if (ageMs < 30_000) {
              status = 'active'
            } else if (ageMs < 300_000) {
              status = 'idle'
            } else {
              status = 'stopped'
            }

            matchedEntries.push([agentId, { status, lastSeen, ...(lastMessage ? { lastMessage } : {}) }])
          }

          if (!cancelled) {
            setAgentSessionStatus((prev) => {
              const next: Record<string, AgentSessionStatusEntry> = {}

              // Apply matched sessions — but don't override waiting_for_input or
              // agents whose SSE stream has already sent a 'done' event (their
              // session may still look 'active' to the poller for up to 30s).
              for (const [agentId, entry] of matchedEntries) {
                const sessionKeyForAgent = agentSessionMap[agentId]
                const agentIsDone = sessionKeyForAgent && agentSessionsDoneRef.current.has(sessionKeyForAgent)
                if (agentIsDone && prev[agentId]?.status === 'idle') {
                  // Don't override 'idle' set by SSE done handler
                  next[agentId] = prev[agentId]
                } else if (prev[agentId]?.status === 'waiting_for_input' && entry.status !== 'active') {
                  next[agentId] = prev[agentId]
                } else {
                  next[agentId] = entry
                }
              }

              // Handle agents whose session key wasn't returned by the API
              for (const agentId of Object.keys(agentSessionMap)) {
                if (seenAgentIds.has(agentId)) continue
                const existing = prev[agentId]
                const lastSeen = existing?.lastSeen ?? now
                const ageMs = now - lastSeen
                // Grace period: keep existing status for up to 60s before marking stopped
                if (!existing || ageMs > 60_000) {
                  const sessionKey = agentSessionMap[agentId]
                  if (sessionKey) {
                    failedSessionsToRetry.push({
                      agentId,
                      sessionKey,
                      reason: 'Session disappeared from gateway roster',
                    })
                  }
                  next[agentId] = {
                    status: 'stopped',
                    lastSeen,
                    ...(existing?.lastMessage ? { lastMessage: existing.lastMessage } : {}),
                  }
                } else {
                  next[agentId] = existing
                }
              }

              return next
            })

            for (const failedSession of failedSessionsToRetry) {
              scheduleAgentRetryRef.current(
                failedSession.agentId,
                failedSession.sessionKey,
                failedSession.reason,
              )
            }
          }
        }

        // ── Real Token & Cost Aggregation ────────────────────────────────────
        if (hasSessions && !cancelled) {
          let totalTokens = 0
          let totalCost = 0
          let allOAuth = true
          let hasAnyModel = false

          for (const session of sessions) {
            const sessionKey = readSessionId(session)
            if (!sessionKey || !sessionKeyToAgentId.has(sessionKey)) continue

            totalTokens += readSessionTokens(session)
            totalCost += readSessionCost(session)

            const model = readSessionModel(session)
            if (model) {
              hasAnyModel = true
              if (!isOAuthModel(model)) allOAuth = false
            }
          }

          setMissionRealTokens(totalTokens)
          setMissionRealCost(totalCost)
          setMissionAllOAuth(hasAnyModel && allOAuth)
        }

        // ── Activity Feed Events (mission only) ───────────────────────────────
        if (isMissionRunning) {
          const previousMarkers = sessionActivityRef.current
          const nextMarkers = new Map<string, string>()

          for (const session of sessions) {
            const sessionId = readSessionId(session)
            if (!sessionId) continue

            const marker = readSessionActivityMarker(session)
            const previous = previousMarkers.get(sessionId)
            const name = readSessionName(session) || sessionId

            nextMarkers.set(sessionId, marker)
            if (!previous || previous === marker) continue

            const lastMessage = readSessionLastMessage(session)
            const summary = lastMessage
              ? `Output: ${truncateMissionGoal(lastMessage, 80)}`
              : 'Session activity detected'

            emitFeedEvent({
              type: 'agent_active',
              message: `${name} update: ${summary}`,
              agentName: name,
            })
          }

          if (!cancelled) {
            sessionActivityRef.current = nextMarkers
          }
        }
      } catch {
        // Ignore polling errors; mission dispatch and local events still work.
      }
    }

    void pollSessions()
    const interval = window.setInterval(() => {
      void pollSessions()
    }, 5_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [agentSessionMap, missionActive, missionState])

  useEffect(() => {
    const previous = prevMissionStateRef.current
    if (previous === 'running' && missionState === 'stopped') {
      const snapshot = missionCompletionSnapshotRef.current
      // Capture agentSessionMap before it gets cleared by stopMissionAndCleanup
      const sessionMapSnapshot = { ...agentSessionMap }
      if (snapshot && lastReportedMissionIdRef.current !== snapshot.missionId) {
        const enrichAndReport = async () => {
          const enrichedSnapshot = snapshot.needsEnrichment
            ? {
                ...snapshot,
                needsEnrichment: false,
                agentSummaries: await Promise.all(
                  snapshot.agentSummaries.map(async (summary) => {
                    const sessionKey = sessionMapSnapshot[summary.agentId]
                    if (!sessionKey) return summary
                    const historyLines = await fetchAgentFinalOutput(sessionKey)
                    if (historyLines.length > 0) {
                      return { ...summary, lines: historyLines }
                    }
                    return summary
                  }),
                ),
              }
            : snapshot

          // Auto-detect artifacts from agent output before generating report
          const autoDetected: MissionArtifact[] = []
          const existingTitles = new Set(enrichedSnapshot.artifacts.map((a) => a.title.toLowerCase()))
          enrichedSnapshot.agentSummaries.forEach((summary) => {
            const cleanedLines = cleanAgentOutputLines(summary.lines)
            detectArtifactsFromText({
              agentId: summary.agentId,
              agentName: summary.agentName,
              lines: cleanedLines,
            }).forEach((a) => {
              if (!existingTitles.has(a.title.toLowerCase())) {
                existingTitles.add(a.title.toLowerCase())
                autoDetected.push(a)
              }
            })
          })
          const allArtifacts = [...enrichedSnapshot.artifacts, ...autoDetected]

          const reportText = generateMissionReport(enrichedSnapshot)
          const taskStats = computeMissionTaskStats(enrichedSnapshot.tasks)
          const duration = Math.max(0, enrichedSnapshot.completedAt - enrichedSnapshot.startedAt)
          const costEstimate = missionRealCost > 0 ? missionRealCost : estimateMissionCost(enrichedSnapshot.tokenCount)
          const record: StoredMissionReport = {
            id: snapshot.missionId,
            missionId: snapshot.missionId,
            name: snapshot.name,
            goal: snapshot.goal,
            teamName: snapshot.teamName,
            agents: snapshot.team.map((member) => ({
              id: member.id,
              name: member.name,
              modelId: member.modelId,
            })),
            taskStats,
            duration,
            tokenCount: enrichedSnapshot.tokenCount,
            costEstimate,
            artifacts: allArtifacts,
            report: reportText,
            completedAt: enrichedSnapshot.completedAt,
          }
          setMissionReports(saveStoredMissionReport(record))
          lastReportedMissionIdRef.current = enrichedSnapshot.missionId
          completeMission()
          setMissionHistory(loadMissionHistory())
          // Auto-show completion report modal
          setCompletionReport(record)
          setCompletionReportVisible(true)
          // Switch to missions tab so user sees the result
          setActiveTab('missions')
          setMissionSubTab('complete')
        }
        void enrichAndReport()
      } else {
        completeMission()
        setMissionHistory(loadMissionHistory())
      }
      missionCompletionSnapshotRef.current = null
      // Mark mission as inactive so the card moves from Running to Review column
      setMissionActive(false)
      // Clean up running state: kill sessions, clear maps (mirrors stopMissionAndCleanup)
      setMissionTasks([])
      setDispatchedTaskIdsByAgent({})
      setPausedByAgentId({})
      setSelectedOutputAgentId(undefined)
      dispatchingRef.current = false
      pendingTaskMovesRef.current = []
      sessionActivityRef.current = new Map()
      agentSessionsDoneRef.current = new Set()
      expectedAgentCountRef.current = 0
      agentRetryCountRef.current = {}
      retriedAgentsRef.current = new Set()
      pendingAgentRetryRef.current.clear()
      for (const timer of agentRetryTimersRef.current.values()) {
        window.clearTimeout(timer)
      }
      agentRetryTimersRef.current.clear()
      handledFailedSessionKeysRef.current.clear()
      agentRetryPayloadRef.current = {}
    }
    prevMissionStateRef.current = missionState
  }, [agentSessionMap, completeMission, missionState, setMissionActive, setMissionTasks, setDispatchedTaskIdsByAgent])

  function applyTemplate(templateId: TeamTemplateId) {
    setTeam(buildTeamFromTemplate(templateId))
    setSelectedAgentId(undefined)
    setSelectedOutputAgentId(undefined)
  }

  function flashTeamPanel() {
    setTeamPanelFlash(true)
    if (teamPanelFlashTimerRef.current !== undefined) {
      window.clearTimeout(teamPanelFlashTimerRef.current)
    }
    teamPanelFlashTimerRef.current = window.setTimeout(() => {
      setTeamPanelFlash(false)
    }, 750)
  }

  function handleAddAgent() {
    const nextIndex = team.length
    setNewAgentDraft({
      id: createMemberId(),
      name: pickUniqueAgentName(team.map((m) => m.name)),
      avatar: getAgentAvatarForSlot(nextIndex),
      modelId: 'auto',
      roleDescription: '',
      goal: '',
      backstory: '',
      status: 'available',
    })
  }

  function handleAutoConfigure() {
    const trimmedGoal = missionGoal.trim()
    if (!trimmedGoal) return
    applyTemplate(suggestTemplate(trimmedGoal))
    flashTeamPanel()
  }


  function closeLaunchWizard() {
    setWizardOpen(false)
  }

  function goToWizardStep(step: WizardStep) {
    const index = WIZARD_STEP_ORDER.indexOf(step)
    if (index >= 0) setWizardStepIndex(index)
  }


  function loadTeamConfig(configId: string) {
    const config = teamConfigs.find((entry) => entry.id === configId)
    if (!config) return
    setTeam(config.team.map((member, index) => ({ ...member, avatar: member.avatar ?? getAgentAvatarForSlot(index) })))
    setSelectedTeamConfigId(config.id)
    setSelectedAgentId(undefined)
    setSelectedOutputAgentId(undefined)
    toast(`Loaded team config: ${config.name}`, { type: 'success' })
  }

  function deleteTeamConfig(configId: string) {
    setTeamConfigs((previous) => previous.filter((entry) => entry.id !== configId))
    setSelectedTeamConfigId((current) =>
      current === configId ? '' : current,
    )
  }

  function handleCreateMission() {
    if (dispatchingRef.current) return
    if (missionActiveRef.current) {
      toast('Mission already running. Stop the current mission before launching another.', {
        type: 'warning',
      })
      return
    }
    if (gatewayStatus === 'disconnected') {
      toast('Connect gateway before launching a mission', { type: 'error' })
      setWizardOpen(true)
      goToWizardStep('gateway')
      return
    }
    const trimmedGoal = missionGoal.trim()
    if (!trimmedGoal) return
    const newMissionId = `mission-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const createdTasks = parseMissionGoal(trimmedGoal, teamWithRuntimeStatus, newMissionId)
    if (createdTasks.length === 0) {
      toast('Could not parse actionable tasks from mission goal', { type: 'error' })
      return
    }

    dispatchingRef.current = true

    const missionId = newMissionId
    const missionStartedAt = Date.now()
    const launchMissionName = pendingMissionNameRef.current.trim()
    const launchBudgetLimit = pendingMissionBudgetLimitRef.current.trim() || budgetLimit.trim()
    startMission({
      id: missionId,
      goal: trimmedGoal,
      name: launchMissionName,
      processType,
      team: teamWithRuntimeStatus.map((member) => ({ ...member })),
      tasks: createdTasks,
      budgetLimit: launchBudgetLimit,
      startedAt: missionStartedAt,
    })
    // Dismiss any existing restore banner
    setRestoreCheckpoint(null)
    setRestoreDismissed(true)

    setMissionState('running')
    setView('board')
    pendingMissionNameRef.current = ''
    pendingMissionBudgetLimitRef.current = ''
    setBudgetLimit(launchBudgetLimit)
    setActiveMissionBudgetLimit(launchBudgetLimit)
    setDispatchedTaskIdsByAgent({})
    setArtifacts([])
    artifactDedupRef.current = new Set()
    agentOutputLinesRef.current = {}
    setAgentOutputLines({})
    setRetryingAgents({})
    agentRetryCountRef.current = {}
    retriedAgentsRef.current = new Set()
    pendingAgentRetryRef.current.clear()
    handledFailedSessionKeysRef.current.clear()
    agentRetryPayloadRef.current = {}
    for (const timer of agentRetryTimersRef.current.values()) {
      window.clearTimeout(timer)
    }
    agentRetryTimersRef.current.clear()
    agentSessionsDoneRef.current = new Set()
    expectedAgentCountRef.current = teamWithRuntimeStatus.length
    missionCompletionSnapshotRef.current = null
    setMissionTokenCount(0)
    setMissionRealTokens(0)
    setMissionRealCost(0)
    setMissionAllOAuth(false)
    // ── Auto-open Live Output panel: pick first assigned agent, fallback to first team member ──
    const firstAssignedAgentId = createdTasks.find((task) => task.agentId)?.agentId ?? teamWithRuntimeStatus[0]?.id
    setSelectedOutputAgentId(firstAssignedAgentId)
    setOutputPanelVisible(true)
    setPausedByAgentId({})
    sessionActivityRef.current = new Map()
    // ── Auto-switch to Mission tab → Running filter ──
    setActiveTab('missions')
    setMissionSubTab('running')
    setWizardOpen(false)
    emitFeedEvent({
      type: 'mission_started',
      message: `Mission started: ${trimmedGoal}`,
    })
    toast(`Mission started with ${createdTasks.length} tasks`, { type: 'success' })

    window.setTimeout(() => {
      if (useMissionStore.getState().activeMission?.id !== missionId) {
        dispatchingRef.current = false
        return
      }
      void executeMission(
        createdTasks,
        teamWithRuntimeStatus,
        trimmedGoal,
        processType,
        missionId,
      ).finally(() => {
        if (useMissionStore.getState().activeMission?.id !== missionId) return
        dispatchingRef.current = false
      })
    }, 0)
  }

  // Keep the ref in sync so keyboard shortcut always calls the latest version
  handleCreateMissionRef.current = handleCreateMission
  buildMissionCompletionSnapshotRef.current = buildMissionCompletionSnapshot


  const isMissionRunning = missionActive && missionState === 'running'

  // ── Mission tab content ────────────────────────────────────────────────────




  function openNewMissionModal(prefill?: Partial<MissionBoardDraft>) {
    setNewMissionName(prefill?.name ?? '')
    setNewMissionGoal(prefill?.goal ?? missionGoal)
    setNewMissionTeamConfigId(prefill?.teamConfigId ?? '__current__')
    setNewMissionProcessType(prefill?.processType ?? processType)
    setNewMissionBudgetLimit(prefill?.budgetLimit ?? budgetLimit)
    setMissionBoardModalOpen(true)
    setMissionWizardStep(0)
  }

  function handleSaveMissionDraft() {
    const goal = newMissionGoal.trim()
    const name = newMissionName.trim() || 'Untitled mission'
    if (!goal) return
    const selectedConfig = newMissionTeamConfigId === '__current__'
      ? null
      : teamConfigs.find((entry) => entry.id === newMissionTeamConfigId)
    const currentTeamLabel = `${activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : 'Custom Team'} · ${team.length} agents`
    const teamName = selectedConfig ? `${selectedConfig.name} · ${selectedConfig.team.length} agents` : currentTeamLabel
    const id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setMissionBoardDrafts((prev) => [
      {
        id,
        name,
        goal,
        teamConfigId: newMissionTeamConfigId,
        teamName,
        processType: newMissionProcessType,
        budgetLimit: newMissionBudgetLimit.trim(),
        createdAt: Date.now(),
      },
      ...prev,
    ])
    setMissionBoardModalOpen(false)
    toast(`Saved draft: ${name}`, { type: 'success' })
  }

  function getTeamBudgetSummary(members: TeamMember[]) {
    const budgetTokens = parseTokenBudget(newMissionBudgetLimit)
    const totalCost = budgetTokens ? estimateMissionCost(budgetTokens) : null
    const avgCost =
      totalCost !== null && members.length > 0
        ? Number((totalCost / members.length).toFixed(2))
        : null
    return { totalCost, avgCost }
  }

  function handleLaunchMissionFromModal() {
    const goal = newMissionGoal.trim()
    if (!goal) return
    const selectedConfig = newMissionTeamConfigId === '__current__'
      ? null
      : teamConfigs.find((entry) => entry.id === newMissionTeamConfigId)

    if (selectedConfig) {
      setTeam(selectedConfig.team.map((member, index) => ({
        ...member,
        avatar: member.avatar ?? getAgentAvatarForSlot(index),
      })))
      setSelectedTeamConfigId(selectedConfig.id)
    }

    pendingMissionNameRef.current = newMissionName.trim()
    pendingMissionBudgetLimitRef.current = newMissionBudgetLimit.trim()
    setMissionGoal(goal)
    setProcessType(newMissionProcessType)
    setBudgetLimit(newMissionBudgetLimit.trim())
    setMissionBoardModalOpen(false)
    setRestoreDismissed(true)

    window.setTimeout(() => {
      handleCreateMissionRef.current()
    }, 0)
  }

  // ── Mission modal derived data (hoisted so modal renders on any tab) ──────
  const _modalCurrentTeamLabel = `${activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : 'Custom Team'} · ${team.length} agents`
  const _modalMissionTeamOptions = [
    { id: '__current__', label: _modalCurrentTeamLabel, team },
    ...teamConfigs.map((config) => ({
      id: config.id,
      label: `${config.name} · ${config.team.length} agents`,
      team: config.team,
    })),
  ]
  const _modalSelectedTeamOption =
    _modalMissionTeamOptions.find((option) => option.id === newMissionTeamConfigId)
    ?? _modalMissionTeamOptions[0]
  const _modalSelectedTeamMembers = _modalSelectedTeamOption?.team ?? []
  const _modalSelectedBudgetTokens = parseTokenBudget(newMissionBudgetLimit)
  const _modalSelectedTotalBudgetCost = _modalSelectedBudgetTokens ? estimateMissionCost(_modalSelectedBudgetTokens) : null

  function renderCompactionBanner() {
    if (!compactionBanner) return null

    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
        <span className="animate-spin">⚙️</span>
        <span>{compactionBanner}</span>
        <button
          type="button"
          onClick={() => setCompactionBanner(null)}
          className="ml-auto text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    )
  }

  function renderOverviewContent() {
    // ── Derived data ───────────────────────────────────────────────────────
    const runningCost = missionRealCost > 0 ? missionRealCost : estimateMissionCost(missionTokenCount)
    const missionElapsed = missionStartedAtRef.current
      ? formatDuration(Date.now() - missionStartedAtRef.current)
      : '0s'

    // Active team data (Card 1) — prefer saved team config over template state
    const activeTeamConfig = teamConfigs.find((c) => c.id === selectedTeamConfigId)
    const activeTeamName = activeTeamConfig?.name
      ?? (activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : team.length > 0 ? 'Custom Team' : null)
    const activeTeamIcon = activeTeamConfig?.icon
      ?? (activeTeamName ? (TEAM_QUICK_TEMPLATES.find((t) => t.templateId === activeTemplateId)?.icon ?? '👥') : null)
    const activeTeamDescription = activeTeamConfig?.description ?? ''

    // Recent missions data (Card 2) — merge stored reports + local checkpoints
    const localHistoryItems = missionHistory.map((cp) => {
      const completedTasks = cp.tasks.filter((t) => t.status === 'done' || t.status === 'completed').length
      const totalTasks = cp.tasks.length
      const duration = cp.completedAt ? cp.completedAt - cp.startedAt : Date.now() - cp.startedAt
      const failed = cp.status === 'aborted' || cp.tasks.some((t) => t.status === 'blocked')
      return {
        id: cp.id,
        name: cp.label,
        goal: cp.label,
        agentCount: cp.team.length,
        duration,
        completedAt: cp.completedAt || cp.updatedAt,
        successRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        failed,
        taskStats: { total: totalTasks, completed: completedTasks, failed: failed ? 1 : 0 },
      }
    })
    const storedReportItems = missionReports.map((report) => ({
      id: report.id,
      name: report.name || report.goal,
      goal: report.goal,
      agentCount: report.agents.length,
      duration: report.duration,
      completedAt: report.completedAt,
      successRate: report.taskStats.total > 0
        ? Math.round((report.taskStats.completed / report.taskStats.total) * 100)
        : 0,
      failed: report.taskStats.failed > 0,
      taskStats: report.taskStats,
    }))
    const allMissions = [...localHistoryItems, ...storedReportItems]
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 5)
    const recentMissions = allMissions

    // Cost summary data (Card 3)
    // Aggregate tokens + cost from stored reports (today's sessions)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayMs = todayStart.getTime()
    const todayReports = missionReports.filter((r) => r.completedAt >= todayMs)
    const todayTokens = todayReports.reduce((sum, r) => sum + r.tokenCount, 0) + missionTokenCount
    const todayEstCost = todayReports.reduce((sum, r) => sum + r.costEstimate, 0) + runningCost
    const todaySessions = todayReports.length + (missionActive ? 1 : 0)
    // Provider breakdown from active team models
    const providerBreakdown = Array.from(
      team.reduce((map, member) => {
        const parts = member.modelId.split('/')
        const provider = parts.length > 1 ? parts[0] : 'auto'
        map.set(provider, (map.get(provider) ?? 0) + 1)
        return map
      }, new Map<string, number>()),
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    // Shared card style
    const cardCls = 'relative overflow-hidden rounded-xl border border-primary-200 bg-white dark:border-neutral-800 dark:bg-neutral-800 px-4 py-3 shadow-sm'
    const insetCls = 'rounded-lg border border-neutral-100 bg-neutral-50/70 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800/50'

    return (
      <div className="relative flex min-h-full flex-col overflow-x-hidden sm:h-full sm:min-h-0 sm:overflow-hidden dark:bg-[var(--theme-bg,#0b0e14)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-neutral-100/60 to-white dark:from-slate-900/60 dark:to-[var(--theme-bg,#0b0e14)]" />
        {/* ── Virtual Office Hero — flex-1 fills all remaining space ── */}
        <div className="relative mx-auto mt-3 sm:mt-5 w-full max-w-[1600px] shrink-0 sm:flex-1 sm:min-h-0 px-3 sm:px-4 flex flex-col">
          {renderCompactionBanner()}
          <div className="h-[240px] sm:flex-1 sm:h-auto sm:min-h-[420px] overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
            <PixelOfficeView
              agentRows={agentWorkingRows}
              missionRunning={isMissionRunning}
              onNewMission={() => openNewMissionModal()}
              onViewOutput={(agentId) => {
                if (isMissionRunning) {
                  setMaximizedMissionId('running')
                } else {
                  setActiveTab('configure')
                  setConfigSection('agents')
                  setAgentWizardOpenId(agentId)
                }
              }}
              selectedOutputAgentId={selectedOutputAgentId}
              activeTemplateName={
                activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : undefined
              }
              processType={processType}
              containerHeight={520}
            />
          </div>
        </div>

          {/* ── 3-card row — shrink-0, anchored at bottom ── */}
          <section className="relative mx-auto mb-4 mt-3 w-full max-w-[1600px] shrink-0 grid grid-cols-1 gap-3 px-3 sm:grid-cols-2 sm:gap-4 sm:px-4 xl:grid-cols-3">

            {/* ─── Card 1: Active Team ─────────────────────────────────── */}
            <article className={cardCls}>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/40 to-transparent" />
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className={HUB_CARD_LABEL_CLASS}>Active Team</h2>
                <button
                  type="button"
                  onClick={() => { setActiveTab('configure'); setConfigSection('teams') }}
                  className={HUB_SECONDARY_BUTTON_CLASS}
                >
                  Switch Team
                </button>
              </div>

              {team.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-5 text-center">
                  <span className="text-2xl">👥</span>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">No team active</p>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('configure'); setConfigSection('teams') }}
                    className={cn('mt-1', HUB_PRIMARY_BUTTON_CLASS)}
                  >
                    + Create Team
                  </button>
                </div>
              ) : (
                <>
                  {/* Team header row — full on desktop, compact single-line on mobile */}
                  <div className="hidden md:flex mb-3 items-center gap-2.5">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-900/20 text-xl shadow-sm">
                      {activeTeamIcon ?? '👥'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-neutral-900 dark:text-white">{activeTeamName ?? `Custom Team`}</p>
                      <p className="text-[10px] text-neutral-400">
                        {activeTeamDescription || `${team.length} agent${team.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  {/* Mobile: single-line compact header */}
                  <div className="flex md:hidden items-center gap-1.5 mb-2">
                    <span className="text-sm">{activeTeamIcon ?? '👥'}</span>
                    <span className="text-xs font-semibold text-neutral-800 dark:text-white truncate flex-1">{activeTeamName ?? 'Custom Team'}</span>
                    <span className="shrink-0 text-[10px] text-neutral-400">{team.length} agents · {agentWorkingRows.filter(r => r.status === 'active').length} working</span>
                  </div>

                  {/* Agent list — compact */}
                  <ul className="space-y-1.5">
                    {team.slice(0, 5).map((member, index) => {
                      const ac = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                      const row = agentWorkingRows.find((item) => item.id === member.id)
                      return (
                        <li key={member.id} className={cn('flex items-center gap-2', insetCls)}>
                          {/* Avatar circle: desktop only */}
                          <span className={cn('hidden md:flex size-6 shrink-0 items-center justify-center rounded-full border border-white shadow-sm', ac.avatar)}>
                            <AgentAvatar index={resolveAgentAvatarIndex(member, index)} color={ac.hex} size={14} />
                          </span>
                          {/* Mobile: small accent dot */}
                          <span className={cn('md:hidden size-2 shrink-0 rounded-full', ac.bar)} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-100">{member.name}</div>
                          </div>
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium', getOfficeModelBadge(member.modelId))}>
                            {getModelShortLabel(member.modelId, gatewayModelLabelById)}
                          </span>
                          <span className={cn('size-1.5 shrink-0 rounded-full',
                            row?.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                            row?.status === 'idle' || row?.status === 'ready' ? 'bg-amber-400' :
                            row?.status === 'error' ? 'bg-red-500' : 'bg-neutral-300',
                          )} />
                        </li>
                      )
                    })}
                    {team.length > 5 ? (
                      <li className="text-center text-[10px] text-neutral-400">+{team.length - 5} more agents</li>
                    ) : null}
                  </ul>
                </>
              )}
            </article>

            {/* ─── Card 2: Recent Missions ─────────────────────────────── */}
            <article className={cardCls}>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/40 to-transparent" />
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className={HUB_CARD_LABEL_CLASS}>Recent Missions</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('missions')}
                  className={HUB_SECONDARY_BUTTON_CLASS}
                >
                  View All →
                </button>
              </div>

              {/* Running mission pill */}
              {missionActive ? (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/20 px-3 py-2">
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                      {truncateMissionGoal(activeMissionGoal || missionGoal || 'Active mission', 48)}
                    </p>
                    {/* Agent/time detail hidden on mobile */}
                    <p className="hidden sm:block text-[10px] text-emerald-600 dark:text-emerald-400">
                      Running · {missionElapsed} · {team.length} agents
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    ⟳ Live
                  </span>
                </div>
              ) : null}

              {recentMissions.length === 0 && !missionActive ? (
                <div className="flex flex-col items-center gap-2 py-5 text-center">
                  <span className="text-2xl opacity-30">🚀</span>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">No missions yet</p>
                  <button
                    type="button"
                    onClick={() => openNewMissionModal()}
                    className={cn('mt-1', HUB_PRIMARY_BUTTON_CLASS)}
                  >
                    + New Mission
                  </button>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {recentMissions.slice(0, 4).map((mission) => {
                    const durationStr = formatDuration(mission.duration)
                    const statusIcon = mission.failed ? '✗' : '✓'
                    const statusCls = mission.failed ? 'text-red-500' : 'text-emerald-500'
                    const matchReport = missionReports.find((r) => r.id === mission.id)
                    return (
                      <li
                        key={mission.id}
                        className={cn('flex items-center gap-2', insetCls, matchReport && 'cursor-pointer hover:border-accent-300 dark:hover:border-accent-700 transition-colors')}
                        onClick={() => { if (matchReport) setSelectedReport(matchReport) }}
                      >
                        <span className={cn('shrink-0 text-xs font-bold', statusCls)}>{statusIcon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-100">
                            {truncateMissionGoal(mission.name || mission.goal, 44)}
                          </p>
                          {/* Agent count and time details hidden on mobile */}
                          <p className="hidden sm:block text-[10px] text-neutral-400">
                            {mission.agentCount} agents · {durationStr} · {mission.successRate}%
                          </p>
                        </div>
                        <span className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          mission.failed ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                        )}>
                          {mission.failed ? 'Failed' : 'Done'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>

            {/* ─── Card 3: Cost Summary — hidden on mobile (available in dashboard) ── */}
            <article className={cn(cardCls, 'hidden sm:block')}>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-orange-500 via-orange-400/40 to-transparent" />
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className={HUB_CARD_LABEL_CLASS}>Usage &amp; Cost</h2>
                <span className="rounded-full border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                  Today
                </span>
              </div>

              {/* Key metrics row */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className={cn(insetCls, 'text-center')}>
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-0.5">Sessions</p>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">{todaySessions > 0 ? todaySessions : '—'}</p>
                </div>
                <div className={cn(insetCls, 'text-center')}>
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-0.5">Tokens</p>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">
                    {todayTokens > 0 ? (todayTokens >= 1000 ? `${Math.round(todayTokens / 1000)}k` : todayTokens) : '—'}
                  </p>
                </div>
                <div className={cn(insetCls, 'text-center')}>
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-0.5">Cost</p>
                  <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                    {missionAllOAuth && todayEstCost === 0 ? 'Free' : todayEstCost > 0 ? `$${todayEstCost.toFixed(2)}` : '$0.00'}
                  </p>
                </div>
              </div>

              {/* Live mission cost (if running) */}
              {missionActive ? (
                <div className={cn('mb-2 flex items-center justify-between gap-2', insetCls)}>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">Live mission</span>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex size-1.5 shrink-0">
                      <span className="absolute inset-0 animate-ping rounded-full bg-orange-400/60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-accent-500" />
                    </span>
                    <span className="font-mono text-xs font-semibold text-neutral-800 dark:text-white">
                      ${runningCost.toFixed(2)} · {missionElapsed}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Provider breakdown */}
              {providerBreakdown.length > 0 ? (
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-400">Providers in Use</p>
                  <div className="space-y-1.5">
                    {providerBreakdown.map(([provider, count]) => {
                      const pct = team.length > 0 ? Math.round((count / team.length) * 100) : 0
                      return (
                        <div key={provider} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 truncate text-[10px] font-medium text-neutral-600 dark:text-neutral-400 capitalize">{provider}</span>
                          <div className="flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800 h-1.5">
                            <div
                              className="h-full rounded-full bg-orange-400 transition-all"
                              style={{ width: `${Math.max(10, pct)}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-[10px] text-neutral-400">{count}×</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className={cn('flex items-center justify-between gap-2', insetCls)}>
                  <span className="text-[10px] text-neutral-400">No usage data yet</span>
                  <span className="text-[10px] font-mono text-neutral-400">$0.00</span>
                </div>
              )}
            </article>

          </section>
      </div>
    )
  }

  function renderConfigureContent() {
    return (
      <div className="relative flex min-h-full flex-col overflow-x-hidden p-3 sm:p-4 md:h-full md:min-h-0 md:overflow-y-auto dark:bg-[var(--theme-bg,#0b0e14)]">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-neutral-100/60 to-white dark:from-slate-900/60 dark:to-[var(--theme-bg,#0b0e14)]" />
        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-3 sm:gap-4">
        {renderCompactionBanner()}

        {/* ── Header + contextual action ── */}
          <div className={HUB_PAGE_HEADER_CARD_CLASS}>
            <div>
              <h2 className={HUB_PAGE_TITLE_CLASS}>Configure</h2>
              <p className="text-xs text-neutral-500 dark:text-slate-400">Configure agents, teams, API keys, and approvals</p>
            </div>
            {configSection === 'agents' ? (
              <button
                type="button"
                onClick={handleAddAgent}
                className={cn('flex shrink-0 items-center gap-1.5', HUB_PRIMARY_BUTTON_CLASS)}
              >
                + Add Agent
              </button>
            ) : null}
            {configSection === 'teams' ? (
              <button
                type="button"
                onClick={() => setShowAddTeamModal(true)}
                className={cn('flex shrink-0 items-center gap-1.5', HUB_PRIMARY_BUTTON_CLASS)}
              >
                + Add Team
              </button>
            ) : null}
            {configSection === 'keys' ? (
              <button
                type="button"
                onClick={() => { setProviderWizardStep('select'); setProviderWizardSelected(''); setAddProviderApiKey(''); setAddProviderBaseUrl(''); setAddProviderApiType('openai-completions'); setAddProviderName(''); setShowAddProviderModal(true) }}
                className={cn('flex shrink-0 items-center gap-1.5', HUB_PRIMARY_BUTTON_CLASS)}
              >
                + Add Provider
              </button>
            ) : null}
          </div>

        {/* ── Horizontal pill navigation ── */}
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {CONFIG_SECTIONS.map((section) => {
              const isActive = configSection === section.id
              const badge = undefined // approvals moved to header bell
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setConfigSection(section.id)}
                  className={cn(
                    HUB_FILTER_PILL_CLASS,
                    isActive
                      ? HUB_FILTER_PILL_ACTIVE_CLASS
                      : '',
                  )}
                >
                  <span aria-hidden>{section.icon}</span>
                  <span>{section.label}</span>
                  {badge ? (
                    <span className="rounded-full bg-accent-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Content area ── */}
        <div className="min-w-0 overflow-y-auto overflow-x-hidden">
          {configSection === 'agents' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary-200 bg-primary-50/95 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel)]">
                <div>
                  <h2 className={HUB_SUBSECTION_TITLE_CLASS}>Configured Agents</h2>
                  <p className="hidden sm:block text-xs text-neutral-500 dark:text-slate-400">
                    Edit agent identity, model, role description, and system prompt.
                  </p>
                </div>
              </div>

              {/* Mobile: compact list, Desktop: card grid */}
              {/* Mobile agent list (compact rows) */}
              <div className="md:hidden space-y-2 mb-2">
                {allKnownAgents.map((member, index) => {
                  const isInActiveTeam = team.some((m) => m.id === member.id)
                  const ac = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                  return (
                    <div
                      key={member.id}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border border-primary-200 bg-primary-50/80 px-3 py-2.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60 transition-all',
                        !isInActiveTeam && 'opacity-60',
                      )}
                    >
                      {/* Small accent dot */}
                      <span className={cn('size-2.5 shrink-0 rounded-full', ac.bar)} />
                      {/* Name */}
                      <span className="flex-1 min-w-0 text-sm font-semibold text-neutral-900 dark:text-white truncate">
                        {member.name || `Agent ${index + 1}`}
                      </span>
                      {/* Model badge */}
                      <span className="shrink-0 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                        {getModelShortLabel(member.modelId, gatewayModelLabelById)}
                      </span>
                      {/* Role — truncated */}
                      {member.roleDescription ? (
                        <span className="hidden xs:block shrink-0 text-[10px] text-neutral-400 truncate max-w-[80px]">{member.roleDescription}</span>
                      ) : null}
                      {/* Action button */}
                      {isInActiveTeam ? (
                        <button
                          type="button"
                          onClick={() => setAgentWizardOpenId(member.id)}
                          className="shrink-0 flex size-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                          aria-label="Edit agent"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTeam((prev) => [...prev, { ...member, status: 'available' }])}
                          className="shrink-0 flex size-11 items-center justify-center rounded-full bg-orange-50 text-orange-500 transition-colors hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40"
                          aria-label="Add to active team"
                        >
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Desktop: full card grid */}
              <div className="hidden md:grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

              {allKnownAgents.map((member, index) => {
                const isInActiveTeam = team.some((m) => m.id === member.id)
                const ac = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                const hasPrompt = member.backstory.trim().length > 0
                return (
                  <div
                    key={member.id}
                    className={cn('relative rounded-xl border border-primary-200 bg-primary-50/80 px-3 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60 transition-all hover:shadow-md cursor-default', !isInActiveTeam && 'opacity-60')}
                  >
                    {/* Top-right action: edit if in team, add-to-team if not */}
                    {isInActiveTeam ? (
                      <button
                        type="button"
                        onClick={() => setAgentWizardOpenId(member.id)}
                        className="absolute right-2.5 top-2.5 z-10 flex size-11 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-all hover:bg-neutral-200 hover:text-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                        aria-label="Edit agent"
                        title="Edit agent"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTeam((prev) => [...prev, { ...member, status: 'available' }])}
                        className="absolute right-2.5 top-2.5 z-10 flex size-11 items-center justify-center rounded-full bg-orange-50 text-orange-500 transition-all hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40"
                        aria-label="Add to active team"
                        title="Add to active team"
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                      </button>
                    )}

                    <div className="flex flex-col items-center px-4 pt-5 pb-4 text-center">
                      <div className={cn('mb-3 flex size-16 items-center justify-center rounded-full shadow-md', ac.avatar)}>
                        <AgentAvatar index={resolveAgentAvatarIndex(member, index)} color={ac.hex} size={32} />
                      </div>
                      <p className="text-sm font-bold text-neutral-900 dark:text-white leading-tight">{member.name || `Agent ${index + 1}`}</p>
                      <span className="mt-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                        {getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)}
                      </span>
                      {member.roleDescription ? (
                        <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">{member.roleDescription}</p>
                      ) : null}
                      <div className="mt-3 w-full rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 px-2.5 py-2 text-left">
                        {hasPrompt ? (
                          <p className="line-clamp-2 text-[10px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                            {member.backstory.trim().replace(/\s+/g, ' ').slice(0, 120)}…
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAgentWizardOpenId(member.id)}
                            className="flex w-full items-center justify-center gap-1 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
                          >
                            <span>+</span> Set system prompt
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              </div>

              {/* ── Agent Wizard Modals ── */}
              {team.map((member, index) => {
                if (agentWizardOpenId !== member.id) return null
                const ac = AGENT_ACCENT_COLORS[index % AGENT_ACCENT_COLORS.length]
                const avatarIdx = resolveAgentAvatarIndex(member, index)
                const avatarNode = (
                  <div className="relative" data-avatar-picker>
                    <div className={cn('flex size-14 items-center justify-center rounded-full shadow-md', ac.avatar)}>
                      <AgentAvatar index={avatarIdx} color={ac.hex} size={28} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpenId((prev) => prev === member.id ? null : member.id)}
                      className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 shadow-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                      title="Change avatar"
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    {avatarPickerOpenId === member.id ? (
                      <div className="absolute left-0 top-full z-[60] mt-2 w-52 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 shadow-xl">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Choose Avatar</p>
                        <div className="grid grid-cols-5 gap-1.5">
                          {Array.from({ length: AGENT_AVATAR_COUNT }, (_, i) => {
                            const aac = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
                            return (
                              <button key={i} type="button"
                                onClick={() => { setTeam((prev) => prev.map((r) => r.id === member.id ? { ...r, avatar: i } : r)); setAvatarPickerOpenId(null) }}
                                className={cn('flex size-8 items-center justify-center rounded-full border-2 transition-all', avatarIdx === i ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 scale-110' : 'border-transparent bg-neutral-100 dark:bg-neutral-800 hover:scale-105')}>
                                <AgentAvatar index={i} color={aac.hex} size={16} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
                return (
                  <AgentWizardModal
                    key={member.id}
                    member={member}
                    memberIndex={index}
                    accentBorderClass={ac.border}
                    avatarNode={avatarNode}
                    gatewayModels={gatewayModels}
                    modelPresets={MODEL_PRESETS}
                    systemPromptTemplates={SYSTEM_PROMPT_TEMPLATES}
                    onUpdate={(updates) => setTeam((prev) => prev.map((r) => r.id === member.id ? { ...r, ...updates } : r))}
                    onDelete={() => { setTeam((prev) => prev.filter((r) => r.id !== member.id)); setAgentWizardOpenId(null) }}
                    onClose={() => setAgentWizardOpenId(null)}
                  />
                )
              })}

              {/* ── New Agent Draft Wizard (configure BEFORE adding to team) ── */}
              {newAgentDraft ? (() => {
                const draftIndex = team.length
                const draftAc = AGENT_ACCENT_COLORS[draftIndex % AGENT_ACCENT_COLORS.length]
                const draftAvatarIdx = typeof newAgentDraft.avatar === 'number' ? newAgentDraft.avatar : getAgentAvatarForSlot(draftIndex)
                const draftAvatarNode = (
                  <div className="relative" data-avatar-picker>
                    <div className={cn('flex size-14 items-center justify-center rounded-full shadow-md', draftAc.avatar)}>
                      <AgentAvatar index={draftAvatarIdx} color={draftAc.hex} size={28} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvatarPickerOpenId((prev) => prev === newAgentDraft.id ? null : newAgentDraft.id)}
                      className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 shadow-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    {avatarPickerOpenId === newAgentDraft.id ? (
                      <div className="absolute left-0 top-full z-[60] mt-2 w-52 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 shadow-xl">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Choose Avatar</p>
                        <div className="grid grid-cols-5 gap-1.5">
                          {Array.from({ length: AGENT_AVATAR_COUNT }, (_, i) => {
                            const aac = AGENT_ACCENT_COLORS[i % AGENT_ACCENT_COLORS.length]
                            return (
                              <button key={i} type="button"
                                onClick={() => { setNewAgentDraft((prev) => prev ? { ...prev, avatar: i } : null); setAvatarPickerOpenId(null) }}
                                className={cn('flex size-8 items-center justify-center rounded-full border-2 transition-all', draftAvatarIdx === i ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 scale-110' : 'border-transparent bg-neutral-100 dark:bg-neutral-800 hover:scale-105')}>
                                <AgentAvatar index={i} color={aac.hex} size={16} />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
                return (
                  <AgentWizardModal
                    key="new-agent-draft"
                    member={newAgentDraft}
                    memberIndex={draftIndex}
                    accentBorderClass={draftAc.border}
                    avatarNode={draftAvatarNode}
                    gatewayModels={gatewayModels}
                    modelPresets={MODEL_PRESETS}
                    systemPromptTemplates={SYSTEM_PROMPT_TEMPLATES}
                    addMode={true}
                    onUpdate={(updates) => setNewAgentDraft((prev) => prev ? { ...prev, ...updates } : null)}
                    onDelete={() => { setNewAgentDraft(null); setAvatarPickerOpenId(null) }}
                    onClose={() => {
                      // "Add Agent" clicked — add the configured draft to the team
                      if (newAgentDraft) {
                        const finalName = newAgentDraft.name.trim() || `Agent ${team.length + 1}`
                        setTeam((prev) => [...prev, { ...newAgentDraft, name: finalName }])
                      }
                      setNewAgentDraft(null)
                      setAvatarPickerOpenId(null)
                    }}
                  />
                )
              })() : null}
            </div>
          ) : null}

          {configSection === 'teams' ? (
            <div className="space-y-6">

              {/* Saved team configs */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-3 rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel)]">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900 dark:text-white">My Teams</h2>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{teamConfigs.length} saved · {team.length} agents active</p>
                  </div>
                </div>
                {teamConfigs.length === 0 ? (
                  <button type="button" onClick={() => setShowAddTeamModal(true)}
                    className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-8 text-center transition-all hover:border-orange-400 hover:bg-orange-50/20">
                    <span className="flex size-10 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xl">👥</span>
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Create your first team</p>
                    <p className="text-[10px] text-neutral-400 dark:text-neutral-500">Save a config or start from a template</p>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {teamConfigs.map((config, tIdx) => {
                      const isActive = selectedTeamConfigId === config.id
                      const teamColors = ['border-blue-300', 'border-emerald-300', 'border-violet-300', 'border-amber-300', 'border-pink-300', 'border-teal-300']
                      return (
                        <div key={config.id} className={cn('relative rounded-xl border-2 bg-white dark:bg-neutral-900 shadow-sm transition-all hover:shadow-md', isActive ? 'border-orange-400' : teamColors[tIdx % teamColors.length])}>
                          {isActive ? <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">Active</span> : null}
                          <button type="button" onClick={() => setTeamWizardOpenId(config.id)}
                            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 transition-all" title="Edit team">
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <div className="flex flex-col items-center px-3 pt-5 pb-3 text-center">
                            <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-xl shadow-sm">{config.icon ?? '👥'}</div>
                            <p className="text-xs font-bold text-neutral-900 dark:text-white leading-tight">{config.name}</p>
                            <p className="mt-0.5 text-[10px] text-neutral-400">{config.team.length} agents</p>
                            <div className="mt-2 flex flex-wrap justify-center gap-1">
                              {config.team.slice(0, 3).map((m) => <span key={m.id} className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">{m.name}</span>)}
                              {config.team.length > 3 ? <span className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">+{config.team.length - 3}</span> : null}
                            </div>
                          </div>
                          <div className="border-t border-neutral-100 dark:border-neutral-800 flex">
                            <button type="button" onClick={() => { setSelectedTeamConfigId(config.id); loadTeamConfig(config.id) }}
                              className="flex-1 py-2 text-[10px] font-semibold text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors rounded-bl-xl">Activate</button>
                            <div className="w-px bg-neutral-100 dark:bg-neutral-800" />
                            <button type="button" onClick={() => setTeamWizardOpenId(config.id)}
                              className="flex-1 py-2 text-[10px] font-medium text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors rounded-br-xl">Edit</button>
                          </div>
                        </div>
                      )
                    })}
                    <button type="button" onClick={() => setShowAddTeamModal(true)}
                      className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-center transition-all hover:border-orange-400 hover:bg-orange-50/20">
                      <span className="flex size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-base text-neutral-400">+</span>
                      <span className="text-[10px] font-medium text-neutral-400">New Team</span>
                    </button>
                  </div>
                )}

                {/* Team Wizard Modals */}
                {teamConfigs.map((config) => teamWizardOpenId !== config.id ? null : (
                  <TeamWizardModal key={config.id}
                    teamId={config.id}
                    teamName={config.name}
                    teamIcon={config.icon ?? '👥'}
                    teamDescription={config.description ?? ''}
                    teamMembers={config.team}
                    availableAgents={team.map((m) => ({ id: m.id, name: m.name, role: m.roleDescription }))}
                    isActive={selectedTeamConfigId === config.id}
                    modelPresets={MODEL_PRESETS}
                    gatewayModels={gatewayModels}
                    onRename={(name) => {
                      setTeamConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, name, updatedAt: Date.now() } : c))
                    }}
                    onUpdateIcon={(icon) => {
                      setTeamConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, icon, updatedAt: Date.now() } : c))
                    }}
                    onUpdateDescription={(desc) => {
                      setTeamConfigs((prev) => prev.map((c) => c.id === config.id ? { ...c, description: desc, updatedAt: Date.now() } : c))
                    }}
                    onUpdateMembers={(members) => {
                      setTeamConfigs((prev) => prev.map((c) => {
                        if (c.id !== config.id) return c
                        // Preserve existing TeamMember properties for existing members, use defaults for new ones
                        const updatedTeam = members.map((m) => {
                          const existing = c.team.find((t) => t.id === m.id)
                          if (existing) {
                            // Update model but keep other properties
                            return { ...existing, modelId: m.modelId }
                          } else {
                            // New member - pull full data from team state
                            const agent = team.find((a) => a.id === m.id)
                            return {
                              id: m.id,
                              name: m.name,
                              modelId: m.modelId,
                              roleDescription: agent?.roleDescription ?? '',
                              goal: agent?.goal ?? '',
                              backstory: agent?.backstory ?? '',
                              status: agent?.status ?? 'idle',
                            }
                          }
                        })
                        return {
                          ...c,
                          team: updatedTeam,
                          updatedAt: Date.now(),
                        }
                      }))
                    }}
                    onLoad={() => { setSelectedTeamConfigId(config.id); loadTeamConfig(config.id) }}
                    onDelete={() => { deleteTeamConfig(config.id); setTeamWizardOpenId(null) }}
                    onClose={() => setTeamWizardOpenId(null)} />
                ))}
                {showAddTeamModal ? (
                  <AddTeamModal
                    currentTeam={team}
                    quickStartTemplates={TEAM_QUICK_TEMPLATES}
                    existingIcons={teamConfigs.map((c) => c.icon ?? '').filter(Boolean)}
                    onSaveCurrentAs={(name, icon, selectedAgentIds) => {
                      const timestamp = Date.now()
                      const newId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                        ? crypto.randomUUID()
                        : `${timestamp}-${Math.random().toString(36).slice(2, 8)}`
                      const selectedMembers = team.filter((m) => selectedAgentIds.includes(m.id))
                      const entryName = name || `Custom Team ${new Date().toLocaleDateString()}`
                      const nextEntry: SavedTeamConfig = {
                        id: newId,
                        name: entryName,
                        icon,
                        createdAt: timestamp,
                        updatedAt: timestamp,
                        team: selectedMembers.map((m) => ({ ...m })),
                      }
                      setTeamConfigs((prev) => [nextEntry, ...prev].slice(0, 30))
                      setSelectedTeamConfigId(newId)
                      toast(`Saved team: ${entryName}`, { type: 'success' })
                    }}
                    onApplyTemplate={applyTemplate}
                    onClose={() => setShowAddTeamModal(false)} />
                ) : null}
              </div>

            </div>
          ) : null}

          {configSection === 'keys' ? (
            <div className="space-y-5">
              {/* ── Add Provider Wizard Modal ── */}
              <WizardModal open={showAddProviderModal} onClose={() => { setShowAddProviderModal(false); setProviderWizardStep('select'); setProviderWizardSelected(''); setAddProviderApiKey(''); setAddProviderBaseUrl(''); setAddProviderApiType('openai-completions'); setProviderTestStatus('idle'); setProviderTestError('') }} width="max-w-2xl">
                {/* Wizard header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 border-l-4 border-l-orange-400">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900 dark:text-white">Add Provider</h2>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {providerWizardStep === 'select' ? 'Step 1 — Choose a provider' : `Step 2 — Enter your ${providerWizardSelected || addProviderName} API key`}
                    </p>
                  </div>
                  {/* Step indicator + close */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('size-2 rounded-full', providerWizardStep === 'select' ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
                      <span className={cn('size-2 rounded-full', providerWizardStep === 'key' ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600')} />
                    </div>
                    <button type="button" onClick={() => { setShowAddProviderModal(false); setProviderWizardStep('select'); setProviderWizardSelected(''); setAddProviderApiKey(''); setAddProviderBaseUrl(''); setAddProviderApiType('openai-completions'); setProviderTestStatus('idle'); setProviderTestError('') }}
                      className="flex size-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-700 dark:hover:text-white transition-colors">
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                </div>

                {/* Step 1: Provider grid */}
                {providerWizardStep === 'select' ? (
                  <div className="px-6 py-5">
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                      {([...KNOWN_GATEWAY_PROVIDERS, CUSTOM_PROVIDER_OPTION] as const).map((provider, pIdx) => {
                        const isCustom = provider === CUSTOM_PROVIDER_OPTION
                        const isAlreadyAdded = configuredProviders.includes(provider)
                        const pColors = [
                          { border: 'border-blue-200 hover:border-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
                          { border: 'border-emerald-200 hover:border-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
                          { border: 'border-violet-200 hover:border-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-600 dark:text-violet-400' },
                          { border: 'border-amber-200 hover:border-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
                          { border: 'border-pink-200 hover:border-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/20', text: 'text-pink-600 dark:text-pink-400' },
                          { border: 'border-teal-200 hover:border-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-teal-600 dark:text-teal-400' },
                        ]
                        const pm = (PROVIDER_META as Record<string, { label: string; emoji: string; color: string; bg: string; border: string; description: string }>)[provider.toLowerCase()]
                        const tileBorder = isCustom ? 'border-neutral-200 hover:border-neutral-400' : (pm?.border ?? pColors[pIdx % pColors.length].border)
                        const tileBg = isCustom ? 'bg-neutral-50 dark:bg-neutral-800' : (pm?.bg ?? pColors[pIdx % pColors.length].bg)
                        return (
                          <button
                            key={provider}
                            type="button"
                            onClick={() => {
                              setProviderWizardSelected(provider)
                              setAddProviderSelection(provider)
                              setSelectedModel('')
                              if (provider !== CUSTOM_PROVIDER_OPTION) {
                                setAddProviderName(provider)
                              } else {
                                setAddProviderName('')
                              }
                              setProviderWizardStep('key')
                            }}
                            className={cn('relative rounded-xl border-2 p-3 text-center transition-all hover:shadow-sm', tileBorder)}
                          >
                            {isAlreadyAdded ? (
                              <span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white font-bold">✓</span>
                            ) : null}
                            <div className={cn('mx-auto mb-1.5 flex size-8 items-center justify-center rounded-full', tileBg)}>
                              {isCustom ? <span className="text-sm">⚙️</span> : <ProviderLogo provider={provider} size={18} />}
                            </div>
                            <p className="text-[10px] font-medium text-neutral-700 dark:text-neutral-300 truncate leading-tight">
                              {isCustom ? 'Custom' : (pm?.label ?? provider)}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Step 2: Key entry */}
                {providerWizardStep === 'key' ? (
                  <div className="px-6 py-5 space-y-3">
                    {/* Back */}
                    <button
                      type="button"
                      onClick={() => { setProviderWizardStep('select'); setAddProviderApiKey(''); setAddProviderBaseUrl(''); setAddProviderApiType('openai-completions'); setProviderTestStatus('idle'); setProviderTestError('') }}
                      className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7 2L3 6l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Back
                    </button>

                    {/* Custom name input */}
                    {addProviderSelection === CUSTOM_PROVIDER_OPTION ? (
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Provider Name</label>
                        <input
                          value={addProviderName}
                          onChange={(event) => { setAddProviderName(event.target.value); setSelectedModel('') }}
                          placeholder="e.g. together, fireworks..."
                          className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1"
                        />
                      </div>
                    ) : null}

                    {/* Custom Base URL input */}
                    {addProviderSelection === CUSTOM_PROVIDER_OPTION ? (
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Base URL</label>
                        <input
                          value={addProviderBaseUrl}
                          onChange={(event) => setAddProviderBaseUrl(event.target.value)}
                          placeholder="e.g. https://api.together.ai/v1"
                          className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1 font-mono"
                        />
                        <p className="mt-1 text-[10px] text-neutral-400">Ollama: http://host:11434/v1 · Together: https://api.together.ai/v1</p>
                      </div>
                    ) : null}

                    {/* Custom API Protocol select */}
                    {addProviderSelection === CUSTOM_PROVIDER_OPTION ? (
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">API Protocol</label>
                        <select
                          value={addProviderApiType}
                          onChange={(event) => setAddProviderApiType(event.target.value)}
                          className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1"
                        >
                          <option value="openai-completions">OpenAI Compatible (most providers)</option>
                          <option value="anthropic-messages">Anthropic Messages API</option>
                          <option value="google-generative-ai">Google Generative AI</option>
                          <option value="ollama">Ollama Native</option>
                        </select>
                        <p className="mt-1 text-[10px] text-neutral-400">Ollama, Together, Fireworks, LMStudio → OpenAI Compatible</p>
                      </div>
                    ) : null}

                    {/* API Key */}
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">API Key</label>
                      <input
                        type="password"
                        value={addProviderApiKey}
                        onChange={(event) => { setAddProviderApiKey(event.target.value); setProviderTestStatus('idle'); setProviderTestError('') }}
                        placeholder={`${addProviderName || 'Provider'} API key…`}
                        autoFocus
                        className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1 font-mono"
                      />
                    </div>

                    {/* Test Connection */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { void handleTestProviderKey() }}
                        disabled={providerTestStatus === 'testing' || !addProviderApiKey.trim() || !addProviderName.trim()}
                        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:border-neutral-300 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {providerTestStatus === 'testing' ? (
                          <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1a4 4 0 1 1-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 5.5L3.5 8L9 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        )}
                        {providerTestStatus === 'testing' ? 'Testing…' : 'Test Connection'}
                      </button>
                      {providerTestStatus === 'ok' ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 6.5L4.5 9.5L10.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          Connected ✓
                        </span>
                      ) : null}
                      {providerTestStatus === 'error' ? (
                        <span className="text-xs font-medium text-red-500 dark:text-red-400" title={providerTestError}>
                          ✗ {providerTestError.length > 40 ? `${providerTestError.slice(0, 40)}…` : providerTestError}
                        </span>
                      ) : null}
                    </div>

                    {/* Model select — gateway models first, curated fallback for new providers */}
                    {addProviderName.trim() ? (() => {
                      const key = addProviderName.trim().toLowerCase()
                      const curatedModels = (PROVIDER_COMMON_MODELS as Record<string, Array<{ value: string; label: string }>>)[key] ?? []
                      const modelOptions = addProviderAvailableModels.length > 0 ? addProviderAvailableModels : curatedModels
                      if (modelOptions.length === 0) return null
                      return (
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                            Default Model{' '}
                            <span className="font-normal normal-case text-neutral-300">
                              {addProviderAvailableModels.length === 0 ? '— common models' : '(optional)'}
                            </span>
                          </label>
                          <select
                            value={selectedModel}
                            onChange={(event) => setSelectedModel(event.target.value)}
                            className="h-9 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 dark:text-white outline-none ring-orange-400 focus:ring-1"
                          >
                            <option value="">Use gateway default</option>
                            {modelOptions.map((model) => (
                              <option key={model.value} value={model.value}>{model.label}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })() : null}

                    <button
                      type="button"
                      onClick={() => {
                        void handleAddProvider().then(() => {
                          setProviderWizardStep('select')
                          setProviderWizardSelected('')
                        })
                      }}
                      disabled={isAddingProvider || !addProviderApiKey.trim() || !addProviderName.trim()}
                      className="w-full rounded-lg bg-accent-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAddingProvider ? 'Adding…' : `Connect ${addProviderName || 'Provider'}`}
                    </button>
                  </div>
                ) : null}
              </WizardModal>

              {/* Connected providers section */}
              <div>
                <div className="flex items-center justify-between mb-3 rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel)]">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900 dark:text-white">Connected Providers</h2>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{configuredProviders.length} active · {gatewayModels.length} models available</p>
                  </div>
                </div>
                {configuredProviders.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <span className="text-xl">🔑</span>
                    <p className="text-xs text-neutral-400">No configured providers detected. Add one above.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {configuredProviders.map((provider) => {
                      const providerModels = gatewayModels.filter((m) => m.provider === provider)
                      const pm = (PROVIDER_META as Record<string, { label: string; emoji: string; color: string; bg: string; border: string; description: string }>)[provider.toLowerCase()] ?? { label: provider, emoji: '🔑', color: 'text-neutral-600', bg: 'bg-neutral-100 dark:bg-neutral-800', border: 'border-neutral-300', description: '' }
                      return (
                        <div key={provider}
                          className={cn('relative rounded-xl border-2 bg-white dark:bg-neutral-900 shadow-sm transition-all hover:shadow-md', pm.border)}
                        >
                          {/* Edit pencil */}
                          <button type="button" onClick={() => setProviderEditModalProvider(provider)}
                            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 transition-all" title="Edit provider">
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M7 1.5l1.5 1.5L3 8.5H1.5V7L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <div className="flex flex-col items-center px-3 pt-4 pb-3 text-center">
                            <div className={cn('mb-2 flex size-12 items-center justify-center rounded-full shadow-sm', pm.bg)}>
                              <ProviderLogo provider={provider} size={28} />
                            </div>
                            <p className="text-xs font-bold text-neutral-900 dark:text-white leading-tight">{pm.label}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">{pm.description}</p>
                            <div className="mt-1 flex items-center gap-1">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Active</span>
                            </div>
                            <span className="mt-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                              {providerModels.length} model{providerModels.length !== 1 ? 's' : ''}
                            </span>
                            {providerModels.length > 0 ? (
                              <div className="mt-2 w-full space-y-0.5">
                                {providerModels.slice(0, 3).map((m) => (
                                  <span key={m.value} className="block truncate rounded bg-neutral-50 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:text-neutral-400">{m.label}</span>
                                ))}
                                {providerModels.length > 3 ? <span className="block text-[10px] text-neutral-400 text-center">+{providerModels.length - 3} more</span> : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                    {/* Inline Add Provider card */}
                    <button
                      type="button"
                      onClick={() => { setProviderWizardStep('select'); setProviderWizardSelected(''); setAddProviderApiKey(''); setAddProviderBaseUrl(''); setAddProviderApiType('openai-completions'); setAddProviderName(''); setProviderTestStatus('idle'); setProviderTestError(''); setShowAddProviderModal(true) }}
                      className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-6 text-center shadow-sm transition-all hover:border-orange-400 hover:shadow-md group"
                    >
                      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-400 group-hover:bg-orange-50 group-hover:text-orange-500 transition-colors">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      </div>
                      <p className="text-xs font-semibold text-neutral-400 group-hover:text-orange-500 transition-colors">Add Provider</p>
                    </button>
                  </div>
                )}
              </div>

              {/* Provider Edit Modal */}
              {providerEditModalProvider ? (
                <ProviderEditModal
                  provider={providerEditModalProvider}
                  currentModels={gatewayModels.filter((m) => m.provider === providerEditModalProvider)}
                  availableModels={gatewayModels.filter((m) => m.provider === providerEditModalProvider)}
                  onSave={async (apiKey: string) => {
                    try {
                      const res = await fetch('/api/gateway-config', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ action: 'update-provider-key', provider: providerEditModalProvider, apiKey }),
                      })
                      if (!res.ok) throw new Error(`HTTP ${res.status}`)
                      toast('Provider key updated', { type: 'success' })
                      setProviderEditModalProvider(null)
                      void refreshGatewayStatus().then((connected) => {
                        if (connected) return refreshConfiguredProviders()
                        return Promise.resolve()
                      })
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Failed to update provider key', { type: 'error' })
                    }
                  }}
                  onClose={() => setProviderEditModalProvider(null)}
                  onDelete={async () => {
                    if (!window.confirm(`Remove provider "${providerEditModalProvider}"? This will delete the API key.`)) return
                    try {
                      const res = await fetch('/api/gateway-config', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ action: 'remove-provider', provider: providerEditModalProvider }),
                      })
                      if (!res.ok) throw new Error(`HTTP ${res.status}`)
                      toast(`Provider removed`, { type: 'success' })
                      setProviderEditModalProvider(null)
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Remove failed', { type: 'error' })
                    }
                  }}
                />
              ) : null}
            </div>
          ) : null}

          {/* Approvals moved to header bell — see ApprovalsBell component */}
        </div>
        </div>
      </div>
    )
  }

  function renderMissionsTabContent() {
    const currentTeamLabel = `${activeTemplateId ? TEMPLATE_DISPLAY_NAMES[activeTemplateId] : 'Custom Team'} · ${team.length} agents`
    const missionTasksForBoard = missionTasks.length > 0 ? missionTasks : boardTasks
    const runningTaskStats = computeMissionTaskStats(missionTasksForBoard)
    const runningProgressPct = runningTaskStats.total > 0 ? Math.round((runningTaskStats.completed / runningTaskStats.total) * 100) : 0
    const missionTeamOptions = [
      { id: '__current__', label: currentTeamLabel, team },
      ...teamConfigs.map((config) => ({
        id: config.id,
        label: `${config.name} · ${config.team.length} agents`,
        team: config.team,
      })),
    ]
    const _selectedMissionTeamOption =
      missionTeamOptions.find((option) => option.id === newMissionTeamConfigId)
      ?? missionTeamOptions[0]
    void _selectedMissionTeamOption
    // ── Build unified mission list ─────────────────────────────────────────
    type MissionListStatus = 'running' | 'needs_input' | 'complete' | 'failed'
    type MissionListEntry = {
      id: string
      status: MissionListStatus
      title: string
      goal: string
      agents: string[]
      duration: string
      startedAt: number
      report?: StoredMissionReport
    }

    const missionListEntries: MissionListEntry[] = []

    // Active mission (if any)
    if (missionActive) {
      const anyWaiting = agentWorkingRows.some((r) => r.status === 'waiting_for_input')
      missionListEntries.push({
        id: missionIdRef.current || 'active',
        status: anyWaiting ? 'needs_input' : 'running',
        title: activeMissionName || activeMissionGoal || missionGoal || 'Active Mission',
        goal: activeMissionGoal || missionGoal || '',
        agents: team.map((m) => m.name),
        duration: missionStartedAtRef.current ? formatDuration(Date.now() - missionStartedAtRef.current) : '0s',
        startedAt: missionStartedAtRef.current || Date.now(),
      })
    }

    // History entries
    for (const cp of missionHistory) {
      const completedTasks = cp.tasks.filter((t) => t.status === 'done' || t.status === 'completed').length
      const totalTasks = cp.tasks.length
      const isComplete = completedTasks >= totalTasks && totalTasks > 0 && cp.status !== 'aborted'
      const completedAt = cp.completedAt ?? cp.updatedAt
      const dur = completedAt > cp.startedAt ? formatDuration(completedAt - cp.startedAt) : '—'
      const matchingReport = missionReports.find((report) => getStoredMissionReportMissionId(report) === cp.id)
        ?? buildStoredMissionReportFromCheckpoint(cp)
        ?? undefined
      const agentNames = cp.tasks
        .map((t) => t.assignedTo)
        .filter((name, idx, arr): name is string => Boolean(name) && arr.indexOf(name) === idx)
      missionListEntries.push({
        id: cp.id,
        status: cp.status === 'aborted' ? 'failed' : isComplete ? 'complete' : 'failed',
        title: truncateMissionGoal(cp.label, 96),
        goal: cp.label,
        agents: agentNames,
        duration: dur,
        startedAt: cp.startedAt ?? cp.updatedAt,
        report: matchingReport,
      })
    }

    // Reports not in history
    for (const report of missionReports) {
      if (missionListEntries.some((e) => e.id === report.id)) continue
      missionListEntries.push({
        id: report.id,
        status: 'complete',
        title: truncateMissionGoal(report.name || report.goal || 'Mission', 96),
        goal: report.goal,
        agents: report.agents.map((a) => a.name),
        duration: formatDuration(report.duration),
        startedAt: report.completedAt - report.duration,
        report,
      })
    }

    // Sort: running/needs_input first, then by startedAt desc
    missionListEntries.sort((a, b) => {
      const priority = { running: 0, needs_input: 1, complete: 2, failed: 3 } as const
      if (priority[a.status] !== priority[b.status]) return priority[a.status] - priority[b.status]
      return b.startedAt - a.startedAt
    })

    // Deduplicate entries with the same ID (history + reports can overlap)
    const seenIds = new Set<string>()
    const dedupedEntries = missionListEntries.filter((entry) => {
      if (seenIds.has(entry.id)) return false
      seenIds.add(entry.id)
      return true
    })

    const filteredEntries = missionSubTab === 'all'
      ? dedupedEntries
      : dedupedEntries.filter((e) => e.status === missionSubTab)

    const filterTabs: Array<{ id: typeof missionSubTab; label: string; count: number }> = [
      { id: 'all', label: 'All', count: dedupedEntries.length },
      { id: 'running', label: 'Running', count: dedupedEntries.filter((e) => e.status === 'running').length },
      { id: 'needs_input', label: 'Needs Input', count: dedupedEntries.filter((e) => e.status === 'needs_input').length },
      { id: 'complete', label: 'Complete', count: dedupedEntries.filter((e) => e.status === 'complete').length },
      { id: 'failed', label: 'Failed', count: dedupedEntries.filter((e) => e.status === 'failed').length },
    ]

    const STATUS_BADGE: Record<MissionListStatus, { bg: string; text: string; label: string; pulse?: boolean }> = {
      running: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Running', pulse: true },
      needs_input: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'Needs Input', pulse: true },
      complete: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', label: 'Complete' },
      failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Failed' },
    }

	    const missionCardCls = 'relative overflow-hidden rounded-xl border border-primary-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-800 px-4 py-3'
	    return (
	      <div className="relative flex h-full min-h-0 flex-col overflow-x-hidden bg-primary-100/45 dark:bg-[var(--theme-bg,#0b0e14)]">
	        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-neutral-100/60 to-white dark:from-neutral-800/20 dark:to-neutral-950" />
	        <div className="relative mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col gap-3 p-3 pb-24 sm:gap-4 sm:p-4 sm:pb-4">
	          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className={HUB_PAGE_HEADER_CARD_CLASS}>
            <div>
              {/* Mobile: short label; Desktop: full title + description */}
              <h2 className={HUB_PAGE_TITLE_CLASS}>
                <span className="md:hidden">Missions</span>
                <span className="hidden md:inline">Mission Control</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Track and manage all agent runs</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openNewMissionModal()}
                className={HUB_PRIMARY_BUTTON_CLASS}
              >
                + New Mission
              </button>
            </div>
          </div>

          {/* ── Filter Bar — scrollable on mobile, full flex on desktop ── */}
          <div className="relative w-full overflow-hidden">
            <div className="flex w-full items-center gap-2 overflow-x-auto pr-3 scrollbar-none">
              {filterTabs.map((tab) => {
                const isActive = missionSubTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMissionSubTab(tab.id)}
                    className={cn(
                      HUB_FILTER_PILL_CLASS,
                      'gap-1.5',
                      isActive
                        ? HUB_FILTER_PILL_ACTIVE_CLASS
                        : '',
                    )}
                  >
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {tab.count > 0 && (
                      <span
                        className={cn(
                          'inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                          isActive
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-neutral-900"
            />
          </div>

          {/* ── Compaction Banner ──────────────────────────────────────── */}
          {renderCompactionBanner()}

          {/* ── Mission List ────────────────────────────────────────────── */}
          <div className="min-h-0 flex-1 overflow-auto">
            {filteredEntries.length === 0 ? (
              <div className={cn('flex h-48 items-center justify-center text-center', missionCardCls)}>
                <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent-500 via-accent-400/40 to-transparent" />
                <div className="max-w-md">
                  <span className="text-3xl">{missionSubTab === 'all' ? '🚀' : missionSubTab === 'running' ? '⏳' : missionSubTab === 'needs_input' ? '💬' : missionSubTab === 'complete' ? '✅' : '❌'}</span>
                  <p className="mt-2 text-sm font-medium text-neutral-600 dark:text-neutral-400">
                    {missionSubTab === 'all'
                      ? 'No active missions — launch one with New Mission ↑'
                      : missionSubTab === 'running'
                        ? 'No missions running right now'
                        : missionSubTab === 'needs_input'
                          ? 'No missions waiting for input'
                          : missionSubTab === 'complete'
                            ? 'No completed missions yet — finish your first one!'
                            : 'No failed missions — nice!'}
                  </p>
                  {missionSubTab === 'all' && (
                    <button
                      type="button"
                      onClick={() => openNewMissionModal()}
                    className={cn('mt-3', HUB_PRIMARY_BUTTON_CLASS)}
                    >
                      + New Mission
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map((entry) => {
                  const badge = STATUS_BADGE[entry.status]
                  const isLive = entry.status === 'running' || entry.status === 'needs_input'
                  return (
                    <article
                      key={entry.id}
                      className={cn(
                        missionCardCls,
                        'cursor-pointer transition-all hover:shadow-md',
                        entry.status === 'running' && 'ring-2 ring-blue-400/40 dark:ring-blue-500/30 border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-950/20',
                        entry.status === 'needs_input' && 'ring-2 ring-amber-400/50 dark:ring-amber-500/30 border-amber-200 dark:border-amber-800/50',
                        entry.status === 'complete' && 'hover:border-emerald-300 dark:hover:border-emerald-700',
                        entry.status === 'failed' && 'hover:border-red-300 dark:hover:border-red-700',
                        entry.report && 'hover:border-accent-300 dark:hover:border-accent-700',
                      )}
                      onClick={() => {
                        if (isLive) {
                          // For running/needs_input: expand agent output panel
                          setOutputPanelVisible(true)
                          if (!selectedOutputAgentId && team.length > 0) {
                            setSelectedOutputAgentId(team[0].id)
                          }
                        } else if (entry.report) {
                          setSelectedReport(entry.report)
                        }
                      }}
                    >
                      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent-500 via-accent-400/40 to-transparent" />
                      <div className="flex items-center gap-3">
                        {/* Status Badge */}
                        <span className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                          badge.bg, badge.text,
                          badge.pulse && 'animate-pulse',
                        )}>
                          {badge.label}
                        </span>

                        {/* Mission Title + Goal + Short ID */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 truncate">{entry.title}</p>
                            {/* Short ID hidden on mobile */}
                            <span className="hidden sm:inline shrink-0 rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 dark:text-neutral-500">
                              #{entry.id.slice(-6)}
                            </span>
                          </div>
                          {/* Goal subtitle hidden on mobile */}
                          {entry.goal !== entry.title && (
                            <p className="hidden sm:block mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 truncate">{entry.goal}</p>
                          )}
                        </div>

                        {/* Agent count + avatars — hidden on mobile */}
                        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                          <div className="flex -space-x-1.5">
                            {entry.agents.slice(0, 3).map((name, idx) => {
                              const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
                              return (
                                <div key={`${entry.id}-agent-${idx}`} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white dark:border-neutral-900 bg-neutral-800 dark:bg-neutral-700 text-[8px] font-bold text-white" title={name}>
                                  {initials}
                                </div>
                              )
                            })}
                            {entry.agents.length > 3 && (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white dark:border-neutral-900 bg-neutral-300 dark:bg-neutral-600 text-[8px] font-bold text-neutral-700 dark:text-neutral-300">
                                +{entry.agents.length - 3}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">{entry.agents.length} agent{entry.agents.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Duration — always shown but smaller on mobile */}
                        <span className="shrink-0 text-[10px] sm:text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">{entry.duration}</span>

                        {/* Started At — hidden on mobile */}
                        <span className="hidden md:block shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{timeAgoFromMs(entry.startedAt)}</span>

                        {/* Action */}
                        <div className="shrink-0">
                          {isLive ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOutputPanelVisible(true)
                                if (!selectedOutputAgentId && team.length > 0) setSelectedOutputAgentId(team[0].id)
                              }}
                              className={HUB_SECONDARY_BUTTON_CLASS}
                            >
                              <span className="hidden sm:inline">Live Output ↗</span>
                              <span className="sm:hidden">Live ↗</span>
                            </button>
                          ) : entry.report ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedReport(entry.report!) }}
                              className={HUB_SECONDARY_BUTTON_CLASS}
                            >
                              <span className="hidden sm:inline">View Report</span>
                              <span className="sm:hidden">View</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openNewMissionModal({ name: `Rerun: ${entry.title}`, goal: entry.goal }) }}
                              className={HUB_SECONDARY_BUTTON_CLASS}
                            >
                              Re-run
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ── Inline expansion for running/needs_input missions ── */}
                      {isLive && (
                        <div className="mt-3 space-y-3 border-t border-neutral-100 dark:border-neutral-800 pt-3">
                          {/* Progress bar — prominent */}
                          <div className="flex items-center gap-3">
                            <div className="h-2.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                              <div className="h-2.5 rounded-full bg-accent-500 transition-all duration-500 ease-out" style={{ width: `${Math.max(4, runningProgressPct)}%` }} />
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">{runningProgressPct}%</span>
                            <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">{runningTaskStats.completed}/{runningTaskStats.total}</span>
                          </div>

                          {/* Agent status rows */}
                          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-slate-800/50">
                            {agentWorkingRows.map((row) => {
                              const statusMeta = getAgentStatusMeta(row.status)
                              const lastOutput = extractPreviewLine(agentOutputLines[row.id] ?? [])
                              const canSteer = row.status === 'active' || row.status === 'waiting_for_input'
                              return (
                                <div key={row.id} className="flex items-center gap-2 px-3 py-2">
                                  <span className={cn('size-2 shrink-0 rounded-full', statusMeta.dotClassName, statusMeta.pulse && 'animate-pulse')} />
                                  <span className="text-xs font-semibold text-neutral-900 dark:text-white shrink-0">{row.name}</span>
                                  <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', statusMeta.className)}>
                                    {statusMeta.label}
                                  </span>
                                  {retryingAgents[row.id] ? (
                                    <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                      Retrying...
                                    </span>
                                  ) : null}
                                  {lastOutput !== 'Agent working...' ? (
                                    <span className="ml-auto truncate text-[10px] text-neutral-400 max-w-[200px] font-mono">{lastOutput}</span>
                                  ) : (agentOutputLines[row.id]?.length ?? 0) > 0 ? (
                                    <span className="ml-auto truncate text-[10px] text-neutral-500 max-w-[200px] font-mono italic">{lastOutput}</span>
                                  ) : null}
                                  {/* Per-agent Steer button */}
                                  {canSteer && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSteerAgentId(row.id)
                                        setSteerInput('')
                                      }}
                                      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/50 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                                      title={`Send directive to ${row.name}`}
                                    >
                                      ✦ Steer
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Warden controls — single source of truth for mission actions */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void handleMissionPause(false) }}
                              disabled={missionState === 'running'}
                              className="min-h-11 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
                            >
                              ▶ Resume
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void handleMissionPause(true) }}
                              disabled={missionState === 'paused'}
                              className="min-h-11 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
                            >
                              ⏸ Pause
                            </button>
                            {/* Steer button — opens inline input for sending a directive to the first active/waiting agent */}
                            {(missionState === 'running' || agentWorkingRows.some((r) => r.status === 'waiting_for_input')) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // Pick first active or waiting_for_input agent
                                  const targetAgent = agentWorkingRows.find((r) => r.status === 'waiting_for_input' || r.status === 'active')
                                  if (targetAgent) {
                                    setSteerAgentId(targetAgent.id)
                                    setSteerInput('')
                                  } else {
                                    toast('No active agent to steer', { type: 'warning' })
                                  }
                                }}
                                className="min-h-11 rounded-md bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-600"
                              >
                                ✦ Steer
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); stopMissionAndCleanup('aborted') }}
                              className="min-h-11 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                            >
                              ■ Stop
                            </button>
                            <div className="flex-1" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOutputPanelVisible(true)
                                if (!selectedOutputAgentId && team.length > 0) setSelectedOutputAgentId(team[0].id)
                              }}
                              className={HUB_SECONDARY_BUTTON_CLASS}
                            >
                              Live Output ↗
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      {/* ── Steer Agent Modal ────────────────────────────────────────────── */}
      {steerAgentId ? (() => {
        const steerMember = team.find((m) => m.id === steerAgentId)
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center" onClick={() => setSteerAgentId(null)}>
            <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-neutral-900 dark:text-white">Steer Agent</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">{steerMember?.name ?? steerAgentId}</p>
                </div>
                <button type="button" onClick={() => setSteerAgentId(null)} className="flex size-11 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200">✕</button>
              </div>
              <textarea
                value={steerInput}
                onChange={(e) => setSteerInput(e.target.value)}
                placeholder="Send a directive to this agent, e.g. 'Focus on X' or 'Stop doing Y and start Z'"
                className="w-full resize-none rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-neutral-900 dark:text-white outline-none focus:ring-1 focus:ring-accent-400"
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    void handleSteerAgent(steerAgentId, steerInput)
                  }
                }}
              />
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setSteerAgentId(null)} className={HUB_SECONDARY_BUTTON_CLASS}>Cancel</button>
                <button
                  type="button"
                  disabled={!steerInput.trim()}
                  onClick={() => void handleSteerAgent(steerAgentId, steerInput)}
                  className={cn(HUB_PRIMARY_BUTTON_CLASS, 'disabled:opacity-50')}
                >
                  Send Directive ⌘↵
                </button>
              </div>
            </div>
          </div>
        )
      })() : null}

      {/* ── Mission Detail Overlay ────────────────────────────────────────── */}
      {maximizedMissionId ? (() => {
        const isRunning = maximizedMissionId === 'running'
        const reportEntry = missionReports.find((r) => r.id === maximizedMissionId) ?? null

        return (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setMaximizedMissionId(null)}
          >
            <div
              className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-6 py-4">
                <div>
                  <div className="flex items-center gap-1">
                    <p className="text-base font-bold text-neutral-900 dark:text-white">
                      {isRunning ? (activeMissionName || 'Active Mission') : (reportEntry?.name || 'Mission Details')}
                    </p>
                    <span className={cn(
                      'ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      isRunning ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600',
                    )}>
                      {isRunning ? '🟢 Running' : '✓ Complete'}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-1">
                    {isRunning ? activeMissionGoal : reportEntry?.goal}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMaximizedMissionId(null)}
                  className="flex size-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Body — scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Progress', value: isRunning ? `${runningTaskStats.completed} / ${runningTaskStats.total}` : `${reportEntry?.taskStats.completed ?? 0} / ${reportEntry?.taskStats.total ?? 0}` },
                    { label: 'Cost', value: isRunning
                      ? (missionAllOAuth ? 'Free (OAuth)' : missionRealCost > 0 ? `$${missionRealCost.toFixed(4)}` : `~$${estimateMissionCost(missionTokenCount).toFixed(2)}`)
                      : (reportEntry?.costEstimate === 0 ? 'Free (OAuth)' : `$${reportEntry?.costEstimate.toFixed(2) ?? '0.00'}`)
                    },
                    { label: 'Elapsed', value: isRunning ? formatDuration(Date.now() - (missionStartedAtRef.current || Date.now())) : formatDuration(reportEntry?.duration ?? 0) },
                    { label: 'Tokens', value: isRunning
                      ? (missionRealTokens > 0 ? missionRealTokens.toLocaleString() : missionTokenCount.toLocaleString())
                      : (reportEntry?.tokenCount.toLocaleString() ?? '0')
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-slate-800/50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{label}</p>
                      <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Live Agent Status (running only) */}
                {isRunning && agentWorkingRows.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Live Agent Status</p>
                    <div className="space-y-2">
                      {agentWorkingRows.map((row) => (
                        <div key={row.id} className="flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-slate-800 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              'size-2 rounded-full',
                              row.status === 'active' && 'bg-emerald-500 animate-pulse',
                              row.status === 'idle' && 'bg-amber-400',
                              row.status === 'paused' && 'bg-blue-400',
                              row.status === 'error' && 'bg-red-500',
                              !['active','idle','paused','error'].includes(row.status) && 'bg-neutral-300',
                            )} />
                            <span className="text-sm font-semibold text-neutral-900 dark:text-white">{row.name}</span>
                            <span className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              row.status === 'active' && 'bg-emerald-100 text-emerald-700',
                              row.status === 'idle' && 'bg-amber-100 text-amber-700',
                              row.status === 'paused' && 'bg-blue-100 text-blue-700',
                              row.status === 'error' && 'bg-red-100 text-red-700',
                              !['active','idle','paused','error'].includes(row.status) && 'bg-neutral-200 text-neutral-700',
                            )}>{row.status}</span>
                            {retryingAgents[row.id] ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                Retrying...
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Output button */}
                            <button
                              type="button"
                              onClick={() => { setSelectedOutputAgentId(row.id); setOutputPanelVisible(true); setMaximizedMissionId(null) }}
                              className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors"
                            >
                              View Output
                            </button>
                            {/* Pause/resume */}
                            <button
                              type="button"
                              onClick={() => _handleSetAgentPaused(row.id, row.status !== 'paused')}
                              className="flex size-7 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-slate-800 transition-colors text-sm"
                              title={row.status === 'paused' ? 'Resume' : 'Pause'}
                            >
                              {row.status === 'paused' ? '▶' : '⏸'}
                            </button>
                            {/* Steer */}
                            <button
                              type="button"
                              onClick={() => { setSteerAgentId(row.id); setSteerInput(''); setMaximizedMissionId(null) }}
                              className="flex size-7 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-accent-500 hover:border-accent-300 dark:hover:bg-slate-800 transition-colors text-sm"
                              title="Steer agent"
                            >
                              ✦
                            </button>
                            {agentSessionMap[row.id] ? (
                              <button
                                type="button"
                                onClick={() => { void handleKillAgent(row.id); setMaximizedMissionId(null) }}
                                className="flex size-7 items-center justify-center rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors text-sm"
                                title="Kill agent"
                              >
                                ✕
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Latest agent output lines (running only) */}
                {isRunning && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Latest Output</p>
                    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-slate-800/50 p-4 font-mono text-xs leading-relaxed text-neutral-700 dark:text-slate-300 max-h-48 overflow-y-auto space-y-1">
                      {agentWorkingRows.flatMap((row) =>
                        (agentOutputLinesRef.current[row.id] ?? []).slice(-4).map((line, idx) => (
                          <p key={`${row.id}-${idx}`}>
                            <span className="text-accent-500 font-semibold">[{row.name}]</span> {line}
                          </p>
                        ))
                      ).slice(-20)}
                    </div>
                  </div>
                )}

                {/* Artifacts */}
                {isRunning && artifacts.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Artifacts ({artifacts.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {artifacts.slice(0, 10).map((a) => (
                        <span key={a.id} className="rounded-full border border-neutral-200 bg-white dark:bg-slate-800 px-3 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                          {a.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Report text (done/review missions) */}
                {!isRunning && reportEntry?.report && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Mission Report</p>
                    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-slate-800/50 p-4 text-sm text-neutral-700 dark:text-slate-300 max-h-60 overflow-y-auto whitespace-pre-wrap">
                      {reportEntry.report}
                    </div>
                  </div>
                )}

              </div>

              {/* Footer controls (running only) */}
              {isRunning && (
                <div className="border-t border-neutral-200 dark:border-neutral-700 px-6 py-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Mission running · {agentWorkingRows.filter((r) => r.status === 'active').length} agents active
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMaximizedMissionId(null)}
                      className={HUB_SECONDARY_BUTTON_CLASS}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })() : null}
      </div>
    )
  }

  return (
    <AgentHubErrorBoundary>
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden bg-primary-100/45 dark:bg-[var(--theme-bg,#0b0e14)]">
      {/* ── Header — matches dashboard card style ─────────────────────────── */}
      <div className="shrink-0 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="mx-auto w-full max-w-[1600px]">
          <header
            className="relative z-20 mb-3 overflow-hidden rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel,#111520)] md:mb-5 md:px-5 md:py-3"
          >
            {/* Orange top accent — inside the card, flush with rounded corners */}
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400" />
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-baseline gap-2">
                <h1 className="shrink-0 text-lg font-bold text-ink dark:text-white md:text-xl">Agent Hub</h1>
                <p className="truncate font-mono text-[10px] text-neutral-500 dark:text-slate-500">// Mission Control</p>
              </div>
              <div className="flex items-center gap-2">
                <ApprovalsBell
                  approvals={approvals}
                  onApprove={handleApprove}
                  onDeny={handleDeny}
                />
              </div>
            </div>
          </header>
        </div>
      </div>

      {/* ── Tab Navigation Bar ────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-neutral-200 bg-neutral-50/80 dark:border-slate-700 dark:bg-[var(--theme-panel,#111520)]">
        <div className="mx-auto w-full max-w-[1600px] overflow-x-auto px-3 sm:px-4">
          <div className="flex min-w-max items-center">
            {TAB_DEFS.map((tab) => {
          const pendingApprovals = tab.id === 'configure'
            ? approvals.filter(a => a.status === 'pending').length
            : 0
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'relative flex min-h-11 min-w-[80px] flex-1 items-center justify-center gap-1 px-2 py-1.5 text-sm font-semibold transition-all sm:min-w-[108px] sm:gap-1.5 sm:px-3 sm:py-2',
                isActive
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-white'
                  : 'text-neutral-500 hover:bg-white hover:text-neutral-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white',
              )}
            >
              {/* Active tab: orange bottom highlight */}
              {isActive ? (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-accent-500" />
              ) : null}
              <span aria-hidden className="text-sm leading-none sm:text-base">{tab.icon}</span>
              <span className="shrink-0 whitespace-nowrap">{tab.label}</span>
              {/* Mission tab: animated running indicator */}
              {tab.id === 'missions' && isMissionRunning ? (
                <span className="relative ml-0.5 flex size-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                </span>
              ) : null}
              {tab.id === 'configure' && pendingApprovals > 0 ? (
                <span className="ml-0.5 rounded-full bg-accent-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {pendingApprovals > 99 ? '99+' : pendingApprovals}
                </span>
              ) : null}
            </button>
          )
            })}
          </div>
        </div>

      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ── Tab content area ── */}
        <div className="min-w-0 flex-1 overflow-hidden pb-24 sm:pb-4">
          {activeTab === 'overview' && (
            <div className="h-full min-h-0">
              {renderOverviewContent()}
            </div>
          )}

          {activeTab === 'configure' && (
            <div className="h-full min-h-0">
              {renderConfigureContent()}
            </div>
          )}

          {activeTab === 'missions' && (
            <div className="h-full min-h-0">
              {renderMissionsTabContent()}
            </div>
          )}
        </div>

        {/* ── Right Panel: Live Output (single purpose — terminal-style agent output) ── */}
        {!isMobileHub && outputPanelVisible && selectedOutputAgentId && (
          <div className="flex w-96 shrink-0 flex-col border-l border-[var(--theme-border)] bg-[var(--theme-card)] dark:bg-[var(--theme-card,#161b27)]">
            {/* Output panel header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--theme-border)] px-3 py-2 bg-[var(--theme-bg)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <span className="flex size-2 rounded-full bg-emerald-500" />
                  {selectedOutputStatusLabel === 'Active' && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-[var(--theme-text)]">
                      {selectedOutputAgentName}
                    </p>
                    {selectedOutputStatusLabel && (
                      <span className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        selectedOutputStatusLabel === 'Active' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
                        selectedOutputStatusLabel === 'Idle' && 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
                        selectedOutputStatusLabel === 'Waiting For Input' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
                        selectedOutputStatusLabel === 'Error' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
                        selectedOutputStatusLabel === 'Paused' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
                      )}>{selectedOutputStatusLabel}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {selectedOutputModelId && (
                      <span className="text-[10px] text-[var(--theme-muted)] font-mono">{getModelDisplayLabel(selectedOutputModelId)}</span>
                    )}
                    <span className="text-[10px] text-[var(--theme-muted)] opacity-40">·</span>
                    <span className="text-[10px] text-[var(--theme-muted)] font-mono tabular-nums">{(missionRealTokens > 0 ? missionRealTokens : missionTokenCount).toLocaleString()} tok</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setOutputPanelVisible(false) }}
                className="flex size-7 items-center justify-center rounded-full text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)] transition-colors"
                aria-label="Close output panel"
              >
                ✕
              </button>
            </div>
            {/* Agent selector tabs (if multiple agents) */}
            {team.length > 1 && missionActive && (
              <div className="flex shrink-0 gap-0.5 border-b border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 overflow-x-auto">
                {team.map((member) => {
                  const isSelected = member.id === selectedOutputAgentId
                  const agentStatus = agentSessionStatus[member.id]
                  const hasSession = Boolean(agentSessionMap[member.id])
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedOutputAgentId(member.id)}
                      className={cn(
                        'shrink-0 rounded px-2 py-1 text-[10px] font-mono font-medium transition-colors',
                        isSelected
                          ? 'bg-[var(--theme-card2)] text-[var(--theme-text)]'
                          : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-card2)]',
                      )}
                    >
                      <span className={cn(
                        'inline-flex size-1.5 rounded-full mr-1',
                        hasSession && agentStatus?.status === 'active' && 'bg-emerald-500',
                        hasSession && agentStatus?.status === 'idle' && 'bg-neutral-400',
                        hasSession && agentStatus?.status === 'waiting_for_input' && 'bg-amber-400',
                        hasSession && agentStatus?.status === 'error' && 'bg-red-500',
                        !hasSession && 'bg-neutral-300 dark:bg-neutral-600',
                      )} />
                      {member.name}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--theme-card)]">
              <AgentOutputPanel
                agentName={selectedOutputAgentName}
                sessionKey={agentSessionMap[selectedOutputAgentId] ?? null}
                tasks={selectedOutputTasks}
                onClose={() => setOutputPanelVisible(false)}
                modelId={selectedOutputModelId}
                statusLabel={selectedOutputStatusLabel}
                compact
                externalStream
                outputLines={agentOutputLines[selectedOutputAgentId]}
              />
            </div>
          </div>
        )}
      </div>

      {compactionBanner ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
            <div
              className="mx-auto mb-3 size-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-600 dark:border-t-neutral-100"
              aria-hidden
            />
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Compacting context...</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              Agent memory is being compressed. This may take a few seconds.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── New Mission Modal (global — renders on any tab) ───────────────── */}
      {missionBoardModalOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/35 px-4 py-6 backdrop-blur-[1px]"
            onClick={() => setMissionBoardModalOpen(false)}
          >
            <div
              className="flex w-full max-w-2xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
              onClick={(event) => event.stopPropagation()}
            >
              {/* Wizard Step Indicator */}
              <div className="border-b border-neutral-200 px-6 pt-5 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-neutral-900 dark:text-white">New Mission</h3>
                  <button
                    type="button"
                    onClick={() => { setMissionBoardModalOpen(false); setMissionWizardStep(0) }}
                    className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  {['Scope', 'Team', 'Settings', 'Review'].map((stepLabel, stepIdx) => (
                    <div key={stepLabel} className="flex flex-1 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setMissionWizardStep(stepIdx)}
                        className={cn(
                          'flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                          stepIdx === missionWizardStep
                            ? 'bg-accent-500 text-white'
                            : stepIdx < missionWizardStep
                              ? 'bg-accent-100 text-accent-700'
                              : 'bg-neutral-100 text-neutral-400',
                        )}
                      >
                        {stepIdx < missionWizardStep ? '✓' : stepIdx + 1}
                      </button>
                      <span className={cn(
                        'text-xs font-medium',
                        stepIdx === missionWizardStep ? 'text-neutral-900 dark:text-white' : 'text-neutral-400',
                      )}>
                        {stepLabel}
                      </span>
                      {stepIdx < 3 ? <div className="mx-1 h-px flex-1 bg-neutral-200" /> : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Step Content */}
              <div className="min-h-[320px] px-6 py-5">
                {/* Step 0: Scope */}
                {missionWizardStep === 0 ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Mission Name</span>
                      <input
                        value={newMissionName}
                        onChange={(event) => setNewMissionName(event.target.value)}
                        placeholder="e.g. Q1 competitor analysis"
                        className="mt-1.5 h-10 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 outline-none ring-accent-400 focus:ring-1"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Goal</span>
                      <textarea
                        value={newMissionGoal}
                        onChange={(event) => setNewMissionGoal(event.target.value)}
                        rows={6}
                        placeholder="Describe the mission goal, output format, and constraints..."
                        className="mt-1.5 w-full resize-y rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm text-neutral-900 outline-none ring-accent-400 focus:ring-1"
                      />
                    </label>
                  </div>
                ) : null}

                {/* Step 1: Team */}
                {missionWizardStep === 1 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Select a team for this mission</p>
                    <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                      {_modalMissionTeamOptions.map((option) => {
                        const teamBudget = getTeamBudgetSummary(option.team)
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setNewMissionTeamConfigId(option.id)}
                            className={cn(
                              'w-full rounded-xl border p-3 text-left transition-colors',
                              newMissionTeamConfigId === option.id
                                ? 'border-accent-300 bg-accent-50/70 dark:border-accent-800 dark:bg-accent-950/30'
                                : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600',
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{option.label}</p>
                                <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
                                  {option.team.length} agents
                                  {teamBudget.avgCost !== null ? ` · ~$${teamBudget.avgCost.toFixed(2)}/agent` : ''}
                                </p>
                              </div>
                              {teamBudget.totalCost !== null ? (
                                <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[10px] font-semibold text-neutral-700">
                                  ~${teamBudget.totalCost.toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {option.team.map((member) => (
                                <span key={member.id} className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2 py-0.5 text-[10px] text-neutral-600 dark:text-slate-400">
                                  {member.name} · {getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)}
                                </span>
                              ))}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                {/* Step 2: Settings */}
                {missionWizardStep === 2 ? (
                  <div className="space-y-4">
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Process Type</span>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {(['sequential', 'hierarchical', 'parallel'] as const).map((pt) => (
                          <button
                            key={pt}
                            type="button"
                            onClick={() => setNewMissionProcessType(pt)}
                            className={cn(
                              'rounded-lg border px-3 py-3 text-center transition-colors',
                              newMissionProcessType === pt
                                ? 'border-accent-300 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-950/30 dark:text-accent-300'
                                : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600',
                            )}
                          >
                            <p className="text-xs font-semibold capitalize">{pt}</p>
                            <p className="mt-0.5 text-[10px] text-neutral-500 dark:text-slate-400">
                              {pt === 'sequential' ? 'One at a time' : pt === 'hierarchical' ? 'Manager delegates' : 'All at once'}
                            </p>
                          </button>
                        ))}
                      </div>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Token Budget (max)</span>
                      <input
                        value={newMissionBudgetLimit}
                        onChange={(event) => setNewMissionBudgetLimit(event.target.value.replace(/[^\d]/g, ''))}
                        inputMode="numeric"
                        placeholder="120000"
                        className="mt-1.5 h-10 w-full rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 text-sm text-neutral-900 outline-none ring-accent-400 focus:ring-1"
                      />
                      <p className="mt-1 text-xs text-neutral-400">
                        {_modalSelectedBudgetTokens ? `~$${(_modalSelectedTotalBudgetCost ?? 0).toFixed(2)} estimated cost` : 'No budget limit'}
                      </p>
                    </label>
                  </div>
                ) : null}

                {/* Step 3: Review & Launch */}
                {missionWizardStep === 3 ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">Launch Summary</h4>
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Mission</span>
                          <span className="font-medium text-neutral-900 dark:text-white">{newMissionName || 'Untitled'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Team</span>
                          <span className="font-medium text-neutral-900 dark:text-white">{_modalSelectedTeamMembers.length} agents</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Process</span>
                          <span className="font-medium capitalize text-neutral-900 dark:text-white">{newMissionProcessType}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-neutral-600 dark:text-slate-400">Budget</span>
                          <span className="font-medium text-neutral-900 dark:text-white">{_modalSelectedBudgetTokens ? `${_modalSelectedBudgetTokens.toLocaleString()} tokens (~$${(_modalSelectedTotalBudgetCost ?? 0).toFixed(2)})` : 'Unlimited'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Goal</p>
                      <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">{newMissionGoal || 'No goal set'}</p>
                    </div>
                    <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">Team Lineup</p>
                      <div className="mt-2 space-y-1">
                        {_modalSelectedTeamMembers.map((member) => (
                          <div key={member.id} className="flex items-center justify-between rounded-md bg-neutral-50 dark:bg-slate-800/50 px-2.5 py-1.5">
                            <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{member.name}</span>
                            <span className="text-[10px] text-neutral-500 dark:text-slate-400">{getModelDisplayLabelFromLookup(member.modelId, gatewayModelLabelById)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Wizard Footer */}
              <div className="flex items-center justify-between border-t border-neutral-200 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    if (missionWizardStep === 0) { setMissionBoardModalOpen(false); setMissionWizardStep(0) }
                    else setMissionWizardStep((s) => Math.max(0, s - 1))
                  }}
                  className="rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  {missionWizardStep === 0 ? 'Cancel' : '← Back'}
                </button>
                <div className="flex gap-2">
                  {missionWizardStep === 3 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { handleSaveMissionDraft(); setMissionWizardStep(0) }}
                        disabled={!newMissionGoal.trim()}
                        className="rounded-lg border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleLaunchMissionFromModal(); setMissionWizardStep(0) }}
                        disabled={!newMissionGoal.trim()}
                        className="rounded-lg bg-accent-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 disabled:opacity-50"
                      >
                        🚀 Launch Mission
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMissionWizardStep((s) => Math.min(3, s + 1))}
                      className="rounded-lg bg-accent-500 px-5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-600"
                    >
                      Next →
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

      {/* ── Launch wizard ─────────────────────────────────────────────────── */}
      {wizardOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeLaunchWizard}
            aria-hidden
          />
          <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Launch Mission
                </h2>
                <p className="text-xs text-neutral-500 dark:text-slate-400">
                  Step {wizardStepIndex + 1} of {WIZARD_STEP_ORDER.length}
                </p>
              </div>
              <button
                type="button"
                onClick={closeLaunchWizard}
                className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>

            <div className="border-b border-neutral-200 px-5 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {WIZARD_STEP_ORDER.map((step, index) => {
                  const label =
                    step === 'gateway'
                      ? 'Gateway'
                      : step === 'team'
                        ? 'Team'
                        : step === 'goal'
                          ? 'Goal'
                          : 'Launch'
                  const active = step === wizardStep
                  const completed = index < wizardStepIndex
                  return (
                    <button
                      key={step}
                      type="button"
                      onClick={() => goToWizardStep(step)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 font-medium transition-colors',
                        active
                          ? 'border-accent-400 bg-accent-50 text-accent-700'
                          : completed
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-neutral-200 bg-white text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                      )}
                    >
                      {index + 1}. {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
              {wizardStep === 'gateway' ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Gateway Connection
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                      {wizardCheckingGateway
                        ? 'Checking gateway status...'
                        : gatewayStatus === 'disconnected'
                          ? 'Gateway is offline. Start/connect your gateway before launch.'
                          : 'Gateway connected and ready.'}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          gatewayStatus === 'disconnected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-emerald-100 text-emerald-700',
                        )}
                      >
                        {gatewayStatus === 'disconnected'
                          ? 'Disconnected'
                          : 'Connected'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setWizardCheckingGateway(true)
                          void refreshGatewayStatus()
                            .then((connected) => {
                              if (connected) {
                                return refreshConfiguredProviders()
                              }
                              setConfiguredProviders([])
                              return Promise.resolve()
                            })
                            .finally(() => setWizardCheckingGateway(false))
                        }}
                        className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 p-4">
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Provider Profiles
                    </p>
                    {configuredProviders.length === 0 ? (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-slate-400">
                        No configured providers detected yet.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {configuredProviders.map((provider) => (
                          <span
                            key={provider}
                            className="rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:text-neutral-300"
                          >
                            {provider}
                          </span>
                        ))}
                      </div>
                    )}
                    <a
                      href="/settings/providers"
                      className="mt-3 inline-block text-xs font-medium text-accent-600 hover:text-accent-700"
                    >
                      Manage API keys →
                    </a>
                  </div>
                </div>
              ) : null}

              {wizardStep === 'team' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Choose Team Template
                    </p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {TEAM_TEMPLATES.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template.id)}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-left text-xs transition-colors',
                            activeTemplateId === template.id
                              ? 'border-accent-400 bg-accent-50 text-accent-700'
                              : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300',
                          )}
                        >
                          <p className="font-semibold">
                            {template.icon} {template.name}
                          </p>
                          <p className="mt-1 text-xs opacity-80">
                            {template.agents.length} agents
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Current Team
                    </p>
                    <ul className="mt-2 space-y-1.5 rounded-xl border border-neutral-200 bg-neutral-50/40 p-3">
                      {team.length === 0 ? (
                        <li className="text-xs text-neutral-500 dark:text-slate-400">No agents configured.</li>
                      ) : (
                        team.map((member) => (
                          <li
                            key={member.id}
                            className="truncate text-xs text-neutral-700 dark:text-neutral-300"
                          >
                            {member.name} · {member.roleDescription || 'No role set'}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              ) : null}

              {wizardStep === 'goal' ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Mission Goal
                    </p>
                    <textarea
                      value={missionGoal}
                      onChange={(event) => setMissionGoal(event.target.value)}
                      rows={5}
                      placeholder="Describe the mission outcome and constraints"
                      className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm text-neutral-900 outline-none ring-orange-400 focus:ring-1"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {EXAMPLE_MISSIONS.map((example) => (
                        <button
                          key={example.label}
                          type="button"
                          onClick={() => setMissionGoal(example.text)}
                          className="rounded-full border border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:border-accent-400 hover:text-accent-700"
                        >
                          {example.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-slate-400">
                      Process Type
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { id: 'sequential', label: 'Sequential' },
                          { id: 'hierarchical', label: 'Hierarchical' },
                          { id: 'parallel', label: 'Parallel' },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setProcessType(option.id)}
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                            processType === option.id
                              ? 'border-accent-400 bg-accent-50 text-accent-700'
                              : 'border-neutral-200 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {suggestedTemplateName ? (
                      <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
                        Suggested template: <span className="font-semibold">{suggestedTemplateName}</span>
                      </p>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleAutoConfigure}
                      disabled={missionGoal.trim().length === 0}
                      className="mt-2 rounded-md border border-accent-400 px-2.5 py-1 text-xs font-medium text-accent-600 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Auto-configure team from goal
                    </button>
                  </div>
                </div>
              ) : null}

              {wizardStep === 'launch' ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4">
                    <h3 className="text-xs font-semibold text-neutral-900 dark:text-white">
                      Review
                    </h3>
                    <dl className="mt-2 space-y-1.5 text-xs">
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Gateway</dt>
                        <dd className="text-neutral-800 dark:text-neutral-200">
                          {gatewayStatus === 'disconnected' ? 'Disconnected' : 'Connected'}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Team size</dt>
                        <dd className="text-neutral-800 dark:text-neutral-200">{team.length}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Process</dt>
                        <dd className="capitalize text-neutral-800 dark:text-neutral-200">{processType}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-24 text-neutral-500 dark:text-slate-400">Goal</dt>
                        <dd className="line-clamp-3 text-neutral-800 dark:text-neutral-200">
                          {missionGoal.trim() || 'No mission goal provided'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
              <button
                type="button"
                onClick={() =>
                  setWizardStepIndex((prev) => Math.max(0, prev - 1))
                }
                disabled={wizardStepIndex === 0}
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Back
              </button>
              {wizardStep !== 'launch' ? (
                <button
                  type="button"
                  onClick={() =>
                    setWizardStepIndex((prev) =>
                      Math.min(WIZARD_STEP_ORDER.length - 1, prev + 1),
                    )
                  }
                  disabled={
                    (wizardStep === 'gateway' &&
                      (gatewayStatus === 'disconnected' || wizardCheckingGateway)) ||
                    (wizardStep === 'goal' && missionGoal.trim().length === 0)
                  }
                  className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateMission}
                  disabled={missionGoal.trim().length === 0 || dispatchingRef.current || missionActive}
                  className="rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Launch Mission
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {artifactPreview ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setArtifactPreview(null)}
            aria-hidden
          />
          <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 dark:bg-slate-800/50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{artifactPreview.title}</p>
                <p className="text-xs text-neutral-500 dark:text-slate-400">
                  {artifactPreview.agentName} · {artifactPreview.type} · {new Date(artifactPreview.timestamp).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setArtifactPreview(null)}
                className="rounded-md border border-neutral-200 bg-white dark:border-slate-700 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-neutral-700"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {artifactPreview.type === 'code' ? (
                <pre className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-4 text-xs text-neutral-800 dark:text-neutral-200">
                  <code>{artifactPreview.content}</code>
                </pre>
              ) : (
                <Markdown className="prose prose-sm dark:prose-invert max-w-none text-neutral-900 dark:text-neutral-200 [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-neutral-200 dark:[&_pre]:border-neutral-700 [&_pre]:bg-neutral-50 dark:[&_pre]:bg-neutral-800">
                  {artifactPreview.content}
                </Markdown>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Mobile: Agent Output Bottom Sheet ──────────────────────────────── */}
      {isMobileHub && missionActive && outputPanelVisible && selectedOutputAgentId ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOutputPanelVisible(false)}
            aria-hidden
          />
          {/* Sheet */}
          <div className="relative flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 p-3 dark:border-neutral-700">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {selectedOutputAgentName} Output
              </h3>
              <button
                type="button"
                onClick={() => setOutputPanelVisible(false)}
                className="flex size-11 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Close agent output"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentOutputPanel
                agentName={selectedOutputAgentName}
                sessionKey={selectedOutputAgentId ? agentSessionMap[selectedOutputAgentId] ?? null : null}
                tasks={selectedOutputTasks}
                onClose={() => setOutputPanelVisible(false)}
                modelId={selectedOutputModelId}
                statusLabel={selectedOutputStatusLabel}
                externalStream
                outputLines={selectedOutputAgentId ? agentOutputLines[selectedOutputAgentId] : undefined}
              />
            </div>
          </div>
        </div>
      ) : null}

    </div>
    {/* ── Mission Completion Report Modal ─────────────────────────────── */}
    {completionReportVisible && completionReport ? (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => setCompletionReportVisible(false)}
      >
        <div
          className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-neutral-200 dark:border-slate-700"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Celebratory accent */}
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 shrink-0" />
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 px-6 py-4 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl">✅</span>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-neutral-900 dark:text-white truncate">
                  Mission Complete
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {completionReport.name || completionReport.goal}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCompletionReportVisible(false)}
              className="flex size-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 transition-colors"
            >
              ✕
            </button>
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
            {[
              { label: 'Duration', value: formatDuration(completionReport.duration) },
              { label: 'Tasks', value: `${completionReport.taskStats.completed}/${completionReport.taskStats.total}` },
              { label: 'Tokens', value: completionReport.tokenCount.toLocaleString() },
              { label: 'Cost', value: completionReport.costEstimate === 0 ? 'Free (OAuth)' : `$${completionReport.costEstimate.toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-slate-800/50 p-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
          {/* Agents used */}
          {completionReport.agents.length > 0 && (
            <div className="px-6 pt-4 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400 mb-2">Agents Used</p>
              <div className="flex flex-wrap gap-1.5">
                {completionReport.agents.map((agent) => (
                  <span key={agent.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-slate-800/50 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {agent.name}
                    <span className="text-[10px] text-neutral-400">· {getModelDisplayLabel(agent.modelId)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Report body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown>{completionReport.report}</Markdown>
            </div>
          </div>
          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 dark:border-neutral-700 px-6 py-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCompletionReportVisible(false)
                setSelectedReport(completionReport)
              }}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
            >
              View in History
            </button>
            <button
              type="button"
              onClick={() => setCompletionReportVisible(false)}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {/* ── Selected Report Detail Modal (from History) ─────────────────── */}
    {selectedReport ? (
      <MissionReportDetailModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onArtifactPreview={setArtifactPreview}
      />
    ) : null}

    </AgentHubErrorBoundary>
  )
}
