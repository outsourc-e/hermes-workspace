/**
 * GET /api/uni/context
 *
 * Returns the raw content of ~/.hermes/uni/context.md
 * Used by the UniDashboard page to render subjects, deadlines, tasks.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'

const CONTEXT_PATH = join(homedir(), '.hermes', 'uni', 'context.md')

export const Route = createFileRoute('/api/uni/context')({
  server: {
    handlers: {
      GET: async () => {
        if (!existsSync(CONTEXT_PATH)) {
          return json({ content: '' })
        }
        try {
          const content = readFileSync(CONTEXT_PATH, 'utf8')
          return json({ content })
        } catch {
          return json({ content: '' })
        }
      },
    },
  },
})
