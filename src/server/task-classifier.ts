import type { TaskClassification, TaskType, ContextLen, Urgency } from '../types/router-config'

export type ManualOverride = {
  provider?: string
  model?: string
  base_url?: string
  urgency?: Urgency
}

const OVERRIDE_MAP: Array<[string, ManualOverride]> = [
  ['use:opus',     { provider: 'anthropic', model: 'claude-opus-4-8' }],
  ['use:sonnet',   { provider: 'anthropic', model: 'claude-sonnet-4-6' }],
  ['use:codex',    { provider: 'openai',    model: 'codex-mini-latest' }],
  ['use:gemini',   { provider: 'google',    model: 'gemini-2.5-pro' }],
  ['use:deepseek', { provider: 'deepseek',  model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1' }],
  ['use:local',    { provider: 'ollama',    model: 'llama3.2',      base_url: 'http://localhost:11434/v1' }],
  ['use:fast',     { urgency: 'fast' }],
]

/**
 * Parse a manual routing override from message text.
 * model:<id> takes precedence over use:X keywords.
 * Returns null when no override keyword is present.
 */
export function parseManualOverride(text: string): ManualOverride | null {
  const modelMatch = /\bmodel:(\S+)/.exec(text)
  if (modelMatch) {
    return { model: modelMatch[1] }
  }
  const lower = text.toLowerCase()
  for (const [key, override] of OVERRIDE_MAP) {
    if (lower.includes(key)) {
      return override
    }
  }
  return null
}

// First-match wins; ordered from most specific to most general
const TASK_SIGNALS: Array<[TaskType, RegExp]> = [
  ['coding', /\b(code|function|class|bug|implement|refactor|typescript|javascript|python|sql|api\b|unit.?test|debug|pull.?request|\bpr\b|lint|compile|build(?:ing)?|ci\/cd|dockerfile|webpack|vite)\b/i],
  ['summarisation', /\b(summar(?:ise|ize)|tl;?dr|recap|brief(?:ly)?|condense|shorten)\b/i],
  ['creative', /\b(story|poem|fiction|imagin|creative|narrative|character|plot)\b/i],
  ['research', /\b(research|investigat|survey|compar(?:e|ing)|analys[ei]s|study|literature.?review)\b/i],
  ['reasoning', /\b(reason(?:ing)?|logic|argument|proof|deduc|infer|think.?through|explain.?why|how.?(?:would|could|should).+work)\b/i],
  ['writing', /\b(write|draft|essay|article|letter|report|document|blog|copywrite|paragraph|compose)\b/i],
  ['ops', /\b(deploy|configur|setup|install|monitor|kubernetes|docker|infrastructure|pipeline|terraform|serverless|cron|bash|shell.?script)\b/i],
  ['qa', /\b(what.?(?:is|are|does)|how.?(?:do|does)|defin|explain.?what|describ|tell.?me.?about)\b/i],
]

function detectTaskType(text: string): TaskType {
  for (const [type, re] of TASK_SIGNALS) {
    if (re.test(text)) return type
  }
  return 'qa'
}

function estimateTokens(messages: Array<{ role: string; content: string }>): number {
  let chars = 0
  for (const m of messages) chars += m.content.length
  return Math.round(chars / 4)
}

function classifyContextLen(tokens: number): ContextLen {
  if (tokens < 1000) return 'short'
  if (tokens < 4000) return 'medium'
  return 'long'
}

function classifyComplexity(text: string, tokens: number, taskType: TaskType): number {
  // Base: log-scaled token count, capped at 0.5
  const tokenScore = Math.min(Math.log10(Math.max(tokens, 1)) / Math.log10(8000), 0.5)

  let score = tokenScore

  // Task-type priors
  if (taskType === 'coding' || taskType === 'reasoning') score += 0.2
  else if (taskType === 'research') score += 0.15
  else if (taskType === 'creative' || taskType === 'writing') score += 0.05

  // High-complexity signals
  if (/\b(architect|system.?design|large.?scale|refactor|optimiz|performance|security|multi.?step|comprehensive|in.?depth|advanced)\b/i.test(text)) score += 0.15

  // Low-complexity signals
  if (/\b(quick|simple|brief|short|basic|just|only|tldr|tl;?dr|one.?line|one.?word)\b/i.test(text)) score -= 0.1

  return Math.max(0, Math.min(1, score))
}

export type ClassifyOpts = {
  messages: Array<{ role: string; content: string }>
  hasAttachments?: boolean
}

export function classifyTask(opts: ClassifyOpts): TaskClassification {
  const { messages, hasAttachments = false } = opts
  const fullText = messages.map((m) => m.content).join('\n')
  const estimated_tokens = estimateTokens(messages)
  const task_type = detectTaskType(fullText)
  const context_len = classifyContextLen(estimated_tokens)
  const complexity = classifyComplexity(fullText, estimated_tokens, task_type)

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const urgency: Urgency =
    lastUser && /\b(use:fast|quick(?:ly)?|asap|urgent(?:ly)?|fast(?:er)?|speedy)\b/i.test(lastUser.content)
      ? 'fast'
      : 'normal'

  return {
    task_type,
    complexity,
    context_len,
    urgency,
    has_attachments: hasAttachments,
    estimated_tokens,
  }
}
