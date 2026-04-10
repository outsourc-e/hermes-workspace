import path from 'node:path'
import os from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'

const HERMES_HOME =
  process.env.HERMES_HOME || path.join(os.homedir(), '.hermes')

export const Route = createFileRoute('/api/paths')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({
          ok: true,
          hermesHome: HERMES_HOME,
          memoriesDir: path.join(HERMES_HOME, 'memories'),
          skillsDir: path.join(HERMES_HOME, 'skills'),
        })
      },
    },
  },
})
