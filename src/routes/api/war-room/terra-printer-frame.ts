import { createFileRoute } from '@tanstack/react-router'
import { getTerraPrinterCameraFrame } from '../../../lib/war-room/terra/terra-local-assets'
import { isAuthenticated } from '../../../server/auth-middleware'

export const Route = createFileRoute('/api/war-room/terra-printer-frame')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response('Unauthorized', { status: 401, headers: { 'cache-control': 'no-store' } })
        }
        const result = await getTerraPrinterCameraFrame()
        if (!result.ok) {
          return new Response(result.error, {
            status: result.status,
            headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
          })
        }
        return new Response(new Uint8Array(result.frame), {
          status: 200,
          headers: {
            'cache-control': 'no-store, max-age=0',
            'content-type': result.contentType,
            'x-terra-camera-source': result.sourceUrl,
          },
        })
      },
    },
  },
})
