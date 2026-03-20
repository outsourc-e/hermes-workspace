import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

/** Same resolution logic as vite.config.ts — must stay in sync */
function resolveHermesAgentDir(): string | null {
  const candidates: string[] = []

  // 1. Explicit env override
  if (process.env.HERMES_AGENT_PATH?.trim()) {
    candidates.push(process.env.HERMES_AGENT_PATH.trim())
  }

  // 2. Sibling of the workspace root (standard README clone layout)
  //    cwd() is the clawsuite/ dir when running via pnpm dev
  const cwd = process.cwd()                            // clawsuite/
  const workspaceRoot = dirname(cwd)                   // parent dir
  candidates.push(
    resolve(workspaceRoot, 'hermes-agent'),             // ../hermes-agent  (sibling clone)
    resolve(workspaceRoot, '..', 'hermes-agent'),       // ../../hermes-agent (one level up)
  )

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'webapi'))) return candidate
  }
  return null
}

function resolveHermesPython(agentDir: string): string {
  const venvPython = resolve(agentDir, '.venv', 'bin', 'python')
  if (existsSync(venvPython)) return venvPython
  const uvVenv = resolve(agentDir, 'venv', 'bin', 'python')
  if (existsSync(uvVenv)) return uvVenv
  return 'python3'
}

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

          const agentDir = resolveHermesAgentDir()
          if (!agentDir) {
            return json(
              {
                ok: false,
                error:
                  'hermes-agent not found. Clone it as a sibling directory or set HERMES_AGENT_PATH in .env',
                hint: 'git clone https://github.com/outsourc-e/hermes-agent.git ../hermes-agent',
              },
              { status: 404 },
            )
          }

          const python = resolveHermesPython(agentDir)

          // Spawn detached so it survives if the dev server restarts
          const child = spawn(
            python,
            ['-m', 'uvicorn', 'webapi.app:app', '--host', '0.0.0.0', '--port', '8642'],
            {
              cwd: agentDir,
              detached: true,
              stdio: 'ignore',
              env: {
                ...process.env,
                PATH: `${resolve(agentDir, '.venv', 'bin')}:${resolve(agentDir, 'venv', 'bin')}:${process.env.PATH || ''}`,
              },
            },
          )

          child.unref()

          // Poll health for up to 10s
          for (let i = 0; i < 10; i++) {
            await new Promise((r) => setTimeout(r, 1000))
            try {
              const health = await fetch('http://127.0.0.1:8642/health', {
                signal: AbortSignal.timeout(2000),
              })
              if (health.ok) {
                return json({ ok: true, pid: child.pid, message: 'Started and healthy' })
              }
            } catch {
              // Still starting
            }
          }

          // Timed out but process was spawned — may still be loading
          return json({
            ok: true,
            pid: child.pid,
            message: 'Started — may take a few more seconds',
          })
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
