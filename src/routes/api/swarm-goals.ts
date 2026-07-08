/**
 * Standing goals API.
 *
 * GET  /api/swarm-goals                          — list goals (newest first)
 * POST /api/swarm-goals {goal, maxIterations?}   — create an active goal
 * POST /api/swarm-goals {action:'pause'|'resume'|'abandon', id}
 * POST /api/swarm-goals {action:'step'}          — advance one goal one step
 *      (called by the lifecycle sweep; also fine to call manually)
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  createGoal,
  listGoals,
  stepGoals,
  updateGoalState,
} from '../../server/swarm-goals'
import { runPipeline } from '../../server/swarm-pipeline'
import { dispatchSwarmAssignments } from './swarm-dispatch'
import { dispatchStage } from './swarm-pipeline'

async function strategistDispatch(task: string): Promise<string> {
  const res = (await dispatchSwarmAssignments({
    assignments: [{ workerId: 'strategist', task, oneshot: true }],
    waitForCheckpoint: true,
    timeoutSeconds: 600,
  })) as {
    results?: Array<{
      checkpoint?: { result?: string | null } | null
      output?: string
    }>
  }
  const r = res.results?.[0]
  // Prefer raw output: the checkpoint parser can clip a multi-line JSON plan
  // out of the RESULT field; the oneshot output has the full reply.
  return r?.output || r?.checkpoint?.result || ''
}

export const Route = createFileRoute('/api/swarm-goals')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, goals: listGoals() })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }

        const action = typeof body.action === 'string' ? body.action : null

        if (action === 'step') {
          const outcome = await stepGoals({
            dispatch: strategistDispatch,
            startPipeline: async ({ title, stages }) => {
              const pending = runPipeline({
                title,
                stages,
                dispatcher: dispatchStage,
              })
              // Return the run id as soon as it exists; the pipeline keeps
              // executing in the background.
              const runId = await Promise.race([
                pending.then((run) => run.id),
                new Promise<string>((resolveId) =>
                  setTimeout(() => resolveId(''), 300),
                ),
              ])
              void pending.catch(() => {})
              if (runId) return runId
              const { listPipelineRuns } = await import(
                '../../server/swarm-pipeline'
              )
              return listPipelineRuns()[0]?.id ?? 'unknown'
            },
          })
          return json({ ok: true, action: 'step', outcome })
        }

        if (action === 'pause' || action === 'resume' || action === 'abandon') {
          const id = typeof body.id === 'string' ? body.id : ''
          const state =
            action === 'pause'
              ? ('paused' as const)
              : action === 'resume'
                ? ('active' as const)
                : ('failed' as const)
          const goal = updateGoalState(id, state)
          if (!goal) {
            return json({ ok: false, error: 'Unknown goal' }, { status: 404 })
          }
          return json({ ok: true, goal })
        }

        const goalText = typeof body.goal === 'string' ? body.goal : ''
        try {
          const goal = createGoal({
            goal: goalText,
            maxIterations:
              typeof body.maxIterations === 'number'
                ? body.maxIterations
                : undefined,
          })
          return json({ ok: true, goal })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
