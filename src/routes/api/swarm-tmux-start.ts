import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'

// Inlined to avoid SSR module-resolution races against freshly-written
// helpers; mirrors `src/server/hermes-paths.ts` getProfilesDir().
function getProfilesDir(): string {
  const envHome = process.env.CLAUDE_HOME
  if (envHome) {
    const parts = envHome.split('/').filter(Boolean)
    if (parts.length >= 2 && parts.at(-2) === 'profiles') {
      return envHome.split('/').slice(0, -1).join('/')
    }
    return join(envHome, 'profiles')
  }
  return join(homedir(), '.hermes', 'profiles')
}

/**
 * POST /api/swarm-tmux-start
 * Body: { workerId: "swarm1" }
 *
 * Idempotently ensures a long-lived tmux session exists for a worker.
 * The session runs the worker's `hermes` TUI inside its profile + cwd, so
 * dispatch traffic + the swarm2 Runtime pane both see the same live agent.
 *
 * Returns: { workerId, sessionName, alreadyRunning, started }
 */

type StartRequest = {
  workerId?: unknown
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

function tmuxHasSession(tmuxBin: string, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(tmuxBin, ['has-session', '-t', name], (error) => {
      resolve(!error)
    })
  })
}

function validateWorkerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

function startSession(
  tmuxBin: string,
  sessionName: string,
  profilePath: string,
  cwd: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      tmuxBin,
      [
        'new-session',
        '-d',
        '-s',
        sessionName,
        '-c',
        cwd,
        `HERMES_HOME='${profilePath.replace(/'/g, `'\\''`)}' exec hermes chat --continue`,
      ],
      { timeout: 8_000 },
      (error, _stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            error: stderr?.toString().trim() || error.message,
          })
          return
        }
        resolve({ ok: true })
      },
    )
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message })
    })
  })
}

function resolveWorkerCwd(workerId: string): string {
  const wrapperPath = join(homedir(), '.local', 'bin', workerId)
  if (existsSync(wrapperPath)) {
    try {
      const text = readFileSync(wrapperPath, 'utf8')
      const m = text.match(/cd\s+'([^']+)'/)
      if (m && m[1] && existsSync(m[1])) return m[1]
    } catch {
      /* noop */
    }
  }
  return homedir()
}

export const Route = createFileRoute('/api/swarm-tmux-start')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: StartRequest
        try {
          body = (await request.json()) as StartRequest
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const workerId =
          typeof body.workerId === 'string' ? body.workerId.trim() : ''
        if (!workerId || !validateWorkerId(workerId)) {
          return json(
            { error: 'workerId required (alnum, _, -; ≤64 chars)' },
            { status: 400 },
          )
        }

        const profilesDir = getProfilesDir()
        const profilePath = join(profilesDir, workerId)
        // Skip the existsSync gate; tmux new-session will fail loudly if the
        // path is bogus, and the sandbox quirks on this host make existsSync
        // unreliable for parent dirs even when leaf paths work.
        // We still verify the wrapper exists as a sanity check.
        const wrapper = join(homedir(), '.local', 'bin', workerId)
        if (!existsSync(wrapper)) {
          return json(
            { error: `No wrapper for ${workerId} at ${wrapper}` },
            { status: 404 },
          )
        }

        const tmuxBin = resolveTmuxBin()
        if (!tmuxBin) {
          return json(
            { error: 'tmux not installed on this host' },
            { status: 503 },
          )
        }

        const sessionName = `swarm-${workerId}`
        const alreadyRunning = await tmuxHasSession(tmuxBin, sessionName)
        if (alreadyRunning) {
          return json({
            workerId,
            sessionName,
            alreadyRunning: true,
            started: false,
            tmuxBin,
          })
        }

        const cwd = resolveWorkerCwd(workerId)
        const result = await startSession(
          tmuxBin,
          sessionName,
          profilePath,
          cwd,
        )
        if (!result.ok) {
          return json(
            { error: result.error ?? 'tmux new-session failed' },
            { status: 500 },
          )
        }

        return json({
          workerId,
          sessionName,
          alreadyRunning: false,
          started: true,
          tmuxBin,
          cwd,
        })
      },
    },
  },
})
