import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../../server/auth-middleware'
import { buildKnowledgeGraph } from '../../../server/knowledge-browser'
import { buildVaultGraphInsights } from '../../../server/vault-graph-insights'
import { createNovaFabricReviewProposal } from '../../../server/nova-fabric-store'

const ProposeSchema = z.object({
  kind: z.enum([
    'link-or-archive-orphan',
    'refresh-stale-hub',
    'merge-duplicates',
  ]),
  title: z.string().min(1).max(200),
  reason: z.string().min(1).max(500),
  notePaths: z.array(z.string().min(1)).min(1).max(20),
})

function errorResponse(message: string, status = 400): Response {
  return json({ ok: false, error: message }, { status })
}

export const Route = createFileRoute('/api/knowledge/insights')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse('Unauthorized', 401)
        try {
          const graph = await buildKnowledgeGraph()
          return json({ ok: true, insights: buildVaultGraphInsights(graph) })
        } catch (error) {
          return errorResponse(
            error instanceof Error ? error.message : 'Vault graph unavailable',
            503,
          )
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse('Unauthorized', 401)
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return errorResponse('Invalid JSON')
        }
        const parsed = ProposeSchema.safeParse(body)
        if (!parsed.success) {
          return errorResponse(
            parsed.error.issues.map((issue) => issue.message).join('; '),
          )
        }
        const review = createNovaFabricReviewProposal({
          title: `Vault cleanup: ${parsed.data.title}`,
          reason: parsed.data.reason,
          targetType: 'source-map',
          proposedDiff: {
            cleanupKind: parsed.data.kind,
            notePaths: parsed.data.notePaths,
          },
          sourceLinks: parsed.data.notePaths.slice(0, 5).map((notePath) => ({
            label: 'Vault note',
            value: notePath,
            kind: 'file' as const,
          })),
          provenance: 'Memory galaxy insights recommendation',
        })
        return json({ ok: true, review })
      },
    },
  },
})
