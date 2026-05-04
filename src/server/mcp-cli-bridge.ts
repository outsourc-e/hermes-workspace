import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface CliTestResult {
  ok: boolean
  status: 'connected' | 'failed' | 'unknown'
  latencyMs: number | null
  discoveredTools: Array<{ name: string; description: string }>
  error: string | null
}

const ANSI_RE = /\x1b\[[0-9;]*m/g
const DEFAULT_TIMEOUT_MS = 60_000

const HERMES_BIN_CANDIDATES = [
  process.env.HERMES_CLI_BIN,
  join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes'),
  join(homedir(), '.local', 'bin', 'hermes'),
  'hermes',
].filter((value): value is string => Boolean(value))

function resolveHermesBin(): string {
  for (const candidate of HERMES_BIN_CANDIDATES) {
    if (candidate.includes('/')) {
      if (existsSync(candidate)) return candidate
      continue
    }
    return candidate
  }
  return 'hermes'
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

function execHermes(
  args: Array<string>,
  timeoutMs: number,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    // detached: true creates a new process group so that on timeout we can
    // SIGKILL the whole tree (Python CLI + any MCP stdio grandchildren it
    // spawned) by sending the signal to -pid. Without this the grandchild
    // can outlive the killed CLI as an orphan. Codex review feedback.
    const child = spawn(resolveHermesBin(), args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Process group may already be gone — fall through to direct kill.
        try {
          child.kill('SIGKILL')
        } catch {}
      }
      resolve({ code: -1, stdout, stderr: stderr + '\n[timeout]' })
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + `\n[spawn error] ${err.message}` })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

/**
 * Parse `hermes mcp test <name>` text output into a structured result.
 *
 * Expected lines (after ANSI strip):
 *   ✓ Connected (3760ms)            → ok=true, latencyMs=3760
 *   ✗ Connection failed (Xms): err  → ok=false, error preserved
 *   ✓ Tools discovered: N
 *   <indent>tool_name        description (truncated to ~55 chars)
 */
export function parseHermesTestOutput(raw: string): CliTestResult {
  const text = stripAnsi(raw)
  const lines = text.split(/\r?\n/)

  const result: CliTestResult = {
    ok: false,
    status: 'unknown',
    latencyMs: null,
    discoveredTools: [],
    error: null,
  }

  const connectedRe = /Connected\s*\((\d+)ms\)/
  const failedRe = /Connection failed\s*\((\d+)ms\):\s*(.*)$/
  const toolsCountRe = /Tools discovered:\s*(\d+)/
  // Tool lines are indented (4+ spaces), name is left-padded to 36 chars then description.
  const toolRe = /^\s{2,}([a-zA-Z][\w.-]+)\s{2,}(.*)$/

  let inToolList = false
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '')
    const failed = failedRe.exec(line)
    if (failed) {
      result.status = 'failed'
      result.latencyMs = Number(failed[1])
      result.error = failed[2].trim() || 'Connection failed'
      continue
    }
    const connected = connectedRe.exec(line)
    if (connected) {
      result.status = 'connected'
      result.ok = true
      result.latencyMs = Number(connected[1])
      continue
    }
    if (toolsCountRe.test(line)) {
      inToolList = true
      continue
    }
    if (inToolList) {
      const tool = toolRe.exec(line)
      if (tool) {
        // Preserve CLI's trailing "..." marker (descriptions truncated to
        // ~55 chars by the CLI) so the user can see the description was
        // cut off rather than thinking it's the full text. Codex feedback.
        result.discoveredTools.push({
          name: tool[1],
          description: tool[2].trim(),
        })
      }
      // CLI prints a blank line between "Tools discovered: N" and the
      // first tool row, so don't treat blank lines as end-of-block. The
      // tool-list section is the tail of stdout — once we are in it,
      // keep scanning for tool rows until EOF.
    }
  }

  return result
}

/**
 * Run `hermes mcp test <name>` and return parsed result.
 *
 * Used by the workspace MCP routes when capabilities.mcpFallback is true
 * (config-only mode where the hermes-agent runtime endpoint is not yet
 * available). Reuses the CLI's `_probe_single_server` logic by shelling
 * out — no protocol duplication on the workspace side.
 */
export async function runHermesMcpTest(
  serverName: string,
  options: { timeoutMs?: number } = {},
): Promise<CliTestResult> {
  if (!/^[a-zA-Z][\w-]{0,63}$/.test(serverName)) {
    return {
      ok: false,
      status: 'failed',
      latencyMs: null,
      discoveredTools: [],
      error: 'Invalid server name',
    }
  }
  const exec = await execHermes(
    ['mcp', 'test', serverName],
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
  if (exec.code !== 0 && !exec.stdout.includes('Connected')) {
    return {
      ok: false,
      status: 'failed',
      latencyMs: null,
      discoveredTools: [],
      error:
        stripAnsi(exec.stderr).trim() ||
        `hermes mcp test exited with code ${exec.code}`,
    }
  }
  return parseHermesTestOutput(exec.stdout)
}
