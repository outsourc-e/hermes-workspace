import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

export const Route = createFileRoute('/api/start-hermes')({
  server: {
    handlers: {
      POST: async () => {
        try {
          // Check if already running
          try {
            const health = await fetch('http://127.0.0.1:8642/health', {
              signal: AbortSignal.timeout(2000),
            })
            if (health.ok) {
              return json({ ok: true, message: 'Already running' })
            }
          } catch {
            // Not running — proceed to start
          }

          const agentDir = resolve(homedir(), '.openclaw/workspace/hermes-agent')
          const venvPython = resolve(agentDir, '.venv/bin/python')

          // Spawn detached so it survives if the dev server restarts
          const child = spawn(venvPython, ['-m', 'uvicorn', 'webapi.app:app', '--host', '0.0.0.0', '--port', '8642'], {
            cwd: agentDir,
            detached: true,
            stdio: 'ignore',
            env: {
              ...process.env,
              // Ensure the venv's bin is on PATH
              PATH: `${resolve(agentDir, '.venv/bin')}:${process.env.PATH || ''}`,
            },
          })

          child.unref()

          // Wait briefly and verify it started
          await new Promise((r) => setTimeout(r, 2000))

          try {
            const health = await fetch('http://127.0.0.1:8642/health', {
              signal: AbortSignal.timeout(3000),
            })
            if (health.ok) {
              return json({ ok: true, pid: child.pid })
            }
          } catch {
            // May still be starting up
          }

          return json({ ok: true, pid: child.pid, message: 'Started — may take a few seconds to be ready' })
        } catch (err) {
          return json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
          )
        }
      },
    },
  },
})
