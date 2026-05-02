import type { MissionArtifact } from '@/stores/mission-store'
import type { HubTask } from './task-board'
import {
  MODEL_PRESETS,
  TEAM_TEMPLATES,
  type ModelPresetId,
  type TeamMember,
  type TeamTemplateId,
} from './team-panel'
export { ROUGH_COST_PER_1K_TOKENS_USD } from '@/lib/config/costs'

export type AgentHubLayoutProps = {
  agents: Array<{
    id: string
    name: string
    role: string
    status: string
  }>
}

export type MissionPlanItem = {
  title: string
  description: string
  agent?: string
  enabled: boolean
}

export const TEAM_STORAGE_KEY = 'clawsuite:hub-team'
export const TEAM_CONFIGS_STORAGE_KEY = 'clawsuite:hub-team-configs'
export const MISSION_REPORTS_STORAGE_KEY = 'clawsuite-mission-reports'
export const MAX_MISSION_REPORTS = 10

export type SavedTeamConfig = {
  id: string
  name: string
  icon?: string
  description?: string
  createdAt: number
  updatedAt: number
  team: TeamMember[]
}

export const TEMPLATE_MODEL_SUGGESTIONS: Record<TeamTemplateId, Array<ModelPresetId>> = {
  research: ['opus', 'sonnet', 'auto'],
  coding: ['opus', 'codex', 'sonnet'],
  content: ['opus', 'sonnet', 'flash'],
  'pc1-loop': ['pc1-coder', 'pc1-planner', 'pc1-critic'],
}

export const MODEL_PRESET_MAP: Record<string, string> = {
  auto: '',
  opus: 'anthropic/claude-opus-4-6',
  sonnet: 'anthropic/claude-sonnet-4-6',
  codex: 'openai/gpt-5.3-codex',
  flash: 'google/gemini-2.5-flash',
  minimax: 'minimax/MiniMax-M2.7',
}

export type GatewayModelEntry = {
  provider?: string
  id?: string
  name?: string
}

export type GatewayModelsResponse = {
  ok?: boolean
  models?: GatewayModelEntry[]
}

export type DetectedGatewayAgent = {
  id: string
  name: string
  model: string
  status: string
  sessionKey: string
}

export type AgentActivityEntry = {
  lastLine?: string
  lastAt?: number
  lastEventType?: 'tool' | 'assistant' | 'system'
}

export type MissionTaskStats = {
  total: number
  completed: number
  failed: number
}

export type MissionAgentSummary = {
  agentId: string
  agentName: string
  modelId: string
  lines: string[]
  transcript?: Array<{ role: string; text: string }>
  transcriptSummary?: string
}

export type MissionReportPayload = {
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

export type StoredMissionReport = {
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

export type MissionBoardDraft = {
  id: string
  name: string
  goal: string
  teamConfigId: string
  teamName: string
  processType: 'sequential' | 'hierarchical' | 'parallel'
  budgetLimit: string
  createdAt: number
}

export const EXAMPLE_MISSIONS: Array<{ label: string; text: string }> = [
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

export type GatewayStatus = 'connected' | 'disconnected' | 'spawning'
export type WizardStep = 'gateway' | 'team' | 'goal' | 'launch'
export type ActiveTab = 'overview' | 'configure' | 'runs' | 'kanban' | 'analytics'
export type ConfigSection = 'agents' | 'teams' | 'keys'

export const TAB_DEFS: Array<{ id: ActiveTab; icon: string; label: string }> = [
  { id: 'overview', icon: '🏠', label: 'Overview' },
  { id: 'runs', icon: '▶️', label: 'Runs' },
  { id: 'kanban', icon: '📋', label: 'Board' },
  { id: 'analytics', icon: '📊', label: 'Analytics' },
  { id: 'configure', icon: '⚙️', label: 'Configure' },
]

export const CONFIG_SECTIONS: Array<{ id: ConfigSection; icon: string; label: string }> = [
  { id: 'agents', icon: '🤖', label: 'Agents' },
  { id: 'teams', icon: '👥', label: 'Teams' },
  { id: 'keys', icon: '🔑', label: 'API Keys' },
]

export const HUB_PAGE_TITLE_CLASS = 'text-lg font-bold text-neutral-900 dark:text-neutral-100 md:text-xl'
export const HUB_SUBSECTION_TITLE_CLASS = 'text-base font-bold text-neutral-900 dark:text-white'
export const HUB_CARD_LABEL_CLASS = 'text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-slate-400'
export const HUB_PRIMARY_BUTTON_CLASS = 'min-h-11 rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-600 sm:px-4 sm:py-2 sm:text-sm'
export const HUB_SECONDARY_BUTTON_CLASS = 'min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 sm:px-4 sm:py-2 sm:text-sm'
export const HUB_PAGE_HEADER_CARD_CLASS = 'flex w-full items-center justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50/95 px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-[var(--theme-panel)] sm:px-4 sm:py-3'
export const HUB_FILTER_PILL_CLASS = 'flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors whitespace-nowrap hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
export const HUB_FILTER_PILL_ACTIVE_CLASS = 'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/60 dark:bg-orange-900/20 dark:text-orange-300'

export const WIZARD_STEP_ORDER: WizardStep[] = ['gateway', 'team', 'goal', 'launch']

export const TEAM_QUICK_TEMPLATES: Array<{
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

export const SYSTEM_PROMPT_TEMPLATES: Array<{
  id: string
  label: string
  icon: string
  roleHint: string
  category: 'engineering' | 'research' | 'content' | 'ops' | 'general'
  prompt: string
}> = [
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

export const CUSTOM_PROVIDER_OPTION = '__custom__'
export const KNOWN_GATEWAY_PROVIDERS = [
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

export const TEMPLATE_DISPLAY_NAMES: Record<TeamTemplateId, string> = {
  research: 'Research Team',
  coding: 'Coding Sprint',
  content: 'Content Pipeline',
  'pc1-loop': 'PC1 Agent Loop',
}

export { MODEL_PRESETS, TEAM_TEMPLATES }
