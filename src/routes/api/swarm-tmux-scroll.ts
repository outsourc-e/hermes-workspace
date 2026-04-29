import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { requireLocalOrAuth } from '../../server/auth-middleware'

/**
 * POST /api/swarm-tmux-scroll
 * Body: { workerId: "swarm1", direction: "up"|"down", lines?: number }
 *
 * Scroll a live tmux-backed worker pane using tmux copy-mode commands.
 * This avoids flaky browser wheel behavior and gives Swarm2 reliable,
 * explicit scroll controls for each worker terminal.
 */

type ScrollRequest = {
  workerId?: unknown
  session?: unknown
  direction?: unknown
  lines?: unknown
}

const TMUX_BIN_CANDIDATES = [
  join(homedir(), '.local', 'bin', 'tmux'),
  '/opt/homebrew/bin/tmux',
  '/usr/local/bin/tmux',
  'tmux',
]

function resolveTmuxBin(): string | null {
  for (const candidate of TMUX_BIN_CANDIDATES) {
    if (candidate.includes('/')) {
      if (existsSync(candidate)) return candidate
    } else {
      return candidate
    }
  }
  return null
}

function validateWorkerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

function execFileAsync(
  cmd: string,
  args: Array<string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5_000 }, (error, _stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error: stderr?.toString().trim() || error.message })
        return
      }
      resolve({ ok: true })
    })
  })
}

export const Route = createFileRoute('/api/swarm-tmux-scroll')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireLocalOrAuth(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: ScrollRequest
        try {
          body = (await request.json()) as ScrollRequest
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const workerId =
          typeof body.workerId === 'string' ? body.workerId.trim() : ''
        const requestedSession =
          typeof body.session === 'string' ? body.session.trim() : ''
        const direction =
          body.direction === 'up' || body.direction === 'down'
            ? body.direction
            : null
        const linesRaw = typeof body.lines === 'number' ? body.lines : 8
        const lines = Math.max(1, Math.min(100, Math.floor(linesRaw)))

        if (!workerId || !validateWorkerId(workerId)) {
          return json({ error: 'workerId required' }, { status: 400 })
        }
        if (requestedSession && !validateWorkerId(requestedSession)) {
          return json({ error: 'invalid session' }, { status: 400 })
        }
        if (!direction) {
          return json({ error: 'direction must be up or down' }, { status: 400 })
        }

        const tmuxBin = resolveTmuxBin()
        if (!tmuxBin) {
          return json({ error: 'tmux not installed' }, { status: 503 })
        }

        const session = requestedSession || `swarm-${workerId}`

        const enterCopy = await execFileAsync(tmuxBin, [
          'copy-mode',
          '-t',
          session,
        ])
        if (!enterCopy.ok) {
          return json({ error: enterCopy.error }, { status: 500 })
        }

        const cmd = direction === 'up' ? 'scroll-up' : 'scroll-down'
        const scrolled = await execFileAsync(tmuxBin, [
          'send-keys',
          '-t',
          session,
          '-X',
          '-N',
          String(lines),
          cmd,
        ])
        if (!scrolled.ok) {
          return json({ error: scrolled.error }, { status: 500 })
        }

        return json({ ok: true, workerId, session, direction, lines })
      },
    },
  },
})
