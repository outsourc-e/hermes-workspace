import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'

export const Route = createFileRoute('/api/skills/uninstall')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const body = (await request.json()) as { skillId?: string }
          const skillId = (body.skillId || '').trim()
          if (!skillId)
            return json(
              { ok: false, error: 'skillId required' },
              { status: 400 },
            )
          const skillPath = path.join(
            os.homedir(),
            '.hermes',
            'skills',
            skillId,
          )
          if (!fs.existsSync(skillPath)) {
            return json(
              {
                ok: false,
                error: 'Installed skill not found under ~/.hermes/skills',
              },
              { status: 404 },
            )
          }
          fs.rmSync(skillPath, { recursive: true, force: false })
          return json({ ok: true, uninstalled: true, skillId })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to uninstall skill',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
