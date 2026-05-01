/**
 * Preview-file endpoint.
 *
 * Serves a file from disk so the Conductor complete-phase panel can embed
 * the mission output (typically /tmp/dispatch-<slug>/index.html) in an
 * iframe. Locks serving to a small list of trusted prefixes so the route
 * can never be used to exfiltrate arbitrary user files.
 */
import { statSync, readFileSync } from 'node:fs'
import { extname, resolve as resolvePath } from 'node:path'
import os from 'node:os'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'

const MAX_BYTES = 5 * 1024 * 1024 // 5MB ceiling for embedded previews
const MIME_BY_EXT: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

function allowedPrefixes(): string[] {
  const home = os.homedir()
  const claudeHome =
    process.env.CLAUDE_HOME ?? resolvePath(home, '.claude')
  return [
    '/tmp',
    `${home}/tmp`,
    resolvePath(home, 'dispatch'),
    resolvePath(home, 'projects'),
    resolvePath(claudeHome, 'projects'),
    resolvePath(home, '.claude', 'projects'),
    resolvePath(home, '.ocplatform', 'workspace', 'projects'),
  ]
}

function isAllowed(absPath: string): boolean {
  return allowedPrefixes().some(
    (prefix) => absPath === prefix || absPath.startsWith(`${prefix}/`),
  )
}

export const Route = createFileRoute('/api/preview-file')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response('Unauthorized', { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const rawPath = url.searchParams.get('path') || ''
          if (!rawPath) {
            return new Response('path required', { status: 400 })
          }
          const abs = resolvePath(rawPath)
          if (!isAllowed(abs)) {
            return new Response('Forbidden path', { status: 403 })
          }
          let stat
          try {
            stat = statSync(abs)
          } catch {
            return new Response('Not found', { status: 404 })
          }
          if (!stat.isFile()) {
            return new Response('Not a file', { status: 400 })
          }
          if (stat.size > MAX_BYTES) {
            return new Response('File too large for preview', { status: 413 })
          }
          const body = readFileSync(abs)
          const mime = MIME_BY_EXT[extname(abs).toLowerCase()] ?? 'application/octet-stream'
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': mime,
              'Cache-Control': 'no-store',
              // Restrict referrer so preview content can't phone home with paths
              'Referrer-Policy': 'no-referrer',
            },
          })
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Preview failed',
            { status: 500 },
          )
        }
      },
    },
  },
})
