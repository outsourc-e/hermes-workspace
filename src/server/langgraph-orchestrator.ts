import { spawn, spawnSync } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveLanggraphWorkspaceRoot(): string {
  const override = process.env.HERMES_WORKSPACE_ROOT
  if (override) return override
  return process.cwd()
}

export function resolveLanggraphPythonBin(): string {
  const override = process.env.HERMES_LANGGRAPH_PYTHON
  if (override) return override
  return join(resolveLanggraphWorkspaceRoot(), 'hermes_langgraph_orchestrator', '.venv', 'bin', 'python')
}

function langgraphSpawnEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const workspaceRoot = resolveLanggraphWorkspaceRoot()
  const pythonPath = [workspaceRoot, env.PYTHONPATH].filter(Boolean).join(':')
  return { ...env, PYTHONPATH: pythonPath }
}

export function parseJsonFromStdout(stdout: string): unknown {
  const start = stdout.indexOf('{')
  if (start === -1) {
    const arrStart = stdout.indexOf('[')
    if (arrStart === -1) throw new Error('No JSON object or array found in Python output')
    return JSON.parse(stdout.slice(arrStart))
  }
  return JSON.parse(stdout.slice(start))
}

export function spawnLanggraphDetached(
  args: Array<string>,
  env: NodeJS.ProcessEnv = process.env,
): { pid: number | null; logFile: string } {
  const python = resolveLanggraphPythonBin()
  const logDir = join(homedir(), '.hermes', 'logs')
  mkdirSync(logDir, { recursive: true })
  const missionId = args[args.indexOf('--mission-id') + 1] ?? `lg-${Date.now().toString(36)}`
  const logFile = join(logDir, `langgraph-${missionId}.log`)
  const logFd = openSync(logFile, 'a')
  const child = spawn(python, ['-m', 'hermes_langgraph_orchestrator', ...args], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: langgraphSpawnEnv(env),
  })
  child.unref()
  closeSync(logFd)
  return { pid: child.pid ?? null, logFile }
}

export function runLanggraphSync(
  args: Array<string>,
  env: NodeJS.ProcessEnv = process.env,
): {
  ok: boolean
  stdout: string
  stderr: string
  status: number | null
  error: string | null
} {
  const python = resolveLanggraphPythonBin()
  const result = spawnSync(python, ['-m', 'hermes_langgraph_orchestrator', ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    env: langgraphSpawnEnv(env),
  })
  if (result.error) {
    return {
      ok: false,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      status: result.status,
      error: result.error.message,
    }
  }
  if (result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      status: result.status,
      error: result.stderr?.slice(0, 2000) || 'Orchestrator exited with error',
    }
  }
  return {
    ok: true,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
    error: null,
  }
}
