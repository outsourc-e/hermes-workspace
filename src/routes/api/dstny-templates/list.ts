import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import {
  TEMPLATE_CHANNELS,
  TEMPLATE_STATUSES,
  TEMPLATE_TYPES,
  listTemplates,
} from '../../../server/dstny-templates'

export const Route = createFileRoute('/api/dstny-templates/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        return json({
          ok: true,
          templates: listTemplates(),
          options: {
            types: TEMPLATE_TYPES,
            channels: TEMPLATE_CHANNELS,
            statuses: TEMPLATE_STATUSES,
          },
        })
      },
    },
  },
})
