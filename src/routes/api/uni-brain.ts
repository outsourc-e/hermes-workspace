/**
 * GET /api/uni-brain?action=list&path=<rel>  — list files+dirs
 * GET /api/uni-brain?action=read&path=<rel>  — read .md file
 * GET /api/uni-brain?action=search&q=<query> — grep .md files
 * POST /api/uni-brain?action=resync           — trigger vault sync
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'

const execFileAsync = promisify(execFile)

const VAULT_ROOT = '/root/.hermes/uni-brain'
const SYNC_SCRIPT = '/root/.hermes/scripts/sync-uni-brain.sh'

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

function guardAuth(request: Request): Response | null {
  if (!isAuthenticated(request) && !isLocalRequest(request)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

/**
 * Resolve a relative path within VAULT_ROOT, rejecting path traversal attempts.
 * Returns null if the resolved path escapes VAULT_ROOT.
 */
function safeResolve(relPath: string): string | null {
  const clean = relPath.replace(/\0/g, '').trim()
  const resolved =
    clean === '' || clean === '.'
      ? VAULT_ROOT
      : isAbsolute(clean)
        ? null // reject absolute paths
        : resolve(VAULT_ROOT, clean)

  if (!resolved) return null

  // Ensure resolved path starts within VAULT_ROOT
  const rel = relative(VAULT_ROOT, resolved)
  if (!rel || rel === '') return VAULT_ROOT
  if (rel.startsWith('..') || isAbsolute(rel)) return null
  return resolved
}

async function handleList(request: Request): Promise<Response> {
  const auth = guardAuth(request)
  if (auth) return auth

  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path') ?? ''

  const dir = safeResolve(rawPath)
  if (!dir) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!existsSync(dir)) {
    return new Response(
      JSON.stringify({ error: 'Path not found', entries: [] }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const stat = statSync(dir)
  if (!stat.isDirectory()) {
    return new Response(JSON.stringify({ error: 'Not a directory' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const names = readdirSync(dir)
  const entries: Array<{
    name: string
    type: 'file' | 'dir'
    size?: number
    modified?: string
  }> = []

  for (const name of names) {
    if (name.startsWith('.')) continue
    try {
      const full = join(dir, name)
      const s = statSync(full)
      if (s.isDirectory()) {
        entries.push({ name, type: 'dir' })
      } else if (s.isFile()) {
        entries.push({
          name,
          type: 'file',
          size: s.size,
          modified: s.mtime.toISOString(),
        })
      }
    } catch {
      // skip
    }
  }

  // Sort: dirs first, then files, both alphabetically
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return new Response(JSON.stringify({ entries }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleRead(request: Request): Promise<Response> {
  const auth = guardAuth(request)
  if (auth) return auth

  const url = new URL(request.url)
  const rawPath = url.searchParams.get('path') ?? ''

  const filePath = safeResolve(rawPath)
  if (!filePath) {
    return new Response('Invalid path', { status: 400 })
  }

  if (extname(filePath).toLowerCase() !== '.md') {
    return new Response('Not a markdown file', { status: 404 })
  }

  if (!existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const content = readFileSync(filePath, 'utf8')
    return new Response(content, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return new Response('Read error', { status: 500 })
  }
}

async function handleSearch(request: Request): Promise<Response> {
  const auth = guardAuth(request)
  if (auth) return auth

  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').trim()

  if (!query) {
    return new Response(JSON.stringify({ matches: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!existsSync(VAULT_ROOT)) {
    return new Response(JSON.stringify({ matches: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // grep -rn --include="*.md" -m 50 <query> <vault>
    const { stdout } = await execFileAsync(
      'grep',
      ['-rn', '--include=*.md', '-m', '50', '-i', '--', query, VAULT_ROOT],
      { timeout: 10_000 },
    )

    const matches = stdout
      .split('\n')
      .filter(Boolean)
      .slice(0, 50)
      .map((line) => {
        const colonIdx = line.indexOf(':')
        const rest = line.slice(colonIdx + 1)
        const lineNumIdx = rest.indexOf(':')
        const filePath = line.slice(0, colonIdx)
        const lineNum = parseInt(rest.slice(0, lineNumIdx), 10)
        const snippet = rest.slice(lineNumIdx + 1).slice(0, 200)
        const relPath = relative(VAULT_ROOT, filePath)
        return { path: relPath, line: lineNum, snippet }
      })

    return new Response(JSON.stringify({ matches }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    // grep exits 1 when no matches found — that's OK
    if (e.code === 1) {
      return new Response(JSON.stringify({ matches: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({ error: 'Search failed', matches: [] }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

async function handleResync(request: Request): Promise<Response> {
  const auth = guardAuth(request)
  if (auth) return auth

  try {
    await execFileAsync('bash', [SYNC_SCRIPT], { timeout: 60_000 })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    // Sync failure is non-fatal (home PC may be offline)
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
}

async function handler({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url)
  const action = url.searchParams.get('action')

  if (request.method === 'POST' && action === 'resync') {
    return handleResync(request)
  }

  switch (action) {
    case 'list':
      return handleList(request)
    case 'read':
      return handleRead(request)
    case 'search':
      return handleSearch(request)
    default:
      return new Response(JSON.stringify({ error: 'Unknown action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
  }
}

export const Route = createFileRoute('/api/uni-brain')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
})
