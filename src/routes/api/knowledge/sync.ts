import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  readKnowledgeBaseConfig,
  type KnowledgeBaseConfig,
} from '../../../server/knowledge-config'
import { syncKnowledgeSource } from '../../../server/knowledge-browser'

export const Route = createFileRoute('/api/knowledge/sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Optional: allow body to override source temporarily for one-shot use
        let config: KnowledgeBaseConfig | null = null
        try {
          const text = await request.text()
          if (text) {
            config = JSON.parse(text)
          }
        } catch {
          // ignore parse errors, use stored config
        }

        if (config) {
          const { writeKnowledgeBaseConfig } = await import(
            '../../../server/knowledge-config'
          )
          writeKnowledgeBaseConfig(config)
        }

        try {
          const result = await syncKnowledgeSource()
          return json(result)
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to sync knowledge source',
            },
            { status: 500 },
          )
        }
      },
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        const config = readKnowledgeBaseConfig()
        return json({ source: config.source })
      },
    },
  },
})
