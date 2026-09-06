import { createFileRoute } from '@tanstack/react-router'
import { buildHUDSnapshot } from '../../../server/hud/build-snapshot'

export async function snapshotHandler(): Promise<Response> {
  const snap = await buildHUDSnapshot()
  return new Response(JSON.stringify(snap), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export const Route = createFileRoute('/api/hud/snapshot')({
  server: {
    handlers: {
      GET: snapshotHandler,
    },
  },
})
