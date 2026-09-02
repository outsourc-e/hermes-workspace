import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  readWorkspaceVoiceSettings,
  writeWorkspaceVoiceSettings,
} from '../../server/workspace-voice-settings'

export const Route = createFileRoute('/api/workspace-voice-settings')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 },
          )
        }

        return json({
          ok: true,
          ...readWorkspaceVoiceSettings(),
        })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 },
          )
        }

        try {
          const body = await request.json()
          const settings = writeWorkspaceVoiceSettings(body)

          return json({
            ok: true,
            ...settings,
          })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to save workspace voice settings.',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
