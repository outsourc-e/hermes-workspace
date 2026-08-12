import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isAuthenticated } from '../../../server/auth-middleware'
import { spawnLanggraphDetached, resolveLanggraphPythonBin } from '../../../server/langgraph-orchestrator'

import "../../../server/swarm-background-harvest"
function isLanggraphAvailable(): boolean {
  const override = process.env.HERMES_LANGGRAPH_PYTHON
  if (override) return existsSync(override)
  return existsSync(resolveLanggraphPythonBin())
}

function resolveWorkflowArg(workflowId: string): string {
  if (workflowId.startsWith('/')) return workflowId
  if (workflowId.includes('/') || workflowId.includes('\\')) {
    return join(process.cwd(), workflowId)
  }
  return workflowId
}

type RunBody = {
  missionGoal?: unknown
  missionId?: unknown
  workflowId?: unknown
  maxIterations?: unknown
  mock?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const Route = createFileRoute('/api/swarm-langgraph/run')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: RunBody
        try {
          body = (await request.json()) as RunBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        if (!isLanggraphAvailable()) {
          return json({ ok: false, error: 'LangGraph orchestrator not installed. Run: cd hermes_langgraph_orchestrator && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt' }, { status: 503 })
        }

        const missionGoal = cleanString(body.missionGoal)
        if (!missionGoal) {
          return json({ ok: false, error: 'missionGoal required' }, { status: 400 })
        }

        const missionId = cleanString(body.missionId) ?? `lg-${Date.now().toString(36)}`
        const workflowId = cleanString(body.workflowId)
        const maxIterations = typeof body.maxIterations === 'number'
          ? Math.max(1, Math.min(20, Math.floor(body.maxIterations)))
          : 5
        const useMock = body.mock === true || new URL(request.url).searchParams.get('mock') === '1'

        const args = [
          '--execute',
          ...(useMock ? ['--mock-services'] : []),
          '--mission-id',
          missionId,
          '--goal',
          missionGoal,
          '--max-iterations',
          String(maxIterations),
        ]
        if (workflowId) {
          args.push('--workflow', resolveWorkflowArg(workflowId))
        }

        const { pid, logFile } = spawnLanggraphDetached(args)
        return json({
          ok: true,
          accepted: true,
          missionId,
          threadId: missionId,
          pid,
          logFile,
          mock: useMock,
          workflowId: workflowId ?? null,
        })
      },
    },
  },
})
