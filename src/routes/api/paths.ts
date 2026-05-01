import path from 'node:path'
import os from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

const CLAUDE_HOME =
  process.env.CLAUDE_HOME || path.join(os.homedir(), '.claude')

export const Route = createFileRoute('/api/paths')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          claudeHome: CLAUDE_HOME,
          memoriesDir: path.join(CLAUDE_HOME, 'memories'),
          skillsDir: path.join(CLAUDE_HOME, 'skills'),
        })
      },
    },
  },
})
