/**
 * Swarm pipelines — chained multi-stage dispatch.
 *
 * GET  /api/swarm-pipeline                       — list runs (newest first)
 * POST /api/swarm-pipeline {title, stages:[{label, assignments:[{workerId,task}]}]}
 *      — start a pipeline; returns immediately with the run id while stages
 *        execute in the background (results visible via GET / timeline).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import {
  listPipelineRuns,
  parsePipelineStages,
  runPipeline,
} from '../../server/swarm-pipeline'
import { dispatchSwarmAssignments } from './swarm-dispatch'

async function dispatchStage(
  assignments: Array<{ workerId: string; task: string }>,
) {
  const res = (await dispatchSwarmAssignments({
    assignments,
    waitForCheckpoint: true,
    timeoutSeconds: 900,
  })) as {
    results?: Array<{
      workerId: string
      ok: boolean
      checkpoint?: { result?: string | null } | null
      output?: string
      error?: string | null
    }>
  }
  return (res.results ?? []).map((r) => ({
    workerId: r.workerId,
    ok: r.ok,
    summary: (
      r.checkpoint?.result ||
      r.error ||
      r.output ||
      ''
    ).slice(0, 1000),
  }))
}

export const Route = createFileRoute('/api/swarm-pipeline')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, runs: listPipelineRuns() })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { title?: unknown; stages?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        let stages
        try {
          stages = parsePipelineStages(body.stages)
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 400 },
          )
        }
        const title =
          typeof body.title === 'string' && body.title.trim()
            ? body.title.trim()
            : 'Pipeline'

        // Fire-and-forget: stages can run for many minutes. The run record is
        // persisted immediately; progress lands in swarm-pipelines.json and
        // the timeline as each stage's dispatches complete.
        const pending = runPipeline({
          title,
          stages,
          dispatcher: dispatchStage,
        })
        const runId = await Promise.race([
          pending.then((run) => run.id),
          new Promise<string>((resolveId) =>
            setTimeout(() => resolveId(''), 300),
          ),
        ])
        void pending.catch(() => {})
        const started = listPipelineRuns()[0]
        return json({
          ok: true,
          runId: runId || started?.id || null,
          state: 'running',
        })
      },
    },
  },
})
