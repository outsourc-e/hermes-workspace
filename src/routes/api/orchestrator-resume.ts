import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  langgraphEnvWithHumanGate,
  parseHumanGateResumeBody,
} from '../../server/langgraph-human-gate'
import { spawnLanggraphDetached } from '../../server/langgraph-orchestrator'

type ResumeBody = {
  missionId?: unknown
  action?: unknown
  choice?: unknown
  humanNote?: unknown
  targetWorkerId?: unknown
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export const Route = createFileRoute('/api/orchestrator-resume')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: ResumeBody
        try {
          body = (await request.json()) as ResumeBody
        } catch {
          return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        const missionId = cleanString(body.missionId)
        const action = cleanString(body.action)
        if (!missionId) {
          return json({ ok: false, error: 'missionId required' }, { status: 400 })
        }
        if (action !== 'approved' && action !== 'abort') {
          return json({ ok: false, error: 'action must be approved or abort' }, { status: 400 })
        }

        const useMock = new URL(request.url).searchParams.get('mock') === '1'
        const humanGate = action === 'approved' ? parseHumanGateResumeBody(body) : null
        if (action === 'approved' && body.choice === 'custom' && !humanGate) {
          return json({ ok: false, error: '自定义选项需要填写说明' }, { status: 400 })
        }
        const env = langgraphEnvWithHumanGate(process.env, humanGate)

        const { pid } = spawnLanggraphDetached(
          [
            '--execute',
            ...(useMock ? ['--mock-services'] : []),
            '--resume',
            action,
            '--mission-id',
            missionId,
          ],
          env,
        )

        return json({
          ok: true,
          accepted: true,
          action,
          missionId,
          mock: useMock,
          pid,
          humanGate,
        })
      },
    },
  },
})
