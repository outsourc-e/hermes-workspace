/**
 * Authenticated local media endpoint.
 *
 * Hermes Agent can emit MEDIA:<absolute-path> tokens for generated images and
 * other local artifacts. Browsers cannot load those paths directly, so this
 * route serves a constrained set of Workspace/Hermes artifact directories.
 */
import { readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import { extname, isAbsolute, resolve as resolvePath } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { requireLocalOrAuth } from '../../server/auth-middleware'

const MAX_BYTES = 10 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
}

function hermesHome(): string {
  return process.env.HERMES_HOME ?? process.env.CLAUDE_HOME ?? resolvePath(os.homedir(), '.hermes')
}

function allowedPrefixes(): Array<string> {
  const home = os.homedir()
  const stateHome = resolvePath(hermesHome())
  return [
    '/tmp',
    resolvePath(home, 'tmp'),
    resolvePath(stateHome, 'tmp'),
    resolvePath(stateHome, 'cache'),
    resolvePath(stateHome, 'audio_cache'),
    resolvePath(stateHome, 'workspace', 'artifacts'),
    resolvePath(home, 'dispatch'),
    resolvePath(home, 'projects'),
    resolvePath(stateHome, 'projects'),
    resolvePath(home, '.ocplatform', 'workspace', 'projects'),
  ]
}

function isAllowed(absPath: string): boolean {
  return allowedPrefixes().some((prefix) => {
    const normalizedPrefix = resolvePath(prefix)
    return absPath === normalizedPrefix || absPath.startsWith(`${normalizedPrefix}/`)
  })
}

export const Route = createFileRoute('/api/media')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return new Response('Unauthorized', { status: 401 })
        }

        try {
          const url = new URL(request.url)
          const rawPath = url.searchParams.get('path')?.trim() ?? ''
          if (!rawPath) return new Response('path required', { status: 400 })
          if (!isAbsolute(rawPath)) {
            return new Response('Only absolute paths are accepted', { status: 400 })
          }

          const absPath = resolvePath(rawPath)
          if (!isAllowed(absPath)) {
            return new Response('Forbidden path', { status: 403 })
          }

          const ext = extname(absPath).toLowerCase()
          const contentType = MIME_BY_EXT[ext]
          if (!contentType) {
            return new Response('Unsupported media type', { status: 415 })
          }

          let stat
          try {
            stat = statSync(absPath)
          } catch {
            return new Response('Not found', { status: 404 })
          }
          if (!stat.isFile()) return new Response('Not a file', { status: 400 })
          if (stat.size > MAX_BYTES) {
            return new Response('File too large', { status: 413 })
          }

          return new Response(readFileSync(absPath), {
            headers: {
              'Cache-Control': 'private, max-age=60',
              'Content-Type': contentType,
              'Referrer-Policy': 'no-referrer',
              'X-Content-Type-Options': 'nosniff',
            },
          })
        } catch (err) {
          return new Response(
            err instanceof Error ? err.message : 'Media request failed',
            { status: 500 },
          )
        }
      },
    },
  },
})
