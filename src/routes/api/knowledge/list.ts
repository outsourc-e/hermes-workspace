import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  getKnowledgeRoot,
  knowledgeRootExists,
  listKnowledgePages,
} from '../../../server/knowledge-browser'

export const Route = createFileRoute('/api/knowledge/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const knowledgeRoot = getKnowledgeRoot()
          const exists = knowledgeRootExists()
          return json({
            pages: exists ? listKnowledgePages() : [],
            knowledgeRoot,
            exists,
          })
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : 'Failed to list knowledge pages' },
            { status: 500 },
          )
        }
      },
    },
  },
})
