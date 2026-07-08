/**
 * Natural-language command endpoint: POST {text} → routes to queue, goal,
 * direct dispatch, or a strategist answer. Used by the ⌘K palette ("Do:")
 * and the Discord bot's !do command.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  classifierPrompt,
  executeNlPlan,
  heuristicPlan,
} from '../../server/nl-command'
import type { NlPlan } from '../../server/nl-command'
import { extractJson } from '../../server/swarm-goals'
import { dispatchSwarmAssignments } from './swarm-dispatch'

async function oneshot(workerId: string, task: string): Promise<string> {
  const res = (await dispatchSwarmAssignments({
    assignments: [{ workerId, task, oneshot: true }],
    waitForCheckpoint: true,
    timeoutSeconds: 300,
  })) as {
    results?: Array<{
      checkpoint?: { result?: string | null } | null
      output?: string
    }>
  }
  const r = res.results?.[0]
  return r?.output || r?.checkpoint?.result || ''
}

export const Route = createFileRoute('/api/nl-command')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { text?: string }
        try {
          body = (await request.json()) as { text?: string }
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const text = (body.text ?? '').trim()
        if (!text) {
          return json({ ok: false, error: 'text required' }, { status: 400 })
        }

        let plan = heuristicPlan(text)
        let directAnswer: string | null = null
        if (!plan) {
          const reply = await oneshot('strategist', classifierPrompt(text))
          const parsed = extractJson(reply) as
            | (NlPlan & { answer?: string })
            | null
          if (parsed?.action === 'answer') {
            directAnswer = parsed.answer ?? null
            plan = { action: 'answer', question: text }
          } else if (
            parsed?.action === 'queue' &&
            typeof (parsed as { task?: unknown }).task === 'string'
          ) {
            plan = {
              action: 'queue',
              task: (parsed as { task: string }).task,
              worker: (parsed as { worker?: string }).worker,
              priority: ((parsed as { priority?: number }).priority ?? 2) as
                | 1
                | 2
                | 3,
            }
          } else if (
            parsed?.action === 'goal' &&
            typeof (parsed as { goal?: unknown }).goal === 'string'
          ) {
            plan = { action: 'goal', goal: (parsed as { goal: string }).goal }
          } else {
            // Classifier fell over → safest default: queue verbatim.
            plan = { action: 'queue', task: text, priority: 2 }
          }
        }

        if (plan.action === 'answer') {
          const answer =
            directAnswer ??
            (await oneshot(
              'strategist',
              `Answer the operator's question concisely.\n${text}`,
            ))
          return json({
            ok: true,
            result: { action: 'answer', detail: answer.slice(0, 2000) },
          })
        }

        const result = await executeNlPlan(plan, { dispatch: oneshot })
        return json({ ok: true, result })
      },
    },
  },
})
