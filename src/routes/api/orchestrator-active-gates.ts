import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

function resolvePythonBin(): string {
  const override = process.env.HERMES_LANGGRAPH_PYTHON
  if (override) return override
  return join(process.cwd(), 'hermes_langgraph_orchestrator', '.venv', 'bin', 'python')
}

function parseJsonFromStdout(stdout: string): unknown {
  const start = stdout.indexOf('[')
  if (start === -1) {
    const objStart = stdout.indexOf('{')
    if (objStart === -1) throw new Error('No JSON found in Python output')
    return JSON.parse(stdout.slice(objStart))
  }
  return JSON.parse(stdout.slice(start))
}

export const Route = createFileRoute('/api/orchestrator-active-gates')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const python = resolvePythonBin()
        const result = spawnSync(
          python,
          ['-m', 'hermes_langgraph_orchestrator', '--list-active-gates'],
          { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: process.env },
        )

        if (result.error) {
          return json(
            { ok: false, error: `Failed to run orchestrator: ${result.error.message}` },
            { status: 500 },
          )
        }
        if (result.status !== 0) {
          return json(
            {
              ok: false,
              error: 'Orchestrator exited with error',
              stderr: result.stderr?.slice(0, 2000) ?? null,
            },
            { status: 500 },
          )
        }

        try {
          const gates = parseJsonFromStdout(result.stdout)
          return json({ ok: true, gates })
        } catch (e) {
          return json(
            {
              ok: false,
              error: 'Invalid JSON from orchestrator',
              details: e instanceof Error ? e.message : String(e),
              stdout: result.stdout?.slice(0, 2000) ?? null,
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
