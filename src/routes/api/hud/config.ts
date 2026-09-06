import { createFileRoute } from '@tanstack/react-router'
import { loadHUDConfig, saveHUDConfig } from '../../../lib/hud/config'

export async function getConfigHandler(): Promise<Response> {
  const cfg = await loadHUDConfig()
  return new Response(JSON.stringify(cfg), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function patchConfigHandler({
  request,
}: {
  request: Request
}): Promise<Response> {
  const patch = await request.json()
  const current = await loadHUDConfig()
  const next = {
    ...current,
    ...patch,
    widgets: { ...current.widgets, ...(patch.widgets ?? {}) },
  }
  await saveHUDConfig(next)
  return new Response(JSON.stringify(next), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/hud/config')({
  server: {
    handlers: {
      GET: getConfigHandler,
      PATCH: patchConfigHandler,
    },
  },
})
