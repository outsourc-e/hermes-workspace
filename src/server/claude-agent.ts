import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

const CLAUDE_HEALTH_TIMEOUT_MS = 2_000
const CLAUDE_START_PORT = 8642

let startPromise: Promise<StartClaudeAgentResult> | null = null

export type StartClaudeAgentResult =
  | {
      ok: true
      message: string
      pid?: number
    }
  | {
      ok: false
      error: string
    }

/**
 * Read ~/.claude/.env and return key=value pairs as an object.
 * Silently returns {} if the file doesn't exist or can't be parsed.
 */
function readClaudeEnv(): Record<string, string> {
  const envPath = join(
    process.env.CLAUDE_HOME ?? join(homedir(), '.claude'),
    '.env',
  )
  try {
    const raw = readFileSync(envPath, 'utf-8')
    const result: Record<string, string> = {}
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx <= 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let value = trimmed.slice(eqIdx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key) result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

/** Same directory resolution logic as vite.config.ts. Kept in sync. */
export function resolveClaudeAgentDir(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const candidates: Array<string> = []

  if (env.CLAUDE_AGENT_PATH?.trim()) {
    candidates.push(env.CLAUDE_AGENT_PATH.trim())
  }

  const workspaceRoot = dirname(resolve('.'))
  candidates.push(
    resolve(workspaceRoot, 'claude-agent'),          // sibling (old README)
    resolve(workspaceRoot, '..', 'claude-agent'),    // one level up
    resolve(homedir(), '.claude', 'claude-agent'),   // Nous installer default
    resolve(homedir(), 'claude-agent'),              // ~/claude-agent
  )

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'webapi'))) return candidate
  }

  return null
}

/** Find the `claude` CLI binary installed by Nous's installer (or on PATH). */
export function resolveClaudeBinary(): string | null {
  const candidates = [
    resolve(homedir(), '.claude', 'bin', 'claude'),
    resolve(homedir(), '.local', 'bin', 'claude'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

export function resolveClaudePython(agentDir: string): string {
  const venvPython = resolve(agentDir, '.venv', 'bin', 'python')
  if (existsSync(venvPython)) return venvPython
  const uvVenv = resolve(agentDir, 'venv', 'bin', 'python')
  if (existsSync(uvVenv)) return uvVenv
  // Nous installer ships its own uv-managed python alongside the binary
  const nousPython = resolve(homedir(), '.claude', 'venv', 'bin', 'python')
  if (existsSync(nousPython)) return nousPython
  return 'python3'
}

export async function isClaudeAgentHealthy(
  port = CLAUDE_START_PORT,
): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(CLAUDE_HEALTH_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function startClaudeAgent(): Promise<StartClaudeAgentResult> {
  if (await isClaudeAgentHealthy()) {
    return { ok: true, message: 'already running' }
  }

  if (startPromise) {
    return startPromise
  }

  startPromise = (async () => {
    try {
      const claudeEnv = readClaudeEnv()
      const claudeBin = resolveClaudeBinary()
      const agentDir = resolveClaudeAgentDir()

      // Prefer the `claude gateway run` binary path (the Nous installer's
      // canonical entrypoint). Fall back to launching uvicorn against the
      // source tree if we only have a directory.
      let command: string
      let commandArgs: Array<string>
      let cwd: string | undefined

      if (claudeBin) {
        command = claudeBin
        commandArgs = ['gateway', 'run']
        cwd = agentDir ?? undefined
      } else if (agentDir) {
        command = resolveClaudePython(agentDir)
        commandArgs = [
          '-m',
          'uvicorn',
          'webapi.app:app',
          '--host',
          '0.0.0.0',
          '--port',
          String(CLAUDE_START_PORT),
        ]
        cwd = agentDir
      } else {
        return {
          ok: false,
          error:
            "claude-agent not found. Run the installer: curl -fsSL https://claude-workspace.com/install.sh | bash",
        }
      }

      const child = spawn(
        command,
        commandArgs,
        {
          cwd,
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            ...claudeEnv,
            PATH: [
              resolve(homedir(), '.claude', 'bin'),
              resolve(homedir(), '.local', 'bin'),
              agentDir ? resolve(agentDir, '.venv', 'bin') : '',
              agentDir ? resolve(agentDir, 'venv', 'bin') : '',
              process.env.PATH || '',
            ].filter(Boolean).join(':'),
          },
        },
      )

      child.unref()

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolveAttempt) => setTimeout(resolveAttempt, 1_000))
        if (await isClaudeAgentHealthy()) {
          return {
            ok: true,
            pid: child.pid,
            message: 'started',
          }
        }
      }

      return {
        ok: true,
        pid: child.pid,
        message: 'starting',
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })()

  try {
    return await startPromise
  } finally {
    startPromise = null
  }
}
