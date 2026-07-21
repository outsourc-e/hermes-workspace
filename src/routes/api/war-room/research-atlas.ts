import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { isAuthenticated } from '../../../server/auth-middleware'
import {
  loadResearchAtlasSnapshot,
  renderResearchAtlasSite,
  resolveResearchAtlasAsset,
  stageResearchMission,
} from '../../../server/war-room-research-atlas'
import type { ResearchMissionInput } from '../../../lib/war-room/living-v3/research-atlas-contract'

const noStoreHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (extension === '.json') return 'application/json; charset=utf-8'
  if (extension === '.txt') return 'text/plain; charset=utf-8'
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function errorResponse(error: unknown, status = 500) {
  return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, {
    status,
    headers: noStoreHeaders,
  })
}

export const Route = createFileRoute('/api/war-room/research-atlas')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse(new Error('Unauthorized'), 401)
        const url = new URL(request.url)
        try {
          if (url.searchParams.get('view') === 'site') {
            return new Response(renderResearchAtlasSite(), {
              headers: {
                ...noStoreHeaders,
                'content-type': 'text/html; charset=utf-8',
                'content-security-policy': "default-src 'self' https: data:; img-src 'self' https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'self'",
              },
            })
          }

          const asset = url.searchParams.get('asset')
          if (asset) {
            const filePath = resolveResearchAtlasAsset(asset)
            const headers: Record<string, string> = {
              ...noStoreHeaders,
              'content-type': contentTypeFor(filePath),
            }
            if (path.extname(filePath).toLowerCase() === '.xlsx') {
              headers['content-disposition'] = `attachment; filename="${path.basename(filePath).replace(/["\\]/g, '_')}"`
            }
            return new Response(readFileSync(filePath), { headers })
          }

          return json(loadResearchAtlasSnapshot(), { headers: noStoreHeaders })
        } catch (error) {
          return errorResponse(error, 404)
        }
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) return errorResponse(new Error('Unauthorized'), 401)
        try {
          const input = await request.json() as ResearchMissionInput
          return json(stageResearchMission(input), { status: 201, headers: noStoreHeaders })
        } catch (error) {
          return errorResponse(error, 400)
        }
      },
    },
  },
})
