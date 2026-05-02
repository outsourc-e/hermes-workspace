import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getSwarmProfilePath,
  patchSwarmRuntimeFile,
} from '../../server/swarm-foundation'

/**
 * POST /api/swarm-tmux-stop
 * Body: { workerId: "swarm1" }
 *
 * Kills the tmux session backing a worker, if any. No-op if not running.
 */

type StopRequest = {
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

function killSession(
  tmuxBin: string,
  sessionName: string,
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    execFile(
      tmuxBin,
      ['kill-session', '-t', sessionName],
      { timeout: 5_000 },
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
  })
}

function validateWorkerId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

export const Route = createFileRoute('/api/swarm-tmux-stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: StopRequest
        try {
          body = (await request.json()) as StopRequest
        } catch {
          return json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const workerId =
          typeof body.workerId === 'string' ? body.workerId.trim() : ''
        if (!workerId || !validateWorkerId(workerId)) {
          return json({ error: 'workerId required' }, { status: 400 })
        }

        const tmuxBin = resolveTmuxBin()
        if (!tmuxBin) {
          return json(
            { error: 'tmux not installed on this host' },
            { status: 503 },
          )
        }

        const sessionName = `swarm-${workerId}`
        const exists = await tmuxHasSession(tmuxBin, sessionName)
        if (!exists) {
          return json({
            workerId,
            sessionName,
            wasRunning: false,
            killed: false,
          })
        }

        const result = await killSession(tmuxBin, sessionName)
        if (!result.ok) {
          return json(
            { error: result.error ?? 'tmux kill-session failed' },
            { status: 500 },
          )
        }

        // Reconcile runtime.json so the Swarm UI doesn't show a 'stuck'
        // worker (tmux gone, lifecycle still says running/blocked). Best
        // effort — the kill already succeeded, so a write failure here
        // should NOT fail the stop request. Reported in #235.
        const profilePath = getSwarmProfilePath(workerId)
        const stoppedAt = Date.now()
        const patchResult = patchSwarmRuntimeFile(profilePath, workerId, {
          state: 'idle',
          phase: 'stopped',
          currentTask: null,
          activeTool: null,
          needsHuman: false,
          blockedReason: null,
          checkpointStatus: 'none',
          lastDispatchResult: 'Stopped via UI',
          lastOutputAt: stoppedAt,
        })

        return json({
          workerId,
          sessionName,
          wasRunning: true,
          killed: true,
          runtimePatched: patchResult.ok,
          runtimePatchError: patchResult.ok ? undefined : patchResult.error,
        })
      },
    },
  },
})
