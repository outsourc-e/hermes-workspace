import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { detectNetworkUrl, parsePort } from '../../server/network-url'

export const Route = createFileRoute('/api/network-url')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const port = parsePort(new URL(request.url).searchParams.get('port'))
        const result = await detectNetworkUrl(port)
        return json(result)
      },
    },
  },
})
