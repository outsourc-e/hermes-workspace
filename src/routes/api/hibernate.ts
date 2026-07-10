/**
 * Hibernate / wake the background fleet.
 *
 * GET  /api/hibernate                 — { state: 'hibernating' | 'awake' }
 * POST /api/hibernate {action:'stop'|'start'}
 *
 * Wraps scripts/hermes-hibernate.sh: stop disables every com.hermes.*
 * launchd job except the workspace itself, kills swarm tmux sessions and
 * pauses dispatch; start re-enables everything.
 */
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { actorFromRequest, appendAudit } from '../../server/audit-log'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { SWARM_CANONICAL_REPO } from '../../server/swarm-environment'

function runScript(action: 'stop' | 'start' | 'status'): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      '/bin/bash',
      [join(SWARM_CANONICAL_REPO, 'scripts', 'hermes-hibernate.sh'), action],
      { timeout: 60_000 },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(stdout.trim())
      },
    )
  })
}

export const Route = createFileRoute('/api/hibernate')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, state: await runScript('status') })
      },
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: { action?: string }
        try {
          body = (await request.json()) as { action?: string }
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        if (body.action !== 'stop' && body.action !== 'start') {
          return json(
            { ok: false, error: 'action must be stop or start' },
            { status: 400 },
          )
        }
        appendAudit({
          actor: actorFromRequest(request),
          action: `hibernate:${body.action}`,
          detail: 'fleet-wide',
        })
        try {
          const state = await runScript(body.action)
          return json({ ok: true, state })
        } catch (error) {
          return json(
            {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
