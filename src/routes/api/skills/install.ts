import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'

const execFileAsync = promisify(execFile)

export const Route = createFileRoute('/api/skills/install')({
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

          const hermesHome = path.join(os.homedir(), '.hermes')
          await execFileAsync(
            'clawhub',
            ['install', skillId, '--workdir', hermesHome, '--dir', 'skills'],
            {
              cwd: os.homedir(),
              timeout: 120000,
              maxBuffer: 1024 * 1024 * 4,
            },
          )

          return json({ ok: true, installed: true, skillId })
        } catch (error) {
          const command = `clawhub install ${
            (
              (await request
                .clone()
                .json()
                .catch(() => ({ skillId: '' }))) as { skillId?: string }
            ).skillId || '<slug>'
          } --workdir ~/.hermes --dir skills`
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to install skill',
              command,
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
