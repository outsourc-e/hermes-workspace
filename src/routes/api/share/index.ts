/**
 * POST /api/share  — create a new share (text or file)
 * GET  /api/share  — list recent 50 shares
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../../server/auth-middleware'

const SHARE_DIR = '/root/.hermes/share'
const MAX_TEXT_BYTES = 1024 * 1024 // 1 MB
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50 MB
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface ShareMeta {
  id: string
  kind: 'text' | 'file'
  filename?: string
  contentType?: string
  textPreview?: string
  size: number
  created: number // unix ms
  expiresAt: number // unix ms
}

function ensureShareDir(): void {
  if (!existsSync(SHARE_DIR)) {
    mkdirSync(SHARE_DIR, { recursive: true, mode: 0o700 })
  }
}

function metaPath(id: string): string {
  return join(SHARE_DIR, `${id}.json`)
}

function binPath(id: string): string {
  return join(SHARE_DIR, `${id}.bin`)
}

function safeId(id: string): boolean {
  return /^[a-f0-9]{16}$/.test(id)
}

function pruneExpired(): void {
  if (!existsSync(SHARE_DIR)) return
  const now = Date.now()
  try {
    const files = readdirSync(SHARE_DIR).filter((f) => f.endsWith('.json'))
    for (const file of files) {
      try {
        const meta = JSON.parse(
          readFileSync(join(SHARE_DIR, file), 'utf8'),
        ) as ShareMeta
        if (meta.expiresAt < now) {
          rmSync(join(SHARE_DIR, file), { force: true })
          const bin = join(SHARE_DIR, file.replace('.json', '.bin'))
          if (existsSync(bin)) rmSync(bin, { force: true })
        }
      } catch {
        // ignore corrupt entries
      }
    }
  } catch {
    // ignore errors
  }
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

async function handleGET({ request }: { request: Request }): Promise<Response> {
  if (!isAuthenticated(request) && !isLocalRequest(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  pruneExpired()
  ensureShareDir()

  try {
    const files = readdirSync(SHARE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(
            readFileSync(join(SHARE_DIR, f), 'utf8'),
          ) as ShareMeta
        } catch {
          return null
        }
      })
      .filter((m): m is ShareMeta => m !== null)
      .sort((a, b) => b.created - a.created)
      .slice(0, 50)

    return new Response(JSON.stringify({ shares: files }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to list shares' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function handlePOST({
  request,
}: {
  request: Request
}): Promise<Response> {
  if (!isAuthenticated(request) && !isLocalRequest(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  pruneExpired()
  ensureShareDir()

  const contentType = request.headers.get('content-type') ?? ''
  const id = randomBytes(8).toString('hex')
  const now = Date.now()
  const expiresAt = now + DEFAULT_TTL_MS

  try {
    if (contentType.includes('application/json')) {
      // Text share
      const body = (await request.json()) as { kind?: string; content?: string }
      if (body.kind !== 'text' || typeof body.content !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Expected {kind:"text", content: string}' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      const textBuf = Buffer.from(body.content, 'utf8')
      if (textBuf.length > MAX_TEXT_BYTES) {
        return new Response(
          JSON.stringify({ error: 'Text too large (max 1 MB)' }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      const meta: ShareMeta = {
        id,
        kind: 'text',
        textPreview: body.content.slice(0, 120),
        size: textBuf.length,
        created: now,
        expiresAt,
      }
      writeFileSync(binPath(id), textBuf)
      writeFileSync(metaPath(id), JSON.stringify(meta))

      return new Response(
        JSON.stringify({
          ok: true,
          id,
          downloadUrl: `/api/share/${id}`,
          expiresAt,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    } else if (contentType.includes('multipart/form-data')) {
      // File share
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file field in form' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (file.size > MAX_FILE_BYTES) {
        return new Response(
          JSON.stringify({ error: 'File too large (max 50 MB)' }),
          {
            status: 413,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      const buf = Buffer.from(await file.arrayBuffer())
      const meta: ShareMeta = {
        id,
        kind: 'file',
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: buf.length,
        created: now,
        expiresAt,
      }
      writeFileSync(binPath(id), buf)
      writeFileSync(metaPath(id), JSON.stringify(meta))

      return new Response(
        JSON.stringify({
          ok: true,
          id,
          downloadUrl: `/api/share/${id}`,
          expiresAt,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    } else {
      return new Response(
        JSON.stringify({ error: 'Unsupported content-type' }),
        {
          status: 415,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const Route = createFileRoute('/api/share/')({
  server: {
    handlers: {
      GET: handleGET,
      POST: handlePOST,
    },
  },
})
