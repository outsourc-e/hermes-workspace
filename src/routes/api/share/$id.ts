/**
 * GET  /api/share/:id  — retrieve share content
 * DELETE /api/share/:id — delete a share
 */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'
import type { ShareMeta } from './index'

const SHARE_DIR = '/root/.hermes/share'

function metaPath(id: string): string {
  return join(SHARE_DIR, `${id}.json`)
}

function binPath(id: string): string {
  return join(SHARE_DIR, `${id}.bin`)
}

function safeId(id: string): boolean {
  return /^[a-f0-9]{16}$/.test(id)
}

function isLocalRequest(request: Request): boolean {
  const maybeAddress = (request as unknown as { remoteAddress?: string })
    .remoteAddress
  const ip = (maybeAddress && maybeAddress.trim()) || '127.0.0.1'
  if (['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'].includes(ip))
    return true
  if (/^100\.\d+\.\d+\.\d+$/.test(ip)) return true
  if (/^192\.168\./.test(ip)) return true
  if (/^10\./.test(ip)) return true
  return false
}

async function handleGET({
  request,
  params,
}: {
  request: Request
  params: Record<string, string>
}): Promise<Response> {
  if (!isAuthenticated(request) && !isLocalRequest(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const id = params.id

  if (!safeId(id)) {
    return new Response('Not found', { status: 404 })
  }

  const mp = metaPath(id)
  const bp = binPath(id)

  if (!existsSync(mp) || !existsSync(bp)) {
    return new Response('Not found', { status: 404 })
  }

  let meta: ShareMeta
  try {
    meta = JSON.parse(readFileSync(mp, 'utf8')) as ShareMeta
  } catch {
    return new Response('Corrupt share metadata', { status: 500 })
  }

  if (meta.expiresAt < Date.now()) {
    rmSync(mp, { force: true })
    rmSync(bp, { force: true })
    return new Response('Expired', { status: 410 })
  }

  const buf = readFileSync(bp)

  if (meta.kind === 'text') {
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } else {
    const ct = meta.contentType || 'application/octet-stream'
    const disp = `attachment; filename="${encodeURIComponent(meta.filename ?? id)}"`
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': ct,
        'Content-Disposition': disp,
      },
    })
  }
}

async function handleDELETE({
  request,
  params,
}: {
  request: Request
  params: Record<string, string>
}): Promise<Response> {
  if (!isAuthenticated(request) && !isLocalRequest(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const id = params.id

  if (!safeId(id)) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const mp = metaPath(id)
  const bp = binPath(id)

  if (!existsSync(mp)) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  rmSync(mp, { force: true })
  if (existsSync(bp)) rmSync(bp, { force: true })

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/share/$id')({
  server: {
    handlers: {
      GET: handleGET,
      DELETE: handleDELETE,
    },
  },
})
