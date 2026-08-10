import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireLocalOrAuth } from '../../server/auth-middleware'
import { rosterByWorkerId } from '../../server/swarm-roster'
import { resolveSwarmModelLabel } from '../../server/swarm-model-resolver'
import {
  ensureSwarmProfileConfig,
  syncSwarmProfileModel,
} from '../../server/swarm-profile-config'
import {
  buildSwarmTmuxLaunchCommand,
  buildTmuxNewSessionArgs,
  buildTmuxSendKeysArgs,
  resolveSwarmHermesBin as resolveHermesBin,
  resolveSwarmTmuxBin as resolveTmuxBin,
} from '../../server/swarm-tmux-launch'

// Inlined to avoid SSR module-resolution races against freshly-written
// helpers; mirrors `src/server/claude-paths.ts` getProfilesDir().
function getProfilesDir(): string {
  const envHome = process.env.HERMES_HOME || process.env.CLAUDE_HOME
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
  const run = (args: Array<string>) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const child = execFile(
        tmuxBin,
        args,
        { timeout: 8_000 },
        (error, _stdout, stderr) => {
          if (error) {
            resolve({
              ok: false,
              error: stderr.toString().trim() || error.message,
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

  return run(buildTmuxNewSessionArgs({ sessionName, cwd })).then((started) => {
    if (!started.ok) return started
    const launchCommand = buildSwarmTmuxLaunchCommand({
      profilePath,
      cwd,
      hermesBin: resolveHermesBin(),
      keepShellAlive: true,
    })
    return run(buildTmuxSendKeysArgs(sessionName, launchCommand))
  })
}

function resolveWorkerCwd(workerId: string): string {
  const worker = rosterByWorkerId([workerId]).get(workerId)
  const wrapperName = worker?.wrapper?.trim() || workerId
  const wrapperPath = join(homedir(), '.local', 'bin', wrapperName)
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
        if (!requireLocalOrAuth(request)) {
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
        const profileBootstrap = ensureSwarmProfileConfig(profilePath)
        if (!profileBootstrap.ok) {
          return json(
            {
              error:
                profileBootstrap.error ?? 'Worker profile bootstrap failed',
            },
            { status: 500 },
          )
        }

        const tmuxBin = resolveTmuxBin()
        if (!tmuxBin) {
          return json(
            { error: 'tmux not installed on this host' },
            { status: 503 },
          )
        }

        // Sync the worker's profile config.yaml model section to the
        // roster's `model:` label before we (re)attach tmux. Hermes Agent
        // reads config.yaml on every invocation, and the wrapper does not
        // pass `--model`, so this is the only way the roster value is
        // honored. Best-effort: unrecognised labels (typos, custom
        // models) are left as-is so a worker never gets wedged. See #236.
        const modelSync: {
          attempted: boolean
          changed: boolean
          target?: string
          previous?: string
          error?: string
        } = { attempted: false, changed: false }
        try {
          const roster = rosterByWorkerId([workerId]).get(workerId)
          const resolved = resolveSwarmModelLabel(roster?.model ?? null)
          if (resolved) {
            modelSync.attempted = true
            const result = syncSwarmProfileModel(profilePath, resolved)
            if (result.ok) {
              modelSync.changed = result.changed
              modelSync.target = `${resolved.provider}/${resolved.default}`
              if (result.previous) {
                modelSync.previous = `${result.previous.provider}/${result.previous.default}`
              }
            } else {
              modelSync.error = result.error
            }
          }
        } catch (err) {
          modelSync.error = err instanceof Error ? err.message : String(err)
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
            modelSync,
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
          modelSync,
        })
      },
    },
  },
})
