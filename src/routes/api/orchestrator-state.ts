import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCoordinatorSnapshot } from '../../server/mission-coordinator/langgraph-bridge'
import { isAuthenticated } from '../../server/auth-middleware'

function resolvePythonBin(): string {
  const override = process.env.HERMES_LANGGRAPH_PYTHON
  if (override) return override
  return join(process.cwd(), 'hermes_langgraph_orchestrator', '.venv', 'bin', 'python')
}

function isLanggraphAvailable(): boolean {
  const override = process.env.HERMES_LANGGRAPH_PYTHON
  if (override) return existsSync(override)
  return existsSync(resolvePythonBin())
}

function parseJsonFromStdout(stdout: string): unknown {
  const start = stdout.indexOf('{')
  if (start === -1) {
    const arrStart = stdout.indexOf('[')
    if (arrStart === -1) throw new Error('No JSON object or array found in Python output')
    return JSON.parse(stdout.slice(arrStart))
  }
  return JSON.parse(stdout.slice(start))
}

export const Route = createFileRoute('/api/orchestrator-state')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        const missionId = url.searchParams.get('missionId')?.trim()
        if (!missionId) {
          return json({ ok: false, error: 'missionId required' }, { status: 400 })
        }

        if (!isLanggraphAvailable()) {
          return json({ ok: false, error: 'LangGraph orchestrator not installed', available: false }, { status: 404 })
        }

        const python = resolvePythonBin()
        const result = spawnSync(
          python,
          ['-m', 'hermes_langgraph_orchestrator', '--get-state', '--mission-id', missionId],
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
          const state = parseJsonFromStdout(result.stdout)
          if (state === null) {
            return json({ ok: false, error: 'Mission state not found' }, { status: 404 })
          }
          const coordinator = getCoordinatorSnapshot(missionId)
          return json({ ok: true, state, coordinator })
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
