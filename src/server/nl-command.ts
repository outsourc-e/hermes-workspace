/**
 * Natural-language command router: plain English in → the right swarm
 * primitive out.
 *
 * Cheap heuristics first (explicit prefixes, question shapes); everything
 * else goes to the strategist for a one-shot classification into:
 *   queue    — single well-scoped task → priority queue
 *   goal     — outcome needing multiple steps/iterations → goals engine
 *   dispatch — "ask <worker> to …" → direct dispatch
 *   answer   — a question; strategist just answers it
 */
import { createGoal } from './swarm-goals'
import { enqueueTask } from './swarm-queue'

export type NlPlan =
  | { action: 'queue'; task: string; worker?: string; priority: 1 | 2 | 3 }
  | { action: 'goal'; goal: string }
  | { action: 'dispatch'; worker: string; task: string }
  | { action: 'answer'; question: string }

const KNOWN_WORKERS = [
  'builder',
  'researcher',
  'qa',
  'reviewer',
  'maintainer',
  'km-agent',
  'ops-watch',
  'security-auditor',
  'quant-agent',
  'concierge',
  'scribe',
  'data-analyst',
  'archivist',
  'scout',
]

export function heuristicPlan(text: string): NlPlan | null {
  const t = text.trim()
  const lower = t.toLowerCase()
  if (lower.startsWith('goal:')) return { action: 'goal', goal: t.slice(5).trim() }
  const ask = /^(?:ask|tell|have)\s+([a-z][a-z0-9-]*)\s+(?:to\s+)?(.+)$/i.exec(t)
  if (ask && KNOWN_WORKERS.includes(ask[1].toLowerCase())) {
    return { action: 'dispatch', worker: ask[1].toLowerCase(), task: ask[2] }
  }
  if (/^(?:what|why|how|when|where|who|which|is|are|does|do|can|should)\b/i.test(t) && t.endsWith('?')) {
    return { action: 'answer', question: t }
  }
  return null
}

export function classifierPrompt(text: string): string {
  return [
    'Classify this operator request for an agent swarm. Do NOT perform it.',
    `Request: "${text.slice(0, 1500)}"`,
    `Workers: ${KNOWN_WORKERS.join(', ')}.`,
    'Reply with ONLY a fenced JSON block, one of:',
    '{"action":"queue","task":"<self-contained task text>","worker":"<optional best worker>","priority":2}',
    '{"action":"goal","goal":"<outcome statement>"}  — only for multi-step outcomes needing iteration',
    '{"action":"answer","answer":"<direct answer to the question>"}',
  ].join('\n')
}

export type NlResult = {
  action: string
  detail: string
  id?: string
}

/** Execute a classified plan against the swarm primitives. */
export async function executeNlPlan(
  plan: NlPlan,
  deps: {
    dispatch: (worker: string, task: string) => Promise<string>
  },
): Promise<NlResult> {
  switch (plan.action) {
    case 'queue': {
      const item = enqueueTask({
        task: plan.task,
        worker: plan.worker,
        priority: plan.priority ?? 2,
        note: 'nl-command',
      })
      return {
        action: 'queued',
        detail: `P${plan.priority ?? 2}${plan.worker ? ` → ${plan.worker}` : ''}: ${plan.task.slice(0, 120)}`,
        id: item.id,
      }
    }
    case 'goal': {
      const goal = createGoal({ goal: plan.goal })
      return {
        action: 'goal-created',
        detail: goal.goal.slice(0, 160),
        id: goal.id,
      }
    }
    case 'dispatch': {
      const reply = await deps.dispatch(plan.worker, plan.task)
      return {
        action: 'dispatched',
        detail: `${plan.worker}: ${reply.slice(0, 400) || '(no reply)'}`,
      }
    }
    case 'answer':
      return { action: 'answer', detail: plan.question }
  }
}
