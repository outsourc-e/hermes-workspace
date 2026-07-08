/**
 * Audit log API.
 *
 * GET /api/audit-log            — recent entries (newest first)
 * GET /api/audit-log?verify=1   — walk the whole HMAC chain, report integrity
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { listAudit, verifyAuditChain } from '../../server/audit-log'
import { requireLocalOrAuth } from '../../server/auth-middleware'

export const Route = createFileRoute('/api/audit-log')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        if (url.searchParams.get('verify')) {
          return json({ ok: true, chain: verifyAuditChain() })
        }
        return json({ ok: true, entries: listAudit() })
      },
    },
  },
})
