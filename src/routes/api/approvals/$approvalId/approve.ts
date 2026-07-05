import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../../server/auth-middleware'
import { submitHermesRunApproval } from '../../../../server/hermes-runs-api'
import {
  clearPendingSessionApproval,
  rememberSessionApprovalForRun,
} from '../../../../server/session-approval-store'

type ApprovalChoice = 'once' | 'session' | 'always'

async function readApprovalChoice(request: Request): Promise<ApprovalChoice> {
  try {
    const body = (await request.json()) as { choice?: unknown }
    if (
      body.choice === 'once' ||
      body.choice === 'session' ||
      body.choice === 'always'
    ) {
      return body.choice
    }
  } catch {
    // Empty / non-JSON body keeps the historical one-shot approval behavior.
  }
  return 'once'
}

export const Route = createFileRoute('/api/approvals/$approvalId/approve')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const approvalId = params.approvalId?.trim()
        if (!approvalId) {
          return json(
            { ok: false, error: 'approvalId required' },
            { status: 400 },
          )
        }
        try {
          const choice = await readApprovalChoice(request)
          await submitHermesRunApproval(approvalId, choice)
          if (choice === 'session') {
            await rememberSessionApprovalForRun(approvalId)
          } else {
            await clearPendingSessionApproval(approvalId)
          }
          return json({ ok: true })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
