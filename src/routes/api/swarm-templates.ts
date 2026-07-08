/**
 * Workflow templates API.
 *
 * GET  /api/swarm-templates                      — list templates
 * POST /api/swarm-templates {id, input}          — run a template as a pipeline
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { runPipeline } from '../../server/swarm-pipeline'
import { listTemplates, renderTemplate } from '../../server/swarm-templates'
import { dispatchStage } from './swarm-pipeline'

export const Route = createFileRoute('/api/swarm-templates')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          templates: listTemplates().map(({ id, name, description }) => ({
            id,
            name,
            description,
          })),
        })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { id?: string; input?: string }
        try {
          body = (await request.json()) as { id?: string; input?: string }
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const rendered = renderTemplate(body.id ?? '', body.input ?? '')
        if (!rendered) {
          return json({ ok: false, error: 'Unknown template' }, { status: 404 })
        }
        if (!body.input?.trim()) {
          return json({ ok: false, error: 'input required' }, { status: 400 })
        }
        const pending = runPipeline({
          title: rendered.title,
          stages: rendered.stages,
          dispatcher: dispatchStage,
        })
        const runId = await Promise.race([
          pending.then((run) => run.id),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 300)),
        ])
        void pending.catch(() => {})
        return json({ ok: true, runId: runId || 'starting', title: rendered.title })
      },
    },
  },
})
